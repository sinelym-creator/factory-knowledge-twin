"""투영 manifest — 「무엇을 그래프로 올리는가」의 코드 정본 (T1-5 게이트 ①).

    services\\projector\\.venv\\Scripts\\python.exe services\\projector\\manifest.py --table
    ...                                            manifest.py --check-spec   # 스펙 표와 1:1 대조

🔴 유일 원천 = docs/product/data-ontology-spec.md(동결 v0.1) §2.1 관계표 · §4 저장 분담표.
   이 파일은 그 두 표를 «코드로» 옮긴 것이고, `--check-spec`이 옮긴 값과 스펙 원문을 매번
   다시 대조한다. 사람이 눈으로 맞추는 대조표는 시간이 지나면 «표가 낡았는지»조차 알 수 없다.

🔴 무엇을 저장하고 무엇을 조회 시점에 파생시키는가 (003 원장 주석의 같은 질문 · README §1):
   ① 저장 = PG의 «사실» 중 §4가 지정한 속성뿐. 관계는 §2.1이 ✅로 지정한 23종 전부.
   ② 파생 = 판정(STALE·신선도) · 집계 · 경로(4-hop은 저장된 4개 관계에서 «질의»가 만든다).
   ③ P4 = 시계열(R05)·본문(R25)은 올리지 않는다. 올리면 multi-hop이 죽는다.
   유일한 예외는 R07이다 — 스펙이 「역정규화(1-hop 단축용)」이라고 «명시»한 관계다.
   그 밖의 지름길 관계를 여기서 새로 만들지 않는다. 만들면 그래프가 스펙보다 커진다.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "docs" / "product" / "data-ontology-spec.md"


# --- 노드 (스펙 §4 저장 분담표의 「Neo4j (파생 투영)」 열) --------------------------


@dataclass(frozen=True)
class NodeSpec:
    label: str
    table: str                          # PG 원천 테이블(권위 원본)
    props: tuple[tuple[str, str], ...]  # (그래프 속성명, PG 열) — id 포함
    spec_props: str                     # §4가 적은 문구 그대로(대조용)

    @property
    def sql(self) -> str:
        cols = ", ".join(f"{pg} AS {g}" for g, pg in self.props)
        return f"SELECT {cols} FROM {self.table} ORDER BY id"


# 🔴 속성명은 §4 문구를 «그대로» 쓴다(Equipment.class ← equipment_class). PG 열 이름으로
#    바꿔 적으면 스펙과 1:1 대조가 끊긴다 — 매핑은 아래 (그래프 속성, PG 열) 쌍이 갖는다.
NODES: tuple[NodeSpec, ...] = (
    NodeSpec("Factory", "factory", (("id", "id"), ("name", "name")), "id·name"),
    NodeSpec("ProductionLine", "production_line", (("id", "id"), ("name", "name")), "id·name"),
    NodeSpec("Equipment", "equipment",
             (("id", "id"), ("name", "name"), ("class", "equipment_class"),
              ("model", "model"), ("criticality", "criticality")),
             "id·name·class·model·criticality"),
    NodeSpec("Component", "component",
             (("id", "id"), ("name", "name"), ("class", "component_class")),
             "id·name·class"),
    NodeSpec("Sensor", "sensor",
             (("id", "id"), ("measurement_type", "measurement_type"), ("unit", "unit")),
             "id·measurement_type·unit"),
    NodeSpec("Alarm", "alarm",
             (("id", "id"), ("severity", "severity"), ("raised_at", "raised_at"),
              ("status", "status")),
             "id·severity·raised_at·status"),
    NodeSpec("Incident", "incident",
             (("id", "id"), ("title", "title"), ("status", "status"),
              ("opened_at", "opened_at")),
             "id·title·status·opened_at"),
    NodeSpec("WorkOrder", "work_order",
             (("id", "id"), ("status", "status"), ("approval_state", "approval_state")),
             "id·status·approval_state"),
    NodeSpec("MaintenanceRecord", "maintenance_record",
             (("id", "id"), ("action_type", "action_type"), ("performed_at", "performed_at")),
             "id·action_type·performed_at"),
    NodeSpec("FailureMode", "failure_mode",
             (("id", "id"), ("name", "name"), ("severity_class", "severity_class")),
             "id·name·severity_class"),
    NodeSpec("SOP", "sop", (("id", "id"), ("title", "title")), "id·title"),
    NodeSpec("SafetyRule", "safety_rule", (("id", "id"), ("title", "title")), "id·title"),
    NodeSpec("Document", "document",
             (("id", "id"), ("doc_type", "doc_type"), ("title", "title")),
             "id·doc_type·title"),
    # 🔴 body 없음 — 본문은 PG 단독 보유(§4 「본문 없음」). hash·승인 상태만 올린다.
    NodeSpec("DocumentRevision", "document_revision",
             (("id", "id"), ("revision_no", "revision_no"),
              ("content_sha256", "content_sha256"), ("approval_state", "approval_state")),
             "id·revision_no·content_sha256·approval_state (본문 없음)"),
)

# P4로 그래프에서 «없어야» 하는 라벨 — 부재를 실측으로 확인한다(verify [4]).
FORBIDDEN_LABELS: tuple[str, ...] = ("SensorReading", "DocumentChunk")


# --- 관계 (스펙 §2.1 관계표 R01~R25) ---------------------------------------------


@dataclass(frozen=True)
class RelSpec:
    code: str            # R01 …
    start: str           # 출발 라벨
    rel_type: str
    end: str             # 도착 라벨
    cardinality: str
    projected: bool
    sql: str | None = None            # (start_id, end_id, *props)를 내는 질의
    props: tuple[str, ...] = ()
    note: str = ""
    reason: str = ""                  # 미투영 사유(projected=False일 때 의무)


RELATIONS: tuple[RelSpec, ...] = (
    RelSpec("R01", "Factory", "CONTAINS", "ProductionLine", "1:N", True,
            "SELECT factory_id AS start_id, id AS end_id FROM production_line ORDER BY 1,2"),
    RelSpec("R02", "ProductionLine", "CONTAINS", "Equipment", "1:N", True,
            "SELECT line_id AS start_id, id AS end_id FROM equipment ORDER BY 1,2"),
    RelSpec("R03", "Equipment", "HAS_COMPONENT", "Component", "1:N", True,
            "SELECT equipment_id AS start_id, id AS end_id FROM component ORDER BY 1,2",
            note="🔴 GS-01 S5 4-hop 1구간 — 회귀 최소 대상(스펙 §6)"),
    RelSpec("R04", "Equipment", "MONITORED_BY", "Sensor", "1:N", True,
            "SELECT equipment_id AS start_id, id AS end_id FROM sensor ORDER BY 1,2"),
    RelSpec("R05", "Sensor", "EMITS", "SensorReading", "1:N", False,
            reason="P4 — 시계열 ≈95만 row. 투영하면 multi-hop 질의가 죽는다(스펙 §0 P4·§4)"),
    RelSpec("R06", "Sensor", "TRIGGERS", "Alarm", "1:N", True,
            "SELECT sensor_id AS start_id, id AS end_id FROM alarm ORDER BY 1,2"),
    RelSpec("R07", "Alarm", "ON_EQUIPMENT", "Equipment", "N:1", True,
            "SELECT id AS start_id, equipment_id AS end_id FROM alarm ORDER BY 1,2",
            note="스펙이 «명시 승인»한 유일한 역정규화(1-hop 단축용). 파생 가능한 관계를 "
                 "저장하는 유일 사례이며, 그 밖의 지름길은 만들지 않는다"),
    RelSpec("R08", "Component", "HAS_FAILURE_MODE", "FailureMode", "N:M", True,
            "SELECT component_id AS start_id, failure_mode_id AS end_id "
            "FROM component_failure_mode ORDER BY 1,2",
            note="🔴 GS-01 S5 4-hop 2구간 — 회귀 최소 대상"),
    RelSpec("R09", "Equipment", "HAS_FAILURE_MODE", "FailureMode", "N:M", True,
            "SELECT equipment_id AS start_id, failure_mode_id AS end_id "
            "FROM equipment_failure_mode ORDER BY 1,2",
            note="부품 미특정 모드(예: 공구 불균형) · GS-01 S5 «경쟁 후보» 경로"),
    RelSpec("R10", "FailureMode", "INDICATED_BY", "Sensor", "N:M", True,
            "SELECT failure_mode_id AS start_id, sensor_id AS end_id, signal_pattern "
            "FROM failure_mode_indicator ORDER BY 1,2",
            props=("signal_pattern",)),
    RelSpec("R11", "FailureMode", "MITIGATED_BY", "SOP", "N:M", True,
            "SELECT failure_mode_id AS start_id, sop_id AS end_id FROM failure_mode_sop ORDER BY 1,2",
            note="🔴 GS-01 S5 4-hop 3구간 — 회귀 최소 대상"),
    RelSpec("R12", "SOP", "REQUIRES", "SafetyRule", "N:M", True,
            "SELECT sop_id AS start_id, safety_rule_id AS end_id FROM sop_safety_rule ORDER BY 1,2",
            note="🔴 GS-01 S5 4-hop 4구간 — 회귀 최소 대상 · ④ WO 「삭제 불가 안전 조치」 근거"),
    RelSpec("R13", "Alarm", "ESCALATES_TO", "Incident", "N:1", True,
            "SELECT id AS start_id, incident_id AS end_id FROM alarm "
            "WHERE incident_id IS NOT NULL ORDER BY 1,2",
            note="FK nullable — 승격되지 않은 alarm은 관계가 «없는 것»이 참이다"),
    RelSpec("R14", "Incident", "AFFECTS", "Equipment", "N:1", True,
            "SELECT id AS start_id, equipment_id AS end_id FROM incident ORDER BY 1,2"),
    RelSpec("R15", "Incident", "DIAGNOSED_AS", "FailureMode", "N:M", True,
            "SELECT incident_id AS start_id, failure_mode_id AS end_id, rank, confidence_note "
            "FROM incident_diagnosis ORDER BY 1,2",
            props=("rank", "confidence_note"),
            note="🔴 정오표 E-1: 속성명은 confidence_note(구표기 confidence 금지)"),
    RelSpec("R16", "Incident", "RESOLVED_BY", "WorkOrder", "1:N", True,
            "SELECT incident_id AS start_id, id AS end_id FROM work_order "
            "WHERE incident_id IS NOT NULL ORDER BY 1,2"),
    RelSpec("R17", "WorkOrder", "REFERENCES", "SOP", "N:M", True,
            "SELECT work_order_id AS start_id, sop_id AS end_id FROM work_order_sop ORDER BY 1,2"),
    RelSpec("R18", "WorkOrder", "RESULTS_IN", "MaintenanceRecord", "1:N", True,
            "SELECT work_order_id AS start_id, id AS end_id FROM maintenance_record "
            "WHERE work_order_id IS NOT NULL ORDER BY 1,2"),
    RelSpec("R19", "MaintenanceRecord", "ON_EQUIPMENT", "Equipment", "N:1", True,
            "SELECT id AS start_id, equipment_id AS end_id FROM maintenance_record ORDER BY 1,2"),
    RelSpec("R20", "MaintenanceRecord", "ADDRESSED", "FailureMode", "N:M", True,
            "SELECT maintenance_record_id AS start_id, failure_mode_id AS end_id "
            "FROM maintenance_record_failure_mode ORDER BY 1,2"),
    RelSpec("R21", "SOP", "DOCUMENTED_BY", "DocumentRevision", "1:1 (current)", True,
            "SELECT id AS start_id, current_revision_id AS end_id FROM sop "
            "WHERE current_revision_id IS NOT NULL ORDER BY 1,2",
            note="«현행» revision 1건만 — 이력 전체는 R24가 갖는다"),
    RelSpec("R22", "SafetyRule", "DOCUMENTED_BY", "DocumentRevision", "1:1 (current)", True,
            "SELECT id AS start_id, current_revision_id AS end_id FROM safety_rule "
            "WHERE current_revision_id IS NOT NULL ORDER BY 1,2"),
    RelSpec("R23", "Equipment", "DESCRIBED_BY", "Document", "N:M", True,
            "SELECT equipment_id AS start_id, document_id AS end_id FROM equipment_document ORDER BY 1,2"),
    RelSpec("R24", "Document", "HAS_REVISION", "DocumentRevision", "1:N", True,
            "SELECT document_id AS start_id, id AS end_id FROM document_revision ORDER BY 1,2",
            note="revision 노드는 id·hash·상태만(§2.1) — 본문은 PG 단독"),
    RelSpec("R25", "DocumentRevision", "HAS_CHUNK", "DocumentChunk", "1:N", False,
            reason="P4 — 본문 chunk는 pgvector 검색 단위다. 그래프에 올리면 관계 탐색이 "
                   "본문 노드에 파묻힌다(스펙 §0 P4·§4)"),
)

# GS-01 S5 4-hop 경로를 이루는 관계 — 끊기면 시나리오가 실패한다(스펙 §6 「경로 성립 조건」).
REGRESSION_MINIMUM: tuple[str, ...] = ("R03", "R08", "R11", "R12")

# GS-01 S5가 기대하는 실값 경로(스펙 §6).
GS01_PATH: tuple[str, ...] = (
    "EQ-CNC-204", "CP-204-BRG-01", "FM-BRG-WEAR", "SOP-BRG-INSP-014", "SAF-LOTO-01",
)


# --- 파생 값 ---------------------------------------------------------------------


def projected() -> tuple[RelSpec, ...]:
    return tuple(r for r in RELATIONS if r.projected)


def node(label: str) -> NodeSpec:
    for n in NODES:
        if n.label == label:
            return n
    raise KeyError(label)


def relation(code: str) -> RelSpec:
    for r in RELATIONS:
        if r.code == code:
            return r
    raise KeyError(code)


def canonical() -> str:
    """manifest의 «내용»을 결정적 텍스트로. 지문(fingerprint)의 원문이다."""
    payload = {
        "nodes": [
            {"label": n.label, "table": n.table, "props": [list(p) for p in n.props]}
            for n in NODES
        ],
        "relations": [
            {"code": r.code, "start": r.start, "type": r.rel_type, "end": r.end,
             "cardinality": r.cardinality, "projected": r.projected,
             "props": list(r.props), "sql": r.sql}
            for r in RELATIONS
        ],
        "forbidden_labels": list(FORBIDDEN_LABELS),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint() -> str:
    """manifest 지문 — 「이 그래프를 무엇이 만들었는가」의 후보 식별자(게이트 ④ 제안)."""
    return hashlib.sha256(canonical().encode("utf-8")).hexdigest()


# --- 자기 점검 -------------------------------------------------------------------


def selfcheck() -> list[str]:
    """manifest 자체의 모순을 «여기서» 잡는다. 그래프에 넣고 나서 발견하면 이미 늦다."""
    errs: list[str] = []
    codes = [r.code for r in RELATIONS]

    if len(codes) != len(set(codes)):
        errs.append(f"관계 코드 중복: {sorted({c for c in codes if codes.count(c) > 1})}")
    expected = [f"R{i:02d}" for i in range(1, 26)]
    if codes != expected:
        errs.append(f"관계 코드가 R01~R25 연속이 아니다: {codes}")

    labels = {n.label for n in NODES}
    for r in RELATIONS:
        if not r.projected:
            if not r.reason:
                errs.append(f"{r.code}: 미투영인데 사유가 없다")
            continue
        if not r.sql:
            errs.append(f"{r.code}: 투영 대상인데 원천 질의가 없다")
        for side, lab in (("출발", r.start), ("도착", r.end)):
            if lab not in labels:
                errs.append(f"{r.code}: {side} 라벨 {lab}에 노드 스펙이 없다")

    for lab in FORBIDDEN_LABELS:
        if lab in labels:
            errs.append(f"P4 위반: {lab}이 노드 스펙에 있다")

    # 투영 대상 노드는 «관계에 쓰이는» 것만 두면 충분하다 — 쓰이지 않는 노드 스펙은
    # 스펙에서 뗐거나 잘못 옮긴 것이다. 어느 쪽이든 조용히 두면 그래프가 어긋난다.
    used = {r.start for r in projected()} | {r.end for r in projected()}
    for n in NODES:
        if n.label not in used:
            errs.append(f"노드 {n.label}: 어떤 투영 관계에도 쓰이지 않는다")

    for code in REGRESSION_MINIMUM:
        r = next((x for x in RELATIONS if x.code == code), None)
        if r is None or not r.projected:
            errs.append(f"회귀 최소 대상 {code}가 투영 대상이 아니다")
    return errs


# --- 스펙 원문 대조 ---------------------------------------------------------------

_ROW = re.compile(r"^\|\s*(R\d{2})\s*\|(.+)\|\s*$")


def parse_spec_relations() -> list[tuple[str, str, str, str, str, bool]]:
    """스펙 §2.1 관계표를 «원문에서» 읽는다. 이 파서가 25행을 못 찾으면 대조를 포기한다."""
    if not SPEC.exists():
        raise SystemExit(f"스펙 없음: {SPEC}")
    rows = []
    for line in SPEC.read_text(encoding="utf-8").splitlines():
        m = _ROW.match(line.strip())
        if not m:
            continue
        cells = [c.strip().strip("`") for c in m.group(2).split("|")]
        if len(cells) < 5:
            continue
        start, rel, end, card, proj = cells[0], cells[1], cells[2], cells[3], cells[4]
        rows.append((m.group(1), start, rel, end, card, proj.startswith("✅")))
    return rows


def check_spec() -> list[str]:
    errs: list[str] = []
    spec_rows = parse_spec_relations()
    if len(spec_rows) != 25:
        return [f"스펙 §2.1 파싱 실패: {len(spec_rows)}행(기대 25) — 표 형식이 바뀌었다"]
    by_code = {r.code: r for r in RELATIONS}
    for code, start, rel, end, card, proj in spec_rows:
        m = by_code.get(code)
        if m is None:
            errs.append(f"{code}: manifest에 없다")
            continue
        got = (m.start, m.rel_type, m.end, m.cardinality, m.projected)
        want = (start, rel, end, card, proj)
        if got != want:
            errs.append(f"{code}: 스펙 {want} ≠ manifest {got}")
    return errs


def _table() -> str:
    out = ["| # | 출발 | 관계 | 도착 | 카디널리티 | 투영 | PG 원천 / 사유 |",
           "|---|---|---|---|---|---|---|"]
    for r in RELATIONS:
        if r.projected:
            src = re.search(r"FROM\s+([a-z_]+)", r.sql or "")
            tail = src.group(1) if src else "?"
            if r.props:
                tail += f" (속성 {'·'.join(r.props)})"
        else:
            tail = f"❌ {r.reason}"
        out.append(f"| {r.code} | {r.start} | {r.rel_type} | {r.end} | {r.cardinality} | "
                   f"{'✅' if r.projected else '❌'} | {tail} |")
    return "\n".join(out)


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--table", action="store_true", help="관계 대조표 출력")
    ap.add_argument("--nodes", action="store_true", help="노드 속성 대조표 출력")
    ap.add_argument("--check-spec", action="store_true", help="스펙 §2.1 원문과 1:1 대조")
    args = ap.parse_args()

    if args.table:
        print(_table())
    if args.nodes:
        print("| 라벨 | PG 테이블 | 그래프 속성 | 스펙 §4 문구 |")
        print("|---|---|---|---|")
        for n in NODES:
            gp = "·".join(g for g, _ in n.props)
            print(f"| {n.label} | {n.table} | {gp} | {n.spec_props} |")

    errs = selfcheck() + check_spec()
    n_proj = len(projected())
    print(f"== manifest: 관계 {len(RELATIONS)}(투영 {n_proj} · 제외 {len(RELATIONS) - n_proj}) · "
          f"노드 {len(NODES)} · 지문 {fingerprint()[:16]}…")
    if errs:
        for e in errs:
            print(f"    🔴 {e}")
        print(f"== 자기 점검 + 스펙 대조: FAIL {len(errs)}건")
        return 1
    print("== 자기 점검 + 스펙 대조: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
