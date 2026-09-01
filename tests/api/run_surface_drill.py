"""run_surface_drill — runs 표면이 계약대로 서 있는가 (검증 좌석 · T2-3 · J-1·J-2).

🔴 이 그물이 지키는 문장 셋:
   ① **해제된 것은 계약 형상 그대로 답하고, 없는 것은 없다고 답한다.** 「없는 run」에 200 을
      주면 화면은 빈 조사를 그린다(T2-2 V-6 계보).
   ② **중지는 응답과 «타임라인» 둘 다에서 닫힌다.** `POST /runs/{id}/stop` 이 200 을 줘도
      `run.stopped` 이벤트가 없으면 되감기·진행 표시는 영원히 열린 채 남는다(계약 F-3b).
   ③ **`mode` 는 «이벤트 출처» 축이다**(계약 v0.1.3). 실행된 run 은 `live` 가 **참**이고,
      fixture 가 없는 동안 `mode:"replay"` 요청은 **501 이 참**이다 — 200 을 주면 그것이야말로
      「없는 것을 있다고」다. 🔴 계획 v0.2 의 반대 방향 red 조건은 이 판정으로 폐기했다.

🔴 **못 재는 열을 초록으로 적지 않는다.** 합성 게이트웨이 도달 가능(`/live/status.online=true`)
   열은 운영자 로컬 전용이 설계의 참이라(v0.1.2·v0.1.3) 이 스택에서 만들 수 없다. 아래는
   `online=false` 열만 재며, 그 사실을 출력에 남긴다 — 데모 리허설에서 결속된다.

    python tests/api/run_surface_drill.py

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-run-surface"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
POLL_LIMIT_SEC = 180


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
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


def code_of(body: object) -> str | None:
    return (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None


def start(mode: str = "live") -> tuple[int, object]:
    return call("POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": SESSION_ID, "mode": mode})


def wait(run_id: str) -> dict:
    deadline = time.time() + POLL_LIMIT_SEC
    while time.time() < deadline:
        status, snap = call("GET", f"/api/runs/{run_id}")
        if status != 200 or not isinstance(snap, dict):
            raise DrillError(f"/runs/{run_id} 가 {status} 를 냈다")
        if snap.get("status") != "running":
            return snap
        time.sleep(1)
    raise DrillError(f"{POLL_LIMIT_SEC}초 안에 run 이 끝나지 않았다 — 측정 불가")


def self_check() -> None:
    """🔴 대상이 «서 있는지»부터. 501 이면 red 가 아니라 측정 불가다."""
    status, body = start()
    if status == 501:
        raise DrillError("runs 표면이 아직 501 이다 — 미해제는 결함이 아니다")
    if status != 200 or not isinstance(body, dict) or not body.get("runId"):
        raise DrillError(f"기준선부터 어긋난다: {status} {str(body)[:160]}")
    print("  자기 검증  기준 run 이 뜬다 — 대상 살아 있음\n")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    print(f"대상      : {API_BASE} · 시나리오 {SCENARIO}\n")
    self_check()

    bad = 0
    rows: list[tuple[str, str, bool, str]] = []

    # ── 형상 ────────────────────────────────────────────────────────────
    status, created = start()
    run_id = created["runId"]                        # type: ignore[index]
    shape_ok = {"runId", "incidentId", "mode"} <= set(created)  # type: ignore[arg-type]
    rows.append(("R-01", "POST /runs → {runId, incidentId, mode}", shape_ok, str(created)[:80]))
    live_mode = created.get("mode") == "live"        # type: ignore[union-attr]
    rows.append(("R-02", "실행 run 의 mode 는 live (v0.1.3 — 이벤트 출처 축)",
                 live_mode, f"mode={created.get('mode')}"))   # type: ignore[union-attr]

    snap = wait(run_id)
    done_shape = snap.get("status") == "completed" and isinstance(snap.get("candidates"), list)
    rows.append(("R-03", "GET /runs → {status, candidates[], workOrderDraftId?}",
                 done_shape, f"status={snap.get('status')}"))
    filled = bool(snap.get("candidates"))
    rows.append(("R-04", "완주 후 candidates 가 비어 있지 않다", filled,
                 f"{len(snap.get('candidates') or [])}건"))

    status, events = call("GET", f"/api/runs/{run_id}/events")
    listed = status == 200 and isinstance(events, list) and bool(events)
    rows.append(("R-05", "GET /events 가 이벤트 배열을 준다", listed,
                 f"{len(events) if isinstance(events, list) else status}건"))
    ordered = listed and [e["seq"] for e in events] == sorted(e["seq"] for e in events)  # type: ignore[index,union-attr]
    rows.append(("R-06", "배열 순서 == seq 순서", bool(ordered), ""))

    # ── mode 축 (v0.1.3) ────────────────────────────────────────────────
    # 🔴 T2-4 로 참이 바뀐 자리다. T2-3 시점에는 「replay = 501」이 참이었고 이 행은 그것을
    #    지켰다. fixture 가 착지한 지금 참은 「fixture 있는 시나리오의 replay = 200 · mode=replay」다.
    #    갱신 «전»에 옛 조건이 red 를 내는 것을 먼저 확인했다 — 갱신부터 하면 그물이 무엇을
    #    잡았는지 기록이 남지 않는다(그물의 주어는 처방과 함께 바뀐다).
    status, body = start("replay")
    replay_served = status == 200 and (body or {}).get("mode") == "replay"   # type: ignore[union-attr]
    rows.append(("R-07", "replay 요청 = 200 · mode=replay (fixture 착지 · T2-4)",
                 replay_served, f"{status} {(body or {}).get('mode') if isinstance(body, dict) else code_of(body)}"))

    status, live_status = call("GET", "/api/live/status")
    online = (live_status or {}).get("online") if isinstance(live_status, dict) else None
    told = status == 200 and online is False
    rows.append(("R-08", "게이트 축은 /live/status.online 이 말한다(공개 스택 = false 가 참)",
                 told, f"online={online}"))

    # ── 중지 = 응답 + 타임라인 ──────────────────────────────────────────
    status, created2 = start()
    stop_id = created2["runId"]                      # type: ignore[index]
    status, stopped = call("POST", f"/api/runs/{stop_id}/stop")
    answered = status == 200 and (stopped or {}).get("status") == "stopped"  # type: ignore[union-attr]
    rows.append(("R-09", "POST /stop → {status:'stopped'}", answered, str(stopped)[:60]))
    time.sleep(1)
    status, events2 = call("GET", f"/api/runs/{stop_id}/events")
    closed = status == 200 and isinstance(events2, list) and any(
        e.get("type") == "run.stopped" for e in events2)
    rows.append(("R-10", "🔴 타임라인도 닫힌다 — run.stopped 이벤트(F-3b)", bool(closed),
                 str([e.get("type") for e in events2][-2:]) if isinstance(events2, list) else ""))

    # ── graph-path 소비처 (J-2) ─────────────────────────────────────────
    status, paths = call("GET", f"/api/graph/paths?byRun={run_id}")
    served = status == 200 and isinstance(paths, list) and bool(paths)
    rows.append(("R-11", "graph-path 소비처 /graph/paths?byRun 가 경로를 준다", served,
                 f"{len(paths) if isinstance(paths, list) else status}건"))
    template_only = served and all(
        {"evidenceId", "nodes", "edges"} <= set(p) for p in paths)   # type: ignore[union-attr]
    rows.append(("R-12", "고정 template 형상(노드·엣지·라벨)", bool(template_only), ""))

    # ── 대조군 — 없는 것을 없다고 말하는가 ───────────────────────────────
    controls = [
        ("R-13", "없는 시나리오", "POST", f"/api/scenarios/{SCENARIO}-NONE/runs",
         {"sessionId": SESSION_ID, "mode": "live"}),
        ("R-14", "없는 run 조회", "GET", "/api/runs/RUN-does-not-exist", None),
        ("R-15", "없는 run 이벤트", "GET", "/api/runs/RUN-does-not-exist/events", None),
        ("R-16", "없는 run 중지", "POST", "/api/runs/RUN-does-not-exist/stop", None),
        ("R-17", "없는 byRun 경로", "GET", "/api/graph/paths?byRun=RUN-does-not-exist", None),
    ]
    for rid, what, method, path, body in controls:
        status, payload = call(method, path, body)
        ok = status == 404 and code_of(payload) == "not_found"
        rows.append((rid, f"대조군 — {what} → 404", ok, f"{status} {code_of(payload)}"))

    for rid, what, ok, note in rows:
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid} {what:52} {note}")

    print("\n  🔴 못 잰 열 — 합성 게이트웨이 도달 가능(`/live/status.online=true`)에서의 거동.")
    print("     운영자 로컬 전용이 설계의 참이라 이 스택에서 만들 수 없다(데모 리허설 결속).")
    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
