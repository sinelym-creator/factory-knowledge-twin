"""entity prefix → SSOT 테이블 화이트리스트 (T2-2에서 공용화).

🔴 이 dict 밖의 테이블은 조회되지 않는다. 사용자 문자열이 «어느 테이블을 볼지» 고르는
   경로를 만들지 않기 위한 방어이며, retrieval(hybrid 구조화 축)과 reading(`/evidence`
   kind=record)이 **같은 한 벌**을 본다 — 두 곳이 각자 목록을 들면 한쪽만 자란다.

정본은 `docs/product/data-ontology-spec.md` §3.1 패턴표다.
"""

from __future__ import annotations

TABLE_BY_PREFIX: dict[str, str] = {
    "EQ": "equipment",
    # 🔴 `CP`(Component)는 T2-1에서 빠져 있었다. 앵커 추출은 CP 를 인식하는데 조회 목록에
    #    없어, hybrid 는 부품 레코드를 집지 못했고 `/evidence` 는 graphrag 가 종단으로 낸
    #    `CP-204-BRG-01` 을 404 로 답했다 — **낸 근거를 자기가 펴지 못하는** 상태였다.
    #    T2-2 왕복 실증이 그것을 잡았다(compare→evidence 왕복이 이 결함의 그물이다).
    "CP": "component",
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

# 사람이 읽을 때 뜻을 더하지 않는 칼럼 — 근거 표시에서 뺀다.
NOISE_COLUMNS = frozenset({"created_at", "semantic_id"})


def table_of(entity_id: str) -> str | None:
    """`EQ-CNC-204` → `equipment`. 알 수 없는 prefix 면 None."""
    return TABLE_BY_PREFIX.get(entity_id.split("-", 1)[0])
