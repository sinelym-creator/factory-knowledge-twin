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

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from .errors import install_error_handlers
from .probes import close_resources, open_resources
from .routers import factory, investigations, knowledge, ops, sessions, work_orders
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
    app.state.resources = await open_resources(settings)
    notes = app.state.resources.notes
    if notes:
        log.info("degraded 로 기동한다: %s", notes)
    try:
        yield
    finally:
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
    )
    install_error_handlers(app)
    for module in (sessions, factory, investigations, knowledge, work_orders, ops):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


app = create_app()
