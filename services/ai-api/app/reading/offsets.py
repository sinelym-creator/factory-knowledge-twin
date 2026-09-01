"""인용 문장이 원문에서 놓인 자리 — 강조 좌표 산출 (T2-2).

`document_chunk` 에는 offset 열이 없다. 색인은 chunk 텍스트만 저장하므로, 「이 chunk 가
원문 어디였는가」는 **원문 대조로 되찾아야** 한다.

착수 전 실측(E1 · 2026-08-30 · chunk 59건):

| 축 | 결과 |
|---|---|
| chunk 텍스트가 `document_revision.body` 에서 그대로 발견 | 59/59 |
| body 안에서 «정확히 1회»만 등장 | 59/59 |
| 인접 chunk 사이 간격 | 14쌍 전부 gap 0 (원문을 빈틈없이 덮는다) |

🔴 그럼에도 «앞에서부터 순차»로 찾는다 — `body.find(text)` 한 방으로 끝내지 않는다.
   위 「1회만 등장」은 **동결 정책이 `overlap_ratio=0` 이라서** 참이다. overlap 이 켜지면
   같은 문장이 두 chunk 에 들어가고, 그때 단순 `find` 는 둘 다 «첫 자리»를 가리켜 뒤 chunk 의
   좌표가 조용히 틀린다. 지금 맞는 값을 정책 하나로 잃지 않게, 이전 chunk 가 끝난 자리
   이후부터 찾는다(revision 당 chunk 는 최대 8개라 비용은 없다).
"""

from __future__ import annotations

from dataclasses import dataclass

from ..errors import CitationIntegrityBroken


@dataclass(frozen=True)
class Span:
    start: int
    end: int


def locate(body: str, chunk_texts: list[str], target_index: int) -> Span | None:
    """`chunk_texts` 를 chunk_index 순으로 받아 `target_index` 번째의 원문 좌표를 낸다.

    찾지 못하면 None — 🔴 그때 «0» 이나 «전체 범위» 같은 그럴듯한 값을 지어내지 않는다.
    좌표가 틀리면 화면은 엉뚱한 문장을 인용으로 강조하고, 그 거짓은 오류 없이 살아남는다.
    """
    cursor = 0
    for index, text in enumerate(chunk_texts):
        found = body.find(text, cursor)
        if found < 0:
            # 이 chunk 를 못 찾았다 — 뒤 chunk 의 좌표도 믿을 수 없으니 여기서 멈춘다.
            return None
        if index == target_index:
            return Span(start=found, end=found + len(text))
        cursor = found + len(text)
    return None


def locate_cited(
    body: str,
    chunk_texts: list[str],
    target_index: int,
    *,
    chunk_id: str,
    revision_id: str,
) -> Span:
    """`locate` 와 같되 **None 을 돌려주지 않는다** — 못 찾으면 운다.

    🔴 **인용을 내보내는 모든 경로는 이것을 쓴다**(`/documents` · `/evidence`). 소비처마다
       `if span is None` 을 각자 적기로 하면 새 소비처가 생길 때 «적기를 잊는» 자리가 다시
       생기고, 잊은 자리는 조용한 200 으로 나타나 사람 눈에 안 띈다 — 실제로 그렇게
       두 라우트가 같은 병을 앓았다(V-6 ③ · 검증 실측 I-01~I-03).

    호출 전제: `target_index` 가 `chunk_texts` 범위 «안»이어야 한다. 범위 밖은 「요청 좌표가
    틀렸다」(400)라 정합 파열과 다른 사건이고, 그 판정은 호출부가 먼저 한다 — 여기서 섞으면
    사유를 말할 수 없다.
    """
    span = locate(body, chunk_texts, target_index)
    if span is None:
        raise CitationIntegrityBroken(
            f"{chunk_id}: chunk 텍스트를 revision {revision_id} body 에서 찾지 못했다"
        )
    return span
