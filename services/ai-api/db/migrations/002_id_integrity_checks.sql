-- =============================================================================
-- 002_id_integrity_checks.sql — 같은 행 안에서 끝나는 정합 제약 3건
--
-- 근거: evidence/t1-1-schema-verification.md (검증 좌석 P-1·P-7·P-2) · 오케 판정
--       「G-4a·G-1 = CHECK 채택 / G-4b·G-2·G-3 = 스키마 비강제 의도로 확정」
--
-- 🔴 왜 지금 넣는가: 이 프로젝트는 **ID를 읽어 의미를 얻는다**(`DOC-SOP-0014@r2`가
--    「0014번 문서의 2차 개정」이라는 사실을 ID 자체가 말한다). ID와 실제 소속이 어긋난
--    행은 예외도 로그도 없이 «조용히» 틀린 인용을 만든다.
--
-- 🔴 왜 001이 아니라 새 파일인가: 001은 전 객체가 CREATE TABLE IF NOT EXISTS라, 테이블이
--    이미 있으면 통째로 건너뛴다. 001에 CHECK를 적어도 기존 DB에는 들어가지 않는다.
--
-- 🔴 재실행 멱등: ALTER TABLE ADD CONSTRAINT에는 IF NOT EXISTS가 없다. pg_constraint를
--    직접 조회해 없을 때만 붙인다.
--
-- 🔴 D-2·D-5(의도적 불완전성)와 무접촉이다. 여기서 막는 것은 «같은 행 내부의 자기모순»이고,
--    revision 값 상이·SOP 부재는 행 사이의 관계라 이 제약에 걸리지 않는다.
-- =============================================================================

DO $$
BEGIN
  -- G-4a — DocumentRevision.id = {document_id}@r{revision_no} (스펙 §3.3)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_revision_id_composition') THEN
    ALTER TABLE document_revision
      ADD CONSTRAINT ck_revision_id_composition
      CHECK (id = document_id || '@r' || revision_no);
  END IF;

  -- G-4a — DocumentChunk.id = {revision_id}#{NNN} (스펙 §3.1)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_chunk_id_composition') THEN
    ALTER TABLE document_chunk
      ADD CONSTRAINT ck_chunk_id_composition
      CHECK (id = revision_id || '#' || lpad(chunk_index::text, 3, '0'));
  END IF;

  -- G-1 — superseded revision은 「언제까지 유효했는가」를 반드시 갖는다.
  --       비어 있으면 과거 시점 인용 검증(감사·replay)이 불가능하다.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_superseded_has_effective_to') THEN
    ALTER TABLE document_revision
      ADD CONSTRAINT ck_superseded_has_effective_to
      CHECK (approval_state <> 'superseded' OR effective_to IS NOT NULL);
  END IF;
END $$;

INSERT INTO schema_migration (filename) VALUES ('002_id_integrity_checks.sql')
ON CONFLICT (filename) DO NOTHING;
