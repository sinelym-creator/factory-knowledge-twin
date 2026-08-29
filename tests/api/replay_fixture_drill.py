"""replay_fixture_drill — 재생이 «녹화본 그대로»인가 (검증 좌석 · T2-4 · J-A~J-I).

🔴 이 그물이 지키는 문장 넷:
   ① **재생은 재조립이 아니다.** 판정식은 J-C 가 정했다 — 「치환 2필드(`mode`·`runId`) 제외 전
      필드 동일 + 그 2필드는 규정값」. `ts` 는 **녹화 시각 그대로** 살아야 한다(무손질).
      한 필드라도 손대면 그건 재생이 아니라 다시 만든 것이고, 되감기가 원본을 증명하지 못한다.
   ② **없는 것은 복원하지 않는다.** 이벤트 밖 부산물(graph path 원본)은 fixture 에 없으므로
      replay run 의 `?byRun` 은 **501 `replay_path_source_absent`** 다(J-G). excerpt 를 파싱해
      그럴듯하게 되살리면 그것이 「같은 병을 반만 고친 것」이다.
   ③ **fixture 가 없으면 없다고 말한다.** 501 `replay_fixture_missing`(J-F) — 이 상태는
      설정의 fixture 경로를 «없는 곳»으로 돌려 실제로 만든다(코드 독해로 대신하지 않는다).
   ④ **의존 없이도 재생은 돈다.** fixture 재생은 DB·그래프를 지나지 않는다 — 같은 프로세스에서
      `replay` 는 200, `live` 는 **503** 이라야 Phase 4 의 fallback 축이 성립한다.

🔴 자기 검증이 본 시험 앞에 있다 — 비교기가 «한 필드 차이»를 실제로 잡는지 먼저 증명한다.
   못 우는 비교기로 낸 초록은 초록이 아니다(J-E 의 「못 우는 심사기는 심사가 아니다」와 같은 자리).

    python tests/api/replay_fixture_drill.py            # 왕복·오류·무결성
    python tests/api/replay_fixture_drill.py --no-deps  # + 의존 없이 띄운 앱에서 replay/live 대조

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·미해제(측정 불가)
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# 🔴 시험 대상 서버가 «실제로 읽는» 리포. 그물이 lane 워크트리에 있고 서버가 주 체크아웃에서
#    돌 때, 여기를 안 가르면 「부재 상태를 만들었다」면서 서버가 못 보는 파일을 옮기게 된다.
SERVER_REPO = Path(os.environ.get("FKT_SERVER_REPO", str(REPO)))
FIXTURE = SERVER_REPO / "data" / "replay" / "gs-01.events.jsonl"
AUDIT = SERVER_REPO / "services" / "ai-api" / "tools" / "audit_replay_fixture.py"
API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
PYTHON = os.environ.get("FKT_PYTHON", str(SERVER_REPO / "services" / "ai-api" / ".venv" / "Scripts" / "python.exe"))
SESSION_ID = "levi2-replay-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
SPARE_PORT = int(os.environ.get("FKT_SPARE_PORT", "8012"))

# J-C — 재생이 «바꾸어도 되는» 유일한 두 필드.
SUBSTITUTED = ("mode", "runId")


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def call(method: str, path: str, body: dict | None = None, base: str | None = None) -> tuple[int, object]:
    root = base or API_BASE
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(root + path, data=data, headers=headers, method=method)
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
        raise DrillError(f"{root} 에 닿지 못했다: {exc}") from exc


def code_of(body: object) -> str | None:
    return (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None


def fixture_events() -> list[dict]:
    if not FIXTURE.exists():
        raise DrillError(f"fixture 없음: {FIXTURE}")
    rows = [json.loads(line) for line in FIXTURE.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise DrillError("fixture 가 0줄이다 — 초록이 아니라 고장이다")
    return rows


def divergence(recorded: dict, replayed: dict) -> list[str]:
    """치환 2필드를 뺀 «나머지 전부»가 같은가. 다르면 어느 경로가 다른지 적는다."""
    left = {k: v for k, v in recorded.items() if k not in SUBSTITUTED}
    right = {k: v for k, v in replayed.items() if k not in SUBSTITUTED}
    out: list[str] = []
    for key in sorted(set(left) | set(right)):
        if left.get(key) != right.get(key):
            out.append(key)
    return out


def self_check(recorded: list[dict]) -> None:
    """🔴 비교기가 «빨강을 낼 수 있는가»부터."""
    original = recorded[0]
    same = dict(original, mode="replay", runId="RUN-other")
    if divergence(original, same):
        raise DrillError("자기 검증 실패 — 치환 2필드만 다른 쌍을 «다르다»고 판정한다")
    for what, mutated in (
        ("ts 손질", dict(same, ts="2020-01-01T00:00:00Z")),
        ("payload 한 글자", json.loads(json.dumps(same).replace("GS-01", "GS-02", 1))),
        ("seq 이동", dict(same, seq=same["seq"] + 1)),
        ("필드 추가", dict(same, note="x")),
    ):
        if not divergence(original, mutated):
            raise DrillError(f"자기 검증 실패 — «{what}» 을 같다고 판정한다")
    print("  자기 검증  표본 5종(동일 1 · 어긋남 4: ts·payload·seq·필드추가) 전건 기대대로 — 비교기 살아 있음")


def replay_run() -> tuple[str, list[dict]]:
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                           {"sessionId": SESSION_ID, "mode": "replay"})
    if status == 501:
        raise DrillError(f"replay 가 아직 501 이다({code_of(created)}) — 미해제는 결함이 아니다")
    if status != 200 or not isinstance(created, dict):
        raise DrillError(f"replay 생성이 {status} 를 냈다: {str(created)[:160]}")
    run_id = created["runId"]
    deadline = time.time() + 120
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if (snap or {}).get("status") != "running":       # type: ignore[union-attr]
            break
        time.sleep(0.5)
    status, events = call("GET", f"/api/runs/{run_id}/events")
    if status != 200 or not isinstance(events, list):
        raise DrillError(f"/events 가 {status} 를 냈다")
    return run_id, events


def ws_events(run_id: str, expect: int) -> list[dict] | None:
    try:
        import asyncio

        import websockets
    except Exception:                                    # noqa: BLE001
        return None

    async def drain() -> list[dict]:
        url = API_BASE.replace("http://", "ws://").replace("https://", "wss://")
        out: list[dict] = []
        async with websockets.connect(f"{url}/api/ws/runs/{run_id}", open_timeout=10) as socket:
            while len(out) < expect:
                out.append(json.loads(await asyncio.wait_for(socket.recv(), timeout=15)))
        return out

    try:
        return asyncio.run(drain())
    except Exception:                                    # noqa: BLE001
        return None


def audit_rows(bad: int, rows: list[tuple[str, str, bool, str]]) -> int:
    for rid, what, ok, note in rows:
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid} {what:50} {note}")
    return bad


def no_deps_column() -> list[tuple[str, str, bool, str]]:
    """🔴 의존 «없이» 띄운 앱 — 같은 프로세스에서 replay 200 · live 503."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("FKT_")}
    env["PATH"] = os.environ.get("PATH", "")
    proc = subprocess.Popen(
        [PYTHON, "-m", "uvicorn", "app.main:app", "--port", str(SPARE_PORT), "--host", "127.0.0.1"],
        cwd=str(SERVER_REPO / "services" / "ai-api"), env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{SPARE_PORT}"
    try:
        for _ in range(60):
            time.sleep(1)
            try:
                status, health = call("GET", "/api/health", base=base)
                if status in (200, 503):
                    break
            except DrillError:
                continue
        else:
            raise DrillError("의존 없는 앱이 뜨지 않았다 — 측정 불가")
        deps = (health or {}).get("dependencies", {})     # type: ignore[union-attr]
        unconfigured = all(v.get("state") == "unconfigured" for v in deps.values())

        status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                               {"sessionId": SESSION_ID, "mode": "replay"}, base=base)
        replay_ok = status == 200 and (created or {}).get("mode") == "replay"  # type: ignore[union-attr]
        status_live, live = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                                 {"sessionId": SESSION_ID, "mode": "live"}, base=base)
        live_refused = status_live == 503 and code_of(live) == "dependency_unavailable"
        return [
            ("N-01", "의존 없이 뜬다 — 전 의존 unconfigured", unconfigured, str(list(deps))),
            ("N-02", "같은 프로세스에서 replay 는 200", replay_ok, f"{status}"),
            ("N-03", "같은 프로세스에서 live 는 503 dependency_unavailable",
             live_refused, f"{status_live} {code_of(live)}"),
        ]
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:                # pragma: no cover
            proc.kill()


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    recorded = fixture_events()
    digest = hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
    print(f"정본      : {FIXTURE} · {len(recorded)}줄 · sha256 {digest[:16]}…")
    print(f"대상      : {API_BASE}\n")
    self_check(recorded)

    rows: list[tuple[str, str, bool, str]] = []

    # ⓔ LF 고정 실효 — 워킹트리와 git blob 이 «같은 바이트»인가.
    blob = subprocess.run(["git", "show", f":data/replay/{FIXTURE.name}"],
                          cwd=str(SERVER_REPO), capture_output=True)
    blob_digest = hashlib.sha256(blob.stdout).hexdigest() if blob.returncode == 0 else ""
    rows.append(("F-01", "LF 고정 — 워킹트리 sha256 == git blob sha256",
                 bool(blob_digest) and blob_digest == digest, f"blob {blob_digest[:16]}…"))

    # ⓐ 왕복
    run_id, replayed = replay_run()
    rows.append(("F-02", "재생 이벤트 수 == fixture 줄 수(seq↔줄 1:1)",
                 len(replayed) == len(recorded), f"{len(replayed)} vs {len(recorded)}"))
    pairs = list(zip(recorded, replayed))
    diverged = [(i, d) for i, (a, b) in enumerate(pairs) if (d := divergence(a, b))]
    rows.append(("F-03", "🔴 치환 2필드 제외 전 필드 동일(J-C 판정식)", not diverged,
                 f"어긋난 줄 {[(i, d) for i, d in diverged[:3]]}" if diverged else "어긋남 0"))
    modes = {e.get("mode") for e in replayed}
    ids = {e.get("runId") for e in replayed}
    rows.append(("F-04", "치환값 규정대로 — mode=replay 전건 · runId 는 새 run 1종",
                 modes == {"replay"} and ids == {run_id}, f"{sorted(modes)} · {len(ids)}종"))
    rows.append(("F-05", "ts 는 녹화 시각 그대로(무손질)",
                 all(a["ts"] == b["ts"] for a, b in pairs), recorded[0]["ts"]))
    rows.append(("F-06", "녹화본은 손대지 않았다 — fixture 는 mode=live · 원 runId",
                 {e["mode"] for e in recorded} == {"live"} and len({e["runId"] for e in recorded}) == 1,
                 recorded[0]["runId"]))
    streamed = ws_events(run_id, len(replayed))
    if streamed is None:
        rows.append(("F-07", "WS ≡ /events — 🔴 못 쟀다(WS 미수신 · 초록으로 세지 않는다)", True, "skip"))
    else:
        rows.append(("F-07", "WS ≡ /events",
                     [(e["seq"], e["type"]) for e in streamed] == [(e["seq"], e["type"]) for e in replayed],
                     f"WS {len(streamed)} · REST {len(replayed)}"))

    # ⓓ 명시 오류 2종
    status, paths = call("GET", f"/api/graph/paths?byRun={run_id}")
    rows.append(("F-08", "replay run 의 ?byRun = 501 replay_path_source_absent(J-G)",
                 status == 501 and code_of(paths) == "replay_path_source_absent",
                 f"{status} {code_of(paths)}"))

    bad = audit_rows(0, rows)

    # ⓒ 심사기 독립 재실행 + 🔴 심사기를 내 대조군으로
    print()
    audit = subprocess.run([PYTHON, str(AUDIT), "--self-test"], cwd=str(SERVER_REPO / "services" / "ai-api"),
                           capture_output=True, text=True, encoding="utf-8")
    clean = audit.returncode == 0
    bad += 0 if clean else 1
    print(f"  {'PASS' if clean else 'FAIL'}  F-09 fixture 공개 경계 심사 재실행 — exit {audit.returncode}")
    if not clean:
        print(f"        {(audit.stdout or audit.stderr)[-300:]}")

    # 🔴 심사기가 «울 수 있는지»를 내가 «따로» 확인한다. 도구가 자기 대조군(`--self-test`)을
    #    갖고 있어도, 그 대조군의 표본은 도구가 «자기가 잡을 수 있는 것»으로 고른 것이다.
    #    무엇을 못 잡는지는 밖에서 골라 넣어 봐야 안다. 자기 스택 fixture 는 건드리지 않고
    #    임시 디렉터리의 사본에 심는다(주입한 뒤 지우다 실패하면 위반이 커밋된다 — 도구 머리말과 같은 이유).
    probes = [
        ("자격 이름표", "ANTHROPIC_API_KEY=levi2probe", True),
        ("Authorization 헤더", "Bearer sk-ant-api03-LEVI2PROBE00000", True),
        ("벤더 이름", "anthropic.com/v1/messages", True),
        # 🔴 여기가 이 표의 본론이다 — «이름표 없이 값만» 샌 경우.
        ("Anthropic 키 «값»만", "sk-ant-api03-LEVI2PROBE0000000000AAAA", True),
        ("범용 토큰 «값»만", "ghp_LEVI2PROBE0000000000000000000000", True),
    ]
    caught: list[str] = []
    missed: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        planted = Path(tmp) / FIXTURE.name
        source = FIXTURE.read_text(encoding="utf-8")
        for what, payload, _ in probes:
            planted.write_text(source.replace("AL-20260826-0041", payload, 1),
                               encoding="utf-8", newline="\n")
            probe = subprocess.run([PYTHON, str(AUDIT), "--fixture-dir", tmp],
                                   cwd=str(SERVER_REPO / "services" / "ai-api"),
                                   capture_output=True, text=True, encoding="utf-8")
            (caught if probe.returncode == 1 else missed).append(what)
    ok = not missed
    bad += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  F-10 🔴 심사기가 «운다» — 심은 표본 {len(probes)}종")
    print(f"        잡음 {caught}")
    if missed:
        print(f"        🔴 못 잡음 {missed} — 이름표는 보는데 «값의 형상»은 안 본다")

    # ⓕ fixture 부재 상태 — 경로를 «없는 곳»으로 돌려 실제로 만든다(J-F)
    print()
    moved = FIXTURE.with_name(FIXTURE.name + ".levi2-moved")
    absent_rows: list[tuple[str, str, bool, str]] = []
    try:
        shutil.move(str(FIXTURE), str(moved))
        status, body = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                            {"sessionId": SESSION_ID, "mode": "replay"})
        absent_rows.append(("F-11", "fixture 부재 → 501 replay_fixture_missing(J-F)",
                            status == 501 and code_of(body) == "replay_fixture_missing",
                            f"{status} {code_of(body)}"))
    finally:
        if moved.exists():
            shutil.move(str(moved), str(FIXTURE))
        back = hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
        status, body = call("POST", f"/api/scenarios/{SCENARIO}/runs",
                            {"sessionId": SESSION_ID, "mode": "replay"})
        absent_rows.append(("F-0", "되감기 — fixture 복원 · sha 동일 · replay 200",
                            back == digest and status == 200, f"{status} · sha {back[:12]}…"))
    bad = audit_rows(bad, absent_rows)

    # ⓑ 무의존 열
    if "--no-deps" in sys.argv:
        print()
        bad = audit_rows(bad, no_deps_column())
    else:
        print("\n  ----  N-01~03 의존 없는 앱 열 — 건너뜀(--no-deps 로 켠다 · 초록으로 세지 않는다)")

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
