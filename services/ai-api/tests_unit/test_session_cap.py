"""`SessionRunCap.peek` — 계약 v0.1.15 가 화면에 약속한 네 칸의 근거.

🔴 여기서 재는 것은 **「보는 것이 쓰는 것이 되지 않는가」**다. 그 성질은 라우트 실측으로는
   증명이 어렵다(한 번 눌러 한 번 늘어난 것은 admit 때문일 수도 있다) — 그래서 `peek` 을
   반복해서 부르고 `admit` 의 계수가 «움직이지 않는» 것을 본다.
🔴 시간은 인자로 넣는다(`now=`). `time.monotonic` 을 기다리면 창 만료 축은 3600초를 재야
   하고, 그러면 아무도 안 돌리는 테스트가 된다.
"""

from __future__ import annotations

from app.investigation.session_cap import SessionRunCap


def test_peek_does_not_count() -> None:
    cap = SessionRunCap(limit=2, window_sec=100.0)
    for _ in range(5):
        assert cap.peek("s", now=0.0) == {
            "limit": 2, "used": 0, "remaining": 2, "next_free_sec": None
        }
    # 🔴 다섯 번 «봤는데» 여전히 두 번 다 들어간다 = 보는 행위가 쓰지 않았다.
    assert cap.admit("s", now=0.0) is None
    assert cap.admit("s", now=0.0) is None
    assert cap.admit("s", now=0.0) is not None


def test_peek_counts_this_run_after_admit() -> None:
    """계약의 `used` = 「이번 실행 «포함»」 — 헤더가 그 값을 그대로 싣는다."""
    cap = SessionRunCap(limit=2, window_sec=100.0)
    cap.admit("s", now=0.0)
    assert cap.peek("s", now=0.0)["used"] == 1
    assert cap.peek("s", now=0.0)["remaining"] == 1


def test_next_free_only_when_exhausted() -> None:
    cap = SessionRunCap(limit=1, window_sec=100.0)
    cap.admit("s", now=0.0)
    view = cap.peek("s", now=40.0)
    assert view["remaining"] == 0
    # 가장 오래된 기록(0.0)이 창(100)을 벗어나기까지 60초.
    assert view["next_free_sec"] == 60
    # 🔴 남은 자리가 있으면 «기다릴 필요가 없다» → None. 0 을 주면 화면이 「0분 뒤 회복」이라는
    #    없는 말을 한다.
    assert cap.peek("other", now=40.0)["next_free_sec"] is None


def test_window_expiry_frees_a_slot_without_writing() -> None:
    """창 만료 축 — 🔴 `peek` 은 만료분을 «세지 않을» 뿐 지우지 않는다(읽기가 상태를 안 바꾼다)."""
    cap = SessionRunCap(limit=1, window_sec=10.0)
    cap.admit("s", now=0.0)
    assert cap.peek("s", now=5.0)["used"] == 1
    # 창을 지난 뒤 — 세지 않는다.
    assert cap.peek("s", now=11.0) == {
        "limit": 1, "used": 0, "remaining": 1, "next_free_sec": None
    }
    # 그리고 실제로 한 자리가 다시 열려 있다.
    assert cap.admit("s", now=11.0) is None


def test_no_limit_reports_null_not_zero() -> None:
    """🔴 `limit <= 0` = 상한 없음. `remaining: 0` 을 주면 상한 없음이 상한 도달로 뒤집힌다."""
    for limit in (0, -1):
        cap = SessionRunCap(limit=limit, window_sec=100.0)
        assert cap.admit("s", now=0.0) is None
        assert cap.peek("s", now=0.0) == {
            "limit": limit, "used": 0, "remaining": None, "next_free_sec": None
        }
