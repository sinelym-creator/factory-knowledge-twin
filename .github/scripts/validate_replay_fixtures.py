"""replay fixture 전건을 계약 이벤트 스키마로 검증한다(T5-3 조각 C1).

🔴 **이 검사기의 첫 임무는 «무엇을 봤는지» 세는 것이다.** 파일 0건·이벤트 0건에서 조용히
   초록을 내면, fixture 가 사라지거나 경로가 바뀐 날 이 job 은 «아무것도 안 보고» 통과한다.
   그런 검사는 없는 것과 같으므로 두 자리 모두에서 실패한다.
🔴 스키마는 «한 이벤트»의 형상이다(`agent-events-v0.1.schema.json` — WebSocket live 와 replay 가
   공용하고 `mode` 만 다르다). 그래서 JSONL 한 줄이 검증 단위다.
🔴 첫 위반에서 멈추지 않는다. 멈추면 「몇 건이 깨졌는가」를 못 말하고, 고친 뒤 또 돌려야
   다음 하나가 나온다 — 전건을 세고 한 번에 보고한다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# 🔴 **검사기가 자기 출력 때문에 죽지 않게 한다.** 이 파일은 한글과 em dash 를 찍는데, Windows
#    콘솔 기본 인코딩(cp949)에서는 그 글자가 UnicodeEncodeError 로 올라온다 — 검사기가 죽으면
#    「검사 실패」와 「검사기 고장」이 같은 rc 1 로 보이고, 그때 사람은 fixture 를 의심한다.
#    러너(ubuntu)는 UTF-8 이라 여기서만 나는 형태지만, 로컬에서 돌릴 수 없는 검사기는 고쳐 쓰기
#    어려워진다. errors="replace" 로 «못 그리는 글자» 때문에 판정이 뒤집히는 길을 막는다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from jsonschema import Draft202012Validator

REPO = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO / "data" / "replay"
SCHEMA_PATH = REPO / "packages" / "contracts" / "agent-events-v0.1.schema.json"
PATTERN = "*.events.jsonl"


def main() -> int:
    if not SCHEMA_PATH.is_file():
        print(f"FAIL 스키마가 없다: {SCHEMA_PATH.relative_to(REPO)}")
        return 1
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    # 🔴 스키마 자신이 유효한지 먼저 본다 — 깨진 스키마는 «모든 것을 통과»시킬 수 있다.
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)

    files = sorted(FIXTURE_DIR.rglob(PATTERN))
    if not files:
        print(f"FAIL fixture 를 하나도 찾지 못했다: {FIXTURE_DIR.relative_to(REPO)}/**/{PATTERN}")
        print("     («0건 통과» 를 막는 자리다 — 경로가 바뀌었거나 fixture 가 사라졌다)")
        return 1

    total_events = 0
    violations: list[str] = []

    for path in files:
        rel = path.relative_to(REPO)
        lines = [(n, s) for n, s in enumerate(path.read_text(encoding="utf-8").splitlines(), 1) if s.strip()]
        if not lines:
            violations.append(f"{rel}: 이벤트 0건 — 빈 fixture 는 통과가 아니다")
            continue
        for lineno, raw in lines:
            total_events += 1
            try:
                event = json.loads(raw)
            except json.JSONDecodeError as exc:
                violations.append(f"{rel}:{lineno}: JSON 파싱 실패 — {exc.msg}")
                continue
            for err in validator.iter_errors(event):
                where = "/".join(str(p) for p in err.absolute_path) or "(최상위)"
                violations.append(f"{rel}:{lineno}: {where} — {err.message}")
        print(f"  {rel}: 이벤트 {len(lines)}건")

    print(f"검사 대상 — fixture 파일 {len(files)}본 · 이벤트 {total_events}건 · 위반 {len(violations)}건")

    if total_events == 0:
        print("FAIL 이벤트를 하나도 읽지 못했다 — 파일은 있으나 내용이 없다")
        return 1
    if violations:
        print(f"FAIL 스키마 위반 {len(violations)}건:")
        for v in violations[:50]:
            print(f"  {v}")
        if len(violations) > 50:
            print(f"  … 그 밖 {len(violations) - 50}건")
        return 1

    print("PASS 전건이 계약 이벤트 스키마를 만족한다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
