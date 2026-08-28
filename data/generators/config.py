"""T1-2 synthetic seed 생성기 — 공통 상수.

🔴 멱등의 두 축이 여기에 있다.
   ① RANDOM_SEED 고정 — 모든 난수는 이 seed에서 파생된 Random 인스턴스만 쓴다.
   ② REFERENCE_NOW 고정 — `datetime.now()`를 절대 부르지 않는다. 시각을 실행 시점에서
      가져오면 재실행마다 데이터가 달라져 「생성 2회 diff 0」이 원천적으로 불가능하다.
      기준 시각은 GS-01 알람 ID(AL-20260826-0041)의 날짜와 정합하도록 2026-08-26으로 못박는다.

데이터 정본: docs/product/data-ontology-spec.md §5(최소 인스턴스) ·
            docs/product/golden-scenario-spec.md §2·§5(무대·바인딩 표) ·
            benchmarks/datasets/eval-questions-draft.md §5(D-1~10 데이터 요구)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

# --- 시간 기준 -----------------------------------------------------------------

KST = timezone(timedelta(hours=9))

# 🔴 고정 기준 시각 = GS-01 알람 발생 시각. 전 entity의 날짜는 이 값의 상대 계산이다.
REFERENCE_NOW = datetime(2026, 8, 26, 14, 30, 0, tzinfo=KST)

WINDOW_DAYS = 21          # 기저 시계열 창 — GS §2 「3주 완만 상승」
SURGE_HOURS = 24          # 급등 구간 — GS §2 「최근 24h 급등」
EVENT_HOURS = 4           # 1초 해상도 사건 구간 (T0-6 §5 ⓑ)
BASE_INTERVAL_SEC = 60    # 기저 해상도 1분 (T0-6 §5 ⓐ)
EVENT_INTERVAL_SEC = 1    # 사건 해상도 1초

WINDOW_START = REFERENCE_NOW - timedelta(days=WINDOW_DAYS)
EVENT_START = REFERENCE_NOW - timedelta(hours=EVENT_HOURS)
SURGE_START = REFERENCE_NOW - timedelta(hours=SURGE_HOURS)

# --- 난수 -----------------------------------------------------------------------

RANDOM_SEED = 20260826

# --- 경로 -----------------------------------------------------------------------

GENERATORS_DIR = Path(__file__).resolve().parent
DATA_DIR = GENERATORS_DIR.parent
OUT_DIR = DATA_DIR / "generated"          # .gitignore 대상 — 생성기가 정본, CSV는 산출물
MANIFEST_NAME = "manifest.sha256"

# --- GS-01 바인딩 ID (golden-scenario-spec.md §5 — 변경 시 그 표가 선행 개정) ------

GS = {
    "factory": "FAC-A",
    "line": "LN-A-02",
    "equipment": "EQ-CNC-204",
    "peer_equipment": "EQ-CNC-207",
    "component": "CP-204-BRG-01",
    "sensor_vib": "SN-204-VIB",
    "sensor_temp": "SN-204-TEMP",
    "sensor_cur": "SN-204-CUR",
    "alarm": "AL-20260826-0041",
    "incident": "INC-2026-014",
    "work_order": "WO-2026-0113",
    "maintenance_record": "MR-2025-0087",
    "failure_mode": "FM-BRG-WEAR",
    "failure_mode_unmapped": "FM-TOOL-IMB",
    "sop": "SOP-BRG-INSP-014",
    "sop_document": "DOC-SOP-0014",
    "manual_document": "DOC-MAN-0021",
    "maint_report_document": "DOC-MRP-0087",
    "safety_loto": "SAF-LOTO-01",
    "safety_ppe": "SAF-PPE-01",
}

# 🔴 Q-UNANS-002 — 이 ID는 «절대 생성하지 않는다». 미등록 상태 자체가 정답 근거다.
FORBIDDEN_IDS = frozenset({"EQ-CNC-999"})

# --- 화면이 «그 문구 그대로» 띄우는 문장 (T1-3 AC) ---------------------------------
# 정본 = docs/product/wireframes.md v0.3. 화면이 문서 원문의 특정 문장을 인용 강조로 그리므로,
# 그 문장이 본문에 없으면 화면은 존재하지 않는 근거를 가리키게 된다.
# 🔴 생성 단계 자기 점검이 매 실행 이 목록을 대조한다 — 문서를 손보다 문장을 잃으면 즉시 FAIL.
EXPECTED_QUOTES = [
    # (revision_id, 본문에 실재해야 하는 문구, 그 문구를 띄우는 화면)
    ("DOC-SOP-0014@r2",
     "진동 RMS가 기준치의 150%를 3일 이상 초과하면 베어링 마모를 우선 의심한다.",
     "③ 문서 원문 탭 — 인용 강조"),
    ("DOC-SOP-0014@r2", "### 3.2 진단 기준", "③·⑤ 「진단 기준…」 · ④ 「절차 3.2·3.3 인용」"),
    ("DOC-SOP-0014@r2", "### 3.3 필요 부품", "④ 근거 패널 「절차 3.2·3.3 인용」"),
    ("DOC-MAN-0021@r1", "베어링 마모는 초기에 RMS가", "② evidence 카드 「베어링 마모는 초기에 RMS…」"),
    ("DOC-MAN-0021@r1", "진동 RMS가", "⑤ Vector-only 1위 「진동 RMS가…」"),
    ("DOC-MRP-0087@r1", "베어링 교체", "② evidence 카드 「베어링 교체…」"),
    ("DOC-MRP-0087@r1", "2025-02-11", "② evidence 카드 작업일"),
    ("DOC-SAF-0029@r3", "전원 차단 후 잠금·표시(LOTO) 시행", "④ 안전 조치(삭제 불가)"),
    ("DOC-SAF-0030@r3", "보호장갑·보안경", "④ 안전 조치 「PPE: 보호장갑·보안경」"),
]

# --- 목표 규모 (data-ontology-spec.md §5 · E4 가설 → 본 생성기 실행이 E1 실측) -----

TARGET_COUNTS = {
    "factory": 1,
    "production_line": 3,
    "equipment": 12,
    "component": 24,
    "sensor": 30,
    "alarm": 25,
    "incident": 8,
    "work_order": 15,
    "maintenance_record": 40,
    "failure_mode": 18,
    "sop": 20,
    "safety_rule": 8,
    "document": 45,
    "document_revision": 60,
}

# 적재 순서 = FK 의존 순서. TRUNCATE는 역순으로 돈다.
LOAD_ORDER = [
    "factory",
    "production_line",
    "equipment",
    "component",
    "sensor",
    "document",
    "document_revision",
    "failure_mode",
    "sop",
    "safety_rule",
    "incident",
    "alarm",
    "work_order",
    "maintenance_record",
    "sensor_reading",
    "component_failure_mode",
    "equipment_failure_mode",
    "failure_mode_indicator",
    "failure_mode_sop",
    "sop_safety_rule",
    "incident_diagnosis",
    "work_order_sop",
    "maintenance_record_failure_mode",
    "equipment_document",
]
