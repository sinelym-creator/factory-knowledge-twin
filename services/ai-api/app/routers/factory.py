"""계약 v0.1 §공장·설비 (Overview) — T3-2 조회 계층 해제.

무엇이 «있는가»: 공장 목록 · 공장 overview(트리·활성 알람·KPI) · 설비 상세 · 센서 시계열.
전부 **SSOT 읽기 전용**이고, 형상은 계약 v0.1.7 + 정정 append 가 정한 것 그대로다
(질의는 `reading/factory.py` 한 곳).

🔴 **이 파일이 열리기까지 계약이 세 번 정정됐다**, 그리고 그 셋 다 «구현이 형상을 실제로
   조립해 보다가» 나왔다: ① maintenanceSummary 에 기록 자기 id 가 없어 화면이 「눌러도 안
   열리는 id」를 그릴 뻔했고 ② series 는 3주 창이 2.07MB 라 다운샘플이 불가피한데 「가공했다」를
   말할 칸이 없었고 ③ overview 는 트리를 lines[] 로 재구성하며 활성 알람이 통째로 빠졌다.
   셋 다 **코드에서 조용히 넓히지 않고 계약으로 돌려보냈다** — 골격이 계약을 앞질러 정하면
   계약은 사후 추인이 된다.

🔴 **해제 단위는 라우트가 아니라 «화면이 부르는 질의 형태»다**(Q-26 · T3-2 게이트 1).
   소비처 없는 축은 열지 않는다 — `GET /graph/paths?from=&to=` 가 이 티켓에서도 501 로
   남는 것이 같은 규율이다.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query, Request

from ..errors import DependencyUnavailable, contract_error
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


@router.get("/plants/{plantId}/overview", responses=_NOT_FOUND)
async def plant_overview(plantId: str, request: Request) -> dict[str, Any]:
    """라인·설비 트리 + 활성 알람 + `kpi` — 계약 v0.1.7 + 정정 append.

    🔴 활성 알람이 **최상위 평면 배열**인 이유는 `reading/factory.overview` 머리말에 있다:
       헤드라인 문장은 「정렬된 목록의 첫 줄」이지 트리를 훑어 최댓값을 고른 결과가 아니다.
       고르는 규칙이 화면 코드에 살면 화면마다 갈린다.
    """
    pool = _pool(request)
    async with dependency_guard("postgres"):
        found = await factory_reader.overview(pool, plantId)
    if found is None:
        raise contract_error(404, "not_found", f"공장 {plantId} 를 찾을 수 없다")
    return found


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


@router.get("/equipment/{equipmentId}/sensors/{sensorId}/series", responses=_NOT_FOUND)
async def sensor_series(
    equipmentId: str,
    sensorId: str,
    request: Request,
    window: Literal["24h", "3w"] = Query(description="계약이 허용하는 두 창"),
) -> dict[str, Any]:
    """시계열 — 계약 v0.1.7 + 정정 append(`sampling` 필수).

    🔴 **줄이되 줄였다는 사실을 응답이 말한다.** 실측(SN-204-VIB): `24h` 원본 15,600점
       764KB · `3w` 44,400점 2.07MB — 그대로 실으면 차트가 죽는다. `sampling` 이
       `sourcePoints`·`returnedPoints` 를 함께 내보내므로 보는 쪽이 「전량을 봤다」고 믿지
       않는다(§0.2 측정-주장 경계를 형상에 새긴 자리).

    🔴 `sensorId` 가 다른 설비의 것이면 404 다 — 경로가 주장하는 관계가 거짓인데 값을
       내주면 화면이 남의 설비 센서를 이 설비 것으로 그린다.
    """
    pool = _pool(request)
    async with dependency_guard("postgres"):
        found = await factory_reader.sensor_series(pool, equipmentId, sensorId, window)
    if found is None:
        raise contract_error(
            404, "not_found", f"설비 {equipmentId} 의 센서 {sensorId} 를 찾을 수 없다"
        )
    return found
