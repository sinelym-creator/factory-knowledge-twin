"""계약 v0.1 §작업지시 (Work Order) — 초안 펴기·편집·승인/반려 (T2-5).

무엇이 «있는가»: 조사가 낸 WO 초안(`WOD-`)을 계약 형상으로 펴고, 화이트리스트 안에서만
편집하고, 한 번만 승인·반려한다. 그 결정은 감사 원장에 남는다(`investigation/approvals.py`).

무엇이 «없는가», 그리고 왜:
- **공장 `work_order` 테이블에 쓰지 않는다.** 초안(`WOD-`)과 공장 WO(`WO-`)는 다른 것이다 —
  id CHECK 가 배타이고 상태 enum 낱말이 어긋난다(게이트 1 실측 · 계약 v0.1.4 저장 축 해석).
  이 라우터는 SSOT 를 **읽지도 않는다**: 초안 본문은 조사가 이미 만들어 run 안에 두었다.
- **승인 이력 조회 라우트가 없다.** 계약(v0.1 + append 전건)에 그 표면이 없고, 없는 경로를
  구현이 지으면 「계약 밖 경로 0」(baseline §16.2)을 구현이 깬다. 원장은 실물로 있고
  조회는 `ApprovalStore.get_audit`/`audits_for` 로 끝난다 — 화면이 이력을 그려야 할 때
  계약 append 가 선행이다(오케 판정 08-30 · 갈림 ②).
- **세션 소유권 검사가 없다.** 기존 `GET /runs/{runId}` 계열도 runId 만으로 연다(원장 Q-25).
  🔴 여기서만 검사를 넣으면 같은 리포에 두 규율이 서게 된다. 다만 **Q-25 는 «읽기»에 대한
  기록이었고 이 티켓은 같은 무세션 축에 «쓰기»(편집·승인)를 연다** — 종류가 바뀌었다는
  사실을 원장에 되돌린다(내 회부 · 결정은 오케).

🔴 **R12 강제는 「막을 목록」이 아니라 「허용 목록」이다**(게이트 1 판정 · 형제 6종 성문).
   막을 것을 세는 방식은 형제가 계속 새로 생긴다 — 안전 배열을 비우기·일부만 지우기·
   `mandatory` 를 false 로 죽이기·**근거인 절차(SOP)를 지우기**·전체 문서로 치환하기·
   키를 빼서 삭제로 해석시키기. 여섯을 다 막아도 일곱 번째가 남는다. 그래서 **편집 가능한
   것을 열거하고 나머지는 전부 거절한다** — 새 필드가 초안에 생겨도 기본값이 「편집 불가」다.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Request

from .. import ownership
from ..errors import ErrorResponse, contract_error
from ..investigation.approvals import (
    APPROVAL_APPROVED,
    APPROVAL_REJECTED,
    TERMINAL_STATES,
    ApprovalStore,
    Decision,
)
from ..investigation.store import RunRecord, RunStore
from ..schemas import DecisionComment, WorkOrderDecision

router = APIRouter(tags=["work-order"])


# --- 편집 화이트리스트 ---------------------------------------------------------------

# 🔴 **편집 가능한 필드 전부.** 여기 없는 것은 이름을 몰라도 거절된다.
#    `title`·`parts` 만 있는 이유: 계약 v0.1.4/v0.1.5 형상 12필드 중 사람이 «고쳐도 되는»
#    것이 이 둘이다. 나머지는 (a) 신원(`workOrderDraftId`·`incidentId`·`equipmentId`·
#    `failureModeId`) (b) 근거(`procedures`·`safetyMeasures`·`evidenceIds`) (c) 결손 고지
#    (`gaps`) (d) 상태(`approvalState`) 다. 대조군이 성립한다: 일반 항목인 `parts` 는
#    «지워진다»(빈 배열로 만들 수 있다) — 전부 거절하는 서버는 R12 를 지킨 것이 아니라
#    편집을 막은 것이다(판정 성문).
EDITABLE_FIELDS: frozenset[str] = frozenset({"title", "parts"})

# 거절 사유 코드 — 🔴 **순서가 곧 «심각도»다.** 한 요청이 여러 금지 필드를 건드리면 이 순서로
#    앞선 것이 응답의 code 가 된다(안전 축이 신원 축보다 먼저 말한다). 어긴 필드는 전부
#    message 에 적는다 — 하나만 알려 주면 호출자가 한 번에 하나씩 고치며 나머지를 모른다.
_REASON_BY_FIELD: tuple[tuple[str, str], ...] = (
    # ①②③ 안전 배열 자체 — 비우기·부분 삭제·mandatory 무력화가 전부 이 한 문으로 막힌다.
    ("safetyMeasures", "safety_measure_immutable"),
    # ④ 근거 삭제. 안전 조치는 절차(SOP)가 «요구»해서 실린 것이라(R12 REQUIRES), 절차를
    #    지우면 안전 배열을 건드리지 않고도 그 근거가 사라진다.
    ("procedures", "safety_basis_immutable"),
    # 결손 고지 삭제 — 「안전 규정 0건 — 안전 조치 미확인」을 지우는 길이다. 조치를 지우는
    #    대신 «조치가 없다는 경고»를 지우는 것이라, 화면에는 온전한 초안으로 보인다.
    ("gaps", "gap_notice_immutable"),
    ("evidenceIds", "evidence_basis_immutable"),
    # 승인 경로 우회 — PATCH 로 상태를 approved 로 밀면 approve 의 전이 검사·원장을 건너뛴다.
    ("approvalState", "approval_path_bypass"),
    ("state", "approval_path_bypass"),          # T2-3 초안의 옛 낱말 — 같은 축이다
    ("workOrderDraftId", "identity_immutable"),
    ("incidentId", "identity_immutable"),
    ("equipmentId", "identity_immutable"),
    ("failureModeId", "identity_immutable"),
    ("note", "field_not_editable"),             # §29.2 「AI 가 만든 초안」 고지가 사는 자리
)
# 🔴 이름조차 모르는 키의 기본값. `safety_measures`(snake) 처럼 «비슷하게 생긴» 키를
#    추측해 안전 축으로 승격하지 않는다 — 추측은 틀리고, 거절이라는 결과는 같다.
_UNKNOWN_FIELD_REASON = "field_not_editable"


def _store(request: Request) -> RunStore:
    return request.app.state.run_store


def _approvals(request: Request) -> ApprovalStore:
    return request.app.state.approval_store


def _draft_or_error(request: Request, wo_id: str) -> tuple[RunRecord, dict[str, Any]]:
    """초안 본문을 찾아 준다 — **4경로가 전부 이 한 문을 지난다.**

    🔴 Q-27 이 요구한 「4경로 전건 사유 코드 분리」를 라우트마다 따로 적지 않는다. 네 곳에
       같은 분기를 베끼면 다섯 번째 라우트가 열릴 때 «한 곳을 잊는» 자리가 생기고, 그것이
       바로 「같은 병을 반만 고친 것」의 형태다(T2-4 J-G · V-7 계보).

    🔴 재생 run 은 `workOrderDraftId` 는 복원하지만 **본문은 복원하지 않는다** — fixture 는
       이벤트만 담고 초안 본문은 이벤트 밖에 살던 값이다(replay.py). 여기서 404 로 답하면
       「그런 초안이 없다」가 되는데 사실은 「재생본이라 원본이 없다」다. 두 사건을 한 코드로
       답하면 T2-4 에서 `?byRun` 을 501 로 막은 이유가 그대로 무너진다.
    """
    # 🔴 **소유권을 「찾기」 단계에서 건다**(T3-1 · 계약 v0.1.6). 찾은 «뒤»에 거르면
    #    타 세션의 초안이 충돌 판정(아래 500)이나 재생 판정(501)에 먼저 걸려, 응답 코드가
    #    「그 초안이 있다」를 말해 버린다 — 존재 은닉이 사유 코드에서 깨진다.
    matches = ownership.visible_runs(request, _store(request).by_work_order_draft(wo_id))
    bodied = [r for r in matches if r.workOrderDraft is not None]

    if len(bodied) > 1:
        # 🔴 한 초안 id 를 두 run 이 본문째 주장한다 — 있을 수 없는 상태다. 조용히 하나를
        #    고르면 그 선택이 dict 삽입 순서에 달리고, 순서 때문에 초록이 되는 검사가 생긴다.
        raise contract_error(
            500, "work_order_id_collision", f"작업지시 초안 {wo_id} 를 두 개 이상의 조사가 주장한다"
        )
    if len(bodied) == 1:
        record = bodied[0]
        draft = record.workOrderDraft
        assert draft is not None                      # bodied 의 정의가 이미 보장한다
        return record, draft
    if not matches:
        raise contract_error(404, "not_found", f"작업지시 초안 {wo_id} 를 찾을 수 없다")
    if any(r.mode == "replay" for r in matches):
        raise contract_error(
            501,
            "replay_draft_source_absent",
            f"초안 {wo_id} 는 재생본에 속한다 — replay fixture 는 이벤트만 담으므로 "
            "초안 본문 원본이 없다",
        )
    # live run 인데 본문이 없다 = 우리 코드가 둘을 따로 세운 것이다. 조용히 404 로 접지 않는다.
    raise contract_error(
        500, "draft_body_missing", f"작업지시 초안 {wo_id} 의 본문을 서버가 갖고 있지 않다"
    )


def _draft_response(draft: dict[str, Any], approval_state: str) -> dict[str, Any]:
    """계약 v0.1.4 + v0.1.5 응답 형상 — **조립하는 자리는 여기 하나다.**

    🔴 GET 과 PATCH 가 각자 조립하면 편집 뒤에 형상이 갈린다 — 같은 초안이 펴기와 갱신본에서
       다른 얼굴을 갖는 순간, 화면은 어느 쪽을 믿어야 할지 모른 채 둘 다 그린다.

    🔴 `state` 는 싣지 않고 `approvalState` 로 «갈음»한다(v0.1.4 낱말 정렬 — 테이블 enum 의
       `pending` 에 맞춘다). 초안의 `state:"draft"` 는 T2-3 이 「아직 승인 전」을 말한 낱말이고,
       그 뜻을 이제 `approvalState` 가 더 정확히 말한다. 두 낱말을 함께 내보내면 화면이
       같은 사실을 두 곳에서 읽고 언젠가 어긋난다.
    """
    return {
        "workOrderDraftId": draft["workOrderDraftId"],
        "incidentId": draft["incidentId"],
        "equipmentId": draft["equipmentId"],
        "title": draft["title"],
        "failureModeId": draft["failureModeId"],
        "procedures": draft["procedures"],
        "safetyMeasures": draft["safetyMeasures"],
        "parts": draft["parts"],
        "evidenceIds": draft["evidenceIds"],
        "gaps": draft["gaps"],
        "note": draft["note"],
        "approvalState": approval_state,
    }


def _refuse_forbidden_fields(body: dict[str, Any]) -> None:
    """화이트리스트 밖 키가 하나라도 «있으면» 거절한다.

    🔴 **「무시」가 아니라 「거절」이다.** 전체 문서를 그대로 PATCH 로 되돌려보내는 화면(형제
       ⑤)에서 안전 배열을 조용히 버리고 200 을 주면, 호출자는 자기가 보낸 대로 저장됐다고
       믿는다. 지우려던 쪽에게는 「지워졌다」로, 안 지우려던 쪽에게는 「그대로다」로 읽히는
       200 이다 — 조용한 성공이 조용한 실패보다 나쁜 드문 자리다.
    """
    offenders = sorted(k for k in body if k not in EDITABLE_FIELDS)
    if not offenders:
        return
    code = _UNKNOWN_FIELD_REASON
    for field, reason in _REASON_BY_FIELD:
        if field in offenders:
            code = reason
            break
    raise contract_error(
        403,
        code,
        f"편집할 수 없는 필드다: {', '.join(offenders)} — "
        f"편집 가능한 것은 {', '.join(sorted(EDITABLE_FIELDS))} 뿐이다",
    )


def _validated_updates(body: dict[str, Any]) -> dict[str, Any]:
    """화이트리스트 필드의 값을 검사해 «갱신할 것만» 돌려준다.

    🔴 **없는 키는 손대지 않는다**(형제 ⑥ — 부분 갱신 의미론). 「없는 키 = 삭제」로 구현하면
       그 자체가 우회로가 된다: 안전 배열을 빼고 보내는 것만으로 삭제가 성립한다.
       여기서는 화이트리스트가 이미 안전 배열을 막지만, 의미론을 흐리면 다음 필드에서 샌다.
    """
    updates: dict[str, Any] = {}

    if "title" in body:
        title = body["title"]
        if not isinstance(title, str) or not title.strip():
            raise contract_error(422, "invalid_field_type", "title 은 비어 있지 않은 문자열이다")
        updates["title"] = title

    if "parts" in body:
        parts = body["parts"]
        # 🔴 빈 배열을 «허용»한다 — 대조군이 여기 있다. 일반 항목은 지워져야 한다.
        if not isinstance(parts, list) or not all(isinstance(p, dict) for p in parts):
            raise contract_error(422, "invalid_field_type", "parts 는 객체 배열이다")
        updates["parts"] = parts

    return updates


_READ_ERRORS: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "`not_found` — 그런 초안이 없다"},
    501: {
        "model": ErrorResponse,
        "description": "`replay_draft_source_absent` — 재생본이라 초안 본문 원본이 없다(Q-27)",
    },
}
_WRITE_ERRORS: dict[int | str, dict[str, Any]] = {
    **_READ_ERRORS,
    403: {
        "model": ErrorResponse,
        "description": (
            "R12 화이트리스트 밖 편집 — `safety_measure_immutable`·`safety_basis_immutable`·"
            "`gap_notice_immutable`·`evidence_basis_immutable`·`approval_path_bypass`·"
            "`identity_immutable`·`field_not_editable`"
        ),
    },
    409: {
        "model": ErrorResponse,
        "description": "`work_order_not_editable` — 종단 상태(approved/rejected)는 편집하지 않는다",
    },
    422: {"model": ErrorResponse, "description": "`invalid_field_type` — 값의 형이 계약과 다르다"},
}
_DECIDE_ERRORS: dict[int | str, dict[str, Any]] = {
    **_READ_ERRORS,
    403: {
        "model": ErrorResponse,
        "description": "`safety_measures_absent` — 안전 조치 없는 초안은 승인하지 않는다(§29.2)",
    },
    409: {
        "model": ErrorResponse,
        "description": "`approval_state_terminal` — 이미 결정됐다(재승인·번복 없음)",
    },
}


# --- 라우트 -------------------------------------------------------------------------


@router.get("/work-orders/{woId}", responses=_READ_ERRORS)
async def get_work_order(woId: str, request: Request) -> dict[str, Any]:
    """초안 전문 — 계약 v0.1.4 + v0.1.5 형상 12필드.

    🔴 `response_model` 을 걸지 않는다. 저장된 dict 를 그대로 낸다 — pydantic 을 한 번 더
       지나면 같은 사실이 표면마다 다른 문자열이 되는 자리를 이 리포는 이미 겪었다
       (`GET /runs/{id}/events` 의 `ts` 정정). 형상의 정본은 계약이고, 위 `responses` 는
       그것을 OpenAPI 에 «보여 주기» 위한 것이다.
    """
    _record, draft = _draft_or_error(request, woId)
    return _draft_response(draft, _approvals(request).state_of(woId))


@router.patch("/work-orders/{woId}", responses=_WRITE_ERRORS)
async def patch_work_order(
    woId: str, request: Request, body: dict[str, Any] = Body(default_factory=dict)
) -> dict[str, Any]:
    """편집 필드 부분 갱신 → 갱신본(같은 형상).

    🔴 **검사 순서가 정해져 있다: 전이 → 화이트리스트 → 값의 형.** 승인된 초안에
       안전 배열 삭제를 보내면 `work_order_not_editable`(409)이지 `safety_measure_immutable`
       이 아니다 — 「편집이 열려 있는가」가 「무엇을 편집해도 되는가」보다 바깥 문이기 때문이다.
       순서를 성문해 두지 않으면 검사기가 어느 쪽을 기대할지 스스로 정하게 된다.

    🔴 `parts` 는 **필드 단위 치환**이다(배열 안의 부분 갱신이 아니다). 계약의 「편집 필드
       부분 갱신」은 필드 층위의 말이고, 배열 안까지 부분 갱신으로 읽으면 「몇 번째 항목을
       지운다」는 조작이 필요해진다 — 그 조작이 곧 형제 ②(부분 삭제)의 도구가 된다.
    """
    _record, draft = _draft_or_error(request, woId)
    state = _approvals(request).state_of(woId)
    if state in TERMINAL_STATES:
        raise contract_error(
            409,
            "work_order_not_editable",
            f"초안 {woId} 는 {state} 다 — 종단 상태를 편집하면 「승인된 것」과 "
            "「지금 보이는 것」이 갈린다",
        )
    _refuse_forbidden_fields(body)
    draft.update(_validated_updates(body))
    return _draft_response(draft, state)


async def _decide(
    wo_id: str, request: Request, body: DecisionComment | None, decision: Decision
) -> WorkOrderDecision:
    """승인·반려 공통 — 전이 검사 → (승인만) 안전 조치 확인 → 원장 기록.

    🔴 두 라우트가 같은 문을 지나게 한다. 나누어 적으면 한쪽에만 검사를 더하는 날이 온다.
    """
    record, draft = _draft_or_error(request, wo_id)
    approvals = _approvals(request)
    state = approvals.state_of(wo_id)
    if state in TERMINAL_STATES:
        raise contract_error(
            409,
            "approval_state_terminal",
            f"초안 {wo_id} 는 이미 {state} 다 — 재승인·번복은 없다(계약 v0.1.4 전이 규칙)",
        )

    if decision == APPROVAL_APPROVED and not draft["safetyMeasures"]:
        # 🔴 R12 의 «나머지 반쪽». 지우는 것을 막는 것만으로는 부족하다 — 애초에 안전 조치가
        #    실리지 못한 초안이 승인되면 결과는 「안전 조치 없는 작업지시」로 같다.
        #    T2-3 이 이 강제를 이 티켓에 명시로 넘겼다(work_order.py 머리말). 초안은 그 경우
        #    `gaps` 에 사유를 적어 두므로 서버는 그것을 «읽어» 거절하는 것이 아니라, 배열이
        #    비었다는 사실 하나로 거절한다 — 사람이 읽는 문장에 판정을 걸지 않는다.
        raise contract_error(
            403,
            "safety_measures_absent",
            f"초안 {wo_id} 에 안전 조치가 없다 — 안전 조치 없는 작업지시는 승인하지 않는다",
        )

    entry = approvals.decide(
        wo_id=wo_id,
        session_id=record.sessionId,
        decision=decision,
        comment=body.comment if body is not None else None,
    )
    return WorkOrderDecision(status=entry.decision, auditId=entry.auditId)


@router.post(
    "/work-orders/{woId}/approve", response_model=WorkOrderDecision, responses=_DECIDE_ERRORS
)
async def approve_work_order(
    woId: str, request: Request, body: DecisionComment | None = None
) -> WorkOrderDecision:
    """승인 — `{ status, auditId }`. 세션 내 이력으로 기록된다."""
    return await _decide(woId, request, body, APPROVAL_APPROVED)


@router.post(
    "/work-orders/{woId}/reject", response_model=WorkOrderDecision, responses=_DECIDE_ERRORS
)
async def reject_work_order(
    woId: str, request: Request, body: DecisionComment | None = None
) -> WorkOrderDecision:
    """반려 — `{ status, auditId }`.

    🔴 반려에는 안전 조치 확인을 걸지 않는다. 안전 조치가 없어서 못 미더운 초안일수록
       «반려할 수 있어야» 한다 — 승인과 같은 문을 세우면 그 초안은 종단에 닿지 못하고
       영원히 pending 으로 남는다.
    """
    return await _decide(woId, request, body, APPROVAL_REJECTED)
