"""O-27 — run 등록이 «어느 세션»으로 서는가.

🔴 재는 것은 하나다: **등록 세션의 출처가 가드가 확정한 값인가.** 라우트가 본문 `sessionId`
   를 다시 꺼내면 등록 세션과 소유권 판정 세션(`app/ownership.py:current_session`)이 갈릴 수
   있고, 그 어긋남은 「방금 만든 run 이 404」로만 드러난다(D-80 의 형태).

🔴 **오늘 그 갈림이 HTTP 로 도달 가능한가**를 먼저 센다 — 아래 두 건이 그 답이다.
   가드가 「쿠키≠본문 = 422」·「본문 단독 = None(→401)」로 끊으므로, 라우트에 닿는 순간
   두 값은 **항상 같다**. 즉 이 수리는 «지금의 버그»를 고치는 것이 아니라 출처를 하나로
   묶어 두는 것이다. 그 사실을 숨기지 않고 그물로 박아 둔다 — 가드 규칙이 완화되는 날
   세 번째 테스트가 빨강으로 알린다.

🔴 세 번째 테스트는 **라우트 함수를 직접** 부른다(HTTP 로는 만들 수 없는 형상이라). 그래서
   가드 세션과 본문 세션을 «다르게» 세울 수 있고, 등록이 어느 쪽을 쓰는지가 그 한 축으로
   갈린다. 앞판(본문을 다시 꺼내던 코드)에서는 이 테스트가 실패한다.

실행: `pytest tests_unit/test_run_registration_session.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import Response
from starlette.exceptions import HTTPException  # 🔴 `contract_error` 가 내는 것은 starlette 쪽이다
from starlette.requests import Request

from app import session_guard
from app.session_store import SESSION_COOKIE

COOKIE_SESSION = "cookie-session-1"
BODY_SESSION = "body-session-2"
GUARD_SESSION = "guard-session-3"


def _json_request(body: dict[str, object], cookie: str | None) -> Request:
    """본문·쿠키를 실은 «진짜» Request — 가드는 프레임워크 타입을 요구한다."""
    headers = [(b"content-type", b"application/json")]
    if cookie is not None:
        headers.append((b"cookie", f"{SESSION_COOKIE}={cookie}".encode()))
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/scenarios/GS-01/runs",
        "query_string": b"",
        "headers": headers,
    }
    payload = json.dumps(body).encode()

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": payload, "more_body": False}

    return Request(scope, receive)


def test_guard_rejects_a_split_session() -> None:
    """쿠키와 본문이 다르면 가드가 422 로 끊는다 — 라우트는 갈린 세션을 «보지 못한다»."""
    request = _json_request({"sessionId": BODY_SESSION, "mode": "replay"}, cookie=COOKIE_SESSION)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(session_guard.resolve_session_id(request))
    assert caught.value.status_code == 422
    assert caught.value.detail["code"] == "invalid_request"


def test_guard_does_not_carry_a_body_only_session() -> None:
    """본문 단독은 세션을 «싣지» 못한다(계약 v0.1.6 판정) — None 이 나가고 가드가 401 한다."""
    request = _json_request({"sessionId": BODY_SESSION, "mode": "replay"}, cookie=None)
    assert asyncio.run(session_guard.resolve_session_id(request)) is None


def _run_replay(monkeypatch: pytest.MonkeyPatch, *, guard: str | None, body: str) -> str | None:
    """replay 갈래로 `start_run` 을 돌리고 «등록에 쓰인 세션»을 돌려준다."""
    # 🔴 라우터 import 체인은 `langgraph` 를 요구하고, CI 설치 목록(pytest·pydantic·fastapi·
    #    pydantic-settings)에는 그것이 없다. 그래서 이 두 건만 건너뛴다 — 위 가드 두 건은
    #    그대로 돌고, 건너뛴다는 사실은 pytest 요약에 수로 남는다(조용한 초록 방지).
    pytest.importorskip("langgraph", reason="라우터 import 체인이 요구 — CI 설치 목록에 없다")
    from app.routers import investigations

    seen: dict[str, str | None] = {}

    def fake_start(store: object, *, session_id: str | None, anchor: object, events: object) -> object:
        seen["session_id"] = session_id
        return SimpleNamespace(runId="RUN-1", incidentId="INC-1", mode="replay")

    monkeypatch.setattr(investigations.replay, "load", lambda *a, **k: [])
    monkeypatch.setattr(investigations.replay, "start", fake_start)
    monkeypatch.setattr(investigations.binding, "anchor_for", lambda scenario_id: SimpleNamespace(id=scenario_id))
    monkeypatch.setattr(investigations, "get_settings", lambda: SimpleNamespace(replay_fixture_dir="."))

    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(run_store=object())),
        state=SimpleNamespace(session_id=guard),
    )
    created = asyncio.run(
        investigations.start_run(
            "GS-01",
            investigations.RunRequest(sessionId=body, mode="replay"),
            request,  # type: ignore[arg-type]
            Response(),
        )
    )
    assert created.runId == "RUN-1"  # 등록이 실제로 일어났다(자극 도달)
    return seen["session_id"]


def test_registration_uses_the_guard_session_not_the_body(monkeypatch: pytest.MonkeyPatch) -> None:
    """두 값이 다르면 «가드가 확정한 쪽»으로 등록된다.

    🔴 이 형상은 HTTP 로 만들 수 없다(위 두 테스트가 그 이유다) — 그래서 라우트를 직접 부른다.
       손잡이는 하나다: 가드 세션과 본문 세션만 다르고 나머지는 같다.
    """
    assert _run_replay(monkeypatch, guard=GUARD_SESSION, body=BODY_SESSION) == GUARD_SESSION


def test_registration_is_unchanged_when_both_agree(monkeypatch: pytest.MonkeyPatch) -> None:
    """오늘의 «도달 가능한» 형상 — 둘이 같으면 값도 거동도 그대로다(회귀 대조군)."""
    assert _run_replay(monkeypatch, guard=COOKIE_SESSION, body=COOKIE_SESSION) == COOKIE_SESSION
