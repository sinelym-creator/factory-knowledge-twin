"""t62_owner_switch_drill — T6-2 축 ①②⑤ «소유자 스위치» end-to-end (검증 좌석 · 29대).

배포 스택(8010)에 조사를 **1회** 걸어 완주까지 따라가며, 게이트웨이 ON/OFF 가 화면 아래 층에서
무엇을 바꾸는지 잰다.

🔴 **자극 전후로 `/live/status` 를 둘 다 찍는다.** 「ON 이었다」를 자기 신고로 받지 않는다 —
   그 값이 **실도달 프로브**의 답이라는 것이 T6-2 의 주장이므로, 자극 창의 양 끝에서 읽어야
   그 창이 어느 상태였는지 말할 수 있다.

🔴 **구독은 유한하다**(이 검증 ≤5). run 1회 = 합성 1회 = 소모 1. `--n` 을 올리기 전에 예산을 세라.

🔴 **run 을 지우지 않는다**(발주: 삭제 0). 완주까지 두고 스냅샷만 읽는다.

    python tests/api/t62_owner_switch_drill.py --label "OFF 열" --n 1
    python tests/api/t62_owner_switch_drill.py --label "ON 열"  --n 3 --out ...

exit: 0 = 측정됨(판정은 판정문이 한다) · 2 = 무대 없음
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import _env  # noqa: E402  — 공용 «대상 주소» 게이트(O-22 · 미지정이면 즉시 죽는다)

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

API = _env.api_base()
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")


def call(method: str, path: str, body: dict | None = None, cookie: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode("utf-8", "replace")
            return {"status": res.status, "json": _j(raw), "headers": dict(res.headers)}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "json": _j(e.read().decode("utf-8", "replace")), "headers": dict(e.headers)}
    except Exception as e:
        return {"status": None, "json": None, "why": f"{type(e).__name__}: {e}", "headers": {}}


def header(res: dict, name: str) -> str:
    """🔴 urllib 의 헤더 dict 는 «서버가 보낸 케이스» 그대로다(uvicorn 은 소문자 `set-cookie`).
    `.get("Set-Cookie")` 는 그래서 조용히 None 을 준다 — 29대가 실제로 여기 걸렸다."""
    for k, v in (res.get("headers") or {}).items():
        if k.lower() == name.lower():
            return v
    return ""


def _j(raw: str):
    try:
        return json.loads(raw)
    except Exception:
        return None


def live_status() -> dict:
    r = call("GET", "/api/live/status")
    return r.get("json") or {"_status": r.get("status"), "_why": r.get("why")}


def one_run(label: str, idx: int) -> dict:
    sess = call("POST", "/api/sessions")
    sid = (sess.get("json") or {}).get("sessionId")
    cookie = (header(sess, "set-cookie") or "").split(";")[0] or None
    if not sid:
        return {"label": label, "n": idx, "error": f"세션 없음(status={sess.get('status')})"}

    before = live_status()
    t0 = time.perf_counter()
    created = call("POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    run_id = (created.get("json") or {}).get("runId")
    if not run_id:
        return {"label": label, "n": idx, "createStatus": created.get("status"),
                "error": json.dumps(created.get("json"), ensure_ascii=False)[:200],
                "liveBefore": before}

    snap, status = None, None
    for _ in range(180):
        r = call("GET", f"/api/runs/{run_id}", cookie=cookie)
        snap = r.get("json")
        status = (snap or {}).get("status")
        if status in ("completed", "failed", "stopped"):
            break
        time.sleep(1.0)
    wall = int((time.perf_counter() - t0) * 1000)
    after = live_status()

    # 🔴 스냅샷에는 합성 축이 없다(실측: `{status, candidates, workOrderDraftId}` 뿐).
    #    `synthesis`·`rationale` 의 정본은 **이벤트 배열**이다(계약 G3 · 되감기의 정본과 같은 것).
    ev = call("GET", f"/api/runs/{run_id}/events", cookie=cookie)
    events = ev.get("json") if isinstance(ev.get("json"), list) else []
    synth, synth_elapsed, mode = None, None, None
    cands, rationale_n, sentences, cited = 0, 0, 0, 0
    for e in events:
        if not isinstance(e, dict):
            continue
        mode = e.get("mode") or mode
        pl = e.get("payload") or {}
        if e.get("type") == "step.completed" and pl.get("step") == "synthesize":
            synth = pl.get("synthesis")
            synth_elapsed = pl.get("elapsedMs")
        if e.get("type") == "run.completed":
            for c in pl.get("candidates") or []:
                cands += 1
                r = c.get("rationale") if isinstance(c, dict) else None
                if isinstance(r, dict):
                    rationale_n += 1
                    sentences += len(r.get("sentences") or [])
                    cited += len(r.get("citedEvidenceIds") or [])

    return {"label": label, "n": idx, "runId": run_id, "status": status, "wallMs": wall,
            "mode": mode, "synthesis": synth, "synthesizeElapsedMs": synth_elapsed,
            "events": len(events), "candidates": cands,
            "rationaleBlocks": rationale_n, "sentences": sentences, "citedIds": cited,
            "snapshotCandidates": len((snap or {}).get("candidates") or []),
            "liveBefore": before, "liveAfter": after}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="열")
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--max-calls", type=int, default=1)
    ap.add_argument("--out", default="benchmarks/t62-owner-switch-runs.jsonl")
    args = ap.parse_args()

    if args.n > args.max_calls:
        print(f"⚪ 거부 — 계획 {args.n}회 > --max-calls {args.max_calls}. 구독은 유한하다.")
        return 2

    h = call("GET", "/api/health")
    if h.get("status") != 200:
        print(f"⚪ 무대 없음 — {API}/api/health → {h.get('status')}")
        return 2
    build = (h.get("json") or {}).get("build")
    print(f"== T6-2 소유자 스위치 · {API} · build={build} · scenario={SCENARIO} · 열「{args.label}」")
    print(f"   /live/status(자극 전) = {json.dumps(live_status(), ensure_ascii=False)}")

    rows = []
    for i in range(1, args.n + 1):
        row = one_run(args.label, i)
        row["build"] = build
        row["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        rows.append(row)
        if "error" in row:
            print(f"   #{i}: 🔴 {row['error']}")
            continue
        s = row.get("synthesis") or {}
        print(f"   #{i}: {row['status']} · mode={row['mode']} · 벽시계 {row['wallMs']}ms "
              f"· synthesize {row.get('synthesizeElapsedMs')}ms · 이벤트 {row['events']}개 "
              f"· axis={s.get('axis')} model={s.get('model')} rejected={s.get('rejectedReason')} "
              f"· 후보 {row['candidates']} · rationale {row['rationaleBlocks']}블록/"
              f"{row['sentences']}문장/인용 {row['citedIds']}")
        print(f"       live: 전 {row['liveBefore'].get('online')} → 후 {row['liveAfter'].get('online')}")

    with open(args.out, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"   → {args.out} 에 {len(rows)}행 append")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
