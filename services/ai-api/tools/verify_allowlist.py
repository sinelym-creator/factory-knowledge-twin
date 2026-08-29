"""승인 질문 allowlist ↔ 정본 대조 (T2-1).

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
_HEADING = re.compile(r"^###\s+(Q-[A-Z]+-\d+)")
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

    if problems:
        print("\n" + "\n".join(problems))
        print(f"\nFAIL: 불일치 {len(problems)}건 — allowlist 를 정본에 맞춰 고쳐라")
        return 1
    print(f"\nPASS: {len(expected)}문 전건 일치")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
