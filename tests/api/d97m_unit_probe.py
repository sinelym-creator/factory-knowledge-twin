#!/usr/bin/env python3
"""D-97-MV 단위 탐침 — DB·컨테이너 없이 **대상의 재요청 루프 그 자체**를 스텁으로 흔든다.

왜 이 층이 따로 있나 — 전 스택 드릴(`d97m_calls_drill.py`)은 postgres·neo4j·ai-api 를 모두
세워야 서고, 그 무대는 develop 공용 자산과 얽힌다(D-92). 이 탐침은 `live_synthesis.synthesize()`
를 **직접** 불러 같은 `for attempt in (1, 2)` 루프를 돈다 — 무대 비용 0 · 구독 0.

🔴 **두 층이 재는 것이 다르다.** 이 탐침은 「합성 층이 몇 번 부르는가 · `synthesis_payload()` 가
   무엇을 싣는가」까지다. 「run 페이로드·상한 계수·화면」은 전 스택 드릴의 몫이다 — 이 초록을
   run 축의 초록으로 옮겨 적지 않는다.

축:
  A. 참값 갈림 — `named` 열 1호출 / `retry` 열 2호출 / `omitted` 열 2호출. **먼저 이것이 갈려야** 한다.
  B. 계측 칸 — `synthesis_payload()` 의 키 집합을 열마다 그대로 찍는다(있음/없음이 값).
  C. 거동 — `axis`(live 채택인가) · `safety_omitted` · 인용 형상.

사용: `python tests/api/d97m_unit_probe.py`(레포 루트에서) → JSON 1개 + 종료코드
  0 = A 갈림 성립 · 2 = 자극 불성립(NO-STAGE) · 1 = 갈림은 섰는데 거동이 기대와 다르다
"""

from __future__ import annotations

import sys as _sys

# 🔴 Windows 콘솔 기본이 cp949 라 em dash·이모지가 여기서 죽는다 — 내 «출력» 이 못 넘어
#    「대상이 실패했다」로 보이는 자리(실측: UnicodeEncodeError · 판정 전에 죽었다).
for _stream in (_sys.stdout, _sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001 — 재설정 못 해도 측정은 돈다
        pass

import asyncio
import json
import logging
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# 🔴 로그 축을 재려면 **내 쪽 레벨을 먼저 열어야** 한다 — 기본 WARNING 이라
#    `log.info` 는 안 찍힌다. 그 침묵을 「대상이 안 남겼다」로 읽으면 없는 결함을 짓는다.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

ROOT = Path(__file__).resolve().parents[2]
STUB = ROOT / "tests" / "stubs" / "d97m_stub_gateway.py"

# 🔴 **재는 대상을 인자로 고른다** — 같은 계측기로 «처방 전» 트리와 «처방 후» 트리를
#    나란히 재야 두 열이 선다. 기본값은 이 파일이 사는 리포다.
_target = os.environ.get("FKT_TARGET_ROOT")
TARGET_ROOT = Path(_target).resolve() if _target else ROOT
sys.path.insert(0, str(TARGET_ROOT / "services" / "ai-api"))

from app.investigation import live_synthesis as ls          # noqa: E402
from app.investigation.synthesize import Candidate          # noqa: E402

# 🔴 발췌에 SAF-* 를 «본문»으로 심는다 — 키가 아니라 값을 훑는 것이 대상 규격이다.
#    심은 id 는 코퍼스 실재값(`SAF-LOTO-01`·`SAF-PPE-01`)을 쓴다: 지어낸 모양이 정규식 경계에
#    안 걸려 「자극을 줬다」고 착각하는 자리를 피한다.
EVIDENCE = {
    "EV-WO-1": "작업지시 W-1: 베어링 교체. 작업 전 SAF-LOTO-01 에 따라 잠금·표지를 건다.",
    "EV-SENS-1": "진동 RMS 4.8mm/s 상승. 보호구는 SAF-PPE-01 을 따른다.",
    "EV-DOC-1": "정비 이력: 6개월 전 동일 베어링 교체.",
}
CANDIDATES = [
    Candidate(
        failureModeId="FM-BRG-WEAR",
        label="베어링 마모",
        pattern="진동 상승",
        evidenceIds=["EV-WO-1", "EV-SENS-1"],
        history=["EV-DOC-1"],
        citations=["EV-SENS-1"],
        graphHops=1,
        sopIds=["SOP-BRG-01"],
    ),
    Candidate(
        failureModeId="FM-MISALIGN",
        label="정렬 불량",
        pattern="축 진동",
        evidenceIds=["EV-SENS-1"],
        history=[],
        citations=["EV-SENS-1"],
        graphHops=None,
        sopIds=[],
    ),
]
STATE = {"citations": dict(EVIDENCE)}


class Anchor:
    scenarioId = "GS-01"
    alarmId = "AL-1"
    equipmentId = "EQ-1"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=5) as res:      # noqa: S310
        return json.loads(res.read().decode("utf-8"))


def run_column(mode: str) -> dict:
    """열 하나 = 스턴 1모드 · `synthesize()` 1회.

    🔴 `unreachable` 은 스턴을 **안 띄운다** — 계약 v0.2.5 「도달 못 한 회차는 0」 축.
       이 열의 참값은 «서버가 없었다»라는 구성이지 스턴 계수가 아니다.
    """
    port = free_port()
    if mode == "unreachable":
        os.environ[ls.LIVE_GATE_ENV] = f"http://127.0.0.1:{port}"   # 아무도 안 듣는 포트
        result = asyncio.run(ls.synthesize(
            CANDIDATES, anchor=Anchor(), state=STATE, evidence_ids=list(EVIDENCE),
        ))
        payload = result.synthesis_payload()
        return {
            "mode": mode,
            "stub": {"total": 0, "byNotice": {"first": 0, "retry": 0}, "note": "서버 없음(구성)"},
            "target": {
                "axis": result.axis,
                "rejectedReason": result.rejected_reason,
                "safety_omitted": result.safety_omitted,
                "payloadKeys": sorted(payload),
                "payload": payload,
                "rationaleCited": {},
            },
        }
    env = dict(os.environ, FKT_STUB_SAFETY=mode, FKT_STUB_PORT=str(port))
    proc = subprocess.Popen([sys.executable, str(STUB)], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                get(base + "/health")
                break
            except Exception:                                # noqa: BLE001 — 부팅 창은 실패가 정상이다
                time.sleep(0.2)
        else:
            raise SystemExit(f"스텁이 {base} 에서 안 떴다")

        os.environ[ls.LIVE_GATE_ENV] = base
        # 🔴 `streamerr` 은 **스트리밍을 요청해야** 그 갈래가 선다 — 콜백이 없으면
        #    ai-api 가 Accept 를 안 붙여 스턴이 단일 JSON 으로 답하고, 그럼 다른 것을 재게 된다.
        seen: list = []
        result = asyncio.run(ls.synthesize(
            CANDIDATES,
            anchor=Anchor(),
            state=STATE,
            evidence_ids=list(EVIDENCE),
            on_sentence=(seen.append if mode == "streamerr" else None),
        ))
        calls = get(base + "/_stub/calls")
        payload = result.synthesis_payload()
        return {
            "mode": mode,
            "stub": {"total": calls["total"], "byNotice": calls["byNotice"]},
            "target": {
                "axis": result.axis,
                "rejectedReason": result.rejected_reason,
                "safety_omitted": result.safety_omitted,
                "payloadKeys": sorted(payload),
                "payload": payload,
                "rationaleCited": {k: v.get("citedEvidenceIds") for k, v in (result.rationale or {}).items()},
            },
        }
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def main() -> int:
    rows = [run_column(m) for m in ("named", "retry", "omitted", "guardfail", "streamerr", "unreachable")]
    by = {r["mode"]: r for r in rows}
    totals = {m: by[m]["stub"]["total"] for m in by}

    out = {"at": time.strftime("%H:%M:%S"), "targetRoot": str(TARGET_ROOT), "rows": rows, "axes": {}}

    # A — 참값이 실제로 갈리는가. 안 갈리면 색을 내지 않는다.
    split_ok = totals.get("named") == 1 and totals.get("retry") == 2 and totals.get("omitted") == 2
    out["axes"]["A-참값갈림"] = {
        "verdict": "PASS" if split_ok else "NO-STAGE",
        "totals": totals,
        "why": "named=1 · retry=2 · omitted=2 여야 재요청 갈래가 선 것이다",
    }

    # B — 계측 칸(있음/없음이 값). 처방 «전» 빌드에서는 없는 것이 정상이다.
    out["axes"]["B-계측칸"] = {
        "present": {
            m: {
                "calls": "calls" in by[m]["target"]["payload"],
                "safetyRetried": "safetyRetried" in by[m]["target"]["payload"],
                "safetyOmitted": "safetyOmitted" in by[m]["target"]["payload"],
            }
            for m in by
        },
        "why": "처방 전이면 calls·safetyRetried 는 없다 — 이 열이 그대로 «前» 칸이다",
    }

    # D — 계약 v0.2.5 「도달 0 = calls 0」 · 200 뒤 끊긴 갈래
    out["axes"]["D-도달0과스트림끊김"] = {
        "unreachable": {
            "stub": by["unreachable"]["stub"]["total"],
            "target": by["unreachable"]["target"]["payload"].get("calls"),
            "axis": by["unreachable"]["target"]["axis"],
        },
        "guardfail": {
            "stub": by["guardfail"]["stub"]["total"],
            "target": by["guardfail"]["target"]["payload"].get("calls"),
            "axis": by["guardfail"]["target"]["axis"],
            "rejectedReason": by["guardfail"]["target"]["rejectedReason"],
        },
        "streamerr": {
            "stub": by["streamerr"]["stub"]["total"],
            "target": by["streamerr"]["target"]["payload"].get("calls"),
            "axis": by["streamerr"]["target"]["axis"],
            "rejectedReason": by["streamerr"]["target"]["rejectedReason"],
        },
        "why": "둘 다 live-rejected 이지만 «호출이 갔는가» 가 다르다 — 스턴이 센 수와 대상 신고를 나란히 둔다",
    }

    # C — 거동: 채택됐는가 · 끝갈래 표기
    out["axes"]["C-거동"] = {
        "verdict": "PASS" if all(by[m]["target"]["axis"] == "live" for m in ("named", "retry", "omitted"))
        and by["omitted"]["target"]["safety_omitted"] is True
        and by["retry"]["target"]["safety_omitted"] is False
        and by["named"]["target"]["safety_omitted"] is False else "FAIL",
        "axis": {m: by[m]["target"]["axis"] for m in by},  # 새 열 2개는 live-rejected 가 정상이다
        "safety_omitted": {m: by[m]["target"]["safety_omitted"] for m in by},
        "rejected": {m: by[m]["target"]["rejectedReason"] for m in by},
    }

    print(json.dumps(out, ensure_ascii=False, indent=2))
    if not split_ok:
        return 2
    return 0 if out["axes"]["C-거동"]["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
