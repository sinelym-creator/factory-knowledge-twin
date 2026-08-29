"""GS 바인딩 검사의 «사정거리» 측정 — 그 그물이 20키 «전부»에 닿는가

    python tests/data/probe_binding_scope.py       # 리포 루트에서 실행 (DB 불필요)

🔴 왜 별도 도구인가: `selfcheck_mutation.py`는 GS 20키 중 **2키**(component·equipment)만 찔러 본다.
   그 표만 보면 F-2는 「equipment 1건이 안 잡힌다」로 읽혔다. 그러나 미감지의 원인이
   **검사 방식**(전 테이블 문자열 집합에서 «존재»만 본다)이었으므로, 구멍은 키 하나가 아니라
   «소유 테이블 밖에 그 문자열을 들고 있는 모든 키»였다 — 실측 18/20. 그 넓이를 잰 것이 이 도구고,
   처방(`config.GS_OWNER`) 착지 후 **20/20 감지**를 확인해 F-2를 닫은 것도 이 도구다.
   🔴 남겨 두는 이유: 구멍이 닫혔음을 «지금도» 재는 유일한 자리다. 표만 초록으로 두면
   검사가 옛 방식으로 돌아가도 아무도 모른다.

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

# 🔴 기대표 = «현재 그물이 실제로 닿는 곳». 2026-08-29 F-2 처방 착지로 **전 키 True**로 전환했다.
#    (그 전 값 = `{"sensor_cur", "alarm"}` 2건만 True — 그 둘조차 «검사가 지켜서»가 아니라
#     그림자 참조가 0곳이라 문자열이 집합에서 통째로 사라져 잡히던 것이다. 감지 여부가
#     검사의 성질이 아니라 데이터의 우연이었다는 뜻이고, 그게 F-2가 «구조적»이었던 이유다.)
#
# 🔴 이제 한 키라도 False로 돌아오면 그건 결함이다 — 표를 고치지 말고 `config.GS_OWNER`와
#    `self_check`의 바인딩 블록을 봐라. GS에 키를 «새로 넣고» GS_OWNER에 안 넣으면
#    self_check가 「GS 소유 테이블 미정의」로 먼저 운다(건너뛰지 않는다).
EXPECTED_DETECTED: dict[str, bool] = {k: True for k in GS}


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
        print("  🔴 소유 테이블의 id만 바꾸면 «한 키도» 잡히지 않는다 — F-2 회귀다(2026-08-29 닫힌 구멍).")
        print("     검사가 다시 «전 테이블 문자열 집합»을 보고 있지 않은지 self_check를 열어 봐라.")
    if mismatched:
        print(f"  기대 불일치 = {mismatched} · 메워졌으면 기대표를, 넓어졌으면 결함을 본다.")
    return 1 if mismatched else 0


if __name__ == "__main__":
    raise SystemExit(main())
