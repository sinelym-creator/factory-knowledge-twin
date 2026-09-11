"""T5-2 Gate 7 ① — 사용자 문자열이 «SQL 문면»에 닿는 경로가 있는가.

🔴 여기서 재는 것은 값이 아니라 **식별자**다. 값은 asyncpg 의 `$n` 으로만 실리는 것이
   정적 감사에서 확인됐고(`evidence/t5-2-gate7-sql-audit.md`), 남은 축은 「테이블·컬럼 이름이
   입력에서 오는가」다. 이 리포의 답은 「화이트리스트 조회로만 온다」이고, 이 파일은 그
   조회가 적대 문자열에 **None 을 내는지**를 센다 — None 이면 그 문자열은 SQL 근처에 못 간다.

🔴 DB 가 필요 없다. 판정선이 「질의가 무엇을 돌려주는가」가 아니라 「질의가 조립되는가」라서다.
🔴 대조군을 같이 세운다. 적대 입력이 전부 None 인 것만 보면, `table_of` 가 **늘 None** 을
   내도 초록이다 — 정상 prefix 가 실제 테이블을 내는 것을 함께 본다.
"""

from __future__ import annotations

import pytest

from app.ontology_tables import TABLE_BY_PREFIX, table_of

# 적대 입력 — SQL 주입 상용구 · 바인딩 표기 문자 · 유니코드 방향 제어.
HOSTILE = [
    "' OR 1=1 --",
    "'; DROP TABLE equipment; --",
    "EQ'; DROP TABLE equipment; --",     # 정상 prefix 로 시작하는 변종
    "$1",
    "$1; SELECT 1",
    "equipment",                          # 테이블 이름 그대로
    "EQ\u202e-CNC-204",                   # RIGHT-TO-LEFT OVERRIDE
    "EQ\u0000-CNC",                       # NUL
    "EQ\n-CNC-204",
    "",
    "-",
    "eq-cnc-204",                         # 소문자 — prefix 표는 대문자다
]


@pytest.mark.parametrize("raw", HOSTILE)
def test_hostile_identifier_never_resolves_to_a_table(raw: str) -> None:
    """🔴 판정선 — 적대 문자열은 테이블을 고르지 못한다(None)."""
    assert table_of(raw) is None


def test_known_prefix_still_resolves() -> None:
    """🔴 대조군 — 늘 None 을 내는 함수였다면 위 케이스는 전부 거짓 초록이다."""
    assert table_of("EQ-CNC-204") == "equipment"
    assert table_of("SAF-LOTO-01") == "safety_rule"


def test_every_resolvable_table_name_comes_from_the_whitelist() -> None:
    """조회 결과는 **표 안의 값**뿐이다 — 입력 문자열 조각이 이름으로 새지 않는다."""
    names = {table_of(f"{p}-X-1") for p in TABLE_BY_PREFIX}
    assert names == set(TABLE_BY_PREFIX.values())
    assert all(n.isidentifier() for n in names if n)


def test_prefix_split_cannot_smuggle_a_second_token() -> None:
    """`split('-', 1)` 이 첫 토막만 본다 — 뒤에 무엇을 붙여도 테이블 선택은 안 바뀐다."""
    assert table_of("EQ-'; DROP TABLE equipment; --") == "equipment"
    # 🔴 그래서 **뒤쪽은 값으로만 간다**: 위 문자열 전체가 `$1` 에 실린다(정적 감사 ①).
    #    이 테스트가 지키는 것은 「테이블 이름이 안 바뀐다」이지 「이 입력이 안전하다」가 아니다.
