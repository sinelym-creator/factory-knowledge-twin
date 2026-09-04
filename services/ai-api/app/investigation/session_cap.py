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

    def peek(self, session_id: str, now: float | None = None) -> dict[str, object]:
        """지금 상태를 **읽기만** 한다 — 기록하지 않는다(계수 0).

        🔴 `admit` 과 «다른 함수»여야 한다. 화면이 「몇 회 남았나」를 물을 때마다 한 번씩
           세면, 보는 행위가 쓰는 행위가 되어 방문자는 아무것도 안 하고 상한에 닿는다.
        🔴 그래서 여기서는 `_prune` 도 부르지 않는다 — 만료된 창을 «지우는» 것은 상태 변경이고,
           읽기 경로가 상태를 바꾸면 두 호출의 결과가 순서에 따라 달라진다. 만료분은 아래처럼
           «세지 않기»만 한다(다음 `admit` 이 실제로 지운다).
        🔴 `limit <= 0` = 상한 없음(클래스 머리말) → `remaining`·`nextFreeInSec` 은 **None**.
           0 을 넣으면 화면이 「0회 남음」으로 읽어 상한 없음이 상한 도달로 뒤집힌다.
        """
        now = time.monotonic() if now is None else now
        if self.limit <= 0:
            return {"limit": self.limit, "used": 0, "remaining": None, "next_free_sec": None}

        hits = self._hits.get(session_id)
        cutoff = now - self.window_sec
        live = [t for t in hits if t > cutoff] if hits else []
        used = len(live)
        remaining = max(0, self.limit - used)
        # 다음 한 자리가 비는 시각 = 가장 오래된 기록이 창 밖으로 나갈 때. 남은 자리가 있으면
        # 기다릴 필요가 없으므로 None 이다 — 0 을 주면 「0초 뒤 회복」이라는 없는 말이 된다.
        next_free = None
        if remaining == 0 and live:
            next_free = max(1, math.ceil(live[0] + self.window_sec - now))
        return {"limit": self.limit, "used": used, "remaining": remaining, "next_free_sec": next_free}

    def _prune(self, now: float) -> None:
        """빈 창 정리 + LRU 상한. 접촉 시에만 돈다(주기 태스크 0 · 세션 저장소와 같은 방식)."""
        cutoff = now - self.window_sec
        stale = [sid for sid, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for sid in stale:
            del self._hits[sid]
        while len(self._hits) > self.max_sessions:
            self._hits.popitem(last=False)
