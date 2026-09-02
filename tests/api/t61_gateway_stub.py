"""T6-1 축 ① 자극 — 게이트웨이 «자리»에 서는 스텁 (검증 좌석 · 27대).

🔴 **왜 실물 게이트웨이로 자극하지 않는가.** `services/synthesis-gateway/gateway.py:101`
   `_validate_response` 가 인용 id 를 **자기가 먼저 검사**해 502 로 문다. 그 경로로는
   ai-api 의 `apply_guard` 가 **한 번도 돌지 않고도** `axis=live-rejected` 가 나온다 —
   그것은 **다른 층이 낸 빨강**이고, T6-1 이 재려는 가드의 초록/빨강이 아니다.
   (구현 좌석 경고 09-02 20:36 · 코드로 확인 E1)

그래서 이 스텁은 **HTTP 200 + 계약 형상 그대로** 답한다. 다른 것은 하나뿐이다 —
`FKT_STUB_MODE=fake` 면 인용 목록에 **run 근거집합 밖 id 를 1건** 섞는다.

🔴 **대조군이 이 파일의 절반이다.** `mode=real` 은 같은 스텁이 **진짜 id 만** 인용한다.
   그 열이 `axis=live` 를 내야, `fake` 열의 `live-rejected` 가 「가드가 막았다」는 뜻이 된다 —
   안 그러면 「스텁이 원래 안 먹힌다」와 구별할 수 없다(문은 양면으로 시험한다).

🔴 **자극 도달을 «센다».** 요청 1건마다 JSONL 한 줄을 남긴다. 이 파일이 0줄이면 가드는
   한 번도 안 불린 것이고, 그때의 판정은 어느 색도 아니다.

    FKT_STUB_PORT   기본 8790
    FKT_STUB_MODE   fake(기본) | real
    FKT_STUB_LOG    기본 ./t61_stub_calls.jsonl
    FKT_STUB_FAKE_ID 기본 EV-STUB-NOT-IN-RUN-0001
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("FKT_STUB_PORT", "8790"))
MODE = os.environ.get("FKT_STUB_MODE", "fake")
LOG = os.environ.get("FKT_STUB_LOG", "t61_stub_calls.jsonl")
FAKE_ID = os.environ.get("FKT_STUB_FAKE_ID", "EV-STUB-NOT-IN-RUN-0001")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"ok": True, "mode": MODE})
        else:
            self._send(404, {"rejectedReason": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/synthesize":
            self._send(404, {"rejectedReason": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:  # noqa: BLE001
            self._send(400, {"rejectedReason": "요청을 JSON 으로 읽지 못했다"})
            return

        candidates = req.get("candidates") or []
        evidence_text = req.get("evidenceText") or {}
        real_ids = [k for k in evidence_text if isinstance(k, str)]

        # 🔴 자극이 «닿았다»는 자취 — 이 줄이 없으면 아래 판정은 무효다.
        with open(LOG, "a", encoding="utf-8", newline="\n") as fh:
            fh.write(
                json.dumps(
                    {
                        "at": _now(),
                        "mode": MODE,
                        "candidates": len(candidates),
                        "evidenceIds": len(real_ids),
                        "firstEvidenceId": real_ids[0] if real_ids else None,
                        "injected": FAKE_ID if MODE == "fake" else None,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

        if not candidates or not real_ids:
            # 무대가 없으면 만들지 않는다 — 502 로 남기고 그 사실을 자취에 둔다.
            self._send(502, {"rejectedReason": "스텁: 후보 또는 근거가 0건이라 답을 지어내지 않는다"})
            return

        ranking = [c.get("failureModeId") for c in candidates]
        rationale = {}
        for c in candidates:
            cited = [real_ids[0]]
            if MODE == "fake":
                # 🔴 이 한 줄이 자극이다 — run 근거집합 밖 id 1건.
                cited.append(FAKE_ID)
            rationale[c.get("failureModeId")] = {
                "sentences": [f"{c.get('label')} 근거 문장(스텁)."],
                "citedEvidenceIds": cited,
            }

        self._send(200, {"model": f"stub-{MODE}", "elapsedMs": 1, "ranking": ranking, "rationale": rationale})

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print(f"[stub:{MODE}] {fmt % args}", flush=True)


def main() -> int:
    print(f"t61-gateway-stub · http://127.0.0.1:{PORT} · mode={MODE} · log={LOG}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
