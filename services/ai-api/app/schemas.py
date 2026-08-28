"""응답 형상 — 계약 v0.1 이 «필드를 명시한 것»만 모델로 고정한다.

🔴 계약이 「설비 상세: 속성·상태·센서 목록…」처럼 서술만 한 응답에는 모델을 만들지 않는다.
   여기서 필드 이름을 지어내면 골격이 계약을 앞질러 정하게 되고, 계약은 오케(Integration
   owner)만 바꾼다(packages/contracts/README §「본 패키지는 오케만 변경한다」).
   그런 라우트는 라우트 자체와 계약 문구를 description 으로 남기고 형상은 비워 둔다 —
   무엇이 아직 정해지지 않았는지가 OpenAPI 에서 그대로 보이는 편이 낫다.

🔴 agent-events 는 `packages/contracts/agent-events-v0.1.schema.json` 이 정본이다. 여기의
   `AgentEvent` 는 envelope 의 «필수 6필드»만 옮긴 얇은 겉면이고, payload 는 열어 둔다.
   전체를 pydantic 으로 옮겨 적으면 정본이 둘이 되어 조용히 갈라진다 — 스키마 준수 판정은
   `tests/contract/` harness 가 한다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# --- 세션 -----------------------------------------------------------------------


class SessionCreated(BaseModel):
    """POST /sessions → `{ sessionId }`"""

    sessionId: str


class OkResponse(BaseModel):
    """POST /sessions/{sid}/reset → `{ ok: true }`"""

    ok: Literal[True] = True


# --- 공장·설비 -------------------------------------------------------------------


class PlantSummary(BaseModel):
    """GET /plants → `[{ plantId, name, lineCount, alarmCount }]`"""

    plantId: str
    name: str
    lineCount: int
    alarmCount: int


class EquipmentStatus(BaseModel):
    """overview 의 `[{ equipmentId, status, activeAlarms }]`"""

    equipmentId: str
    status: str
    activeAlarms: int


class OverviewKpi(BaseModel):
    """overview 의 `kpi` (계약 G4)"""

    lineActive: int
    alarmCount: int
    openIncidents: int
    pendingWorkOrders: int


class SensorSeriesPoint(BaseModel):
    """series 의 `[{ ts, value }]`"""

    ts: datetime
    value: float


# --- 조사 실행 -------------------------------------------------------------------


class RunCreated(BaseModel):
    """POST /scenarios/{id}/runs → `{ runId, incidentId, mode }`

    live 불가 시 `mode: "replay"` 로 강등해 응답한다(계약).
    """

    runId: str
    incidentId: str
    mode: Literal["live", "replay"]


class RunStopped(BaseModel):
    """POST /runs/{runId}/stop → `{ status: "stopped" }`"""

    status: Literal["stopped"] = "stopped"


class AgentEvent(BaseModel):
    """agent-events v0.1 envelope 의 필수 필드.

    payload 형상은 JSON Schema 가 type 별로 결속한다 — 여기서는 열어 둔다(위 모듈 주석).
    """

    runId: str
    seq: int = Field(ge=0, description="run 내 단조 증가 — replay 재생 순서")
    ts: datetime
    mode: Literal["live", "replay"]
    type: Literal[
        "run.started",
        "plan.updated",
        "step.started",
        "step.evidence",
        "step.completed",
        "run.completed",
        "run.stopped",
        "run.failed",
    ]
    payload: dict[str, Any]


# --- 검색 전략 비교 ---------------------------------------------------------------


class CompareRequest(BaseModel):
    """POST /retrieval/compare 요청.

    🔴 question 은 «승인 시나리오 질문 목록» 내 선택이다. 임의 SQL·Cypher·코드 실행 경로는
       계약에 존재하지 않는다(계약 README 원칙3 · baseline §16.2).
    """

    sessionId: str
    question: str
    strategies: list[Literal["vector", "hybrid", "graphrag"]] = Field(min_length=1)


class CompareHit(BaseModel):
    """`hits: [{ evidenceId, score, excerpt }]`"""

    evidenceId: str
    score: float
    excerpt: str


class CompareResult(BaseModel):
    """`[{ strategy, hits, elapsedMs }]`"""

    strategy: Literal["vector", "hybrid", "graphrag"]
    hits: list[CompareHit]
    elapsedMs: int = Field(ge=0)


# --- 작업지시 --------------------------------------------------------------------


class WorkOrderDecision(BaseModel):
    """POST /work-orders/{woId}/approve | /reject → `{ status, auditId }`"""

    status: str
    auditId: str


class DecisionComment(BaseModel):
    """`{ comment? }`"""

    comment: str | None = None


# --- 운영 -----------------------------------------------------------------------


class DependencyProbe(BaseModel):
    """의존 하나의 상태.

    `unconfigured` = 접속 정보가 주어지지 않았다. 「설정을 안 준 것」과 「주었는데 못 붙는
    것」은 다른 사건이라 값을 나눈다.
    """

    state: Literal["ok", "unconfigured", "unavailable"]
    detail: str | None = None
    latencyMs: int | None = None


class HealthResponse(BaseModel):
    """GET /health → 계약의 `{ ok, version }` + 의존 프로브(티켓 T1-8).

    🔴 `ok` 는 «프로세스가 응답할 수 있는가»다. 의존이 죽어도 true 다 — 여기서 false 를
       주면 모니터가 프로세스 다운으로 읽고 재시작을 돌린다. 의존 상태는 `status` 와
       `dependencies` 가 말한다. 계약 필드 2개는 그대로 두고 «더한» 것이라 소비자 호환은
       유지된다(계약 개정 없음).
    """

    ok: bool
    version: str
    status: Literal["ok", "degraded"]
    dependencies: dict[str, DependencyProbe]


class LiveStatus(BaseModel):
    """GET /live/status → `{ online, checkedAt }`"""

    online: bool
    checkedAt: datetime
