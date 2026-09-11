"""CAP3 — 전역 시간당 상한과 합성 걸쇠 판독 (계약 v0.2.4).

🔴 여기서 재는 것은 «이번에 더한 규칙»뿐이다. 세션 축은 이미 자기 테스트가 있고, 같은 사실을
   두 곳에서 세면 언젠가 둘이 갈린다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.errors import LiveHourlyCapExceeded, SessionRunCapExceeded
from app.investigation.session_cap import GLOBAL_RUN_CAP_KEY, SessionRunCap
from app.routers.investigations import _admit_run_caps
from app.routers.ops import _latch_active, _parse_iso


class _Settings:
    """거절 본문이 싣는 두 칸만 있는 최소 설정 — 실제 Settings 를 끌어오지 않는다."""

    def __init__(self, per_session: int, per_hour: int) -> None:
        self.run_cap_per_session = per_session
        self.run_cap_global_per_hour = per_hour


def _caps(session_limit: int, global_limit: int) -> tuple[SessionRunCap, SessionRunCap]:
    return (
        SessionRunCap(limit=session_limit, window_sec=3600.0),
        SessionRunCap(limit=global_limit, window_sec=3600.0),
    )


def test_global_refusal_does_not_consume_the_session_axis() -> None:
    """🔴 D-1 수리의 판정선 — 전역이 거절하면 세션 `used` 가 **움직이지 않는다**.

    이 케이스는 낡은 순서(`session.admit` → `global.admit`)에서 **반드시 빨강**이다:
    세션을 먼저 세고 나서 전역이 거절하면 되돌릴 자리가 없어 `used` 가 0→1 로 남았다
    (리바이2 CAP3-V 4/4 재현).
    """
    session_cap, global_cap = _caps(session_limit=3, global_limit=1)
    global_cap.commit(GLOBAL_RUN_CAP_KEY, now=0.0)  # 전역 한 자리를 남이 먼저 썼다

    with pytest.raises(LiveHourlyCapExceeded):
        _admit_run_caps(session_cap, global_cap, "s", _Settings(3, 1), now=1.0)

    assert session_cap.peek("s", now=1.0)["used"] == 0
    assert session_cap.peek("s", now=1.0)["remaining"] == 3


def test_session_refusal_does_not_consume_the_global_axis() -> None:
    """반대 방향 — 세션이 거절하면 전역 `used` 가 움직이지 않는다(순서가 집행하는 축)."""
    session_cap, global_cap = _caps(session_limit=1, global_limit=5)
    session_cap.commit("s", now=0.0)
    before = global_cap.peek(GLOBAL_RUN_CAP_KEY, now=1.0)["used"]

    with pytest.raises(SessionRunCapExceeded):
        _admit_run_caps(session_cap, global_cap, "s", _Settings(1, 5), now=1.0)

    assert global_cap.peek(GLOBAL_RUN_CAP_KEY, now=1.0)["used"] == before == 0


def test_pass_counts_both_axes_exactly_once() -> None:
    """🔴 대조군 — 통과 회차는 **양쪽 다** 1 이어야 한다. 없으면 「아무것도 안 세기」가
       위 두 케이스를 통과시킨다(거절도 계수 0 · 통과도 계수 0 이면 상한이 사라진다)."""
    session_cap, global_cap = _caps(session_limit=3, global_limit=5)
    _admit_run_caps(session_cap, global_cap, "s", _Settings(3, 5), now=0.0)
    assert session_cap.peek("s", now=0.0)["used"] == 1
    assert global_cap.peek(GLOBAL_RUN_CAP_KEY, now=0.0)["used"] == 1


def test_check_does_not_count_but_commit_does() -> None:
    """2단의 성질 자체 — `check` 를 몇 번 불러도 자리가 줄지 않는다."""
    cap = SessionRunCap(limit=1, window_sec=3600.0)
    for _ in range(5):
        assert cap.check("s", now=0.0) is None
    assert cap.peek("s", now=0.0)["used"] == 0
    cap.commit("s", now=0.0)
    assert cap.peek("s", now=0.0)["used"] == 1
    retry = cap.check("s", now=0.0)
    assert retry is not None and retry > 0


def test_global_cap_admits_limit_then_refuses() -> None:
    cap = SessionRunCap(limit=3, window_sec=3600.0)
    assert [cap.admit(GLOBAL_RUN_CAP_KEY, now=float(i)) for i in range(3)] == [None, None, None]
    retry = cap.admit(GLOBAL_RUN_CAP_KEY, now=3.0)
    assert retry is not None and retry > 0


def test_refused_call_does_not_count() -> None:
    """🔴 거절은 소모가 아니다 — 거절 뒤에도 `used` 가 그대로여야 한다."""
    cap = SessionRunCap(limit=1, window_sec=3600.0)
    cap.admit(GLOBAL_RUN_CAP_KEY, now=0.0)
    before = cap.peek(GLOBAL_RUN_CAP_KEY, now=1.0)["used"]
    cap.admit(GLOBAL_RUN_CAP_KEY, now=1.0)          # 거절
    after = cap.peek(GLOBAL_RUN_CAP_KEY, now=1.0)["used"]
    assert before == after == 1


def test_global_key_and_session_key_do_not_consume_each_other() -> None:
    cap = SessionRunCap(limit=1, window_sec=3600.0)
    assert cap.admit(GLOBAL_RUN_CAP_KEY, now=0.0) is None
    assert cap.admit("some-session", now=0.0) is None


def test_limit_off_means_no_cap() -> None:
    cap = SessionRunCap(limit=0, window_sec=3600.0)
    assert all(cap.admit(GLOBAL_RUN_CAP_KEY, now=float(i)) is None for i in range(10))
    # 🔴 상한 없음은 `remaining: None` 이다 — 0 이면 화면이 「0회 남음」으로 읽는다.
    assert cap.peek(GLOBAL_RUN_CAP_KEY, now=1.0)["remaining"] is None


def test_latch_reading_is_lenient_on_bad_values() -> None:
    """🔴 못 읽는 값은 «걸리지 않음»이다 — 읽기 실패로 Live 를 닫지 않는다."""
    now = datetime.now(timezone.utc)
    assert _latch_active((now + timedelta(minutes=5)).isoformat(), now) is True
    assert _latch_active((now - timedelta(minutes=5)).isoformat(), now) is False
    assert _latch_active(None, now) is False
    assert _latch_active("not-a-time", now) is False
    assert _parse_iso(now.isoformat().replace("+00:00", "Z")) is not None
