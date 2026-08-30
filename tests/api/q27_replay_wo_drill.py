"""q27_replay_wo_drill — 재생본 초안의 4경로가 «다른 사건»을 다른 말로 하는가 (T2-5 · Q-27).

정본(T2-5 판정 append): replay run 의 WO 4경로(`GET`·`PATCH`·`approve`·`reject`)는
**전건 사유 코드 분리**(`replay_draft_source_absent` 계열) — 404 와 구분한다.
「반만 고친 것」을 막기 위해 넷을 «함께» 센다.

🔴 이 그물이 지키는 문장 넷:
   ① **조용한 빈 값이 제일 나쁘다.** 200 + 빈 초안은 화면이 「초안이 원래 비었다」로 읽는다.
   ② **404 는 다른 사건이다.** 「없는 초안」과 「재생본이라 원본이 없다」를 같은 코드로 말하면
      화면은 재생 중이라는 사실을 말할 수 없다.
   ③ **넷이 같은 코드여야 한다.** 한 사건은 한 코드다(V-7 · D-05 계보).
   ④ 🔴 **한 경로만 고쳐진 것을 초록으로 세지 않는다** — 그래서 4경로를 한 표에 둔다.

🔴 대조군 2종을 함께 둔다: (a) 없는 초안 → 404 · (b) live run 초안 → 200.
   둘이 없으면 「전부 501」이 «Q-27 을 지킨 것»인지 «work-orders 가 통째로 막힌 것»인지
   구별할 수 없다(4대 유언 — 대조군 없는 초록은 아무것도 가르지 못한다).

🔴 fixture 미착지(501 replay_fixture_missing)는 red 가 아니다 — exit 2(측정 불가).

    python tests/api/q27_replay_wo_drill.py

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·측정 불가
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TICKET = REPO / "docs" / "plan" / "tickets" / "T2-5.md"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-q27-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
PATHS = ("GET", "PATCH", "approve", "reject")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def canon_code() -> str:
    """사유 코드 이름을 정본(T2-5 판정 append)에서 뽑는다 — 상수로 베끼면 개정을 못 따라간다."""
    if not TICKET.exists():
        raise DrillError(f"정본 없음: {TICKET}")
    text = TICKET.read_text(encoding="utf-8")
    m = re.search(r"Q-27\*\*\s*=.*?`([a-z_]+)`\s*계열", text, re.S)
    if not m:
        raise DrillError("정본에서 Q-27 사유 코드를 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    return m.group(1)


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def code_of(body: object) -> str | None:
    return (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None


def draft_of(mode: str) -> str:
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": mode})
    if status == 501:
        raise DrillError(f"{mode} run 이 501 이다({code_of(created)}) — 미해제는 결함이 아니다")
    if status != 200:
        raise DrillError(f"{mode} run 생성이 {status} 를 냈다: {str(created)[:160]}")
    run_id = created["runId"]                            # type: ignore[index]
    deadline = time.time() + 180
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if (snap or {}).get("status") != "running":      # type: ignore[union-attr]
            draft = (snap or {}).get("workOrderDraftId")  # type: ignore[union-attr]
            if not draft:
                raise DrillError(f"완주한 {mode} run 에 workOrderDraftId 가 없다 — 측정 불가")
            return str(draft)
        time.sleep(0.5)
    raise DrillError(f"{mode} run 이 제한 시간 안에 끝나지 않았다")


def touch(draft: str, how: str) -> tuple[int, str | None, object]:
    if how == "GET":
        s, b = call("GET", f"/api/work-orders/{draft}")
    elif how == "PATCH":
        s, b = call("PATCH", f"/api/work-orders/{draft}", {"title": "리바이2 Q-27"})
    else:
        s, b = call("POST", f"/api/work-orders/{draft}/{how}")
    return s, code_of(b), b


def self_check(expected: str) -> None:
    """🔴 판정자가 세 사건(재생본 · 없음 · 정상)을 «가르는가»."""
    samples = [
        ((501, {"error": {"code": expected, "message": "x"}}), "재생본", "absent"),
        ((404, {"error": {"code": "not_found", "message": "x"}}), "없음", "other"),
        ((200, {"workOrderDraftId": "WOD-1"}), "정상", "ok"),
        ((200, {}), "🔴 조용한 빈 값", "ok"),
    ]
    for (status, body), what, want in samples:
        got = "ok" if status == 200 else ("absent" if code_of(body) == expected else "other")
        if got != want:
            raise DrillError(f"자기 검증 실패 — «{what}» 을 {got} 로 판정했다")
    print(f"  자기 검증  표본 4종(재생본·없음·정상·빈 값) 전건 기대대로 — 판정자 살아 있음")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    expected = canon_code()
    print(f"정본      : {TICKET.relative_to(REPO)} · Q-27 사유 코드 «{expected}» 계열")
    print(f"대상      : {API_BASE} · 4경로 {PATHS}")
    print()
    self_check(expected)
    print()

    replay = draft_of("replay")
    print(f"  재생본 초안 {replay}")
    bad = 0
    codes: set[str] = set()
    for how in PATHS:
        status, code, body = touch(replay, how)
        silent = status == 200
        ok = (not silent) and status != 404 and code == expected
        if code:
            codes.add(code)
        note = f"{status} {code or ''}"
        if silent:
            note += "  🔴 조용한 빈 값"
        if status == 404:
            note += "  🔴 404 — 「없는 초안」과 같은 말이 됐다"
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  Q-{how:8} {note}")

    one = len(codes) == 1
    bad += 0 if one else 1
    print(f"  {'PASS' if one else 'FAIL'}  4경로가 «한 코드»다 — {sorted(codes)}")
    print("        (갈리면 한 사건이 여러 말이 되고, 반만 고친 것도 여기서 드러난다)")
    print()

    # ── 대조군 — 「전부 501」이 Q-27 준수인지 표면 봉쇄인지 가른다 ──────────
    status, code, _ = touch("WOD-000000000000", "GET")
    ctrl_404 = status == 404 and code != expected
    bad += 0 if ctrl_404 else 1
    print(f"  {'PASS' if ctrl_404 else 'FAIL'}  대조군 A — 없는 초안은 404 로 «다르게» 답한다  "
          f"{status} {code or ''}")

    live = draft_of("live")
    status, code, body = touch(live, "GET")
    ctrl_live = status == 200 and isinstance(body, dict) and bool(body.get("workOrderDraftId"))
    bad += 0 if ctrl_live else 1
    print(f"  {'PASS' if ctrl_live else 'FAIL'}  대조군 B — live run 초안은 200 으로 열린다     "
          f"{status} {code or ''} · {live}")
    print("        (열리지 않으면 위의 501 은 Q-27 이 아니라 표면이 막힌 것이다)")

    print()
    print(f"결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
