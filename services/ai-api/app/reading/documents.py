"""GET /documents/{docId}?highlight={chunkId} — 문서 미리보기 + 인용 강조 (T2-2).

어느 revision 을 보여 주는가:
- `highlight` 가 주어지면 **그 chunk 가 속한 revision**. 인용은 특정 revision 의 문장이므로,
  현행본을 보여 주고 옛 문장을 강조하면 좌표가 어긋난다.
- 없으면 **현행 revision**(`document.current_revision_no`).

🔴 `highlight` 의 chunk 가 이 문서의 것이 아니면 강조를 «조용히 버리지» 않는다 — 400 으로
   거절한다. 버리면 화면은 강조를 요청했는데 강조 없는 문서를 받고, 왜 없는지 알 수 없다.
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
    """요청한 chunk 가 이 문서의 것이 아니다."""


async def fetch(pool: Any, document_id: str, highlight: str | None) -> DocumentPreview | None:
    revision_no: int | None = None
    if highlight is not None:
        match = CHUNK_ID_RE.match(highlight)
        if match is None or match.group("document") != document_id:
            raise HighlightMismatch(highlight)
        revision_no = int(match.group("revision").rsplit("@r", 1)[1])

    async with pool.acquire() as conn:
        row = await conn.fetchrow(_REVISION_SQL, document_id, revision_no)
        if row is None:
            return None
        chunks = await conn.fetch(_CHUNKS_SQL, row["revision_id"]) if highlight else []

    span = None
    if highlight:
        target = int(CHUNK_ID_RE.match(highlight).group("index"))
        span = locate(row["body"] or "", [c["text"] for c in chunks], target)

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
        highlight=(
            DocumentHighlight(chunkId=highlight, start=span.start, end=span.end)
            if highlight and span
            else None
        ),
    )
