"""replay fixture 공개 경계 심사 (T2-4 · 오케 판정 J-E).

    python -m tools.audit_replay_fixture                 # data/replay/gs-01.events.jsonl 심사
    python -m tools.audit_replay_fixture --self-test     # 🔴 대조군: 위반을 주입해 «우는지» 본다
    python -m tools.audit_replay_fixture --scenario GS-01 --fixture-dir <dir>

fixture 는 **리포에 커밋되는 실물**이라, 공개 경계(baseline §15.2·§16·§34.6)가 처음으로
산출물 자체에 걸린다. 이 심사기는 그 경계를 «눈»이 아니라 코드로 본다 — 옮겨 적은 대조표는
조용히 낡고, 사람은 200줄짜리 JSONL 을 두 번째부터 안 읽는다.

🔴 **못 우는 심사기는 심사가 아니다**(오케 단서). `--self-test` 는 절대경로·자격 증명을 각
   1건씩 «메모리 안의 사본»에 주입해 이 심사기가 실제로 검출하는지 확인한다. 파일에 주입하지
   않는 이유: 주입한 뒤 지우는 절차가 실패하면 위반이 커밋된다 — 대조군이 사고가 된다.

🔴 **검사가 무엇을 봤는지 센다**(계보: 「빈 결과는 통과가 아니다」). 스캔한 문자열이 0 이면
   그것은 «깨끗함»이 아니라 심사기 고장이므로 FAIL 이다.

형상 검사(필수 필드·seq 단조·종단)는 다시 적지 않고 `app.investigation.replay.load` 를
그대로 쓴다 — 같은 사실을 두 곳에 두면 한쪽만 자란다.
"""

from __future__ import annotations

import argparse
import copy
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from app.investigation import replay  # noqa: E402 — sys.path 조정 뒤에 와야 한다

# 🔴 Windows 콘솔 기본 코드페이지(CP949)에서 한국어 출력이 깨지지 않게 한다. 심사 결과를
#    읽지 못하면 심사를 안 한 것과 같다.
if hasattr(sys.stdout, "reconfigure"):                    # pragma: no cover — 플랫폼 의존
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# --- 경계 규칙 -------------------------------------------------------------------
# 각 규칙 = (축 이름, 정규식, 왜 막는가). 사유를 함께 두는 이유: 나중에 오탐이 났을 때
# 「이 줄이 왜 있는지」를 모르면 규칙이 조용히 삭제된다.
RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "absolute_path",
        re.compile(r"(?:[A-Za-z]:[\\/])|(?:^|[\s\"'(])/(?:home|Users|root|mnt|var|etc)/|\\\\[A-Za-z0-9_.-]+\\"),
        "이 머신의 경로가 커밋되면 개발 환경 구조가 그대로 공개된다(§34.6)",
    ),
    (
        "credential",
        re.compile(
            r"(?i)(?:password|passwd|secret|api[_-]?key|access[_-]?token|bearer\s+[\w.-]+"
            r"|authorization\s*[:=]|private[_-]?key|-----BEGIN)"
        ),
        "자격 증명은 synthetic 이라도 커밋 금지 — 값의 진위와 무관하게 관행이 무너진다",
    ),
    (
        "connection_string",
        re.compile(r"(?i)\b(?:postgres(?:ql)?|neo4j(?:\+s)?|bolt|redis|mysql|mongodb)://"),
        "DSN 은 호스트·계정·포트를 한 줄에 담는다",
    ),
    (
        "network_endpoint",
        re.compile(r"(?i)\blocalhost\b|(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])"),
        "내부 주소가 공개 fixture 에 남을 이유가 없다",
    ),
    (
        "claude_gateway",
        re.compile(r"(?i)anthropic|claude[_-]?(?:api|key|token)|x-api-key"),
        "Claude 구독 경로를 공개 산출물에 드러내지 않는다(baseline §15.2)",
    ),
)


@dataclass
class Violation:
    axis: str
    seq: int
    where: str
    excerpt: str
    why: str


@dataclass
class Report:
    events: int = 0
    strings: int = 0
    chars: int = 0
    violations: list[Violation] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        # 🔴 「위반 0」만으로 통과시키지 않는다 — 아무것도 안 본 심사도 위반 0 이다.
        return not self.violations and self.events > 0 and self.strings > 0


def _walk_strings(value: Any, path: str = "") -> Iterator[tuple[str, str]]:
    """이벤트 안의 모든 문자열 «값»을 경로와 함께 낸다."""
    if isinstance(value, str):
        yield path or "<root>", value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from _walk_strings(item, f"{path}.{key}" if path else str(key))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _walk_strings(item, f"{path}[{index}]")


def _excerpt(text: str, match: re.Match[str]) -> str:
    start = max(0, match.start() - 20)
    end = min(len(text), match.end() + 20)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")


def audit(events: list[dict[str, Any]]) -> Report:
    """이벤트 배열을 공개 경계로 심사한다."""
    report = Report(events=len(events))
    for event in events:
        seq = event.get("seq", -1)
        for where, text in _walk_strings(event):
            report.strings += 1
            report.chars += len(text)
            for axis, pattern, why in RULES:
                match = pattern.search(text)
                if match:
                    report.violations.append(
                        Violation(axis=axis, seq=seq, where=where, excerpt=_excerpt(text, match), why=why)
                    )
    return report


# --- 대조군 ----------------------------------------------------------------------

# 주입 표본 — 실제로 나올 법한 형태여야 한다. 「검출되도록 만든 문자열」이 아니라
# 「실수로 섞일 법한 문자열」을 넣어야 대조군이 뜻을 갖는다.
_INJECTIONS: tuple[tuple[str, str], ...] = (
    ("absolute_path", r"C:\Users\operator\repos\factory-knowledge-twin\data\seed.csv 에서 읽음"),
    ("credential", "postgres password=fkt_local_dev 로 접속"),
)


def self_test(events: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """위반을 «사본»에 주입해 심사기가 우는지 본다. 파일은 건드리지 않는다."""
    lines: list[str] = []
    clean = audit(events)
    lines.append(f"  기준선(원본) 위반 {len(clean.violations)}건 · 문자열 {clean.strings}개")
    ok = clean.ok
    if not ok:
        lines.append("  🔴 원본이 이미 위반이거나 스캔량이 0 — 대조군 이전에 실패다")

    for axis, payload in _INJECTIONS:
        tainted = copy.deepcopy(events)
        # 마지막 이벤트의 payload 에 문자열 하나를 심는다(구조는 그대로 둔다).
        tainted[-1]["payload"]["_injected"] = payload
        caught = [v for v in audit(tainted).violations if v.axis == axis]
        if caught:
            lines.append(f"  ✔ {axis} 주입 → 검출 {len(caught)}건")
        else:
            ok = False
            lines.append(f"  ✘ {axis} 주입 → 검출 0건 — 이 심사기는 그 축을 못 본다")
        # 사본을 버린다(원본 events 는 손대지 않았다).
        del tainted
    return ok, lines


def _render(report: Report, source: str) -> str:
    head = [
        f"fixture  {source}",
        f"스캔     이벤트 {report.events}건 · 문자열 {report.strings}개 · {report.chars:,}자",
    ]
    if report.violations:
        head.append(f"판정     FAIL — 위반 {len(report.violations)}건")
        for v in report.violations[:20]:
            head.append(f"  [{v.axis}] seq={v.seq} {v.where}: {v.excerpt}")
            head.append(f"      왜 막는가: {v.why}")
        if len(report.violations) > 20:
            head.append(f"  … 외 {len(report.violations) - 20}건")
    elif not report.ok:
        head.append("판정     FAIL — 스캔량이 0이다(위반 0이 아니라 심사기 고장)")
    else:
        head.append(f"판정     PASS — 경계 {len(RULES)}축 전부 위반 0")
    return "\n".join(head)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="replay fixture 공개 경계 심사")
    ap.add_argument("--scenario", default="GS-01")
    ap.add_argument("--fixture-dir", default=None, help="기본값 = 리포 data/replay")
    ap.add_argument("--self-test", action="store_true", help="위반 주입 대조군을 함께 돌린다")
    args = ap.parse_args(argv)

    try:
        events = replay.load(args.fixture_dir, args.scenario)
    except (replay.FixtureMissing, replay.FixtureBroken) as exc:
        print(f"심사 불가 — {exc}")
        return 2

    source = replay.fixture_path(args.fixture_dir, args.scenario).name
    report = audit(events)
    print(_render(report, source))

    exit_code = 0 if report.ok else 1
    if args.self_test:
        print("\n대조군(주입 → 검출):")
        ok, lines = self_test(events)
        print("\n".join(lines))
        print(f"대조군 판정  {'PASS' if ok else 'FAIL'}")
        if not ok:
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
