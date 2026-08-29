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
