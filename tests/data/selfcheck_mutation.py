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
from data.generators.config import EXPECTED_QUOTES  # noqa: E402
from data.generators.documents import extract_sop_fields  # noqa: E402
from data.generators.structure import UNMAPPED_FAILURE_MODE  # noqa: E402

GS_DOC = "DOC-SOP-0014"
GS_EQ = "EQ-CNC-204"
GS_COMPONENT = "CP-204-BRG-01"
GS_MR = "MR-2025-0087"
TIME_HEADING = "## 4. 예상 작업 시간"


def _sop_revisions(t):
    """DOC-SOP-0014의 revision을 번호로 찾는다 — 본문을 직접 만지기 위한 손잡이."""
    return {r["revision_no"]: r
            for r in t["document_revision"] if r["document_id"] == GS_DOC}


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
    """D-2 위반 — r1의 「예상 작업 시간」 절을 r2 값으로 맞춘다.

    🔴 옛 판은 코드 상수(`BRG_R1["minutes"]`)를 건드렸다. 본문이 `data/documents/*.md`로
       옮겨간 뒤 그 상수가 사라져 이 시험은 AttributeError로 죽었다 — 도구가 조용히
       무력화되는 경로였다. 이제 자기 점검이 «실제로 읽는 것»과 같은 것, 즉 본문을 건드린다.
    """
    revs = _sop_revisions(t)
    m1 = extract_sop_fields(revs[1]["body"])["minutes"]
    m2 = extract_sop_fields(revs[2]["body"])["minutes"]
    body = revs[1]["body"]
    i = body.find(TIME_HEADING)
    revs[1]["body"] = body[:i] + body[i:].replace(f"{m1}분", f"{m2}분", 1)


def m_section_heading_broken(t, c):
    """절 제목 파괴 — 화면·자기 점검·검증이 같은 좌표로 읽는 절 번호가 흔들리면 파싱이 죽는다."""
    revs = _sop_revisions(t)
    revs[2]["body"] = revs[2]["body"].replace(TIME_HEADING, "## 4. 작업 시간")


def m_quote_removed(t, c):
    """T1-3 위반 — 화면이 띄우는 인용 문장을 본문에서 지운다(문서가 화면을 배신하는 회귀).

    🔴 SOP 문서가 아니라 MANUAL 문서의 인용문을 고른다. SOP 본문의 문장을 지우면 절 구조
       파싱이 «먼저» 깨져 그 사유로 잡히고, 정작 인용 검사는 측정되지 않는다 — 감지됐다는
       사실만 보고 넘어가면 그 축은 시험되지 않은 채 초록으로 남는다.
    """
    rev_id, quote, _screen = next(q for q in EXPECTED_QUOTES if q[0].startswith("DOC-MAN"))
    for r in t["document_revision"]:
        if r["id"] == rev_id:
            r["body"] = r["body"].replace(quote, "(삭제됨)")


def m_f1_id_year(t, c):
    """F-1 회귀 — MR ID의 연도를 실제 수행 연도와 어긋나게 만든다.

    F-1은 스키마도 데이터 표본도 아닌 «생성 단계»에서 죽어야 한다고 처방된 결함이다.
    그 그물이 실제로 쳐졌는지 여기서 확인한다. GS 바인딩 ID는 피한다 — 다른 검사에 가려진다.
    """
    for r in t["maintenance_record"]:
        if r["id"] != GS_MR:
            r["id"] = f"MR-{int(r['id'][3:7]) - 1}-{r['id'][8:]}"
            return


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


# (이름, 주입 함수, 감지 기대, 기대 사유 조각) — 기대 = True면 «자기 점검이 잡아야 한다»
# 🔴 known gap은 «잡히지 않는 것이 현재 상태»로 고정해 둔다. 새로 뚫린 구멍만 실패로 보이게 하고,
#    구멍이 «메워지면» 그때도 기대 불일치로 실패한다 — 표를 갱신하라는 신호다.
# 🔴 «사유»까지 대조한다. 다른 검사가 먼저 걸려도 감지 건수는 늘어나므로, 사유를 보지 않으면
#    정작 시험하려던 축이 죽어 있어도 초록으로 보인다(실제로 T1-3 뮤테이션이 그 함정에 빠졌다).
MUTATIONS = [
    ("D-5 미매핑 고장모드에 SOP 부착", m_d5_mapped, True, "D-5 위반"),
    ("D-5 R09 직결 제거", m_d5_no_r09, True, "R09"),
    ("D-2 r1·r2 작업 시간 동일(본문 조작)", m_d2_same_minutes, True, "예상 작업 시간이 같다"),
    ("D-2 r2 approved → draft", m_d2_draft, True, "revision 구성이"),
    ("SOP 절 제목 파괴(파싱 실패)", m_section_heading_broken, True, "절 구조 파싱 실패"),
    ("T1-3 인용 문장 삭제", m_quote_removed, True, "인용 문장 부재"),
    ("F-1 회귀(MR ID 연도 ≠ 수행 연도)", m_f1_id_year, True, "F-1 위반"),
    ("금지 ID 출현(EQ-CNC-999)", m_forbidden_id, True, "금지 ID 출현"),
    ("규모 위반(sensor 1건 누락)", m_scale, True, "규모 불일치"),
    ("GS 바인딩 ID 변조(부품 · 규모 유지)", m_binding_id, True, "GS 바인딩 ID 누락"),
    # 🔴 F-2 «닫힘»(2026-08-29 · 검증 좌석 독립 확인). 옛 상태: 바인딩 검사가 «전 테이블 문자열 집합»에
    #    ID가 있는지만 봐서, equipment 행의 id를 바꿔도 sensor·alarm이 옛 문자열을 들고 있어 통과했다.
    #    처방 착지 = `config.GS_OWNER`(GS 키 → 소유 테이블·칼럼)로 좁힘. 그 뒤 20키 전건 감지를
    #    `probe_binding_scope.py`로 재현하고 이 행을 known gap → 정상 기대로 전환했다.
    #    🔴 사유를 «키까지» 못박는다 — 부품 행과 같은 「GS 바인딩 ID 누락」만 보면 어느 키가
    #       잡혔는지 구분되지 않아, 설비 축이 죽어도 초록으로 보인다.
    ("GS 바인딩 ID 변조(설비 · 규모 유지)", m_binding_equipment, True, "GS 바인딩 ID 누락: equipment"),
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

    # 🔴 주입은 «복제한 tables»만 건드린다 — 모듈 상수·파일을 만지면 복원을 잊는 순간 오염되고,
    #    상수가 사라지면(2026-08-28 회귀) 시험 자체가 죽는다. 그 경로를 원천에서 막는다.
    caught = 0
    for name, mutate, expect_caught, reason in MUTATIONS:
        t, c = copy.deepcopy(tables), dict(counts)
        try:
            mutate(t, c)
        except Exception as e:                      # noqa: BLE001
            # 🔴 주입이 죽으면 그 축은 «측정되지 않은» 것이다. 조용히 넘어가면 감지력이 0인데도
            #    표는 초록으로 남는다 — 실패로 계수해 눈에 보이게 한다.
            print(f"  ERROR           {name} — 주입 자체가 실패했다: {type(e).__name__}: {e}")
            print("        생성기 구조가 바뀌어 이 뮤테이션이 대상을 잃었다. 좌표를 갱신하라.")
            missed.append(name)
            continue
        fails = G.self_check(t, c)
        detected = bool(fails)
        if detected:
            caught += 1
        # 🔴 「잡혔는가」와 「그 검사가 잡았는가」는 다르다. 사유가 어긋나면 시험하려던 축은 미측정이다.
        hit = next((f for f in fails if reason and reason in f), None)
        if detected and reason and hit is None:
            missed.append(name)
            print(f"  사유 불일치     {name} — 감지는 됐으나 «다른 검사»가 잡았다")
            print(f"        기대 사유 「{reason}」 / 실제 → {fails[0]}")
            print("        이 축은 아직 시험되지 않았다. 다른 검사에 걸리지 않는 주입으로 좁혀라.")
        elif detected == expect_caught:
            mark = "PASS" if detected else "PASS(known gap)"
            note = (hit or fails[0]) if detected else "미감지 — 알려진 구멍으로 «표에 고정»돼 있다"
            print(f"  {mark:<15} {name}")
            print(f"        → {note}")
        else:
            missed.append(name)
            if detected:
                print(f"  기대 불일치     {name} — 이제 «잡힌다». 구멍이 메워졌으니 표를 갱신하라")
            else:
                print(f"  FAIL            {name} — 자기 점검에 이 축이 없다(새로 뚫린 구멍)")

    print()
    known = sum(1 for _n, _m, e, _r in MUTATIONS if not e)
    print(f"결과: 주입 {len(MUTATIONS)}건 · 감지 {caught}건 · 알려진 구멍 {known}건 · "
          f"기대 불일치 {len(missed)}건")
    if missed:
        print("  기대 불일치 = 감지 결과가 표와 다르다. 새 구멍이면 결함이고, 메워진 것이면 표 갱신 대상이다.")
    return 1 if missed else 0


if __name__ == "__main__":
    raise SystemExit(main())
