"""GET /documents/{docId}?highlight={chunkId} — 문서 미리보기 + 인용 강조 (T2-2).

어느 revision 을 보여 주는가:
- `highlight` 가 주어지면 **그 chunk 가 속한 revision**. 인용은 특정 revision 의 문장이므로,
  현행본을 보여 주고 옛 문장을 강조하면 좌표가 어긋난다.
- 없으면 **현행 revision**(`document.current_revision_no`).

🔴 `highlight` 의 chunk 가 이 문서의 것이 아니면 강조를 «조용히 버리지» 않는다 — 400 으로
   거절한다. 버리면 화면은 강조를 요청했는데 강조 없는 문서를 받고, 왜 없는지 알 수 없다.

🔴 **그 규율을 «실재하지 않는 좌표»까지 넓힌다**(V-6 정정 · 검증 적발). 형식이 맞고 이
   문서의 chunk id 여도, 색인되지 않은 revision(chunk 0건)이나 범위 밖 index 는 강조할
   대상이 없다 — 전에는 그때도 200 + `highlight:null` 이 나갔다. 위 문장이 「이 문서의
   것이 아니면」만 말하고 있어서, 같은 «조용한 버림»이 다른 사유로 되살아난 것이다.
   거절은 **사유(`reason`)를 달고** 나간다: 사유 없는 거절은 조용한 성공보다 조금 나을 뿐이다.
"""

from __future__ import annotations

from typing import Any

from ..schemas import DocumentHighlight, DocumentPreview
from .evidence import CHUNK_ID_RE, is_stale
from .offsets import locate

_REVISION_SQL = """
    SELECT d.id AS document_id, d.title,
           r.id AS revision_id, r.content_sha256, r.approval_state,
           r.effective_from, r.effective_to, r.body,
           f.freshness
      FROM document d
      JOIN document_revision r ON r.document_id = d.id
      LEFT JOIN v_index_freshness f ON f.revision_id = r.id
     WHERE d.id = $1 AND r.revision_no = COALESCE($2, d.current_revision_no)
"""

_CHUNKS_SQL = """
    SELECT chunk_index, text FROM document_chunk WHERE revision_id = $1 ORDER BY chunk_index
"""


class HighlightMismatch(ValueError):
    """요청한 chunk 가 이 문서의 것이 아니다(형식 위반·타 문서)."""


class HighlightNotFound(ValueError):
    """형식도 맞고 이 문서의 것이지만, **그 좌표의 chunk 가 실재하지 않는다**(V-6 정정).

    🔴 전에는 이 자리에서 `highlight=None` 인 200 을 돌려주었다. 화면은 강조를 요청했는데
       강조 없는 문서를 받고 **왜 없는지 알 수 없었다** — 「강조할 문장이 없는 문서」와
       「없는 좌표를 물었다」가 같은 응답으로 보였다. 이 모듈 머리말이 「조용히 버리지
       않는다」고 이미 성문해 둔 것을 형식 위반에만 적용하고 있었던 셈이다.

    `reason` 은 **왜** 없는지 말한다 — 사유 없는 거절은 조용한 성공보다 조금 나을 뿐이다.
    """

    def __init__(self, chunk_id: str, reason: str, detail: str) -> None:
        super().__init__(f"{chunk_id}: {detail}")
        self.chunk_id = chunk_id
        self.reason = reason
        self.detail = detail


class CitationIntegrityBroken(RuntimeError):
    """chunk 는 실재하는데 원문에서 그 자리를 되찾지 못했다 — **호출자 잘못이 아니다**.

    🔴 400 으로 접지 않는다(오케 판정 08-30): 요청 좌표는 옳다. chunk 텍스트가 revision
       body 안에 없다는 뜻이고, 그것은 **색인↔원문 정합이 깨졌다**는 신호다 — 울려야 할
       사건이다. 200 + 무강조로 접으면 「사유 없는 200」이 되어 조용한 null 의 상위형이 된다.

    🔴 현 데이터로는 재현되지 않는다(chunk 59/59 가 body 에서 유일하게 발견 — T2-2 게이트1
       실측). 재색인·본문 개정이 이 경로를 연다. 재현할 수 없다고 없는 경로는 아니므로,
       그물이 못 만드는 자리를 코드가 대신 막아 둔다(검증 좌석 권고 · 판정 채택).
    """


async def fetch(pool: Any, document_id: str, highlight: str | None) -> DocumentPreview | None:
    revision_no: int | None = None
    target: int | None = None
    if highlight is not None:
        match = CHUNK_ID_RE.match(highlight)
        if match is None or match.group("document") != document_id:
            raise HighlightMismatch(highlight)
        revision_no = int(match.group("revision").rsplit("@r", 1)[1])
        target = int(match.group("index"))

    async with pool.acquire() as conn:
        row = await conn.fetchrow(_REVISION_SQL, document_id, revision_no)
        if row is None:
            return None
        chunks = await conn.fetch(_CHUNKS_SQL, row["revision_id"]) if highlight else []

    span = None
    if highlight is not None:
        # 🔴 **「강조 없음」으로 가는 길 셋을 이 한 자리에서 전부 닫는다**(오케 판정 08-30 ·
        #    검증 좌석 권고). 전에는 셋 다 `locate()=None` 으로 합류해 200 + `highlight:null`
        #    하나로 나갔다 — 그래서 화면은 세 사건을 구별할 수 없었다.
        #
        #    | 갈래 | 무엇이 틀렸나 | 판정 |
        #    |---|---|---|
        #    | ① chunk 없는 revision 좌표 | 요청 좌표 | 400 highlight_not_found |
        #    | ② 범위 밖 index          | 요청 좌표 | 400 highlight_not_found |
        #    | ③ 좌표는 옳은데 본문 미발견   | 색인↔원문 정합 | 5xx citation_integrity_broken |
        #
        #    ①②를 `locate()` 앞에서 미리 가르는 이유: `locate()` 는 셋 다 None 하나로만
        #    답해서 **사유를 말할 수 없다**. 사유 없는 거절은 조용한 성공보다 조금 나을 뿐이다.
        if not chunks:
            raise HighlightNotFound(
                highlight,
                "revision_not_indexed",
                f"revision {row['revision_id']} 에 색인된 chunk 가 없다(0건)",
            )
        if target is None or not 0 <= target < len(chunks):
            raise HighlightNotFound(
                highlight,
                "index_out_of_range",
                f"chunk_index 가 범위 밖이다(이 revision 의 chunk 는 0~{len(chunks) - 1})",
            )
        span = locate(row["body"] or "", [c["text"] for c in chunks], target)
        if span is None:
            raise CitationIntegrityBroken(
                f"{highlight}: chunk 텍스트를 revision {row['revision_id']} body 에서 찾지 못했다"
            )

    return DocumentPreview(
        documentId=row["document_id"],
        title=row["title"],
        revisionId=row["revision_id"],
        contentHash=row["content_sha256"],
        stale=is_stale(row["freshness"]),
        approvalState=row["approval_state"],
        effectiveFrom=row["effective_from"],
        effectiveTo=row["effective_to"],
        body=row["body"] or "",
        # highlight 를 요청했으면 여기까지 온 이상 좌표가 있다 — 없으면 위에서 거절했다.
        highlight=(
            DocumentHighlight(chunkId=highlight, start=span.start, end=span.end)
            if highlight is not None and span is not None
            else None
        ),
    )
