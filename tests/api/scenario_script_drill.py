"""scenario_script_drill — 조사가 «대본대로» 돌고, 낸 근거를 자기가 펴는가 (검증 좌석 · T2-3).

🔴 이 그물이 지키는 문장 셋:
   ① **단계가 «조용히 0건으로» 통과하지 않는다.** 검색 3단계(structured·vector·graph)는 근거를
      내야 하고, 종합 단계는 후보를, 초안 단계는 초안 id 를 내야 한다. 빈 채로 `step.completed`
      가 나가면 화면은 「했다」를 보고 사람은 「됐다」로 읽는다(7대 유언의 T2-3 판).
   ② **낸 근거는 «자기 kind 의 계약 소비처»로 열린다**(오케 판정 08-30 회부① 채택) —
      `doc-chunk`·`record` → `GET /evidence` · `graph-path` → `GET /graph/paths?byRun`.
      열리지 않으면 화면은 근거 링크를 눌렀을 때 빈손이 된다(T2-2 V-6 계보).
   ③ **T2-1 을 «재사용»한다.** vector 단계의 근거가 같은 질문의 `compare` 로 재현되지 않으면
      새 검색 경로가 생겼다는 뜻이다(게이트 2 — 있으면 회부).

🔴 기대값은 구현이 아니라 정본에서 뽑는다 — 단계 목록은 **이벤트 스키마의 `stepId` enum**,
   대본 기대는 `docs/product/golden-scenario-spec.md` §3 표, 후보 규칙은 같은 절의
   「유력 = FM-BRG-WEAR」다. 구현을 읽고 기대값을 적으면 그건 복창이다.

    python tests/api/scenario_script_drill.py

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "packages" / "contracts" / "agent-events-v0.1.schema.json"
SPEC = REPO / "docs" / "product" / "golden-scenario-spec.md"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-script-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")

# 근거를 «내야 하는» 단계와, 근거가 아니라 «결론»을 내는 단계를 갈라 둔다.
RETRIEVAL_STEPS = ("structured", "vector", "graph")
# 대본 §3 — 「후보 순위(유력 = FM-BRG-WEAR)가 바뀌면 FAIL」
_LEAD = re.compile(r"유력\s*=\s*([A-Z][A-Z0-9-]+)")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def canon_steps() -> list[str]:
    if not SCHEMA.exists():
        raise DrillError(f"스키마 정본 없음: {SCHEMA}")
    steps = json.loads(SCHEMA.read_text(encoding="utf-8"))["$defs"]["stepId"]["enum"]
    if len(steps) < 3:
        raise DrillError(f"stepId enum 이 이상하다: {steps}")
    return steps


def canon_lead() -> str:
    if not SPEC.exists():
        raise DrillError(f"대본 정본 없음: {SPEC}")
    match = _LEAD.search(SPEC.read_text(encoding="utf-8"))
    if not match:
        raise DrillError("대본에서 「유력 = …」을 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    return match.group(1)


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def execute() -> tuple[str, dict, list[dict]]:
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": "live"})
    if status == 501:
        raise DrillError("runs 표면이 아직 501 이다 — 미해제는 결함이 아니다")
    if status != 200:
        raise DrillError(f"run 생성이 {status} 를 냈다: {str(created)[:160]}")
    run_id = created["runId"]                       # type: ignore[index]
    deadline = time.time() + 180
    snap: dict = {}
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")  # type: ignore[assignment]
        if snap.get("status") != "running":
            break
        time.sleep(1)
    else:
        raise DrillError("run 이 제한 시간 안에 끝나지 않았다")
    status, events = call("GET", f"/api/runs/{run_id}/events")
    if status != 200 or not isinstance(events, list) or not events:
        # 🔴 빈 결과는 결과가 아니다 — 잴 것이 없으면 측정 불가다.
        raise DrillError(f"이벤트를 못 받았다: {status}")
    return run_id, snap, events


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    steps = canon_steps()
    lead = canon_lead()
    print(f"정본      : 스키마 stepId {len(steps)}단계 · 대본 유력 후보 {lead}")
    print(f"대상      : {API_BASE} · 시나리오 {SCENARIO}\n")

    run_id, snap, events = execute()
    print(f"  run       {run_id} · 이벤트 {len(events)}건 · status={snap.get('status')}")

    plan = next((e["payload"]["steps"] for e in events if e["type"] == "plan.updated"), [])
    question = next((e["payload"].get("question") for e in events if e["type"] == "run.started"), "")
    by_step: dict[str, list[dict]] = {}
    for event in events:
        if event["type"] == "step.evidence":
            by_step.setdefault(event["payload"]["step"], []).append(event["payload"]["evidence"])
    completed = [e["payload"]["step"] for e in events if e["type"] == "step.completed"]

    rows: list[tuple[str, str, bool, str]] = []

    rows.append(("P-01", "선언한 plan == 스키마 stepId 전 단계", plan == steps, str(plan)))
    rows.append(("P-02", "선언한 단계가 전부 완료로 닫힌다", completed == plan,
                 f"완료 {completed}"))

    # ① 조용한 0건 통과
    for step in RETRIEVAL_STEPS:
        count = len(by_step.get(step, []))
        rows.append((f"P-{step[:3].upper()}", f"{step} 단계가 근거를 낸다(0건 통과 금지)",
                     count > 0, f"{count}건"))
    candidates = snap.get("candidates") or []
    rows.append(("P-03", "synthesize 결론 — 후보가 비어 있지 않다", bool(candidates),
                 f"{len(candidates)}건"))
    rows.append(("P-04", "draft_work_order 결론 — 초안 id 가 있다",
                 bool(snap.get("workOrderDraftId")), str(snap.get("workOrderDraftId"))))
    empty_steps = [s for s in RETRIEVAL_STEPS if not by_step.get(s)]
    rows.append(("P-05", "🔴 근거 0건인 채 완료된 검색 단계 없음", not empty_steps,
                 str(empty_steps) or "없음"))

    # ② kind 별 계약 소비처로 해석
    kinds: dict[str, list[str]] = {}
    for step_evidence in by_step.values():
        for ref in step_evidence:
            kinds.setdefault(ref["kind"], []).append(ref["evidenceId"])
    rows.append(("P-06", "어휘 통일 — alarm·sensor-series 미발행(판정 08-30)",
                 not ({"alarm", "sensor-series"} & set(kinds)), f"kind {sorted(kinds)}"))

    unopened: list[str] = []
    for kind in ("record", "doc-chunk"):
        for eid in dict.fromkeys(kinds.get(kind, [])):
            status, _ = call("GET", "/api/evidence/" + urllib.parse.quote(eid, safe=""))
            if status != 200:
                unopened.append(f"{eid}({status})")
    rows.append(("P-07", "record·doc-chunk → GET /evidence 로 열린다", not unopened,
                 f"{len(kinds.get('record', [])) + len(kinds.get('doc-chunk', []))}건 · "
                 f"{'못 연 것 ' + str(unopened[:3]) if unopened else '전건 200'}"))

    status, paths = call("GET", f"/api/graph/paths?byRun={run_id}")
    served = {p.get("evidenceId") for p in paths} if isinstance(paths, list) else set()
    missing = [e for e in dict.fromkeys(kinds.get("graph-path", [])) if e not in served]
    rows.append(("P-08", "graph-path → /graph/paths?byRun 로 열린다", not missing,
                 f"{len(kinds.get('graph-path', []))}건 · {'없는 것 ' + str(missing[:2]) if missing else '전건 있음'}"))

    # ③ T2-1 재사용
    status, compared = call("POST", "/api/retrieval/compare",
                            {"sessionId": SESSION_ID, "question": question, "strategies": ["vector"]})
    if status != 200 or not isinstance(compared, list):
        raise DrillError(f"compare 대조를 못 했다: {status}")
    compare_ids = {h["evidenceId"] for r in compared for h in r["hits"]}
    run_vector = set(dict.fromkeys(e["evidenceId"] for e in by_step.get("vector", [])))
    reused = bool(run_vector) and run_vector <= compare_ids
    rows.append(("P-09", "vector 단계 근거가 compare 로 재현된다(새 검색 경로 없음)", reused,
                 f"run {len(run_vector)}건 · compare {len(compare_ids)}건 · "
                 f"밖 {sorted(run_vector - compare_ids)[:2]}"))

    # 후보 규칙 — 대본 §3
    ranked = sorted(candidates, key=lambda c: c["rank"])
    rank1 = ranked[0]["failureModeId"] if ranked else None
    rows.append(("P-10", f"대본 §3 — 유력 후보가 {lead}", rank1 == lead, f"rank1={rank1}"))
    rows.append(("P-11", "대본 S6 — 후보 2개 이상", len(ranked) >= 2,
                 str([(c["rank"], c["failureModeId"]) for c in ranked])))
    grounded = all(c.get("evidenceIds") for c in ranked)
    rows.append(("P-12", "후보마다 근거 묶음이 붙는다(S6)", grounded, ""))

    bad = 0
    for rid, what, ok, note in rows:
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid} {what:46} {note}")

    # 관측(판정 아님) — 대본 S5 는 4-hop 경로를 기대한다. 실물 hop 분포를 남긴다.
    if isinstance(paths, list) and paths:
        hops = sorted({p.get("hops") for p in paths})
        targets = [p.get("targetId") for p in paths]
        print(f"\n  관측(판정 아님)  graph 경로 hop 분포 {hops} · 종단 {targets}")
        print("     대본 S5 는 «4-hop · Component 경유 · SAF-LOTO-01 까지»를 기대 evidence 로 적는다 —")
        print("     실물과의 대조는 판정문에서 다룬다(대본 재바인딩 여부 = 오케 판정 사안).")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
