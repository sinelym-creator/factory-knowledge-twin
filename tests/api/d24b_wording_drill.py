"""D-24b 독립 검증 드릴 — 스트림 도중 거부의 «사유 문면»이 무엇이 되는가.

한 열 = (ai-api 포트, 스텁 시나리오). 각 열에서 run 을 1회 돌리고 **이벤트 정본**에서
`rejectedReason` 을 읽은 뒤, 그 run 의 **이벤트 응답 본문 전체**를 누출 needle 로 훑는다.

🔴 화면만 보지 않는다 — 응답 본문(=브라우저가 받는 것)까지 봐야 「화면에 안 그린다」와
   「주지 않는다」가 갈린다.

사용: python d24b_wording_drill.py --api 8012 --scenario binding_leak --scenario-file <경로>
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from http.cookiejar import CookieJar

NEEDLES = ["X-FKT", "EV-9999-BAD", "인용 id", "Token", "reasonCode", "evidence_binding"]


def main() -> int:
    args = sys.argv[1:]
    api = args[args.index("--api") + 1] if "--api" in args else "8012"
    scenario = args[args.index("--scenario") + 1] if "--scenario" in args else "binding_leak"
    sfile = args[args.index("--scenario-file") + 1]
    with open(sfile, "w", encoding="utf-8") as fh:
        fh.write(scenario)

    base = f"http://127.0.0.1:{api}"
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(path: str, body: dict | None = None) -> tuple[int, str]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            base + path,
            data=data,
            headers={"Content-Type": "application/json"} if data else {},
            method="POST" if data is not None else "GET",
        )
        with opener.open(req, timeout=60) as res:
            return res.status, res.read().decode("utf-8")

    _, s = call("/api/sessions", {})
    sid = json.loads(s)["sessionId"]
    _, r = call("/api/scenarios/GS-01/runs", {"sessionId": sid, "mode": "live"})
    run_id = json.loads(r)["runId"]

    raw = ""
    events: list = []
    for _ in range(90):
        _, raw = call(f"/api/runs/{run_id}/events")
        events = json.loads(raw)
        # 🔴 `step.completed` 도 "completed" 를 품는다 — 그걸로 끊으면 run 이 «아직 도는 중»인데
        #    다 봤다고 착각하고 axis=null 을 적는다(1차 실행에서 실제로 그랬다).
        if isinstance(events, list) and any(str(e.get("type")) in ("run.completed", "run.failed") for e in events):
            break
        time.sleep(1)

    synth = None
    for e in events:
        got = e.get("synthesis") or (e.get("payload") or {}).get("synthesis")
        if got:
            synth = got
    hits = sorted({n for n in NEEDLES if n in raw})
    out = {
        "api": api,
        "scenario": scenario,
        "runId": run_id,
        "eventCount": len(events),
        "axis": (synth or {}).get("axis"),
        "rejectedReason": (synth or {}).get("rejectedReason"),
        "leakNeedlesInEventBody": hits,
        "progressSentences": sum(1 for e in events if e.get("type") == "step.progress"),
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
