"""승인 질문 allowlist 가 «정본과 같은가» — T5-1 선행(v0.3 40문).

🔴 이 파일이 막는 것은 하나다: **앱이 읽는 사본이 정본에서 갈라지는 것.** 사본을 두는 이유는
   `benchmarks/**` 가 검증 좌석의 트리이고 배포 이미지에 없기 때문인데, 사본은 그 대가로
   «조용히 낡을 수 있다». 낡아도 서비스는 오류 없이 돌기 때문에 사람 눈에는 안 보인다.

🔴 **먼저 «몇 개를 봤는지»를 센다.** 두 파일이 «둘 다 비어» 있어도 집합 비교는 통과한다 —
   0 == 0 은 판정이 아니라 침묵이다. 그래서 40 이라는 수를 먼저 걸고 그 다음에 대조한다.

🔴 기존 10문의 «문면»은 여기서 얼려 두지 않는다. 문면을 이 파일에 다시 적으면 정본이 셋이
   되고(정본·사본·테스트), 그 순간 이 테스트가 지키려던 성질을 스스로 깬다. 여기서는
   **id 승계**만 걸고, 문면 불변은 개정 전/후를 같은 트리에서 대조해 확인했다(PR 본문 E1).

실행: `pytest tests_unit/test_allowlist_source.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.retrieval import allowlist

#: 정본 — 검증 좌석 트리. 🔴 **런타임이 아니라 «테스트»가 읽는다**(런타임 의존 0).
CANON = Path(__file__).resolve().parents[3] / "benchmarks" / "datasets" / "questions.v0.3.jsonl"

#: v0.2 에서 승계된 10문 — id 만 적는다(문면은 정본 하나뿐이어야 한다).
LEGACY_IDS = (
    "Q-DIRECT-001", "Q-DIRECT-002", "Q-DIRECT-003",
    "Q-MULTIHOP-001", "Q-MULTIHOP-002", "Q-MULTIHOP-003",
    "Q-SAFETY-001", "Q-SAFETY-002",
    "Q-UNANS-001", "Q-UNANS-002",
)

EXPECTED_COUNT = 40


def _canon_rows() -> dict[str, str]:
    assert CANON.exists(), f"정본이 없다: {CANON}"
    rows: dict[str, str] = {}
    for line in CANON.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        rows[row["id"]] = row["question"]
    return rows


def test_both_sides_carry_the_expected_count() -> None:
    """0건끼리의 비교가 초록으로 보이지 않게, 수를 먼저 건다."""
    assert len(_canon_rows()) == EXPECTED_COUNT
    assert len(allowlist.APPROVED_QUESTIONS) == EXPECTED_COUNT


def test_ids_match_in_both_directions() -> None:
    """한쪽에만 있는 id 가 없다 — 부분집합 검사는 «빠진 쪽»을 못 본다."""
    canon, app = set(_canon_rows()), set(allowlist.APPROVED_QUESTIONS)
    assert canon - app == set(), f"정본에만 있는 문항: {sorted(canon - app)}"
    assert app - canon == set(), f"사본에만 있는 문항: {sorted(app - canon)}"


def test_each_question_is_normalized_equal() -> None:
    """같은 id 의 질문이 «표기 정규화 후» 같다 — 마크업 차이는 같은 질문으로 친다."""
    canon = _canon_rows()
    mismatched = [
        qid
        for qid, text in canon.items()
        if allowlist.normalize(text) != allowlist.normalize(allowlist.APPROVED_QUESTIONS[qid])
    ]
    assert mismatched == []


def test_the_ten_inherited_ids_survived() -> None:
    """v0.2 의 10문은 id 가 그대로 남는다(V-1 계보 — 표면이 자라도 기존 것은 안 사라진다)."""
    missing = [qid for qid in LEGACY_IDS if qid not in allowlist.APPROVED_QUESTIONS]
    assert missing == []


def test_every_approved_question_resolves() -> None:
    """40문 전건이 자기 id 로 되돌아온다 — 「등재했다」와 「통과한다」는 다른 사실이다."""
    resolved = {qid: allowlist.resolve(text) for qid, text in allowlist.APPROVED_QUESTIONS.items()}
    wrong = {qid: got for qid, got in resolved.items() if got != qid}
    assert wrong == {}
    assert len(resolved) == EXPECTED_COUNT


def test_markup_and_spacing_variants_still_resolve() -> None:
    """백틱·강조·공백만 다른 표기는 같은 질문이다(`normalize` 의 계약)."""
    qid = LEGACY_IDS[0]
    original = allowlist.APPROVED_QUESTIONS[qid]
    plain = original.replace("`", "").replace("**", "")
    spaced = "  " + plain.replace(" ", "  ") + "  "
    assert allowlist.resolve(plain) == qid
    assert allowlist.resolve(spaced) == qid
    # 대조군 — 낱말을 바꾸면 통과하지 않는다(정규화가 «유사 질문 치환»이 아님을 가른다).
    assert allowlist.resolve(plain + " 그리고 비용은?") is None


def test_a_question_outside_the_list_is_refused() -> None:
    """목록 밖은 None — 이 None 이 `service.py` 의 400 `question_not_approved` 를 만든다."""
    assert allowlist.resolve("승인되지 않은 질문입니다") is None


def test_a_broken_source_refuses_to_load(tmp_path: Path) -> None:
    """부재·빈 파일·중복 id 는 «조용한 빈 목록»이 아니라 예외다(기동 거부)."""
    with pytest.raises(RuntimeError):
        allowlist._load(tmp_path / "없는파일.jsonl")

    empty = tmp_path / "empty.jsonl"
    empty.write_text("\n\n", encoding="utf-8")
    with pytest.raises(RuntimeError):
        allowlist._load(empty)

    dup = tmp_path / "dup.jsonl"
    dup.write_text(
        '{"id":"Q-1","question":"a"}\n{"id":"Q-1","question":"b"}\n', encoding="utf-8"
    )
    with pytest.raises(RuntimeError):
        allowlist._load(dup)

    broken = tmp_path / "broken.jsonl"
    broken.write_text("{ not json\n", encoding="utf-8")
    with pytest.raises(RuntimeError):
        allowlist._load(broken)
