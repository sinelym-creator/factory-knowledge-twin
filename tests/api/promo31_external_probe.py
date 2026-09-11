#!/usr/bin/env python3
"""승격 31 외부 재검 탐침 — 공개면을 **밖에서** 치고, 같은 칸을 前後 두 번 찍는다.

🔴 **production 은 읽기만**이다. 유일한 쓰기성 행위는 ④의 **replay run 1건**이고, 그 경로는
   구독을 쓰지 않는다(재생은 기록 재생이다). live run 은 **부르지 않는다**.

🔴 **「밖」의 근거는 URL 이 아니라 연결 IP 다.** 공개 도메인을 쳤어도 tailnet self 로 붙으면
   그것은 밖이 아니다 — 그래서 매 요청의 `remote_ip` 를 값으로 남긴다.

축(발주 PROMO31-X):
  ① `/api/health.build` — 前 `4225b4f` → 後 main sha. **이번 승격은 ai-api 재생성을 포함**하므로
     이 표지가 유효하다(승격 30 에서는 서버가 대상이 아니라 「못 쓰는 표지」였다 — 표지는 창마다 고른다).
  ② `/api/live/status` 형상 + 세션 없는 요청의 baseline(401 인가 200 인가를 **값으로** 남긴다).
  ③ 세션 생성 응답의 `x-fkt-run-cap-*` 헤더 — run 을 만들지 않고 읽는다(구독 0).
  ④ replay run 1건 완주 · `step.completed(synthesize).payload.synthesis` 형상.
     🔴 판정선은 계약 스키마다: `synthesis.required = ["axis"]` 이므로 **`calls` 부재는 유효**하고,
     실렸다면 `0..2` 여야 한다. 「없으면 결함」이 아니라 「있으면 값이 맞아야 한다」.

사용: `python promo31_external_probe.py --label pre|post --out <파일>`
"""

from __future__ import annotations

import sys as _sys

for _stream in (_sys.stdout, _sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass

import argparse
import json
import socket
import ssl
import time
import urllib.error
import urllib.request

BASE = "https://factory-knowledge-twin.vercel.app"
TIMEOUT = 30


def request(method: str, path: str, body: dict | None = None, cookie: str | None = None) -> dict:
    """한 번의 왕복. 🔴 `remote_ip` 를 같이 남긴다 — 「밖에서 쳤다」는 그 값으로만 증명된다."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)  # noqa: S310
    out: dict = {"path": path, "method": method}
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:                          # noqa: S310
            raw = res.read().decode("utf-8", "replace")
            out["status"] = res.status
            out["headers"] = {k.lower(): v for k, v in res.headers.items()}
            try:
                out["body"] = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                out["bodyLen"] = len(raw)
            try:
                out["remoteIp"] = res.fp.raw._sock.getpeername()[0]                         # noqa: SLF001
            except Exception:                                                               # noqa: BLE001
                out["remoteIp"] = None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        out["status"] = exc.code
        out["headers"] = {k.lower(): v for k, v in exc.headers.items()}
        try:
            out["body"] = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            out["bodyLen"] = len(raw)
    except urllib.error.URLError as exc:
        out["status"] = None
        out["error"] = str(exc.reason)
    out["elapsedMs"] = int((time.time() - started) * 1000)
    return out


def resolved_peer() -> dict:
    """도메인이 실제로 어느 주소로 붙는지 — vantage 귀속의 바닥 근거."""
    host = BASE.split("//", 1)[1]
    ctx = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=TIMEOUT) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            return {"peer": tls.getpeername()[0], "tls": tls.version()}


def cookie_of(res: dict) -> str:
    raw = (res.get("headers") or {}).get("set-cookie") or ""
    return raw.split(";")[0] if raw else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True, choices=["pre", "post"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--scenario", default="GS-01")
    ap.add_argument("--replay", action="store_true", help="④ replay run 1건까지 돈다(production 유일 쓰기)")
    args = ap.parse_args()

    row: dict = {"label": args.label, "at": time.strftime("%H:%M:%S"), "base": BASE,
                 "vantage": resolved_peer()}

    # ① 배포 표지
    health = request("GET", "/api/health")
    row["health"] = {"status": health["status"], "remoteIp": health.get("remoteIp"),
                     "build": ((health.get("body") or {}).get("build")),
                     "deps": {k: v.get("state") for k, v in ((health.get("body") or {}).get("dependencies") or {}).items()},
                     "embedding": ((health.get("body") or {}).get("models") or {}).get("embedding")}

    # ② 세션 «없는» live/status — baseline 을 값으로 남긴다
    anon = request("GET", "/api/live/status")
    row["liveStatusAnon"] = {"status": anon["status"], "body": anon.get("body"),
                             "cacheControl": (anon.get("headers") or {}).get("cache-control")}

    # ③ 세션 발급 — run 은 만들지 않는다(구독 0)
    sess = request("POST", "/api/sessions", {})
    cookie = cookie_of(sess)
    row["session"] = {"status": sess["status"],
                      "capHeaders": {k: v for k, v in (sess.get("headers") or {}).items() if "cap" in k},
                      "hasCookie": bool(cookie)}
    if cookie:
        withsess = request("GET", "/api/live/status", None, cookie)
        row["liveStatusSession"] = {"status": withsess["status"], "body": withsess.get("body")}
        sid = (sess.get("body") or {}).get("sessionId")
        if sid:
            peek = request("GET", f"/api/live/status?sessionId={sid}", None, cookie)
            row["liveStatusPeek"] = {"status": peek["status"], "body": peek.get("body")}

    # ④ replay run — 구독 0 경로
    if args.replay and cookie:
        sid = (sess.get("body") or {}).get("sessionId")
        created = request("POST", f"/api/scenarios/{args.scenario}/runs", {"sessionId": sid, "mode": "replay"}, cookie)
        run_id = ((created.get("body") or {}).get("runId"))
        row["replay"] = {"createStatus": created["status"], "runId": run_id,
                         "capHeaders": {k: v for k, v in (created.get("headers") or {}).items() if "cap" in k}}
        if run_id:
            deadline = time.time() + 240
            snap: dict = {}
            while time.time() < deadline:
                snap = (request("GET", f"/api/runs/{run_id}", None, cookie).get("body") or {})
                if snap.get("status") != "running":
                    break
                time.sleep(1.0)
            events = request("GET", f"/api/runs/{run_id}/events", None, cookie).get("body") or []
            syn = [e for e in events if isinstance(e, dict)
                   and (e.get("payload") or {}).get("synthesis")]
            row["replay"]["runStatus"] = snap.get("status")
            row["replay"]["runMode"] = snap.get("mode")
            row["replay"]["eventCount"] = len(events) if isinstance(events, list) else None
            row["replay"]["synthesisShapes"] = [
                {"seq": e.get("seq"), "keys": sorted((e.get("payload") or {}).get("synthesis") or {}),
                 "axis": ((e.get("payload") or {}).get("synthesis") or {}).get("axis"),
                 "calls": ((e.get("payload") or {}).get("synthesis") or {}).get("calls")}
                for e in syn
            ]

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(row, fh, ensure_ascii=False, indent=2)
    print(json.dumps(row, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
