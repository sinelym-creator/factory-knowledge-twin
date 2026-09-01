"""CSV 덤프 + sha256 매니페스트.

🔴 멱등 실측의 계측기. 생성물을 파일로 떨구고 각 파일의 sha256을 매니페스트에 적는다.
   「생성 2회 diff 0」은 이 매니페스트 두 벌을 비교해 판정한다(DB를 두 번 뒤질 필요가 없다).

🔴 개행을 '\\n'으로 못박는다. Windows 기본 CRLF로 쓰면 같은 데이터라도 플랫폼에 따라
   해시가 달라져, 멱등 판정이 환경 차이를 데이터 차이로 오독한다.
"""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path

# 테이블별 칼럼 순서 = COPY 대상 칼럼 목록. DDL(001_core_schema.sql)이 정본이며
# 여기에 없는 칼럼(created_at 등)은 DB 기본값에 맡긴다.
COLUMNS: dict[str, list[str]] = {
    "factory": ["id", "name", "site_code", "timezone", "status", "semantic_id"],
    "production_line": ["id", "factory_id", "name", "line_no", "status", "semantic_id"],
    "equipment": ["id", "line_id", "name", "equipment_class", "model", "installed_on",
                  "status", "criticality", "semantic_id"],
    "component": ["id", "equipment_id", "name", "component_class", "installed_on", "semantic_id"],
    "sensor": ["id", "equipment_id", "measurement_type", "unit", "sampling_hz",
               "warn_threshold", "alarm_threshold", "semantic_id"],
    "sensor_reading": ["sensor_id", "ts", "value", "quality"],
    "document": ["id", "doc_type", "title", "owner_role", "current_revision_no",
                 "status", "semantic_id"],
    "document_revision": ["id", "document_id", "revision_no", "content_sha256", "body_uri",
                          "body", "effective_from", "effective_to", "approval_state",
                          "approved_by"],
    "failure_mode": ["id", "name", "description", "typical_symptoms", "severity_class",
                     "semantic_id"],
    "sop": ["id", "title", "domain", "current_revision_id", "status", "semantic_id"],
    "safety_rule": ["id", "title", "rule_class", "mandatory", "current_revision_id",
                    "semantic_id"],
    "incident": ["id", "equipment_id", "title", "opened_at", "closed_at", "status", "severity"],
    "alarm": ["id", "sensor_id", "equipment_id", "incident_id", "severity", "threshold_value",
              "observed_value", "raised_at", "cleared_at", "status"],
    "work_order": ["id", "incident_id", "equipment_id", "title", "status", "approval_state",
                   "priority", "planned_at", "assignee_role", "parts", "checklist",
                   "estimated_minutes"],
    "maintenance_record": ["id", "equipment_id", "work_order_id", "action_type", "performed_at",
                           "duration_min", "result", "note"],
    "component_failure_mode": ["component_id", "failure_mode_id"],
    "equipment_failure_mode": ["equipment_id", "failure_mode_id"],
    "failure_mode_indicator": ["failure_mode_id", "sensor_id", "signal_pattern"],
    "failure_mode_sop": ["failure_mode_id", "sop_id"],
    "sop_safety_rule": ["sop_id", "safety_rule_id"],
    "incident_diagnosis": ["incident_id", "failure_mode_id", "rank", "confidence_note"],
    "work_order_sop": ["work_order_id", "sop_id"],
    "maintenance_record_failure_mode": ["maintenance_record_id", "failure_mode_id"],
    "equipment_document": ["equipment_id", "document_id"],
}


def _open(path: Path):
    return path.open("w", encoding="utf-8", newline="")


def _writer(fh):
    return csv.writer(fh, lineterminator="\n")


def _cell(v):
    return "" if v is None else v


def write_rows(out_dir: Path, table: str, rows: list[dict]) -> int:
    cols = COLUMNS[table]
    path = out_dir / f"{table}.csv"
    with _open(path) as fh:
        w = _writer(fh)
        w.writerow(cols)
        for r in rows:
            w.writerow([_cell(r.get(c)) for c in cols])
    return len(rows)


def write_stream(out_dir: Path, table: str, rows_iter) -> int:
    """튜플 스트림을 그대로 흘려 쓴다(대용량 시계열용)."""
    cols = COLUMNS[table]
    path = out_dir / f"{table}.csv"
    n = 0
    with _open(path) as fh:
        w = _writer(fh)
        w.writerow(cols)
        for row in rows_iter:
            w.writerow([_cell(x.isoformat()) if hasattr(x, "isoformat") else _cell(x)
                        for x in row])
            n += 1
    return n


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_load_sql(out_dir: Path, load_order: list[str], container_dir: str) -> Path:
    """적재 SQL을 생성기가 «함께» 낸다 — 칼럼 목록의 정본이 하나여야 한다.

    PowerShell 쪽에 칼럼을 다시 적으면 DDL·CSV·적재문이 셋으로 갈라져 어긋난다.
    """
    lines = [
        "-- 생성기가 만든 적재문 (data/generators/emit.py) — 직접 수정하지 않는다.",
        "-- 🔴 seed 테이블을 비우고 다시 넣는다. 재실행 멱등의 «적재» 쪽 절반이다.",
        "BEGIN;",
        "TRUNCATE TABLE " + ", ".join(reversed(load_order)) + " CASCADE;",
    ]
    for table in load_order:
        cols = ", ".join(COLUMNS[table])
        # psql 메타명령 \copy — 클라이언트가 파일을 읽어 스트리밍한다(서버측 COPY의 파일 권한
        # 문제를 피한다). 백슬래시 명령이라 한 줄이어야 하고 세미콜론을 붙이지 않는다.
        lines.append(
            rf"\copy {table} ({cols}) FROM '{container_dir}/{table}.csv' "
            "WITH (FORMAT csv, HEADER true, NULL '')")
    lines += ["COMMIT;", ""]
    path = out_dir / "load.sql"
    path.write_text("\n".join(lines), encoding="utf-8", newline="")
    return path


def write_manifest(out_dir: Path, name: str, counts: dict[str, int]) -> Path:
    lines = []
    for table in sorted(counts):
        path = out_dir / f"{table}.csv"
        lines.append(f"{sha256_file(path)}  {table}.csv  rows={counts[table]}")
    manifest = out_dir / name
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="")
    return manifest


__all__ = ["COLUMNS", "write_rows", "write_stream", "write_manifest",
           "write_load_sql", "sha256_file"]
