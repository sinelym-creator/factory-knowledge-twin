"""계약 v0.1 §운영 — /health · /live/status.

이 두 개는 골격에서도 «실제로» 답한다. 나머지 라우트가 501 을 내는 동안 서비스가 살아
있는지를 물어볼 창구가 하나는 있어야 한다.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request

from ..investigation.synthesize import live_gateway_reachable
from ..probes import Resources
from ..retrieval import embedding
from ..schemas import HealthResponse, LiveStatus, ModelReadiness, RunCapStatus

router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """계약 `{ ok, version }` + 의존 프로브(티켓 T1-8 「연결 실패 시에도 boot 성립 — degraded」).

    🔴 `ok` 는 «이 프로세스가 응답하는가»다. 의존이 죽어도 true — 여기서 false 를 주면
       모니터가 프로세스 다운으로 읽고 재시작을 돌린다. 의존 상태는 `status`/`dependencies`
       가 말한다. 계약의 두 필드는 그대로 두고 «더한» 것이라 소비자 호환은 유지된다.
    """
    res: Resources = request.app.state.resources
    deps = await res.probe_all()
    degraded = any(d.state != "ok" for d in deps.values())
    # 🔴 «준비 축»은 의존 프로브와 다른 사실이다(Q-44). DB 가 붙어도 모델이 안 올라와 있으면
    #    검색은 느리고, 그 느림은 결함이 아니다 — 두 사실을 따로 적어야 운영이 가를 수 있다.
    state, detail = embedding.readiness()
    if not res.settings.warmup_embedding and state == "cold":
        state, detail = "disabled", "FKT_WARMUP_EMBEDDING=0 — 첫 검색 때 올린다"
    return HealthResponse(
        ok=True,
        version=res.settings.version,
        status="degraded" if degraded else "ok",
        dependencies=deps,
        # 🔴 짧은 sha «만». 「어느 커밋이 답했나」에 답하는 데 그 이상은 필요 없고,
        #    그 이상은 전부 공개 경계다(§16·§34.6 · Q-46).
        build=res.settings.build_sha,
        models=ModelReadiness(embedding=state, detail=detail),
    )


@router.get("/live/status", response_model=LiveStatus, response_model_exclude_unset=True)
async def live_status(
    request: Request,
    sessionId: str | None = Query(
        default=None,
        description="주면 그 세션의 조사 상한(`runCap`)을 «읽어» 함께 답한다 — 계수 0(계약 v0.1.15)",
    ),
) -> LiveStatus:
    """Live/Replay 배지·fallback 판단 — 계약 `{ online, checkedAt }`.

    🔴 **`online` = 「로컬 합성 게이트웨이에 닿을 수 있는가」**(오케 판정 J-1 (b) · T2-3).
       T6-2 ② 부터 이것은 **실도달 프로브**(`GET /health` · 몇 초 캐시)다 — env 유무가 아니다.
       조사 «실행»이 가능한가가 아니다 — 실행은 T2-3 이 붙였고 공개 배포에서도 돈다.
       공개 배포에 없는 것은 Claude 합성 축뿐이고, 그것이 바로 이 배지가 가리켜야 할 축이다
       (baseline §15.2: 구독은 공개 API 로 나가지 않는다).

    🔴 그러므로 공개 Sandbox 에서 `online=false` 는 **결함이 아니라 참**이다. 여기서 true 를
       주면 화면은 갈 수 없는 길을 권한다.

    🔴 이 낱말은 계약 안에서 `mode:"live"`(= 이벤트의 «출처»가 fixture 가 아님 · README
       원칙1)와 충돌한다. 두 축이 한 낱말을 쓰고 있어 v0.2 재론으로 회부했다 — 구현이
       임의로 한쪽 뜻을 바꾸지 않는다.
    """
    # 🔴 도달 프로브 1회(몇 초 캐시). blocking 이라 스레드로 던진다 — 이 라우트가 막히면
    #    배지 폴링이 서비스를 막는다.
    online = await asyncio.to_thread(live_gateway_reachable)
    if sessionId is None:
        # 🔴 **쿼리가 없으면 v0.1.2 형상 그대로**(대조군). `runCap=None` 을 «주지» 않는다 —
        #    주면 필드가 set 이 되어 `null` 이 실리고, 기존 소비자의 응답이 달라진다.
        return LiveStatus(online=online, checkedAt=datetime.now(timezone.utc))
    # 🔴 **읽기만 한다** — `peek` 이지 `admit` 이 아니다(계약 v0.1.15 · session_cap 머리말).
    #    배지 폴링이 30초마다 도는 자리라, 여기서 세면 «보는 것»이 «쓰는 것»이 되어 방문자는
    #    아무것도 안 하고 상한에 닿는다.
    cap = request.app.state.session_run_cap
    return LiveStatus(
        online=online,
        checkedAt=datetime.now(timezone.utc),
        runCap=RunCapStatus.of(cap.peek(sessionId), cap.window_sec),
    )
