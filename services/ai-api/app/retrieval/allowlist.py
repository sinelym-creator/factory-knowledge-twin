"""승인 질문 allowlist — 계약 v0.1 「question 은 «승인 시나리오 질문 목록» 내 선택」.

🔴 **이 목록은 더 이상 손으로 옮겨 적지 않는다**(T5-1 선행 · v0.3 40문). 정본은

    benchmarks/datasets/questions.v0.3.jsonl (40문 · id·question)

이고, 앱은 그것을 그대로 복사한 **패키지 안 사본**(`approved_questions.v0.3.jsonl`)을 읽는다.
사본을 두는 이유는 `benchmarks/**` 가 검증 좌석의 트리라 배포 이미지에 들어가지 않기
때문이다 — 런타임이 그 경로에 의존하면 배포된 서비스가 목록을 못 읽는다.

두 파일이 갈라지는 것은 손이 아니라 그물이 막는다:

    pytest tests_unit/test_allowlist_source.py   # 정본 ↔ 사본 40/40 · 어긋나면 빨강

🔴 앞판에는 「`python -m tools.verify_allowlist` 로 대조한다」고 적혀 있었으나 **그 도구는
   이 리포에 없다**(`tools/` 디렉토리 자체가 없다 · 47대 grep 실측). 그래서 낡음 감지는
   위 테스트가 진다 — 문서가 가리키는 검사기가 실재하지 않으면 그 문장은 방어가 아니다.

표면이 자라면(질문 추가·문항 개정) **정본만 고치고 사본을 다시 복사한다.** 코드는 손대지
않는다 — 목록이 코드에 없기 때문이다.

🔴 목록 밖 질문은 «명시 거부»한다(계약 오류 스키마). 비슷한 질문으로 조용히 바꿔 실행하는
   폴백을 두지 않는다 — 그러면 화면은 자기가 묻지 않은 질문의 답을 보게 된다.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

#: 앱이 읽는 «사본» — 정본(`benchmarks/datasets/questions.v0.3.jsonl`)에서 그대로 복사한다.
#: 🔴 `benchmarks/**` 는 검증 좌석의 scope 다. 런타임이 그 트리를 읽으면 배포 이미지가
#:    검증 자산에 의존하게 되므로(그 디렉토리는 이미지에 없다) **사본을 앱 패키지 안에 둔다.**
#:    두 파일이 갈라지는 것은 `tests_unit/test_allowlist_source.py` 가 40/40 으로 막는다.
_SOURCE = Path(__file__).with_name("approved_questions.v0.3.jsonl")


def _load(path: Path) -> dict[str, str]:
    """문항 목록을 파일에서 읽는다 — 실패하면 **기동을 거부한다**.

    🔴 조용한 빈 목록을 두지 않는다. 목록이 비면 `resolve()` 가 전부 None 을 내고, 서비스는
       오류 없이 «모든 질문을 거부»하며 돈다 — 빨강이 아니라 «아무도 못 쓰는 초록»이다.
       그래서 부재·파손·0건·중복 id 를 전부 여기서 예외로 만든다(import 시점에 죽는다).
    🔴 값을 코드에 다시 박지 않는다(박은 값 0). 손으로 옮겨 적은 목록은 정본이 개정될 때
       조용히 낡고, 낡아도 서비스는 아무 오류 없이 돈다 — 앞판이 그 자리였다.
    """
    if not path.exists():
        raise RuntimeError(f"승인 질문 목록이 없다: {path}")

    questions: dict[str, str] = {}
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except ValueError as exc:
            raise RuntimeError(f"승인 질문 목록 {path}:{lineno} 를 읽을 수 없다") from exc
        qid, question = row.get("id"), row.get("question")
        if not isinstance(qid, str) or not isinstance(question, str) or not qid or not question:
            raise RuntimeError(f"승인 질문 목록 {path}:{lineno} 에 id·question 이 없다")
        if qid in questions:
            raise RuntimeError(f"승인 질문 목록 {path}:{lineno} 의 id 가 중복이다: {qid}")
        questions[qid] = question

    if not questions:
        raise RuntimeError(f"승인 질문 목록이 비었다: {path}")
    return questions


#: 문항 ID → 질문 원문(정본 표기 그대로 · 마크다운 강조·백틱 포함). 순서 = 정본 파일 순서.
APPROVED_QUESTIONS: dict[str, str] = _load(_SOURCE)

_MARKUP = re.compile(r"[`*]")
_SPACES = re.compile(r"\s+")


def normalize(question: str) -> str:
    """표기 차이만 흡수한다 — 의미는 건드리지 않는다.

    정본 질문에는 마크다운 강조(`**…**`)와 백틱이 섞여 있다. 화면이 그것을 평문으로
    보내는 것은 «다른 질문»이 아니라 «같은 질문의 다른 표기»다. 그래서 마크업 문자와
    공백 폭만 정규화하고, 낱말은 하나도 바꾸지 않는다(유사 질문 치환 금지).
    """
    text = unicodedata.normalize("NFC", question)
    return _SPACES.sub(" ", _MARKUP.sub("", text)).strip()


_BY_NORMALIZED: dict[str, str] = {normalize(v): k for k, v in APPROVED_QUESTIONS.items()}


def resolve(question: str) -> str | None:
    """승인 질문이면 그 문항 ID를, 아니면 None."""
    return _BY_NORMALIZED.get(normalize(question))


def canonical(qid: str) -> str:
    """그 문항의 «표준 표기» — 검색은 언제나 이것 하나로 돈다.

    🔴 왜 필요한가(V-1 계보): `normalize()` 가 「백틱을 지운 평문은 같은 질문」이라고
       승인하는데, 그 두 표기를 그대로 하류로 흘리면 **같다고 승인해 놓고 다르게 검색**한다.
       앵커 추출은 경계 조건으로 맞출 수 있지만, vector 축은 질의 «문자열 자체»가 임베딩
       입력이라 백틱 하나에도 순위가 흔들린다. 그래서 승인 시점에 표준 표기 하나로 모은다 —
       마크업을 지운 정본이 그것이다.

    🔴 이것은 «조용한 폴백»이 아니다. 목록 밖 질문은 여전히 400으로 거부되고(`resolve`
       가 None), 여기서 바뀌는 것은 이미 「같은 질문」으로 판정된 것의 표기뿐이다.
    """
    return normalize(APPROVED_QUESTIONS[qid])
