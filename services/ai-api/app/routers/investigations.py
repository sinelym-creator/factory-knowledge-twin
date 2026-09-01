"""계약 v0.1 §시나리오·조사 실행 (Incident·Agent) — WebSocket 스트림 포함.

T2-3 에서 runs 표면 5건이 열렸다(오케 판정 J-1): 생성 · 스냅샷 · 이벤트 · 중지 · WS.

🔴 **`mode` 는 «이벤트의 출처»다**(계약 README 원칙1: 「replay fixture 의 이벤트는 live 이벤트와
   같은 스키마이며 envelope `mode` 필드만 다르다」). 그러므로 지금 «실제로 도는» 조사의 이벤트는
   `live` 다 — 합성에 LLM 이 참여했는가와는 다른 축이다. 그 축은 `GET /live/status` 가 말한다
   (오케 판정 J-1 (b)). 두 곳이 같은 낱말을 쓰는 것은 계약 문구의 충돌이며 v0.2 재론 대상으로
   회부했다 — 구현이 임의로 뜻을 바꾸지 않는다.

🔴 `mode="replay"` 요청은 **커밋된 fixture 를 재생한다**(T2-4). 재생본은 «새 조사가 아니다» —
   envelope `mode:"replay"` 로 자신을 밝히고, `ts` 는 녹화 시각 그대로다. 재생할 녹화본이
   없는 시나리오는 여전히 **501 이다**(사유 코드 `replay_fixture_missing`): 없는 것을 있다고
   말하느니 「없다」고 답한다.

🔴 **재생은 DB·그래프에 닿지 않는다.** 그것이 fixture 축의 값어치다 — 의존이 죽어도 이 경로는
   돈다(Phase 4 fallback 의 원천). 그래서 replay 분기는 의존 확인보다 «앞»에 있다.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .. import ownership, session_id
from ..errors import (
    NOT_IMPLEMENTED,
    DependencyUnavailable,
    LiveCapacityExhausted,
    NotImplementedRoute,
    dependency_guard,
)
from ..investigation import binding, replay, runner
from ..investigation.store import RunRecord, RunStore
from ..reading import factory as factory_reader
from ..reading import scenarios as scenario_reader
from ..schemas import AgentEvent, RunCreated, RunStopped, ScenarioSummary
from ..settings import get_settings

log = logging.getLogger("fkt.routers.investigation")

router = APIRouter(tags=["investigation"])

# WebSocket 애플리케이션 종료 코드(4000~4999). 1011(예기치 못한 조건)은 사실과 다르다.
WS_RUN_NOT_FOUND = 4404

# 🔴 live 시작 판정이 허용하는 프로브 stale — 계약 v0.1.9 가 「≤5s」로 성문했다. 요청마다
#    실제로 붙어 보면 보호장치가 스스로 부하가 되고, 그 틈에 시작된 run 은 기존 신호
#    (`run.failed` + `fallback:"replay"`)가 받는다.
LIVE_PROBE_MAX_AGE_SEC = 5.0


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


def _pool_or_503(request: Request) -> Any:
    """SSOT 풀 — 미설정이면 «의존 단절»로 답한다(우리 코드의 결함과 구분되는 사건이다)."""
    pool = request.app.state.resources.pg_pool
    if pool is None:
        raise DependencyUnavailable("postgres")
    return pool


def _degrade_to_replay(
    request: Request,
    scenario_id: str,
    anchor: Any,
    session_id: str,
    which_down: str,
) -> RunCreated:
    """의존이 정지했을 때의 live 요청 — 같은 조사를 «재생»으로 답한다 (Q-48 · 계약 v0.1.9).

    🔴 재생 경로는 pool·conn·driver 를 참조하지 않는다(`investigation/replay.py`) — 의존이
       멈춘 동안에도 이 길이 도는 것이 fixture 축의 값어치다.
    🔴 재생본이 «없으면» 503 이다. 501(`not_implemented`)을 쓰지 않는 이유: 구현은 있고
       지금 답할 수 없을 뿐이라, 501 은 사실과 다르다(계약 문면도 503 을 지목한다).
    """
    try:
        events = replay.load(get_settings().replay_fixture_dir, scenario_id)
    except replay.FixtureMissing as exc:
        log.info("강등할 재생본이 없다 — %s", exc)
        raise DependencyUnavailable(which_down) from exc
    except replay.FixtureBroken as exc:
        # 서버 자산의 문제다 — 호출자 잘못이 아니므로 5xx 이고 상세는 로그에만(§34.6).
        log.error("replay fixture 형상이 깨졌다: %s", exc)
        raise _error(500, "replay_fixture_broken", "replay fixture 를 읽을 수 없다") from exc

    record = replay.start(_store(request), session_id=session_id, anchor=anchor, events=events)
    return RunCreated(runId=record.runId, incidentId=record.incidentId, mode=record.mode)


def _run_or_404(request: Request, run_id: str) -> RunRecord:
    """이 세션이 볼 수 있는 run 만 — 판정은 `app/ownership.py` 한 곳이 한다(T3-1).

    🔴 「없다」·「끝났다」·**「남의 것이다」**가 전부 같은 404 다. 앞의 둘은 프로세스 안
       저장소의 정직한 대가고(store.py 머리말), 셋째는 계약 v0.1.6 의 존재 은닉이다 —
       타 세션에 「있지만 못 본다」로 답하면 남의 run 존재가 응답으로 새어 나간다.
    """
    return ownership.run_or_404(request, run_id)


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
        try:
            events = replay.load(get_settings().replay_fixture_dir, scenarioId)
        except replay.FixtureMissing as exc:
            # 🔴 501 을 유지한다 — 「구현이 있으나 이 시나리오의 녹화본이 없다」도 결국
            #    «답할 수 없다»이고, 사유 코드로 그 차이를 말한다(오케 판정 J-F).
            log.info("replay fixture 부재 — %s", exc)
            raise _error(
                501,
                "replay_fixture_missing",
                f"{scenarioId} 의 replay fixture 가 없다 — 재생할 녹화본이 존재하지 않는다",
            ) from exc
        except replay.FixtureBroken as exc:
            # 🔴 호출자 잘못이 아니다(서버 자산의 문제) — 그래서 5xx 이고, 상세는 로그에만
            #    남긴다. 파일명·경로가 응답에 실리면 인증 없는 공개 Sandbox 밖으로 나간다.
            log.error("replay fixture 형상이 깨졌다: %s", exc)
            raise _error(
                500, "replay_fixture_broken", "replay fixture 를 읽을 수 없다"
            ) from exc
        record = replay.start(
            _store(request), session_id=body.sessionId, anchor=anchor, events=events
        )
        return RunCreated(runId=record.runId, incidentId=record.incidentId, mode=record.mode)

    resources = _resources(request)
    settings = get_settings()

    # --- Q-48 「시작 «전» 판정」 (계약 v0.1.9) --------------------------------
    #
    # 🔴 **핸들 유무를 근거로 쓰지 않는다.** 앞판은 `resources.pg_pool is None` 을 봤는데,
    #    그것은 「객체가 있는가」일 뿐이다 — postgres 가 죽어도 풀 객체는 산다. 그 축으로
    #    판정하면 의존이 정지한 순간에도 live 가 «시작»되고, 방문자는 중간에 끊긴 조사를 본다.
    #    근거는 `/health` 가 쓰는 바로 그 프로브 결과다(같은 사실을 두 곳에서 다르게 재지 않는다).
    probes = await resources.probe_all_cached(LIVE_PROBE_MAX_AGE_SEC)
    down = sorted(name for name, probe in probes.items() if probe.state != "ok")
    if down:
        # 🔴 「부분 성공 0」 — graph 단계를 건너뛴 반쪽 조사를 내지 않는다. 대신 같은 조사를
        #    재생으로 보여 준다(계약: 강등). 재생본조차 없으면 그때는 답할 수 없다고 말한다.
        log.info("의존 정지로 live 를 강등한다 — %s", ", ".join(down))
        return _degrade_to_replay(request, scenarioId, anchor, body.sessionId, down[0])

    # --- ⓐ 자리 잡기 --------------------------------------------------------
    #
    # 🔴 판정은 «동기»다(capacity.admit 성문). 여기서 await 를 끼우면 그 사이에 다른 요청이
    #    같은 마지막 슬롯을 함께 받는다 — 상한이 상한이 아니게 되는 자리.
    capacity = request.app.state.live_capacity
    ticket = capacity.admit()
    if ticket is None:
        raise LiveCapacityExhausted(settings.live_retry_after_sec)

    try:
        async with dependency_guard("postgres"):
            record = await runner.start(
                _store(request),
                pool=resources.pg_pool,
                driver=resources.neo4j_driver,
                anchor=anchor,
                session_id=body.sessionId,
                mode="live",
                capacity=capacity,
                ticket=ticket,
                timeout_sec=settings.run_timeout_sec,
                queue_wait_max_sec=settings.live_queue_wait_max_sec,
            )
    except BaseException:
        # 🔴 run 이 서지 못했으면 자리도 돌려준다. 안 돌려주면 «아무도 쓰지 않는» 슬롯이
        #    영구히 물리고, 상한 1 인 형상에서는 그 한 번으로 Live 가 통째로 닫힌다.
        capacity.release(ticket)
        raise
    return RunCreated(runId=record.runId, incidentId=record.incidentId, mode=record.mode)


@router.get("/incidents/{incidentId}", responses={404: {"description": "`not_found`"}})
async def incident(incidentId: str, request: Request) -> dict[str, Any]:
    """incident 표제 — 계약 v0.1.7 형상(T3-2 해제 · 화면 ② 헤더가 먹는다).

    🔴 `runId` 는 **이 세션의 run 만** 붙는다. incident 자체는 SSOT 라 누구에게나 같지만,
       「그 incident 를 지금 조사 중인 run」은 세션 스코프다 — 남의 run id 를 여기 실으면
       소유권 은닉(계약 v0.1.6)이 이 라우트에서 새어 나간다. 그래서 조회 층은 SSOT 만 읽고
       (`reading/factory.incident_detail` 머리말), 세션 축은 여기서 **한 곳의 판정**
       (`app/ownership`)으로 얹는다.

    🔴 run 이 여럿이면 **가장 최근 것**이다. 「하나뿐일 것」이라는 가정을 두지 않는다 —
       같은 세션이 같은 incident 를 두 번 조사할 수 있고, 그때 dict 삽입 순서가 답을 정하게
       두면 순서 때문에 초록이 되는 자리가 생긴다(store.by_work_order_draft 성문과 같은 축).
    """
    pool = _pool_or_503(request)
    async with dependency_guard("postgres"):
        found = await factory_reader.incident_detail(pool, incidentId)
    if found is None:
        raise _error(404, "not_found", f"incident {incidentId} 를 찾을 수 없다")

    session = ownership.current_session(request)
    mine = [r for r in _store(request).by_session(session) if r.incidentId == incidentId] if session else []
    if mine:
        found["runId"] = mine[-1].runId
    return found


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
    # 🔴 소유권 판정은 HTTP 와 «같은 문»을 쓴다(T3-1). 여기서 `store.get` 을 직접 부르면
    #    WS 만 남의 run 을 열어 주는 구멍이 남는다 — 화면이 실시간 축으로 쓰는 경로라
    #    그 구멍이 가장 늦게 발견된다.
    record = ownership.find_run(websocket, runId)
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
