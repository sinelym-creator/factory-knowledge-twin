"""graphrag 전략 — T1-5 Neo4j 투영(노드 309·관계 448) 위 고정 template traversal.

무엇이 다른가: 이 전략은 «문장이 비슷한 것»도 «ID가 일치하는 것»도 찾지 않는다. 앵커에서
관계를 밟아 도달하는 것을 찾는다. 「알람에서 출발해 안전 규정까지」(GS-01 · 평가셋
Q-MULTIHOP-001)처럼 답이 한 문서 안에 없고 관계 사슬 위에 있는 질문이 이 전략의 자리다.

🔴 Cypher는 아래 상수 한 벌뿐이고, 앵커·상한은 파라미터로만 들어간다. 계약에 임의 Cypher를
   받는 경로가 없는 것과 같은 이유로(계약 README 원칙3 · baseline §16.2) 여기서도
   질의문을 문자열로 만들지 않는다. 밟을 수 있는 관계 타입도 아래 목록으로 고정한다 —
   투영에 새 관계가 생겨도 이 목록을 고치기 전에는 걷지 않는다.
"""

from __future__ import annotations

from typing import Any

from ..schemas import CompareHit
from . import anchors as anchor_mod
from .vector import TOP_K, excerpt

MAX_HOPS = 6            # GS-01 기대 경로가 6관계(7노드)다 — 그보다 짧게 두면 정답이 사라진다
# T0-6 §2 relation 정본에서 투영된 타입만. 새 타입은 «검토 후» 여기 추가한다.
RELATIONS = (
    "CONTAINS|HAS_COMPONENT|MONITORED_BY|TRIGGERS|ON_EQUIPMENT|HAS_FAILURE_MODE|"
    "INDICATED_BY|MITIGATED_BY|REQUIRES|ESCALATES_TO|AFFECTS|DIAGNOSED_AS|"
    "RESOLVED_BY|REFERENCES|RESULTS_IN|ADDRESSED|DOCUMENTED_BY|DESCRIBED_BY|HAS_REVISION"
)
# 지식 종단 — 조사가 «닿아야 하는» 곳. 절차와 안전 규정이 빠지면 답이 위험해진다(§29.2).
TARGET_LABELS = ("SOP", "SafetyRule", "FailureMode", "Component", "MaintenanceRecord", "Incident")

# 🔴 방향을 지정하지 않는다(`-[...]-`): GS-01 경로는 TRIGGERS·MONITORED_BY를 «역»으로 탄다
#    (평가셋 Q-MULTIHOP-001 relations 행). 방향을 강제하면 정답 경로가 끊긴다.
# 🔴 상한을 «종단 종류별»로 건다. 전체에 LIMIT 을 걸면 가까운 종류가 자리를 다 먹는다 —
#    실측: 이 앵커에서 4-hop 후보만 67개라, 전체 상한 40으로는 4-hop 인 SafetyRule 이
#    ID 사전순에 밀려 통째로 사라졌다(SAF-LOTO-01 누락 = 평가 규약상 즉시 FAIL).
_PATH_CYPHER = f"""
MATCH (s {{id: $anchor}})
MATCH (t)
WHERE any(l IN labels(t) WHERE l IN $targets) AND t <> s
MATCH p = shortestPath((s)-[:{RELATIONS}*1..{MAX_HOPS}]-(t))
WITH head([l IN labels(t) WHERE l IN $targets]) AS label,
     [n IN nodes(p) | n.id]            AS ids,
     [r IN relationships(p) | type(r)] AS rels,
     t.id                              AS target_id,
     length(p)                         AS hops
ORDER BY hops ASC, target_id ASC
WITH label, collect({{ids: ids, rels: rels, target_id: target_id, hops: hops}})[0..$per_label] AS items
UNWIND items AS item
RETURN label, item.ids AS ids, item.rels AS rels, item.target_id AS target_id, item.hops AS hops
"""


async def search(driver: Any, question: str, top_k: int = TOP_K) -> list[CompareHit]:
    found = anchor_mod.extract(question)
    if not found:
        # 🔴 앵커가 없으면 이 전략은 «출발점이 없다». 벡터로 시작점을 찾아 주는 폴백을 두지
        #    않는다 — 그러면 이 칸의 결과가 graphrag 인지 vector 인지 알 수 없게 된다.
        return []

    found_hits: list[tuple[str, CompareHit]] = []
    async with driver.session() as session:
        for anchor in found:
            result = await session.run(
                _PATH_CYPHER,
                anchor=anchor,
                targets=list(TARGET_LABELS),
                per_label=top_k,
            )
            async for record in result:
                found_hits.append(_to_hit(record))
    return _pick(found_hits, top_k)


def _pick(found_hits: list[tuple[str, CompareHit]], top_k: int) -> list[CompareHit]:
    """🔴 «가까운 순»으로만 자르지 않는다 — 종단 종류를 먼저 채운다.

    실측으로 걸린 결함이다: GS-01 질문(알람 → … → 안전 규정)을 hops 순으로 5개만 남기면
    1~2-hop 의 Incident·Component·FailureMode 가 자리를 다 먹고 **SOP 와 SafetyRule 이
    사라진다**. 그런데 이 질문이 요구한 답의 종단이 바로 그 둘이고, 안전 규정 누락은
    평가 규약에서 「경로가 맞아도 즉시 FAIL」이다(평가셋 Q-MULTIHOP-001 · baseline §29.2).

    그래서 `TARGET_LABELS` 우선순위대로 라운드로빈하며 종류마다 한 자리씩 채우고, 남는
    자리만 거리 순으로 준다. 「안전한 답」이 「가까운 답」보다 앞선다는 도메인 규율을
    정렬 규칙으로 옮긴 것이다.
    """
    by_label: dict[str, list[CompareHit]] = {}
    seen: set[str] = set()
    for label, hit in sorted(found_hits, key=lambda lh: (-lh[1].score, lh[1].evidenceId)):
        if hit.evidenceId in seen:      # 같은 종단에 여러 앵커가 닿으면 짧은 경로만 남는다
            continue
        seen.add(hit.evidenceId)
        by_label.setdefault(label, []).append(hit)

    picked: list[CompareHit] = []
    while len(picked) < top_k and any(by_label.values()):
        for label in TARGET_LABELS:
            bucket = by_label.get(label)
            if bucket:
                picked.append(bucket.pop(0))
                if len(picked) == top_k:
                    break
    return sorted(picked, key=lambda h: (-h.score, h.evidenceId))


def _to_hit(record: Any) -> tuple[str, CompareHit]:
    ids: list[str] = list(record["ids"])
    rels: list[str] = list(record["rels"])
    hops = int(record["hops"])
    label = str(record["label"])

    # 🔴 계약에 경로를 담을 필드가 없다(응답 스키마 확장 금지 · 판정 08-30). 경로는 근거의
    #    본체이므로 버리지 않고 excerpt 안에서 사람이 읽을 수 있게 적는다.
    walk = ids[0]
    for rel, node in zip(rels, ids[1:]):
        walk += f" -[{rel}]- {node}"
    # score = 1/(1+hops) — 가까울수록 큼. 🔴 «전략 내 서수»일 뿐 vector 의 유사도와 비교 불가.
    return label, CompareHit(
        evidenceId=str(record["target_id"]),
        score=round(1.0 / (1 + hops), 6),
        excerpt=excerpt(f"[{label} · {hops}-hop] {walk}"),
    )
