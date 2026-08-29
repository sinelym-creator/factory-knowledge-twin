-- =============================================================================
-- 008_graph_source_digest.sql — 그래프 «낡음(STALE)» 축 신설 (Q-15)
--
-- 🔴 근거 = levi2 5대 T1-5 독립 검증 회부 ④(PR#85 evidence) + 오케 발주 2026-08-29.
--    「색인은 source_sha256 ↔ content_sha256으로 STALE을 내는데, 그래프에는 데이터 지문이
--     없어 PG가 바뀐 뒤 재투영을 잊으면 그래프가 «조용히» 낡는다.」
--
-- 무엇이 없었는가 (006 실물 기준):
--   graph_build가 가진 축 = manifest_sha256(«규칙»의 지문) · ontology_version · built_at.
--   셋 다 「무엇이 만들었는가」를 말할 뿐, 「무엇을 «읽고» 만들었는가」는 말하지 않는다.
--   그래서 PG 데이터만 바뀌면 원장도 짝 판정도 전부 초록인 채로 그래프가 낡는다.
--
-- 🔴 verify_projection이 이미 값을 대조하지 않는가 — 한다. 다만 그것은 Neo4j를 열고 전량을
--    다시 읽는 «검사 실행»이다. 제품이 답을 낼 때 보는 것은 이 짝 판정 view이고, view는
--    PG만 보고 답해야 한다. 이 티켓이 메우는 자리는 「검사를 돌리면 안다」와 「조회하면
--    말한다」 사이다.
--
-- 🔴 두 지문은 덮는 것이 다르다. 섞지 않는다:
--      manifest_sha256    = «규칙»이 바뀌었는가 (manifest.py — 이미 있음)
--      source_data_sha256 = «데이터»가 바뀌었는가 (투영이 읽는 열 — 여기서 신설)
--    규칙만 바뀌면 앞이 울고, 데이터만 바뀌면 뒤가 운다. 한 열로 합치면 어느 쪽이 바뀌었는지
--    구분할 수 없고, 구분하지 못하면 「재투영하면 되는가 / 스펙을 다시 봐야 하는가」가 갈리지 않는다.
--
-- 🔴 001~007 무수정. 열은 ADD COLUMN IF NOT EXISTS, 제약은 pg_constraint 직접 조회(007 선례),
--    view는 CREATE OR REPLACE(열은 «맨 뒤»에만 추가 — 앞을 건드리면 replace가 거부된다).
-- =============================================================================

-- =============================================================================
-- 1. 원장에 «데이터 지문»과 그 사정거리를 붙인다 — 관측한 것만, 관측한 그대로
-- =============================================================================
--
-- 🔴 왜 사정거리를 «함께» 적는가. 지문 하나만 두면 조회 시점에 「무엇을 다시 읽어야 하는지」를
--    DB가 모른다. 같은 범위로 다시 계산할 수 있어야 대조가 성립한다.
--
-- 🔴 사정거리 = «투영이 읽는 (테이블 → 열)»이지 테이블 전체가 아니다. 이것이 이 설계의
--    핵심 결정이다. 테이블 전체를 덮으면 그래프에 올리지도 않는 열(equipment.status 등)이
--    바뀔 때마다 낡았다고 운다 — 재투영해도 그래프가 «한 글자도 바뀌지 않는» 변화다.
--    읽기 전용 PoC에서는 티가 안 나지만, 그런 열이 수시로 갱신되는 T2 쓰기 경로에서는
--    짝 판정이 영구히 적색이 된다. 항상 빨간 신호는 곧 «아무도 안 보는» 신호가 된다.
--    그래서 「재투영하면 그래프가 달라지는가」와 정확히 같은 범위로 좁혔다.
--
-- 🔴 NULL 허용 = «비관측». 008 이전에 만들어진 투영 행은 이 축을 본 적이 없다. 소급해 채우면
--    「그때 이 데이터를 읽었다」는 거짓이 원장에 남는다(index_build.graph_projection_version과
--    같은 규율 · 006 §2). 대신 짝 판정이 그 행을 GRAPH_UNVERIFIED로 «말한다».

ALTER TABLE graph_build ADD COLUMN IF NOT EXISTS source_data_sha256 char(64);
ALTER TABLE graph_build ADD COLUMN IF NOT EXISTS source_scope       jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_graph_build_source_sha_format') THEN
    ALTER TABLE graph_build
      ADD CONSTRAINT ck_graph_build_source_sha_format
      CHECK (source_data_sha256 IS NULL OR source_data_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  -- 지문과 사정거리는 «함께» 관측된다. 한쪽만 있으면 그 행은 무엇을 말하는지 알 수 없다:
  -- 범위 없는 지문은 다시 계산할 수 없고, 지문 없는 범위는 비교할 좌변이 없다.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_graph_build_source_observed_together') THEN
    ALTER TABLE graph_build
      ADD CONSTRAINT ck_graph_build_source_observed_together
      CHECK ((source_data_sha256 IS NULL) = (source_scope IS NULL)
             AND (source_scope IS NULL
                  OR (jsonb_typeof(source_scope) = 'object' AND source_scope <> '{}'::jsonb)));
  END IF;
END $$;

COMMENT ON COLUMN graph_build.source_data_sha256 IS
  '투영이 «읽은 PG 데이터»의 지문(빌드 당시 사실). graph_source_digest(source_scope)와 '
  '조회 시점에 대조해 낡음을 판정한다 — 판정 자체는 저장하지 않는다(003 선례). '
  'NULL = 008 이전 투영이라 관측한 적 없음(소급 갱신 금지).';
COMMENT ON COLUMN graph_build.source_scope IS
  '지문이 덮은 범위 {테이블: [열…]} = 투영이 실제로 읽는 열만. 정본은 '
  'services/projector/manifest.py의 source_scope()(노드 속성 + 관계 질의 select 항목)이며, '
  '그 도출은 manifest_sha256이 덮는다. 투영하지 않는 열은 넣지 않는다 — 재투영해도 '
  '그래프가 바뀌지 않는 변화를 낡음이라 부르면 경보가 신뢰를 잃는다.';

-- =============================================================================
-- 2. 지문 계산 — «한 곳에만» 둔다
-- =============================================================================
--
-- 🔴 왜 DB 함수인가. 빌드가 파이썬에서, 판정이 SQL에서 각자 계산하면 두 구현이 언젠가 갈리고,
--    그때 「낡았다」는 데이터 변화가 아니라 «구현 차이»를 가리킨다 — 낡음을 잡으려던 축이
--    거짓말하는 축이 된다. 투영기는 빌드 시점에 이 함수를 «호출해서» 그 값을 원장에 적고,
--    판정도 같은 함수를 부른다. 정의는 하나다.
--
-- 🔴 왜 목록을 여기 하드코딩하지 않는가. 적어 두면 manifest와 «두 번째 정본»이 생긴다.
--    관계가 늘었는데 이 파일을 잊으면, 낡음을 잡으려고 만든 축에 사각이 생긴다 —
--    지금 고치는 바로 그 결함의 재발이다. 범위는 원장이 들고 온다.
--
-- 🔴 임의 SQL 실행 경로가 아니다(baseline §15.2·§34.6). 인자로 «질의»를 받지 않는다.
--    받는 것은 식별자뿐이고, ① public 스키마의 기본 테이블·실재 열인지 information_schema로
--    대조한 뒤 ② format의 %I·%L로만 끼운다. 대조에 걸리면 계산하지 않고 예외를 던진다.
--    SECURITY DEFINER가 아니므로 호출자 권한을 넘지 않는다.

CREATE OR REPLACE FUNCTION graph_source_digest(p_scope jsonb)
RETURNS char(64)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  t     text;
  c     text;
  cols  text[];
  obj   text;
  part  text;
  parts text[] := '{}';
BEGIN
  -- 범위가 없으면 «판정하지 않는다». 빈 값의 지문을 돌려주면 「아무것도 안 읽었다」와
  -- 「관측하지 않았다」가 같은 값이 된다(004 거울 공란 규율).
  IF p_scope IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_scope) <> 'object' THEN
    RAISE EXCEPTION 'graph_source_digest: 사정거리는 {테이블: [열…]} 객체여야 한다';
  END IF;

  -- 정렬은 바이트 순서로 못박는다 — 지문은 어디서 계산해도 같아야 쓸모가 있다(Q-8 선례).
  FOR t IN SELECT k FROM jsonb_object_keys(p_scope) AS k ORDER BY k COLLATE "C"
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'graph_source_digest: public 스키마의 기본 테이블이 아니다: %', t;
    END IF;

    SELECT array_agg(x ORDER BY x COLLATE "C") INTO cols
      FROM jsonb_array_elements_text(p_scope -> t) AS x;
    IF cols IS NULL OR array_length(cols, 1) = 0 THEN
      RAISE EXCEPTION 'graph_source_digest: 열 목록이 비었다: %', t;
    END IF;

    obj := '';
    FOREACH c IN ARRAY cols
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t AND column_name = c
      ) THEN
        RAISE EXCEPTION 'graph_source_digest: %.% 열이 없다', t, c;
      END IF;
      -- 🔴 열 «이름»도 지문에 넣는다(jsonb_build_object). 이름을 빼고 값만 이으면
      --    열 이름이 바뀌어도 지문이 그대로다 — 투영 속성명이 바뀐 것은 낡음이다.
      obj := obj || CASE WHEN obj = '' THEN '' ELSE ', ' END || format('%L, x.%I', c, c);
    END LOOP;

    -- 행 순서에 기대지 않는다 — 행 지문을 정렬해 결합하므로 물리 순서가 바뀌어도 같은 값이
    -- 나온다. 계수를 함께 넣어 「행이 사라진 것」과 「값이 바뀐 것」이 한 지문으로 뭉개지지 않게 한다.
    EXECUTE format($q$
      SELECT count(*)::text || ':' ||
             coalesce(string_agg(h, E'\n' ORDER BY h COLLATE "C"), '')
        FROM (SELECT encode(sha256(convert_to(jsonb_build_object(%s)::text, 'UTF8')), 'hex') AS h
                FROM %I x) s
    $q$, obj, t) INTO part;

    parts := parts || (t || '=' || encode(sha256(convert_to(part, 'UTF8')), 'hex'));
  END LOOP;

  RETURN encode(sha256(convert_to(array_to_string(parts, E'\n'), 'UTF8')), 'hex');
END;
$fn$;

COMMENT ON FUNCTION graph_source_digest(jsonb) IS
  '그래프 원천 데이터의 지문 — 사정거리 {테이블: [열…]}에 대해 테이블별 (행 수 + 행 지문 정렬 '
  '결합)을 다시 해싱한다. 투영기가 빌드 시점에 호출해 graph_build.source_data_sha256에 적고, '
  'v_graph_index_pairing이 조회 시점에 같은 함수로 다시 계산해 대조한다(정의는 한 곳 · Q-15).';

-- =============================================================================
-- 3. 짝 판정에 낡음 상태 2종을 더한다
-- =============================================================================
--
-- 🔴 GRAPH_STALE — 원장이 적은 데이터 지문 ≠ 지금 지문. 「PG가 바뀌었는데 재투영을 안 했다」.
-- 🔴 GRAPH_UNVERIFIED — 원장에 지문이 없다(008 이전 투영). 007이 색인 쪽에서 가르친 것을
--    그대로 적용한다: «판정하지 못한 것»을 PAIRED라고 답하면, 축을 새로 만든 의미가 없다.
--    한 상태만 두고 NULL을 PAIRED로 접으면 Q-6가 고친 결함을 그래프 쪽에 다시 만드는 셈이다.
--
-- 🔴 순서 — ONTOLOGY_MISMATCH가 먼저다. 둘 다 «아는 불일치»지만 기존 축의 판정을 새 축이
--    가리면 006 시절의 원장 해석이 바뀐다. 새 상태는 기존 상태가 조용할 때만 말한다.
-- 🔴 열은 맨 뒤에만 붙인다 — 앞의 열 이름·순서를 바꾸면 CREATE OR REPLACE가 거부된다
--    (004→003 되감기에서 실측된 `cannot drop columns from view`와 같은 제약).

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
  -- 지문은 행당 한 번만 계산한다(CASE와 출력 열이 같은 값을 쓴다)
  SELECT gb.*, graph_source_digest(gb.source_scope) AS current_source_sha256
    FROM graph_build gb ORDER BY gb.built_at DESC, gb.build_id DESC LIMIT 1
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
    -- 신설(Q-15): 데이터가 바뀐 뒤 재투영을 잊은 상태
    WHEN g.source_data_sha256 IS NOT NULL
     AND g.source_data_sha256 <> g.current_source_sha256 THEN 'GRAPH_STALE'
    -- 신설(Q-15): 이 투영은 데이터 지문을 «관측한 적이 없다» — FRESH도 STALE도 아니다
    WHEN g.source_data_sha256 IS NULL                THEN 'GRAPH_UNVERIFIED'
    ELSE 'PAIRED'
  END AS pairing,
  g.source_data_sha256        AS graph_source_sha256,
  g.current_source_sha256
FROM idx LEFT JOIN g ON true;

COMMENT ON VIEW v_graph_index_pairing IS
  '색인 빌드별 «현행 그래프 투영»과의 짝 판정 — PAIRED·NO_PROJECTION·PROJECTION_FAILED·'
  'ONTOLOGY_MISMATCH·GRAPH_STALE·GRAPH_UNVERIFIED·INDEX_BUILD_INCONSISTENT '
  '(baseline §8.3 ⑦ · 오케 판정 B안 · 낡음 2종은 Q-15). '
  'GRAPH_STALE = 투영이 읽는 열이 바뀐 뒤 재투영을 잊은 상태, GRAPH_UNVERIFIED = 008 이전 '
  '투영이라 데이터 지문을 관측한 적이 없는 상태(둘 다 재투영 1회로 해소된다).';

INSERT INTO schema_migration (filename) VALUES ('008_graph_source_digest.sql')
ON CONFLICT (filename) DO NOTHING;
