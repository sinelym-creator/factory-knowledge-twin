"""조회 계층 — 공장·설비·센서·incident (T3-2 · 계약 v0.1.7 형상).

이 모듈이 여는 것은 **SSOT 읽기뿐**이다. 쓰기 경로가 없고, 조사 산출(run·초안·이력)도
건드리지 않는다 — 저 둘은 프로세스 안 저장소에 살고 세션 스코프다(계약 v0.1.4 저장 축).

🔴 **SQL 은 상수, 값은 파라미터 바인딩이다.** 사용자 문자열이 테이블·칼럼을 고르는 경로를
   만들지 않는다(baseline §34.6 · `reading/evidence.py` 와 같은 규율).

🔴 **해제 단위 = 화면 소비처가 실재하는 질의 형태만**(Q-26 · T3-2 게이트 1 대응표). 그래서
   `series` 의 창은 `24h`·`3w` 둘뿐이고, 임의 기간을 받지 않는다 — 쓰는 화면이 없는 축을
   열면 공개 표면만 넓어진다.

🔴 **낱말 하나가 판정으로 확정돼 있다**: KPI `openIncidents` 는 `status <> 'closed'` 계수다.
   SSOT 의 incident.status enum 실물은 `{investigating, closed}` 이고 `open` 이라는 값은
   없다 — 낱말 그대로 세면 늘 0 이 나오고 화면은 「진행 0」을 조용히 그린다(계약 v0.1.7 판정).
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("fkt.reading.factory")

# 화면이 쓰는 목록 상한 — 카드·패널에 들어가는 「최근 N」이다. 전량을 내보내면 응답이
# 화면이 못 그리는 크기로 자란다(series 의 실측이 그 교훈이다).
RECENT_ALARM_LIMIT = 5
MAINTENANCE_LIMIT = 5


_PLANTS_SQL = """
    SELECT f.id,
           f.name,
           (SELECT count(*) FROM production_line l WHERE l.factory_id = f.id) AS line_count,
           (SELECT count(*)
              FROM alarm a
              JOIN equipment e ON e.id = a.equipment_id
              JOIN production_line l ON l.id = e.line_id
             WHERE l.factory_id = f.id AND a.status = 'active') AS alarm_count
      FROM factory f
     ORDER BY f.id
"""


async def list_plants(pool: Any) -> list[dict[str, Any]]:
    """`GET /plants` — 계약 v0.1 동결 형상 `[{plantId, name, lineCount, alarmCount}]`."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(_PLANTS_SQL)
    return [
        {
            "plantId": r["id"],
            "name": r["name"],
            "lineCount": r["line_count"],
            "alarmCount": r["alarm_count"],
        }
        for r in rows
    ]


_EQUIPMENT_SQL = """
    SELECT e.id, e.name, e.equipment_class, e.model, e.installed_on,
           e.status, e.criticality, e.line_id
      FROM equipment e
     WHERE e.id = $1
"""

_SENSORS_SQL = """
    SELECT s.id, s.measurement_type, s.unit, s.warn_threshold, s.alarm_threshold
      FROM sensor s
     WHERE s.equipment_id = $1
     ORDER BY s.id
"""

_RECENT_ALARMS_SQL = """
    SELECT a.id, a.severity, a.status, a.raised_at
      FROM alarm a
     WHERE a.equipment_id = $1
     ORDER BY a.raised_at DESC
     LIMIT $2
"""

_MAINTENANCE_SQL = """
    SELECT m.id, m.work_order_id, m.action_type, m.performed_at, m.note
      FROM maintenance_record m
     WHERE m.equipment_id = $1
     ORDER BY m.performed_at DESC
     LIMIT $2
"""


async def equipment_detail(pool: Any, equipment_id: str) -> dict[str, Any] | None:
    """`GET /equipment/{equipmentId}` — 계약 v0.1.7 형상."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_EQUIPMENT_SQL, equipment_id)
        if row is None:
            return None
        sensors = await conn.fetch(_SENSORS_SQL, equipment_id)
        alarms = await conn.fetch(_RECENT_ALARMS_SQL, equipment_id, RECENT_ALARM_LIMIT)
        maintenance = await conn.fetch(_MAINTENANCE_SQL, equipment_id, MAINTENANCE_LIMIT)

    return {
        "equipmentId": row["id"],
        "name": row["name"],
        "equipmentClass": row["equipment_class"],
        "model": row["model"],
        "installedOn": _date(row["installed_on"]),
        "status": row["status"],
        "criticality": row["criticality"],
        "lineId": row["line_id"],
        "sensors": [
            {
                "sensorId": s["id"],
                "measurementType": s["measurement_type"],
                "unit": s["unit"],
                # 🔴 두 임계를 다 낸다. 차트 «기준선»은 warnThreshold 다(계약 v0.1.7 성문) —
                #    alarmThreshold 를 그리면 알람이 임계 «아래»에서 뜬 거짓 화면이 된다.
                "warnThreshold": _num(s["warn_threshold"]),
                "alarmThreshold": _num(s["alarm_threshold"]),
            }
            for s in sensors
        ],
        "recentAlarms": [
            {
                "alarmId": a["id"],
                "severity": a["severity"],
                "status": a["status"],
                # 계약 낱말은 openedAt · SSOT 열은 raised_at — 여기가 그 대응의 유일한 자리다.
                "openedAt": _ts(a["raised_at"]),
            }
            for a in alarms
        ],
        "maintenanceSummary": [
            {
                "workOrderId": m["work_order_id"],
                "type": m["action_type"],
                "completedOn": _ts(m["performed_at"]),
                "summary": m["note"],
            }
            for m in maintenance
        ],
    }


_INCIDENT_SQL = """
    SELECT i.id, i.title, i.status, i.severity, i.opened_at, i.closed_at, i.equipment_id
      FROM incident i
     WHERE i.id = $1
"""

_INCIDENT_ALARMS_SQL = """
    SELECT a.id FROM alarm a WHERE a.incident_id = $1 ORDER BY a.raised_at
"""


async def incident_detail(pool: Any, incident_id: str) -> dict[str, Any] | None:
    """`GET /incidents/{incidentId}` — 계약 v0.1.7 형상(`runId` 는 호출자가 붙인다).

    🔴 `runId` 를 여기서 채우지 않는 이유: run 은 **세션 스코프**다. SSOT 조회 층이 run 을
       들여다보면 이 응답이 세션마다 달라야 한다는 사실이 조회 층에 스며들고, 그러면 「남의
       run 이 보이는가」를 이 모듈에서도 다시 판정하게 된다. 소유권 판정은 한 곳이다
       (`app/ownership.py`) — 라우터가 그 결과를 얹는다.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_INCIDENT_SQL, incident_id)
        if row is None:
            return None
        alarms = await conn.fetch(_INCIDENT_ALARMS_SQL, incident_id)

    return {
        "incidentId": row["id"],
        "title": row["title"],
        "status": row["status"],
        "severity": row["severity"],
        "openedAt": _ts(row["opened_at"]),
        "closedAt": _ts(row["closed_at"]),
        "equipmentId": row["equipment_id"],
        "alarmIds": [a["id"] for a in alarms],
    }


# --- KPI ---------------------------------------------------------------------------

# 🔴 네 계수를 **한 질의**로 낸다. 넷을 따로 던지면 그 사이에 SSOT 가 바뀌었을 때 KPI 스트립
#    안에서 서로 어긋난 숫자가 나란히 선다 — 「같은 순간의 4개」라는 것이 이 스트립의 뜻이다.
_KPI_SQL = """
    WITH plant_lines AS (
        SELECT l.id FROM production_line l WHERE l.factory_id = $1
    ),
    plant_equipment AS (
        SELECT e.id FROM equipment e JOIN plant_lines pl ON pl.id = e.line_id
    )
    SELECT
      (SELECT count(*) FROM production_line l
        WHERE l.factory_id = $1 AND l.status = 'active')               AS line_active,
      (SELECT count(*) FROM alarm a
        WHERE a.status = 'active'
          AND a.equipment_id IN (SELECT id FROM plant_equipment))      AS alarm_count,
      -- 🔴 계약 v0.1.7 판정: openIncidents = status <> 'closed'. SSOT enum 에 'open' 은 없다.
      (SELECT count(*) FROM incident i
        WHERE i.status <> 'closed'
          AND i.equipment_id IN (SELECT id FROM plant_equipment))      AS open_incidents,
      (SELECT count(*) FROM work_order w
        WHERE w.approval_state = 'pending'
          AND w.equipment_id IN (SELECT id FROM plant_equipment))      AS pending_work_orders
"""


async def kpi(pool: Any, plant_id: str) -> dict[str, int]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_KPI_SQL, plant_id)
    return {
        "lineActive": row["line_active"],
        "alarmCount": row["alarm_count"],
        "openIncidents": row["open_incidents"],
        "pendingWorkOrders": row["pending_work_orders"],
    }


# --- 형 변환 ------------------------------------------------------------------------


def _ts(value: Any) -> str | None:
    """RFC3339(UTC · `Z`) — 🔴 한 곳에서만 만든다.

    같은 시각이 표면마다 다른 문자열이 되는 자리를 이 리포는 이미 겪었다
    (`GET /runs/{id}/events` 의 `ts` 정정 · routers/investigations.py 성문).
    """
    if value is None:
        return None
    return value.astimezone(tz=None).isoformat() if value.tzinfo is None else (
        value.isoformat().replace("+00:00", "Z")
    )


def _date(value: Any) -> str | None:
    return None if value is None else value.isoformat()


def _num(value: Any) -> float | None:
    """`numeric` 은 Decimal 로 온다 — JSON 이 못 싣는다."""
    return None if value is None else float(value)
