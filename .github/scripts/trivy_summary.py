"""trivy JSON → 심각도별 계수(T5-3 E1). 판정선은 «보고 전용»이다.

🔴 취약점 수로 실패하지 않는다 — 문턱을 정하는 것은 첫 실측 값을 본 뒤 사람의 결정이다.
   여기서 실패하는 자리는 하나뿐: **스캔이 무엇도 보지 않았을 때**. 「CRITICAL 0」과
   「대상 0」은 보고 전용 job 에서 같은 초록으로 보이고, 그 갈래는 아무도 안 본다.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("FAIL 사용법: trivy_summary.py <trivy-results.json>")
        return 1
    path = Path(argv[1])
    if not path.is_file():
        print(f"FAIL trivy 결과 파일이 없다: {path} — 스캔이 돌지 않았다")
        return 1
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "null")
    except json.JSONDecodeError as e:
        print(f"FAIL trivy JSON 을 읽을 수 없다 — {e.msg}")
        return 1
    if not isinstance(data, dict):
        print(f"FAIL trivy JSON 의 최상위가 객체가 아니다({type(data).__name__})")
        return 1

    results = data.get("Results") or []
    # 🔴 «본 것»을 먼저 적는다. Results 가 비면 취약점 0 이 아니라 스캔이 대상을 못 잡은 것이다.
    print(f"스캔 대상 — ArtifactName={data.get('ArtifactName')} · Results {len(results)}개")
    for r in results:
        n = len(r.get("Vulnerabilities") or [])
        print(f"  {r.get('Target')} [{r.get('Type')}] — 취약 {n}건")
    if not results:
        print("FAIL Results 가 0개 — 「취약 0」이 아니라 스캔이 아무것도 보지 못했다")
        return 1

    counts: Counter[str] = Counter()
    for r in results:
        for v in r.get("Vulnerabilities") or []:
            counts[(v.get("Severity") or "UNKNOWN").upper()] += 1
    total = sum(counts.values())
    line = " · ".join(f"{s} {counts.get(s, 0)}" for s in ORDER)
    print(f"\n심각도별 — {line} · 합계 {total}건")
    print("판정선 = 보고 전용(게이트 아님). 문턱 승격은 이 값을 본 뒤 오케 결정이다.")
    print(f"PASS 스캔이 {len(results)}개 대상을 훑었다")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
