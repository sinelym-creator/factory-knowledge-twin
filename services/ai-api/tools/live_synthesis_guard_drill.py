"""근거 결속 가드 실측 드릴 — T6-1.

가드는 「LLM 이 준 응답」을 판정한다. 그 자극을 실제 LLM 으로 만들면 재현이 안 되므로,
여기서는 **응답을 손으로 지어** 가드에 직접 먹인다(가드는 응답 객체만 보는 순수 함수다).

🔴 이 드릴이 세는 것 두 가지:
  ① 각 케이스가 **가드까지 도달했는가**(자극 도달 건수) — 도달 0 이면 그 줄은 PASS 가 아니라 무효다.
  ② 「참」 대조군이 **채택되는가** — 전부 거부하는 가드는 고장이지 안전이 아니다.

실행:
    cd services/ai-api
    .venv\\Scripts\\python.exe -m tools.live_synthesis_guard_drill
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

# 가드 모듈은 게이트 env 뒤에서만 import 된다 — 드릴은 그 게이트를 «자기 프로세스에만» 세운다.
os.environ.setdefault("FKT_LOCAL_SYNTHESIS_GATEWAY", "http://127.0.0.1:8787")

from app.investigation import live_synthesis as live  # noqa: E402
from app.investigation.synthesize import Candidate    # noqa: E402

RUN_EVIDENCE = ["AL-1", "SN-2", "HX-3", "GP-RUN-01"]

CANDIDATES = [
    # 결정적 1순위 — 받친 근거 3건.
    Candidate(
        failureModeId="FM-A",
        label="베어링 마모",
        pattern="진동 상승 후 온도 급상승",
        evidenceIds=["AL-1", "SN-2", "HX-3"],
        history=["HX-3"],
        citations=["SN-2"],
        graphHops=1,
    ),
    # 받친 근거 0 — 승격 거부 규칙의 대상.
    Candidate(
        failureModeId="FM-B",
        label="윤활 불량",
        pattern="온도만 상승",
        evidenceIds=["AL-1"],
    ),
]


def _rationale(*fm_ids: str, cited: list[str] | None = None) -> dict:
    return {
        fm: {"sentences": [f"{fm} 는 근거로 받쳐진다."], "citedEvidenceIds": list(cited or ["AL-1"])}
        for fm in fm_ids
    }


CASES: list[tuple[str, dict, bool, str]] = [
    (
        "참-대조군 · 결정적 순위 그대로",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A", "FM-B"), "insufficient": False},
        True,
        "가드가 아무것도 채택 못 하면 나머지 줄의 「거부」는 근거가 아니다",
    ),
    (
        "참-대조군 · 재정렬(support 있는 쪽이 1순위 유지)",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A", "FM-B", cited=["SN-2", "HX-3"]), "insufficient": False},
        True,
        "재정렬 자체는 허용된다",
    ),
    (
        "🔴 가짜 evidenceId 1건 주입",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A", "FM-B", cited=["AL-1", "EV-FAKE-999"]), "insufficient": False},
        False,
        "run 근거집합 밖 인용 = 전량 거부(부분 채택 0)",
    ),
    (
        "🔴 support 0 후보를 1순위로 승격",
        {"ranking": ["FM-B", "FM-A"], "rationale": _rationale("FM-A", "FM-B"), "insufficient": False},
        False,
        "재정렬은 허용하되 이 승격만은 거부",
    ),
    (
        "ranking 에서 후보 1건 누락",
        {"ranking": ["FM-A"], "rationale": _rationale("FM-A"), "insufficient": False},
        False,
        "후보 집합이 갈리면 화면과 초안이 어긋난다",
    ),
    (
        "ranking 에 없던 후보 추가",
        {"ranking": ["FM-A", "FM-B", "FM-Z"], "rationale": _rationale("FM-A", "FM-B"), "insufficient": False},
        False,
        "지어낸 후보는 근거가 없다",
    ),
    (
        "rationale 문장이 비었다",
        {"ranking": ["FM-A", "FM-B"], "rationale": {"FM-A": {"sentences": [], "citedEvidenceIds": ["AL-1"]}, "FM-B": {"sentences": ["x"], "citedEvidenceIds": ["AL-1"]}}, "insufficient": False},
        False,
        "빈 근거 문장은 계약(minItems 1) 위반",
    ),
    (
        "rationale 이 후보 전부를 안 덮는다",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A"), "insufficient": False},
        False,
        "덮이지 않은 후보는 근거 표기가 없는 채로 화면에 뜬다",
    ),
    (
        "citedEvidenceIds 가 비었다",
        {"ranking": ["FM-A", "FM-B"], "rationale": {"FM-A": {"sentences": ["x"], "citedEvidenceIds": []}, "FM-B": {"sentences": ["y"], "citedEvidenceIds": ["AL-1"]}}, "insufficient": False},
        False,
        "인용 0 은 「근거 없음」이지 채택이 아니다",
    ),
]


def run_guard_cases() -> tuple[int, int, int]:
    """(통과 줄 수, 전체 줄 수, 가드 도달 건수)."""
    reached = 0
    passed = 0
    print(f"run 근거집합 = {RUN_EVIDENCE}\n")
    for name, response, expect_accept, why in CASES:
        verdict: str
        try:
            reached += 1                      # apply_guard 를 실제로 부른 건수
            ordered, cleaned = live.apply_guard(response, CANDIDATES, set(RUN_EVIDENCE))
            accepted = True
            verdict = f"채택 · 1순위 {ordered[0].failureModeId} · rationale {len(cleaned)}건"
        except live._Rejected as exc:         # noqa: SLF001 — 드릴은 이 층을 직접 본다
            accepted = False
            verdict = f"거부 · {exc}"
        ok = accepted is expect_accept
        passed += ok
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        print(f"       기대={'채택' if expect_accept else '거부'} · 실제={verdict}")
        print(f"       왜: {why}")
    return passed, len(CASES), reached


def probe_gateway() -> None:
    """게이트웨이가 떠 있으면 그 층의 형상 검사도 한 번 울려 본다(없으면 건너뛴다)."""
    url = live.gateway_url()
    print(f"\n게이트웨이 = {url or '(미설정)'}")
    if not url:
        return
    try:
        with urllib.request.urlopen(f"{url}/health", timeout=3) as res:  # noqa: S310
            print(f"  /health → {res.status} {res.read().decode('utf-8')}")
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"  /health → 미도달({type(exc).__name__}) — 게이트웨이 층 검사는 건너뛴다")
        return
    body = json.dumps({"candidates": [{"failureModeId": "FM-A"}], "evidenceText": {}}).encode()
    req = urllib.request.Request(                                        # noqa: S310
        f"{url}/synthesize", data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=5)                            # noqa: S310
        print("  🔴 빈 evidenceText 를 통과시켰다 — 게이트웨이 입력 검사가 고장이다")
    except urllib.error.HTTPError as exc:
        print(f"  빈 evidenceText → {exc.code} {exc.read().decode('utf-8')}")


def main() -> int:
    passed, total, reached = run_guard_cases()
    probe_gateway()
    print(f"\n가드 도달 {reached}/{total}건 · 판정 {passed}/{total} PASS")
    if reached != total:
        print("🔴 자극이 가드까지 안 갔다 — 이 표는 무효다")
        return 1
    if passed != total:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
