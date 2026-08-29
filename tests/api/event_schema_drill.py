"""event_schema_drill — 이벤트가 «스키마 정본» 그대로 나오는가 (검증 좌석 · T2-3).

🔴 이 그물이 지키는 문장 셋:
   ① **나가는 이벤트 전건이 `agent-events-v0.1` 스키마다.** 「대부분 맞다」는 계약 준수가 아니다.
      특히 `additionalProperties:false` — 스키마 밖 필드가 실려 나가는 것은 «조용한 계약 확장»이고,
      소비자는 그것을 모른 채 의존하게 된다.
   ② **`seq` 는 run 내 단조 증가하고 유일하다.** replay 재생 순서가 여기 걸려 있다(스키마 성문).
   ③ **WS 스트림과 `GET /runs/{id}/events` 가 같은 것을 말한다.** 두 원천이 갈리면 화면이 본
      타임라인과 되감기가 다른 조사가 된다.

🔴 **검증기를 내가 쓴다.** 구현이 어떤 검증기를 쓰든, 「쓴다고 적힌 것」과 「실제로 나가는 것」은
   다른 사건이다. 스키마 파일(`packages/contracts/agent-events-v0.1.schema.json`)을 매 실행
   읽어 아래 최소 검증기에 건다 — 이 리포는 `jsonschema` 를 의존에 두지 않으므로 스키마가
   쓰는 어휘(type·enum·const·required·properties·additionalProperties·items·minItems·minimum·
   $ref·allOf·if/then)만 구현했다. 스키마가 새 어휘를 쓰기 시작하면 **미지원을 조용히 통과시키지
   않고 «측정 불가»로 죽는다**(exit 2).

🔴 어휘 판정(오케 08-30 회부① 채택): T2-3 은 `kind` 를 **소비처 어휘로 통일**한다 —
   구조화 실체(AL·MR·EQ·CP…)는 `record` · 문서는 `doc-chunk` · 경로는 `graph-path`.
   **`alarm`·`sensor-series` 는 내지 않는다**(스키마 enum 상 유효하지만 같은 실체를 두 이름으로
   부르면 화면이 분기한다). 그래서 스키마 통과와 별개로 그 두 kind 의 «출현»을 red 로 센다.

전제: T2-3 라우트 해제 후. 🔴 미해제(501)면 red 가 아니라 **exit 2(측정 불가)** 다 —
「아직 안 만들었다」를 결함으로 세지 않는다.

    python tests/api/event_schema_drill.py --samples-only   # 서버 없이 검증기 자기 검증만
    python tests/api/event_schema_drill.py                  # + 실행 이벤트 전수

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "packages" / "contracts" / "agent-events-v0.1.schema.json"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-event-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")

# 오케 판정 08-30 — T2-3 이 «내지 않기로» 한 kind. 스키마는 허용하지만 어휘 통일이 우선한다.
FORBIDDEN_KINDS = {"alarm", "sensor-series"}
RFC3339 = re.compile(r"^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$")

SUPPORTED = {
    "$schema", "$id", "title", "description", "type", "required", "properties",
    "additionalProperties", "enum", "const", "items", "minItems", "minimum",
    "$ref", "allOf", "if", "then", "$defs", "format",
}


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


# ── 최소 JSON Schema 검증기 ──────────────────────────────────────────────────


class Validator:
    """스키마 정본이 쓰는 어휘만 구현한다. 모르는 어휘를 만나면 조용히 통과시키지 않는다."""

    def __init__(self, root: dict) -> None:
        self.root = root
        self._audit(root, "#")

    def _audit(self, node: Any, where: str) -> None:
        """🔴 미지원 어휘 조기 발견 — 「모르는 규칙을 안 본 것」이 초록이 되면 안 된다."""
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ("properties", "$defs"):
                    for name, sub in value.items():
                        self._audit(sub, f"{where}/{key}/{name}")
                    continue
                if key not in SUPPORTED:
                    raise DrillError(f"스키마가 미지원 어휘를 쓴다: {where} → {key!r}")
                self._audit(value, f"{where}/{key}")
        elif isinstance(node, list):
            for index, item in enumerate(node):
                self._audit(item, f"{where}[{index}]")

    def _deref(self, schema: dict) -> dict:
        ref = schema.get("$ref")
        if not ref:
            return schema
        if not ref.startswith("#/"):
            raise DrillError(f"외부 $ref 는 지원하지 않는다: {ref}")
        node: Any = self.root
        for part in ref[2:].split("/"):
            node = node[part]
        return node

    def errors(self, instance: Any, schema: dict | None = None, where: str = "") -> list[str]:
        schema = self.root if schema is None else self._deref(schema)
        out: list[str] = []
        kind = schema.get("type")
        if kind == "object" and not isinstance(instance, dict):
            return [f"{where or '$'}: object 가 아니다"]
        if kind == "array" and not isinstance(instance, list):
            return [f"{where or '$'}: array 가 아니다"]
        if kind == "string" and not isinstance(instance, str):
            return [f"{where or '$'}: string 이 아니다"]
        if kind == "integer" and (isinstance(instance, bool) or not isinstance(instance, int)):
            return [f"{where or '$'}: integer 가 아니다"]
        if kind == "number" and (isinstance(instance, bool) or not isinstance(instance, (int, float))):
            return [f"{where or '$'}: number 가 아니다"]
        if kind == "boolean" and not isinstance(instance, bool):
            return [f"{where or '$'}: boolean 이 아니다"]

        if "enum" in schema and instance not in schema["enum"]:
            out.append(f"{where or '$'}: enum 밖 값 {instance!r}")
        if "const" in schema and instance != schema["const"]:
            out.append(f"{where or '$'}: const {schema['const']!r} 와 다르다")
        if "minimum" in schema and isinstance(instance, (int, float)) and instance < schema["minimum"]:
            out.append(f"{where or '$'}: minimum {schema['minimum']} 미만")
        if "format" in schema and schema["format"] == "date-time" and isinstance(instance, str):
            if not RFC3339.match(instance):
                out.append(f"{where or '$'}: date-time 형식이 아니다 ({instance!r})")

        if isinstance(instance, dict):
            for key in schema.get("required", []):
                if key not in instance:
                    out.append(f"{where or '$'}: 필수 {key!r} 없음")
            props = schema.get("properties", {})
            if schema.get("additionalProperties") is False:
                for key in instance:
                    if key not in props:
                        out.append(f"{where or '$'}: 스키마 밖 필드 {key!r} — 조용한 계약 확장")
            for key, sub in props.items():
                if key in instance:
                    out += self.errors(instance[key], sub, f"{where}.{key}")

        if isinstance(instance, list):
            if "minItems" in schema and len(instance) < schema["minItems"]:
                out.append(f"{where or '$'}: minItems {schema['minItems']} 미만({len(instance)})")
            if "items" in schema:
                for index, item in enumerate(instance):
                    out += self.errors(item, schema["items"], f"{where}[{index}]")

        for branch in schema.get("allOf", []):
            if "if" in branch:
                if not self.errors(instance, branch["if"], where):
                    out += self.errors(instance, branch.get("then", {}), where)
            else:
                out += self.errors(instance, branch, where)
        return out


# ── 자기 검증 ────────────────────────────────────────────────────────────────


def good_event(**over: Any) -> dict:
    base = {
        "runId": "RUN-1", "seq": 0, "ts": "2026-08-30T01:00:00Z", "mode": "live",
        "type": "step.started", "payload": {"step": "vector"},
    }
    base.update(over)
    return base


SAMPLES: list[tuple[str, dict, bool]] = [
    ("계약 형상", good_event(), True),
    ("필수 필드 누락", {k: v for k, v in good_event().items() if k != "seq"}, False),
    ("type enum 밖", good_event(type="step.magic"), False),
    ("payload 결속 위반", good_event(type="step.completed", payload={"step": "vector"}), False),
    ("stepId enum 밖", good_event(payload={"step": "rerank"}), False),
    ("스키마 밖 필드", good_event(extra="x"), False),
    ("payload 안 스키마 밖 필드", good_event(payload={"step": "vector", "cost": 1}), False),
    ("seq 음수", good_event(seq=-1), False),
    ("ts 형식 위반", good_event(ts="2026-08-30 01:00"), False),
    ("candidates 빈 배열", good_event(type="run.completed", payload={"candidates": []}), False),
    ("doc-chunk 신뢰필드 누락", good_event(
        type="step.evidence",
        payload={"step": "vector", "evidence": {
            "evidenceId": "DOC-SOP-0014@r2#001", "kind": "doc-chunk", "sourceId": "DOC-SOP-0014"}},
    ), False),
]


def self_check(validator: Validator) -> None:
    """🔴 검증기가 «빨강을 낼 수 있는가»부터. 통과만 하는 검증기는 아무것도 보증하지 않는다."""
    bad = 0
    for name, sample, expected_ok in SAMPLES:
        errs = validator.errors(sample)
        ok = not errs
        if ok is not expected_ok:
            bad += 1
            print(f"  FAIL  자기 검증 «{name}» — {ok} 로 판정했다 {errs[:1]}")
    if bad:
        raise DrillError(f"자기 검증 {bad}건 실패 — 검사기가 죽었다")
    breaks = sum(1 for _, _, ok in SAMPLES if not ok)
    print(f"  자기 검증  표본 {len(SAMPLES)}종(계약 형상 1 · 이탈 {breaks}) 전건 기대대로 — 검증기 살아 있음")


# ── HTTP ────────────────────────────────────────────────────────────────────


def request(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def start_run() -> str:
    status, body = request("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": "live"})
    if status == 501:
        raise DrillError("runs 표면이 아직 501 이다 — 미해제는 결함이 아니다(측정 불가)")
    if status != 200:
        raise DrillError(f"run 생성이 {status} 를 냈다: {str(body)[:160]}")
    run_id = (body or {}).get("runId")
    if not run_id:
        raise DrillError(f"응답에 runId 가 없다: {str(body)[:160]}")
    return run_id


def settle(run_id: str) -> str:
    """🔴 run 이 끝나기를 기다린다 — 실행 «중»의 타임라인은 당연히 안 닫혀 있다.

    처음 이 드릴은 run 생성 직후 이벤트를 읽어 `S-05`(타임라인이 닫힌다)에 red 를 냈다.
    대상의 결함이 아니라 **내가 너무 일찍 본 것**이었다. 빨강도 그 주어를 물어야 한다.
    """
    import time as _time

    deadline = _time.time() + 180
    status = "running"
    while _time.time() < deadline:
        code, snap = request("GET", f"/api/runs/{run_id}")
        if code != 200 or not isinstance(snap, dict):
            raise DrillError(f"/runs/{run_id} 가 {code} 를 냈다")
        status = str(snap.get("status"))
        if status != "running":
            return status
        _time.sleep(1)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다 — 측정 불가")


def ws_events(run_id: str, expect: int) -> list[dict] | None:
    """WS 로 같은 run 을 받아 본다. 🔴 두 원천이 갈리면 «본 타임라인»과 «되감기»가 다른 조사가 된다.

    라이브러리가 없거나 WS 가 열려 있지 않으면 None — 그때는 이 행을 «못 쟀다»로 적는다.
    """
    try:
        import asyncio

        import websockets
    except Exception:                               # noqa: BLE001
        return None

    async def drain() -> list[dict]:
        url = API_BASE.replace("http://", "ws://").replace("https://", "wss://")
        out: list[dict] = []
        async with websockets.connect(f"{url}/api/ws/runs/{run_id}", open_timeout=10) as socket:
            while len(out) < expect:
                raw = await asyncio.wait_for(socket.recv(), timeout=15)
                out.append(json.loads(raw))
        return out

    try:
        return asyncio.run(drain())
    except Exception:                               # noqa: BLE001 - 못 받은 것은 결과가 아니다
        return None


def fetch_events(run_id: str) -> list[dict]:
    status, body = request("GET", f"/api/runs/{run_id}/events")
    if status == 501:
        raise DrillError("/runs/{id}/events 가 아직 501 이다(측정 불가)")
    if status != 200 or not isinstance(body, list):
        raise DrillError(f"/events 가 배열을 주지 않는다: {status} {str(body)[:160]}")
    return body


# ── 본 시험 ─────────────────────────────────────────────────────────────────


def judge(validator: Validator, events: list[dict]) -> int:
    if not events:
        # 🔴 빈 결과끼리의 일치는 일치가 아니다(7대 유언). 잴 것이 없으면 «측정 불가»다.
        raise DrillError("이벤트가 0건이다 — 초록이 아니라 고장이다")

    bad = 0
    offenders: list[str] = []
    for index, event in enumerate(events):
        errs = validator.errors(event)
        if errs:
            offenders.append(f"[{index}] {event.get('type')}: {errs[0]}")
    ok = not offenders
    bad += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  S-01 이벤트 {len(events)}건 전건 스키마 준수")
    for line in offenders[:5]:
        print(f"        {line}")

    seqs = [e.get("seq") for e in events]
    monotonic = all(isinstance(s, int) for s in seqs) and seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    bad += 0 if monotonic else 1
    print(f"  {'PASS' if monotonic else 'FAIL'}  S-02 seq 단조 증가 · 유일 — {seqs[:6]}{'…' if len(seqs) > 6 else ''}")

    run_ids = {e.get("runId") for e in events}
    one_run = len(run_ids) == 1
    bad += 0 if one_run else 1
    print(f"  {'PASS' if one_run else 'FAIL'}  S-03 한 run 의 이벤트만 — {sorted(map(str, run_ids))[:3]}")

    kinds = {
        (e.get("payload") or {}).get("evidence", {}).get("kind")
        for e in events if e.get("type") == "step.evidence"
    } - {None}
    forbidden = kinds & FORBIDDEN_KINDS
    clean = not forbidden
    bad += 0 if clean else 1
    print(f"  {'PASS' if clean else 'FAIL'}  S-04 어휘 통일 — kind {sorted(kinds) or '없음'}"
          f"{' · 금지 kind ' + str(sorted(forbidden)) if forbidden else ''}")

    types = [e.get("type") for e in events]
    opened = types and types[0] == "run.started"
    closed = types and types[-1] in ("run.completed", "run.stopped", "run.failed")
    framed = bool(opened and closed)
    bad += 0 if framed else 1
    print(f"  {'PASS' if framed else 'FAIL'}  S-05 타임라인이 열리고 닫힌다 — 처음 {types[0]} · 끝 {types[-1]}")

    streamed = ws_events(str(events[0].get("runId")), len(events))
    if streamed is None:
        print("  ----  S-06 WS 스트림 ≡ /events — 🔴 못 쟀다(WS 를 받지 못했다). 초록으로 세지 않는다")
    else:
        same = [(e.get("seq"), e.get("type")) for e in streamed] == [(e.get("seq"), e.get("type")) for e in events]
        bad += 0 if same else 1
        print(f"  {'PASS' if same else 'FAIL'}  S-06 WS 스트림 ≡ /events — WS {len(streamed)}건 · REST {len(events)}건")
    return bad


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    samples_only = "--samples-only" in sys.argv

    if not SCHEMA.exists():
        raise DrillError(f"스키마 정본 없음: {SCHEMA}")
    validator = Validator(json.loads(SCHEMA.read_text(encoding="utf-8")))

    print(f"정본      : {SCHEMA.relative_to(REPO)}")
    print(f"대상      : {API_BASE}{' (서버 미사용 — 자기 검증만)' if samples_only else ''}\n")
    self_check(validator)
    if samples_only:
        print("\n결과: 자기 검증만 돌렸다 — 대상 판정 아님")
        return 0

    run_id = start_run()
    status = settle(run_id)
    print(f"\n  run     {run_id} · status={status}")
    bad = judge(validator, fetch_events(run_id))
    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
