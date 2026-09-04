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

🔴 투영 버전 기록(§8.3 ⑦ · 오케 판정 2026-08-29 B안): 이 빌드는 자기 실행을 `graph_build`
   원장에 1행 남긴다. `index_build.graph_projection_version`은 «건드리지 않는다» — 색인
   빌드는 그래프를 관측하지 않기 때문이고, 짝 판정은 `v_graph_index_pairing`이 낸다.

🔴 두 개의 정지 조건(둘 다 「설정이 어긋난 채로 만들어진 파생물」을 막는다):
   ① manifest 지문 ≠ packages/ontology/projection-version.json  → 멈춘다
   ② ontology 정본 파일 ≠ DB 거울(ontology_registry)            → 멈춘다 (004 선례)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import manifest as M  # noqa: E402

# 🔴 «보고» 때문에 rc 가 바뀜지 않게 한다 (D-47 · 09-04 실측).
#    이 빌더들의 출력에는 `—`·`·` 가 들어 있고, 콘솔·리다이렉트 인코딩이
#    CP949 면 그 한 글자가 UnicodeEncodeError 로 올라와 «일을 끝낸 뒤» 프로세스를 rc 1 로 죽인다.
#    실측(09-04 09:25): 투영이 노드 309·관계 448 을 «넣은 뒤» 요약 print 에서 죽었다 —
#    데이터는 들어가 있는데 빌드는 실패로 끝나는, 가장 헷갈리는 형태의 빨강이다.
#    🔴 문면은 바꾸지 않는다. 바꾸는 것은 «출력 스트림의 인코딩» 이다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
ONTOLOGY_VERSION_FILE = ROOT / "packages" / "ontology" / "ontology-version.json"
PROJECTION_VERSION_FILE = ROOT / "packages" / "ontology" / "projection-version.json"


# --- 접속 -----------------------------------------------------------------------


#: 대상 DSN 이 없을 때의 종료 코드 — 1(파이썬 기본 예외)과 «가려서» 낸다.
NO_DSN_RC = 2
NO_DSN_MESSAGE = "대상 DSN 이 없다 — FKT_POSTGRES_DSN 또는 --dsn 을 주라"


def dsn_from_env(explicit: str | None) -> str:
    """indexer/build_index.py와 «같은» 규칙 — 대상은 명시로만 정해진다(D-72).

    🔴 이 사본이 따로 사는 것 자체가 위험이다. 앞판은 두 자리가 같은 기본값(포트 5434)을
       들고 있었고, 한쪽만 고치면 다른 쪽이 조용히 옛 규칙으로 남는다 — 그래서 문면·코드를
       한 벌로 맞춰 둔다(사유 전문은 indexer 쪽 성문). 투영도 파괴적이다: Neo4j 를 갈아
       엎기 전에 이 DB 에서 읽는다.
    """
    if explicit:
        return explicit
    env = os.environ.get("FKT_POSTGRES_DSN")
    if env:
        return env
    print(NO_DSN_MESSAGE, file=sys.stderr)
    raise SystemExit(NO_DSN_RC)


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
    # 008은 투영기가 «쓰는» 열(source_data_sha256·source_scope)과 지문 함수를 만든다.
    # 없는 채로 돌면 원장에 낡음 축이 빠진 행이 쌓이고, 그 행은 영원히 GRAPH_UNVERIFIED다.
    for mig in ("006_graph_projection.sql", "008_graph_source_digest.sql"):
        cur.execute("SELECT 1 FROM schema_migration WHERE filename = %s", (mig,))
        if cur.fetchone() is None:
            raise SystemExit(f"{mig} 미적용 — 먼저 `pwsh services/ai-api/db/migrate.ps1`")
    errs = M.selfcheck() + M.check_spec()
    if errs:
        for e in errs:
            print(f"    🔴 {e}")
        raise SystemExit("manifest가 스펙과 어긋난다 — 투영을 시작하지 않는다")
    cur.execute("SELECT count(*) FROM equipment")
    if cur.fetchone()[0] == 0:
        raise SystemExit("equipment 0행 — 먼저 `pwsh data/seed.ps1`")


def projection_version() -> tuple[str, str]:
    """투영 규칙의 정본을 읽고, manifest 지문과 «대조»한다.

    🔴 SemVer만 두면 사람이 올리는 것을 잊는다 — 규칙이 바뀌었는데 버전은 그대로다.
       지문은 내용에서 파생되므로 잊을 수 없다. 둘을 함께 두고 어긋나면 여기서 멈춘다:
       잊을 수 있는 축을 잊을 수 없는 축이 지킨다(004 ontology 거울과 같은 형상).
    """
    if not PROJECTION_VERSION_FILE.exists():
        raise SystemExit(f"투영 정본 없음: {PROJECTION_VERSION_FILE}")
    doc = json.loads(PROJECTION_VERSION_FILE.read_text(encoding="utf-8"))
    fp = M.fingerprint()
    if doc["manifest_sha256"] != fp:
        raise SystemExit(
            f"🔴 manifest 지문 불일치: 정본 {doc['manifest_sha256'][:16]}… ≠ 실물 {fp[:16]}…\n"
            "   manifest.py를 고쳤다면 projection-version.json의 버전과 지문을 함께 올려라 "
            "— 규칙이 바뀌었는데 버전이 그대로면 원장이 거짓을 말한다."
        )
    return f"{doc['projection_version']}+{fp[:8]}", fp


def ontology_version(cur) -> str:
    """정본 파일과 DB 거울이 같은 값을 말하는지 «본다»(build_index.py와 같은 규율).

    어긋난 채로 만들면 원장에 정본 값이 박히고, 판정은 거울과 비교해 어긋남을 낸다 —
    원인은 설정인데 증상은 데이터 쪽에 나타난다.
    """
    if not ONTOLOGY_VERSION_FILE.exists():
        raise SystemExit(f"ontology 정본 없음: {ONTOLOGY_VERSION_FILE} (스펙 §3.3)")
    canon_v = json.loads(ONTOLOGY_VERSION_FILE.read_text(encoding="utf-8"))["ontology_version"]
    cur.execute("SELECT ontology_version FROM ontology_registry")
    row = cur.fetchone()
    if row is None:
        raise SystemExit("ontology_registry 0행 — 004가 넣는 기준 행이 지워졌다")
    if row[0] != canon_v:
        raise SystemExit(
            f"🔴 ontology_version 불일치: 정본 파일 {canon_v} ≠ DB 거울 {row[0]}. "
            "거울을 올리는 «신규 마이그레이션»이 필요하다(004 선례)."
        )
    return canon_v


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


def project(uri, auth, db, nodes, rels) -> tuple[int, int, int]:
    from neo4j import GraphDatabase

    n_nodes = n_rels = 0
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
    return n_nodes, n_rels, deleted


LEDGER_SQL = (
    "INSERT INTO graph_build (build_id, projection_version, manifest_sha256, ontology_version, "
    " node_count, relationship_count, status, error, source_data_sha256, source_scope) "
    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
)


def source_digest(cur):
    """투영이 «읽는» PG 데이터의 지문 — 008 함수를 호출해 받는다(Q-15).

    🔴 여기서 파이썬으로 다시 계산하지 않는다. 빌드가 자기 방식으로 계산하고 판정이 SQL로
       계산하면 두 구현이 언젠가 갈리고, 그때 「낡았다」는 데이터가 아니라 «구현 차이»를
       가리킨다 — 낡음을 잡으려던 축이 거짓말하는 축이 된다. 정의는 008에 하나만 둔다.
    🔴 호출 시점이 중요하다. 노드·관계를 읽은 «같은 트랜잭션 안»에서 불러야 지문이 실제로
       투영된 행들을 가리킨다. 커밋 뒤에 부르면 그 사이의 변경이 지문에 섞인다.
    """
    from psycopg.types.json import Jsonb

    scope = M.source_scope()
    cur.execute("SELECT graph_source_digest(%s)", (Jsonb(scope),))
    return cur.fetchone()[0], Jsonb(scope), scope


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default=None, help="libpq DSN (기본: 환경변수)")
    ap.add_argument("--neo4j-uri", default=None, help="bolt URI (기본: 환경변수)")
    ap.add_argument("--build-id", default=None, help="빌드 식별자(기본: uuid4)")
    args = ap.parse_args()

    # 🔴 DSN 확정이 «가장 먼저»다 — psycopg 를 들이기도 전에 끝낸다(D-72).
    dsn = dsn_from_env(args.dsn)

    import psycopg

    build_id = args.build_id or uuid.uuid4().hex
    uri, auth, db = neo4j_params(args.neo4j_uri)

    t0 = time.perf_counter()
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        preflight(cur)
        proj_ver, fp = projection_version()
        onto = ontology_version(cur)
        nodes = fetch_nodes(cur)
        rels = fetch_rels(cur)
        src_sha, src_scope, scope = source_digest(cur)
        read_s = time.perf_counter() - t0

        t1 = time.perf_counter()
        try:
            n_nodes, n_rels, deleted = project(uri, auth, db, nodes, rels)
        except BaseException as exc:
            # 🔴 실패도 원장에 남는다. 남기지 않으면 「그래프가 왜 반쪽인가」에 아무도 답하지
            #    못한다 — index_build가 skipped를 사유와 함께 남기는 것과 같은 이유다.
            #    데이터 지문은 실패 행에도 적는다 — 읽기는 «이미 끝났고», 무엇을 읽다 실패했는지는
            #    사실이다. 다만 실패 행은 짝 판정에서 PROJECTION_FAILED가 먼저 잡는다.
            cur.execute(LEDGER_SQL, (build_id, proj_ver, fp, onto, 0, 0, "failed",
                                     f"{type(exc).__name__}: {exc}"[:2000], src_sha, src_scope))
            conn.commit()
            print(f"🔴 투영 실패 — graph_build에 failed 1행 기록(build_id={build_id})")
            raise
        build_s = time.perf_counter() - t1

        cur.execute(LEDGER_SQL, (build_id, proj_ver, fp, onto, n_nodes, n_rels, "success", None,
                                 src_sha, src_scope))
        conn.commit()

    print(f"== 투영: 노드 {n_nodes} · 관계 {n_rels} (라벨 {len(M.NODES)} · 관계형 {len(M.projected())})")
    print(f"   삭제 후 재생성 — 지운 노드 {deleted} · PG 읽기 {read_s:.2f}s · 적재 {build_s:.2f}s")
    for spec in M.NODES:
        print(f"   {spec.label:18s} {len(nodes[spec.label]):5d}")
    for rel in M.projected():
        print(f"   {rel.code} {rel.start}-[:{rel.rel_type}]->{rel.end:18s} {len(rels[rel.code]):5d}")
    print(f"   원장 graph_build 1행 — build_id={build_id} · {proj_ver} · ontology {onto}")
    print(f"   manifest 지문 {fp}")
    n_col = sum(len(c) for c in scope.values())
    print(f"   데이터 지문   {src_sha} (원천 {len(scope)}테이블 · {n_col}열)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
