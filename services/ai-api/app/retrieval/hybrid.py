"""hybrid 전략 — 구조화 축(SQL) + vector 축을 «순위»로 결합한다.

무엇이 vector와 다른가: 질문의 ID 앵커로 PostgreSQL 레코드를 직접 집는다. 「`EQ-CNC-204`의
경보 임계값」 같은 질문의 답은 문서 문장이 아니라 `sensor.alarm_threshold` 속성에 있고
(T0-6 §4 · 평가셋 C-4), 벡터 검색에는 그 값에 닿는 경로가 아예 없다.

🔴 결합은 **RRF(Reciprocal Rank Fusion · `Σ 1/(k+rank)`, k=60)** 다. 가중합을 쓰지 않는
   이유는 실측이다: 두 축의 점수가 «다른 단위»이기 때문이다 — vector 축은 코사인 유사도
   [-1,1], 구조화 축은 매칭 여부(0/1)라 공통 척도가 없다. 순위만 쓰면 단위 문제가 사라진다.
   대가는 「얼마나 더 관련 있는가」를 잃는 것인데, 계약의 `score` 는 어차피 전략 내 서수
   의미만 갖는다(오케 판정 08-30 ③-2)이므로 잃을 것이 없다.

🔴 테이블 이름은 아래 화이트리스트 상수에서만 온다. 사용자 문자열이 조회 대상을 고르는
   경로는 없고, ID는 전부 파라미터 바인딩이다.
"""

from __future__ import annotations

from typing import Any

from ..schemas import CompareHit
from . import anchors as anchor_mod
from .embedding import embed_query
from .vector import CITABLE, TOP_K, excerpt
from .vector import search as vector_search

RRF_K = 60

# entity prefix → (테이블, 사람이 읽을 때 뜻이 없는 칼럼). 🔴 이 dict 밖의 테이블은 조회되지 않는다.
_DIRECT: dict[str, str] = {
    "EQ": "equipment",
    "SN": "sensor",
    "AL": "alarm",
    "INC": "incident",
    "WO": "work_order",
    "MR": "maintenance_record",
    "FM": "failure_mode",
    "SOP": "sop",
    "SAF": "safety_rule",
    "DOC": "document",
    "LN": "production_line",
    "FAC": "factory",
}
# 앵커에서 «한 걸음»만 넓히는 고정 template. 여러 걸음은 graphrag 전략의 몫이다.
# 🔴 세 번째 값은 정렬이다. 알람 ID는 `AL-{YYYYMMDD}-{NNNN}`(T0-6 §3.1)이라 오름차순 =
#    «오래된 것부터»가 된다 — 조사에서 먼저 봐야 할 것은 최근 알람이므로 내림차순으로 받는다.
#    실측으로 걸린 자리다: 오름차순에서는 상한에 밀려 문제의 최신 알람이 결과에 없었다.
_EXPAND: dict[str, list[tuple[str, str, str]]] = {
    "EQ": [("sensor", "equipment_id", "ASC"), ("alarm", "equipment_id", "DESC")],
    "SN": [("alarm", "sensor_id", "DESC")],
}
_NOISE = {"created_at", "semantic_id"}

# 앵커 문자열이 본문에 그대로 나오는 chunk — 벡터가 놓치는 «정확한 ID 언급»을 집는다.
_MENTION_SQL = f"""
    SELECT c.id, c.text
      FROM document_chunk c
      {CITABLE}
       AND c.text LIKE '%' || $1 || '%'
     ORDER BY c.id
     LIMIT $2
"""


async def search(pool: Any, question: str, top_k: int = TOP_K) -> list[CompareHit]:
    """🔴 vector 축을 «스스로» 다시 돈다 — vector 전략의 결과를 물려받지 않는다.

    물려받으면 hybrid 의 `elapsedMs` 에서 벡터 검색 비용이 빠져, 화면의 전략 비교가
    「hybrid 가 더 빠르다」는 없는 사실을 말하게 된다. 같은 일을 두 번 하는 값을 치르고
    두 숫자가 각각 «그 전략 1회»를 뜻하게 둔다.
    """
    found = anchor_mod.extract(question)
    query_vec = await embed_query(question)
    rankings = await _structured(pool, found, top_k)
    rankings.append(await _mentions(pool, found, top_k))
    rankings.append(await vector_search(pool, query_vec, top_k))
    return _fuse(rankings, top_k)


async def _structured(pool: Any, found: list[str], limit: int) -> list[list[CompareHit]]:
    """앵커 레코드와 한 걸음 이웃 — kind=record 근거(계약 §Evidence).

    🔴 이웃 «종류마다» 랭킹을 따로 낸다. 한 줄로 이어 붙이면 앞 종류가 뒤 종류의 순위를
       통째로 밀어낸다 — 실측: 설비 앵커의 센서 목록이 자리를 다 먹어, 정작 질문이 물은
       그 알람이 상한 밖으로 밀렸다. 「센서 목록」과 「알람 목록」은 서로 다른 근거이지
       한 줄로 세울 것이 아니고, RRF는 랭킹이 여럿일 때 각 1위를 나란히 올려 준다.
    """
    direct: list[CompareHit] = []
    neighbours: dict[str, list[CompareHit]] = {}
    async with pool.acquire() as conn:
        for anchor in found:
            prefix = anchor.split("-", 1)[0]
            table = _DIRECT.get(prefix)
            if table is None:
                continue
            row = await conn.fetchrow(f"SELECT * FROM {table} WHERE id = $1", anchor)  # noqa: S608 — table 은 위 화이트리스트 상수
            if row is not None:
                direct.append(CompareHit(evidenceId=anchor, score=0.0, excerpt=_row_text(table, row)))
            for child, fk, order in _EXPAND.get(prefix, []):
                rows = await conn.fetch(
                    f"SELECT * FROM {child} WHERE {fk} = $1 ORDER BY id {order} LIMIT $2",  # noqa: S608 — child·fk·order 전부 위 상수
                    anchor,
                    limit,
                )
                neighbours.setdefault(child, []).extend(
                    CompareHit(evidenceId=r["id"], score=0.0, excerpt=_row_text(child, r))
                    for r in rows
                )
    return [direct, *neighbours.values()]


async def _mentions(pool: Any, found: list[str], limit: int) -> list[CompareHit]:
    hits: list[CompareHit] = []
    async with pool.acquire() as conn:
        for anchor in found:
            rows = await conn.fetch(_MENTION_SQL, anchor, limit)
            hits.extend(
                CompareHit(evidenceId=r["id"], score=0.0, excerpt=excerpt(r["text"])) for r in rows
            )
    return hits


def _fuse(rankings: list[list[CompareHit]], top_k: int) -> list[CompareHit]:
    """RRF — 같은 evidenceId 가 여러 축에 나오면 점수가 합쳐진다."""
    score: dict[str, float] = {}
    seen: dict[str, CompareHit] = {}
    for ranking in rankings:
        for rank, hit in enumerate(ranking, start=1):
            score[hit.evidenceId] = score.get(hit.evidenceId, 0.0) + 1.0 / (RRF_K + rank)
            seen.setdefault(hit.evidenceId, hit)
    ordered = sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))[:top_k]
    return [
        CompareHit(evidenceId=eid, score=round(s, 6), excerpt=seen[eid].excerpt) for eid, s in ordered
    ]


def _row_text(table: str, row: Any) -> str:
    """레코드를 «읽을 수 있는 한 줄»로. 값이 근거이므로 요약하지 않고 그대로 적는다."""
    fields = [f"{k}={v}" for k, v in dict(row).items() if k not in _NOISE and v is not None]
    return excerpt(f"[{table}] " + " · ".join(fields))
