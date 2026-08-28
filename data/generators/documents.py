"""문서·revision 생성 — SSOT 계층.

정본: data-ontology-spec.md §1.4·§3.3 · eval-questions-draft.md §5(D-2·D-3)

🔴 이 모듈이 「의도적 불완전성」의 절반을 진다(나머지 절반 = structure.py의 D-5).

   D-2 — DOC-SOP-0014의 @r1과 @r2는 «값이 실제로 다르다».
        Q-DIRECT-003은 「지금 인용 가능한 revision은 무엇이고, 이전 revision과 무엇이 다른가」를
        묻는다. 두 revision을 만들어 두기만 하고 내용을 같게 두면, 「차이 항목」에 쓸 정답이
        없어져 문항이 조용히 무력화된다. 그래서 필요 공구·작업 시간·안전 요구를 «실제로»
        어긋나게 만든다. 데이터가 너무 완전하면 평가가 죽는다 — 이건 버그가 아니라 요구다.

   D-3 — SOP 본문에 절 구조를 둔다(§필요 공구 및 자재 · §예상 작업 시간).
        Q-DIRECT-002가 이 두 절의 값을 정확히 답하게 하는 문항이라, 본문이 줄글이면 채점 기준이
        생기지 않는다.

🔴 Q-UNANS-001 보호: 어떤 문서 본문에도 «원가·단가·비용·금액»을 쓰지 않는다.
   「비용은 얼마인가」에 «근거 없음»이 정답이려면 데이터 어디에도 비용이 없어야 한다.
"""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

from .config import GS, REFERENCE_NOW
from .structure import SAFETY_RULES, SOPS

# 다중 revision 문서 8건 (data-ontology-spec §5: 「revision 2개 이상인 문서 8건」).
# 🔴 DOC-SOP-0014만 2개(r1·r2), 나머지 7건은 3개(r1·r2·r3) → 추가 15개 → 총 60 revision.
MULTI_REVISION = {
    "DOC-SOP-0014": 2,
    "DOC-SOP-0003": 3,
    "DOC-SOP-0009": 3,
    "DOC-MAN-0021": 3,
    "DOC-MAN-0024": 3,
    "DOC-SAF-0029": 3,
    "DOC-SAF-0030": 3,
    "DOC-MRP-0083": 3,
}

MANUALS = [
    (21, "HMX-520", "CNC 밀링 HMX-520 설비 매뉴얼"),      # 🔴 EQ-CNC-204 매뉴얼 (GS S4 인용 대상)
    (22, "BLT-1200", "컨베이어 BLT-1200 설비 매뉴얼"),
    (23, "AR-6120", "산업용 로봇 AR-6120 설비 매뉴얼"),
    (24, "HP-250T", "프레스 HP-250T 설비 매뉴얼"),
    (25, "BLT-900", "컨베이어 BLT-900 설비 매뉴얼"),
    (26, "AR-4080", "산업용 로봇 AR-4080 설비 매뉴얼"),
    (27, "HP-160T", "프레스 HP-160T 설비 매뉴얼"),
    (28, None, "공통 안전 운전 매뉴얼"),
]

# 정비 보고서 9건 ↔ MaintenanceRecord 번호 (MR-2025-00NN ↔ DOC-MRP-00NN)
MAINT_REPORT_NOS = [81, 82, 83, 84, 85, 86, 87, 88, 89]

# --- DOC-SOP-0014 두 revision의 «실제로 다른» 값 (D-2) --------------------------

BRG_R1 = {
    "tools": [
        "베어링 풀러 세트",
        "다이얼 게이지 (0.01 mm)",
        "육각 렌치 세트 (4~14 mm)",
        "베어링 그리스 EP-2 (200 g)",
    ],
    "minutes": 90,
    "safety": ["SAF-LOTO-01"],
    "note": "초판 — 상온 운전 조건 기준.",
}

BRG_R2 = {
    "tools": [
        "베어링 풀러 세트",
        "다이얼 게이지 (0.01 mm)",
        "육각 렌치 세트 (4~14 mm)",
        "고온용 베어링 그리스 EP-2H (250 g)",          # 🔴 r1과 규격·용량이 다르다
        "교정 토크렌치 (20~100 N·m · 교정 유효기간 내)",  # 🔴 r1에 없던 항목
    ],
    "minutes": 120,                                    # 🔴 r1 = 90분
    "safety": ["SAF-LOTO-01", "SAF-PPE-01"],           # 🔴 r1은 LOTO만
    "note": "개정 — 고속 가공 조건에서 그리스 열화가 확인되어 고온용으로 교체하고, "
            "체결 토크 관리를 의무화했다. 토크렌치 교정 확인 단계가 추가되어 작업 시간이 늘었다.",
}


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sop_body(title: str, domain: str, spec: dict, rev_no: int) -> str:
    """SOP 본문 — D-3이 요구한 절 구조. 절 제목은 revision이 달라도 고정(비교 가능해야 한다)."""
    tools = "\n".join(f"- {x}" for x in spec["tools"])
    safety = "\n".join(f"- {x}" for x in spec["safety"])
    return f"""# {title} (r{rev_no})

## 1. 목적
{title} 작업의 표준 절차를 정하여 작업 품질과 안전을 확보한다.

## 2. 적용 범위
{domain} 설비군의 정기·비정기 정비 작업에 적용한다.

## 3. 안전 요구사항
{safety}
작업 개시 전 위 규정의 준수 여부를 확인자가 서명으로 확인한다.

## 4. 필요 공구 및 자재
{tools}

## 5. 예상 작업 시간
{spec['minutes']}분 (설비 정지 시간 포함)

## 6. 절차 단계
1. 설비 정지 및 안전 조치 적용
2. 커버 분리 및 대상부 육안 점검
3. 계측 (진동·유격·온도)
4. 판정 기준 대조 후 조치 결정
5. 조치 수행 및 원상 복구
6. 시운전 및 계측 재확인

## 7. 완료 확인
계측값이 판정 기준 이내이고 안전 조치가 해제되었음을 확인자가 기록한다.

## 8. 개정 사유
{spec['note']}
"""


def _generic_sop_body(title: str, domain: str, rev_no: int, seq: int) -> str:
    spec = {
        "tools": ["표준 공구 세트", "점검 기록지", f"{domain} 전용 계측기"],
        "minutes": 30 + (seq % 5) * 15,
        "safety": ["SAF-LOTO-01"],
        "note": "정기 검토 개정." if rev_no > 1 else "초판.",
    }
    return _sop_body(title, domain, spec, rev_no)


def _manual_body(model: str | None, title: str, rev_no: int) -> str:
    vib = ""
    if model == "HMX-520":
        # 🔴 GS-01 S4의 vector hit 대상 문장 — 「진동 진단」 절이 인용 강조 대상이다.
        vib = """
## 4. 진동 진단
스핀들 진동 RMS는 정상 운전 시 2.0~2.6 mm/s 범위를 유지한다.
- 수 주에 걸쳐 완만히 상승하는 추세가 관측되면 **스핀들 베어링 마모**를 우선 의심한다.
  베어링 마모는 초기에는 저주파 성분이 서서히 커지고, 진행되면 24시간 내에 급격히 상승한다.
- 회전수의 정수배 주파수 성분이 두드러지면 공구 불균형을 의심한다.
- 진동 상승에 베어링부 온도 상승이 동반되면 마모가 진행 단계에 있다고 판단한다.
경보 임계를 초과한 경우 즉시 운전을 중지하고 베어링 점검 절차를 적용한다.
"""
    else:
        vib = """
## 4. 진동 진단
정상 범위를 벗어난 진동이 관측되면 구동부 체결 상태와 정렬을 우선 확인한다.
"""
    return f"""# {title} (r{rev_no})

## 1. 개요
본 매뉴얼은 {model or '전 설비'} 의 운전·점검 기준을 기술한다.

## 2. 사양
정격 운전 조건과 허용 범위는 설비 명판 및 설비 마스터 등록값을 따른다.

## 3. 일상 점검
시업 전 육안 점검, 이상음·이상 진동 확인, 윤활 상태 확인을 수행한다.
{vib}
## 5. 경보 및 알람
경보 임계는 설비 마스터의 센서 등록값을 정본으로 하며, 본 매뉴얼에 수치를 중복 기재하지 않는다.

## 6. 부품 교체 주기
소모 부품의 교체 주기는 운전 시간과 계측 추세에 따라 조정한다.
"""


def _safety_body(saf_id: str, title: str, rev_no: int) -> str:
    if saf_id == "SAF-LOTO-01":
        detail = """
## 3. 절차
1. 작업 대상 설비의 에너지원(전기·유압·공압)을 모두 식별한다.
2. 주 차단기를 차단하고 개인 잠금장치를 체결한다.
3. 잔류 에너지를 방출하고 무전압·무압을 계측으로 확인한다.
4. 「정비 중 · 조작 금지」 표지를 부착한다.
5. 작업 완료 후 작업자 본인이 잠금장치를 해제한다.

## 4. 금지 사항
타인의 잠금장치를 임의 해제하지 않는다. 확인 계측 없이 무전압으로 간주하지 않는다.
"""
    elif saf_id == "SAF-PPE-01":
        detail = """
## 3. 착용 품목
- 보안경 (측면 차폐형)
- 절단 방지 장갑 (회전체 근접 작업 시에는 착용 금지 · 협착 위험)
- 안전화
- 청력 보호구 (85 dB 이상 구역)
- 방유 앞치마 (윤활유·절삭유 취급 시)

## 4. 확인
작업 개시 전 확인자가 착용 상태를 점검하고 기록한다.
"""
    else:
        detail = """
## 3. 절차
해당 작업 유형의 위험 요인을 식별하고 정해진 보호 조치를 적용한 뒤 작업을 개시한다.
"""
    return f"""# {title} (r{rev_no})

## 1. 목적
{title}에 관한 필수 준수 사항을 정한다.

## 2. 적용 범위
전 사업장의 정비·점검 작업에 적용한다. 본 규정은 의무 규정이다.
{detail}"""


def _maint_report_body(no: int, rev_no: int) -> str:
    if no == 87:
        # 🔴 GS-01 S4 「유사 사례 검색」의 정답 문서. MR-2025-0087과 같은 사건을 서술한다.
        return f"""# 정비 보고서 MR-2025-0087 (r{rev_no})

## 1. 대상
설비 {GS['equipment']} · 부품 {GS['component']} (스핀들 베어링)

## 2. 증상
가공면 조도 악화 신고 후 진동 계측 결과, 스핀들 진동 RMS가 약 3주에 걸쳐
2.2 mm/s에서 4.8 mm/s로 상승하는 추세가 확인되었다. 베어링부 온도도 동반 상승했다.

## 3. 원인
스핀들 베어링 마모(FM-BRG-WEAR). 분해 점검에서 내륜 궤도면의 피팅이 확인되었다.

## 4. 조치
베어링 점검·교체 절차에 따라 베어링을 교체하고 그리스를 재충전했다.
교체 후 진동 RMS는 2.1 mm/s로 회복되었다.

## 5. 후속
동일 모델 설비의 진동 추세를 월 단위로 확인하도록 점검 주기를 조정했다.
"""
    return f"""# 정비 보고서 MR-2025-00{no} (r{rev_no})

## 1. 대상
정기 점검 대상 설비.

## 2. 증상
점검 주기 도래에 따른 예방 정비. 이상 징후는 확인되지 않았다.

## 3. 조치
소모품 교체 및 윤활 보충 후 시운전으로 정상 동작을 확인했다.
"""


def build_documents() -> tuple[list[dict], list[dict], dict[str, str]]:
    """(document, document_revision, {문서ID: 인용 가능 revision ID}) 를 만든다."""
    documents: list[dict] = []
    revisions: list[dict] = []

    def add_doc(doc_id, doc_type, title, owner_role, body_fn):
        n_rev = MULTI_REVISION.get(doc_id, 1)
        documents.append({
            "id": doc_id, "doc_type": doc_type, "title": title, "owner_role": owner_role,
            "current_revision_no": n_rev, "status": "active",
            "semantic_id": f"urn:fkt:Document:{doc_id}",
        })
        # revision 유효 기간: 과거로 거슬러 올라가며 이어 붙인다. 마지막이 현재 유효본.
        # 🔴 인용 가능 조건(§3.3) = approved AND effective_from <= REFERENCE_NOW < effective_to
        span_days = 480
        end: date | None = None
        for rev_no in range(n_rev, 0, -1):
            start = (REFERENCE_NOW.date() - timedelta(days=span_days * (n_rev - rev_no) + 56))
            body = body_fn(rev_no)
            rev_id = f"{doc_id}@r{rev_no}"
            revisions.append({
                "id": rev_id, "document_id": doc_id, "revision_no": rev_no,
                "content_sha256": _sha256(body),
                "body_uri": f"fkt://doc/{rev_id}.md",
                "body": body,
                "effective_from": start.isoformat(),
                "effective_to": end.isoformat() if end else None,
                "approval_state": "approved" if rev_no == n_rev else "superseded",
                "approved_by": "maintenance_manager",
                "_current": rev_no == n_rev,
            })
            end = start

    # SOP 20건
    for sop_id, doc_no, title, domain, _fms in SOPS:
        doc_id = f"DOC-SOP-{doc_no:04d}"
        if doc_id == GS["sop_document"]:
            def body_fn(rev_no, _t=title, _d=domain):
                # 🔴 D-2 — r1과 r2가 실제로 다른 값을 갖는다.
                return _sop_body(_t, _d, BRG_R1 if rev_no == 1 else BRG_R2, rev_no)
        else:
            def body_fn(rev_no, _t=title, _d=domain, _s=doc_no):
                return _generic_sop_body(_t, _d, rev_no, _s)
        add_doc(doc_id, "SOP", title, "maintenance_engineer", body_fn)

    # 매뉴얼 8건
    for doc_no, model, title in MANUALS:
        doc_id = f"DOC-MAN-{doc_no:04d}"
        add_doc(doc_id, "MANUAL", title, "equipment_engineer",
                lambda rev_no, _m=model, _t=title: _manual_body(_m, _t, rev_no))

    # 안전 규정 문서 8건
    for saf_id, title, _cls, _mand, doc_no in SAFETY_RULES:
        doc_id = f"DOC-SAF-{doc_no:04d}"
        add_doc(doc_id, "SAFETY", title, "safety_manager",
                lambda rev_no, _s=saf_id, _t=title: _safety_body(_s, _t, rev_no))

    # 정비 보고서 9건
    for no in MAINT_REPORT_NOS:
        doc_id = f"DOC-MRP-{no:04d}"
        add_doc(doc_id, "MAINT_REPORT", f"정비 보고서 MR-2025-00{no}", "maintenance_engineer",
                lambda rev_no, _n=no: _maint_report_body(_n, rev_no))

    current = {r["document_id"]: r["id"] for r in revisions if r["_current"]}
    for r in revisions:
        r.pop("_current")
    return documents, revisions, current


__all__ = ["build_documents", "MULTI_REVISION", "MANUALS", "MAINT_REPORT_NOS",
           "BRG_R1", "BRG_R2"]
