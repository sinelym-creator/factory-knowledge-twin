"""구조 entity·관계 생성 — 물리 계층 · 운영 사건 · 지식.

정본: docs/product/data-ontology-spec.md §1~§5 · golden-scenario-spec.md §2·§5

🔴 설계 원칙 2가지
   ① GS-01 바인딩 ID는 «고정»으로 박고, 나머지는 규칙으로 채운다. 무대 인물이 난수에
      휩쓸리면 시나리오 회귀가 데이터 변경마다 깨진다.
   ② 설비 일련번호는 12대 전역에서 유일하다. Sensor(SN-{EQ_NUM}-{MEAS})·
      Component(CP-{EQ_NUM}-{CLASS}-{NN}) ID가 설비 번호를 품기 때문에, 라인마다
      번호를 재사용하면 PK가 충돌한다.
"""

from __future__ import annotations

import random
from datetime import timedelta

from .config import GS, REFERENCE_NOW, WINDOW_START

# --- 설비 배치 (라인 3 × 4대 = 12 · CNC 3대는 「유사 설비 비교」의 최소치) --------

EQUIPMENT_LAYOUT = [
    # (equipment_id, line_no, class, model, 설치 경과 개월, criticality, 센서 수)
    ("EQ-CNC-101", 1, "CNC", "MX-500", 74, "high", 3),
    ("EQ-CNV-102", 1, "CONVEYOR", "BLT-1200", 96, "medium", 3),
    ("EQ-ROB-103", 1, "ROBOT", "AR-6120", 58, "medium", 2),
    ("EQ-PRS-104", 1, "PRESS", "HP-250T", 110, "high", 2),
    ("EQ-CNC-204", 2, "CNC", "MX-500", 65, "high", 3),    # 🔴 GS-01 주인공 · 설치 2021-03(wireframes ②)
    ("EQ-CNV-205", 2, "CONVEYOR", "BLT-1200", 84, "medium", 3),
    ("EQ-ROB-206", 2, "ROBOT", "AR-6120", 41, "medium", 2),
    ("EQ-CNC-207", 2, "CNC", "MX-500", 47, "high", 3),   # 🔴 유사 설비 비교 대상
    ("EQ-CNV-308", 3, "CONVEYOR", "BLT-900", 66, "low", 3),
    ("EQ-ROB-309", 3, "ROBOT", "AR-4080", 35, "medium", 2),
    ("EQ-PRS-310", 3, "PRESS", "HP-160T", 128, "high", 2),
    ("EQ-PRS-311", 3, "PRESS", "HP-160T", 29, "medium", 2),
]

# 설비군별 부품 2종 (Component = 고장모드 귀속처)
COMPONENT_KINDS = {
    "CNC": [("BRG", "스핀들 베어링", "bearing"), ("TOOL", "공구 홀더", "tool_holder")],
    "CONVEYOR": [("BELT", "구동 벨트", "belt"), ("MOT", "구동 모터", "motor")],
    "ROBOT": [("SERV", "관절 서보", "servo"), ("GRP", "그리퍼", "gripper")],
    "PRESS": [("RAM", "슬라이드 램", "ram"), ("DIE", "금형 세트", "die")],
}

# 설비군별 센서 종류 (앞에서부터 센서 수만큼 사용)
SENSOR_KINDS = {
    "CNC": [("VIB", "mm/s", 4.5, 6.3, 51.2), ("TEMP", "degC", 55.0, 65.0, 1.0),
            ("CUR", "A", 18.0, 22.0, 10.0)],
    "CONVEYOR": [("SPD", "m/min", 28.0, 34.0, 1.0), ("CUR", "A", 14.0, 17.5, 10.0),
                 ("TEMP", "degC", 48.0, 58.0, 1.0)],
    "ROBOT": [("VIB", "mm/s", 3.8, 5.4, 51.2), ("CUR", "A", 9.5, 12.0, 10.0)],
    "PRESS": [("VIB", "mm/s", 5.2, 7.1, 51.2), ("TEMP", "degC", 62.0, 74.0, 1.0)],
}

# --- 고장모드 18종 (설비군 4종 × 4~5) -------------------------------------------
# (id, name, 귀속 부품 class 또는 None=설비 직결(R09), severity, 증상)
FAILURE_MODES = [
    ("FM-BRG-WEAR", "스핀들 베어링 마모", "CNC", "BRG", "high",
     ["진동 RMS 완만 상승", "베어링 온도 동반 상승", "가공면 조도 악화"]),
    ("FM-TOOL-IMB", "공구 불균형", "CNC", None, "medium",
     ["회전수 배수 주파수 진동", "가공 치수 산포 증가"]),
    ("FM-SPDL-OVERHEAT", "스핀들 과열", "CNC", "BRG", "high",
     ["스핀들 온도 급상승", "열변위 보정 초과"]),
    ("FM-COOLANT-LOSS", "절삭유 공급 저하", "CNC", "TOOL", "medium",
     ["절삭유 압력 저하", "공구 수명 단축"]),
    ("FM-AXIS-BACKLASH", "이송축 백래시 증가", "CNC", "TOOL", "medium",
     ["위치 결정 오차", "역방향 이송 시 단차"]),
    ("FM-BELT-SLIP", "구동 벨트 슬립", "CONVEYOR", "BELT", "medium",
     ["이송 속도 저하", "구동 전류 변동"]),
    ("FM-BELT-TEAR", "벨트 균열·찢김", "CONVEYOR", "BELT", "high",
     ["벨트 사행", "이물 낙하"]),
    ("FM-ROLLER-SEIZE", "롤러 고착", "CONVEYOR", "MOT", "medium",
     ["구동 전류 상승", "국부 발열"]),
    ("FM-MOTOR-OVERLOAD", "구동 모터 과부하", "CONVEYOR", "MOT", "high",
     ["정격 초과 전류", "모터 권선 온도 상승"]),
    ("FM-SERVO-DRIFT", "서보 위치 드리프트", "ROBOT", "SERV", "medium",
     ["반복 정밀도 저하", "원점 복귀 편차"]),
    ("FM-GRIPPER-WEAR", "그리퍼 패드 마모", "ROBOT", "GRP", "low",
     ["파지 실패율 증가", "미끄러짐"]),
    ("FM-CABLE-FATIGUE", "케이블 베어 피로", "ROBOT", "SERV", "medium",
     ["간헐 통신 오류", "축 순간 정지"]),
    ("FM-ENCODER-FAULT", "엔코더 이상", "ROBOT", "GRP", "high",
     ["위치 신호 결측", "축 알람 발생"]),
    ("FM-RAM-MISALIGN", "슬라이드 램 정렬 이탈", "PRESS", "RAM", "high",
     ["편심 하중", "금형 편마모"]),
    ("FM-DIE-CRACK", "금형 균열", "PRESS", "DIE", "high",
     ["성형품 버 발생", "타격음 변화"]),
    ("FM-HYD-LEAK", "유압 누유", "PRESS", "RAM", "medium",
     ["유압 저하", "슬라이드 하강 지연"]),
    ("FM-SEAL-DEGRADE", "실링 경화", "PRESS", "DIE", "low",
     ["미세 누유", "압력 유지 실패"]),
    ("FM-OVERTRAVEL", "행정 초과", "PRESS", "RAM", "medium",
     ["리미트 스위치 작동", "비상 정지"]),
]

# --- SOP 20건 (문서 번호와 1:1) -------------------------------------------------
# (sop_id, 문서번호, title, domain, 대응 고장모드 목록)
SOPS = [
    ("SOP-BELT-CHK-001", 1, "컨베이어 벨트 장력 점검", "conveyor", ["FM-BELT-SLIP"]),
    ("SOP-BELT-RPL-002", 2, "컨베이어 벨트 교체", "conveyor", ["FM-BELT-TEAR"]),
    ("SOP-ROLL-LUB-003", 3, "롤러 급유·고착 해소", "conveyor", ["FM-ROLLER-SEIZE"]),
    ("SOP-MOT-LOAD-004", 4, "구동 모터 부하 진단", "conveyor", ["FM-MOTOR-OVERLOAD"]),
    ("SOP-SERV-CAL-005", 5, "서보 원점·정밀도 교정", "robot", ["FM-SERVO-DRIFT"]),
    ("SOP-GRIP-RPL-006", 6, "그리퍼 패드 교체", "robot", ["FM-GRIPPER-WEAR"]),
    ("SOP-CABL-INSP-007", 7, "케이블 베어 점검", "robot", ["FM-CABLE-FATIGUE"]),
    ("SOP-ENC-DIAG-008", 8, "엔코더 신호 진단", "robot", ["FM-ENCODER-FAULT"]),
    ("SOP-RAM-ALIGN-009", 9, "슬라이드 램 정렬", "press", ["FM-RAM-MISALIGN"]),
    ("SOP-DIE-INSP-010", 10, "금형 균열 점검", "press", ["FM-DIE-CRACK"]),
    ("SOP-HYD-LEAK-011", 11, "유압 누유 조치", "press", ["FM-HYD-LEAK"]),
    ("SOP-SEAL-RPL-012", 12, "실링 교체", "press", ["FM-SEAL-DEGRADE"]),
    ("SOP-OVTR-RST-013", 13, "행정 초과 복구", "press", ["FM-OVERTRAVEL"]),
    # 🔴 GS-01 대응 절차 — DOC-SOP-0014@r2가 current revision
    ("SOP-BRG-INSP-014", 14, "스핀들 베어링 점검·교체", "cnc", ["FM-BRG-WEAR"]),
    ("SOP-SPDL-COOL-015", 15, "스핀들 냉각계 점검", "cnc", ["FM-SPDL-OVERHEAT"]),
    ("SOP-COOL-SUP-016", 16, "절삭유 공급 계통 점검", "cnc", ["FM-COOLANT-LOSS"]),
    ("SOP-AXIS-COMP-017", 17, "이송축 백래시 보정", "cnc", ["FM-AXIS-BACKLASH"]),
    ("SOP-GEN-CLEAN-018", 18, "설비 정기 청소", "general", []),
    ("SOP-GEN-PMCHK-019", 19, "월간 예방 점검", "general", []),
    ("SOP-GEN-HAND-020", 20, "교대 인수인계", "general", []),
]

# 🔴 D-5(eval §5) — FM-TOOL-IMB에는 대응 SOP를 «두지 않는다».
#    Q-MULTIHOP-003(부정형)은 「SOP가 매핑되지 않은 고장모드」를 정확히 지목하게 하는 문항이다.
#    17/18에 SOP를 붙이고 이 1건만 비워야 문항이 성립한다. 친절하게 다 채우면 문항이 죽는다.
UNMAPPED_FAILURE_MODE = GS["failure_mode_unmapped"]

# --- 안전 규정 8건 ---------------------------------------------------------------
# (id, title, rule_class, mandatory, 문서번호)
SAFETY_RULES = [
    ("SAF-LOTO-01", "정비 전 전원 차단·잠금·표지(LOTO)", "lockout", True, 29),
    # 🔴 D-6(eval §5) — Q-SAFETY-001이 요구하는 PPE 규정. ID를 여기서 확정한다.
    ("SAF-PPE-01", "정비 작업 개인보호구 착용", "ppe", True, 30),
    ("SAF-HOT-02", "고온부 접촉 방지", "thermal", True, 31),
    ("SAF-CONF-03", "밀폐공간 출입 절차", "confined", True, 32),
    ("SAF-ELEC-04", "활선 근접 작업 금지", "electrical", True, 33),
    ("SAF-CHEM-05", "절삭유·윤활유 취급", "chemical", True, 34),
    ("SAF-HGT-06", "고소 작업 추락 방지", "height", True, 35),
    ("SAF-LIFT-07", "중량물 인양 보조구 사용", "lifting", False, 36),
]

# SOP → 필수 안전 규정 (R12). 🔴 GS SOP는 LOTO·PPE 둘 다 — Q-SAFETY-001의 「전량 Recall」 대상.
SOP_SAFETY = {
    "SOP-BRG-INSP-014": ["SAF-LOTO-01", "SAF-PPE-01"],
    "SOP-BELT-RPL-002": ["SAF-LOTO-01", "SAF-PPE-01"],
    "SOP-ROLL-LUB-003": ["SAF-LOTO-01", "SAF-CHEM-05"],
    "SOP-MOT-LOAD-004": ["SAF-ELEC-04", "SAF-PPE-01"],
    "SOP-SERV-CAL-005": ["SAF-LOTO-01"],
    "SOP-GRIP-RPL-006": ["SAF-LOTO-01", "SAF-PPE-01"],
    "SOP-CABL-INSP-007": ["SAF-ELEC-04"],
    "SOP-ENC-DIAG-008": ["SAF-ELEC-04"],
    "SOP-RAM-ALIGN-009": ["SAF-LOTO-01", "SAF-LIFT-07"],
    "SOP-DIE-INSP-010": ["SAF-LOTO-01", "SAF-LIFT-07", "SAF-PPE-01"],
    "SOP-HYD-LEAK-011": ["SAF-CHEM-05", "SAF-PPE-01"],
    "SOP-SEAL-RPL-012": ["SAF-CHEM-05"],
    "SOP-SPDL-COOL-015": ["SAF-HOT-02", "SAF-PPE-01"],
    "SOP-COOL-SUP-016": ["SAF-CHEM-05"],
    "SOP-AXIS-COMP-017": ["SAF-LOTO-01"],
    "SOP-GEN-CLEAN-018": ["SAF-PPE-01"],
    "SOP-GEN-PMCHK-019": ["SAF-LOTO-01", "SAF-PPE-01"],
    "SOP-BELT-CHK-001": ["SAF-LOTO-01"],
    "SOP-OVTR-RST-013": ["SAF-LOTO-01", "SAF-HGT-06"],
}


def _iso(dt):
    return dt.isoformat()


def build_structure(rng: random.Random) -> dict[str, list[dict]]:
    """물리 계층 + 지식 entity + 관계 테이블을 만든다(문서·시계열·사건은 별 모듈)."""
    t = {name: [] for name in (
        "factory", "production_line", "equipment", "component", "sensor",
        "failure_mode", "sop", "safety_rule",
        "component_failure_mode", "equipment_failure_mode", "failure_mode_indicator",
        "failure_mode_sop", "sop_safety_rule", "equipment_document",
    )}

    # --- 1. 공장·라인 ---------------------------------------------------------
    t["factory"].append({
        "id": GS["factory"], "name": "Factory A (synthetic)", "site_code": "A",
        "timezone": "Asia/Seoul", "status": "active",
        "semantic_id": f"urn:fkt:Factory:{GS['factory']}",
    })
    for no in (1, 2, 3):
        line_id = f"LN-A-{no:02d}"
        t["production_line"].append({
            "id": line_id, "factory_id": GS["factory"],
            "name": f"가공 라인 {no}", "line_no": no, "status": "active",
            "semantic_id": f"urn:fkt:ProductionLine:{line_id}",
        })

    # --- 2. 설비·부품·센서 ----------------------------------------------------
    for eq_id, line_no, klass, model, age_months, crit, n_sensor in EQUIPMENT_LAYOUT:
        eq_num = eq_id.split("-")[2]
        installed = (REFERENCE_NOW - timedelta(days=int(age_months * 30.44))).date()
        # GS 주인공만 warning — Overview에서 「이상 집중」이 눈에 보여야 한다(GS §2)
        status = "warning" if eq_id == GS["equipment"] else "normal"
        t["equipment"].append({
            "id": eq_id, "line_id": f"LN-A-{line_no:02d}",
            "name": f"{klass} {eq_num}호기", "equipment_class": klass, "model": model,
            "installed_on": installed.isoformat(), "status": status, "criticality": crit,
            "semantic_id": f"urn:fkt:Equipment:{eq_id}",
        })

        for cls3, cname, _slug in COMPONENT_KINDS[klass]:
            cp_id = f"CP-{eq_num}-{cls3}-01"
            t["component"].append({
                "id": cp_id, "equipment_id": eq_id, "name": cname,
                "component_class": cls3,
                # 부품은 설비보다 늦게(또는 같이) 들어간다 — 교체 이력이 있는 부품은 더 최근
                "installed_on": (installed + timedelta(days=rng.randint(0, 400))).isoformat(),
                "semantic_id": f"urn:fkt:Component:{cp_id}",
            })

        for meas, unit, warn, alarm, hz in SENSOR_KINDS[klass][:n_sensor]:
            sn_id = f"SN-{eq_num}-{meas}"
            t["sensor"].append({
                "id": sn_id, "equipment_id": eq_id, "measurement_type": meas,
                "unit": unit, "sampling_hz": hz,
                "warn_threshold": warn, "alarm_threshold": alarm,
                "semantic_id": f"urn:fkt:Sensor:{sn_id}",
            })

    # --- 3. 고장모드 ----------------------------------------------------------
    for fm_id, name, eq_class, cp_class, sev, symptoms in FAILURE_MODES:
        t["failure_mode"].append({
            "id": fm_id, "name": name,
            "description": f"{name} — {' / '.join(symptoms)}. {eq_class} 설비군에서 관측되는 고장모드.",
            "typical_symptoms": _json_list(symptoms), "severity_class": sev,
            "semantic_id": f"urn:fkt:FailureMode:{fm_id}",
        })

        for eq_id, _ln, klass, *_ in EQUIPMENT_LAYOUT:
            if klass != eq_class:
                continue
            eq_num = eq_id.split("-")[2]
            if cp_class is None:
                # R09 설비 직결 — 부품이 특정되지 않는 모드.
                # 🔴 Q-MULTIHOP-003의 함정이 여기서 생긴다: 부품(R08)만 훑으면 이 모드가 보이지 않는다.
                t["equipment_failure_mode"].append(
                    {"equipment_id": eq_id, "failure_mode_id": fm_id})
            else:
                t["component_failure_mode"].append(
                    {"component_id": f"CP-{eq_num}-{cp_class}-01", "failure_mode_id": fm_id})

    # R10 고장모드 ↔ 지표 센서
    indicators = [
        (GS["failure_mode"], "VIB", "저주파 RMS가 수 주에 걸쳐 완만히 상승한 뒤 24시간 내 급등"),
        ("FM-TOOL-IMB", "VIB", "주축 회전수의 정수배 주파수 성분 증가"),
        ("FM-SPDL-OVERHEAT", "TEMP", "정상 대비 +10degC 이상 지속"),
        ("FM-MOTOR-OVERLOAD", "CUR", "정격 전류 초과 구간 반복"),
        ("FM-ROLLER-SEIZE", "CUR", "기동 전류 첨두 증가"),
        ("FM-BELT-SLIP", "SPD", "지령 대비 실속도 하락"),
        ("FM-SERVO-DRIFT", "VIB", "반복 동작 구간 진동 패턴 변화"),
        ("FM-RAM-MISALIGN", "VIB", "타격 시 편심 진동 성분"),
    ]
    sensors_by_meas = {}
    for s in t["sensor"]:
        sensors_by_meas.setdefault(s["measurement_type"], []).append(s["id"])
    for fm_id, meas, pattern in indicators:
        for sn_id in sensors_by_meas.get(meas, []):
            eq_num = sn_id.split("-")[1]
            # 해당 고장모드를 실제로 갖는 설비의 센서에만 지표를 건다
            owns = any(
                r["equipment_id"].endswith(f"-{eq_num}") and r["failure_mode_id"] == fm_id
                for r in t["equipment_failure_mode"]
            ) or any(
                r["component_id"].startswith(f"CP-{eq_num}-") and r["failure_mode_id"] == fm_id
                for r in t["component_failure_mode"]
            )
            if owns:
                t["failure_mode_indicator"].append({
                    "failure_mode_id": fm_id, "sensor_id": sn_id, "signal_pattern": pattern})

    # --- 4. SOP·안전 규정 ------------------------------------------------------
    for sop_id, doc_no, title, domain, fms in SOPS:
        t["sop"].append({
            "id": sop_id, "title": title, "domain": domain,
            # current revision = 해당 문서의 최신 approved revision. documents.py가 결정한 값을 쓴다.
            "current_revision_id": None,   # generate.py가 문서 생성 후 채운다
            "status": "active", "semantic_id": f"urn:fkt:SOP:{sop_id}",
            "_doc_no": doc_no,
        })
        for fm_id in fms:
            if fm_id == UNMAPPED_FAILURE_MODE:
                continue          # 🔴 D-5 — 도달하지 않는 방어선(SOPS 표에도 이미 없다)
            t["failure_mode_sop"].append({"failure_mode_id": fm_id, "sop_id": sop_id})

    for saf_id, title, rule_class, mandatory, doc_no in SAFETY_RULES:
        t["safety_rule"].append({
            "id": saf_id, "title": title, "rule_class": rule_class,
            "mandatory": "true" if mandatory else "false",
            "current_revision_id": None,
            "semantic_id": f"urn:fkt:SafetyRule:{saf_id}",
            "_doc_no": doc_no,
        })

    for sop_id, safs in SOP_SAFETY.items():
        for saf_id in safs:
            t["sop_safety_rule"].append({"sop_id": sop_id, "safety_rule_id": saf_id})

    return t


def _json_list(values: list[str]) -> str:
    import json
    return json.dumps(values, ensure_ascii=False)


__all__ = [
    "EQUIPMENT_LAYOUT", "FAILURE_MODES", "SOPS", "SAFETY_RULES",
    "UNMAPPED_FAILURE_MODE", "build_structure",
]
