-- D-5 검증 — EQ-CNC-204에 연결된 고장모드 중 대응 SOP가 «없는» 것이 실제로 존재하는가.
--
-- 근거: benchmarks/datasets/eval-questions-draft.md §5 D-5 · Q-MULTIHOP-003(부정형)
--   「고장 모드가 있다」와 「그중 하나는 SOP가 없다」는 다르다. 전부 매핑해 두면
--   「없다」가 정답이 되어 문항이 죽는다.
--
-- 🔴 이 쿼리는 R08(부품 경유)와 R09(설비 직결)를 «둘 다» 훑는다.
--    R08만 보면 FM-TOOL-IMB가 아예 보이지 않아 「전부 매핑됨」이라 오답하게 된다 —
--    그것이 Q-MULTIHOP-003이 검출하려는 실패 모드다.
--
-- PASS 조건: sop_count = 0 인 행이 FM-TOOL-IMB «1건»뿐이고, 그 경로가 R09다.

\echo '== D-5 ① EQ-CNC-204에 연결된 고장모드 전량 (R08 + R09) =='
WITH linked AS (
  SELECT cfm.failure_mode_id, 'R08 component: ' || c.id AS path
    FROM component c
    JOIN component_failure_mode cfm ON cfm.component_id = c.id
   WHERE c.equipment_id = 'EQ-CNC-204'
  UNION ALL
  SELECT efm.failure_mode_id, 'R09 equipment direct' AS path
    FROM equipment_failure_mode efm
   WHERE efm.equipment_id = 'EQ-CNC-204'
)
SELECT l.failure_mode_id,
       fm.name,
       l.path,
       (SELECT count(*) FROM failure_mode_sop s
         WHERE s.failure_mode_id = l.failure_mode_id) AS sop_count
FROM linked l
JOIN failure_mode fm ON fm.id = l.failure_mode_id
ORDER BY sop_count, l.failure_mode_id;

\echo ''
\echo '== D-5 ② SOP 미매핑 고장모드 (여기 FM-TOOL-IMB 1행만 나오면 PASS) =='
WITH linked AS (
  SELECT cfm.failure_mode_id FROM component c
    JOIN component_failure_mode cfm ON cfm.component_id = c.id
   WHERE c.equipment_id = 'EQ-CNC-204'
  UNION
  SELECT efm.failure_mode_id FROM equipment_failure_mode efm
   WHERE efm.equipment_id = 'EQ-CNC-204'
)
SELECT l.failure_mode_id, fm.name, fm.severity_class
FROM linked l
JOIN failure_mode fm ON fm.id = l.failure_mode_id
WHERE NOT EXISTS (SELECT 1 FROM failure_mode_sop s
                   WHERE s.failure_mode_id = l.failure_mode_id);

\echo ''
\echo '== D-5 ③ 대조군 — 매핑된 경로는 정상인가 (GS-01 S5의 4-hop 종단) =='
SELECT fm.id AS failure_mode, s.id AS sop, sr.safety_rule_id AS required_safety_rule
FROM failure_mode fm
JOIN failure_mode_sop fs ON fs.failure_mode_id = fm.id
JOIN sop s ON s.id = fs.sop_id
LEFT JOIN sop_safety_rule sr ON sr.sop_id = s.id
WHERE fm.id = 'FM-BRG-WEAR'
ORDER BY sr.safety_rule_id;
