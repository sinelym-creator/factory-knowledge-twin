"""t42b_limits_drill — T4-2b ③④ «요청 축» 보호장치 (검증 좌석 · 16대).

무엇을 재는가 — 계약 `packages/contracts/rest-api-v0.1.md` v0.1.9 append 의 «형상»만:

    :143  429 `rate_limited` — 축 2개 «각각»(IP · 익명 세션) · 초과 = «즉시» · `Retry-After: 정수 초`
          제외 4종 = `GET /api/health` · `GET /api/live/status` · `OPTIONS` · WS 핸드셰이크
          XFF = env 로 켤 때만 신뢰(기본 = 소켓 주소)
    :144  413 `payload_too_large` — 본문 바이트 상한 · Content-Length 선검사 **+ 스트림 실측 둘 다**
    :145  422 `question_too_long` — 질문 문자 상한 · 검사 위치 = allowlist 대조 **앞** · 겹치면 413 이 먼저

🔴 **축을 각각 재려면 손잡이도 각각이어야 한다.** 한 서버에서 값을 갈아 끼우면 「무엇이 그 색을
   냈는가」를 못 가른다. 그래서 서버를 **축별로** 세우고 각 서버는 손잡이 «하나»만 낮춘다:

    FKT_T42B_SESSION_BASE   세션 축만 낮춘 서버(IP 는 넉넉)   — 세션 축이 «혼자» 우는지
    FKT_T42B_IP_BASE        IP 축만 낮춘 서버(세션은 넉넉)    — IP 축이 «혼자» 우는지
    FKT_API_BASE            기본값 서버                        — 413·422 경계(상한이 계약 기본)

🔴 **부정 판정식 앞에 세는 눈.** 「제외 4종은 429 가 아니다」는 「내가 429 를 못 만든다」와
   구별되지 않는다. 그래서 제외를 재기 «전»에 **같은 서버에서 429 를 실제로 받아 낸다**.

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ownership  # noqa: E402  — 🔴 Q-62 2단 안전장치(남의 좌석 무접촉)
import _colocation  # noqa: E402  — 🔴 판정 앞의 귀속 증명

#: 🔴 **Q-62 — 좌석 포트를 기본값으로 두지 않는다.** 예전엔 여기 내 실물 포트가 박혀 있었고,
#:   다른 좌석이 확인 없이 돌려 «내 계측기»를 두드렸다(창 소모 · 값 오염). 미지정 = exit 2.
BASE = _ownership.read_base("FKT_API_BASE", "기본값 서버(413·422 경계)")
SESSION_BASE = _ownership.read_base("FKT_T42B_SESSION_BASE", "세션 축 서버")
IP_BASE = _ownership.read_base("FKT_T42B_IP_BASE", "IP 축 서버")
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")

MAX_BODY = int(os.environ.get("FKT_T42B_MAX_BODY", "65536"))
MAX_QUESTION = int(os.environ.get("FKT_T42B_MAX_QUESTION", "500"))


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def hit(base: str, method: str, path: str, body: dict | None = None,
        cookie: str | None = None, raw: bytes | None = None, chunked: bool = False,
        xff: str | None = None):
    """한 번 두드리고 «상태 · error.code · Retry-After · Set-Cookie» 를 그대로 돌려준다."""
    url = urllib.parse.urlparse(base + path)
    conn = http.client.HTTPConnection(url.hostname, url.port, timeout=30)
    payload: object
    headers: dict[str, str] = {}
    if raw is not None:
        payload = raw
        headers["Content-Type"] = "application/json"
    elif body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    else:
        payload = None
    if cookie:
        headers["Cookie"] = cookie
    if xff:
        headers["X-Forwarded-For"] = xff
    if chunked and payload is not None:
        # 🔴 Content-Length 를 «주지 않는» 갈래 — 계약이 「선검사 + 스트림 실측 둘 다」라 했으므로
        #    길이를 안 알려 주고도 막히는지가 그 절반이다.
        headers["Transfer-Encoding"] = "chunked"
        blob = payload if isinstance(payload, bytes) else b""
        conn.putrequest(method, url.path or "/", skip_accept_encoding=True)
        for k, v in headers.items():
            conn.putheader(k, v)
        conn.endheaders()
        step = 8192
        try:
            for i in range(0, len(blob), step):
                part = blob[i:i + step]
                conn.send(b"%x\r\n%s\r\n" % (len(part), part))
            conn.send(b"0\r\n\r\n")
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass  # 서버가 중간에 끊는 것도 «막았다»의 한 형태다 — 응답을 읽어 본다
    else:
        try:
            conn.request(method, url.path or "/", body=payload, headers=headers)
        except (BrokenPipeError, ConnectionResetError, OSError) as exc:
            raise DrillError(f"요청을 보내지 못했다: {exc}") from exc
    try:
        res = conn.getresponse()
        text = res.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 — 끊긴 것도 «관측»이다
        conn.close()
        return {"status": None, "code": None, "retry_after": None, "cookie": None, "why": str(exc)[:80]}
    code = None
    try:
        parsed = json.loads(text)
        # 🔴 성공 응답은 목록일 수도 있다(`/api/scenarios`). dict 가 아니면 error.code 는 «없음»이다 —
        #    여기서 예외가 나면 그 빨강은 대상의 것이 아니라 내 파서의 것이다(한 번 물렸다).
        if isinstance(parsed, dict):
            err = parsed.get("error")
            code = err.get("code") if isinstance(err, dict) else None
    except json.JSONDecodeError:
        code = None
    out = {
        "status": res.status,
        "code": code,
        "retry_after": res.getheader("Retry-After"),
        "cookie": res.getheader("Set-Cookie"),
        "why": None,
    }
    conn.close()
    return out


def new_session(base: str) -> tuple[str, str]:
    """(쿠키 헤더, sessionId) — 🔴 본문 `sessionId` 는 «쿠키와 같아야» 한다(v0.1.6).
    지어낸 값을 넣으면 길이·크기 검사에 닿기 «전»에 422 invalid_request 로 튕기고,
    그 빨강은 대상의 것이 아니다. 나는 여기서 한 번 물렸다."""
    r = hit(base, "POST", "/api/sessions")
    if r["status"] != 200 or not r["cookie"]:
        raise DrillError(f"세션을 못 받았다 — {r['status']} {r['code']}")
    cookie = r["cookie"].split(";", 1)[0]
    sid = cookie.split("=", 1)[1] if "=" in cookie else ""
    if not sid:
        raise DrillError("쿠키에서 sessionId 를 못 꺼냈다")
    return cookie, sid


def self_check() -> None:
    """🔴 판정자가 «429» 와 «정수 Retry-After» 를 실제로 가르는가."""
    samples = [
        ({"status": 429, "code": "rate_limited", "retry_after": "7"}, True),
        ({"status": 429, "code": "rate_limited", "retry_after": None}, False),   # 헤더 없음
        ({"status": 429, "code": "rate_limited", "retry_after": "7.5"}, False),  # 정수 아님
        ({"status": 200, "code": None, "retry_after": None}, False),             # 429 아님
    ]
    for sample, want in samples:
        got = sample["status"] == 429 and sample["code"] == "rate_limited" and is_int(sample["retry_after"])
        if got is not want:
            raise DrillError(f"자기 검증 실패 — {sample} 을 {got} 로 판정한다")
    print("  자기 검증  표본 4종(정상 1 · 헤더 없음 · 소수 · 429 아님) 전건 기대대로 — 판정자 살아 있음")


def is_int(value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        int(value)
    except ValueError:
        return False
    return True


class Report:
    def __init__(self) -> None:
        self.bad = 0

    def row(self, rid: str, name: str, ok: bool, detail: str) -> None:
        self.bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid:6} {name:44} {detail}")

    def note(self, text: str) -> None:
        print(f"  🔵 관측  {text}")


def burst(base: str, n: int, cookie: str | None) -> list[dict]:
    """같은 문을 n 번 두드린다. «즉시» 인지 보려고 각 응답의 소요도 잰다."""
    out = []
    for _ in range(n):
        t0 = time.monotonic()
        r = hit(base, "GET", "/api/scenarios", cookie=cookie)
        r["ms"] = int((time.monotonic() - t0) * 1000)
        out.append(r)
    return out


def main() -> int:
    rep = Report()
    print(f"대상      : 기본값 {BASE} · 세션축 {SESSION_BASE} · IP축 {IP_BASE}")
    print(f"상한      : 본문 {MAX_BODY}B · 질문 {MAX_QUESTION}자 (계약 기본값)")
    print("정본      : rest-api-v0.1.md :143(429) · :144(413) · :145(422)")
    print()
    self_check()
    _colocation.require(BASE)
    print()

    # ── ③ 429 — 세션 축이 «혼자» 운다 ────────────────────────────────────
    s1, _sid1 = new_session(SESSION_BASE)
    r1 = burst(SESSION_BASE, 6, s1)
    first_ok = [r for r in r1 if r["status"] != 429]
    limited = [r for r in r1 if r["status"] == 429]
    rep.row("R-01", "세션 축 — 세는 눈(429 «전»에 통과가 있다)", bool(first_ok),
            f"통과 {len(first_ok)}건 · 429 {len(limited)}건")
    rep.row("R-02", "세션 축 — 초과가 429 rate_limited", bool(limited) and all(r["code"] == "rate_limited" for r in limited),
            f"코드 {sorted({r['code'] for r in limited})}")
    rep.row("R-03", "세션 축 — Retry-After 가 «정수 초»", bool(limited) and all(is_int(r["retry_after"]) for r in limited),
            f"값 {sorted({r['retry_after'] for r in limited})}")
    rep.row("R-04", "세션 축 — 초과는 «즉시»(서버 대기 0)", bool(limited) and max(r["ms"] for r in limited) < 1000,
            f"429 응답 최대 {max((r['ms'] for r in limited), default=-1)}ms")

    # 🔴 축 «분리» — 새 세션은 앞 세션의 빚을 지지 않는다(같은 IP · 같은 서버)
    s2, _sid2 = new_session(SESSION_BASE)
    r2 = hit(SESSION_BASE, "GET", "/api/scenarios", cookie=s2)
    rep.row("R-05", "세션 축 — 다른 세션은 «따로» 센다", r2["status"] != 429,
            f"새 세션 첫 요청 {r2['status']}")

    # ── ③ 429 — IP 축이 «혼자» 운다(쿠키 없이) ──────────────────────────
    r3 = burst(IP_BASE, 8, None)
    ip_ok = [r for r in r3 if r["status"] != 429]
    ip_lim = [r for r in r3 if r["status"] == 429]
    rep.row("R-06", "IP 축 — 세는 눈(429 «전»에 통과가 있다)", bool(ip_ok), f"통과 {len(ip_ok)}건 · 429 {len(ip_lim)}건")
    rep.row("R-07", "IP 축 — 무쿠키 요청이 IP 축으로 잡힌다", bool(ip_lim) and all(r["code"] == "rate_limited" for r in ip_lim),
            f"코드 {sorted({r['code'] for r in ip_lim})} · RA {sorted({r['retry_after'] for r in ip_lim})}")

    # ── ③ 제외 4종 — 🔴 위에서 «이미» 429 를 받아 낸 서버에서 잰다 ──────
    if not ip_lim:
        print("  ----  R-08 제외 4종 — 건너뜀(IP 축을 아직 못 채웠다). 🔴 초록으로 세지 않는다")
        rep.bad += 1
    else:
        excl = {
            "GET /api/health": hit(IP_BASE, "GET", "/api/health"),
            "GET /api/live/status": hit(IP_BASE, "GET", "/api/live/status"),
            "OPTIONS /api/scenarios": hit(IP_BASE, "OPTIONS", "/api/scenarios"),
            "WS handshake /api/ws/runs/x": hit(IP_BASE, "GET", "/api/ws/runs/RUN-none"),
        }
        for name, r in excl.items():
            rep.row("R-08", f"제외 — {name} 는 429 가 아니다", r["status"] != 429, f"{r['status']} {r['code'] or ''}")

    # ── ③ XFF — 기본은 «안 믿는다» ──────────────────────────────────────
    # 🔴 앞판은 한 쪽을 http.client, 다른 쪽을 urllib 로 쳤다 — 클라이언트와 헤더 두 변수를
    #    한 판에 섞었고, 갈린 값이 무엇 때문인지 못 갈랐다. 같은 함수로 헤더«만» 바꾼다.
    plain = hit(IP_BASE, "GET", "/api/scenarios")
    spoofed = hit(IP_BASE, "GET", "/api/scenarios", xff="203.0.113.7")
    same = plain["status"] == spoofed["status"]
    rep.row("R-09", "XFF — 기본 미신뢰(지어낸 IP 로 우회 못 한다)", same and plain["status"] == 429,
            f"헤더 없음 {plain['status']} · XFF 위조 {spoofed['status']} (갈리면 = 헤더를 믿는 것)")
    if not same:
        # 🔴 **이 빨강의 주어는 앱이 아니다.** `protection.py:76` 은 `if trust_forwarded_for:`
        #    안에서만 XFF 를 읽는다 — 코드는 계약대로다. 실측으로 가른 진범은 **러너**다:
        #      · `FKT_TRUST_FORWARDED_FOR` true ↔ false 두 서버가 «완전히 같은» 거동(손잡이 무효)
        #      · 같은 앱을 `uvicorn --no-proxy-headers` 로 띄우면 위조 XFF 가 «전건 429» 로 막힌다
        #    ⇒ uvicorn ProxyHeadersMiddleware(기본 켬)가 앱보다 «먼저» scope.client 를 바꾼다.
        #    🔴 범위 미측정: uvicorn 은 `forwarded_allow_ips`(기본 127.0.0.1) 안의 상대에게만
        #       재작성한다. 컨테이너(`--host 0.0.0.0`) 경로는 재지 않았다 — 「안 걸린다」고 적지 마라.
        rep.note("이 행이 빨강이면 `--no-proxy-headers` 로 한 번 더 재라 — 앱을 고치기 «전»에 러너부터 가른다")

    # ── ④ 413 — 본문 바이트 상한 ────────────────────────────────────────
    sB, sidB = new_session(BASE)
    small = json.dumps({"sessionId": sidB, "pad": "a" * (MAX_BODY - 200)}, ensure_ascii=False).encode()
    big = json.dumps({"sessionId": sidB, "pad": "a" * (MAX_BODY + 1000)}, ensure_ascii=False).encode()
    b_ok = hit(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", raw=small, cookie=sB)
    b_no = hit(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", raw=big, cookie=sB)
    rep.row("B-01", "413 — 세는 눈(상한 «안»은 413 이 아니다)", b_ok["status"] != 413,
            f"{len(small)}B → {b_ok['status']} {b_ok['code'] or ''}")
    rep.row("B-02", "413 — 상한 «밖»은 payload_too_large", b_no["status"] == 413 and b_no["code"] == "payload_too_large",
            f"{len(big)}B → {b_no['status']} {b_no['code']}")

    # 🔴 Content-Length 를 «주지 않는» 갈래 — 계약이 「선검사 + 스트림 실측 둘 다」라 했다
    b_chunk = hit(BASE, "POST", f"/api/scenarios/{SCENARIO}/runs", raw=big, cookie=sB, chunked=True)
    rep.row("B-03", "413 — chunked(무 Content-Length)도 막는다", b_chunk["status"] in (413, None) or b_chunk["code"] == "payload_too_large",
            f"→ {b_chunk['status']} {b_chunk['code'] or b_chunk['why'] or ''}")

    # ── ④ 422 — 질문 문자 상한 · allowlist «앞» ─────────────────────────
    q_ok = "가" * MAX_QUESTION
    q_no = "가" * (MAX_QUESTION + 1)
    a_ok = hit(BASE, "POST", "/api/retrieval/compare", {"sessionId": sidB, "question": q_ok, "strategies": ["vector"]}, cookie=sB)
    a_no = hit(BASE, "POST", "/api/retrieval/compare", {"sessionId": sidB, "question": q_no, "strategies": ["vector"]}, cookie=sB)
    rep.row("Q-01", "422 — 세는 눈(상한 «안»은 question_too_long 이 아니다)", a_ok["code"] != "question_too_long",
            f"{MAX_QUESTION}자 → {a_ok['status']} {a_ok['code'] or ''}")
    rep.row("Q-02", "422 — 상한 «밖»은 question_too_long", a_no["status"] == 422 and a_no["code"] == "question_too_long",
            f"{MAX_QUESTION + 1}자 → {a_no['status']} {a_no['code']}")
    # 🔴 검사 «위치» — 승인 목록 밖 질문이라도 «길이»가 먼저 운다(allowlist 앞)
    rep.row("Q-03", "422 — 검사 위치가 allowlist «앞»", a_no["code"] == "question_too_long",
            f"승인 목록 밖 긴 질문 → {a_no['code']} (question_not_approved 면 순서가 뒤다)")

    # ── ④ 겹침 — 바이트와 문자가 «둘 다» 넘으면 413 이 먼저 ─────────────
    both = json.dumps({"sessionId": sidB, "question": "가" * (MAX_BODY // 2), "strategies": ["vector"]},
                      ensure_ascii=False).encode()
    o = hit(BASE, "POST", "/api/retrieval/compare", raw=both, cookie=sB)
    rep.row("O-01", "겹침 — 둘 다 넘으면 413 이 먼저", o["status"] == 413 and o["code"] == "payload_too_large",
            f"{len(both)}B · 질문 {MAX_BODY // 2}자 → {o['status']} {o['code']}")

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
