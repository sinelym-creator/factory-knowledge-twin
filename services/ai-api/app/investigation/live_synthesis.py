"""live 합성 축 — 로컬 게이트웨이(호스트 프로세스)에 물어 순위·근거 문장을 받는다.

🔴 이 모듈은 `FKT_LOCAL_SYNTHESIS_GATEWAY` 가 켜졌을 때만 import 된다
   (`synthesize.resolve_synthesizer`). 공개 배포 프로세스 안에는 이 코드가 «불려오지» 않는다.

🔴 조용한 폴백 0 — 게이트웨이가 못 답했거나, 답이 근거 결속을 깨거나, 형상이 어긋나면
   **전량 거부**하고 결정적 순위를 그대로 쓰되 `axis="live-rejected"` + 사유를 드러낸다.
   부분 채택(문장만 쓰고 순위는 버리는 식)은 하지 않는다 — 어느 쪽이 말한 결과인지 갈리면
   화면의 근거 표기가 거짓이 된다.

의존: 표준 라이브러리만(urllib). 새로 들이는 패키지가 없다.
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from .synthesize import LIVE_GATE_ENV, Candidate

# 게이트웨이의 상한(기본 60000ms)과 «같은 이름»을 읽고, 그보다 조금 더 기다린다.
# 클라이언트가 먼저 끊으면 게이트웨이가 답할 수 있었던 건도 timeout 으로 기록된다.
TIMEOUT_ENV = "SYNTHESIS_TIMEOUT_MS"
DEFAULT_TIMEOUT_MS = 60_000
CLIENT_MARGIN_MS = 5_000

UNKNOWN_MODEL = "claude-code-cli:unknown"
_MAX_EXCERPT = 600


@dataclass
class LiveResult:
    """합성 축 하나의 결과. `axis` 가 무엇이든 «순위는 항상 있다»(거부 시 결정적 순위)."""

    axis: str                                       # "live" | "live-rejected"
    candidates: list[Candidate]
    model: str | None = None
    rejected_reason: str | None = None
    rationale: dict[str, dict[str, Any]] = field(default_factory=dict)

    def synthesis_payload(self) -> dict[str, str]:
        """`step.completed(synthesize).payload.synthesis` — 계약 v0.1.11 형상 그대로."""
        payload = {"axis": self.axis}
        if self.model:
            payload["model"] = self.model
        if self.rejected_reason:
            payload["rejectedReason"] = self.rejected_reason
        return payload


class _Rejected(Exception):
    """가드가 응답을 물렸다 — 사유를 그대로 이벤트에 싣는다."""


def gateway_url() -> str:
    return (os.environ.get(LIVE_GATE_ENV) or "").rstrip("/")


def timeout_ms() -> int:
    raw = os.environ.get(TIMEOUT_ENV)
    try:
        return int(raw) if raw else DEFAULT_TIMEOUT_MS
    except ValueError:
        return DEFAULT_TIMEOUT_MS


def build_evidence_text(state: dict[str, Any]) -> dict[str, str]:
    """run 이 «실제로 낸» 근거만 발췌로 바꾼다 — 여기 없는 id 는 인용될 수 없다.

    structured/vector/graph 세 단계가 `step.evidence` 로 낸 것과 같은 id 집합이다.
    """
    excerpts: dict[str, str] = {}

    for item in state.get("structuredEvidence", []) or []:
        evidence_id = item.get("evidenceId")
        if not isinstance(evidence_id, str):
            continue
        body = {k: v for k, v in item.items() if k != "evidenceId"}
        excerpts[evidence_id] = json.dumps(body, ensure_ascii=False)[:_MAX_EXCERPT]

    for evidence_id, text in (state.get("citations") or {}).items():
        if isinstance(evidence_id, str) and isinstance(text, str):
            excerpts[evidence_id] = text[:_MAX_EXCERPT]

    for path in state.get("graphPaths", []) or []:
        evidence_id = path.get("evidenceId")
        if not isinstance(evidence_id, str):
            continue
        excerpts[evidence_id] = json.dumps(
            {k: path.get(k) for k in ("targetId", "label", "hops", "nodes", "edges")},
            ensure_ascii=False,
        )[:_MAX_EXCERPT]

    return excerpts


def _request_body(anchor: Any, candidates: list[Candidate], evidence_text: dict[str, str]) -> bytes:
    payload = {
        "anchor": {
            "scenarioId": getattr(anchor, "scenarioId", None),
            "alarmId": getattr(anchor, "alarmId", None),
            "equipmentId": getattr(anchor, "equipmentId", None),
        },
        "candidates": [
            {
                "failureModeId": c.failureModeId,
                "label": c.label,
                "pattern": c.pattern,
                "evidenceIds": c.evidenceIds,
                "history": c.history,
                "citations": c.citations,
                "graphHops": c.graphHops,
                "sopIds": c.sopIds,
            }
            for c in candidates
        ],
        "evidenceText": evidence_text,
    }
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _post(url: str, body: bytes, timeout_sec: float) -> dict[str, Any]:
    request = urllib.request.Request(                        # noqa: S310 — 127.0.0.1 고정 URL
        f"{url}/synthesize",
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("rejectedReason", "")
        except Exception:                                    # noqa: BLE001 — 사유를 못 읽어도 상태는 남긴다
            detail = ""
        raise _Rejected(f"게이트웨이 {exc.code}{(' · ' + detail) if detail else ''}") from None
    except TimeoutError:
        raise _Rejected(f"게이트웨이 타임아웃({int(timeout_sec * 1000)}ms)") from None
    except urllib.error.URLError as exc:
        raise _Rejected(f"게이트웨이 미도달({type(exc.reason).__name__})") from None
    except json.JSONDecodeError:
        raise _Rejected("게이트웨이 응답을 JSON 으로 읽지 못했다") from None


def apply_guard(
    response: dict[str, Any],
    candidates: list[Candidate],
    evidence_ids: set[str],
) -> tuple[list[Candidate], dict[str, dict[str, Any]]]:
    """🔴 근거 결속 가드 — 하나라도 어긋나면 전량 거부(부분 채택 0).

    `evidence_ids` 는 **run 근거집합**이다(`workflow.Context.evidence_ids`). 게이트웨이에 보낸
    발췌 목록이 아니라 이것이 판정 기준이다 — 보낸 것이 잘못 좁거나 넓어도 여기서 걸린다.
    """
    ranking = response.get("ranking")
    rationale = response.get("rationale")
    if not isinstance(ranking, list) or not all(isinstance(x, str) for x in ranking):
        raise _Rejected("ranking 이 문자열 배열이 아니다")
    if not isinstance(rationale, dict):
        raise _Rejected("rationale 이 객체가 아니다")

    by_id = {c.failureModeId: c for c in candidates}
    if set(ranking) != set(by_id) or len(ranking) != len(by_id):
        raise _Rejected("ranking 이 후보 집합과 다르다(추가·누락·중복)")

    cleaned: dict[str, dict[str, Any]] = {}
    for fm_id, entry in rationale.items():
        if fm_id not in by_id:
            raise _Rejected("rationale 에 준 적 없는 failureModeId 가 있다")
        if not isinstance(entry, dict):
            raise _Rejected("rationale 원소가 객체가 아니다")
        sentences = entry.get("sentences")
        cited = entry.get("citedEvidenceIds")
        if not isinstance(sentences, list) or not sentences:
            raise _Rejected("rationale.sentences 가 비었다")
        if not all(isinstance(s, str) and s.strip() for s in sentences):
            raise _Rejected("rationale.sentences 에 빈 문장이 있다")
        if not isinstance(cited, list) or not cited:
            raise _Rejected("rationale.citedEvidenceIds 가 비었다")
        outside = [c for c in cited if not isinstance(c, str) or c not in evidence_ids]
        if outside:
            # 🔴 여기가 T6-1 의 핵심 판정 — 인용이 run 근거집합 밖이면 응답 전체를 버린다.
            raise _Rejected(f"인용 id 가 run 근거집합 밖이다({len(outside)}건)")
        cleaned[fm_id] = {"sentences": list(sentences), "citedEvidenceIds": list(cited)}

    if set(cleaned) != set(by_id):
        raise _Rejected("rationale 이 후보 전부를 덮지 않는다")

    reordered = [by_id[fm_id] for fm_id in ranking]
    # 🔴 재정렬은 허용하되, 받친 근거가 0 인 후보를 «새로» 1순위로 올리는 것은 거부한다.
    if reordered[0].support == 0 and reordered[0].failureModeId != candidates[0].failureModeId:
        raise _Rejected("support 0 후보를 1순위로 승격했다")

    return reordered, cleaned


async def synthesize(
    candidates: list[Candidate],
    *,
    anchor: Any,
    state: dict[str, Any],
    evidence_ids: list[str],
) -> LiveResult:
    """live 축 1회. 예외를 밖으로 내보내지 않는다 — 실패도 «드러난 결과»로 돌려준다."""
    url = gateway_url()
    if not url:
        return LiveResult(axis="live-rejected", candidates=candidates, rejected_reason="게이트웨이 주소가 비었다")

    evidence_text = build_evidence_text(state)
    if not evidence_text:
        return LiveResult(axis="live-rejected", candidates=candidates, rejected_reason="보낼 근거 발췌가 0건이다")

    budget_sec = (timeout_ms() + CLIENT_MARGIN_MS) / 1000.0
    body = _request_body(anchor, candidates, evidence_text)

    model: str | None = None
    try:
        response = await asyncio.to_thread(_post, url, body, budget_sec)
        model = response.get("model") if isinstance(response.get("model"), str) else UNKNOWN_MODEL
        reordered, rationale = apply_guard(response, candidates, set(evidence_ids))
    except _Rejected as exc:
        return LiveResult(
            axis="live-rejected",
            candidates=candidates,
            model=model,
            rejected_reason=str(exc),
        )
    except Exception as exc:                                  # noqa: BLE001 — 축 하나가 run 을 죽이지 않는다
        return LiveResult(
            axis="live-rejected",
            candidates=candidates,
            model=model,
            rejected_reason=f"합성 중 예외({type(exc).__name__})",
        )

    return LiveResult(axis="live", candidates=reordered, model=model, rationale=rationale)


def attach_rationale(
    payload: list[dict[str, Any]], rationale: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """`runCompleted.candidates[].rationale` 를 얹는다 — 채택된 축에서만 부른다."""
    for item in payload:
        entry = rationale.get(item.get("failureModeId", ""))
        if entry:
            item["rationale"] = entry
    return payload
