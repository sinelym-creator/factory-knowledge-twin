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

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .. import ownership, session_id
from ..errors import (
    NOT_IMPLEMENTED,
    DependencyUnavailable,
    LiveCapacityExhausted,
    NotImplementedRoute,
    SessionRunCapExceeded,
    dependency_guard,
)
from ..investigation import binding, replay, runner
from ..investigation.store import RunRecord, RunStore
from ..reading import factory as factory_reader
from ..reading import scenarios as scenario_reader
from ..schemas import AgentEvent, RunCapStatus, RunCreated, RunStopped, ScenarioSummary
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


# 🔴 재사용을 «말하는» 헤더. 조용히 같은 run 을 돌려주면 호출자는 자기가 만든 줄 안다 —
#    그러면 「두 번 눌렀는데 하나」와 「두 번째가 조용히 무시됐다」를 구별할 방법이 없다.
RUN_REUSED_HEADER = "X-FKT-Run-Reused"

# 🔴 세션 조사 상한을 «응답과 같은 왕복»에 실어 보내는 자리 — 계약 v0.1.15.
#    폴링(30s)만으로 갱신하면 방금 쓴 1회가 화면에 최대 30초 늦게 뜬다. 그 창에서 방문자는
#    「눌렀는데 숫자가 그대로」를 보고 자기 클릭이 먹지 않았다고 읽는다.
RUN_CAP_LIMIT_HEADER = "X-FKT-Run-Cap-Limit"
RUN_CAP_USED_HEADER = "X-FKT-Run-Cap-Used"
RUN_CAP_REMAINING_HEADER = "X-FKT-Run-Cap-Remaining"


def _stamp_run_cap(response: Response, request: Request, session_id: str) -> None:
    """live 201 에 상한 3칸을 찍는다 — 🔴 `peek` 이라 **이 호출은 계수하지 않는다**.

    🔴 `admit` «뒤»에 부른다 — 그래야 `used` 가 계약이 요구한 「이번 실행 «포함»」이 된다.
       앞에서 부르면 방문자는 자기가 방금 쓴 회차가 빠진 숫자를 받는다.
    🔴 `remaining` 이 None(상한 없음)이면 그 헤더는 «싣지 않는다». 빈 문자열이나 `-1` 을
       주면 소비자가 그것을 수로 읽는다 — 없는 것은 없는 채로 두는 것이 이 리포의 규율
       (`retryAfterSec`·`detail` 과 같다).
    """
    view = RunCapStatus.of(
        request.app.state.session_run_cap.peek(session_id),
        request.app.state.session_run_cap.window_sec,
    )
    response.headers[RUN_CAP_LIMIT_HEADER] = str(view.limit)
    response.headers[RUN_CAP_USED_HEADER] = str(view.used)
    if view.remaining is not None:
        response.headers[RUN_CAP_REMAINING_HEADER] = str(view.remaining)


def _reusable_run(
    store: RunStore, session_id: str, scenario_id: str, mode: str
) -> RunRecord | None:
    """같은 세션 × 시나리오 × mode 의 «비종결» run — 있으면 그것이 답이다 (D-48).

    🔴 **이 함수는 «동기»다.** 판정과 `store.create` 사이에 이벤트 루프로 돌아가면 두 요청이
       둘 다 「없다」를 보고 둘 다 만든다 — 그게 D-48 의 정확한 형태였다(경합 창 =
       `await probe_all_cached`). 그래서 여기에 `await` 를 «넣지 않는다». 호출 자리도
       마지막 await 가 재개된 «뒤»여야 한다(호출부 주석에 줄 번호로 적어 두었다).

    🔴 여럿이면 **가장 최근 것**이다. 「하나뿐일 것」이라는 가정을 두지 않는다 — 같은 세션이
       같은 시나리오를 종결 뒤 다시 조사할 수 있고, 그때 삽입 순서가 답을 정하게 두면
       순서 때문에 초록이 되는 자리가 생긴다(`incident` 라우트·`by_work_order_draft` 와 같은 축).
    """
    found: RunRecord | None = None
    for record in store.by_session(session_id):
        if record.scenarioId == scenario_id and record.mode == mode and not record.terminal:
            found = record
    return found


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
async def start_run(
    scenarioId: str, body: RunRequest, request: Request, response: Response
) -> RunCreated:
    """조사 실행 생성 — `{ runId, incidentId, mode }`. 실행은 배경으로 흐르고 즉시 답한다."""
    if not session_id.is_valid(body.sessionId):
        raise _error(422, "invalid_session_id", "sessionId 형식이 아니다(영숫자·-·_ 8~64자)")

    # 🔴 세션 출처는 «가드가 확정한 것» 하나다(`session_guard.py` 성문 · 정본
    #    `ownership.current_session`). 본문 `sessionId` 는 계약 v0.1.6 의 «잔존 표기»이고,
    #    가드가 「쿠키≠본문 = 422 · 본문 단독 = 401」로 이미 끊으므로 이 자리에서 두 값은
    #    **항상 같다** — 지금 갈려 있는 것이 아니다. 그럼에도 라우트가 본문을 다시 꺼내면,
    #    가드 규칙이 완화되는 날 «등록 세션»과 «판정 세션»이 조용히 갈린다(D-80 의 형태).
    #    아래 전부가 이 한 값을 읽는다(상한·재사용·강등·stamp 포함 — 출처가 둘이면 통일이 아니다).
    session = ownership.current_session(request)
    if session is None:  # pragma: no cover — 쓰기 라우트는 가드가 세션 없이 통과시키지 않는다
        raise _error(401, "session_required", "세션이 없다 — POST /api/sessions 로 발급받아라")

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
        # 🔴 D-48 의 재사용 판정을 **여기에 두지 않는다.** replay run 은 `replay.start` 안에서
        #    이벤트 전량을 동기로 흘리고 `record.status = _TERMINAL_TYPES[...]` 로 닫힌다
        #    (`investigation/replay.py:150→161`) — 즉 **비종결인 순간이 0**이라 「비종결 run 을
        #    재사용한다」는 규칙이 걸릴 창 자체가 없다. 여기 판정을 두면 발동 건수 0 인 죽은
        #    분기가 되고, 죽은 분기는 「막았다」로 읽힌다.
        #    실측(같은 실행 · 전/후 두 무대): replay 동시 2 POST → 양쪽 다 run 2 · 갓 만든
        #    run 의 status 가 이미 `completed`. 두 번 재생 = 각각 «완주한» 조사이므로 화면에서
        #    경합하지 않고 세션 상한도 쓰지 않는다(live 축만 센다).
        record = replay.start(
            _store(request), session_id=session, anchor=anchor, events=events
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

    # --- D-48 「같은 조사를 «동시에» 두 번 시작해도 run 은 하나」 -------------------
    #
    # 🔴 **자리가 전부다.** 경합 창은 바로 위의 `await probe_all_cached` 였다 — 두 요청이
    #    거기서 함께 재개돼 둘 다 「활성 run 없음」을 보고 둘 다 만들었다(리바이2 실측:
    #    동시 2 POST → run 2 · 대조군 1회 → 1). 그래서 판정을 그 await 가 «재개된 직후»에
    #    두고, 여기서 `store.create` 까지 **이벤트 루프로 돌아가지 않는다**:
    #      · `session_run_cap.admit` 동기 · `capacity.admit` 동기
    #      · `async with dependency_guard(...)` — `errors.py:184` 의 몸통은 `try: yield` 이고
    #        `async def` 와 `yield` 사이에 `await` 가 **없다**(읽어서 확인 · 추정 아님)
    #      · `runner.start` — `store.create` 가 `runner.py:50`, 첫 `await` 가 `runner.py:91`
    #    ⇒ 판정→생성 구간에 suspend 지점 0.
    #
    # 🔴 **상한보다 «앞»에 둔다.** 뒤에 두면 중복 요청이 세션 상한과 Live 슬롯을 먼저 먹고
    #    나서 재사용으로 접힌다 — 그 찰나에 정상 요청이 503 을 맞는다.
    reused = _reusable_run(_store(request), session, scenarioId, "live")
    if reused is not None:
        log.info(
            "같은 세션의 비종결 live run 을 재사용한다 — session=%s scenario=%s run=%s",
            session, scenarioId, reused.runId,
        )
        response.headers[RUN_REUSED_HEADER] = reused.runId
        # 🔴 재사용 회차는 **계수 0**(계약 v0.1.15)이지만 상한 3칸은 «싣는다» — 이것도 live
        #    201 이고, 화면은 이 응답으로 카운터를 갱신한다. 숫자를 빼면 두 번 누른 방문자의
        #    화면만 30초 동안 낡은 값을 들고 있게 된다(계수가 0 인 것과 말하지 않는 것은 다르다).
        _stamp_run_cap(response, request, session)
        return RunCreated(runId=reused.runId, incidentId=reused.incidentId, mode=reused.mode)

    down = sorted(name for name, probe in probes.items() if probe.state != "ok")
    if down:
        # 🔴 「부분 성공 0」 — graph 단계를 건너뛴 반쪽 조사를 내지 않는다. 대신 같은 조사를
        #    재생으로 보여 준다(계약: 강등). 재생본조차 없으면 그때는 답할 수 없다고 말한다.
        log.info("의존 정지로 live 를 강등한다 — %s", ", ".join(down))
        return _degrade_to_replay(request, scenarioId, anchor, session, down[0])

    # --- 세션 조사 상한 (계약 v0.1.12 · T6-2 ②) --------------------------------
    #
    # 🔴 **의존 강등보다 «뒤»에 둔다.** 의존이 죽어 replay 로 내려가는 run 은 구독을 쓰지
    #    않는다 — 그것까지 상한에 세면 게이트웨이가 꺼진 시간에 상한만 소진된다.
    # 🔴 **자리 잡기보다 «앞»에 둔다.** 순서가 바뀌면 상한에 걸릴 요청이 슬롯을 먼저 잡았다가
    #    돌려주고, 그 찰나에 정상 요청이 503 을 맞는다.
    retry_after = request.app.state.session_run_cap.admit(session)
    if retry_after is not None:
        log.info("세션 조사 상한 초과 — 재생으로 안내한다(Retry-After %ds)", retry_after)
        # 🔴 `used` 는 «지금 창 안의 실측»이다(계약 v0.1.15) — `limit` 을 그대로 베끼지 않는다.
        #    둘은 거의 언제나 같지만, 운영자가 상한을 «내리는» 순간 창 안에는 옛 상한만큼의
        #    기록이 남아 `used > limit` 이 참이 된다. 그때 limit 을 베낀 응답은 사실을 지운다.
        used = int(request.app.state.session_run_cap.peek(session)["used"])
        raise SessionRunCapExceeded(retry_after, settings.run_cap_per_session, used)

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
                session_id=session,
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
    # 🔴 stamp 는 «생성이 선 뒤»다 — D-48 이 지킨 「판정→`store.create` 사이 suspend 0」 구간
    #    안에 이 호출을 끼우지 않는다. 그 구간은 동기여야 하는 자리이고, 거기에 코드를 더하면
    #    다음 사람이 「여기 await 를 넣어도 되나」를 다시 판단하게 된다. 값은 같다(같은 세션의
    #    다음 admit 은 이 요청이 끝나야 오고, 재사용 규칙이 동시 2회를 접는다).
    _stamp_run_cap(response, request, session)
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


# 목록이 상한 없이 자라지 않게 — 계약 v0.1.16 이 정한 값.
SESSION_RUNS_LIMIT = 20


@router.get("/runs", responses={422: {"description": "`invalid_request`"}})
async def session_runs(request: Request, sessionId: str) -> list[dict[str, Any]]:
    """`GET /runs?sessionId=` — 그 세션이 시작한 조사 목록(계약 v0.1.16 · 읽기 전용).

    🔴 **쿠키 없음 401 은 여기서 쓰지 않는다** — 앱 레벨 `session_guard` 가 이미 그 답을
       낸다. 라우트가 같은 검사를 한 번 더 두면 「어느 층이 거절했는가」가 갈리고, 한쪽만
       고쳐지는 날이 온다(새 검사 0 · 발주문 조건).

    🔴 **쿠키와 쿼리가 다르면 422 다** — 「id 를 아는 것만으로 남의 목록을 읽는」 경로를
       열지 않는다(v0.1.6 판정 append 와 같은 규칙). 서버는 둘 중 어느 쪽을 뜻하는지
       고르지 않는다.

    🔴 재기동 뒤 빈 배열은 **정상**이다 — 저장소가 프로세스 안이라 「없다」가 아니라
       「이 프로세스는 모른다」이다. 그 차이를 지어내지 않고 사실만(빈 배열) 낸다.
    """
    cookie_sid = getattr(request.state, "session_id", None)
    if cookie_sid != sessionId:
        raise _error(
            422,
            "invalid_request",
            "쿠키와 쿼리의 sessionId 가 다르다 — 남의 세션 목록은 열지 않는다",
        )

    # 🔴 최신순 = `startedAt` 내림차순. dict 삽입 순서에 기대지 않는다 — 그 순서는
    #    eviction 이 한 번 돌면 «만든 순»이기를 그만둔다(store 의 `_evict_if_needed`).
    records = sorted(_store(request).by_session(sessionId), key=lambda r: r.startedAt, reverse=True)

    listed: list[dict[str, Any]] = []
    for record in records[:SESSION_RUNS_LIMIT]:
        item: dict[str, Any] = {
            "runId": record.runId,
            "incidentId": record.incidentId,
            "scenarioId": record.scenarioId,
            "mode": record.mode,
            "status": record.status,
            "startedAt": record.startedAt,
        }
        # 계약이 선택으로 둔 칸 — 아직 도는 run 에는 «없다»(null 을 지어 넣지 않는다).
        if record.finishedAt is not None:
            item["finishedAt"] = record.finishedAt
        listed.append(item)
    return listed


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
