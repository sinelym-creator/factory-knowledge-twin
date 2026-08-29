"""이벤트 루프 점유 실측 (T1-8 AC 「blocking 0 — 이벤트 루프 점유 실측 1건」).

    python -m tools.measure_loop_lag                 # 유휴 기준선 ↔ 부하 중 비교
    python -m tools.measure_loop_lag --blocking-demo # 대조군: 일부러 루프를 막아 본다

무엇을 재는가: 10ms 주기로 깨어나기로 «약속한» 태스크가 실제로 언제 깨어났는지, 그 차이
(lag)를 모은다. 루프를 막는 호출이 끼면 그 시간만큼 이 태스크가 늦게 깨어나므로, lag 분포가
곧 「루프가 막혔는가」의 답이다.

🔴 **유휴 기준선을 먼저 잰다.** Windows 의 기본 타이머 해상도는 10ms 보다 굵어서, 부하가
   전혀 없어도 lag 이 수 ms 씩 나온다. 그 값을 모르고 부하 중 수치만 보면 플랫폼의 타이머
   특성을 「루프 점유」로 읽는다. 판정은 언제나 «기준선 대비 증가»로 한다.

🔴 서버를 띄우고 밖에서 때리지 않는다. ASGI 앱을 같은 프로세스·같은 루프에서 호출해야
   네트워크 스택 지연이 섞이지 않아 «루프 점유»만 분리해 볼 수 있다.

🔴 대조군을 함께 둔다. lag 이 안 늘었다는 사실은 측정이 민감할 때만 의미가 있다 —
   `--blocking-demo` 는 핸들러에 `time.sleep` 을 끼워 같은 측정이 실제로 커지는지 보인다.
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import urllib.parse
import time
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

TICK_SEC = 0.01


async def _collect_lags(stop: asyncio.Event, lags: list[float]) -> None:
    loop = asyncio.get_running_loop()
    while not stop.is_set():
        before = loop.time()
        await asyncio.sleep(TICK_SEC)
        lags.append((loop.time() - before - TICK_SEC) * 1000.0)


async def _measure(duration: float, load: "callable | None") -> list[float]:
    """duration 초 동안 lag 을 모은다. load 가 있으면 그 부하를 함께 돌린다."""
    lags: list[float] = []
    stop = asyncio.Event()
    ticker = asyncio.create_task(_collect_lags(stop, lags))
    driver = asyncio.create_task(load(stop)) if load else None
    await asyncio.sleep(duration)
    stop.set()
    await ticker
    if driver is not None:
        await driver
    return lags


def _summary(lags: list[float]) -> tuple[float, float, float]:
    if not lags:
        return (0.0, 0.0, 0.0)
    ordered = sorted(lags)
    p95 = ordered[min(int(len(ordered) * 0.95), len(ordered) - 1)]
    return (statistics.median(ordered), p95, ordered[-1])


async def run(duration: float, concurrency: int, blocking_demo: bool, retrieval: bool,
              strategies: list[str], reading: str | None = None, investigation: bool = False) -> int:
    import httpx

    from app.main import create_app

    app = create_app()

    if blocking_demo:
        import time as _time

        @app.get("/api/__blocking_demo")
        async def _blocking() -> dict[str, bool]:
            """대조군 전용 — 이 한 줄이 루프를 막는다. 실제 라우트에는 없다."""
            _time.sleep(0.05)
            return {"blocked": True}

    # 🔴 T2-1: 새로 들어온 blocking 위험은 «질의 임베딩»(동기 CPU 작업)이다. /health 만
    #    때리면 그 위험을 지나쳐 측정한다 — 재는 대상이 위험이 있는 경로여야 한다.
    payload = None
    if investigation:
        # 🔴 T2-3: 새로 들어온 blocking 위험은 «조사 실행»이다 — 5단계가 배경 task 로 돌면서
        #    질의 임베딩(동기 CPU)·Neo4j 순회·문서 대조를 연달아 지난다. 요청을 때려서는
        #    이 위험을 못 잰다: POST 는 즉시 답하고 일은 그 뒤에 벌어지기 때문이다.
        #    그래서 «조사가 도는 동안»을 잰다(아래 drive 가 완주까지 기다린다).
        target = "/api/scenarios/GS-01/runs"
    elif blocking_demo:
        target = "/api/__blocking_demo"
    elif reading:
        # T2-2: 읽기 표면(`/evidence`)도 위험이 있는 경로다 — 원문 대조로 offset 을 산출하므로
        # revision 당 chunk 를 훑는다. 그 순회가 루프를 잡지 않는지 여기서 본다.
        target = f"/api/evidence/{urllib.parse.quote(reading, safe='')}"
    elif retrieval:
        from app.retrieval.allowlist import APPROVED_QUESTIONS   # noqa: PLC0415

        target = "/api/retrieval/compare"
        payload = {
            "sessionId": "loop-lag-probe",
            "question": APPROVED_QUESTIONS["Q-MULTIHOP-001"],
            "strategies": strategies,
        }
    else:
        target = "/api/health"
    transport = httpx.ASGITransport(app=app)

    # 🔴 ASGITransport 는 lifespan 을 돌리지 않는다. 직접 열지 않으면 app.state.resources 가
    #    없어 /health 가 죽고, 측정이 실제 경로가 아니라 예외 경로를 재게 된다.
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=transport, base_url="http://asgi") as client:
            await client.get("/api/health")     # 첫 호출의 임포트·검증 비용을 측정 밖으로
            if payload is not None:
                # 임베딩 모델 로드도 «준비»다 — 한 번 태워 측정 밖으로 낸다.
                await client.post(target, json=payload, timeout=300.0)
            if investigation:
                # 🔴 조사 축도 같은 준비가 필요하다 — 그리고 여기서는 «완주»까지 기다려야 한다.
                #    실측으로 걸린 자리다: 준비 없이 재면 첫 run 이 임베딩 모델을 처음 올리고,
                #    그 로드가 최대 lag 780ms 로 잡혀 「조사가 루프를 막는다」로 읽혔다.
                #    막은 것은 조사가 아니라 «측정 안에 들어온 준비»였다.
                warm = await client.post(
                    target, json={"sessionId": "loop-lag-warmup", "mode": "live"}, timeout=300.0
                )
                if warm.status_code == 200:
                    warm_id = warm.json()["runId"]
                    while True:
                        snap = await client.get(f"/api/runs/{warm_id}", timeout=60.0)
                        if snap.status_code != 200 or snap.json()["status"] != "running":
                            break
                        await asyncio.sleep(0.05)

            baseline = await _measure(duration, None)

            sent = 0

            async def drive_investigation(stop: asyncio.Event) -> None:
                """구간 내내 조사 `concurrency` 건을 «계속» 돌린다.

                🔴 한 벌만 띄우고 끝내지 않는다. 워밍업 뒤 조사 1건은 약 90ms 라, 한 벌만
                   돌리면 부하 구간의 tick 표본이 한 자릿수가 된다 — 그 초록은 「막지 않았다」가
                   아니라 「거의 재지 않았다」이다(실측으로 걸린 자리다).
                """
                nonlocal sent
                in_flight: dict[str, bool] = {}
                while not stop.is_set():
                    while len(in_flight) < concurrency and not stop.is_set():
                        res = await client.post(
                            target,
                            json={"sessionId": f"loop-lag-inv-{sent % 100:02d}", "mode": "live"},
                            timeout=300.0,
                        )
                        if res.status_code != 200:
                            stop.set()
                            return
                        in_flight[res.json()["runId"]] = True
                        sent += 1
                    for run_id in list(in_flight):
                        snap = await client.get(f"/api/runs/{run_id}", timeout=60.0)
                        if snap.status_code != 200 or snap.json()["status"] != "running":
                            in_flight.pop(run_id, None)
                    # 🔴 폴링 간격이 곧 «계측기가 만드는 부하»다. 0.01s 로 돌렸을 때
                    #    p95 증가가 +11.5ms, 0.2s 에서 +5.5ms 였다 — 절반이 측정 자신의
                    #    것이었다는 뜻이다(대조 실측 08-30). 재는 쪽이 재는 대상을 흔들지
                    #    않도록 굵게 둔다. run 이 ~90ms 라 완주 판정은 이 간격으로 충분하다.
                    await asyncio.sleep(0.2)

            async def drive(stop: asyncio.Event) -> None:
                nonlocal sent
                sem = asyncio.Semaphore(concurrency)

                async def one() -> None:
                    nonlocal sent
                    async with sem:
                        if payload is None:
                            await client.get(target)
                        else:
                            await client.post(target, json=payload, timeout=300.0)
                        sent += 1

                pending: set[asyncio.Task] = set()
                while not stop.is_set():
                    pending = {t for t in pending if not t.done()}
                    while len(pending) < concurrency and not stop.is_set():
                        pending.add(asyncio.create_task(one()))
                    await asyncio.sleep(0)
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)

            started = time.perf_counter()
            loaded = await _measure(duration, drive_investigation if investigation else drive)
            elapsed = time.perf_counter() - started

    b50, b95, bmax = _summary(baseline)
    l50, l95, lmax = _summary(loaded)
    rps = sent / elapsed if elapsed else 0.0

    detail = f" · 전략 {'+'.join(strategies)}" if payload is not None else ""
    print(f"대상        : {target}{detail}   (동시 {concurrency} · 구간 {duration:.1f}s × 2)")
    print(f"처리        : {sent}건 · 약 {rps:,.0f} req/s")
    print(f"tick 표본   : 유휴 {len(baseline)}개 · 부하 {len(loaded)}개 (약속 주기 {TICK_SEC * 1000:.0f} ms)")
    print()
    print(f"{'구간':<12}{'p50':>10}{'p95':>10}{'최대':>10}")
    print(f"{'유휴 기준선':<12}{b50:>9.2f}{b95:>10.2f}{bmax:>10.2f}   ← 이 플랫폼의 타이머 바닥")
    print(f"{'부하 중':<12}{l50:>9.2f}{l95:>10.2f}{lmax:>10.2f}")
    print(f"{'증가':<12}{l50 - b50:>9.2f}{l95 - b95:>10.2f}{lmax - bmax:>10.2f}   ← 판정은 이 줄로 한다")
    print()
    if blocking_demo:
        print("대조군이다 — 증가가 «커야» 이 측정이 루프 점유를 실제로 잡아낸다는 뜻이다.")
    else:
        print("실제 라우트에는 동기 IO 가 없다. 증가가 유휴 기준선 수준이면, 부하 중에도")
        print("루프를 붙잡고 있는 호출이 없다는 뜻이다.")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="이벤트 루프 점유 실측")
    ap.add_argument("--duration", type=float, default=2.0, help="유휴·부하 각 구간 길이(초)")
    ap.add_argument("--concurrency", type=int, default=20)
    ap.add_argument("--blocking-demo", action="store_true",
                    help="대조군 — 루프를 막는 핸들러를 임시로 붙여 같은 측정을 돌린다")
    ap.add_argument("--retrieval", action="store_true",
                    help="부하 대상을 POST /api/retrieval/compare 로 (T2-1 질의 임베딩 경로)")
    ap.add_argument("--investigation", action="store_true",
                    help="부하 대상을 조사 실행(POST /api/scenarios/GS-01/runs)으로 — T2-3 5단계 경로")
    ap.add_argument("--reading", metavar="EVIDENCE_ID",
                    help="부하 대상을 GET /api/evidence/{id} 로 (T2-2 읽기 경로)")
    ap.add_argument("--strategies", default="vector,hybrid,graphrag",
                    help="--retrieval 부하가 요청할 전략(쉼표 구분) — 축을 갈라 원인을 좁힐 때 쓴다")
    args = ap.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    return asyncio.run(run(args.duration, args.concurrency, args.blocking_demo, args.retrieval,
                          [x for x in args.strategies.split(",") if x], args.reading,
                          args.investigation))


if __name__ == "__main__":
    raise SystemExit(main())
