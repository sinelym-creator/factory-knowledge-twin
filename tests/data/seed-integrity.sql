-- =============================================================================
-- seed-integrity.sql — T1-2 synthetic seed 데이터 정합 표본 (검증 좌석)
--
-- 🔴 무엇을 보는가: 생성기 «자기 점검이 보지 않는 축»과, 스키마가 «막지 않기로 확정한» 축.
--    생성기 self_check는 규모·금지 ID·D-2·D-5·GS 바인딩을 본다(그건 재실행하지 않는다 —
--    자기 실측의 복창은 검증이 아니다). 여기 있는 것은 그 바깥이다:
--      ① 스키마가 비강제로 확정한 정합(G-4b ID↔소속)을 «데이터가» 지키는가
--      ② 주장했으나 어느 점검에도 없는 것(비용 표현 부재·알람 역방향·시간 인과)
--      ③ ID를 읽어 의미를 얻는다는 전제(§3.1)가 실제 행에서 성립하는가
--
-- 🔴 읽기 전용이다. 어떤 행도 쓰지 않으므로 타 좌석 스택에서도 안전하다.
-- 출력: check_id|무엇을|기대|실측|판정  (탭 구분 · 러너가 파싱한다)
-- =============================================================================

CREATE TEMP TABLE _cost_hits(n bigint);
DO $$
DECLARE r record; cnt bigint; total bigint := 0;
BEGIN
  -- Q-UNANS-001은 「비용이 데이터 어디에도 없다」가 정답 근거다. 한 칼럼만 봐서는 증명되지 않는다.
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND data_type IN ('text','character varying')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I ~ %L', r.table_name, r.column_name,
      '(원가|단가|금액|비용|가격|견적|₩|USD|KRW|만원|[Cc]ost|[Pp]rice|[Bb]udget)') INTO cnt;
    total := total + cnt;
  END LOOP;
  INSERT INTO _cost_hits VALUES (total);
END $$;

WITH checks(ord, check_id, what, expected, actual) AS (
  VALUES
  (1, 'C-1', 'GS-01 바인딩 ID 실재(21종)', 21, (
      SELECT count(*) FROM (
        SELECT 1 FROM factory WHERE id='FAC-A' UNION ALL
        SELECT 1 FROM production_line WHERE id='LN-A-02' UNION ALL
        SELECT 1 FROM equipment WHERE id IN ('EQ-CNC-204','EQ-CNC-207') UNION ALL
        SELECT 1 FROM component WHERE id='CP-204-BRG-01' UNION ALL
        SELECT 1 FROM sensor WHERE id IN ('SN-204-VIB','SN-204-TEMP','SN-204-CUR') UNION ALL
        SELECT 1 FROM alarm WHERE id='AL-20260826-0041' UNION ALL
        SELECT 1 FROM incident WHERE id='INC-2026-014' UNION ALL
        SELECT 1 FROM work_order WHERE id='WO-2026-0113' UNION ALL
        SELECT 1 FROM maintenance_record WHERE id='MR-2025-0087' UNION ALL
        SELECT 1 FROM failure_mode WHERE id IN ('FM-BRG-WEAR','FM-TOOL-IMB') UNION ALL
        SELECT 1 FROM sop WHERE id='SOP-BRG-INSP-014' UNION ALL
        SELECT 1 FROM document WHERE id IN ('DOC-SOP-0014','DOC-MAN-0021','DOC-MRP-0087') UNION ALL
        SELECT 1 FROM document_revision WHERE id='DOC-SOP-0014@r2' UNION ALL
        SELECT 1 FROM safety_rule WHERE id IN ('SAF-LOTO-01','SAF-PPE-01')) b)),

  (2, 'C-2', 'Q-UNANS-002 EQ-CNC-999 미등록', 0,
      (SELECT count(*)::bigint FROM equipment WHERE id='EQ-CNC-999')),

  (3, 'C-3', 'D-2 r1·r2 본문 sha256 상이(2종)', 2,
      (SELECT count(DISTINCT content_sha256) FROM document_revision WHERE document_id='DOC-SOP-0014')),

  (4, 'C-4', 'D-2 지금 인용 가능 revision = 1건', 1,
      (SELECT count(*)::bigint FROM document_revision
       WHERE document_id='DOC-SOP-0014' AND approval_state='approved'
         AND effective_from <= DATE '2026-08-26'
         AND (effective_to IS NULL OR effective_to > DATE '2026-08-26'))),

  (5, 'C-5', 'D-3 SOP revision 절 구조 결번', 0, (
      SELECT count(*)::bigint FROM document_revision r JOIN document d ON d.id=r.document_id
      WHERE d.doc_type='SOP' AND NOT (r.body ~ '(^|\n)#+\s*4\.' AND r.body ~ '(^|\n)#+\s*5\.'))),

  (6, 'C-6', 'D-5 SOP 미매핑 고장모드 = 1건', 1, (
      SELECT count(*)::bigint FROM failure_mode fm
      WHERE NOT EXISTS (SELECT 1 FROM failure_mode_sop fs WHERE fs.failure_mode_id=fm.id))),

  (7, 'C-7', 'D-5 FM-TOOL-IMB R09 직결(EQ-CNC-204)', 1, (
      SELECT count(*)::bigint FROM equipment_failure_mode
      WHERE equipment_id='EQ-CNC-204' AND failure_mode_id='FM-TOOL-IMB')),

  (8, 'C-8', 'D-6 SAF-PPE-01 실재', 1,
      (SELECT count(*)::bigint FROM safety_rule WHERE id='SAF-PPE-01')),

  (9, 'C-9', 'Q-UNANS-001 비용 표현(전 text 칼럼 훑기)', 0, (SELECT n FROM _cost_hits)),

  (10, 'C-10', 'G-4b component.id 설비번호 ↔ 소속 불일치', 0, (
      SELECT count(*)::bigint FROM component
      WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3))),

  (11, 'C-11', 'G-4b sensor.id 설비번호 ↔ 소속 불일치', 0, (
      SELECT count(*)::bigint FROM sensor
      WHERE split_part(id,'-',2) <> split_part(equipment_id,'-',3))),

  (12, 'C-12', '알람 observed_value ↔ 시계열 계측값 불일치', 0, (
      SELECT count(*)::bigint FROM alarm a WHERE NOT EXISTS (
        SELECT 1 FROM sensor_reading r
        WHERE r.sensor_id=a.sensor_id AND r.ts=a.raised_at AND r.value=a.observed_value))),

  (13, 'C-13', '임계 초과인데 알람이 없는 센서(역방향)', 0, (
      SELECT count(*)::bigint FROM (
        SELECT r.sensor_id FROM sensor_reading r JOIN sensor s ON s.id=r.sensor_id
        WHERE s.alarm_threshold IS NOT NULL AND r.value > s.alarm_threshold
        GROUP BY r.sensor_id
        HAVING (SELECT count(*) FROM alarm a WHERE a.sensor_id=r.sensor_id) = 0) x)),

  (14, 'C-14', '진행 중 incident에 진단 누설', 0, (
      SELECT count(*)::bigint FROM incident_diagnosis d JOIN incident i ON i.id=d.incident_id
      WHERE i.status <> 'closed')),

  (15, 'C-15', 'D-8 사슬 MR-2025-0087→WO-2025-0087→INC-2025-019', 1, (
      SELECT count(*)::bigint FROM maintenance_record mr
      JOIN work_order wo ON wo.id=mr.work_order_id
      JOIN incident i ON i.id=wo.incident_id
      WHERE mr.id='MR-2025-0087' AND wo.id='WO-2025-0087' AND i.id='INC-2025-019')),

  (16, 'C-16', '🔴 MR-{YYYY} ↔ performed_at 연도 불일치', 0, (
      SELECT count(*)::bigint FROM maintenance_record
      WHERE substring(id from 4 for 4) <> to_char(performed_at AT TIME ZONE 'Asia/Seoul','YYYY'))),

  (17, 'C-17', 'INC/WO/AL ID 날짜 ↔ 실제 시각 불일치', 0, (
      (SELECT count(*)::bigint FROM incident
       WHERE substring(id from 5 for 4) <> to_char(opened_at AT TIME ZONE 'Asia/Seoul','YYYY'))
    + (SELECT count(*)::bigint FROM work_order
       WHERE substring(id from 4 for 4) <> to_char(planned_at AT TIME ZONE 'Asia/Seoul','YYYY'))
    + (SELECT count(*)::bigint FROM alarm
       WHERE substring(id from 4 for 8) <> to_char(raised_at AT TIME ZONE 'Asia/Seoul','YYYYMMDD')))),

  (18, 'C-18', '시간 인과 역행(WO<INC · MR<WO)', 0, (
      (SELECT count(*)::bigint FROM work_order wo JOIN incident i ON i.id=wo.incident_id
       WHERE wo.planned_at < i.opened_at)
    + (SELECT count(*)::bigint FROM maintenance_record mr JOIN work_order wo ON wo.id=mr.work_order_id
       WHERE mr.performed_at < wo.planned_at))),

  (19, 'C-19', 'document.current_revision_no 결번', 0, (
      SELECT count(*)::bigint FROM document d WHERE NOT EXISTS (
        SELECT 1 FROM document_revision r
        WHERE r.document_id=d.id AND r.revision_no=d.current_revision_no))),

  (20, 'C-20', '고아 참조(sensor·component → equipment)', 0, (
      (SELECT count(*)::bigint FROM sensor s WHERE NOT EXISTS (SELECT 1 FROM equipment e WHERE e.id=s.equipment_id))
    + (SELECT count(*)::bigint FROM component c WHERE NOT EXISTS (SELECT 1 FROM equipment e WHERE e.id=c.equipment_id)))),

  -- 🔴 C-21·C-22 = G-2(동시 유효 revision)를 «대신 지키는» 그물. T1-7 A단 ③으로 신설했다.
  --    스키마는 이 축을 막지 않기로 확정했고(tests/schema P-3 · expect=accept), 그때 「데이터는
  --    tests/data C-4가 지킨다」고 적혔다. 그러나 C-4는 DOC-SOP-0014 «한 문서»만 본다 —
  --    주장이 그물보다 넓었다. 전 문서로 넓힌 것이 C-21이고, 겹침 자체를 직접 보는 것이 C-22다.
  (21, 'C-21', 'G-2 전 문서 «지금 인용 가능 revision» = 정확히 1건이 아닌 문서', 0, (
      SELECT count(*)::bigint FROM document d WHERE 1 <> (
        SELECT count(*) FROM document_revision r
        WHERE r.document_id=d.id AND r.approval_state='approved'
          AND r.effective_from <= DATE '2026-08-26'
          AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26')))),

  -- 겹침은 «조회시각»과 무관한 구조적 위반이다. C-21은 한 시점만 보므로 다른 시점의 겹침을
  -- 놓친다 — 두 축은 서로를 대신하지 못한다.
  (22, 'C-22', 'G-2 approved revision 유효구간이 서로 겹치는 문서', 0, (
      SELECT count(DISTINCT a.document_id)::bigint
      FROM document_revision a JOIN document_revision b
        ON a.document_id=b.document_id AND a.id < b.id
      WHERE a.approval_state='approved' AND b.approval_state='approved'
        AND a.effective_from < COALESCE(b.effective_to, DATE '9999-12-31')
        AND b.effective_from < COALESCE(a.effective_to, DATE '9999-12-31'))),

  -- 🔴 C-23~C-27 = G-3(상태 «전이» 방향)을 «대신 지키는» 그물. 2026-08-29 신설(G-3 전이 그물).
  --    스펙 §3.3: 「draft → approved → superseded → retired (역방향 없음).
  --    새 revision 승인 시 직전 revision은 superseded + effective_to 기입」
  --    🔴 전이 자체는 스냅숏에 없다. 그러나 «전이가 남기는 흔적»은 있다 — approved_by·
  --    effective_to·문서 내 상태 배치는 앞 상태를 지나온 증거다. 상태 열만 되돌리면 그 증거가
  --    남고, 증거까지 함께 지우면 이번에는 «문서 내 배치»가 어긋난다. 아래 5건은 그 모순을 본다.
  --    🔴 사정거리(어느 전이 쌍을 잡고 어느 쌍을 놓치는가)는 tests/data/transition-net.sql이
  --       쌍별로 계수한다 — 그 표가 이 5건의 «생존 증명»이자 «한계 성문»이다.
  --    🔴 여기 «없는» 것: 「superseded 인데 effective_to 없음」 = 002 ck_superseded_has_effective_to
  --       가 이미 DB에서 막는다(실측 T-I2 = SQLSTATE 23514). 그 위에 그물을 얹으면 그 초록은
  --       그물의 것이 아니라 스키마의 것이다 — 얹지 않았다.

  (23, 'C-23', 'G-3 superseded 인데 승인자 없음(approved를 지나지 않은 흔적)', 0, (
      SELECT count(*)::bigint FROM document_revision
      WHERE approval_state='superseded' AND approved_by IS NULL)),

  -- 🔴 G-1 CHECK는 superseded «한 상태»만 본다. S→R로 넘기면서 effective_to를 지우면 DB는
  --    막지 않는다(실측 T-I3) — 감사·replay 근거가 조용히 사라진다. 그 구멍을 메우는 그물이다.
  (24, 'C-24', 'G-3 retired 인데 effective_to 없음(G-1 CHECK 사정거리 밖)', 0, (
      SELECT count(*)::bigint FROM document_revision
      WHERE approval_state='retired' AND effective_to IS NULL)),

  -- 🔴 이 검사의 초록은 «비어 있어서» 초록일 수 있다 — 현 표본의 draft 행 = 0건(E1).
  --    값은 위반 주입에서만 나온다(net-liveness L-25 · transition-net T-R1·T-R2·T-R4).
  (25, 'C-25', 'G-3 draft 인데 승인 흔적 잔존(approved 이후 역방향 지문)', 0, (
      SELECT count(*)::bigint FROM document_revision
      WHERE approval_state='draft' AND (approved_by IS NOT NULL OR effective_to IS NOT NULL))),

  -- 승계 미이행 — 「새 revision 승인 시 직전 revision은 superseded」의 대우다.
  -- hi가 한 번이라도 승인에 도달했다면(approved·superseded·retired) 그 직전은 물러나 있어야
  -- 한다. 직전이 draft면 승인이 건너뛴 것이고, approved면 물러나지 않은 것이다.
  (26, 'C-26', 'G-3 승계 미이행 — 승인 도달 revision의 직전이 superseded·retired가 아님', 0, (
      SELECT count(*)::bigint FROM document_revision hi
      JOIN document_revision lo
        ON lo.document_id = hi.document_id AND lo.revision_no = hi.revision_no - 1
      WHERE hi.approval_state IN ('approved','superseded','retired')
        AND lo.approval_state NOT IN ('superseded','retired'))),

  -- superseded = «승계당함». 승계자가 없는 superseded는 물러날 이유가 없었던 행이다.
  (27, 'C-27', 'G-3 superseded 인데 더 높은 revision_no가 없음(승계자 없는 승계)', 0, (
      SELECT count(*)::bigint FROM document_revision s
      WHERE s.approval_state='superseded' AND NOT EXISTS (
        SELECT 1 FROM document_revision h
        WHERE h.document_id=s.document_id AND h.revision_no > s.revision_no)))
)
SELECT check_id, what, expected, actual,
       CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM checks ORDER BY ord;
