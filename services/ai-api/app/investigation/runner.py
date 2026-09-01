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
from .capacity import LiveCapacity, Ticket
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
    capacity: LiveCapacity,
    ticket: Ticket,
    timeout_sec: float,
    queue_wait_max_sec: float,
) -> RunRecord:
    """run 을 만들고 백그라운드 실행을 띄운다. 반환 시점에 run 은 이미 «있다».

    🔴 **자리(`ticket`)는 이미 잡힌 뒤에 여기 온다**(T4-2b ⓐ). 입장 판정은 요청 흐름에서
       동기로 끝나야 「둘 다 찼다」에 즉시 503 을 답할 수 있기 때문이다(capacity 성문).
       여기서는 그 자리가 «즉시 실행»인지 «대기»인지에 따라 갈릴 뿐, 어느 쪽이든 run 은 있다.
    """
    record = store.create(
        session_id=session_id,
        scenario_id=anchor.scenarioId,
        incident_id=anchor.incidentId,
        mode=mode,
    )
    ticket.runId = record.runId
    record.task = asyncio.create_task(
        _supervise(
            record,
            pool=pool,
            driver=driver,
            anchor=anchor,
            capacity=capacity,
            ticket=ticket,
            timeout_sec=timeout_sec,
            queue_wait_max_sec=queue_wait_max_sec,
        )
    )
    return record


async def _supervise(
    record: RunRecord,
    *,
    pool: Any,
    driver: Any,
    anchor: ScenarioAnchor,
    capacity: LiveCapacity,
    ticket: Ticket,
    timeout_sec: float,
    queue_wait_max_sec: float,
) -> None:
    """대기 → 실행 → 상한 → 자리 반환. 이벤트 기록자는 여기서 **한 번만** 만든다.

    🔴 `Emitter` 를 여기서 만들어 `_execute` 에 넘기는 이유: `run.queued` 와 그 뒤의
       `run.started` 가 **같은 `seq` 흐름**에 있어야 한다. 기록자가 둘이면 seq 가 겹치고,
       되감기는 두 번째 0번을 첫 이벤트로 읽는다(events 성문과 같은 축).
    """
    emitter = Emitter(record.runId, record.mode, record.append)
    try:
        granted = await capacity.wait_turn(
            ticket,
            notify=emitter.run_queued,
            timeout_sec=queue_wait_max_sec,
        )
        if not granted:
            # 🔴 대기 상한 초과 = «실패»이되 다음 수를 함께 준다(계약 v0.1.9: run.failed +
            #    fallback:"replay"). 조용히 끝내면 화면은 영영 도는 원을 그린다.
            record.status = "failed"
            log.info("대기 상한 초과 — replay 로 안내한다 run=%s", record.runId)
            emitter.run_failed(
                "live_queue_timeout",
                "대기가 길어 조사를 시작하지 못했다 — Replay 로 볼 수 있다",
                fallback="replay",
            )
            record.close_subscribers()
            return

        inner = asyncio.create_task(
            _execute(record, emitter=emitter, pool=pool, driver=driver, anchor=anchor)
        )
        if timeout_sec > 0:
            try:
                # 🔴 **`shield` 로 감싼다.** 그냥 `wait_for(inner, ...)` 면 wait_for 가 내부를
                #    먼저 취소하고, `_execute` 의 취소 분기는 그것을 «세션 리셋»으로 읽는다 —
                #    사유가 `reset` 으로 나가는 «정확한 문장으로 말한 거짓»이 된다. shield 로
                #    취소권을 우리가 쥐고, 사유를 «먼저» 적은 뒤 우리 손으로 끊는다.
                await asyncio.wait_for(asyncio.shield(inner), timeout_sec)
            except asyncio.TimeoutError:
                record.stop_reason = "timeout"
                inner.cancel()
                await asyncio.gather(inner, return_exceptions=True)
        else:                                            # pragma: no cover — 상한 끄기 경로
            await inner
    finally:
        # 🔴 어떤 경로로 끝나든 자리는 돌려준다. 여기가 비면 상한은 «한 번 쓰고 사라지는»
        #    숫자가 되고, 그 사실은 다음 방문자가 영원히 기다릴 때에야 드러난다.
        capacity.release(ticket)


def request_stop(record: RunRecord) -> None:
    """중지 요청 — 플래그만 세운다. `run.stopped` 는 실행 task 가 «자기 손으로» 낸다.

    🔴 여기서 이벤트를 내지 않는 이유: 기록자가 둘이 되면 `seq` 가 어긋난다(events 성문).
    """
    record.stop_requested = True
    # 사용자가 눌렀다는 사실을 사유 자리에 적어 둔다 — 협력적 중지는 `StopRequested` 로
    # 끝나므로 이 값이 쓰이지 않지만, 그 사이에 상한이 겹쳐도 «먼저 적힌» 사유가 이긴다.
    record.stop_reason = record.stop_reason or "user"


async def _execute(
    record: RunRecord,
    *,
    emitter: Emitter,
    pool: Any,
    driver: Any,
    anchor: ScenarioAnchor,
) -> None:
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
        # 🔴 취소는 «한 모습, 두 사건»이다 — 세션 리셋으로 끊긴 것과 실행 상한(T4-2b ⓑ)에
        #    걸린 것. 사유는 끊는 쪽이 `record.stop_reason` 에 «먼저» 적어 두고, 여기서는
        #    적힌 것을 읽기만 한다. 적힌 것이 없으면 지금까지대로 `reset` 이다.
        record.status = "stopped"
        emitter.run_stopped(record.stop_reason or "reset")
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
