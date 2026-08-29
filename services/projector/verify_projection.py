"""투영 검증 — 형상·P4 부재·GS-01 S5·회귀 4관계 (T1-5 게이트 ②③④⑤).

    services\\projector\\.venv\\Scripts\\python.exe services\\projector\\verify_projection.py
    ...                                            verify_projection.py --dump         # 멱등 대조용 정본 덤프
    ...                                            verify_projection.py --break-drill  # 🔴 회귀 4관계 끊김 실증(롤백)

🔴 «그래프에서 재도출»한다 — 빌드가 세어 둔 수를 그대로 찍으면 「적재됐는가」를 한 번도 묻지
   않은 채 초록이 난다(verify_index.py 선례). 모든 판정은 Cypher 결과로 낸다.

--dump 은 노드·관계의 «속성까지» 정렬해 낸다. 두 번 투영한 뒤 이 출력을 diff 해서 0이면
멱등이다. 🔴 계수(노드 N개·관계 M개)만 맞춰 보는 대조는 「수는 같은데 속성이 흔들린」 경우를
놓친다 — T1-4에서 벡터 전량 덤프가 잡아낸 자리와 같은 함정이다.

--break-drill 은 «쓴다». 회귀 최소 4관계(R03·R08·R11·R12)를 하나씩 끊고 4-hop이 실제로
죽는지 본 뒤 트랜잭션을 롤백한다. 🔴 남의 좌석 스택에 겨누지 마라.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import manifest as M  # noqa: E402
from build_projection import canon, dsn_from_env, neo4j_params  # noqa: E402

# 스펙 §6 S5 — 「경로 성립 조건」이 걸린 4-hop 질의(원문 그대로).
S5_PATH = (
    "MATCH (e:Equipment {id:$eq})-[:HAS_COMPONENT]->(c)-[:HAS_FAILURE_MODE]->(fm)"
    "-[:MITIGATED_BY]->(s:SOP)-[:REQUIRES]->(sr:SafetyRule) "
    "RETURN e.id AS e, c.id AS c, fm.id AS fm, s.id AS s, sr.id AS sr ORDER BY c, fm, s, sr"
)
S5_INDICATOR = (
    "MATCH (fm:FailureMode {id:$fm})-[r:INDICATED_BY]->(sn:Sensor) "
    "RETURN sn.id AS sensor, r.signal_pattern AS signal_pattern ORDER BY sensor"
)
S5_COMPETITOR = (
    "MATCH (e:Equipment {id:$eq})-[:HAS_FAILURE_MODE]->(fm:FailureMode) "
    "RETURN fm.id AS fm, fm.name AS name ORDER BY fm"
)

# 끊김 실증(게이트 ⑤) — GS-01 경로에서 «그 한 관계»만 지운다.
BREAK_EDGES = {
    "R03": ("MATCH (:Equipment {id:'EQ-CNC-204'})-[r:HAS_COMPONENT]->"
            "(:Component {id:'CP-204-BRG-01'}) DELETE r"),
    "R08": ("MATCH (:Component {id:'CP-204-BRG-01'})-[r:HAS_FAILURE_MODE]->"
            "(:FailureMode {id:'FM-BRG-WEAR'}) DELETE r"),
    "R11": ("MATCH (:FailureMode {id:'FM-BRG-WEAR'})-[r:MITIGATED_BY]->"
            "(:SOP {id:'SOP-BRG-INSP-014'}) DELETE r"),
    "R12": ("MATCH (:SOP {id:'SOP-BRG-INSP-014'})-[r:REQUIRES]->"
            "(:SafetyRule {id:'SAF-LOTO-01'}) DELETE r"),
}


# --- 덤프 -----------------------------------------------------------------------


def fmt(v) -> str:
    """환경·표기에 흔들리지 않는 값 문자열. 시각은 UTC ISO로 못박는다."""
    if hasattr(v, "to_native"):          # neo4j.time.DateTime / Date
        v = v.to_native()
    if hasattr(v, "astimezone"):
        return v.astimezone(timezone.utc).isoformat()
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def dump(ses) -> None:
    for spec in M.NODES:
        for rec in ses.run(f"MATCH (n:{spec.label}) RETURN n ORDER BY n.id"):
            props = dict(rec["n"])
            body = ";".join(f"{k}={fmt(props[k])}" for k in sorted(props))
            print(f"N\t{spec.label}\t{props.get('id')}\t{body}")
    for rel in M.projected():
        q = (f"MATCH (a:{rel.start})-[r:{rel.rel_type}]->(b:{rel.end}) "
             f"RETURN a.id AS a, b.id AS b, properties(r) AS p ORDER BY a, b")
        for rec in ses.run(q):
            p = rec["p"] or {}
            body = ";".join(f"{k}={fmt(p[k])}" for k in sorted(p))
            print(f"R\t{rel.code}\t{rel.rel_type}\t{rec['a']}\t{rec['b']}\t{body}")


# --- 판정 -----------------------------------------------------------------------


def report(ses, cur) -> int:
    fails = 0

    # --- 1. 형상: 그래프 계수 ↔ PG 원천 계수 -------------------------------------
    print("[1] 적재 형상 — 그래프에서 센 수 ↔ PG 원천에서 다시 센 수")
    n_node = n_rel = 0
    for spec in M.NODES:
        got = ses.run(f"MATCH (n:{spec.label}) RETURN count(n) AS n").single()["n"]
        cur.execute(f"SELECT count(*) FROM {spec.table}")
        want = cur.fetchone()[0]
        n_node += got
        if got != want:
            print(f"    🔴 FAIL {spec.label}: 그래프 {got} ≠ PG {want}")
            fails += 1
    for rel in M.projected():
        got = ses.run(
            f"MATCH (:{rel.start})-[r:{rel.rel_type}]->(:{rel.end}) RETURN count(r) AS n"
        ).single()["n"]
        cur.execute(f"SELECT count(*) FROM ({rel.sql}) t")
        want = cur.fetchone()[0]
        n_rel += got
        if got != want:
            print(f"    🔴 FAIL {rel.code} {rel.rel_type}: 그래프 {got} ≠ PG {want}")
            fails += 1
    print(f"    노드 {n_node} · 관계 {n_rel} · 라벨 {len(M.NODES)} · 관계형 {len(M.projected())}")

    # --- 2. P4 — 없어야 하는 것이 «없는가» --------------------------------------
    labels = sorted(r["label"] for r in ses.run("CALL db.labels() YIELD label RETURN label"))
    extra = [x for x in labels if x not in {n.label for n in M.NODES}]
    print(f"[2] P4 라벨 전수 {len(labels)}종: {', '.join(labels)}")
    for forbidden in M.FORBIDDEN_LABELS:
        if forbidden in labels:
            print(f"    🔴 FAIL P4 위반 — {forbidden} 라벨이 그래프에 있다")
            fails += 1
    if extra:
        # manifest 밖 라벨 = 옛 투영의 잔재이거나 손으로 넣은 것. 어느 쪽이든 파생물이 아니다.
        print(f"    🔴 FAIL manifest에 없는 라벨: {extra}")
        fails += 1
    else:
        print(f"    ✅ 금지 라벨 {'·'.join(M.FORBIDDEN_LABELS)} 부재 · manifest 밖 라벨 0종")

    rel_types = sorted(r["relationshipType"] for r in
                       ses.run("CALL db.relationshipTypes() YIELD relationshipType "
                               "RETURN relationshipType"))
    want_types = sorted({r.rel_type for r in M.projected()})
    if rel_types != want_types:
        print(f"    🔴 FAIL 관계형 집합 불일치: 그래프 {rel_types} ≠ manifest {want_types}")
        fails += 1

    # --- 3. 속성 — «스펙 §4가 지정한 것만» 올라갔는가 ------------------------------
    print("[3] 노드 속성 집합 ↔ manifest(스펙 §4)")
    prop_fails = 0
    for spec in M.NODES:
        want = {g for g, _ in spec.props}
        rec = ses.run(
            f"MATCH (n:{spec.label}) UNWIND keys(n) AS k RETURN collect(DISTINCT k) AS ks"
        ).single()
        got = set(rec["ks"] or [])
        if got != want:
            miss, over = sorted(want - got), sorted(got - want)
            print(f"    🔴 FAIL {spec.label}: 누락 {miss} · 초과 {over}")
            prop_fails += 1
    fails += prop_fails
    if prop_fails == 0:
        print(f"    ✅ {len(M.NODES)} 라벨 전수 일치 — 본문·시계열·판정 속성 유입 0")

    # --- 4. 값 대조 — 「같은 것을 두 번 만들었다」와 「PG와 같다」는 다른 질문이다 -------
    #
    # 🔴 두 번 투영한 덤프가 같으면 «결정적»이라는 뜻일 뿐, 원천과 같다는 뜻이 아니다.
    #    둘 다 똑같이 틀릴 수 있다(005 「①만 하면 두 번 똑같이 어긋난다」와 같은 함정).
    #    그래서 속성 «값»을 PG에서 다시 읽어 전량 대조한다. 규모가 작아 전량이 가능하다.
    print("[4] 값 대조 — PG 원천 ↔ 그래프 전량(속성 값 포함)")
    val_fails = 0
    for spec in M.NODES:
        cur.execute(spec.sql)
        cols = [d.name for d in cur.description]
        want = {}
        for row in cur.fetchall():
            d = {c: canon(v) for c, v in zip(cols, row)}
            # NULL은 그래프에서 «속성 자체가 없다»(Neo4j가 null 속성을 저장하지 않는다).
            want[d["id"]] = {k: fmt(v) for k, v in d.items() if v is not None}
        got = {}
        for rec in ses.run(f"MATCH (n:{spec.label}) RETURN n"):
            p = dict(rec["n"])
            got[p["id"]] = {k: fmt(v) for k, v in p.items()}
        if got != want:
            diff = [k for k in set(want) | set(got) if want.get(k) != got.get(k)]
            print(f"    🔴 FAIL {spec.label}: 값이 다른 노드 {len(diff)}건 — {sorted(diff)[:3]}")
            val_fails += 1
    for rel in M.projected():
        cur.execute(rel.sql)
        cols = [d.name for d in cur.description]
        want_r = sorted(
            (r[0], r[1], tuple(sorted((c, fmt(canon(v)))
                                      for c, v in zip(cols[2:], r[2:]) if v is not None)))
            for r in cur.fetchall()
        )
        got_r = sorted(
            (rec["a"], rec["b"], tuple(sorted((k, fmt(v)) for k, v in (rec["p"] or {}).items())))
            for rec in ses.run(
                f"MATCH (a:{rel.start})-[r:{rel.rel_type}]->(b:{rel.end}) "
                f"RETURN a.id AS a, b.id AS b, properties(r) AS p")
        )
        if got_r != want_r:
            only_pg = [x for x in want_r if x not in got_r][:2]
            only_g = [x for x in got_r if x not in want_r][:2]
            print(f"    🔴 FAIL {rel.code} {rel.rel_type}: PG에만 {only_pg} · 그래프에만 {only_g}")
            val_fails += 1
    fails += val_fails
    if val_fails == 0:
        print(f"    ✅ 노드 {len(M.NODES)}라벨 · 관계 {len(M.projected())}종 전량 값 일치")

    # --- 5. GS-01 S5 3종 (스펙 §6) ------------------------------------------------
    eq, cp, fm, sop, saf = M.GS01_PATH
    print(f"[5] GS-01 S5 ⓐ 4-hop 경로 — 기대 {' → '.join(M.GS01_PATH)}")
    paths = [tuple(r.values()) for r in ses.run(S5_PATH, eq=eq)]
    hit = [p for p in paths if p == M.GS01_PATH]
    for p in paths:
        mark = "✅" if p == M.GS01_PATH else "  "
        print(f"    {mark} {' → '.join(p)}")
    if not hit:
        print(f"    🔴 FAIL 기대 경로 부재(경로 {len(paths)}건)")
        fails += 1

    print(f"[6] GS-01 S5 ⓑ {fm} -INDICATED_BY-> Sensor (R10 signal_pattern 포함)")
    rows = [(r["sensor"], r["signal_pattern"]) for r in ses.run(S5_INDICATOR, fm=fm)]
    for sensor, pattern in rows:
        print(f"    {'✅' if sensor == 'SN-204-VIB' else '  '} {sensor:14s} {pattern}")
    vib = [p for s, p in rows if s == "SN-204-VIB"]
    if not vib:
        print("    🔴 FAIL SN-204-VIB 지표 관계 부재")
        fails += 1
    elif not vib[0]:
        # 🔴 관계는 있는데 속성이 비면 「신호가 무엇이었나」를 그래프가 답하지 못한다.
        print("    🔴 FAIL signal_pattern 속성이 비었다")
        fails += 1

    print(f"[7] GS-01 S5 ⓒ 경쟁 후보 — {eq} -HAS_FAILURE_MODE-> (R09 직결)")
    comp = [(r["fm"], r["name"]) for r in ses.run(S5_COMPETITOR, eq=eq)]
    for fid, name in comp:
        print(f"    {'✅' if fid == 'FM-TOOL-IMB' else '  '} {fid:18s} {name}")
    if "FM-TOOL-IMB" not in [c[0] for c in comp]:
        print("    🔴 FAIL 경쟁 후보 FM-TOOL-IMB 부재")
        fails += 1
    # 🔴 「2순위」는 그래프가 아니라 R15(incident_diagnosis.rank)가 갖는 값이다. 그래프에서
    #    실제로 무엇이 2순위인지 «따로» 찍는다 — 스펙 §6의 기대 문구와 실물을 뭉개지 않는다.
    ranked = ses.run(
        "MATCH (i:Incident)-[d:DIAGNOSED_AS]->(f:FailureMode) "
        "MATCH (i)-[:AFFECTS]->(:Equipment {id:$eq}) "
        "RETURN i.id AS inc, d.rank AS rank, f.id AS fm ORDER BY inc, rank", eq=eq,
    )
    for r in ranked:
        print(f"       R15 {r['inc']} rank {r['rank']} → {r['fm']}")

    # --- 7. 회귀 최소 4관계 (스펙 §6 「경로 성립 조건」) ----------------------------
    print("[8] 회귀 최소 4관계 — GS-01 경로 구간 실재")
    for code in M.REGRESSION_MINIMUM:
        rel = M.relation(code)
        n = ses.run(
            f"MATCH (:{rel.start})-[r:{rel.rel_type}]->(:{rel.end}) RETURN count(r) AS n"
        ).single()["n"]
        seg = ses.run(
            f"MATCH (a:{rel.start})-[r:{rel.rel_type}]->(b:{rel.end}) "
            f"WHERE a.id IN $ids AND b.id IN $ids RETURN count(r) AS n", ids=list(M.GS01_PATH),
        ).single()["n"]
        mark = "✅" if seg >= 1 else "🔴 FAIL"
        print(f"    {mark} {code} {rel.start}-[:{rel.rel_type}]->{rel.end}: 전체 {n} · GS 경로 구간 {seg}")
        if seg < 1:
            fails += 1

    # --- 9. 원장·짝 판정 (006 · §8.3 ⑦) -------------------------------------------
    print("[9] graph_build 원장 ↔ 현행 manifest · 색인과의 짝(v_graph_index_pairing)")
    cur.execute(
        "SELECT build_id, projection_version, manifest_sha256, ontology_version, "
        "  node_count, relationship_count, status, source_data_sha256, source_scope "
        "FROM graph_build "
        "ORDER BY built_at DESC, build_id DESC LIMIT 1"
    )
    row = cur.fetchone()
    if row is None:
        print("    🔴 FAIL graph_build 0행 — 그래프는 있는데 «무엇이 만들었는지»가 원장에 없다")
        fails += 1
    else:
        bid, pver, msha, onto, nn, nr, status, src_sha, src_scope = row
        print(f"    {pver} · ontology {onto} · 노드 {nn} · 관계 {nr} · {status} (build_id={bid[:8]}…)")
        # 🔴 원장의 지문이 «지금 코드»의 지문과 다르면, DB에 있는 그래프는 다른 규칙으로 만든
        #    것이다. 이 축이 없으면 manifest를 고친 뒤 재투영을 잊어도 전부 초록으로 보인다.
        if msha != M.fingerprint():
            print(f"    🔴 FAIL 원장 지문 {msha[:16]}… ≠ 현행 manifest {M.fingerprint()[:16]}… "
                  "— 재투영이 필요하다")
            fails += 1
        if (nn, nr) != (n_node, n_rel):
            print(f"    🔴 FAIL 원장이 적은 수({nn}·{nr}) ≠ 실물({n_node}·{n_rel})")
            fails += 1
        # 🔴 데이터 낡음 축(Q-15). 위의 지문 대조는 «규칙»이 바뀐 경우만 잡는다 — manifest를
        #    한 글자도 안 고치고 PG 데이터만 바꾸면 여기까지 전부 초록이었다. 두 축을 나눠
        #    말해야 「재투영하면 되는가 / 스펙을 다시 봐야 하는가」가 갈린다.
        if src_sha is None:
            print("    🔴 FAIL 원장에 데이터 지문이 없다 — 이 투영은 «무엇을 읽었는지»를 "
                  "관측하지 않았다(008 이전 빌드). 재투영해야 낡음을 판정할 수 있다")
            fails += 1
        else:
            from psycopg.types.json import Jsonb

            # 원장이 적은 «사정거리»로 다시 계산한다 — 지금 manifest의 범위로 계산하면
            # 범위가 달라진 것과 데이터가 바뀐 것이 한 불일치로 뭉개진다.
            cur.execute("SELECT graph_source_digest(%s)", (Jsonb(src_scope),))
            cur_src = cur.fetchone()[0]
            n_tab = len(src_scope)
            n_col = sum(len(c) for c in src_scope.values())
            if src_sha != cur_src:
                print(f"    🔴 FAIL 원장 데이터 지문 {src_sha[:16]}… ≠ 현행 {cur_src[:16]}… "
                      "— 투영이 읽는 열이 바뀌었는데 재투영하지 않았다(그래프가 낡았다)")
                fails += 1
            else:
                print(f"    데이터 지문 {src_sha[:16]}… 일치 (원천 {n_tab}테이블 · {n_col}열)")
            # 사정거리 자체가 바뀌었는지는 «따로» 말한다. 새 원천은 재투영 전까지 감시 밖이다.
            now_scope = M.source_scope()
            if {t: sorted(c) for t, c in src_scope.items()} != now_scope:
                a = {f"{t}.{c}" for t, cs in src_scope.items() for c in cs}
                b = {f"{t}.{c}" for t, cs in now_scope.items() for c in cs}
                print(f"    🔴 FAIL 지문 사정거리가 바뀌었다 — 원장 {n_col}열 ≠ 현행 manifest "
                      f"{len(b)}열 (신규 {sorted(b - a)} · 사라짐 {sorted(a - b)}). "
                      "새 원천은 아직 낡음 감시 밖이다 — 재투영해야 들어온다")
                fails += 1
    cur.execute("SELECT pairing, count(*) FROM v_graph_index_pairing GROUP BY 1 ORDER BY 1")
    pair = dict(cur.fetchall())
    if not pair:
        # 🔴 색인 빌드가 없으면 짝은 «판정하지 않는다». 비교 대상이 없는 것을 「맞음」으로
        #    답하면 설정 누락이 정상으로 둔갑한다(004 거울 공란 규율).
        print("    index_build 0행 — 짝은 판정하지 않는다(색인 빌드 전)")
    else:
        print(f"    짝 판정: {pair}")
        bad = {k: v for k, v in pair.items() if k != "PAIRED"}
        if bad:
            cur.execute(
                "SELECT index_build_id, index_ontology_version, graph_ontology_version, pairing "
                "FROM v_graph_index_pairing WHERE pairing <> 'PAIRED' ORDER BY index_built_at LIMIT 5"
            )
            for ib, io, go, pg in cur.fetchall():
                print(f"    🔴 {ib[:8]}… 색인 ontology {io} · 그래프 {go} → {pg}")
            print(f"    🔴 FAIL 짝이 맞지 않는 색인 빌드 {sum(bad.values())}건")
            fails += 1

    verdict = "PASS" if fails == 0 else f"FAIL {fails}건"
    print(f"== 투영 판정: {verdict}")
    return 1 if fails else 0


# --- 끊김 실증 (대조군) -----------------------------------------------------------


def break_drill(drv, db: str) -> int:
    """4관계를 «실제로 끊고» 4-hop이 죽는지 본다. 매번 롤백한다.

    🔴 대조군이 없으면 초록은 아무것도 가르지 못한다(4대 유언). 「경로가 성립한다」만으로는
       그 검사가 «끊겼을 때 울릴 수 있는지»를 알 수 없다 — 여기서 그것을 실측한다.
    """
    eq = M.GS01_PATH[0]
    bad = 0
    with drv.session(database=db) as ses:
        base = [tuple(r.values()) for r in ses.run(S5_PATH, eq=eq)]
        n_base = sum(1 for p in base if p == M.GS01_PATH)
        print(f"[대조군] 끊기 전 기대 경로 {n_base}건 (0이면 이 실증은 무의미하다)")
        if n_base == 0:
            print("    🔴 FAIL 기준선이 이미 없다")
            return 1

    for code, cypher in BREAK_EDGES.items():
        with drv.session(database=db) as ses:
            tx = ses.begin_transaction()
            try:
                deleted = tx.run(cypher).consume().counters.relationships_deleted
                after = [tuple(r.values()) for r in tx.run(S5_PATH, eq=eq)]
                n_after = sum(1 for p in after if p == M.GS01_PATH)
                ok = deleted == 1 and n_after == 0
                print(f"    {'✅' if ok else '🔴 FAIL'} {code} 끊음(관계 {deleted}건) → "
                      f"기대 경로 {n_base} → {n_after}")
                if not ok:
                    bad += 1
            finally:
                tx.rollback()
        with drv.session(database=db) as ses:
            n_back = sum(1 for r in ses.run(S5_PATH, eq=eq)
                         if tuple(r.values()) == M.GS01_PATH)
            if n_back != n_base:
                print(f"    🔴 FAIL {code} 롤백 후 복구 실패: {n_back} ≠ {n_base}")
                bad += 1
    print(f"== 끊김 실증: {'PASS' if bad == 0 else f'FAIL {bad}건'} "
          f"(4관계 전건 끊으면 경로가 죽고, 롤백하면 되돌아온다)")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default=None)
    ap.add_argument("--neo4j-uri", default=None)
    ap.add_argument("--dump", action="store_true")
    ap.add_argument("--break-drill", action="store_true")
    args = ap.parse_args()

    import psycopg
    from neo4j import GraphDatabase

    uri, auth, db = neo4j_params(args.neo4j_uri)
    with GraphDatabase.driver(uri, auth=auth) as drv:
        drv.verify_connectivity()
        if args.dump:
            with drv.session(database=db) as ses:
                dump(ses)
            return 0
        if args.break_drill:
            return break_drill(drv, db)
        with psycopg.connect(dsn_from_env(args.dsn)) as conn, conn.cursor() as cur:
            with drv.session(database=db) as ses:
                return report(ses, cur)


if __name__ == "__main__":
    raise SystemExit(main())
