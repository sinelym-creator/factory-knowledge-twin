"""시나리오 ↔ 무대 앵커 결속 — GS-01 대본이 가리키는 실체를 서버가 아는 유일한 자리.

정본은 `docs/product/golden-scenario-spec.md` §5 바인딩 표다. 이 모듈은 그 표에서 **조사가
출발할 앵커**만 옮겨 온다(설비·알람·incident).

🔴 **응답에 싣지 않는다.** 계약 v0.1.1 이 `GET /scenarios` 를 `{ scenarioId, title,
   questions }` 로 못박았으므로 앵커는 서버 안에만 있다. 여기에 필드를 더하면 계약을
   구현이 앞질러 고치는 것이 된다(계약은 오케만 바꾼다).

🔴 **옮겨 적은 표는 조용히 낡는다**(allowlist.py 와 같은 위험). 그래서 run 시작 시
   `verify()` 로 SSOT 에 실재하는지 확인하고, 없으면 **run 을 실패시킨다** — 없는 앵커로
   조사를 시작하면 모든 단계가 0건이 되고, 화면에는 「근거 없음」으로만 보인다. 그 조용한
   0건이 계보가 여러 번 물린 자리다(「빈 결과는 통과가 아니다」).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..retrieval import allowlist


@dataclass(frozen=True, slots=True)
class ScenarioAnchor:
    """조사 한 건이 출발하는 실체들 — 전부 온톨로지 ID 다."""

    scenarioId: str
    incidentId: str
    equipmentId: str
    alarmId: str
    questionId: str

    @property
    def question(self) -> str:
        """`run.started.question` 과 vector·graph 단계가 쓰는 문자열.

        🔴 compare 가 검색에 쓰는 것과 **같은 표준 표기**여야 한다(V-1 정정). 조사와 전략
           비교가 다른 문자열로 같은 질문을 물으면 두 화면의 결과가 근거 없이 갈린다.
        """
        return allowlist.canonical(self.questionId)


# golden-scenario-spec §5 바인딩 표 · §3 단계 대본에서 옮긴 값.
# Q-MULTIHOP-001 을 고른 이유: 그 문항이 **S5 대본 경로를 그대로 묻는다**(allowlist 성문).
SCENARIO_ANCHORS: dict[str, ScenarioAnchor] = {
    "GS-01": ScenarioAnchor(
        scenarioId="GS-01",
        incidentId="INC-2026-014",      # EQ-CNC-204 · status=investigating (seed 실측 08-30)
        equipmentId="EQ-CNC-204",
        alarmId="AL-20260826-0041",
        questionId="Q-MULTIHOP-001",
    ),
}


class BindingStale(RuntimeError):
    """결속표가 가리키는 실체가 SSOT 에 없다 — seed 가 바뀌었거나 표가 낡았다."""


def anchor_for(scenario_id: str) -> ScenarioAnchor | None:
    return SCENARIO_ANCHORS.get(scenario_id)


async def verify(pool: Any, anchor: ScenarioAnchor) -> None:
    """앵커 3건이 SSOT 에 실재하는지 확인한다. 하나라도 없으면 `BindingStale`.

    🔴 조회 대상 테이블은 상수다(사용자 입력이 테이블을 고르는 경로 없음) · ID 는 파라미터
       바인딩이다 — retrieval 패키지와 같은 규율(baseline §16.2).
    """
    missing: list[str] = []
    async with pool.acquire() as conn:
        for table, entity_id in (
            ("incident", anchor.incidentId),
            ("equipment", anchor.equipmentId),
            ("alarm", anchor.alarmId),
        ):
            found = await conn.fetchval(
                f"SELECT 1 FROM {table} WHERE id = $1",  # noqa: S608 — table 은 위 상수 튜플
                entity_id,
            )
            if not found:
                missing.append(f"{table}:{entity_id}")
    if missing:
        raise BindingStale(
            f"{anchor.scenarioId} 결속표가 SSOT 와 어긋난다 — 없는 실체: {missing}"
        )
