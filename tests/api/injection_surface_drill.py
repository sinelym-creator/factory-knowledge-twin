"""injection_surface_drill — 사용자 문자열이 «조회 대상을 고르지» 못하는가 (검증 좌석 · T2-2 보안).

🔴 이 그물이 지키는 문장: **경로 파라미터는 데이터일 뿐 질의의 «구조»가 되지 않는다.**
   baseline §16.2 · 계약 README 원칙3 은 임의 SQL·Cypher·코드 실행 경로를 Stop 조건으로
   둔다. T2-2 는 그 경계에 새 문을 셋 냈다 — `/evidence/{id}` · `/documents/{id}` ·
   `?highlight={chunkId}`. 이 셋 모두 **문자열로 테이블·행을 고르는 코드 근처**를 지난다
   (`ontology_tables.table_of()` 화이트리스트 → `SELECT * FROM {table} WHERE id = $1`).

   화이트리스트와 파라미터 바인딩이 그 자리를 지킨다고 «구현이 주장»한다. 이 드릴은 그
   주장을 밖에서 잰다 — 적대 입력 10종 × 문 3개 = 30 건이 **전부 계약 형상 4xx** 여야 하고,
   응답에 내부가 새면 안 된다.

🔴 판정 기준 셋(하나라도 어기면 red):
   ① 5xx 가 아니다 — 적대 입력이 서버를 «놀라게» 하면 그 자체가 통제 실패다.
   ② 200 이 아니다 — 없는 것을 찾았다고 답하면 문자열이 조회 대상을 고른 것이다.
   ③ 응답에 내부가 없다 — traceback · 파일 경로 · 드라이버 문구 · SQL 조각(공개 Sandbox §34.6).

🔴 **파괴적 payload 를 실제로 던진다**(`DROP TABLE …`). 던지는 곳은 HTTP 경로 파라미터이며,
   이것이 통과하면 그게 바로 결함이다. 마지막에 «코퍼스가 그대로인가»를 세어 확인한다 —
   초록을 말하기 전에 대상이 살아 있음을 실측한다.

    python tests/api/injection_surface_drill.py

exit: 0 = 전건 막힘 · 1 = 뚫림/누출 1건 이상 · 2 = 실행 오류
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
LIVE_DOC = "DOC-SOP-0014"

# 「내부가 샜다」의 표지 — 있으면 안 되는 문자열들.
LEAK_MARKERS = (
    "traceback", "site-packages", "asyncpg", "psycopg", "neo4j.exceptions",
    "select ", "from document_", "c:\\\\", "/usr/", "127.0.0.1:55", "password",
)

PAYLOADS: list[tuple[str, str]] = [
    ("SQL 주석 종결", "EQ-CNC-204'--"),
    ("SQL union", "EQ' UNION SELECT * FROM document_revision--"),
    ("SQL drop", "EQ-CNC-204'; DROP TABLE document_chunk;--"),
    ("시스템 테이블 지정", "pg_shadow"),
    ("경로 traversal", "../../etc/passwd"),
    ("인코딩 traversal", "..%2F..%2Fetc%2Fpasswd"),
    ("널바이트", "EQ-CNC-204%00"),
    ("초장문(4KB)", "EQ-" + "A" * 4000),
    ("유니코드 방향 제어", "EQ-CNC-204\u202e"),
    ("chunk 형상 + 주석", "DOC-SOP-0014@r2#001'--"),
]


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


def get(path: str) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(API_BASE + path, timeout=60) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def residue(body: str, payload: str) -> str:
    """🔴 응답이 «되돌려준 내 입력»은 누출이 아니다.

    처음 이 드릴을 돌렸을 때 `… UNION SELECT * FROM document_revision …` payload 가
    오류 message 에 그대로 실려 와, 누출 표지(`select `·`from document_`)에 걸려 red 3행이
    떴다. **내가 던진 문자열이 내 그물에 걸린 것**이지 대상이 흘린 것이 아니다.
    그래서 판정 전에 내 입력을 지운다 — 남은 것만 대상이 «스스로» 말한 것이다.
    """
    out = body
    for form in (payload, json.dumps(payload)[1:-1], urllib.parse.quote(payload, safe="")):
        out = out.replace(form, " ")
    return out


def verdict(status: int, body: str, payload: str = "") -> tuple[bool, str]:
    if status >= 500:
        return False, f"5xx — 적대 입력이 서버를 놀라게 했다({status})"
    if status == 200:
        return False, "200 — 문자열이 조회 대상을 골랐다"
    if not (400 <= status < 500):
        return False, f"4xx 가 아니다({status})"
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return False, "본문이 JSON 이 아니다"
    err = parsed.get("error") if isinstance(parsed, dict) else None
    if not isinstance(err, dict) or not err.get("code"):
        return False, "계약 오류 형상이 아니다"
    low = residue(body, payload).lower() if payload else body.lower()
    leaked = [m for m in LEAK_MARKERS if m in low]
    if leaked:
        return False, f"내부 누출: {'·'.join(leaked)}"
    return True, err["code"]


def self_check() -> None:
    """🔴 판정자가 «빨강을 낼 수 있는가»부터."""
    samples = [
        ((404, '{"error":{"code":"not_found","message":"없다"}}', ""), True, "막힌 응답"),
        ((500, '{"error":{"code":"internal_error","message":"x"}}', ""), False, "5xx"),
        ((200, '{"evidenceId":"x"}', ""), False, "200"),
        ((404, '{"error":{"code":"not_found","message":"asyncpg 오류: SELECT * FROM document_chunk"}}', ""),
         False, "내부 누출"),
        # 🔴 되돌아온 내 입력은 누출이 아니다 — 이 행이 없으면 그물이 자기 그림자를 문다.
        ((404, '{"error":{"code":"not_found","message":"evidence X UNION SELECT * FROM document_revision 를 찾을 수 없다"}}',
          "X UNION SELECT * FROM document_revision"), True, "반사된 payload"),
    ]
    for (status, body, payload), expected, what in samples:
        ok, why = verdict(status, body, payload)
        if ok is not expected:
            raise DrillError(f"자기 검증 실패 — {what} 을 {ok} 로 판정했다({why})")
    print("  자기 검증  표본 5종(막힘 2 · 이탈 3) 전건 기대대로 — 판정자 살아 있음\n")


def corpus_size() -> int:
    """대상이 살아 있는가 — 파괴적 payload 를 던진 뒤 세어 본다."""
    status, body = get(f"/api/documents/{LIVE_DOC}")
    if status != 200:
        raise DrillError(f"기준 문서를 읽지 못한다({status}) — 초록도 빨강도 아니다")
    return len(json.loads(body).get("body", ""))


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    print(f"대상      : {API_BASE}")
    print(f"적대 입력 : {len(PAYLOADS)}종 × 문 3 = {len(PAYLOADS) * 3}건\n")
    self_check()

    before = corpus_size()
    print(f"  기준선    {LIVE_DOC} 본문 {before}자 — 던지기 전 크기\n")

    doors = [
        ("EV", "GET /evidence/{id}", lambda p: "/api/evidence/" + urllib.parse.quote(p, safe="")),
        ("DC", "GET /documents/{id}", lambda p: "/api/documents/" + urllib.parse.quote(p, safe="")),
        ("HL", "?highlight={chunkId}",
         lambda p: f"/api/documents/{LIVE_DOC}?highlight=" + urllib.parse.quote(p, safe="")),
    ]

    bad = 0
    reflected = 0
    for tag, title, build in doors:
        print(f"  ── {title}")
        for index, (what, payload) in enumerate(PAYLOADS, start=1):
            status, body = get(build(payload))
            ok, why = verdict(status, body, payload)
            reflected += 1 if payload[:24] in body else 0
            bad += 0 if ok else 1
            print(f"  {'PASS' if ok else 'FAIL'}  {tag}-{index:02} {what:18} {status} {why}")

    # 🔴 판정 아님 — 성문해 두는 관측치. 오류 message 는 요청한 ID 를 그대로 되비춘다.
    #    JSON 응답이라 브라우저 실행 위험은 없으나, 4KB payload·방향 제어문자까지 되비친다.
    print(f"\n  관측(판정 아님)  오류 message 가 요청 문자열을 되비친 건수 {reflected}/{len(PAYLOADS) * 3}")

    after = corpus_size()
    intact = after == before
    bad += 0 if intact else 1
    print(f"\n  {'PASS' if intact else 'FAIL'}  대상 생존 — {LIVE_DOC} 본문 {after}자 (던지기 전 {before}자)")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
