"""GS-01 live run 1회를 replay fixture(JSONL)로 녹화한다 (T2-4 게이트 2 · 판정 J-A~J-E).

    python -m tools.record_replay_fixture                      # 녹화 → 심사 → 저장
    python -m tools.record_replay_fixture --dry-run            # 실행·심사만 하고 저장하지 않는다
    python -m tools.record_replay_fixture --force              # 기존 녹화본을 갈아치운다

무엇이 «있는가»: 앱을 프로세스 안에서 띄워 조사 1회를 실제로 돌리고, 그 run 이 낸 이벤트를
«그대로» JSONL 로 굳힌다.

🔴 **직렬화는 한 번이다.** 실행이 만든 이벤트 객체를 곧바로 `json.dumps` 한다. HTTP 응답을
   받아 다시 쓰는 길도 있지만 그 경로에는 parse→dumps 왕복이 끼고, 「왕복이 무손실이다」는
   가정이지 실측이 아니다 — 같은 자리에서 한 번 물렸다(T2-3: pydantic 을 지나며 `ts` 가
   `…470Z` → `…470000Z` 로 조용히 갈렸다).

🔴 **가공하지 않는다.** ts·seq 를 다시 매기지 않고, 정렬하지 않고, 예쁘게 고치지 않는다.
   녹화본이 실행 산출과 한 글자라도 다르면 그것은 재생본이 아니라 «작문»이다.

🔴 **줄바꿈은 LF 로 고정한다.** Windows 기본 CRLF 로 쓰면 같은 이벤트가 플랫폼마다 다른
   바이트가 되어, 「바이트 동일」 판정이 무엇을 재는지 모르게 된다.

🔴 **심사를 통과해야 저장한다.** fixture 는 커밋되는 실물이라, 저장 뒤에 심사하는 순서는
   위반을 한 번 디스크에 남긴다(`tools/audit_replay_fixture.py`).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import httpx  # noqa: E402

from app.investigation import replay  # noqa: E402
from app.investigation.events import STEP_IDS  # noqa: E402
from app.main import create_app  # noqa: E402
from app.settings import get_settings  # noqa: E402
from tools.audit_replay_fixture import audit, self_test  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):                    # pragma: no cover — 플랫폼 의존
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# 🔴 근거 이벤트를 «내는» 단계. 구현 실측(T2-4)이지 희망이 아니다 — `synthesize`·
#    `draft_work_order` 는 근거를 내지 않고 요약만 낸다(workflow.py). 이 집합을 「전 단계」로
#    적으면 선정 규칙이 항상 FAIL 이 되고, 항상 빨간 신호는 곧 아무도 안 보는 신호가 된다.
#    반대로 이 집합이 «틀리게» 되는 날(예: synthesize 가 근거를 내기 시작)에는 아래 검사가
#    FAIL 로 그 사실을 알린다 — 조용히 지나가지 않게 실패 방향을 잡아 둔 것이다.
EVIDENCE_STEPS = frozenset({"structured", "vector", "graph"})

# 🔴 세션은 «발급받는다». 예전엔 이 상수를 그대로 보냈는데, T3-1 세션 게이트(같은 날
#    08-30)가 들어온 뒤로 그 경로는 401 `session_required` 로 막혀 있었다 — 즉 녹화기는
#    그때부터 돌지 않는 상태였고, 지금 커밋된 fixture 는 게이트 이전의 산물이다.
#    (T6-1 에서 재녹화하려다 실측으로 드러났다 · 31대 09-02.)
RECORD_SESSION_LABEL = "fixture-recorder"


def _selection_verdict(record: Any) -> tuple[bool, list[str]]:
    """녹화 대상 선정 규칙(오케 판정 J-E)을 이 run 에 적용한다."""
    events = record.events
    lines: list[str] = []
    ok = True

    completed_steps = {e["payload"]["step"] for e in events if e["type"] == "step.completed"}
    evidence_by_step: dict[str, int] = {}
    for event in events:
        if event["type"] == "step.evidence":
            step = event["payload"]["step"]
            evidence_by_step[step] = evidence_by_step.get(step, 0) + 1
    failures = [e for e in events if e["type"] in ("run.failed", "run.stopped")]

    def check(label: str, passed: bool, detail: str) -> None:
        nonlocal ok
        lines.append(f"  {'✔' if passed else '✘'} {label} — {detail}")
        if not passed:
            ok = False

    check("완주", record.status == "completed", f"status={record.status}")
    check(
        "5단계 전부",
        completed_steps == set(STEP_IDS),
        f"완료 {sorted(completed_steps)}",
    )
    check(
        "근거 단계 집합",
        set(evidence_by_step) == set(EVIDENCE_STEPS),
        f"근거를 낸 단계 {sorted(evidence_by_step)} (기대 {sorted(EVIDENCE_STEPS)})",
    )
    check(
        "단계당 근거 ≥ 1",
        all(evidence_by_step.get(s, 0) >= 1 for s in EVIDENCE_STEPS),
        " · ".join(f"{s}={evidence_by_step.get(s, 0)}" for s in sorted(EVIDENCE_STEPS)),
    )
    check("실패·중지 0", not failures, f"{[e['type'] for e in failures]}")
    return ok, lines


async def _record_once(scenario_id: str, timeout: float) -> list[dict[str, Any]]:
    """앱을 프로세스 안에서 띄워 live run 1회를 돌리고 이벤트 로그를 그대로 돌려준다."""
    app = create_app()
    # 🔴 ASGITransport 는 lifespan 을 돌리지 않는다 — 직접 열지 않으면 의존 핸들이 없다
    #    (tools/measure_loop_lag.py 선례).
    async with app.router.lifespan_context(app):
        resources = app.state.resources
        if resources.pg_pool is None or resources.neo4j_driver is None:
            raise SystemExit(
                "의존이 없다 — 녹화는 «실제 실행»이라 postgres·neo4j 가 필요하다.\n"
                f"  notes: {resources.notes}\n"
                "  FKT_POSTGRES_DSN · FKT_NEO4J_URI · FKT_NEO4J_USER · FKT_NEO4J_PASSWORD 를 주고 다시 부르라."
            )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://record") as client:
            issued = await client.post("/api/sessions")
            if issued.status_code != 200:
                raise SystemExit(f"세션 발급 실패 {issued.status_code}: {issued.text}")
            session_id = issued.json()["sessionId"]
            print(f"세션     {RECORD_SESSION_LABEL} → 발급 완료")
            created = await client.post(
                f"/api/scenarios/{scenario_id}/runs",
                json={"sessionId": session_id, "mode": "live"},
            )
            if created.status_code != 200:
                raise SystemExit(f"run 생성 실패 {created.status_code}: {created.text}")
            run_id = created.json()["runId"]
            record = app.state.run_store.get(run_id)
            print(f"녹화     run={run_id} — 완주를 기다린다(상한 {timeout:.0f}s)")
            # 🔴 폴링하지 않고 실행 task 를 직접 기다린다. 폴링은 계측기가 측정에 섞이는 자리다.
            try:
                await asyncio.wait_for(asyncio.shield(record.task), timeout=timeout)
            except asyncio.TimeoutError:
                raise SystemExit(f"{timeout:.0f}s 안에 끝나지 않았다 — 녹화를 버린다") from None

            ok, lines = _selection_verdict(record)
            print("선정 규칙(J-E):")
            print("\n".join(lines))
            if not ok:
                raise SystemExit("선정 규칙 불통과 — 이 run 은 fixture 가 되지 않는다")
            # 🔴 로그의 «객체»를 그대로 들고 나온다. 여기서 복사·정렬·재조립을 하지 않는다.
            return record.events


def _serialize(events: list[dict[str, Any]]) -> str:
    """이벤트 하나 = 한 줄. 한국어는 그대로 둔다(ensure_ascii=False) — 리뷰되는 파일이다."""
    return "".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events)


def _write_atomic(path: Path, text: str) -> None:
    """임시 파일에 쓰고 갈아 끼운다 — 중간에 죽어도 반쪽 fixture 가 남지 않는다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    # newline="\n": 플랫폼과 무관하게 LF 로 고정한다.
    tmp.write_text(text, encoding="utf-8", newline="\n")
    os.replace(tmp, path)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="replay fixture 녹화")
    ap.add_argument("--scenario", default="GS-01")
    ap.add_argument("--fixture-dir", default=None, help="기본값 = 리포 data/replay")
    ap.add_argument("--timeout", type=float, default=300.0)
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않는다")
    ap.add_argument("--force", action="store_true", help="기존 녹화본을 갈아치운다")
    args = ap.parse_args(argv)

    fixture_dir = args.fixture_dir or get_settings().replay_fixture_dir
    target = replay.fixture_path(fixture_dir, args.scenario)
    if target.exists() and not (args.force or args.dry_run):
        print(f"이미 있다: {target.name} — 갈아치우려면 --force (조용한 덮어쓰기를 막는다)")
        return 2

    events = asyncio.run(_record_once(args.scenario, args.timeout))
    text = _serialize(events)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

    report = audit(events)
    print(
        "\n공개 경계 심사:\n"
        f"  스캔 이벤트 {report.events}건 · 문자열 {report.strings}개 · {report.chars:,}자"
    )
    for violation in report.violations:
        print(f"  [{violation.axis}] seq={violation.seq} {violation.where}: {violation.excerpt}")
    if not report.ok:
        print("  판정 FAIL — 저장하지 않는다")
        return 1
    print(f"  판정 PASS — 위반 0")

    ok, lines = self_test(events)
    print("\n심사기 대조군(주입 → 검출):")
    print("\n".join(lines))
    if not ok:
        print("  판정 FAIL — 못 우는 심사기의 PASS 는 근거가 아니다. 저장하지 않는다")
        return 1

    types: dict[str, int] = {}
    for event in events:
        types[event["type"]] = types.get(event["type"], 0) + 1
    print(
        "\n녹화본:\n"
        f"  이벤트 {len(events)}건 · {len(text.encode('utf-8')):,} bytes · sha256 {digest[:16]}…\n"
        "  " + " · ".join(f"{t}={n}" for t, n in types.items())
    )

    if args.dry_run:
        print(f"\n--dry-run — 저장하지 않았다(대상이었던 곳: {target.name})")
        return 0
    _write_atomic(target, text)
    print(f"\n저장  {target.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
