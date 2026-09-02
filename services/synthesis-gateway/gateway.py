"""로컬 합성 게이트웨이 — Claude Code CLI(구독) 경유 · T6-1.

경계(baseline §15.2 · 계약 v0.1.11):
- 운영자 PC 의 «호스트» 프로세스다. compose 에 등재하지 않고 컨테이너에서 도달하지 않는다.
- 127.0.0.1 에만 바인드한다. 외부 인터페이스에 뜨지 않는다.
- 자격 증명을 0 개 들고 있다 — 인증은 호스트에 이미 로그인된 Claude Code CLI 의 것이다.
- 로그에 프롬프트·근거 원문을 쓰지 않는다(크기·건수·시각·판정만).
- CLI 는 실행계 도구가 제거된 상태(`--restricted`)로, MCP 0(`--strict-mcp-config`)으로,
  빈 작업 디렉터리에서 돈다 — 리포의 CLAUDE.md 가 프롬프트에 섞여 들어가지 않게 한다.

의존: 표준 라이브러리만. 새로 들이는 패키지가 없다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
SYSTEM_PROMPT_FILE = HERE / "system_prompt.txt"

# 박은 값 0 — 포트·타임아웃·CLI 경로·모델은 여기 한 곳에서만 읽는다.
PORT = int(os.environ.get("SYNTHESIS_GATEWAY_PORT", "8787"))
TIMEOUT_MS = int(os.environ.get("SYNTHESIS_TIMEOUT_MS", "60000"))
CLI_BIN = os.environ.get("SYNTHESIS_CLI_BIN", "claude")
# 미지정이 기본이다 — 실측(31대 19:2x)에서 CLI 기본 모델이 haiku 지정보다 2~3배 빨랐고
# JSON 규약도 haiku 만 깼다(코드 펜스로 감싸 돌려줬다). 지정하려면 이 env 로만.
MODEL = os.environ.get("SYNTHESIS_MODEL", "").strip()

MAX_BODY_BYTES = 1 * 1024 * 1024
UNKNOWN_MODEL = "claude-code-cli:unknown"
FENCE = "```"


class SynthesisError(Exception):
    """게이트웨이가 결과를 못 냈다 — 사유를 달고 올라간다(조용한 폴백 0)."""

    def __init__(self, reason: str, status: int = 502) -> None:
        super().__init__(reason)
        self.reason = reason
        self.status = status


def _pick_model(envelope: dict) -> str:
    """CLI 응답의 modelUsage 에서 «답한» 모델을 고른다.

    CLI 는 본 모델 외에 내부 보조 모델의 사용량도 함께 싣는다. 출력 토큰으로 고르면 보조
    모델이 이길 수 있다(실측: 사소한 프롬프트에서 보조 72 tok > 본 9 tok). 프롬프트 «전량»을
    받는 쪽이 본 모델이므로 입력 토큰 합으로 고른다.
    """
    usage = envelope.get("modelUsage")
    if not isinstance(usage, dict) or not usage:
        return UNKNOWN_MODEL

    def weight(entry: object) -> int:
        if not isinstance(entry, dict):
            return -1
        return sum(
            int(entry.get(k) or 0)
            for k in ("inputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")
        )

    return max(usage.items(), key=lambda kv: weight(kv[1]))[0]


def _strip_one_fence(text: str) -> str:
    """코드 펜스를 «한 겹만» 벗긴다. 그 밖의 산문은 허용하지 않는다."""
    body = text.strip()
    if not body.startswith(FENCE):
        return body
    first_newline = body.find("\n")
    if first_newline == -1:
        return body
    inner = body[first_newline + 1 :]
    if inner.rstrip().endswith(FENCE):
        inner = inner.rstrip()[: -len(FENCE)]
    return inner.strip()


def _validate_request(req: object) -> tuple[dict, dict]:
    if not isinstance(req, dict):
        raise SynthesisError("요청 본문이 JSON 객체가 아니다", status=400)
    candidates = req.get("candidates")
    evidence_text = req.get("evidenceText")
    if not isinstance(candidates, list) or not candidates:
        raise SynthesisError("candidates 가 비었다", status=400)
    if not isinstance(evidence_text, dict) or not evidence_text:
        raise SynthesisError("evidenceText 가 비었다", status=400)
    for cand in candidates:
        if not isinstance(cand, dict) or not isinstance(cand.get("failureModeId"), str):
            raise SynthesisError("candidates 원소에 failureModeId 가 없다", status=400)
    return req, evidence_text


def _validate_response(parsed: object, wanted_ids: set[str], evidence_ids: set[str]) -> dict:
    """게이트웨이 층의 형상 검사. 근거 결속 «판정»은 ai-api 가 다시 한다(이중 검사)."""
    if not isinstance(parsed, dict):
        raise SynthesisError("모델 응답이 JSON 객체가 아니다")
    ranking = parsed.get("ranking")
    rationale = parsed.get("rationale")
    insufficient = parsed.get("insufficient")
    if not isinstance(ranking, list) or not all(isinstance(x, str) for x in ranking):
        raise SynthesisError("ranking 이 문자열 배열이 아니다")
    if not isinstance(rationale, dict):
        raise SynthesisError("rationale 이 객체가 아니다")
    if not isinstance(insufficient, bool):
        raise SynthesisError("insufficient 가 bool 이 아니다")
    if set(ranking) != wanted_ids:
        raise SynthesisError("ranking 이 준 후보 집합과 다르다(추가·누락)")
    if len(ranking) != len(set(ranking)):
        raise SynthesisError("ranking 에 중복이 있다")
    for fm_id, entry in rationale.items():
        if fm_id not in wanted_ids:
            raise SynthesisError("rationale 에 준 적 없는 failureModeId 가 있다")
        if not isinstance(entry, dict):
            raise SynthesisError("rationale 원소가 객체가 아니다")
        sentences = entry.get("sentences")
        cited = entry.get("citedEvidenceIds")
        if not isinstance(sentences, list) or not sentences:
            raise SynthesisError("rationale.sentences 가 비었다")
        if not all(isinstance(s, str) and s.strip() for s in sentences):
            raise SynthesisError("rationale.sentences 에 빈 문장이 있다")
        if not isinstance(cited, list) or not cited:
            raise SynthesisError("rationale.citedEvidenceIds 가 비었다")
        unknown = [c for c in cited if not isinstance(c, str) or c not in evidence_ids]
        if unknown:
            raise SynthesisError(f"인용 id 가 준 근거 밖이다({len(unknown)}건)")
    return {"ranking": ranking, "rationale": rationale, "insufficient": insufficient}


def synthesize(req: dict) -> dict:
    request, evidence_text = _validate_request(req)
    wanted_ids = {c["failureModeId"] for c in request["candidates"]}
    evidence_ids = set(evidence_text.keys())

    argv = [
        CLI_BIN,
        "-p",
        "--output-format",
        "json",
        "--restricted",          # 실행계 도구·WebFetch 제거 + 사용자/프로젝트 settings 무시
        "--strict-mcp-config",   # MCP 서버 0
        "--system-prompt-file",
        str(SYSTEM_PROMPT_FILE),
    ]
    if MODEL:
        argv += ["--model", MODEL]

    prompt = json.dumps(
        {
            "anchor": request.get("anchor"),
            "candidates": request["candidates"],
            "evidenceText": evidence_text,
        },
        ensure_ascii=False,
    )

    started = time.perf_counter()
    # 빈 작업 디렉터리에서 돌린다 — 리포의 CLAUDE.md·설정이 프롬프트에 섞이지 않게.
    with tempfile.TemporaryDirectory(prefix="fkt-synth-") as cwd:
        try:
            proc = subprocess.run(
                argv,
                input=prompt.encode("utf-8"),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                timeout=TIMEOUT_MS / 1000.0,
            )
        except subprocess.TimeoutExpired:
            raise SynthesisError(f"CLI 타임아웃({TIMEOUT_MS}ms)", status=504) from None
        except FileNotFoundError:
            raise SynthesisError(f"CLI 를 찾지 못했다({CLI_BIN})", status=503) from None
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    if proc.returncode != 0:
        raise SynthesisError(f"CLI 종료코드 {proc.returncode}", status=502)

    try:
        envelope = json.loads(proc.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SynthesisError("CLI 봉투를 JSON 으로 읽지 못했다") from None
    if envelope.get("is_error"):
        raise SynthesisError(f"CLI 가 오류를 보고했다(subtype={envelope.get('subtype')})")

    raw = envelope.get("result")
    if not isinstance(raw, str) or not raw.strip():
        raise SynthesisError("CLI 응답에 result 문자열이 없다")

    try:
        parsed = json.loads(_strip_one_fence(raw))
    except json.JSONDecodeError:
        raise SynthesisError("모델 응답을 JSON 으로 읽지 못했다") from None

    out = _validate_response(parsed, wanted_ids, evidence_ids)
    out["model"] = _pick_model(envelope)
    out["elapsedMs"] = elapsed_ms
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "fkt-synthesis-gateway/0.1"

    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler 규약
        if self.path.rstrip("/") == "/health":
            self._send(200, {"ok": True, "timeoutMs": TIMEOUT_MS, "model": MODEL or "cli-default"})
            return
        self._send(404, {"rejectedReason": "없는 경로"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/synthesize":
            self._send(404, {"rejectedReason": "없는 경로"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send(400, {"rejectedReason": "Content-Length 가 수가 아니다"})
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send(413, {"rejectedReason": f"본문 크기 {length}B 가 한계를 벗어났다"})
            return
        body = self.rfile.read(length)
        try:
            req = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"rejectedReason": "본문을 JSON 으로 읽지 못했다"})
            return

        try:
            out = synthesize(req)
        except SynthesisError as exc:
            # 사유만 남긴다 — 프롬프트·근거 원문은 쓰지 않는다.
            self.log_message("synthesize 거부 · %s", exc.reason)
            self._send(exc.status, {"rejectedReason": exc.reason})
            return
        except Exception as exc:  # noqa: BLE001 — 게이트웨이가 조용히 죽지 않게
            self.log_message("synthesize 예외 · %s", type(exc).__name__)
            self._send(500, {"rejectedReason": f"게이트웨이 내부 오류({type(exc).__name__})"})
            return

        self.log_message(
            "synthesize 채택 · 후보 %d · 근거 %d · %dms · %s",
            len(req.get("candidates", [])),
            len(req.get("evidenceText", {})),
            out["elapsedMs"],
            out["model"],
        )
        self._send(200, out)


def main() -> int:
    if not SYSTEM_PROMPT_FILE.exists():
        print(f"시스템 프롬프트 파일이 없다: {SYSTEM_PROMPT_FILE}", file=sys.stderr)
        return 2
    # HTTPServer 는 단일 스레드다 — 「동시 1」이 구조로 보장된다(세마포어를 따로 두지 않는다).
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"synthesis-gateway · http://127.0.0.1:{PORT} · timeout {TIMEOUT_MS}ms · 동시 1")
    print(f"모델 = {MODEL or 'CLI 기본(미지정)'} · CLI = {CLI_BIN}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n내린다.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
