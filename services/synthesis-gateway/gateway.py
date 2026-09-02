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

import hmac
import ipaddress
import json
import os
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# 🔴 콘솔 코드페이지에 관계없이 한국어·기호를 찍는다. Windows 기본 콘솔은 cp949 라
#    「—」 같은 글자 하나로 print 가 UnicodeEncodeError 를 내고, 그러면 게이트웨이가
#    «기동 중에» 죽는다(실측 09-02 23:0x — 로그 한 줄이 서비스를 죽였다).
#    errors="replace" 까지 거는 이유: 앞으로 어떤 글자가 들어와도 로그가 서비스를
#    죽이지는 못하게 한다. 못 그리는 글자는 물음표로 나오면 된다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

HERE = Path(__file__).resolve().parent
SYSTEM_PROMPT_FILE = HERE / "system_prompt.txt"

# 박은 값 0 — 포트·타임아웃·CLI 경로·모델은 여기 한 곳에서만 읽는다.
# 기본은 루프백이다 — 배포 컨테이너에서 닿게 하려면 «명시적으로» 0.0.0.0 을 준다.
BIND = os.environ.get("SYNTHESIS_GATEWAY_BIND", "127.0.0.1").strip() or "127.0.0.1"
# 설정하면 모든 요청이 이 값을 `X-FKT-Gateway-Token` 으로 들고 와야 한다. 로그에 남기지 않는다.
TOKEN = os.environ.get("SYNTHESIS_GATEWAY_TOKEN", "").strip()
PORT = int(os.environ.get("SYNTHESIS_GATEWAY_PORT", "8787"))
# 🔴 **클라이언트와 «다른 이름»을 읽는다**(32대 09-03). 예전엔 ai-api 의 예산과 이 상한이
#    둘 다 `SYNTHESIS_TIMEOUT_MS` 였다 — 한 셸에서 export 하면 두 값이 «함께» 움직여서
#    「게이트웨이가 먼저 504 로 사유를 내고, 클라이언트는 조금 더 기다린다」는 설계가 통째로
#    무력화된다(그러면 어느 쪽이 끊었는지 사후에 가릴 수 없다).
#    불변식: **이 상한 < ai-api 예산**(= `SYNTHESIS_TIMEOUT_MS` + 5s margin).
TIMEOUT_ENV = "SYNTHESIS_GATEWAY_TIMEOUT_MS"
_LEGACY_TIMEOUT_ENV = "SYNTHESIS_TIMEOUT_MS"
TIMEOUT_MS = int(os.environ.get(TIMEOUT_ENV, "60000"))
CLI_BIN = os.environ.get("SYNTHESIS_CLI_BIN", "claude")
# 기본 = `opus`(운영자 결정 09-03 07:36). 빈 문자열을 «명시적으로» 주면 CLI 기본으로 돌아간다.
# 🔴 고를 때는 재고 고른다 — 09-03 재측(같은 입력 GS-01 · effort=medium · 합성 단계 벽시계):
#    opus 10.5~10.6s · sonnet 14.8~15.2s(n=4) · haiku 44.7~60.1s(n=3). 품질 지표(1순위 정답
#    일치 · 인용 집합 밖 0 · 가드 거부 0 · insufficient=False · 재정렬 0)는 세 모델이 «동률»
#    이었고 갈린 축은 지연뿐이다. 「작은 모델이 빠르다」는 두 번 다 실측이 반증했다.
MODEL = os.environ.get("SYNTHESIS_MODEL", "opus").strip()
# 사고 깊이. 빈 문자열을 주면 플래그 자체를 안 붙인다(CLI 기본).
# 기본 = `low`(운영자 결정 09-03 07:59). 근거 = effort 축 실측(리바이2 드릴 3 n=2)에서 low 가
# 지연을 줄이면서 객관 품질 지표를 떨어뜨리지 않았다 — n=3 재확인은 T6-2 검증 축 ⑤가 맡는다.
# 🔴 이 값이 **유일한 선언 자리**다. run.ps1·switch.ps1 은 «전달»만 하고 기본값을 다시 적지
#    않는다 — 두 곳에 적으면 한쪽만 고치는 날 「어느 쪽이 기본인가」가 갈린다.
EFFORT = os.environ.get("SYNTHESIS_EFFORT", "low").strip()

TOKEN_HEADER = "X-FKT-Gateway-Token"
MAX_BODY_BYTES = 1 * 1024 * 1024
UNKNOWN_MODEL = "claude-code-cli:unknown"
FENCE = "```"


def is_loopback(host: str) -> bool:
    """이 주소로 뜨면 이 머신 밖에서 못 닿는가.

    이름은 풀지 않는다 — 못 읽는 값은 「루프백이 아니다」로 본다. 판정이 틀릴 때 안전한
    쪽으로 틀리게 하려는 것이다(토큰 없이 열리는 것보다 기동을 거부하는 편이 낫다).
    """
    if host in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


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
    if EFFORT:
        argv += ["--effort", EFFORT]

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
    # 응답 형상은 안 늘린다. 대신 「벽시계 − CLI 내부」로 기동 오버헤드를 읽을 수 있게
    # 로그로만 남긴다(운영자 실측용 · 프롬프트 원문은 여전히 0).
    out["_log"] = {
        "cliDurationMs": envelope.get("duration_ms"),
        "cliApiDurationMs": envelope.get("duration_api_ms"),
    }
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

    def _authorized(self) -> bool:
        """토큰이 설정돼 있으면 모든 라우트가 그것을 요구한다.

        🔴 `/health` 를 예외로 두지 않는다. 예외가 하나 생기면 「어디는 열려 있고 어디는
           아닌가」를 매번 다시 따져야 하고, 그 표가 곧 낡는다. ai-api 의 도달 프로브는
           토큰을 들고 오므로 예외가 필요하지도 않다.
        """
        if not TOKEN:
            return True
        given = self.headers.get(TOKEN_HEADER) or ""
        return hmac.compare_digest(given, TOKEN)

    def _reject_unauthorized(self) -> None:
        # 사유에 토큰을 싣지 않는다 — 맞았는지 틀렸는지만 말한다.
        self.log_message("%s 거부 · 토큰 불일치", self.path)
        self._send(401, {"rejectedReason": f"{TOKEN_HEADER} 가 없거나 맞지 않는다"})

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler 규약
        if not self._authorized():
            self._reject_unauthorized()
            return
        if self.path.rstrip("/") == "/health":
            self._send(
                200,
                {
                    "ok": True,
                    "timeoutMs": TIMEOUT_MS,
                    "model": MODEL or "cli-default",
                    "effort": EFFORT or "cli-default",
                },
            )
            return
        self._send(404, {"rejectedReason": "없는 경로"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            self._reject_unauthorized()
            return
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

        detail = out.pop("_log", {})
        # 🔴 `insufficient` 와 인용 수를 «로그에» 남긴다(32대 09-03). 응답 원문은 어디에도
        #    저장하지 않는 규율이라, 이 줄이 남지 않으면 나중에 「그 회차가 무엇을 답했나」를
        #    다시 물을 방법이 구독을 또 쓰는 것뿐이다 — 실제로 그 값을 치렀다(드릴 1 재사용 0).
        self.log_message(
            "synthesize 채택 · 후보 %d · 근거 %d · 벽시계 %dms · CLI 내부 %s/%s ms · %s · "
            "model=%s effort=%s · insufficient=%s · 순위=%s · 인용수=%s",
            len(req.get("candidates", [])),
            len(req.get("evidenceText", {})),
            out["elapsedMs"],
            detail.get("cliDurationMs"),
            detail.get("cliApiDurationMs"),
            out["model"],
            MODEL or "cli-default",
            EFFORT or "cli-default",
            out.get("insufficient"),
            ",".join(out.get("ranking", [])),
            ",".join(
                f"{k}:{len(v.get('citedEvidenceIds', []))}"
                for k, v in (out.get("rationale") or {}).items()
            ),
        )
        self._send(200, out)


def main() -> int:
    # 🔴 구 이름만 준 채로 뜨면 «설정했다고 믿는» 상태가 된다 — 값은 기본 60000 인데
    #    운영자는 자기가 준 값이 걸린 줄 안다. 조용히 지나가지 않게 소리 낸다.
    if os.environ.get(_LEGACY_TIMEOUT_ENV) and not os.environ.get(TIMEOUT_ENV):
        print(
            f"경고 — {_LEGACY_TIMEOUT_ENV} 는 이제 ai-api «클라이언트 예산»의 이름이다. "
            f"이 게이트웨이의 상한은 {TIMEOUT_ENV} 로 준다(지금 값 {TIMEOUT_MS}ms = 기본값).",
            file=sys.stderr,
        )
    if not SYSTEM_PROMPT_FILE.exists():
        print(f"시스템 프롬프트 파일이 없다: {SYSTEM_PROMPT_FILE}", file=sys.stderr)
        return 2
    if not is_loopback(BIND) and not TOKEN:
        # 🔴 소리 내어 거부한다. 이 조합은 「이 머신 밖에서 인증 없이 구독을 쓸 수 있다」다 —
        #    떠 버린 뒤에 알아차리면 이미 열려 있었던 시간이 생긴다.
        print(
            f"기동 거부 — SYNTHESIS_GATEWAY_BIND={BIND} 는 루프백이 아닌데 "
            "SYNTHESIS_GATEWAY_TOKEN 이 없다. 토큰을 주거나 루프백으로 뜨라.",
            file=sys.stderr,
        )
        return 4

    # HTTPServer 는 단일 스레드다 — 「동시 1」이 구조로 보장된다(세마포어를 따로 두지 않는다).
    server = HTTPServer((BIND, PORT), Handler)
    print(f"synthesis-gateway · http://{BIND}:{PORT} · timeout {TIMEOUT_MS}ms · 동시 1")
    print(f"모델 = {MODEL or 'CLI 기본(미지정)'} · effort = {EFFORT or 'CLI 기본'} · CLI = {CLI_BIN}")
    # 값이 아니라 «있다/없다»만 말한다.
    print(f"토큰 = {'설정됨(모든 라우트가 요구한다)' if TOKEN else '없음 — 루프백 전용'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n내린다.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
