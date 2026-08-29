"""승인 질문 allowlist 검사 — ① 정본 대조 ② 표기별 앵커 대조 (T2-1 · V-1 정정으로 축 추가).

    python -m tools.verify_allowlist        # 불일치 시 exit 1

🔴 왜 필요한가: `app/retrieval/allowlist.py` 의 10문은 정본을 손으로 옮겨 적은 것이다.
   정본(benchmarks/datasets/eval-questions-draft.md)이 개정돼도 서비스는 아무 오류 없이
   «옛 질문»을 승인하며 계속 돈다 — 사람 눈으로는 발견되지 않는 낡음이다. 이 도구가 그
   낡음을 «실행 가능한 실패»로 바꾼다(대조표 자동화 계보 · contract_surface.py 와 같은 취지).

🔴 기대 목록을 이 파일에 베껴 두지 않는다. 매 실행 정본에서 다시 뽑는다.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_DIR.parents[1]
SOURCE = REPO_ROOT / "benchmarks" / "datasets" / "eval-questions-draft.md"

# 정본 §2 문항 상세의 「질문」 행. 바로 앞의 `### Q-…` 제목이 그 문항의 ID다.
#
# 🔴 뒤 경계를 «ID를 이룰 수 있는 문자가 이어지지 않는다»로 잠근다(V-3 · V-1과 같은 병).
#    없으면 정본이 `### Q-SAFETY-002x` 로 개정돼도 이 도구는 `Q-SAFETY-002` 로 읽어 «일치»를
#    말한다 — **낡음을 잡는 도구가 낡음에 뚫려 있는** 꼴이다. 제목 뒤에는 `〔C-4로 재설계〕`
#    같은 주석이 붙으므로 `$` 로 잠글 수는 없고, 문자집합 경계라야 한다.
_HEADING = re.compile(r"^###\s+(Q-[A-Z]+-\d+)(?![0-9A-Za-z-])")
_QUESTION = re.compile(r"^\|\s*\*\*질문\*\*\s*\|\s*(.+?)\s*\|\s*$")


def source_questions() -> dict[str, str]:
    current: str | None = None
    found: dict[str, str] = {}
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        heading = _HEADING.match(line)
        if heading:
            current = heading.group(1)
            continue
        row = _QUESTION.match(line)
        if row and current:
            found[current] = row.group(1)
            current = None
    return found


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    sys.path.insert(0, str(SERVICE_DIR))
    from app.retrieval import anchors  # noqa: PLC0415
    from app.retrieval.allowlist import APPROVED_QUESTIONS, normalize  # noqa: PLC0415

    expected = source_questions()
    print(f"정본      : {SOURCE.relative_to(REPO_ROOT)}")
    print(f"정본 문항 : {len(expected)}개 · allowlist: {len(APPROVED_QUESTIONS)}개")
    if not expected:
        print("\nFAIL: 정본에서 문항을 0건 뽑았다 — 추출 규칙이 문서 형식과 어긋났다")
        return 1                      # 🔴 「0건 통과」를 만들지 않는다(빈 결과 = 고장)

    problems: list[str] = []
    for qid, text in expected.items():
        mine = APPROVED_QUESTIONS.get(qid)
        if mine is None:
            problems.append(f"  ✗ {qid} — 정본에 있으나 allowlist 에 없다")
        elif normalize(mine) != normalize(text):
            problems.append(f"  ✗ {qid} — 문구가 다르다\n      정본: {text}\n      코드: {mine}")
        else:
            print(f"  ✓ {qid}")
    for qid in APPROVED_QUESTIONS.keys() - expected.keys():
        problems.append(f"  ✗ {qid} — allowlist 에 있으나 정본에 없다(삭제된 문항?)")

    # --- 축 2: 표기가 달라도 같은 앵커가 나오는가 (V-1 재발 그물) ----------------------
    #
    # 🔴 왜 여기서 재는가: `normalize()` 가 「백틱·강조를 지운 평문은 같은 질문」이라고
    #    승인한다. 승인해 놓고 그 표기로는 한 번도 재지 않으면, 「`EQ-CNC-204`의」가 조사
    #    때문에 `EQ-CNC` 로 잘려도 아무도 모른다 — 잘린 ID는 실재하지 않아 조회가 0행이
    #    되고 화면에는 「근거 없음」으로만 보인다(V-1 · 정정 전 실측 8/10 갈림).
    #    잡은 자리를 그물로 남긴다: **승인한 모든 표기로 재는 것**이 그 그물이다.
    print("\n표기 대조 (정본 표기 ↔ 평문 표기 · 앵커 추출)")
    for qid, text in sorted(APPROVED_QUESTIONS.items()):
        as_written = anchors.extract(text)
        as_plain = anchors.extract(normalize(text))
        if as_written == as_plain:
            print(f"  ✓ {qid}  {as_written}")
        else:
            problems.append(
                f"  ✗ {qid} — 표기에 따라 앵커가 갈린다\n"
                f"      정본 표기: {as_written}\n      평문 표기: {as_plain}"
            )

    if problems:
        print("\n" + "\n".join(problems))
        print(f"\nFAIL: 불일치 {len(problems)}건")
        return 1
    print(f"\nPASS: {len(expected)}문 정본 일치 · 표기 대조 전건 일치")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
