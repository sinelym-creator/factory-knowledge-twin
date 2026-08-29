"""그래프 투영 빌드 — PostgreSQL(정본) → Neo4j 파생 투영 (T1-5 게이트 ②).

    $env:PYTHONUTF8='1'
    services\\projector\\.venv\\Scripts\\python.exe services\\projector\\build_projection.py

🔴 무엇이 정본인가: PostgreSQL «만»이다(스펙 §0 P1·§4). Neo4j는 언제든 지우고 다시 만들 수
   있어야 하는 파생물이다. 그래서 이 스크립트는 «그래프를 통째로 비우고» 다시 세운다 —
   부분 갱신(MERGE로 덧쓰기)을 하지 않는다. 덧쓰기는 「PG에서 사라진 것」을 그래프에 남긴다.

🔴 무엇을 저장하지 않는가:
   ① 시계열(R05)·본문 chunk(R25) — P4. 라벨 부재를 verify가 실측한다.
   ② 판정 — 신선도·STALE은 PG view가 «조회 시점에» 낸다(003 v_index_freshness 선례).
      그래프에 판정을 굳혀 넣으면 그 값이 스스로 낡는다.
   ③ 지름길 관계 — 4-hop은 저장된 4개 관계에서 질의가 만든다. 유일한 예외 R07은 스펙이
      「역정규화(1-hop 단축용)」이라고 명시한 관계다.

🔴 투영 버전 기록(§8.3 ⑦)은 이 파일이 «하지 않는다» — 제안 → 오케 판정 → 적용 순서다
   (README §3). 지문은 찍기만 하고 어디에도 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import manifest as M  # noqa: E402


# --- 접속 -----------------------------------------------------------------------


def dsn_from_env(explicit: str | None) -> str:
    """indexer/build_index.py와 «같은» 규칙 — 좌석별 병렬 스택은 포트만 달리 준다."""
    if explicit:
        return explicit
    host = os.environ.get("PGHOST", "127.0.0.1")
    port = os.environ.get("PGPORT") or os.environ.get("POSTGRES_PORT", "5434")
    user = os.environ.get("PGUSER") or os.environ.get("POSTGRES_USER", "fkt")
    pw = os.environ.get("PGPASSWORD") or os.environ.get("POSTGRES_PASSWORD", "fkt_local_dev")
    db = os.environ.get("PGDATABASE") or os.environ.get("POSTGRES_DB", "fkt")
    return f"host={host} port={port} user={user} password={pw} dbname={db}"


def neo4j_params(uri: str | None) -> tuple[str, tuple[str, str], str]:
    if not uri:
        host = os.environ.get("NEO4J_HOST", "127.0.0.1")
        port = os.environ.get("NEO4J_BOLT_PORT", "7687")
        uri = os.environ.get("NEO4J_URI") or f"bolt://{host}:{port}"
    user = os.environ.get("NEO4J_USER", "neo4j")
    pw = os.environ.get("NEO4J_PASSWORD", "fkt_local_dev")
    return uri, (user, pw), os.environ.get("NEO4J_DATABASE", "neo4j")


# --- 값 정규화 -------------------------------------------------------------------


def canon(v):
    """환경에 기대지 않는 값으로 바꾼다.

    🔴 timestamptz는 클라이언트 시간대에 따라 «같은 순간»이 다른 표기로 온다. UTC로 못박지
       않으면 TZ가 다른 머신에서 같은 seed를 투영했을 때 덤프가 갈라진다 — 재현성이
       데이터가 아니라 «환경»에 좌우된다(005의 정렬 결정성 선례와 같은 이유).
    """
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    return v


# --- 사전 점검 -------------------------------------------------------------------


def preflight(cur) -> None:
    cur.execute("SELECT 1 FROM schema_migration WHERE filename = '001_core_schema.sql'")
    if cur.fetchone() is None:
        raise SystemExit("001_core_schema.sql 미적용 — 먼저 `pwsh services/ai-api/db/migrate.ps1`")
    errs = M.selfcheck() + M.check_spec()
    if errs:
        for e in errs:
            print(f"    🔴 {e}")
        raise SystemExit("manifest가 스펙과 어긋난다 — 투영을 시작하지 않는다")
    cur.execute("SELECT count(*) FROM equipment")
    if cur.fetchone()[0] == 0:
        raise SystemExit("equipment 0행 — 먼저 `pwsh data/seed.ps1`")


# --- 본체 -----------------------------------------------------------------------


def fetch_nodes(cur) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for spec in M.NODES:
        cur.execute(spec.sql)
        cols = [d.name for d in cur.description]
        out[spec.label] = [
            {c: canon(v) for c, v in zip(cols, row)} for row in cur.fetchall()
        ]
    return out


def fetch_rels(cur) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for rel in M.projected():
        cur.execute(rel.sql)
        cols = [d.name for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = {c: canon(v) for c, v in zip(cols, row)}
            props = {k: d[k] for k in rel.props}
            rows.append({"start_id": d["start_id"], "end_id": d["end_id"], "props": props})
        out[rel.code] = rows
    return out


def wipe(session) -> int:
    """파생 투영을 통째로 비운다 — «삭제 후 재생성»(baseline §8.2·§32.3)의 삭제 절반.

    🔴 라벨을 골라 지우지 않는다. 골라 지우면 옛 manifest가 남긴 라벨이 살아남아,
       「지금 manifest가 만든 것」과 「예전에 만들어진 것」이 한 그래프에 섞인다.
       P4 부재 판정(verify [4])이 그 잔재를 잡아야 하는데, 잔재를 남기는 삭제로는 못 잡는다.
    """
    rec = session.run("MATCH (n) DETACH DELETE n RETURN count(*) AS n").single()
    return rec["n"] if rec else 0


def ensure_constraints(session) -> None:
    """id 유일 제약 — 「같은 id 노드가 둘」을 적재 시점에 «울리게» 한다.

    스키마는 데이터를 비워도 남는다. 재생성 때마다 다시 선언해도 IF NOT EXISTS라 무해하다.
    """
    for spec in M.NODES:
        session.run(
            f"CREATE CONSTRAINT c_{spec.label.lower()}_id IF NOT EXISTS "
            f"FOR (n:{spec.label}) REQUIRE n.id IS UNIQUE"
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default=None, help="libpq DSN (기본: 환경변수)")
    ap.add_argument("--neo4j-uri", default=None, help="bolt URI (기본: 환경변수)")
    args = ap.parse_args()

    import psycopg
    from neo4j import GraphDatabase

    t0 = time.perf_counter()
    with psycopg.connect(dsn_from_env(args.dsn)) as conn, conn.cursor() as cur:
        preflight(cur)
        nodes = fetch_nodes(cur)
        rels = fetch_rels(cur)
    read_s = time.perf_counter() - t0

    uri, auth, db = neo4j_params(args.neo4j_uri)
    n_nodes = n_rels = 0
    t1 = time.perf_counter()
    with GraphDatabase.driver(uri, auth=auth) as drv:
        drv.verify_connectivity()
        with drv.session(database=db) as ses:
            deleted = wipe(ses)
            ensure_constraints(ses)

            for spec in M.NODES:
                rows = nodes[spec.label]
                if not rows:
                    print(f"    ⚠ {spec.label}: PG에 0행 — 노드를 만들지 않는다")
                    continue
                res = ses.run(
                    f"UNWIND $rows AS row CREATE (n:{spec.label}) SET n = row",
                    rows=rows,
                )
                created = res.consume().counters.nodes_created
                if created != len(rows):
                    raise SystemExit(
                        f"🔴 {spec.label}: PG {len(rows)}행 → 노드 {created}개 — 수가 다르다"
                    )
                n_nodes += created

            for rel in M.projected():
                rows = rels[rel.code]
                if not rows:
                    print(f"    ⚠ {rel.code} {rel.rel_type}: PG에 0행")
                    continue
                # 🔴 MATCH가 한쪽이라도 못 찾으면 그 행은 «조용히» 사라진다. 그래서 만들어진
                #    수를 입력 수와 대조한다 — 관계가 빠진 그래프는 경로가 죽은 그래프다.
                res = ses.run(
                    f"UNWIND $rows AS row "
                    f"MATCH (a:{rel.start} {{id: row.start_id}}), (b:{rel.end} {{id: row.end_id}}) "
                    f"CREATE (a)-[r:{rel.rel_type}]->(b) SET r = row.props",
                    rows=rows,
                )
                created = res.consume().counters.relationships_created
                if created != len(rows):
                    raise SystemExit(
                        f"🔴 {rel.code} {rel.start}-[:{rel.rel_type}]->{rel.end}: "
                        f"PG {len(rows)}행 → 관계 {created}개 — 끝점 노드를 못 찾았다"
                    )
                n_rels += created
    build_s = time.perf_counter() - t1

    print(f"== 투영: 노드 {n_nodes} · 관계 {n_rels} (라벨 {len(M.NODES)} · 관계형 {len(M.projected())})")
    print(f"   삭제 후 재생성 — 지운 노드 {deleted} · PG 읽기 {read_s:.2f}s · 적재 {build_s:.2f}s")
    for spec in M.NODES:
        print(f"   {spec.label:18s} {len(nodes[spec.label]):5d}")
    for rel in M.projected():
        print(f"   {rel.code} {rel.start}-[:{rel.rel_type}]->{rel.end:18s} {len(rels[rel.code]):5d}")
    # 🔴 지문은 «찍기만» 한다 — 어디에도 쓰지 않는다(§8.3 ⑦ 기록 방식은 판정 대기 · README §3)
    print(f"   manifest 지문 {M.fingerprint()} (기록 안 함 — 판정 대기)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
