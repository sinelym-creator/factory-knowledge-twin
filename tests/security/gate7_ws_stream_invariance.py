#!/usr/bin/env python
"""Gate 7 (9) 새 축 — 자극 «중» 이벤트 스트림이 계속 흐르는가 (T5-2F · 검증 좌석)

🔴 왜 이 축인가. `gate7_ws_malformed.py` 는 「자극 뒤 서버가 살아 있는가」를 잰다.
   그것은 프로세스의 생존이지 **그 연결의 스트림**이 살아 있다는 말이 아니다.
   핸들러가 클라이언트 프레임을 읽지 않는다면(수신 호출 0) malformed 프레임은
   «닫힘»도 «오류»도 만들지 않는다 — 그러면 남는 판정 축은 하나다:
   **자극을 맞은 연결이 자극 전과 똑같이 끝까지 이벤트를 받는가.**

🔴 열의 순서 = 자극 먼저, 대조 나중. 대조를 먼저 돌리면 슬롯·캐시를 먹어
   자극 열의 초록이 「대조가 벌어 준 초록」이 된다.

🔴 교정 칸을 같은 실행에 둔다. 「스트림이 계속 흘렀다」는 0 이 정상인 축이 아니라
   **참이기 쉬운 축**이다 — 내 그물이 「끊긴 스트림」을 실제로 빨강으로 만들 수 있는지
   같은 실행에서 심어 본다(CAL = 자극 대신 클라이언트가 소켓을 중간에 닫는 열).
   CAL 이 빨강을 못 내면 A 열의 초록은 검출력이 없다 → exit 2.

🔴 못 잰 것은 이름으로 남긴다. 이 그물은 «서버가 프레임을 읽었는가»를 재지 않는다.
   그것은 코드 축(수신 호출 계수)이 답하고, 여기서는 재지 않는다고 적는다.

사용: python gate7_ws_stream_invariance.py [api_base] [out.json]
"""
import sys, json, asyncio, urllib.request, urllib.error
import websockets

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8020"
WS = API.replace("http://", "ws://").replace("https://", "wss://")
OUT = sys.argv[2] if len(sys.argv) > 2 else None

RECV_TIMEOUT = 20          # 한 이벤트를 기다리는 상한(초)
STIMULUS_AFTER = 3         # 몇 건 받은 뒤 자극을 넣는가


def http(method, path, body=None, cookie=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode() or "{}"
            return r.status, json.loads(raw), r.headers.get("set-cookie")
    except urllib.error.HTTPError as e:
        return e.code, {}, None


def alive():
    try:
        s, _, _ = http("GET", "/api/health")
        return s == 200
    except Exception:
        return False


def new_run(cookie, session_id):
    st, run, _ = http("POST", "/api/scenarios/GS-01/runs",
                      {"sessionId": session_id, "mode": "replay"}, cookie)
    return st, run


async def stream(run_id, cookie, mode):
    """한 열 = WS 연결 1본.

    mode: "plain" 자극 없음 · "malformed" 자극 4종 · "cut" 교정(클라이언트가 끊는다)
    반환: 받은 이벤트 seq 목록 · 자극 전/후 계수 · 종료 사유.
    """
    url = "%s/api/ws/runs/%s" % (WS, run_id)
    seqs, pre, post = [], 0, 0
    stimulated = False
    reason = "closed"
    err = None
    try:
        async with websockets.connect(url, additional_headers={"Cookie": cookie},
                                      open_timeout=15, close_timeout=5,
                                      max_size=None) as ws:
            while True:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT)
                except asyncio.TimeoutError:
                    reason = "recv_timeout"
                    break
                except websockets.ConnectionClosed as e:
                    reason = "server_closed_%s" % e.code
                    break
                ev = json.loads(msg)
                seqs.append(ev.get("seq"))
                if stimulated:
                    post += 1
                else:
                    pre += 1

                if not stimulated and len(seqs) >= STIMULUS_AFTER:
                    stimulated = True
                    if mode == "malformed":
                        # (a) 비JSON · (b) 스키마 위반 · (c) oversized 2MB · (d) 바이너리
                        await ws.send("not-json{{{")
                        await ws.send(json.dumps({"type": "nope", "seq": "x"}))
                        await ws.send("x" * (2 * 1024 * 1024))
                        await ws.send(b"\x00\x01\x02\xff")
                    elif mode == "cut":
                        # 교정 칸 — 「끊긴 스트림」을 이 그물이 실제로 빨강으로 만드는가
                        await ws.close(code=1000)
                        reason = "client_cut"
                        break
    except websockets.ConnectionClosed as e:
        reason = "server_closed_%s" % e.code
    except Exception as e:
        err = "%s: %s" % (type(e).__name__, e)
        reason = "error"

    return {
        "mode": mode, "runId": run_id, "events": len(seqs),
        "pre": pre, "post": post, "stimulated": stimulated,
        "maxSeq": max([s for s in seqs if isinstance(s, int)], default=None),
        "gaps": gaps(seqs), "reason": reason, "err": err,
        "serverAlive": alive(),
    }


def gaps(seqs):
    """seq 가 0.. 로 빠짐없이 이어졌는가 — 「조용히 몇 개 빠진 스트림」을 잡는 축."""
    ints = [s for s in seqs if isinstance(s, int)]
    if not ints:
        return None
    return sorted(set(range(min(ints), max(ints) + 1)) - set(ints))


def line(r):
    print("  %-10s events=%-4s pre=%-3s post=%-4s maxSeq=%-4s gaps=%-6s reason=%-18s alive=%s"
          % (r["mode"], r["events"], r["pre"], r["post"], r["maxSeq"],
             len(r["gaps"]) if r["gaps"] is not None else "-", r["reason"], r["serverAlive"]))


async def main():
    print("[net] gate7 (9) WS stream invariance · api=" + API)

    # 전제 — 무대가 서 있는가. 「무대 없음」은 FAIL 이 아니라 exit 2.
    if not alive():
        print("[stage] EXIT2 — %s /api/health 가 200 이 아니다(무대 없음)." % API)
        return 2
    st, ses, cookie_hdr = http("POST", "/api/sessions", {})
    if st != 200:
        print("[stage] EXIT2 — 세션 생성 실패 %s" % st)
        return 2
    cookie = (cookie_hdr or "").split(";")[0]
    sid = ses["sessionId"]
    print("[stage] session=%s · build=%s" % (sid[:8], http("GET", "/api/health")[1].get("build")))

    rows = []

    # 1) 자극 열 먼저 — malformed 4종을 스트림 «중간»에 넣는다
    st, run = new_run(cookie, sid)
    if st != 200:
        print("[stage] EXIT2 — replay run 생성 실패 %s" % st)
        return 2
    a = await stream(run["runId"], cookie, "malformed")
    line(a); rows.append(a)

    # 2) 교정 칸 — 같은 실행에서 「끊긴 스트림」이 빨강으로 보이는가
    st, run = new_run(cookie, sid)
    if st != 200:
        print("[stage] EXIT2 — replay run 생성 실패(CAL) %s" % st)
        return 2
    c = await stream(run["runId"], cookie, "cut")
    line(c); rows.append(c)

    # 3) 대조 열 나중 — 자극 없는 같은 시나리오
    st, run = new_run(cookie, sid)
    if st != 200:
        print("[stage] EXIT2 — replay run 생성 실패(control) %s" % st)
        return 2
    b = await stream(run["runId"], cookie, "plain")
    line(b); rows.append(b)

    # --- 판정 ---
    cal_red = c["events"] < b["events"] and c["reason"] == "client_cut"
    print("[cal] 끊긴 스트림이 빨강으로 보이는가 = %s (cut %s < plain %s)"
          % (cal_red, c["events"], b["events"]))
    if not cal_red:
        print("[cal] EXIT2 — 교정 칸이 안 섰다. A 열의 초록은 검출력이 없다.")
        return 2
    if b["events"] == 0:
        print("[control] EXIT2 — 대조 열이 0건. 이 창은 판정력 0.")
        return 2

    same_total = a["events"] == b["events"]
    no_gap = not a["gaps"] and not b["gaps"]
    flowed_after = a["post"] > 0
    verdict = same_total and no_gap and flowed_after and a["serverAlive"]

    print("[verdict] stream_invariant=%s (총계 %s==%s · 자극 후 수신 %s건 · gap %s · alive %s)"
          % (verdict, a["events"], b["events"], a["post"],
             len(a["gaps"] or []), a["serverAlive"]))
    print("[not-measured] 서버가 그 프레임을 '읽었는가' 는 이 그물이 재지 않는다(코드 축 소관).")

    if OUT:
        json.dump({"api": API, "rows": rows,
                   "calRed": cal_red, "streamInvariant": verdict},
                  open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0 if verdict else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
