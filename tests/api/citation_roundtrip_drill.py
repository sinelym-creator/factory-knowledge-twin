"""citation_roundtrip_drill — 낸 근거를 자기가 «펴는가» (검증 좌석 · T2-2).

🔴 이 그물이 지키는 문장 둘:
   ① **compare 가 낸 evidenceId 는 전건 열린다.** 검색이 내놓은 인용을 조회가 404 로 답하면
      화면은 근거를 가리키는 링크를 눌렀을 때 빈손이 된다. T2-2 착수 시점의 `CP-204-BRG-01`
      이 그 자리였다(화이트리스트 누락 · 구현 성문 `app/ontology_tables.py`).
   ② **인용은 원문의 «그 문장»이다.** `excerpt` → `/evidence.text` → `/documents.body[start:end]`
      가 한 문장으로 이어져야 한다. 좌표가 틀려도 오류는 나지 않는다 — 화면만 엉뚱한 데를
      강조하고, 그 거짓은 조용히 산다.

🔴 그리고 **대조군이 판정의 절반이다.** 「전건 200」은 그 자체로는 아무것도 뜻하지 않는다.
   없는 것을 없다고 말하는지, 강조할 수 없는 좌표를 «조용히 버리지» 않는지를 함께 잰다.
   대조군 좌표는 상수로 적지 않고 **본 시험이 실제로 만난 chunk ID 에서 파생**한다 —
   코퍼스가 바뀌면 대조군도 따라 바뀌어야 한다.

🔴 구현을 import 하지 않는다. HTTP 표면만 상대한다(1대 계보 F-3). 질문도 구현의 allowlist 가
   아니라 정본(`benchmarks/datasets/eval-questions-draft.md`)에서 매 실행 내 파서로 뽑는다.

🔴 `--inject-drift` 는 **쓴다**(오케 승인 08-30). 자기 스택의 `document_chunk` 한 행에서
   `text` 한 칸을 원문과 어긋나게 만들어 「좌표는 옳은데 본문에서 못 찾는」 상태(③)를 세우고,
   원값으로 되돌린다. `document_revision.body`·`content_sha256`·`index_build`·임베딩·그래프는
   무접촉이다. 기본은 꺼져 있고, 타 좌석 스택에 겨누지 않는다.

전제: ai-api 기동 · 색인·그래프 적재 완료.

    python tests/api/citation_roundtrip_drill.py                 # 읽기만
    python tests/api/citation_roundtrip_drill.py --inject-drift  # + 정합 파열 주입(원복 포함)

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류(그물이 죽었거나 대상이 없다)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)
import _ownership  # noqa: E402  — 🔴 Q-62 2단 안전장치(남의 스택 무접촉)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "benchmarks" / "datasets" / "eval-questions-draft.md"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-roundtrip-drill"
STRATEGIES = ["vector", "hybrid", "graphrag"]
PG_CONTAINER = os.environ.get("FKT_PG_CONTAINER", "fkt-levi2-postgres-1")
PG_USER = os.environ.get("FKT_PG_USER", "fkt")
PG_DB = os.environ.get("FKT_PG_DB", "fkt")

_HEADING = re.compile(r"^###\s+(Q-[A-Z]+-\d+)\b", re.M)
_QUESTION = re.compile(r"^\|\s*\*\*질문\*\*\s*\|\s*(.+?)\s*\|\s*$", re.M)
# chunk ID 조성 = T0-6 §3.1 `{document}@r{N}#{NNN}`. 형상만 보고 kind 를 기대한다.
CHUNK_ID = re.compile(r"^(?P<doc>DOC-[A-Z]{3,4}-\d{4})@r(?P<rev>\d+)#(?P<idx>\d{3})$")


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


def source_questions() -> dict[str, str]:
    if not SOURCE.exists():
        raise DrillError(f"정본 없음: {SOURCE}")
    text = SOURCE.read_text(encoding="utf-8")
    qids = _HEADING.findall(text)
    blocks = re.split(r"^###\s+Q-[A-Z]+-\d+.*$", text, flags=re.M)[1:]
    found = {}
    for qid, block in zip(qids, blocks):
        match = _QUESTION.search(block)
        if match:
            found[qid] = match.group(1)
    if not found:
        raise DrillError("정본에서 문항을 0건 뽑았다 — 추출 규칙이 문서 형식과 어긋났다")
    return found


# ── HTTP ────────────────────────────────────────────────────────────────────


def _open(req: urllib.request.Request) -> tuple[int, object]:
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


def get(path: str) -> tuple[int, object]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 헤더가 비어 no-op 이다.
    return _open(urllib.request.Request(API_BASE + path,
                                        headers=_session.prepare(None, path)[1]))


def compare(question: str) -> list[dict]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 본문·헤더가 그대로다.
    _body, _carry = _session.prepare(
        {"sessionId": SESSION_ID, "question": question, "strategies": STRATEGIES}, "/api/retrieval/compare")
    payload = json.dumps(_body, ensure_ascii=False).encode("utf-8")
    _headers = {"Content-Type": "application/json"}
    _headers.update(_carry)
    status, body = _open(
        urllib.request.Request(API_BASE + "/api/retrieval/compare",
                               data=payload, headers=_headers, method="POST"))
    if status != 200:
        raise DrillError(f"compare 가 {status} 를 냈다 — 대상이 아프다: {str(body)[:200]}")
    return body                                     # type: ignore[return-value]


def evidence_path(evidence_id: str) -> str:
    return "/api/evidence/" + urllib.parse.quote(evidence_id, safe="")


def flat(text: str) -> str:
    """`excerpt` 의 조성 — 공백을 접은 텍스트(계약 «미리보기»)."""
    return " ".join(text.split())


def excerpt_matches(exc: str, text: str) -> bool:
    core = exc[:-1] if exc.endswith("…") else exc
    return flat(text).startswith(core)


# ── 자기 검증 ────────────────────────────────────────────────────────────────


def self_check(pairs: list[tuple[str, str]]) -> None:
    """🔴 비교기가 «빨강을 낼 수 있는가»부터 — 통과만 하는 비교기는 아무것도 보증하지 않는다."""
    if len(pairs) < 2:
        raise DrillError("자기 검증에 쓸 chunk 가 2건도 없다")
    (id_a, text_a), (id_b, text_b) = pairs[0], pairs[1]
    if excerpt_matches(flat(text_a)[:40], text_a) is not True:
        raise DrillError("자기 검증 실패 — 같은 문장을 다르다고 판정한다")
    if excerpt_matches(flat(text_a)[:40], text_b) is not False:
        raise DrillError("자기 검증 실패 — 다른 문장을 같다고 판정한다")
    print(f"  자기 검증  {id_a} 의 앞머리를 {id_b} 본문에 걸면 어긋남으로 잡는다 — 비교기 살아 있음")


# ── 본 시험 ─────────────────────────────────────────────────────────────────


def round_trip(ids: dict[str, list[tuple[str, str, str]]]) -> tuple[int, list[tuple[str, str]]]:
    """compare 가 낸 evidenceId 를 전건 펴 본다. 반환: (어긋남 수, chunk (id, text) 목록)."""
    bad = 0
    chunks: list[tuple[str, str]] = []
    doc_bodies: dict[str, dict] = {}

    for evidence_id in sorted(ids):
        shape = CHUNK_ID.match(evidence_id)
        status, body = get(evidence_path(evidence_id))
        if status != 200:
            bad += 1
            code = body.get("error", {}).get("code") if isinstance(body, dict) else "?"
            print(f"  FAIL  {evidence_id:24} 펴지 못한다 — {status} {code}")
            continue

        assert isinstance(body, dict)
        want_kind = "doc-chunk" if shape else "record"
        problems: list[str] = []
        if body.get("kind") != want_kind:
            problems.append(f"kind={body.get('kind')} (ID 형상은 {want_kind})")

        if shape:
            text = body.get("text") or ""
            for _, strategy, exc in ids[evidence_id]:
                if not excerpt_matches(exc, text):
                    problems.append(f"{strategy} excerpt 가 본문 앞머리가 아니다")
                    break
            # 좌표는 «원문»(revision body) 기준이다 — 그 원문은 /documents 가 준다.
            doc_id = shape.group("doc")
            key = f"{doc_id}|{evidence_id}"
            if key not in doc_bodies:
                dstatus, dbody = get(
                    f"/api/documents/{doc_id}?highlight={urllib.parse.quote(evidence_id, safe='')}"
                )
                doc_bodies[key] = dbody if dstatus == 200 else {}
            preview = doc_bodies[key]
            span = (preview or {}).get("highlight")
            if not span:
                problems.append("/documents 가 강조 좌표를 주지 않는다")
            else:
                cut = (preview.get("body") or "")[span["start"]:span["end"]]
                if cut != text:
                    problems.append("body[start:end] 가 chunk 원문과 다르다 — 엉뚱한 자리를 강조한다")
                if span.get("chunkId") != evidence_id:
                    problems.append(f"강조 chunkId 가 다르다({span.get('chunkId')})")
            if not problems:
                chunks.append((evidence_id, text))
        else:
            record = body.get("record")
            if not isinstance(record, dict) or not record.get("entityType"):
                problems.append("record 실체가 없다")
            elif record.get("fields", {}).get("id") != evidence_id:
                problems.append(f"레코드 id 가 요청과 다르다({record.get('fields', {}).get('id')})")
            if body.get("stale") is not False:
                problems.append("record 배지가 false 상수가 아니다(계약 v0.1.1)")

        if problems:
            bad += 1
            print(f"  FAIL  {evidence_id:24} {' · '.join(problems)}")
    return bad, chunks


def controls(sample_chunk: str, other_doc_id: str) -> int:
    """🔴 없는 것을 «없다»고 말하는가 · 강조할 수 없는 좌표를 «조용히 버리지» 않는가."""
    shape = CHUNK_ID.match(sample_chunk)
    if shape is None:
        raise DrillError(f"대조군 파생에 쓸 chunk 형상이 아니다: {sample_chunk}")
    doc, rev, idx = shape.group("doc"), int(shape.group("rev")), shape.group("idx")

    absent_rev = f"{doc}@r{rev + 7}#{idx}"                  # 없는 revision
    absent_idx = f"{doc}@r{rev}#999"                        # 있는 revision · 없는 chunk
    older_rev = f"{doc}@r{rev - 1}#000" if rev > 1 else None  # 낡은 revision 좌표
    other_doc = None if other_doc_id == doc else f"{other_doc_id}@r1#000"

    cases: list[tuple[str, str, str, int, str | None]] = [
        ("C-01", "없는 revision 의 chunk", evidence_path(absent_rev), 404, "not_found"),
        ("C-02", "있는 revision · 없는 index", evidence_path(absent_idx), 404, "not_found"),
        ("C-03", "없는 record", evidence_path("EQ-CNC-999"), 404, "not_found"),
        ("C-04", "화이트리스트 밖 prefix", evidence_path("ZZ-CNC-204"), 404, "not_found"),
        ("C-05", "없는 문서", "/api/documents/DOC-ZZZ-9999", 404, "not_found"),
        ("C-06", "highlight 형식 위반", f"/api/documents/{doc}?highlight=garbage", 400, "highlight_mismatch"),
        # 🔴 아래 둘이 「조용한 200」을 겨눈다 — 강조를 요청했는데 강조 없는 문서를 받으면
        #    화면은 «왜 없는지» 알 수 없다(구현 성문 `app/reading/documents.py` 머리말).
        ("C-07", "highlight = 있는 revision · 없는 index",
         f"/api/documents/{doc}?highlight={urllib.parse.quote(absent_idx, safe='')}", 400, None),
    ]
    if older_rev:
        cases.append(
            ("C-08", "highlight = chunk 없는 낡은 revision",
             f"/api/documents/{doc}?highlight={urllib.parse.quote(older_rev, safe='')}", 400, None)
        )
    if other_doc:
        cases.append(
            ("C-09", "highlight = 타 문서 chunk",
             f"/api/documents/{doc}?highlight={urllib.parse.quote(other_doc, safe='')}", 400, "highlight_mismatch")
        )

    bad = 0
    for cid, what, path, want, want_code in cases:
        status, body = get(path)
        code = body.get("error", {}).get("code") if isinstance(body, dict) else None
        ok = status == want and (want_code is None or code == want_code)
        bad += 0 if ok else 1
        got = code if code else f"강조={((body or {}).get('highlight') if isinstance(body, dict) else None)}"
        print(f"  {'PASS' if ok else 'FAIL'}  {cid} {what:32} {status} {got}  (기대 {want})")
    return bad


def psql(sql: str) -> str:
    out = subprocess.run(
        ["docker", "exec", PG_CONTAINER, "psql", "-U", PG_USER, "-d", PG_DB, "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if out.returncode != 0:
        raise DrillError(f"psql 실패: {(out.stderr or '').strip()[:200]}")
    return (out.stdout or "").strip()


def integrity_drift(target: str, control: str) -> int:
    """🔴 ③ — 좌표는 옳은데 «본문에서 못 찾는» 경우. 조용한 null 로 넘어가지 않는가.

    입력으로는 못 만든다(현 데이터 59/59 가 본문에서 유일하게 발견된다). 만들 수 있는 것은
    «상태»다 — 색인 산출물(`document_chunk.text`) 한 칸을 원문과 어긋나게 두면 그게 ③ 의
    정의 그 자체다. `document_revision.body`·`content_sha256`·`index_build`·임베딩·그래프는
    건드리지 않는다.

    판정(오케 08-30): ①② 요청 좌표 오류 = 400 · **③ 정합 파열 = 5xx + 구분 코드**.
    요청자 잘못이 아니고, 계약이 약속한 인용 강조를 지킬 수 없는 응답에 200 을 주지 않는다.
    """
    original = psql(f"SELECT text FROM document_chunk WHERE id = '{target}'")
    if not original:
        raise DrillError(f"{target} 의 chunk 텍스트가 비어 있다 — 주입 대상이 못 된다")
    revision = target.rsplit("#", 1)[0]
    doc = CHUNK_ID.match(target).group("doc")
    hl = f"/api/documents/{doc}?highlight={urllib.parse.quote(target, safe='')}"
    ctl_doc = CHUNK_ID.match(control).group("doc")
    ctl_hl = f"/api/documents/{ctl_doc}?highlight={urllib.parse.quote(control, safe='')}"

    print(f"  대상    document_chunk[{target}].text ({len(original)}자)")
    print("  원값    🔴 저장했다 — 실패해도 이 값으로 되돌린다")

    before_status, before_body = get(hl)
    if before_status != 200 or not (before_body or {}).get("highlight"):
        raise DrillError("주입 «전»에 이미 강조가 없다 — 전이를 잴 수 없다")
    fresh_before = psql(f"SELECT freshness FROM v_index_freshness WHERE revision_id = '{revision}'")
    print(f"  주입 전  /documents 강조 있음 · freshness={fresh_before}")

    bad = 0
    try:
        psql(
            "UPDATE document_chunk SET text = text || '⟪levi2-drift-probe⟫' "
            f"WHERE id = '{target}'"
        )
        # 🔴 두 라우트를 «같은 잣대»로 잰다(오케 판정 08-30 — /evidence ③ 포함 확정).
        #    근거: 계약 v0.1.1 이 doc-chunk 에 약속한 것이 「원문 + 강조 offset」이고,
        #    인용 실체의 정합 파열은 /documents 와 같은 사건이다. 결정 근거였던 「배지가
        #    이 파열을 못 본다」(아래 I-07)가 /evidence 에도 똑같이 성립한다.
        seen: dict[str, tuple[int, str | None]] = {}
        index = 0
        for route, path in (("/documents", hl), ("/evidence", evidence_path(target))):
            status, body = get(path)
            code = (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None
            raw = json.dumps(body, ensure_ascii=False)
            leaked = any(m in raw.lower() for m in ("traceback", "site-packages", "asyncpg", "/usr/"))
            seen[route] = (status, code)
            shown = code or f"강조={(body or {}).get('highlight')}"
            print(f"  주입 후  {route} → {status} {shown}")
            for name, ok in (
                (f"{route} 조용한 200 이 아니다", status != 200),
                (f"{route} 5xx 로 운다(오케 판정 ③)", 500 <= status < 600),
                (f"{route} 구분 코드다(internal_error 아님)", bool(code) and code != "internal_error"),
                (f"{route} 내부 경로·traceback 비노출", not leaked),
            ):
                index += 1
                bad += 0 if ok else 1
                print(f"  {'PASS' if ok else 'FAIL'}  I-{index:02} {name}")

        same = seen["/documents"] == seen["/evidence"]
        bad += 0 if same else 1
        index += 1
        print(f"  {'PASS' if same else 'FAIL'}  I-{index:02} 한 사건을 한 코드로 말한다 — "
              f"{' · '.join(f'{k} {v[0]} {v[1]}' for k, v in seen.items())}")

        # 🔴 덤(오케 지시) — sha 축은 무접촉이라 freshness 는 FRESH 로 남는다.
        #    「신선도가 chunk 수준 drift 를 못 본다」가 ③ 판정이 존재하는 이유다.
        fresh_during = psql(
            f"SELECT freshness FROM v_index_freshness WHERE revision_id = '{revision}'"
        )
        blind = fresh_during == "FRESH"
        bad += 0 if blind else 1
        index += 1
        print(f"  {'PASS' if blind else 'FAIL'}  I-{index:02} freshness 는 이 drift 를 못 본다 — "
              f"{fresh_during} (배지만으로는 잡히지 않는 파열이라 ③ 이 필요하다)")

        ctl_status, ctl_body = get(ctl_hl)
        ctl_ev_status, _ = get(evidence_path(control))
        intact = ctl_status == 200 and bool((ctl_body or {}).get("highlight")) and ctl_ev_status == 200
        bad += 0 if intact else 1
        index += 1
        print(f"  {'PASS' if intact else 'FAIL'}  I-{index:02} 무접촉 대조군은 그대로다 — "
              f"{control} /documents {ctl_status} · /evidence {ctl_ev_status}")
    finally:
        psql(
            "UPDATE document_chunk SET text = replace(text, '⟪levi2-drift-probe⟫', '') "
            f"WHERE id = '{target}'"
        )
        back = psql(f"SELECT text FROM document_chunk WHERE id = '{target}'")
        status, body = get(hl)
        rewound = back == original and status == 200 and bool((body or {}).get("highlight"))
        bad += 0 if rewound else 1
        print(f"  {'PASS' if rewound else 'FAIL'}  I-0 되감기 — 원문 일치 {back == original} · 강조 복귀 {status}")
    return bad


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    parser = argparse.ArgumentParser()
    parser.add_argument("--inject-drift", action="store_true",
                        help="색인↔원문 정합 파열 주입(쓴다 · 원복 포함)")
    args = parser.parse_args()

    questions = source_questions()
    print(f"정본      : {SOURCE.relative_to(REPO)}")
    print(f"대상      : {API_BASE} · 문항 {len(questions)}건 × 전략 {len(STRATEGIES)}\n")

    ids: dict[str, list[tuple[str, str, str]]] = {}
    for qid, question in questions.items():
        for result in compare(question):
            for hit in result["hits"]:
                ids.setdefault(hit["evidenceId"], []).append((qid, result["strategy"], hit["excerpt"]))
    if not ids:
        # 🔴 빈 결과끼리의 일치는 일치가 아니다(7대 유언). 왕복할 것이 없으면 «측정 불가»다.
        raise DrillError("compare 가 evidenceId 를 0건 냈다 — 초록이 아니라 고장이다")
    chunk_ids = [i for i in ids if CHUNK_ID.match(i)]
    print(f"  수집      고유 evidenceId {len(ids)}건 (chunk 형상 {len(chunk_ids)} · record 형상 {len(ids) - len(chunk_ids)})")
    if not chunk_ids:
        raise DrillError("chunk 형상 evidenceId 가 0건이다 — 문서 축이 죽었다")

    print("\n  ── ① 왕복 — 낸 근거를 펴고, 인용이 원문의 그 문장인가")
    bad, chunks = round_trip(ids)
    print(f"  왕복 {len(ids) - bad}/{len(ids)} 기대대로 · 어긋남 {bad}건")

    print()
    self_check(chunks)

    print("\n  ── ② 대조군 — 없는 것을 없다고 말하는가 · 조용히 버리지 않는가")
    # 🔴 개정된 문서를 고른다 — revision 이 둘 이상이라야 「낡은 revision 좌표」 대조군이 선다.
    sample = next((i for i in sorted(chunk_ids) if int(CHUNK_ID.match(i).group("rev")) > 1),
                  sorted(chunk_ids)[0])
    sample_doc = CHUNK_ID.match(sample).group("doc")
    other = next((CHUNK_ID.match(i).group("doc") for i in sorted(chunk_ids)
                  if CHUNK_ID.match(i).group("doc") != sample_doc), "")
    bad += controls(sample, other or sample_doc)

    if args.inject_drift:
        # 🔴 Q-62 — 남의 DB 한 칸이라도 «쓰기» 전에 소유 확인. 원복해도 남의 측정은 이미 흔들린다.
        _ownership.own_container("FKT_PG_CONTAINER", "한 칸을 손질했다 되돌릴 postgres")
        print("\n  ── ③ 정합 파열 — 좌표는 옳은데 본문에서 못 찾을 때(주입 · 원복한다)")
        target = sorted(chunk_ids)[0]
        control = next(
            (i for i in sorted(chunk_ids)
             if CHUNK_ID.match(i).group("doc") != CHUNK_ID.match(target).group("doc")),
            None,
        )
        if control is None:
            raise DrillError("무접촉 대조군으로 쓸 타 문서 chunk 가 없다")
        bad += integrity_drift(target, control)

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
