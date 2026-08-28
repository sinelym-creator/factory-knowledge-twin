-- D-2 검증 — DOC-SOP-0014의 두 revision이 «실제로 다른 값»을 갖는가.
--
-- 근거: benchmarks/datasets/eval-questions-draft.md §5 D-2 · Q-DIRECT-003
--   「revision이 2개 있다」와 「두 revision의 값이 다르다」는 다르다. 후자가 아니면
--   「이전 revision과 무엇이 다른가」에 쓸 정답이 없어 문항이 조용히 무력화된다.
--
-- PASS 조건
--   ① r1·r2 두 행이 나온다 · content_sha256이 서로 다르다
--   ② 예상 작업 시간이 서로 다르다 (90분 ↔ 120분)
--   ③ 필요 공구 개수가 서로 다르다 (4종 ↔ 5종)
--   ④ 지금 인용 가능한 revision이 @r2 «1건뿐»이다 (@r1은 superseded · effective_to 기입)

\echo '== D-2 ① revision 구성과 본문 차이 =='
SELECT
  r.id,
  r.approval_state,
  r.effective_from,
  r.effective_to,
  left(r.content_sha256, 12) || '...'                                   AS content_sha256,
  substring(r.body from '## 5\. 예상 작업 시간\n([^\n]+)')               AS est_time,
  array_length(
    string_to_array(
      trim(both E'\n' from (regexp_match(r.body, '## 4\. 필요 공구 및 자재\n((?:- [^\n]+\n)+)'))[1]),
      E'\n'), 1)                                                        AS tool_count
FROM document_revision r
WHERE r.document_id = 'DOC-SOP-0014'
ORDER BY r.revision_no;

\echo ''
\echo '== D-2 ② 두 revision이 실제로 어긋나는가 (전부 t 여야 PASS) =='
SELECT
  count(*)                                              AS revision_count,
  count(DISTINCT content_sha256) = 2                    AS sha256_differs,
  count(DISTINCT substring(body from '## 5\. 예상 작업 시간\n([^\n]+)')) = 2
                                                        AS est_time_differs,
  count(DISTINCT (regexp_match(body, '## 4\. 필요 공구 및 자재\n((?:- [^\n]+\n)+)'))[1]) = 2
                                                        AS tools_differ
FROM document_revision
WHERE document_id = 'DOC-SOP-0014';

\echo ''
\echo '== D-2 ③ 지금 인용 가능한 revision (스펙 §3.3 — approved AND 유효기간 내) =='
SELECT r.id, r.approval_state, r.effective_from, r.effective_to,
       s.id AS sop_id, s.current_revision_id
FROM document_revision r
JOIN sop s ON s.current_revision_id = r.id
WHERE r.document_id = 'DOC-SOP-0014'
  AND r.approval_state = 'approved'
  AND r.effective_from <= now()
  AND (r.effective_to IS NULL OR now() < r.effective_to);
