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

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

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


# --- 근거·문서 읽기 (v0.1.1 append) ------------------------------------------------


class Highlight(BaseModel):
    """원문에서 인용 문장이 놓인 자리. 좌표는 «문자» 기준이다.

    🔴 `document_chunk` 에 offset 열이 없어 원문 대조로 산출한다(T2-2 게이트 1 실측:
       59/59 chunk 가 본문에서 그대로·유일하게 발견 · 인접 chunk gap 0).
    """

    start: int = Field(ge=0)
    end: int = Field(ge=0)


class DocumentHighlight(Highlight):
    """`/documents` 쪽 강조 — 어느 chunk 를 가리켰는지 함께 말한다."""

    chunkId: str


class EvidenceRecord(BaseModel):
    """`record: { entityType, fields }` — SSOT 레코드를 그대로 편 것."""

    entityType: str
    fields: dict[str, Any]


class EvidenceResponse(BaseModel):
    """GET /evidence/{evidenceId} — 계약 v0.1.1 append.

    🔴 revision 6필드는 `doc-chunk` 에서만 실값이다. `record` 에는 revision 이 없으므로
       null 이며, `stale` 도 `false` 상수다 — SSOT 를 직독하는 근거라 「색인이 낡았다」는
       개념 자체가 없다(계약 v0.1.1 · 사유는 `app/reading/evidence.py` 성문).
    """

    evidenceId: str
    kind: Literal["doc-chunk", "record"]
    revisionId: str | None = None
    contentHash: str | None = None
    stale: bool
    approvalState: str | None = None
    effectiveFrom: date | None = None
    effectiveTo: date | None = None
    text: str
    highlight: Highlight | None = None
    record: EvidenceRecord | None = None


class DocumentPreview(BaseModel):
    """GET /documents/{docId}?highlight={chunkId} — 계약 v0.1.1 append."""

    documentId: str
    title: str
    revisionId: str
    contentHash: str
    stale: bool
    approvalState: str
    effectiveFrom: date
    effectiveTo: date | None = None
    body: str
    highlight: DocumentHighlight | None = None


class ScenarioSummary(BaseModel):
    """GET /scenarios → `[{ scenarioId, title, questions }]` — 계약 v0.1.1 append.

    🔴 `questions` 의 유일한 원천은 `app/retrieval/allowlist.py` 다. 이 응답은 그것을
       «읽어서» 낼 뿐 자기 목록을 갖지 않는다 — 두 목록이 따로 자라면 화면이 승인받지
       못한 질문을 compare 에 보내게 된다.
    """

    scenarioId: str
    title: str
    questions: list[str]


# --- 작업지시 --------------------------------------------------------------------


class WorkOrderDecision(BaseModel):
    """POST /work-orders/{woId}/approve | /reject → `{ status, auditId }`"""

    status: str
    auditId: str


class DecisionComment(BaseModel):
    """`{ comment? }`

    🔴 `extra="forbid"` — 승인·반려 본문에 계약에 없는 키가 오면 **거절한다**(422). pydantic
       기본값은 «조용히 버리기»라, 그대로 두면 승인 경로가 편집 경로로 쓰인다:
       `{comment, safetyMeasures: []}` 를 보낸 호출자는 200 을 받고 안전 조치를 지웠다고
       믿는다. R12 를 PATCH 에서만 세우고 이 문을 열어 두면 「같은 병을 반만 고친 것」이다
       (T2-5 R12 형제 세기 · 성문 6종 밖에서 찾은 자리).
    """

    model_config = ConfigDict(extra="forbid")

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
