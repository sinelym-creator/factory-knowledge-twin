"""anchor_boundary_drill — 승인된 «같은 질문»의 표기 변형이 같은 답을 내는가 (검증 좌석 · T2-1).

🔴 이 그물이 지키는 문장 하나:
   **서비스가 「같은 질문」이라고 승인한 두 입력은 같은 hits 를 내야 한다.**

   `allowlist.normalize()` 는 백틱·강조·공백폭을 «표기 차이»로 흡수한다 — 즉 서비스 스스로
   두 입력을 같은 문항 ID 로 승인한다. 그런데 검색에 들어가는 것은 정규화된 문자열이 아니라
   «원문»이다. 그 사이가 벌어지면, 승인해 놓고 다른 답을 내게 된다.

   V-1(2026-08-30 적발): `_ID_RE` 끝의 `\\b` 가 한글 앞에서 성립하지 않아
   `EQ-CNC-204의` → `EQ-CNC` 로 잘렸다. graphrag 는 `200 OK` + 빈 hits, hybrid 는 구조화 축
   소실. **오류도 로그도 없었다.** 정본 10문 중 8문이 갈렸고 `Q-SAFETY-002` 에서는 안전 규정
   `SAF-LOTO-01` 이 통째로 사라졌다 — 평가 규약상 「경로가 맞아도 즉시 FAIL」인 그 누락이다.

🔴 구현의 검사기를 복창하지 않는다. 이 드릴은 `app.retrieval` 을 import 하지 않고 **HTTP 표면만**
   상대한다 — 대상 안에 결합한 도구는 대상이 바뀔 때 함께 죽는다(1대 계보 F-3).

🔴 세로열이 판정의 절반이다. 「갈렸다」만으로는 원인을 못 짚으므로 두 축으로 나눠 잰다:

   ① 변형 축 — 두 갈래 모두 서비스가 «같은 질문»으로 승인하는 표기다.
        plain    백틱+강조 제거 → ID 뒤에 한글 조사가 «붙는다»   (V-1 이 물린 자리)
        nobold   강조만 제거    → 백틱이 남아 ID 뒤는 여전히 «`» (대조군: 마크업 제거 자체는 무해)
      nobold 가 안 갈리는데 plain 만 갈리면, 원인은 「마크업을 지웠다」가 아니라 「ID 뒤가 조사다」다.

   ② 코퍼스 축 — 정본 10문 자체가 대조군을 갖고 있다. 백틱을 지워도 ID 뒤가 공백·괄호인 문항
      (`CP-204-BRG-01` 베어링… · `SOP-BRG-INSP-014`(베어링…)은 조사가 붙지 않는다. 이 문항들이
      «갈리지 않는 열»로 남아야 원인 귀속이 성립한다 — 전부 갈리면 원인이 다른 데 있다는 뜻이다.

🔴 표기 변형이 `question_not_approved`(400) 로 거부되면 그것은 실패가 아니라 «같은 질문이 아니다»는
   뜻이다. 동치류 밖을 비교하면 없는 결함이 생긴다 — 그런 변형은 세지 않고 따로 적는다.

전제: ai-api 기동(필수 · 기본값 없음(O-22)) · 색인·그래프 적재 완료.

    python tests/api/anchor_boundary_drill.py
    FKT_API_BASE=http://127.0.0.1:<내 포트> python tests/api/anchor_boundary_drill.py

exit: 0 = 전 변형 일치 · 1 = 갈림 1건 이상 · 2 = 실행 오류(드릴이 죽었거나 대상이 없다)
"""

from __future__ import annotations

import json
import os
import re
import sys
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
COMPARE = f"{API_BASE}/api/retrieval/compare"
SESSION_ID = "levi2-anchor-drill"
STRATEGIES = ["vector", "hybrid", "graphrag"]

# 정본 §2 문항 상세의 「질문」 행. 🔴 구현의 allowlist 를 입력으로 쓰지 않는다 —
# 같은 목록끼리 맞다는 것만 확인하게 된다.
_HEADING = re.compile(r"^###\s+(Q-[A-Z]+-\d+)\b", re.M)
_QUESTION = re.compile(r"^\|\s*\*\*질문\*\*\s*\|\s*(.+?)\s*\|\s*$", re.M)


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


def source_questions() -> dict[str, str]:
    if not SOURCE.exists():
        raise DrillError(f"정본 없음: {SOURCE}")
    text = SOURCE.read_text(encoding="utf-8")
    qids = _HEADING.findall(text)
    blocks = re.split(r"^###\s+Q-[A-Z]+-\d+.*$", text, flags=re.M)[1:]
    found: dict[str, str] = {}
    for qid, block in zip(qids, blocks):
        m = _QUESTION.search(block)
        if m:
            found[qid] = m.group(1)
    if not found:
        # 🔴 「0건 통과」를 만들지 않는다 — 빈 결과는 결과가 아니라 고장이다.
        raise DrillError("정본에서 문항을 0건 뽑았다 — 추출 규칙이 문서 형식과 어긋났다")
    return found


def variants(question: str) -> dict[str, str]:
    """정규화가 «같은 질문»으로 접어 주는 표기들. 낱말은 하나도 바꾸지 않는다."""
    return {
        "canonical": question,
        "plain": question.replace("`", "").replace("**", ""),
        "nobold": question.replace("**", ""),
    }


# 온톨로지 ID(대문자·숫자·하이픈) 바로 뒤에 한글이 오는가 — V-1 의 «원인 조건».
_ID_THEN_HANGUL = re.compile(r"[A-Z]{2,4}-[A-Z0-9-]+[가-힣]")


def particle_adjacent(text: str) -> bool:
    """백틱을 지웠을 때 ID 뒤에 조사가 «붙는» 문항인가(코퍼스 축 대조군 분류)."""
    return bool(_ID_THEN_HANGUL.search(text.replace("`", "").replace("**", "")))


class NotEquivalent(RuntimeError):
    """서비스가 이 표기를 «같은 질문»으로 승인하지 않았다 — 동치류 밖이다."""


def compare(question: str) -> dict[str, list[str]]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 본문·헤더가 그대로다.
    _body, _carry = _session.prepare(
        {"sessionId": SESSION_ID, "question": question, "strategies": STRATEGIES}, "/api/retrieval/compare")
    payload = json.dumps(_body).encode("utf-8")
    _headers = {"Content-Type": "application/json"}
    _headers.update(_carry)
    req = urllib.request.Request(COMPARE, data=payload, headers=_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            body = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        if e.code == 400 and "question_not_approved" in raw:
            raise NotEquivalent(raw[:160]) from e
        raise DrillError(f"compare 가 {e.code} 를 냈다 — 대상이 아프다: {raw[:200]}") from e
    except Exception as e:  # noqa: BLE001
        raise DrillError(f"compare 무응답 {COMPARE} — {type(e).__name__}: {e}") from e
    return {item["strategy"]: [h["evidenceId"] for h in item["hits"]] for item in body}


def self_check(questions: dict[str, str]) -> None:
    """🔴 이 그물이 «빨강을 낼 수 있는가»를 먼저 증명한다.

    서로 «다른» 두 승인 질문이 같은 hits 로 보이면 비교기가 죽은 것이다. 그 상태에서는
    아래 전건 초록이 「일치한다」가 아니라 「내가 아무것도 안 본다」를 뜻한다(5대 계보).
    """
    ids = list(questions)
    if len(ids) < 2:
        raise DrillError("자기 검증 불가 — 정본 문항이 2건 미만")
    a, b = compare(questions[ids[0]]), compare(questions[ids[3 % len(ids)]])
    if all(a[s] == b[s] for s in STRATEGIES):
        raise DrillError(
            f"자기 검증 실패 — 서로 다른 두 질문({ids[0]} · {ids[3 % len(ids)]})이 "
            "전 전략에서 같은 hits 로 보인다. 비교기가 죽었다"
        )
    print(f"  자기 검증  {ids[0]} ≠ {ids[3 % len(ids)]} 확인 — 비교기 살아 있음\n")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    try:
        questions = source_questions()
        print(f"정본      : {SOURCE.relative_to(REPO)}")
        print(f"대상      : {COMPARE} · 문항 {len(questions)}건 × 전략 {len(STRATEGIES)}\n")
        self_check(questions)
    except DrillError as e:
        print(f"실행 오류: {e}")
        return 2

    diverged: list[str] = []
    per_variant: dict[str, int] = {}
    skipped: list[str] = []
    live_hits = 0
    adjacent_split = {True: [0, 0], False: [0, 0]}     # 조사 인접 여부 → [갈린 문항, 전체 문항]
    try:
        for qid, question in questions.items():
            forms = variants(question)
            base = compare(forms["canonical"])
            # 🔴 빈 결과끼리는 언제나 «일치»한다. 그 초록은 「같은 답을 낸다」가 아니라
            #    「아무 답도 없다」다 — 실제로 한 번 물렸다: neo4j 재기동 직후 아직 질의를
            #    받지 못하는 창에서 전 문항 graphrag 가 0건이었고 이 그물은 초록이었다.
            #    vector 는 순수 유사도라 승인 질문에는 «반드시» 후보가 나온다. 그것을 생존 신호로 쓴다.
            if not base["vector"]:
                raise DrillError(
                    f"{qid}: vector 가 0건이다 — 색인이 비었거나 대상이 아직 질의를 못 받는다. "
                    "빈 결과끼리의 일치를 초록으로 읽지 않는다"
                )
            live_hits += sum(len(v) for v in base.values())
            adjacent = particle_adjacent(question)
            rows: list[str] = []
            for name, text in forms.items():
                if name == "canonical" or text == question:
                    continue
                try:
                    got = compare(text)
                except NotEquivalent as e:
                    skipped.append(f"{qid}/{name}")
                    rows.append(f"      SKIP {name:8} 동치류 밖 — 서비스가 같은 질문으로 안 본다: {e}")
                    continue
                for strategy in STRATEGIES:
                    if got[strategy] != base[strategy]:
                        diverged.append(f"{qid}/{name}/{strategy}")
                        per_variant[name] = per_variant.get(name, 0) + 1
                        rows.append(f"      FAIL {name:8} {strategy:9}")
                        rows.append(f"           정본 {base[strategy]}")
                        rows.append(f"           변형 {got[strategy]}")
            failed = any(r.lstrip().startswith("FAIL") for r in rows)
            adjacent_split[adjacent][1] += 1
            adjacent_split[adjacent][0] += 1 if failed else 0
            tag = "조사인접" if adjacent else "인접없음"
            print(f"  {'FAIL' if failed else 'PASS'}  {qid:16} [{tag}]")
            for row in rows:
                print(row)
    except DrillError as e:
        print(f"\n실행 오류: {e}")
        return 2

    print(f"\n결과: 문항 {len(questions)} · 갈림 {len(diverged)}건 · 동치류 밖 skip {len(skipped)}건")
    print(f"  생존 신호 — 기준 표기가 받은 hits 총 {live_hits}건 (0이면 초록이 아니라 고장이다)")
    print(f"  코퍼스 축 — ID 뒤 조사 «인접» 문항 {adjacent_split[True][0]}/{adjacent_split[True][1]} 갈림 · "
          f"«인접 없음» 문항 {adjacent_split[False][0]}/{adjacent_split[False][1]} 갈림")
    if per_variant:
        print("  변형 축 — " + " · ".join(f"{k} {v}" for k, v in sorted(per_variant.items())))
        print("  🔴 nobold 가 0 이고 plain 만 갈리면 원인은 «마크업 제거»가 아니라 «ID 뒤 조사 인접»이다")
        return 1
    print("  전 변형이 같은 hits — 승인한 「같은 질문」이 같은 답을 낸다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
