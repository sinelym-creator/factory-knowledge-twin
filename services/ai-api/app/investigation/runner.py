"""run 수명 — 생성·실행·중지 (T2-3).

한 run 의 이벤트를 내는 **유일한 기록자**가 여기 있다(`events.Emitter` 성문). 라우트는 run 을
만들고 조회할 뿐, 이벤트를 직접 쓰지 않는다.

🔴 **실행은 요청과 분리된다.** `POST /scenarios/{id}/runs` 는 run 을 만들고 «즉시» 돌려준다 —
   조사가 끝날 때까지 붙잡고 있으면 화면이 「진행이 흐르는」 그림을 그릴 수 없고, 그 요청 하나가
   워커를 점유한다. 진행은 이벤트로 흐르고, 결과는 스냅샷으로 굳는다.

🔴 **중지는 «협력적»이다.** 단계 경계에서 중지 여부를 확인한다(`workflow._step`). 실행 중인
   DB 질의를 중간에 끊지 않는 이유: 끊으면 커넥션이 어떤 상태로 남는지 보장할 수 없고,
   이 조사의 단계는 짧아 경계까지의 지연이 사람에게 보이지 않는다.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Literal

from .binding import BindingStale, ScenarioAnchor, verify
from .events import STEP_IDS, Emitter
from .store import RunRecord, RunStore
from .workflow import Context, StepFailed, StopRequested, build_graph

log = logging.getLogger("fkt.investigation.runner")


async def start(
    store: RunStore,
    *,
    pool: Any,
    driver: Any,
    anchor: ScenarioAnchor,
    session_id: str,
    mode: Literal["live", "replay"],
) -> RunRecord:
    """run 을 만들고 백그라운드 실행을 띄운다. 반환 시점에 run 은 이미 «있다»."""
    record = store.create(
        session_id=session_id,
        scenario_id=anchor.scenarioId,
        incident_id=anchor.incidentId,
        mode=mode,
    )
    record.task = asyncio.create_task(_execute(record, pool=pool, driver=driver, anchor=anchor))
    return record


def request_stop(record: RunRecord) -> None:
    """중지 요청 — 플래그만 세운다. `run.stopped` 는 실행 task 가 «자기 손으로» 낸다.

    🔴 여기서 이벤트를 내지 않는 이유: 기록자가 둘이 되면 `seq` 가 어긋난다(events 성문).
    """
    record.stop_requested = True


async def _execute(record: RunRecord, *, pool: Any, driver: Any, anchor: ScenarioAnchor) -> None:
    emitter = Emitter(record.runId, record.mode, record.append)
    started = time.perf_counter()
    try:
        emitter.run_started(anchor.scenarioId, anchor.question)

        # 🔴 무대가 실재하는지 먼저 본다. 없는 앵커로 출발하면 모든 단계가 0건이 되고,
        #    화면에는 「근거 없음」으로만 보인다 — 조용한 0건이 아니라 시끄러운 실패로 만든다.
        await verify(pool, anchor)

        emitter.plan_updated(list(STEP_IDS))
        ctx = Context(
            pool=pool,
            driver=driver,
            anchor=anchor,
            emitter=emitter,
            should_stop=lambda: record.stop_requested,
        )
        state = await build_graph(ctx).ainvoke({})

        record.candidates = state.get("candidates", [])
        record.graphPaths = state.get("graphPaths", [])
        draft = state.get("workOrderDraft")
        if draft is not None:
            record.workOrderDraft = draft
            record.workOrderDraftId = draft["workOrderDraftId"]
        record.status = "completed"
        emitter.run_completed(
            record.candidates,
            int((time.perf_counter() - started) * 1000),
            work_order_draft_id=record.workOrderDraftId,
        )
    except StopRequested as exc:
        record.status = "stopped"
        emitter.run_stopped("user", note=f"{exc} 단계 경계에서 중지")
    except asyncio.CancelledError:
        # 세션 리셋 등으로 취소됐다 — 스키마의 `reset` 사유가 이 자리다.
        record.status = "stopped"
        emitter.run_stopped("reset")
        raise
    except BindingStale as exc:
        record.status = "failed"
        log.error("시나리오 결속이 낡았다: %s", exc)
        emitter.run_failed("scenario_binding_stale", "시나리오 무대가 SSOT 와 어긋난다")
    except StepFailed as exc:
        record.status = "failed"
        # 🔴 어느 단계였는지 코드에 담는다 — 「조사 실패」만 남기면 어디서 끊겼는지 모른다.
        #    예외 «내용»은 로그에만(공개 Sandbox · §34.6).
        log.exception("조사 단계 실패: %s", exc.step)
        emitter.run_failed(f"step_failed:{exc.step}", f"{exc.step} 단계에서 조사를 계속할 수 없다")
    except Exception:                                   # noqa: BLE001 — 마지막 그물
        record.status = "failed"
        log.exception("조사 실행이 예기치 않게 끝났다 run=%s", record.runId)
        emitter.run_failed("run_failed", "조사 실행 중 오류가 발생했다")
    finally:
        record.close_subscribers()
