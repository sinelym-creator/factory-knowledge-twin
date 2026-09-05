#!/usr/bin/env python
"""Gate 7 (9) — malformed WebSocket 프레임 그물 (T5-2b · 검증 좌석)

🔴 판정의 반쪽은 «서버 생존»이다. 자극마다 직후 HTTP `/api/health` 를 쳐서
   「연결이 닫혔다」와 「서버가 죽었다」를 가른다 — 안 가르면 둘 다 같은 모양이다.
🔴 대조군 = 같은 실행의 «정상 WS 세션 1회». 그것이 안 서면 이 창의 어떤 close 도
   자극의 답이 아니라 내 클라이언트·소유권의 답일 수 있다.
🔴 실행 모델 실측: `investigations.py` 의 WS 핸들러는 **보내기만 한다**(수신 호출 0).
   그래서 「malformed 프레임에 서버가 응답한다」가 성립하지 않을 수 있다 —
   그때는 초록도 빨강도 아니고 **불성립**이라고 적는다(못 잰 것과 다르다).
"""
import sys, json, asyncio, time, urllib.request, urllib.error
import websockets

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8020"
WS = API.replace("http://", "ws://").replace("https://", "wss://")


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


async def one(label, runId, cookie, action, expect_note):
    """자극 1건 — (close code, 예외, 서버 생존)"""
    url = "%s/api/ws/runs/%s" % (WS, runId)
    code, err = None, None
    try:
        async with websockets.connect(url, additional_headers={"Cookie": cookie},
                                      open_timeout=10, close_timeout=5) as ws:
            await action(ws)
            try:
                await asyncio.wait_for(ws.recv(), timeout=3)
            except asyncio.TimeoutError:
                pass
            except websockets.ConnectionClosed as e:
                code = e.code
    except websockets.ConnectionClosed as e:
        code = e.code
    except Exception as e:
        err = "%s: %s" % (type(e).__name__, e)
    up = alive()
    print("  %-34s close=%-6s err=%-42s server_alive=%s   %s"
          % (label, code, (err or "-")[:42], up, expect_note))
    return {"label": label, "close": code, "err": err, "alive": up}


async def main():
    print("[net] gate7 malformed WS · api=" + API)
    st, ses, cookie_hdr = http("POST", "/api/sessions", {})
    if st != 200:
        print("[control] EXIT2 — 세션 생성 실패 %s" % st); return 2
    cookie = (cookie_hdr or "").split(";")[0]
    st, run, _ = http("POST", "/api/scenarios/GS-01/runs",
                      {"sessionId": ses["sessionId"], "mode": "replay"}, cookie)
    if st != 200:
        print("[control] EXIT2 — replay run 생성 실패 %s" % st); return 2
    runId = run["runId"]
    print("[setup] session=%s run=%s mode=%s" % (ses["sessionId"][:8], runId, run.get("mode")))

    # 대조군 1 — 정상 세션이 실제로 이벤트를 받는가
    got = {"n": 0}
    async def normal(ws):
        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=3)
                json.loads(msg); got["n"] += 1
        except Exception:
            pass
    ctl = await one("[control] 정상 WS 세션", runId, cookie, normal, "이벤트 %d건" % 0)
    print("  [control] 수신 이벤트 = %d건 (0 이면 이 창은 판정력 0)" % got["n"])
    if got["n"] == 0 or not ctl["alive"]:
        print("[control] EXIT2 — 정상 세션이 안 섰다."); return 2

    results = [{"label": "control-normal", "events": got["n"], "alive": ctl["alive"]}]
    big = "x" * (2 * 1024 * 1024)
    cases = [
        ("(a) 비JSON 텍스트", lambda ws: ws.send("not-json{{{"), "기대: 무시 또는 닫힘 · 서버 생존"),
        ("(b) 스키마 위반 JSON", lambda ws: ws.send(json.dumps({"type": "nope", "seq": "x"})), "동일"),
        ("(c) oversized 2MB 프레임", lambda ws: ws.send(big), "기대: 닫힘(1009류) 또는 무시"),
        ("(d) 바이너리 프레임", lambda ws: ws.send(b"\x00\x01\x02\xff"), "동일"),
    ]
    for label, act, note in cases:
        results.append(await one(label, runId, cookie, act, note))

    # (e) 잘못된 대상 — 정의된 close 경로가 실제로 도는가
    r = await one("(e) 없는 runId", "RUN-000000000000", cookie,
                  lambda ws: asyncio.sleep(0), "기대: 정의된 close code")
    results.append(r)

    print("[result] server_alive_all=%s" % all(x.get("alive") for x in results))
    if len(sys.argv) > 2:
        json.dump({"api": API, "runId": runId, "controlEvents": got["n"], "cases": results},
                  open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0 if all(x.get("alive") for x in results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
