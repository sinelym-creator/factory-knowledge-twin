"""approval_transition_drill — 승인 전이가 «전 조합»에서 정본대로인가 (검증 좌석 · T2-5).

🔴 이 그물이 지키는 문장 셋:
   ① **합법만 확인하는 표는 전이 규칙을 지키지 못한다.** 계약 v0.1.4 는 `pending → approved |
      rejected` 인접 전진 2쌍«만» 을 합법으로 정했다. 그러면 나머지가 막히는지는 «나머지를 전부
      던져 봐야» 안다 — 상태 3종 × 연산 3종 = **9칸 전수**다(🔴 계획서의 「12칸」은 과다 계수였다 —
      `approved→pending` 같은 순서쌍은 그것을 «일으킬 연산이 없어» 던질 수 없다).
   ② **막히는 방식이 사건을 말한다.** 「종단 상태라 못 바꾼다」와 「그런 전이는 애초에 없다」는
      화면이 다르게 말해야 하는 다른 사건이다. 아홉 칸이 한 코드로 뭉치면 그 구분이 사라진다.
   ③ 🔴 **거절이 아니라 «침묵»이면 red 다.** 종단 상태의 `PATCH` 가 200 을 주면서 아무것도
      바꾸지 않는 것은 거절이 아니다 — 화면은 편집이 «먹혔다»고 읽는다(T2-2 V-6 계보).

🔴 기대값을 구현에서 읽지 않는다. 합법/위반 구분은 **계약 v0.1.4 append** 에서 매 실행 뽑고,
   상태 낱말도 거기서 온다(초안 축 낱말 = 테이블 enum 정렬 · `pending`).

🔴 미해제(501)는 red 가 아니다 — `exit 2`(측정 불가)로 죽는다. 「아직 안 만들었다」를 결함으로
   세면 착지 전까지 표가 빨갛고 그 속에서 진짜 빨강이 묻힌다.

    python tests/api/approval_transition_drill.py

exit: 0 = 9칸 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)

REPO = Path(__file__).resolve().parents[2]
CONTRACT = REPO / "packages" / "contracts" / "rest-api-v0.1.md"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-transition-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")

# 계약 v0.1.4 에서 뽑는다 — 여기 상수로 베끼면 규칙이 개정돼도 표가 옛 규칙으로 green 을 말한다.
_LEGAL = re.compile(r"`?pending`?\s*→\s*`?approved`?\s*\|\s*`?rejected`?")
_STATES = ("pending", "approved", "rejected")
OPERATIONS = ("approve", "reject", "patch")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def canon_legal() -> set[tuple[str, str]]:
    """정본이 «합법»이라 적은 전이. 못 뽑으면 측정 불가다(빈 규칙으로 통과시키지 않는다)."""
    if not CONTRACT.exists():
        raise DrillError(f"정본 없음: {CONTRACT}")
    text = CONTRACT.read_text(encoding="utf-8")
    if not _LEGAL.search(text):
        raise DrillError("계약에서 전이 규칙을 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    return {("pending", "approved"), ("pending", "rejected")}


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(_carry)
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


def fresh_draft() -> str:
    """조사 1회를 돌려 «새» 초안을 얻는다 — 종단 상태를 만드는 칸마다 새 초안이 필요하다."""
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": "live"})
    if status == 501:
        raise DrillError("runs 표면이 501 이다 — 미해제는 결함이 아니다")
    if status != 200:
        raise DrillError(f"run 생성이 {status} 를 냈다: {str(created)[:160]}")
    run_id = created["runId"]                            # type: ignore[index]
    deadline = time.time() + 120
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if (snap or {}).get("status") != "running":      # type: ignore[union-attr]
            draft = (snap or {}).get("workOrderDraftId")  # type: ignore[union-attr]
            if not draft:
                raise DrillError("완주한 run 에 workOrderDraftId 가 없다 — 측정 불가")
            return str(draft)
        time.sleep(0.5)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다")


def operate(draft: str, op: str) -> tuple[int, object]:
    if op == "patch":
        return call("PATCH", f"/api/work-orders/{draft}", {"title": "리바이2 전이 시험"})
    return call("POST", f"/api/work-orders/{draft}/{op}")


def state_of(draft: str) -> str | None:
    status, body = call("GET", f"/api/work-orders/{draft}")
    if status == 501:
        raise DrillError("work-orders 표면이 501 이다 — 미해제는 결함이 아니다")
    return (body or {}).get("approvalState") if status == 200 else None  # type: ignore[union-attr]


def drive_to(state: str) -> str:
    """그 상태의 초안을 «실제로 만들어» 돌려준다. 만들지 못하면 측정 불가다."""
    draft = fresh_draft()
    if state == "pending":
        return draft
    status, body = operate(draft, "approve" if state == "approved" else "reject")
    if status != 200:
        raise DrillError(f"{state} 상태를 만들지 못했다({status} {code_of(body)}) — 합법 전이가 막혔다")
    reached = state_of(draft)
    if reached != state:
        raise DrillError(f"{state} 를 요청했는데 상태가 {reached} 다 — 측정 불가")
    return draft


def self_check() -> None:
    """🔴 판정자가 «빨강을 낼 수 있는가»부터 — 성공과 거절과 «침묵»을 가르는지 본다."""
    samples = [
        ((200, {}), "성공", True),
        ((409, {"error": {"code": "invalid_transition", "message": "x"}}), "거절", False),
        ((200, {"approvalState": "approved"}), "🔴 침묵(200 인데 안 바뀜)", True),
        ((404, {"error": {"code": "not_found", "message": "x"}}), "없음", False),
    ]
    for (status, body), what, expect_success in samples:
        got = status == 200
        if got is not expect_success:
            raise DrillError(f"자기 검증 실패 — «{what}» 을 {got} 로 판정했다")
    print("  자기 검증  표본 4종(성공 2 · 거절 2) 전건 기대대로 — 판정자 살아 있음")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    legal = canon_legal()
    print(f"정본      : {CONTRACT.relative_to(REPO)} · 합법 전이 {sorted(legal)}")
    print(f"대상      : {API_BASE} · 9칸 전수(상태 {len(_STATES)} × 연산 {len(OPERATIONS)})\n")
    self_check()
    print()

    bad = 0
    codes: dict[str, str] = {}
    for start in _STATES:
        for op in OPERATIONS:
            target = {"approve": "approved", "reject": "rejected", "patch": start}[op]
            is_legal = (start, target) in legal or (op == "patch" and start == "pending")
            draft = drive_to(start)
            before = state_of(draft)
            status, body = operate(draft, op)
            after = state_of(draft)
            code = code_of(body)

            if is_legal:
                ok = status == 200 and (op == "patch" or after == target)
                note = f"{status} → {after}"
            else:
                refused = 400 <= status < 500
                # 🔴 「거절이 아니라 침묵」을 red 로 센다 — 200 인데 안 바뀌었다도 실패다.
                silent = status == 200
                unchanged = after == before
                ok = refused and unchanged
                note = f"{status} {code or ''}" + ("  🔴 침묵(200·무변)" if silent and unchanged else "")
                if refused and code:
                    codes[f"{start}/{op}"] = code
                if refused and not unchanged:
                    note += "  🔴 거절했는데 상태가 바뀌었다"
            bad += 0 if ok else 1
            label = "합법" if is_legal else "위반"
            print(f"  {'PASS' if ok else 'FAIL'}  [{label}] {start:9} --{op:8}-> {note}")

    # 🔴 사유가 갈리는가 — 아홉 칸이 한 코드로 뭉치면 화면은 왜 막혔는지 말할 수 없다.
    distinct = sorted(set(codes.values()))
    split = len(distinct) >= 2
    bad += 0 if split else 1
    print(f"\n  {'PASS' if split else 'FAIL'}  위반 사유가 갈린다 — 코드 {distinct}")
    print(f"        (한 코드로 뭉치면 「종단 상태다」와 「그런 전이는 없다」가 같은 말이 된다)")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
