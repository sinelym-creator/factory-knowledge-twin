#!/usr/bin/env python
"""Gate 7 (3) — git 이력 시크릿 스캔 (T5-2b · 검증 좌석)

🔴 「스캔했다」가 무엇의 초록인지 적히지 않으면 그 green 은 값이 없다. 그래서 이 그물은
   **도구명·범위(커밋 수·패치 바이트)·패턴 수**를 판정문에 그대로 낸다.
🔴 **교정 게이트를 전수 «앞»에** — 각 패턴이 «심은 가짜 문자열»을 실제로 무는지 먼저 묻는다.
   한 패턴이라도 안 물면 exit 2 로 전수를 거부한다. 안 무는 정규식의 「0건」은 정보가 0이다.
🔴 진짜 시크릿을 판정문·로그에 옮기지 않는다 — 히트는 **커밋·경로·패턴명·마스킹된 발췌**로만 낸다.
"""
import re, subprocess, sys, json

# (이름, 정규식, 교정용 가짜 표본) — 표본은 «가짜»이고 리포에 커밋되지 않는다.
PATTERNS = [
    ("aws_access_key_id", r"AKIA[0-9A-Z]{16}", "AKIA" + "A" * 16),
    ("aws_secret",        r"(?i)aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}",
     "aws_secret_access_key = '" + "a" * 40 + "'"),
    ("anthropic_key",     r"sk-ant-[A-Za-z0-9_\-]{20,}", "sk-ant-" + "x" * 24),
    ("openai_key",        r"sk-[A-Za-z0-9]{32,}", "sk-" + "y" * 40),
    ("github_pat",        r"gh[pousr]_[A-Za-z0-9]{36,}", "ghp_" + "z" * 36),
    ("slack_token",       r"xox[baprs]-[A-Za-z0-9-]{10,}", "xoxb-" + "1" * 20),
    ("discord_token",     r"[MNO][A-Za-z\d_\-]{23}\.[A-Za-z\d_\-]{6}\.[A-Za-z\d_\-]{27}",
     "M" + "a" * 23 + "." + "b" * 6 + "." + "c" * 27),
    ("private_key_block", r"-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
     "-----BEGIN RSA PRIVATE KEY-----"),
    ("jwt",               r"eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
     "eyJ" + "a" * 12 + ".eyJ" + "b" * 12 + "." + "c" * 12),
    ("generic_assign",    r"(?i)(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]",
     "api_key = '" + "q" * 20 + "'"),
    ("pg_url_with_pw",    r"postgres(?:ql)?://[^:\s]+:[^@\s]+@", "postgresql://u:realpw@h/db"),
    ("bolt_url_with_pw",  r"bolt://[^:\s]+:[^@\s]+@", "bolt://u:realpw@h:7687"),
]

# 이 리포가 «합법적으로» 갖는 로컬 개발 자격증명 — 시크릿이 아니라 공개 PoC 의 고정값이다.
# 🔴 제외는 «삭제»가 아니라 «표시»다: 제외로 걸러진 건수를 판정문에 함께 낸다.
ALLOW = [r"fkt:fkt_local_dev@", r"neo4j/fkt_local_dev", r"fkt_local_dev"]


def calibrate():
    bad = []
    for name, rx, sample in PATTERNS:
        if not re.search(rx, sample):
            bad.append(name)
    return bad


def main():
    bad = calibrate()
    print("[gate] 패턴 %d개 교정 — 안 무는 패턴: %s" % (len(PATTERNS), bad or "없음"))
    if bad:
        print("[gate] EXIT2 — 안 무는 정규식의 0건은 정보가 0이다. 전수를 거부한다.")
        return 2

    tools = []
    for t in ("gitleaks", "trufflehog", "detect-secrets", "ggshield"):
        try:
            subprocess.run([t, "--version"], capture_output=True, timeout=8)
            tools.append(t)
        except Exception:
            pass
    print("[tool] 설치된 전용 스캐너: %s" % (tools or "없음 → git log -p 패턴 그물로 대체"))

    ncommits = int(subprocess.run(["git", "rev-list", "--count", "--all"],
                                  capture_output=True, text=True).stdout.strip() or 0)
    patch = subprocess.run(["git", "log", "-p", "--all", "--no-color", "-U0"],
                           capture_output=True, text=True, errors="replace").stdout
    print("[scope] 커밋 %d개 · 패치 %d bytes · 패턴 %d개" % (ncommits, len(patch), len(PATTERNS)))

    hits, allowed = [], 0
    commit = None
    for line in patch.splitlines():
        if line.startswith("commit "):
            commit = line.split()[1][:9]
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for name, rx, _ in PATTERNS:
            m = re.search(rx, line)
            if not m:
                continue
            if any(re.search(a, line) for a in ALLOW):
                allowed += 1
                continue
            frag = m.group(0)
            masked = frag[:6] + "…" + str(len(frag)) + "chars"
            hits.append({"commit": commit, "pattern": name, "masked": masked})

    print("[result] 히트 %d건 · allowlist 로 제외 %d건" % (len(hits), allowed))
    for h in hits[:40]:
        print("  HIT %s %s %s" % (h["commit"], h["pattern"], h["masked"]))
    if len(sys.argv) > 1:
        json.dump({"tools": tools, "commits": ncommits, "patchBytes": len(patch),
                   "patterns": [p[0] for p in PATTERNS], "allowedCount": allowed, "hits": hits},
                  open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
