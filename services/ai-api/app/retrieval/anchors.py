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
_ID_RE = re.compile(rf"\b(?:{'|'.join(_PREFIXES)})-[A-Z0-9]+(?:-[A-Z0-9]+)*\b")


def extract(question: str) -> list[str]:
    """질문에 등장한 ID를 등장 순서대로(중복 제거). 없으면 빈 목록."""
    seen: dict[str, None] = {}
    for token in _ID_RE.findall(question):
        seen.setdefault(token, None)
    return list(seen)


def of_kind(anchors: list[str], prefix: str) -> list[str]:
    """앵커 중 특정 entity 종류만 — 예: `of_kind(a, "EQ")`."""
    return [a for a in anchors if a.startswith(f"{prefix}-")]
