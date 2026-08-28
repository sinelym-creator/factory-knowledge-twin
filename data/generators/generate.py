"""T1-2 엔트리포인트 — synthetic seed CSV 생성.

    python -m data.generators.generate                 # data/generated/ 에 CSV + 매니페스트
    python -m data.generators.generate --out <dir>     # 멱등 대조용 별도 출력

적재는 하지 않는다(관심사 분리). 1명령 실행 = `pwsh data/seed.ps1` 이 생성 → 적재 → 검증을 잇는다.

🔴 생성 직후 자기 점검을 돌린다. 규모·금지 ID·의도적 불완전성(D-2·D-5)이 어긋나면 «여기서»
   실패해야 한다. DB에 넣고 나서 검증 쿼리로 발견하면 이미 늦다.
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

if __package__ in (None, ""):                      # python data/generators/generate.py 로도 돌게
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    __package__ = "data.generators"

from .config import (FORBIDDEN_IDS, GS, LOAD_ORDER, MANIFEST_NAME, OUT_DIR,
                     RANDOM_SEED, REFERENCE_NOW, TARGET_COUNTS)
from .documents import BRG_R1, BRG_R2, MANUALS, MULTI_REVISION, build_documents
from .emit import COLUMNS, write_load_sql, write_manifest, write_rows, write_stream
from .events import build_alarm_plan, build_events
from .structure import UNMAPPED_FAILURE_MODE, build_structure
from .timeseries import ascii_plot, iter_readings, trend_curve

COMMON_MANUAL = "DOC-MAN-0028"
# seed.ps1이 CSV를 복사해 넣는 컨테이너 안 경로
CONTAINER_DIR = "/tmp/fkt-seed"


def build_all(out_dir: Path) -> tuple[dict, dict, dict]:
    rng = random.Random(RANDOM_SEED)

    tables = build_structure(rng)
    documents, revisions, current_rev = build_documents()
    tables["document"] = documents
    tables["document_revision"] = revisions

    # SOP·SafetyRule의 current revision = 해당 문서의 최신 approved revision (R21·R22)
    for s in tables["sop"]:
        s["current_revision_id"] = current_rev[f"DOC-SOP-{s.pop('_doc_no'):04d}"]
    for s in tables["safety_rule"]:
        s["current_revision_id"] = current_rev[f"DOC-SAF-{s.pop('_doc_no'):04d}"]

    # R23 설비 ↔ 매뉴얼 (모델별 1건 + 공통 1건)
    model_doc = {model: f"DOC-MAN-{no:04d}" for no, model, _t in MANUALS if model}
    for eq in tables["equipment"]:
        tables["equipment_document"].append(
            {"equipment_id": eq["id"], "document_id": model_doc[eq["model"]]})
        tables["equipment_document"].append(
            {"equipment_id": eq["id"], "document_id": COMMON_MANUAL})

    # --- 알람 계획 → 시계열(스파이크 주입) → 알람 관측값 캡처 ---------------------
    alarm_plan = build_alarm_plan(tables["sensor"], rng)
    spikes: dict[str, list] = {}
    capture_points = set()
    for p in alarm_plan:
        spikes.setdefault(p["sensor_id"], []).append(
            (p["raised_at"], p["half_width_sec"], p["peak"]))
        capture_points.add((p["sensor_id"], p["raised_at"]))

    eq_class = {e["id"]: e["equipment_class"] for e in tables["equipment"]}
    sink: dict = {}
    out_dir.mkdir(parents=True, exist_ok=True)
    n_readings = write_stream(
        out_dir, "sensor_reading",
        iter_readings(tables["sensor"], eq_class, spikes, capture_points, sink))

    if sink.get("gs_breach") is None:
        raise SystemExit("FAIL: GS 진동 파형이 경보 임계를 넘지 않았다 — GS-01 S1이 성립하지 않는다.")
    captured = sink["captured"]
    missing = [k for k in capture_points if k not in captured]
    if missing:
        raise SystemExit(f"FAIL: 알람 시각의 계측값을 캡처하지 못했다({len(missing)}건) — "
                         "알람 발생 시각이 시계열 격자에 놓이지 않았다.")

    tables.update(build_events(
        rng, tables["sensor"], alarm_plan, sink["gs_breach"],
        lambda sid, ts: captured[(sid, ts)]))

    counts = {t: len(rows) for t, rows in tables.items()}
    counts["sensor_reading"] = n_readings
    return tables, counts, sink


def self_check(tables: dict, counts: dict) -> list[str]:
    """규모·금지 ID·의도적 불완전성 — 어긋나면 문자열 목록으로 돌려준다."""
    fails = []

    for table, target in TARGET_COUNTS.items():
        if counts.get(table) != target:
            fails.append(f"규모 불일치 {table}: {counts.get(table)} != 목표 {target}")

    # 🔴 Q-UNANS-002 — EQ-CNC-999는 어느 테이블에도 나타나면 안 된다
    for table, rows in tables.items():
        for r in rows:
            for v in r.values():
                if isinstance(v, str) and v in FORBIDDEN_IDS:
                    fails.append(f"금지 ID 출현: {v} in {table}")

    # 🔴 D-5 — SOP 미매핑 고장모드가 정확히 FM-TOOL-IMB 1건이어야 한다
    mapped = {r["failure_mode_id"] for r in tables["failure_mode_sop"]}
    all_fm = {r["id"] for r in tables["failure_mode"]}
    unmapped = all_fm - mapped
    if unmapped != {UNMAPPED_FAILURE_MODE}:
        fails.append(f"D-5 위반: SOP 미매핑 고장모드 = {sorted(unmapped)} "
                     f"(기대 {{{UNMAPPED_FAILURE_MODE}}})")
    eq_direct = {r["failure_mode_id"] for r in tables["equipment_failure_mode"]
                 if r["equipment_id"] == GS["equipment"]}
    if UNMAPPED_FAILURE_MODE not in eq_direct:
        fails.append(f"D-5 위반: {UNMAPPED_FAILURE_MODE}가 {GS['equipment']}에 R09로 붙어 있지 않다")

    # 🔴 D-2 — DOC-SOP-0014의 r1·r2가 실제로 다른 값을 가져야 한다
    if BRG_R1["minutes"] == BRG_R2["minutes"]:
        fails.append("D-2 위반: r1·r2 예상 작업 시간이 같다")
    if set(BRG_R1["tools"]) == set(BRG_R2["tools"]):
        fails.append("D-2 위반: r1·r2 필요 공구 목록이 같다")
    revs = [r for r in tables["document_revision"] if r["document_id"] == GS["sop_document"]]
    approved = [r for r in revs if r["approval_state"] == "approved"]
    if len(revs) != 2 or len(approved) != 1 or approved[0]["id"] != f"{GS['sop_document']}@r2":
        fails.append(f"D-2 위반: {GS['sop_document']} revision 구성이 r1(superseded)+r2(approved)가 아니다")
    if len({r["content_sha256"] for r in revs}) != 2:
        fails.append("D-2 위반: r1·r2의 content_sha256이 같다(본문이 동일하다)")

    # revision 2개 이상 문서 8건 (data-ontology-spec §5)
    per_doc: dict[str, int] = {}
    for r in tables["document_revision"]:
        per_doc[r["document_id"]] = per_doc.get(r["document_id"], 0) + 1
    multi = {d for d, n in per_doc.items() if n >= 2}
    if multi != set(MULTI_REVISION):
        fails.append(f"revision 2개 이상 문서가 {len(multi)}건 (기대 {len(MULTI_REVISION)}건)")

    # GS-01 바인딩 ID 실재 (생성 단계 · DB 실측은 verify/gs01_binding.sql)
    ids = {v for rows in tables.values() for r in rows for v in r.values() if isinstance(v, str)}
    for key, value in GS.items():
        if value not in ids:
            fails.append(f"GS 바인딩 ID 누락: {key} = {value}")

    return fails


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="T1-2 synthetic seed 생성기")
    ap.add_argument("--out", type=Path, default=OUT_DIR, help="CSV 출력 디렉터리")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    # 🔴 Windows 기본 콘솔 코드페이지(CP949)는 한국어 요약도, 플롯의 블록 문자도 못 찍는다.
    #    출력 인코딩을 여기서 고정해야 재현자가 파이프·리다이렉트 없이 그대로 실행할 수 있다.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    tables, counts, sink = build_all(args.out)

    fails = self_check(tables, counts)
    if fails:
        print("== 자기 점검 FAIL ==", file=sys.stderr)
        for f in fails:
            print(f"  - {f}", file=sys.stderr)
        return 1

    for table in COLUMNS:
        if table == "sensor_reading":
            continue
        write_rows(args.out, table, tables[table])
    manifest = write_manifest(args.out, MANIFEST_NAME, counts)
    write_load_sql(args.out, LOAD_ORDER, CONTAINER_DIR)

    if not args.quiet:
        gs_ts, gs_val = sink["gs_breach"]
        vib = next(s for s in tables["sensor"] if s["id"] == GS["sensor_vib"])
        print(f"기준 시각(고정) : {REFERENCE_NOW.isoformat()}   seed={RANDOM_SEED}")
        print(f"출력            : {args.out}")
        print(f"매니페스트      : {manifest.name}")
        print()
        print("-- row 수 --")
        for t in COLUMNS:
            print(f"  {t:<32} {counts[t]:>8,}")
        print(f"  {'합계':<32} {sum(counts.values()):>8,}")
        print()
        print(f"-- GS-01 알람 --")
        print(f"  {GS['alarm']}  raised_at={gs_ts.isoformat()}  observed={gs_val} "
              f"(alarm_threshold={vib['alarm_threshold']} · 파형에서 계산)")
        print()
        print(ascii_plot(trend_curve(vib, "CNC"),
                         threshold=float(vib["alarm_threshold"]),
                         warn=float(vib["warn_threshold"]),
                         label=f"{GS['sensor_vib']} 진동 RMS 추세 (노이즈 제외 · 21일)"))
        print()
        print("-- 의도적 불완전성 (평가셋 성립 조건) --")
        print(f"  D-2  {GS['sop_document']}@r1 공구 {len(BRG_R1['tools'])}종 / "
              f"{BRG_R1['minutes']}분  ↔  @r2 공구 {len(BRG_R2['tools'])}종 / {BRG_R2['minutes']}분")
        print(f"  D-5  SOP 미매핑 고장모드 = {UNMAPPED_FAILURE_MODE} (1건 · R09로 "
              f"{GS['equipment']}에 직결)")
        print(f"  Q-UNANS-002  {sorted(FORBIDDEN_IDS)} 미생성 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
