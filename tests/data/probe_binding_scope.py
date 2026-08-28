"""GS 바인딩 검사의 «사정거리» 측정 — F-2가 1건짜리 구멍인가, 구조적 구멍인가

    python tests/data/probe_binding_scope.py       # 리포 루트에서 실행 (DB 불필요)

🔴 왜 별도 도구인가: `selfcheck_mutation.py`는 GS 20키 중 **2키**(component·equipment)만 찔러 본다.
   그 표만 보면 F-2는 「equipment 1건이 안 잡힌다」로 읽힌다. 그러나 미감지의 원인이
   **검사 방식**(전 테이블 문자열 집합에서 «존재»만 본다)이라면, 구멍은 키 하나가 아니라
   «소유 테이블 밖에 그 문자열을 들고 있는 모든 키»다. 그 넓이를 재는 것이 이 도구다.

🔴 판정은 «감지했는가»가 아니라 **«바인딩 검사가 감지했는가»**다(사유 대조).
   GS ID를 바꾸면 D-5·F-1 같은 다른 검사가 먼저 걸리는 키가 있다 — 그 감지를 바인딩 검사의
   공로로 계수하면, 정작 재려던 축은 시험되지 않은 채 초록이 된다(계보 규범).

🔴 생성기 파일을 수정하지 않는다. `build_all` 결과를 복제해 메모리에서만 id를 바꾸고
   `self_check`만 다시 부른다.

exit code: 0 = 측정 결과가 기대표와 일치 · 1 = 불일치(구멍이 메워졌거나 넓어졌다)
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
from data.generators.config import GS              # noqa: E402

BINDING_REASON = "GS 바인딩 ID 누락"
MUT_SUFFIX = "-MUT"          # 뒤에 붙인다 — 앞자리(MR 연도 등)를 건드리지 않아 다른 검사를 깨우지 않는다

# 🔴 기대표 = «현재 그물이 실제로 닿는 곳». 2026-08-29 실측으로 고정했다(20키 중 감지 2건).
#    메워지면(True로 바뀌면) 여기가 불일치로 울린다 — 표를 갱신하라는 신호다.
#    처방이 착지하면 전 키가 True가 되어야 한다: self_check의 바인딩 검사를
#    «그 entity 테이블의 id 칼럼»으로 좁힌다(evidence/t1-2 F-2 처방).
#
# 🔴 감지되는 2건은 «검사가 그 키를 지켜서»가 아니라 «그림자 참조가 0곳이라» 문자열이
#    집합에서 통째로 사라져서다. 즉 감지 여부는 검사의 성질이 아니라 데이터의 우연이다.
#    다른 테이블이 그 ID를 참조하게 되는 순간 이 둘도 조용히 미감지로 넘어간다.
EXPECTED_DETECTED: dict[str, bool] = {k: k in {"sensor_cur", "alarm"} for k in GS}


def owning_tables(tables: dict, value: str) -> list[str]:
    """그 값을 «자기 id로» 들고 있는 테이블. 정상이면 정확히 1개다."""
    return [t for t, rows in tables.items()
            if any(r.get("id") == value for r in rows)]


def shadow_refs(tables: dict, value: str, owner: str) -> list[str]:
    """소유 테이블 «밖»에서 그 문자열을 들고 있는 (테이블.칼럼) 목록 — 미감지의 원인."""
    hits = []
    for t, rows in tables.items():
        cols = set()
        for r in rows:
            for col, v in r.items():
                if v == value and not (t == owner and col == "id"):
                    cols.add(col)
        hits += [f"{t}.{c}" for c in sorted(cols)]
    return sorted(hits)


def main() -> int:
    out = Path(tempfile.mkdtemp(prefix="fkt-bindscope-"))
    tables, counts, _sink = G.build_all(out)

    print("== GS 바인딩 검사 사정거리 측정 — «소유 테이블의 id만 바꾸면 잡히는가» ==")
    base = G.self_check(copy.deepcopy(tables), dict(counts))
    if base:
        print("  FAIL  대조군(무주입)이 통과하지 못했다 — 표본이 아니라 데이터가 문제다:")
        for f in base:
            print(f"        - {f}")
        return 1
    print("  PASS  대조군(무주입)")
    print()

    mismatched, detected_n = [], 0
    for key, value in GS.items():
        t, c = copy.deepcopy(tables), dict(counts)
        owners = owning_tables(t, value)
        if len(owners) != 1:
            print(f"  ERROR  {key:<22} 소유 테이블이 {owners} — 1개가 아니다. 좌표를 갱신하라")
            mismatched.append(key)
            continue
        owner = owners[0]
        shadows = shadow_refs(t, value, owner)

        for r in t[owner]:
            if r.get("id") == value:
                r["id"] = value + MUT_SUFFIX

        fails = G.self_check(t, c)
        hit = next((f for f in fails if BINDING_REASON in f), None)
        detected = hit is not None
        detected_n += int(detected)
        mark = "감지" if detected else "미감지"
        ok = detected == EXPECTED_DETECTED.get(key)
        if not ok:
            mismatched.append(key)
        flag = " " if ok else "  ← 기대 불일치"
        other = "" if detected else (f" · 다른 검사 {len(fails)}건" if fails else " · 어느 검사도 울지 않음")
        print(f"  {mark}  {key:<22} {value:<18} 소유={owner:<20} "
              f"그림자참조 {len(shadows)}곳{other}{flag}")
        if shadows:
            print(f"          {', '.join(shadows)}")

    print()
    print(f"결과: GS {len(GS)}키 · 바인딩 검사 감지 {detected_n}건 · 미감지 {len(GS) - detected_n}건 "
          f"· 기대 불일치 {len(mismatched)}건")
    if not detected_n:
        print("  🔴 소유 테이블의 id만 바꾸면 «한 키도» 잡히지 않는다 — F-2는 equipment 한 건이")
        print("     아니라 검사 방식에서 오는 구조적 구멍이다. 처방 = 소유 테이블의 id 칼럼으로 좁히기.")
    if mismatched:
        print(f"  기대 불일치 = {mismatched} · 메워졌으면 기대표를, 넓어졌으면 결함을 본다.")
    return 1 if mismatched else 0


if __name__ == "__main__":
    raise SystemExit(main())
