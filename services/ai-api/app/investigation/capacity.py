"""Live 동시 실행 상한과 대기열 (T4-2b ⓐ · 계약 v0.1.9).

이 노트북 한 대가 «불특정 방문자»의 조사 요청을 받는다. 상한이 없으면 세 번째 요청이
앞의 둘을 함께 느리게 만들고, 열 번째 요청은 셋 다 죽인다 — 그 형태는 「느려졌다」가 아니라
「아무도 결과를 못 본다」다.

🔴 **거절보다 «기다림»을 먼저 준다.** 상한이 1 이라고 두 번째 요청을 바로 503 으로 끊으면
   방문자는 아무 잘못 없이 문 앞에서 돌아선다. 그래서 짧은 대기열을 둔다 — 대기열도 차면
   그때 거절하고, 거절에는 «다음 수»(Replay)를 함께 적는다.

🔴 **큐에 들어간 것은 «오류가 아니다»**(계약 문면). 응답은 200 그대로이고, 자기가 몇 번째인지는
   `run.queued` 이벤트가 말한다. 오류로 답하면 화면은 「실패」를 그리게 되는데, 그 run 은
   곧 실제로 돈다.

🔴 **replay 는 이 계수기를 지나지 않는다.** 재생은 fixture 를 읽어 흘릴 뿐 DB·그래프에 닿지
   않는다(`investigation/replay.py`) — 그것이 fallback 축의 값어치이고, 여기서 replay 까지
   줄 세우면 「live 가 막혔을 때 쓰는 길」이 함께 막힌다.

🔴 **`estimatedWaitSec` 를 지어내지 않는다.** 최근에 끝난 run 이 하나도 없으면 `null` 이다 —
   그럴듯한 상수를 적으면 화면은 그 숫자를 «측정된 값»으로 그린다(§0.2 측정-주장 경계).
"""

from __future__ import annotations

import asyncio
import logging
import math
import statistics
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque

log = logging.getLogger("fkt.investigation.capacity")

# 대기 예상에 쓰는 «최근 완료» 표본 수. 짧게 잡는다 — 오래된 run 의 소요는 지금의 부하를
# 말해 주지 않는다(모델 warm-up 전후만 해도 자릿수가 다르다).
DURATION_SAMPLES = 8

# 🔴 순위 통지 콜백: `(position, estimatedWaitSec)`. 동기 함수다 — 이벤트 발행(`Emitter`)이
#    동기이고, 여기서 await 를 끼우면 계수기가 발행 순서를 정하게 된다.
PositionSink = Callable[[int, "int | None"], None]


@dataclass
class Ticket:
    """한 run 의 자리 — 「지금 도는 중」이거나 「몇 번째로 기다리는 중」이다."""

    runId: str | None = None
    granted: bool = False
    released: bool = False
    started_at: float | None = None
    last_position: int = 0
    notify: PositionSink | None = None
    _turn: asyncio.Event = field(default_factory=asyncio.Event)


class LiveCapacity:
    """동시 실행 슬롯과 bounded queue — 「지금 몇 개 도는가」의 **유일한 계수기**.

    라우터가 각자 세면 두 라우트가 서로 다른 답을 갖게 되고, 상한은 그 순간 상한이 아니게
    된다(그래서 `app.state` 에 하나만 둔다 · `main.py`).
    """

    def __init__(
        self,
        *,
        concurrency: int,
        queue_max: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        # 🔴 0 이하를 받지 않는다. `concurrency=0` 은 「Live 를 끈다」처럼 보이지만 실제로는
        #    «영원히 대기»가 되어, 끄는 방법으로 쓰면 방문자가 끝나지 않는 진행을 본다.
        self._concurrency = max(1, concurrency)
        self._queue_max = max(0, queue_max)
        self._clock = clock
        self._active = 0
        self._waiting: list[Ticket] = []
        self._durations: Deque[float] = deque(maxlen=DURATION_SAMPLES)

    # --- 입장 판정 -----------------------------------------------------------

    def admit(self) -> Ticket | None:
        """자리를 준다 — 즉시 실행(`granted=True`) · 대기(`granted=False`) · 거절(`None`).

        🔴 **동기 함수다.** 요청 처리 흐름에서 «지금» 판정이 나야 503 을 즉시 답할 수 있다
           (계약: 「둘 다 찼을 때 즉시 거절」). await 를 끼우면 그 사이에 다른 요청이 끼어들어
           같은 마지막 슬롯을 둘이 받는다.
        """
        if self._active < self._concurrency:
            self._active += 1
            ticket = Ticket(granted=True, started_at=self._clock())
            return ticket
        if len(self._waiting) < self._queue_max:
            ticket = Ticket(granted=False)
            self._waiting.append(ticket)
            ticket.last_position = len(self._waiting)
            return ticket
        return None

    # --- 대기 ---------------------------------------------------------------

    async def wait_turn(self, ticket: Ticket, *, notify: PositionSink, timeout_sec: float) -> bool:
        """자기 차례를 기다린다. `True` = 슬롯 획득 · `False` = 대기 상한 초과.

        🔴 첫 순위는 «기다리기 전»에 알린다. 알린 뒤에 기다려야 화면이 「몇 번째인지 모른 채
           도는 원」을 그리지 않는다.
        """
        if ticket.granted:
            return True

        ticket.notify = notify
        notify(ticket.last_position, self.estimate_wait(ticket.last_position))

        try:
            await asyncio.wait_for(ticket._turn.wait(), timeout_sec)  # noqa: SLF001 — 자기 자료
        except asyncio.TimeoutError:
            # 🔴 대기 상한을 넘겼다. 자리에서 «빼고» False 를 돌려준다 — 빼지 않으면 죽은
            #    티켓이 뒤에 선 사람들의 순위를 영원히 한 칸 밀어 놓는다.
            if ticket in self._waiting:
                self._waiting.remove(ticket)
                self._renumber()
            return False
        ticket.started_at = self._clock()
        return True

    # --- 반환 ---------------------------------------------------------------

    def release(self, ticket: Ticket) -> None:
        """슬롯을 돌려주고 다음 사람을 들인다.

        🔴 **두 번 불려도 한 번만 센다.** 정상 종료·timeout·취소가 겹치는 경로가 있고, 거기서
           `_active` 가 음수로 내려가면 상한은 조용히 사라진다 — 그때 이 계수기는 있으나
           마나가 되고, 아무도 그 사실을 모른다.
        """
        if ticket.released:
            return
        ticket.released = True

        if ticket in self._waiting:                      # 아직 기다리다 끝난 경우
            self._waiting.remove(ticket)
            self._renumber()
            return

        if not ticket.granted:
            return

        if ticket.started_at is not None:
            self._durations.append(max(self._clock() - ticket.started_at, 0.0))
        self._active = max(0, self._active - 1)
        self._promote()

    def _promote(self) -> None:
        """빈 슬롯만큼 대기열 앞에서 들이고, 남은 사람에게 «바뀐 순위»를 알린다."""
        while self._active < self._concurrency and self._waiting:
            nxt = self._waiting.pop(0)
            self._active += 1
            nxt.granted = True
            nxt._turn.set()                              # noqa: SLF001 — 자기 자료
        self._renumber()

    def _renumber(self) -> None:
        """순위가 «바뀐 사람에게만» 다시 알린다(계약: 같은 type 재발행 · seq 증가).

        🔴 안 바뀐 사람에게도 매번 알리면 같은 사실이 이벤트 로그를 채우고, 되감기에서
           「무슨 일이 있었나」가 잡음에 묻힌다.
        """
        for index, ticket in enumerate(self._waiting, start=1):
            if ticket.last_position == index:
                continue
            ticket.last_position = index
            if ticket.notify is not None:
                ticket.notify(index, self.estimate_wait(index))

    # --- 관측 ---------------------------------------------------------------

    def estimate_wait(self, position: int) -> int | None:
        """`position` 번째가 기다릴 «초» — 표본이 없으면 `None`.

        🔴 근거는 «최근 완료 run 의 소요 중앙값»뿐이다. 평균이 아니라 중앙값인 이유: 한 번의
           이상치(모델 첫 적재·의존 재연결)가 이후 모든 안내를 부풀린다.
        """
        if not self._durations:
            return None
        median = statistics.median(self._durations)
        rounds = math.ceil(position / self._concurrency)
        return max(1, int(round(rounds * median)))

    @property
    def active(self) -> int:
        return self._active

    @property
    def waiting(self) -> int:
        return len(self._waiting)

    def snapshot(self) -> dict[str, int]:
        """로그·실측용 — 「그때 몇이 돌고 몇이 기다렸나」를 한 줄로 남기기 위한 것."""
        return {"active": self._active, "waiting": len(self._waiting)}
