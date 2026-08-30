"""T2-5 — HTTP 표면으로는 «만들 수 없는» 상태에서만 서는 방어를 프로세스 안에서 잰다.

    python -m tools.probe_work_order_guards

exit 0/1/2 는 `verify_work_order_surface` 와 같은 규약. 서버도 DB 도 필요 없다.

🔴 **왜 따로 있는가.** `verify_work_order_surface` 는 34행을 초록으로 냈지만 그 표에는 「못 잰
   열」이 둘 있었다 — 안전 조치가 «0건인» 초안의 승인 거절, 그리고 한 초안 id 를 두 run 이
   본문째 주장하는 충돌. 둘 다 편집 화이트리스트와 커밋된 fixture 때문에 밖에서는 만들 수
   없다. 그래서 방어 코드가 **한 번도 실행된 적 없는 채로** 초록 표 아래에 있었다.
   실행된 적 없는 분기는 「있다」가 아니라 「있다고 적혀 있다」다 — 키 이름 오타 하나면
   403 대신 500 이 난다. 못 잰 열을 적어 두는 것까지가 정직이고, 잴 길을 만드는 것이 그 다음이다.

🔴 여기서 만드는 초안은 **합성이다**(조사가 낸 것이 아니다). 그래서 이 파일은 형상·값의
   «옳음»을 재지 않는다 — 그건 실물 표면 도구의 몫이다. 여기서는 오직 「이 상태가 오면
   서버가 어떤 얼굴을 하는가」만 본다.
"""

from __future__ import annotations

import sys
from typing import Any

try:
    from fastapi.testclient import TestClient
except ImportError as exc:  # pragma: no cover — requirements-dev 미설치
    print(f"HARNESS ERROR: TestClient 를 못 불렀다(requirements-dev 필요): {exc}", file=sys.stderr)
    raise SystemExit(2) from exc

from app.investigation.store import RunRecord, RunStore
from app.main import create_app


def draft(wo_id: str, *, safety: list[dict[str, Any]]) -> dict[str, Any]:
    """계약 12필드를 갖춘 합성 초안 — 안전 배열만 인자로 바꾼다."""
    return {
        "workOrderDraftId": wo_id,
        "incidentId": "INC-2026-014",
        "equipmentId": "EQ-CNC-204",
        "title": "합성 초안(프로브 전용)",
        "failureModeId": "FM-BRG-WEAR",
        "procedures": [{"sopId": "SOP-BRG-INSP-014", "title": "점검", "status": "active"}],
        "safetyMeasures": safety,
        "parts": [],
        "evidenceIds": [],
        "gaps": ["절차에 매인 안전 규정이 0건이다 — 안전 조치 미확인"],
        "note": "프로브가 만든 초안이다.",
    }


def seed(store: RunStore, wo_id: str, *, safety: list[dict[str, Any]], mode: str = "live") -> RunRecord:
    record = store.create(
        session_id="probe000000", scenario_id="GS-01", incident_id="INC-2026-014", mode=mode  # type: ignore[arg-type]
    )
    record.status = "completed"
    record.workOrderDraftId = wo_id
    record.workOrderDraft = draft(wo_id, safety=safety)
    return record


def code_of(response: Any) -> str | None:
    try:
        return response.json()["error"]["code"]
    except Exception:  # noqa: BLE001 — 오류 형상이 아니면 그 사실이 곧 답이다
        return None


def main() -> int:
    app = create_app()
    rows: list[tuple[str, str, bool, str]] = []

    def check(axis: str, name: str, ok: bool, saw: str) -> None:
        rows.append((axis, name, ok, saw))

    # 🔴 raise_server_exceptions=False — 500 을 «응답으로» 보고 싶다. 예외로 튀어 오르면
    #    「서버가 이 상태에서 무슨 얼굴을 하는가」를 재지 못한다.
    with TestClient(app, raise_server_exceptions=False) as client:
        store: RunStore = app.state.run_store

        # --- P-1·P-2 안전 조치 0건 초안 -------------------------------------------------
        empty = "WOD-000000000e01"
        seed(store, empty, safety=[])
        response = client.post(f"/api/work-orders/{empty}/approve", json={"comment": "그냥 승인"})
        check("P-1", "안전 조치 0건 초안의 승인 = 403 safety_measures_absent",
              response.status_code == 403 and code_of(response) == "safety_measures_absent",
              f"{response.status_code} {code_of(response)}")

        response = client.post(f"/api/work-orders/{empty}/reject", json={"comment": "근거 부족"})
        check("P-2", "🔴 같은 초안의 «반려»는 열려 있다(종단에 닿을 길을 막지 않는다)",
              response.status_code == 200 and response.json().get("status") == "rejected",
              f"{response.status_code} {response.json()}")

        # 🔴 대조군 — 안전 조치가 «있는» 합성 초안은 승인된다. 없으면 P-1 의 초록이
        #    「승인 자체가 안 된다」로도 설명되어, 무엇을 잡았는지 말할 수 없다.
        ok_id = "WOD-000000000e02"
        seed(store, ok_id, safety=[{"safetyRuleId": "SAF-LOTO-01", "title": "LOTO",
                                    "class": "lockout", "mandatory": True}])
        response = client.post(f"/api/work-orders/{ok_id}/approve", json={"comment": "확인함"})
        check("P-3", "대조군: 안전 조치가 있으면 승인된다",
              response.status_code == 200 and response.json().get("status") == "approved",
              f"{response.status_code} {response.json()}")

        # --- P-4 한 초안 id 를 두 run 이 본문째 주장 --------------------------------------
        clash = "WOD-000000000e03"
        seed(store, clash, safety=[])
        seed(store, clash, safety=[])
        response = client.get(f"/api/work-orders/{clash}")
        check("P-4", "id 충돌 = 500 work_order_id_collision(조용히 하나 고르지 않는다)",
              response.status_code == 500 and code_of(response) == "work_order_id_collision",
              f"{response.status_code} {code_of(response)}")

        # --- P-5 live run 인데 본문이 없다 -------------------------------------------------
        headless = "WOD-000000000e04"
        record = seed(store, headless, safety=[])
        record.workOrderDraft = None                 # 우리 코드가 둘을 따로 세운 상태
        response = client.get(f"/api/work-orders/{headless}")
        check("P-5", "live run 본문 부재 = 500 draft_body_missing(404 로 접지 않는다)",
              response.status_code == 500 and code_of(response) == "draft_body_missing",
              f"{response.status_code} {code_of(response)}")

        # --- P-6 형상이 깨진 초안은 «조용한 부분 응답»이 되지 않는다 -------------------------
        broken = "WOD-000000000e05"
        record = seed(store, broken, safety=[])
        assert record.workOrderDraft is not None
        del record.workOrderDraft["equipmentId"]
        response = client.get(f"/api/work-orders/{broken}")
        check("P-6", "필드가 빠진 초안 = 500(11필드 200 이 아니다)",
              response.status_code == 500 and code_of(response) == "internal_error",
              f"{response.status_code} {code_of(response)}")

        # --- P-7 원장은 초안이 사라져도 남는다 ---------------------------------------------
        approvals = app.state.approval_store
        audit_id = client.post(f"/api/work-orders/{ok_id}/approve").status_code  # 이미 종단 → 409
        del audit_id
        entries = approvals.audits_for(ok_id)
        store.drop_session("probe000000")            # 세션의 run 전부 버린다
        after = approvals.audits_for(ok_id)
        check("P-7", "run 을 버려도 원장은 남는다(비 FK — 대상보다 오래 산다)",
              len(entries) == 1 and len(after) == 1
              and approvals.get_audit(entries[0].auditId) is not None,
              f"run 삭제 전 {len(entries)}건 → 후 {len(after)}건")

        # 초안은 실제로 사라졌는가 — 위 초록이 「아무것도 안 지웠다」로 설명되지 않게 확인한다.
        response = client.get(f"/api/work-orders/{ok_id}")
        check("P-8", "대조군: 그 초안 자체는 사라졌다(404)",
              response.status_code == 404 and code_of(response) == "not_found",
              f"{response.status_code} {code_of(response)}")

    width = max(len(name) for _, name, _, _ in rows)
    print("\nT2-5 WO 방어 프로브 — 프로세스 안(서버·DB 불요)\n")
    for axis, name, ok, saw in rows:
        print(f"  {'✓' if ok else '✗'} {axis:4} {name:<{width}}  {saw}")
    failed = [r for r in rows if not r[2]]
    if failed:
        print(f"\nFAIL: {len(failed)}/{len(rows)} 어긋남")
        return 1
    print(f"\nPASS: {len(rows)}/{len(rows)} 전건 기대대로")
    return 0


if __name__ == "__main__":
    sys.exit(main())
