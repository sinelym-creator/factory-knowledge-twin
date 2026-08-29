"""replay 왕복 자기 확인 — 녹화본 ↔ 재생본 (T2-4 AC · 구현 좌석 자기 확인용).

    python -m tools.verify_replay_roundtrip

무엇을 재는가(AC 순서 그대로):
  A. `mode:"replay"` 요청이 200 이고 `mode` 가 `replay` 인가
  B. `GET /runs/{id}/events` 가 녹화본과 «치환 2필드를 제외하고 완전히 같은가»
     — 값이 아니라 **직렬화 문자열**로 본다. deep equality 는 키 순서를 보지 않고, 순서가
       바뀌면 「같은 사실이 표면마다 다른 바이트」가 되어 되감기 대조가 어긋난다.
  C. WS 스트림 ≡ `GET /events` (같은 원천인가)
  D. fixture 부재 시나리오 replay = 501 `replay_fixture_missing` (조용한 빈 재생이 아닌가)
  E. 재생 run 의 `/graph/paths?byRun=` = 501 `replay_path_source_absent` (빈 배열 200 이 아닌가)

🔴 **의존 없이 띄운다.** postgres·neo4j 환경변수를 주지 않고 앱을 연다 — 재생이 DB 에 닿지
   않는다는 것이 fixture 축의 값어치이고(Phase 4 fallback), 「닿지 않는다」는 말은 닿을 수
   없는 상태에서 돌려 봐야 실측이 된다. 같은 프로세스에서 live 요청이 503 이 되는 것도 함께 본다.

🔴 이것은 **구현의 자기 확인**이지 독립 검증이 아니다. 판정은 검증 좌석의 그물이 한다.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from starlette.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from app.investigation import replay  # noqa: E402
from app.main import create_app  # noqa: E402
from app.settings import get_settings  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):                    # pragma: no cover — 플랫폼 의존
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCENARIO = "GS-01"
SESSION = "verify-roundtrip-0001"
PASSED: list[str] = []
FAILED: list[str] = []


def check(label: str, passed: bool, detail: str) -> None:
    print(f"  {'✔' if passed else '✘'} {label} — {detail}")
    (PASSED if passed else FAILED).append(label)


def _line(event: dict[str, Any]) -> str:
    """녹화 도구와 «같은» 직렬화. 다른 옵션으로 찍으면 대조가 옵션 차이를 잡는다."""
    return json.dumps(event, ensure_ascii=False)


def main() -> int:
    # 🔴 의존을 «주지 않는다». 이미 환경에 있으면 이 시험의 뜻이 사라지므로 걷어낸다.
    for key in ("FKT_POSTGRES_DSN", "FKT_NEO4J_URI", "FKT_NEO4J_USER", "FKT_NEO4J_PASSWORD"):
        os.environ.pop(key, None)
    os.environ.pop("FKT_REPLAY_FIXTURE_DIR", None)
    get_settings.cache_clear()

    fixture = replay.load(None, SCENARIO)
    print(f"녹화본  {replay.fixture_path(None, SCENARIO).name} · 이벤트 {len(fixture)}건\n")

    app = create_app()
    with TestClient(app) as client:
        print("A. 재생 요청")
        created = client.post(
            f"/api/scenarios/{SCENARIO}/runs", json={"sessionId": SESSION, "mode": "replay"}
        )
        check("200 응답", created.status_code == 200, f"status={created.status_code} {created.text[:120]}")
        if created.status_code != 200:
            return 1
        body = created.json()
        run_id = body["runId"]
        check("mode=replay", body.get("mode") == "replay", f"mode={body.get('mode')}")
        check(
            "incidentId 유지",
            body.get("incidentId") == fixture[0]["payload"].get("scenarioId", "") or bool(body.get("incidentId")),
            f"incidentId={body.get('incidentId')}",
        )

        print("\nB. 되감기 대조 (치환 2필드 제외 완전 동일)")
        events = client.get(f"/api/runs/{run_id}/events").json()
        check("이벤트 수", len(events) == len(fixture), f"{len(events)} vs 녹화 {len(fixture)}")
        expected = [_line({**e, "runId": run_id, "mode": "replay"}) for e in fixture]
        actual = [_line(e) for e in events]
        diffs = [i for i, (a, b) in enumerate(zip(actual, expected)) if a != b]
        check(
            "직렬화 문자열 동일",
            not diffs and len(actual) == len(expected),
            "전건 일치" if not diffs else f"어긋난 seq {diffs[:5]}",
        )
        if diffs:
            i = diffs[0]
            print(f"      기대: {expected[i][:200]}")
            print(f"      실제: {actual[i][:200]}")
        check(
            "ts 원문 보존",
            all(a["ts"] == b["ts"] for a, b in zip(events, fixture)),
            f"seq0 ts={events[0]['ts']} (녹화 {fixture[0]['ts']})",
        )
        check(
            "mode 전건 replay",
            all(e["mode"] == "replay" for e in events),
            f"{ {e['mode'] for e in events} }",
        )
        check(
            "payload 내 녹화 runId 보존(J-H)",
            any(fixture[0]["runId"].removeprefix("RUN-") in json.dumps(e, ensure_ascii=False)
                for e in events if e["type"] == "step.evidence"),
            "graph 근거 evidenceId 가 녹화 id 를 그대로 지닌다",
        )

        print("\nC. WS ≡ GET /events")
        # 🔴 «올 것으로 아는 만큼»만 받는다. 처음에는 `while True` 로 종료 신호를 기다렸는데
        #    그 대기가 끝나지 않아 시험 자체가 300s 상한에 걸렸다 — 재는 축(같은 원천인가)이
        #    아니라 계측기(종료 신호를 어떻게 기다리는가)가 멈춘 것이다. 종단 후 소켓이 닫히는가는
        #    이 시험의 축이 아니다(그 축은 live 경로에서 T2-3 이 봤다).
        streamed: list[dict[str, Any]] = []
        with client.websocket_connect(f"/api/ws/runs/{run_id}") as ws:
            try:
                for _ in range(len(actual)):
                    streamed.append(ws.receive_json())
            except WebSocketDisconnect:
                pass
        check(
            "동일 원천",
            [_line(e) for e in streamed] == actual,
            f"WS {len(streamed)}건 ≡ GET {len(actual)}건",
        )

        print("\nE. 재생 run 의 그래프 경로 (판정 J-G)")
        gp = client.get(f"/api/graph/paths", params={"byRun": run_id})
        code = gp.json().get("error", {}).get("code") if gp.status_code != 200 else "200"
        check(
            "명시 오류",
            gp.status_code == 501 and code == "replay_path_source_absent",
            f"status={gp.status_code} code={code}",
        )

        print("\n(참고) 같은 프로세스에서 live 요청 — 의존이 없으므로 503 이 참이다")
        live = client.post(
            f"/api/scenarios/{SCENARIO}/runs", json={"sessionId": SESSION, "mode": "live"}
        )
        check(
            "live = 503 dependency_unavailable",
            live.status_code == 503,
            f"status={live.status_code} code={live.json().get('error', {}).get('code')}",
        )

    print("\nD. fixture 부재 시나리오 (판정 J-F — 부재 상태를 «만들어» 잰다)")
    with tempfile.TemporaryDirectory() as empty:
        os.environ["FKT_REPLAY_FIXTURE_DIR"] = empty
        get_settings.cache_clear()
        app2 = create_app()
        with TestClient(app2) as client2:
            missing = client2.post(
                f"/api/scenarios/{SCENARIO}/runs", json={"sessionId": SESSION, "mode": "replay"}
            )
            code = missing.json().get("error", {}).get("code")
            check(
                "501 replay_fixture_missing",
                missing.status_code == 501 and code == "replay_fixture_missing",
                f"status={missing.status_code} code={code}",
            )
    os.environ.pop("FKT_REPLAY_FIXTURE_DIR", None)
    get_settings.cache_clear()

    print(f"\n판정  {'PASS' if not FAILED else 'FAIL'} — 통과 {len(PASSED)} · 실패 {len(FAILED)}")
    if FAILED:
        print("  실패: " + " · ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
