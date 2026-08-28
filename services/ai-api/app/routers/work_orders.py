"""계약 v0.1 §작업지시 (Work Order)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body

from ..errors import NOT_IMPLEMENTED, NotImplementedRoute
from ..schemas import DecisionComment, WorkOrderDecision

router = APIRouter(tags=["work-order"])


@router.get("/work-orders/{woId}", responses=NOT_IMPLEMENTED)
async def get_work_order(woId: str) -> None:
    """초안 전문 — 계약 「항목·부품·절차·안전 조치·근거 evidenceIds」(필드명 미확정).

    🔴 안전 조치는 화면에서 삭제 불가 항목이다(wireframes ④). 그 강제는 구현 티켓의 몫이며
       골격에는 없다.
    """
    raise NotImplementedRoute("GET /work-orders/{woId}", "WO 저장소 + 계약의 초안 형상 확정")


@router.patch("/work-orders/{woId}", responses=NOT_IMPLEMENTED)
async def patch_work_order(woId: str, body: dict[str, Any] = Body(default_factory=dict)) -> None:
    """편집 필드 부분 갱신 → 갱신본. 편집 가능 필드 집합은 계약이 열거하지 않았다."""
    raise NotImplementedRoute("PATCH /work-orders/{woId}", "WO 저장소 + 편집 가능 필드 확정")


@router.post("/work-orders/{woId}/approve", response_model=WorkOrderDecision, responses=NOT_IMPLEMENTED)
async def approve_work_order(woId: str, body: DecisionComment | None = None) -> WorkOrderDecision:
    """승인 — `{ status, auditId }`. 세션 내 이력으로 기록된다."""
    raise NotImplementedRoute("POST /work-orders/{woId}/approve", "WO 저장소 + 감사 이력")


@router.post("/work-orders/{woId}/reject", response_model=WorkOrderDecision, responses=NOT_IMPLEMENTED)
async def reject_work_order(woId: str, body: DecisionComment | None = None) -> WorkOrderDecision:
    """반려 — `{ status, auditId }`."""
    raise NotImplementedRoute("POST /work-orders/{woId}/reject", "WO 저장소 + 감사 이력")
