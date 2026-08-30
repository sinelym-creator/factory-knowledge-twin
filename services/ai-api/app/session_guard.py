"""세션 가드 — 계약 v0.1.6 append 집행 (T3-1).

🔴 **기본이 «가드»고, 예외는 «데이터»다.** 가드를 라우터·라우트에 붙이는 방식은 새 라우트가
   생길 때 «붙이기를 잊는» 자리를 만든다 — 그리고 잊은 라우트는 세션 없이 열리는 구멍이라,
   화면이 늘어날수록 확실히 생긴다. 그래서 앱 레벨 의존으로 «전 라우트»에 걸고, 면제는 아래
   두 목록에만 적는다. 목록에 없는 라우트는 이름을 몰라도 가드된다.

🔴 **그러나 「막았다」는 「막는 코드가 동작한다」가 아니다.** 허용 목록 방식은 자기 분기를
   가린다 — 목록에 있는 것만 통과시킨다는 사실은, 목록 «밖»의 새 라우트가 실제로 물리는지를
   증명하지 않는다. 그 증명은 코드가 아니라 측정이 한다:
   `tools/session_guard_matrix.py` 가 **예외 목록에 없는 라우트를 밖에서 새로 만들어** 붙이고
   가드가 그것을 무는지 본다. 이 파일의 주석은 그 측정의 대체물이 아니다.

🔴 **부팅에서 정합을 확인한다**(`audit_guard_coverage`). 예외 목록의 항목이 실재 라우트와
   1:1로 맺히지 않으면 부팅이 멈춘다. 실패 방향을 그렇게 뒀다 — 예외 목록에 오타가 나면 그
   라우트는 «가드된 채로» 남고(안전한 쪽) 부팅이 운다(눈에 보이는 쪽). 반대로 두면 오타가
   조용히 구멍을 낸다.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Final

from fastapi import FastAPI, WebSocketException
from starlette.requests import HTTPConnection, Request
from starlette.routing import Route, WebSocketRoute

from . import session_id
from .errors import contract_error
from .session_store import SessionStore

log = logging.getLogger("fkt.session_guard")

# WebSocket 에는 401 이 없다 — 핸드셰이크 거절은 close 코드로 말한다. 4000~4999 는
# 애플리케이션 영역이고, 이 리포는 이미 `WS_RUN_NOT_FOUND = 4404` 로 「HTTP 상태를 뒤 세
# 자리에 싣는」 규약을 쓴다(routers/investigations.py). 같은 규약을 잇는다.
WS_SESSION_REQUIRED: Final = 4401

# 🔴 세션 «면제» — 계약 v0.1.6 「POST /sessions · GET /api/health · GET /live/status 제외」.
#    세션을 만들거나(닭과 달걀), 세션과 무관한 운영 축이다.
GUARD_EXEMPT: Final[dict[tuple[str, str], str]] = {
    ("POST", "/api/sessions"): "세션을 «만드는» 자리 — 세션을 요구하면 아무도 들어오지 못한다",
    ("GET", "/api/health"): "모니터·배포가 세션 없이 묻는다(계약 「Vercel·모니터」)",
    ("GET", "/api/live/status"): "모드 배지·fallback 축 — 입장 전에도 답이 있어야 한다",
}

# 🔴 **읽기 전용 예외** — 계약 v0.1.6 「§3:244 집행 · Q-16 긴장 해소」. 딥링크로 들어온
#    사람이 근거·문서를 «열람만» 하는 축이다. 면제와 사유가 달라 목록을 나눠 둔다:
#    면제는 「세션과 무관한 축」이고, 이쪽은 「세션 스코프 자원이 아니어서 열어 두는 축」이다.
#    🔴 세션 스코프 자원(run · WO 초안 · 승인 이력)은 여기 **없다** — 계약이 그렇게 적었고,
#       그것이 이 예외가 소유권 은닉을 갉아먹지 않는 이유다.
READ_ONLY_EXCEPTIONS: Final[dict[tuple[str, str], str]] = {
    ("GET", "/api/evidence/{evidenceId}"): "근거 딥링크 — 세션 스코프 자원이 아니다",
    ("GET", "/api/documents/{docId}"): "문서 딥링크 — 세션 스코프 자원이 아니다",
}

# 🔴 **가드가 «구조적으로» 닿지 못하는 라우트** — FastAPI 가 직접 다는 문서 표면이다.
#    이것들은 APIRoute 가 아니라 평범한 Starlette Route 라서 앱 레벨 의존 체인 밖에 있다.
#    내가 «면제하기로 골랐다»가 아니라 **가드가 닿지 않는다**는 실측 사실이라, 면제와 같은
#    목록에 섞지 않는다 — 섞으면 「우리가 열어 둔 것」과 「열려 있는 줄 몰랐던 것」이 한 칸이
#    된다. 계약 표면이 아니고(계약 v0.1 에 없다) 내보내는 것은 스키마지 데이터가 아니다.
#    🔴 아래 `audit_guard_coverage` 가 **가드가 닿지 않는 라우트 집합이 정확히 이것과 같은지**
#       부팅에서 확인한다. 계약 라우트가 하나라도 이 집합에 들어오면 그날 부팅이 멈춘다.
FRAMEWORK_UNGUARDED: Final[dict[tuple[str, str], str]] = {
    ("GET", "/openapi.json"): "FastAPI 스키마 — 계약 표면이 아니다(데이터 아님)",
    ("GET", "/docs"): "Swagger UI",
    ("GET", "/docs/oauth2-redirect"): "Swagger UI 부속",
    ("GET", "/redoc"): "ReDoc UI",
}

#: 가드 모드 — 측정기가 라우트별로 이 낱말을 표로 낸다.
MODE_GUARDED: Final = "guarded"
MODE_EXEMPT: Final = "exempt"
MODE_READ_ONLY: Final = "read-only"
MODE_FRAMEWORK: Final = "framework"

_WS_METHOD: Final = "WEBSOCKET"
_BODY_METHODS: Final = frozenset({"POST", "PUT", "PATCH"})


def _mode(method: str, path: str) -> str:
    key = (method, path)
    if key in GUARD_EXEMPT:
        return MODE_EXEMPT
    if key in READ_ONLY_EXCEPTIONS:
        return MODE_READ_ONLY
    if key in FRAMEWORK_UNGUARDED:
        return MODE_FRAMEWORK
    return MODE_GUARDED


def route_keys(app: FastAPI) -> list[tuple[str, str]]:
    """앱에 실재하는 (메서드, 경로 템플릿) 전부 — 측정기와 부팅 검사가 같은 것을 본다."""
    keys: list[tuple[str, str]] = []
    for route in app.routes:
        if isinstance(route, WebSocketRoute):
            keys.append((_WS_METHOD, route.path))
        elif isinstance(route, Route):
            for method in sorted(route.methods or ()):
                if method in {"HEAD", "OPTIONS"}:
                    continue          # 프레임워크가 자동으로 다는 것 — 계약 표면이 아니다
                keys.append((method, route.path))
    return keys


def _guard_reaches(app: FastAPI, key: tuple[str, str]) -> bool:
    """이 (메서드, 경로) 라우트의 의존 체인에 가드가 실제로 매달려 있는가."""
    method, path = key
    for route in app.routes:
        dependant = getattr(route, "dependant", None)
        if dependant is None or getattr(route, "path", None) != path:
            continue
        if isinstance(route, WebSocketRoute):
            if method != _WS_METHOD:
                continue
        elif method not in (getattr(route, "methods", None) or ()):
            continue
        return any(d.call is session_guard for d in dependant.dependencies)
    return False


def guard_table(app: FastAPI) -> list[tuple[str, str, str]]:
    """라우트별 `(메서드, 경로, 모드)` — AC 「라우트별 표로 실측」의 원천."""
    return [(m, p, _mode(m, p)) for m, p in route_keys(app)]


def audit_guard_coverage(app: FastAPI) -> None:
    """부팅 정합 — 예외 목록이 실재 라우트와 1:1인가.

    🔴 **빈 결과는 통과가 아니다.** 라우트를 0개 본 채로 「모순 없음」을 내면 이 검사는 늘
       초록인 검사가 된다 — 그런 검사는 없는 것과 같다.
    """
    keys = set(route_keys(app))
    if not keys:
        raise RuntimeError("세션 가드 정합 검사가 라우트를 하나도 보지 못했다 — 검사기 고장이다")

    # 🔴 **가드가 «닿는가»를 목록이 아니라 라우트에서 읽는다.** 「예외에 없으니 가드된다」는
    #    추론이고, 추론은 프레임워크가 바뀌면 조용히 틀린다 — 실제로 FastAPI 의 문서 라우트는
    #    APIRoute 가 아니라 의존 체인 밖에 있었고, 이 검사가 없었다면 표만 「guarded」라고
    #    적힌 채 열려 있었을 것이다(실측으로 걸린 자리).
    unreachable = {k for k in keys if not _guard_reaches(app, k)}
    unexpected = sorted(unreachable - set(FRAMEWORK_UNGUARDED))
    if unexpected:
        raise RuntimeError(f"세션 가드가 닿지 못하는 라우트가 있다(계약 표면일 수 있다): {unexpected}")
    vanished = sorted(set(FRAMEWORK_UNGUARDED) - unreachable)
    if vanished:
        raise RuntimeError(
            f"프레임워크 비가드 목록에 있는데 실제로는 가드되거나 사라진 라우트: {vanished}"
        )

    declared = set(GUARD_EXEMPT) | set(READ_ONLY_EXCEPTIONS) | set(FRAMEWORK_UNGUARDED)
    stale = sorted(declared - keys)
    if stale:
        # 오타·삭제된 라우트가 예외 목록에 남아 있다. 그 자체로는 구멍이 아니지만(그 이름의
        # 라우트가 없다), 다음에 같은 이름의 라우트가 생기면 «아무도 의도하지 않은 면제»가
        # 그날 살아난다. 지금 운다.
        raise RuntimeError(f"세션 가드 예외 목록이 실재 라우트와 어긋난다: {stale}")

    overlap = sorted(set(GUARD_EXEMPT) & set(READ_ONLY_EXCEPTIONS))
    if overlap:
        raise RuntimeError(f"면제와 읽기 예외에 같은 라우트가 둘 다 있다: {overlap}")

    guarded = [k for k in sorted(keys) if _mode(*k) == MODE_GUARDED]
    log.info(
        "세션 가드 — 전 라우트 %d 중 가드 %d · 면제 %d · 읽기 예외 %d",
        len(keys), len(guarded), len(GUARD_EXEMPT), len(READ_ONLY_EXCEPTIONS),
    )


# --- 요청에서 세션 꺼내기 -------------------------------------------------------------


def _store(conn: HTTPConnection) -> SessionStore:
    return conn.app.state.session_store


async def _body_session_id(conn: HTTPConnection) -> str | None:
    """본문의 `sessionId` — 계약이 동결한 표기(«쿠키 병행 + 본문»).

    🔴 본문을 여기서 읽어도 라우트의 파싱은 깨지지 않는다 — Starlette 이 `_body` 를 캐시하고
       뒤이은 파싱이 같은 캐시를 읽는다. 본문을 못 읽는 요청(형식 불명·파손)은 **여기서
       판정하지 않는다**: 그것은 라우트의 검증이 낼 422 이고, 가드가 먼저 다른 말을 하면
       호출자는 「세션 문제」로 오독한다.
    """
    if conn.scope["type"] != "http":
        return None
    if conn.scope.get("method") not in _BODY_METHODS:
        return None
    if "application/json" not in conn.headers.get("content-type", ""):
        return None
    if not isinstance(conn, Request):  # pragma: no cover — 프레임워크가 바뀌면 조용히 넘기지 않는다
        raise RuntimeError("http 요청인데 Request 가 아니다 — 본문 세션 축을 읽을 수 없다")

    raw = await conn.body()
    if not raw:
        return None
    try:
        payload: Any = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    value = payload.get("sessionId")
    return value if isinstance(value, str) else None


async def resolve_session_id(conn: HTTPConnection) -> str | None:
    """쿠키와 본문에서 세션 id 하나를 정한다.

    🔴 **둘 다 있고 다르면 422 다 — 조용한 우선순위를 두지 않는다**(계약 v0.1.6). 한쪽을
       말없이 이기게 하면, 화면은 A 세션을 보여 주면서 서버는 B 세션에 쓰는 상태가 생기고
       그 어긋남은 「내 초안이 사라졌다」로만 드러난다.

    🔴 **본문 단독은 세션을 «싣지» 못한다 — 운반은 쿠키다.** 계약 v0.1.6 의 「전달 = HttpOnly
       쿠키 병행 + 본문 sessionId(동결 본문 표기 유지)」가 두 갈래로 읽혔고(ⓐ 둘 다 운반 /
       ⓑ 운반은 쿠키·본문 표기는 동결 잔존), **오케 판정 append 로 ⓑ 가 확정됐다**
       (계약 v0.1.6 판정 append · develop `26353ef`): 인증 운반 = 쿠키 단독 · 본문 sessionId =
       잔존 표기(있으면 일치 의무 · 본문 단독 = 401).
       기각 사유도 성문에 있다 — ⓐ 는 「id 를 아는 것만으로 남의 세션을 «쓰게»」 해서
       HttpOnly 축과 소유권 은닉이 같이 무너진다.
       🔴 이 주석이 정본이 아니다. 갈림이 생기면 **계약 append 가 이긴다**(주법 §「갈림 시
          append 우선」) — 여기 적힌 것은 그 판정의 인용이다.
    """
    from .session_store import SESSION_COOKIE

    cookie_sid = conn.cookies.get(SESSION_COOKIE)
    body_sid = await _body_session_id(conn)

    if cookie_sid and body_sid and cookie_sid != body_sid:
        raise contract_error(
            422,
            "invalid_request",
            "쿠키와 본문의 sessionId 가 다르다 — 어느 쪽을 뜻하는지 서버가 고르지 않는다",
        )
    if body_sid and not cookie_sid:
        return None
    return cookie_sid


def _reject(conn: HTTPConnection, code: str, message: str, status: int) -> Exception:
    if conn.scope["type"] == "websocket":
        # 🔴 핸드셰이크 단계라 본문을 실을 수 없다. 코드가 사유의 전부다.
        return WebSocketException(code=WS_SESSION_REQUIRED, reason=code)
    return contract_error(status, code, message)


async def session_guard(conn: HTTPConnection) -> None:
    """전 라우트에 걸리는 기본 가드 — `create_app()` 이 앱 레벨 의존으로 단다.

    통과하면 `conn.state.session_id` 에 유효한 세션 id 가 남는다. 소유권 검사(`app/ownership.py`)
    가 그 값을 읽는다 — 라우트가 각자 다시 꺼내면 「어느 세션으로 판정했는가」가 라우트마다
    갈릴 수 있다.
    """
    route = conn.scope.get("route")
    path = getattr(route, "path", conn.scope.get("path", ""))
    method = conn.scope.get("method", _WS_METHOD)
    mode = _mode(method, path)

    conn.state.session_id = None

    if mode == MODE_EXEMPT:
        return

    sid = await resolve_session_id(conn)

    if mode == MODE_READ_ONLY:
        # 🔴 딥링크 축은 **세션 문제로 깨지지 않는다.** 낡은 쿠키를 들고 온 방문자가 근거
        #    링크를 열지 못하면, 이 예외를 둔 이유(§3:244)가 그대로 사라진다. 유효하면
        #    실어 주고, 아니면 없는 것으로 친다 — 이 두 라우트는 세션 자원을 만지지 않는다.
        if sid is not None and session_id.is_valid(sid) and _store(conn).exists(sid):
            conn.state.session_id = sid
        return

    if sid is None:
        raise _reject(conn, "session_required", "세션이 없다 — POST /api/sessions 로 발급받아라", 401)

    if not session_id.is_valid(sid):
        # 🔴 「형식이 아니다」와 「그런 세션이 없다」를 가른다. 형식 오류를 401 로 접으면
        #    호출자는 세션을 다시 발급받으며 같은 오타를 반복한다 — 그리고 이 리포에는 이미
        #    같은 사유 코드(`invalid_session_id`)를 쓰는 자리가 둘 있다(compare·조사 실행).
        raise _reject(
            conn, "invalid_session_id", "sessionId 형식이 아니다(영숫자·-·_ 8~64자)", 422
        )

    if not _store(conn).exists(sid):
        # 🔴 만료·부재·프로세스 재기동을 한 답으로 합친다(`session_store.get` 성문과 같은 축).
        raise _reject(conn, "session_required", "세션이 유효하지 않다 — 다시 발급받아라", 401)

    conn.state.session_id = sid
