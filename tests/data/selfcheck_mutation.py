"""생성기 자기 점검 뮤테이션 시험 — 「그 점검은 실패를 «낼 수 있는가»」

    python tests/data/selfcheck_mutation.py        # 리포 루트에서 실행 (DB 불필요)

🔴 왜 필요한가: `generate.py`의 `self_check`가 통과했다는 사실만으로는 아무것도 증명되지 않는다.
   아무것도 검사하지 않는 점검도 언제나 통과한다. **위반을 주입해 실제로 잡히는지**를 봐야
   그 점검이 그물인지 장식인지 갈린다.

🔴 생성기 파일을 수정하지 않는다. `build_all` 결과를 복제해 메모리에서만 위반을 주입하고
   `self_check`만 다시 부른다. CSV도 DB도 건드리지 않는다(임시 디렉터리에만 쓴다).

exit code: 0 = 대조군 통과 + 주입 위반 전건 감지 · 1 = 감지 실패 1건 이상
"""

from __future__ import annotations

import copy
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

from data.generators import generate as G          # noqa: E402
from data.generators.structure import UNMAPPED_FAILURE_MODE  # noqa: E402

GS_DOC = "DOC-SOP-0014"
GS_EQ = "EQ-CNC-204"
GS_COMPONENT = "CP-204-BRG-01"


def m_d5_mapped(t, c):
    """D-5 위반 — 미매핑이어야 할 고장모드에 SOP를 붙인다(데이터가 «너무 완전»해지는 회귀)."""
    row = dict(t["failure_mode_sop"][0])
    row["failure_mode_id"] = UNMAPPED_FAILURE_MODE
    t["failure_mode_sop"].append(row)


def m_d5_no_r09(t, c):
    """D-5 위반 — R09 직결 제거. 부품 경유만으로는 보이지 않는다는 문항 전제가 깨진다."""
    t["equipment_failure_mode"] = [r for r in t["equipment_failure_mode"]
                                   if r["failure_mode_id"] != UNMAPPED_FAILURE_MODE]


def m_d2_same_minutes(t, c):
    """D-2 위반 — r1·r2 작업 시간을 같게. 모듈 상수라 호출 후 복원한다."""
    G.BRG_R1["minutes"] = G.BRG_R2["minutes"]


def m_d2_draft(t, c):
    """D-2 위반 — r2를 draft로 내려 «지금 인용 가능한 revision»을 없앤다."""
    for r in t["document_revision"]:
        if r["document_id"] == GS_DOC and r["id"].endswith("@r2"):
            r["approval_state"] = "draft"


def m_forbidden_id(t, c):
    """Q-UNANS-002 위반 — 미등록이어야 할 설비가 출현한다."""
    row = dict(t["equipment"][0])
    row["id"] = "EQ-CNC-999"
    t["equipment"].append(row)


def m_scale(t, c):
    """규모 위반 — 센서 1건 누락."""
    t["sensor"] = t["sensor"][:-1]
    c["sensor"] -= 1


def m_binding_id(t, c):
    """GS 바인딩 위반 — 행 수는 그대로 두고 ID만 어긋나게 한다(규모 점검에 가리지 않게)."""
    for r in t["component"]:
        if r["id"] == GS_COMPONENT:
            r["id"] = "CP-204-BRG-99"
    for r in t["component_failure_mode"]:
        if r["component_id"] == GS_COMPONENT:
            r["component_id"] = "CP-204-BRG-99"


def m_binding_equipment(t, c):
    """GS 바인딩 위반 — 무대 설비 ID를 바꾼다(행 수 유지)."""
    for r in t["equipment"]:
        if r["id"] == GS_EQ:
            r["id"] = "EQ-CNC-299"


# (이름, 주입 함수, 감지 기대) — 기대 = True면 «자기 점검이 잡아야 한다»
# 🔴 known gap은 «잡히지 않는 것이 현재 상태»로 고정해 둔다. 새로 뚫린 구멍만 실패로 보이게 하고,
#    구멍이 «메워지면» 그때도 기대 불일치로 실패한다 — 표를 갱신하라는 신호다.
MUTATIONS = [
    ("D-5 미매핑 고장모드에 SOP 부착", m_d5_mapped, True),
    ("D-5 R09 직결 제거", m_d5_no_r09, True),
    ("D-2 r1·r2 작업 시간 동일", m_d2_same_minutes, True),
    ("D-2 r2 approved → draft", m_d2_draft, True),
    ("금지 ID 출현(EQ-CNC-999)", m_forbidden_id, True),
    ("규모 위반(sensor 1건 누락)", m_scale, True),
    ("GS 바인딩 ID 변조(부품 · 규모 유지)", m_binding_id, True),
    # 🔴 F-2 (evidence/t1-2-seed-verification.md) — 자기 점검의 바인딩 검사는 «전 테이블 문자열 집합»에
    #    ID가 있는지만 본다. equipment 행의 id를 바꿔도 sensor·alarm 등이 옛 문자열을 들고 있어 통과한다.
    #    처방: GS 키별로 «그 entity 테이블의 id 칼럼»에서 찾도록 좁힌다. (적재 시 FK로는 걸리므로 심각도 낮음)
    ("GS 바인딩 ID 변조(설비 · 규모 유지)", m_binding_equipment, False),
]


def main() -> int:
    out = Path(tempfile.mkdtemp(prefix="fkt-mutation-"))
    tables, counts, _sink = G.build_all(out)

    print("== 생성기 자기 점검 뮤테이션 시험 — «그 점검은 실패를 낼 수 있는가» ==")
    missed = []

    base = G.self_check(copy.deepcopy(tables), dict(counts))
    if base:
        print("  FAIL  대조군(무주입)이 통과하지 못했다 — 표본이 아니라 데이터가 문제다:")
        for f in base:
            print(f"        - {f}")
        return 1
    print("  PASS  대조군(무주입) — 위반이 없으면 통과한다")

    orig_minutes = G.BRG_R1["minutes"]
    caught = 0
    for name, mutate, expect_caught in MUTATIONS:
        t, c = copy.deepcopy(tables), dict(counts)
        mutate(t, c)
        fails = G.self_check(t, c)
        G.BRG_R1["minutes"] = orig_minutes          # 모듈 상수를 건드리는 뮤테이션 복원
        detected = bool(fails)
        if detected:
            caught += 1
        if detected == expect_caught:
            mark = "PASS" if detected else "PASS(known gap)"
            note = fails[0] if detected else "미감지 — 알려진 구멍(F-2)으로 고정돼 있다"
            print(f"  {mark:<15} {name}")
            print(f"        → {note}")
        else:
            missed.append(name)
            if detected:
                print(f"  기대 불일치     {name} — 이제 «잡힌다». 구멍이 메워졌으니 표를 갱신하라")
            else:
                print(f"  FAIL            {name} — 자기 점검에 이 축이 없다(새로 뚫린 구멍)")

    print()
    known = sum(1 for _n, _m, e in MUTATIONS if not e)
    print(f"결과: 주입 {len(MUTATIONS)}건 · 감지 {caught}건 · 알려진 구멍 {known}건 · "
          f"기대 불일치 {len(missed)}건")
    if missed:
        print("  기대 불일치 = 감지 결과가 표와 다르다. 새 구멍이면 결함이고, 메워진 것이면 표 갱신 대상이다.")
    return 1 if missed else 0


if __name__ == "__main__":
    raise SystemExit(main())
