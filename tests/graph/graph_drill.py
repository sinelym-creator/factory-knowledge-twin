# =============================================================================
# graph_drill.py — 투영 검사의 «대조군» (검증 좌석 · T1-5)
#
# 🔴 graph_verify.py의 초록은 «투영이 옳다»는 뜻일 수도 있고 «내 검사가 죽었다»는 뜻일
#    수도 있다. 둘은 출력이 같다. 여기서 위반을 주입해 «빨강이 나오는 것»을 본 뒤에야
#    그 초록이 증거가 된다(계보 규범).
#
# 🔴 구현 좌석의 대조군을 복창하지 않는다 — 주입 대상·주입 방식·판정 축을 내가 고른다.
#
# 🔴 이 파일은 «쓴다». 세 층 모두 되감는다:
#      Neo4j = 명시 트랜잭션 rollback · PostgreSQL = BEGIN…ROLLBACK · manifest = 메모리만
#    마지막 D-0가 그래프 지문 원복을, D-0p가 PG 원장 행수 원복을 실측한다.
#
#   $env:PGPORT='5534'; $env:NEO4J_BOLT_PORT='7587'
#   services/projector/.venv/Scripts/python.exe tests/graph/graph_drill.py
#
# 출력: check_id|무엇을|기대|실측|판정  (탭 구분)
# exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류
# =============================================================================
from __future__ import annotations

import dataclasses
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg  # noqa: E402
from neo4j import GraphDatabase  # noqa: E402

import graph_verify as gv  # noqa: E402  — 내 검사기(대조 대상)
import manifest as M  # noqa: E402      — 검증 대상의 자료구조

ROWS: list[tuple[str, str, str, str]] = []


def check(cid: str, what: str, expected, actual) -> None:
    ROWS.append((cid, what, str(expected), str(actual)))


GS_PATH = """
MATCH path=(:Equipment {id:'EQ-CNC-204'})-[:HAS_COMPONENT]->(:Component {id:'CP-204-BRG-01'})
           -[:HAS_FAILURE_MODE]->(:FailureMode {id:'FM-BRG-WEAR'})
           -[:MITIGATED_BY]->(:SOP {id:'SOP-BRG-INSP-014'})
           -[:REQUIRES]->(:SafetyRule {id:'SAF-LOTO-01'})
RETURN count(path) AS n
"""

# 회귀 최소 대상 4관계 — 스펙 §6 「이 4개가 끊기면 S5가 실패한다」
BREAKS = [
    ("D-03", "R03 Equipment-[:HAS_COMPONENT]->Component",
     "MATCH (:Equipment {id:'EQ-CNC-204'})-[r:HAS_COMPONENT]->(:Component {id:'CP-204-BRG-01'}) DELETE r"),
    ("D-08", "R08 Component-[:HAS_FAILURE_MODE]->FailureMode",
     "MATCH (:Component {id:'CP-204-BRG-01'})-[r:HAS_FAILURE_MODE]->(:FailureMode {id:'FM-BRG-WEAR'}) DELETE r"),
    ("D-11", "R11 FailureMode-[:MITIGATED_BY]->SOP",
     "MATCH (:FailureMode {id:'FM-BRG-WEAR'})-[r:MITIGATED_BY]->(:SOP {id:'SOP-BRG-INSP-014'}) DELETE r"),
    ("D-12", "R12 SOP-[:REQUIRES]->SafetyRule",
     "MATCH (:SOP {id:'SOP-BRG-INSP-014'})-[r:REQUIRES]->(:SafetyRule {id:'SAF-LOTO-01'}) DELETE r"),
]


def graph_sha(runner) -> str:
    """graph_verify와 «같은 규칙»으로 뜬 지문 — 되감기 실측용."""
    lines = []
    for label in sorted(gv.spec_node_props()):
        props = sorted(p for p in gv.spec_node_props()[label] if p != "id")
        q = (f"MATCH (n:{label}) RETURN n.id AS id, "
             + ", ".join(f"n.{p} AS {p}" for p in props))
        for rec in runner(q):
            lines.append("N|" + label + "|" + rec["id"] + "|"
                         + "|".join(f"{p}={gv.norm(rec[p])}" for p in props))
    for rec in runner("MATCH (a)-[r]->(b) RETURN labels(a)[0] AS la, type(r) AS t, "
                      "labels(b)[0] AS lb, a.id AS a, b.id AS b, r AS r"):
        props = "|".join(f"{k}={gv.norm(v)}" for k, v in sorted(dict(rec["r"]).items()))
        lines.append(f"R|{rec['la']}|{rec['t']}|{rec['lb']}|{rec['a']}|{rec['b']}|{props}")
    return hashlib.sha256(("\n".join(sorted(lines)) + "\n").encode("utf-8")).hexdigest()


def node_value_mismatches(tx, cur, label: str) -> int:
    """graph_verify V-08과 같은 축을 «트랜잭션 안에서» 잰다."""
    props = [p for p in gv.spec_node_props()[label] if p != "id"]
    tbl = gv.table_of(label)
    cols = [gv.pg_column(cur, tbl, p) for p in props]
    cur.execute(f"select id, {', '.join(cols)} from {tbl}")
    pg_rows = {r[0]: tuple(gv.norm(v) for v in r[1:]) for r in cur.fetchall()}
    recs = tx.run(f"MATCH (n:{label}) RETURN n.id AS id, "
                  + ", ".join(f"n.{p} AS {p}" for p in props))
    g_rows = {r["id"]: tuple(gv.norm(r[p]) for p in props) for r in recs}
    return (len(set(pg_rows) ^ set(g_rows))
            + sum(1 for k in set(pg_rows) & set(g_rows) if pg_rows[k] != g_rows[k]))


def rel_mismatches(tx, cur, fks, code: str, src: str, rel: str, dst: str) -> int:
    """graph_verify V-10과 같은 축을 «트랜잭션 안에서» 잰다."""
    kind, tbl, col, extra = gv.resolve_source(fks, cur, gv.table_of(src), gv.table_of(dst))
    if kind == "direct_child":
        cur.execute(f"select {col}, id from {tbl} where {col} is not null")
        pg_set = {(a, b): () for a, b in cur.fetchall()}
    elif kind == "direct_parent":
        cur.execute(f"select id, {col} from {tbl} where {col} is not null")
        pg_set = {(a, b): () for a, b in cur.fetchall()}
    else:
        s_col, d_col = col
        cur.execute(f"select {', '.join([s_col, d_col] + extra)} from {tbl}")
        pg_set = {(r[0], r[1]): tuple(gv.norm(v) for v in r[2:]) for r in cur.fetchall()}
    keys = extra if kind == "junction" else []
    g_set = {}
    for r in tx.run(f"MATCH (a:{src})-[r:{rel}]->(b:{dst}) RETURN a.id AS a, b.id AS b, r AS r"):
        p = dict(r["r"])
        g_set[(r["a"], r["b"])] = tuple(gv.norm(p.get(k)) for k in keys)
    return (len(set(pg_set) ^ set(g_set))
            + sum(1 for k in set(pg_set) & set(g_set) if pg_set[k] != g_set[k]))


def main() -> int:
    with psycopg.connect(gv.pg_dsn()) as pg, gv.neo_driver() as drv:
        cur = pg.cursor()
        fks = gv.load_fk(cur)
        sess = drv.session()

        base_sha = graph_sha(lambda q: sess.run(q))
        base = sess.run(GS_PATH).single()["n"]
        check("D-00", "기준선 — GS-01 S5 4-hop 기대 경로 건수(끊기 전)", 1, base)

        # --- A. 회귀 최소 4관계: 끊으면 경로가 죽는가 ---------------------------
        for cid, what, cypher in BREAKS:
            tx = sess.begin_transaction()
            try:
                tx.run(cypher)
                n = tx.run(GS_PATH).single()["n"]
            finally:
                tx.rollback()
            check(cid, f"끊김 검출 — {what} 1건 삭제 시 S5 경로 건수", 0, n)
        after = sess.run(GS_PATH).single()["n"]
        check("D-0g", "되감기 — 4회 드릴 후 S5 경로 건수 원복", 1, after)

        # --- B. 내 «값 대조»가 실제로 우는가 ------------------------------------
        tx = sess.begin_transaction()
        try:
            clean = node_value_mismatches(tx, cur, "Component")
            tx.run("MATCH (c:Component {id:'CP-204-BRG-01'}) SET c.name = 'MUTANT'")
            dirty = node_value_mismatches(tx, cur, "Component")
        finally:
            tx.rollback()
        check("D-V1", "🔴 대조군 — 손대지 않은 Component 값 불일치(내 V-08 축)", 0, clean)
        check("D-V2", "🔴 대조군 — Component.name 변조 주입 시 값 불일치", 1, dirty)

        tx = sess.begin_transaction()
        try:
            clean = rel_mismatches(tx, cur, fks, "R11", "FailureMode", "MITIGATED_BY", "SOP")
            tx.run("MATCH (:FailureMode {id:'FM-BRG-WEAR'})-[r:MITIGATED_BY]->"
                   "(:SOP {id:'SOP-BRG-INSP-014'}) DELETE r")
            dirty = rel_mismatches(tx, cur, fks, "R11", "FailureMode", "MITIGATED_BY", "SOP")
        finally:
            tx.rollback()
        check("D-V3", "🔴 대조군 — 손대지 않은 R11 관계 불일치(내 V-10 축)", 0, clean)
        check("D-V4", "🔴 대조군 — R11 관계 1건 삭제 주입 시 관계 불일치", 1, dirty)

        check("D-0", "되감기 — 전 드릴 후 그래프 지문 원복", base_sha[:16], graph_sha(lambda q: sess.run(q))[:16])
        sess.close()

        # --- C. 006 원장·짝 판정 view — 내 주입으로 5상태를 다 깬다 -------------
        cur.execute("select count(*) from graph_build")
        n_ledger = cur.fetchone()[0]

        def pairing() -> str:
            # 🔴 view는 색인 build 1건당 1행이다 — 한 행만 보면 다른 행의 상태를 놓친다.
            cur.execute("select distinct pairing from v_graph_index_pairing order by 1")
            vals = [r[0] for r in cur.fetchall()]
            return ",".join(vals) if vals else "∅"

        check("P-00", "현 상태 짝 판정(투영·색인 실물 존재)", "PAIRED", pairing())

        drills = [
            ("P-01", "원장 비움 → 투영 없음", "delete from graph_build", "NO_PROJECTION"),
            ("P-02", "실패한 투영 주입", None, "PROJECTION_FAILED"),
            ("P-03", "ontology 0.2.0 투영 주입", None, "ONTOLOGY_MISMATCH"),
            ("P-04", "index_build 1건의 ontology를 갈라 주입(build 단위 격리 확인)", None,
             "INDEX_BUILD_INCONSISTENT,PAIRED"),
        ]
        ins_failed = ("insert into graph_build(build_id,projection_version,manifest_sha256,"
                      "ontology_version,node_count,relationship_count,status,error) values "
                      "('drill0000000000000000000000000001','0.1.0+deadbeef',repeat('a',64),"
                      "'0.1.0',0,0,'failed','drill')")
        ins_onto = ("insert into graph_build(build_id,projection_version,manifest_sha256,"
                    "ontology_version,node_count,relationship_count,status) values "
                    "('drill0000000000000000000000000002','0.2.0+deadbeef',repeat('a',64),"
                    "'0.2.0',1,1,'success')")
        # 🔴 n_onto는 «한 build 안»의 ontology 종수다 — 새 build를 만들면 그 build가 따로
        #    ONTOLOGY_MISMATCH가 될 뿐 이 축은 울지 않는다(내 첫 주입이 그 오답이었다).
        dup_idx = ("update index_build set ontology_version='9.9.9' where ctid = "
                   "(select ctid from index_build where build_id = %s limit 1)")

        # 🔴 P-04의 «대상»을 자기 DB에서 도출한다 — 픽스처 id를 박아 두지 않는다.
        #
        #    박아 뒀던 값은 `levi2-run1`이었다. 이 좌석의 러너가 시드하는 이름이라 «내 스택에서는»
        #    돌지만, 다른 DB를 겨누면 subselect가 NULL이 되고 `where ctid = NULL`은 0행을 고친다.
        #    그러면 드릴은 «아무것도 주입하지 않은 채» 판정을 내고, 그 침묵이 「미탐지」로 읽힌다.
        #    (실제로 다른 좌석이 자기 DB에서 그렇게 읽었다 — 관측은 참이었고 진단은 드릴의
        #     성질이 아니라 «어느 DB를 겨눴는가»의 성질이었다.)
        #    「빈 결과를 결과로 읽지 마라」의 드릴판이다.
        cur.execute("select build_id from index_build group by build_id "
                    "having count(*) > 1 order by build_id limit 1")
        row = cur.fetchone()
        cur.execute("select count(distinct build_id) from index_build")
        n_builds = cur.fetchone()[0]
        if row is None or n_builds < 2:
            # 🔴 전제가 없으면 «판정하지 않는다». 「2행 이상인 build」와 「build 2개 이상」이
            #    둘 다 있어야 이 축(한 build만 갈리고 나머지는 PAIRED)이 성립한다.
            #    전제 없이 낸 초록도 빨강도 이 축에 대해서는 거짓이다.
            raise SystemExit(
                f"🔴 FAIL P-04 전제 불충족 — build {n_builds}개 · 2행 이상인 build "
                f"{'없음' if row is None else row[0]}. 드릴 고장이지 검사 결과가 아니다")
        split_build = row[0]
        print(f"   P-04 주입 대상 = index_build build_id={split_build} (DB에서 도출 · 전체 build {n_builds}개)")

        sqls = {"P-01": ("delete from graph_build", None), "P-02": (ins_failed, None),
                "P-03": (ins_onto, None), "P-04": (dup_idx, (split_build,))}
        for cid, what, _s, want in drills:
            cur.execute("savepoint d")
            try:
                sql, params = sqls[cid]
                cur.execute(sql, params)
                # 🔴 주입이 «0행»이면 결과가 아니라 고장이다. 이 한 줄이 없으면 아무것도 안 한
                #    드릴이 조용히 판정을 내고, 그 판정이 미탐지 부채로 원장에 오른다.
                if cur.rowcount == 0:
                    raise SystemExit(f"🔴 FAIL {cid} 주입이 0행을 고쳤다 — 대상이 없다(드릴 고장)")
                got = pairing()
            finally:
                cur.execute("rollback to savepoint d")
            check(cid, f"짝 판정 — {what}", want, got)

        # CHECK가 «모순 행»을 막는가
        for cid, what, sql in [
            ("P-05", "모순 행(status=failed인데 노드 5) — CHECK 거부",
             "insert into graph_build(build_id,projection_version,manifest_sha256,ontology_version,"
             "node_count,relationship_count,status,error) values "
             "('drill0000000000000000000000000003','0.1.0+deadbeef',repeat('a',64),'0.1.0',5,0,"
             "'failed','x')"),
            ("P-06", "버전 형식 위반(지문 없는 0.1.0) — CHECK 거부",
             "insert into graph_build(build_id,projection_version,manifest_sha256,ontology_version,"
             "node_count,relationship_count,status) values "
             "('drill0000000000000000000000000004','0.1.0',repeat('a',64),'0.1.0',1,1,'success')"),
        ]:
            cur.execute("savepoint d")
            try:
                cur.execute(sql)
                got = "통과"
            except psycopg.errors.CheckViolation:
                got = "거부"
            except Exception as e:                                   # noqa: BLE001
                got = type(e).__name__
            finally:
                cur.execute("rollback to savepoint d")
            check(cid, f"스키마 — {what}", "거부", got)

        cur.execute("select count(*) from graph_build")
        check("D-0p", "되감기 — 전 드릴 후 graph_build 행수 원복", n_ledger, cur.fetchone()[0])
        pg.rollback()

    # --- D. 지문 가드: manifest를 «메모리에서» 흔들면 빌드가 멈추는가 -----------
    sys.path.insert(0, str(gv.ROOT / "services" / "projector"))
    import build_projection as B                                     # noqa: E402

    orig = M.RELATIONS
    try:
        # ⓐ 의미 축(도착 라벨)을 흔든다 — 지문이 덮어야 하는 자리
        mutated = tuple(dataclasses.replace(r, end="SafetyRule") if r.code == "R11" else r
                        for r in M.RELATIONS)
        M.RELATIONS = mutated
        B.M.RELATIONS = mutated
        try:
            B.projection_version()
            got = "통과"
        except SystemExit:
            got = "정지"
        check("G-01", "🔴 지문 가드 — manifest «의미»(R11 도착 라벨) 변조 시 빌드가 멈추는가",
              "정지", got)

        # ⓑ 🔴 경계 실측 — 주석(note)은 canonical()에서 «의도적으로» 빠진다.
        #    「지문이 무엇을 덮고 무엇을 안 덮는가」를 성문해 두지 않으면, 다음 사람이
        #    주석만 고치고 「지문이 안 변했으니 규칙도 안 변했다」를 반대로 읽는다.
        mutated = tuple(dataclasses.replace(r, note=r.note + "·DRILL") if r.code == "R11" else r
                        for r in orig)
        M.RELATIONS = mutated
        B.M.RELATIONS = mutated
        try:
            B.projection_version()
            got2 = "통과"
        except SystemExit:
            got2 = "정지"
        check("G-01b", "지문 «사정거리» — 주석(note)만 변조하면 통과(설계 · 지문은 의미만 덮는다)",
              "통과", got2)
    finally:
        M.RELATIONS = orig
        B.M.RELATIONS = orig
    try:
        B.projection_version()
        got = "통과"
    except SystemExit:
        got = "정지"
    check("G-02", "되감기 — 원복 후 지문 가드 통과", "통과", got)

    bad = 0
    for cid, what, exp, act in ROWS:
        ok = exp == act
        bad += 0 if ok else 1
        print(f"{cid}\t{what}\t{exp}\t{act}\t{'PASS' if ok else 'FAIL'}")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:                                         # noqa: BLE001
        print(f"실행 오류\t{type(exc).__name__}\t{exc}", file=sys.stderr)
        sys.exit(2)
