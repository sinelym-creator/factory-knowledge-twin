"""t6_synthesis_latency_drill — 합성 «지연 × 품질» 축 드릴 (검증 좌석 · 29대 · 폐하 하명 07:36).

물음: **레이턴시를 줄이면서 결과 품질을 올릴 손잡이가 있는가.**

🔴 **게이트웨이 프로세스를 거치지 않고 CLI 를 «같은 argv» 로 직접 부른다.** 이유는 하나다 —
   게이트웨이는 CLI 봉투에서 요약만 꺼내고 **`usage` 를 버린다**(gateway.py 는 duration 둘만
   `_log` 에 남긴다). 토큰 축(b)은 봉투가 없으면 못 잰다. 대신 조건을 맞추기 위해 argv 를
   게이트웨이와 **한 글자씩 같게** 짠다(`--restricted`·`--strict-mcp-config`·같은
   `system_prompt.txt`·`-p`·`--output-format json`). 그래서 이 드릴이 재는 것은 **CLI 층**이고,
   게이트웨이 층의 오버헤드는 여기 없다(그 축은 «벽시계 − CLI 내부» 로 따로 읽는다).

🔴 **모든 열에 «같은 입력»** — 녹화본 `data/replay/gs-01.events.jsonl` 에서 결정적으로 조립해
   파일로 굳히고 **sha256 을 매 행에 적는다**. 열마다 입력이 흔들리면 지연 차이는 손잡이의 것이
   아니다. (안 잰 것: ai-api 의 `_request_body` 가 만드는 «바로 그 바이트»와의 동일성 — 이 드릴은
   ai-api 를 띄우지 않는다.)

🔴 **구독은 유한하다.** 매 호출이 소모다. `--max-calls` 를 넘기면 **재기 전에 거부**한다.
   실패한 호출도 소모이므로, 한 열을 늘리기 전에 형상부터 1회로 확인하라.

    python tests/api/t6_synthesis_latency_drill.py --effort low --n 2 --max-calls 2
    python tests/api/t6_synthesis_latency_drill.py --warmup            # (c) 빈 호출 1회
    python tests/api/t6_synthesis_latency_drill.py --stream            # (d) 첫 청크 도착

출력: `--out` JSONL 에 append(기본 `benchmarks/t6-latency-calls.jsonl`) + 표 1줄씩 stdout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve()
REPO = HERE.parents[2]
EVENTS = REPO / "data" / "replay" / "gs-01.events.jsonl"
GATEWAY_DIR = REPO / "services" / "synthesis-gateway"
SYSTEM_PROMPT = GATEWAY_DIR / "system_prompt.txt"
CLI = os.environ.get("SYNTHESIS_CLI_BIN", "claude")
TRUTH_TOP = "FM-BRG-WEAR"  # 녹화본 1순위 — «정답»이 아니라 «녹화본 일치» 축이다
_MAX_EXCERPT = 600


def build_input() -> dict:
    """녹화본에서 게이트웨이 요청 형상을 결정적으로 조립한다."""
    evs = [json.loads(l) for l in EVENTS.open(encoding="utf-8") if l.strip()]
    started = next(e for e in evs if e["type"] == "run.started")
    completed = next(e for e in evs if e["type"] == "run.completed")

    evidence_text: dict[str, str] = {}
    for e in evs:
        if e["type"] != "step.evidence":
            continue
        item = e["payload"]["evidence"]
        eid, excerpt = item.get("evidenceId"), item.get("excerpt")
        if isinstance(eid, str) and isinstance(excerpt, str):
            evidence_text[eid] = excerpt[:_MAX_EXCERPT]

    candidates = [
        {
            "failureModeId": c["failureModeId"],
            "label": c.get("label"),
            "evidenceIds": c.get("evidenceIds", []),
        }
        for c in sorted(completed["payload"]["candidates"], key=lambda c: c.get("rank", 99))
    ]
    return {
        "anchor": {"scenarioId": started["payload"].get("scenarioId"),
                   "alarmId": "AL-20260826-0041", "equipmentId": "EQ-CNC-204"},
        "candidates": candidates,
        "evidenceText": evidence_text,
    }


def argv_for(effort: str, model: str, stream: bool) -> list[str]:
    """🔴 게이트웨이(gateway.py:176-190)와 «같은» argv. 다른 것은 effort/model/출력형식뿐."""
    argv = [CLI, "-p", "--output-format", "stream-json" if stream else "json",
            "--restricted", "--strict-mcp-config",
            "--system-prompt-file", str(SYSTEM_PROMPT)]
    if stream:
        argv += ["--verbose"]  # stream-json 은 verbose 를 요구한다(CLI 규칙)
    if model:
        argv += ["--model", model]
    if effort:
        argv += ["--effort", effort]
    return argv


def strip_fence(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def quality(parsed: object, want_ids: set[str], evidence_ids: set[str]) -> dict:
    """품질 축 — «맞았나»가 아니라 **무엇을 세었나**를 남긴다."""
    if not isinstance(parsed, dict):
        return {"parsed": False}
    ranking = parsed.get("ranking") if isinstance(parsed.get("ranking"), list) else []
    rationale = parsed.get("rationale") if isinstance(parsed.get("rationale"), dict) else {}
    cited: list[str] = []
    sentences = 0
    for v in rationale.values():
        if not isinstance(v, dict):
            continue
        ss = v.get("sentences")
        if isinstance(ss, list):
            sentences += len(ss)
        cs = v.get("citedEvidenceIds")
        if isinstance(cs, list):
            cited += [c for c in cs if isinstance(c, str)]
    outside = [c for c in cited if c not in evidence_ids]
    return {
        "parsed": True,
        "top": ranking[0] if ranking else None,
        "topMatchesRecording": bool(ranking) and ranking[0] == TRUTH_TOP,
        "reordered": bool(ranking) and ranking != sorted(ranking, key=lambda x: list(want_ids).index(x))
        if False else (bool(ranking) and ranking[0] != TRUTH_TOP),
        "citations": len(cited),
        "citationsOutside": len(outside),
        "outsideIds": sorted(set(outside))[:5],
        "sentences": sentences,
        "insufficient": parsed.get("insufficient"),
    }


def usage_of(envelope: dict) -> dict:
    u = envelope.get("usage")
    if not isinstance(u, dict):
        return {}
    return {k: u.get(k) for k in
            ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}


def run_once(prompt: str, effort: str, model: str, want_ids: set[str],
             evidence_ids: set[str], label: str) -> dict:
    argv = argv_for(effort, model, stream=False)
    t0 = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="fkt-drill3-") as cwd:
        proc = subprocess.run(argv, input=prompt.encode("utf-8"), stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, cwd=cwd, timeout=300)
    wall = int((time.perf_counter() - t0) * 1000)
    row = {"label": label, "effort": effort or "cli-default", "model": model or "cli-default",
           "wallMs": wall, "rc": proc.returncode}
    if proc.returncode != 0:
        row["error"] = proc.stderr.decode("utf-8", "replace")[:300]
        return row
    try:
        env = json.loads(proc.stdout.decode("utf-8", "replace"))
    except json.JSONDecodeError:
        row["error"] = "봉투를 JSON 으로 못 읽었다"
        return row
    row["cliMs"] = env.get("duration_ms")
    row["cliApiMs"] = env.get("duration_api_ms")
    row["numTurns"] = env.get("num_turns")
    row["isError"] = env.get("is_error")
    row["modelUsed"] = ",".join(sorted((env.get("modelUsage") or {}).keys())) or None
    row["usage"] = usage_of(env)
    raw = env.get("result")
    try:
        row["quality"] = quality(json.loads(strip_fence(raw)) if isinstance(raw, str) else None,
                                 want_ids, evidence_ids)
    except json.JSONDecodeError:
        row["quality"] = {"parsed": False, "why": "모델 응답이 JSON 이 아니다"}
    return row


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--effort", default="medium")
    ap.add_argument("--model", default="opus")
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--max-calls", type=int, default=2)
    ap.add_argument("--out", default=str(REPO / "benchmarks" / "t6-latency-calls.jsonl"))
    ap.add_argument("--warmup", action="store_true", help="(c) 빈 프롬프트 1회 — 기동 오버헤드")
    ap.add_argument("--stream", action="store_true", help="(d) stream-json 1회 — 첫 청크 도착")
    args = ap.parse_args()

    planned = 1 if (args.warmup or args.stream) else args.n
    if planned > args.max_calls:
        print(f"⚪ 거부 — 계획 호출 {planned}회가 --max-calls {args.max_calls} 를 넘는다. "
              f"구독은 유한하다(실패한 호출도 소모다).")
        return 2

    data = build_input()
    prompt = json.dumps(data, ensure_ascii=False)
    sha = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12]
    evidence_ids = set(data["evidenceText"].keys())
    want_ids = {c["failureModeId"] for c in data["candidates"]}
    print(f"== 입력 고정 · sha256[:12]={sha} · 근거 {len(evidence_ids)}건 · 후보 {len(want_ids)}건 "
          f"· 프롬프트 {len(prompt)}자")

    out = Path(args.out)
    rows = []

    if args.warmup:
        # (c) 기동 오버헤드 — 빈 프롬프트. 「프로세스 spawn + 인증/설정 로드」가 이 벽시계에 든다.
        t0 = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="fkt-drill3-") as cwd:
            proc = subprocess.run(argv_for("", args.model, stream=False), input=b"",
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd, timeout=180)
        wall = int((time.perf_counter() - t0) * 1000)
        env = {}
        try:
            env = json.loads(proc.stdout.decode("utf-8", "replace"))
        except json.JSONDecodeError:
            pass
        row = {"label": "warmup(빈 프롬프트)", "wallMs": wall, "rc": proc.returncode,
               "cliMs": env.get("duration_ms"), "cliApiMs": env.get("duration_api_ms"),
               "usage": usage_of(env), "inputSha": sha}
        row["spawnPlusAuthMs"] = wall - (env.get("duration_ms") or 0)
        rows.append(row)
        print(f"  warmup: 벽시계 {wall}ms · CLI 내부 {env.get('duration_ms')}ms · "
              f"api {env.get('duration_api_ms')}ms → 벽시계−CLI = {row['spawnPlusAuthMs']}ms")

    elif args.stream:
        # (d) 첫 청크 도착 — 체감 지연 축. 스트림을 «받은 시각»으로 잰다(자기 신고 아님).
        argv = argv_for("medium", args.model, stream=True)
        t0 = time.perf_counter()
        first_ms = None
        chunks = 0
        with tempfile.TemporaryDirectory(prefix="fkt-drill3-") as cwd:
            proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, cwd=cwd)
            proc.stdin.write(prompt.encode("utf-8"))
            proc.stdin.close()
            for line in proc.stdout:
                if not line.strip():
                    continue
                chunks += 1
                if first_ms is None:
                    first_ms = int((time.perf_counter() - t0) * 1000)
            proc.wait(timeout=300)
        wall = int((time.perf_counter() - t0) * 1000)
        rows.append({"label": "stream(첫 청크)", "wallMs": wall, "firstChunkMs": first_ms,
                     "chunks": chunks, "rc": proc.returncode, "inputSha": sha})
        print(f"  stream: 첫 청크 {first_ms}ms · 전체 {wall}ms · 청크 {chunks}개 · rc={proc.returncode}")

    else:
        for i in range(1, args.n + 1):
            row = run_once(prompt, args.effort, args.model, want_ids, evidence_ids,
                           f"{args.model}/{args.effort} #{i}")
            row["inputSha"] = sha
            rows.append(row)
            q = row.get("quality") or {}
            print(f"  {row['label']}: 벽시계 {row['wallMs']}ms · CLI {row.get('cliMs')}ms · "
                  f"api {row.get('cliApiMs')}ms · out {row.get('usage', {}).get('output_tokens')}tok · "
                  f"top={q.get('top')} 인용 {q.get('citations')}({q.get('citationsOutside')} 밖) · "
                  f"문장 {q.get('sentences')} · insufficient={q.get('insufficient')}")

    with out.open("a", encoding="utf-8") as f:
        for r in rows:
            r["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"  → {out} 에 {len(rows)}행 append")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
