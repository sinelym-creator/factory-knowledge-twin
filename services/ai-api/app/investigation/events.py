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

    # --- 스키마 type 10종(v0.1.13 step.progress 추가) -------------------------------------------------------

    def run_queued(self, position: int, estimated_wait_sec: int | None) -> dict[str, Any]:
        """대기열 진입·순위 변동 — 계약 v0.1.9 신설 type(8종 → 9종).

        🔴 **이것은 오류가 아니다.** 요청은 200 으로 이미 답했고, 이 이벤트는 「네 차례가
           몇 번째인가」를 말할 뿐이다. 슬롯이 나면 곧 `run.started` 가 따른다.

        🔴 **순위가 바뀌면 같은 type 을 다시 낸다**(계약 문면 · `seq` 는 그때도 증가한다).
           새 type 을 만들지 않는 이유: 소비자는 「마지막 run.queued 가 지금 순위」라는 한
           규칙만 알면 되고, 그 규칙은 처음 진입과 순위 변동을 가르지 않아도 성립한다.

        🔴 `estimatedWaitSec` 은 근거가 없으면 **null** 이다(계약 `int|null`). 표본 없이
           그럴듯한 상수를 적으면 화면은 그것을 «측정된 값»으로 그린다.
        """
        return self._emit(
            "run.queued", {"position": position, "estimatedWaitSec": estimated_wait_sec}
        )

    def run_started(self, scenario_id: str, question: str) -> dict[str, Any]:
        return self._emit("run.started", {"scenarioId": scenario_id, "question": question})

    def plan_updated(self, steps: list[str]) -> dict[str, Any]:
        return self._emit("plan.updated", {"steps": steps})

    def step_started(self, step: str, note: str | None = None) -> dict[str, Any]:
        # 🔴 **여기에는 additive 자리가 없다**(T7-44 실측): 스키마 `stepStarted` 는
        #    `additionalProperties: false` 이고 properties 가 `step`·`note` 뿐이다.
        #    단계가 자기에 대해 말할 것이 생기면 `step.completed` 의 extra 로 간다.
        payload: dict[str, Any] = {"step": step}
        if note is not None:
            payload["note"] = note
        return self._emit("step.started", payload)

    def step_evidence(self, step: str, evidence: dict[str, Any]) -> dict[str, Any]:
        return self._emit("step.evidence", {"step": step, "evidence": evidence})

    def step_progress(
        self,
        step: str,
        kind: Literal["preliminary", "sentence"],
        seq: int,
        *,
        preliminary: dict[str, Any] | None = None,
        sentence: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """단계가 «아직 끝나지 않았는데» 지금 아는 것을 말한다 — 계약 v0.1.13(type 10종).

        🔴 **판정이 아니다.** 여기 실리는 것은 전부 «잠정»이고, 그 단계의 판정은 여전히
           `step.completed` 하나다. 거부되면 화면은 잠정 문장을 **전부 걷는다** — 부분 채택
           0(v0.1.11)은 그대로다. 그래서 이 이벤트에는 «축»(live/deterministic)을 싣지 않는다:
           축을 실으면 소비자가 이것을 결과로 읽는다.

        🔴 **payload 의 `seq` 는 봉투의 `seq` 와 다른 축이다.** 봉투는 run 전체의 순서이고,
           이것은 「이 단계의 몇 번째 진행 보고인가」다. 둘을 같은 값으로 두면 폴링으로 이벤트를
           나눠 받을 때 소비자가 무엇을 기준으로 정렬해야 하는지 잃는다(계약 「0부터 단조」).
        """
        payload: dict[str, Any] = {"step": step, "kind": kind, "seq": seq}
        if preliminary is not None:
            payload["preliminary"] = preliminary
        if sentence is not None:
            payload["sentence"] = sentence
        return self._emit("step.progress", payload)

    def step_completed(
        self,
        step: str,
        elapsed_ms: int,
        summary: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"step": step, "elapsedMs": max(0, elapsed_ms)}
        if summary is not None:
            payload["summary"] = summary
        if extra:
            # 단계가 «자기 단계에만» 있는 사실을 실을 자리(v0.1.11 synthesize.synthesis).
            payload.update(extra)
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
