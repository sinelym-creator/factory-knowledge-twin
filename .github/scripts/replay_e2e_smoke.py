"""replay 축 E2E smoke — 기동한 컨테이너에 실제로 자극을 넣고 «몇 건을 봤는지» 센다(T5-3 D).

🔴 **기대값을 여기 박지 않는다.** 「이벤트 38건」은 오늘 fixture 의 줄 수이지 계약이 아니다.
   박아 두면 fixture 가 하나 늘어난 날 이 job 이 «옳은 변화»에 빨강을 낸다. 정본은 fixture
   파일이므로 줄 수를 읽어 기대값으로 쓴다(같은 규율로 §7-3 의 「env 12」도 기각됐다).
🔴 **이 job 이 «못 본 축»을 스스로 말한다.** DB 를 붙이지 않으므로 `/api/health` 는 `degraded`
   이고 의존성 상태는 `unconfigured` 다 — replay 경로가 pool·driver 를 안 쓰기 때문에 그래도
   서지만, 「DB 의존 축이 초록」이라는 뜻은 아니다. 그 사실을 매 실행 찍는다.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# 🔴 포트를 박지 않는다 — 이 스크립트는 러너(:8000)와 좌석 로컬 무대(:809x)에서 «같은 것»을
#    재야 한다. 박아 두면 로컬에서 못 돌리고, 로컬에서 못 돌리는 검사기는 러너에서 처음 울린다.
BASE = os.environ.get("SMOKE_BASE", "http://127.0.0.1:8000").rstrip("/")
SCENARIO = "GS-01"
BAD_SCENARIO = "GS-99-NOPE"
# 상한도 env 로 — 「미도달에서 실제로 빨강이 나는가」를 90초 기다리지 않고 확인할 수 있어야 한다.
HEALTH_LIMIT_SEC = float(os.environ.get("SMOKE_HEALTH_LIMIT_SEC", "90"))
REPO = Path(__file__).resolve().parents[2]
FIXTURE = REPO / "data" / "replay" / f"{SCENARIO.lower()}.events.jsonl"

_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(method: str, path: str, body: dict | None = None, timeout: float = 60.0):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("content-type", "application/json")
    try:
        with _opener.open(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def fail(msg: str) -> int:
    print(f"FAIL {msg}")
    return 1


def main() -> int:
    if not FIXTURE.is_file():
        return fail(f"fixture 가 없다: {FIXTURE.relative_to(REPO)} — 기대값의 정본이 없으면 판정도 없다")
    expected = len([l for l in FIXTURE.read_text(encoding="utf-8").splitlines() if l.strip()])
    if expected == 0:
        return fail("fixture 가 비었다 — 0건을 기대값으로 쓰지 않는다")
    print(f"기대값 출처 = {FIXTURE.relative_to(REPO)} · 이벤트 {expected}건(파일에서 읽음)")

    # ① health — 폴링 «시도 수»와 걸린 시간을 찍는다. 「떴다」와 「몇 번 만에 떴나」는 다른 사실이다.
    t0, attempts, status = time.monotonic(), 0, None
    while time.monotonic() - t0 < HEALTH_LIMIT_SEC:
        attempts += 1
        try:
            status, health = call("GET", "/api/health", timeout=5)
            if status == 200:
                break
        except Exception:
            status = None
        time.sleep(1.0)
    waited = time.monotonic() - t0
    if status != 200:
        return fail(f"health 가 {HEALTH_LIMIT_SEC:.0f}s 안에 200 을 내지 않았다 — 시도 {attempts}회 · 마지막 {status}")
    deps = {k: v.get("state") for k, v in (health.get("dependencies") or {}).items()}
    print(f"① health 200 — 시도 {attempts}회 · {waited:.1f}s · status={health.get('status')} · build={health.get('build')}")
    print(f"   🔴 이 job 이 «안 본» 축: 의존성 {deps} — DB 를 붙이지 않았다(replay 는 pool·driver 를 안 쓴다)")

    # ② 세션
    status, body = call("POST", "/api/sessions")
    if status != 200 or not (body or {}).get("sessionId"):
        return fail(f"세션 생성 실패 — {status} {body}")
    sid = body["sessionId"]
    print(f"② POST /api/sessions 200 · sessionId 길이 {len(sid)}")

    # ③ replay run
    status, body = call("POST", f"/api/scenarios/{SCENARIO}/runs", {"mode": "replay", "sessionId": sid})
    if status != 200:
        return fail(f"replay run 이 200 이 아니다 — {status} {body}")
    run_id = (body or {}).get("runId")
    if not run_id:
        return fail(f"runId 가 없다 — {body}")
    print(f"③ POST /api/scenarios/{SCENARIO}/runs 200 · runId={run_id} · mode={body.get('mode')}")

    # ④ 이벤트 계수 + seq 연속
    status, events = call("GET", f"/api/runs/{run_id}/events")
    if status != 200:
        return fail(f"/events 가 200 이 아니다 — {status}")
    if not isinstance(events, list) or not events:
        return fail(f"이벤트 0건 — 「200 인데 빈 배열」은 통과가 아니다({type(events).__name__})")
    seqs = [e.get("seq") for e in events]
    modes = sorted({e.get("mode") for e in events})
    print(f"④ /events 200 · 이벤트 {len(events)}건 · seq {seqs[0]}~{seqs[-1]} · mode {modes} · 마지막 {events[-1].get('type')}")
    if len(events) != expected:
        return fail(f"이벤트 수가 fixture 와 다르다 — 재생 {len(events)} vs fixture {expected}")
    if seqs != list(range(seqs[0], seqs[0] + len(seqs))):
        return fail(f"seq 가 연속이 아니다 — {seqs}")

    # ⑤ 대조군 — 같은 실행에서 «막히는 것이 막힌다»를 보인다. 없으면 위 초록은 「무엇이든 200」과 구별되지 않는다.
    status, body = call("POST", f"/api/scenarios/{BAD_SCENARIO}/runs", {"mode": "replay", "sessionId": sid})
    if not (400 <= status < 500):
        return fail(f"대조군이 4xx 가 아니다 — 승인 안 된 시나리오에 {status} {body}")
    print(f"⑤ 대조군 {BAD_SCENARIO} → {status} {(body or {}).get('error', {}).get('code')} (같은 실행)")

    print(f"PASS replay 축 E2E — 이벤트 {len(events)}/{expected} · seq 연속 · 대조군 {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
