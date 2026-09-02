"""synthesize 단계 — 원인 후보와 순위를 «모은 근거로» 세운다 (GS-01 대본 S6).

🔴 **공개 경로에는 LLM 호출이 없다**(baseline §15.2). 이 단계가 하는 일은 «쓰기»가 아니라
   «세기»다 — 앞 단계들이 모은 근거를 후보별로 묶고, 근거의 수와 종류로 순위를 매긴다.
   그래서 같은 데이터에는 언제나 같은 답이 나오고, 그 답이 왜 그런지 근거 목록으로 설명된다.
   자격 증명이 필요 없고, 따라서 공개 배포가 구독 프록시가 될 자리도 없다.
   Claude 를 쓰는 축은 `live_narrative` 로 분리돼 있다(모듈 하단 · 운영자 로컬 전용).

## 후보를 어디서 얻는가 — 규칙 A(채택) vs 규칙 B

실측(08-30 · seed)에서 두 규칙이 **다른 답**을 낸다. 이 갈림이 원장 Q-9(「2순위 후보」 3자
정합)의 뿌리다:

| 규칙 | 무엇을 후보로 보는가 | GS-01 결과 |
|---|---|---|
| **A (채택)** | 🔴 **울린 센서가 가리키는** 고장 모드(`failure_mode_indicator`) | 2건 — FM-BRG-WEAR · FM-TOOL-IMB |
| B | 설비·부품에 «달려 있는» 고장 모드(equipment/component_failure_mode) | 5건 — 위 2건 + SPDL-OVERHEAT · AXIS-BACKLASH · COOLANT-LOSS |

**A 를 고른 이유**: 이 조사는 «설비 점검»이 아니라 **특정 센서의 알람에서 출발한 원인 조사**다.
`failure_mode_indicator` 는 온톨로지가 「이 센서의 신호는 이런 고장을 가리킨다」를 적어 둔
자리이므로, 알람에서 출발한 조사가 밟아야 할 길이 바로 그것이다. B 는 「이 설비가 겪을 수
있는 고장 전부」라 알람과 무관한 것(온도 센서가 가리키는 과열 등)까지 후보로 들어온다.

부수 확인: A 는 대본 S6 「후보 2개」와 개수가 **정확히** 맞는다. 🔴 그러나 이것은 채택 «근거»가
아니라 채택 «결과»다 — 답을 맞추려고 규칙을 고르면 그 규칙은 다음 시나리오에서 부러진다.

## 순위를 무엇으로 매기는가

후보를 **뒷받침하는 근거의 수**로 센다. 근거 축:

1. `failure_mode_indicator` — 후보의 «입장 자격»이라 모든 후보가 갖는다. 변별력 0 이므로
   순위에 쓰지 않는다(모두가 가진 것은 아무도 구별하지 못한다).
2. **이 설비에서 그 고장으로 진단된 정비 이력** — 재발 이력은 실측된 사실이다.
3. 앞 단계가 뽑은 **문서 인용**이 그 고장을 지목하는가.
4. 그래프 경로가 그 고장에 **닿는가**(닿으면 hop 수가 동률 판정에 쓰인다).

🔴 **SOP 매핑 유무는 순위에 쓰지 않는다.** 절차가 없다는 것은 그 고장이 «덜 그럴듯하다»는
   뜻이 아니라 «대응이 준비돼 있지 않다»는 뜻이다. 둘을 섞으면 준비 안 된 위험을 순위에서
   밀어내게 된다 — 정확히 반대로 다뤄야 할 사실이다(평가셋 Q-MULTIHOP-003 이 그 결손을
   묻는 문항이라는 점도 이 축이 «순위»가 아니라 «보고» 대상임을 말한다).

🔴 **확률·백분율을 만들지 않는다**(baseline §0.2 측정-주장 경계). `confidenceNote` 는 어떤
   축이 몇 건 받쳤는지를 **세어서 말할 뿐**이다. 「87% 확신」 같은 수는 여기서 지어낼 수 없다.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from .binding import ScenarioAnchor

# 알람이 울린 센서 → 그 센서가 가리키는 고장 모드(규칙 A). 상수 질의 · ID 는 파라미터.
_CANDIDATE_SQL = """
    SELECT fi.failure_mode_id AS fm_id, f.name AS fm_name, fi.signal_pattern AS pattern
      FROM alarm a
      JOIN failure_mode_indicator fi ON fi.sensor_id = a.sensor_id
      JOIN failure_mode f            ON f.id = fi.failure_mode_id
     WHERE a.id = $1
     ORDER BY fi.failure_mode_id
"""

# 이 설비에서 그 고장으로 진단된 정비 이력.
_HISTORY_SQL = """
    SELECT mf.failure_mode_id AS fm_id, m.id AS record_id, m.performed_at
      FROM maintenance_record m
      JOIN maintenance_record_failure_mode mf ON mf.maintenance_record_id = m.id
     WHERE m.equipment_id = $1
     ORDER BY m.performed_at DESC
"""

# 그 고장에 매핑된 절차 — 순위가 아니라 **보고**에 쓴다(모듈 머리말).
_SOP_SQL = """
    SELECT failure_mode_id AS fm_id, sop_id FROM failure_mode_sop WHERE failure_mode_id = ANY($1::text[])
"""


@dataclass
class Candidate:
    """후보 하나와 그것을 받친 근거들."""

    failureModeId: str
    label: str
    pattern: str
    evidenceIds: list[str] = field(default_factory=list)
    history: list[str] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)
    graphHops: int | None = None
    sopIds: list[str] = field(default_factory=list)

    @property
    def support(self) -> int:
        """순위에 쓰는 «받친 근거의 수» — 입장 자격(indicator)은 세지 않는다."""
        return len(self.history) + len(self.citations) + (1 if self.graphHops is not None else 0)

    def note(self) -> str:
        """🔴 세어서 말한다 — 확률로 바꾸지 않는다."""
        parts = [f"정비 이력 {len(self.history)}건", f"문서 인용 {len(self.citations)}건"]
        parts.append(f"그래프 경로 {self.graphHops}-hop" if self.graphHops is not None else "그래프 경로 없음")
        if not self.sopIds:
            # 🔴 순위엔 안 쓰지만 «말은 한다» — 대응 절차 결손은 감출 사실이 아니다.
            parts.append("🔴 대응 SOP 매핑 없음")
        return " · ".join(parts)


async def build_candidates(
    pool: Any,
    anchor: ScenarioAnchor,
    *,
    structured_ids: list[str],
    citation_texts: dict[str, str],
    graph_targets: dict[str, int],
) -> list[Candidate]:
    """후보를 세우고 근거로 순위를 매긴다.

    `citation_texts` = {evidenceId: 인용문} (vector 단계 산출) ·
    `graph_targets` = {종단 ID: hops} (graph 단계 산출).
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(_CANDIDATE_SQL, anchor.alarmId)
        history = await conn.fetch(_HISTORY_SQL, anchor.equipmentId)
        fm_ids = [str(r["fm_id"]) for r in rows]
        sops = await conn.fetch(_SOP_SQL, fm_ids) if fm_ids else []

    by_fm: dict[str, Candidate] = {
        str(r["fm_id"]): Candidate(
            failureModeId=str(r["fm_id"]),
            label=str(r["fm_name"]),
            pattern=str(r["pattern"]),
        )
        for r in rows
    }

    for row in history:
        cand = by_fm.get(str(row["fm_id"]))
        if cand is not None:
            cand.history.append(str(row["record_id"]))

    for row in sops:
        cand = by_fm.get(str(row["fm_id"]))
        if cand is not None:
            cand.sopIds.append(str(row["sop_id"]))

    for fm_id, cand in by_fm.items():
        # 인용이 그 고장을 «지목»하는가 — ID 또는 이름이 인용문 안에 있는가로 본다.
        # 🔴 느슨한 부분일치를 쓰지 않는다: 온톨로지 ID 와 정본 명칭만 인정한다.
        for evidence_id, text in citation_texts.items():
            if fm_id in text or cand.label in text:
                cand.citations.append(evidence_id)
        cand.graphHops = graph_targets.get(fm_id)

        # 후보의 근거 목록 = 이 조사가 실제로 낸 evidenceId 들. 🔴 앞 단계가 내지 않은
        # 근거를 여기서 지어내지 않는다 — 스키마가 evidenceIds 를 최소 1건 요구하므로,
        # 받칠 것이 없는 후보는 아래에서 «후보에서 뺀다»(빈 배열로 통과시키지 않는다).
        cand.evidenceIds = [*dict.fromkeys([*cand.history, *cand.citations])]
        if cand.graphHops is not None:
            cand.evidenceIds.append(fm_id)
        if not cand.evidenceIds:
            # 알람 지표만으로 선 후보 — 지표 자체를 근거로 세운다(알람이 그 근거다).
            cand.evidenceIds = [anchor.alarmId]

    # 순위: 받친 근거 수 ↓ · 그래프 거리 ↑(가까울수록 위) · ID(결정성)
    ordered = sorted(
        by_fm.values(),
        key=lambda c: (-c.support, c.graphHops if c.graphHops is not None else 99, c.failureModeId),
    )
    return ordered


def to_payload(candidates: list[Candidate]) -> list[dict[str, Any]]:
    """스키마 `runCompleted.candidates` 형상으로. rank 는 1부터."""
    return [
        {
            "rank": index,
            "failureModeId": c.failureModeId,
            "label": c.label,
            "confidenceNote": c.note(),
            "evidenceIds": c.evidenceIds,
        }
        for index, c in enumerate(candidates, start=1)
    ]


# --- live 축 (운영자 로컬 전용) ---------------------------------------------------

# 🔴 이 env 가 없으면 live 노드는 **등록조차 되지 않는다**(`workflow.py`). 공개 배포에는
#    이 값이 없으므로, 공개 API 에서 Claude 로 가는 경로가 «구조적으로» 존재하지 않는다.
#    값 자체는 자격 증명이 아니라 «켬/끔»이다 — 자격 증명은 이 서비스가 갖지 않는다.
LIVE_GATE_ENV = "FKT_LOCAL_SYNTHESIS_GATEWAY"


def live_gateway_available() -> bool:
    """`GET /live/status` 의 `online` 이 답하는 것 — 로컬 합성 게이트웨이 도달 가능 여부.

    🔴 공개 Sandbox 에서 `false` 는 결함이 아니라 «참»이다(오케 판정 J-1 (b)).
    """
    return bool(os.environ.get(LIVE_GATE_ENV))


def live_gateway_reachable() -> bool:
    """게이트웨이에 «닿는가» — `/live/status` 가 답해야 하는 사실(T6-2 ②).

    🔴 게이트가 꺼져 있으면 여기서도 live 구현을 **import 하지 않는다**. 공개 배포 프로세스
       안에 Claude 로 가는 코드가 «존재하지 않는다»는 성질은 이 함수에서도 지켜진다
       (baseline §15.2 · `resolve_synthesizer` 와 같은 규율).

    🔴 「env 가 있다」(`live_gateway_available`)와 「닿는다」는 다른 사실이다. 배지는 뒤의
       것을 말해야 한다 — 앞의 것만 보면 게이트웨이가 죽은 동안에도 화면이 live 를 권한다.
    """
    if not live_gateway_available():
        return False
    try:
        from . import live_synthesis                       # noqa: PLC0415 — 게이트 뒤에서만
    except ImportError:
        return False
    return live_synthesis.probe_reachable()


class LiveSynthesisUnavailable(RuntimeError):
    """게이트는 켜졌는데 로컬 합성 구현이 없다 — 조용히 결정적 축으로 내려가지 않는다."""


def resolve_synthesizer() -> str:
    """이번 run 의 합성 축 이름을 정한다. **여기가 유일한 분기점이다.**

    🔴 게이트 env 가 없으면 live 구현 모듈을 **import 조차 하지 않는다**. 「호출하지 않는다」와
       「불러오지도 않는다」는 다르다 — 후자여야 공개 배포의 프로세스 안에 Claude 로 가는
       코드가 **존재하지 않는다**고 말할 수 있다(baseline §15.2 · 오케 승인 J-5).
       이 함수가 `"deterministic"` 을 돌려주는 것이 곧 그 사실의 관측 지점이다.

    🔴 게이트가 켜졌는데 구현이 없으면 **운다**. 조용히 결정적 축으로 내려가면 운영자는
       Claude 가 참여한 줄 알고 결과를 읽는다 — 「켰다고 생각했는데 안 켜진」 것이 제일 나쁘다.
       (로컬 합성 구현 자체는 T2-3 범위 밖이다 — 운영자 게이트 리허설 시점에 붙는다.)
    """
    if not live_gateway_available():
        return "deterministic"
    try:
        from . import live_synthesis                       # noqa: F401, PLC0415 — 게이트 뒤에서만
    except ImportError as exc:
        raise LiveSynthesisUnavailable(
            f"{LIVE_GATE_ENV} 가 켜졌으나 로컬 합성 구현이 없다 — 게이트를 끄거나 구현을 붙여라"
        ) from exc
    return "live"
