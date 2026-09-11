#!/usr/bin/env python3
"""D-97-MV 스텁 게이트웨이 — 구독 0 무대에서 「1 run = 몇 호출인가」를 손잡이로 가른다.

🔴 **이것은 계측기다. 대상이 아니다.** 여기서 나오는 `calls` 는 **내 계수**이고,
   판정 대상은 ai-api 페이로드·로그가 말하는 값이다. 두 값을 같은 칸에 적지 않는다.

왜 스텁인가 — 실 CLI 를 부르면 호출마다 구독이 탄다(D-97 관측: 1 run = 2 호출).
스텁은 Claude 를 부르지 않으므로 **구독 소모 0** 이고, 「미호명 답」을 **결정적으로** 낼 수 있다
(실 모델은 미호명이 날지 안 날지 거동이라 자극이 안 선다 — senku2-d97 §6 「미호명 발생률은 못 잰다」).

## 손잡이 (`FKT_STUB_SAFETY`)

| 값 | 1회차 답 | 2회차 답 | 기대 호출 수 | 쓰임 |
|---|---|---|---|---|
| `named` | SAF-* 전부 호명 | (없음) | 1 | 대조군 ⓑ — 미호명이 안 나면 재요청도 없다 |
| `retry`(기본) | 미호명 | 호명 | 2 | known-true — `safetyRetried=true` 가 실려야 한다 |
| `omitted` | 미호명 | 미호명 | 2 | D-84 끝갈래 — `safetyOmitted=true` 까지 |

🔴 `retry`/`omitted` 의 1회차 미호명은 **답 문장에서 SAF id 를 빼는 것**으로 만든다.
   발췌(`evidenceText`)는 손대지 않는다 — 발췌를 건드리면 `safety_rules_in_evidence()` 가
   0 을 거둬 「자극이 없었다」가 되고, 그 초록은 대상에 대해 아무 말도 안 한다.

## 내 계수 읽는 곳

- `GET /_stub/calls` → `{"total": n, "byNotice": {"first": a, "retry": b}, "log": [...]}`
  `retry` = 요청 본문에 `guardNotice` 키가 있던 호출 = **재요청 회차**.
  🔴 이 갈림은 `_request_body()` 가 통지 없을 때 **키 자체를 안 넣는** 규격에 기댄다.
- `POST /_stub/reset` → 계수 0. 자극 «전»에 부르고, 자극 «후»에 읽는다.
"""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

SAFETY_RULE_RE = re.compile(r"\bSAF-[A-Za-z0-9-]+")

PORT = int(os.environ.get("FKT_STUB_PORT", "8871"))
BIND = os.environ.get("FKT_STUB_BIND", "127.0.0.1")
MODE = os.environ.get("FKT_STUB_SAFETY", "retry")
MODEL = os.environ.get("FKT_STUB_MODEL", "stub-no-subscription")

_lock = threading.Lock()
_calls: list[dict] = []


def _utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _answer(req: dict) -> dict:
    """요청에서 받은 후보·발췌로 **가드를 통과하는** 답을 조립한다.

    🔴 후보 id·근거 id 를 **지어내지 않는다** — 요청이 준 것만 쓴다. 지어낸 id 는
       `apply_guard` 가 전량 거부로 올리고, 그 빨강은 대상 결함이 아니라 내 스텁의 것이다.
    """
    candidates = req.get("candidates") or []
    evidence_text = req.get("evidenceText") or {}
    evidence_ids = [k for k in evidence_text if isinstance(k, str)]
    rules = sorted({r for t in evidence_text.values() if isinstance(t, str) for r in SAFETY_RULE_RE.findall(t)})
    is_retry = "guardNotice" in req

    # 이 회차가 규정을 호명할 것인가
    if MODE == "named":
        name_rules = True
    elif MODE == "omitted":
        name_rules = False
    else:  # retry
        name_rules = is_retry

    ranking = [c.get("failureModeId") for c in candidates if isinstance(c.get("failureModeId"), str)]
    # 🔴 `guardfail` = 200 은 내지만 가드가 물리는 답(run 근거집합 밖 인용).
    #    처방이 「가드가 물린 회차도 센다」라고 적어 둔 그 주장을 거동으로 물어보는 열이다.
    if MODE == "guardfail":
        return {
            "ranking": ranking,
            "rationale": {
                fm: {"sentences": ["근거집합 밖 인용을 달았다."], "citedEvidenceIds": ["EV-NOT-IN-RUN"]}
                for fm in ranking
            },
            "model": MODEL,
            "_stub": {"mode": MODE, "isRetry": is_retry, "namedRules": False, "rulesInEvidence": rules},
        }
    rationale: dict[str, dict] = {}
    for idx, cand in enumerate(candidates):
        fm_id = cand.get("failureModeId")
        if not isinstance(fm_id, str):
            continue
        cited = [e for e in (cand.get("evidenceIds") or []) if e in evidence_text] or evidence_ids
        sentence = f"{cand.get('label') or fm_id} 가정을 발췌 근거로 받친다."
        sentences = [sentence]
        # 🔴 규정 호명은 **첫 후보 문장에만** 싣는다 — `unnamed_safety_rules()` 는 후보를
        #    가리지 않고 문장 전체를 한 덩어리로 훑으므로 이것으로 「호명함」이 성립한다.
        if name_rules and rules and idx == 0:
            sentences.append("작업 전 " + ", ".join(rules) + " 를 준수한다.")
        rationale[fm_id] = {"sentences": sentences, "citedEvidenceIds": cited[:3]}

    return {
        "ranking": ranking,
        "rationale": rationale,
        "model": MODEL,
        "_stub": {"mode": MODE, "isRetry": is_retry, "namedRules": name_rules, "rulesInEvidence": rules},
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler 규약
        path = self.path.rstrip("/") or "/"
        if path == "/health":
            # 🔴 실 게이트웨이 `/health` 와 **같은 키 모양**을 낸다 — ai-api 가 이 본문을 읽어
            #    배지를 정한다(계약 v0.2.4 ②). 모양이 다르면 「대상이 OFF 로 보인다」가 되고
            #    그 빨강은 내 스텁의 것이다.
            self._send(200, {
                "ok": True,
                "timeoutMs": 60000,
                "model": MODEL,
                "effort": "cli-default",
                "promptPath": "(stub)",
                "promptSha256": "(stub)",
                "bind": BIND,
                "authRequired": False,
                "synth": {
                    "lastOutcome": "ok",
                    "lastAt": _utc_iso(datetime.now(timezone.utc)),
                    "consecutiveFailures": 0,
                    "latchedUntil": None,
                },
            })
            return
        if path == "/_stub/calls":
            with _lock:
                log = list(_calls)
            self._send(200, {
                "total": len(log),
                "mode": MODE,
                "byNotice": {
                    "first": sum(1 for c in log if not c["isRetry"]),
                    "retry": sum(1 for c in log if c["isRetry"]),
                },
                "log": log,
            })
            return
        self._send(404, {"rejectedReason": "없는 경로"})

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.rstrip("/") or "/"
        if path == "/_stub/reset":
            with _lock:
                _calls.clear()
            self._send(200, {"total": 0})
            return
        if path != "/synthesize":
            self._send(404, {"rejectedReason": "없는 경로"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        req = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
        if MODE == "streamerr" and "application/x-ndjson" in (self.headers.get("Accept") or ""):
            # 🔴 200 을 낸 «뒤» 본문 안에서 끊는 갈래(D-24b). 호출은 갔고 응답도 시작됐다
            #    — 실 게이트웨이였다면 CLI 가 이미 돌았을 수 있는 자리다. 그러니 «소모 새는 지점» 이다.
            self._count(req, {"isRetry": "guardNotice" in req, "namedRules": False,
                              "rulesInEvidence": sorted({r for t in (req.get("evidenceText") or {}).values()
                                                         if isinstance(t, str) for r in SAFETY_RULE_RE.findall(t)})})
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            for line in (
                {"kind": "sentence", "sentence": {"failureModeId": "FM-BRG-WEAR", "text": "잠정 문장 1"}},
                {"kind": "error", "rejectedReason": "stub 이 본문 안에서 끊었다", "reasonCode": "evidence_binding"},
            ):
                raw = (json.dumps(line, ensure_ascii=False) + "\n").encode("utf-8")
                self.wfile.write(f"{len(raw):X}\r\n".encode() + raw + b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
            return
        out = _answer(req)
        stub = out.pop("_stub")
        self._count(req, stub)
        self._send(200, out)

    def _count(self, req: dict, stub: dict) -> None:
        """계수는 «받은 즉시» 한다 — 답을 끝까지 못 내는 갈래도 호출은 간 것이다."""
        with _lock:
            _calls.append({
                "at": _utc_iso(datetime.now(timezone.utc)),
                "isRetry": stub["isRetry"],
                "namedRules": stub["namedRules"],
                "rulesInEvidence": stub["rulesInEvidence"],
                "anchor": (req.get("anchor") or {}).get("scenarioId"),
                "candidates": len(req.get("candidates") or []),
            })

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print(f"[stub] {self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    print(f"[stub] mode={MODE} bind={BIND}:{PORT} model={MODEL}", flush=True)
    HTTPServer((BIND, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
