"""색인 검증 — 인용 온전성·화면 앵커·신선도·검색 실동작 (T1-4 게이트 ④·⑤).

    services\\indexer\\.venv\\Scripts\\python.exe services\\indexer\\verify_index.py
    ...                                          verify_index.py --dump        # 멱등 대조용 정본 덤프
    ...                                          verify_index.py --dump-ledger # 원장 내용열 덤프

🔴 «DB에서 재도출»한다 — 빌드 스크립트가 메모리에 들고 있던 값을 그대로 출력하면
   「적재됐는가」를 한 번도 묻지 않은 채 초록이 난다. 모든 판정은 SELECT 결과로 낸다.

--dump 는 document_chunk의 «내용 전체»(임베딩 포함)를 정렬된 텍스트로 낸다. 두 번 빌드한
뒤 이 출력을 diff 해서 0이면 멱등이다. 임베딩을 뺀 덤프는 「좌표는 같은데 벡터가 흔들리는」
경우를 놓친다 — 그래서 벡터도 넣는다.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_index import MODEL_ID, dsn_from_env  # noqa: E402

# 화면(wireframes.md)이 박은 인용 좌표 4건 — V-1 인수 조건(검증 좌석 이월).
# 🔴 표기 그대로 옮긴다. 「@r 이 없는 것」도 화면의 사실이므로 고치지 않고 그대로 잰다.
WIREFRAME_ANCHORS = [
    ("DOC-MAN-0021#014", "DOC-MAN-0021@r1", 14),
    ("DOC-MAN-0022#009", "DOC-MAN-0022@r1", 9),
    ("DOC-SOP-0014@r2#007", "DOC-SOP-0014@r2", 7),
    ("DOC-MRP-0087#003", "DOC-MRP-0087@r1", 3),
]


def expected_quotes():
    from data.generators.config import EXPECTED_QUOTES

    return list(EXPECTED_QUOTES)


def dump(cur, ledger: bool) -> None:
    if ledger:
        # build_id·built_at 제외 — 실행마다 달라지는 «식별자»이지 내용이 아니다.
        cur.execute(
            "SELECT revision_id, document_id, revision_no, source_sha256, "
            "  chunking_policy_version, embedding_model, embedding_dim, ontology_version, "
            "  coalesce(graph_projection_version,''), status, chunk_count, coalesce(error,'') "
            "FROM index_build WHERE build_id = (SELECT build_id FROM index_build "
            "  ORDER BY built_at DESC, build_id DESC LIMIT 1) ORDER BY revision_id"
        )
    else:
        cur.execute(
            "SELECT id, revision_id, chunk_index, token_count, chunk_sha256, "
            "  embedding_model, chunking_policy_version, embedding::text, text "
            "FROM document_chunk ORDER BY id"
        )
    for row in cur.fetchall():
        print("\t".join(str(v).replace("\n", "\\n").replace("\t", "\\t") for v in row))


def report(cur) -> int:
    fails = 0      # 색인 자체의 결함 — exit 1
    pending = 0    # 색인 밖(화면 정본)에 원인이 있는 미해소 — 보고하되 exit로 삼지 않는다

    # --- 1. 적재 형상 ------------------------------------------------------------
    cur.execute(
        "SELECT count(*), count(embedding), count(DISTINCT revision_id), "
        "  min(token_count), max(token_count) FROM document_chunk"
    )
    n, n_vec, n_rev, tmin, tmax = cur.fetchone()
    print(f"[1] chunk {n}건 / revision {n_rev}건 · 벡터 {n_vec}건 · token {tmin}~{tmax}")
    if n != n_vec:
        print(f"    🔴 FAIL 임베딩 누락 {n - n_vec}건")
        fails += 1
    cur.execute("SELECT count(*) FROM document_chunk WHERE embedding_model <> %s", (MODEL_ID,))
    if cur.fetchone()[0]:
        print("    🔴 FAIL 다른 모델로 만든 chunk가 섞여 있다")
        fails += 1
    # 정규화 임베딩이면 노름이 1이다. 아니면 코사인 인덱스와 질의 전제가 어긋난다.
    # 🔴 `l2_norm(vector)`가 아니라 `vector_norm(vector)`다. pgvector 0.8.2의 l2_norm은
    #    halfvec·sparsevec 오버로드«만» 있어, vector를 넘기면 둘 다로 암시 캐스팅되어
    #    「not unique」로 죽는다 — 이름이 그럴듯해서 더 잘 틀리는 자리다(실측).
    cur.execute("SELECT min(vector_norm(embedding)), max(vector_norm(embedding)) FROM document_chunk")
    lo, hi = cur.fetchone()
    print(f"    벡터 노름 {lo:.6f}~{hi:.6f} (정규화 임베딩이면 1)")
    if not (0.999 < lo and hi < 1.001):
        print("    🔴 FAIL 정규화되지 않은 벡터 — 코사인 전제 붕괴")
        fails += 1

    # --- 2. 신선도 (스펙 §3.3 STALE) ---------------------------------------------
    cur.execute("SELECT freshness, count(*) FROM v_index_freshness GROUP BY 1 ORDER BY 1")
    fresh = dict(cur.fetchall())
    print(f"[2] 신선도: {fresh}")
    if fresh.get("STALE") or fresh.get("BUILD_FAILED") or fresh.get("NOT_INDEXED"):
        print("    🔴 FAIL STALE·실패·미색인 revision 존재")
        fails += 1

    # --- 3. GS-01 기대 인용 온전성 (AC · chunk 좌표 병기) --------------------------
    print("[3] GS-01 S4·S7 기대 인용 — «한 chunk 안에» 온전한가 (좌표 = 화면이 띄울 자리)")
    # 🔴 LIKE를 쓰지 않는다 — 인용문에 「150%」처럼 `%`가 들어 있으면 그 자리가 «와일드카드»가
    #    되어, 원문에 없는 문장도 통과한다. 리터럴 포함 검사는 strpos다.
    for rev_id, quote, screen in expected_quotes():
        cur.execute(
            "SELECT id FROM document_chunk "
            "WHERE revision_id = %s AND strpos(text, %s) > 0 ORDER BY chunk_index",
            (rev_id, quote),
        )
        hits = cur.fetchall()
        if len(hits) == 1:
            print(f"    ✅ {hits[0][0]:24s} 「{quote[:24]}…」 → {screen}")
        elif not hits:
            # 🔴 「없다」가 절단인지 원문 부재인지 구분한다 — 사유를 틀리면 처방이 틀린다.
            cur.execute(
                "SELECT (SELECT count(*) FROM document_chunk WHERE revision_id=%s), "
                "       (SELECT strpos(body, %s) > 0 FROM document_revision WHERE id=%s)",
                (rev_id, quote, rev_id),
            )
            c, in_body = cur.fetchone()
            why = "원문에 없음" if not in_body else f"chunk {c}건 경계에서 절단됨"
            print(f"    🔴 FAIL {rev_id} 「{quote[:24]}…」 — {why}")
            fails += 1
        else:
            ids = ", ".join(h[0] for h in hits)
            print(f"    ⚠ {rev_id} 「{quote[:24]}…」 — {len(hits)}개 chunk에 중복 등장: {ids}")

    # --- 4. V-1 화면 앵커 4좌표 --------------------------------------------------
    # 🔴 이 절의 🔴는 «색인의 실패»가 아니다. 색인은 문서가 가진 만큼만 chunk를 만든다 —
    #    화면이 없는 번호를 가리키고 있는 것이다(원인 = wireframes.md · 오케 scope · V-1).
    #    그래서 exit code로 삼지 않는다. 대신 좌표가 «해소되면» 같은 도구가 ✅로 바뀐다.
    print("[4] wireframes 앵커 4좌표 (V-1 인수 조건 · 0-based #NNN ≡ chunk_index)")
    for shown, rev_id, idx in WIREFRAME_ANCHORS:
        cur.execute(
            "SELECT count(*), min(chunk_index), max(chunk_index) "
            "FROM document_chunk WHERE revision_id = %s",
            (rev_id,),
        )
        c, lo_i, hi_i = cur.fetchone()
        target = f"{rev_id}#{idx:03d}"
        cur.execute("SELECT 1 FROM document_chunk WHERE id = %s", (target,))
        exists = cur.fetchone() is not None
        rng = f"#{lo_i:03d}~#{hi_i:03d}" if c else "없음"
        mark = "✅ 실재" if exists else "🔴 부재"
        note = "" if "@r" in shown else "  ⚠ 화면 표기에 revision(@rN)이 없다"
        print(f"    {mark} 화면 {shown:20s} → {target:24s} · 실재 범위 {rng}({c}건){note}")
        if not exists:
            pending += 1

    # --- 5. 검색 실동작 (벡터가 «쓰이는가») ----------------------------------------
    print("[5] 벡터 검색 실동작 — 질의 「스핀들 베어링 마모 진동」 상위 3")
    from sentence_transformers import SentenceTransformer

    m = SentenceTransformer(MODEL_ID)
    q = m.encode(["query: 스핀들 베어링 마모 진동"], normalize_embeddings=True)[0]
    lit = "[" + ",".join(repr(float(v)) for v in q) + "]"
    cur.execute(
        "SELECT id, round((1 - (embedding <=> %s::vector))::numeric, 4), left(text, 34) "
        "FROM document_chunk ORDER BY embedding <=> %s::vector LIMIT 3",
        (lit, lit),
    )
    for cid, score, head in cur.fetchall():
        print(f"    {score} {cid:24s} {head.strip()[:34]}…")

    verdict = "PASS" if fails == 0 else f"FAIL {fails}건"
    carry = f" · V-1 미해소 {pending}건 이월(원인 = 화면 좌표 · docs scope)" if pending else ""
    print(f"== 색인 판정: {verdict}{carry}")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default=None)
    ap.add_argument("--dump", action="store_true")
    ap.add_argument("--dump-ledger", action="store_true")
    args = ap.parse_args()

    import psycopg

    with psycopg.connect(dsn_from_env(args.dsn)) as conn, conn.cursor() as cur:
        if args.dump or args.dump_ledger:
            dump(cur, args.dump_ledger)
            return 0
        return report(cur)


if __name__ == "__main__":
    raise SystemExit(main())
