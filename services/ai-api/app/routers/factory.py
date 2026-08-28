"""계약 v0.1 §공장·설비 (Overview)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from ..errors import NOT_IMPLEMENTED, NotImplementedRoute
from ..schemas import PlantSummary

router = APIRouter(tags=["factory"])


@router.get("/plants", response_model=list[PlantSummary], responses=NOT_IMPLEMENTED)
async def list_plants() -> list[PlantSummary]:
    """공장 목록 — 계약 `[{ plantId, name, lineCount, alarmCount }]`."""
    raise NotImplementedRoute("GET /plants", "온톨로지 조회 계층")


@router.get("/plants/{plantId}/overview", responses=NOT_IMPLEMENTED)
async def plant_overview(plantId: str) -> None:
    """라인·설비 상태 트리 + 활성 알람 `[{ equipmentId, status, activeAlarms }]`
    + `kpi: { lineActive, alarmCount, openIncidents, pendingWorkOrders }`(계약 G4).

    🔴 트리 부분의 필드명을 계약이 정하지 않았다. 여기서 지어내면 골격이 계약을 앞질러
       정한다 — 형상은 비워 두고 라우트만 세운다(모듈 `schemas` 머리말).
    """
    raise NotImplementedRoute("GET /plants/{plantId}/overview", "온톨로지 조회 계층 + 계약의 트리 형상 확정")


@router.get("/equipment/{equipmentId}", responses=NOT_IMPLEMENTED)
async def equipment_detail(equipmentId: str) -> None:
    """설비 상세 — 계약 「속성·상태·센서 목록·최근 알람·정비 이력 요약」(필드명 미확정)."""
    raise NotImplementedRoute("GET /equipment/{equipmentId}", "온톨로지 조회 계층 + 계약의 상세 형상 확정")


@router.get("/equipment/{equipmentId}/sensors/{sensorId}/series", responses=NOT_IMPLEMENTED)
async def sensor_series(
    equipmentId: str,
    sensorId: str,
    window: Literal["24h", "3w"] = Query(description="계약이 허용하는 두 창"),
) -> None:
    """시계열 `[{ ts, value }]` + threshold.

    점 형상은 `SensorSeriesPoint` 로 고정돼 있으나 threshold 의 형태(스칼라/구간/등급)는
    계약이 정하지 않았다. 응답 전체 모델은 그래서 아직 비워 둔다.
    """
    raise NotImplementedRoute(
        "GET /equipment/{equipmentId}/sensors/{sensorId}/series",
        "시계열 조회 계층 + 계약의 threshold 형상 확정",
    )
