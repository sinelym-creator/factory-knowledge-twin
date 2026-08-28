-- =============================================================================
-- 004_ontology_freshness.sql — STALE 판정에 ontology_version 축을 더한다
--
-- 🔴 근거 = docs/product/data-ontology-spec.md §3.3 STALE 판정:
--    「index build 기록의 source_sha256 ≠ 현행 approved revision의 content_sha256 →
--      STALE INDEX 표기. **ontology_version 불일치도 동일 처리.**」
--    003은 앞 절반(sha)만 구현했다. 이 파일이 뒷 절반을 채운다.
--
-- 🔴 001~003 무수정 — 003의 view는 `CREATE OR REPLACE VIEW`로 «교체»한다(열 추가는
--    맨 뒤에만 가능하다는 제약 때문에 stale_reason을 마지막 열에 둔다).
--
-- 🔴 왜 테이블이 하나 더 필요한가: 「현행 ontology_version」이 DB에 없었다. 정본은
--    packages/ontology/ontology-version.json(스펙 §3.3 지정 경로)이고, view는 파일을 읽지
--    못한다. 비교 대상이 DB 안에 없으면 이 판정은 성립하지 않는다 — 그래서 «정본의 거울»을
--    한 행짜리 테이블로 둔다. 정본은 여전히 파일이며, 거울이 어긋나면 빌드가 멈춘다
--    (build_index.py 사전 점검). 거울을 올리는 것은 신규 마이그레이션의 몫이다 —
--    ontology가 바뀌면 대개 DDL도 바뀌므로 마이그레이션이 어차피 따라온다.
-- =============================================================================

-- =============================================================================
-- 1. ontology_registry — 「지금 유효한 ontology_version」 한 행
-- =============================================================================
--
-- 한 행 강제 관용구: PK를 상수 true로 두면 두 번째 행이 물리적으로 들어가지 못한다.
-- 「관리자가 실수로 두 행을 넣어 어느 쪽이 현행인지 모르게 되는」 상태를 스키마가 막는다.

CREATE TABLE IF NOT EXISTS ontology_registry (
  singleton        boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  ontology_version text        NOT NULL CHECK (ontology_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  source           text        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ontology_registry IS
  '현행 ontology_version의 DB 거울. 정본은 packages/ontology/ontology-version.json (스펙 §3.3).';

-- 🔴 004 시점의 정본 값이다. 정본 파일이 올라가면 «신규 마이그레이션»으로 이 행을 올린다.
--    여기서 ON CONFLICT DO NOTHING인 이유: 재실행이 나중 마이그레이션이 올려 둔 값을
--    04 시점 값으로 «되돌리면» 안 되기 때문이다(멱등 ≠ 되감기).
INSERT INTO ontology_registry (singleton, ontology_version, source)
VALUES (true, '0.1.0', 'packages/ontology/ontology-version.json')
ON CONFLICT (singleton) DO NOTHING;

-- =============================================================================
-- 2. v_index_freshness 교체 — ontology 축 추가 + 사유 분리
-- =============================================================================
--
-- 🔴 freshness 값은 «STALE 하나»로 둔다. 스펙이 「동일 처리」라고 못박았으므로 화면·API가
--    두 경우를 다르게 다루면 안 된다. 그러나 원인까지 뭉개면 고칠 곳을 못 찾는다 —
--    그래서 판정(freshness)과 사유(stale_reason)를 «다른 열»로 나눈다.
-- 🔴 거울이 비어 있으면(등록 행 없음) ontology 축은 «판정하지 않는다». 비교 대상이 없는
--    것을 불일치로 부르면, 설정 누락이 데이터 결함으로 둔갑한다.

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
    WHEN reg.ontology_version IS NOT NULL
     AND b.ontology_version <> reg.ontology_version THEN 'STALE'   -- §3.3 「동일 처리」
    ELSE 'FRESH'
  END AS freshness,
  -- 아래 3열은 003에 없던 신규 — CREATE OR REPLACE VIEW 제약상 맨 뒤에만 붙일 수 있다.
  reg.ontology_version       AS current_ontology_version,
  CASE
    WHEN b.revision_id IS NULL OR b.status <> 'success' THEN NULL
    WHEN b.source_sha256 <> r.content_sha256            THEN 'SOURCE_SHA'
    WHEN reg.ontology_version IS NOT NULL
     AND b.ontology_version <> reg.ontology_version     THEN 'ONTOLOGY_VERSION'
    ELSE NULL
  END AS stale_reason
FROM document_revision r
LEFT JOIN LATERAL (
  SELECT * FROM index_build ib
   WHERE ib.revision_id = r.id
   ORDER BY ib.built_at DESC, ib.build_id DESC
   LIMIT 1
) b ON true
LEFT JOIN ontology_registry reg ON true;

COMMENT ON VIEW v_index_freshness IS
  'revision별 최신 빌드 기준 신선도. FRESH·STALE·NOT_INDEXED·BUILD_FAILED (스펙 §3.3). '
  'STALE 사유는 stale_reason 열에서 갈린다 — SOURCE_SHA · ONTOLOGY_VERSION.';

INSERT INTO schema_migration (filename) VALUES ('004_ontology_freshness.sql')
ON CONFLICT (filename) DO NOTHING;
