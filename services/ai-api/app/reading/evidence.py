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

import logging
import re
from typing import Any

from ..ontology_tables import NOISE_COLUMNS, table_of
from ..schemas import EvidenceRecord, EvidenceResponse, Highlight
from .offsets import locate_cited

log = logging.getLogger("fkt.reading")

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


PROVEN_FRESH = "FRESH"
# doc-chunk 응답에 «도달할 수 없다»고 보는 상태 — chunk 가 있어야 이 응답이 나오는데, 이
# 둘은 chunk 를 만들지 않는다(skipped = 색인 대상에서 빠짐 · 색인 기록 없음 = 빌드 자체 없음).
# 🔴 그 «믿음»을 주석으로만 두지 않고 아래 가드가 실행 시점에 확인한다.
UNREACHABLE_FOR_CHUNK = frozenset({"SKIPPED", "NOT_INDEXED"})


def is_stale(freshness: str | None) -> bool:
    """계약의 `stale` — 🔴 묻는 것은 「신선한가」가 아니라 **「신선이 «실증»됐는가」**다.

    `v_index_freshness` 는 여섯 상태를 가르는데(`FRESH`·`STALE`·`SKIPPED`·`NOT_INDEXED`·
    `ONTOLOGY_UNVERIFIED`·`BUILD_FAILED`) 계약의 `stale` 은 boolean 하나다. 그 압축을
    「`STALE` 만 true」로 하면 **`ONTOLOGY_UNVERIFIED` 가 false 로 나간다** — 「온톨로지
    버전을 확인하지 못했다」를 「신선하다」로 말하는 것이고, 그것이 Phase 1이 Q-6로 잡은
    «조용한 FRESH 단정» 병의 API 층 재발이다(오케 판정 08-30).

    그래서 **`FRESH` 만 false** 다. 지정된 세 상태(`STALE`·`ONTOLOGY_UNVERIFIED`·
    `BUILD_FAILED`)를 포함하면서, 뷰에 **새 상태가 생겨도 자동으로 true** 가 된다 —
    모르는 값을 false 로 흘리지 않는 쪽이 이 배지의 옳은 실패 방향이다. 값이 아예 없는
    경우(`None`)도 같다: 「모른다」는 「신선하다」가 아니다.

    🔴 남는 한계는 그대로 성문한다 — 이 boolean 은 «왜» 신선이 실증되지 않았는지 말하지
       못한다. 6상태 노출은 계약 개정 사안이라 Q-22 로 등재됐다(v0.2 재론).
    """
    return freshness != PROVEN_FRESH


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

    freshness = row["freshness"]
    if freshness in UNREACHABLE_FOR_CHUNK:
        # 🔴 「도달 불가」는 믿음이지 보증이 아니다. 믿음이 깨지면 조용히 지나가지 말고
        #    로그로 드러낸다 — 이 상태에서도 배지는 true(신선 미실증)라 답은 안전하다.
        log.warning(
            "도달 불가로 본 색인 상태가 doc-chunk 응답에 나타났다: %s freshness=%s",
            evidence_id,
            freshness,
        )

    # 🔴 `/documents` 와 **같은 벽**을 지난다(오케 판정 08-30). 계약 v0.1.1 이 doc-chunk 에
    #    약속한 것이 「원문 + 강조 offset」이므로, 좌표를 되찾지 못한 응답은 계약을 지키지
    #    못한 것이다 — 여기서 200 + 무강조로 접으면 그것이 바로 조용한 null 의 상위형이다.
    #    ①② (없는 revision · 범위 밖 index)는 이 경로에 없다: chunk 행을 id 로 집어 왔으므로
    #    실재가 보장되고, `chunk_index` 도 그 행에서 온다. 남는 갈래는 ③ 정합 파열뿐이다.
    span = locate_cited(
        row["body"] or "",
        [r["text"] for r in siblings],
        int(row["chunk_index"]),
        chunk_id=evidence_id,
        revision_id=row["revision_id"],
    )
    return EvidenceResponse(
        evidenceId=evidence_id,
        kind="doc-chunk",
        revisionId=row["revision_id"],
        contentHash=row["content_sha256"],
        stale=is_stale(freshness),
        approvalState=row["approval_state"],
        effectiveFrom=row["effective_from"],
        effectiveTo=row["effective_to"],
        text=row["text"],
        highlight=Highlight(start=span.start, end=span.end),
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


# 🔴 **문서 링크를 «가진» 온톨로지 테이블**(O-33). 그 밖의 종단(설비·고장모드·정비이력)에는
#    `current_revision_id` 가 없다 — 없는 축을 조회해 빈 결과를 「문서가 없다」로 읽지 않도록
#    여기서 이름으로 좁힌다. 표 이름 자체는 `table_of` 화이트리스트에서 빌려 온다.
DOC_LINKED_TABLES = frozenset({"sop", "safety_rule"})

# 인용 유효 조건은 **검색이 쓰는 그 한 벌**을 그대로 쓴다(`retrieval.vector.CITABLE`).
# 여기에 다시 적으면 「검색은 되는데 투영은 안 되는」 revision 이 생기고, 그 차이는
# 아무도 안 본다.
_ENTITY_DOCS_TAIL = """
      JOIN document_revision r ON r.id = c.revision_id
     WHERE c.embedding IS NOT NULL
       AND r.approval_state = 'approved'
       AND r.effective_from <= CURRENT_DATE
       AND (r.effective_to IS NULL OR CURRENT_DATE < r.effective_to)
     ORDER BY e.id, c.chunk_index
"""


async def documents_for_entities(pool: Any, entity_ids: list[str]) -> list[str]:
    """도달한 «엔티티»가 가리키는 문서의 **인용 가능 청크 id** — O-33.

    🔴 **왜 있는가.** graph 단계는 `SOP-BRG-INSP-014`·`SAF-LOTO-01` 에 도달하고도 그것을
       `graph-path` 근거로만 냈다. 기대 근거(ground truth)는 **청크 id** 라, 도달했는데도
       근거집합에는 영원히 0건이었다(GS-01 실측: graph 가 낸 doc-chunk 0건).
       링크는 이미 데이터에 있다 — `sop.current_revision_id`·`safety_rule.current_revision_id`.

    🔴 **여기서 «고르지» 않는다.** 그 revision 의 인용 가능한 청크를 chunk_index 순으로 전부
       돌려준다. 유사도로 한 본만 고르면 「왜 그 청크인가」를 설명할 근거가 이 층에는 없다.
    """
    by_table: dict[str, list[str]] = {}
    for entity_id in entity_ids:
        table = table_of(entity_id)
        if table in DOC_LINKED_TABLES:
            by_table.setdefault(table, []).append(entity_id)
    if not by_table:
        return []

    chunk_ids: list[str] = []
    async with pool.acquire() as conn:
        for table, ids in sorted(by_table.items()):
            sql = (
                "SELECT c.id AS chunk_id"
                "  FROM document_chunk c"
                f" JOIN {table} e ON e.current_revision_id = c.revision_id"  # noqa: S608 — 화이트리스트 상수
                "  AND e.id = ANY($1::text[])"
                + _ENTITY_DOCS_TAIL
            )
            rows = await conn.fetch(sql, ids)
            chunk_ids.extend(row["chunk_id"] for row in rows)
    return chunk_ids
