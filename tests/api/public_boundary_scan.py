r"""public_boundary_scan — P6 «공개 경계» 최종 스캔 (baseline §15.2·§16·§34.6).

이 그물이 `ci_hygiene_drill` 과 다른 점은 둘이다.

1. **모집단이 둘**이다 — 작업 «트리»(git ls-files)와 git «이력»(git log -G · --all).
   판정문 §35.4 ⑦ 은 트리 축 0히트로 「부분 — 이력 축 빈 칸」이었다. 트리의 0 을
   이력의 0 으로 옮겨 적지 않기 위해 두 축을 **따로 세고 따로 보고**한다.
2. **축이 여섯**이다(A1~A6). 각 축은 자기 «표본»을 갖는다 — 대조군(합성 양성 + 음성)이
   깨지면 그 축은 초록을 내지 못하고 **판정력 없음(exit 2)** 으로 죽는다.
   표본 없는 갈래가 초록을 유지하는 자리를 만들지 않는다(리바이2 계보).

🔴 출력 규율 — **일치한 문자열을 그대로 찍지 않는다.** 찍으면 이 스캔의 산출물 자신이
   다음 스캔의 히트가 된다. 매치 구간은 길이만 남기고 가린다.

🔴 프로브 값은 런타임 조립이다 — 소스에 통짜로 적으면 이 파일이 자기 게이트에 걸린다.
   제외 목록은 쓰지 않는다(제외는 그 파일 안의 진짜 유출까지 눈감는다). 히트는 «분류»로 가른다.

    python tests/api/public_boundary_scan.py            # 트리 + 이력
    python tests/api/public_boundary_scan.py --tree     # 트리만

exit: 0 = 전 축 히트 0 · 1 = 히트 1건 이상 · 2 = 대조군 실패·실행 오류(측정 불가)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BS = chr(92)
AT = chr(64)
SKIP_PREFIX = ".github/workflows/"              # CI 러너 자신의 정규식 원문 — ci_hygiene 과 동일 제외
PRODUCT = ("apps/", "services/", "packages/")   # A6 의 모집단 = 제품 코드


class ScanError(RuntimeError):
    """그물이 고장났다 — 결과가 아니라 «측정 불가»다."""


# ── 축 정의 (이 표가 곧 「무엇을 봤는가」의 정본이다) ───────────────────────────
A1 = re.compile(
    "(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}"
    "|sk-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|xox[bap]-[0-9A-Za-z-]{10,}"
    "|BEGIN (RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY"
    "|hooks[.]slack[.]com/services/[A-Za-z0-9/]{10,}"
    "|discord(app)?[.]com/api/webhooks/[0-9]{5,}"
    "|(password|passwd|secret|api[_-]?key|token)[ ]{0,3}[=:][ ]{0,3}"
    "[\"'][^\"'{$<][^\"']{7,}[\"'])")
A2 = re.compile(
    "(C:[" + BS + BS + "/]+Users[" + BS + BS + "/]+[A-Za-z]"
    "|/home/(?!runner/)[a-z][a-z0-9_.-]{1,31}/"
    "|/Users/[A-Za-z][A-Za-z0-9_.-]{1,31}/)")
A3 = re.compile(
    "(100[.](6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])[.][0-9]{1,3}[.][0-9]{1,3}"
    "|[A-Za-z0-9-]{2,}[.]ts[.]net"
    "|tailscale[ ]+funnel|funnel[ ]+status)")
A4 = re.compile(
    "([A-Za-z0-9._%+-]{2,}" + AT + "(?!example[.]|test[.]|localhost)[A-Za-z0-9.-]+[.][A-Za-z]{2,}"
    "|01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}"
    "|[0-9]{6}-[1-4][0-9]{6})")
A5 = re.compile(
    "(ANTHROPIC_API_KEY|api[.]anthropic[.]com|anthropic-ai/"
    "|claude-(opus|sonnet|haiku|fable)-[0-9]"
    "|import[ ]+anthropic|from[ ]+anthropic[ ]+import)")
A6 = re.compile(
    "((^|[^A-Za-z_.])eval[ ]{0,2}[(]|(^|[^A-Za-z_.])exec[ ]{0,2}[(]"
    "|os[.]system[ ]{0,2}[(]|shell[ ]{0,3}=[ ]{0,3}True|new[ ]+Function[ ]{0,2}[(]"
    "|child_process[.]exec"
    "|f[\"'][^\"']{0,80}(SELECT|INSERT|UPDATE|DELETE|MATCH|MERGE|DETACH)[^\"']{0,80}[{]"
    "|[\"'][^\"']{0,80}(SELECT|INSERT|UPDATE|DELETE|MATCH|MERGE)[^\"']{0,80}[\"'][ ]{0,3}[+]"
    "|[+][ ]{0,3}[\"'][^\"']{0,40}(WHERE|VALUES|RETURN)[^\"']{0,40}[\"'])")

# id, 이름, 정규식, 모집단, 못 가르는 것(0 의 뜻을 좁히는 문장)
AXES = [
    ("A1", "시크릿 패턴", A1, "tracked",
     "형태가 있는 토큰·webhook·따옴표 대입만 본다. 자연어로 적힌 비밀번호·외부 저장소의 키는 못 가른다"),
    ("A2", "개인 절대경로", A2, "tracked",
     "C:\\Users · /home/<u> · /Users/<u> 세 형태. /home/runner(러너 표준)는 패턴에서 뺐다 — 다른 CI 표준 경로는 못 가른다"),
    ("A3", "tailnet·100.x·Funnel", A3, "tracked",
     "CGNAT 100.64/10 · *.ts.net · funnel 명령 문면. 사설 DNS 별칭·단축 URL 뒤의 tailnet 은 못 가른다"),
    ("A4", "실데이터 표지", A4, "tracked",
     "🔴 이메일·휴대폰·주민번호 «형태»만 본다. 실명·실장비 ID·실주소는 형태가 없어 못 가른다 — 이 축의 0 은 그 세 형태에서의 0 이다"),
    ("A5", "Claude 구독 노출 경로", A5, "tracked",
     "코드에 남은 표지(키 이름·SDK·모델 id)만 본다. 런타임에 공개 라우트가 실제로 모델을 부르는지는 못 잰다(정적 축)"),
    ("A6", "임의 SQL·Cypher·코드 실행", A6, "product",
     "제품 코드(apps·services·packages)의 문자열 연결·eval 계열만 본다. 파라미터 바인딩의 «올바름»과 ORM 내부는 못 잰다"),
]


def redact(line: str, rx: re.Pattern) -> str:
    """🔴 매치 구간을 길이만 남기고 가린다 — 산출물이 다음 스캔의 히트가 되지 않게."""
    out, last = [], 0
    for m in rx.finditer(line):
        out.append(line[last:m.start()])
        out.append("<" + str(m.end() - m.start()) + "자 가림>")
        last = m.end()
    out.append(line[last:])
    return ("".join(out))[:160]


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=str(REPO),
                         capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise ScanError(f"git ls-files 가 {out.returncode} 를 냈다")
    files = [f for f in out.stdout.split("\n") if f.strip()]
    if not files:
        raise ScanError("추적 파일 0건 — 측정 불가(빈 모집단의 통과는 통과가 아니다)")
    return files


def self_check() -> None:
    """🔴 축마다 표본(양성·음성). 하나라도 어긋나면 전 축의 초록을 버린다."""
    pos_secret = "ghp" + "_" + "A" * 24
    pos_path = "C:" + BS + "Users" + BS + "someone" + BS + "repo"
    pos_path2 = "/home/" + "someone" + "/repo"
    pos_tail = "100." + "101.5.7"
    pos_ts = "node-" + "abc" + ".ts" + ".net"
    pos_data = "hong" + AT + "realcorp.co.kr"
    pos_rrn = "900101" + "-1234567"
    pos_claude = "ANTHROPIC" + "_API_KEY"
    pos_exec = "os." + "system(cmd)"
    pos_concat = 'q = "SELECT * FROM wo WHERE id=" + wo_id'
    cases = [
        ("A1 양성 토큰", A1, pos_secret, True),
        ("A1 음성 산문", A1, "토큰을 커밋하지 않는다", False),
        ("A2 양성 백슬래시", A2, pos_path, True),
        ("A2 양성 슬래시", A2, pos_path2, True),
        ("A2 음성 상대경로", A2, "evidence/t5-6-public-boundary-final-scan.md", False),
        ("A2 음성 러너경로", A2, "/home/runner/work/repo", False),
        ("A3 양성 CGNAT", A3, pos_tail, True),
        ("A3 양성 ts.net", A3, pos_ts, True),
        ("A3 음성 사설망", A3, "192.168.0.11 · 100.5.5.5", False),
        ("A4 양성 메일", A4, pos_data, True),
        ("A4 양성 주민번호", A4, pos_rrn, True),
        ("A4 음성 example", A4, "user" + AT + "example.com", False),
        ("A5 양성 키이름", A5, pos_claude, True),
        ("A5 음성 산문", A5, "구독을 공개 API 로 노출하지 않는다", False),
        ("A6 양성 system", A6, pos_exec, True),
        ("A6 양성 연결", A6, pos_concat, True),
        ("A6 음성 바인딩", A6, "cur.execute(sql, (wo_id,))", False),
    ]
    for name, rx, text, want in cases:
        if bool(rx.search(text)) is not want:
            raise ScanError(f"대조군 실패 — «{name}» 을 {not want} 로 판정했다 · 이 축은 판정력 없음")
    pos = sum(1 for c in cases if c[3])
    print(f"  대조군    표본 {len(cases)}종(양성 {pos} · 음성 {len(cases) - pos}) — 여섯 축 전부 빨강을 낼 수 있다")


def scan_tree(files: list[str]) -> tuple[dict, dict, int]:
    hits: dict[str, list[str]] = {a[0]: [] for a in AXES}
    pop: dict[str, int] = {a[0]: 0 for a in AXES}
    read_fail = 0
    for rel in files:
        if rel.startswith(SKIP_PREFIX):
            continue
        try:
            text = (REPO / rel).read_text(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            read_fail += 1
            continue
        is_product = rel.startswith(PRODUCT)
        lines = text.splitlines()
        for aid, _n, rx, scope, _c in AXES:
            if scope == "product" and not is_product:
                continue
            pop[aid] += 1
            for i, line in enumerate(lines, 1):
                if rx.search(line):
                    hits[aid].append(f"{rel}:{i}  {redact(line.strip(), rx)}")
    return hits, pop, read_fail


# ── 이력 축 — git 의 정규식 엔진(ERE)으로만 돈다. 파이썬 패턴을 그대로 못 넘긴다 ──
HIST = {
    "A1": "(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)",
    "A2": ("(C:[" + BS + BS + "/]+Users[" + BS + BS + "/]+[A-Za-z]"
           "|/home/[a-z][a-z0-9_.-]+/|/Users/[A-Za-z][A-Za-z0-9_.-]+/)"),
    "A3": ("(100[.](6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])[.][0-9]{1,3}[.][0-9]{1,3}"
           "|[A-Za-z0-9-]{2,}[.]ts[.]net)"),
    "A4": "([A-Za-z0-9._%+-]{2,}" + AT + "[A-Za-z0-9.-]+[.][A-Za-z]{2,}|[0-9]{6}-[1-4][0-9]{6})",
}


def scan_history() -> dict[str, list[str]]:
    total = subprocess.run(["git", "rev-list", "--count", "--all"], cwd=str(REPO),
                           capture_output=True, text=True, encoding="utf-8")
    if total.returncode != 0:
        raise ScanError("git rev-list 가 실패했다 — 이력 축 측정 불가")
    print(f"  이력 모집단  커밋 {total.stdout.strip()}건 (--all · 도달 가능 전부)")
    out: dict[str, list[str]] = {}
    for aid, pat in HIST.items():
        r = subprocess.run(["git", "log", "--all", "--format=%h %ad %s", "--date=short",
                            "-G", pat], cwd=str(REPO),
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise ScanError(f"git log -G ({aid}) 가 {r.returncode} 를 냈다 — 이력 축 측정 불가")
        out[aid] = [ln[:120] for ln in r.stdout.split("\n") if ln.strip()]
    return out


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    tree_only = "--tree" in sys.argv

    print(f"정본      : baseline §15.2·§16·§34.6 · 리포 {REPO.name}")
    print("규율      : 🔴 첫 빨강에서 멈추지 않는다 · 매치 문자열은 가려서 찍는다")
    print()
    self_check()
    print()

    files = tracked_files()
    scanned = len(files) - sum(1 for f in files if f.startswith(SKIP_PREFIX))
    hits, pop, read_fail = scan_tree(files)
    print(f"  트리 모집단  추적 {len(files)}건 · 스캔 {scanned}건 ({SKIP_PREFIX} 제외 = CI 동일)")
    if read_fail:
        print(f"  읽기 실패 {read_fail}건 — 이 파일들은 «안 본» 것이다(0 에 넣지 않는다)")
    print()
    print("── 트리 축 ──────────────────────────────────────────────")
    bad = 0
    for aid, name, rx, scope, caveat in AXES:
        n = len(hits[aid])
        bad += n
        print(f"  {'PASS' if not n else 'HIT '}  {aid} {name:22} 히트 {n:4}건 / 파일 {pop[aid]}건")
        print(f"        못 가르는 것: {caveat}")
        for h in hits[aid][:60]:
            print(f"        {h}")
        if n > 60:
            print(f"        … 외 {n - 60}건")
    if tree_only:
        print()
        print("이력 축   : 실행 안 함(--tree) — 「안 본 것」이지 0 이 아니다")
        return 1 if bad else 0

    print()
    print("── 이력 축 (git log -G · --all) ──────────────────────────")
    hist = scan_history()
    for aid, commits in hist.items():
        print(f"  {aid} 이력 히트 커밋 {len(commits)}건")
        for c in commits[:12]:
            print(f"        {c}")
        if len(commits) > 12:
            print(f"        … 외 {len(commits) - 12}건")
    # 🔴 이력 그물의 «생존» 대조군 — D-003(Q-30) 로 A2 잔존이 «있다»고 이미 재결됐다.
    if not hist.get("A2"):
        raise ScanError("이력 대조군 실패 — D-003 로 잔존이 확정된 A2 를 0 으로 냈다 · 이력 축 판정력 없음")
    print("  이력 대조군  A2 = D-003(Q-30) 로 잔존 확정 → 히트 있음 ⇒ 이력 그물 살아 있음")
    print()
    print(f"결과      : 트리 히트 {bad}건 · 이력 히트 커밋 {sum(len(v) for v in hist.values())}건(축 4개 합)")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ScanError as exc:
        print(f"측정 불가: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
