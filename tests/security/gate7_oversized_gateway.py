"""gate7_oversized_gateway — synthesis-gateway 의 요청 본문 상한(413) (검증 좌석 · T5-2c 조각 a · §32.8 ⑦-B).

🔴 **무엇을 재는가 — 그리고 무엇을 «안» 재는가.**
   ⑦ oversized 의 «공개 표면»은 ai-api `:8020` 이고 그 축은 `tests/api/t42b_limits_drill.py`
   B-01~B-03 이 이미 잰다(16대 PASS · 이 조각에서 재실측). 이 그물은 t42b 가 «닿지 않는»
   자리 하나 — **게이트웨이 `:8797`(내부 릴레이 · loopback + 토큰)의 413** 만 잰다.

🔴 **두 층은 방어가 다르다(코드 실측 E1).**
   ai-api  : `BodyLimitMiddleware` — Content-Length 선검사 **+ 스트림 실측 둘 다**(64KB).
   gateway : `gateway.py:544-549` — Content-Length 선검사 «만»(1MiB) · 뒤이어
             `body = self.rfile.read(length)` 로 **선언한 만큼만** 읽는다(스트림 실측 없음).
   ⇒ 「거짓으로 작게 선언한 CL」 자극은 게이트웨이에서 413 도 우회도 아닌 **제3의 거동**이다.
   그 행은 «불성립»으로 인쇄한다 — 없는 방어를 재서 빨강을 만들지 않는다.

🔴 **구독을 태우지 않는다.** 유효 토큰 + 상한 «안» 자극(O-5)은 크기 게이트를 통과한 뒤
   `_validate_request`·`synthesize` 로 내려가 claude CLI 를 부를 수 있다. 그래서 O-5 는
   **일부러 깨진 JSON** 을 보내 크기·토큰 게이트를 지난 «직후»(`json.loads` 400)에서 멈춘다 —
   합성까지 가지 않는다. 게이트웨이도 `SYNTHESIS_CLI_BIN` 을 없는 이름으로 띄워 이중으로 막는다.

🔴 **토큰 값을 인쇄하지 않는다.** `FKT_GW_TOKEN` 으로 받되 출력 어디에도 값을 싣지 않는다.

env:
    FKT_GW_BASE     게이트웨이 base(예: http://127.0.0.1:8853) — 미지정이면 측정 불가(exit 2)
    FKT_GW_TOKEN    게이트웨이 토큰(값은 인쇄 0) — 미지정이면 «토큰 없는 서버»로 간주

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import http.client
import json
import os
import socket
import sys
import urllib.parse

BASE = os.environ.get("FKT_GW_BASE", "").strip()
TOKEN = os.environ.get("FKT_GW_TOKEN", "").strip()
TOKEN_HEADER = "X-FKT-Gateway-Token"
# gateway.py:125 MAX_BODY_BYTES = 1 MiB — 정본이 이 상수다(옮겨 적되 출처를 남긴다).
MAX_BODY_BYTES = 1 * 1024 * 1024


class Unmeasurable(RuntimeError):
    """대상이 서 있지 않거나 그물이 못 잰다 — 결과가 아니라 «측정 불가»다(exit 2)."""


def _hit(method: str, path: str, body: bytes | None, token: str | None):
    """한 번 두드리고 status·rejectedReason 을 돌려준다(honest Content-Length)."""
    url = urllib.parse.urlparse(BASE + path)
    conn = http.client.HTTPConnection(url.hostname, url.port, timeout=20)
    headers = {"Content-Type": "application/json"}
    if token:
        headers[TOKEN_HEADER] = token
    try:
        conn.request(method, url.path or "/", body=body, headers=headers)
        res = conn.getresponse()
        raw = res.read().decode("utf-8", "replace")
        status = res.status
    except (OSError, http.client.HTTPException) as exc:
        raise Unmeasurable(f"{BASE}{path} 에 닿지 못했다: {type(exc).__name__}: {exc}") from exc
    finally:
        conn.close()
    reason = None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            reason = parsed.get("rejectedReason")
    except json.JSONDecodeError:
        reason = None
    return {"status": status, "reason": reason}


def _hit_lied_cl(declared: int, actual_body: bytes, token: str | None):
    """🔴 raw socket — Content-Length 를 «거짓으로 작게» 선언하고 크게 보낸다.

    http.client 는 CL 을 본문 길이로 «정직하게» 계산하므로 거짓말을 못 한다. 여기서만 소켓을
    직접 쥔다. 게이트웨이가 `rfile.read(declared)` 로 «선언한 만큼만» 읽는지를 이 자극이 가른다.
    """
    url = urllib.parse.urlparse(BASE)
    s = socket.create_connection((url.hostname, url.port), timeout=20)
    try:
        head = (
            f"POST /synthesize HTTP/1.1\r\n"
            f"Host: {url.hostname}:{url.port}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {declared}\r\n"
        )
        if token:
            head += f"{TOKEN_HEADER}: {token}\r\n"
        head += "Connection: close\r\n\r\n"
        s.sendall(head.encode("latin-1"))
        try:
            s.sendall(actual_body)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass  # 서버가 declared 만 읽고 끊는 것도 «관측»이다
        s.settimeout(20)
        chunks = []
        try:
            while True:
                b = s.recv(4096)
                if not b:
                    break
                chunks.append(b)
        except (OSError, socket.timeout):
            pass
    finally:
        s.close()
    raw = b"".join(chunks).decode("utf-8", "replace")
    status = None
    first = raw.split("\r\n", 1)[0]
    parts = first.split(" ")
    if len(parts) >= 2 and parts[1].isdigit():
        status = int(parts[1])
    return {"status": status, "raw_head": first, "declared": declared, "sent": len(actual_body)}


class Report:
    def __init__(self) -> None:
        self.bad = 0

    def row(self, rid: str, name: str, ok: bool, detail: str) -> None:
        self.bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid:6} {name:46} {detail}")

    def note(self, rid: str, name: str, detail: str) -> None:
        print(f"  ----  {rid:6} {name:46} {detail}  (불성립/미측 · 초록 아님)")


def self_check(rep: Report) -> None:
    """🔴 토큰 게이트가 «실제로» 닫히는가 — 판정 앞에 계측기 생존을 먼저 세운다.

    양면: 무토큰·오토큰은 401(막힘) · 유효 토큰은 401 «아님»(열림). 한쪽만 서면 «전부 거절하는
    문»도 초록이 된다(16대 유언 · 문은 양면으로 시험한다).
    """
    if not TOKEN:
        raise Unmeasurable("FKT_GW_TOKEN 미지정 — 토큰 게이트 양면 시험 불가(유효쪽을 못 만든다)")
    no = _hit("GET", "/health", None, None)
    bad = _hit("GET", "/health", None, "wrong-token-not-mine")
    good = _hit("GET", "/health", None, TOKEN)
    ok = no["status"] == 401 and bad["status"] == 401 and good["status"] == 200
    if not ok:
        raise Unmeasurable(
            f"토큰 게이트 자기검증 실패 — 무토큰 {no['status']} · 오토큰 {bad['status']} · 유효 {good['status']}"
            " (401/401/200 이어야 계측기가 살아 있다)"
        )
    rep.row("GW-00", "계측기 생존 — 토큰 게이트 양면(무·오=401 · 유효=200)", True,
            f"{no['status']}/{bad['status']}/{good['status']}")


def main() -> int:
    if not BASE:
        print("🔴 측정 불가 — FKT_GW_BASE 를 명시하라(게이트웨이 base).")
        return 2
    rep = Report()
    print(f"대상   : 게이트웨이 {BASE} · 상한 {MAX_BODY_BYTES}B(gateway.py:125) · 토큰값 인쇄 0")
    print("정본   : services/synthesis-gateway/gateway.py:544-549(413 · CL 선검사만)")
    print()
    self_check(rep)
    print()

    # ── O-5 대조군 — 상한 «안» + 유효 토큰 = 413 «아님»(크기 게이트 통과) ──────────────
    #    🔴 깨진 JSON 으로 보내 크기·토큰 게이트 «직후»에 멈춘다(합성 미도달 · 구독 0).
    small = b'{ this is deliberately broken json, well under 1 MiB '
    o5 = _hit("POST", "/synthesize", small, TOKEN)
    rep.row("O-5", "대조군 — 상한 «안»(유효 토큰)은 413 이 아니다", o5["status"] not in (413, 401),
            f"{len(small)}B → {o5['status']} (413/401 아니어야 = 크기·토큰 게이트 통과)")

    # ── O-6 — 상한 «밖» + 유효 토큰 = 413(본문 읽기 «전» CL 선검사) ────────────────────
    big = b"a" * (MAX_BODY_BYTES + 4096)
    o6 = _hit("POST", "/synthesize", big, TOKEN)
    rep.row("O-6", "상한 «밖»은 413(CL 선검사 · 본문 미판독)", o6["status"] == 413,
            f"{len(big)}B → {o6['status']} rejectedReason={'있음' if o6['reason'] else '없음'}")

    # ── O-4gw — 🔴 거짓 축소 CL = «불성립»(게이트웨이엔 스트림 실측이 없다) ───────────────
    #    선언 20B · 실제 8KB 를 보낸다. 게이트웨이는 declared(20)만 읽으므로:
    #      · 413 이 아니다(20 <= 1MiB) · 우회도 아니다(전체를 정상 본문으로 처리하지 않는다)
    #    → 제3의 거동. 방어의 «부재»를 재는 자리라 색을 내지 않고 불성립으로 인쇄한다.
    lied = _hit_lied_cl(20, b"x" * 8192, TOKEN)
    processed_full = lied["status"] == 200
    rep.note("O-4gw", "거짓 축소 CL — 게이트웨이 스트림 실측 부재",
             f"선언 {lied['declared']}B · 전송 {lied['sent']}B → {lied['status']} "
             f"({lied['raw_head']!r}) · 전체 정상처리={'예(우회!)' if processed_full else '아니오'}")
    if processed_full:
        # 만에 하나 전체를 정상 처리했다면 그건 «불성립»이 아니라 진짜 우회다 — 빨강으로 올린다.
        rep.bad += 1
        print("  🔴 FAIL  O-4gw — 거짓 CL 로 상한 우회가 «실제로» 성립했다(회부)")

    print(f"\n결과: 어긋남 {rep.bad}건 (O-4gw = 불성립 · 계수 밖)")
    return 1 if rep.bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Unmeasurable as exc:
        print(f"\n🔴 측정 불가 — {exc}")
        sys.exit(2)
