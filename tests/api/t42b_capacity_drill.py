"""t42b_capacity_drill — T4-2b ①② «동시성·시간 축» (검증 좌석 · 16대).

정본 `packages/contracts/rest-api-v0.1.md` v0.1.9 append:

    :146  503 `live_capacity_exhausted` — 동시 상한 + 큐 상한이 «둘 다» 찼을 때 · `Retry-After` ·
          message 에 Replay 안내
    :147  큐 «진입» = 오류 아님 — 200 그대로 + 이벤트 `run.queued`
          payload `{ position: int ≥1, estimatedWaitSec: int|null }` · 순위 바뀌면 재발행(seq 증가)
          · 슬롯 나면 `run.started` · **replay 에 큐 없음** · 큐 대기 상한 초과 = `run.failed` + `fallback:"replay"`
    :150  `runStopped.reason` enum user|timeout|reset (§ⓑ 가 timeout 을 채운다)

🔴 **동시성은 «동시»여야 잰다.** 순서대로 치면 앞 run 이 끝나 버려 큐가 서지 않는다 —
   그러면 「503 이 안 난다」가 「상한이 없다」로 읽힌다. 그래서 스레드로 한꺼번에 친다.

🔴 **seq 단조는 «한 흐름 안»에서만 뜻이 있다.** 두 run 의 이벤트를 한 항아리에 담아 정렬하면
   당연히 뒤섞인다 — 그건 결함이 아니라 내가 섞은 것이다(14대 유언). runId 로 갈라 놓고 센다.

🔴 **「자리 반환」은 reason=timeout 이 찍혔다로 끝나지 않는다.** 그 «뒤» live 가 즉시 도는지까지가
   한 측정이다 — 반환됐다는 것까지가 자취다.

    FKT_API_BASE            기본값 서버(동시 1 · 큐 2) — ① 축
    FKT_T42B_TIMEOUT_BASE   run_timeout_sec 을 아주 작게 준 서버 — ② 축

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _colocation  # noqa: E402

BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8021")
TIMEOUT_BASE = os.environ.get("FKT_T42B_TIMEOUT_BASE", "http://127.0.0.1:8027")
#: 큐 «대기 상한»만 짧게 준 서버. 🔴 갓 뜬 서버여야 est=null 갈래도 함께 잡힌다(완주 이력 0).
QUEUEWAIT_BASE = os.environ.get("FKT_T42B_QUEUEWAIT_BASE", "http://127.0.0.1:8028")
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def call(base: str, method: str, path: str, body: dict | None = None, cookie: str | None = None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return {"status": res.status, "body": json.loads(res.read().decode("utf-8")),
                    "retry_after": res.getheader("Retry-After"),
                    "set_cookie": res.getheader("Set-Cookie")}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"_raw": raw[:200]}
        return {"status": exc.code, "body": parsed, "retry_after": exc.headers.get("Retry-After"),
                "set_cookie": None}
    except urllib.error.URLError as exc:
        raise DrillError(f"{base} 에 닿지 못했다: {exc}") from exc


def session(base: str) -> tuple[str, str]:
    r = call(base, "POST", "/api/sessions")
    if r["status"] != 200 or not r["set_cookie"]:
        raise DrillError(f"세션을 못 받았다 — {r['status']}")
    cookie = r["set_cookie"].split(";", 1)[0]
    return cookie, cookie.split("=", 1)[1]


def code_of(r: dict) -> str | None:
    body = r.get("body")
    if not isinstance(body, dict):
        return None
    err = body.get("error")
    return err.get("code") if isinstance(err, dict) else None


class Report:
    def __init__(self) -> None:
        self.bad = 0

    def row(self, rid: str, name: str, ok: bool, detail: str) -> None:
        self.bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid:6} {name:46} {detail}")

    def note(self, text: str) -> None:
        print(f"  🔵 관측  {text}")


def self_check(rep: Report) -> None:
    """🔴 판정자가 «큐 형상»과 «단조»를 실제로 가르는가 — 표본으로 먼저 증명한다."""
    good = {"position": 1, "estimatedWaitSec": None}
    bads = [
        ({"position": 0, "estimatedWaitSec": None}, "position 0"),
        ({"estimatedWaitSec": 3}, "position 없음"),
        ({"position": "1", "estimatedWaitSec": None}, "position 문자열"),
        ({"position": 1, "estimatedWaitSec": "3"}, "est 문자열"),
    ]
    if not queued_shape_ok(good):
        raise DrillError("자기 검증 실패 — 정상 큐 형상을 어긋남으로 본다")
    for sample, label in bads:
        if queued_shape_ok(sample):
            raise DrillError(f"자기 검증 실패 — «{label}» 을 통과시킨다")
    if monotonic([3, 1, 2]) or not monotonic([0, 1, 5]):
        raise DrillError("자기 검증 실패 — 단조 판정자가 고장났다")
    print("  자기 검증  큐 형상 표본 5종(정상 1 · 이탈 4) + 단조 2종 전건 기대대로 — 판정자 살아 있음")
    rep.note("자기 검증은 «내 눈»만 증명한다 — 대상의 값은 아래에서 따로 센다")


def queued_shape_ok(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False
    pos = payload.get("position")
    est = payload.get("estimatedWaitSec")
    if not isinstance(pos, int) or isinstance(pos, bool) or pos < 1:
        return False
    return est is None or (isinstance(est, int) and not isinstance(est, bool))


def monotonic(seqs: list[int]) -> bool:
    return seqs == sorted(seqs) and len(set(seqs)) == len(seqs)


def events(base: str, run_id: str, cookie: str) -> list[dict]:
    r = call(base, "GET", f"/api/runs/{urllib.parse.quote(run_id)}/events", cookie=cookie)
    return r["body"] if isinstance(r["body"], list) else []


def await_status(base: str, run_id: str, cookie: str, deadline_sec: float = 120.0) -> dict:
    end = time.monotonic() + deadline_sec
    snap: dict = {}
    while time.monotonic() < end:
        r = call(base, "GET", f"/api/runs/{urllib.parse.quote(run_id)}", cookie=cookie)
        snap = r["body"] if isinstance(r["body"], dict) else {}
        if snap.get("status") and snap.get("status") != "running":
            return snap
        time.sleep(0.2)
    return snap


def main() -> int:
    rep = Report()
    print(f"대상      : ① {BASE} (동시 1 · 큐 2 = 계약 기본) · ② {TIMEOUT_BASE}")
    print("정본      : rest-api-v0.1.md :146(503) · :147(run.queued) · :150(reason enum)")
    print()
    self_check(rep)
    _colocation.require(BASE)
    print()

    # ── ① 동시성 — 🔴 «한꺼번에» 친다 ────────────────────────────────────
    cookie, sid = session(BASE)
    fired: list[dict] = []
    lock = threading.Lock()

    def fire(idx: int) -> None:
        r = call(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
        r["idx"] = idx
        with lock:
            fired.append(r)

    barrier = threading.Barrier(4)

    def worker(idx: int) -> None:
        barrier.wait()
        fire(idx)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    fired.sort(key=lambda r: r["idx"])

    accepted = [r for r in fired if r["status"] == 200]
    refused = [r for r in fired if r["status"] == 503]
    rep.row("C-01", "동시 4건 — 일부는 «받아들여진다»(세는 눈)", bool(accepted),
            f"200 {len(accepted)}건 · 503 {len(refused)}건 · 그 밖 {4 - len(accepted) - len(refused)}건")
    rep.row("C-02", "상한+큐가 «둘 다» 차면 503 live_capacity_exhausted",
            bool(refused) and all(code_of(r) == "live_capacity_exhausted" for r in refused),
            f"코드 {sorted({code_of(r) for r in refused})}")
    rep.row("C-03", "503 에 Retry-After 가 붙는다",
            bool(refused) and all(r["retry_after"] and r["retry_after"].strip().isdigit() for r in refused),
            f"RA {sorted({r['retry_after'] for r in refused})}")
    msgs = [((r["body"] or {}).get("error", {}) or {}).get("message", "") for r in refused]
    rep.row("C-04", "503 message 가 Replay 를 «안내»한다",
            bool(msgs) and all("replay" in m.lower() or "재생" in m for m in msgs),
            f"문면 {msgs[:1]}")

    # ── ① run.queued 형상 ────────────────────────────────────────────────
    queued_rows: list[tuple[str, dict, int]] = []
    per_run_seqs: dict[str, list[int]] = {}
    for r in accepted:
        rid = (r["body"] or {}).get("runId")
        if not rid:
            continue
        evs = events(BASE, rid, cookie)
        per_run_seqs[rid] = [e.get("seq") for e in evs if isinstance(e, dict)]
        for e in evs:
            if isinstance(e, dict) and e.get("type") == "run.queued":
                queued_rows.append((rid, e.get("payload") or {}, e.get("seq")))

    rep.row("C-05", "큐 진입은 «오류가 아니다» — 200 + run.queued", bool(queued_rows),
            f"run.queued {len(queued_rows)}건 / 200 {len(accepted)}건")
    rep.row("C-06", "run.queued payload 형상(position≥1 · est int|null)",
            bool(queued_rows) and all(queued_shape_ok(p) for _, p, _ in queued_rows),
            f"표본 {[p for _, p, _ in queued_rows][:3]}")
    # 🔴 seq 단조는 «한 흐름 안»에서 — 두 run 을 섞지 않는다
    bad_flow = {rid: s for rid, s in per_run_seqs.items() if s and not monotonic(s)}
    rep.row("C-07", "seq 단조 — 🔴 run 별 «한 흐름 안»에서", not bad_flow,
            f"흐름 {len(per_run_seqs)}개 · 어긋난 흐름 {len(bad_flow)}개")

    est_kinds = {("null" if p.get("estimatedWaitSec") is None else "값") for _, p, _ in queued_rows}
    rep.note(f"estimatedWaitSec 관측 갈래 = {sorted(est_kinds) or '(없음)'} (계약은 int|null 둘 다 허용)")

    # ── ① replay 는 capacity «밖» ────────────────────────────────────────
    rp = call(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "replay"}, cookie)
    rp_evs = events(BASE, (rp["body"] or {}).get("runId", ""), cookie) if rp["status"] == 200 else []
    rep.row("C-08", "replay 는 capacity 밖 — live 가 찬 동안에도 선다",
            rp["status"] == 200 and not any(e.get("type") == "run.queued" for e in rp_evs),
            f"{rp['status']} · run.queued {sum(1 for e in rp_evs if e.get('type') == 'run.queued')}건")

    # ── ① 큐가 «풀린다» — 슬롯이 나면 run.started ────────────────────────
    started_all = True
    for rid in per_run_seqs:
        snap = await_status(BASE, rid, cookie)
        evs = events(BASE, rid, cookie)
        if not any(e.get("type") == "run.started" for e in evs):
            started_all = False
    rep.row("C-09", "슬롯이 나면 큐가 풀려 run.started 가 온다", started_all,
            f"받아들인 {len(per_run_seqs)}건 전부 시작됨={started_all}")

    # ── ① est=null 갈래 · 큐 대기 상한 초과 갈래 (별 서버에서) ───────────
    # 🔴 est 는 계약이 `int|null` 둘 «다» 허용한다 — 한 갈래만 보고 「형상 맞다」로 적으면
    #    다른 갈래가 깨져도 모른다. null 은 «완주 이력이 없는» 갓 뜬 서버에서 뜬다.
    try:
        q_cookie, q_sid = session(QUEUEWAIT_BASE)
    except DrillError as exc:
        print(f"  ----  C-10/C-11 — 건너뜀({exc}). 🔴 초록으로 세지 않는다")
        rep.bad += 1
    else:
        q_fired: list[dict] = []
        q_lock = threading.Lock()
        q_bar = threading.Barrier(4)

        def q_worker(idx: int) -> None:
            q_bar.wait()
            r = call(QUEUEWAIT_BASE, "POST", f"/api/scenarios/{SCENARIO}/runs",
                     {"sessionId": q_sid, "mode": "live"}, q_cookie)
            r["idx"] = idx
            with q_lock:
                q_fired.append(r)

        q_threads = [threading.Thread(target=q_worker, args=(i,)) for i in range(4)]
        for t in q_threads:
            t.start()
        for t in q_threads:
            t.join()

        q_est: list[object] = []
        q_failed: list[tuple[str, object, object]] = []
        for r in q_fired:
            rid = (r["body"] or {}).get("runId")
            if r["status"] != 200 or not rid:
                continue
            await_status(QUEUEWAIT_BASE, rid, q_cookie, 60)
            for e in events(QUEUEWAIT_BASE, rid, q_cookie):
                payload = e.get("payload") or {}
                if e.get("type") == "run.queued":
                    q_est.append(payload.get("estimatedWaitSec"))
                if e.get("type") == "run.failed":
                    q_failed.append((rid[:12], payload.get("fallback"), payload.get("reason")))

        # 🔴 **이 행은 서버의 «나이»에 달렸다.** null 은 완주 이력이 0 일 때만 뜬다(추정할 근거가
        #    없으므로). 같은 서버를 두 번째로 두드리면 값이 잡히고, 그때 이 행을 FAIL 로 세면
        #    그 빨강은 대상이 아니라 «내 측정 조건»의 것이다 — 나는 한 번 그렇게 적었다.
        #    도달 불가면 빨강도 초록도 내지 않고 «건너뛴 행»으로 남긴다.
        if any(v is None for v in q_est):
            rep.row("C-10", "run.queued est — «null» 갈래도 실재(계약 int|null)", True, f"관측 {q_est[:4]}")
        else:
            print(f"  ----  C-10 est «null» 갈래 — 도달 불가(이 서버는 완주 이력이 있다 · 관측 {q_est[:4]})."
                  " 🔴 초록으로 세지 않는다 — 갓 뜬 서버에서 다시 재라")
        rep.row("C-11", "큐 대기 상한 초과 = run.failed + fallback:\"replay\"",
                bool(q_failed) and all(f == "replay" for _, f, _ in q_failed),
                f"{[(r, f, why) for r, f, why in q_failed][:2]}")

    # ── ② timeout — reason=timeout · 🔴 «자리 반환»까지 ──────────────────
    try:
        t_cookie, t_sid = session(TIMEOUT_BASE)
    except DrillError as exc:
        print(f"\n  ----  T-01 timeout 축 — 건너뜀({exc}). 🔴 초록으로 세지 않는다")
        rep.bad += 1
        print(f"\n결과: 어긋남 {rep.bad}건")
        return 1

    t1 = call(TIMEOUT_BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": t_sid, "mode": "live"}, t_cookie)
    rid1 = (t1["body"] or {}).get("runId", "")
    snap1 = await_status(TIMEOUT_BASE, rid1, t_cookie, 60)
    evs1 = events(TIMEOUT_BASE, rid1, t_cookie)
    stopped = [e for e in evs1 if e.get("type") == "run.stopped"]
    reasons = {(e.get("payload") or {}).get("reason") for e in stopped}
    rep.row("T-01", "상한을 넘긴 run 이 run.stopped 로 끝난다", bool(stopped),
            f"status={snap1.get('status')} · run.stopped {len(stopped)}건")
    rep.row("T-02", "reason 이 «timeout» 이다(enum user|timeout|reset)", reasons == {"timeout"},
            f"reason {sorted(r for r in reasons if r)}")

    # 🔴 자리 반환 — 그 «뒤» live 가 즉시 도는가. 여기까지가 한 측정이다.
    t0 = time.monotonic()
    t2 = call(TIMEOUT_BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": t_sid, "mode": "live"}, t_cookie)
    took = int((time.monotonic() - t0) * 1000)
    evs2 = events(TIMEOUT_BASE, (t2["body"] or {}).get("runId", ""), t_cookie) if t2["status"] == 200 else []
    rep.row("T-03", "🔴 자리 반환 — 뒤이은 live 가 «즉시» 선다(큐 0)",
            t2["status"] == 200 and not any(e.get("type") == "run.queued" for e in evs2),
            f"{t2['status']} {code_of(t2) or ''} · {took}ms · run.queued {sum(1 for e in evs2 if e.get('type') == 'run.queued')}건")

    print(f"\n결과: 어긋남 {rep.bad}건")
    return 1 if rep.bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DrillError as exc:
        print(f"\n🔴 측정 불가 — {exc}")
        sys.exit(2)
    except _colocation.Unproven as exc:
        print(f"\n🔴 귀속 미증명 — {exc}")
        sys.exit(2)
