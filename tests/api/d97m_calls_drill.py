#!/usr/bin/env python3
"""D-97-MV 드릴 — 「1 run 이 합성 호출을 몇 번 썼는가」를 계측 칸이 말하는가.

🔴 **측정 모델 — 두 계측기를 다른 칸에 적는다.**

| 칸 | 누가 재는가 | 무엇의 값인가 |
|---|---|---|
| `stub.total` | **내 스텁**(`/_stub/calls`) | 게이트웨이가 실제로 받은 `POST /synthesize` 건수 = **참값** |
| `payload.calls` · `payload.safetyRetried` | **대상**(ai-api 페이로드) | 대상이 «자기 입으로» 신고한 값 |

축 ①의 판정은 「두 값이 같은가」이지 「대상이 2라고 말했는가」가 아니다 — 대상의 자기 신고만
보면 무엇이든 그 값으로 보내는 문도 초록이 된다(자기 신고보다 거동).

🔴 **구독 0** — 스텁은 Claude CLI 를 부르지 않는다. 이 드릴은 실 게이트웨이를 향해 돌리면 안 된다
   (`--api` 가 가리키는 ai-api 의 `FKT_LOCAL_SYNTHESIS_GATEWAY` 가 스텁 포트여야 한다).
   드릴은 «전»에 그 전제를 찍는다 — 스텁 `/_stub/calls` 가 안 서면 **exit 2**(무대 없음)이지 FAIL 이 아니다.

## 축

1. **① known-true / 대조군** — 스텁 손잡이 `retry` 열과 `named` 열을 **각각 한 run** 씩.
   두 열의 `stub.total` 이 **2 와 1 로 실제로 갈리는 것**을 본 뒤에야 대상 신고를 읽는다.
   갈리지 않으면 자극이 안 선 것이므로 **exit 2**.
2. **② 두 칸 항상 실림** — `named` 열(재요청 0)에서도 키가 **있어야** 한다. 값이 `1`/`false` 인 것이
   값이지, 키가 없는 것은 「1호출이었다」가 아니라 「이 빌드가 말하지 않는다」다.
3. **③ 로그 형상** — ai-api 로그 1줄이 구조화 형상인가(문자열 존재 여부만 · 원문은 안 옮긴다).
4. **④ 거동 변경 0** — 같은 시나리오를 두 번 돌려 호출 수·인용 형상이 같은가 · `hourlyCap.used`
   증가분이 **run 축(1)** 인가.
5. **⑤ README 문면 ↔ 코드** — 「1~2」·「최대 6」이 코드 실물(`for attempt in (1, 2)`)과 맞는가.
6. **⑥ 안 잰 것** — 실 CLI 미호명 «발생률». 스텁은 그것을 결정적으로 만들므로 이 드릴은
   비율에 대해 아무 말도 하지 않는다.

사용:
    python d97m_calls_drill.py --api http://127.0.0.1:8852 --stub http://127.0.0.1:8871 \
        --stub-cmd "..." --scenario GS-01
스텁 모드 전환은 스텁을 **그 모드로 재기동**하는 것이라, 이 드릴은 모드별로 한 번씩 부른다:
    --mode retry   (known-true 열)
    --mode named   (대조군 열)
결과 JSON 은 `--out` 에 이어 쓴다(열마다 1개 객체 · 채점은 `--score` 로 두 열을 합쳐 읽는다).
"""

from __future__ import annotations

import sys as _sys

# 🔴 Windows 콘솔 기본이 cp949 라 em dash·이모지가 여기서 죽는다 — 내 «출력» 이 못 넘어
#    「대상이 실패했다」로 보이는 자리(실측: UnicodeEncodeError · 판정 전에 죽었다).
for _stream in (_sys.stdout, _sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001 — 재설정 못 해도 측정은 돈다
        pass

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

TIMEOUT = 30


class StageMissing(Exception):
    """무대 전제가 없다 — FAIL 이 아니라 exit 2 다."""


def call(base: str, method: str, path: str, body: dict | None = None, cookie: str | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310
            raw = res.read().decode("utf-8")
            return res.status, (json.loads(raw) if raw else None), dict(res.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw), dict(exc.headers)
        except json.JSONDecodeError:
            return exc.code, {"raw": raw[:400]}, dict(exc.headers)
    except urllib.error.URLError as exc:
        raise StageMissing(f"{base}{path} 미도달 — {exc.reason}") from None


def find_key(node, key: str, path: str = ""):
    """페이로드 «어디에» 실렸는지 모른다 — 이름으로 찾고 **찾은 경로를 값으로 적는다**.

    🔴 발주가 말한 `synthesis.calls` 를 그대로 박으면, 처방이 다른 자리에 실었을 때
       「대상이 말하지 않는다」는 **틀린 빨강**이 된다(지어낸 셀렉터).
    """
    hits = []
    if isinstance(node, dict):
        for k, v in node.items():
            here = f"{path}.{k}" if path else k
            if k == key:
                hits.append((here, v))
            hits.extend(find_key(v, key, here))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            hits.extend(find_key(v, key, f"{path}[{i}]"))
    return hits


def start_and_wait(api: str, scenario: str, sid: str, deadline_sec: int = 300) -> dict:
    status, created, _ = call(api, "POST", f"/api/scenarios/{scenario}/runs", {"sessionId": sid, "mode": "live"})
    if status != 200 or not (created or {}).get("runId"):
        raise StageMissing(f"run 을 시작하지 못했다 — {status} {created}")
    run_id = created["runId"]
    end = time.time() + deadline_sec
    snap: dict = {}
    while time.time() < end:
        _, snap, _ = call(api, "GET", f"/api/runs/{run_id}")
        if isinstance(snap, dict) and snap.get("status") != "running":
            break
        time.sleep(0.5)
    snap = snap or {}
    snap["_runId"] = run_id
    return snap


def column(api: str, stub: str, scenario: str, sid: str, mode: str) -> dict:
    """한 열 = 스텁 1모드 · run 1건. 자극 «전»에 계수를 0 으로 만든다."""
    status, health, _ = call(stub, "GET", "/health")
    if status != 200:
        raise StageMissing(f"스텁 /health 가 {status} — 무대 없음")
    status, calls0, _ = call(stub, "POST", "/_stub/reset")
    if status != 200:
        raise StageMissing("스텁 /_stub/reset 이 서지 않는다 — 계수를 0 으로 못 만든다")

    _, cap_before, _ = call(api, "GET", "/api/live/status")
    snap = start_and_wait(api, scenario, sid)
    _, cap_after, _ = call(api, "GET", "/api/live/status")
    _, stub_calls, _ = call(stub, "GET", "/_stub/calls")
    _, events, _ = call(api, "GET", f"/api/runs/{snap['_runId']}/events")

    calls_hits = find_key(snap, "calls") + find_key(events, "calls")
    retried_hits = find_key(snap, "safetyRetried") + find_key(events, "safetyRetried")
    omitted_hits = find_key(snap, "safetyOmitted") + find_key(events, "safetyOmitted")

    return {
        "mode": mode,
        "stubMode": (stub_calls or {}).get("mode"),
        "runId": snap.get("_runId"),
        "runStatus": snap.get("status"),
        "runMode": snap.get("mode"),
        # --- 참값(내 스텁) ---
        "stub": {
            "total": (stub_calls or {}).get("total"),
            "byNotice": (stub_calls or {}).get("byNotice"),
            "rulesInEvidence": sorted({r for c in (stub_calls or {}).get("log", []) for r in c.get("rulesInEvidence", [])}),
        },
        # --- 대상의 자기 신고 ---
        "target": {
            "callsHits": [{"path": p, "value": v} for p, v in calls_hits],
            "safetyRetriedHits": [{"path": p, "value": v} for p, v in retried_hits],
            "safetyOmittedHits": [{"path": p, "value": v} for p, v in omitted_hits],
        },
        "hourlyCap": {
            "before": ((cap_before or {}).get("hourlyCap") or {}).get("used"),
            "after": ((cap_after or {}).get("hourlyCap") or {}).get("used"),
        },
        "at": time.strftime("%H:%M:%S"),
    }


def score(rows: list[dict]) -> dict:
    """두 열을 합쳐 축을 채점한다. 🔴 자극이 안 섰으면 색을 내지 않는다(exit 2)."""
    by = {r["mode"]: r for r in rows}
    out: dict = {"axes": {}, "notes": []}
    if "retry" not in by or "named" not in by:
        out["axes"]["①"] = {"verdict": "NO-STAGE", "why": "두 열이 다 있어야 갈림을 볼 수 있다"}
        return out

    retry, named = by["retry"], by["named"]
    # ① 자극이 실제로 갈렸는가 — 참값(스텁) 축이 먼저다
    if not retry["stub"]["rulesInEvidence"]:
        out["axes"]["①"] = {"verdict": "NO-STAGE", "why": "발췌에 SAF-* 가 0건 — 재요청 갈래 자체가 안 선다"}
        return out
    if not (retry["stub"]["total"] == 2 and named["stub"]["total"] == 1):
        out["axes"]["①"] = {
            "verdict": "NO-STAGE",
            "why": f"참값이 2/1 로 안 갈렸다 — retry={retry['stub']['total']} named={named['stub']['total']}",
        }
        return out

    def one(hits, want):
        if not hits:
            return None, "키 없음"
        return hits[0]["value"], ("일치" if hits[0]["value"] == want else f"불일치(기대 {want})")

    rc, rc_why = one(retry["target"]["callsHits"], 2)
    nc, nc_why = one(named["target"]["callsHits"], 1)
    rr, rr_why = one(retry["target"]["safetyRetriedHits"], True)
    nr, nr_why = one(named["target"]["safetyRetriedHits"], False)

    out["axes"]["①"] = {
        "verdict": "PASS" if (rc == 2 and nc == 1) else "FAIL",
        "stub": {"retry": 2, "named": 1},
        "target": {"retry": rc, "named": nc},
        "why": {"retry": rc_why, "named": nc_why},
    }
    out["axes"]["②"] = {
        "verdict": "PASS" if (rc is not None and nc is not None and rr is not None and nr is not None) else "FAIL",
        "why": "재요청 0 열에서도 두 칸이 실려야 한다(1/false 가 값)",
        "presence": {
            "retry": {"calls": rc is not None, "safetyRetried": rr is not None},
            "named": {"calls": nc is not None, "safetyRetried": nr is not None},
        },
        "safetyRetried": {"retry": rr, "named": nr, "why": {"retry": rr_why, "named": nr_why}},
    }
    caps = []
    for r in rows:
        b, a = r["hourlyCap"]["before"], r["hourlyCap"]["after"]
        caps.append({"mode": r["mode"], "delta": (a - b) if isinstance(a, int) and isinstance(b, int) else None})
    out["axes"]["④-cap"] = {
        "verdict": "PASS" if all(c["delta"] == 1 for c in caps) else "FAIL",
        "why": "상한 계수는 run 축 — 호출이 2회여도 증가분은 1",
        "deltas": caps,
    }
    out["notes"].append("⑥ 안 잰 것 = 실 CLI 에서 미호명이 나는 «비율». 스텁은 그것을 결정적으로 만든다.")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=os.environ.get("FKT_API_BASE", "http://127.0.0.1:8852"))
    ap.add_argument("--stub", default=os.environ.get("FKT_STUB_BASE", "http://127.0.0.1:8871"))
    ap.add_argument("--scenario", default="GS-01")
    ap.add_argument("--session", default=None)
    ap.add_argument("--mode", choices=["retry", "named"], help="이 실행이 재는 열(스텁이 그 모드로 떠 있어야 한다)")
    ap.add_argument("--out", default="d97m-rows.json")
    ap.add_argument("--score", action="store_true", help="--out 에 쌓인 열들을 채점만 한다")
    args = ap.parse_args()

    rows: list[dict] = []
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as fh:
            rows = json.load(fh)

    try:
        if not args.score:
            if not args.mode:
                print("--mode 가 필요하다(retry|named)", file=sys.stderr)
                return 2
            sid = args.session or f"d97mv-{args.mode}-{int(time.time())}"
            row = column(args.api, args.stub, args.scenario, sid, args.mode)
            rows = [r for r in rows if r["mode"] != args.mode] + [row]
            with open(args.out, "w", encoding="utf-8") as fh:
                json.dump(rows, fh, ensure_ascii=False, indent=2)
            print(json.dumps(row, ensure_ascii=False, indent=2))
            return 0
    except StageMissing as exc:
        print(f"NO-STAGE: {exc}", file=sys.stderr)
        return 2

    verdict = score(rows)
    print(json.dumps(verdict, ensure_ascii=False, indent=2))
    if any(a.get("verdict") == "NO-STAGE" for a in verdict["axes"].values()):
        return 2
    return 0 if all(a.get("verdict") == "PASS" for a in verdict["axes"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())
