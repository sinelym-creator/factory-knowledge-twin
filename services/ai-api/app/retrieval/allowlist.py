"""승인 질문 allowlist — 계약 v0.1 「question 은 «승인 시나리오 질문 목록» 내 선택」.

🔴 **이 목록은 손으로 옮겨 적은 것이다**(오케 판정 08-30 ⓑ). 정본은

    benchmarks/datasets/eval-questions-draft.md (v0.2) §2 문항 상세의 「질문」 행 10건

이며, 정본이 개정되면 이 파일은 «조용히» 낡는다 — 낡아도 서비스는 아무 오류 없이 돌기
때문에 사람 눈으로는 발견되지 않는다. 그래서 대조를 자동화해 두었다:

    python -m tools.verify_allowlist      # 정본에서 다시 뽑아 이 목록과 대조 · 불일치 exit 1

표면이 자라면(질문 추가·문항 개정) 이 목록도 함께 자라야 한다. 대조 도구가 그 사실을
말해 주는 자리다.

🔴 목록 밖 질문은 «명시 거부»한다(계약 오류 스키마). 비슷한 질문으로 조용히 바꿔 실행하는
   폴백을 두지 않는다 — 그러면 화면은 자기가 묻지 않은 질문의 답을 보게 된다.
"""

from __future__ import annotations

import re
import unicodedata

# 정본 문항 ID → 질문 원문(정본 표기 그대로 · 마크다운 강조·백틱 포함).
# 순서는 정본 §1 문항 구성표의 1~10번과 같다.
APPROVED_QUESTIONS: dict[str, str] = {
    "Q-DIRECT-001": (
        "`EQ-CNC-204`의 진동 센서 경보 임계값은 얼마이며, 그 임계를 초과해 실제로 발생한 "
        "알람은 무엇이고 관측값은 얼마였는가?"
    ),
    "Q-DIRECT-002": (
        "`SOP-BRG-INSP-014`(베어링 점검 절차)가 요구하는 필수 공구와 예상 작업 시간은 무엇인가?"
    ),
    "Q-DIRECT-003": (
        "`SOP-BRG-INSP-014`에 대해 **지금 인용할 수 있는** revision은 무엇인가? "
        "이전 revision과 내용이 다른 부분이 있다면 무엇인가?"
    ),
    "Q-MULTIHOP-001": (
        "알람 `AL-20260826-0041`이 발생했다. 이 알람에서 출발해 관련 설비·부품·고장 모드·"
        "대응 절차·필수 안전 규정까지 이어지는 경로 전체를 제시하라."
    ),
    "Q-MULTIHOP-002": (
        "`EQ-CNC-204`에 과거 유사한 정비 이력이 있는가? 있다면 그 이력이 다룬 고장 모드와, "
        "그 이력을 낳은 작업지시서·Incident는 무엇인가?"
    ),
    "Q-MULTIHOP-003": (
        "`EQ-CNC-204`와 연결된 고장 모드 중 대응 SOP가 매핑되지 않은 것이 있는가? "
        "있다면 무엇인가?"
    ),
    "Q-SAFETY-001": (
        "`CP-204-BRG-01` 베어링 점검·교체 작업을 시작하기 전에 반드시 적용해야 하는 "
        "안전 규정과 착용 PPE는 무엇인가?"
    ),
    "Q-SAFETY-002": (
        "작업지시서 `WO-2026-0113`이 참조하는 절차에 근거해, 이 작업지시서에 "
        "**반드시 포함되어야 하는 안전 규정**은 무엇인가? 그리고 이 작업지시서는 "
        "지금 바로 실행할 수 있는 상태인가?"
    ),
    "Q-UNANS-001": "작업지시서 `WO-2026-0113`을 수행하는 데 드는 **비용**은 얼마인가?",
    "Q-UNANS-002": "`EQ-CNC-999`의 최근 진동 추세는 어떠한가?",
}

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
