-- =============================================================================
-- 006_graph_projection.sql — 그래프 투영 원장 + 색인↔투영 짝 판정 view
--
-- 🔴 유일 원천 = docs/product/data-ontology-spec.md(동결 v0.1) §0 P1·§4
--                + docs/baseline/poc-baseline-v0.2.md §8.3 ⑦(graph projection version)
--                + 오케스트레이터 판정 2026-08-29(T1-5 게이트 ④ — B안 승인)
--
-- 무엇이 확정되어 이 파일이 생겼는가:
--   투영 정본     = packages/ontology/projection-version.json
--                   { projection_version, manifest_sha256 }
--   기록 문자열   = {SemVer}+{지문 8자}  (예: 0.1.0+687448cb)
--   🔴 §8.3 ⑦ 충족 방식 = «열»이 아니라 «답». index_build.graph_projection_version은
--      NULL로 남고, 짝 판정은 아래 view가 조회 시점에 낸다(003이 ⑨ drift·stale을 열이
--      아니라 view로 충족한 해석 선례 그대로 · 오케 확정).
--
-- 🔴 왜 index_build 열을 채우지 않는가: 색인 빌드는 그래프를 «보지 않는다». 파일에 적힌
--    값을 읽어 옮겨 적으면, 투영이 없거나 낡았어도 원장이 「있었다」고 말한다 — 003 주석이
--    자리표시자를 거부한 것과 같은 거짓이다. 원장은 «자기가 관측한 사실»만 적는다.
--
-- 🔴 001~005 무수정. 기존 index_build 행 소급 갱신 없음(append-only).
-- 🔴 재실행 멱등: 테이블·인덱스는 IF NOT EXISTS, view는 CREATE OR REPLACE, COMMENT는 재선언.
-- =============================================================================

-- =============================================================================
-- 1. graph_build — 그래프 투영 실행 원장 (append only)
-- =============================================================================
--
-- 행 입도 = «한 번의 투영 실행» 1행. index_build가 (빌드)×(revision)인 것과 다르다 —
-- 투영은 그래프 전체를 통째로 지우고 다시 만드는 «한 덩어리»라, 쪼갤 단위가 없다.
--
-- 🔴 노드·관계에 FK를 걸지 않는다(003 index_build 선례와 같은 이유): 원장은 자기가
--    기술하는 대상보다 오래 살아야 한다. 그래프는 언제든 지워지는 파생물이고(스펙 §0 P1),
--    지워질 때 「무엇이 언제 만들어졌었나」까지 함께 사라지면 감사 기록이 아니다.
--    애초에 대상이 다른 저장소(Neo4j)에 있어 FK를 걸 «수»도 없다 — 그래서 형식으로 못박는다.

CREATE TABLE IF NOT EXISTS graph_build (
  build_id           text        PRIMARY KEY,
  -- 「어떤 규칙으로 만들었는가」 = SemVer + manifest 지문 8자. 사람이 읽는 축(SemVer)과
  -- 잊을 수 없는 축(지문)을 한 문자열에 둔다.
  projection_version text        NOT NULL
                     CHECK (projection_version ~ '^[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]{8}$'),
  -- 지문 전문(64자). 8자 접미는 사람이 읽는 용도이고, 대조는 이 열로 한다.
  manifest_sha256    char(64)    NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  -- §3.3 ontology_version — 색인과 «짝»을 판정하는 축이다(아래 view).
  ontology_version   text        NOT NULL CHECK (ontology_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  node_count         integer     NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  relationship_count integer     NOT NULL DEFAULT 0 CHECK (relationship_count >= 0),
  built_at           timestamptz NOT NULL DEFAULT now(),
  status             text        NOT NULL DEFAULT 'success'
                     CHECK (status IN ('success', 'failed')),
  error              text,
  -- 모순 행 차단(index_build 선례): 실패한 투영이 노드를 남겼다고 말할 수 없고,
  -- 실패에는 사유가 있어야 한다.
  CHECK (status <> 'failed' OR (node_count = 0 AND relationship_count = 0)),
  CHECK (status <> 'failed' OR error IS NOT NULL)
);

COMMENT ON TABLE graph_build IS
  '그래프 투영 실행 원장 — append only. 행 = 투영 1회(전체 재생성). 짝 판정은 v_graph_index_pairing.';
COMMENT ON COLUMN graph_build.projection_version IS
  '{SemVer}+{manifest 지문 8자}. 정본 = packages/ontology/projection-version.json.';
COMMENT ON COLUMN graph_build.manifest_sha256 IS
  'services/projector/manifest.py 정규 직렬화의 SHA-256. 정본 파일과 어긋나면 빌드가 멈춘다.';

CREATE INDEX IF NOT EXISTS ix_graph_build_built ON graph_build (built_at DESC, build_id DESC);

-- =============================================================================
-- 2. index_build.graph_projection_version — «왜 비어 있는가»를 성문한다
-- =============================================================================
--
-- 🔴 값을 넣지 않는다. 003이 「투영 미착수라 NULL이 참」이라 적었고, 투영이 생긴 지금도
--    이 열은 NULL이다 — 이유가 바뀌었다: 이제는 «색인 경로가 그래프를 관측하지 않기» 때문이다.
--    주석이 없으면 다음 좌석이 「채우는 것을 잊었다」고 읽고 소급해 채울 것이다.

COMMENT ON COLUMN index_build.graph_projection_version IS
  'NULL 고정 — 색인 빌드는 그래프를 관측하지 않으므로 관측하지 않은 것을 적지 않는다. '
  '§8.3 ⑦의 답은 v_graph_index_pairing이 조회 시점에 낸다(006 · 오케 판정 2026-08-29). '
  '기존 행 소급 갱신 금지(append-only).';

-- =============================================================================
-- 3. v_graph_index_pairing — 「이 색인은 어떤 투영과 짝인가」 (§8.3 ⑦의 답)
-- =============================================================================
--
-- 🔴 왜 저장이 아니라 view인가: 짝 맞음은 «지금 시점의 비교 결과»다. 색인 빌드 시점에
--    계산해 적으면 그 값은 그래프를 다시 만드는 순간 스스로 낡는다(003 stale view와 같은 이유).
-- 🔴 어느 투영과 비교하는가: «가장 최근 투영» 하나다. 그래프는 통째로 재생성되는 단일
--    현재 상태라, 색인 행마다 다른 투영이 짝일 수 없다.
-- 🔴 투영 기록이 없으면 «PAIRED가 아니다» — NO_PROJECTION이라고 말한다. 비교 대상이 없는
--    것을 「맞음」으로 답하면, 설정 누락이 정상으로 둔갑한다(004 거울 공란 처리와 같은 규율).

CREATE OR REPLACE VIEW v_graph_index_pairing AS
WITH idx AS (
  SELECT
    build_id,
    min(built_at)                      AS built_at,
    min(ontology_version)              AS ontology_version,
    count(DISTINCT ontology_version)   AS n_onto,
    count(*) FILTER (WHERE status = 'success') AS indexed_revisions
  FROM index_build
  GROUP BY build_id
),
g AS (
  SELECT * FROM graph_build ORDER BY built_at DESC, build_id DESC LIMIT 1
)
SELECT
  idx.build_id                AS index_build_id,
  idx.built_at                AS index_built_at,
  idx.ontology_version        AS index_ontology_version,
  idx.indexed_revisions,
  g.build_id                  AS graph_build_id,
  g.projection_version,
  g.manifest_sha256,
  g.ontology_version          AS graph_ontology_version,
  g.built_at                  AS graph_built_at,
  CASE
    -- 한 빌드 안에서 ontology_version이 갈리면 그 빌드 자체가 모순이다. 짝 판정보다 먼저 말한다.
    WHEN idx.n_onto > 1                              THEN 'INDEX_BUILD_INCONSISTENT'
    WHEN g.build_id IS NULL                          THEN 'NO_PROJECTION'
    WHEN g.status <> 'success'                       THEN 'PROJECTION_FAILED'
    WHEN g.ontology_version <> idx.ontology_version  THEN 'ONTOLOGY_MISMATCH'
    ELSE 'PAIRED'
  END AS pairing
FROM idx LEFT JOIN g ON true;

COMMENT ON VIEW v_graph_index_pairing IS
  '색인 빌드별 «현행 그래프 투영»과의 짝 판정 — PAIRED·NO_PROJECTION·PROJECTION_FAILED·'
  'ONTOLOGY_MISMATCH·INDEX_BUILD_INCONSISTENT (baseline §8.3 ⑦ · 오케 판정 B안).';

INSERT INTO schema_migration (filename) VALUES ('006_graph_projection.sql')
ON CONFLICT (filename) DO NOTHING;
