"""CAP3 — 전역 시간당 상한과 합성 걸쇠 판독 (계약 v0.2.4).

🔴 여기서 재는 것은 «이번에 더한 규칙»뿐이다. 세션 축은 이미 자기 테스트가 있고, 같은 사실을
   두 곳에서 세면 언젠가 둘이 갈린다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.investigation.session_cap import GLOBAL_RUN_CAP_KEY, SessionRunCap
from app.routers.ops import _latch_active, _parse_iso


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
