"""gs01_integration_drill — GS-01 을 «한 세션»으로 완주하며 «연쇄»를 잰다 (T2-6 · Phase 2 통합).

🔴 통합의 정의를 이 그물은 이렇게 잡는다: **앞 단계의 산출이 다음 단계의 입력으로 실재하는가.**
   단계별 PASS 를 나열하는 표는 통합을 재지 못한다 — 아홉 단계가 각자 초록이어도 사이가
   끊겨 있을 수 있다. 그래서 매 행이 «무엇을 받아서 무엇을 냈는지»를 함께 찍는다.

🔴 규율 셋:
   ① **받은 값이 없으면 그 자리에서 죽는다.** 다음 단계를 「건너뛰고 초록」으로 세지 않는다.
   ② **값은 앞 단계에서만 온다.** 상수로 적어 둔 id 로 뒷단계를 돌리면 연쇄가 아니라 병렬이다.
   ③ **대조군을 사이에 둔다** — R12 거절과 일반 항목 반영을 같은 초안에서 잇달아 던진다.
      「전부 거절」과 「R12 를 지킨다」는 대조군 없이는 같은 모양이다.

    python tests/api/gs01_integration_drill.py

exit: 0 = 연쇄 전건 이어짐 · 1 = 끊긴 곳 1군데 이상 · 2 = 실행 오류·측정 불가
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-t26-integration"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
STRATEGIES = ("vector", "hybrid", "graphrag")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def call(method, path, body=None):
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(_carry)
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


def code_of(body):
    return (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None


def need(value, what):
    """🔴 연쇄의 고리. 없으면 다음 단계를 «돌리지 않는다» — 건너뛴 초록을 만들지 않는다."""
    if not value:
        raise DrillError(f"연쇄가 끊겼다 — {what} 이(가) 없다. 다음 단계는 측정 불가다")
    return value


def quote(value):
    return urllib.parse.quote(str(value), safe="")


class Chain:
    """단계마다 «받은 것 → 낸 것»을 적는다. 표가 연쇄를 증명하게 한다."""

    def __init__(self):
        self.bad = 0

    def step(self, sid, name, took, gave, ok, note=""):
        self.bad += 0 if ok else 1
        mark = "PASS" if ok else "FAIL"
        print(f"  {mark}  {sid:4} {name:24} <- {took:32} -> {gave}"
              + (f"   {note}" if note else ""))


def self_check():
    """🔴 연쇄 판정자가 «끊김»을 실제로 잡는가."""
    for sample, label in ((None, "빈 값"), ([], "빈 목록"), ("", "빈 문자열")):
        try:
            need(sample, label)
        except DrillError:
            continue
        raise DrillError(f"자기 검증 실패 — {label} 을 연쇄로 통과시킨다")
    if need(["x"], "채워진 목록") != ["x"]:
        raise DrillError("자기 검증 실패 — 채워진 값을 끊김으로 판정한다")
    print("  자기 검증  빈 값·빈 목록·빈 문자열을 «끊김»으로 잡는다 — 연쇄 판정자 살아 있음")


def await_run(run_id):
    deadline = time.time() + 300
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if isinstance(snap, dict) and snap.get("status") != "running":
            return snap
        time.sleep(0.5)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다")


def evidence_ids(events):
    """이벤트에서 근거 id 를 모은다 — 다음 단계의 «입력»이 여기서 나온다."""
    found = []
    for e in events:
        payload = e.get("payload") if isinstance(e, dict) else None
        if not isinstance(payload, dict):
            continue
        # 🔴 step.evidence 는 «한 건»을 payload.evidence 로 싣는다(실측 08-30).
        #    evidenceIds 복수형만 훑으면 근거의 대부분을 놓치고, 그 빈 목록 위에서
        #    「연쇄가 끊겼다」는 «내» 결론이 난다 — 대상의 결론이 아니라.
        one = payload.get("evidence")
        if isinstance(one, dict) and isinstance(one.get("evidenceId"), str):
            found.append(one["evidenceId"])
        got = payload.get("evidenceIds")
        if isinstance(got, list):
            found += [x for x in got if isinstance(x, str)]
        for cand in (payload.get("candidates") or []):
            if isinstance(cand, dict):
                found += [x for x in (cand.get("evidenceIds") or []) if isinstance(x, str)]
        for hit in (payload.get("hits") or []):
            if isinstance(hit, dict) and isinstance(hit.get("evidenceId"), str):
                found.append(hit["evidenceId"])
    return list(dict.fromkeys(found))


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    print(f"대상      : {API_BASE} · 세션 {SESSION_ID} · 시나리오 {SCENARIO}")
    print("규율      : 🔴 앞 단계 산출이 다음 단계 입력으로 «실재»하는지를 잰다")
    print()
    self_check()
    print()
    chain = Chain()

    # ── S1 시나리오 선택 ───────────────────────────────────────────────
    status, listing = call("GET", "/api/scenarios")
    items = listing if isinstance(listing, list) else (listing or {}).get("scenarios")
    picked = None
    for it in (items or []):
        if isinstance(it, dict) and it.get("scenarioId") == SCENARIO:
            picked = it
    need(picked, f"{SCENARIO} 항목")
    qs = picked.get("questions")
    question = need(qs[0] if isinstance(qs, list) and qs else picked.get("question"),
                    "시나리오가 주는 질문")
    if isinstance(question, dict):
        question = need(question.get("text") or question.get("question"), "질문 문자열")
    chain.step("S1", "시나리오 선택", "(시작점)",
               f"scenarioId={SCENARIO} · question {len(question)}자", status == 200)

    # ── S2 조사 실행(live) — S1 의 scenarioId 를 쓴다 ──────────────────
    status, created = call("POST", f"/api/scenarios/{picked['scenarioId']}/runs",
                           {"sessionId": SESSION_ID, "mode": "live"})
    run_id = need((created or {}).get("runId"), "runId")
    snap = await_run(run_id)
    chain.step("S2", "조사 실행(live)", f"scenarioId={picked['scenarioId']}",
               f"runId={run_id}", status == 200 and snap.get("status") == "completed",
               f"status={snap.get('status')}")

    # ── S3 이벤트 — S2 의 runId 를 쓴다 ────────────────────────────────
    status, events = call("GET", f"/api/runs/{run_id}/events")
    events = events if isinstance(events, list) else []
    need(events, "run 이벤트")
    seqs = [e.get("seq") for e in events if isinstance(e, dict)]
    monotonic = seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    ev_ids = need(evidence_ids(events), "이벤트가 낸 근거 id")
    chain.step("S3", "이벤트 타임라인", f"runId={run_id}",
               f"이벤트 {len(events)} · 근거 {len(ev_ids)}",
               status == 200 and monotonic,
               "seq 단조" if monotonic else "🔴 seq 가 어긋난다")

    # ── S4 스냅샷 — S2 의 runId 로 초안 id 와 후보를 받는다 ────────────
    draft_id = need(snap.get("workOrderDraftId"), "workOrderDraftId")
    candidates = need(snap.get("candidates"), "후보 목록")
    chain.step("S4", "결론 스냅샷", f"runId={run_id}",
               f"draft={draft_id} · 후보 {len(candidates)}", True)

    # ── S5 근거 열람 — S3 의 근거 id 를 «그대로» 편다 ──────────────────
    # 🔴 kind 마다 소비처가 다르다(계약 v0.1.1 append: /evidence 형상은 doc-chunk·record
    #    «만» · graph-path 는 범위 밖 · T2-3 J-2 「graph-path 소비처 = ?byRun」).
    #    그래서 「전건 200」을 red 정의로 쓰면 정본을 어기는 쪽은 내 표다. 축을 갈라 센다.
    gp_ids = [e for e in ev_ids if e.startswith("GP-")]
    ev_route = [e for e in ev_ids if not e.startswith("GP-")]
    opened, chunk_rows, bad_open = 0, [], []
    for eid in ev_route:
        st, body = call("GET", f"/api/evidence/{quote(eid)}")
        if st != 200 or not isinstance(body, dict):
            bad_open.append(f"{eid}={st}")
            continue
        opened += 1
        if body.get("kind") == "doc-chunk" and body.get("text"):
            # docId 는 revisionId 에서 온다(`DOC-…@r1` → `DOC-…`) — 계약의 /documents 키.
            rev = body.get("revisionId") or ""
            chunk_rows.append((eid, body["text"], rev.split("@")[0] or None))
    chain.step("S5", "근거 열람(/evidence)", f"doc-chunk·record {len(ev_route)}",
               f"200 {opened}건 · doc-chunk {len(chunk_rows)}",
               opened == len(ev_route), f"🔴 못 편 것 {bad_open}" if bad_open else "")

    # ── S5b 🔴 소비처 분리 실증 — graph-path 는 /evidence 가 «안 다룬다» ─
    #    그 사실이 참인지, 그리고 대신 byRun 이 여는지는 S7 이 잇는다.
    gp_codes = set()
    for eid in gp_ids:
        st, body = call("GET", f"/api/evidence/{quote(eid)}")
        gp_codes.add(f"{st}:{code_of(body)}")
    split = bool(gp_ids) and gp_codes == {"404:not_found"}
    chain.step("S5b", "소비처 분리(graph-path)", f"GP 근거 {len(gp_ids)}",
               f"/evidence 응답 {sorted(gp_codes)}", split,
               "계약이 /evidence 형상에서 제외한 kind — 소비처는 S7" if split
               else "🔴 응답이 갈린다")

    # ── S6 원문 일치 — S5 의 chunk 를 문서 본문과 대조(§21 증거④) ──────
    need(chunk_rows, "doc-chunk 근거")
    mism = []
    for eid, text, doc_id in chunk_rows:
        if not doc_id:
            mism.append(f"{eid}=documentId 없음")
            continue
        st, prev = call("GET", f"/api/documents/{quote(doc_id)}?highlight={quote(eid)}")
        span = (prev or {}).get("highlight") if isinstance(prev, dict) else None
        if st != 200 or not span:
            mism.append(f"{eid}=좌표없음({st})")
            continue
        cut = (prev.get("body") or "")[span["start"]:span["end"]]
        if cut != text:
            mism.append(f"{eid}=body[start:end] 불일치")
    chain.step("S6", "evidence↔원문 일치", f"doc-chunk {len(chunk_rows)}",
               f"불일치 {len(mism)}", not mism, f"🔴 {mism}" if mism else "")

    # ── S7 그래프 경로 — S2 의 runId 로 열고, S3 의 GP 근거와 맞춘다 ───
    st, paths = call("GET", f"/api/graph/paths?byRun={run_id}")
    paths = paths if isinstance(paths, list) else []
    gp_events = {e for e in ev_ids if e.startswith("GP-")}
    gp_route = {p.get("evidenceId") for p in paths if isinstance(p, dict)}
    linked = bool(gp_events) and gp_events <= gp_route
    chain.step("S7", "그래프 경로(byRun)", f"runId={run_id} · GP근거 {len(gp_events)}",
               f"경로 {len(paths)}", st == 200 and linked,
               "이벤트의 GP 근거가 전건 열린다" if linked else "🔴 GP 근거가 경로에 없다")

    # ── S8 WO 초안 편집 — S4 의 draft id · R12 대조군을 사이에 둔다 ────
    st, draft = call("GET", f"/api/work-orders/{draft_id}")
    measures = need((draft or {}).get("safetyMeasures"), "초안의 안전 조치")
    st_block, blocked = call("PATCH", f"/api/work-orders/{draft_id}", {"safetyMeasures": []})
    new_title = "리바이2 통합 왕복"
    st_edit, _ = call("PATCH", f"/api/work-orders/{draft_id}", {"title": new_title})
    _, after = call("GET", f"/api/work-orders/{draft_id}")
    kept = (after or {}).get("safetyMeasures") == measures
    applied = (after or {}).get("title") == new_title
    ok = st == 200 and 400 <= st_block < 500 and st_edit == 200 and kept and applied
    chain.step("S8", "초안 편집 + R12 대조군", f"draft={draft_id}",
               f"안전 {len(measures)}건 유지 · 제목 반영",
               ok, f"거절 {st_block} {code_of(blocked) or ''} · 편집 {st_edit}")

    # ── S9 승인 — S8 을 거친 «그» 초안을 승인한다 ──────────────────────
    st, res = call("POST", f"/api/work-orders/{draft_id}/approve")
    audit = (res or {}).get("auditId") if isinstance(res, dict) else None
    _, final = call("GET", f"/api/work-orders/{draft_id}")
    state = (final or {}).get("approvalState")
    chain.step("S9", "승인", f"draft={draft_id}",
               f"auditId={audit} · approvalState={state}",
               st == 200 and bool(audit) and state == "approved")

    # ── S10 replay 재생 — 되감고, 그 초안이 «다르게» 답하는지 ──────────
    st, rep = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                   {"sessionId": SESSION_ID, "mode": "replay"})
    rep_id = need((rep or {}).get("runId"), "replay runId")
    rep_snap = await_run(rep_id)
    rep_draft = need(rep_snap.get("workOrderDraftId"), "replay 초안 id")
    st_draft, body_draft = call("GET", f"/api/work-orders/{rep_draft}")
    distinct = st_draft == 501 and code_of(body_draft) == "replay_draft_source_absent"
    _, rep_events = call("GET", f"/api/runs/{rep_id}/events")
    rep_events = rep_events if isinstance(rep_events, list) else []
    chain.step("S10", "replay 재생", f"scenarioId={SCENARIO}",
               f"runId={rep_id} · 이벤트 {len(rep_events)} · 초안 {st_draft}",
               st == 200 and bool(rep_events) and distinct,
               "재생본 초안은 다른 사건으로 답한다" if distinct else "🔴 재생본 초안 응답이 어긋난다")

    # ── S11 3전략 «동일 질문» — S1 의 질문 문자열을 그대로 세 축에 ─────
    st, comp = call("POST", "/api/retrieval/compare",
                    {"sessionId": SESSION_ID, "question": question,
                     "strategies": list(STRATEGIES)})
    rows = comp if isinstance(comp, list) else []
    got = {r.get("strategy"): r for r in rows if isinstance(r, dict)}
    all_three = set(got) == set(STRATEGIES)
    non_empty = all_three and all(len(got[s].get("hits") or []) > 0 for s in STRATEGIES)
    counts = " · ".join(f"{s}={len((got.get(s) or {}).get('hits') or [])}" for s in STRATEGIES)
    chain.step("S11", "3전략 동일 질문", "S1 의 question 문자열 1개",
               counts, st == 200 and all_three and non_empty,
               "세 축이 같은 질문을 받았다" if all_three else "🔴 전략 축이 빈다")

    # ── S12 🔴 run 이 쓴 검색 경로가 compare 로 다시 열리는가 ───────────
    vec = {h.get("evidenceId") for h in ((got.get("vector") or {}).get("hits") or [])}
    run_doc = {e for e in ev_ids if "@r" in e}
    overlap = vec & run_doc
    chain.step("S12", "run↔compare 재현", f"run 문서근거 {len(run_doc)} · vector {len(vec)}",
               f"교집합 {len(overlap)}", bool(overlap),
               "같은 검색 경로다" if overlap else "🔴 두 경로가 다른 것을 본다")

    print()
    print(f"결과: 끊긴 곳 {chain.bad}군데")
    return 1 if chain.bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
