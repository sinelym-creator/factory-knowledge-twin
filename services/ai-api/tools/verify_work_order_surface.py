"""T2-5 WO 초안 표면 실측 — 형상·R12 강제·전이·Q-27·SSOT 무접촉 (구현 좌석 자기 실측).

    python -m tools.verify_work_order_surface
    python -m tools.verify_work_order_surface --api http://127.0.0.1:8021

exit 0 = 전건 기대대로 · 1 = 어긋남 1건 이상(대상의 결함) · 2 = 실행 오류(그물이 죽었거나
대상이 서 있지 않다 — 「초록도 빨강도 아니다」). tests/api 드릴의 판정 규약과 같은 셋이다.

🔴 **이 도구는 «구현이 스스로 재는 것»이다.** 독립 검증은 검증 좌석(`tests/**`)이 자기 표본으로
   따로 한다 — 여기서 초록이 나왔다고 acceptance 가 아니다(baseline §32.1). 내가 잡을 줄 아는
   것으로 내가 잡는지 확인하는 데까지가 이 파일의 사정거리다(11대 계보 「검사기의 표본은
   밖에서 온다」).

🔴 **무엇을 재지 «못하는지»도 적는다**(아래 `UNREACHABLE` 표). 못 잰 열을 빈칸으로 두면
   다음 사람이 그 자리를 「쟀는데 통과」로 읽는다.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_API = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
DEFAULT_PG = os.environ.get("FKT_PG_CONTAINER", "fkt-senku2-q3-postgres-1")
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")

# run 완주 대기 상한. 🔴 `while True` 를 쓰지 않는다 — 재생 run 처럼 「올 것이 이미 다 온」
#    경우에 끝나지 않는 대기는 재는 축이 아니라 계측기가 멈춘 것이다(11대 함정 ⓕ).
POLL_MAX = 90
POLL_SLEEP = 1.0

# 계약 v0.1.4 + v0.1.5 가 정한 응답 키 — 순서는 보지 않고 집합만 본다.
CONTRACT_KEYS = {
    "workOrderDraftId",
    "incidentId",
    "equipmentId",
    "title",
    "failureModeId",
    "procedures",
    "safetyMeasures",
    "parts",
    "evidenceIds",
    "gaps",
    "note",
    "approvalState",
}

# 🔴 HTTP 표면으로는 «만들 수 없는» 상태 — 「안 쟀다」가 아니라 「이 표면에서는 못 만든다」다.
#    셋 다 `tools/probe_work_order_guards.py`(프로세스 안 · 합성 초안)가 잰다. 이 표를 지우지
#    않고 «어디서 재는지»를 적어 두는 이유: 지우면 다음 사람이 이 도구의 초록을 「전부 쟀다」로
#    읽는다. 34행 초록 아래에 한 번도 실행된 적 없는 분기가 있던 것이 실제로 이 자리였다.
UNREACHABLE = [
    (
        "safety_measures_absent",
        "안전 조치 0건 초안의 승인 거절",
        "화이트리스트가 safetyMeasures 편집을 막아 빈 배열 초안을 만들 길이 없고, 승인된 "
        "시나리오는 GS-01 하나뿐이라 안전 조치 2건이 항상 실린다 → probe P-1·P-2·P-3",
    ),
    (
        "work_order_id_collision",
        "한 초안 id 를 두 run 이 본문째 주장",
        "같은 프로세스가 fixture 를 녹화한 run 을 살려 둔 채 그 fixture 를 재생해야 성립한다. "
        "커밋된 fixture 는 과거 프로세스에서 왔다 → probe P-4",
    ),
    (
        "draft_body_missing",
        "live run 인데 초안 본문이 없다",
        "우리 코드가 id 와 본문을 따로 세워야 성립하는 «있을 수 없는 상태»다 → probe P-5",
    ),
]


class DrillError(RuntimeError):
    """그물 쪽 사고 — 대상의 결함이 아니다(exit 2)."""


def call(
    api: str, method: str, path: str, body: object | None = None
) -> tuple[int, dict[str, object]]:
    """요청 하나. 상태 코드와 파싱된 본문을 돌려준다.

    🔴 4xx·5xx 를 예외로 흘리지 않는다 — 이 도구가 재는 것의 대부분이 «거절»이고,
       거절을 사고로 다루면 기대한 red 를 그물이 먼저 삼킨다.
    """
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(f"{api}{path}", data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            # 🔴 계약은 「전 응답 JSON」이다. JSON 이 아닌 오류가 나오면 그것 자체가 사실이라
            #    삼키지 않고 본문을 실어 올린다.
            return exc.code, {"_nonJson": raw.decode("utf-8", "replace")[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{api} 에 닿지 못했다 — 서버가 서 있는가? ({exc.reason})") from exc


def code_of(body: object) -> str | None:
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        return body["error"].get("code")            # type: ignore[union-attr,return-value]
    return None


def finished_run(api: str, session: str, mode: str) -> dict[str, object]:
    """시나리오 run 하나를 끝까지 몰고 스냅샷을 돌려준다."""
    status, created = call(api, "POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": session, "mode": mode})
    if status != 200 or not isinstance(created, dict) or "runId" not in created:
        raise DrillError(f"{mode} run 을 시작하지 못했다: {status} {created}")
    run_id = created["runId"]
    for _ in range(POLL_MAX):
        _, snapshot = call(api, "GET", f"/api/runs/{run_id}")
        if isinstance(snapshot, dict) and snapshot.get("status") != "running":
            return snapshot
        time.sleep(POLL_SLEEP)
    raise DrillError(f"run {run_id} 이 {POLL_MAX}회 폴링 안에 끝나지 않았다")


def draft_id_of(snapshot: dict[str, object], mode: str) -> str:
    wo_id = snapshot.get("workOrderDraftId")
    if not isinstance(wo_id, str) or not wo_id:
        raise DrillError(f"{mode} run 이 workOrderDraftId 를 내지 않았다: {snapshot}")
    return wo_id


def ssot_fingerprint(container: str) -> str:
    """공장 `work_order` 테이블의 지문 — 행 수 + 내용 해시.

    🔴 행 수만 보지 않는다. 15행을 유지한 채 «내용»이 바뀌는 쓰기가 가장 조용한 형태다.
    """
    sql = (
        "SELECT count(*)::text || ':' || "
        "coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM work_order t;"
    )
    try:
        out = subprocess.run(
            ["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", container,
             "psql", "-U", "fkt", "-d", "fkt", "-t", "-A", "-c", sql],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise DrillError(f"docker exec 로 {container} 에 묻지 못했다: {exc}") from exc
    if out.returncode != 0:
        raise DrillError(f"psql 이 실패했다({container}): {out.stderr.strip()[:200]}")
    fingerprint = out.stdout.strip()
    if not fingerprint:
        # 🔴 빈 결과를 「변화 없음」으로 읽지 않는다 — 아무것도 못 본 검사는 통과가 아니다.
        raise DrillError(f"{container} 의 work_order 지문이 비었다 — 무엇도 재지 못했다")
    return fingerprint


def main() -> int:
    parser = argparse.ArgumentParser(description="T2-5 WO 표면 실측")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--pg-container", default=DEFAULT_PG)
    args = parser.parse_args()
    api: str = args.api

    rows: list[tuple[str, str, bool, str]] = []

    def check(axis: str, name: str, ok: bool, saw: str) -> None:
        rows.append((axis, name, ok, saw))

    before = ssot_fingerprint(args.pg_container)

    stamp = f"{int(time.time()):x}"
    live = finished_run(api, f"wo{stamp}a", "live")
    wo = draft_id_of(live, "live")
    replay = finished_run(api, f"wo{stamp}r", "replay")
    wo_replay = draft_id_of(replay, "replay")

    # --- A 형상 -------------------------------------------------------------------
    status, draft = call(api, "GET", f"/api/work-orders/{wo}")
    keys = set(draft) if isinstance(draft, dict) else set()
    check("A-1", "GET 응답 키 = 계약 12필드(초과 0·누락 0)", status == 200 and keys == CONTRACT_KEYS,
          f"{status} 초과={sorted(keys - CONTRACT_KEYS)} 누락={sorted(CONTRACT_KEYS - keys)}")
    check("A-2", "approvalState 초기값 = pending · state 키 없음",
          isinstance(draft, dict) and draft.get("approvalState") == "pending" and "state" not in keys,
          str(draft.get("approvalState") if isinstance(draft, dict) else draft))

    safety_before = json.dumps(draft.get("safetyMeasures") if isinstance(draft, dict) else None,
                               sort_keys=True, ensure_ascii=False)
    check("A-3", "안전 조치가 실려 있다(대조군의 전제)",
          isinstance(draft, dict) and bool(draft.get("safetyMeasures")), safety_before[:60])

    # --- B R12 형제 6종 + 대조군 ------------------------------------------------------
    one_rule = (draft.get("safetyMeasures") or [{}])[:1] if isinstance(draft, dict) else [{}]
    weakened = json.loads(json.dumps(one_rule))
    if weakened and isinstance(weakened[0], dict):
        weakened[0]["mandatory"] = False

    siblings = [
        ("B-1", "① 안전 배열 빈 배열 치환", {"safetyMeasures": []}, "safety_measure_immutable"),
        ("B-2", "② 안전 배열 부분 삭제", {"safetyMeasures": one_rule}, "safety_measure_immutable"),
        ("B-3", "③ mandatory true→false(지우지 않고 죽인다)", {"safetyMeasures": weakened},
         "safety_measure_immutable"),
        ("B-4", "④ 절차(SOP) 삭제 = 안전 조치의 근거 제거", {"procedures": []},
         "safety_basis_immutable"),
    ]
    for axis, name, body, expected in siblings:
        code_status, response = call(api, "PATCH", f"/api/work-orders/{wo}", body)
        check(axis, name, code_status == 403 and code_of(response) == expected,
              f"{code_status} {code_of(response)}")

    # ⑤ 전체 치환 — GET 응답을 통째로 되돌려보낸다(화면이 흔히 하는 짓).
    whole = dict(draft) if isinstance(draft, dict) else {}
    whole["safetyMeasures"] = []
    code_status, response = call(api, "PATCH", f"/api/work-orders/{wo}", whole)
    check("B-5", "⑤ 전체 문서 치환 = 명시 거절(조용한 무시 아님)",
          code_status == 403 and code_of(response) == "safety_measure_immutable",
          f"{code_status} {code_of(response)}")

    # ⑥ 키 누락 = 무변.
    code_status, patched = call(api, "PATCH", f"/api/work-orders/{wo}", {"title": "제목만 고친다"})
    safety_after = json.dumps(patched.get("safetyMeasures") if isinstance(patched, dict) else None,
                              sort_keys=True, ensure_ascii=False)
    check("B-6", "⑥ 없는 키 = 무변(안전 배열이 그대로다)",
          code_status == 200 and safety_after == safety_before, f"{code_status} 동일={safety_after == safety_before}")
    check("B-7", "대조군: title 편집이 «반영된다»",
          isinstance(patched, dict) and patched.get("title") == "제목만 고친다",
          str(patched.get("title") if isinstance(patched, dict) else patched)[:40])

    code_status, patched = call(api, "PATCH", f"/api/work-orders/{wo}", {"parts": []})
    check("B-8", "🔴 대조군: 일반 항목(parts)은 «지워진다»",
          code_status == 200 and isinstance(patched, dict) and patched.get("parts") == [],
          f"{code_status} parts={patched.get('parts') if isinstance(patched, dict) else patched}")

    # --- C 성문 6종 밖에서 더 센 형제 ---------------------------------------------------
    extras = [
        ("C-1", "gaps 삭제 = 「조치가 없다는 경고」 제거", {"gaps": []}, 403, "gap_notice_immutable"),
        ("C-2", "evidenceIds 삭제 = 근거 제거", {"evidenceIds": []}, 403, "evidence_basis_immutable"),
        ("C-3", "approvalState 직접 승인 = 승인 경로 우회", {"approvalState": "approved"}, 403,
         "approval_path_bypass"),
        ("C-4", "snake_case 별칭은 «승격 없이» 거절", {"safety_measures": []}, 403, "field_not_editable"),
        ("C-5", "화이트리스트 필드의 형 위반", {"title": 12}, 422, "invalid_field_type"),
    ]
    for axis, name, body, want_status, want_code in extras:
        code_status, response = call(api, "PATCH", f"/api/work-orders/{wo}", body)
        check(axis, name, code_status == want_status and code_of(response) == want_code,
              f"{code_status} {code_of(response)}")

    # 🔴 7번째 형제 — 승인 경로를 편집 경로로 쓴다. pydantic 기본값이 조용히 버리던 자리.
    code_status, response = call(api, "POST", f"/api/work-orders/{wo}/approve",
                                 {"comment": "ok", "safetyMeasures": []})
    check("C-6", "🔴 approve 본문에 편집 실기 = 거절(조용한 무시 아님)",
          code_status == 422 and code_of(response) == "invalid_request",
          f"{code_status} {code_of(response)}")
    _, still = call(api, "GET", f"/api/work-orders/{wo}")
    check("C-7", "위 시도 후에도 안전 배열·상태가 그대로다",
          isinstance(still, dict) and still.get("approvalState") == "pending"
          and json.dumps(still.get("safetyMeasures"), sort_keys=True, ensure_ascii=False) == safety_before,
          str(still.get("approvalState") if isinstance(still, dict) else still))

    # --- D 전이 ----------------------------------------------------------------------
    code_status, decided = call(api, "POST", f"/api/work-orders/{wo}/approve", {"comment": "승인한다"})
    audit_id = decided.get("auditId") if isinstance(decided, dict) else None
    check("D-1", "approve = 200 {status, auditId}",
          code_status == 200 and isinstance(decided, dict) and decided.get("status") == "approved"
          and isinstance(audit_id, str) and audit_id.startswith("AUD-"),
          f"{code_status} {decided}")

    for axis, name, method, path, body in [
        ("D-2", "재승인 없음", "POST", f"/api/work-orders/{wo}/approve", {"comment": "또"}),
        ("D-3", "번복(승인→반려) 없음", "POST", f"/api/work-orders/{wo}/reject", {"comment": "무르자"}),
    ]:
        code_status, response = call(api, method, path, body)
        check(axis, name, code_status == 409 and code_of(response) == "approval_state_terminal",
              f"{code_status} {code_of(response)}")

    for axis, name, body in [
        ("D-4", "종단 상태 편집(일반 필드) 거절", {"title": "승인 뒤 고치기"}),
        ("D-5", "종단 상태 편집(안전 배열)도 «전이» 사유로 거절", {"safetyMeasures": []}),
    ]:
        code_status, response = call(api, "PATCH", f"/api/work-orders/{wo}", body)
        check(axis, name, code_status == 409 and code_of(response) == "work_order_not_editable",
              f"{code_status} {code_of(response)}")

    _, after_decide = call(api, "GET", f"/api/work-orders/{wo}")
    check("D-6", "GET 이 approved 를 말한다",
          isinstance(after_decide, dict) and after_decide.get("approvalState") == "approved",
          str(after_decide.get("approvalState") if isinstance(after_decide, dict) else after_decide))

    # 반려 쪽 종단도 같은지 — 새 초안으로 연다(승인 쪽 초안은 이미 종단이다).
    second = finished_run(api, f"wo{stamp}b", "live")
    wo2 = draft_id_of(second, "live")
    code_status, rejected = call(api, "POST", f"/api/work-orders/{wo2}/reject", {"comment": "근거 부족"})
    check("D-7", "reject = 200 {status, auditId}",
          code_status == 200 and isinstance(rejected, dict) and rejected.get("status") == "rejected"
          and str(rejected.get("auditId", "")).startswith("AUD-"), f"{code_status} {rejected}")
    code_status, response = call(api, "POST", f"/api/work-orders/{wo2}/approve", {"comment": "역시 승인"})
    check("D-8", "반려 뒤 승인 없음(반려도 종단이다)",
          code_status == 409 and code_of(response) == "approval_state_terminal",
          f"{code_status} {code_of(response)}")
    check("D-9", "두 초안의 auditId 가 서로 다르다",
          isinstance(rejected, dict) and rejected.get("auditId") != audit_id,
          f"{audit_id} vs {rejected.get('auditId') if isinstance(rejected, dict) else rejected}")

    # --- E Q-27 재생 4경로 --------------------------------------------------------------
    for axis, method, path, body in [
        ("E-1", "GET", f"/api/work-orders/{wo_replay}", None),
        ("E-2", "PATCH", f"/api/work-orders/{wo_replay}", {"title": "재생본 편집"}),
        ("E-3", "POST", f"/api/work-orders/{wo_replay}/approve", {"comment": "재생본 승인"}),
        ("E-4", "POST", f"/api/work-orders/{wo_replay}/reject", {"comment": "재생본 반려"}),
    ]:
        code_status, response = call(api, method, path, body)
        check(axis, f"재생 run 초안 {method} = 501 replay_draft_source_absent",
              code_status == 501 and code_of(response) == "replay_draft_source_absent",
              f"{code_status} {code_of(response)}")

    # --- F 없는 초안 -------------------------------------------------------------------
    code_status, response = call(api, "GET", "/api/work-orders/WOD-000000000000")
    check("F-1", "없는 초안 = 404 not_found(501 과 구분된다)",
          code_status == 404 and code_of(response) == "not_found", f"{code_status} {code_of(response)}")

    # --- G SSOT 무접촉 -----------------------------------------------------------------
    after = ssot_fingerprint(args.pg_container)
    check("G-1", "공장 work_order 지문 불변(행 수 + 내용 해시)", after == before, f"{before} → {after}")
    check("G-2", "지문이 15행을 말한다(무엇도 못 본 초록이 아니다)",
          after.split(":", 1)[0] == "15", after.split(":", 1)[0])

    # --- 출력 ---------------------------------------------------------------------------
    width = max(len(name) for _, name, _, _ in rows)
    print(f"\nT2-5 WO 표면 실측 — {api} · 초안 {wo} / 재생 {wo_replay}\n")
    for axis, name, ok, saw in rows:
        print(f"  {'✓' if ok else '✗'} {axis:5} {name:<{width}}  {saw}")
    failed = [r for r in rows if not r[2]]

    print("\n  못 잰 열(이 표면으로는 도달 불가 — 빈칸으로 두지 않는다):")
    for code, what, why in UNREACHABLE:
        print(f"    · {code} — {what}\n      {why}")

    if failed:
        print(f"\nFAIL: {len(failed)}/{len(rows)} 어긋남")
        return 1
    print(f"\nPASS: {len(rows)}/{len(rows)} 전건 기대대로")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DrillError as error:
        print(f"HARNESS ERROR: {error}", file=sys.stderr)
        sys.exit(2)
