"""t42b_lifecycle_drill — T4-2b ⑤⑥ «세션 수명 · 강등» (검증 좌석 · 16대).

정본 `packages/contracts/rest-api-v0.1.md` v0.1.9 append:

    :148  Q-48 «시작 전 판정» = 200 `mode:"replay"` 강등 — 판정 근거 = `/health` 의존 프로브 결과
          · 강등 조건 = 해당 시나리오 fixture 존재 · **fixture 없으면 503 `dependency_unavailable`**
          · 🔴 501 은 「구현 없음」이라 live 요청에 쓰지 않는다
          · 🔴 `resources.pg_pool is None` 은 «핸들 유무»라 판정 근거로 쓰지 않는다
    :150  `session_store.py` TTL 8h + lazy `_sweep()` → §ⓔ = 주기 정리 + 주기 env

🔴 **⑤ 는 모듈 축으로 잰다 — 정직하게.** TTL 은 `SESSION_TTL_SEC = 8h` 로 «코드에 박혀» 있고 env
   손잡이는 «청소 주기»뿐이다. HTTP 로 만료를 재려면 8시간을 기다려야 한다. 그래서 저장소를
   직접 세워(작은 ttl · 가짜 시계) 만료·청소·«산 세션 무접촉»을 재고, **HTTP 층의 만료 404 은닉은
   이 실행에서 «미측정»으로 남긴다** — 못 잰 것을 잰 것처럼 적지 않는다.

🔴 **⑥ 은 파괴 자극이다.** 내 스택(`FKT_T42B_PG_CONTAINER`)만 멈춘다. 되돌리기까지가 측정이고,
   되돌린 뒤 «정상으로 돌아왔는지»를 마지막 행에서 확인한다.

    FKT_API_BASE              기본값 서버(fixture 정상)
    FKT_T42B_NOFIXTURE_BASE   fixture 디렉터리«만» 빈 서버 — 503 갈래
    FKT_T42B_PG_CONTAINER     멈췄다 되살릴 내 postgres 컨테이너

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import importlib.util
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
import _colocation  # noqa: E402

#: 🔴 **Q-62 — 좌석 포트를 기본값으로 두지 않는다.** 예전엔 여기 내 실물 포트가 박혀 있었고,
#:   다른 좌석이 확인 없이 돌려 «내 계측기»를 두드렸다(창 소모 · 값 오염). 미지정 = exit 2.
BASE = _ownership.read_base("FKT_API_BASE", "강등 축 서버")
NOFIXTURE_BASE = _ownership.read_base("FKT_T42B_NOFIXTURE_BASE", "fixture 없음 서버")
#: 🔴 파괴 대상은 «부수는 자리»에서 늦게 확인한다 — import 만으로 env 를 요구하지 않는다.
PG_CONTAINER_ENV = "FKT_T42B_PG_CONTAINER"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
REPO = Path(__file__).resolve().parents[2]


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
                    "set_cookie": res.getheader("Set-Cookie")}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"_raw": raw[:200]}
        return {"status": exc.code, "body": parsed, "set_cookie": None}
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


def docker(*args: str) -> str:
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    out = subprocess.run(["docker", *args], capture_output=True, text=True, env=env)
    return (out.stdout or out.stderr).strip()


def probe_state(base: str) -> dict:
    r = call(base, "GET", "/api/health")
    deps = (r["body"] or {}).get("dependencies", {}) if isinstance(r["body"], dict) else {}
    return {k: (v or {}).get("state") for k, v in deps.items()}


class Report:
    def __init__(self) -> None:
        self.bad = 0

    def row(self, rid: str, name: str, ok: bool, detail: str) -> None:
        self.bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid:6} {name:46} {detail}")

    def note(self, text: str) -> None:
        print(f"  🔵 관측  {text}")

    def unmeasured(self, rid: str, why: str) -> None:
        print(f"  ----  {rid} 미측정 — {why}. 🔴 초록으로 세지 않는다")


# ── ⑤ 세션 수명 — 모듈 축 ───────────────────────────────────────────────


def load_session_store():
    """🔴 «서버가 읽는 그 트리»의 모듈을 그대로 불러온다 — 설치본이 아니라 파일이다.

    🔴 파일 하나만 떼어 읽으면 `from . import session_id` 가 터진다(패키지 밖이라 상대 임포트가
       설 자리가 없다). 그 빨강은 대상이 아니라 내 로더의 것이다 — 패키지째 불러온다."""
    root = REPO / "services" / "ai-api"
    path = root / "app" / "session_store.py"
    if not path.exists():
        raise DrillError(f"session_store.py 가 없다: {path}")
    sys.path.insert(0, str(root))
    try:
        import app.session_store as mod  # noqa: PLC0415 — 트리를 «지금» 읽는 것이 이 축이다
    except ImportError as exc:
        raise DrillError(f"session_store 를 패키지로 못 읽었다: {exc}") from exc
    if Path(mod.__file__ or "").resolve() != path.resolve():
        raise DrillError(f"엉뚱한 트리의 모듈을 읽었다: {mod.__file__} (기대 {path})")
    return mod, path


def axis_ttl(rep: Report) -> None:
    mod, path = load_session_store()
    print(f"  정본 파일  {path.relative_to(REPO)} · SESSION_TTL_SEC = {mod.SESSION_TTL_SEC}")

    clock = {"t": 1000.0}
    store = mod.SessionStore(ttl_sec=10.0, clock=lambda: clock["t"])

    live = store.create()
    old = store.create()
    # 🔴 세는 눈 — 만료 «전»에는 둘 다 있다. 없으면 아래 「사라졌다」가 공짜다.
    rep.row("S-00", "세는 눈 — 만료 전에는 둘 다 있다",
            store.get(live.sessionId) is not None and store.get(old.sessionId) is not None,
            f"세션 2건 · ttl 10s")

    clock["t"] += 6.0
    store.touch(live.sessionId) if hasattr(store, "touch") else store.get(live.sessionId)
    clock["t"] += 6.0  # live 는 6s 전에 만졌고 old 는 12s 전 = 하나만 만료

    rep.row("S-01", "만료된 세션은 «없다»(get 이 None)", store.get(old.sessionId) is None,
            f"old lastSeen +12s / ttl 10s")
    rep.row("S-02", "🔴 산 세션은 무접촉 — 청소가 남의 것을 지우지 않는다",
            store.get(live.sessionId) is not None, "live lastSeen +6s")

    # 🔴 **청소는 «새 판»에서 잰다.** 위에서 `get(old)` 을 부른 순간 lazy 청소가 이미 그것을
    #    걷어 갔다 — 그 상태로 `_sweep()` 을 부르면 「걷어 감 0」이 나오고, 나는 그것을
    #    「주기 청소가 안 돈다」로 적을 뻔했다. 빨강의 주어는 대상이 아니라 «내 순서»였다.
    clock2 = {"t": 2000.0}
    store2 = mod.SessionStore(ttl_sec=10.0, clock=lambda: clock2["t"])
    live2 = store2.create()
    doomed2 = store2.create()          # 🔴 이 아이는 «건드리지 않는다» — 건드리면 lazy 가 먼저 먹는다
    clock2["t"] += 6.0
    store2.get(live2.sessionId)        # live 만 갱신
    clock2["t"] += 6.0                 # doomed2 = 12s(만료) · live2 = 6s(생존)
    before = len(store2._sessions)  # noqa: SLF001 — 내부 상태를 «세는» 것이 이 축이다
    removed = store2._sweep()  # noqa: SLF001
    after = len(store2._sessions)  # noqa: SLF001
    rep.row("S-03", "주기 청소가 만료분«만» 걷어 간다", removed == 1 and after == before - removed,
            f"{before} → {after} (걷어 감 {removed} · doomed 무접촉으로 두었다)")
    rep.row("S-04", "청소 뒤에도 산 세션은 그대로", store2.get(live2.sessionId) is not None,
            f"live 생존 · doomed {'없음' if store2.get(doomed2.sessionId) is None else '남음'}")

    has_forever = hasattr(store, "sweep_forever")
    rep.row("S-05", "주기 정리 진입점이 실재(§ⓔ)", has_forever, "sweep_forever" if has_forever else "없음")

    # 🔴 못 잰 것은 못 잰 대로 적는다.
    rep.unmeasured("S-06 HTTP 층 만료 404 은닉",
                   f"TTL 이 코드 상수({mod.SESSION_TTL_SEC:.0f}s = 8h)라 env 로 못 줄인다 — 이 실행에서 도달 불가")


# ── ⑥ Q-48 강등 — HTTP 축 · 파괴 자극 ───────────────────────────────────


def axis_degrade(rep: Report) -> None:
    cookie, sid = session(BASE)

    # ⓐ 정상 대조군 — 흔들기 «전»에 live 가 live 로 선다
    before = call(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    rep.row("D-00", "🔴 대조군 — 흔들기 전에는 live 가 live 로 선다",
            before["status"] == 200 and (before["body"] or {}).get("mode") == "live",
            f"{before['status']} · mode={(before['body'] or {}).get('mode')}")
    rep.note(f"흔들기 전 프로브 = {probe_state(BASE)}")

    # 🔴 Q-62 — 부수기 «전» 소유 확인. 통과 못 하면 흔들지 않는다(exit 2).
    pg = _ownership.own_container(PG_CONTAINER_ENV, "멈췄다 되살릴 postgres")
    stopped = False
    try:
        docker("stop", pg)
        stopped = True
        # 프로브 최소 간격 5s(PR#222) — 갱신을 기다린다. 🔴 자극이 «프로브에 닿았는지»부터 본다.
        state = {}
        for _ in range(30):
            state = probe_state(BASE)
            if state.get("postgres") == "unavailable":
                break
            time.sleep(1)
        rep.row("D-01", "🔴 자극 실재 — 프로브가 postgres 를 unavailable 로 본다",
                state.get("postgres") == "unavailable", f"프로브 {state}")

        # ⓑ fixture 가 «있는» 서버 = 200 mode:"replay" 강등
        deg = call(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
        mode = (deg["body"] or {}).get("mode")
        rep.row("D-02", "의존 정지 + fixture 있음 = 200 mode:\"replay\" 강등",
                deg["status"] == 200 and mode == "replay", f"{deg['status']} · mode={mode} {code_of(deg) or ''}")
        rep.row("D-03", "🔴 501 을 쓰지 않는다(«구현 없음»이 아니다)", deg["status"] != 501,
                f"{deg['status']}")

        # ⓒ fixture 가 «없는» 서버 = 503 dependency_unavailable
        try:
            nf_cookie, nf_sid = session(NOFIXTURE_BASE)
            nf = call(NOFIXTURE_BASE, "POST", f"/api/scenarios/{SCENARIO}/runs",
                      {"sessionId": nf_sid, "mode": "live"}, nf_cookie)
            rep.row("D-04", "의존 정지 + fixture 없음 = 503 dependency_unavailable",
                    nf["status"] == 503 and code_of(nf) == "dependency_unavailable",
                    f"{nf['status']} {code_of(nf)}")
            rep.row("D-05", "🔴 그 갈래도 501 이 아니다", nf["status"] != 501, f"{nf['status']}")
        except DrillError as exc:
            rep.unmeasured("D-04/D-05 fixture 없음 갈래", str(exc))
            rep.bad += 1

        # ⓓ Q-56 «부분 초록» 관측 — 판정 아님, 값만 남긴다
        ev = call(BASE, "GET", "/api/evidence/DOC-SOP-0014%40r2%23001", cookie=cookie)
        rep.note(f"Q-56 부분 초록 — 강등 중 /evidence = {ev['status']} {code_of(ev) or ''} "
                 "(pg 를 타는 읽기는 503 잔존 · 원장 Q-56 그대로)")
    finally:
        if stopped:
            docker("start", pg)

    # ⓔ 복구 — 되돌아왔다는 것까지가 측정이다
    state = {}
    for _ in range(60):
        state = probe_state(BASE)
        if state.get("postgres") == "ok":
            break
        time.sleep(1)
    rep.row("D-06", "🔴 되감기 — postgres 가 ok 로 돌아온다", state.get("postgres") == "ok", f"프로브 {state}")
    after = call(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": sid, "mode": "live"}, cookie)
    rep.row("D-07", "복구 뒤 live 가 다시 live 로 선다",
            after["status"] == 200 and (after["body"] or {}).get("mode") == "live",
            f"{after['status']} · mode={(after['body'] or {}).get('mode')}")


def main() -> int:
    rep = Report()
    print(f"대상      : {BASE} · fixture 없음 {NOFIXTURE_BASE} · 파괴 대상 env = {PG_CONTAINER_ENV}")
    print("정본      : rest-api-v0.1.md :148(Q-48 강등) · :150(TTL·sweep)")
    print()
    _ownership.self_check()  # 🔴 Q-62 — 대상을 건드리기 전에 «문»부터. 입구에 안 걸려 있으면 잊는 순간 파괴 축이 그냥 돌아간다
    _colocation.require(BASE)
    print()
    print("── ⑤ 세션 수명(모듈 축) ──")
    axis_ttl(rep)
    print()
    print("── ⑥ Q-48 강등(HTTP 축 · 파괴 자극) ──")
    axis_degrade(rep)
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
