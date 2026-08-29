-- =============================================================================
-- eval-chunk-binding.sql — 평가 문항의 «chunk 입도 정답 근거»가 색인에 실재하는가 (U-1)
--
-- 🔴 왜 필요한가: `benchmarks/datasets/eval-questions-draft.md` §8이 문항별 chunk 좌표를
--    적어 두었다. 적힌 것과 있는 것은 다르다 — 재색인·정책 개정·문서 개정이 좌표를
--    조용히 옮기면, 평가셋은 «존재하지 않는 근거»를 정답이라고 말하게 된다.
--    그 주장을 지키는 검사가 여기다(그물 없는 주장은 눈감기다 — 이 리포 검증 규범).
--
-- 🔴 세 겹으로 본다. 셋 다 성립해야 좌표가 «뜻»을 가진다:
--      ① 그 chunk가 실재하는가                  (존재)
--      ② 그 chunk 본문이 그 앵커 문구를 담는가   (정방향)
--      ③ 같은 revision에서 그 문구를 담은 chunk가 «1개»인가 (역방향)
--    ③이 없으면 「여러 후보 중 하나」를 정답이라 부르게 되고, 그 순간 좌표는 판정 기준이
--    아니라 취향이 된다.
--
-- 🔴 읽기 전용이다. 쓰지 않으므로 타 좌석 스택에서 돌려도 안전하다.
-- 전제: 색인 빌드 완료(`services/indexer/build_index.py`). chunk 0행이면 전건 FAIL이 맞다 —
--       「색인이 없다」와 「좌표가 틀렸다」를 같은 초록으로 덮지 않는다.
--
-- 출력: check_id|무엇을|기대|실측|판정  (탭 구분 · 러너가 파싱한다)
-- =============================================================================

WITH anchor(ord, qid, revision_id, chunk_id, phrase) AS (VALUES
  -- 문항 ↔ 앵커 문구 ↔ 그 문구가 사는 chunk (2026-08-29 실측 · benchmarks §8 정본)
  ( 1, 'Q-DIRECT-002',   'DOC-SOP-0014@r2', 'DOC-SOP-0014@r2#001', '### 3.4 필요 공구 및 자재'),
  ( 2, 'Q-DIRECT-002',   'DOC-SOP-0014@r2', 'DOC-SOP-0014@r2#001', '## 4. 예상 작업 시간'),
  ( 3, 'Q-DIRECT-003',   'DOC-SOP-0014@r2', 'DOC-SOP-0014@r2#001', '### 3.2 진단 기준'),
  ( 4, 'Q-MULTIHOP-001', 'DOC-SOP-0014@r2', 'DOC-SOP-0014@r2#001',
       '진동 RMS가 기준치의 150%를 3일 이상 초과하면 베어링 마모를 우선 의심한다.'),
  ( 5, 'Q-MULTIHOP-001', 'DOC-SAF-0029@r3', 'DOC-SAF-0029@r3#000', '전원 차단 후 잠금·표시(LOTO) 시행'),
  ( 6, 'Q-MULTIHOP-002', 'DOC-MRP-0087@r1', 'DOC-MRP-0087@r1#000', '베어링 교체'),
  ( 7, 'Q-MULTIHOP-002', 'DOC-MRP-0087@r1', 'DOC-MRP-0087@r1#000', '2025-02-11'),
  ( 8, 'Q-SAFETY-001',   'DOC-SOP-0014@r2', 'DOC-SOP-0014@r2#001', '### 3.3 필요 부품'),
  ( 9, 'Q-SAFETY-001',   'DOC-SAF-0029@r3', 'DOC-SAF-0029@r3#000', '전원 차단 후 잠금·표시(LOTO) 시행'),
  (10, 'Q-SAFETY-001',   'DOC-SAF-0030@r3', 'DOC-SAF-0030@r3#000', '보호장갑·보안경'),
  -- 화면 ⑤ Vector-only 1위가 띄우는 좌표(wireframes v0.4) — 같은 규칙으로 함께 지킨다
  (11, 'wireframes-⑤',   'DOC-MAN-0021@r1', 'DOC-MAN-0021@r1#004', '베어링 마모는 초기에 RMS가'),
  (12, 'wireframes-⑤',   'DOC-MAN-0021@r1', 'DOC-MAN-0021@r1#004', '진동 RMS가')
),
graded AS (
  SELECT a.ord, a.qid, a.chunk_id, a.phrase,
         (SELECT count(*) FROM document_chunk c WHERE c.id = a.chunk_id) AS exists_n,
         (SELECT count(*) FROM document_chunk c
           WHERE c.id = a.chunk_id AND position(a.phrase in c.text) > 0) AS forward_n,
         (SELECT count(*) FROM document_chunk c
           WHERE c.revision_id = a.revision_id AND position(a.phrase in c.text) > 0) AS reverse_n
  FROM anchor a
)
SELECT 'B-' || lpad(ord::text, 2, '0') AS check_id,
       qid || ' ' || chunk_id || ' 「' || left(phrase, 22) || '」 (존재·정방향·역방향)' AS what,
       3 AS expected,
       (least(exists_n,1) + least(forward_n,1) + (reverse_n = 1)::int)::bigint AS actual,
       CASE WHEN exists_n = 1 AND forward_n = 1 AND reverse_n = 1 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM graded

UNION ALL
-- 🔴 「근거가 없다」가 정답인 문항 — 그 부재를 «chunk 본문에서도» 확인한다.
--    tests/data C-2·C-9는 seed 테이블만 본다. 색인 본문은 그 바깥이라 따로 봐야 한다.
SELECT 'B-90', 'Q-UNANS-002 EQ-CNC-999가 chunk 본문에 출현', 0,
       (SELECT count(*)::bigint FROM document_chunk WHERE text LIKE '%EQ-CNC-999%'),
       CASE WHEN (SELECT count(*) FROM document_chunk WHERE text LIKE '%EQ-CNC-999%') = 0
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'B-91', 'Q-UNANS-001 비용 표현이 chunk 본문에 출현', 0,
       (SELECT count(*)::bigint FROM document_chunk
         WHERE text ~ '(원가|단가|금액|비용|가격|견적|₩|USD|KRW|만원|[Cc]ost|[Pp]rice|[Bb]udget)'),
       CASE WHEN (SELECT count(*) FROM document_chunk
                   WHERE text ~ '(원가|단가|금액|비용|가격|견적|₩|USD|KRW|만원|[Cc]ost|[Pp]rice|[Bb]udget)') = 0
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
-- 🔴 U-1의 실제 결론을 «그물로» 못박는다: 이 코퍼스는 chunk 입도가 문서 입도와 거의 같다.
--    45 approved revision 중 42개가 1 chunk다. 이 값이 흔들리면 「chunk 입도 지표가
--    문서 입도와 다른 것을 재기 시작했다」는 뜻이고, §8의 포화 판정을 다시 써야 한다.
SELECT 'B-99', '🔴 U-1 전제 — chunk 1개뿐인 approved revision 수(포화 판정의 근거)', 42,
       (SELECT count(*)::bigint FROM (
          SELECT revision_id FROM document_chunk GROUP BY revision_id HAVING count(*) = 1) t),
       CASE WHEN (SELECT count(*) FROM (
          SELECT revision_id FROM document_chunk GROUP BY revision_id HAVING count(*) = 1) t) = 42
            THEN 'PASS' ELSE 'FAIL' END
ORDER BY 1;
