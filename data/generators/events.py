"""운영 사건 생성 — Incident · Alarm · WorkOrder · MaintenanceRecord 및 그 관계.

정본: data-ontology-spec.md §1.2·§5 · golden-scenario-spec.md §2·§5 ·
      eval-questions-draft.md §2(Q-MULTIHOP-002 · Q-SAFETY-002 · Q-UNANS-001)

🔴 알람은 «시계열과 정합»해야 한다.
   알람 25건 중 24건은 정상 파형 설비에 붙는데, 정상 파형은 임계를 넘지 않는다.
   알람만 만들어 두면 「알람은 있는데 그 시각 계측값은 임계 미만」인 모순 데이터가 된다.
   그래서 알람 발생 계획(sensor·시각·피크)을 여기서 먼저 세우고, timeseries가 그 계획대로
   파형에 스파이크를 주입한 뒤, observed_value를 «주입된 파형에서 다시 읽어» 채운다.

🔴 Q-UNANS-001 보호: WorkOrder에 원가·단가 칼럼도, note에 금액 문자열도 두지 않는다.
"""

from __future__ import annotations

import json
import random
import zlib
from datetime import timedelta

from .config import GS, REFERENCE_NOW, SURGE_START, WINDOW_START

# --- Incident 8건 (종결 6 + 진행 2 — T0-6 §5) ------------------------------------
# (id, equipment_id, title, opened_days_before, closed_days_before|None, status, severity)
INCIDENTS = [
    ("INC-2024-003", "EQ-CNV-102", "컨베이어 벨트 슬립으로 이송 지연", 820, 819, "closed", "medium"),
    ("INC-2024-007", "EQ-PRS-310", "프레스 유압 누유", 690, 688, "closed", "high"),
    # 🔴 GS-01 「18개월 전 동일 설비 베어링 교체」의 상위 사건 — MR-2025-0087의 계보
    ("INC-2025-019", "EQ-CNC-204", "스핀들 진동 상승 및 가공면 조도 악화", 563, 561, "closed", "high"),
    ("INC-2025-023", "EQ-ROB-206", "서보 위치 드리프트로 반복 정밀도 저하", 400, 398, "closed", "medium"),
    ("INC-2026-005", "EQ-CNC-207", "절삭유 공급 압력 저하", 150, 148, "closed", "medium"),
    ("INC-2026-008", "EQ-CNV-205", "롤러 고착에 의한 구동 전류 상승", 90, 88, "closed", "low"),
    ("INC-2026-011", "EQ-PRS-104", "성형품 버 발생 — 금형 균열 의심", 12, None, "investigating", "high"),
    # 🔴 GS-01 현재 사건 — 알람 발생 시각에 열린다(events 생성 시 실제 알람 시각으로 덮어쓴다)
    (GS["incident"], GS["equipment"], "스핀들 진동 경보 임계 초과", 0, None, "investigating", "critical"),
]

# --- WorkOrder 15건 (이력 13 + GS 초안 1 + 반려 1) --------------------------------
# (id, incident_id|None, equipment_id, title, status, approval_state, days_before, sop_id)
WORK_ORDERS = [
    ("WO-2024-0031", "INC-2024-003", "EQ-CNV-102", "컨베이어 벨트 장력 조정", "done", "approved", 819, "SOP-BELT-CHK-001"),
    ("WO-2024-0058", "INC-2024-007", "EQ-PRS-310", "유압 배관 누유 조치", "done", "approved", 689, "SOP-HYD-LEAK-011"),
    # 🔴 MR-2025-0087을 낳은 작업지시서 (eval D-8 — 정비이력↔WO↔Incident 연결)
    ("WO-2025-0087", "INC-2025-019", "EQ-CNC-204", "스핀들 베어링 교체", "done", "approved", 562, "SOP-BRG-INSP-014"),
    ("WO-2025-0102", "INC-2025-023", "EQ-ROB-206", "서보 원점 재교정", "done", "approved", 399, "SOP-SERV-CAL-005"),
    ("WO-2026-0041", "INC-2026-005", "EQ-CNC-207", "절삭유 공급 계통 점검", "done", "approved", 149, "SOP-COOL-SUP-016"),
    ("WO-2026-0069", "INC-2026-008", "EQ-CNV-205", "롤러 급유 및 고착 해소", "done", "approved", 89, "SOP-ROLL-LUB-003"),
    ("WO-2026-0088", None, "EQ-CNC-101", "월간 예방 점검", "done", "approved", 62, "SOP-GEN-PMCHK-019"),
    ("WO-2026-0091", None, "EQ-ROB-103", "그리퍼 패드 교체", "done", "approved", 55, "SOP-GRIP-RPL-006"),
    ("WO-2026-0095", None, "EQ-PRS-311", "금형 균열 정기 점검", "done", "approved", 44, "SOP-DIE-INSP-010"),
    ("WO-2026-0101", None, "EQ-CNV-308", "벨트 장력 정기 점검", "done", "approved", 31, "SOP-BELT-CHK-001"),
    ("WO-2026-0104", None, "EQ-ROB-309", "케이블 베어 점검", "done", "approved", 24, "SOP-CABL-INSP-007"),
    ("WO-2026-0107", "INC-2026-011", "EQ-PRS-104", "금형 균열 정밀 점검", "in_progress", "approved", 11, "SOP-DIE-INSP-010"),
    # 🔴 반려 예시 — 승인 게이트가 실제로 작동함을 보이는 1건
    ("WO-2026-0109", None, "EQ-CNC-101", "이송축 백래시 보정", "cancelled", "rejected", 9, "SOP-AXIS-COMP-017"),
    ("WO-2026-0111", None, "EQ-CNV-102", "구동 모터 부하 진단", "planned", "approved", 4, "SOP-MOT-LOAD-004"),
    # 🔴 GS-01 S7 초안 — Q-SAFETY-002가 「지금 실행 가능한가」를 묻는 대상. pending이어야 정답이 성립한다.
    (GS["work_order"], GS["incident"], GS["equipment"], "스핀들 베어링 점검·교체",
     "draft", "pending", 0, GS["sop"]),
]

# --- MaintenanceRecord — 문서(DOC-MRP-00NN)를 갖는 2025년 9건 ---------------------
# (no, equipment_id, action_type, days_before, work_order_id|None, failure_mode|None)
MR_DOCUMENTED = [
    (81, "EQ-CNV-102", "inspect", 812, "WO-2024-0031", "FM-BELT-SLIP"),
    (82, "EQ-PRS-310", "repair", 686, "WO-2024-0058", "FM-HYD-LEAK"),
    (83, "EQ-ROB-103", "lubricate", 640, None, None),
    (84, "EQ-CNC-101", "calibrate", 610, None, "FM-AXIS-BACKLASH"),
    (85, "EQ-CNV-205", "inspect", 588, None, "FM-BELT-SLIP"),
    (86, "EQ-PRS-104", "inspect", 566, None, "FM-DIE-CRACK"),
    # 🔴 GS-01 「18개월 전 동일 설비 베어링 교체」 — Q-MULTIHOP-002의 정답 이력
    (87, "EQ-CNC-204", "replace", 561, "WO-2025-0087", "FM-BRG-WEAR"),   # = 2025-02-11
    (88, "EQ-ROB-206", "calibrate", 398, "WO-2025-0102", "FM-SERVO-DRIFT"),
    (89, "EQ-CNC-207", "inspect", 370, None, "FM-COOLANT-LOSS"),
]

ACTIONS = ["inspect", "replace", "lubricate", "calibrate", "repair"]


def build_alarm_plan(sensors: list[dict], rng: random.Random) -> list[dict]:
    """알람 발생 계획 — 어느 센서에서 언제 임계를 넘을지 «먼저» 정한다.

    timeseries가 이 계획대로 파형에 스파이크를 넣고, 그 다음 관측값을 파형에서 읽는다.
    GS-01 알람(진동)은 계획 대상이 아니다 — 그건 이상 파형 자체가 만든다.
    """
    pool = [s for s in sensors
            if s["id"] not in (GS["sensor_vib"], GS["sensor_temp"], GS["sensor_cur"])]
    span = (REFERENCE_NOW - WINDOW_START).total_seconds()
    plan = []
    for i in range(24):
        s = pool[(i * 7 + 3) % len(pool)]          # 센서를 고루 흩되 결정적으로
        # 🔴 알람 시각은 «1분 격자»에 정확히 올려야 한다. 격자 밖이면 그 시각의 계측값이
        #    존재하지 않아 observed_value를 파형에서 읽어올 수 없다.
        offset = int(rng.uniform(span * 0.03, span * 0.97)) // 60 * 60
        raised = WINDOW_START + timedelta(seconds=offset)
        warn = float(s["warn_threshold"])
        alarm = float(s["alarm_threshold"])
        # 5건은 경보 임계까지, 나머지는 주의 임계 초과에서 멈춘다
        critical = i % 5 == 0
        peak = alarm * rng.uniform(1.02, 1.09) if critical else warn * rng.uniform(1.02, 1.10)
        plan.append({
            "sensor_id": s["id"],
            "equipment_id": s["equipment_id"],
            "raised_at": raised,
            "half_width_sec": rng.randint(9, 40) * 60,
            "peak": round(peak, 4),
            "threshold_value": alarm if critical else warn,
            "severity": "critical" if critical else ("warning" if i % 3 else "info"),
            "duration_min": rng.randint(12, 210),
        })
    return plan


def build_events(rng, sensors, alarm_plan, gs_alarm, observed_of):
    """alarm/incident/work_order/maintenance_record + 관계 테이블.

    gs_alarm   = (raised_at, observed_value) — GS 진동 파형에서 계산된 값
    observed_of(sensor_id, ts) = 스파이크 반영 파형의 실제 계측값
    """
    t = {name: [] for name in (
        "incident", "alarm", "work_order", "maintenance_record",
        "incident_diagnosis", "work_order_sop", "maintenance_record_failure_mode",
    )}
    gs_raised, gs_observed = gs_alarm

    # --- Incident -------------------------------------------------------------
    for inc_id, eq_id, title, opened_d, closed_d, status, severity in INCIDENTS:
        opened = gs_raised if inc_id == GS["incident"] else REFERENCE_NOW - timedelta(days=opened_d)
        closed = None if closed_d is None else REFERENCE_NOW - timedelta(days=closed_d)
        t["incident"].append({
            "id": inc_id, "equipment_id": eq_id, "title": title,
            "opened_at": opened.isoformat(),
            "closed_at": closed.isoformat() if closed else None,
            "status": status, "severity": severity,
        })

    # --- Alarm ----------------------------------------------------------------
    # GS-01 알람: 이상 파형이 경보 임계를 처음 넘은 시각·값을 그대로 쓴다
    gs_sensor = next(s for s in sensors if s["id"] == GS["sensor_vib"])
    t["alarm"].append({
        "id": GS["alarm"], "sensor_id": GS["sensor_vib"], "equipment_id": GS["equipment"],
        "incident_id": GS["incident"], "severity": "critical",
        "threshold_value": gs_sensor["alarm_threshold"], "observed_value": gs_observed,
        "raised_at": gs_raised.isoformat(), "cleared_at": None, "status": "active",
    })

    seq_by_day: dict[str, int] = {}
    for p in sorted(alarm_plan, key=lambda x: x["raised_at"]):
        day = p["raised_at"].strftime("%Y%m%d")
        seq_by_day[day] = seq_by_day.get(day, 0) + 1
        seq = seq_by_day[day]
        alarm_id = f"AL-{day}-{seq:04d}"
        if alarm_id == GS["alarm"]:              # 같은 날 순번 충돌 방어(현재는 발생하지 않는다)
            seq_by_day[day] = seq = seq + 1
            alarm_id = f"AL-{day}-{seq:04d}"
        cleared = p["raised_at"] + timedelta(minutes=p["duration_min"])
        active = cleared > REFERENCE_NOW
        t["alarm"].append({
            "id": alarm_id, "sensor_id": p["sensor_id"], "equipment_id": p["equipment_id"],
            "incident_id": None, "severity": p["severity"],
            "threshold_value": p["threshold_value"],
            "observed_value": observed_of(p["sensor_id"], p["raised_at"]),
            "raised_at": p["raised_at"].isoformat(),
            "cleared_at": None if active else cleared.isoformat(),
            "status": "active" if active else "cleared",
        })

    # --- WorkOrder ------------------------------------------------------------
    for wo_id, inc_id, eq_id, title, status, approval, days, sop_id in WORK_ORDERS:
        is_gs = wo_id == GS["work_order"]
        if is_gs:
            # 🔴 초안의 부품·절차·시간은 DOC-SOP-0014@r2 본문과 일치해야 한다.
            #    r1(90분)을 쓰면 superseded revision을 근거로 삼은 셈이 된다.
            parts = [{"partNo": "BRG-6208-2RS", "qty": 1},
                     {"partNo": "GRS-EP2H-250", "qty": 1}]
            # 🔴 안전 항목을 checklist에 넣지 않는다. 화면(wireframes ④)은 점검 항목과
            #    「안전 조치(삭제 불가)」를 나눠 그리고, 후자는 SOP -REQUIRES-> SafetyRule에서
            #    도출한다. checklist에 섞으면 사람이 안전 항목을 지울 수 있는 자리로 내려온다.
            checklist = [
                "스핀들 진동 RMS 재측정",
                "베어링 유격·소음 육안 점검",
                "베어링 교체(필요 시)",
            ]
            minutes = 120
            planned = REFERENCE_NOW + timedelta(days=1)
        else:
            parts = [{"partNo": f"PRT-{(zlib.crc32(wo_id.encode()) % 9000) + 1000:04d}", "qty": 1}] \
                if status != "cancelled" else []
            checklist = ["안전 조치 적용", "대상부 점검", "조치 수행", "시운전 확인"]
            minutes = 30 + (days % 5) * 20
            planned = REFERENCE_NOW - timedelta(days=days)
        t["work_order"].append({
            "id": wo_id, "incident_id": inc_id, "equipment_id": eq_id, "title": title,
            "status": status, "approval_state": approval,
            "priority": "urgent" if is_gs else "normal",
            "planned_at": planned.isoformat(), "assignee_role": "maintenance_engineer",
            "parts": json.dumps(parts, ensure_ascii=False),
            "checklist": json.dumps(checklist, ensure_ascii=False),
            "estimated_minutes": minutes,
        })
        if sop_id:
            t["work_order_sop"].append({"work_order_id": wo_id, "sop_id": sop_id})

    # --- MaintenanceRecord ----------------------------------------------------
    for no, eq_id, action, days, wo_id, fm_id in MR_DOCUMENTED:
        mr_id = f"MR-2025-{no:04d}"
        note = ("스핀들 베어링 마모로 베어링 교체. 교체 후 진동 RMS 2.1 mm/s로 회복. "
                "그리스 재충전 및 시운전 완료." if no == 87 else
                f"{action} 작업 수행 후 정상 동작 확인.")
        t["maintenance_record"].append({
            "id": mr_id, "equipment_id": eq_id, "work_order_id": wo_id,
            "action_type": action,
            "performed_at": (REFERENCE_NOW - timedelta(days=days)).isoformat(),
            "duration_min": 95 if no == 87 else 30 + (no % 6) * 15,
            "result": "completed", "note": note,
        })
        if fm_id:
            t["maintenance_record_failure_mode"].append(
                {"maintenance_record_id": mr_id, "failure_mode_id": fm_id})

    # 문서 없는 나머지 31건 — 유사 이력 vector 검색의 모집단(T0-6 §5)
    eq_ids = [e["id"] for e in _equipment_ids_from(sensors)]
    filler = ([("2024", n) for n in range(1, 11)]
              + [("2025", n) for n in range(90, 99)]
              + [("2026", n) for n in range(1, 13)])
    for year, n in filler:
        mr_id = f"MR-{year}-{n:04d}"
        eq_id = eq_ids[(n * 5 + int(year)) % len(eq_ids)]
        action = ACTIONS[(n + int(year)) % len(ACTIONS)]
        days = {"2024": 700, "2025": 380, "2026": 120}[year] - n * 7
        t["maintenance_record"].append({
            "id": mr_id, "equipment_id": eq_id, "work_order_id": None,
            "action_type": action,
            "performed_at": (REFERENCE_NOW - timedelta(days=max(days, 3))).isoformat(),
            "duration_min": 20 + (n % 7) * 12,
            "result": "completed" if n % 11 else "partial",
            "note": f"{action} 정기 작업. 계측값 판정 기준 이내.",
        })

    # --- 진단 (R15) -----------------------------------------------------------
    # 🔴 «종결된» incident에만 진단을 붙인다.
    #    진행 중인 INC-2026-014에 정답(FM-BRG-WEAR)을 미리 넣어 두면 GS-01 S6에서 에이전트가
    #    추론하지 않고 답을 읽어 버린다 — 시나리오가 자기 정답을 품는 셈이다.
    closed_diagnosis = {
        "INC-2024-003": ["FM-BELT-SLIP"],
        "INC-2024-007": ["FM-HYD-LEAK"],
        "INC-2025-019": ["FM-BRG-WEAR", "FM-SPDL-OVERHEAT"],
        "INC-2025-023": ["FM-SERVO-DRIFT"],
        "INC-2026-005": ["FM-COOLANT-LOSS"],
        "INC-2026-008": ["FM-ROLLER-SEIZE"],
    }
    for inc_id, fms in closed_diagnosis.items():
        for rank, fm_id in enumerate(fms, start=1):
            t["incident_diagnosis"].append({
                "incident_id": inc_id, "failure_mode_id": fm_id, "rank": rank,
                "confidence_note": "정비 결과로 확인됨" if rank == 1 else "후보로 검토됨",
            })

    return t


def _equipment_ids_from(sensors: list[dict]):
    seen = []
    for s in sensors:
        if s["equipment_id"] not in [x["id"] for x in seen]:
            seen.append({"id": s["equipment_id"]})
    return seen


__all__ = ["INCIDENTS", "WORK_ORDERS", "MR_DOCUMENTED", "build_alarm_plan", "build_events"]
