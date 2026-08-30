r"""ci_hygiene_drill — CI 공개 경계 게이트를 «러너와 같은 정규식으로» 로컬에서 전수 재현 (Q-30).

🔴 이 그물이 존재하는 이유는 Q-30 그 자체다. `hygiene` 잡은 게이트 셋을 «연달아» 돌리는데
   `set -e` 라 앞이 exit 1 하면 뒤는 **실행조차 안 된다**. 실제로 secret 오검출 뒤에
   개인 절대경로 히트 5건이 20+회 동안 가려져 있었고, 그중 셋은 합성이 아니라 «진짜»였다.
   → 그래서 이 드릴은 **첫 빨강에서 멈추지 않는다.** 세 게이트를 전부 돌고 전부 보고한다.

🔴 두 번째 이유는 계측기 문맥이다. 같은 정규식을 셸에 태우면 백슬래시가 삼켜져
   `C:\+Users` 가 「C: 다음에 리터럴 +」로 바뀐다 — 로컬에서 «안 잡힌다»가 러너에서
   «안 잡힌다»를 뜻하지 않는다. 그래서 패턴을 `chr(92)` 로 조립해 파이썬 안에서만 돌린다.
   (측정 도구가 대상보다 먼저 거짓말하는 자리 — 리바이2 계보 「누구의 빨강인가」.)

🔴 프로브 «값»은 이 파일에서도 런타임 조립이다 — 소스에 통짜로 적으면 이 드릴 자신이
   게이트에 걸린다. 제외 목록은 쓰지 않는다(제외는 그 파일 안의 진짜 유출까지 눈감는다).

    python tests/api/ci_hygiene_drill.py

exit: 0 = 세 게이트 전건 통과 · 1 = 히트 1건 이상 · 2 = 실행 오류(측정 불가)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BS = chr(92)

# ── CI 와 «같은» 세 게이트. 정규식 원문은 .github/workflows/ci.yml 이 정본이다.
FILE_LIKE = re.compile(r"(^|/)\.env(\.|$)|\.(pem|key)$|credentials|secrets")
FILE_ALLOW = re.compile(r"(^|/)\.env\.example$")
SECRET = re.compile(
    "(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}"
    "|AKIA[0-9A-Z]{16}|xox[bap]-[0-9A-Za-z-]+|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)")
WIN_PATH = re.compile("C:" + BS + BS + "+Users" + BS + BS + "+[A-Za-z]")
SKIP_PREFIX = ".github/workflows/"


class DrillError(RuntimeError):
    """드릴 자신이 고장났다 — 결과가 아니라 «측정 불가»다."""


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=str(REPO),
                         capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise DrillError(f"git ls-files 가 {out.returncode} 를 냈다")
    files = [f for f in out.stdout.split("\n") if f.strip()]
    if not files:
        raise DrillError("추적 파일이 0건이다 — 측정 불가(빈 목록의 통과는 통과가 아니다)")
    return files


def self_check() -> None:
    """🔴 대조군 — 스캐너가 «빨강을 낼 수 있는가». 못 내면 아래 초록은 뜻이 없다."""
    probe_secret = "ghp" + "_" + "SELFCHECK" + "0" * 24
    probe_path = "C:" + BS + "Users" + BS + "someone" + BS + "repo"
    cases = [
        ("합성 토큰", SECRET, probe_secret, True),
        ("깨끗한 문장", SECRET, "안전 조치는 지울 수 없다", False),
        ("합성 절대경로", WIN_PATH, probe_path, True),
        ("리포 상대 경로", WIN_PATH, "evidence/t2-5-verification.md", False),
    ]
    for name, rx, text, want in cases:
        if bool(rx.search(text)) is not want:
            raise DrillError(f"자기 검증 실패 — «{name}» 을 {not want} 로 판정했다")
    if FILE_LIKE.search(".env") is None or FILE_ALLOW.search(".env.example") is None:
        raise DrillError("자기 검증 실패 — 파일명 게이트가 .env 를 못 가른다")
    print("  자기 검증  표본 4종(합성 2 · 깨끗 2) + 파일명 게이트 — 스캐너 살아 있음")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    print(f"정본      : .github/workflows/ci.yml (hygiene) · 리포 {REPO.name}")
    print("규율      : 🔴 첫 빨강에서 멈추지 않는다 — 세 게이트를 전부 돌고 전부 보고한다")
    print()
    self_check()
    print()

    files = tracked()
    print(f"  추적 파일 {len(files)}건 (게이트 대상 · {SKIP_PREFIX} 제외는 CI 와 동일)")

    g1 = [f for f in files if FILE_LIKE.search(f) and not FILE_ALLOW.search(f)]
    secret_hits: list[str] = []
    path_hits: list[str] = []
    for rel in files:
        if rel.startswith(SKIP_PREFIX):
            continue
        try:
            text = (REPO / rel).read_text(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if SECRET.search(line):
                secret_hits.append(f"{rel}:{i}")
            if WIN_PATH.search(line):
                path_hits.append(f"{rel}:{i}")

    gates = [
        ("G-1 크리덴셜 «파일»", g1, "추적 파일에 env·키·크리덴셜 파일이 섞였다"),
        ("G-2 시크릿 «패턴»", secret_hits, "소스에 토큰 모양 문자열이 통짜로 적혔다"),
        ("G-3 개인 «절대경로»", path_hits, "개인 PC 경로가 커밋됐다(§34.6)"),
    ]
    bad = 0
    for name, hits, why in gates:
        bad += len(hits)
        print(f"  {'PASS' if not hits else 'FAIL'}  {name:20} 히트 {len(hits)}건" +
              (f" — {why}" if hits else ""))
        for h in hits[:20]:
            print(f"           {h}")

    print()
    print(f"결과: 히트 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
