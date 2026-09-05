"""라이선스 목록과 «금지 라이선스» 계수(T5-3 E2).

🔴 **판정선은 보고 전용이다.** 여기서 실패하는 것은 라이선스가 나빠서가 아니라 **아무것도
   안 봤을 때**다 — 대상 0 은 「깨끗하다」가 아니라 「목록을 못 얻었다」이고, 보고 전용 job
   에서는 그 갈래가 제일 오래 산다(아무도 빨강을 안 보니까).
🔴 **0건에는 모집단을 함께 적는다.** 「금지 라이선스 0건」은 그 옆에 「N개 중」이 없으면
   「없다」인지 「안 봤다」인지 구별되지 않는다.
🔴 **이 job 이 안 보는 축**: python 은 `requirements.txt` 의 «직접» 의존만 본다(전이 의존은
   설치해야 알 수 있고, 그러려면 torch 계열까지 깔아야 한다). JS 는 `--prod` 전이 포함이다.
   두 축의 «깊이»가 다르다는 사실을 매 실행 찍는다.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

REPO = Path(__file__).resolve().parents[2]
REQ = REPO / "services" / "ai-api" / "requirements.txt"
PNPM_JSON = Path(os.environ.get("PNPM_LICENSES_JSON", ""))

# 🔴 «금지»가 아니라 «주의»다 — 이 PoC 는 Apache-2.0 배포이고, copyleft 계열이 섞이면
#    배포 조건을 다시 봐야 한다. 판정은 사람이 한다. 여기서는 세어서 눈에 보이게만 한다.
COPYLEFT = re.compile(r"\b(GPL|AGPL|LGPL|SSPL|CC-BY-SA|EUPL)\b", re.IGNORECASE)


def js_licenses() -> dict[str, str]:
    """`pnpm licenses list --prod --json` 출력 → {패키지: 라이선스}."""
    if not PNPM_JSON or not PNPM_JSON.is_file():
        return {}
    data = json.loads(PNPM_JSON.read_text(encoding="utf-8") or "{}")
    out: dict[str, str] = {}
    # pnpm 은 {라이선스: [ {name, versions...}, ... ]} 형태로 낸다.
    if isinstance(data, dict):
        for lic, pkgs in data.items():
            for p in pkgs if isinstance(pkgs, list) else []:
                out[p.get("name", "?")] = lic
    return out


def py_direct_names() -> list[str]:
    if not REQ.is_file():
        return []
    names = []
    for line in REQ.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        names.append(re.split(r"[=<>!~\[; ]", s, maxsplit=1)[0].strip())
    return [n for n in names if n]


def py_license(name: str) -> str:
    try:
        with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/json", timeout=20) as r:
            info = json.loads(r.read().decode()).get("info", {})
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return "(조회 실패)"
    # 🔴 **`license_expression` 을 먼저 본다**(PEP 639). 실측: fastapi 는 `license` = None ·
    #    classifiers 의 `License ::` = 없음 · `license_expression` = "MIT" 다. 옛 두 필드만 읽던
    #    1차 판은 9개 중 8개를 「선언 없음」으로 냈다 — 목록이 아니라 «빈 칸»을 낸 셈이다.
    expr = (info.get("license_expression") or "").strip()
    if expr:
        return expr
    lic = (info.get("license") or "").strip()
    if lic and len(lic) < 80:
        return lic
    for c in info.get("classifiers", []) or []:
        if c.startswith("License ::"):
            return c.rsplit("::", 1)[-1].strip()
    return lic[:77] + "…" if lic else "(선언 없음)"


def report(title: str, pairs: dict[str, str], depth: str) -> tuple[int, int]:
    print(f"\n=== {title} — {len(pairs)}개 ({depth}) ===")
    for pkg, lic in sorted(pairs.items()):
        print(f"  {pkg}: {lic}")
    hits = {p: l for p, l in pairs.items() if COPYLEFT.search(l or "")}
    print(f"  → copyleft 계열 {len(hits)}건 / {len(pairs)}개 중" + (f": {hits}" if hits else ""))
    return len(pairs), len(hits)


def main() -> int:
    js = js_licenses()
    py_names = py_direct_names()
    py = {n: py_license(n) for n in py_names}

    n_js, h_js = report("JS (pnpm licenses --prod)", js, "전이 포함")
    n_py, h_py = report("Python (requirements.txt)", py, "🔴 직접 의존만 — 전이는 이 job 이 안 본다")

    print(f"\n합계 — 대상 {n_js + n_py}개(JS {n_js} · Python {n_py}) · copyleft 계열 {h_js + h_py}건")
    print("판정선 = 보고 전용(게이트 아님). 실패는 「목록을 못 얻었을 때」뿐이다.")

    if n_js == 0:
        print("FAIL JS 라이선스 목록이 0개 — 「깨끗하다」가 아니라 목록을 못 얻었다")
        return 1
    if n_py == 0:
        print("FAIL Python 대상이 0개 — requirements.txt 를 못 읽었다")
        return 1
    unresolved = sum(1 for v in py.values() if v.startswith("("))
    print(f"Python 라이선스 미해결 {unresolved}/{n_py}건(조회 실패·선언 없음 — 값이지 실패는 아니다)")
    print("PASS 목록을 얻었다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
