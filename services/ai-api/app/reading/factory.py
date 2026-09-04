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
from datetime import timedelta
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
                # 🔴 기록의 «자기 id» 가 필수다(계약 v0.1.7-정정). 실물 4행 중 3행이
                #    work_order_id NULL 이고, 화면이 그리는 `MR-…` 은 근거 id 체계의
                #    일부라 눌러서 열려야 한다(온톨로지 MR → maintenance_record).
                "maintenanceRecordId": m["id"],
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


# --- Overview ----------------------------------------------------------------------

# 🔴 severity 정렬 순서의 «출처는 DB 제약»이다(`alarm_severity_check` = info·warning·critical).
#    내가 고른 낱말이 아니라 SSOT 가 강제하는 어휘라, 새 낱말이 생기면 여기가 모른다.
_SEVERITY_RANK: dict[str, float] = {"critical": 0.0, "warning": 1.0, "info": 2.0}
# 🔴 모르는 낱말은 **critical 바로 아래**에 둔다 — 맨 뒤로 보내면 새 severity 가 목록 끝에
#    묻혀 아무도 못 보고, 맨 위에 두면 info 급 낱말이 헤드라인을 차지한다. 보이되 최고를
#    밀어내지 않는 자리다. 함께 로그로 운다(조용히 지나가는 쪽을 고르지 않는다).
_UNKNOWN_SEVERITY_RANK = 0.5

_PLANT_SQL = "SELECT f.id, f.name FROM factory f WHERE f.id = $1"

_LINES_SQL = """
    SELECT l.id, l.name, l.line_no, l.status
      FROM production_line l
     WHERE l.factory_id = $1
     ORDER BY l.line_no
"""

_LINE_EQUIPMENT_SQL = """
    SELECT e.line_id, e.id, e.name, e.status, e.criticality,
           coalesce(array_agg(s.id ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL),
                    ARRAY[]::text[]) AS sensor_ids
      FROM equipment e
      LEFT JOIN sensor s ON s.equipment_id = e.id
     WHERE e.line_id = ANY($1::text[])
     GROUP BY e.line_id, e.id, e.name, e.status, e.criticality
     ORDER BY e.id
"""

_ACTIVE_ALARMS_SQL = """
    SELECT a.id, a.severity, a.status, a.raised_at,
           a.threshold_value, a.observed_value, a.equipment_id, a.sensor_id,
           -- 🔴 알람→상황 연결(계약 v0.1.16 · R13). 조인이 아니라 alarm 의 FK 컬럼을 그대로
           --    싣는다: 이 열은 `REFERENCES incident(id) ON DELETE SET NULL` 이라 값이 있으면
           --    실재하는 incident 이고, 지워지면 NULL 이 된다. 화면이 알람 id 로 지어낼 값이
           --    아니라 서버가 아는 사실이다.
           a.incident_id
      FROM alarm a
      JOIN equipment e ON e.id = a.equipment_id
      JOIN production_line l ON l.id = e.line_id
     WHERE l.factory_id = $1 AND a.status = 'active'
"""


async def overview(pool: Any, plant_id: str) -> dict[str, Any] | None:
    """`GET /plants/{plantId}/overview` — kpi + lines 트리 + 활성 알람 평면 배열.

    🔴 활성 알람이 **최상위 평면 배열**인 이유(계약 v0.1.7-정정): 도크는 설비별 묶음이 아니라
       severity 순 목록이고, 헤드라인 문장은 「전체에서 가장 심각한 1건」 — 즉 **정렬된 목록의
       첫 줄**이다. 트리 원소에 흩어 두면 최댓값을 고르는 규칙이 계약 밖(화면 코드)에 살게
       되고, 그러면 같은 사실이 화면마다 갈린다.
    """
    async with pool.acquire() as conn:
        plant = await conn.fetchrow(_PLANT_SQL, plant_id)
        if plant is None:
            return None
        lines = await conn.fetch(_LINES_SQL, plant_id)
        line_ids = [ln["id"] for ln in lines]
        equipment = await conn.fetch(_LINE_EQUIPMENT_SQL, line_ids) if line_ids else []
        alarms = await conn.fetch(_ACTIVE_ALARMS_SQL, plant_id)
        counts = await conn.fetchrow(_KPI_SQL, plant_id)

    by_line: dict[str, list[dict[str, Any]]] = {lid: [] for lid in line_ids}
    for e in equipment:
        by_line[e["line_id"]].append(
            {
                "equipmentId": e["id"],
                "name": e["name"],
                "status": e["status"],
                "criticality": e["criticality"],
                # 🔴 스파크라인 «값»은 여기 싣지 않는다 — 카드가 series 를 따로 먹는다
                #    (계약 v0.1.7 · 집계 응답 비대 방지). 여기는 「어느 센서를 물을지」만 준다.
                "sensorIds": list(e["sensor_ids"]),
            }
        )

    return {
        "kpi": {
            "lineActive": counts["line_active"],
            "alarmCount": counts["alarm_count"],
            "openIncidents": counts["open_incidents"],
            "pendingWorkOrders": counts["pending_work_orders"],
        },
        "lines": [
            {
                "lineId": ln["id"],
                "name": ln["name"],
                "lineNo": ln["line_no"],
                "status": ln["status"],
                "equipment": by_line[ln["id"]],
            }
            for ln in lines
        ],
        "activeAlarms": _sorted_alarms(alarms),
    }


def _sorted_alarms(rows: list[Any]) -> list[dict[str, Any]]:
    def rank(severity: str) -> float:
        known = _SEVERITY_RANK.get(severity)
        if known is None:
            log.warning("정렬 규칙이 모르는 alarm.severity 다: %r — DB 제약이 늘었는가", severity)
            return _UNKNOWN_SEVERITY_RANK
        return known

    ordered = sorted(rows, key=lambda a: (rank(a["severity"]), -a["raised_at"].timestamp()))
    return [
        {
            "alarmId": a["id"],
            "severity": a["severity"],
            "status": a["status"],
            "raisedAt": _ts(a["raised_at"]),
            "thresholdValue": _num(a["threshold_value"]),
            "observedValue": _num(a["observed_value"]),
            "equipmentId": a["equipment_id"],
            "sensorId": a["sensor_id"],
            # 연결이 없으면 `None` — 「아직 상황으로 안 묶인 알람」이라는 사실 그대로다.
            "incidentId": a["incident_id"],
        }
        for a in ordered
    ]


# --- 센서 시계열 --------------------------------------------------------------------

# 계약이 허용한 두 창 «만». 사용자 문자열이 기간을 정하지 못하게 여기서 상수로 갈아 끼운다.
# 창 이름 → 초. 계약이 허용한 두 창 «만» — 임의 기간을 받지 않는다.
WINDOW_SECONDS: dict[str, float] = {"24h": 24 * 3600.0, "3w": 21 * 24 * 3600.0}

# 🔴 반환 버킷 수. bucket-minmax 라 버킷당 최대 2점이므로 상한은 대략 이 값의 두 배다.
#    실측: 3주 원본 44,400점 = 2.07MB · 24시간 15,600점 = 764KB — 그대로는 차트가 죽는다.
TARGET_BUCKETS = 300

_SERIES_SENSOR_SQL = """
    SELECT s.id, s.unit, s.warn_threshold, s.alarm_threshold
      FROM sensor s
     WHERE s.id = $1 AND s.equipment_id = $2
"""

# 🔴 창의 «기준점»은 벽시계 now() 가 아니라 **그 센서의 마지막 판독**이다. seed 는 과거
#    구간(2026-08-05~08-26)의 합성 데이터라, now() 기준으로 자르면 24h 창이 «빈 차트»가
#    된다 — 데이터가 없는 것이 아니라 창이 빗나간 것인데 화면은 둘을 구분하지 못한다.
#    points 의 ts 가 구간을 그대로 드러내므로 이 선택은 응답에서 보인다.
_SERIES_SQL = """
    WITH bounds AS (
        SELECT max(r.ts) AS anchor FROM sensor_reading r WHERE r.sensor_id = $1
    ),
    src AS (
        SELECT r.ts, r.value
          FROM sensor_reading r, bounds b
         WHERE r.sensor_id = $1
           AND r.ts >  b.anchor - $2::interval
           AND r.ts <= b.anchor
    ),
    bucketed AS (
        SELECT ts, value, floor(extract(epoch FROM ts) / $3::double precision) AS bucket FROM src
    ),
    lows AS (
        SELECT DISTINCT ON (bucket) bucket, ts, value FROM bucketed ORDER BY bucket, value, ts
    ),
    highs AS (
        SELECT DISTINCT ON (bucket) bucket, ts, value FROM bucketed ORDER BY bucket, value DESC, ts
    ),
    picked AS (
        SELECT ts, value FROM lows
        UNION
        SELECT ts, value FROM highs
    )
    SELECT ts, value, (SELECT count(*) FROM src) AS source_points
      FROM picked
     ORDER BY ts
"""


async def sensor_series(
    pool: Any, equipment_id: str, sensor_id: str, window: str
) -> dict[str, Any] | None:
    """`GET /equipment/{id}/sensors/{sid}/series?window=` — 계약 v0.1.7-정정 형상.

    🔴 **줄이되, 줄였다는 사실을 응답이 스스로 말한다**(`sampling`). 버킷당 min·max 를 남기는
       방식이라 임계 교차와 알람 순간이 평균에 뭉개지지 않는다 — 이 차트가 하는 말이
       「임계를 넘었다」이므로, 넘은 그 점을 지우는 축약은 그림을 거짓으로 만든다.

    🔴 **경로의 두 id 관계를 확인한다.** `sensorId` 가 다른 설비의 것이면 404 다 — 경로가
       주장하는 관계가 거짓인데 값을 내주면, 화면은 남의 설비 센서를 이 설비 것으로 그린다.
    """
    span_sec = WINDOW_SECONDS.get(window)
    if span_sec is None:                                  # 라우트의 Literal 이 이미 막지만,
        return None                                       # 이 함수만 따로 부를 때를 위해 남긴다.
    # 🔴 `interval` 파라미터는 문자열이 아니라 timedelta 로 넘긴다 — asyncpg 는 `$n::interval`
    #    을 보고 파이썬 timedelta 를 기대하며, '24 hours' 를 주면 DataError 다. 그리고 그
    #    DataError 는 `dependency_guard` 가 «의존 단절 503» 으로 접어서 「DB 가 죽었다」로
    #    보인다 — 질의 결함이 인프라 사건으로 위장되는 자리라 여기 적어 둔다(실측으로 걸렸다).
    interval = timedelta(seconds=span_sec)

    async with pool.acquire() as conn:
        sensor = await conn.fetchrow(_SERIES_SENSOR_SQL, sensor_id, equipment_id)
        if sensor is None:
            return None
        bucket_sec = max(span_sec / TARGET_BUCKETS, 1.0)
        rows = await conn.fetch(_SERIES_SQL, sensor_id, interval, bucket_sec)

    # 🔴 **시각 문자열을 한 곳에서만 만든다.** 앞판은 SQL 의 `json_agg` 가 점을 통째로
    #    직렬화해서 `…+00:00` 이 나왔는데, 같은 응답의 알람·정비 시각은 `_ts` 를 지나
    #    `…Z` 였다 — **같은 종류의 값이 한 기능 안에서 두 표기**가 되는 자리다(이 리포가
    #    `GET /runs/{id}/events` 의 ts 로 이미 값을 치른 형태). 행으로 받아 `_ts` 로 낸다.
    points = [{"ts": _ts(r["ts"]), "value": _num(r["value"])} for r in rows]
    source_points = rows[0]["source_points"] if rows else 0
    return {
        "sensorId": sensor["id"],
        "unit": sensor["unit"],
        "window": window,
        "warnThreshold": _num(sensor["warn_threshold"]),
        "alarmThreshold": _num(sensor["alarm_threshold"]),
        "sampling": {
            "method": "bucket-minmax",
            "bucketMs": int(bucket_sec * 1000),
            "sourcePoints": source_points,
            "returnedPoints": len(points),
        },
        "points": points,
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
