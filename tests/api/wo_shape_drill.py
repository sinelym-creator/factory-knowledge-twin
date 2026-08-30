"""wo_shape_drill — 초안 응답이 «지금 정본»의 형상인가 (검증 좌석 · T2-5 · v0.1.5).

🔴 이 그물이 존재하는 이유. T2-5 그물 2종(`approval_transition`·`r12_enforcement`)은 계약
   **v0.1.4** 를 정본으로 삼아 세워졌다. 그 뒤 **v0.1.5 append** 가 형상을 정정했다 —
   `incidentId`·`equipmentId`·`failureModeId` 세 필드가 v0.1.4 에서 빠져 있었다. 두 그물은
   `approvalState`·`safetyMeasures` 만 읽으므로 **세 필드가 통째로 없어도 초록을 낸다**.
   「옛 규칙으로 난 초록」이 바로 그 자리다. 그래서 형상 축을 따로 연다.

🔴 기대값을 구현에서 읽지 않는다 — 필드 이름은 매 실행 계약에서 뽑는다. 상수로 베끼면
   계약이 또 개정될 때 이 그물도 같은 병에 걸린다(v0.1.4→v0.1.5 가 이미 보여 준 병이다).

🔴 판정 갈래: **정본에 있는데 응답에 없다 = red**. 반대(응답에만 있는 여분 필드)는 red 로
   세지 않고 «회부»로 적는다 — 계약이 추가 필드를 금한다고 성문한 적이 없다. 없는 금지를
   내가 지어내 빨강을 만들지 않는다.

🔴 미해제(501)는 red 가 아니다 — `exit 2`(측정 불가).

    python tests/api/wo_shape_drill.py

exit: 0 = 정본 필드 전건 존재 · 1 = 누락 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)

REPO = Path(__file__).resolve().parents[2]
CONTRACT = REPO / "packages" / "contracts" / "rest-api-v0.1.md"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-shape-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")

# v0.1.4 가 정본화한 GET 응답 형상 — 중괄호 코드 스팬 하나로 적혀 있다.
_BASE = re.compile(r"`\{\s*(workOrderDraftId[^`}]*?)\s*\}`")
# v0.1.5 가 되돌린 3필드 — 「형상에 N필드 추가」 항목의 백틱 토큰들(em-dash 앞까지).
_ADDED_LINE = re.compile(r"^-\s+\*\*v0\.1\.4 형상에 (\d+)필드 추가\*\*:(.*?)—", re.M | re.S)
_TOKEN = re.compile(r"`([A-Za-z][A-Za-z0-9_]*)`")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def parse_shape(text: str) -> tuple[list[str], list[str]]:
    """정본에서 필드를 뽑는다. 못 뽑으면 측정 불가다(빈 집합으로 통과시키지 않는다)."""
    base_m = _BASE.search(text)
    if not base_m:
        raise DrillError("계약에서 v0.1.4 응답 형상을 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    base = [f.strip().strip("`") for f in base_m.group(1).split(",") if f.strip()]

    add_m = _ADDED_LINE.search(text)
    if not add_m:
        raise DrillError("계약에서 v0.1.5 추가 필드 항목을 못 뽑았다 — 추출 규칙이 문서와 어긋났다")
    declared = int(add_m.group(1))
    added = _TOKEN.findall(add_m.group(2))
    if len(added) != declared:
        raise DrillError(f"v0.1.5 가 {declared}필드라 적었는데 {len(added)}개를 뽑았다 — 측정 불가")
    return base, added


def self_check(text: str) -> None:
    """🔴 대조군 — 추출기가 «빠진 필드»를 실제로 감지하는가. 감지 못 하면 초록이 뜻이 없다."""
    base, added = parse_shape(text)
    cut_base = text.replace(", approvalState }`", " }`", 1)
    if cut_base == text:
        raise DrillError("자기 검증 실패 — 대조군 주입 지점(approvalState)을 못 찾았다")
    got_base, _ = parse_shape(cut_base)
    if "approvalState" in got_base or len(got_base) != len(base) - 1:
        raise DrillError("자기 검증 실패 — 필드를 지운 사본에서도 같은 목록을 뽑는다")

    cut_add = text.replace("`incidentId` · ", "", 1)
    if cut_add == text:
        raise DrillError("자기 검증 실패 — 대조군 주입 지점(incidentId)을 못 찾았다")
    try:
        parse_shape(cut_add)
    except DrillError:
        pass  # 선언 수(3)와 토큰 수(2)가 어긋나 «측정 불가»로 죽는다 — 기대대로다.
    else:
        raise DrillError("자기 검증 실패 — v0.1.5 토큰을 지웠는데 그대로 통과한다")

    print(f"  자기 검증  v0.1.4 {len(base)}필드 + v0.1.5 {len(added)}필드 · "
          f"필드를 지운 사본 2종을 전건 감지 — 추출기 살아 있음")


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(_carry)
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def fresh_draft() -> tuple[str, dict]:
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": "live"})
    if status == 501:
        raise DrillError("runs 표면이 501 이다 — 미해제는 결함이 아니다")
    if status != 200:
        raise DrillError(f"run 생성이 {status} 를 냈다: {str(created)[:160]}")
    run_id = created["runId"]                            # type: ignore[index]
    deadline = time.time() + 180
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if (snap or {}).get("status") != "running":      # type: ignore[union-attr]
            draft = (snap or {}).get("workOrderDraftId")  # type: ignore[union-attr]
            if not draft:
                raise DrillError("완주한 run 에 workOrderDraftId 가 없다 — 측정 불가")
            status, body = call("GET", f"/api/work-orders/{draft}")
            if status == 501:
                raise DrillError("work-orders 표면이 501 이다 — 미해제는 결함이 아니다")
            if status != 200 or not isinstance(body, dict):
                raise DrillError(f"초안을 읽지 못했다({status})")
            return str(draft), body
        time.sleep(0.5)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if not CONTRACT.exists():
        raise DrillError(f"정본 없음: {CONTRACT}")
    text = CONTRACT.read_text(encoding="utf-8")
    self_check(text)
    base, added = parse_shape(text)
    canon = base + [f for f in added if f not in base]
    print(f"\n정본      : {CONTRACT.relative_to(REPO)} · v0.1.4 {len(base)} + v0.1.5 {len(added)}"
          f" = 필드 {len(canon)}종")

    draft_id, body = fresh_draft()
    got = set(body.keys())
    print(f"대상      : {API_BASE} · 초안 {draft_id} · 응답 필드 {len(got)}종\n")

    missing = [f for f in canon if f not in got]
    for field in canon:
        mark = "PASS" if field in got else "FAIL"
        src = "v0.1.5" if field in added and field not in base else "v0.1.4"
        print(f"  {mark}  [{src}] {field}")

    extra = sorted(got - set(canon))
    print(f"\n  {'PASS' if not missing else 'FAIL'}  정본 필드 누락 {len(missing)}건"
          + (f" — {missing}" if missing else ""))
    if extra:
        print(f"  🔴 회부  정본 밖 필드 {len(extra)}종 — {extra}")
        print("        (계약이 추가 필드를 금한 적은 없다 — 성문 여부는 오케 판정)")
    else:
        print("  참고  정본 밖 필드 0종")

    print(f"\n결과: 누락 {len(missing)}건")
    return 1 if missing else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
