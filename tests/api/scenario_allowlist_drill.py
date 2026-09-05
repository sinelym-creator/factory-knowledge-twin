"""scenario_allowlist_drill — 화면이 받은 질문을 서버가 «자기 질문»으로 인정하는가 (검증 좌석 · T2-2).

🔴 이 그물이 지키는 문장 둘 — 둘은 «다른 것»이고, 하나만으로는 판정이 안 선다:
   ① **이원화 없음.** `GET /scenarios` 가 내는 질문은 compare 의 allowlist 와 같은 한 벌이다.
      두 목록이 따로 자라면 화면은 `/scenarios` 에서 받은 문자열을 그대로 보냈다가
      `400 question_not_approved` 를 맞는다 — 서버가 자기 자신과 어긋나는 자리다.
   ② **관문은 여전히 닫혀 있다.** ①만 재면 「목록을 통째로 열어 두어도 초록」이다.
      allowlist 는 «보안 통제»(계약 v0.1 · 임의 질의 경로 차단)이므로, 목록 «밖»이
      거부되는 것까지 봐야 ①의 초록이 뜻을 갖는다.

🔴 목록의 정본은 구현이 아니라 `benchmarks/datasets/eval-questions-draft.md` 다. 매 실행
   내 파서로 다시 뽑아 세 벌(정본 · /scenarios · compare 승인)을 삼각 대조한다. 구현의
   allowlist 를 입력으로 쓰면 「같은 목록끼리 맞다」만 확인하게 된다.

🔴 교차 대조군은 «비슷하지만 다른» 것들이다 — 낱말 하나 바꾼 질문 · 접두 부분문자열 ·
   접미 추가 · 빈 문자열 · SQL/Cypher 조각. 전부 400 이라야 관문이 문자열 동일성으로
   닫혀 있다고 말할 수 있다(계약 §16.2 임의 질의 금지).

전제: ai-api 기동. 색인은 필요 없다 — 관문만 본다(hits 수는 «생존 신호»로만 쓴다).

    python tests/api/scenario_allowlist_drill.py

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)
import _env  # noqa: E402  — 공용 «대상 주소» 게이트(O-22 · 미지정이면 즉시 죽는다)

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "benchmarks" / "datasets" / "eval-questions-draft.md"
API_BASE = _env.api_base()
SESSION_ID = "levi2-scenario-drill"

_HEADING = re.compile(r"^###\s+(Q-[A-Z]+-\d+)\b", re.M)
_QUESTION = re.compile(r"^\|\s*\*\*질문\*\*\s*\|\s*(.+?)\s*\|\s*$", re.M)
_MARKUP = re.compile(r"[`*]")
_SPACES = re.compile(r"\s+")


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


def fold(text: str) -> str:
    """표기 차이만 접는다 — 정본과 화면 문자열을 같은 잣대로 세우기 위한 것이며,
    낱말은 하나도 바꾸지 않는다(구현의 normalize 와 «같은 규칙을 내가 다시 쓴 것»이다)."""
    return _SPACES.sub(" ", _MARKUP.sub("", unicodedata.normalize("NFC", text))).strip()


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


def get(path: str) -> tuple[int, object]:
    try:
        # 🔴 여기가 어댑터 «밖»이었다 — 가드 착지 순간 /scenarios 가 401 로 죽었고,
        #    그 빨강은 대상의 것이 아니었다. 운반 경로로 합류시킨다.
        _req = urllib.request.Request(API_BASE + path,
                                      headers=_session.prepare(None, path)[1])
        with urllib.request.urlopen(_req, timeout=60) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, {"_raw": exc.read().decode("utf-8", "replace")[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def ask(question: str) -> tuple[int, str, int]:
    """(status, code, hits) — 관문 통과 여부와 «생존 신호»."""
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 본문·헤더가 그대로다.
    _body, _carry = _session.prepare(
        {"sessionId": SESSION_ID, "question": question, "strategies": ["vector"]}, "/api/retrieval/compare")
    payload = json.dumps(_body, ensure_ascii=False).encode("utf-8")
    _headers = {"Content-Type": "application/json"}
    _headers.update(_carry)
    req = urllib.request.Request(
        API_BASE + "/api/retrieval/compare", data=payload, headers=_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            body = json.loads(res.read().decode("utf-8"))
            return res.status, "", sum(len(r["hits"]) for r in body)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw).get("error", {}).get("code", ""), 0
        except json.JSONDecodeError:
            return exc.code, raw[:60], 0


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    canon = source_questions()
    print(f"정본      : {SOURCE.relative_to(REPO)} · 문항 {len(canon)}건")
    print(f"대상      : {API_BASE}\n")

    status, scenarios = get("/api/scenarios")
    if status != 200 or not isinstance(scenarios, list) or not scenarios:
        raise DrillError(f"/scenarios 가 목록을 주지 않는다: {status} {str(scenarios)[:120]}")
    listed: list[str] = [q for s in scenarios for q in s.get("questions", [])]
    if not listed:
        raise DrillError("/scenarios 가 질문을 0건 실었다 — 화면이 질문을 얻을 자리가 없다")

    bad = 0

    print("  ── ① 이원화 — 정본 · /scenarios · compare 승인이 한 벌인가")
    shown = " · ".join(f"{s['scenarioId']}({len(s.get('questions', []))}문)" for s in scenarios)
    print(f"  시나리오  {shown}")
    only_source = {fold(v) for v in canon.values()} - {fold(q) for q in listed}
    only_listed = {fold(q) for q in listed} - {fold(v) for v in canon.values()}
    same = not only_source and not only_listed
    bad += 0 if same else 1
    print(f"  {'PASS' if same else 'FAIL'}  집합 일치 — 정본에만 {len(only_source)}건 · /scenarios 에만 {len(only_listed)}건")
    for extra in list(only_source)[:3]:
        print(f"        정본에만: {extra[:70]}")
    for extra in list(only_listed)[:3]:
        print(f"        /scenarios 에만: {extra[:70]}")

    print("\n  ── ② 화면이 받은 문자열 그대로 compare 에 보낸다")
    alive = 0
    for index, question in enumerate(listed, start=1):
        status, code, hits = ask(question)
        ok = status == 200
        bad += 0 if ok else 1
        alive += hits
        print(f"  {'PASS' if ok else 'FAIL'}  {index:2} {status} hits={hits:<3} {code:22} {question[:40]}")
    if alive == 0:
        # 🔴 빈 결과끼리의 일치는 일치가 아니다 — 관문만 열리고 뒤가 죽었으면 «측정 불가»다.
        raise DrillError("승인된 질문 전건이 hits 0 이다 — 초록이 아니라 고장이다")
    print(f"  생존 신호 — 승인 질문이 받은 hits 총 {alive}건 (0이면 초록이 아니라 고장이다)")

    print("\n  ── ③ 교차 대조군 — 목록 «밖»은 거부되는가 (관문이 닫혀 있는가)")
    base = listed[0]
    words = base.split()
    mutated = " ".join(words[:-1] + ["무엇인가?"]) if len(words) > 2 else base + "?"
    controls = [
        ("끝 낱말 교체", mutated),
        ("접두 부분문자열", base[: max(8, len(base) // 2)]),
        ("접미 추가", base + " 그리고 비용은 얼마인가?"),
        ("공백만", "   "),
        ("SQL 조각", "'; DROP TABLE document_chunk; --"),
        ("Cypher 조각", "MATCH (n) DETACH DELETE n"),
    ]
    for what, question in controls:
        status, code, _ = ask(question)
        ok = status == 400 and code == "question_not_approved"
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {what:16} {status} {code or '통과했다(!!)'}")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
