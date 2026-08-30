"""WO 초안의 승인 상태·감사 원장 — 프로세스 내 · 세션 스코프 · SSOT 쓰기 0 (T2-5 게이트 1 판정 ⓐ).

무엇이 «있는가»: 초안 하나의 승인 상태(`pending|approved|rejected`)와, 그 상태를 바꾼 결정
1건의 감사 기록(`auditId`).

무엇이 «없는가», 그리고 왜:
- **공장 `work_order` 테이블에 쓰지 않는다.** 조사 산출 초안(`WOD-`)은 공장 WO(`WO-`)가
  아니다 — id CHECK 가 서로 배타이고(`^WO-\\d{4}-\\d{4}$` ↔ `WOD-<hex12>`) 상태 enum 의
  낱말도 어긋난다(게이트 1 실측 E1 · 계약 v0.1.4 저장 축 해석). 마이그레이션 009 는 불요다.
- **영속이 없다.** run 이 콘솔 상태인 것과 같은 이유다(store.py 머리말).

🔴 **원장은 초안과 «따로» 산다 — 이것이 이 모듈이 별도로 존재하는 유일한 이유다.**
   초안 본문은 `RunRecord.workOrderDraft` 안에 살고, run 은 상한(`MAX_RUNS`)에 걸리면
   오래된 것부터 버려진다. 원장을 그 안에 두면 「승인했다」는 사실이 초안과 함께 사라진다 —
   **대상보다 먼저 죽는 감사 기록은 감사 기록이 아니다.** 그래서 비 FK 다: 여기 남은
   `workOrderDraftId` 는 지금 있을 수도, 이미 없을 수도 있는 초안을 가리키는 «이름»일 뿐이며
   이 저장소는 그 초안의 실재를 확인하지 않는다.

🔴 **전이 판정을 여기서 하지 않는다.** 「pending 이 아니다」는 한 가지 사실이지만 호출자가
   답해야 하는 오류는 경로마다 다르다(PATCH 는 「편집 불가」, approve 는 「재승인 없음」).
   저장소가 한 낱말로 접으면 그 구분이 사라진다 — 판정은 라우트가 하고, 여기서는
   **이미 결정된 것을 덮어쓰지 않는다**는 한 가지만 지킨다(원장은 고쳐 쓰지 않는다).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

APPROVAL_PENDING = "pending"
APPROVAL_APPROVED = "approved"
APPROVAL_REJECTED = "rejected"

Decision = Literal["approved", "rejected"]

# 종단 상태 — 계약 v0.1.4 「approved/rejected = 종단(재승인·번복 없음)」.
TERMINAL_STATES: frozenset[str] = frozenset({APPROVAL_APPROVED, APPROVAL_REJECTED})


@dataclass(frozen=True)
class AuditEntry:
    """결정 1건. 🔴 frozen — 원장은 남긴 뒤에 고치지 않는다."""

    auditId: str
    workOrderDraftId: str
    sessionId: str
    decision: Decision
    comment: str | None
    at: str


class ApprovalStore:
    """초안 승인 상태 + 감사 원장. 앱 하나에 하나씩 두고 `app.state` 가 들고 다닌다."""

    def __init__(self) -> None:
        self._by_audit: dict[str, AuditEntry] = {}
        self._by_draft: dict[str, AuditEntry] = {}

    def state_of(self, wo_id: str) -> str:
        """초안의 현재 승인 상태.

        🔴 기록이 없으면 `pending` 이다 — 「결정된 적 없음」과 「pending」은 같은 사실이다.
           여기서 `None` 을 돌려주면 호출자마다 기본값을 다시 정하게 되고, 그 기본값이
           갈리는 순간 같은 초안이 화면마다 다른 상태로 보인다.
        """
        entry = self._by_draft.get(wo_id)
        return entry.decision if entry is not None else APPROVAL_PENDING

    def decide(
        self,
        *,
        wo_id: str,
        session_id: str,
        decision: Decision,
        comment: str | None,
    ) -> AuditEntry:
        """결정을 원장에 남기고 그 기록을 돌려준다.

        🔴 이미 결정된 초안이면 `RuntimeError` 다 — 500 으로 시끄럽게 터진다. 라우트가 전이를
           먼저 검사하므로 여기 닿는 것은 «있을 수 없는 상태»고, 있을 수 없는 상태를 조용히
           덮어쓰면 원장이 거짓말을 시작한다. 이벤트 루프는 단일 스레드이고 검사와 이 호출
           사이에 `await` 가 없으므로 두 요청이 이 틈에 끼어들지 못한다.
        """
        existing = self._by_draft.get(wo_id)
        if existing is not None:
            raise RuntimeError(
                f"초안 {wo_id} 는 이미 {existing.decision} 로 결정됐다 — 원장은 고쳐 쓰지 않는다"
            )
        entry = AuditEntry(
            auditId=f"AUD-{uuid.uuid4().hex[:12]}",
            workOrderDraftId=wo_id,
            sessionId=session_id,
            decision=decision,
            comment=comment,
            at=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        )
        self._by_audit[entry.auditId] = entry
        self._by_draft[wo_id] = entry
        return entry

    def get_audit(self, audit_id: str) -> AuditEntry | None:
        """`auditId` 로 되찾는다.

        🔴 이 조회에 **HTTP 표면이 없다**(계약 v0.1 + append 전건에 승인 이력 라우트가 없다).
           없는 라우트를 여기서 지으면 「계약 밖 경로 0」(baseline §16.2)을 내가 깬다 —
           그래서 조회는 이 층에서 끝난다. 화면이 이력을 그려야 하는 시점에 계약 append 가
           선행이고, 그때 이 함수가 이미 자리에 있다.
        """
        return self._by_audit.get(audit_id)

    def audits_for(self, wo_id: str) -> list[AuditEntry]:
        """초안 하나의 이력. 전이가 종단이므로 길이는 0 또는 1 이다.

        🔴 그래도 목록으로 돌려준다 — 「최대 1건」은 지금 전이 규칙의 «결과»지 원장의 성질이
           아니다. 규칙이 열리면(예: 반려 후 재제출) 이 자리가 그대로 늘어나야 하고,
           단일 값으로 굳혀 두면 그때 호출부가 전부 갈린다.
        """
        entry = self._by_draft.get(wo_id)
        return [entry] if entry is not None else []

    def drop_session(self, session_id: str) -> int:
        """세션 리셋 — 그 세션의 결정만 버린다. 다른 세션은 손대지 않는다.

        🔴 아직 부르는 곳이 없다(`POST /sessions/{sid}/reset` 은 501 골격). `RunStore` 가
           같은 형태의 함수를 먼저 갖고 기다린 것과 같은 자리다 — 세션 저장소가 열릴 때
           「run 은 지웠는데 원장은 남았다」가 되지 않도록 지금 짝을 맞춰 둔다.

        🔴 원장을 세션 리셋으로 지우는 것은 계약이 정한 「해당 세션 상태«만» 초기화」를
           따른 것이지, 감사 기록의 성질이 그래서가 아니다. 실제 공장 원장이라면 세션이
           지울 수 있는 자리에 두지 않는다 — 여기서는 세션이 곧 격리 단위이므로 남기면
           남의 세션에서 보이지 않는 기록이 프로세스에 쌓인다.
        """
        doomed = [a for a in self._by_audit.values() if a.sessionId == session_id]
        for entry in doomed:
            self._by_audit.pop(entry.auditId, None)
            self._by_draft.pop(entry.workOrderDraftId, None)
        return len(doomed)
