"""세션 리셋 실측 — 「자기 것만 사라지고 SSOT 는 손대지 않았는가」 (T3-1 AC).

    python -m tools.session_reset_probe --base http://127.0.0.1:8003

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류(측정 불가)

🔴 **살아 있는 서버에 대고 잰다.** 소유권 판정 자체는 `tools/session_guard_matrix.py` 가
   저장소에 «주입한» run 으로 재고, 여기서는 **실제 조사 파이프라인이 만든 run**(replay 모드 —
   커밋된 fixture 재생)으로 리셋을 잰다. 주입만으로 재면 「저장소가 지우는가」는 알아도
   「사람이 겪는 경로가 지우는가」는 모른다.

🔴 **「SSOT 를 안 건드렸다」는 주장이 아니라 실측이다.** 리셋 전·후로 PostgreSQL 전 테이블의
   행 체크섬과 Neo4j 의 라벨·관계 계수를 재서 같은지 본다.

🔴 **그리고 그 지문이 «변화를 감지하기는 하는가»를 함께 잰다.** 늘 같은 값을 내는 지문이라면
   「전후 동일」은 아무것도 뜻하지 않는다 — 「빈 결과는 통과가 아니다」의 같은 자리다. SSOT 에
   쓰는 것은 금지돼 있으므로(공개 경계 · 읽기 전용), 감도는 **행 하나를 뺀 지문과 비교해서**
   확인한다: 한 행이 빠지면 값이 달라져야 한다. 쓰지 않고 감도를 증명하는 방법이다.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import httpx                                                            # noqa: E402

if hasattr(sys.stdout, "reconfigure"):                    # pragma: no cover — 플랫폼 의존
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RUN_TIMEOUT_SEC = 60.0
POLL_SEC = 0.5


@dataclass
class Report:
    lines: list[tuple[bool, str, str]] = field(default_factory=list)
    measured: int = 0                       # 지문이 실제로 «센» 대상 수(0 이면 고장)

    def add(self, ok: bool, label: str, detail: str = "") -> None:
        self.lines.append((ok, label, detail))

    @property
    def ok(self) -> bool:
        return all(ok for ok, _, _ in self.lines) and self.measured > 0


# --- SSOT 지문 ---------------------------------------------------------------------


@dataclass
class Fingerprint:
    """SSOT 한 벌의 지문 — 축별 값과 «무엇을 셌는지»를 함께 들고 다닌다."""

    parts: dict[str, str]
    counted: int

    @property
    def digest(self) -> str:
        joined = "|".join(f"{k}={v}" for k, v in sorted(self.parts.items()))
        return hashlib.sha256(joined.encode()).hexdigest()[:16]


async def postgres_fingerprint(dsn: str, *, skip_one_row: bool = False) -> Fingerprint:
    """공개 스키마 전 테이블의 (행수, 행 체크섬).

    🔴 테이블 목록을 손으로 적지 않는다 — 새 테이블이 생겼을 때 「지문에 넣기를 잊는」 자리를
       만들지 않기 위해서다(이 리포가 V-7 로 값을 치른 형태).
    """
    import asyncpg

    conn = await asyncpg.connect(dsn)
    try:
        tables = [
            r["tablename"]
            for r in await conn.fetch(
                "select tablename from pg_tables where schemaname = 'public' order by tablename"
            )
        ]
        parts: dict[str, str] = {}
        skipped = False
        for table in tables:
            offset = ""
            if skip_one_row and not skipped:
                # 감도 대조군 — 행 하나를 뺀 지문. 쓰기 없이 「이 지문이 변화를 보는가」를 잰다.
                count = await conn.fetchval(f'select count(*) from "{table}"')
                if count:
                    offset = " offset 1"
                    skipped = True
            row = await conn.fetchrow(
                "select count(*) as n, md5(coalesce(string_agg(x, chr(124) order by x), '')) as h "
                f'from (select t::text as x from "{table}" t order by 1{offset}) s'
            )
            parts[table] = f"{row['n']}:{row['h']}"
        return Fingerprint(parts=parts, counted=len(tables))
    finally:
        await conn.close()


async def neo4j_fingerprint(
    uri: str, user: str, password: str, *, skip_one_label: bool = False
) -> Fingerprint:
    """라벨별 노드 수 · 관계 타입별 수.

    🔴 **행 단위 체크섬이 아니다** — 그래프 속성 전량을 정렬해 해시하는 비용이 크고, 이 축에서
       재려는 것은 「리셋이 그래프에 썼는가」다. 쓰기는 거의 예외 없이 계수를 바꾼다. 다만
       「속성만 바꾸는 쓰기는 이 지문이 못 본다」는 한계를 여기 적어 둔다 — 못 보는 것을
       안 보이게 두지 않는다.
    """
    from neo4j import AsyncGraphDatabase

    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    try:
        parts: dict[str, str] = {}
        async with driver.session() as session:
            result = await session.run(
                "MATCH (n) UNWIND labels(n) AS l RETURN l AS label, count(*) AS n ORDER BY l"
            )
            rows = [r async for r in result]
            if skip_one_label and rows:
                rows = rows[1:]
            for r in rows:
                parts[f"node:{r['label']}"] = str(r["n"])
            result = await session.run(
                "MATCH ()-[r]->() RETURN type(r) AS t, count(*) AS n ORDER BY t"
            )
            async for r in result:
                parts[f"rel:{r['t']}"] = str(r["n"])
        return Fingerprint(parts=parts, counted=len(parts))
    finally:
        await driver.close()


async def ssot_fingerprint(*, skip_one: bool = False) -> Fingerprint:
    dsn = os.environ.get("FKT_POSTGRES_DSN")
    uri = os.environ.get("FKT_NEO4J_URI")
    if not dsn or not uri:
        raise RuntimeError("FKT_POSTGRES_DSN·FKT_NEO4J_URI 가 없다 — 지문을 잴 수 없다")
    pg = await postgres_fingerprint(dsn, skip_one_row=skip_one)
    neo = await neo4j_fingerprint(
        uri,
        os.environ.get("FKT_NEO4J_USER", "neo4j"),
        os.environ.get("FKT_NEO4J_PASSWORD", ""),
        skip_one_label=skip_one,
    )
    merged = {f"pg.{k}": v for k, v in pg.parts.items()}
    merged.update({f"neo.{k}": v for k, v in neo.parts.items()})
    return Fingerprint(parts=merged, counted=pg.counted + neo.counted)


# --- 실 서버 왕복 -------------------------------------------------------------------


def _err(res: httpx.Response) -> str:
    try:
        body = res.json()
        return str(body.get("error", {}).get("code", ""))
    except ValueError:
        return ""


def run_probe(base: str, report: Report) -> None:
    with httpx.Client(base_url=base, timeout=10.0) as client:
        created = client.post("/api/sessions")
        report.add(created.status_code == 200, "POST /api/sessions = 200", str(created.status_code))
        sid = created.json()["sessionId"]

        cookie_header = created.headers.get("set-cookie", "")
        # 🔴 쿠키 «값»은 찍지 않는다 — 세션 키가 로그에 남으면 그 로그를 본 사람이 남의 세션이
        #    된다. 형상(HttpOnly·SameSite)만 확인하고 값은 버린다.
        report.add("httponly" in cookie_header.lower(), "세션 쿠키가 HttpOnly", "형상만 확인")
        report.add("samesite" in cookie_header.lower(), "세션 쿠키에 SameSite", "형상만 확인")

        started = client.post(
            "/api/scenarios/GS-01/runs", json={"sessionId": sid, "mode": "replay"}
        )
        report.add(
            started.status_code == 200,
            "replay run 시작 = 200",
            f"{started.status_code} {_err(started)}",
        )
        if started.status_code != 200:
            raise RuntimeError(f"run 을 시작하지 못했다: {started.status_code} {started.text[:200]}")
        run_id = started.json()["runId"]

        deadline = time.monotonic() + RUN_TIMEOUT_SEC
        status = "running"
        while time.monotonic() < deadline:
            snap = client.get(f"/api/runs/{run_id}", cookies={_cookie_name(cookie_header): sid})
            status = snap.json().get("status", "?")
            if status != "running":
                break
            time.sleep(POLL_SEC)
        report.add(status != "running", "run 이 종단에 닿았다", status)

        events = client.get(
            f"/api/runs/{run_id}/events", cookies={_cookie_name(cookie_header): sid}
        )
        n_events = len(events.json()) if events.status_code == 200 else 0
        # 🔴 이벤트 0 은 「깨끗함」이 아니라 「재생이 아무것도 안 했다」다 — 그 상태로 리셋을
        #    재면 「지워졌다」가 공집합의 성질일 뿐이다.
        report.add(n_events > 0, "run 이 이벤트를 남겼다(리셋이 지울 것이 있다)", f"{n_events}건")

        before = _await(ssot_fingerprint())
        report.measured = before.counted

        reset = client.post(
            f"/api/sessions/{sid}/reset", cookies={_cookie_name(cookie_header): sid}
        )
        report.add(
            reset.status_code == 200 and reset.json() == {"ok": True},
            "리셋 = 200 {ok:true}",
            str(reset.status_code),
        )

        gone = client.get(f"/api/runs/{run_id}", cookies={_cookie_name(cookie_header): sid})
        report.add(
            gone.status_code == 404 and _err(gone) == "not_found",
            "리셋 뒤 run 이 사라졌다",
            f"{gone.status_code} {_err(gone)}",
        )

        alive = client.get("/api/health")
        report.add(alive.status_code == 200, "리셋 뒤에도 세션은 살아 있다(퇴장 아님)", "health 200")
        after_reset_call = client.get(f"/api/runs/{run_id}", cookies={_cookie_name(cookie_header): sid})
        report.add(
            after_reset_call.status_code != 401,
            "리셋 뒤 같은 쿠키가 여전히 통한다(401 아님)",
            str(after_reset_call.status_code),
        )

        after = _await(ssot_fingerprint())
        report.add(
            before.digest == after.digest,
            "SSOT 지문 무변(리셋 전 == 리셋 후)",
            f"{before.digest} == {after.digest} · 축 {after.counted}개",
        )

        # 🔴 감도 대조군 — 이 지문이 «변화를 보기는 하는가».
        sensitive = _await(ssot_fingerprint(skip_one=True))
        report.add(
            sensitive.digest != after.digest,
            "지문 감도 대조 — 행 하나만 빠져도 값이 달라진다",
            f"{sensitive.digest} != {after.digest}",
        )


def _cookie_name(set_cookie: str) -> str:
    """서버가 심은 쿠키의 «이름»을 응답에서 읽는다 — 여기에 이름을 적지 않는다."""
    return set_cookie.split("=", 1)[0].strip() if "=" in set_cookie else "fkt_sid"


def _await(coro: Any) -> Any:
    return asyncio.run(coro)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="세션 리셋·SSOT 무접촉 실측 (T3-1)")
    parser.add_argument("--base", default=os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000"))
    args = parser.parse_args(argv)

    report = Report()
    print(f"세션 리셋 실측 — 대상 {args.base}\n")
    run_probe(args.base, report)

    for ok, label, detail in report.lines:
        print(f"  {'✔' if ok else '✘'} {label}" + (f" → {detail}" if detail else ""))
    print(f"\n지문 축 {report.measured}개 · 검사 {len(report.lines)}건")
    if report.measured == 0:
        print("🔴 지문이 아무것도 세지 못했다 — 「무변」이 아니라 측정기 고장이다")
    print(f"판정  {'PASS' if report.ok else 'FAIL'}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:                                   # noqa: BLE001
        print(f"측정 불가 — {exc.__class__.__name__}: {exc}")
        sys.exit(2)
