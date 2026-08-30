"""_session — 드릴 공용 «세션 운반» 어댑터 (T3-6 선행 · 계약 v0.1.6).

🔴 이 어댑터가 존재하는 이유. v0.1.6이 세션 가드를 전면 도입한다 — `POST /sessions`·
   `GET /health`·`GET /live/status` 를 뺀 전 라우트가 유효 세션을 요구하고, 무세션은
   `401 session_required` 다. 그러면 기존 드릴 14+종이 **가드가 착지하는 순간 한꺼번에
   401 로 죽는다**. 그 빨강은 대상의 것이 아니라 «드릴이 세션을 안 든» 것이다.
   그래서 착지 «전»에 운반 경로를 먼저 깔아 둔다.

🔴 설계 기준 셋 — 이걸 어기면 어댑터가 검증을 오염시킨다:
   ① **세션은 «운반»이지 표본이 아니다.** 어댑터는 드릴의 측정 대상을 바꾸지 않는다.
      바꾸는 것은 두 가지뿐 — 쿠키 헤더 부착 · 본문의 `sessionId` «값» 치환.
      경로·메서드·그 밖의 본문 키는 손대지 않는다.
   ② **가드 미착지 = 엄격한 no-op.** `POST /sessions` 가 501 이면 어댑터는 받은 것을
      **그대로 되돌려준다**(같은 객체 — 사본조차 만들지 않는다). 오늘의 초록이 흔들리면 안 된다.
   ③ **착지 후 = 자동 활성.** 드릴을 다시 고치지 않는다.

🔴 그리고 이 파일은 «주장»을 하지 않는다. 가드가 아직 없는 상태에서 도는 드릴의 초록은
   「v0.1.6 준수」의 증거가 아니다 — 그 판정은 `session_guard_drill` 이 가드 착지 후에 낸다.

    python tests/api/_session.py        # 어댑터 자기 검증만(대조군 포함)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")

# 계약 v0.1.6 — 가드 «제외» 3라우트. 세션을 실을 이유가 없는 자리다.
EXCLUDED = ("/api/sessions", "/api/health", "/api/live/status")


class _State:
    """세션 수립을 한 번만 시도하고 결과를 기억한다."""

    def __init__(self) -> None:
        self.tried = False
        self.active = False
        self.sid: str | None = None
        self.cookie: str | None = None
        self.why = "아직 시도하지 않았다"

    def ensure(self) -> None:
        if self.tried:
            return
        self.tried = True
        req = urllib.request.Request(
            API_BASE + "/api/sessions", data=b"{}",
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                body = json.loads(res.read().decode("utf-8"))
                self.sid = body.get("sessionId")
                self.cookie = res.headers.get("Set-Cookie")
                self.active = bool(self.sid or self.cookie)
                self.why = ("세션 수립됨" if self.active
                            else "200 인데 sessionId·쿠키가 없다 — 운반할 것이 없다")
        except urllib.error.HTTPError as exc:
            self.why = f"POST /sessions 가 {exc.code} — 가드 미착지로 본다(no-op)"
        except urllib.error.URLError as exc:
            self.why = f"{API_BASE} 에 닿지 못했다: {exc}"


_STATE = _State()


def status() -> tuple[bool, str]:
    """활성 여부와 그 «이유». 드릴이 한 줄로 찍어 두면 초록의 주어가 분명해진다."""
    _STATE.ensure()
    return _STATE.active, _STATE.why


def prepare(body, path: str = ""):
    """요청 직전 훅. 반환 = (본문, 추가 헤더).

    🔴 미착지 상태에서는 **받은 객체를 그대로** 돌려준다 — 사본도 만들지 않는다.
       그래야 「어댑터를 붙였더니 값이 달라졌다」가 원천적으로 불가능하다.
    """
    _STATE.ensure()
    if not _STATE.active:
        return body, {}
    if any(path.startswith(p) for p in EXCLUDED):
        return body, {}
    headers = {"Cookie": _STATE.cookie} if _STATE.cookie else {}
    if isinstance(body, dict) and "sessionId" in body and _STATE.sid:
        body = dict(body)
        body["sessionId"] = _STATE.sid
    return body, headers


def session_id(label: str) -> str:
    """드릴이 «자기 이름»으로 부르던 세션 id. 착지 후에는 서버가 발급한 id 가 참이다."""
    _STATE.ensure()
    return _STATE.sid if (_STATE.active and _STATE.sid) else label


def self_check() -> None:
    """🔴 대조군 — 「운반이 값을 바꾸지 않는다」를 실제로 증명한다.

    ① 미착지에서는 입력 «객체 동일성»이 유지된다(사본조차 안 만든다).
    ② 제외 라우트에는 어떤 경우에도 헤더를 얹지 않는다.
    ③ 어댑터를 «통과시킨» 요청과 «날것» 요청이 같은 답을 낸다(제외 라우트로 실측).
    """
    active, why = status()
    print(f"  세션 상태  active={active} · {why}")

    probe = {"sessionId": "levi2-selfcheck", "mode": "live"}
    out, extra = prepare(probe, "/api/scenarios/GS-01/runs")
    if not active:
        if out is not probe or extra != {}:
            raise RuntimeError("자기 검증 실패 — 미착지인데 입력을 건드렸다")
    else:
        if out.get("mode") != "live":
            raise RuntimeError("자기 검증 실패 — sessionId 밖의 키가 바뀌었다")

    for path in EXCLUDED:
        _, ex = prepare(None, path)
        if ex != {}:
            raise RuntimeError(f"자기 검증 실패 — 제외 라우트 {path} 에 헤더를 얹는다")

    # 🔴 대조군은 «결정적인 것»끼리 비교해야 한다. /health 응답에는 매 호출 달라지는
    #    latencyMs 가 들어 있어, 그대로 비교하면 어댑터와 무관한 이유로 빨강이 난다
    #    (첫 판에 실제로 그렇게 났다 — 계측기가 대상보다 먼저 거짓말한 자리).
    _simulate_active()

    raw = _stable(_fetch("/api/health", {}))
    _, ex = prepare(None, "/api/health")
    via = _stable(_fetch("/api/health", ex))
    if raw != via:
        raise RuntimeError(f"자기 검증 실패 — 어댑터 경유가 답을 바꾼다: {raw} vs {via}")
    print("  자기 검증  객체 동일성 · 제외 라우트 무부착 · 경유↔날것 동일 — 운반이 값을 안 바꾼다")


VOLATILE = ("latencyMs", "elapsedMs", "totalElapsedMs", "ts")


def _strip(node):
    """매 호출 달라지는 값을 걷어낸다 — 대조군이 «변하지 않아야 할 것»만 보게."""
    if isinstance(node, dict):
        return {k: _strip(v) for k, v in node.items() if k not in VOLATILE}
    if isinstance(node, list):
        return [_strip(x) for x in node]
    return node


def _stable(pair):
    status, text = pair
    try:
        return status, _strip(json.loads(text))
    except json.JSONDecodeError:
        return status, text



def _simulate_active() -> None:
    """🔴 «활성» 갈래의 대조군. 가드가 아직 없으니 서버로는 못 재는 자리를, 상태를 모의해
       코드 경로로 잰다 — 착지 전에 확인할 수 있는 것과 없는 것을 가른다.

    잰다: 쿠키가 붙는가 · `sessionId` «값»만 바뀌는가 · 다른 키는 그대로인가 ·
          제외 라우트에는 그래도 안 붙는가 · 원본 dict 가 오염되지 않는가.
    못 잰다: 서버가 그 쿠키를 실제로 받아들이는가 — 그것은 가드 착지 후 `session_guard_drill` 몫.
    """
    saved = (_STATE.tried, _STATE.active, _STATE.sid, _STATE.cookie)
    try:
        _STATE.tried, _STATE.active = True, True
        _STATE.sid, _STATE.cookie = "SES-SIMULATED", "fkt_session=SIMULATED; Path=/"
        original = {"sessionId": "levi2-label", "mode": "live", "question": "그대로"}
        out, extra = prepare(dict(original), "/api/scenarios/GS-01/runs")
        if extra.get("Cookie") != _STATE.cookie:
            raise RuntimeError("자기 검증 실패 — 활성인데 쿠키를 안 싣는다")
        if out["sessionId"] != "SES-SIMULATED":
            raise RuntimeError("자기 검증 실패 — 활성인데 sessionId 를 안 바꾼다")
        if out["mode"] != original["mode"] or out["question"] != original["question"]:
            raise RuntimeError("자기 검증 실패 — sessionId 밖의 키가 바뀌었다")
        if len(out) != len(original):
            raise RuntimeError("자기 검증 실패 — 키가 늘거나 줄었다")
        for path in EXCLUDED:
            if prepare(None, path)[1] != {}:
                raise RuntimeError(f"자기 검증 실패 — 활성이어도 제외 라우트 {path} 는 맨몸이어야 한다")
        probe = {"sessionId": "keep-me"}
        prepare(probe, "/api/runs/X")
        if probe["sessionId"] != "keep-me":
            raise RuntimeError("자기 검증 실패 — 호출자의 dict 를 제자리에서 오염시킨다")
        print("  활성 대조군  쿠키 부착 · sessionId «값»만 치환 · 타 키 무변 · 제외 라우트 맨몸 ·"
              " 원본 무오염 (🔴 모의 상태 — 서버 수용 여부는 착지 후 판정)")
    finally:
        _STATE.tried, _STATE.active, _STATE.sid, _STATE.cookie = saved


def _fetch(path: str, headers: dict) -> tuple[int, str]:
    req = urllib.request.Request(API_BASE + path, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    print(f"대상      : {API_BASE}")
    print("규율      : 🔴 이 어댑터는 «주장»을 하지 않는다 — 가드 미착지의 초록은 준수 증거가 아니다")
    print()
    self_check()
    print()
    print("결과: 어댑터 자기 검증 통과")
