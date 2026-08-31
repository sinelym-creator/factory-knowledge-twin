"""ai-api — 계약 v0.1 표면의 완전 비동기 골격 (T1-8).

무엇이 «있는가»: 계약 v0.1 이 약속한 라우트 전건 · lifespan 의 asyncpg 풀·Neo4j 드라이버
골격 · /health 의 의존 프로브 · WebSocket 이벤트 경로.

무엇이 «없는가», 그리고 왜: 도메인 기능이 없다. 라우터는 계약 형상만 알고, 호출하면 계약
오류 형상 그대로 501 을 답한다. 골격이 그럴듯한 값을 지어내면 그 거짓은 화면과 통합될 때
까지 살아남는다 — 지금 없는 것은 없다고 말하는 편이 싸다. 자세한 목록은 README §「없는 것」.

🔴 §7 완전 비동기: 이 서비스의 모든 IO 는 async 드라이버를 지난다. 동기 호출이 하나라도
   섞이면 그 시간 동안 이벤트 루프가 멈추고, WebSocket 으로 흘리던 조사 진행이 함께 멈춘다.
   근거는 README §「blocking 0」, 실측은 `tools/measure_loop_lag.py`.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .errors import install_error_handlers
from .investigation.approvals import ApprovalStore
from .investigation.guards import enforce_no_telemetry
from .investigation.capacity import LiveCapacity
from .investigation.store import RunStore
from .probes import close_resources, open_resources
from .protection import BodyLimitMiddleware, RateLimitMiddleware
from .retrieval import embedding
from .routers import factory, investigations, knowledge, ops, sessions, work_orders
from .session_guard import audit_guard_coverage, session_guard
from .session_store import SessionStore
from .settings import get_settings

log = logging.getLogger("fkt.api")

API_PREFIX = "/api"          # 계약 v0.1 「base = /api」


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """의존 핸들을 열고 닫는다.

    🔴 여는 데 실패해도 부팅은 성립한다. DB 가 늦게 뜨는 흔한 상황에서 프로세스가 죽으면
       재시작 루프에 빠지고, 원인을 물어볼 /health 조차 사라진다(probes 모듈 머리말).
    """
    settings = get_settings()

    # 🔴 텔레메트리 차단을 «부팅에서 다시 강제하고 확인»한다(오케 승인 J-5). langgraph import
    #    시점에 이미 한 번 걸렸지만(investigation/workflow.py), 그 사이 누가 환경을 바꿨을
    #    가능성을 배제하지 않는다 — 확인이 실패하면 여기서 부팅이 멈춘다. 열린 채로 도는
    #    것보다 안 뜨는 편이 낫다: 나간 데이터는 회수되지 않는다.
    forced = enforce_no_telemetry()
    if forced:
        log.warning("부팅 시 egress guard 가 환경을 바꿨다: %s", sorted(forced))

    # 세션 저장소 — 프로세스 안 · TTL 명시(T3-1). 🔴 run·승인 저장소보다 «먼저» 세운다:
    # 가드가 첫 요청에서 이것을 찾고, 없으면 전 라우트가 500 으로 죽는다.
    app.state.session_store = SessionStore()
    # run·이벤트·WO 초안 저장소 — 프로세스 안 · 세션 스코프 · SSOT 쓰기 0(오케 판정 J-3).
    app.state.run_store = RunStore()
    # 🔴 Live 동시 실행·대기열의 «유일한 계수기»(T4-2b ⓐ). 라우터가 각자 세면 두 라우트가
    #    서로 다른 「지금 몇 개 도는가」를 갖게 되고, 상한은 그 순간 상한이 아니게 된다.
    app.state.live_capacity = LiveCapacity(
        concurrency=settings.live_concurrency,
        queue_max=settings.live_queue_max,
    )
    # 🔴 승인 원장은 run 저장소와 «따로» 둔다 — run 은 상한(MAX_RUNS)에 걸리면 버려지고,
    #    그 안에 원장을 두면 「승인했다」는 사실이 초안과 함께 사라진다(approvals.py 머리말).
    app.state.approval_store = ApprovalStore()

    app.state.resources = await open_resources(settings)
    notes = app.state.resources.notes
    if notes:
        log.info("degraded 로 기동한다: %s", notes)

    # 🔴 임베딩 warm-up 은 «백그라운드»다(Q-44 · T4-1). 여기서 await 하면 모델 적재(실측
    #    30초+)만큼 /health 조차 안 뜨고, 컨테이너 헬스체크가 그 침묵을 «죽음»으로 읽어
    #    재시작 루프를 돈다 — 이 파일 머리말이 경계하는 바로 그 형태다.
    #    준비 여부는 /health 의 `models` 가 말한다(조용한 대기 0).
    warm: asyncio.Task[None] | None = None
    if settings.warmup_embedding:
        warm = asyncio.create_task(embedding.warm_up())

    # 🔴 만료 세션 «주기» 정리(T4-2b ⓪). lazy 스윕은 방문이 있을 때만 도므로, 방문이
    #    끊긴 뒤 만료된 세션은 다음 방문자가 올 때까지 남는다 — 공개 Tunnel 뒤에서 그
    #    「다음 방문자」는 며칠 뒤일 수 있다. 만료 «판정»은 그대로다(session_store 성문).
    sweeper: asyncio.Task[None] | None = None
    if settings.session_sweep_sec > 0:
        sweeper = asyncio.create_task(
            app.state.session_store.sweep_forever(settings.session_sweep_sec)
        )

    try:
        yield
    finally:
        if sweeper is not None and not sweeper.done():
            sweeper.cancel()
        # 🔴 돌고 있는 조사를 먼저 접는다. 남겨 두면 의존이 닫힌 뒤 질의가 나가 「닫힌 풀에
        #    쓴다」는 애먼 예외가 종료 로그를 덮는다.
        if warm is not None and not warm.done():
            warm.cancel()
        for record in tuple(app.state.run_store._runs.values()):   # noqa: SLF001 — 종료 경로
            if record.task is not None and not record.task.done():
                record.task.cancel()
        await close_resources(app.state.resources)


def create_app() -> FastAPI:
    app = FastAPI(
        title="FKT ai-api",
        version=get_settings().version,
        description=(
            "Factory Knowledge Twin — AI API. 계약 v0.1(packages/contracts) 표면의 "
            "비동기 골격이며 도메인 구현은 아직 없다(T1-8)."
        ),
        lifespan=lifespan,
        # 🔴 **세션 가드는 앱 레벨이다**(T3-1 · 계약 v0.1.6). 라우터마다 붙이면 새 라우터를
        #    등록하며 «붙이기를 잊는» 자리가 생기고, 잊은 라우트는 세션 없이 열리는 구멍이
        #    된다. 기본이 가드이고 면제는 `session_guard` 의 두 목록에만 적는다 — 그 목록이
        #    실재 라우트와 어긋나면 아래 `audit_guard_coverage` 가 부팅을 멈춘다.
        dependencies=[Depends(session_guard)],
    )
    # 🔴 **CORS 는 allowlist 가 «있을 때만» 켠다**(§16.3 · T4-1 ⓒ).
    #
    #    로컬 형상에서는 브라우저가 셸 origin 하나만 쓴다 — `/api/*` 는 Next rewrite 가
    #    프록시하므로 브라우저 입장에서 전부 same-origin 이고, 그래서 지금까지 CORS 없이
    #    돌았다. 공개 형상에서 셸(Vercel)과 ai-api(Tunnel)가 «다른 origin» 이 되는 축을
    #    위해 여기에 문을 만들되, 기본값은 «닫힘»이다.
    #
    #    🔴 `allow_origins=["*"]` 를 기본값으로 두지 않는다. 기본값은 그대로 공개 배포까지
    #       따라가고, 그때는 아무도 그것을 «선택»한 기억이 없다. 목록이 비면 미들웨어를
    #       아예 달지 않는다 — 「열려 있는데 비어 있는 문」을 만들지 않는다.
    #    🔴 `allow_credentials=True` 는 allowlist 와 «짝»이다. 와일드카드와 함께 쓰면 브라우저가
    #       거부하고, 그 거부는 CORS 설정이 아니라 서버 오류처럼 보인다.
    settings = get_settings()

    # 🔴 **미들웨어 순서는 «바깥 → 안»이 add 의 «역순»이다**(Starlette 은 새로 더한 것을 앞에
    #    꽂는다). 그래서 아래 세 줄은 실제로 CORS → rate limit → body limit 순으로 선다:
    #      · CORS 가 가장 바깥인 이유 — 429·413 응답에도 CORS 헤더가 붙어야 브라우저가 그
    #        응답을 «읽을 수» 있다. 안쪽에 두면 보호장치가 발동한 순간 화면은 이유를 모른 채
    #        네트워크 오류만 본다(공개 형상에서 셸과 origin 이 갈릴 때 실제로 갈리는 자리).
    #      · rate limit 이 body limit 보다 바깥인 이유 — 넘친 요청의 본문을 읽지 않고 끊는다.
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(
        RateLimitMiddleware,
        ip_per_min=settings.rate_limit_ip_per_min,
        session_per_min=settings.rate_limit_session_per_min,
        trust_forwarded_for=settings.trust_forwarded_for,
        floor_retry_after_sec=settings.rate_limit_retry_after_sec,
    )

    allowlist = settings.cors_allowlist
    if allowlist:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowlist,
            allow_credentials=True,      # 세션 쿠키가 실려야 소유권 축이 선다(T3-1)
            allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
            allow_headers=["content-type"],
        )

    install_error_handlers(app)
    for module in (sessions, factory, investigations, knowledge, work_orders, ops):
        app.include_router(module.router, prefix=API_PREFIX)
    # 🔴 라우트가 다 등록된 «뒤»에 센다. 앞에서 세면 0개를 보고 「모순 없음」을 낸다.
    audit_guard_coverage(app)
    return app


app = create_app()
