"""계약 v0.1 §운영 — /health · /live/status.

이 두 개는 골격에서도 «실제로» 답한다. 나머지 라우트가 501 을 내는 동안 서비스가 살아
있는지를 물어볼 창구가 하나는 있어야 한다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

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

    🔴 골격에서는 `online=false` 가 «참»이다. live 조사를 돌릴 run-orchestrator 가 아직
       없으므로 live 로 갈 수 있다고 답하면 화면이 갈 수 없는 길로 간다. 이 값이 true 가
       되는 것은 실행 경로가 붙는 티켓의 결과여야 한다.
    """
    return LiveStatus(online=False, checkedAt=datetime.now(timezone.utc))
