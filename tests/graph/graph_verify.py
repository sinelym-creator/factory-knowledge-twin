# =============================================================================
# graph_verify.py — Neo4j 투영 «독립» 검증 (검증 좌석 · T1-5)
#
# 🔴 이 파일은 services/projector/verify_projection.py 를 «부르지 않는다».
#    구현 좌석의 검사기가 초록을 내는 것과, 투영이 옳은 것은 다른 문장이다.
#    여기 있는 것은 전부 두 정본에서 «따로» 조립한 기대다:
#      ① 스펙 §2 관계표 · §4 저장 분담표 — 이 파일이 직접 파싱한다
#      ② PostgreSQL 카탈로그(FK 그래프) — 관계의 원천을 information_schema에서 «도출»한다.
#         manifest의 SQL을 읽지 않는다 — 읽으면 그건 복창이다.
#    manifest.py 의 자료구조(NODES·RELATIONS)는 «검증 대상»이라 읽는다. 그 검사 함수
#    (check_spec·selfcheck)는 쓰지 않는다.
#
# 🔴 읽기 전용이다 — PG도 Neo4j도 쓰지 않는다. 주입 대조군은 graph_drill.py에 있다.
#
#   $env:PGPORT='5534'; $env:NEO4J_BOLT_PORT='7587'
#   services/projector/.venv/Scripts/python.exe tests/graph/graph_verify.py
#
# 출력: check_id|무엇을|기대|실측|판정  (탭 구분 · 러너가 파싱한다)
# exit: 0 = 전건 일치 · 1 = 불일치 1건 이상 · 2 = 실행 오류
# =============================================================================
from __future__ import annotations

import hashlib
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "projector"))

import psycopg  # noqa: E402
from neo4j import GraphDatabase  # noqa: E402

import manifest as mf  # noqa: E402  — 검증 «대상»의 자료구조

SPEC = ROOT / "docs" / "product" / "data-ontology-spec.md"

ROWS: list[tuple[str, str, str, str]] = []          # (id, what, expected, actual)


def check(cid: str, what: str, expected, actual) -> None:
    ROWS.append((cid, what, str(expected), str(actual)))


# --------------------------------------------------------------------------- 접속
def pg_dsn() -> str:
    host = os.environ.get("PGHOST", "127.0.0.1")
    port = os.environ.get("PGPORT") or os.environ.get("POSTGRES_PORT", "5434")
    user = os.environ.get("PGUSER") or os.environ.get("POSTGRES_USER", "fkt")
    pw = os.environ.get("PGPASSWORD") or os.environ.get("POSTGRES_PASSWORD", "fkt_local_dev")
    db = os.environ.get("PGDATABASE") or os.environ.get("POSTGRES_DB", "fkt")
    return f"host={host} port={port} user={user} password={pw} dbname={db}"


def neo_driver():
    host = os.environ.get("NEO4J_HOST", "127.0.0.1")
    port = os.environ.get("NEO4J_BOLT_PORT", "7687")
    uri = os.environ.get("NEO4J_URI") or f"bolt://{host}:{port}"
    user = os.environ.get("NEO4J_USER", "neo4j")
    pw = os.environ.get("NEO4J_PASSWORD", "fkt_local_dev")
    return GraphDatabase.driver(uri, auth=(user, pw))


# --------------------------------------------------------------------- 스펙 독립 파싱
_REL_ROW = re.compile(
    r"^\|\s*(R\d{2})\s*\|\s*`([A-Za-z]+)`\s*\|\s*`([A-Z_]+)`\s*\|\s*`([A-Za-z]+)`\s*\|([^|]*)\|(.*)\|\s*$"
)
_STORE_ROW = re.compile(r"^\|\s*([A-Za-z·]+)\s*\|[^|]*\|[^|]*\|\s*(.*?)\s*\|\s*$")


def spec_relations() -> dict[str, tuple[str, str, str, bool]]:
    """스펙 §2 관계표를 «내가» 판다 — code → (from, rel, to, projected)."""
    out: dict[str, tuple[str, str, str, bool]] = {}
    for line in SPEC.read_text(encoding="utf-8").splitlines():
        m = _REL_ROW.match(line.strip())
        if not m:
            continue
        code, src, rel, dst, _card, proj = m.groups()
        out[code] = (src, rel, dst, "✅" in proj)
    return out


def spec_node_props() -> dict[str, tuple[str, ...]]:
    """스펙 §4 저장 분담표의 Neo4j 열에서 라벨별 속성 키를 «내가» 판다."""
    out: dict[str, tuple[str, ...]] = {}
    for line in SPEC.read_text(encoding="utf-8").splitlines():
        m = _STORE_ROW.match(line.strip())
        if not m:
            continue
        entities, neo = m.groups()
        if "노드:" not in neo:
            continue
        keys = re.findall(r"`([a-z0-9_·]+)`", neo.split("노드:")[1])
        if not keys:
            continue
        props = tuple(k for k in keys[0].split("·"))
        for label in entities.split("·"):
            out[label.strip()] = props
    return out


# ------------------------------------------------------------------ PG 카탈로그 도출
def table_of(label: str) -> str:
    if label == "SOP":
        return "sop"
    return re.sub(r"(?<!^)(?=[A-Z])", "_", label).lower()


def load_fk(cur) -> list[tuple[str, str, str]]:
    cur.execute("""
        select tc.table_name, kcu.column_name, ccu.table_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
        join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
        where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
    """)
    return [tuple(r) for r in cur.fetchall()]


def pg_column(cur, table: str, prop: str) -> str:
    """그래프 속성명 → PG 열을 «내가» 푼다. 동명 열이 없으면 {table}_{prop} 하나만 허용한다
    (스펙 §4는 `class`라 적고 PG는 `equipment_class`로 적는 자리 — 후보가 둘이면 세운다)."""
    cols = set(columns_of(cur, table))
    cands = [c for c in (prop, f"{table}_{prop}") if c in cols]
    if len(cands) != 1:
        raise RuntimeError(f"열 해석 불가 {table}.{prop} 후보={cands}")
    return cands[0]


def columns_of(cur, table: str) -> list[str]:
    cur.execute("""select column_name from information_schema.columns
                   where table_schema='public' and table_name=%s order by ordinal_position""",
                (table,))
    return [r[0] for r in cur.fetchall()]


def resolve_source(fks, cur, src_tbl: str, dst_tbl: str):
    """관계 하나의 «원천»을 FK 그래프에서 도출한다 — 직결 FK 또는 접합 테이블.

    🔴 후보가 둘 이상이면 «세운다». 조용히 첫 번째를 고르면 그 관계는 검사되는 척만 하고
       엉뚱한 열을 본다 — 관대해지는 쪽으로 틀리는 검사기가 제일 나쁘다.
    """
    cands = []
    for tbl, col, ref in fks:                                   # 1:N — 자식이 부모를 가리킨다
        if tbl == dst_tbl and ref == src_tbl:
            cands.append(("direct_child", dst_tbl, col, []))
    for tbl, col, ref in fks:                                   # N:1 — 출발이 도착을 가리킨다
        if tbl == src_tbl and ref == dst_tbl:
            cands.append(("direct_parent", src_tbl, col, []))
    if not cands:
        for tbl in {t for t, _, _ in fks}:                      # N:M — 두 FK를 다 가진 접합
            refs = {(c, r) for t, c, r in fks if t == tbl}
            s = [c for c, r in refs if r == src_tbl]
            d = [c for c, r in refs if r == dst_tbl]
            if s and d and len(refs) == 2:
                extra = [c for c in columns_of(cur, tbl) if c not in (s[0], d[0])]
                cands.append(("junction", tbl, (s[0], d[0]), extra))
    if len(cands) > 1:
        raise RuntimeError(f"관계 원천 모호 {src_tbl}→{dst_tbl}: {[c[:3] for c in cands]}")
    return cands[0] if cands else None


def norm(v) -> str:
    if v is None:
        return "∅"
    if hasattr(v, "to_native"):
        v = v.to_native()
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat()
    return str(v)


# ------------------------------------------------------------------------- 본체
def main() -> int:
    spec_rel = spec_relations()
    spec_props = spec_node_props()

    # --- V-01 스펙 §2 파싱 자체 -------------------------------------------------
    check("V-01", "스펙 §2 관계표 독립 파싱 — R01~R25 전수", 25, len(spec_rel))

    # --- V-02 스펙 ↔ manifest 대조 ---------------------------------------------
    mismatch = []
    for code, (src, rel, dst, proj) in sorted(spec_rel.items()):
        m = next((r for r in mf.RELATIONS if r.code == code), None)
        if m is None:
            mismatch.append(f"{code}:manifest 없음")
            continue
        if (m.start, m.rel_type, m.end, m.projected) != (src, rel, dst, proj):
            mismatch.append(f"{code}:{m.start}-{m.rel_type}->{m.end}/{m.projected}")
    extra = [r.code for r in mf.RELATIONS if r.code not in spec_rel]
    check("V-02", "스펙 §2 ↔ manifest 관계 전건 대조(코드·방향·라벨·투영 플래그) 불일치",
          0, len(mismatch) + len(extra))
    if mismatch or extra:
        check("V-02x", "  불일치 내역", "", ";".join(mismatch + extra)[:200])

    excluded = sorted(c for c, v in spec_rel.items() if not v[3])
    check("V-03", "P4 제외 관계 = R05·R25 정확히 2건", "R05,R25", ",".join(excluded))

    # --- 접속 -----------------------------------------------------------------
    with psycopg.connect(pg_dsn()) as pg, neo_driver() as drv:
        cur = pg.cursor()
        fks = load_fk(cur)
        sess = drv.session()

        # --- V-04 라벨 전수 · P4 부재 -----------------------------------------
        g_labels = {r["l"] for r in sess.run(
            "MATCH (n) UNWIND labels(n) AS l RETURN DISTINCT l AS l")}
        m_labels = {n.label for n in mf.NODES}
        check("V-04", "그래프 라벨 전수 ↔ manifest 라벨 불일치(양방향)",
              0, len(g_labels ^ m_labels))
        check("V-05", "🔴 P4 — SensorReading·DocumentChunk 라벨 부재",
              0, len(g_labels & {"SensorReading", "DocumentChunk"}))

        # --- V-06 라벨별 속성 «키» ↔ 스펙 §4 ----------------------------------
        bad_keys = []
        for label in sorted(g_labels):
            want = spec_props.get(label)
            if want is None:
                bad_keys.append(f"{label}:스펙 §4 행 없음")
                continue
            got = {r["k"] for r in sess.run(
                f"MATCH (n:{label}) UNWIND keys(n) AS k RETURN DISTINCT k AS k")}
            if got != set(want):
                bad_keys.append(f"{label}:{sorted(got)}≠{sorted(want)}")
        check("V-06", "라벨별 속성 «키» ↔ 스펙 §4 Neo4j 열 불일치", 0, len(bad_keys))
        if bad_keys:
            check("V-06x", "  불일치 내역", "", ";".join(bad_keys)[:200])

        # --- V-07 노드 계수 · V-08 노드 속성 «값» 전량 대조 --------------------
        cnt_bad, val_bad, n_nodes, n_props = [], [], 0, 0
        for label in sorted(g_labels):
            tbl = table_of(label)
            props = [p for p in spec_props[label] if p != "id"]
            cols = [pg_column(cur, tbl, p) for p in props]
            cur.execute(f"select id, {', '.join(cols)} from {tbl}")
            pg_rows = {r[0]: tuple(norm(v) for v in r[1:]) for r in cur.fetchall()}
            recs = sess.run(
                f"MATCH (n:{label}) RETURN n.id AS id, "
                + ", ".join(f"n.{p} AS {p}" for p in props))
            g_rows = {r["id"]: tuple(norm(r[p]) for p in props) for r in recs}
            n_nodes += len(g_rows)
            n_props += len(g_rows) * len(props)
            if set(pg_rows) != set(g_rows):
                cnt_bad.append(f"{label}:pg{len(pg_rows)}/graph{len(g_rows)}")
            for k in set(pg_rows) & set(g_rows):
                if pg_rows[k] != g_rows[k]:
                    val_bad.append(f"{label}/{k}")
        check("V-07", f"노드 «id 집합» PG ↔ 그래프 불일치(라벨 {len(g_labels)}종 · 노드 {n_nodes})",
              0, len(cnt_bad) + len(val_bad) - len(val_bad))
        check("V-08", f"🔴 노드 «속성 값» PG ↔ 그래프 전량 대조 불일치(값 {n_props}칸)",
              0, len(val_bad))
        if cnt_bad or val_bad:
            check("V-08x", "  불일치 내역", "", ";".join(cnt_bad + val_bad)[:200])

        # --- V-09 관계 전량 대조(속성 포함) -----------------------------------
        rel_bad, unresolved, n_rels, n_rprops = [], [], 0, 0
        for code, (src, rel, dst, proj) in sorted(spec_rel.items()):
            if not proj:
                continue
            got = resolve_source(fks, cur, table_of(src), table_of(dst))
            if got is None:
                unresolved.append(code)
                continue
            kind, tbl, col, extra = got
            if kind == "direct_child":
                cur.execute(f"select {col}, id from {tbl} where {col} is not null")
                pg_set = {(a, b): () for a, b in cur.fetchall()}
            elif kind == "direct_parent":
                cur.execute(f"select id, {col} from {tbl} where {col} is not null")
                pg_set = {(a, b): () for a, b in cur.fetchall()}
            else:
                s_col, d_col = col
                sel = ", ".join([s_col, d_col] + extra)
                cur.execute(f"select {sel} from {tbl}")
                pg_set = {(r[0], r[1]): tuple(norm(v) for v in r[2:]) for r in cur.fetchall()}
                n_rprops += len(pg_set) * len(extra)
            recs = sess.run(
                f"MATCH (a:{src})-[r:{rel}]->(b:{dst}) RETURN a.id AS a, b.id AS b, r AS r")
            g_set = {}
            for r in recs:
                props = dict(r["r"])
                key_order = extra if kind == "junction" else []
                g_set[(r["a"], r["b"])] = tuple(norm(props.get(k)) for k in key_order)
            n_rels += len(g_set)
            if pg_set != g_set:
                miss = len(set(pg_set) - set(g_set))
                surp = len(set(g_set) - set(pg_set))
                vdif = sum(1 for k in set(pg_set) & set(g_set) if pg_set[k] != g_set[k])
                rel_bad.append(f"{code}(누락{miss}/잉여{surp}/값{vdif})")
        check("V-09", "관계 원천을 FK 카탈로그에서 «도출» — 미해결 관계", 0, len(unresolved))
        check("V-10",
              f"🔴 관계 «전량+속성» PG ↔ 그래프 대조 불일치(관계 {n_rels} · 속성 {n_rprops}칸)",
              0, len(rel_bad))
        if rel_bad or unresolved:
            check("V-10x", "  불일치 내역", "", ";".join(rel_bad + unresolved)[:200])

        # --- V-11 정오표 E-1 — R15 속성 표기 ----------------------------------
        r15 = {r["k"] for r in sess.run(
            "MATCH ()-[r:DIAGNOSED_AS]->() UNWIND keys(r) AS k RETURN DISTINCT k AS k")}
        check("V-11", "🔴 정오표 E-1 — R15 속성 = confidence_note·rank (구표기 confidence 부재)",
              "confidence_note,rank", ",".join(sorted(r15)))

        # --- V-12~14 GS-01 S5 3종 ---------------------------------------------
        p = sess.run("""
            MATCH path=(e:Equipment {id:'EQ-CNC-204'})-[:HAS_COMPONENT]->(c)
                       -[:HAS_FAILURE_MODE]->(fm)-[:MITIGATED_BY]->(s:SOP)
                       -[:REQUIRES]->(sr:SafetyRule)
            RETURN c.id AS c, fm.id AS fm, s.id AS s, sr.id AS sr""")
        paths = {f"{r['c']}>{r['fm']}>{r['s']}>{r['sr']}" for r in p}
        want = "CP-204-BRG-01>FM-BRG-WEAR>SOP-BRG-INSP-014>SAF-LOTO-01"
        check("V-12", "S5 ⓐ 기대 4-hop 경로 실재(EQ-CNC-204 → … → SAF-LOTO-01)",
              1, 1 if want in paths else 0)

        r = sess.run("""MATCH (:FailureMode {id:'FM-BRG-WEAR'})-[x:INDICATED_BY]->
                        (s:Sensor {id:'SN-204-VIB'}) RETURN x.signal_pattern AS sp""").single()
        check("V-13", "S5 ⓑ FM-BRG-WEAR -INDICATED_BY-> SN-204-VIB · signal_pattern 실값",
              "있음", "있음" if (r and r["sp"]) else "없음")

        c = sess.run("""MATCH (:Equipment {id:'EQ-CNC-204'})-[:HAS_FAILURE_MODE]->
                        (f:FailureMode {id:'FM-TOOL-IMB'}) RETURN count(*) AS n""").single()["n"]
        check("V-14", "S5 ⓒ 경쟁 후보 FM-TOOL-IMB R09 직결 실재(«2순위» 값은 R15 소관)",
              1, c)

        # --- V-15 덤프 지문 (재현성은 러너가 2회 비교) -------------------------
        lines = []
        for label in sorted(g_labels):
            props = sorted(p for p in spec_props[label] if p != "id")
            for rec in sess.run(
                    f"MATCH (n:{label}) RETURN n.id AS id, "
                    + ", ".join(f"n.{p} AS {p}" for p in props)):
                lines.append("N|" + label + "|" + rec["id"] + "|"
                             + "|".join(f"{p}={norm(rec[p])}" for p in props))
        for rec in sess.run(
                "MATCH (a)-[r]->(b) RETURN labels(a)[0] AS la, type(r) AS t, "
                "labels(b)[0] AS lb, a.id AS a, b.id AS b, r AS r"):
            props = "|".join(f"{k}={norm(v)}" for k, v in sorted(dict(rec["r"]).items()))
            lines.append(f"R|{rec['la']}|{rec['t']}|{rec['lb']}|{rec['a']}|{rec['b']}|{props}")
        body = "\n".join(sorted(lines)) + "\n"
        sha = hashlib.sha256(body.encode("utf-8")).hexdigest()
        check("V-15", f"덤프 지문(노드 {n_nodes} · 관계 {n_rels} · {len(body)} B) — 재현성 비교 원문",
              sha[:16] + "…", sha[:16] + "…")
        (Path(os.environ.get("GRAPH_DUMP_DIR", ".")) / "graph-dump.txt").write_text(
            body, encoding="utf-8")

        # --- V-16 투영 정본(projection-version.json) ↔ 내 독립 계수 -----------
        import json
        pv = json.loads((ROOT / "packages" / "ontology" / "projection-version.json")
                        .read_text(encoding="utf-8"))
        want = (sum(1 for v in spec_rel.values() if v[3]), sorted(
            c for c, v in spec_rel.items() if not v[3]), len(g_labels), mf.fingerprint())
        got = (pv["projected_relations"], sorted(pv["excluded_relations"]),
               pv["node_labels"], pv["manifest_sha256"])
        check("V-16", "투영 정본 json ↔ 스펙·그래프 독립 계수(투영수·제외·라벨수·지문)",
              str(want), str(got))

        # --- V-17 §8.3 ⑦ — 「관측하지 않은 것을 적지 않는다」가 실물인가 --------
        cur.execute("select count(*), count(graph_projection_version) from index_build")
        tot, filled = cur.fetchone()
        cur.execute("""select col_description('index_build'::regclass, ordinal_position)
                       from information_schema.columns
                       where table_name='index_build' and column_name='graph_projection_version'""")
        cmt = (cur.fetchone() or [None])[0] or ""
        check("V-17", f"index_build.graph_projection_version 전건 NULL(행 {tot}) + 사유 COMMENT 성문",
              "0/있음", f"{filled}/{'있음' if 'NULL 고정' in cmt else '없음'}")

        # --- V-18 원장(graph_build) 최신 행 ↔ 그래프 실측 ----------------------
        cur.execute("""select node_count, relationship_count, manifest_sha256, ontology_version,
                              projection_version, status
                       from graph_build order by built_at desc, build_id desc limit 1""")
        g = cur.fetchone()
        check("V-18", "원장 최신 행 ↔ 그래프 실측(노드·관계·지문·상태)",
              f"{n_nodes}/{n_rels}/{mf.fingerprint()[:8]}/success",
              f"{g[0]}/{g[1]}/{g[2][:8]}/{g[5]}")

        sess.close()

    bad = 0
    for cid, what, exp, act in ROWS:
        if cid.endswith("x"):
            print(f"{cid}\t{what}\t{exp}\t{act}\tINFO")
            continue
        ok = exp == act
        bad += 0 if ok else 1
        print(f"{cid}\t{what}\t{exp}\t{act}\t{'PASS' if ok else 'FAIL'}")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:                                    # noqa: BLE001
        print(f"실행 오류\t{type(exc).__name__}\t{exc}", file=sys.stderr)
        sys.exit(2)
