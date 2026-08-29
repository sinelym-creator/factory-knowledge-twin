"""계약 v0.1 §시나리오·조사 실행 (Incident·Agent) — WebSocket 스트림 포함.

T2-3 에서 runs 표면 5건이 열렸다(오케 판정 J-1): 생성 · 스냅샷 · 이벤트 · 중지 · WS.

🔴 **`mode` 는 «이벤트의 출처»다**(계약 README 원칙1: 「replay fixture 의 이벤트는 live 이벤트와
   같은 스키마이며 envelope `mode` 필드만 다르다」). 그러므로 지금 «실제로 도는» 조사의 이벤트는
   `live` 다 — 합성에 LLM 이 참여했는가와는 다른 축이다. 그 축은 `GET /live/status` 가 말한다
   (오케 판정 J-1 (b)). 두 곳이 같은 낱말을 쓰는 것은 계약 문구의 충돌이며 v0.2 재론 대상으로
   회부했다 — 구현이 임의로 뜻을 바꾸지 않는다.

🔴 `mode="replay"` 요청은 **아직 501 이다**. 되감을 fixture 가 없는데 replay 라고 답하면
   그것은 「없는 것을 있다고 말하는」 것이다. fixture 축은 T2-4 다.
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .. import session_id
from ..errors import NOT_IMPLEMENTED, DependencyUnavailable, NotImplementedRoute, dependency_guard
from ..investigation import binding, runner
from ..investigation.store import RunRecord, RunStore
from ..reading import scenarios as scenario_reader
from ..schemas import AgentEvent, RunCreated, RunStopped, ScenarioSummary

router = APIRouter(tags=["investigation"])

# WebSocket 애플리케이션 종료 코드(4000~4999). 1011(예기치 못한 조건)은 사실과 다르다.
WS_RUN_NOT_FOUND = 4404


class RunRequest(BaseModel):
    """POST /scenarios/{scenarioId}/runs 요청 — `{ sessionId, mode }`."""

    sessionId: str
    mode: Literal["live", "replay"]


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _store(request: Request) -> RunStore:
    return request.app.state.run_store


def _resources(request: Request) -> Any:
    return request.app.state.resources


def _run_or_404(request: Request, run_id: str) -> RunRecord:
    record = _store(request).get(run_id)
    if record is None:
        # 🔴 「없다」와 「끝났다」는 다른 사건이다. 프로세스 재기동으로 사라진 run 도 여기 온다 —
        #    저장소가 프로세스 안에 있다는 사실의 «정직한 대가»다(store.py 머리말).
        raise _error(404, "not_found", f"run {run_id} 를 찾을 수 없다")
    return record


@router.get("/scenarios", response_model=list[ScenarioSummary])
async def list_scenarios() -> list[ScenarioSummary]:
    """승인된 시나리오 목록 — `[{ scenarioId, title, questions }]` (계약 v0.1.1 append).

    🔴 `questions` 의 원천은 compare 가 쓰는 바로 그 allowlist 다(`app/reading/scenarios.py`
       성문). 저장소를 따로 두지 않는 이유는 두 목록이 갈라지는 순간 화면이 «여기서 받은
       질문»을 compare 에 보냈다가 거절당하기 때문이다.
    """
    return scenario_reader.list_scenarios()


@router.post("/scenarios/{scenarioId}/runs", response_model=RunCreated, responses=NOT_IMPLEMENTED)
async def start_run(scenarioId: str, body: RunRequest, request: Request) -> RunCreated:
    """조사 실행 생성 — `{ runId, incidentId, mode }`. 실행은 배경으로 흐르고 즉시 답한다."""
    if not session_id.is_valid(body.sessionId):
        raise _error(422, "invalid_session_id", "sessionId 형식이 아니다(영숫자·-·_ 8~64자)")

    anchor = binding.anchor_for(scenarioId)
    if anchor is None:
        # 🔴 비슷한 시나리오로 «조용히» 바꿔 돌리지 않는다(allowlist 규율과 같다).
        raise _error(404, "not_found", f"승인된 시나리오가 아니다: {scenarioId}")

    if body.mode == "replay":
        raise NotImplementedRoute(
            "POST /scenarios/{scenarioId}/runs (mode=replay)", "replay fixture 축(T2-4)"
        )

    resources = _resources(request)
    if resources.pg_pool is None:
        raise DependencyUnavailable("postgres")
    if resources.neo4j_driver is None:
        # graph 단계를 건너뛰고 «부분 성공»을 내지 않는다 — 대본 S5 가 비면 회귀 판정 FAIL 이다.
        raise DependencyUnavailable("neo4j")

    async with dependency_guard("postgres"):
        record = await runner.start(
            _store(request),
            pool=resources.pg_pool,
            driver=resources.neo4j_driver,
            anchor=anchor,
            session_id=body.sessionId,
            mode="live",
        )
    return RunCreated(runId=record.runId, incidentId=record.incidentId, mode=record.mode)


@router.get("/incidents/{incidentId}", responses=NOT_IMPLEMENTED)
async def incident(incidentId: str) -> None:
    """incident 표제 — 계약 「제목·상태·대상 설비·연결 알람·runId」(필드명 미확정).

    T2-3 범위 밖이다(오케 판정 J-1): 온톨로지 «조회 계층»이라 `/plants`·`/equipment` 와 한 묶음이다.
    """
    raise NotImplementedRoute("GET /incidents/{incidentId}", "온톨로지 조회 계층 + 계약의 표제 형상 확정")


@router.post("/runs/{runId}/stop", response_model=RunStopped)
async def stop_run(runId: str, request: Request) -> RunStopped:
    """조사 중지 — `{ status: "stopped" }` · 타임라인은 `run.stopped` 로 닫힌다(계약 F-3b).

    🔴 이미 끝난 run 에 대고 중지를 부르면 «성공»으로 답한다. 중지의 뜻은 「지금부터 돌지
       않는다」이고 그것은 이미 참이다 — 여기서 오류를 내면 화면은 사용자가 못 고치는 오류를
       본다(중지 버튼을 늦게 눌렀다는 이유로).
    """
    record = _run_or_404(request, runId)
    if not record.terminal:
        runner.request_stop(record)
    return RunStopped()


@router.get("/runs/{runId}", responses=NOT_IMPLEMENTED)
async def run_snapshot(runId: str, request: Request) -> dict[str, Any]:
    """완주 후 결과 스냅샷 — 계약 `{ status, candidates[], workOrderDraftId? }`.

    `candidates[]` 항목 형상은 agent-events 스키마의 `runCompleted.candidates` 가 정본이라
    여기서 다시 적지 않는다 — 같은 사실을 두 곳에 두면 한쪽만 자란다.
    """
    record = _run_or_404(request, runId)
    snapshot: dict[str, Any] = {"status": record.status, "candidates": record.candidates}
    if record.workOrderDraftId is not None:
        snapshot["workOrderDraftId"] = record.workOrderDraftId
    return snapshot


@router.get(
    "/runs/{runId}/events",
    response_model=None,
    responses={200: {"model": list[AgentEvent], "description": "agent-events v0.1 envelope 배열(seq 순)"}},
)
async def run_events(runId: str, request: Request) -> list[dict[str, Any]]:
    """전체 이벤트 배열(agent-events 스키마 · seq 순) — replay 되감기의 정본(계약 G3).

    🔴 **저장된 형태를 그대로 낸다** — `response_model` 로 다시 조립하지 않는다. 실측으로
       걸린 자리다: pydantic 을 지나면 `ts` 가 `…470Z` → `…470000Z` 로 바뀌어, **같은
       이벤트가 WS 와 되감기에서 다른 문자열**이 됐다. 둘 다 RFC3339 라 «오류»는 아니고,
       그래서 조용하다 — 그러나 되감기를 원본과 대조하는 검증은 그 자리에서 어긋난다.
       형상의 정본은 `packages/contracts/agent-events-v0.1.schema.json` 이고, 위
       `responses` 는 그것을 OpenAPI 에 «보여 주기» 위한 것이다(값은 저장형이 낸다).
    """
    return _run_or_404(request, runId).events


@router.websocket("/ws/runs/{runId}")
async def run_event_stream(websocket: WebSocket, runId: str) -> None:
    """agent-events 스키마 스트림(계약 WS `/ws/runs/{runId}`).

    🔴 **밀린 것부터 보낸다.** 연결이 늦었다고 앞 단계를 건너뛰면 화면은 조사가 «중간부터»
       시작한 것으로 그린다. `seq` 0 부터 로그를 흘린 뒤 실시간으로 넘어간다.

    🔴 **느린 구독자는 끊는다**(`store.RunRecord.append`). 몇 개를 조용히 빠뜨린 스트림이
       화면에 그려지는 것보다, 끊겨서 다시 연결하는 편이 낫다.
    """
    await websocket.accept()
    store: RunStore = websocket.app.state.run_store
    record = store.get(runId)
    if record is None:
        await websocket.close(code=WS_RUN_NOT_FOUND, reason=f"run_not_found: {runId}")
        return

    queue = record.subscribe()
    try:
        backlog = list(record.events)
        for event in backlog:
            await websocket.send_json(event)
        seen = len(backlog)
        if record.terminal and queue.empty():
            return
        while True:
            event = await queue.get()
            if event is None:                       # run 이 끝났다는 신호
                return
            if event["seq"] < seen:                 # 백로그와 겹친 것은 한 번만 보낸다
                continue
            await websocket.send_json(event)
    except WebSocketDisconnect:
        return
    except asyncio.CancelledError:
        raise
    finally:
        record.unsubscribe(queue)
