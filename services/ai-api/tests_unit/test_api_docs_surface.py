"""FastAPI 문서 표면 4종의 노출 판정과 부팅 검사의 «형상 대응»(D-87 · Q-35).

🔴 여기서 재는 것은 **「끄면 라우트가 사라지고, 그 형상에서도 부팅 검사가 살아 있는가」**다.
   `/docs`·`/redoc`·`/openapi.json`·`/docs/oauth2-redirect` 는 APIRoute 가 아니라 FastAPI 가
   직접 다는 Starlette 라우트라 앱 레벨 세션 가드가 «구조적으로» 닿지 못한다(T3-1 대조군 A).
   가드를 붙이는 처방이 없으므로 노출 판정은 라우트를 세우는가로만 가능하고, 그 대신
   `audit_guard_coverage` 가 두 형상 모두에서 울어야 한다 — 끈 형상에서 조용히 통과하는
   검사는 「없는 것과 같은 검사」다(같은 모듈의 「빈 결과는 통과가 아니다」와 같은 규율).

🔴 `app.main.create_app` 을 부르지 않는다. CI `unit-ai-api` job 은 실측 import 체인 4패키지만
   깔고(ci.yml · pytest·pydantic·fastapi·pydantic-settings), `main` 은 psycopg·neo4j·torch
   계열을 열어 그 형상에서 **import 자체가 실패**한다. 그래서 이 층은 가드·부팅 검사의 형상
   대응만 재고, 「`create_app` 이 설정을 실제로 읽는가」는 무대 실측(4종 HTTP 코드)이 잰다.
   두 축을 한 파일에서 섞으면 CI 가 「테스트가 틀려서」가 아니라 「목록이 모자라서」 빨강이 된다.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app.session_guard import (
    FRAMEWORK_UNGUARDED,
    GUARD_EXEMPT,
    MODE_FRAMEWORK,
    MODE_GUARDED,
    READ_ONLY_EXCEPTIONS,
    audit_guard_coverage,
    expected_framework_routes,
    guard_table,
    route_keys,
    session_guard,
)
from app.settings import Settings

#: 발주 판정선이 세는 그 네 경로(D-87 · `tests/security/gate7_admin_surface.py` 와 같은 목록).
DOC_PATHS = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}

#: 대조군 — 「가드가 꺼진 것」과 「이 4종만 밖」을 가르는 라우트(D-87 판정선의 B 축).
CONTRACT_PATH = "/api/scenarios"


async def _noop() -> dict[str, str]:
    return {"ok": "1"}


def _build(*, expose: bool, docs_url: str = "/docs") -> FastAPI:
    """`create_app` 과 같은 «형상»의 최소 앱 — 가드는 앱 레벨, 문서 셋은 설정 종속."""
    app = FastAPI(
        dependencies=[Depends(session_guard)],
        docs_url=docs_url if expose else None,
        redoc_url="/redoc" if expose else None,
        openapi_url="/openapi.json" if expose else None,
    )
    # 계약 표면 대용 + 면제·읽기 예외 목록이 실재 라우트와 1:1 이도록 세운다.
    #   🔴 세우지 않으면 `audit_guard_coverage` 의 stale 검사가 «내 테스트 앱의 사정»으로
    #      울어, 정작 재려던 축이 그 예외에 묻힌다.
    app.add_api_route(CONTRACT_PATH, _noop, methods=["GET"])
    for method, path in (*GUARD_EXEMPT, *READ_ONLY_EXCEPTIONS):
        app.add_api_route(path, _noop, methods=[method])
    return app


def test_default_is_closed() -> None:
    """🔴 기본값이 정본이다 — 기본값은 그대로 공개 배포까지 따라간다(CORS 절과 같은 규율)."""
    assert Settings.model_fields["expose_api_docs"].default is False


def test_closed_shape_stands_no_doc_route() -> None:
    app = _build(expose=False)
    paths = {p for _, p in route_keys(app)}
    assert DOC_PATHS & paths == set(), f"끈 형상에 문서 라우트가 서 있다: {DOC_PATHS & paths}"
    assert expected_framework_routes(app) == set()
    audit_guard_coverage(app)          # 끈 형상에서 부팅이 멈추지 않는다(D-87 이전에는 멈췄다)


def test_open_shape_stands_all_four() -> None:
    app = _build(expose=True)
    paths = {p for _, p in route_keys(app)}
    assert DOC_PATHS <= paths, f"켠 형상에 빠진 문서 라우트: {DOC_PATHS - paths}"
    assert expected_framework_routes(app) == {("GET", p) for p in DOC_PATHS}
    audit_guard_coverage(app)

    modes = {p: m for _, p, m in guard_table(app) if p in DOC_PATHS}
    assert set(modes) == DOC_PATHS
    assert set(modes.values()) == {MODE_FRAMEWORK}, modes


@pytest.mark.parametrize("expose", [False, True])
def test_contract_route_stays_guarded_in_both_shapes(expose: bool) -> None:
    """🔴 대조군 — 문서 표면을 끄고 켜는 것이 계약 라우트의 가드를 건드리지 않는다."""
    app = _build(expose=expose)
    modes = {p: m for _, p, m in guard_table(app) if p == CONTRACT_PATH}
    assert modes == {CONTRACT_PATH: MODE_GUARDED}


@pytest.mark.parametrize("expose", [False, True])
def test_audit_still_screams_on_an_unguarded_contract_route(expose: bool) -> None:
    """🔴 검사기 생존 확인 — 두 형상 «모두»에서 가드 밖 라우트에 운다.

    완화한 검사는 조용해지는 것으로 자신을 숨긴다. 여기서 빨강이 나오지 않으면 위 두
    테스트의 초록은 「검사가 아무것도 안 본다」는 뜻이다.
    """
    app = _build(expose=expose)
    app.router.routes.append(
        Route("/api/leaked", lambda req: PlainTextResponse("x"), methods=["GET"])
    )
    with pytest.raises(RuntimeError, match="세션 가드가 닿지 못하는 라우트"):
        audit_guard_coverage(app)


def test_audit_rejects_a_doc_path_missing_from_the_reason_list() -> None:
    """🔴 `docs_url` 을 다른 경로로 바꾸면 `_mode` 가 그것을 guarded 로 «잘못» 적는다 — 운다."""
    app = _build(expose=True, docs_url="/internal-docs")
    with pytest.raises(RuntimeError, match="비가드 사유 목록에 없다"):
        audit_guard_coverage(app)


def test_reason_list_covers_exactly_the_four() -> None:
    """사유 사전과 판정선 목록이 같은 넷을 말한다(둘이 갈리면 무대 실측이 헛것을 센다)."""
    assert {p for _, p in FRAMEWORK_UNGUARDED} == DOC_PATHS
