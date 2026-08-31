"""보호장치 미들웨어 — 요청 크기 상한(413)과 rate limit(429) (T4-2b ⓒⓓ · 계약 v0.1.9).

이 서비스는 인증 없는 공개 Tunnel 뒤에 선다(baseline §16.3 · 결정 ③). 그래서 「누가 얼마나
부를 수 있는가」를 **코드가** 정해야 한다 — 앞에 서 줄 WAF 도, 로그인도 없다.

🔴 **순수 ASGI 미들웨어다.** `BaseHTTPMiddleware` 를 쓰지 않는 이유: 그것은 요청 본문을
   자기가 버퍼링하므로, 「본문이 상한을 넘는가」를 재려고 만든 장치가 상한을 넘는 본문을
   먼저 통째로 메모리에 올린다. 그 형태는 보호가 아니라 증폭이다.

🔴 **오류 형상은 `errors.contract_json_response` 한 곳만 조립한다.** 미들웨어는 앱의 예외
   핸들러 «밖»이라 raise 로는 계약 형상에 닿지 못한다(그 함수 머리말에 사유 성문).

🔴 **여기서 세는 것은 «요청 수»뿐이다.** 사용자·권한 같은 개념을 들이지 않는다 — 이 PoC 에
   그런 축은 없고, 없는 축으로 판정하면 그 판정은 측정된 적 없는 주장이 된다(§0.2).
"""

from __future__ import annotations

import logging
import math
import time
from collections import OrderedDict, deque
from typing import Any, Awaitable, Callable, Deque, Iterable

from .errors import PayloadTooLarge, contract_json_response

log = logging.getLogger("fkt.protection")

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]

# rate limit 창 — 계약은 「초과 = 즉시 429」만 정하고 창은 정하지 않는다. 60초 고정으로 둔다:
# env 로 빼면 「분당 N」이라는 말이 형상마다 다른 뜻이 되고, Retry-After 계산도 함께 흔들린다.
WINDOW_SEC = 60.0

# 축별 키 상한. 🔴 공개 Sandbox 라 «키»는 밖에서 무한히 만들어질 수 있다(IP 스푸핑·쿠키 위조).
#    상한이 없으면 rate limiter 자신이 메모리 고갈 경로가 된다 — 막으려던 것을 자기가 한다.
MAX_KEYS = 4096

# 🔴 제외 «4종»(계약 v0.1.9): 상태를 묻는 두 경로 · preflight · WS 핸드셰이크.
#    앞의 둘은 「막혔는지 물어보는 문」이라 여기서 막으면 화면이 원인조차 알 수 없고,
#    WS 는 run 생성이 이미 제한되므로 재연결(§17.2)을 429 로 끊지 않는다.
EXEMPT_PATHS = frozenset({"/api/health", "/api/live/status"})
WS_PREFIX = "/api/ws/"

# 익명 세션 쿠키 이름 — 정본은 `session_store.SESSION_COOKIE` 다(옮겨 적지 않는다).
from .session_store import SESSION_COOKIE  # noqa: E402  — 순환 없음 · 정본 인용


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", ()):
        if key == name:
            return value.decode("latin-1")
    return None


def _cookie(scope: Scope, name: str) -> str | None:
    raw = _header(scope, b"cookie")
    if not raw:
        return None
    for part in raw.split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value or None
    return None


def _client_ip(scope: Scope, *, trust_forwarded_for: bool) -> str:
    """이 요청의 «IP» — 기본은 소켓 주소다.

    🔴 `X-Forwarded-For` 는 **켤 때만** 믿는다. 기본으로 믿으면 헤더 한 줄로 IP 축이
       우회되고, 그 순간 이 축은 있으나 마나가 된다. 켜지 않으면 프록시 뒤 방문자가 전원
       한 IP 로 뭉친다는 사실은 runbook(T5-4)이 성문한다 — 여기서 조용히 절충하지 않는다.
    """
    if trust_forwarded_for:
        xff = _header(scope, b"x-forwarded-for")
        if xff:
            first = xff.split(",")[0].strip()
            if first:
                return first
    client = scope.get("client")
    return client[0] if client else "unknown"


class _Window:
    """키 하나의 슬라이딩 창 — 요청 시각만 담는다."""

    __slots__ = ("hits",)

    def __init__(self) -> None:
        self.hits: Deque[float] = deque()


class _Axis:
    """rate limit 축 하나(IP 또는 세션). 축을 «각각» 세는 것이 계약 문면이다."""

    def __init__(self, name: str, limit: int) -> None:
        self.name = name
        self.limit = limit
        self._keys: "OrderedDict[str, _Window]" = OrderedDict()

    def check(self, key: str, now: float) -> float | None:
        """한 번 세고, 넘었으면 «몇 초 뒤에 다시 되는가»를 돌려준다(안 넘었으면 None).

        🔴 되는 시각을 **계산해서** 돌려준다 — 고정 상수를 적으면 그 숫자는 사실이 아니라
           위로가 된다. 창의 가장 오래된 요청이 창을 벗어나는 시각이 정확한 답이다.
        """
        window = self._keys.get(key)
        if window is None:
            if len(self._keys) >= MAX_KEYS:
                # 가장 오래 안 쓰인 키부터 버린다. 버려진 키는 「창이 비었다」가 되는데,
                # 그것은 상한을 «넓히는» 방향이라 조용히 틀리지 않는다(넘친 쪽이 손해 보지
                # 않게 하는 대신, 이 장치가 메모리로 죽지 않는다).
                self._keys.popitem(last=False)
            window = _Window()
            self._keys[key] = window
        else:
            self._keys.move_to_end(key)

        cutoff = now - WINDOW_SEC
        while window.hits and window.hits[0] <= cutoff:
            window.hits.popleft()

        if len(window.hits) >= self.limit:
            retry_after = window.hits[0] + WINDOW_SEC - now
            return max(retry_after, 0.0)

        window.hits.append(now)
        return None


class RateLimitMiddleware:
    """축 2개(IP · 익명 세션)를 «각각» 세고, 넘으면 즉시 429 + `Retry-After`."""

    def __init__(
        self,
        app: Any,
        *,
        ip_per_min: int,
        session_per_min: int,
        trust_forwarded_for: bool,
        floor_retry_after_sec: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self._ip = _Axis("ip", ip_per_min)
        self._session = _Axis("session", session_per_min)
        self._trust_xff = trust_forwarded_for
        self._floor = floor_retry_after_sec
        self._clock = clock

    def _exempt(self, scope: Scope) -> bool:
        if scope["type"] != "http":
            return True                                  # WS 핸드셰이크 = 제외(계약 4종 중 하나)
        path = scope.get("path", "")
        if path.startswith(WS_PREFIX):
            return True
        if scope.get("method") == "OPTIONS":             # preflight
            return True
        return path in EXEMPT_PATHS

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._exempt(scope):
            await self.app(scope, receive, send)
            return

        now = self._clock()
        # 🔴 두 축을 «각각» 본다. 하나로 합치면 「IP 는 여유가 있는데 세션이 넘쳤다」와
        #    그 반대가 같은 사건이 되고, 어느 쪽 상한이 물렸는지 로그에서도 사라진다.
        checks: Iterable[tuple[_Axis, str]] = ()
        sid = _cookie(scope, SESSION_COOKIE)
        ip_key = _client_ip(scope, trust_forwarded_for=self._trust_xff)
        checks = ((self._ip, ip_key),) if sid is None else (
            (self._ip, ip_key),
            (self._session, sid),
        )

        for axis, key in checks:
            wait = axis.check(key, now)
            if wait is not None:
                retry_after = max(self._floor, int(math.ceil(wait)) or 1)
                log.info("rate limit — 축 %s 가 상한 %d 를 넘었다", axis.name, axis.limit)
                response = contract_json_response(
                    429,
                    "rate_limited",
                    "요청이 너무 잦다 — 잠시 후 다시 시도하라",
                    headers={"Retry-After": str(retry_after)},
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)


class BodyLimitMiddleware:
    """요청 본문 바이트 상한 — `Content-Length` 선검사 **와** 스트림 실측 둘 다(계약 v0.1.9).

    🔴 **둘 다 하는 이유.** `Content-Length` 는 «보낸 쪽이 적은 숫자»라 그것만 믿으면 헤더를
       빼거나(chunked) 거짓으로 적는 요청이 그대로 지나간다. 반대로 스트림만 재면 상한을 넘는
       요청도 «다 받아 본 뒤에» 거절하게 되어, 막으려던 대역폭을 이미 쓴 뒤다.

    🔴 두 자리의 «응답 형상»은 다른 길로 나간다: 선검사는 앱 밖이라 계약 JSON 을 직접 내고,
       스트림 실측은 본문을 읽는 라우트 «안»에서 `PayloadTooLarge` 를 던져 앱의 예외 핸들러가
       바꾼다. 형상 조립은 `errors` 의 한 함수/한 예외가 하므로 두 길의 결과는 같다.
    """

    def __init__(self, app: Any, *, max_bytes: int) -> None:
        self.app = app
        self._max = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = _header(scope, b"content-length")
        if declared is not None:
            try:
                if int(declared) > self._max:
                    response = contract_json_response(
                        413,
                        "payload_too_large",
                        f"요청 본문이 상한({self._max} 바이트)을 넘었다",
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                # 숫자가 아니면 «선언이 없는 것»과 같이 취급하고 스트림 실측에 맡긴다 —
                # 여기서 400 을 내면 보호장치가 형식 검증을 겸하게 되고, 그 판정은 계약에 없다.
                pass

        seen = 0
        limit = self._max

        async def counted() -> dict[str, Any]:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    # 🔴 라우트가 본문을 읽는 «그 자리»에서 던진다 — 앱 안이므로 계약 형상으로
                    #    바뀌어 나간다. 여기서 조용히 잘라 주면 라우트는 «잘린 본문»을 정상
                    #    입력으로 읽고, 그 결과는 오류가 아니라 «틀린 성공»이 된다.
                    raise PayloadTooLarge(limit)
            return message

        await self.app(scope, counted, send)
