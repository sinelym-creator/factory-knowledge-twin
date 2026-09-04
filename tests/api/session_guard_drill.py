"""session_guard_drill — 계약 v0.1.6 세션 가드의 red 정의를 «미리» 세운 그물 (T3-6 선행).

🔴 이 파일은 **가드가 착지하기 전에** 쓰였다. 그래서 규율이 하나 더 붙는다:
   **가드가 없으면 초록을 내지 않는다.** `POST /sessions` 가 501 이면 `exit 2`(측정 불가)로
   죽는다 — 「아직 안 만든 것」 위에서 난 초록은 준수의 증거가 아니라 «아무것도 안 잰 표»다.
   (전임 8대의 「미해제는 결함이 아니다」와 같은 자리 · 다만 방향이 반대다: 빨강도 초록도 아니다.)

🔴 red 정의는 전부 계약 v0.1.6 append 에서 «매 실행» 뽑는다. 상수로 베끼면 규칙이 개정돼도
   표가 옛 규칙으로 초록을 말한다.

축 여섯 — 정본이 정한 것:
   ① **가드 전면** — 제외 3(`POST /sessions`·`GET /health`·`GET /live/status`)과 읽기 예외 2를
      뺀 전 라우트는 무세션에서 `401 session_required`. 200 이면 가드에 구멍이다.
   ② **읽기 예외 2** — `GET /evidence/{id}`·`GET /documents/{id}` 는 무세션 200(딥링크 축).
      401 이면 §3:244 가 죽는다.
   ③ **제외 3** — 무세션에서 열린다. 여기가 401 이면 세션을 «만들 수조차» 없다.
   ④ 🔴 **소유권 은닉** — 남의 run·초안·이력 = `404 not_found`.
      **401/403 은 red 다** — 「없다」와 「남의 것이다」가 갈리면 자원의 «존재»가 새기 때문이다.
   ⑤ **쿠키/본문 상충** — 둘 다 있고 «다르면» `422 invalid_request`(조용한 우선순위 금지).
   ⑦ 🔴 **운반 독법**(판정 ⓑ) — 인증 운반은 **쿠키 단독**. 본문 `sessionId` 는 동결 v0.1 의
      «남은» 표기라 있으면 일치 의무이고, **본문 단독은 무세션(401)** 이다.
   ⑥ **reset 자기 한정** — 남의 세션 reset = 404 · 자기 reset 범위 = 그 세션의 run·초안·이력만
      (SSOT 무접촉은 기존 `ssot_write_drill` 축이 지킨다).

    python tests/api/session_guard_drill.py

exit: 0 = 전건 정본대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가(가드 미착지·실행 오류)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)
import _env  # noqa: E402  — 공용 «대상 주소» 게이트(O-22 · 미지정이면 즉시 죽는다)

REPO = Path(__file__).resolve().parents[2]
CONTRACT = REPO / "packages" / "contracts" / "rest-api-v0.1.md"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

API_BASE = _env.api_base()
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")


class DrillError(RuntimeError):
    """측정 불가 — 결과가 아니다."""


def canon() -> dict:
    """정본 v0.1.6 에서 사유 코드와 예외 목록을 뽑는다. 못 뽑으면 측정 불가다."""
    if not CONTRACT.exists():
        raise DrillError(f"정본 없음: {CONTRACT}")
    text = CONTRACT.read_text(encoding="utf-8")
    m = re.search(r"## v0\.1\.6 append.*?(?=\n## |\Z)", text, re.S)
    if not m:
        raise DrillError("계약에서 v0.1.6 append 절을 못 찾았다 — 추출 규칙이 문서와 어긋났다")
    block = m.group(0)
    got = {
        "unauth": _one(block, r"`401 (session_required)`", "무세션 사유 코드"),
        "conflict": _one(block, r"`422 (invalid_request)`", "쿠키/본문 상충 코드"),
        "hidden": _one(block, r"`404 (not_found)`", "타 세션 은닉 코드"),
    }
    if "GET /evidence" not in block or "GET /documents" not in block:
        raise DrillError("정본에서 읽기 예외 2라우트를 못 읽었다 — 추출 규칙이 어긋났다")
    return got


def _one(block: str, pattern: str, what: str) -> str:
    m = re.search(pattern, block)
    if not m:
        raise DrillError(f"정본에서 {what} 를 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    return m.group(1)


def raw(method: str, path: str, body=None, cookie: str | None = None):
    """🔴 어댑터를 «쓰지 않는다» — 이 드릴은 세션 운반 자체가 표본이다."""
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            payload = res.read().decode("utf-8")
            try:
                return res.status, json.loads(payload), res.headers.get("Set-Cookie")
            except json.JSONDecodeError:
                return res.status, {"_raw": payload[:160]}, res.headers.get("Set-Cookie")
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(text), None
        except json.JSONDecodeError:
            return exc.code, {"_raw": text[:160]}, None
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def code_of(body) -> str | None:
    return (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None


def open_session() -> tuple[str, str]:
    """세션 하나를 연다. 501 이면 «가드 미착지» — 측정 불가로 죽는다."""
    st, body, cookie = raw("POST", "/api/sessions", {})
    if st == 501:
        raise DrillError("POST /sessions 가 501 이다 — 🔴 가드 미착지. "
                         "이 그물은 착지 «후»에만 판정한다(초록도 빨강도 내지 않는다)")
    if st not in (200, 201):
        raise DrillError(f"세션 수립이 {st} 를 냈다: {str(body)[:160]}")
    sid = (body or {}).get("sessionId")
    if not sid:
        raise DrillError("세션 응답에 sessionId 가 없다 — 측정 불가")
    return str(sid), cookie or ""


def self_check(rules: dict) -> None:
    """🔴 판정자가 네 사건(열림·무세션·은닉·상충)을 «가르는가»."""
    samples = [
        ((200, {}), "열림", "open"),
        ((401, {"error": {"code": rules["unauth"], "message": "x"}}), "무세션", "unauth"),
        ((404, {"error": {"code": rules["hidden"], "message": "x"}}), "은닉", "hidden"),
        ((403, {"error": {"code": "forbidden", "message": "x"}}), "🔴 존재 누설", "leak"),
        ((422, {"error": {"code": rules["conflict"], "message": "x"}}), "상충", "conflict"),
    ]
    for (st, body), what, want in samples:
        got = verdict(st, code_of(body), rules)
        if got != want:
            raise DrillError(f"자기 검증 실패 — «{what}» 을 {got} 로 판정했다")
    print(f"  자기 검증  표본 5종(열림·무세션·은닉·누설·상충) 전건 기대대로 — 판정자 살아 있음")


def verdict(status: int, code: str | None, rules: dict) -> str:
    if status == 200:
        return "open"
    if status == 401 and code == rules["unauth"]:
        return "unauth"
    if status == 404 and code == rules["hidden"]:
        return "hidden"
    if status in (401, 403):
        return "leak"
    if status == 422 and code == rules["conflict"]:
        return "conflict"
    return f"other({status}:{code})"


# 동결 v0.1 본문이 `sessionId` 를 «가진» 라우트. 나머지는 쿠키만으로 신원을 나른다.
_SESSION_BODY = ("/runs", "/retrieval/compare")


def _takes_session(path: str) -> bool:
    """계약 동결 본문에 `sessionId` 자리가 있는가 — 없으면 넣지 않는다(422 가 판정을 가린다)."""
    return path.endswith("/runs") or path.startswith("/api/retrieval/compare")


def await_run(run_id: str, cookie: str) -> dict:
    deadline = time.time() + 300
    while time.time() < deadline:
        _, snap, _ = raw("GET", f"/api/runs/{run_id}", cookie=cookie)
        if isinstance(snap, dict) and snap.get("status") != "running":
            return snap
        time.sleep(0.5)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    rules = canon()
    print(f"정본      : {CONTRACT.relative_to(REPO)} v0.1.6 · 코드 "
          f"{rules['unauth']} / {rules['hidden']} / {rules['conflict']}")
    print(f"대상      : {API_BASE}")
    print("규율      : 🔴 가드 미착지면 초록도 빨강도 내지 않는다 — exit 2")
    print()
    self_check(rules)
    print()

    sid_a, cookie_a = open_session()
    print(f"  세션 A    {sid_a}")
    bad = 0

    # ── 축③ 제외 3라우트 — 무세션에서 열려야 세션을 만들 수 있다 ──────────
    for method, path in (("GET", "/api/health"), ("GET", "/api/live/status")):
        st, body, _ = raw(method, path)
        ok = st == 200
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  축③ 제외 {path:34} {st} {code_of(body) or ''}")

    # ── 축② 읽기 예외 2 — 무세션 «열람»이 참이어야 한다 ────────────────
    st, created, _ = raw("POST", f"/api/scenarios/{SCENARIO}/runs",
                         {"sessionId": sid_a, "mode": "live"}, cookie=cookie_a)
    if st != 200:
        raise DrillError(f"세션 A 로 run 을 못 만들었다({st}) — 측정 불가")
    run_a = created["runId"]
    snap = await_run(run_a, cookie_a)
    draft_a = snap.get("workOrderDraftId")
    _, events, _ = raw("GET", f"/api/runs/{run_a}/events", cookie=cookie_a)
    ev = next((p["evidence"]["evidenceId"]
               for e in (events or []) if isinstance(p := e.get("payload"), dict)
               and isinstance(p.get("evidence"), dict)
               and p["evidence"].get("kind") == "doc-chunk"), None)
    if not (draft_a and ev):
        raise DrillError("초안 id 또는 doc-chunk 근거를 못 얻었다 — 측정 불가")
    doc = ev.split("@")[0]
    q = urllib.parse.quote
    for label, path in (("evidence", f"/api/evidence/{q(ev, safe='')}"),
                        ("documents", f"/api/documents/{q(doc, safe='')}")):
        st, body, _ = raw("GET", path)
        ok = st == 200
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  축② 읽기 예외 {label:24} {st} {code_of(body) or ''}"
              + ("" if ok else "  🔴 딥링크 축(§3:244)이 죽는다"))

    # ── 축① 가드 전면 — 예외·제외 밖은 무세션에서 401 ─────────────────
    guarded = [
        ("GET", f"/api/runs/{run_a}"),
        ("GET", f"/api/runs/{run_a}/events"),
        ("GET", "/api/scenarios"),
        ("POST", f"/api/scenarios/{SCENARIO}/runs"),
        ("GET", f"/api/work-orders/{draft_a}"),
        ("PATCH", f"/api/work-orders/{draft_a}"),
        ("POST", f"/api/work-orders/{draft_a}/approve"),
        ("GET", f"/api/graph/paths?byRun={run_a}"),
        ("POST", "/api/retrieval/compare"),
    ]
    for method, path in guarded:
        # 🔴 동결 v0.1 본문에 `sessionId` «자리»가 있는 라우트에만 본문을 싣는다.
        #    자리가 없는 곳(approve·PATCH 초안 등)에 넣으면 extra=forbid 가 422 를 먼저 내고,
        #    재려던 401/404 를 가려 버린다 — 첫 판에 축④가 그렇게 가려졌다.
        body = {"sessionId": sid_a} if _takes_session(path) else None
        st, res, _ = raw(method, path, body)
        got = verdict(st, code_of(res), rules)
        ok = got == "unauth"
        bad += 0 if ok else 1
        note = "" if ok else ("  🔴 가드에 구멍" if got == "open" else f"  🔴 {got}")
        print(f"  {'PASS' if ok else 'FAIL'}  축① 가드 {method:5} {path[:38]:38} {st} "
              f"{code_of(res) or ''}{note}")

    # ── 축④ 소유권 은닉 — 남의 자원은 «없는 것»과 같은 말이어야 한다 ────
    sid_b, cookie_b = open_session()
    print(f"  세션 B    {sid_b}")
    for label, method, path in (("run", "GET", f"/api/runs/{run_a}"),
                                ("초안", "GET", f"/api/work-orders/{draft_a}"),
                                ("승인", "POST", f"/api/work-orders/{draft_a}/approve"),
                                ("경로", "GET", f"/api/graph/paths?byRun={run_a}")):
        # 🔴 여기서도 같다. 세션 B 의 신원은 «쿠키»가 나른다(v0.1.6 판정: 운반 = 쿠키 단독) —
        #    본문에 억지로 넣으면 소유권 판정 앞에서 422 가 먼저 서고, 은닉 축이 안 잰다.
        body = {"sessionId": sid_b} if _takes_session(path) else None
        st, res, _ = raw(method, path, body, cookie=cookie_b)
        got = verdict(st, code_of(res), rules)
        ok = got == "hidden"
        bad += 0 if ok else 1
        note = ""
        if got == "leak":
            note = "  🔴 401/403 = 자원의 «존재»가 샌다"
        elif got == "open":
            note = "  🔴 남의 자원이 열린다"
        print(f"  {'PASS' if ok else 'FAIL'}  축④ 은닉 {label:6} {st} {code_of(res) or ''}{note}")

    # ── 축⑤ 쿠키/본문 상충 — 조용한 우선순위 금지 ──────────────────────
    st, res, _ = raw("POST", f"/api/scenarios/{SCENARIO}/runs",
                     {"sessionId": sid_b, "mode": "live"}, cookie=cookie_a)
    got = verdict(st, code_of(res), rules)
    ok = got == "conflict"
    bad += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  축⑤ 쿠키(A)↔본문(B) 상충          {st} "
          f"{code_of(res) or ''}" + ("" if ok else "  🔴 조용히 한쪽을 골랐다"))

    # ── 축⑥ reset 자기 한정 ────────────────────────────────────────────
    st, res, _ = raw("POST", f"/api/sessions/{sid_a}/reset", cookie=cookie_b)
    got = verdict(st, code_of(res), rules)
    ok = got == "hidden"
    bad += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  축⑥ 남의 세션 reset               {st} "
          f"{code_of(res) or ''}" + ("" if ok else "  🔴 자기 한정이 아니다"))

    st, res, _ = raw("POST", f"/api/sessions/{sid_a}/reset", cookie=cookie_a)
    ok = st == 200
    bad += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  축⑥ 자기 세션 reset               {st} {code_of(res) or ''}")
    if ok:
        st, res, _ = raw("GET", f"/api/runs/{run_a}", cookie=cookie_a)
        gone = verdict(st, code_of(res), rules) == "hidden"
        bad += 0 if gone else 1
        print(f"  {'PASS' if gone else 'FAIL'}  축⑥ reset 후 자기 run 소멸        {st} "
              f"{code_of(res) or ''}" + ("" if gone else "  🔴 초기화 범위가 안 닿았다"))

    # ── 축⑦ 🔴 «운반» 독법 (08-30 오케 판정 ⓑ) — 인증 운반 = 쿠키 «단독» ─────
    #    세 칸을 함께 던져야 독법이 선다. 쿠키만으로 열리고 본문만으로는 안 열려야
    #    「id 를 아는 것만으로 남의 세션을 쓴다」가 닫힌다(기각 독법 ⓐ 의 기각 사유).
    sid_c, cookie_c = open_session()
    carriage = [
        ("쿠키 단독", raw("GET", "/api/scenarios", None, cookie=cookie_c), "open"),
        ("본문 단독(쿠키 없음)",
         raw("POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid_c, "mode": "live"}),
         "unauth"),
        ("쿠키+본문 «일치»",
         raw("POST", f"/api/scenarios/{SCENARIO}/runs",
             {"sessionId": sid_c, "mode": "live"}, cookie=cookie_c), "open"),
    ]
    for label, (st, res, _), want in carriage:
        got = verdict(st, code_of(res), rules)
        ok = got == want
        bad += 0 if ok else 1
        note = ""
        if label.startswith("본문 단독") and got == "open":
            note = "  🔴 본문만으로 인증된다 — 기각 독법 ⓐ 가 살아 있다(소유권 은닉이 함께 무너진다)"
        print(f"  {'PASS' if ok else 'FAIL'}  축⑦ 운반 {label:22} {st} "
              f"{code_of(res) or ''}{note}")

    print()
    print(f"결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
