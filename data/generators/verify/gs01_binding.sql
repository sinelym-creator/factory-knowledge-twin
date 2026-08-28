-- GS-01 바인딩 ID 실재 검증 — golden-scenario-spec.md §5 바인딩 표 전량을 DB에서 확인한다.
--
-- T1-2 AC: 「GS-01 바인딩 ID 전부 DB 실재(SELECT 실측)」
-- PASS 조건
--   ① 21건 전부 found = 1
--   ② EQ-CNC-999 = 0 (Q-UNANS-002 — 미등록 자체가 정답 근거다)
--   ③ S5 4-hop 경로가 실제로 이어진다 (T0-6 §6이 회귀 최소 대상으로 지목한 R03·R08·R11·R12)

\echo '== ① 바인딩 ID 실재 (found 가 0인 행이 있으면 FAIL) =='
SELECT * FROM (
  SELECT 'factory'            AS entity, 'FAC-A'              AS id, count(*) AS found FROM factory            WHERE id = 'FAC-A'
  UNION ALL SELECT 'production_line',    'LN-A-02',            count(*) FROM production_line    WHERE id = 'LN-A-02'
  UNION ALL SELECT 'equipment',          'EQ-CNC-204',         count(*) FROM equipment          WHERE id = 'EQ-CNC-204'
  UNION ALL SELECT 'equipment',          'EQ-CNC-207',         count(*) FROM equipment          WHERE id = 'EQ-CNC-207'
  UNION ALL SELECT 'component',          'CP-204-BRG-01',      count(*) FROM component          WHERE id = 'CP-204-BRG-01'
  UNION ALL SELECT 'sensor',             'SN-204-VIB',         count(*) FROM sensor             WHERE id = 'SN-204-VIB'
  UNION ALL SELECT 'sensor',             'SN-204-TEMP',        count(*) FROM sensor             WHERE id = 'SN-204-TEMP'
  UNION ALL SELECT 'sensor',             'SN-204-CUR',         count(*) FROM sensor             WHERE id = 'SN-204-CUR'
  UNION ALL SELECT 'alarm',              'AL-20260826-0041',   count(*) FROM alarm              WHERE id = 'AL-20260826-0041'
  UNION ALL SELECT 'incident',           'INC-2026-014',       count(*) FROM incident           WHERE id = 'INC-2026-014'
  UNION ALL SELECT 'work_order',         'WO-2026-0113',       count(*) FROM work_order         WHERE id = 'WO-2026-0113'
  UNION ALL SELECT 'maintenance_record', 'MR-2025-0087',       count(*) FROM maintenance_record WHERE id = 'MR-2025-0087'
  UNION ALL SELECT 'failure_mode',       'FM-BRG-WEAR',        count(*) FROM failure_mode       WHERE id = 'FM-BRG-WEAR'
  UNION ALL SELECT 'failure_mode',       'FM-TOOL-IMB',        count(*) FROM failure_mode       WHERE id = 'FM-TOOL-IMB'
  UNION ALL SELECT 'sop',                'SOP-BRG-INSP-014',   count(*) FROM sop                WHERE id = 'SOP-BRG-INSP-014'
  UNION ALL SELECT 'document',           'DOC-SOP-0014',       count(*) FROM document           WHERE id = 'DOC-SOP-0014'
  UNION ALL SELECT 'document',           'DOC-MAN-0021',       count(*) FROM document           WHERE id = 'DOC-MAN-0021'
  UNION ALL SELECT 'document',           'DOC-MRP-0087',       count(*) FROM document           WHERE id = 'DOC-MRP-0087'
  UNION ALL SELECT 'document_revision',  'DOC-SOP-0014@r2',    count(*) FROM document_revision  WHERE id = 'DOC-SOP-0014@r2'
  UNION ALL SELECT 'safety_rule',        'SAF-LOTO-01',        count(*) FROM safety_rule        WHERE id = 'SAF-LOTO-01'
  UNION ALL SELECT 'safety_rule',        'SAF-PPE-01',         count(*) FROM safety_rule        WHERE id = 'SAF-PPE-01'
) b ORDER BY found, entity, id;

\echo ''
\echo '== ② 미등록이어야 하는 ID (전부 0이면 PASS · Q-UNANS-002) =='
SELECT 'EQ-CNC-999' AS id, count(*) AS found FROM equipment WHERE id = 'EQ-CNC-999';

\echo ''
\echo '== ③ GS-01 S5 4-hop 경로 (Equipment →HAS_COMPONENT→ Component →HAS_FAILURE_MODE→ FailureMode →MITIGATED_BY→ SOP →REQUIRES→ SafetyRule) =='
SELECT e.id AS equipment, c.id AS component, fm.id AS failure_mode,
       s.id AS sop, sr.safety_rule_id AS safety_rule
FROM equipment e
JOIN component c                ON c.equipment_id = e.id                  -- R03
JOIN component_failure_mode cfm ON cfm.component_id = c.id                -- R08
JOIN failure_mode fm            ON fm.id = cfm.failure_mode_id
JOIN failure_mode_sop fs        ON fs.failure_mode_id = fm.id             -- R11
JOIN sop s                      ON s.id = fs.sop_id
JOIN sop_safety_rule sr         ON sr.sop_id = s.id                       -- R12
WHERE e.id = 'EQ-CNC-204' AND fm.id = 'FM-BRG-WEAR'
ORDER BY sr.safety_rule_id;

\echo ''
\echo '== ④ S1 알람 ↔ 시계열 정합 (observed_value 가 그 시각 계측값과 일치해야 한다) =='
SELECT a.id, a.raised_at, a.threshold_value, a.observed_value,
       r.value AS reading_at_raised_at,
       (a.observed_value = r.value) AS matches_timeseries
FROM alarm a
JOIN sensor_reading r ON r.sensor_id = a.sensor_id AND r.ts = a.raised_at
WHERE a.id = 'AL-20260826-0041';

-- 🔴 25건 «전량» 정합. 알람만 만들고 파형을 안 건드리면 「알람은 있는데 그 시각 값은
--    임계 미만」인 모순이 남는다 — 그런 행이 하나라도 있으면 seed 결함이다.
SELECT count(*)                                                   AS alarm_total,
       count(r.value)                                             AS reading_found,
       count(*) FILTER (WHERE a.observed_value = r.value)          AS observed_matches,
       count(*) FILTER (WHERE a.observed_value >= a.threshold_value) AS above_threshold
FROM alarm a
LEFT JOIN sensor_reading r ON r.sensor_id = a.sensor_id AND r.ts = a.raised_at;

\echo ''
\echo '== ⑤ D-8 정비이력 ↔ WorkOrder ↔ Incident 연결 (Q-MULTIHOP-002) =='
SELECT mr.id AS maintenance_record, mr.performed_at::date, mr.action_type,
       mrf.failure_mode_id, wo.id AS work_order, inc.id AS incident, inc.status
FROM maintenance_record mr
LEFT JOIN maintenance_record_failure_mode mrf ON mrf.maintenance_record_id = mr.id
LEFT JOIN work_order wo ON wo.id = mr.work_order_id
LEFT JOIN incident inc  ON inc.id = wo.incident_id
WHERE mr.id = 'MR-2025-0087';

\echo ''
\echo '== ⑥ 시계열 규모·해상도 실측 =='
SELECT sensor_id, count(*) AS rows,
       min(ts) AS first_ts, max(ts) AS last_ts,
       round(min(value), 2) AS min_value, round(max(value), 2) AS max_value
FROM sensor_reading
WHERE sensor_id IN ('SN-204-VIB', 'SN-204-TEMP', 'SN-204-CUR', 'SN-207-VIB')
GROUP BY sensor_id ORDER BY sensor_id;

SELECT count(*) AS sensor_reading_total FROM sensor_reading;
