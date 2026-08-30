"""run·이벤트·WO 초안 저장소 — **프로세스 내 · 세션 스코프 · SSOT 쓰기 0** (오케 판정 J-3).

무엇이 «있는가»: run 레코드, 그 run 이 낸 이벤트 로그(정본), WS 구독자 fan-out, 세션 리셋.

무엇이 «없는가», 그리고 왜: 영속이 없다. run 은 **공장의 사실이 아니라 콘솔의 상태**다 —
SSOT(Postgres)에 쓰면 seed 된 synthetic 공장에 콘솔 흔적이 섞이고 seed 멱등이 흐려진다
(T1-2 계보). 계약의 `POST /sessions/{sid}/reset` 「해당 세션 상태만 초기화」와도 이 형태가
1:1로 맞는다.

🔴 **정직한 대가**(감추지 않는다): 프로세스가 내려가면 run 이 사라지고, 재기동 후
   `GET /runs/{id}/events` 는 404 다. 내구 축은 replay fixture(T2-4)가 담당한다.

🔴 **상한을 둔다**: 인증 없는 공개 Sandbox 라 run 생성은 밖에서 무한히 부를 수 있다.
   상한이 없으면 메모리가 조용히 자라다 프로세스가 죽는다 — 죽는 것보다 «오래된 완료 run 을
   버렸다»고 말하는 편이 낫다. 진행 중인 run 은 버리지 않는다(버리면 실행 중인 조사가
   주인을 잃는다).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

log = logging.getLogger("fkt.investigation.store")

RunStatus = Literal["running", "completed", "stopped", "failed"]

# 프로세스 전체 run 상한. 넘으면 «완료된» 것부터 오래된 순으로 버린다.
MAX_RUNS = 200
# 구독자 큐 상한. 느린 소비자 하나가 발행을 막지 못하게 한다 — 넘치면 그 구독만 끊는다.
SUBSCRIBER_QUEUE_MAX = 512


@dataclass
class RunRecord:
    """run 하나의 전부 — 이벤트 로그가 이 run 의 정본이다."""

    runId: str
    sessionId: str
    scenarioId: str
    incidentId: str
    mode: Literal["live", "replay"]
    status: RunStatus = "running"
    events: list[dict[str, Any]] = field(default_factory=list)
    candidates: list[dict[str, Any]] = field(default_factory=list)
    workOrderDraftId: str | None = None
    workOrderDraft: dict[str, Any] | None = None
    # graph 단계가 밟은 경로 — `GET /graph/paths?byRun={runId}` 의 유일한 원천(Q-18 해제분).
    graphPaths: list[dict[str, Any]] = field(default_factory=list)
    stop_requested: bool = False
    task: asyncio.Task[Any] | None = None
    _subscribers: set[asyncio.Queue[dict[str, Any] | None]] = field(default_factory=set)

    # --- 이벤트 -------------------------------------------------------------

    def append(self, event: dict[str, Any]) -> None:
        """이벤트를 로그에 남기고 구독자에게 민다.

        🔴 로그 적재가 먼저다. 구독자 쪽에서 무슨 일이 나도 `GET /runs/{id}/events` 의
           정본은 온전해야 한다 — WS 는 이 로그의 «중계»지 원천이 아니다.
        """
        self.events.append(event)
        for queue in tuple(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # 느린 구독자는 «조용히 몇 개 빠뜨린 스트림»을 받는 것이 최악이다 —
                # 화면이 빠진 단계를 모른 채 그린다. 끊어서 재연결하게 만든다.
                log.warning("구독자 큐가 찼다 — 구독을 끊는다 (run=%s)", self.runId)
                self._subscribers.discard(queue)
                _close(queue)

    def subscribe(self) -> asyncio.Queue[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue(maxsize=SUBSCRIBER_QUEUE_MAX)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any] | None]) -> None:
        self._subscribers.discard(queue)

    def close_subscribers(self) -> None:
        """run 이 끝났다 — 구독자에게 «끝»을 알린다(None 이 종료 신호다)."""
        for queue in tuple(self._subscribers):
            self._subscribers.discard(queue)
            _close(queue)

    @property
    def terminal(self) -> bool:
        return self.status != "running"


def _close(queue: asyncio.Queue[dict[str, Any] | None]) -> None:
    try:
        queue.put_nowait(None)
    except asyncio.QueueFull:  # pragma: no cover — 이미 못 받는 구독자다
        pass


class RunStore:
    """프로세스 내 run 저장소. 앱 하나에 하나씩 두고 `app.state` 가 들고 다닌다."""

    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}

    def create(
        self,
        *,
        session_id: str,
        scenario_id: str,
        incident_id: str,
        mode: Literal["live", "replay"],
    ) -> RunRecord:
        self._evict_if_needed()
        run_id = f"RUN-{uuid.uuid4().hex[:12]}"
        record = RunRecord(
            runId=run_id,
            sessionId=session_id,
            scenarioId=scenario_id,
            incidentId=incident_id,
            mode=mode,
        )
        self._runs[run_id] = record
        return record

    def get(self, run_id: str) -> RunRecord | None:
        return self._runs.get(run_id)

    def by_session(self, session_id: str) -> list[RunRecord]:
        return [r for r in self._runs.values() if r.sessionId == session_id]

    def by_work_order_draft(self, wo_id: str) -> list[RunRecord]:
        """그 초안 id 를 «주장하는» run 전부. 🔴 하나가 아니라 목록으로 돌려준다.

        `WOD-` 는 난수라 충돌하지 않을 것 같지만, **재생본이 남의 이름을 그대로 말한다** —
        replay run 은 녹화본의 `workOrderDraftId` 를 복원하므로(replay.py), 그 fixture 를
        녹화한 run 이 같은 프로세스에 아직 살아 있으면 **한 id 를 두 run 이 주장한다**.
        여기서 「첫 번째」를 골라 돌려주면 dict 삽입 순서가 답을 정하게 되고, 그 답은
        녹화·재생 순서에 따라 바뀐다 — 검사기가 순서 때문에 초록이 되는 자리가 생긴다.
        고르는 일은 호출자가 «명시된 규칙»으로 하고, 저장소는 사실만 전부 넘긴다.
        """
        return [r for r in self._runs.values() if r.workOrderDraftId == wo_id]

    def drop_session(self, session_id: str) -> int:
        """세션 리셋 — 그 세션의 run 만 버린다. 다른 세션은 손대지 않는다(계약 「타 세션 무영향」)."""
        dropped = 0
        for record in self.by_session(session_id):
            if record.task is not None and not record.task.done():
                record.task.cancel()
            record.close_subscribers()
            self._runs.pop(record.runId, None)
            dropped += 1
        return dropped

    def _evict_if_needed(self) -> None:
        if len(self._runs) < MAX_RUNS:
            return
        # 진행 중인 run 은 버리지 않는다 — 실행 중인 조사의 이벤트가 갈 곳을 잃는다.
        finished = [r for r in self._runs.values() if r.terminal]
        if not finished:
            log.warning("run 상한(%d)에 닿았는데 버릴 완료 run 이 없다 — 그대로 늘어난다", MAX_RUNS)
            return
        oldest = finished[0]                       # dict 는 삽입 순서를 지킨다 = 오래된 것이 앞
        oldest.close_subscribers()
        self._runs.pop(oldest.runId, None)
        log.info("run 상한으로 오래된 완료 run 을 버렸다: %s", oldest.runId)
