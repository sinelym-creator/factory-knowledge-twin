"""계약 v0.1 §공장·설비 (Overview) — T3-2 조회 계층 해제.

무엇이 «있는가»: 공장 목록·설비 상세. 둘 다 **SSOT 읽기 전용**이고, 형상은 계약 v0.1.7
append 가 정한 것 그대로다(질의는 `reading/factory.py` 한 곳).

무엇이 «아직 없는가», 그리고 왜:
- `/plants/{plantId}/overview` 와 `…/series` 는 **형상 갈림이 오케 판정 대기 중**이다
  (overview = 활성 알람이 v0.1.7 원소에서 빠졌다 · series = 3주 창이 2.07MB 라 다운샘플이
  필요한데 「가공했다」를 말할 칸이 형상에 없다). 지어내지 않고 501 로 둔다 — 골격이 계약을
  앞질러 정하면 계약은 사후 추인이 된다(이 파일 초판의 성문과 같은 이유).

🔴 **해제 단위는 라우트가 아니라 «화면이 부르는 질의 형태»다**(Q-26 · T3-2 게이트 1).
   소비처 없는 축은 열지 않는다 — `GET /graph/paths?from=&to=` 가 이 티켓에서도 501 로
   남는 것이 같은 규율이다.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query, Request

from ..errors import NOT_IMPLEMENTED, DependencyUnavailable, NotImplementedRoute, contract_error
from ..errors import dependency_guard
from ..reading import factory as factory_reader
from ..schemas import PlantSummary

router = APIRouter(tags=["factory"])

_NOT_FOUND = {404: {"description": "`not_found` — 그런 자원이 없다"}}


def _pool(request: Request) -> Any:
    pool = request.app.state.resources.pg_pool
    if pool is None:
        raise DependencyUnavailable("postgres")
    return pool


@router.get("/plants", response_model=list[PlantSummary])
async def list_plants(request: Request) -> list[PlantSummary]:
    """공장 목록 — 계약 `[{ plantId, name, lineCount, alarmCount }]`."""
    pool = _pool(request)
    async with dependency_guard("postgres"):
        rows = await factory_reader.list_plants(pool)
    return [PlantSummary(**row) for row in rows]


@router.get("/plants/{plantId}/overview", responses=NOT_IMPLEMENTED)
async def plant_overview(plantId: str) -> None:
    """라인·설비 상태 트리 + 활성 알람 + `kpi`(계약 G4 · v0.1.7 lines 형상).

    🔴 **활성 알람이 갈 자리가 형상에 없다.** 동결 본문은 활성 알람을 트리 원소가 들게 했고,
       v0.1.7 은 트리를 `lines[]` 로 다시 짜면서 원소에서 그것을 뺐다. 갈림 시 append 가
       이기므로 그대로 읽으면 이 응답에 알람이 없는데, 와이어프레임 §1 은 이 응답 하나로
       알람 도크와 **헤드라인 문장**(「최고 severity 1건」)을 그린다.
       → 정정 append 회부 중(오케 판정 대기). 판정 전까지 지어내지 않는다.
    """
    raise NotImplementedRoute(
        "GET /plants/{plantId}/overview", "활성 알람 자리 확정(정정 append 회부 중 · T3-2)"
    )


@router.get("/equipment/{equipmentId}", responses=_NOT_FOUND)
async def equipment_detail(equipmentId: str, request: Request) -> dict[str, Any]:
    """설비 상세 — 계약 v0.1.7 형상.

    🔴 `response_model` 을 걸지 않는다. 저장·조립한 dict 를 그대로 낸다 — pydantic 을 한 번
       더 지나면 같은 사실이 표면마다 다른 문자열이 되는 자리를 이 리포는 이미 겪었다
       (`GET /runs/{id}/events` 의 `ts` 정정). 형상의 정본은 계약이다.
    """
    pool = _pool(request)
    async with dependency_guard("postgres"):
        found = await factory_reader.equipment_detail(pool, equipmentId)
    if found is None:
        raise contract_error(404, "not_found", f"설비 {equipmentId} 를 찾을 수 없다")
    return found


@router.get("/equipment/{equipmentId}/sensors/{sensorId}/series", responses=NOT_IMPLEMENTED)
async def sensor_series(
    equipmentId: str,
    sensorId: str,
    window: Literal["24h", "3w"] = Query(description="계약이 허용하는 두 창"),
) -> None:
    """시계열 — 계약 v0.1.7 `{ sensorId, unit, window, warnThreshold, alarmThreshold, points[] }`.

    🔴 **실측이 형상보다 크다.** SN-204-VIB 기준 `24h` = 15,600점 764KB · `3w` = 44,400점
       2.07MB 다(E1). 그대로 실으면 차트가 죽고, 줄이면 응답은 「원본 전량」이 아니게 되는데
       지금 형상에는 **줄였다는 사실을 말할 칸이 없다** — 보는 사람은 모든 샘플을 봤다고
       믿는다(§0.2 측정-주장 경계). 그래서 `sampling` 칸을 정정 append 로 회부했고, 판정
       전까지 열지 않는다. 「크기 때문에 조용히 솎은 응답」을 먼저 내보내지 않는다.
    """
    raise NotImplementedRoute(
        "GET /equipment/{equipmentId}/sensors/{sensorId}/series",
        "다운샘플 표기(sampling) 확정(정정 append 회부 중 · T3-2)",
    )
