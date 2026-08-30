"""r12_enforcement_drill — 안전 조치를 «서버가» 지키는가 (검증 좌석 · T2-5 · R12).

R12 = `SOP —REQUIRES→ SafetyRule`(data-ontology-spec §6). 초안이 인용한 SOP 가 요구하는 안전
규정은 **편집으로 사라지면 안 된다** — 그리고 그것을 막는 것은 화면이 아니라 서버다.

🔴 이 그물이 지키는 문장 셋:
   ① **성문된 형제 6종이 전부 막힌다.** 하나라도 통과하면 R12 는 «지키는 척»이다.
   ② 🔴 **일반 항목은 지워져야 한다.** 전부 거절하는 서버는 R12 를 지킨 것이 아니라 **편집을
      막은** 것이다. 대조군이 없으면 이 둘을 구별할 수 없다(4대 유언).
   ③ 🔴 **거절했으면 상태도 그대로여야 한다.** 4xx 를 주고 값은 바꿔 놓는 것이 제일 나쁘다 —
      화면은 막혔다고 읽는데 데이터는 이미 바뀌어 있다.

🔴 **7번째 형제 탐색**(오케 발주). 성문 6종을 더 들여다봐서는 안 나온다. 6종이 «어떤 축»을
   채웠는지 분해하고 그 축의 빈칸을 던진다 — 아래 `PROBES` 가 그 빈칸이다.
   판정 규율: 통과하면 형제, 막히면 「막힌다」로 적는다. **못 찾으면 못 찾았다고 쓴다.**
   순서 규율: 🔴 6종이 다 막힌 것을 확인한 «뒤»에 던진다 — 막힌 목록이 빈칸 계산의 입력이다.

🔴 미해제(501)는 red 가 아니다 — `exit 2`(측정 불가)로 죽는다.

    python tests/api/r12_enforcement_drill.py

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
"""

from __future__ import annotations

import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.request

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SESSION_ID = "levi2-r12-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
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


def code_of(body: object) -> str | None:
    return (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None


def fresh_draft() -> tuple[str, dict]:
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": "live"})
    if status == 501:
        raise DrillError("runs 표면이 501 이다 — 미해제는 결함이 아니다")
    if status != 200:
        raise DrillError(f"run 생성이 {status} 를 냈다")
    run_id = created["runId"]                            # type: ignore[index]
    deadline = time.time() + 120
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if (snap or {}).get("status") != "running":      # type: ignore[union-attr]
            draft = (snap or {}).get("workOrderDraftId")  # type: ignore[union-attr]
            if not draft:
                raise DrillError("완주한 run 에 workOrderDraftId 가 없다")
            status, body = call("GET", f"/api/work-orders/{draft}")
            if status == 501:
                raise DrillError("work-orders 표면이 501 이다 — 미해제는 결함이 아니다")
            if status != 200 or not isinstance(body, dict):
                raise DrillError(f"초안을 읽지 못했다({status})")
            return str(draft), body
        time.sleep(0.5)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다")


def measures(draft: dict) -> list:
    got = draft.get("safetyMeasures")
    if not isinstance(got, list) or not got:
        # 🔴 안전 조치가 0건인 초안으로는 이 축을 잴 수 없다 — 빈 것끼리의 통과는 통과가 아니다.
        raise DrillError(f"초안의 safetyMeasures 가 비었다({got!r}) — 측정 불가")
    return got


def attempt(draft_id: str, patch: dict) -> tuple[int, str | None, list]:
    """PATCH 를 던지고, 던진 «뒤»의 안전 조치까지 읽어 온다(거절이 진짜 거절인지 본다)."""
    status, body = call("PATCH", f"/api/work-orders/{draft_id}", patch)
    _, after = call("GET", f"/api/work-orders/{draft_id}")
    now = (after or {}).get("safetyMeasures") if isinstance(after, dict) else None
    return status, code_of(body), now if isinstance(now, list) else []


def self_check(base: list) -> None:
    """🔴 비교기가 «값이 바뀐 것»을 실제로 잡는가."""
    if base == base[:-1]:
        raise DrillError("자기 검증 실패 — 줄어든 목록을 같다고 판정한다")
    if base != list(base):
        raise DrillError("자기 검증 실패 — 같은 목록을 다르다고 판정한다")
    print(f"  자기 검증  안전 조치 {len(base)}건 · 줄어든 목록을 어긋남으로 잡는다 — 비교기 살아 있음")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    draft_id, draft = fresh_draft()
    base = measures(draft)
    print(f"대상      : {API_BASE} · 초안 {draft_id}")
    print(f"기준선    : safetyMeasures {len(base)}건\n")
    self_check(base)
    print()

    first = base[0]
    rest = base[1:]

    # ── 성문 형제 6종(오케 판정) — 전부 «막혀야» 한다 ──────────────────────
    siblings: list[tuple[str, dict]] = [
        ("① 빈 배열", {"safetyMeasures": []}),
        ("② 부분 삭제", {"safetyMeasures": rest or [first]}),
        ("③ mandatory 무력화", {"safetyMeasures": [_disarm(m) for m in base]}),
        ("④ SOP 근거 삭제", {"evidenceIds": [], "procedures": []}),
        ("⑤ 전체 치환", {"safetyMeasures": [{"id": "SAF-FAKE-99", "label": "리바이2 치환"}]}),
        ("⑥ 키 누락 = 무변", {"title": "제목만 바꾼다"}),
    ]

    bad = 0
    blocked: list[str] = []
    for name, patch in siblings:
        status, code, now = attempt(draft_id, patch)
        if name.startswith("⑥"):
            # 🔴 이 칸만 «성공해야» 한다 — 대신 안전 조치가 그대로여야 한다.
            ok = status == 200 and now == base
            note = f"{status} · 안전 조치 {'무변' if now == base else '🔴 바뀌었다'}"
        else:
            refused = 400 <= status < 500
            unchanged = now == base
            ok = refused and unchanged
            note = f"{status} {code or ''}"
            if status == 200:
                note += "  🔴 통과했다"
            if refused and not unchanged:
                note += "  🔴 거절했는데 값이 바뀌었다"
            if refused:
                blocked.append(name)
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  형제 {name:22} {note}")

    # ── 대조군 — 🔴 일반 항목은 «지워져야» 한다 ────────────────────────────
    status, code, now = attempt(draft_id, {"title": "일정 변경 — 리바이2 대조군"})
    editable = status == 200 and now == base
    bad += 0 if editable else 1
    print(f"\n  {'PASS' if editable else 'FAIL'}  대조군 — 일반 항목 편집은 «성공»한다   {status} {code or ''}")
    print("        (전부 거절이면 R12 를 지킨 게 아니라 편집을 막은 것이다)")

    # ── 🔴 7번째 형제 탐색 — 6종이 «다 막힌 뒤»에 던진다 ──────────────────
    print(f"\n  ── 🔴 7번째 형제 탐색 (성문 6종 중 막힌 것 {len(blocked)}/5)")
    if len(blocked) < 5:
        print("     건너뜀 — 성문 형제가 아직 다 막히지 않았다. 빈칸 계산의 입력이 서지 않는다")
    else:
        probes: list[tuple[str, dict]] = [
            ("연산 축 빈칸 — null", {"safetyMeasures": None}),
            ("연산 축 빈칸 — 타입 위반", {"safetyMeasures": "없음"}),
            ("필드 축 빈칸 — 화이트리스트 밖 경유", {"note": json.dumps(base, ensure_ascii=False),
                                            "safetyMeasures": []}),
            ("동일성 축 빈칸 — 표기 변형 밀어내기", {"safetyMeasures": [_restyle(m) for m in base]}),
        ]
        found: list[str] = []
        for name, patch in probes:
            status, code, now = attempt(draft_id, patch)
            passed = status == 200 and now != base
            if passed:
                found.append(name)
            print(f"  {'🔴 형제' if passed else '막힌다'}  {name:34} {status} {code or ''}")
        # 🔴 경로 축 빈칸 — approve 요청 «본문»으로 편집이 되는가.
        status, body = call("POST", f"/api/work-orders/{draft_id}/approve",
                            {"safetyMeasures": []})
        _, after = call("GET", f"/api/work-orders/{draft_id}")
        now = (after or {}).get("safetyMeasures") if isinstance(after, dict) else None
        passed = status == 200 and now != base
        if passed:
            found.append("경로 축 빈칸 — approve 본문 편집")
        print(f"  {'🔴 형제' if passed else '막힌다'}  {'경로 축 빈칸 — approve 본문 편집':34} {status} {code_of(body) or ''}")

        bad += len(found)
        if found:
            print(f"\n  🔴 7번째 형제 «찾았다» — {found}")
        else:
            print("\n  ✅ 7번째 형제 «못 찾았다» — 던진 5칸이 전부 막힌다."
                  " 없는 것을 지어내 형제라 부르지 않는다")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


def _disarm(measure: object) -> object:
    """항목은 두고 «필수» 표시만 끈다 — 성문 형제 ③."""
    if isinstance(measure, dict):
        out = dict(measure)
        for key in ("mandatory", "required", "isMandatory"):
            if key in out:
                out[key] = False
        return out
    return measure


def _restyle(measure: object) -> object:
    """🔴 동일성 축 — 낱말은 그대로 두고 «표기»만 바꾼다(대소문자·공백·유니코드 정규화).

    이 리포의 V-1 이 물린 자리와 같은 질문이다: 서버가 두 표기를 «같은 것»으로 보는가,
    «다른 것»으로 보는가. 다른 것으로 보면 원본이 밀려나고, 같은 것으로 보면 그대로여야 한다.
    """
    if isinstance(measure, dict):
        out = dict(measure)
        for key in ("id", "safetyRuleId", "code"):
            if isinstance(out.get(key), str):
                out[key] = " " + unicodedata.normalize("NFD", out[key].lower()) + " "
        return out
    if isinstance(measure, str):
        return " " + unicodedata.normalize("NFD", measure.lower()) + " "
    return measure


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
