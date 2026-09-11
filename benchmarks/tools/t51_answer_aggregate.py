#!/usr/bin/env python3
"""T5-1F 답변 축 재집계 — `eval-answer-raw-v0.3~v0.6*.jsonl` 전수를 raw 에서 다시 센다.

🔴 **분모를 먼저 말한다.** 이 파일들은 **같은 앵커 1문(`Q-MULTIHOP-001` · GS-01)** 을 n 회 돌린 것이다.
   40문 데이터셋의 일반화가 **아니다** — 표의 모든 수는 「1문 × n run」이다.

🔴 **지표 5(무근거 주장) = 0 은 구조적 0 이다**(가드가 채택 «전»에 전량 거부한다). 이 스크립트는
   그 0 을 «답변 품질»로 계산하지 않는다 — 세는 것은 「이 raw 에 그 값이 있는가」까지다.

각 run 에서 세는 것:
  - 지표 1(자산 식별) : 답변 본문(A 열 = 채택 후보 `rationale.sentences`)에 정답 설비 id 가 있는가
                        · B 열(A + `step.evidence` 발췌)도 따로 센다(두 사실을 한 숫자로 접지 않는다)
  - 지표 6(안전규정 누락) : `SAF-LOTO-01` id 와 별칭 `LOTO` 를 A·B 두 열에서
  - 지표 8(지연) : run 의 `wallMs`
  - 합성 축·모델 : `step.completed(synthesize).payload.synthesis`
"""

from __future__ import annotations

import sys as _sys

for _s in (_sys.stdout, _sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass

import hashlib
import json
import os
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / "benchmarks"

ASSET_IDS = ["EQ-CNC-204"]            # ground-truth `Q-MULTIHOP-001` 의 정답 설비
SAFETY_ID = "SAF-LOTO-01"
SAFETY_ALIAS = "LOTO"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def answer_text(row: dict) -> str:
    """A 열 = 채택된 후보들의 문장 전부."""
    out = []
    for c in row.get("candidates") or []:
        for s in ((c.get("rationale") or {}).get("sentences") or []):
            if isinstance(s, str):
                out.append(s)
    return "\n".join(out)


def evidence_text(row: dict) -> str:
    """B 열의 나머지 절반 = `step.evidence` 발췌 전문.

    🔴 `payload.evidence` 는 **객체 1건**이다(배열이 아니다). 첫 판은 배열로 읽어
       dict 를 순회했고, 그 결과 «키 이름»만 모아 B 열이 통째로 빈 문자열이 됐다 —
       B 열이 0/3 으로 나온 것은 대상이 아니라 내 추출기였다. 모양을 실측해 고쳤다.
    """
    out = []
    for e in row.get("events") or []:
        if e.get("type") != "step.evidence":
            continue
        ev = (e.get("payload") or {}).get("evidence")
        items = ev if isinstance(ev, list) else ([ev] if ev else [])
        for item in items:
            out.append(json.dumps(item, ensure_ascii=False) if isinstance(item, dict) else str(item))
    return chr(10).join(out)


def synthesis_of(row: dict) -> dict:
    for e in row.get("events") or []:
        syn = (e.get("payload") or {}).get("synthesis")
        if syn:
            return syn
    return {}


def main() -> int:
    files = sorted(p for p in BENCH.glob("eval-answer-raw-v0.*.jsonl"))
    report: dict = {"note": "같은 앵커 1문(GS-01 · Q-MULTIHOP-001)을 n 회 돌린 것이다. 40문 일반화가 아니다.",
                    "files": [], "totals": {}}
    all_wall: list[int] = []
    total_runs = 0
    for path in files:
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        per = []
        for row in rows:
            a = answer_text(row)
            b = a + "\n" + evidence_text(row)
            syn = synthesis_of(row)
            per.append({
                "runId": row.get("runId"),
                "ok": row.get("ok"),
                "status": row.get("status"),
                "wallMs": row.get("wallMs"),
                "answerChars": len(a),
                "sentences": sum(len(((c.get("rationale") or {}).get("sentences") or []))
                                 for c in (row.get("candidates") or [])),
                "metric1_assetInAnswer": all(i in a for i in ASSET_IDS),
                "metric1_assetInAnswerPlusEvidence": all(i in b for i in ASSET_IDS),
                "metric6_safetyNamedInAnswer": (SAFETY_ID in a) or (SAFETY_ALIAS in a),
                "metric6_safetyNamedInAnswerPlusEvidence": (SAFETY_ID in b) or (SAFETY_ALIAS in b),
                "axis": syn.get("axis"),
                "model": syn.get("model"),
                "safetyOmittedFlag": syn.get("safetyOmitted"),
                "calls": syn.get("calls"),
            })
        walls = [p["wallMs"] for p in per if isinstance(p.get("wallMs"), int)]
        all_wall += walls
        total_runs += len(per)
        report["files"].append({
            "path": str(path.relative_to(ROOT)).replace(os.sep, "/"),
            "sha256": sha256(path),
            "runs": len(per),
            "okRuns": sum(1 for p in per if p["ok"]),
            "models": sorted({p["model"] for p in per if p["model"]}),
            "axes": sorted({p["axis"] for p in per if p["axis"]}),
            "metric1_answerOnly": f'{sum(1 for p in per if p["metric1_assetInAnswer"])}/{len(per)}',
            "metric1_withEvidence": f'{sum(1 for p in per if p["metric1_assetInAnswerPlusEvidence"])}/{len(per)}',
            "metric6_omittedInAnswer": f'{sum(1 for p in per if not p["metric6_safetyNamedInAnswer"])}/{len(per)}',
            "metric6_omittedWithEvidence": f'{sum(1 for p in per if not p["metric6_safetyNamedInAnswerPlusEvidence"])}/{len(per)}',
            "safetyOmittedFlagPresent": sum(1 for p in per if p["safetyOmittedFlag"] is not None),
            "callsFieldPresent": sum(1 for p in per if p["calls"] is not None),
            "wallMs": {"min": min(walls) if walls else None, "max": max(walls) if walls else None,
                       "median": statistics.median(walls) if walls else None},
            "runs_detail": per,
        })

    report["totals"] = {
        "files": len(files),
        "runs": total_runs,
        "wallMsMedianAll": statistics.median(all_wall) if all_wall else None,
        "wallMsMin": min(all_wall) if all_wall else None,
        "wallMsMax": max(all_wall) if all_wall else None,
        "metric5_note": "무근거 주장 = 구조적 0(가드가 채택 전 전량 거부) — 이 창에서 계산하지 않는다.",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
