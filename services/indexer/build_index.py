"""색인 빌드 — document_revision(SSOT) → chunk → 임베딩 → pgvector 적재 (T1-4 게이트 ④).

    $env:PYTHONUTF8='1'
    services\\indexer\\.venv\\Scripts\\python.exe services\\indexer\\build_index.py

🔴 무엇이 정본인가: 본문의 정본은 «PostgreSQL의 document_revision.body»다(스펙 §4 —
   PostgreSQL = 권위 원본 · pgvector = 파생 색인). data/documents/*.md 를 직접 읽지 않는다.
   파일을 읽으면 「DB에 적재된 것」과 「색인된 것」이 갈라져도 아무도 모른다.

🔴 무엇을 색인하는가: `approval_state='approved'` revision «만». 스펙 §3.3이 인용 가능을
   approved로 한정하므로, 그 밖을 색인하면 검색이 «인용해서는 안 되는 문장»을 꺼낸다.
   건너뛴 revision도 원장(index_build)에 status='skipped'로 사유와 함께 남긴다 —
   「왜 이 문서는 검색되지 않는가」에 원장이 답해야 한다.

🔴 멱등: 파생 색인을 통째로 지우고 다시 만든다(baseline §32.3 「삭제 후 재생성」).
   같은 seed에서 두 번 돌리면 document_chunk가 «완전히 같은 상태»가 되어야 한다.
   index_build는 예외다 — 원장은 실행마다 1행씩 쌓이는 것이 정상이며, 그것이 감사 기록이다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import unicodedata
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from chunking import CHUNKING_POLICY_VERSION, FROZEN_POLICY, HFCounter, chunk, normalize  # noqa: E402

MODEL_ID = "intfloat/multilingual-e5-small"

# 🔴 e5 계열은 「passage: 」/「query: 」 접두를 붙여 학습됐다. 문서 쪽에 접두를 빼면
#    질의와 다른 분포로 인코딩되어 유사도가 조용히 나빠진다 — 오류가 아니라 «품질 저하»로
#    나타나므로 실행 중에는 보이지 않는다. 접두 토큰만큼 입력이 길어지므로 상한 재실측 대상.
PASSAGE_PREFIX = "passage: "

ONTOLOGY_VERSION_FILE = ROOT / "packages" / "ontology" / "ontology-version.json"


# --- 접속 -----------------------------------------------------------------------


def dsn_from_env(explicit: str | None) -> str:
    if explicit:
        return explicit
    # 좌석별 병렬 스택(dev-environment §4.2)은 POSTGRES_PORT만 달리 준다.
    host = os.environ.get("PGHOST", "127.0.0.1")
    port = os.environ.get("PGPORT") or os.environ.get("POSTGRES_PORT", "5434")
    user = os.environ.get("PGUSER") or os.environ.get("POSTGRES_USER", "fkt")
    pw = os.environ.get("PGPASSWORD") or os.environ.get("POSTGRES_PASSWORD", "fkt_local_dev")
    db = os.environ.get("PGDATABASE") or os.environ.get("POSTGRES_DB", "fkt")
    return f"host={host} port={port} user={user} password={pw} dbname={db}"


# --- 사전 점검 -------------------------------------------------------------------


def preflight(cur) -> int:
    """003이 적용된 DB인지 «묻고» 아니면 멈춘다. 없는 열에 넣다가 나는 오류보다 낫다."""
    cur.execute("SELECT 1 FROM schema_migration WHERE filename = '003_vector_index_build.sql'")
    if cur.fetchone() is None:
        raise SystemExit(
            "003_vector_index_build.sql 미적용 — 먼저 `pwsh services/ai-api/db/migrate.ps1`"
        )
    cur.execute(
        "SELECT atttypmod FROM pg_attribute "
        "WHERE attrelid = 'document_chunk'::regclass AND attname = 'embedding'"
    )
    dim = cur.fetchone()[0]
    cur.execute("SELECT to_regclass('index_build')")
    if cur.fetchone()[0] is None:
        raise SystemExit("index_build 테이블 없음 — 003 적용 상태를 확인하라")
    return dim


def ontology_version() -> str:
    if not ONTOLOGY_VERSION_FILE.exists():
        raise SystemExit(f"ontology 정본 없음: {ONTOLOGY_VERSION_FILE} (스펙 §3.3)")
    return json.loads(ONTOLOGY_VERSION_FILE.read_text(encoding="utf-8"))["ontology_version"]


# --- 본체 -----------------------------------------------------------------------


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def vector_literal(vec) -> str:
    """pgvector 텍스트 표현. float32 값을 repr로 적어 왕복에서 비트가 변하지 않게 한다."""
    return "[" + ",".join(repr(float(v)) for v in vec) + "]"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default=None, help="libpq DSN (기본: 환경변수)")
    ap.add_argument("--build-id", default=None, help="빌드 식별자(기본: uuid4)")
    args = ap.parse_args()

    import psycopg

    build_id = args.build_id or uuid.uuid4().hex
    onto = ontology_version()

    with psycopg.connect(dsn_from_env(args.dsn)) as conn:
        with conn.cursor() as cur:
            col_dim = preflight(cur)

            # --- 1. 원천 수집 (approved만 색인 · 그 외는 사유와 함께 원장에) --------------
            cur.execute(
                "SELECT id, document_id, revision_no, content_sha256, approval_state, body "
                "FROM document_revision ORDER BY id"
            )
            rows = cur.fetchall()
            if not rows:
                raise SystemExit("document_revision 0행 — 먼저 `pwsh data/seed.ps1`")

            approved = [r for r in rows if r[4] == "approved"]
            skipped = [r for r in rows if r[4] != "approved"]
            print(f"== 원천: revision {len(rows)}행 · approved {len(approved)} · 건너뜀 {len(skipped)}")

            # 🔴 정규화 대조: 스펙 §3.3의 정규화를 거친 본문의 sha가 DB의 content_sha256과
            #    같은지 «본다». 다르면 STALE 판정의 좌·우변이 서로 다른 정의 위에 서게 된다.
            norm_mismatch = [
                r[0] for r in approved if sha256(normalize(r[5] or "")) != r[3]
            ]

            # --- 2. 계수기·모델 -------------------------------------------------------
            from tokenizers import Tokenizer

            tok = Tokenizer.from_pretrained(MODEL_ID)
            tok.no_truncation()  # 🔴 켜져 있으면 긴 chunk가 «조용히» 짧게 세어진다
            counter = HFCounter(tokenizer=tok, name=MODEL_ID)

            t0 = time.perf_counter()
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(MODEL_ID)
            load_s = time.perf_counter() - t0
            # 6.x에서 이름이 바뀌었다 — 구버전에서도 돌게 둘 다 본다
            model_dim = (
                model.get_embedding_dimension()
                if hasattr(model, "get_embedding_dimension")
                else model.get_sentence_embedding_dimension()
            )
            max_seq = model.max_seq_length
            if model_dim != col_dim:
                raise SystemExit(
                    f"차원 불일치: 모델 {model_dim} ≠ document_chunk.embedding vector({col_dim})"
                )

            # --- 3. chunk ------------------------------------------------------------
            per_rev: dict[str, list] = {}
            for rev_id, doc_id, rev_no, sha, _state, body in approved:
                per_rev[rev_id] = chunk(body or "", counter, FROZEN_POLICY)

            all_chunks = [(rev, c) for rev, cs in per_rev.items() for c in cs]
            if not all_chunks:
                raise SystemExit("chunk 0건 — 본문이 비었는지 확인하라")

            max_tok = max(c.n_tokens for _, c in all_chunks)
            if max_tok > FROZEN_POLICY.max_tokens:
                raise SystemExit(
                    f"🔴 동결 위반: chunk 최대 {max_tok} token > 예산 {FROZEN_POLICY.max_tokens} — "
                    "빌드를 중단한다. 동결 재개정은 오케스트레이터 몫이다."
                )

            # 🔴 접두를 붙인 «실제 임베딩 입력»으로 모델 상한을 다시 잰다. chunk 예산을
            #    지켰어도 접두 때문에 상한을 넘으면 모델이 말없이 끝을 자른다.
            texts = [PASSAGE_PREFIX + c.text for _, c in all_chunks]
            in_tok = [len(tok.encode(t).ids) for t in texts]
            max_in = max(in_tok)
            over = sum(1 for n in in_tok if n > max_seq)
            if over:
                raise SystemExit(
                    f"🔴 임베딩 입력 {over}건이 모델 상한 {max_seq} 초과(최대 {max_in}) — 빌드 중단"
                )

            # --- 4. 임베딩 ------------------------------------------------------------
            t1 = time.perf_counter()
            vecs = model.encode(
                texts, batch_size=16, show_progress_bar=False, normalize_embeddings=True
            )
            encode_s = time.perf_counter() - t1

            # --- 5. 적재 (파생 색인 전량 재생성 · 단일 트랜잭션) --------------------------
            cur.execute("DELETE FROM document_chunk")
            for (rev_id, c), vec in zip(all_chunks, vecs):
                cur.execute(
                    "INSERT INTO document_chunk "
                    "(id, revision_id, chunk_index, text, token_count, chunk_sha256, "
                    " embedding, embedding_model, chunking_policy_version) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s, %s)",
                    (
                        f"{rev_id}#{c.index:03d}",
                        rev_id,
                        c.index,
                        c.text,
                        c.n_tokens,
                        sha256(c.text),
                        vector_literal(vec),
                        MODEL_ID,
                        CHUNKING_POLICY_VERSION,
                    ),
                )

            # --- 6. 원장 (baseline §8.3) ----------------------------------------------
            for rev_id, doc_id, rev_no, sha, _state, _body in approved:
                cur.execute(
                    "INSERT INTO index_build (build_id, revision_id, document_id, revision_no, "
                    " source_sha256, chunking_policy_version, embedding_model, embedding_dim, "
                    " ontology_version, graph_projection_version, status, chunk_count) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,'success',%s)",
                    (
                        build_id, rev_id, doc_id, rev_no, sha, CHUNKING_POLICY_VERSION,
                        MODEL_ID, model_dim, onto, len(per_rev[rev_id]),
                    ),
                )
            for rev_id, doc_id, rev_no, sha, state, _body in skipped:
                cur.execute(
                    "INSERT INTO index_build (build_id, revision_id, document_id, revision_no, "
                    " source_sha256, chunking_policy_version, embedding_model, embedding_dim, "
                    " ontology_version, graph_projection_version, status, chunk_count, error) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,'skipped',0,%s)",
                    (
                        build_id, rev_id, doc_id, rev_no, sha, CHUNKING_POLICY_VERSION,
                        MODEL_ID, model_dim, onto,
                        f"approval_state={state} — 스펙 §3.3상 인용 불가 revision은 색인하지 않는다",
                    ),
                )
        conn.commit()

    # --- 7. 보고 ------------------------------------------------------------------
    print(f"== 정책 v{CHUNKING_POLICY_VERSION} {FROZEN_POLICY.label} · 모델 {MODEL_ID}({model_dim}d)")
    print(f"== chunk {len(all_chunks)}건 / revision {len(per_rev)}건 · build_id={build_id}")
    print(f"   chunk 최대 {max_tok} token (예산 {FROZEN_POLICY.max_tokens})")
    print(f"   임베딩 입력 최대 {max_in} token (모델 상한 {max_seq} · 접두 '{PASSAGE_PREFIX.strip()}' 포함)")
    print(f"   모델 로드 {load_s:.2f}s · 임베딩 {encode_s:.2f}s ({encode_s / len(texts) * 1000:.1f}ms/chunk)")
    if norm_mismatch:
        print(
            f"🔴 정규화 불일치 {len(norm_mismatch)}건 — content_sha256이 스펙 §3.3 정규화본의 "
            f"sha와 다르다: {norm_mismatch[:5]}"
        )
    else:
        print("   정규화 대조: approved 전건 content_sha256 = sha256(normalize(body)) 일치")
    print(f"   NFC 확인: {'통과' if all(unicodedata.is_normalized('NFC', c.text) for _, c in all_chunks) else '🔴 미정규'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
