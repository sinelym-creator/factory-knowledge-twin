"""세션 단위 조사 실행 상한 — 계약 v0.1.12 `429 session_run_cap_exceeded`.

🔴 **`rate_limited`(분당 · IP·세션 축)와 «별개 계수 · 별개 code»다.** 두 상한은 다른 것을
   막는다: 분당 rate limit 은 «폭주»를, 이것은 «구독 소모»를 막는다. 한 code 로 뭉치면 화면이
   「잠시 후 다시」와 「이 시간은 재생으로 계속」을 가르지 못하고, 방문자는 60초 뒤에 다시
   눌러 또 막힌다.

🔴 **live 축만 센다.** replay 는 녹화본 재생이라 구독을 쓰지 않는다 — 그것까지 막으면
   거절 문면(「녹화 재생으로 계속」)이 스스로 거짓말이 된다.

🔴 **창은 슬라이딩이다.** 고정 시간창(매시 정각 리셋)이면 경계에서 2N 회가 지나간다.
"""

from __future__ import annotations

import math
import time
from collections import OrderedDict, deque


class SessionRunCap:
    """세션별 실행 시각을 슬라이딩 창으로 센다. 프로세스 안 · 재기동 시 리셋(로컬 PoC 형상).

    🔴 `limit <= 0` 은 «상한 없음»이다 — 「0 이면 아무도 못 돈다」로 두면 운영자가 끄려고
       0 을 준 순간 Live 가 통째로 닫힌다(`run_timeout_sec` 의 같은 자리 선례).
    """

    def __init__(self, limit: int, window_sec: float, max_sessions: int = 4096) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self.max_sessions = max_sessions
        # LRU — 세션 수가 무한히 자라지 않게 오래된 것부터 버린다. 버려진 세션은 상한이
        # 리셋되지만, 그것은 8h TTL 세션 저장소와 같은 성질의 «프로세스 안» 한계다.
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    def admit(self, session_id: str, now: float | None = None) -> int | None:
        """상한 안이면 이번 실행을 기록하고 `None`. 넘으면 `Retry-After`(정수 초)를 돌려준다.

        🔴 **판정과 기록이 한 호출이다.** 「물어보고 나중에 센다」로 나누면 그 사이에 들어온
           요청이 같은 마지막 자리를 함께 받는다(`capacity.admit` 과 같은 규율).
        """
        if self.limit <= 0:
            return None
        now = time.monotonic() if now is None else now
        hits = self._hits.get(session_id)
        if hits is None:
            hits = deque()
            self._hits[session_id] = hits
        self._hits.move_to_end(session_id)

        cutoff = now - self.window_sec
        while hits and hits[0] <= cutoff:
            hits.popleft()

        if len(hits) >= self.limit:
            # 창 잔여 = 가장 오래된 기록이 창 밖으로 나갈 때까지. 올림 + 최소 1 —
            # `Retry-After: 0` 은 「지금 다시 두드리라」가 되어 거절의 뜻을 지운다.
            remaining = hits[0] + self.window_sec - now
            return max(1, math.ceil(remaining))

        hits.append(now)
        self._prune(now)
        return None

    def _prune(self, now: float) -> None:
        """빈 창 정리 + LRU 상한. 접촉 시에만 돈다(주기 태스크 0 · 세션 저장소와 같은 방식)."""
        cutoff = now - self.window_sec
        stale = [sid for sid, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for sid in stale:
            del self._hits[sid]
        while len(self._hits) > self.max_sessions:
            self._hits.popitem(last=False)
