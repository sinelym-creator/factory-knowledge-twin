"""질문에서 온톨로지 ID 앵커를 뽑는다 — hybrid·graphrag의 «구조화 축» 입구.

정본은 `docs/product/data-ontology-spec.md` §3.1 패턴표다. 여기서는 그 prefix 집합만
받아들인다 — 🔴 «아무 대문자 토큰»을 ID로 인정하면 질문의 낱말이 조회 키가 되어, 서버가
사용자 문자열로 조회 대상을 정하는 경로가 열린다. 인정 목록을 좁게 두는 것이 그 방어다.

추출된 앵커는 언제나 «파라미터»로만 쓴다(질의문 조립 금지 — 패키지 머리말 2).
"""

from __future__ import annotations

import re

# data-ontology-spec §3.1 의 entity prefix. DocumentRevision(`…@rN`)·DocumentChunk(`…#NNN`)는
# 질문에 직접 나오지 않으므로 여기서 다루지 않는다.
_PREFIXES = ("FAC", "LN", "EQ", "CP", "SN", "AL", "INC", "WO", "MR", "FM", "SOP", "SAF", "DOC")

# 🔴 경계를 «ID를 이룰 수 있는 문자가 이어지지 않는다»로 판정한다 — `\b` 가 아니다.
#    `\b` 는 «단어 문자(\w) ↔ 비단어» 전이를 보는데 **한글은 `\w` 에 든다**. 그래서
#    「`EQ-CNC-204`의 …」처럼 조사가 붙으면 끝의 `\b` 가 성립하지 않고, 정규식은 실패하는
#    대신 **뒤로 물러나 `EQ-CNC` 로 «성공»한다**. 실패가 아니라 «짧은 성공»이라 조용하다 —
#    잘린 ID는 실재하지 않아 조회가 0행이 되고, 화면에는 「근거 없음」으로만 보인다.
#    (V-1 · 검증 적발 · 정정 전 실측: 승인 질문 10문 중 **8문**이 두 표기에서 갈렸다.)
_BOUNDARY = "[A-Z0-9-]"
_ID_RE = re.compile(
    rf"(?<!{_BOUNDARY})(?:{'|'.join(_PREFIXES)})-[A-Z0-9]+(?:-[A-Z0-9]+)*(?!{_BOUNDARY})"
)


def extract(question: str) -> list[str]:
    """질문에 등장한 ID를 등장 순서대로(중복 제거). 없으면 빈 목록.

    🔴 **표기가 달라도 같은 앵커가 나와야 한다.** 승인 질문은 정본 표기(백틱·강조 포함)와
       평문 표기가 모두 「같은 질문」으로 통과한다(`allowlist.normalize`). 그러니 두 표기의
       추출 결과가 갈리면 그것은 곧 «승인해 놓고 다르게 대접하는» 것이다. 이 불변식은
       `python -m tools.verify_allowlist` 가 10문 전수로 지킨다(V-1 재발 그물).

    🔴 잘린 앵커가 «조용히» 성공하는 경로에 대하여: 근본 방어는 위 경계 조건이고, 조회
       0행을 오류로 만드는 방식은 **쓰지 않는다**. `EQ-CNC-999`(미존재 설비)처럼 0행이
       정답인 질문이 승인 목록에 실제로 있기 때문이다(Q-UNANS-002 · 환각 내성 문항).
       「0행 = 고장」은 «검사기가 무엇을 봤는가»에 적용할 규칙이지, 도메인 조회 결과에
       그대로 옮기면 정상적인 «없음»까지 고장으로 만든다.
    """
    seen: dict[str, None] = {}
    for token in _ID_RE.findall(question):
        seen.setdefault(token, None)
    return list(seen)


def of_kind(anchors: list[str], prefix: str) -> list[str]:
    """앵커 중 특정 entity 종류만 — 예: `of_kind(a, "EQ")`."""
    return [a for a in anchors if a.startswith(f"{prefix}-")]
