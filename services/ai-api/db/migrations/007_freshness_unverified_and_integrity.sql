-- =============================================================================
-- 007_freshness_unverified_and_integrity.sql — Q-6 · Q-8 · Q-10
--
-- 🔴 근거 = docs/plan/ticket-ledger.md 「구현 대기열」 Q-6·Q-8·Q-10 (오케 발주 2026-08-29)
--    Q-6  거울 공란 시 «판정 안 함»이 FRESH로 새는 표시 축 (levi2 PR#68 ⓑ 잔여 — 상태 ⑤/⑥ 대조 실측)
--    Q-8  v_ssot_manifest 정렬의 collation 의존 — 바이트 순서 고정 (levi2 회부 ② · E3)
--    Q-10 G-1 CHECK가 superseded «한 상태»만 본다 — S→R 전이에서 effective_to 소실 통과
--         (levi2 5대 T-I3 실측 E1 · PR#75)
--
-- 🔴 001~006 무수정. view는 CREATE OR REPLACE로 «교체»하고, 제약은 002의 것을 고치지 않고
--    «따로» 하나 더 건다(고치면 002가 무엇을 뜻했는지 읽을 수 없게 된다).
-- 🔴 재실행 멱등: view는 REPLACE, 제약은 pg_constraint 직접 조회(002 선례).
-- =============================================================================

-- =============================================================================
-- 1. Q-6 — 「판정하지 않았다」에 이름을 준다: ONTOLOGY_UNVERIFIED
-- =============================================================================
--
-- 004는 「거울(ontology_registry)이 비면 ontology 축은 판정하지 않는다」를 옳게 정했다.
-- 비교 대상이 없는 것을 불일치로 부르면 설정 누락이 데이터 결함으로 둔갑하기 때문이다.
-- 🔴 그런데 freshness 열에 «판정 안 함»이라는 값이 없어서, 판정하지 않은 것이 FRESH로 나왔다.
--    levi2 실측(PR#68 ⓑ): 원장 ontology 0.0.9(낡음) 상태에서 거울이 «있으면» STALE 45건,
--    거울이 «비면» FRESH 45건 — 같은 낡음이 거울 유무로 갈렸다.
--    「모르는 것을 FRESH라 답하면 그게 더 나쁘다」(levi2) — 그래서 세 번째 답을 만든다.
--
-- 🔴 STALE보다 «뒤»에 둔다: sha가 어긋났으면 그건 «아는 불일치»다. 아는 것을 모른다고
--    바꿔 말하지 않는다. UNVERIFIED는 「다른 축은 다 맞는데 ontology 축만 못 봤다」일 때만 나온다.
-- 🔴 stale_reason은 NULL로 둔다 — UNVERIFIED는 stale이 아니다. 사유 열에 적으면
--    「STALE 사유」를 읽는 쪽이 stale 아닌 행을 stale로 센다.

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
    WHEN b.status = 'skipped'                      THEN 'SKIPPED'
    WHEN b.status = 'failed'                       THEN 'BUILD_FAILED'
    WHEN b.source_sha256 <> r.content_sha256       THEN 'STALE'
    WHEN reg.ontology_version IS NOT NULL
     AND b.ontology_version <> reg.ontology_version THEN 'STALE'   -- §3.3 「동일 처리」
    -- 신설(Q-6): 비교 대상이 없어 «보지 못한» 상태. FRESH도 STALE도 아니다.
    WHEN reg.ontology_version IS NULL              THEN 'ONTOLOGY_UNVERIFIED'
    ELSE 'FRESH'
  END AS freshness,
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
  'revision별 최신 빌드 기준 신선도. FRESH·STALE·ONTOLOGY_UNVERIFIED·NOT_INDEXED·SKIPPED·'
  'BUILD_FAILED (스펙 §3.3). ONTOLOGY_UNVERIFIED = 거울(ontology_registry)이 비어 ontology '
  '축을 판정하지 못한 상태 — FRESH가 아니다. STALE 사유는 stale_reason에서 갈린다.';

-- =============================================================================
-- 2. Q-8 — 지문의 정렬을 «바이트»에 못박는다 (COLLATE "C")
-- =============================================================================
--
-- 005의 정렬 `ORDER BY document_id`는 DB collation에 의존한다. levi2가 독립 조립
-- (LC_ALL=C sort)으로 같은 값을 얻어 «지금은» 동일함을 실측했지만, 그것은 ID가 전부
-- DOC-AAA-NNNN 한 모양이라서다. ID 체계가 섞이면(대소문자·구두점·길이 차) 언어 collation은
-- 구두점을 1차 비교에서 무시하는 등 바이트 순서와 갈라진다.
--
-- 🔴 지문은 «어디서 계산해도 같아야» 쓸모가 있다. 정렬이 DB 설정에 좌우되면, 같은 데이터가
--    다른 서버에서 다른 지문을 낸다 — 그때 어긋난 것은 데이터가 아니라 설정인데, 증상은
--    「SSOT가 바뀌었다」로 나타난다. 결정성을 환경에 기대지 않는다(005의 revision_no 정렬과 같은 이유).
-- 🔴 revision_no는 integer라 collation과 무관하다 — 정렬 키에 COLLATE를 붙이지 않는다.

CREATE OR REPLACE VIEW v_ssot_manifest AS
WITH lines AS (
  SELECT
    r.document_id,
    r.revision_no,
    r.document_id || '@r' || r.revision_no || ':' || r.content_sha256 AS line
  FROM document_revision r
  WHERE r.approval_state = 'approved'
),
joined AS (
  SELECT
    count(*)::integer AS document_count,
    coalesce(
      string_agg(line, E'\n' ORDER BY document_id COLLATE "C", revision_no), ''
    ) AS manifest_text
  FROM lines
)
SELECT
  document_count,
  manifest_text,
  encode(sha256(convert_to(manifest_text, 'UTF8')), 'hex') AS ssot_manifest_hash
FROM joined;

COMMENT ON VIEW v_ssot_manifest IS
  '스펙 §3.3 ssot_manifest_hash — approved revision 1문서 1행, 문서 ID 오름차순(🔴 COLLATE "C" '
  '= 바이트 순서 고정 · DB collation 무관), 개행 결합, SHA-256.';

-- =============================================================================
-- 3. Q-10 — G-1 확장: 「유효했던 revision」은 retired가 되어도 끝을 남긴다
-- =============================================================================
--
-- 002의 ck_superseded_has_effective_to는 superseded «한 상태»만 본다. 그래서 levi2 T-I3가
-- 실측한 경로 — superseded → retired 로 옮기며 effective_to를 지우는 갱신 — 이 DB를 그대로
-- 통과했다(현재는 C-24 그물이 사후에 적발한다).
--
-- 🔴 「retired면 무조건 effective_to 필수」로 만들지 않는다. 승인된 적 없는 draft가 폐기되면
--    (draft → retired) 그 revision은 «유효했던 적이 없다» — 없는 유효 종료일을 요구하면
--    정당한 상태를 스키마가 막는다.
-- 🔴 행 하나만 보고 「유효했던 적이 있는가」를 알 방법: approved_by. 001이 승인 시 필수로
--    걸어 둔 열이고, 상태가 옮겨 가도 값은 남는다. CHECK는 행 지역이어야 하므로 이 대리 축을 쓴다.
--    (이력 테이블이 생기면 그때는 이력이 직접 답한다 — 그 전까지의 최선이다)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_retired_keeps_effective_to') THEN
    ALTER TABLE document_revision
      ADD CONSTRAINT ck_retired_keeps_effective_to
      CHECK (approval_state <> 'retired' OR approved_by IS NULL OR effective_to IS NOT NULL);
  END IF;
END $$;

COMMENT ON CONSTRAINT ck_retired_keeps_effective_to ON document_revision IS
  'G-1 확장(Q-10) — 승인된 적 있는(approved_by 보유) revision은 retired가 되어도 effective_to를 '
  '유지한다. 과거 시점 인용 검증(감사·replay)이 종료일 없이는 불가능하다. draft→retired는 제외.';

INSERT INTO schema_migration (filename) VALUES ('007_freshness_unverified_and_integrity.sql')
ON CONFLICT (filename) DO NOTHING;
