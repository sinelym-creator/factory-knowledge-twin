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
--      C-23      = G-3(상태 전이 방향)      — 나머지 C-24~C-27의 생존은 전이 쌍과 «맥락을
--                  함께» 보여야 뜻이 서므로 tests/data/transition-net.sql이 증명한다.
--                  C-23만은 그 표에서 판정 없는 INFO 행(T-U1)에만 걸려 여기에 둔다.
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

-- --- L-23: C-23(superseded 인데 승인자 없음)이 실패를 내는가 -------------------
-- 🔴 「superseded = approved를 지나온 상태」라는 전이 사슬의 함의를 지키는 그물이다.
--    🔴 2026-08-29 E-7 확정으로 C-23의 사정거리가 retired까지 넓어졌다. 여기서는 superseded
--       주입만 유지한다 — retired 쪽 생존은 transition-net T-S1·T-S3이 «전이 맥락과 함께»
--       증명한다(같은 주입을 두 파일에 두면 둘이 갈릴 뿐이다).
--    승인자를 지우면 그 행은 «승인을 지나지 않고 물러난» 행이 된다 — DB는 막지 않는다
--    (CHECK는 approved에만 승인자를 요구한다). 그래서 그물이 필요하고, 우는 것을 여기서 본다.
BEGIN;
UPDATE document_revision SET approved_by = NULL WHERE id = 'DOC-SAF-0029@r2';
SELECT 'L-23', 'C-23 그물 생존 — 승인자 없는 superseded 주입 시 적발 건수', 1,
       (SELECT count(*)::bigint FROM document_revision
        WHERE approval_state='superseded' AND approved_by IS NULL),
       CASE WHEN (SELECT count(*) FROM document_revision
                  WHERE approval_state='superseded' AND approved_by IS NULL) = 1
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

-- --- L-32: STALE 판정이 «ontology 상승»을 잡는가 (spec §3.3 「동일 처리」) ---------
-- 🔴 2026-08-29 전환: known gap → 정상 그물. 004가 ontology 축을 더하기 전까지 이 자리는
--    「0 = 아직 안 잡는다」로 고정돼 있었다. 처방(004 + ontology_registry) 착지 후
--    검증 좌석이 독립 재현하고 기대를 뒤집었다. 다시 0이 나오면 그건 회귀다.
-- 주입 = «거울»을 올린다(온톨로지가 올라갔는데 색인은 그대로) — 현실의 그 순서 그대로.
BEGIN;
UPDATE ontology_registry SET ontology_version = '9.9.9';
SELECT 'L-32', 'STALE 판정 생존 — ontology 상승 시 STALE 건수(색인된 revision 전건)', 45,
       (SELECT count(*)::bigint FROM v_index_freshness WHERE freshness='STALE'),
       CASE WHEN (SELECT count(*) FROM v_index_freshness WHERE freshness='STALE') = 45
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-33: 두 축이 «사유로» 갈리는가 — 판정은 하나, 사유는 둘 ---------------------
-- 🔴 STALE 건수만 보면 원문이 바뀐 건지 ontology가 올라간 건지 모른다. 둘은 고칠 곳이
--    다르다(§3.3은 «처리»만 같다고 했다). 두 축을 동시에 깨고 사유가 섞이지 않는지 본다.
BEGIN;
UPDATE ontology_registry SET ontology_version = '9.9.9';
UPDATE document_revision SET content_sha256 = repeat('b',64) WHERE id = 'DOC-SAF-0029@r3';
SELECT 'L-33', '사유 분리 — 두 축 동시 주입 시 SOURCE_SHA로 갈리는 건수(나머지는 ONTOLOGY)', 1,
       (SELECT count(*)::bigint FROM v_index_freshness WHERE stale_reason='SOURCE_SHA'),
       CASE WHEN (SELECT count(*) FROM v_index_freshness WHERE stale_reason='SOURCE_SHA') = 1
             AND (SELECT count(*) FROM v_index_freshness WHERE stale_reason='ONTOLOGY_VERSION') = 44
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-34: 🔴 known gap — 거울이 비면 «낡은 색인»도 FRESH라고 답한다 --------------
-- 004의 의도는 「비교 대상이 없으면 ontology 축을 판정하지 않는다」이고 그 자체는 옳다.
-- 그러나 freshness 열에는 «판정 안 함» 상태가 없어서, 판정하지 않은 것이 FRESH로 나온다.
-- 🔴 L-32와 같은 낡음(원장 ontology ≠ 현행)인데 거울 유무로 STALE↔FRESH가 갈린다.
--    완화책은 있다 — build_index.py가 「ontology_registry 0행」에서 멈춘다(빌드 경로).
--    막히지 않는 것은 «읽기 경로»다: 거울이 지워진 DB를 그냥 조회하면 FRESH가 나온다.
--    기대를 현재 상태로 고정해 둔다. UNKNOWN 상태가 생기면 여기가 FAIL로 울린다.
BEGIN;
DELETE FROM ontology_registry;
UPDATE index_build SET ontology_version = '0.0.9';
-- 🔴 2026-08-29 전환 ①: known gap → 정상 그물. 처방(Q-6 · 007 ONTOLOGY_UNVERIFIED)이
--    착지했다. 착지 전 이 자리는 「STALE 0 = 모르는 것을 FRESH라 답한다」로 «고정»돼 있었다.
--    🔴 숫자는 그대로 0인데 «뜻»이 바뀌었다 — 007 후 같은 주입은 FRESH가 아니라
--       ONTOLOGY_UNVERIFIED 45를 낸다(실측). STALE 계수만 보면 전환이 보이지 않는다.
--       그래서 STALE 0을 유지하되 «무엇이라 답하는가»를 L-34b로 함께 못박는다.
SELECT 'L-34', 'STALE 사유 분리 — 거울 공란 + 낡은 원장에서 STALE로는 세지 않는다', 0,
       (SELECT count(*)::bigint FROM v_index_freshness WHERE freshness='STALE'),
       CASE WHEN (SELECT count(*) FROM v_index_freshness WHERE freshness='STALE') = 0
            THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;

-- --- L-34b: 그럼 «무엇이라» 답하는가 (Q-6 착지 후 신설) -----------------------
-- 🔴 「STALE이 아니다」는 「FRESH다」가 아니다. 그 구분에 이름이 생겼는지를 여기서 본다 —
--    이름이 사라지거나 FRESH로 되돌아가면 이 행이 FAIL로 알린다.
BEGIN;
DELETE FROM ontology_registry;
UPDATE index_build SET ontology_version = '0.0.9';
SELECT 'L-34b', '🔴 거울 공란 + 낡은 원장 = ONTOLOGY_UNVERIFIED로 답하는 revision 수', 45,
       (SELECT count(*)::bigint FROM v_index_freshness WHERE freshness='ONTOLOGY_UNVERIFIED'),
       CASE WHEN (SELECT count(*) FROM v_index_freshness
                   WHERE freshness='ONTOLOGY_UNVERIFIED') = 45
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

-- --- L-0b: 되감기 확인(G-3 계열) — L-0은 신설 «전»의 4 그물만 본다 ------------
-- 🔴 L-23이 건드리는 열(approved_by)은 L-0의 4 그물에 걸리지 않는다. 되감기를 재는
--    자가 되감긴 것을 못 보면 그 초록은 아무것도 말하지 않는다 — 그래서 한 줄 더 둔다.
SELECT 'L-0b', '되감기 확인(G-3) — C-23~C-28 합계 적발 건수(잔여물 0이면 0)', 0,
       ((SELECT count(*)::bigint FROM document_revision
          WHERE approval_state IN ('superseded','retired') AND approved_by IS NULL)
      + (SELECT count(*)::bigint FROM document_revision
          WHERE approval_state='retired' AND effective_to IS NULL)
      + (SELECT count(*)::bigint FROM document_revision
          WHERE approval_state='draft' AND (approved_by IS NOT NULL OR effective_to IS NOT NULL))
      + (SELECT count(*)::bigint FROM document_revision hi
          JOIN document_revision lo
            ON lo.document_id = hi.document_id AND lo.revision_no = hi.revision_no - 1
          WHERE hi.approval_state IN ('approved','superseded','retired')
            AND lo.approval_state NOT IN ('superseded','retired'))
      + (SELECT count(*)::bigint FROM document_revision s
          WHERE s.approval_state='superseded' AND NOT EXISTS (
            SELECT 1 FROM document_revision h
            WHERE h.document_id=s.document_id AND h.revision_no > s.revision_no))
      + (SELECT count(*)::bigint FROM document_revision t
          WHERE t.approval_state='retired' AND NOT EXISTS (
            SELECT 1 FROM document_revision h
            WHERE h.document_id=t.document_id AND h.revision_no > t.revision_no))),
       CASE WHEN ((SELECT count(*) FROM document_revision
          WHERE approval_state IN ('superseded','retired') AND approved_by IS NULL)
      + (SELECT count(*) FROM document_revision
          WHERE approval_state='retired' AND effective_to IS NULL)
      + (SELECT count(*) FROM document_revision
          WHERE approval_state='draft' AND (approved_by IS NOT NULL OR effective_to IS NOT NULL))
      + (SELECT count(*) FROM document_revision hi
          JOIN document_revision lo
            ON lo.document_id = hi.document_id AND lo.revision_no = hi.revision_no - 1
          WHERE hi.approval_state IN ('approved','superseded','retired')
            AND lo.approval_state NOT IN ('superseded','retired'))
      + (SELECT count(*) FROM document_revision s
          WHERE s.approval_state='superseded' AND NOT EXISTS (
            SELECT 1 FROM document_revision h
            WHERE h.document_id=s.document_id AND h.revision_no > s.revision_no))
      + (SELECT count(*) FROM document_revision t
          WHERE t.approval_state='retired' AND NOT EXISTS (
            SELECT 1 FROM document_revision h
            WHERE h.document_id=t.document_id AND h.revision_no > t.revision_no))) = 0
            THEN 'PASS' ELSE 'FAIL' END;
