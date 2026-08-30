"""세션 가드·소유권 실측 (T3-1 · 계약 v0.1.6 집행 확인).

    python -m tools.session_guard_matrix              # 표 + 대조군 전건
    python -m tools.session_guard_matrix --quiet      # 판정만

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류(측정 불가)

🔴 **이 도구가 있는 이유**: 가드는 「기본 ON + 예외 목록」 구조다. 그 구조는 **자기 분기를
   가린다** — 예외 목록에 있는 것만 통과한다는 사실은, 목록 «밖»의 라우트가 실제로 물리는지를
   증명하지 않는다. 「막았다」와 「막는 코드가 동작한다」는 다른 사실이고(계보: 허용 목록은
   자기 분기를 가린다), 그 둘을 가르는 유일한 방법은 **목록 밖의 표본을 밖에서 만들어
   먹이는 것**이다. 대조군 A 가 그 일을 한다: 이 앱에 없는 라우트를 새로 붙여 가드가 무는지 본다.

🔴 **우는 것만 확인하면 「전부 401」인 서버도 통과한다.** 그래서 대조군 B 를 함께 둔다 —
   면제 3라우트와 읽기 예외 2라우트가 세션 «없이» 실제로 열리는지. 한쪽만 보는 검사는
   자기가 고른 표본으로만 우는 검사다(V-8 계보).

🔴 **검사가 무엇을 봤는지 센다.** 스캔한 라우트가 0 이면 그것은 「위반 없음」이 아니라 검사기
   고장이므로 FAIL 이다(계보: 빈 결과는 통과가 아니다).

🔴 **소유권 축의 run 은 «주입»이다** — 조사 파이프라인을 돌려 만든 것이 아니라 저장소에
   직접 넣은 레코드다. 재는 것이 「소유권 판정」이지 「조사가 도는가」가 아니라서 그렇게 했고,
   그 사실을 여기 적어 둔다(계측 대상과 계측기를 섞지 않는다). 실 파이프라인 축은
   `tools/session_reset_probe.py` 가 살아 있는 서버에 대고 잰다.
"""

from __future__ import annotations

import argparse
import threading
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from fastapi import Depends, FastAPI                                    # noqa: E402
from fastapi.testclient import TestClient                               # noqa: E402
from starlette.websockets import WebSocketDisconnect                    # noqa: E402

from app.main import create_app                                         # noqa: E402
from app.session_guard import (                                         # noqa: E402
    FRAMEWORK_UNGUARDED,
    GUARD_EXEMPT,
    MODE_FRAMEWORK,
    MODE_GUARDED,
    READ_ONLY_EXCEPTIONS,
    WS_SESSION_REQUIRED,
    guard_table,
    session_guard,
)
from app.session_store import SESSION_COOKIE                            # noqa: E402

if hasattr(sys.stdout, "reconfigure"):                    # pragma: no cover — 플랫폼 의존
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# --- 결과 그릇 --------------------------------------------------------------------


@dataclass
class Check:
    label: str
    ok: bool
    detail: str


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)
    routes_scanned: int = 0

    def add(self, label: str, ok: bool, detail: str) -> None:
        self.checks.append(Check(label, ok, detail))

    @property
    def failures(self) -> list[Check]:
        return [c for c in self.checks if not c.ok]

    @property
    def ok(self) -> bool:
        # 🔴 스캔량 0 = 고장. 「어긋남 0」이 아니라 「본 것이 없다」는 뜻이다.
        return not self.failures and self.routes_scanned > 0


# --- 라우트를 «부를 수 있는 요청»으로 바꾸기 ------------------------------------------

# 경로 템플릿의 자리표시자를 채우는 값. 존재하지 않아도 된다 — 재는 것은 「세션 층에서
# 걸리는가」이고, 세션을 통과한 뒤 404/501/503 이 나오는 것은 이 표의 관심사가 아니다.
_PLACEHOLDER = "probe-id"

# WS 프로브 상한 — 넘으면 «매달림»을 값으로 적는다(측정기는 멈추지 않는다).
WS_PROBE_TIMEOUT_SEC = 8.0

# 본문이 필요한 라우트 — 계약이 동결한 요청 형상. 🔴 세션 축을 재는 데 필요한 최소만 싣는다.
_BODIES: dict[tuple[str, str], dict[str, Any]] = {
    ("POST", "/api/scenarios/{scenarioId}/runs"): {"mode": "replay"},
    ("POST", "/api/retrieval/compare"): {"question": "probe", "strategies": ["vector"]},
}


def _fill(path: str) -> str:
    out: list[str] = []
    depth = 0
    for ch in path:
        if ch == "{":
            depth += 1
            if depth == 1:
                out.append(_PLACEHOLDER)
        elif ch == "}":
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def _ws_probe(client: TestClient, url: str, cookies: dict[str, str]) -> tuple[int, str]:
    """WS 를 열어 보고 «닫힌 코드»를 돌려준다.

    🔴 **핸드셰이크 성공을 「열렸다」로 읽지 않는다.** 이 자리에서 측정이 한 번 거짓말했다:
       소유권 거절은 `accept()` 뒤에 close(4404) 로 나가는데(계약 v0.1 이 정한 not-found 축과
       «같은 답»이어야 하므로 그렇게 둔 것이다), 처음 측정기는 `websocket_connect` 가 예외를
       안 냈다는 이유로 「거절 실패」라고 적었다. 서버가 곧 닫는지까지 읽어야 판정이다.

    반환 코드: 4401 = 가드 거절(핸드셰이크 전) · 4404 = 없거나 남의 run · 1000·1005 = 정상 종료.
    """
    client.cookies.clear()
    result: list[tuple[int, str]] = []
    worker = threading.Thread(target=lambda: result.append(_ws_probe_blocking(client, url, cookies)))
    worker.daemon = True
    worker.start()
    worker.join(WS_PROBE_TIMEOUT_SEC)
    if worker.is_alive():
        # 🔴 매달림을 «판정 없음»으로 남기지 않는다. 측정기가 멈추면 표가 안 나오고, 표가
        #    안 나오면 아무도 이 축을 다시 재지 않는다 — 멈춤도 값으로 적는다.
        return -2, f"timeout>{WS_PROBE_TIMEOUT_SEC}s"
    return result[0]


def _ws_probe_blocking(client: TestClient, url: str, cookies: dict[str, str]) -> tuple[int, str]:
    try:
        session = client.websocket_connect(url, cookies=cookies)
        ws = session.__enter__()
    except WebSocketDisconnect as exc:                # 핸드셰이크 «전» 거절(가드)
        return exc.code, str(exc.reason or "")
    except Exception as exc:                          # noqa: BLE001 — 거절 형태는 서버마다 다르다
        return -1, exc.__class__.__name__

    # 🔴 `receive()` 는 close 를 «예외로» 던지지 않고 메시지로 돌려준다. 그것을 모르고
    #    문맥 관리자를 그대로 빠져나가면, 이미 닫힌 세션에 테스트 클라이언트가 다시 close 를
    #    보내며 매달린다 — 측정기가 거기서 멈췄다(실측). 닫힘을 «읽었으면» 다시 닫지 않는다.
    closed = False
    try:
        message = ws.receive()
        if isinstance(message, dict) and message.get("type") == "websocket.close":
            closed = True
            return int(message.get("code", 1000)), str(message.get("reason") or "")
        return 101, "accepted-with-data"
    except WebSocketDisconnect as exc:
        closed = True
        return exc.code, str(exc.reason or "")
    finally:
        if not closed:
            # 🔴 정리를 «기다리지» 않는다. 이미 할 일을 끝낸 서버 쪽에 테스트 클라이언트가
            #    close 를 보내면 응답이 없어 매달릴 수 있고, 그 매달림은 측정값이 아니라
            #    계측기의 뒷정리다 — 값을 얻은 뒤의 정리가 판정을 삼키게 두지 않는다.
            threading.Thread(
                target=lambda: _quiet_exit(session), daemon=True
            ).start()


def _quiet_exit(session: Any) -> None:
    try:
        session.__exit__(None, None, None)
    except Exception:                                  # noqa: BLE001 — 뒷정리는 판정에 못 든다
        pass


def _call(
    client: TestClient, method: str, path: str, *, session: str | None, body_session: bool
) -> tuple[int, str]:
    """라우트 하나를 부른다 → `(상태코드, 오류코드)`. WS 는 close 코드를 상태로 쓴다.

    🔴 **매 호출 전에 쿠키 단지를 비운다.** 이 자리에서 실측이 한 번 거짓말했다: 표에는
       면제 라우트 `POST /api/sessions` 도 들어 있어서, 그것을 «재는» 요청이 응답으로 세션
       쿠키를 단지에 심었다. 그 뒤의 「무세션」 호출은 전부 세션을 들고 갔고, 표는 **가드가
       전혀 없다**고 말했다 — 계측기가 자기가 만든 상태를 측정한 것이다(계보: 계측기를
       측정에서 빼라). 세션은 오직 아래 `cookies` 로만 실린다.
    """
    url = _fill(path)
    client.cookies.clear()
    cookies = {SESSION_COOKIE: session} if session else {}

    if method == "WEBSOCKET":
        return _ws_probe(client, url, cookies)

    body = dict(_BODIES.get((method, path), {}))
    if body_session and session and (method, path) in _BODIES:
        body["sessionId"] = session
    kwargs: dict[str, Any] = {"cookies": cookies}
    if (method, path) in _BODIES:
        kwargs["json"] = body

    res = client.request(method, url, **kwargs)
    code = ""
    try:
        payload = res.json()
        if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
            code = str(payload["error"].get("code", ""))
    except ValueError:
        pass
    return res.status_code, code


# --- ① 라우트별 표 -----------------------------------------------------------------


def route_matrix(client: TestClient, app: FastAPI, report: Report, quiet: bool) -> None:
    rows = sorted(guard_table(app), key=lambda r: (r[2], r[1], r[0]))
    report.routes_scanned = len(rows)

    session = _new_session(client)
    if not quiet:
        print("① 라우트별 가드 표 — 세션 «없이» / 세션 «있고»")
        print(f"  {'모드':<10}{'메서드':<11}{'경로':<48}{'무세션':<20}유세션")

    for method, path, mode in rows:
        no_status, no_code = _call(client, method, path, session=None, body_session=False)
        yes_status, yes_code = _call(client, method, path, session=session, body_session=True)

        if mode == MODE_GUARDED:
            if method == "WEBSOCKET":
                blocked = no_status == WS_SESSION_REQUIRED
            else:
                blocked = no_status == 401 and no_code == "session_required"
            opened = yes_status != 401 and (method != "WEBSOCKET" or yes_status != WS_SESSION_REQUIRED)
            ok = blocked and opened
            why = "" if ok else (" ← 무세션이 막히지 않았다" if not blocked else " ← 유세션이 열리지 않았다")
        elif mode == MODE_FRAMEWORK:
            # 🔴 판정이 아니라 «기록»이다. 이 라우트들은 가드가 구조적으로 닿지 않는 자리이고
            #    (FastAPI 문서 표면), 그 집합이 변하면 부팅의 `audit_guard_coverage` 가 먼저
            #    운다. 여기서는 실제로 열려 있다는 사실만 표에 남긴다.
            ok = no_status != 401
            why = "" if ok else " ← 비가드 기록인데 401 이 났다"
        else:
            # 면제·읽기 예외 = 세션 «없이» 401 이 아니어야 한다(대조군 B 의 본체).
            ok = no_status != 401 and no_status != WS_SESSION_REQUIRED
            why = "" if ok else " ← 예외인데 세션을 요구했다"

        report.add(f"[{mode}] {method} {path}", ok, f"무세션 {no_status} {no_code}".strip())
        if not quiet:
            mark = "✔" if ok else "✘"
            print(
                f"  {mark} {mode:<8}{method:<11}{path:<48}"
                f"{str(no_status) + ' ' + no_code:<20}{yes_status} {yes_code}{why}"
            )


# --- ② 대조군 A — 예외 목록 «밖»의 새 라우트 ------------------------------------------


def control_outside_route(report: Report, quiet: bool) -> None:
    """🔴 **밖에서 온 표본.** 이 앱에 없던 라우트를 새로 붙여 가드가 무는지 본다.

    허용 목록 방식의 초록은 「목록에 있는 것만 통과한다」까지만 말한다. 목록 «밖»이 실제로
    막히는지는 목록 밖의 라우트를 만들어 봐야 알고, 그 라우트는 이 앱 코드 안에 없어야
    표본으로서 뜻이 있다 — 있으면 그건 다시 자기가 고른 표본이다.
    """
    probe = FastAPI(dependencies=[Depends(session_guard)])

    @probe.get("/api/newly-added-route")
    async def _newly_added() -> dict[str, str]:            # pragma: no cover — 가드가 막는다
        return {"reached": "yes"}

    @probe.websocket("/api/ws/newly-added")
    async def _newly_added_ws(websocket: Any) -> None:     # pragma: no cover — 가드가 막는다
        await websocket.accept()

    from app.errors import install_error_handlers
    from app.session_store import SessionStore

    # 🔴 오류 «형상»도 본체와 같게 세운다. 처음엔 이 줄이 없어서 대조군이 FastAPI 기본
    #    `{"detail": …}` 을 받았고, 측정기는 그것을 「가드가 안 걸렸다」로 읽었다 —
    #    대조군이 본체와 다른 환경이면 그 대조군은 본체를 시험한 것이 아니다.
    install_error_handlers(probe)
    probe.state.session_store = SessionStore()

    with TestClient(probe) as client:
        res = client.get("/api/newly-added-route")
        http_ok = res.status_code == 401 and res.json()["error"]["code"] == "session_required"
        report.add(
            "대조군A 목록 밖 신규 HTTP 라우트가 가드에 물린다",
            http_ok,
            f"{res.status_code} {res.json().get('error', {}).get('code', '')}",
        )

        ws_status, ws_reason = _ws_probe(client, "/api/ws/newly-added", {})
        ws_ok = ws_status == WS_SESSION_REQUIRED
        report.add("대조군A 목록 밖 신규 WS 라우트가 가드에 물린다", ws_ok, f"{ws_status} {ws_reason}")

    if not quiet:
        print("\n② 대조군 A — 예외 목록 «밖»의 새 라우트(이 앱에 없던 것)")
        for c in report.checks[-2:]:
            print(f"  {'✔' if c.ok else '✘'} {c.label} → {c.detail}")


# --- ③ 대조군 B — 예외가 «실제로» 열려 있는가 ----------------------------------------


def control_exceptions_open(client: TestClient, report: Report, quiet: bool) -> None:
    """면제·읽기 예외가 세션 없이 열리는가 — 「전부 401」인 서버를 반증한다."""
    if not quiet:
        print("\n③ 대조군 B — 예외 라우트가 세션 «없이» 열린다(전부 401 서버 반증)")
    for (method, path), why in list(GUARD_EXEMPT.items()) + list(READ_ONLY_EXCEPTIONS.items()):
        status, code = _call(client, method, path, session=None, body_session=False)
        ok = status != 401
        report.add(f"대조군B {method} {path} 무세션 개방", ok, f"{status} {code}".strip())
        if not quiet:
            print(f"  {'✔' if ok else '✘'} {method:<6}{path:<38}{status} {code}   ({why})")


# --- ④ 쿠키/본문 상충 · 형식 오류 ------------------------------------------------------


def control_conflict_and_format(client: TestClient, report: Report, quiet: bool) -> None:
    session = _new_session(client)
    other = _new_session(client)

    res = client.post(
        "/api/scenarios/GS-01/runs",
        cookies={SESSION_COOKIE: session},
        json={"sessionId": other, "mode": "replay"},
    )
    conflict_ok = res.status_code == 422 and res.json()["error"]["code"] == "invalid_request"
    report.add(
        "쿠키·본문 sessionId 상충 = 422 invalid_request",
        conflict_ok,
        f"{res.status_code} {res.json().get('error', {}).get('code', '')}",
    )

    res_same = client.post(
        "/api/scenarios/GS-01/runs",
        cookies={SESSION_COOKIE: session},
        json={"sessionId": session, "mode": "replay"},
    )
    # 🔴 **오탐 대조군**: 같은 값이면 422 가 «나오면 안 된다». 상충 검사가 「둘 다 있으면
    #    무조건 운다」로 짜여 있어도 위 검사는 초록이 된다.
    same_ok = res_same.status_code != 422 or res_same.json().get("error", {}).get(
        "code"
    ) != "invalid_request"
    report.add("쿠키·본문 sessionId 일치 = 상충 아님(오탐 대조)", same_ok, str(res_same.status_code))

    # 🔴 표본은 ASCII 로 둔다 — 한글 쿠키 값은 클라이언트가 «보내기 전에» 터져서, 서버 판정을
    #    재려던 검사가 계측기 오류로 바뀐다(실측으로 걸린 자리).
    res_bad = client.get("/api/runs/RUN-x", cookies={SESSION_COOKIE: "short"})
    fmt_ok = res_bad.status_code == 422 and res_bad.json()["error"]["code"] == "invalid_session_id"
    report.add(
        "형식 아닌 sessionId = 422 invalid_session_id(401 과 구분)",
        fmt_ok,
        f"{res_bad.status_code} {res_bad.json().get('error', {}).get('code', '')}",
    )

    res_unknown = client.get("/api/runs/RUN-x", cookies={SESSION_COOKIE: "aaaaaaaaaaaaaaaa"})
    unknown_ok = (
        res_unknown.status_code == 401
        and res_unknown.json()["error"]["code"] == "session_required"
    )
    report.add(
        "형식은 맞고 모르는 sessionId = 401 session_required",
        unknown_ok,
        f"{res_unknown.status_code} {res_unknown.json().get('error', {}).get('code', '')}",
    )

    if not quiet:
        print("\n④ 전달 규칙 — 상충 422 · 형식 422 · 미지 401")
        for c in report.checks[-4:]:
            print(f"  {'✔' if c.ok else '✘'} {c.label} → {c.detail}")


# --- ⑤ 소유권 매트릭스 ---------------------------------------------------------------


def ownership_matrix(client: TestClient, app: FastAPI, report: Report, quiet: bool) -> None:
    """A 의 자원을 B 가 볼 수 있는가 — 전건 404(존재 은닉)여야 한다."""
    a = _new_session(client)
    b = _new_session(client)

    store = app.state.run_store
    record = store.create(session_id=a, scenario_id="GS-01", incident_id="INC-probe", mode="live")
    record.status = "completed"
    record.workOrderDraftId = "WOD-probe0001"
    record.workOrderDraft = {
        "workOrderDraftId": "WOD-probe0001",
        "title": "probe",
        "procedures": [],
        "safetyMeasures": [{"id": "S-1"}],
        "parts": [],
        "evidenceIds": [],
        "gaps": [],
        "note": "",
        "approvalState": "pending",
        "incidentId": "INC-probe",
        "equipmentId": "EQ-probe",
        "failureModeId": "FM-probe",
    }
    rid, wid = record.runId, record.workOrderDraftId

    cases: list[tuple[str, str, str, dict[str, Any] | None]] = [
        ("GET", f"/api/runs/{rid}", "run 스냅샷", None),
        ("GET", f"/api/runs/{rid}/events", "run 이벤트", None),
        ("POST", f"/api/runs/{rid}/stop", "run 중지", None),
        ("GET", f"/api/graph/paths?byRun={rid}", "graph byRun", None),
        ("GET", f"/api/work-orders/{wid}", "초안 조회", None),
        ("PATCH", f"/api/work-orders/{wid}", "초안 편집", {"title": "x"}),
        ("POST", f"/api/work-orders/{wid}/approve", "초안 승인", None),
        ("POST", f"/api/work-orders/{wid}/reject", "초안 반려", None),
    ]

    if not quiet:
        print("\n⑤ 소유권 매트릭스 — A 가 만든 자원을 B 가 부른다(전건 404 은닉이어야 한다)")

    for method, url, label, body in cases:
        kwargs: dict[str, Any] = {"cookies": {SESSION_COOKIE: b}}
        if body is not None:
            kwargs["json"] = body
        res = client.request(method, url, **kwargs)
        code = res.json().get("error", {}).get("code", "") if res.headers.get(
            "content-type", ""
        ).startswith("application/json") else ""
        hidden = res.status_code == 404 and code == "not_found"
        report.add(f"소유권 B→A {label}", hidden, f"{res.status_code} {code}")
        if not quiet:
            print(f"  {'✔' if hidden else '✘'} B→A {label:<12} {method:<6} → {res.status_code} {code}")

    # 🔴 **오탐 대조군**: 주인 A 는 열려야 한다. 「전부 404」인 서버도 위 표는 통과한다.
    own = client.get(f"/api/runs/{rid}", cookies={SESSION_COOKIE: a})
    own_ok = own.status_code == 200
    report.add("소유권 A→A run 스냅샷 개방(오탐 대조)", own_ok, str(own.status_code))
    own_wo = client.get(f"/api/work-orders/{wid}", cookies={SESSION_COOKIE: a})
    own_wo_ok = own_wo.status_code == 200
    report.add("소유권 A→A 초안 조회 개방(오탐 대조)", own_wo_ok, str(own_wo.status_code))

    # WS — 🔴 남의 run 은 **없는 run 과 «같은 답»**(4404)이어야 한다. 다른 코드로 답하면
    #    close 코드가 존재 여부를 말해 버려, HTTP 에서 세운 은닉이 WS 에서 깨진다.
    ws_b = _ws_probe(client, f"/api/ws/runs/{rid}", {SESSION_COOKIE: b})
    report.add("소유권 B→A WS = 없는 run 과 같은 4404", ws_b[0] == 4404, f"{ws_b[0]} {ws_b[1]}")

    ws_missing = _ws_probe(client, "/api/ws/runs/RUN-nosuchrun", {SESSION_COOKIE: b})
    report.add(
        "대조 — 실제로 없는 run 도 4404(은닉이 성립하는 근거)",
        ws_missing[0] == 4404,
        f"{ws_missing[0]} {ws_missing[1]}",
    )

    # 🔴 오탐 대조 — 주인은 **실제로 이벤트를 받아야** 한다. 「4404 가 아니다」로 재면
    #    매달림(-2)·거절(-1)도 통과한다: 실측이 그 자리에서 한 번 거짓 초록을 냈다(기대값과
    #    맞은 것을 근거로 쓰지 않는다). 그래서 backlog 를 하나 심고 «받았는가»를 본다.
    record.append({"seq": 0, "type": "run.started", "runId": rid})
    ws_a = _ws_probe(client, f"/api/ws/runs/{rid}", {SESSION_COOKIE: a})
    report.add("소유권 A→A WS 로 이벤트 수신(오탐 대조)", ws_a[0] == 101, f"{ws_a[0]} {ws_a[1]}")

    if not quiet:
        for c in report.checks[-4:]:
            print(f"  {'✔' if c.ok else '✘'} {c.label} → {c.detail}")

    # --- 리셋: 자기 것만 사라진다 -------------------------------------------------
    b_record = store.create(
        session_id=b, scenario_id="GS-01", incident_id="INC-b", mode="live"
    )
    reset = client.post(f"/api/sessions/{a}/reset", cookies={SESSION_COOKIE: a})
    reset_ok = reset.status_code == 200 and reset.json() == {"ok": True}
    report.add("리셋 자기 세션 = 200 {ok:true}", reset_ok, str(reset.status_code))

    gone = client.get(f"/api/runs/{rid}", cookies={SESSION_COOKIE: a})
    report.add("리셋 후 A 의 run 이 사라졌다", gone.status_code == 404, str(gone.status_code))

    b_alive = client.get(f"/api/runs/{b_record.runId}", cookies={SESSION_COOKIE: b})
    # 🔴 **대조군**: 「리셋이 전부 지웠다」와 「자기 것만 지웠다」는 다른 사실이다.
    report.add("리셋이 B 의 run 은 건드리지 않았다", b_alive.status_code == 200, str(b_alive.status_code))

    foreign = client.post(f"/api/sessions/{b}/reset", cookies={SESSION_COOKIE: a})
    foreign_code = foreign.json().get("error", {}).get("code", "")
    report.add(
        "타 세션 리셋 = 404 은닉",
        foreign.status_code == 404 and foreign_code == "not_found",
        f"{foreign.status_code} {foreign_code}",
    )

    still = client.get(f"/api/runs/{b_record.runId}", cookies={SESSION_COOKIE: b})
    report.add("거절된 타 세션 리셋이 실제로 아무것도 안 지웠다", still.status_code == 200, str(still.status_code))

    if not quiet:
        print("\n⑥ 리셋 — 자기 세션만 · 타 세션 404 · 거절이 실제로 무효")
        for c in report.checks[-5:]:
            print(f"  {'✔' if c.ok else '✘'} {c.label} → {c.detail}")


# --- 세션 발급 ---------------------------------------------------------------------


def _new_session(client: TestClient) -> str:
    res = client.post("/api/sessions")
    if res.status_code != 200:
        raise RuntimeError(f"세션 발급 실패 {res.status_code} {res.text[:200]}")
    sid = str(res.json()["sessionId"])
    # 🔴 TestClient 는 쿠키를 기억한다. 세션 «둘»을 번갈아 쓰는 측정이라, 기억된 쿠키가
    #    조용히 섞이면 「B 로 불렀다」가 사실이 아니게 된다 — 매번 명시로만 싣는다.
    client.cookies.clear()
    return sid


# --- main ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="세션 가드·소유권 실측 (T3-1)")
    parser.add_argument("--quiet", action="store_true", help="표를 생략하고 판정만 낸다")
    args = parser.parse_args(argv)

    report = Report()
    app = create_app()
    print(f"세션 가드 실측 — 라우트 {len(guard_table(app))}개 · "
          f"면제 {len(GUARD_EXEMPT)} · 읽기 예외 {len(READ_ONLY_EXCEPTIONS)} · "
          f"프레임워크 비가드 {len(FRAMEWORK_UNGUARDED)}\n")

    with TestClient(app) as client:
        steps: list[Callable[[], None]] = [
            lambda: route_matrix(client, app, report, args.quiet),
            lambda: control_outside_route(report, args.quiet),
            lambda: control_exceptions_open(client, report, args.quiet),
            lambda: control_conflict_and_format(client, report, args.quiet),
            lambda: ownership_matrix(client, app, report, args.quiet),
        ]
        for step in steps:
            step()

    print(
        f"\n스캔  라우트 {report.routes_scanned}개 · 검사 {len(report.checks)}건 · "
        f"어긋남 {len(report.failures)}건"
    )
    if report.routes_scanned == 0:
        print("🔴 라우트를 하나도 보지 못했다 — 「위반 없음」이 아니라 측정기 고장이다")
    for c in report.failures:
        print(f"  ✘ {c.label} → {c.detail}")
    print(f"판정  {'PASS' if report.ok else 'FAIL'}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:                                   # noqa: BLE001
        print(f"측정 불가 — {exc.__class__.__name__}: {exc}")
        sys.exit(2)
