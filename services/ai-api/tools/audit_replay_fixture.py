"""replay fixture 공개 경계 심사 (T2-4 · 오케 판정 J-E).

    python -m tools.audit_replay_fixture                 # data/replay/gs-01.events.jsonl 심사
    python -m tools.audit_replay_fixture --self-test     # 🔴 대조군: 위반을 주입해 «우는지» 본다
    python -m tools.audit_replay_fixture --scenario GS-01 --fixture-dir <dir>

fixture 는 **리포에 커밋되는 실물**이라, 공개 경계(baseline §15.2·§16·§34.6)가 처음으로
산출물 자체에 걸린다. 이 심사기는 그 경계를 «눈»이 아니라 코드로 본다 — 옮겨 적은 대조표는
조용히 낡고, 사람은 200줄짜리 JSONL 을 두 번째부터 안 읽는다.

🔴 **못 우는 심사기는 심사가 아니다**(오케 단서). `--self-test` 는 위반 표본을 «메모리 안의
   사본»에 주입해 이 심사기가 실제로 검출하는지 확인한다. 파일에 주입하지 않는 이유: 주입한
   뒤 지우는 절차가 실패하면 위반이 커밋된다 — 대조군이 사고가 된다.

🔴 **그리고 자기가 고른 표본으로만 우는 심사기도 심사가 아니다**(V-8 · 검증 좌석 적발).
   첫 판의 대조군은 절대경로·「자격 증명 이름표」 2종이었고 둘 다 초록이었다. 밖에서 온
   표본(`sk-ant-…` 값만 · `ghp_…` 값만 · `api.claude.ai`)을 먹이자 그대로 통과했다 —
   **키의 «이름표»와 벤더 «이름»은 보면서 키 자신의 «형상»은 어느 축에도 없었다.**
   내가 잡을 줄 아는 것으로 내가 잡는지 확인한 것이라, 초록이 아무것도 뜻하지 않았다.

   그래서 대조군의 구조를 바꿨다(같은 구멍이 재발할 자리를 없앤다):
     ① 표본은 **축마다 최소 1개**다 — `RULES` 에 축을 더하고 표본을 잊으면 self-test 가
        먼저 운다(「잊을 수 있는 자리를 없앤다」 · V-7 계보).
     ② 밖에서 온 표본은 **출처를 달아 코드에 남긴다** — 다음 세대가 「이건 왜 있나」로
        지우지 못하게, 그리고 검증이 같은 표본으로 독립 재현할 수 있게.
     ③ 🔴 **오탐 대조군을 함께 둔다** — 정상 문자열(온톨로지 ID·sha256 지문·GP- evidenceId)이
        «울지 않는지». 값 형상 축은 고엔트로피 문자열을 물기 쉬워서, 우는 것만 확인하면
        「전부 위반」이라 외치는 심사기도 통과한다.

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
#
# 🔴 **이 파일에서 `\b` 를 쓰지 않는다 — 낱말 경계는 한국어 앞에서 불발한다**(V-9).
#    파이썬 `re` 에서 한글은 `\w` 다. 그래서 `AKIA…0이` 는 `\w→\w` 전이라 경계가 서지 않고,
#    종단 `\b` 를 단 규칙이 **그 자리에서 조용히 통과시킨다**. 이 fixture 의 문자열은
#    한국어 문장이므로, 키가 새는 가장 그럴듯한 문맥이 정확히 그 불발 구간이다 —
#    「지키는 척하는 축」이 된다.
#
#    대신 **문자집합으로 잠근다**: 종단은 `(?![0-9A-Za-z])`, 선두는 `(?<![0-9A-Za-z])`.
#    한글은 이 집합 밖이라 「키 뒤에 조사가 붙어도」 검출되고, 라틴 문자가 이어지는 경우
#    (더 긴 낱말의 일부)는 여전히 걸러진다.
#
#    🔴 이 리포가 같은 병으로 값을 치른 것은 이번이 처음이 아니다 — V-1(`anchors._ID_RE`
#    끝 `\b` 가 「EQ-CNC-204의」에서 불발) · V-3(제목 경계)의 처방이 바로 이 잠금인데,
#    **새로 쓴 이 파일이 그 처방의 사정거리 밖에 있었다.** 처방이 리포에 있다는 것과 내
#    파일에 왔다는 것은 다른 사실이다.
_END = r"(?![0-9A-Za-z])"        # 종단 잠금 — 한글·공백·구두점 뒤면 검출된다
_START = r"(?<![0-9A-Za-z])"     # 선두 잠금 — 한글 바로 뒤에 붙어 있어도 검출된다

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
        # 🔴 위 축과 «따로» 둔다(V-8 처방). 한 축에 합치면 이름표 표본 하나로 그 축의 표본
        #    요건이 채워져, 값 형상이 표본 없이 남는 자리가 그대로 살아난다 — 이번에 물린
        #    구멍이 정확히 그 형태였다.
        "credential_value",
        # 🔴 두 갈래인 이유는 «구분자»다. 첫 판은 접두 뒤에 `[-_]` 를 요구했는데, AWS 키는
        #    `AKIA` 뒤에 구분자 없이 영숫자가 바로 이어져 표본이 통과했다 — 이 도구의 오탐
        #    대조군이 아니라 «주입 대조군»이 그 자리에서 잡아 준 결함이다.
        # 🔴 JWT 갈래는 구조가 뚜렷해 넣는다(`eyJ…` 두 마디 · 검증 좌석 소견ⓐ 채택) —
        #    sha256 지문과 형상이 겹치지 않아 오탐 비용이 0 이다.
        # 🔴 Google `AIza…` 는 **일부러 넣지 않았다** — 이 프로젝트의 자격 표면(Anthropic·
        #    GitHub·AWS·DB)에 없다. 「없는 것」과 「안 본 것」을 가르기 위해 사유를 여기 남긴다:
        #    자격 표면이 늘면 그때 이 줄이 판단 기록으로 남아 있어야 다시 물을 수 있다.
        re.compile(
            _START
            + r"(?:sk-ant|sk-proj|sk|pk|ghp|gho|ghu|ghs|github_pat|xox[baprs]|glpat)"
            r"[-_][A-Za-z0-9_-]{16,}"
            r"|" + _START + r"(?:AKIA|ASIA)[0-9A-Z]{16}" + _END
            + r"|" + _START + r"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}"
        ),
        "이름표 없이 «값만» 실려 나가는 것이 키가 실제로 새는 형태다(§15.2 가 지키는 물건)",
    ),
    (
        "connection_string",
        # 선두도 잠근다 — 「접속은postgresql://…」 처럼 한글이 바로 앞에 붙으면 `\b` 가 서지
        # 않아 통과했다(V-9 형제 세기 실측). 종단은 `://` 자체가 경계다.
        re.compile(r"(?i)" + _START + r"(?:postgres(?:ql)?|neo4j(?:\+s)?|bolt|redis|mysql|mongodb)://"),
        "DSN 은 호스트·계정·포트를 한 줄에 담는다",
    ),
    (
        "network_endpoint",
        # 🔴 이 축이 V-9 의 형제였다(내 형제 세기 실측 — 4칸 불발). `\blocalhost\b` 는
        #    「localhost에서」에서 종단이 서지 않고, IP 쪽 `(?<![\w.])…(?![\w.])` 는 한글이
        #    `\w` 라 「10.0.3.44에서」·「주소10.0.3.44」 양쪽 모두 놓쳤다. 점(`.`)만 남겨
        #    잠근다 — 버전 문자열(`1.2.3.4.5`)과의 구분은 그 점이 한다.
        re.compile(
            r"(?i)" + _START + r"localhost" + _END
            + r"|(?<![0-9A-Za-z.])(?:\d{1,3}\.){3}\d{1,3}(?![0-9A-Za-z.])"
        ),
        "내부 주소가 공개 fixture 에 남을 이유가 없다",
    ),
    (
        "claude_gateway",
        # 🔴 호스트 «형상»을 더한다(V-8 형제 — 검증 좌석 적발). 앞판은 `claude[_-]?(api|key|
        #    token)` 이라 구분자가 `.` 인 `api.claude.ai` 가 통과했다 — 이 축의 성문이
        #    「구독 «경로»를 드러내지 않는다」인데 경로 그 자체가 빠져나간 것이다.
        # 🔴 그 뒤 종단을 `\b` 로 달았더니 이번엔 «URL 이면 잡고 호스트 단독 + 조사면 놓치는»
        #    축이 됐다(V-9). 한쪽만 초록인 상태를 「고쳤다」로 읽지 않게 잠금으로 바꾼다.
        re.compile(
            r"(?i)anthropic|claude[_-]?(?:api|key|token)|x-api-key"
            r"|" + _START + r"(?:api\.)?claude\.ai" + _END
        ),
        "Claude 구독 경로를 공개 산출물에 드러내지 않는다(baseline §15.2)",
    ),
)

# 🔴 **넣지 않기로 한 축 1개 — 「일반 고엔트로피 40자+」**(실측 근거를 남긴다).
#    `\b[A-Za-z0-9+/=_-]{40,}\b` 로 재 보니 **정상 fixture 에서 오탐 5건**이 났다 — 근거의
#    `contentHash`(sha256 64자)가 정확히 그 형상이기 때문이다. 켜면 깨끗한 fixture 가 매번
#    FAIL 하고, 그렇게 항상 빨간 신호는 곧 아무도 안 보는 신호가 된다(계보). 게다가 그 축은
#    위 두 표본(sk-ant·ghp)을 **잡지도 못했다**(하이픈 때문에 40자 연속이 끊긴다) — 못 잡는
#    것을 얻으려고 잡을 것을 잃는 교환이라 채택하지 않는다. 필요해지면 「값 형상」 축을
#    벤더별로 넓히는 편이 싸다.


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
#
# 🔴 **축마다 최소 1개**다(아래 `self_test` 가 강제한다). `RULES` 에 축을 더하고 표본을
#    잊으면 이 도구가 자기 결함을 먼저 말한다.
# 🔴 `source` 는 표본의 «출처»다. 밖에서 온 표본(V-8)을 지우지 못하게 남긴다 — 자기가 고른
#    표본만 남으면 이 대조군은 다시 자기 확인이 된다.
#
# 키 형상 표본은 **조립해서** 만든다. 진짜처럼 보이는 리터럴을 소스에 두면 그 파일이 다음
# 스캐너의 적발 대상이 되고, 「가짜입니다」라는 주석은 스캐너가 읽지 않는다.
_FAKE_ANTHROPIC = "sk-ant-" + "api03-" + "AAAA" * 5 + "zz"
_FAKE_GITHUB = "ghp_" + "B" * 24
_FAKE_AWS = "AKIA" + "C" * 16


@dataclass(frozen=True)
class Injection:
    axis: str
    label: str
    payload: str
    source: str


_INJECTIONS: tuple[Injection, ...] = (
    Injection(
        "absolute_path", "이 머신의 경로",
        r"C:\Users\operator\repos\factory-knowledge-twin\data\seed.csv 에서 읽음",
        "구현(초판)",
    ),
    Injection(
        "credential", "자격 «이름표»",
        "postgres password=fkt_local_dev 로 접속", "구현(초판)",
    ),
    Injection(
        "connection_string", "DSN",
        "postgresql://fkt:pw@db.internal:5432/fkt 연결 실패", "구현(V-8 정정 — 축 표본 보충)",
    ),
    Injection(
        "network_endpoint", "내부 주소",
        "10.0.3.44:7687 로 붙었다", "구현(V-8 정정 — 축 표본 보충)",
    ),
    # 🔴 **한글 문맥 표본**(V-9 정정 — 구조 보정). 앞판의 표본은 전부 «라틴 문맥»이었고,
    #    그래서 종단 `\b` 불발을 대조군이 한 번도 보지 못했다. 검증 좌석의 그물이 이것을 잡은
    #    이유도 「더 잘 골라서」가 아니라 **표본을 한국어 문장 «안»에 심었기 때문**이다 —
    #    문맥이 표본의 일부였다. 그래서 문맥 축을 표본 목록에 상주시킨다: 축마다 「조사가
    #    바로 붙은 형태」를 하나씩 둔다. 이 줄들을 지우면 V-9 가 조용히 되살아난다.
    Injection(
        "credential_value", "🔴 한글 조사 인접 — AWS", f"자격 {_FAKE_AWS}이 거부됐다",
        "구현(V-9 정정 — 문맥 축 상주)",
    ),
    Injection(
        "credential_value", "🔴 한글 바로 뒤 — sk-ant", f"키는{_FAKE_ANTHROPIC} 였다",
        "구현(V-9 정정 — 문맥 축 상주)",
    ),
    Injection(
        "credential_value", "JWT 두 마디", "토큰 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9 거부",
        "검증 좌석 소견ⓐ(V-9 회차)",
    ),
    Injection(
        "claude_gateway", "🔴 호스트 단독 + 조사", "게이트웨이 claude.ai에 닿지 못했다",
        "검증 좌석 V-9",
    ),
    Injection(
        "network_endpoint", "🔴 한글 조사 인접 — localhost", "localhost에서 거부됐다",
        "구현(V-9 형제 세기 — 내 적발)",
    ),
    Injection(
        "network_endpoint", "🔴 한글 바로 앞 — IP", "주소10.0.3.44 로 붙었다",
        "구현(V-9 형제 세기 — 내 적발)",
    ),
    Injection(
        "connection_string", "🔴 한글 바로 앞 — DSN", "접속은postgresql://u:p@h:5432/db 였다",
        "구현(V-9 형제 세기 — 내 적발)",
    ),
    # 🔴 아래 넷은 **밖에서 온 표본**이다 — 검증 좌석(리바이2 8대)이 V-8 로 심어 통과시킨
    #    바로 그 형태다. 이것이 초록이면 그때 비로소 이 심사기가 「밖에서도 운다」는 뜻이다.
    Injection(
        "credential_value", "sk-ant «값만»(이름표 없음)",
        f"합성 실패 — {_FAKE_ANTHROPIC} 로 붙지 못했다", "검증 좌석 V-8",
    ),
    Injection(
        "credential_value", "ghp_ «값만»",
        f"토큰 {_FAKE_GITHUB} 이 거부됐다", "검증 좌석 V-8",
    ),
    Injection(
        "credential_value", "AKIA «값만»",
        f"{_FAKE_AWS} 자격으로 접근", "검증 좌석 V-8",
    ),
    Injection(
        "claude_gateway", "호스트 형상(구분자가 «.»)",
        "게이트웨이 api.claude.ai/v1/messages 미도달", "검증 좌석 V-8(형제 적발)",
    ),
)

# 🔴 **오탐 대조군** — 이 문자열들은 «울면 안 된다». 값 형상 축은 고엔트로피 문자열을 물기
#    쉬워서, 우는 것만 확인하면 「전부 위반」이라 외치는 심사기도 자기 검증을 통과한다.
#    표본은 이 리포가 실제로 내는 종류다(온톨로지 ID · 지문 · 재조립 불가 evidenceId · 시각).
_FALSE_POSITIVE_PROBES: tuple[tuple[str, str], ...] = (
    ("온톨로지 ID(인용)", "DOC-MAN-0021@r1#006"),
    ("온톨로지 ID(이력)", "MR-2025-0087"),
    ("graph 근거 id", "GP-7e4cfd025422-03"),
    ("run·초안 id", "RUN-7e4cfd025422 · WOD-eaa4fce81c0b"),
    ("sha256 지문 64자", "3eb624c237dbeaac9f1e77a5c40b8d2e15c9a4f8b3d6e0172a95c8de4b1f36a0"),
    ("임베딩 모델 id", "sentence-transformers/all-MiniLM-L6-v2"),
    ("ISO 시각", "2026-08-29T20:22:52.410Z"),
    ("낱말이 겹치는 정상 문자열", "task-completed-0123456789abcdef · risk-assessment-2026"),
)


def _inject(events: list[dict[str, Any]], payload: str) -> list[dict[str, Any]]:
    """마지막 이벤트의 payload 에 문자열 하나를 심은 «사본»을 만든다(원본 무접촉)."""
    tainted = copy.deepcopy(events)
    tainted[-1]["payload"]["_probe"] = payload
    return tainted


def uncovered_axes() -> list[str]:
    """표본이 없는 축 — 「한 번도 시험되지 않은 채 초록을 내는」 축의 목록.

    🔴 `--self-test` 안에만 두지 않는다(검증 좌석 소견ⓑ 채택). CI 가 기본 실행만 걸면
       「새 축을 열고 표본을 잊는」 일이 조용히 통과한다 — 가드가 옵션 뒤에 있으면 그 가드는
       걸지 않은 것과 같다.
    """
    covered = {i.axis for i in _INJECTIONS}
    return [axis for axis, _, _ in RULES if axis not in covered]


def self_test(events: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """대조군 3종 — ① 축 표본 누락 ② 주입 → 검출 ③ 정상 문자열 → 침묵."""
    lines: list[str] = []
    clean = audit(events)
    lines.append(f"  기준선(원본) 위반 {len(clean.violations)}건 · 문자열 {clean.strings}개")
    ok = clean.ok
    if not ok:
        lines.append("  🔴 원본이 이미 위반이거나 스캔량이 0 — 대조군 이전에 실패다")

    # ① 🔴 축마다 표본이 있는가. 없으면 그 축은 «한 번도 시험되지 않은 채» 초록을 낸다.
    uncovered = uncovered_axes()
    if uncovered:
        ok = False
        lines.append(f"  ✘ 표본 없는 축 {uncovered} — 시험되지 않은 축은 초록을 낼 자격이 없다")
    else:
        lines.append(f"  ✔ 축 표본 충족 {len(RULES)}축 / 표본 {len(_INJECTIONS)}종")

    # ② 주입 → 검출. 밖에서 온 표본은 출처를 함께 찍는다.
    for inj in _INJECTIONS:
        caught = [v for v in audit(_inject(events, inj.payload)).violations if v.axis == inj.axis]
        mark = "✔" if caught else "✘"
        if not caught:
            ok = False
        lines.append(
            f"  {mark} [{inj.axis}] {inj.label} → 검출 {len(caught)}건  ({inj.source})"
        )

    # ③ 🔴 오탐 대조군 — 정상 문자열에는 침묵해야 한다.
    noisy = 0
    for label, probe in _FALSE_POSITIVE_PROBES:
        fired = [v.axis for v in audit(_inject(events, probe)).violations]
        if fired:
            noisy += 1
            ok = False
            lines.append(f"  ✘ 오탐 [{label}] → {fired} 가 울었다 — 정상 문자열이다")
    if not noisy:
        lines.append(f"  ✔ 오탐 없음 — 정상 표본 {len(_FALSE_POSITIVE_PROBES)}종에 침묵")
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

    # 🔴 표본 강제는 **기본 실행에서도** 운다(검증 좌석 소견ⓑ). 옵션 뒤에 숨은 가드는
    #    CI 가 기본 실행만 걸 때 걸지 않은 것과 같고, 그러면 「새 축 + 표본 망각」이 조용히
    #    통과한다 — 이 도구가 막으려는 것이 정확히 그 «조용한 통과»다.
    uncovered = uncovered_axes()
    if uncovered:
        print(f"\n🔴 표본 없는 축 {uncovered} — 시험되지 않은 축은 초록을 낼 자격이 없다")
        exit_code = 1
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
