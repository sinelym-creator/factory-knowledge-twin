"""draft_work_order 단계 — 작업지시 «초안»까지 (GS-01 대본 S7 · 티켓 4단계).

무엇이 «있는가»: 1순위 후보에서 절차·안전 규정·대상 부품을 끌어와 초안 한 벌을 만든다.

무엇이 «없는가», 그리고 왜:
- **승인·편집·저장 표면이 없다**(계약 `/work-orders/*` = T2-5). 여기서 만드는 것은 프로세스
  안의 초안이고, SSOT `work_order` 테이블에 쓰지 않는다 — run 이 콘솔 상태인 것과 같은 이유다.
- **서버측 강제가 없다.** R12 REQUIRES(안전 조치)를 초안에 «싣는» 것까지가 이 티켓이고,
  「안전 조치 없는 승인을 서버가 거절한다」는 T2-5 다(티켓 명시).

🔴 **안전 조치는 «찾지 못하면 비우지» 않는다.** 절차에 매인 안전 규정이 0건이면 초안에
   빈 목록을 싣는 대신 그 사실을 초안 안에 명시한다 — 빈 안전 항목은 화면에서 「안전 조치가
   필요 없는 작업」으로 읽히고, 그 오독은 사람을 다치게 한다(baseline §29.2).
"""

from __future__ import annotations

import uuid
from typing import Any

from .synthesize import Candidate

# 1순위 후보의 대응 절차 · 그 절차가 요구하는 안전 규정(R12 REQUIRES) · 대상 부품.
# 🔴 전부 상수 질의 + 파라미터 바인딩. 사용자 입력이 조회 대상을 고르는 경로는 없다.
_SOP_SQL = """
    SELECT s.id, s.title, s.domain, s.status
      FROM failure_mode_sop fs JOIN sop s ON s.id = fs.sop_id
     WHERE fs.failure_mode_id = $1
     ORDER BY s.id
"""

_SAFETY_SQL = """
    SELECT r.id, r.title, r.rule_class, r.mandatory
      FROM sop_safety_rule sr JOIN safety_rule r ON r.id = sr.safety_rule_id
     WHERE sr.sop_id = ANY($1::text[])
     ORDER BY r.mandatory DESC, r.id
"""

_COMPONENT_SQL = """
    SELECT c.id, c.name, c.component_class
      FROM component c JOIN component_failure_mode cf ON cf.component_id = c.id
     WHERE c.equipment_id = $1 AND cf.failure_mode_id = $2
     ORDER BY c.id
"""


async def draft(
    pool: Any,
    *,
    equipment_id: str,
    incident_id: str,
    top: Candidate,
    evidence_ids: list[str],
) -> dict[str, Any]:
    """1순위 후보로 작업지시 초안을 만든다. 반환값이 곧 저장소에 담기는 초안 전문이다."""
    async with pool.acquire() as conn:
        sops = [dict(r) for r in await conn.fetch(_SOP_SQL, top.failureModeId)]
        sop_ids = [s["id"] for s in sops]
        safety = [dict(r) for r in await conn.fetch(_SAFETY_SQL, sop_ids)] if sop_ids else []
        parts = [dict(r) for r in await conn.fetch(_COMPONENT_SQL, equipment_id, top.failureModeId)]

    # 🔴 「없다」를 빈 목록으로 흘리지 않는다 — 무엇이 왜 비었는지 초안이 말한다.
    gaps: list[str] = []
    if not sops:
        gaps.append(f"{top.failureModeId} 에 매핑된 대응 절차(SOP)가 없다 — 절차 없이 착수할 수 없다")
    if sop_ids and not safety:
        gaps.append(f"절차 {', '.join(sop_ids)} 에 매인 안전 규정이 0건이다 — 안전 조치 미확인")
    if not parts:
        gaps.append(f"{equipment_id} 에서 {top.failureModeId} 에 매인 부품을 찾지 못했다")

    return {
        "workOrderDraftId": f"WOD-{uuid.uuid4().hex[:12]}",
        "incidentId": incident_id,
        "equipmentId": equipment_id,
        "title": f"{top.label} 대응 — 점검·교체 초안",
        "failureModeId": top.failureModeId,
        "procedures": [{"sopId": s["id"], "title": s["title"], "status": s["status"]} for s in sops],
        # R12 REQUIRES — 절차가 «요구하는» 안전 조치. mandatory 를 그대로 싣는다(해석하지 않는다).
        "safetyMeasures": [
            {"safetyRuleId": r["id"], "title": r["title"], "class": r["rule_class"], "mandatory": r["mandatory"]}
            for r in safety
        ],
        "parts": [{"componentId": p["id"], "name": p["name"], "class": p["component_class"]} for p in parts],
        "evidenceIds": evidence_ids,
        # 🔴 초안은 «초안»이라고 말한다. 승인 상태를 여기서 만들지 않는다(승인 = T2-5 · 사람).
        "state": "draft",
        "gaps": gaps,
        "note": (
            "AI 가 만든 초안이다 — 사람이 확인하고 승인한다(baseline §29.2). "
            "승인·편집 표면은 T2-5 에서 열린다."
        ),
    }
