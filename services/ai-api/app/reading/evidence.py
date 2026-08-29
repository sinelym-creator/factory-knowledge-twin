"""GET /evidence/{evidenceId} — 인용을 원문·좌표·신뢰 배지로 되돌린다 (T2-2).

compare(T2-1)가 내는 `evidenceId` 는 두 종류이고, 이 모듈은 둘 다 받는다.

| 형태 | 예 | kind | 어디서 왔나 |
|---|---|---|---|
| `{document_id}@r{N}#{NNN}` | `DOC-SOP-0014@r2#001` | `doc-chunk` | vector·hybrid 의 문서 hit |
| 개념 ID | `SAF-LOTO-01`·`AL-20260826-0041` | `record` | hybrid 구조화 축 · graphrag 종단 |

chunk ID 조성은 T0-6 §3.1이 정하고 DB 제약(`ck_chunk_id_composition`)이 강제한다 —
`id = revision_id ‖ '#' ‖ lpad(chunk_index,3)`. 그래서 **ID 자체가 좌표**이며, 계약을 넓히지
않고도 문서·revision·chunk_index 세 축이 따라온다.

🔴 SQL 은 상수이고 값은 파라미터 바인딩이다. `record` 가 볼 테이블은 `ontology_tables` 의
   화이트리스트에서만 오며, 그 목록은 retrieval(hybrid)과 **같은 한 벌**이다.
"""

from __future__ import annotations

import re
from typing import Any

from ..ontology_tables import NOISE_COLUMNS, table_of
from ..schemas import EvidenceRecord, EvidenceResponse, Highlight
from .offsets import locate

# T0-6 §3.1 — DocumentChunk = `{revision_id}#{NNN}`, revision = `{document_id}@r{N}`.
CHUNK_ID_RE = re.compile(r"^(?P<revision>(?P<document>DOC-[A-Z]{3,4}-\d{4})@r\d+)#(?P<index>\d{3})$")

_CHUNK_SQL = """
    SELECT c.id, c.text, c.chunk_index,
           r.id AS revision_id, r.content_sha256, r.approval_state,
           r.effective_from, r.effective_to, r.body,
           f.freshness
      FROM document_chunk c
      JOIN document_revision r ON r.id = c.revision_id
      LEFT JOIN v_index_freshness f ON f.revision_id = r.id
     WHERE c.id = $1
"""

_SIBLING_SQL = """
    SELECT text FROM document_chunk WHERE revision_id = $1 ORDER BY chunk_index
"""


def is_stale(freshness: str | None) -> bool:
    """계약의 `stale` 은 boolean 하나다 — 「색인이 원문보다 낡았다」만 싣는다.

    🔴 실은 `v_index_freshness` 가 다섯 상태를 가른다(`FRESH`·`STALE`·`SKIPPED`·
       `NOT_INDEXED`·`ONTOLOGY_UNVERIFIED`·`BUILD_FAILED`). boolean 하나에 그 다섯을
       욱여넣으면 「색인이 없다」와 「색인이 낡았다」가 같은 값이 되어, 화면은 서로 다른
       사건을 같은 배지로 그린다. 그래서 여기서는 **`STALE` 만 true** 로 좁히고, 나머지
       상태가 응답에 실리지 않는다는 한계를 그대로 남긴다(T2-2 완료 보고 · 배지 설계 소견).
    """
    return freshness == "STALE"


async def fetch(pool: Any, evidence_id: str) -> EvidenceResponse | None:
    match = CHUNK_ID_RE.match(evidence_id)
    if match is not None:
        return await _doc_chunk(pool, evidence_id)
    if table_of(evidence_id) is not None:
        return await _record(pool, evidence_id)
    return None


async def _doc_chunk(pool: Any, evidence_id: str) -> EvidenceResponse | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_CHUNK_SQL, evidence_id)
        if row is None:
            return None
        siblings = await conn.fetch(_SIBLING_SQL, row["revision_id"])

    span = locate(row["body"] or "", [r["text"] for r in siblings], int(row["chunk_index"]))
    return EvidenceResponse(
        evidenceId=evidence_id,
        kind="doc-chunk",
        revisionId=row["revision_id"],
        contentHash=row["content_sha256"],
        stale=is_stale(row["freshness"]),
        approvalState=row["approval_state"],
        effectiveFrom=row["effective_from"],
        effectiveTo=row["effective_to"],
        text=row["text"],
        highlight=Highlight(start=span.start, end=span.end) if span else None,
    )


async def _record(pool: Any, entity_id: str) -> EvidenceResponse | None:
    table = table_of(entity_id)
    if table is None:                       # 호출부가 이미 걸렀지만 이중 방어
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"SELECT * FROM {table} WHERE id = $1", entity_id)  # noqa: S608 — table 은 화이트리스트 상수
    if row is None:
        return None

    fields = {k: _plain(v) for k, v in dict(row).items() if k not in NOISE_COLUMNS and v is not None}
    return EvidenceResponse(
        evidenceId=entity_id,
        kind="record",
        # 🔴 revision 6필드는 doc-chunk 만 실값이다(계약 v0.1.1). 레코드에는 revision 이
        #    없고, 그래서 `stale` 도 false 상수다 — SSOT 를 직독하는 근거라 「색인이
        #    낡았다」는 개념 자체가 성립하지 않는다.
        stale=False,
        text=" · ".join(f"{k}={v}" for k, v in fields.items()),
        record=EvidenceRecord(entityType=table, fields=fields),
    )


def _plain(value: Any) -> Any:
    """JSON 으로 나갈 수 있는 형태로. 값은 바꾸지 않고 표현만 문자열로 돌린다."""
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)
