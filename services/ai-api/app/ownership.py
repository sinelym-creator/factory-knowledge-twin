"""세션 소유권 — 계약 v0.1.6 「타 세션 자원 = `404 not_found`(존재 은닉)」 (T3-1 · Q-25 폐쇄).

원장 Q-25 는 「id 를 아는 누구나 남의 run 을 연다」를 «읽기» 축의 기록으로 열어 두었고,
T2-5 가 같은 무세션 축에 «쓰기»(편집·승인)를 얹으면서 종류가 바뀌었다. 이 티켓이 둘 다 닫는다.

🔴 **401·403 이 아니라 404 다.** 「권한이 없다」는 답은 그 자원이 «있다»고 말한다 — 남의
   runId 를 무작위로 던져 보면 존재 여부가 응답 코드로 새어 나간다. 계약이 존재 은닉을 고른
   이유가 그것이고, 그래서 **부재와 타 세션의 응답은 코드도 문장도 같아야 한다.** 여기서
   문장을 하나로 두는 이유가 그 «같음»을 코드가 아니라 구조로 보증하기 위해서다.

🔴 **판정을 라우트마다 적지 않는다.** run 을 여는 문이 지금 셋이고(`GET /runs/*` 계열 ·
   `GET /graph/paths?byRun=` · WS), 초안을 여는 문이 넷이다. 라우트마다 같은 세 줄을 베끼면
   다섯 번째 문이 열리는 날 하나를 잊는다 — 이 리포가 V-7 로 값을 치른 형태다.
"""

from __future__ import annotations

import logging

from starlette.requests import HTTPConnection

from .errors import contract_error
from .investigation.store import RunRecord, RunStore

log = logging.getLogger(__name__)

#: 부재와 타 세션이 «같은 문장»으로 나가야 한다 — 문장이 갈리면 은닉이 문장에서 깨진다.
RUN_NOT_FOUND = "run {run_id} 를 찾을 수 없다"


def current_session(conn: HTTPConnection) -> str | None:
    """가드가 확정한 세션 id. 라우트가 본문·쿠키를 다시 꺼내지 않는다."""
    return getattr(conn.state, "session_id", None)


def visible(record: RunRecord, session: str | None) -> bool:
    """이 세션이 이 run 을 «볼 수 있는가».

    🔴 `session` 이 None 이면 아무것도 보이지 않는다. 가드가 통과시킨 라우트에서 None 이
       올 수 있는 경우는 읽기 예외 2라우트뿐이고, 그 둘은 세션 자원을 만지지 않는다 —
       만지게 되는 날 이 함수가 «전부 안 보임»으로 답해 그 사실이 즉시 드러난다.
    """
    return session is not None and record.sessionId == session


def find_run(conn: HTTPConnection, run_id: str) -> RunRecord | None:
    """이 세션이 볼 수 있는 run 만 — 없는 것과 남의 것을 여기서 «합친다».

    🔴 합치는 것은 «응답»이다. 사유는 **로그에서만** 가른다 — 운영자는 「없어서」인지
       「남의 것이라」인지 알아야 하고(D-80 류의 진단), 호출자는 그 차이를 알면 안 된다
       (알면 남의 run 의 «존재»가 샌다). 그래서 문면은 하나(`RUN_NOT_FOUND`)로 남는다.
    🔴 로그에도 «주인의 세션 id» 는 적지 않는다 — 사유만으로 진단은 선다.
    """
    store: RunStore = conn.app.state.run_store
    record = store.get(run_id)
    session = current_session(conn)
    if record is None:
        log.info("run %s 미가시 — 저장소에 없다", run_id)
        return None
    if session is None:
        log.info("run %s 미가시 — 요청에 세션이 없다", run_id)
        return None
    if not visible(record, session):
        log.info("run %s 미가시 — 다른 세션의 것", run_id)
        return None
    return record


def run_or_404(conn: HTTPConnection, run_id: str) -> RunRecord:
    record = find_run(conn, run_id)
    if record is None:
        raise contract_error(404, "not_found", RUN_NOT_FOUND.format(run_id=run_id))
    return record


def visible_runs(conn: HTTPConnection, records: list[RunRecord]) -> list[RunRecord]:
    """run 목록에서 이 세션 것만 남긴다 — WO 초안 조회가 쓰는 형태."""
    session = current_session(conn)
    return [r for r in records if visible(r, session)]
