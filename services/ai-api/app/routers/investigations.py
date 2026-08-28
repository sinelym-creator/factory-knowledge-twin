"""계약 v0.1 §시나리오·조사 실행 (Incident·Agent) — WebSocket 스트림 포함."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, WebSocket
from pydantic import BaseModel

from ..errors import NOT_IMPLEMENTED, NotImplementedRoute
from ..schemas import AgentEvent, RunCreated, RunStopped

router = APIRouter(tags=["investigation"])

# WebSocket 애플리케이션 종료 코드. 1011(예기치 못한 조건)은 사실과 다르다 — 이 종료는
# «예정된 미구현»이므로 애플리케이션 대역(4000~4999)에서 HTTP 501 에 대응하는 값을 쓴다.
WS_NOT_IMPLEMENTED = 4501


class RunRequest(BaseModel):
    """POST /scenarios/{scenarioId}/runs 요청 — `{ sessionId, mode }`."""

    sessionId: str
    mode: Literal["live", "replay"]


@router.get("/scenarios", responses=NOT_IMPLEMENTED)
async def list_scenarios() -> None:
    """승인된 시나리오 목록(allowlist — GS-01 등). 항목 형상은 계약이 정하지 않았다."""
    raise NotImplementedRoute("GET /scenarios", "시나리오 allowlist 저장소 + 계약의 항목 형상 확정")


@router.post("/scenarios/{scenarioId}/runs", response_model=RunCreated, responses=NOT_IMPLEMENTED)
async def start_run(scenarioId: str, body: RunRequest) -> RunCreated:
    """조사 실행 생성 — `{ runId, incidentId, mode }`. live 불가 시 `mode:"replay"` 강등 응답.

    🔴 실행 자체는 run-orchestrator 뒤에 격리된다(§7 실행 분리). 골격에는 그 어댑터가 없다.
    """
    raise NotImplementedRoute("POST /scenarios/{scenarioId}/runs", "run-orchestrator 어댑터 + run 저장소")


@router.get("/incidents/{incidentId}", responses=NOT_IMPLEMENTED)
async def incident(incidentId: str) -> None:
    """incident 표제 — 계약 「제목·상태·대상 설비·연결 알람·runId」(필드명 미확정)."""
    raise NotImplementedRoute("GET /incidents/{incidentId}", "온톨로지 조회 계층 + 계약의 표제 형상 확정")


@router.post("/runs/{runId}/stop", response_model=RunStopped, responses=NOT_IMPLEMENTED)
async def stop_run(runId: str) -> RunStopped:
    """조사 중지 — `{ status: "stopped" }`. 타임라인에 `run.stopped` 이벤트를 발행한다(계약 F-3b)."""
    raise NotImplementedRoute("POST /runs/{runId}/stop", "run-orchestrator 어댑터(취소 전파)")


@router.get("/runs/{runId}", responses=NOT_IMPLEMENTED)
async def run_snapshot(runId: str) -> None:
    """완주 후 결과 스냅샷 — 계약 `{ status, candidates[], workOrderDraftId? }`.

    `candidates[]` 항목 형상은 agent-events 스키마의 `runCompleted.candidates` 가 정본이라
    여기서 다시 적지 않는다.
    """
    raise NotImplementedRoute("GET /runs/{runId}", "run 저장소")


@router.get("/runs/{runId}/events", response_model=list[AgentEvent], responses=NOT_IMPLEMENTED)
async def run_events(runId: str) -> list[AgentEvent]:
    """전체 이벤트 배열(agent-events 스키마 · seq 순) — replay 되감기의 정본(계약 G3)."""
    raise NotImplementedRoute("GET /runs/{runId}/events", "이벤트 저장소")


@router.websocket("/ws/runs/{runId}")
async def run_event_stream(websocket: WebSocket, runId: str) -> None:
    """agent-events 스키마 스트림(계약 WS `/ws/runs/{runId}`).

    🔴 골격은 «가짜 조사»를 흘리지 않는다. 이벤트 원천이 없는데 envelope 를 지어내면 화면이
       존재하지 않는 근거를 그리고, 그 거짓이 통합 단계에서야 드러난다(계약 README 원칙2
       「붙일 근거가 없으면 필드를 비우는 게 아니라 이벤트를 내보내지 않는다」).
       연결은 받는다 — 경로가 실재하는지는 클라이언트가 여기서 확인할 수 있어야 한다.
    """
    await websocket.accept()
    await websocket.close(
        code=WS_NOT_IMPLEMENTED,
        reason="not_implemented: run 이벤트 원천 없음(T1-8 골격)",
    )
