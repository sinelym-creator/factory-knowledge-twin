"""세션 저장소 — 프로세스 안 · TTL 명시 (T3-1).

계약은 인증을 두지 않고 「세션 키가 격리 단위」라고만 말한다. 여기까지 오면 서버는 처음으로
**그 키를 자기가 발급하고, 자기가 아는 것만 유효하다고 말한다** — `app/session_id.py` 의
머리말이 「형식이 맞다는 것은 그 세션이 있다는 뜻이 아니다」라고 미뤄 둔 자리가 여기다.

🔴 **내구성을 주장하지 않는다.** 저장소는 프로세스 안이고, 재기동하면 전부 사라진다. 그것이
   결함이 아니라 이 PoC 가 고른 대가다(run 저장소와 같은 축 · `investigation/store.py`
   머리말). 사라진 세션은 «만료» 와 같은 답(401 `session_required`)을 받는다 — 화면은 다시
   입장하면 되고, 서버는 없는 것을 있다고 말하지 않는다.

🔴 **TTL 을 명시한다.** 상한 없는 세션은 프로세스 수명 내내 쌓이고, 그때의 「세션 격리」는
   측정된 적 없는 주장이 된다(§0.2). 값은 아래 상수 하나이며 셸 쿠키 수명과 같은 8시간이다 —
   두 곳이 갈리면 화면은 살아 있다고 그리는데 서버는 401 을 답한다.

🔴 **id 형식 규칙을 여기서 다시 적지 않는다.** `session_id.SESSION_ID_RE` 가 정본이고, 이
   저장소는 자기가 «발급한» 값이 그 규칙을 통과하는지 확인만 한다. 규칙이 바뀌었는데 발급기가
   따라오지 않으면 그 순간 여기서 운다 — 조사 실행·compare 가 서버 자신이 낸 키를 거절하는
   형태(V-7 「같은 규칙이 두 곳에 살면 한쪽만 자란다」)를 부팅 전에 막는다.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass
from typing import Callable

from . import session_id

log = logging.getLogger("fkt.sessions")

# 세션 수명 — 셸 쿠키 `maxAge`(apps/web-console/proxy.ts)와 같은 값이어야 한다.
SESSION_TTL_SEC: float = 8 * 60 * 60

# 쿠키 이름 — 🔴 **이 이름의 정본은 여기 한 곳이다.** 셸은 이 이름을 적지 않고 API 응답의
#    `Set-Cookie` 를 그대로 전달한다(오케 승인 08-30 · 「옮겨 적은 표」 계보 회피).
SESSION_COOKIE = "fkt_sid"

# 프로세스 안 세션 상한. run 저장소(MAX_RUNS)와 같은 이유로 둔다 — 상한 없는 dict 는
# 「오래 돌면 무슨 일이 나는가」를 아무도 모르는 상태로 남긴다.
MAX_SESSIONS = 2000

# 🔴 발급 엔트로피. `token_urlsafe(18)` = 24자 [A-Za-z0-9_-] 로 `SESSION_ID_RE`(8~64자) 안에
#    든다. 격리 «키»이지 인증 토큰이 아니지만, 짧으면 남의 세션 id 를 맞혀 볼 수 있고 그
#    순간 소유권 은닉(404)이 뜻을 잃는다.
_ID_BYTES = 18


@dataclass
class SessionRecord:
    """세션 하나 — 값이 아니라 «있음»을 재는 물건이다."""

    sessionId: str
    createdAt: float
    lastSeenAt: float


class SessionStore:
    """프로세스 내 세션 저장소. 앱 하나에 하나씩 두고 `app.state` 가 들고 다닌다."""

    def __init__(
        self,
        *,
        ttl_sec: float = SESSION_TTL_SEC,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        # 🔴 시계를 주입받는다. 만료를 시험하려고 8시간을 기다릴 수는 없고, `sleep` 으로
        #    흉내 내면 시험이 벽시계에 의존해 느리고 흔들린다(계측기를 측정에서 뺀다).
        self._ttl = ttl_sec
        self._clock = clock
        self._sessions: dict[str, SessionRecord] = {}

    # --- 발급 ---------------------------------------------------------------

    def create(self) -> SessionRecord:
        self._sweep()
        if len(self._sessions) >= MAX_SESSIONS:
            # 가장 오래 안 쓰인 것부터 버린다 — 상한에 닿았다고 발급을 거절하면 새 방문자가
            # 먼저 죽는다. 만료 스윕이 이미 돌았으므로 여기 남은 것은 «살아 있는» 세션이다.
            oldest = min(self._sessions.values(), key=lambda r: r.lastSeenAt)
            log.warning("세션 상한 %d — 가장 오래된 세션을 버린다", MAX_SESSIONS)
            self._sessions.pop(oldest.sessionId, None)

        now = self._clock()
        sid = secrets.token_urlsafe(_ID_BYTES)
        if not session_id.is_valid(sid):  # pragma: no cover — 규칙이 갈렸을 때만 참
            raise RuntimeError(
                "발급한 sessionId 가 session_id.SESSION_ID_RE 를 통과하지 못한다 — "
                "형식 규칙과 발급기가 갈렸다"
            )
        record = SessionRecord(sessionId=sid, createdAt=now, lastSeenAt=now)
        self._sessions[sid] = record
        return record

    # --- 조회 ---------------------------------------------------------------

    def get(self, sid: str) -> SessionRecord | None:
        """살아 있는 세션만 돌려준다.

        🔴 **만료와 부재를 여기서 합친다.** 둘을 가려 답하면 「그 id 는 있었다」가 새어 나가고,
           소유권 은닉(계약 v0.1.6 · 타 세션 404)이 세션 층에서 먼저 무너진다.
        """
        record = self._sessions.get(sid)
        if record is None:
            return None
        if self._expired(record):
            self._sessions.pop(sid, None)
            return None
        record.lastSeenAt = self._clock()
        return record

    def exists(self, sid: str) -> bool:
        return self.get(sid) is not None

    # --- 폐기 ---------------------------------------------------------------

    def drop(self, sid: str) -> bool:
        return self._sessions.pop(sid, None) is not None

    def _expired(self, record: SessionRecord) -> bool:
        return (self._clock() - record.lastSeenAt) >= self._ttl

    def _sweep(self) -> int:
        doomed = [r.sessionId for r in self._sessions.values() if self._expired(r)]
        for sid in doomed:
            self._sessions.pop(sid, None)
        return len(doomed)

    # --- 정리 ---------------------------------------------------------------

    async def sweep_forever(self, interval_sec: float) -> None:
        """만료 세션을 «주기적으로» 버린다 (T4-2b ⓔ).

        🔴 **`_sweep()` 을 대체하지 않는다 — 더한다.** 지금까지 정리는 lazy 였다(발급·계수
           때만 돈다). 그 형태는 「아무도 안 오는 동안」 정확히 아무 일도 하지 않으므로,
           방문이 끊긴 뒤 만료된 세션은 다음 방문자가 올 때까지 메모리에 남는다. 공개 Tunnel
           뒤에서 그 「다음 방문자」는 며칠 뒤일 수도 있다.

        🔴 **만료 «판정»은 건드리지 않는다.** 여기서 하는 일은 이미 만료된 것을 버리는 청소뿐이고,
           `get()` 은 스윕이 돌기 전에도 만료를 만료로 답한다(그래서 이 태스크가 멈춰도
           만료 세션이 살아나지 않는다). 소유권 은닉(만료·부재·타인 = 같은 404)도 그대로다 —
           이 절은 그 판정을 지나지 않는다.

        🔴 **버린 것이 있을 때만 로그를 남긴다.** 5분마다 「0건 정리」를 적으면 그 줄은 곧
           아무도 안 읽는 배경 소음이 되고, 정작 무언가 버려진 날의 한 줄이 그 안에 묻힌다.
        """
        if interval_sec <= 0:                       # pragma: no cover — 끄기 경로
            return
        while True:
            await asyncio.sleep(interval_sec)
            dropped = self._sweep()
            if dropped:
                log.info("만료 세션 %d건 정리 — 남은 세션 %d", dropped, len(self._sessions))

    # --- 관측 ---------------------------------------------------------------

    def count(self) -> int:
        """살아 있는 세션 수 — 스윕 뒤의 값이다(만료분을 세지 않는다)."""
        self._sweep()
        return len(self._sessions)
