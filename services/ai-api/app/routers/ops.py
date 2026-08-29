"""계약 v0.1 §운영 — /health · /live/status.

이 두 개는 골격에서도 «실제로» 답한다. 나머지 라우트가 501 을 내는 동안 서비스가 살아
있는지를 물어볼 창구가 하나는 있어야 한다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from ..investigation.synthesize import live_gateway_available
from ..probes import Resources
from ..schemas import HealthResponse, LiveStatus

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
    return HealthResponse(
        ok=True,
        version=res.settings.version,
        status="degraded" if degraded else "ok",
        dependencies=deps,
    )


@router.get("/live/status", response_model=LiveStatus)
async def live_status() -> LiveStatus:
    """Live/Replay 배지·fallback 판단 — 계약 `{ online, checkedAt }`.

    🔴 **`online` = 「로컬 합성 게이트웨이에 닿을 수 있는가」**(오케 판정 J-1 (b) · T2-3).
       조사 «실행»이 가능한가가 아니다 — 실행은 T2-3 이 붙였고 공개 배포에서도 돈다.
       공개 배포에 없는 것은 Claude 합성 축뿐이고, 그것이 바로 이 배지가 가리켜야 할 축이다
       (baseline §15.2: 구독은 공개 API 로 나가지 않는다).

    🔴 그러므로 공개 Sandbox 에서 `online=false` 는 **결함이 아니라 참**이다. 여기서 true 를
       주면 화면은 갈 수 없는 길을 권한다.

    🔴 이 낱말은 계약 안에서 `mode:"live"`(= 이벤트의 «출처»가 fixture 가 아님 · README
       원칙1)와 충돌한다. 두 축이 한 낱말을 쓰고 있어 v0.2 재론으로 회부했다 — 구현이
       임의로 한쪽 뜻을 바꾸지 않는다.
    """
    return LiveStatus(online=live_gateway_available(), checkedAt=datetime.now(timezone.utc))
