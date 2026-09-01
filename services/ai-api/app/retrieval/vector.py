"""vector 전략 — T1-4 색인(`document_chunk.embedding`) 위 pgvector 최근접 검색.

🔴 인용 유효 조건(T0-6 §3.3)을 검색 단계에서 건다: `approval_state='approved'` 이고
   `effective_from ≤ 오늘 < effective_to` 인 revision의 chunk만 후보다. 「검색해 놓고
   나중에 거른다」로 두면, 인용할 수 없는 문장이 순위 안에 남아 화면까지 흘러간다.

🔴 SQL은 상수다. 질의 벡터도 `$1::vector` 파라미터로 들어간다(문자열 조립 0).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..schemas import CompareHit
from .embedding import to_pgvector

TOP_K = 5
EXCERPT_CHARS = 240

# 「인용 가능한 revision의 chunk」 — 세 전략이 같은 유효 조건을 쓰도록 여기 한 벌만 둔다.
CITABLE = """
      JOIN document_revision r ON r.id = c.revision_id
     WHERE c.embedding IS NOT NULL
       AND r.approval_state = 'approved'
       AND r.effective_from <= CURRENT_DATE
       AND (r.effective_to IS NULL OR CURRENT_DATE < r.effective_to)
"""

_SEARCH_SQL = f"""
    SELECT c.id, c.text, 1 - (c.embedding <=> $1::vector) AS score
      FROM document_chunk c
      {CITABLE}
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2
"""

_SIGNATURE_SQL = """
    SELECT vector_dims(embedding) AS dim,
           embedding_model        AS model,
           count(*)               AS n
      FROM document_chunk
     WHERE embedding IS NOT NULL
     GROUP BY 1, 2
"""


@dataclass(frozen=True)
class IndexSignature:
    """색인이 «무엇으로 만들어졌는가». 질의 쪽과 대조하는 지문이다."""

    dim: int
    model: str
    chunks: int


async def index_signature(pool: Any) -> IndexSignature:
    """색인의 차원·모델을 읽는다.

    🔴 차원만 보면 부족하다 — 384차원 모델은 여럿이고, 다른 모델로 만든 벡터도 «맞는
       차원»으로 들어온다. 모델명까지 대조해야 「같은 공간인가」를 말할 수 있다.
       두 종류 이상이 섞여 있으면 그 자체가 색인 결함이므로 여기서 멈춘다.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SIGNATURE_SQL)
    if not rows:
        raise LookupError("document_chunk 에 임베딩이 0건이다 — 색인(T1-4)을 먼저 확인하라")
    if len(rows) > 1:
        mixed = ", ".join(f"{r['model']}({r['dim']}d)×{r['n']}" for r in rows)
        raise LookupError(f"색인에 모델·차원이 섞여 있다: {mixed}")
    row = rows[0]
    return IndexSignature(dim=int(row["dim"]), model=str(row["model"]), chunks=int(row["n"]))


async def search(pool: Any, query_vec: list[float], top_k: int = TOP_K) -> list[CompareHit]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SEARCH_SQL, to_pgvector(query_vec), top_k)
    return [
        CompareHit(evidenceId=r["id"], score=float(r["score"]), excerpt=excerpt(r["text"]))
        for r in rows
    ]


def excerpt(text: str, limit: int = EXCERPT_CHARS) -> str:
    """계약의 `excerpt` — 인용 «미리보기»다. 전문은 `GET /evidence/{id}` 의 몫(T2-2)."""
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[:limit] + "…"
