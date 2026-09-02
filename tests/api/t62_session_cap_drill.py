"""t62_session_cap_drill — T6-2 축 ④ «세션 run 상한» 자극 (검증 좌석 · 29대 · 착지 전 초안).

한 세션으로 조사를 상한+1 회 만들어, **상한 회차에서 429 + `session_run_cap_exceeded`
+ `fallback=replay`** 가 오는지 본다.

🔴 **착지 전에 세우는 그물이다.** 이 파일이 쓰인 시점(09-03 07:5x)에 develop 에는
   `FKT_RUN_CAP_PER_SESSION`·`session_run_cap_exceeded` 가 **한 건도 없다**(grep E1).
   그래서 상한이 없는 인스턴스에서 도는 이 드릴은 **빨강이 아니라 `exit 2`(무대 없음)** 다.
   미착지의 초록·빨강을 판정으로 올리면 그건 대상이 아니라 내 창의 값이다.

🔴 **다른 방어가 축 앞에 설 수 있다.** ai-api 에는 이미 T4-2b rate limit 이 있고 그것도
   **429** 를 낸다(`rate_limited` · IP 6000/min · 세션 300/min · `Retry-After`). 숫자만 보면
   두 축이 같은 색을 낸다 — 그래서 이 드릴은 **status 가 아니라 `error.code` 로 판정**하고,
   `rate_limited` 가 먼저 물면 그것을 «축이 아니라 앞 문이 막았다»로 따로 보고한다.

🔴 **대조군 = 새 세션 1회.** 상한에 걸린 뒤 «다른 세션»이 여전히 만들 수 있어야
   「세션 축의 상한」이다. 그 열이 없으면 「서버가 그냥 N번째부터 전부 막는다」와 구별되지 않는다.

🔴 **CLI 소모 0.** 만든 run 은 **즉시 stop** 한다(합성 단계에 도달시키지 않는다). 상한은 run
   «생성» 단계의 규칙이므로 완주가 필요 없다. 게이트웨이 스텁을 함께 띄웠다면 그 호출 로그가
   0줄인 것으로 「구독을 안 썼다」를 자취로 남긴다(`FKT_STUB_LOG`).

    FKT_API_BASE      기본 http://127.0.0.1:8000
    FKT_SCENARIO      기본 GS-01
    FKT_RUN_CAP       기대 상한 (기본 3 — 착지 값과 다르면 발주문 값으로 덮어라)
    FKT_RUN_MODE      run 생성 body 의 mode (기본 live)
    FKT_STUB_LOG      게이트웨이 스텁 호출 로그 경로(있으면 줄 수를 함께 찍는다)
    FKT_CAP_STOP      1(기본) = 만든 run 을 즉시 stop · 0 = 두고 본다

exit: 0 = 축 충족 · 1 = 어긋남 · 2 = 측정 불가(상한이 이 인스턴스에 없다/OFF · 무대 없음)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000").rstrip("/")
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
CAP = int(os.environ.get("FKT_RUN_CAP", "3"))
MODE = os.environ.get("FKT_RUN_MODE", "live")
STUB_LOG = os.environ.get("FKT_STUB_LOG", "")
STOP_RUNS = os.environ.get("FKT_CAP_STOP", "1") == "1"

# 🔴 이 셸의 기본 stdout 은 cp949 다 — 판정 문장의 이모지·한글에서 죽는다(29대 1차 실행에서
#    실제로 UnicodeEncodeError 로 종료했다). 다른 드릴과 같은 idiom 으로 먼저 세운다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# 🔴 발주로 «대상 인스턴스»가 정해지면 `_colocation.require()` 를 여기에 세워라 — 저 서버가
#    이 트리를 읽는지부터 묻지 않으면 상한의 유무를 엉뚱한 인스턴스에서 재게 된다(Q-42 계보).

rows: list[str] = []


def say(s: str) -> None:
    rows.append(s)
    print(s)


def call(method: str, path: str, body: dict | None = None, cookie: str | None = None) -> dict:
    """한 번의 왕복 — 상태·본문·헤더를 «있는 그대로» 돌려준다(예외로 접지 않는다)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8", "replace")
            return {"status": res.status, "body": raw, "headers": dict(res.headers),
                    "json": _try_json(raw)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        return {"status": e.code, "body": raw, "headers": dict(e.headers), "json": _try_json(raw)}
    except Exception as e:  # 연결 자체가 안 되는 것은 «측정 불가»지 빨강이 아니다
        return {"status": None, "body": f"{type(e).__name__}: {e}", "headers": {}, "json": None}


def _try_json(raw: str):
    try:
        return json.loads(raw)
    except Exception:
        return None


def code_of(res: dict) -> str | None:
    """계약 오류 형상 `{error:{code,message}}` 에서 코드만. 형상이 다르면 None."""
    j = res.get("json")
    if isinstance(j, dict) and isinstance(j.get("error"), dict):
        c = j["error"].get("code")
        return c if isinstance(c, str) else None
    return None


def new_session() -> tuple[str | None, str | None]:
    """세션 하나. 반환 = (sessionId, Cookie 헤더값)."""
    res = call("POST", "/api/sessions")
    if res["status"] != 200 or not isinstance(res.get("json"), dict):
        return None, None
    sid = res["json"].get("sessionId")
    raw_cookie = res["headers"].get("Set-Cookie", "")
    cookie = raw_cookie.split(";")[0] if raw_cookie else None
    return (sid if isinstance(sid, str) else None), cookie


def start_run(sid: str, cookie: str | None) -> dict:
    return call("POST", f"/api/scenarios/{SCENARIO}/runs",
                {"sessionId": sid, "mode": MODE}, cookie)


def stop_run(run_id: str, sid: str, cookie: str | None) -> int | None:
    return call("POST", f"/api/runs/{run_id}/stop", {"sessionId": sid}, cookie)["status"]


# ── ① 무대 확인 ───────────────────────────────────────────────────────────────
health = call("GET", "/api/health")
if health["status"] != 200:
    say(f"🔴 무대 없음 — {API}/api/health → {health['status']} ({health['body'][:120]})")
    sys.exit(2)
build = (health.get("json") or {}).get("build") if isinstance(health.get("json"), dict) else None
say(f"== T6-2 축 ④ 세션 run 상한 · {API} · scenario={SCENARIO} · mode={MODE} · 기대 상한 {CAP}")
say(f"  build      : {build}")

sid, cookie = new_session()
if not sid:
    say("🔴 무대 없음 — POST /api/sessions 가 세션을 주지 않는다")
    sys.exit(2)
say(f"  세션 A     : {sid}")

# ── ② 상한+1 회 ───────────────────────────────────────────────────────────────
attempts: list[dict] = []
made: list[str] = []
for i in range(1, CAP + 2):
    res = start_run(sid, cookie)
    c = code_of(res)
    run_id = (res.get("json") or {}).get("runId") if isinstance(res.get("json"), dict) else None
    fallback = (res.get("json") or {}).get("fallback") if isinstance(res.get("json"), dict) else None
    if fallback is None and isinstance(res.get("json"), dict):
        err = res["json"].get("error")
        if isinstance(err, dict):
            fallback = err.get("fallback")
    attempts.append({"n": i, "status": res["status"], "code": c, "runId": run_id,
                     "fallback": fallback, "retry_after": res["headers"].get("Retry-After")})
    say(f"  {i}회차      : {res['status']} · code={c} · runId={run_id} · fallback={fallback}"
        f" · Retry-After={res['headers'].get('Retry-After')}")
    if run_id:
        made.append(run_id)
        if STOP_RUNS:
            # 🔴 합성 단계에 도달시키지 않는다 — 이 축은 «생성» 규칙이고, 완주는 구독을 쓴다.
            stop_run(run_id, sid, cookie)

# ── ③ 대조군 — 새 세션이 여전히 만들 수 있는가(상한이 «세션 축»인가) ──────────────
sid2, cookie2 = new_session()
ctrl = start_run(sid2, cookie2) if sid2 else {"status": None, "json": None, "headers": {}}
ctrl_code = code_of(ctrl)
ctrl_run = (ctrl.get("json") or {}).get("runId") if isinstance(ctrl.get("json"), dict) else None
if ctrl_run and STOP_RUNS:
    stop_run(ctrl_run, sid2, cookie2)
say(f"  대조군 B   : 새 세션 1회 → {ctrl['status']} · code={ctrl_code} · runId={ctrl_run}")

if STUB_LOG:
    try:
        with open(STUB_LOG, encoding="utf-8") as f:
            n = sum(1 for _ in f)
    except FileNotFoundError:
        n = 0
    say(f"  스텁 호출  : {n}줄 (0 = 게이트웨이·구독 미사용)")
say(f"  만든 run   : {len(made)}건 · 즉시 stop={'○' if STOP_RUNS else '✕'}")

# ── ④ 판정 ────────────────────────────────────────────────────────────────────
capped = attempts[-1]
before = attempts[:-1]

# 무대 없음: 상한 회차까지 전부 통과했다 = 이 인스턴스에 상한이 없다/OFF.
if capped["status"] == 200:
    say("")
    say("⚪ 측정 불가(exit 2) — 상한+1 회차가 200 이다. 이 인스턴스에 세션 run 상한이 "
        "없거나(미착지) OFF 다. 초록으로도 빨강으로도 세지 않는다.")
    sys.exit(2)

fails: list[str] = []
for a in before:
    if a["status"] != 200:
        fails.append(f"{a['n']}회차가 {a['status']}(code={a['code']}) — 상한 «전»인데 막혔다")

if capped["status"] == 429 and capped["code"] == "rate_limited":
    say("")
    say("🔴 축이 아니라 «앞 문»이 막았다 — 429 지만 code=rate_limited(T4-2b IP·세션 요청수 축)다. "
        "이 창은 세션 run 상한을 자극하지 못했다. 요청 간격을 벌리거나 rate limit env 를 올린 "
        "열에서 다시 재라(그 전의 어떤 색도 이 축의 것이 아니다).")
    sys.exit(2)

if capped["status"] != 429:
    fails.append(f"상한 회차가 429 가 아니라 {capped['status']}(code={capped['code']})")
if capped["code"] != "session_run_cap_exceeded":
    fails.append(f"상한 회차 code 가 {capped['code']} — 계약은 session_run_cap_exceeded")
if capped["fallback"] != "replay":
    fails.append(f"상한 회차 fallback 이 {capped['fallback']} — 계약은 replay")
if not capped["retry_after"]:
    fails.append("429 인데 Retry-After 헤더가 없다")
if ctrl["status"] != 200:
    fails.append(f"대조군(새 세션)도 {ctrl['status']}(code={ctrl_code}) — 상한이 세션 축이 아니다"
                 " 또는 다른 문이 막고 있다")

if fails:
    print("\n🔴 어긋남:")
    for f in fails:
        print(f"   - {f}")
    sys.exit(1)

print(f"\n○ 축 ④ — 한 세션의 {CAP + 1}회차가 429 `session_run_cap_exceeded` + fallback=replay 로 "
      f"막히고, 다른 세션은 여전히 만든다")
sys.exit(0)
