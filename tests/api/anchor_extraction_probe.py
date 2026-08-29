"""anchor_extraction_probe — 앵커 «경계 불변식» 단위 시험 (검증 좌석 · T2-1 V-1 재발 그물).

🔴 왜 HTTP 그물(`anchor_boundary_drill.py`)과 «따로» 있는가 — 이게 이 파일의 존재 이유다.

V-1 정정은 두 겹으로 들어갔다: ① `anchors._ID_RE` 의 경계를 문자집합으로 잠갔고,
② `service.compare` 가 승인 즉시 `allowlist.canonical(qid)` 로 «표준 표기 하나»로 모은다.
②가 있는 한 HTTP 로는 어떤 표기를 보내도 하류가 같은 문자열을 본다 — **그래서 HTTP 그물의
초록은 이제 「경계가 옳다」가 아니라 「표기가 모인다」를 뜻한다.** 누군가 ①을 되돌려도 그
그물은 초록으로 남는다.

초록이 «무엇의» 초록인지 물었을 때 답이 갈리면, 그 축을 재는 그물을 따로 세운다(5대 계보).
여기가 ①을 직접 재는 자리다.

🔴 대가를 적어 둔다: 이 파일은 대상 모듈(`app.retrieval.anchors`)을 import 한다 — 도구가
   대상에 결합하면 대상이 바뀔 때 함께 죽는다(1대 계보 F-3). 그럼에도 그렇게 한 이유는
   경계 불변식이 «그 함수 안에만» 살아 있어 밖에서 관측할 표면이 없기 때문이다. 결합의
   범위를 순수 함수 하나로 좁히고, 임포트가 깨지면 그 자체를 실행 오류로 죽인다.

🔴 이 표가 «충분한가»를 스스로 시험한다 — 정정 «전» 정규식(`\\b` 종단)을 여기서 다시 만들어
   같은 표에 걸어 본다. 옛 정규식이 이 표를 통과하면 표가 약한 것이다(자기 검증 축).

    python tests/api/anchor_extraction_probe.py

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[2] / "services" / "ai-api"

# (무엇을, 입력, 기대 앵커)
#
# 🔴 「자르지 않는다」도 불변식이다. `EQ-CNC-204X` 는 그 자체로 ID 형상이므로 통째로 나와야
#    한다 — 앞부분만 잘라 `EQ-CNC-204` 를 내면 «없는 ID 로 조회 성공»이라는 V-1 의 병이
#    방향만 바꿔 재발한다. 실재 여부는 조회가 답할 일이고, 추출기가 지어낼 일이 아니다.
CASES: list[tuple[str, str, list[str]]] = [
    ("조사 부착 — 설비",      "EQ-CNC-204의 상태",            ["EQ-CNC-204"]),
    ("조사 부착 — 알람",      "AL-20260826-0041이 발생했다",  ["AL-20260826-0041"]),
    ("조사 부착 — 작업지시",  "WO-2026-0113을 수행",          ["WO-2026-0113"]),
    ("조사 부착 — SOP",       "SOP-BRG-INSP-014에 따라",      ["SOP-BRG-INSP-014"]),
    ("조사 부착 — 부품",      "CP-204-BRG-01는 스핀들",       ["CP-204-BRG-01"]),
    ("백틱 감쌈(정본 표기)",  "`EQ-CNC-204`의",               ["EQ-CNC-204"]),
    ("공백 뒤 조사",          "EQ-CNC-204 의 상태",           ["EQ-CNC-204"]),
    ("괄호 인접",             "SOP-BRG-INSP-014(베어링)",     ["SOP-BRG-INSP-014"]),
    ("문장부호 인접",         "EQ-CNC-204, SN-204-VIB.",      ["EQ-CNC-204", "SN-204-VIB"]),
    ("한글이 «앞»에 붙음",    "설비EQ-CNC-204의",             ["EQ-CNC-204"]),
    ("ID 형상 연장 — 자르지 않는다", "EQ-CNC-204X 는",        ["EQ-CNC-204X"]),
    ("두 ID 연속",            "EQ-CNC-204와 CP-204-BRG-01의", ["EQ-CNC-204", "CP-204-BRG-01"]),
    ("중복 — 등장 순 1회",    "EQ-CNC-204의 EQ-CNC-204는",    ["EQ-CNC-204"]),
    ("소문자 — ID 아님",      "eq-cnc-204의",                 []),
    ("접두 밖 — ID 아님",     "ZZ-CNC-204의",                 []),
    ("ID 없음",               "임계값은 얼마인가?",            []),
]

# 정정 «전» 형상 — `\b` 종단. 🔴 한글은 `\w` 라 조사 앞에서 경계가 서지 않는다.
_PREFIXES = ("FAC", "LN", "EQ", "CP", "SN", "AL", "INC", "WO", "MR", "FM", "SOP", "SAF", "DOC")
_LEGACY_RE = re.compile(rf"\b(?:{'|'.join(_PREFIXES)})-[A-Z0-9]+(?:-[A-Z0-9]+)*\b")


def legacy_extract(text: str) -> list[str]:
    seen: dict[str, None] = {}
    for token in _LEGACY_RE.findall(text):
        seen.setdefault(token, None)
    return list(seen)


def run(extract, label: str) -> list[str]:
    failures = []
    for what, text, expect in CASES:
        got = extract(text)
        if got != expect:
            failures.append(f"{label}/{what}")
    return failures


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if not SERVICE_DIR.exists():
        print(f"실행 오류: 대상 없음 {SERVICE_DIR}")
        return 2
    sys.path.insert(0, str(SERVICE_DIR))
    try:
        from app.retrieval import anchors
    except Exception as e:  # noqa: BLE001
        print(f"실행 오류: app.retrieval.anchors 임포트 실패 — {type(e).__name__}: {e}")
        return 2

    # --- 자기 검증: 이 표가 옛 결함을 «잡을 수 있는가» ---------------------------------
    caught = run(legacy_extract, "legacy")
    if not caught:
        print("실행 오류: 자기 검증 실패 — 정정 «전» 정규식이 이 표를 통과한다. 표가 약하다")
        return 2
    print(f"  자기 검증  정정 전 형상(`\\b` 종단)을 {len(caught)}건에서 잡는다 — 표가 살아 있다")
    print(f"             예: {caught[0].split('/', 1)[1]} · {caught[-1].split('/', 1)[1]}\n")

    # --- 본 시험 ----------------------------------------------------------------------
    bad = 0
    for what, text, expect in CASES:
        got = anchors.extract(text)
        ok = got == expect
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {what:28} {text!r}")
        if not ok:
            print(f"        기대 {expect}\n        실측 {got}")

    print(f"\n결과: {len(CASES) - bad}/{len(CASES)} 기대대로 · 어긋남 {bad}건")
    if bad:
        print("  🔴 경계가 무너지면 «없는 ID 로 조회가 성공»한다 — 빈 결과가 아니라 «틀린 결과»다")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
