-- =============================================================================
-- 005_ssot_manifest.sql — ssot_manifest_hash 산출 (Q-2 · 스펙 §3.3)
--
-- 🔴 정의 원문(docs/product/data-ontology-spec.md §3.3):
--    「`{document_id}@r{n}:{content_sha256}` 행을 문서 ID 오름차순 정렬·개행 결합한
--      텍스트의 SHA-256」
--
-- 🔴 001~004 무수정 — 신규 파일만.
--
-- 🔴 왜 «저장»하지 않고 view인가: 이 값은 문서 집합의 지문이다. 저장하면 문서가 바뀌는
--    순간 그 사본이 낡고, 낡은 지문은 「무엇의 지문인지」를 말하지 않는다. 003의 stale을
--    열이 아니라 view로 둔 것과 같은 이유다. 기록이 필요한 자리(빌드 원장 등)에서는
--    «그때 읽은 값»을 각자 적으면 되고, 산출 알고리즘은 여기 하나만 둔다.
--
-- 🔴 구현을 SQL에만 두는 이유: 같은 알고리즘을 파이썬에도 적으면 정본이 둘이 되어 조용히
--    갈라진다(계약을 pydantic으로 복사하지 않은 T1-8 선례와 같은 자리). 파이썬 쪽은
--    이 view를 «읽기만» 한다.
-- =============================================================================

-- 무엇을 한 행으로 세는가 — 판단이 필요한 지점이라 여기 적어 둔다.
--
-- 「문서 ID 오름차순」이 정렬 키라는 것은 **문서당 한 행**을 전제한다. 그 한 행은
-- `approval_state='approved'` revision이다 — SSOT manifest는 「지금 인용 가능한 상태」의
-- 지문이고, 인용 가능 조건을 approved로 한정한 것이 §3.3 자신이기 때문이다.
-- superseded·draft를 함께 넣으면 문서 하나가 여러 행이 되어 정렬 키가 무너지고,
-- 「과거 판이 남아 있다」는 사실만으로 지문이 달라져 색인 신선도와 무관하게 흔들린다.
--
-- 🔴 정렬에 revision_no를 덧붙인다. D-2 설계상 문서당 approved는 1건이라 실제로는 동점이
--    생기지 않지만, 결정성을 «데이터의 성질»에 기대지 않는다 — 동점이 생기는 날
--    지문이 실행마다 달라지는 것이 최악의 실패 방식이다.

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
  -- 개행 «결합»이다 — 행마다 개행을 붙이지 않는다(끝에 빈 행이 생기면 다른 지문이 된다).
  SELECT
    count(*)::integer AS document_count,
    coalesce(string_agg(line, E'\n' ORDER BY document_id, revision_no), '') AS manifest_text
  FROM lines
)
SELECT
  document_count,
  manifest_text,
  encode(sha256(convert_to(manifest_text, 'UTF8')), 'hex') AS ssot_manifest_hash
FROM joined;

COMMENT ON VIEW v_ssot_manifest IS
  '스펙 §3.3 ssot_manifest_hash — approved revision 1문서 1행, 문서 ID 오름차순, 개행 결합, SHA-256.';

INSERT INTO schema_migration (filename) VALUES ('005_ssot_manifest.sql')
ON CONFLICT (filename) DO NOTHING;
