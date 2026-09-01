"""structured 단계 — SSOT 직독 (오케 판정 J-4 (b)안).

무엇이 «있는가»: 앵커 설비에 매달린 센서·알람·정비 이력을 고정 template 으로 읽는다.
GS-01 대본 S3「알람·센서 통계·최근 정비 이력 요약」의 실행분이다.

🔴 **`/retrieval/compare` 를 건드리지 않는다.** T2-1 hybrid 의 `_EXPAND` 는 `EQ→sensor·alarm`
   만 밟고 `EQ→maintenance_record` 간선이 없다. 거기에 간선을 더하면 compare 응답이 바뀌어
   **T2-1 검증 수치가 낡는다**. 그래서 조사는 «검색 전략»을 고치는 대신 같은 화이트리스트
   (`ontology_tables`)·같은 파라미터 바인딩 규율로 **따로 읽는다** — compare 출력은 바이트
   그대로다(오케 판정 08-30).

🔴 **상한은 실측 위에서 정했다**(발주 조건). seed 실측(08-30 · fkt-senku2-q3):
   설비당 최대 정비 이력 4건 · 알람 3건 · 센서 3건. 그리고 대본이 기대하는 `MR-2025-0087`
   은 EQ-CNC-204 의 정비 이력을 **최신순으로 세면 3번째**다(최신은 MR-2026-0006).
   「최근 이력」을 top-1·top-2 로 자르면 **대본 기대 근거가 조용히 사라져 S3 가 FAIL** 한다.
   그래서 종류별 상한을 5로 두어 현 데이터 전량을 포섭하고, 🔴 **상한+1 을 읽어 «잘렸다»를
   눈에 보이게** 만든다 — 데이터가 자라 상한을 넘는 날 조용히 사라지지 않게.
"""

from __future__ import annotations

from typing import Any

from ..ontology_tables import NOISE_COLUMNS
from .events import evidence_ref

# 종류별 상한. 근거는 모듈 머리말 실측 — 「보기 좋은 값」이 아니라 「전량이 들어가는 값」이다.
PER_KIND_LIMIT = 5

# (테이블, 부모 FK, 정렬 열, 정렬 방향). 🔴 이 튜플 밖의 테이블은 읽지 않는다 —
# 사용자 문자열이 조회 대상을 고르는 경로가 없다는 뜻이다(baseline §16.2).
_EQUIPMENT_CHILDREN: tuple[tuple[str, str, str, str], ...] = (
    ("sensor", "equipment_id", "id", "ASC"),
    # 알람 ID 는 `AL-{YYYYMMDD}-{NNNN}` 이라 raised_at 정렬과 ID 정렬이 같은 방향이지만,
    # 「최근」의 정본은 시각 열이다 — ID 규칙이 바뀌어도 뜻이 흔들리지 않게 시각으로 센다.
    ("alarm", "equipment_id", "raised_at", "DESC"),
    ("maintenance_record", "equipment_id", "performed_at", "DESC"),
)


class StructuredResult:
    """단계 산출 — 근거 목록과 «무엇을 몇 건 봤는가»."""

    __slots__ = ("evidence", "counts", "truncated")

    def __init__(self) -> None:
        self.evidence: list[dict[str, Any]] = []
        self.counts: dict[str, int] = {}
        self.truncated: list[str] = []

    def summary(self) -> str:
        """🔴 **무엇을 몇 건 봤는지 센다.** 0건이면 0건이라고 말한다 — 「단계 완료」만 남기면
        빈 결과가 성공처럼 보인다(계보 「빈 결과는 통과가 아니다」)."""
        seen = " · ".join(f"{k} {v}건" for k, v in self.counts.items()) or "0건"
        if self.truncated:
            return f"{seen} · 🔴 상한({PER_KIND_LIMIT})에 걸려 잘림: {', '.join(self.truncated)}"
        return seen


def _readable(table: str, row: dict[str, Any]) -> str:
    """행 하나를 사람이 읽을 한 줄로. 잡음 열은 뺀다(compare 의 excerpt 규율과 같은 이유)."""
    parts = [f"{k}={v}" for k, v in row.items() if k not in NOISE_COLUMNS and k != "id" and v is not None]
    return f"[{table}] " + ", ".join(parts)


async def collect(pool: Any, equipment_id: str) -> StructuredResult:
    """앵커 설비의 구조화 사실을 모은다.

    🔴 근거 `kind` 는 전부 `record` 다. 스키마에는 `alarm` 값도 있지만, 같은 evidenceId 를
       `GET /evidence/{id}`(T2-2)에 물으면 그쪽은 `record` 로 답한다 — 두 표면이 같은 근거를
       다른 종류로 부르면 소비자가 어느 쪽을 믿을지 정할 수 없다. **한 근거는 한 종류다.**
    """
    result = StructuredResult()

    async with pool.acquire() as conn:
        equipment = await conn.fetchrow("SELECT * FROM equipment WHERE id = $1", equipment_id)
        if equipment is None:
            return result                       # 빈 결과는 호출자가 «보이게» 처리한다
        row = dict(equipment)
        result.counts["equipment"] = 1
        result.evidence.append(
            evidence_ref(
                evidence_id=row["id"],
                kind="record",
                source_id=row["id"],
                excerpt=_readable("equipment", row),
            )
        )

        for table, fk, order_col, direction in _EQUIPMENT_CHILDREN:
            rows = await conn.fetch(
                # noqa: S608 — table·fk·order_col·direction 은 전부 위 상수 튜플에서 온다.
                f"SELECT * FROM {table} WHERE {fk} = $1 ORDER BY {order_col} {direction} LIMIT $2",  # noqa: S608
                equipment_id,
                PER_KIND_LIMIT + 1,             # 🔴 상한+1 — 「더 있었다」를 알기 위해서다
            )
            kept = [dict(r) for r in rows[:PER_KIND_LIMIT]]
            if len(rows) > PER_KIND_LIMIT:
                result.truncated.append(table)
            result.counts[table] = len(kept)
            for item in kept:
                result.evidence.append(
                    evidence_ref(
                        evidence_id=item["id"],
                        kind="record",
                        source_id=item["id"],
                        excerpt=_readable(table, item),
                    )
                )
    return result
