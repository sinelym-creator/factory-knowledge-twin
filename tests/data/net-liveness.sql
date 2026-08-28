-- =============================================================================
-- net-liveness.sql — 「그 그물은 실패를 «낼 수 있는가»」 (검증 좌석 · T1-7 A단 ③)
--
-- 🔴 왜 필요한가: seed-integrity 의 초록은 «데이터가 옳다»는 뜻일 수도 있고
--    «검사가 죽었다»는 뜻일 수도 있다. 둘은 출력이 같다. 위반을 주입해 빨강이 나오는 것을
--    본 뒤에야 그 초록이 증거가 된다(계보 규범: 죽은 검사기의 초록은 증거가 아니라 결함이다).
--
-- 🔴 대상 = «스키마가 막지 않기로 확정한» 축을 대신 지키는 그물 4종.
--      C-10·C-11 = G-4b(ID 구성요소 ↔ 소속) — 옛 tests/schema P-5·P-6의 이관처
--      C-21·C-22 = G-2(동시 유효 revision)  — tests/schema P-3(expect=accept)의 대신 지키는 것
--
-- 🔴 이 파일은 «쓴다». 다만 검사 1건 = 트랜잭션 1개(BEGIN … ROLLBACK)라 되감기 후 잔여물이 0이다
--    (tests/schema/run-probes.ps1과 같은 격리 방식). seed-integrity.sql의 읽기 전용 성질은
--    그대로다 — 두 파일을 섞지 않는다.
--
--   docker compose exec -T postgres psql -U fkt -d fkt -v ON_ERROR_STOP=1 -tA -F "\t" \
--       < tests/data/net-liveness.sql
--   (러너: pwsh tests/data/run-net-liveness.ps1)
--
-- 출력: check_id|무엇을|기대|실측|판정  (탭 구분 · 러너가 파싱한다)
-- =============================================================================

-- --- L-10: C-10(component.id 설비번호 ↔ 소속)이 실패를 내는가 ------------------
BEGIN;
UPDATE component SET equipment_id = 'EQ-CNC-207' WHERE id = 'CP-204-BRG-01';
SELECT 'L-10', 'C-10 그물 생존 — 소속 어긋난 component 주입 시 적발 건수', 1,
       (SELECT count(*)::bigint FROM component
        WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3)),
       CASE WHEN (SELECT count(*) FROM component
                  WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3)) = 1
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-11: C-11(sensor.id 설비번호 ↔ 소속) ------------------------------------
BEGIN;
UPDATE sensor SET equipment_id = 'EQ-CNC-207' WHERE id = 'SN-204-VIB';
SELECT 'L-11', 'C-11 그물 생존 — 소속 어긋난 sensor 주입 시 적발 건수', 1,
       (SELECT count(*)::bigint FROM sensor
        WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3)),
       CASE WHEN (SELECT count(*) FROM sensor
                  WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3)) = 1
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-21: C-21(전 문서 인용 가능 revision = 1건) -----------------------------
-- 🔴 인용 가능 revision을 «0건»으로 만든다. 화면이 근거를 못 다는 상태 — C-4는
--    DOC-SOP-0014만 보므로 다른 문서에서 같은 일이 나면 아무도 울지 않았다.
BEGIN;
UPDATE document_revision SET approval_state = 'draft' WHERE id = 'DOC-SAF-0029@r3';
SELECT 'L-21', 'C-21 그물 생존 — 인용 가능 revision 0건 문서 주입 시 적발 건수', 1,
       (SELECT count(*)::bigint FROM document d WHERE 1 <> (
          SELECT count(*) FROM document_revision r
          WHERE r.document_id=d.id AND r.approval_state='approved'
            AND r.effective_from <= DATE '2026-08-26'
            AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26'))),
       CASE WHEN (SELECT count(*) FROM document d WHERE 1 <> (
          SELECT count(*) FROM document_revision r
          WHERE r.document_id=d.id AND r.approval_state='approved'
            AND r.effective_from <= DATE '2026-08-26'
            AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26'))) = 1
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-22: C-22(approved 유효구간 겹침) ---------------------------------------
-- 🔴 겹침은 C-21이 못 잡을 수 있다 — 조회시각 밖에서 겹치면 「지금 1건」은 그대로다.
--    그래서 겹침을 «조회시각 밖»에 만들어 두 그물이 서로를 대신하지 못함을 함께 보인다.
BEGIN;
UPDATE document_revision SET approval_state = 'approved', effective_to = DATE '2025-06-01'
 WHERE id = 'DOC-SAF-0029@r1';
UPDATE document_revision SET approval_state = 'approved',
       effective_from = DATE '2025-01-01', effective_to = DATE '2025-12-31'
 WHERE id = 'DOC-SAF-0029@r2';
SELECT 'L-22', 'C-22 그물 생존 — 유효구간 겹치는 approved 2건 주입 시 적발 문서 수', 1,
       (SELECT count(DISTINCT a.document_id)::bigint
        FROM document_revision a JOIN document_revision b
          ON a.document_id=b.document_id AND a.id < b.id
        WHERE a.approval_state='approved' AND b.approval_state='approved'
          AND a.effective_from < COALESCE(b.effective_to, DATE '9999-12-31')
          AND b.effective_from < COALESCE(a.effective_to, DATE '9999-12-31')),
       CASE WHEN (SELECT count(DISTINCT a.document_id)
        FROM document_revision a JOIN document_revision b
          ON a.document_id=b.document_id AND a.id < b.id
        WHERE a.approval_state='approved' AND b.approval_state='approved'
          AND a.effective_from < COALESCE(b.effective_to, DATE '9999-12-31')
          AND b.effective_from < COALESCE(a.effective_to, DATE '9999-12-31')) = 1
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-22b: 겹침이 조회시각 «밖»이면 C-21은 조용하다 (두 그물의 비대체성) -------
BEGIN;
UPDATE document_revision SET approval_state = 'approved', effective_to = DATE '2025-06-01'
 WHERE id = 'DOC-SAF-0029@r1';
UPDATE document_revision SET approval_state = 'approved',
       effective_from = DATE '2025-01-01', effective_to = DATE '2025-12-31'
 WHERE id = 'DOC-SAF-0029@r2';
SELECT 'L-22b', '🔴 같은 주입에서 C-21은 몇 건을 잡는가 (0 = C-22가 대체 불가)', 0,
       (SELECT count(*)::bigint FROM document d WHERE 1 <> (
          SELECT count(*) FROM document_revision r
          WHERE r.document_id=d.id AND r.approval_state='approved'
            AND r.effective_from <= DATE '2026-08-26'
            AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26'))),
       CASE WHEN (SELECT count(*) FROM document d WHERE 1 <> (
          SELECT count(*) FROM document_revision r
          WHERE r.document_id=d.id AND r.approval_state='approved'
            AND r.effective_from <= DATE '2026-08-26'
            AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26'))) = 0
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-31: STALE 판정이 «본문 변경»을 잡는가 (spec §3.3 좌변 · GS-01 S6) -----------
-- 원장(index_build)에 FK가 없으므로 probe 행을 넣었다 지우는 것으로 완결된다.
BEGIN;
INSERT INTO index_build (build_id, revision_id, document_id, revision_no, source_sha256,
  chunking_policy_version, embedding_model, embedding_dim, ontology_version, status, chunk_count)
SELECT 'PROBE-L31', r.id, r.document_id, r.revision_no, repeat('a',64),
       1, 'probe-model', 384, '0.1.0', 'success', 1
  FROM document_revision r WHERE r.id = 'DOC-SAF-0029@r3';
SELECT 'L-31', 'STALE 판정 생존 — 원장 sha ≠ 현행 sha 주입 시 STALE 건수', 1,
       (SELECT count(*)::bigint FROM v_index_freshness
         WHERE revision_id='DOC-SAF-0029@r3' AND freshness='STALE'),
       CASE WHEN (SELECT count(*) FROM v_index_freshness
                   WHERE revision_id='DOC-SAF-0029@r3' AND freshness='STALE') = 1
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-32: 🔴 known gap — ontology_version 불일치는 «아직» STALE로 잡히지 않는다 ---
-- spec §3.3은 「ontology_version 불일치도 동일 처리」를 요구하지만, v_index_freshness는
-- source_sha256만 비교한다(003 마이그레이션 실물). 기대값을 «현재 상태»로 고정해 둔다 —
-- 처방이 착지해 잡히기 시작하면 여기가 FAIL로 울린다(표를 갱신하라는 신호).
-- 🔴 처방 위치 = services/ai-api/db/migrations/** = 구현 좌석 scope. 검증 좌석은 못 닫는다.
BEGIN;
INSERT INTO index_build (build_id, revision_id, document_id, revision_no, source_sha256,
  chunking_policy_version, embedding_model, embedding_dim, ontology_version, status, chunk_count)
SELECT 'PROBE-L32', r.id, r.document_id, r.revision_no, r.content_sha256,
       1, 'probe-model', 384, '0.0.1-WRONG', 'success', 1
  FROM document_revision r WHERE r.id = 'DOC-SAF-0029@r3';
SELECT 'L-32', '🔴 known gap — ontology 불일치 STALE 적발 건수(0 = 아직 안 잡는다)', 0,
       (SELECT count(*)::bigint FROM v_index_freshness
         WHERE revision_id='DOC-SAF-0029@r3' AND freshness='STALE'),
       CASE WHEN (SELECT count(*) FROM v_index_freshness
                   WHERE revision_id='DOC-SAF-0029@r3' AND freshness='STALE') = 0
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-0: 되감기 확인 — 주입 전후로 4 그물이 전부 초록으로 돌아왔는가 ----------
SELECT 'L-0', '되감기 확인 — 주입 후 4 그물 합계 적발 건수(잔여물 0이면 0)', 0,
       ((SELECT count(*)::bigint FROM component
         WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3))
      + (SELECT count(*)::bigint FROM sensor
         WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3))
      + (SELECT count(*)::bigint FROM document d WHERE 1 <> (
           SELECT count(*) FROM document_revision r
           WHERE r.document_id=d.id AND r.approval_state='approved'
             AND r.effective_from <= DATE '2026-08-26'
             AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26')))
      + (SELECT count(DISTINCT a.document_id)::bigint
         FROM document_revision a JOIN document_revision b
           ON a.document_id=b.document_id AND a.id < b.id
         WHERE a.approval_state='approved' AND b.approval_state='approved'
           AND a.effective_from < COALESCE(b.effective_to, DATE '9999-12-31')
           AND b.effective_from < COALESCE(a.effective_to, DATE '9999-12-31'))),
       CASE WHEN ((SELECT count(*) FROM component
         WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3))
      + (SELECT count(*) FROM sensor
         WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3))
      + (SELECT count(*) FROM document d WHERE 1 <> (
           SELECT count(*) FROM document_revision r
           WHERE r.document_id=d.id AND r.approval_state='approved'
             AND r.effective_from <= DATE '2026-08-26'
             AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26')))
      + (SELECT count(DISTINCT a.document_id)
         FROM document_revision a JOIN document_revision b
           ON a.document_id=b.document_id AND a.id < b.id
         WHERE a.approval_state='approved' AND b.approval_state='approved'
           AND a.effective_from < COALESCE(b.effective_to, DATE '9999-12-31')
           AND b.effective_from < COALESCE(a.effective_to, DATE '9999-12-31'))) = 0
            THEN 'PASS' ELSE 'FAIL' END;
