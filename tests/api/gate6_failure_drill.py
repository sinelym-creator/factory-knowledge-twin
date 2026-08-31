"""gate6_failure_drill — Gate 6 «Public Service·Failure» 로컬판 (검증 좌석 · 16대 · T4-4 선행).

정본 = `docs/baseline/poc-baseline-v0.2.md` **§32.7** 8행. 기대 결과 문면을 **원문 그대로** 인용해
red 정의로 쓴다 — 내가 고쳐 쓰면 그 순간 정본보다 넓거나 좁아진다.

🔴 **로컬에서 «잴 수 있는 행»만 잰다.** 못 재는 행은 초록도 빨강도 내지 않고 **사유를 인쇄하고
   건너뛴다**. 값 표의 그 칸은 `Not measured` 로 고정한다(baseline §0.2).

🔴 **전 행이 base URL 파라미터를 탄다.** 외부판(T4-3 착지 후)은 **같은 그물에 URL 만 바꿔** 돌린다 —
   그물이 두 벌이 되면 두 벌이 갈라지고, 그때 어느 쪽이 정본인지 아무도 모른다.

    FKT_GATE6_API_BASE   재는 ai-api (기본 = 내 로컬 8021)
    FKT_GATE6_WEB_BASE   재는 셸      (기본 = 내 로컬 3191)
    FKT_GATE6_TIMEOUT_BASE / FKT_GATE6_PG_CONTAINER / FKT_GATE6_NEO4J_CONTAINER

🔴 **파괴 자극은 내 스택에서만.** 행마다 ⓐ 흔들기 «전» 대조군 ⓑ 자극이 판정 근거에 «닿았는지»
   ⓒ 되감기(원복 후 정상 복귀)를 붙인다 — 되돌아왔다는 것까지가 측정이다.

exit: 0 = 잰 행 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ownership  # noqa: E402  — 🔴 Q-62 2단 안전장치(남의 좌석 무접촉)

#: 🔴 **Q-62 — 좌석 포트·컨테이너를 기본값으로 두지 않는다.** 예전엔 여기 내 실물 포트가
#:   박혀 있었고, 다른 좌석이 확인 없이 돌려 «내 계측기»를 두드렸다. 미지정 = exit 2.
API = _ownership.read_base("FKT_GATE6_API_BASE", "재는 ai-api")
WEB = _ownership.read_base("FKT_GATE6_WEB_BASE", "재는 셸")
TIMEOUT_API = _ownership.read_base("FKT_GATE6_TIMEOUT_BASE", "상한 서버(Model timeout 행)")
#: 🔴 파괴 대상은 «부수는 자리»에서 늦게 확인한다 — import 만으로 env 를 요구하지 않는다.
PG_CONTAINER_ENV = "FKT_GATE6_PG_CONTAINER"
NEO4J_CONTAINER_ENV = "FKT_GATE6_NEO4J_CONTAINER"
API_CONTAINER_ENV = "FKT_GATE6_API_CONTAINER"

# 🔴 공용 전처리(`_session`·`_colocation`)는 `FKT_API_BASE` 를 본다. 이 드릴은 자기 이름의 env 로
#    대상을 받으므로, 그 값을 «다리 놓아» 주지 않으면 귀속 증명이 세션을 못 얻어 401 로 죽는다 —
#    그 빨강은 대상이 아니라 내 배선의 것이다(한 번 물렸다).
os.environ.setdefault("FKT_API_BASE", API)

# 🔴 **다리를 놓은 «뒤»에 불러야 한다.** `_colocation` 은 import 시점에 `_session` 을 통해
#    대상 base 를 잡는다 — 위 setdefault 보다 먼저 import 하면 그 값을 못 보고 401 로 죽고,
#    그 빨강은 대상이 아니라 내 import 순서의 것이다(한 번 물렸다).
import _colocation  # noqa: E402,PLC0415  — 판정 앞의 귀속 증명(Q-42 · Q-40 계보)
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
REPO = Path(__file__).resolve().parents[2]

#: 🔴 **흔든 의존을 «함께 쓰는» 서버들.** 되감기는 내가 «잰» 서버만 ok 로 만들면 끝나지 않는다 —
#:   같은 DB 를 물고 있던 다른 서버가 낡은 pool 을 든 채 남을 수 있다(Q-52 픽스 «전» 빌드가 그렇다).
#:   실제로 한 번 물렸다: 8061 이 「the database system is shutting down」을 든 채 남아 화면이
#:   빈 것을 나는 «폭 때문»으로 읽을 뻔했다. 되돌렸다는 판정은 «전수»여야 성립한다.
SHARED_BASES = [b for b in os.environ.get("FKT_GATE6_SHARED_BASES", API).split(",") if b.strip()]

#: 🔴 **판정하지 않고 «세는» 이웃** — 같은 DB 를 물지만 Q-52 재연결 픽스 «전» 빌드라 스스로
#:   돌아오지 못하는 서버들. 그 지연은 «현 코드의 결함이 아니다» — 그러나 남겨 두면 다음 사람이
#:   빈 화면을 «다른 이유»로 읽는다. 그래서 판정에서 빼되 **반드시 인쇄한다**(손으로 되살리라고).
LEGACY_BASES = [b for b in os.environ.get("FKT_GATE6_LEGACY_BASES", "").split(",") if b.strip()]

#: 🔴 §32.7 원문. 손대지 않는다 — red 정의는 이 문면에서 온다.
CANON = {
    "노트북 OFF": "Public UX와 Replay 정상",
    "FastAPI OFF": "Offline 표시와 Replay 전환",
    "PostgreSQL OFF": "Live 원인 표시, Public UX 유지",
    "Neo4j OFF": "Graph 단계 제한 또는 명확한 실패",
    "Tunnel OFF": "bounded timeout 후 Offline 판정",
    "WebSocket 중단": "재연결 또는 상태 재조회",
    "Model timeout": "안전 종료와 Replay 안내",
    "동시 요청 초과": "queue 또는 Replay 안내",
}


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def call(base: str, method: str, path: str, body: dict | None = None, cookie: str | None = None,
         timeout: float = 120.0):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", "replace")
            # 🔴 이 그물은 ai-api «와» 셸을 둘 다 두드린다 — 셸은 HTML 을 준다.
            #    JSON 을 가정하면 그 예외가 「셸이 죽었다」처럼 보인다(내가 한 번 물렸다).
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                body = {"_text": raw[:200]}
            return {"status": res.status, "body": body, "set_cookie": res.getheader("Set-Cookie")}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"_raw": raw[:200]}
        return {"status": exc.code, "body": parsed, "set_cookie": None}
    except urllib.error.URLError as exc:
        return {"status": None, "body": {"_why": str(exc)[:120]}, "set_cookie": None}


def session(base: str) -> tuple[str, str]:
    r = call(base, "POST", "/api/sessions")
    if r["status"] != 200 or not r["set_cookie"]:
        raise DrillError(f"세션을 못 받았다 — {r['status']}")
    cookie = r["set_cookie"].split(";", 1)[0]
    return cookie, cookie.split("=", 1)[1]


def docker(*args: str) -> str:
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    out = subprocess.run(["docker", *args], capture_output=True, text=True, env=env)
    return (out.stdout or out.stderr).strip()


def probe(base: str) -> dict:
    r = call(base, "GET", "/api/health", timeout=20)
    deps = (r["body"] or {}).get("dependencies", {}) if isinstance(r["body"], dict) else {}
    return {k: (v or {}).get("state") for k, v in deps.items()}


def wait_probe(base: str, key: str, want: str, secs: int = 45) -> dict:
    state: dict = {}
    for _ in range(secs):
        state = probe(base)
        if state.get(key) == want:
            return state
        time.sleep(1)
    return state


def events(base: str, run_id: str, cookie: str) -> list[dict]:
    r = call(base, "GET", f"/api/runs/{urllib.parse.quote(run_id)}/events", cookie=cookie)
    return r["body"] if isinstance(r["body"], list) else []


def settle(base: str, run_id: str, cookie: str, secs: int = 120) -> dict:
    for _ in range(secs * 5):
        r = call(base, "GET", f"/api/runs/{urllib.parse.quote(run_id)}", cookie=cookie)
        snap = r["body"] if isinstance(r["body"], dict) else {}
        if snap.get("status") and snap.get("status") != "running":
            return snap
        time.sleep(0.2)
    return {}


class Table:
    """🔴 값 표 서식 = Target / Actual / PASS·FAIL / Evidence (baseline §0.2)."""

    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str, str, str]] = []
        self.bad = 0

    def measured(self, fault: str, actual: str, ok: bool, evidence: str) -> None:
        self.bad += 0 if ok else 1
        self.rows.append((fault, CANON[fault], actual, "PASS" if ok else "FAIL", evidence))

    def skipped(self, fault: str, why: str) -> None:
        # 🔴 못 잰 행은 PASS 도 FAIL 도 아니다. 값 칸은 «Not measured» 로 고정한다.
        self.rows.append((fault, CANON[fault], "Not measured", "—", why))

    def render(self) -> None:
        print()
        print(f"  {'장애':<16} {'Target(§32.7 원문)':<28} {'Actual':<34} {'판정':<6} Evidence")
        print(f"  {'-' * 16} {'-' * 28} {'-' * 34} {'-' * 6} {'-' * 40}")
        for fault, target, actual, verdict, evidence in self.rows:
            print(f"  {fault:<16} {target:<28} {actual:<34} {verdict:<6} {evidence}")
        measured = [r for r in self.rows if r[3] != "—"]
        print()
        print(f"  잰 행 {len(measured)} / {len(self.rows)} · 어긋남 {self.bad}건 · "
              f"Not measured {len(self.rows) - len(measured)}행")


# ── 잴 수 있는 행 ────────────────────────────────────────────────────────


def row_fastapi_off(t: Table) -> None:
    """FastAPI OFF — 셸 축. 🔴 브라우저 그물을 그대로 불러 쓴다(두 벌로 갈라지지 않게)."""
    # 🔴 이 행 «전용» 탐침을 쓴다. `t41_live_status_timeout.mjs` 는 블랙홀(accept 후 무응답)
    #    자극에 맞춰 짜여 「요청이 끊긴 적이 있다」를 전제하는데, FastAPI 가 «꺼진» 자극에서는
    #    연결이 거부되어 그 전제가 안 선다 — 그 그물은 정직하게 «측정 불가»를 내고, 나는 그것을
    #    「Offline 을 안 그린다」로 읽을 뻔했다. 같은 «미연결»도 자극이 다르면 그물이 다르다.
    net = REPO / "tests" / "web" / "gate6_offline_probe.mjs"
    if not net.exists():
        t.skipped("FastAPI OFF", f"그물이 없다: {net.name}")
        return
    # 🔴 Q-62 — 부수기 «전» 소유 확인. 못 세우면 흔들지 않고 «건너뛴다»(외부판은 URL 로만 잰다).
    try:
        api_container = _ownership.own_container(API_CONTAINER_ENV, "멈췄다 되살릴 ai-api")
    except _ownership.Unowned as exc:
        t.skipped("FastAPI OFF", f"소유 확인을 못 세웠다 — {str(exc).splitlines()[0][:70]}")
        return

    before = call(WEB, "GET", "/", timeout=20)
    if before["status"] is None:
        t.skipped("FastAPI OFF", f"셸에 닿지 못했다 {WEB}")
        return

    stopped = False
    try:
        docker("stop", api_container)
        stopped = True
        out = subprocess.run(
            ["node", str(net)],
            capture_output=True, text=True, cwd=str(REPO / "tests" / "web"),
            env=dict(os.environ, FKT_WEB_BASE=WEB, PYTHONIOENCODING="utf-8"),
            timeout=180,
        )
        text = (out.stdout or "") + (out.stderr or "")
        if out.returncode == 2:
            t.skipped("FastAPI OFF", f"{net.name} 이 «측정 불가»를 냈다 — {text.strip().splitlines()[-1][:80]}")
            return
        offline = "🔴 관측 안 됨" not in [line for line in text.splitlines() if "Offline 표시" in line][:1][0]             if any("Offline 표시" in line for line in text.splitlines()) else False
        offer = any("Replay 전환" in line and "🔴 관측 안 됨" not in line for line in text.splitlines())
        t.measured("FastAPI OFF",
                   f"Offline 표시 {'○' if offline else '✕'} · Replay 전환 {'○' if offer else '✕'}",
                   offline and offer and out.returncode == 0,
                   f"{net.name} rc={out.returncode} · 자극 = {api_container} stop")
    except subprocess.TimeoutExpired:
        t.skipped("FastAPI OFF", "브라우저 그물이 제한 시간을 넘겼다 — 측정 불가")
    finally:
        if stopped:
            docker("start", api_container)


def row_postgres_off(t: Table) -> None:
    """PostgreSQL OFF — 「Live 원인 표시, Public UX 유지」."""
    cookie, sid = session(API)
    before = call(API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    if not (before["status"] == 200 and (before["body"] or {}).get("mode") == "live"):
        t.skipped("PostgreSQL OFF", f"대조군이 안 선다(흔들기 전 {before['status']}) — 흔들 자격이 없다")
        return
    pg = _ownership.own_container(PG_CONTAINER_ENV, "멈췄다 되살릴 postgres")  # 🔴 Q-62 소유 확인
    stopped = False
    try:
        docker("stop", pg)
        stopped = True
        state = wait_probe(API, "postgres", "unavailable")
        if state.get("postgres") != "unavailable":
            t.skipped("PostgreSQL OFF", f"자극이 프로브에 닿지 않았다 {state}")
            return
        deg = call(API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
        mode = (deg["body"] or {}).get("mode")
        shell = call(WEB, "GET", "/", timeout=20)
        t.measured("PostgreSQL OFF",
                   f"live 요청 → {deg['status']} mode={mode} · 셸 GET / → {shell['status']}",
                   deg["status"] == 200 and mode == "replay" and shell["status"] in (200, 307, 302),
                   f"프로브 {state} · 원인 표시 = mode 강등 · Public UX = 셸 응답 유지")
    finally:
        if stopped:
            docker("start", pg)
    back = wait_probe(API, "postgres", "ok", 60)
    if back.get("postgres") != "ok":
        raise DrillError(f"되감기 실패 — postgres 가 ok 로 안 돌아왔다 {back}")


def row_neo4j_off(t: Table) -> None:
    """Neo4j OFF — 🔴 **이 소조각의 유일한 신규 실측**. 「Graph 단계 제한 또는 명확한 실패」.

    강등인지 `run.failed` fallback 인지 **내가 정하지 않는다** — 실측이 정한다. 정본이 「또는」이라
    했으므로 «둘 중 하나면» 통과이고, 둘 다 아니면(조용히 완주하거나 빈 결과를 성공이라 하면) 빨강이다.
    """
    cookie, sid = session(API)
    before = call(API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    if not (before["status"] == 200 and (before["body"] or {}).get("mode") == "live"):
        t.skipped("Neo4j OFF", f"대조군이 안 선다(흔들기 전 {before['status']})")
        return
    base_snap = settle(API, (before["body"] or {}).get("runId", ""), cookie)
    base_evs = events(API, (before["body"] or {}).get("runId", ""), cookie)
    base_graph = sum(1 for e in base_evs
                     if e.get("type") == "step.evidence"
                     and ((e.get("payload") or {}).get("evidence") or {}).get("kind") == "graph-path")

    neo = _ownership.own_container(NEO4J_CONTAINER_ENV, "멈췄다 되살릴 neo4j")  # 🔴 Q-62 소유 확인
    stopped = False
    try:
        docker("stop", neo)
        stopped = True
        state = wait_probe(API, "neo4j", "unavailable")
        if state.get("neo4j") != "unavailable":
            t.skipped("Neo4j OFF", f"자극이 프로브에 닿지 않았다 {state}")
            return
        r = call(API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
        mode = (r["body"] or {}).get("mode")
        rid = (r["body"] or {}).get("runId", "")
        snap = settle(API, rid, cookie) if rid else {}
        evs = events(API, rid, cookie) if rid else []
        graph_ev = sum(1 for e in evs
                       if e.get("type") == "step.evidence"
                       and ((e.get("payload") or {}).get("evidence") or {}).get("kind") == "graph-path")
        failed = [e for e in evs if e.get("type") == "run.failed"]
        fallback = {(e.get("payload") or {}).get("fallback") for e in failed}

        degraded = r["status"] == 200 and mode == "replay"
        clear_fail = bool(failed) or r["status"] >= 500 or snap.get("status") == "failed"
        limited = graph_ev < base_graph
        ok = degraded or clear_fail or limited
        how = ("강등(mode=replay)" if degraded else
               "명확한 실패" if clear_fail else
               f"graph 단계 제한({base_graph}→{graph_ev})" if limited else
               "🔴 셋 다 아님 — 조용히 지나갔다")
        t.measured("Neo4j OFF",
                   f"{r['status']} mode={mode} · graph 근거 {base_graph}→{graph_ev} · {how}",
                   ok,
                   f"프로브 {state} · run.failed {len(failed)}건 fallback={sorted(f for f in fallback if f)} "
                   f"· 대조군 graph 근거 {base_graph}건(흔들기 전)")
    finally:
        if stopped:
            docker("start", neo)
    back = wait_probe(API, "neo4j", "ok", 90)
    if back.get("neo4j") != "ok":
        raise DrillError(f"되감기 실패 — neo4j 가 ok 로 안 돌아왔다 {back}")
    after = call(API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    if not ((after["body"] or {}).get("mode") == "live"):
        raise DrillError("되감기 뒤에도 live 가 안 선다 — 스택을 흔든 채로 두고 나갈 수 없다")
    void = base_snap  # 기준선 스냅샷은 Evidence 로만 쓴다
    del void


def row_model_timeout(t: Table) -> None:
    """Model timeout — 「안전 종료와 Replay 안내」."""
    try:
        cookie, sid = session(TIMEOUT_API)
    except DrillError as exc:
        t.skipped("Model timeout", f"상한 서버가 없다({exc})")
        return
    r = call(TIMEOUT_API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    rid = (r["body"] or {}).get("runId", "")
    snap = settle(TIMEOUT_API, rid, cookie, 60) if rid else {}
    evs = events(TIMEOUT_API, rid, cookie) if rid else []
    stopped = [e for e in evs if e.get("type") == "run.stopped"]
    reasons = {(e.get("payload") or {}).get("reason") for e in stopped}
    # 「Replay 안내」 = 같은 시나리오를 replay 로 «실제로» 볼 수 있는가(문구가 아니라 길)
    rp = call(TIMEOUT_API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "replay"}, cookie)
    t.measured("Model timeout",
               f"status={snap.get('status')} reason={sorted(r for r in reasons if r)} · replay 경로 {rp['status']}",
               snap.get("status") == "stopped" and reasons == {"timeout"} and rp["status"] == 200,
               f"상한 서버 {TIMEOUT_API} · run.stopped {len(stopped)}건 · 안내 = replay 가 실제로 선다")


def row_overload(t: Table) -> None:
    """동시 요청 초과 — 「queue 또는 Replay 안내」. 🔴 «동시»여야 잰다."""
    import threading

    cookie, sid = session(API)
    got: list[dict] = []
    lock = threading.Lock()
    bar = threading.Barrier(4)

    def worker() -> None:
        bar.wait()
        r = call(API, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
        with lock:
            got.append(r)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()

    accepted = [r for r in got if r["status"] == 200]
    refused = [r for r in got if r["status"] == 503]
    queued = 0
    for r in accepted:
        rid = (r["body"] or {}).get("runId", "")
        if rid:
            queued += sum(1 for e in events(API, rid, cookie) if e.get("type") == "run.queued")
    msgs = [((r["body"] or {}).get("error", {}) or {}).get("message", "") for r in refused]
    guided = all(("replay" in m.lower() or "Replay" in m) for m in msgs) if msgs else False
    t.measured("동시 요청 초과",
               f"200 {len(accepted)} · 503 {len(refused)} · run.queued {queued}건 · 안내 {'○' if guided else '✕'}",
               (queued > 0) or guided,
               f"자극 = 동시 4건(barrier) · 503 문면에 Replay 안내 = {guided}")


def main() -> int:
    t = Table()
    print(f"대상      : ai-api {API} · 셸 {WEB}")
    print(f"정본      : baseline §32.7 (기대 결과 문면 원문 인용) · 값 표 = §0.2 서식")
    print("🔴 파괴 자극 대상 env : " + ", ".join([PG_CONTAINER_ENV, NEO4J_CONTAINER_ENV, API_CONTAINER_ENV])
          + f"  · 선언한 소유 접두 = {os.environ.get('FKT_OWNER_PREFIX') or '🔴 미선언(파괴 행은 서지 않는다)'}")
    print()
    _ownership.self_check()  # 🔴 Q-62 — 대상을 건드리기 전에 «문»부터. 입구에 안 걸려 있으면 잊는 순간 파괴 축이 그냥 돌아간다
    _colocation.require(API)
    print()

    # 🔴 미착지 축 — 셀렉터를 예언하지 않는다. red 정의만 정본 문면으로 박아 둔다.
    t.skipped("노트북 OFF", "T4-3(공개 배포) 전 — 공개 경로가 없어 이 행은 로컬에서 성립하지 않는다")
    t.skipped("Tunnel OFF", "T4-3 전 — 터널 자체가 없다(외부판에서 같은 그물에 URL 만 바꿔 돈다)")
    t.skipped("WebSocket 중단", "PR-2 ⓕ 재연결 축 미착지 — 착지 후 이 행을 채운다(골격만 둔다)")

    row_fastapi_off(t)
    row_postgres_off(t)
    row_neo4j_off(t)
    row_model_timeout(t)
    row_overload(t)

    # 🔴 **되감기 전수 확인** — 흔든 의존을 함께 쓰는 서버가 «전부» 돌아왔는가.
    #    「내가 잰 서버만 ok」는 되감기가 아니다. 이웃 하나가 낡은 pool 을 든 채 남으면 그 화면은
    #    비어 보이고, 다음 사람은 그것을 «다른 이유»로 읽는다 — 실제로 한 번 물렸다.
    print()
    lagging: list[str] = []
    for raw in SHARED_BASES:
        base = raw.strip()
        state = wait_probe(base, "postgres", "ok", 30)
        mark = "ok" if state.get("postgres") == "ok" else f"🔴 {state.get('postgres')}"
        print(f"  되감기 확인  {base:<28} postgres={mark} · neo4j={state.get('neo4j')}")
        if state.get("postgres") != "ok" or state.get("neo4j") != "ok":
            lagging.append(base)
    if lagging:
        t.bad += 1
        print(f"  🔴 FAIL  흔든 의존을 함께 쓰는 서버가 안 돌아왔다: {lagging}")
    for raw in LEGACY_BASES:
        base = raw.strip()
        state = probe(base)
        ok = state.get("postgres") == "ok" and state.get("neo4j") == "ok"
        print(f"  🔵 옛 빌드 이웃  {base:<24} postgres={state.get('postgres')} · neo4j={state.get('neo4j')}"
              + ("" if ok else "  ← 🔴 손으로 되살려라(Q-52 재연결 픽스 «전» 빌드라 스스로 못 돌아온다 · 판정 아님)"))

    t.render()
    print(f"\n결과: 어긋남 {t.bad}건")
    return 1 if t.bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DrillError as exc:
        print(f"\n🔴 측정 불가 — {exc}")
        sys.exit(2)
    except _colocation.Unproven as exc:
        print(f"\n🔴 귀속 미증명 — {exc}")
        sys.exit(2)
