"""O-33 — 도달한 엔티티를 그 문서 청크로 옮기는 층(`documents_for_entities`).

🔴 **무엇을 무는가.** GS-01 live run 은 `SOP-BRG-INSP-014`·`SAF-LOTO-01` 에 **도달했는데도**
   기대 근거(`DOC-SOP-0014@r2#001`·`DOC-SAF-0029@r3#000`)가 근거집합 19건에 0건이었다.
   원인은 검색 실패가 아니라 **옮기는 단계의 부재**였다(graph 가 낸 doc-chunk 0건).

🔴 **이 파일이 «못» 무는 것을 먼저 적는다.** 인용 유효 조건(승인 상태·유효기간)은 **SQL 층**에
   있어 목(mock)으로는 판정되지 않는다. 여기서는 그 조건이 질의에 **실려 나가는지**(문면)만
   보고, 「미승인 revision 이면 0건」이라는 **의미**는 실 DB 축에서 잰다(구현 보고 E1 · 검증 좌석).
   목으로 SQL 의미를 흉내 내면 그 초록은 DB 가 아니라 내 흉내를 증명한다.

실행: `pytest tests_unit/test_graph_document_projection.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import asyncio

import pytest

from app.reading import evidence as evidence_reader

SOP_ID = "SOP-BRG-INSP-014"
SAF_ID = "SAF-LOTO-01"
SOP_CHUNKS = ["DOC-SOP-0014@r2#000", "DOC-SOP-0014@r2#001", "DOC-SOP-0014@r2#002"]
SAF_CHUNKS = ["DOC-SAF-0029@r3#000"]


class _Conn:
    """실행된 SQL 과 인자를 기록하는 가짜 연결. 반환은 표별로 미리 심는다."""

    def __init__(self, rows_by_table: dict[str, list[str]]) -> None:
        self.rows_by_table = rows_by_table
        self.calls: list[tuple[str, list[str]]] = []

    async def fetch(self, sql: str, ids: list[str]) -> list[dict[str, str]]:
        self.calls.append((sql, list(ids)))
        table = "sop" if " JOIN sop e " in sql else "safety_rule"
        return [{"chunk_id": c} for c in self.rows_by_table.get(table, [])]


class _Acquire:
    def __init__(self, conn: _Conn) -> None:
        self.conn = conn

    async def __aenter__(self) -> _Conn:
        return self.conn

    async def __aexit__(self, *_: object) -> bool:
        return False


class _Pool:
    def __init__(self, conn: _Conn) -> None:
        self.conn = conn

    def acquire(self) -> _Acquire:
        return _Acquire(self.conn)


def _run(entity_ids: list[str], rows_by_table: dict[str, list[str]]):
    conn = _Conn(rows_by_table)
    out = asyncio.run(evidence_reader.documents_for_entities(_Pool(conn), entity_ids))
    return out, conn


def test_sop_terminal_yields_its_revision_chunks():
    out, conn = _run([SOP_ID], {"sop": SOP_CHUNKS})
    assert out == SOP_CHUNKS
    assert conn.calls[0][1] == [SOP_ID]


def test_safety_rule_terminal_yields_its_chunk():
    out, _ = _run([SAF_ID], {"safety_rule": SAF_CHUNKS})
    assert out == SAF_CHUNKS


def test_both_terminals_together():
    out, conn = _run([SOP_ID, SAF_ID], {"sop": SOP_CHUNKS, "safety_rule": SAF_CHUNKS})
    assert set(out) == set(SOP_CHUNKS) | set(SAF_CHUNKS)
    assert len(conn.calls) == 2, "표마다 한 번씩 — 엔티티마다 두드리지 않는다"


@pytest.mark.parametrize("entity_id", ["EQ-CNC-204", "FM-BRG-WEAR", "MR-2024-0004", "AL-20260826-0041"])
def test_terminals_without_a_document_link_do_not_query(entity_id):
    """🔴 문서 링크가 없는 표를 조회해 «빈 결과»를 받고 「문서가 없다」로 읽지 않는다.

    조회 자체가 0건이어야 한다 — 빈 결과와 「묻지 않았다」는 다른 사실이고, 없는 열을
    조회하면 그 순간 오류가 난다.
    """
    out, conn = _run([entity_id], {"sop": SOP_CHUNKS})
    assert out == []
    assert conn.calls == []


def test_no_terminals_at_all():
    out, conn = _run([], {"sop": SOP_CHUNKS})
    assert out == []
    assert conn.calls == []


def test_query_carries_the_citability_conditions():
    """🔴 **문면 검사임을 이름으로 적는다.** 이 케이스가 증명하는 것은 「조건이 질의에 실렸다」
    뿐이고, 「미승인 revision 이 걸러진다」는 실 DB 축에서만 증명된다.
    """
    _, conn = _run([SOP_ID], {"sop": SOP_CHUNKS})
    sql = conn.calls[0][0]
    for condition in (
        "approval_state = 'approved'",
        "effective_from <= CURRENT_DATE",
        "effective_to IS NULL OR CURRENT_DATE < r.effective_to",
        "embedding IS NOT NULL",
    ):
        assert condition in sql, f"인용 유효 조건이 질의에서 빠졌다: {condition}"
    assert "ORDER BY e.id, c.chunk_index" in sql, "청크 순서는 chunk_index 다"


def test_whitelist_is_the_source_of_table_names():
    """표 이름을 이 층에 다시 적지 않았는가 — 정본은 `ontology_tables` 하나다."""
    from app.ontology_tables import table_of

    assert table_of(SOP_ID) in evidence_reader.DOC_LINKED_TABLES
    assert table_of(SAF_ID) in evidence_reader.DOC_LINKED_TABLES
    assert table_of("EQ-CNC-204") not in evidence_reader.DOC_LINKED_TABLES
