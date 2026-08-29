"""agent-events v0.1 봉투 발행 — 정본은 `packages/contracts/agent-events-v0.1.schema.json`.

무엇이 «있는가»: run 하나당 하나의 발행기. `seq` 단조 증가를 여기서만 만들고, payload 를
스키마가 요구하는 형태로 조립한다.

🔴 **payload 형상을 여기서 다시 «정의»하지 않는다** — 스키마가 정본이고 이 모듈은 그것을
   조립할 뿐이다. 다만 스키마가 조건부로 요구하는 것(doc-chunk 의 revision 3필드)은
   **조립 시점에 막는다**: 어긴 봉투를 만들어 두고 계약 테스트에서 잡는 것보다, 만들 수
   없게 하는 편이 싸다. 잘못된 이벤트는 화면에 «근거처럼» 그려진 뒤에야 발견된다.

🔴 `seq` 는 run 하나에 **단일 기록자**가 있다는 전제 위에 있다(그 run 의 실행 task 하나).
   여러 곳에서 같은 run 에 발행하면 순서가 깨지고 replay 재생이 어긋난다 — 그래서 발행기는
   run 마다 하나만 만들어 실행 task 가 들고 다닌다(`runner.py`).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Literal

# 스키마 $defs.stepId 와 같은 순서·같은 값. LangGraph 노드 이름도 이 값을 그대로 쓴다 —
# 이름을 따로 두면 「노드 이름 ↔ 이벤트 step」 대조표가 하나 더 생기고, 그 표가 낡는다.
STEP_IDS: tuple[str, ...] = ("structured", "vector", "graph", "synthesize", "draft_work_order")

EvidenceKind = Literal["alarm", "sensor-series", "record", "doc-chunk", "graph-path"]

# doc-chunk 는 스키마 allOf 에서 이 셋을 추가로 요구한다(신뢰 장치 — 검증 F-4).
_DOC_CHUNK_REQUIRED = ("revisionId", "contentHash", "stale")


def now_iso() -> str:
    """스키마 `format: date-time`. 저장된 형태가 곧 전송되는 형태다 — 두 번 변환하지 않는다."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def evidence_ref(
    *,
    evidence_id: str,
    kind: EvidenceKind,
    source_id: str,
    excerpt: str | None = None,
    score: float | None = None,
    revision_id: str | None = None,
    content_hash: str | None = None,
    stale: bool | None = None,
) -> dict[str, Any]:
    """스키마 `$defs.evidenceRef` 하나를 조립한다.

    🔴 `additionalProperties: false` 라 «없는 값»은 키 자체를 넣지 않는다. null 을 넣으면
       스키마가 아니라 타입에서 걸리고, 무엇보다 화면이 「값이 null 인 근거」를 그린다.
    """
    ref: dict[str, Any] = {"evidenceId": evidence_id, "kind": kind, "sourceId": source_id}
    if excerpt is not None:
        ref["excerpt"] = excerpt
    if score is not None:
        ref["score"] = score
    if revision_id is not None:
        ref["revisionId"] = revision_id
    if content_hash is not None:
        ref["contentHash"] = content_hash
    if stale is not None:
        ref["stale"] = stale

    if kind == "doc-chunk":
        missing = [f for f in _DOC_CHUNK_REQUIRED if f not in ref]
        if missing:
            # 🔴 여기서 조용히 기본값을 채우지 않는다. `stale=False` 를 넣어 주면 「낡지
            #    않았다」는 «주장»이 근거 없이 화면의 신뢰 배지가 된다(T2-2 Q-22 계보).
            raise ValueError(
                f"doc-chunk 근거에 필수 신뢰 필드가 없다: {missing} (evidenceId={evidence_id})"
            )
    return ref


class Emitter:
    """run 하나의 이벤트 발행기 — `seq` 의 유일한 발급처."""

    __slots__ = ("run_id", "mode", "_sink", "_seq")

    def __init__(self, run_id: str, mode: Literal["live", "replay"], sink: Callable[[dict[str, Any]], None]) -> None:
        self.run_id = run_id
        self.mode = mode
        self._sink = sink
        self._seq = 0

    def _emit(self, type_: str, payload: dict[str, Any]) -> dict[str, Any]:
        event = {
            "runId": self.run_id,
            "seq": self._seq,
            "ts": now_iso(),
            "mode": self.mode,
            "type": type_,
            "payload": payload,
        }
        self._seq += 1
        self._sink(event)
        return event

    # --- 스키마 type 8종 -------------------------------------------------------

    def run_started(self, scenario_id: str, question: str) -> dict[str, Any]:
        return self._emit("run.started", {"scenarioId": scenario_id, "question": question})

    def plan_updated(self, steps: list[str]) -> dict[str, Any]:
        return self._emit("plan.updated", {"steps": steps})

    def step_started(self, step: str, note: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"step": step}
        if note is not None:
            payload["note"] = note
        return self._emit("step.started", payload)

    def step_evidence(self, step: str, evidence: dict[str, Any]) -> dict[str, Any]:
        return self._emit("step.evidence", {"step": step, "evidence": evidence})

    def step_completed(self, step: str, elapsed_ms: int, summary: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"step": step, "elapsedMs": max(0, elapsed_ms)}
        if summary is not None:
            payload["summary"] = summary
        return self._emit("step.completed", payload)

    def run_completed(
        self,
        candidates: list[dict[str, Any]],
        total_elapsed_ms: int,
        work_order_draft_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "candidates": candidates,
            "totalElapsedMs": max(0, total_elapsed_ms),
        }
        if work_order_draft_id is not None:
            payload["workOrderDraftId"] = work_order_draft_id
        return self._emit("run.completed", payload)

    def run_stopped(self, reason: Literal["user", "timeout", "reset"], note: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"reason": reason}
        if note is not None:
            payload["note"] = note
        return self._emit("run.stopped", payload)

    def run_failed(
        self,
        code: str,
        message: str,
        fallback: Literal["replay"] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": code, "message": message}
        if fallback is not None:
            payload["fallback"] = fallback
        return self._emit("run.failed", payload)
