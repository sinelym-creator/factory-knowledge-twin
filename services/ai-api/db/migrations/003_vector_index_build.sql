-- =============================================================================
-- 003_vector_index_build.sql — 임베딩 차원 확정 + index build 원장
--
-- 🔴 유일 원천 = docs/product/data-ontology-spec.md(동결 v0.1) §3.3·§4
--                + docs/baseline/poc-baseline-v0.2.md §8.3(색인 일치 검증 9항목)
--
-- 무엇이 확정되어 이 파일이 생겼는가 (T1-4 게이트 ②·③ · 오케스트레이터 판정 2026-08-29):
--   chunking_policy_version = 1  = section_sentence · 512 token · overlap 0  (정오표 E-3)
--   임베더                        = sentence-transformers + intfloat/multilingual-e5-small
--   임베딩 차원                   = 384  ← 모델이 정한다. 운영자가 고르는 값이 아니다
--
-- 🔴 왜 001을 고치지 않고 새 파일인가: 001은 전 객체가 `CREATE TABLE IF NOT EXISTS`라,
--    테이블이 이미 있으면 통째로 건너뛴다. 001의 `vector(:embedding_dim)`을 384로 바꿔
--    적어도 «이미 만들어진 DB»에는 영원히 반영되지 않는다. 001 주석이 예고한 「모델 확정 시
--    신규 마이그레이션으로 교체」가 바로 이 파일이다(002와 같은 이유·같은 방식).
--
-- 🔴 migrate.ps1 -EmbeddingDim 과의 관계: 001은 파라미터로 차원을 받지만, 모델이 확정된
--    지금부터 차원은 «모델의 성질»이지 선택지가 아니다. 이 파일이 384로 못박으므로
--    -EmbeddingDim 에 무엇을 주든 최종 상태는 384다. 파라미터는 001 단독 적용(모델 미정
--    상태)의 잔재로만 남는다.
--
-- 🔴 재실행 멱등: 차원이 이미 384면 ALTER 하지 않고, 열·테이블·인덱스는 IF NOT EXISTS,
--    제약은 pg_constraint 직접 조회(ADD CONSTRAINT에는 IF NOT EXISTS가 없다 · 002 선례).
-- =============================================================================

-- =============================================================================
-- 1. document_chunk — 차원 확정(768 자리표시자 → 384) + 「무엇이 만들었는가」 기록 열
-- =============================================================================
--
-- 기록 열을 chunk 행에 두는 이유: chunk는 «정책과 모델의 산물»이다. 어떤 정책으로 잘렸고
-- 어떤 모델로 임베딩됐는지가 행 자체에 없으면, 정책이 바뀐 뒤 남은 행을 구분할 방법이
-- 원장(index_build)과의 조인밖에 없어진다. 검색 경로에서 그 조인을 강요하지 않는다.

DO $$
DECLARE
  cur_dim  integer;
  n_vec    bigint;
BEGIN
  -- pgvector는 차원을 typmod에 그대로 담는다(미지정이면 -1).
  SELECT atttypmod INTO cur_dim
    FROM pg_attribute
   WHERE attrelid = 'document_chunk'::regclass AND attname = 'embedding';

  IF cur_dim = 384 THEN
    RAISE NOTICE '003: embedding 이미 vector(384) — 차원 변경 건너뜀';
  ELSE
    -- 차원이 바뀌면 기존 벡터는 «형이 달라» 보존이 불가능하다. 조용히 지우지 않고 센다.
    -- pgvector는 파생 색인이라(스펙 §4 · baseline §8.2) 원본 손실이 아니라 재생성 대상이다.
    SELECT count(*) INTO n_vec FROM document_chunk WHERE embedding IS NOT NULL;
    IF n_vec > 0 THEN
      RAISE NOTICE '003: 차원 % → 384 전환으로 기존 벡터 %건을 비운다 — 색인 재빌드가 필요하다 (build_index.py)',
                   cur_dim, n_vec;
      UPDATE document_chunk SET embedding = NULL WHERE embedding IS NOT NULL;
    END IF;
    ALTER TABLE document_chunk ALTER COLUMN embedding TYPE vector(384);
    RAISE NOTICE '003: embedding → vector(384) 적용';
  END IF;
END $$;

ALTER TABLE document_chunk
  ADD COLUMN IF NOT EXISTS embedding_model          text,
  ADD COLUMN IF NOT EXISTS chunking_policy_version  integer;

COMMENT ON COLUMN document_chunk.embedding_model IS
  '이 벡터를 만든 임베딩 모델 ID(예: intfloat/multilingual-e5-small). 모델이 바뀌면 벡터끼리 비교할 수 없다.';
COMMENT ON COLUMN document_chunk.chunking_policy_version IS
  '이 chunk를 자른 정책 버전(스펙 §3.3 chunk_sha256은 이 값에 종속). 정오표 E-3 = v1.';

DO $$
DECLARE
  n_null bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_chunk_policy_version_positive') THEN
    ALTER TABLE document_chunk
      ADD CONSTRAINT ck_chunk_policy_version_positive
      CHECK (chunking_policy_version IS NULL OR chunking_policy_version >= 1);
  END IF;

  -- 🔴 NOT NULL은 «비울 수 있을 때만» 건다. 이미 기록 없는 chunk가 있는 DB에서 migrate가
  --    실패하면 운영자는 마이그레이션을 못 돌린다 — 그 경우는 막지 말고 «말해준다».
  SELECT count(*) INTO n_null FROM document_chunk
   WHERE embedding_model IS NULL OR chunking_policy_version IS NULL;
  IF n_null = 0 THEN
    ALTER TABLE document_chunk ALTER COLUMN embedding_model         SET NOT NULL;
    ALTER TABLE document_chunk ALTER COLUMN chunking_policy_version SET NOT NULL;
  ELSE
    RAISE NOTICE '003: 기록 열이 빈 chunk %건 — NOT NULL 보류. 색인 재빌드 후 migrate 재실행하면 걸린다', n_null;
  END IF;
END $$;

-- =============================================================================
-- 2. index_build — 색인 일치 검증 원장 (baseline §8.3 9항목 · 스펙 §4 저장 분담표)
-- =============================================================================
--
-- 행 입도 = (한 번의 빌드) × (그 빌드가 색인한 source revision) 1행.
-- §8.3이 요구하는 「source document ID와 revision」이 행마다 필요하고, STALE 판정은
-- revision 단위 비교라 빌드 단위 1행으로는 성립하지 않는다.
--
-- 🔴 revision_id에 FK를 «걸지 않는다» — 이유 2가지:
--    ① 원장은 자기가 기술하는 대상보다 오래 살아야 한다. data/seed.ps1의 load.sql은
--       `TRUNCATE document_revision ... CASCADE`를 돈다. FK가 있으면 seed 한 번에
--       빌드 이력이 «조용히» 통째로 사라진다 — 감사 기록이 그렇게 지워지면 안 된다.
--    ② STALE 판정(스펙 §3.3)은 「빌드 당시의 sha」와 「현행 revision의 sha」를 비교한다.
--       그 비교는 revision 행이 교체된 뒤에 «의미가 생긴다». 참조 무결성으로 옛 기록을
--       끌어 지우면 판정 자체가 불가능해진다.
--    대신 id 형식은 document_revision.id와 «같은 패턴»으로 못박는다(오타 유입 차단).

CREATE TABLE IF NOT EXISTS index_build (
  -- ── 빌드 식별
  build_id       text        NOT NULL,     -- 한 번의 빌드 실행(같은 실행의 모든 행이 공유)
  revision_id    text        NOT NULL
                 CHECK (revision_id ~ '^DOC-[A-Z]{3,4}-[0-9]{4}@r[0-9]+$'),
  -- ── §8.3 ① source document ID와 revision (revision_id에서 파생 · 조회 편의로 분해 보관)
  document_id    text        NOT NULL CHECK (document_id ~ '^DOC-[A-Z]{3,4}-[0-9]{4}$'),
  revision_no    integer     NOT NULL CHECK (revision_no >= 1),
  -- ── §8.3 ② source SHA-256 (🔴 STALE 판정의 좌변 · GS-01 S6)
  source_sha256  char(64)    NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  -- ── §8.3 ③ chunking policy version
  chunking_policy_version integer NOT NULL CHECK (chunking_policy_version >= 1),
  -- ── §8.3 ④ embedding model과 dimension
  embedding_model text       NOT NULL,
  embedding_dim  integer     NOT NULL CHECK (embedding_dim > 0),
  -- ── §8.3 ⑤ index 생성 시각
  built_at       timestamptz NOT NULL DEFAULT now(),
  -- ── §8.3 ⑥ ontology version (스펙 §3.3 정본 = packages/ontology/ontology-version.json)
  ontology_version text      NOT NULL,
  -- ── §8.3 ⑦ graph projection version
  --    🔴 T1-5(그래프 투영) 미착수라 지금은 NULL이 «참»이다. 자리표시자 문자열을 넣으면
  --       「투영이 있었다」는 거짓이 원장에 남는다(baseline §0.2 측정-주장 경계).
  graph_projection_version text,
  -- ── §8.3 ⑧ build status
  status         text        NOT NULL DEFAULT 'success'
                 CHECK (status IN ('success', 'failed', 'skipped')),
  -- ── 결과 계수 · 실패 사유
  chunk_count    integer     NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  error          text,
  PRIMARY KEY (build_id, revision_id),
  -- 모순 행 차단: 실패한 빌드가 chunk를 남겼다고 말할 수 없고, 실패에는 사유가 있어야 한다
  CHECK (status <> 'failed' OR chunk_count = 0),
  CHECK (status <> 'failed' OR error IS NOT NULL)
);

COMMENT ON COLUMN index_build.error IS
  '실패 사유(status=failed) 또는 건너뛴 사유(status=skipped). 성공 행에서는 NULL.';
COMMENT ON TABLE index_build IS
  'baseline §8.3 색인 일치 검증 원장 — append only. 행 = (빌드 1회) × (색인한 revision).';

-- §8.3 ⑨ drift·stale 여부는 «저장하지 않고 파생»한다 — 아래 view 참조.

CREATE INDEX IF NOT EXISTS ix_index_build_revision ON index_build (revision_id, built_at DESC);
CREATE INDEX IF NOT EXISTS ix_index_build_build    ON index_build (build_id);

-- =============================================================================
-- 3. STALE 판정 view (§8.3 ⑨ · 스펙 §3.3 · baseline §8.3 「STALE INDEX 경고」)
-- =============================================================================
--
-- 🔴 왜 boolean 열이 아니라 view인가: stale은 «지금 시점의 비교 결과»다. 빌드 시점에
--    계산해 저장하면 그 값은 원문이 바뀌는 순간 «스스로 낡는다» — 낡음을 감지하려고 둔
--    필드가 낡는 구조가 된다. 저장하는 것은 사실(빌드 당시 sha)뿐이고, 판정은 조회가 한다.

CREATE OR REPLACE VIEW v_index_freshness AS
SELECT
  r.id                       AS revision_id,
  r.document_id,
  r.approval_state,
  r.content_sha256           AS current_sha256,
  b.source_sha256            AS indexed_sha256,
  b.build_id,
  b.built_at,
  b.chunking_policy_version,
  b.embedding_model,
  b.embedding_dim,
  b.ontology_version,
  b.chunk_count,
  b.status,
  CASE
    WHEN b.revision_id IS NULL                     THEN 'NOT_INDEXED'
    -- 🔴 'SKIPPED'는 결함이 아니라 «의도»다 — 인용 불가 revision(superseded·draft)은
    --    색인하지 않는 것이 스펙 §3.3이다. 실패(BUILD_FAILED)와 같은 칸에 넣지 않는다.
    WHEN b.status = 'skipped'                      THEN 'SKIPPED'
    WHEN b.status = 'failed'                       THEN 'BUILD_FAILED'
    WHEN b.source_sha256 <> r.content_sha256       THEN 'STALE'
    ELSE 'FRESH'
  END AS freshness
FROM document_revision r
LEFT JOIN LATERAL (
  SELECT * FROM index_build ib
   WHERE ib.revision_id = r.id
   ORDER BY ib.built_at DESC, ib.build_id DESC
   LIMIT 1
) b ON true;

COMMENT ON VIEW v_index_freshness IS
  'revision별 최신 빌드 기준 신선도. FRESH·STALE·NOT_INDEXED·BUILD_FAILED (스펙 §3.3 STALE 판정).';

-- =============================================================================
-- 4. 벡터 검색 인덱스 (pgvector HNSW · 코사인)
-- =============================================================================
--
-- 🔴 코사인인 이유: e5 계열은 정규화된 임베딩의 코사인 유사도로 학습·평가된다.
--    L2 연산자 클래스를 걸면 인덱스가 «질의와 다른 거리»로 정렬해 조용히 어긋난다.
-- 🔴 HNSW인 이유: ivfflat은 리스트 학습에 데이터가 필요해 «빈 테이블에 만들면» 품질이
--    무너진다. 이 색인은 seed 후에 채워지므로 데이터 없이도 성립하는 HNSW를 쓴다.
--    (pgvector 0.5.0+ 필요 — 현 이미지 pgvector/pgvector:pg16 = 0.8.2 실측)
-- 🔴 PoC 규모(chunk 수십 건)에서 성능 이득은 사실상 0이다. 여기 두는 이유는 속도가 아니라
--    «질의 경로가 인덱스와 같은 거리 함수를 쓰는지»를 지금 못박기 위해서다.

DO $$
BEGIN
  -- 🔴 버전 «문자열» 비교를 하지 않는다('0.10.0' < '0.5.0'으로 읽힌다). 능력 자체를 묻는다.
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
    CREATE INDEX IF NOT EXISTS ix_chunk_embedding_cos
      ON document_chunk USING hnsw (embedding vector_cosine_ops);
  ELSE
    RAISE NOTICE '003: hnsw 접근 방식 없음(pgvector < 0.5.0) — 인덱스 생략. 순차 스캔으로 동작한다';
  END IF;
END $$;

INSERT INTO schema_migration (filename) VALUES ('003_vector_index_build.sql')
ON CONFLICT (filename) DO NOTHING;
