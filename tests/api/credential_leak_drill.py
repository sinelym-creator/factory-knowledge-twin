"""credential_leak_drill — 자격 증명·내부가 표면으로 새지 않는가 (검증 좌석 · T2-3 보안).

🔴 이 그물이 지키는 문장: **인증 없는 공개 Sandbox 의 응답·이벤트·로그 어디에도 자격 증명과
   내부 구조가 없다.** baseline §15.2(Claude 구독을 공개 API 로 노출 금지) · §34.6(공개 경계).
   T2-3 이 LLM 호출 경계를 여는 티켓이라 이 축이 여기서 가장 위험해진다 — 키는 대개 «응답»이
   아니라 **오류 message·로그·이벤트 note** 로 샌다.

🔴 표면 목록을 이 파일에 상수로 적지 않는다. 정본(`packages/contracts/rest-api-v0.1.md`)의
   경로 표에서 매 실행 뽑는다 — 베껴 두면 계약이 자란 뒤에도 옛 목록만 훑고 초록을 말한다.
   해제 전(501)·미구현 라우트는 **red 가 아니라 skip** 이다(「아직 안 만들었다」는 결함이 아니다).

🔴 되비친 내 입력은 누출이 아니다(8대 실수 성문 · 원장 Q-23). 판정 전에 내가 보낸 문자열을
   지우고 남은 것만 «대상이 스스로 말한 것»으로 센다. 이 규율이 없으면 그물이 자기 그림자를 문다.

    python tests/api/credential_leak_drill.py
    python tests/api/credential_leak_drill.py --log <서버 로그 파일>   # 로그 면까지

exit: 0 = 누출 0 · 1 = 누출 1건 이상 · 2 = 실행 오류(측정 불가)
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CONTRACT = REPO / "packages" / "contracts" / "rest-api-v0.1.md"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-leak-drill"

# 계약 경로 표의 셀 — `GET \`/evidence/{evidenceId}\`` 꼴에서 메서드와 경로를 뽑는다.
_ROUTE = re.compile(r"^\|\s*(GET|POST|PATCH|PUT|DELETE|WS)\s+`([^`]+)`")

# 「내부가 샜다」의 표지. 🔴 값 자체를 여기 적지 않는다 — 형상만 적는다.
LEAK_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Anthropic 키 형상", re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}")),
    ("일반 비밀 키 형상", re.compile(r"\b(?:sk|pk)-[A-Za-z0-9]{20,}")),
    ("Authorization 헤더", re.compile(r"[Bb]earer\s+[A-Za-z0-9._\-]{12,}")),
    ("자격 env 이름", re.compile(r"ANTHROPIC_API_KEY|CLAUDE_API_KEY|LANGCHAIN_API_KEY|LANGSMITH_API_KEY")),
    ("DSN·접속 문자열", re.compile(r"postgres(?:ql)?://[^\s\"']+|bolt://[^\s\"']+|neo4j://[^\s\"']+")),
    ("비밀번호 대입", re.compile(r"(?i)password\s*[=:]\s*\S+")),
    ("절대경로(win)", re.compile(r"[A-Za-z]:\\\\?[Uu]sers\\\\?")),
    ("절대경로(posix)", re.compile(r"/(?:home|Users|usr/lib|opt)/[A-Za-z0-9._\-]+")),
    ("traceback", re.compile(r"(?i)traceback \(most recent call last\)|site-packages")),
    ("드라이버 내부", re.compile(r"(?i)asyncpg\.|psycopg|neo4j\.exceptions")),
]


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


def contract_routes() -> list[tuple[str, str]]:
    if not CONTRACT.exists():
        raise DrillError(f"정본 없음: {CONTRACT}")
    found: list[tuple[str, str]] = []
    for line in CONTRACT.read_text(encoding="utf-8").splitlines():
        match = _ROUTE.match(line.strip())
        if match:
            found.append((match.group(1), match.group(2).split("?", 1)[0]))
    seen = list(dict.fromkeys(found))
    if len(seen) < 10:
        raise DrillError(f"계약에서 경로를 {len(seen)}건밖에 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    return seen


# ── 판정 ────────────────────────────────────────────────────────────────────


def residue(text: str, sent: list[str]) -> str:
    """🔴 되돌아온 내 입력은 누출이 아니다 — 판정 전에 지운다."""
    out = text
    for value in sent:
        if not value:
            continue
        for form in (value, json.dumps(value)[1:-1], urllib.parse.quote(value, safe="")):
            out = out.replace(form, " ")
    return out


def leaks(text: str, sent: list[str]) -> list[str]:
    body = residue(text, sent)
    return [name for name, pattern in LEAK_PATTERNS if pattern.search(body)]


def self_check() -> None:
    """🔴 스캐너가 «빨강을 낼 수 있는가»부터."""
    samples: list[tuple[str, str, list[str], bool]] = [
        ("깨끗한 계약 응답", '{"error":{"code":"not_found","message":"evidence X 를 찾을 수 없다"}}', [], True),
        ("키 노출", '{"detail":"auth failed for sk-ant-api03-AAAABBBBCCCCDDDD"}', [], False),
        ("env 이름 노출", '{"message":"ANTHROPIC_API_KEY 가 없다"}', [], False),
        ("DSN 노출", '{"message":"postgresql://fkt:pw@host:5534/fkt 에 붙지 못했다"}', [], False),
        ("traceback 노출", '{"m":"Traceback (most recent call last): File ..."}', [], False),
        ("절대경로 노출", '{"m":"C:\\\\Users\\\\someone\\\\repo\\\\app.py"}', [], False),
        # 🔴 반사 표본 — 내가 보낸 문자열이 되돌아온 것을 누출로 세면 안 된다.
        ("반사된 내 입력", '{"error":{"message":"question ANTHROPIC_API_KEY 는 승인 목록 밖이다"}}',
         ["ANTHROPIC_API_KEY"], True),
    ]
    for name, text, sent, expected_clean in samples:
        found = leaks(text, sent)
        if (not found) is not expected_clean:
            raise DrillError(f"자기 검증 실패 — «{name}» 을 {found or '깨끗'} 로 판정했다")
    print(f"  자기 검증  표본 {len(samples)}종(깨끗 2 · 누출 5) 전건 기대대로 — 스캐너 살아 있음")


# ── 표면 훑기 ───────────────────────────────────────────────────────────────


def call(method: str, path: str, body: dict | None) -> tuple[int, str]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


# 경로 변수는 «있는 것»과 «없는 것» 둘 다 넣는다 — 오류 경로가 더 잘 샌다.
SAMPLE_IDS = {
    "{evidenceId}": ["DOC-SOP-0014@r2#001", "EQ-CNC-999"],
    "{docId}": ["DOC-SOP-0014", "DOC-ZZZ-9999"],
    "{scenarioId}": ["GS-01", "GS-NONE"],
    "{runId}": ["RUN-none"],
    "{incidentId}": ["INC-2026-014"],
    "{woId}": ["WO-2026-0113"],
    "{sid}": ["levi2-leak-drill"],
    "{sessionId}": ["levi2-leak-drill"],
    "{plantId}": ["FAC-001"],
    "{equipmentId}": ["EQ-CNC-204"],
    "{sensorId}": ["SN-204-VIB"],
}
BODIES = {
    "POST /retrieval/compare": {"sessionId": SESSION_ID, "question": "ANTHROPIC_API_KEY", "strategies": ["vector"]},
    "POST /scenarios/{scenarioId}/runs": {"sessionId": SESSION_ID, "mode": "live"},
}


def expand(path: str) -> list[str]:
    out = [path]
    for token, values in SAMPLE_IDS.items():
        if token in path:
            out = [p.replace(token, urllib.parse.quote(v, safe="")) for p in out for v in values]
    return [p for p in out if "{" not in p]


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    routes = contract_routes()
    print(f"정본      : {CONTRACT.relative_to(REPO)} · 경로 {len(routes)}건")
    print(f"대상      : {API_BASE}\n")
    self_check()

    log_path = None
    if "--log" in sys.argv:
        log_path = Path(sys.argv[sys.argv.index("--log") + 1])
        if not log_path.exists():
            raise DrillError(f"로그 파일이 없다: {log_path}")

    bad = 0
    probed = skipped = 0
    print("\n  ── 응답 면 — 계약 경로 전수(변수는 있는 것·없는 것 둘 다)")
    for method, path in routes:
        if method == "WS":
            skipped += 1
            continue
        body = BODIES.get(f"{method} {path}")
        sent = [json.dumps(body, ensure_ascii=False)] if body else []
        for concrete in expand(path):
            status, text = call(method, "/api" + concrete, body)
            if status == 501:
                skipped += 1
                continue
            probed += 1
            found = leaks(text, sent + [concrete])
            if found:
                bad += 1
                print(f"  FAIL  {method} {concrete} → {status} · {' · '.join(found)}")
                print(f"        {text[:160]}")
    print(f"  {'PASS' if not bad else 'FAIL'}  L-01 응답 {probed}건 누출 {bad}건 (미해제 skip {skipped}건)")
    if probed == 0:
        raise DrillError("훑은 응답이 0건이다 — 초록이 아니라 고장이다")

    if log_path:
        text = log_path.read_text(encoding="utf-8", errors="replace")
        found = leaks(text, [])
        ok = not found
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  L-02 로그 면 {log_path.name} — {' · '.join(found) or '누출 0'}")
    else:
        print("  ----  L-02 로그 면 — 건너뜀(--log 로 켠다). 🔴 로그는 응답보다 느슨해지기 쉬운 자리다")

    print(f"\n결과: 누출 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
