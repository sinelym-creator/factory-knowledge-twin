"""_colocation — 판정 앞에 오는 «귀속 증명» (검증 좌석 공용 전처리 · Q-42 · Q-40 계보).

🔴 **무엇을 막는가.** 드릴은 `FKT_API_BASE` 가 가리키는 서버를 재면서, 그 서버가 «내 트리»를
   읽는지는 묻지 않았다. 한 번 물렸다 — `replay_fixture_drill` F-11 이 「fixture 를 치웠는데
   200」을 냈고 그것이 「서버가 없는 것을 있다고 말한다」로 읽혔다. 실측하니 서버는 **다른
   트리의 파일**을 읽고 있었다. 200 은 서버의 답이 아니라 **배치의 답**이었고, 빨강은 대상의
   것이 아니라 그물의 것이었다(판정문 `evidence/q40-replay-fixture-attribution.md`).

🔴 **내용 대조로는 못 가른다.** 트리마다 같은 커밋의 같은 파일이라 바이트가 같다 — 남의 트리를
   읽어도 왕복 축은 전부 초록이다. 빈 결과끼리의 일치가 일치가 아니듯, **같은 파일끼리의
   일치도 귀속을 증명하지 않는다.**

🔴 **그래서 «자극»으로 묻는다.** replay fixture 는 이 서버가 리포에서 **직접 읽는 유일한
   자산**이다. 그 한 칸을 고쳐 값이 재생본에 나오면, 드릴이 무엇을 재든 「저 서버가 이 트리를
   읽는다」가 한 문장으로 선다. 안 나오면 그 실행의 어떤 색도 대상의 것이 아니므로
   **`exit 2`(측정 불가)** 다 — FAIL 이 아니다. 「아직 안 만들었다」를 결함으로 세지 않는 것과
   같은 규율이다.

    import _colocation
    _colocation.require(API_BASE)      # 서버를 만나기 «전» 한 줄

부작용: **replay run 1건**이 생긴다(세션 sandbox 데이터 · SSOT 아님). run 을 «세는» 축이 있는
드릴은 이 +1 을 기준선에 넣어야 한다.

한계: 이 전처리는 fixture 를 «잠시 고쳤다 되돌린다». 그래서 **프로세스 간 잠금**을 쥐고 돌며,
잠금을 못 얻으면 기다리다 죽지 않고 `exit 2` 로 나간다 — 드릴을 병렬로 돌리면 한쪽이 측정
불가가 된다(직렬로 돌리라는 뜻이다).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 가드 착지 후 세션을 실어 준다(미착지면 엄격 no-op)

# 🔴 녹화본의 원값과 겹치지 않는 표지. 겹치면 「바뀌었다」를 못 본다.
SENTINEL_TS = "2020-01-02T03:04:05Z"
LOCK_TIMEOUT_S = 90
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")


class Unproven(RuntimeError):
    """귀속을 증명하지 못했다 — 결과가 아니라 «측정 불가»다."""


def _server_repo() -> Path:
    return Path(os.environ.get("FKT_SERVER_REPO", str(Path(__file__).resolve().parents[2])))


def _fixture() -> Path:
    return _server_repo() / "data" / "replay" / "gs-01.events.jsonl"


def _call(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    body, carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(carry)
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise Unproven(f"{base} 에 닿지 못했다: {exc}") from exc


def _acquire(target: Path):
    """프로세스 간 잠금 — 스레드 락이 아니다. 못 얻으면 «기다리다 죽지» 않고 측정 불가로 나간다."""
    key = hashlib.sha256(str(target).encode("utf-8")).hexdigest()[:16]
    lock = Path(tempfile.gettempdir()) / f"fkt-colocation-{key}.lock"
    deadline = time.time() + LOCK_TIMEOUT_S
    while True:
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"pid {os.getpid()} @ {time.time():.0f}".encode("utf-8"))
            os.close(fd)
            return lock
        except FileExistsError:
            if time.time() >= deadline:
                raise Unproven(
                    f"귀속 잠금을 {LOCK_TIMEOUT_S}s 동안 못 얻었다({lock}). 다른 드릴이 같은 "
                    f"fixture 를 흔드는 중이거나, 죽은 실행이 잠금을 남겼다 — 직렬로 돌리거나 "
                    f"그 파일을 지워라. 측정 불가."
                ) from None
            time.sleep(0.5)


def _replay_ts(base: str) -> str | None:
    """재생본 첫 이벤트의 `ts` — 서버가 «지금 읽은» fixture 의 값이다."""
    status, created = _call(base, "POST", f"/api/scenarios/{SCENARIO}/runs",
                            {"sessionId": "levi2-colocation", "mode": "replay"})
    if status == 501:
        raise Unproven(
            "이 서버는 replay 를 열지 않는다 — fixture 자극으로 귀속을 물을 수 없다. 측정 불가."
        )
    if status != 200 or not isinstance(created, dict):
        raise Unproven(f"귀속 탐침의 replay 생성이 {status} 를 냈다: {str(created)[:160]}")
    run_id = created["runId"]
    deadline = time.time() + 60
    while time.time() < deadline:
        _, snap = _call(base, "GET", f"/api/runs/{run_id}")
        if isinstance(snap, dict) and snap.get("status") != "running":
            break
        time.sleep(0.5)
    status, events = _call(base, "GET", f"/api/runs/{run_id}/events")
    if status != 200 or not isinstance(events, list) or not events:
        raise Unproven(f"귀속 탐침의 /events 가 {status} 를 냈다")
    return events[0].get("ts")


def prove(api_base: str | None = None, *, quiet: bool = False) -> None:
    """서버가 «이 트리»의 fixture 를 읽는지 증명한다. 못 하면 `Unproven`."""
    base = api_base or os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
    fixture = _fixture()
    if not fixture.is_file():
        raise Unproven(f"귀속 탐침의 정본이 없다: {fixture}")

    original = fixture.read_bytes()
    rows = [json.loads(line) for line in original.decode("utf-8").splitlines() if line.strip()]
    if not rows:
        raise Unproven("귀속 탐침의 정본이 0줄이다")
    if rows[0].get("ts") == SENTINEL_TS:
        raise Unproven("자극 표지가 녹화본의 원값과 같다 — 표지를 바꿔라")

    lock = _acquire(fixture)
    try:
        seen: str | None = None
        try:
            planted = [dict(r) for r in rows]
            planted[0]["ts"] = SENTINEL_TS
            fixture.write_bytes(
                ("\n".join(json.dumps(r, ensure_ascii=False) for r in planted) + "\n").encode("utf-8")
            )
            seen = _replay_ts(base)
        finally:
            # 🔴 되감기는 «어떻게 죽든» 돈다(KeyboardInterrupt 포함). 되돌아왔다는 것까지가 이 단이다.
            fixture.write_bytes(original)
            if hashlib.sha256(fixture.read_bytes()).hexdigest() != hashlib.sha256(original).hexdigest():
                raise Unproven("자극 되감기 실패 — fixture 를 원상으로 되돌리지 못했다")
    finally:
        lock.unlink(missing_ok=True)

    if seen != SENTINEL_TS:
        raise Unproven(
            f"귀속 미증명 — 내 fixture 를 고쳤는데 재생본은 ts={seen!r} 를 냈다. "
            f"{base} 의 서버가 읽는 리포는 내가 재는 트리가 아니다"
            f"(FKT_SERVER_REPO={_server_repo()}). 측정 불가."
        )
    if not quiet:
        print(f"  귀속 증명  내 fixture 의 손질이 재생본에 나온다 — {base} 는 이 트리를 읽는다")


def require(api_base: str | None = None, *, quiet: bool = False) -> None:
    """드릴이 한 줄로 부르는 자리. 증명 못 하면 그 자리에서 `exit 2`(측정 불가)."""
    try:
        prove(api_base, quiet=quiet)
    except Unproven as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    # 자기 검증: 맞춘 트리면 통과, 어긋난 트리면 exit 2.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    require()
    print("귀속 증명 통과 — 이 서버는 이 트리를 읽는다")
