"""pnpm audit JSON + 예외 목록 → web-console 게이트 값(S69-5).

판정 규칙(정본 = `.github/audit-exceptions.json` · 근거 = 각 항목의 `doc`):
  · high/critical 권고 중 **예외 목록의 (id, package) 와 맞는 것만** 뺀다. 나머지는 그대로 게이트다.
  · 예외가 **만료일을 지나면** FAIL 이다(만료일 당일까지 유효 · UTC 날짜).
  · 예외가 audit 결과에 **더 이상 없으면** FAIL 이다 — 「예외를 정리하라」. 죽은 예외는 다음에
    같은 id 가 다시 들어올 때 아무도 모르게 덮는다.
  · 예외 파일이 없거나 항목이 깨져 있으면 FAIL 이다(조용히 「예외 0」으로 읽지 않는다).

🔴 이 스크립트는 실패로 끝나지 않는다(`--exit-code` 를 줄 때만 rc 로 말한다). 판정은
   security.yml 의 마지막 step 이 `JS_VERDICT_FAIL` 로 낸다 — 중간에서 죽으면 요약이 안 남는다.
🔴 시험용 `AUDIT_TODAY=YYYY-MM-DD` 로 「오늘」을 바꿀 수 있다(만료 판정력 증명용).
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

GATED = ("high", "critical")
REQUIRED = ("id", "package", "expires", "doc")


def load_exceptions(path: Path) -> tuple[list[dict], list[str]]:
    """예외 목록과 «항목 자체의» 결함 사유를 돌려준다."""
    if not path.is_file():
        return [], [f"예외 파일이 없다: {path}"]
    try:
        items = json.loads(path.read_text(encoding="utf-8")).get("exceptions", [])
    except (ValueError, AttributeError) as e:
        return [], [f"예외 파일을 읽지 못했다: {e}"]
    errors = []
    for i, x in enumerate(items):
        missing = [k for k in REQUIRED if not x.get(k)]
        if missing:
            errors.append(f"예외 #{i} 필수 칸 없음: {','.join(missing)}")
            continue
        try:
            x["_expires"] = dt.date.fromisoformat(x["expires"])
        except ValueError:
            errors.append(f"예외 {x['id']} 만료일 형식 오류: {x['expires']}")
    return [x for x in items if "_expires" in x], errors


def today() -> dt.date:
    forced = os.environ.get("AUDIT_TODAY")
    return dt.date.fromisoformat(forced) if forced else dt.datetime.now(dt.timezone.utc).date()


def judge(audit: dict, exceptions: list[dict], now: dt.date) -> tuple[list[str], list[str], list[str]]:
    """(게이트에 걸린 권고, 예외로 뺀 권고, 예외 결함) 를 돌려준다."""
    keys = {(x["id"], x["package"]): x for x in exceptions}
    seen: set[tuple[str, str]] = set()
    gated, excepted = [], []
    for a in (audit.get("advisories") or {}).values():
        key = (a.get("github_advisory_id") or "", a.get("module_name") or "")
        seen.add(key)
        if a.get("severity") not in GATED:
            continue
        label = f"{a.get('severity')} {key[1]} {key[0]}"
        (excepted if key in keys else gated).append(label)
    faults = []
    for key, x in keys.items():
        if now > x["_expires"]:
            faults.append(f"예외 만료: {key[1]} {key[0]} (만료 {x['expires']} · 오늘 {now}) — 근거 {x['doc']}")
        if key not in seen:
            faults.append(f"예외 정리하라: {key[1]} {key[0]} 이 audit 결과에 더 이상 없다 — {x['doc']}")
    return gated, excepted, faults


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print("사용법: pnpm_audit_gate.py <pnpm-audit.json> <audit-exceptions.json> [--exit-code]")
        return 2
    meta = {k: 0 for k in ("info", "low", "moderate", "high", "critical")}
    parsed = 0
    audit: dict = {}
    try:
        audit = json.loads(Path(args[0]).read_text(encoding="utf-8"))
        meta.update((audit.get("metadata") or {}).get("vulnerabilities") or {})
        parsed = 1
    except (OSError, ValueError) as e:
        print(f"::warning::pnpm audit JSON 파싱 실패 — {e}")
    exceptions, faults = load_exceptions(Path(args[1]))
    gated, excepted, more = judge(audit, exceptions, today())
    # 🔴 audit 을 못 읽었으면 「예외가 결과에 없다」는 사실이 아니라 측정 실패의 그림자다 —
    #    거짓 「정리하라」를 내지 않는다(실패는 JS_PARSED=0 이 이미 낸다).
    faults += more if parsed else [f for f in more if not f.startswith("예외 정리하라")]
    fail = 1 if (not parsed or gated or faults) else 0
    out = {
        "JS_PARSED": parsed, "JS_HIGH": meta["high"], "JS_CRITICAL": meta["critical"],
        "JS_MODERATE": meta["moderate"], "JS_LOW": meta["low"],
        "JS_GATE": len(gated), "JS_EXCEPTED": len(excepted), "JS_EXC_FAULTS": len(faults),
        "JS_VERDICT_FAIL": fail,
    }
    lines = "\n".join(f"{k}={v}" for k, v in out.items())
    print(lines)
    for g in gated:
        print(f"  게이트  {g}")
    for e in excepted:
        print(f"  예외    {e}")
    for f in faults:
        print(f"::error::{f}")
    print(f"JS 판정 = {'FAIL' if fail else 'PASS'}")
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as fh:
            fh.write(lines + "\n")
    if os.environ.get("GITHUB_STEP_SUMMARY") and (excepted or faults):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write("### web-console 예외\n\n")
            for e in excepted:
                fh.write(f"- 예외로 뺌: `{e}`\n")
            for f in faults:
                fh.write(f"- 🔴 {f}\n")
            fh.write("\n")
    return fail if "--exit-code" in argv else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
