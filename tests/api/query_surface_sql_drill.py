"""query_surface_sql_drill — 「질의 문자열」 표면의 SQL negative (검증 좌석 · T5-2 신설 ① · §32.8 ①).

🔴 이 그물이 재는 것과 «재지 않는» 것을 먼저 가른다.

   `injection_surface_drill`(#117)은 **경로 파라미터** 3문을 덮는다 — 문자열이 테이블·행을
   고르는 자리다. 덮지 않는 곳이 **질의 문자열 표면**(`POST /retrieval/compare` 의 `question`)
   이고, 축소 안 §3 이 그 칸을 「신설 1」로 남겼다. 이 파일이 그 칸이다.

🔴 **그리고 이 그물은 「SQL 이 SQL 계층에서 막힌다」를 증명하지 못한다.**
   실측(2026-09-02): 이 문은 **승인 질문 allowlist** 로 봉인돼 있어 적대 문자열이 SQL 계층에
   **닿기 전에** 400 으로 끝난다. 그래서 판정문에 쓸 문장은 「SQL injection 내성」이 아니라
   **「임의 질의 문자열이 질의 계층에 도달하지 못한다」**다. 두 사실은 다르고, 섞어 적으면
   나중에 allowlist 가 열렸을 때 이 초록이 근거로 남는다. 그래서 아래 표는 매 행에
   **«어느 문이 막았는가»(사유 코드)** 를 함께 찍는다.

🔴 판정 기준 넷(§3 기대치 + 문의 양면):
   ① **5xx 0** — 적대 입력이 서버를 놀라게 하면 그 자체가 통제 실패다.
   ② **200 0** — 승인 목록 밖 문자열이 결과를 내면 문이 없는 것이다.
   ③ **내부 노출 0** — traceback · 드라이버 문구 · 파일 경로 · 스키마/SQL 조각.
   ④ **대조군: 정상 질문은 통과한다** — 🔴 이 행이 없으면 「전부 거절하는 문」도 초록이 된다.
      대조군은 목록을 옮겨 적지 않고 **`/api/scenarios` 에서 매 실행 뽑는다**.
   그리고 마지막에 **코퍼스 생존**을 세어, 거절하면서 망가뜨리지 않았음을 실측한다.

    python tests/api/query_surface_sql_drill.py

exit: 0 = 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·측정 불가
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»
import _env  # noqa: E402  — 공용 «대상 주소» 게이트(O-22 · 미지정이면 즉시 죽는다)

API_BASE = _env.api_base()
LIVE_DOC = os.environ.get("FKT_PROBE_DOC", "DOC-SOP-0014")

# 자극 5종 — 「SQL 조각이 질의 문자열로 들어온다」의 대표형.
PAYLOADS = [
    ("주석 종결", "' OR 1=1 --"),
    ("union select", "x' UNION SELECT id, body FROM document_chunk --"),
    ("파괴 구문", "'; DROP TABLE document_chunk; --"),
    ("스키마 캐묻기", "' UNION SELECT table_name FROM information_schema.tables --"),
    ("스택 질의", "1; SELECT pg_sleep(5); --"),
]

# 내부가 새는 표지 — 되비침(요청 문자열 반사)과 구분한다. 반사는 관측, 이쪽은 판정이다.
LEAK = [
    ("traceback", re.compile(r"Traceback \(most recent call last\)")),
    ("드라이버", re.compile(r"asyncpg|psycopg|SQLSTATE|InvalidTextRepresentation|UndefinedTable")),
    ("파일 경로", re.compile(r"[A-Za-z]:[\\/]|/usr/|/srv/|site-packages")),
    ("스키마 조각", re.compile(r"\bFROM\s+(document_chunk|information_schema)\b", re.I)),
]


class DrillError(RuntimeError):
    """측정 불가 — 결과가 아니다."""


def call(method: str, path: str, body: dict | None = None) -> tuple[int, str]:
    body, carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(carry)
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def approved_question() -> str:
    """🔴 승인 질문을 «옮겨 적지» 않는다 — 목록이 바뀌면 대조군이 조용히 낡는다."""
    status, raw = call("GET", "/api/scenarios")
    if status != 200:
        raise DrillError(f"/api/scenarios 가 {status} 를 냈다 — 대조군을 세울 수 없다")
    data = json.loads(raw)
    items = data if isinstance(data, list) else data.get("scenarios", [])
    for it in items:
        for key in ("question", "questions"):
            v = it.get(key)
            if isinstance(v, str) and v.strip():
                return v
            if isinstance(v, list) and v and isinstance(v[0], str):
                return v[0]
    raise DrillError("승인 질문을 한 개도 못 찾았다 — 대조군을 세울 수 없다")


def compare(question: str) -> tuple[int, str]:
    return call("POST", "/api/retrieval/compare",
                {"sessionId": "levi2-t52-sql", "question": question,
                 "strategies": ["vector", "hybrid", "graphrag"]})


def doc_size() -> int:
    status, raw = call("GET", f"/api/documents/{LIVE_DOC}")
    if status != 200:
        raise DrillError(f"코퍼스 생존 기준선을 못 잡았다 — {LIVE_DOC} 가 {status}")
    return len(json.loads(raw).get("body") or "")


def leaks(text: str) -> list[str]:
    return [name for name, rx in LEAK if rx.search(text)]


def code_of(raw: str) -> str:
    try:
        return json.loads(raw).get("error", {}).get("code", "?")
    except Exception:
        return "?"


def main() -> int:
    _colocation.require(API_BASE)
    print(f"대상      : {API_BASE}")
    print(f"자극      : 질의 문자열 표면(POST /api/retrieval/compare · question) · SQL 조각 {len(PAYLOADS)}종")
    print("🔴 범위   : 이 그물은 «도달 여부»를 잰다 — 아래 사유 코드가 어느 문이 막았는지 말한다\n")

    bad = 0

    # ④ 대조군 먼저 — 계측기가 살아 있는지부터.
    ctrl_q = approved_question()
    status, raw = compare(ctrl_q)
    hits = 0
    if status == 200:
        try:
            hits = sum(len(r.get("hits") or []) for r in json.loads(raw))
        except Exception:
            hits = 0
    ctrl_ok = status == 200 and hits > 0
    bad += 0 if ctrl_ok else 1
    print(f"  {'PASS' if ctrl_ok else 'FAIL'}  대조군 — 승인 질문은 통과한다            {status} · hits {hits}")
    if not ctrl_ok:
        print("  🔴 대조군이 죽었다 — 아래 «전건 거절»은 판정이 아니다(문이 아니라 벽일 수 있다)")

    before = doc_size()
    reflected = 0

    for i, (what, payload) in enumerate(PAYLOADS, start=1):
        status, raw = compare(payload)
        found = leaks(raw)
        reflected += 1 if payload[:16] in raw else 0
        ok = (status < 500) and (status != 200) and not found
        bad += 0 if ok else 1
        why = f"{code_of(raw)}"
        if status >= 500:
            why += " · 🔴 5xx"
        if status == 200:
            why += " · 🔴 결과를 냈다"
        if found:
            why += " · 🔴 내부 노출 " + ",".join(found)
        print(f"  {'PASS' if ok else 'FAIL'}  Q-{i:02} {what:14} {status} {why}")

    print(f"\n  관측(판정 아님)  오류 message 가 요청 문자열을 되비친 건수 {reflected}/{len(PAYLOADS)}")

    after = doc_size()
    intact = after == before
    bad += 0 if intact else 1
    print(f"  {'PASS' if intact else 'FAIL'}  대상 생존 — {LIVE_DOC} 본문 {after}자 (던지기 전 {before}자)")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
