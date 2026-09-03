"""D-24b 검증용 **NDJSON 스텁 게이트웨이** — `kind=error` 줄의 내용을 내가 쥔다.

🔴 왜 스텁인가: 진짜 게이트웨이로는 「같은 문면 + 코드 유무」를 손잡이 하나만 바꿔 만들 수
   없다(모델이 무엇을 줄지 내가 못 정한다). 분류가 «코드»에서 오는지 «문면»에서 오는지를
   가르려면 두 열이 문면만 같고 코드만 달라야 한다. 그리고 실 CLI 를 안 부르므로 구독 0 이다.

시나리오는 요청마다 `--scenario-file` 을 다시 읽는다 — 서버를 재기동하지 않고 열을 바꾸기
위해서다(ai-api 재기동은 임베딩 워밍업까지 끌고 와서 창이 흔들린다).

  binding_leak : sentence 1줄 → error(code=evidence_binding · 문면에 헤더명·인용 id 누출)
  nocode_leak  : 위와 **같은 문면** · `reasonCode` 없음      (③ 코드가 갈랐는가)
  binding_other: code=evidence_binding · **다른 문면**       (③ 반대 방향)
  no_result    : sentence 1줄만 주고 result·error 없이 끝냄  (④ 구조 축)
  ok           : sentence 1줄 + result 줄(정상)             (자극 실재 확인용)

사용: python d24b_stub_gateway.py --port 8790 --scenario-file <경로>
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8790
SCENARIO_FILE = ""

# 🔴 이 문면이 «누출 표본»이다 — 헤더명과 인용 id 를 일부러 싣는다. 수리 전 판에서는 이 문자열이
#    그대로 화면까지 가야 하고(대조군), 수리 후 판에서는 한 조각도 나오면 안 된다.
LEAK = "인용 id 가 run 근거집합 밖이다(2건) · X-FKT-Gateway-Token · EV-9999-BAD"
OTHER = "모델이 준 표가 우리 후보와 다르다"

SENTENCE = {
    "kind": "sentence",
    "seq": 0,
    "sentence": {
        "failureModeId": "FM-BRG-WEAR",
        "text": "스텁이 흘린 잠정 문장이다.",
        "citedEvidenceIds": ["EV-2025-001"],
    },
}


def scenario() -> str:
    try:
        with open(SCENARIO_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return "binding_leak"


def lines(name: str) -> list[dict]:
    if name == "ok":
        return [SENTENCE, {"kind": "result", "result": {"ranking": [], "rationale": {}, "model": "stub"}}]
    if name == "no_result":
        return [SENTENCE]
    if name == "nocode_leak":
        return [SENTENCE, {"kind": "error", "status": 422, "rejectedReason": LEAK}]
    if name == "binding_other":
        return [SENTENCE, {"kind": "error", "status": 422, "rejectedReason": OTHER, "reasonCode": "evidence_binding"}]
    return [SENTENCE, {"kind": "error", "status": 422, "rejectedReason": LEAK, "reasonCode": "evidence_binding"}]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        name = scenario()
        self.log_message("scenario=%s", name)
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        for obj in lines(name):
            body = (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
            self.wfile.write(f"{len(body):X}\r\n".encode("ascii") + body + b"\r\n")
            self.wfile.flush()
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        payload = b'{"ok":true}'
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--port" in args:
        PORT = int(args[args.index("--port") + 1])
    if "--scenario-file" in args:
        SCENARIO_FILE = args[args.index("--scenario-file") + 1]
    print(f"d24b stub gateway · 127.0.0.1:{PORT} · scenario file = {SCENARIO_FILE}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
