#!/usr/bin/env python3
"""T5-1F (2/2)-A — 실 CLI 에서 안전규정 «미호명»이 나는 비율을 잰다.

🔴 **이 그물은 구독을 태운다.** 그래서 예산이 판정선보다 먼저다:

    매 run «전»에 남은 예산을 읽는다 → `남은예산 < MAX_CALLS_PER_RUN(2)` 이면 **쏘지 않고 멈춘다**.

  「5 run 돌린다」를 전제로 짜면 안 된다 — 1 run 이 **최대 2 호출**이라 5 run 의 최악값은 10 이고,
  허가는 6 이다. 4번째 발사에서 상한을 넘는다. 발사 «후»에 세면 이미 늦다(61대가 한 발로 상한에 도달한 자리).

🔴 **계수 정본 = 게이트웨이 로그의 `POST /synthesize` 200 건수**다. 대상이 신고하는 `calls` 는
   **다른 칸**이고, 이 스크립트는 둘을 나란히 적어 **대조**한다(자기 신고만 보면 무엇이든 그 값으로 보낸다).
   요청 «건수»만 세면 503·4xx 가 소모로 계상된다 — **상태코드까지 봐야 계수다**.

분모: 이 실행이 실제로 쏜 run 수다. 5 를 못 채우면 **「n/5」가 아니라 「n/실제」** 로 적는다.

사용:
    python benchmarks/tools/t51f2_unnamed_rate.py \\
        --api http://127.0.0.1:PORT --gateway-log <경로> --runs 5 --budget 6 --out raw.jsonl
"""

from __future__ import annotations

import sys as _sys

for _s in (_sys.stdout, _sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

MAX_CALLS_PER_RUN = 2                    # D-84 = 최대 2회차 · 그 이상 없다
SAFETY_ID = "SAF-LOTO-01"
SAFETY_ALIAS = "LOTO"
POST_200 = re.compile(r'"POST /synthesize[^"]*"\s+200')


class StageMissing(Exception):
    """무대 전제가 없다 — FAIL 이 아니라 exit 2."""


def call(base: str, method: str, path: str, body: dict | None = None, cookie: str | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=300) as res:                              # noqa: S310
            raw = res.read().decode("utf-8")
            return res.status, (json.loads(raw) if raw else None), {k.lower(): v for k, v in res.headers.items()}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw), {k.lower(): v for k, v in exc.headers.items()}
        except json.JSONDecodeError:
            return exc.code, {"raw": raw[:300]}, {k.lower(): v for k, v in exc.headers.items()}
    except urllib.error.URLError as exc:
        raise StageMissing(f"{base}{path} 미도달 — {exc.reason}") from None


def gateway_200(log_path: Path) -> int:
    """정본 계수 — 상태코드 200 인 `POST /synthesize` 만 센다.

    🔴 **요청 줄은 stderr 로 간다.** `BaseHTTPRequestHandler.log_message` 는 stderr 에 쓰므로,
       stdout 만 받은 파일에는 **부팅 배너만** 남고 요청 줄이 0 이다. 발주가 준 경로가 그쪽이면
       계수가 조용히 0 이 되고, 그 0 은 「호출이 없었다」가 아니라 **「내가 다른 스트림을 봤다」**이다.
       그래서 형제 `*.err.log` 가 있으면 **둘을 합쳐** 센다(실측: 62대가 이 자리에서 0 을 볼 뻔했다).
    """
    if not log_path.exists():
        raise StageMissing(f"게이트웨이 로그가 없다: {log_path}")
    texts = [log_path.read_text(encoding="utf-8", errors="replace")]
    sibling = log_path.with_suffix(".err" + log_path.suffix)
    if sibling.exists():
        texts.append(sibling.read_text(encoding="utf-8", errors="replace"))
    return sum(len(POST_200.findall(t)) for t in texts)


def answer_of(events: list) -> tuple[str, str]:
    """A 열(답변 본문) · B 열(+근거 발췌) — 25 run 표와 **같은 기준**으로 뽑는다."""
    a_parts, b_parts = [], []
    for e in events or []:
        payload = e.get("payload") or {}
        if e.get("type") == "step.evidence":
            ev = payload.get("evidence")
            items = ev if isinstance(ev, list) else ([ev] if ev else [])
            b_parts += [json.dumps(i, ensure_ascii=False) if isinstance(i, dict) else str(i) for i in items]
        for cand in (payload.get("candidates") or []):
            for s in ((cand.get("rationale") or {}).get("sentences") or []):
                if isinstance(s, str):
                    a_parts.append(s)
    a = "\n".join(a_parts)
    return a, a + "\n" + "\n".join(b_parts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--gateway-log", required=True)
    ap.add_argument("--scenario", default="GS-01")
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--budget", type=int, default=6, help="이 실행이 태워도 되는 «호출» 상한")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    log_path = Path(args.gateway_log)
    try:
        base_calls = gateway_200(log_path)                    # 前 칸 — 자극 «전» 계수
        status, sess, headers = call(args.api, "POST", "/api/sessions", {})
        if status != 200:
            raise StageMissing(f"세션 발급 실패 {status}")
        cookie = next((v for k, v in headers.items() if k == "set-cookie"), "").split(";")[0]
        sid = (sess or {}).get("sessionId")
        _, cap0, _ = call(args.api, "GET", f"/api/live/status?sessionId={sid}", None, cookie)
    except StageMissing as exc:
        print(f"NO-STAGE: {exc}", file=_sys.stderr)
        return 2

    print(json.dumps({"pre": {"gateway200": base_calls, "cap": (cap0 or {}).get("hourlyCap"),
                              "runCap": (cap0 or {}).get("runCap"), "at": time.strftime("%H:%M:%S")}},
                     ensure_ascii=False))

    rows = []
    spent = 0
    stopped = None
    for i in range(1, args.runs + 1):
        # 🔴 **발사 «전»** 예산 검사 — 최악값을 기준으로 판단한다
        if spent + MAX_CALLS_PER_RUN > args.budget:
            stopped = f"예산 보호: 이미 {spent} 호출 · 다음 run 최악값 {MAX_CALLS_PER_RUN} 이면 {args.budget} 초과"
            break
        before = gateway_200(log_path)
        t0 = time.time()
        status, created, hdr = call(args.api, "POST", f"/api/scenarios/{args.scenario}/runs",
                                    {"sessionId": sid, "mode": "live"}, cookie)
        run_id = (created or {}).get("runId")
        if status != 200 or not run_id:
            stopped = f"run {i} 생성 실패 — {status} {created}"
            break
        snap: dict = {}
        deadline = time.time() + 300
        while time.time() < deadline:
            _, snap, _ = call(args.api, "GET", f"/api/runs/{run_id}", None, cookie)
            if (snap or {}).get("status") != "running":
                break
            time.sleep(1.0)
        wall_ms = int((time.time() - t0) * 1000)
        _, events, _ = call(args.api, "GET", f"/api/runs/{run_id}/events", None, cookie)
        after = gateway_200(log_path)
        spent = after - base_calls

        syn = {}
        for e in (events or []):
            s = (e.get("payload") or {}).get("synthesis")
            if s:
                syn = s
                break
        a, b = answer_of(events or [])
        row = {
            "idx": i, "runId": run_id, "status": (snap or {}).get("status"), "wallMs": wall_ms,
            "gateway200Delta": after - before,               # 참값 — 이 run 이 태운 호출
            "gateway200Cumulative": spent,
            "reportedCalls": syn.get("calls"),               # 대상의 자기 신고
            "safetyRetried": syn.get("safetyRetried"),
            "safetyOmitted": syn.get("safetyOmitted"),
            "axis": syn.get("axis"), "model": syn.get("model"),
            "metric6_namedInAnswer": (SAFETY_ID in a) or (SAFETY_ALIAS in a),
            "metric6_namedInAnswerPlusEvidence": (SAFETY_ID in b) or (SAFETY_ALIAS in b),
            "answerChars": len(a),
            "capHeaders": {k: v for k, v in (hdr or {}).items() if "cap" in k},
            "at": time.strftime("%H:%M:%S"),
            "events": events,
        }
        rows.append(row)
        print(json.dumps({k: v for k, v in row.items() if k != "events"}, ensure_ascii=False))

    with open(args.out, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    done = [r for r in rows if r["status"] == "completed"]
    # 🔴 run 이 완주했는데 계수가 0 이면 **대상이 아니라 내 계수기**를 먼저 의심한다.
    if done and spent == 0:
        print("WARN: run 은 완주했는데 게이트웨이 200 계수가 0 이다 — 로그 스트림·경로를 의심하라",
              file=_sys.stderr)
    retried = [r for r in done if r["safetyRetried"] is True]
    summary = {
        "denominator": len(done),
        "requested": args.runs,
        "stoppedEarly": stopped,
        "unnamedRate": f"{len(retried)}/{len(done)}" if done else "0/0 (분모 0 — 비율 아님)",
        "gateway200Total": spent,
        "reportedCallsSum": sum(r["reportedCalls"] for r in done if isinstance(r["reportedCalls"], int)),
        "match": spent == sum(r["reportedCalls"] for r in done if isinstance(r["reportedCalls"], int)),
        "metric6_namedInAnswer": f'{sum(1 for r in done if r["metric6_namedInAnswer"])}/{len(done)}',
        "metric6_namedInAnswerPlusEvidence": f'{sum(1 for r in done if r["metric6_namedInAnswerPlusEvidence"])}/{len(done)}',
        "wallMs": sorted(r["wallMs"] for r in done),
        "budget": args.budget,
    }
    print(json.dumps({"summary": summary}, ensure_ascii=False, indent=2))
    return 0 if done else 2


if __name__ == "__main__":
    raise SystemExit(main())
