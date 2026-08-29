-- =============================================================================
-- transition-net.sql — approval_state «전이 자체»를 보는 그물 (검증 좌석 · G-3)
--
-- 🔴 왜 이 파일이 필요한가: G-3(전이 방향)은 T1-1 이래 「스키마 비강제 확정 + 그물 없음」인
--    존치 부채였다. 그때의 근거는 「전이는 스냅숏으로 볼 수 없다」였다. 그 문장은 «전건»이
--    아니다 — 전이 중 어떤 것은 흔적을 남기고 어떤 것은 남기지 않는다. 이 파일은 그 경계를
--    쌍별로 «계수»한다. 계수되지 않은 부채는 부채가 아니라 무지다.
--
-- 🔴 성문 (스펙 docs/product/data-ontology-spec.md §3.3 정본 1줄):
--      「상태 전이 = draft → approved → superseded → retired (역방향 없음).
--        새 revision 승인 시 직전 revision은 superseded + effective_to 기입」
--    4상태 16쌍이 3갈래로 갈린다 (자기전이 4쌍 = 전이 아님 · 12쌍이 대상):
--      합법 «전진 인접» 3쌍  D→A · A→S · S→R
--      위반 «역방향»    6쌍  A→D · S→D · S→A · R→D · R→A · R→S   ← 명문 금지
--      🔴 미정의 «건너뜀» 3쌍 D→S · D→R · A→R
--         스펙은 «역방향»만 금지했고 건너뜀에는 침묵한다. 좌석이 스펙에 없는 판정을
--         만들지 않는다 — 계수만 하고 판정은 INFO로 비운다(오케 회부 대상).
--
-- 🔴 무엇을 관측하는가 (한 쌍 = 한 조각의 대조):
--      ① 설정만 한 상태(전이 «전») 그물 계수  ② 전이 주입 «후» 그물 계수  → 증분이 전이의 몫
--      전이 그물 = C-23·C-24·C-25·C-26·C-27 (tests/data/seed-integrity.sql 상시분)
--      기존 그물 = C-21·C-22               (G-2 · 전이의 «결과»를 잡는 것)
--    두 계수를 나란히 두는 것이 이 파일의 «대조군»이다 — 새 그물이 기존 그물을 되풀이하는지,
--    아니면 기존 그물이 못 보던 것을 보는지가 두 열로 갈린다. 되풀이면 신설할 이유가 없다.
--
-- 🔴 변형 2종 (역방향 6쌍에만 적용 · 이것이 사정거리를 가르는 축이다):
--      «흔적 보존» 상태 열만 되돌린다 — 서비스 계층 없는 raw UPDATE. G-3이 지목한 그 쓰기다.
--      «흔적 삭제» 목적 상태와 앞뒤가 맞게 approved_by·effective_to까지 함께 고친다.
--                  스냅숏이 원리적으로 구별할 수 있는 한계가 여기서 드러난다.
--
-- 🔴 이 파일은 «쓴다». 전체가 BEGIN … ROLLBACK 1개 안에 있고, 쌍 1건 = plpgsql 하위 블록
--    1개(예외로 자기 되감기)라 이중 격리다. 마지막 T-0가 잔여물 0을 실측한다.
--    seed-integrity.sql(읽기 전용)과 섞지 않는다.
--
--   docker compose exec -T postgres psql -U fkt -d fkt -v ON_ERROR_STOP=1 -tA -F "\t" \
--       < tests/data/transition-net.sql
--   (러너: pwsh tests/data/run-transition-net.ps1)
--
-- 출력: check_id|무엇을|기대|실측|판정  (탭 구분 · 러너가 파싱한다)
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _tn(ord int, cid text, what text, expected text, actual text, verdict text)
  ON COMMIT DROP;

-- 🔴 그물 계수를 이 파일 «한 곳»에만 적는다 — 파일 안에서 두 번 쓰면 그 둘이 갈린다.
--    seed-integrity.sql의 C-21~C-27과는 여전히 «따로» 조립한 것이다(파일 간 include 경로가
--    없다). 그 별도 조립의 기준선 정합은 아래 T-B가 실측한다.
CREATE FUNCTION pg_temp.f_nets(OUT n_new bigint, OUT n_old bigint) AS $f$
  SELECT
    -- 전이 그물 C-23·C-24·C-25·C-26·C-27
      (SELECT count(*) FROM document_revision
        WHERE approval_state='superseded' AND approved_by IS NULL)                     -- C-23
    + (SELECT count(*) FROM document_revision
        WHERE approval_state='retired' AND effective_to IS NULL)                       -- C-24
    + (SELECT count(*) FROM document_revision
        WHERE approval_state='draft'
          AND (approved_by IS NOT NULL OR effective_to IS NOT NULL))                   -- C-25
    + (SELECT count(*) FROM document_revision hi                                       -- C-26
        JOIN document_revision lo
          ON lo.document_id = hi.document_id AND lo.revision_no = hi.revision_no - 1
        WHERE hi.approval_state IN ('approved','superseded','retired')
          AND lo.approval_state NOT IN ('superseded','retired'))
    + (SELECT count(*) FROM document_revision s                                        -- C-27
        WHERE s.approval_state='superseded' AND NOT EXISTS (
          SELECT 1 FROM document_revision h
          WHERE h.document_id=s.document_id AND h.revision_no > s.revision_no)),
    -- 기존 그물 C-21·C-22 (G-2)
      (SELECT count(*) FROM document d WHERE 1 <> (
          SELECT count(*) FROM document_revision r
          WHERE r.document_id=d.id AND r.approval_state='approved'
            AND r.effective_from <= DATE '2026-08-26'
            AND (r.effective_to IS NULL OR r.effective_to > DATE '2026-08-26')))
    + (SELECT count(DISTINCT a.document_id)
        FROM document_revision a JOIN document_revision b
          ON a.document_id=b.document_id AND a.id < b.id
        WHERE a.approval_state='approved' AND b.approval_state='approved'
          AND a.effective_from < COALESCE(b.effective_to, DATE '9999-12-31')
          AND b.effective_from < COALESCE(a.effective_to, DATE '9999-12-31'));
$f$ LANGUAGE sql;

DO $do$
DECLARE
  c        record;
  s_new    bigint; s_old bigint;   -- 설정 직후(전이 전)
  a_new    bigint; a_old bigint;   -- 전이 주입 직후
  d_new    bigint; d_old bigint;   -- 증분 = 전이의 몫
  rejected boolean; errc text;
BEGIN
  -- 대상 2행: DOC-SAF-0029@r2(중간 · 위에 r3이 있다) · @r3(최상위 · 위가 없다)
  --   🔴 어느 행에 주입하느냐가 판정을 바꾼다 — 「승계자 유무」가 관측 가능성의 축이기 때문이다.
  --      T-R6/T-W6(중간)과 T-R7(최상위)이 같은 R→S인데 갈리는 것이 그 실증이다.
  FOR c IN
    SELECT * FROM (VALUES
      -- ord, cid, 무엇을, 대상, ── 설정(from) ──, ── 주입(to) ──, 기대
      --   기대: 정수 = 전이 그물 증분 · 'REJECT' = DB가 거부해야 함 · 'INFO' = 판정 없음

      -- ── 합법 3쌍 · «완전» 전이 ────────────────────────────────────────────────
      ( 1,'T-L1','합법 D→A «완전»(승인자 기입) — 조용해야 한다',
           'DOC-SAF-0029@r3', 'draft',      NULL::text,            NULL::text,
                              'approved',   'maintenance_manager', NULL::text,        '0'),
      -- 🔴 승계는 «두 행»의 사건이다. r3이 이미 approved인 채로 r2를 approved로 세우면 그것이
      --    곧 승계 미이행 상태다 — 합법 A→S는 그 위반을 «해소»한다. 증분 −1 = 그물이 옳은
      --    방향으로 움직였다는 뜻이다(조용함보다 강한 대조다).
      ( 2,'T-L2','합법 A→S «완전»(승계 성립) — 위반 상태를 해소해야 한다',
           'DOC-SAF-0029@r2', 'approved',   'maintenance_manager', NULL,
                              'superseded', 'maintenance_manager', '2026-07-01',      '-1'),
      ( 3,'T-L3','합법 S→R «완전» — 조용해야 한다',
           'DOC-SAF-0029@r2', 'superseded', 'maintenance_manager', '2026-07-01',
                              'retired',    'maintenance_manager', '2026-07-01',      '0'),

      -- ── 합법 3쌍 · «불완전»(스펙 제2문 미이행) → 막히거나 울어야 한다 ─────────
      ( 4,'T-I1','🔴 불완전 D→A(승인자 없이 승인) — DB가 거부하는가',
           'DOC-SAF-0029@r3', 'draft',      NULL,                  NULL,
                              'approved',   NULL,                  NULL,              'REJECT'),
      -- 🔴 이 자리는 처음에 「C-24가 운다(기대 1)」로 적었다가 실측이 뒤집었다 — 002의
      --    ck_superseded_has_effective_to(G-1)가 DB에서 먼저 막는다. 그래서 이 축에는
      --    그물을 얹지 않았다. 스키마가 이미 지키는 것 위의 그물은 초록을 훔친다.
      ( 5,'T-I2','🔴 불완전 A→S(effective_to 미기입) — G-1 CHECK가 거부하는가',
           'DOC-SAF-0029@r3', 'approved',   'maintenance_manager', NULL,
                              'superseded', 'maintenance_manager', NULL,              'REJECT'),
      -- 🔴 그런데 그 CHECK는 superseded «한 상태»만 본다. S→R로 넘기며 지우면 DB는 통과시킨다.
      ( 6,'T-I3','🔴 불완전 S→R(effective_to 지움) — C-24가 그 구멍을 메우는가',
           'DOC-SAF-0029@r2', 'superseded', 'maintenance_manager', '2026-07-01',
                              'retired',    'maintenance_manager', NULL,              '1'),

      -- ── 위반 6쌍 × «흔적 보존»(상태 열만 되돌림) ─────────────────────────────
      (11,'T-R1','위반 A→D «흔적 보존» — 승인 흔적이 남는다',
           'DOC-SAF-0029@r3', 'approved',   'maintenance_manager', NULL,
                              'draft',      'maintenance_manager', NULL,              '1'),
      (12,'T-R2','위반 S→D «흔적 보존» — 흔적 + 승계 배치 둘 다 어긋난다',
           'DOC-SAF-0029@r2', 'superseded', 'maintenance_manager', '2026-07-01',
                              'draft',      'maintenance_manager', '2026-07-01',      '2'),
      (13,'T-R3','위반 S→A «흔적 보존» — 승계 미이행으로 드러난다',
           'DOC-SAF-0029@r2', 'superseded', 'maintenance_manager', '2026-07-01',
                              'approved',   'maintenance_manager', '2026-07-01',      '1'),
      (14,'T-R4','위반 R→D «흔적 보존» — 흔적 + 승계 배치 둘 다 어긋난다',
           'DOC-SAF-0029@r2', 'retired',    'maintenance_manager', '2026-07-01',
                              'draft',      'maintenance_manager', '2026-07-01',      '2'),
      (15,'T-R5','위반 R→A «흔적 보존» — 승계 미이행으로 드러난다',
           'DOC-SAF-0029@r2', 'retired',    'maintenance_manager', '2026-07-01',
                              'approved',   'maintenance_manager', '2026-07-01',      '1'),
      -- 🔴 known gap ①. 중간 revision의 R→S는 잔여열도 배치도 바뀌지 않는다 — 스냅숏에
      --    남는 차이가 «없다». 그물이 못 잡는 것이 아니라 볼 것이 없는 것이다. 0으로 고정한다.
      (16,'T-R6','🔴 known gap 위반 R→S(중간 revision) «흔적 보존» — 관측 가능한 차이 없음',
           'DOC-SAF-0029@r2', 'retired',    'maintenance_manager', '2026-07-01',
                              'superseded', 'maintenance_manager', '2026-07-01',      '0'),
      -- 🔴 같은 R→S인데 «최상위»에서는 잡힌다 — superseded는 승계자를 함축하기 때문이다.
      (17,'T-R7','위반 R→S(최상위 revision) — 승계자 없는 승계로 드러난다',
           'DOC-SAF-0029@r3', 'retired',    'maintenance_manager', '2026-08-01',
                              'superseded', 'maintenance_manager', '2026-08-01',      '1'),

      -- ── 위반 6쌍 × «흔적 삭제»(목적 상태와 앞뒤 맞춤) ────────────────────────
      -- 🔴 흔적을 지우면 C-25는 침묵한다. 그때 무엇이 남는가가 이 묶음의 질문이다.
      (21,'T-W1','위반 A→D «흔적 삭제» — 전이 그물은 침묵(기존 C-21이 덮는다)',
           'DOC-SAF-0029@r3', 'approved',   'maintenance_manager', NULL,
                              'draft',      NULL,                  NULL,              '0'),
      (22,'T-W2','위반 S→D «흔적 삭제» — 승계 배치가 남아 잡힌다',
           'DOC-SAF-0029@r2', 'superseded', 'maintenance_manager', '2026-07-01',
                              'draft',      NULL,                  NULL,              '1'),
      (23,'T-W3','위반 S→A «흔적 삭제» — 승계 미이행으로 잡힌다',
           'DOC-SAF-0029@r2', 'superseded', 'maintenance_manager', '2026-07-01',
                              'approved',   'maintenance_manager', NULL,              '1'),
      (24,'T-W4','위반 R→D «흔적 삭제» — 승계 배치가 남아 잡힌다',
           'DOC-SAF-0029@r2', 'retired',    'maintenance_manager', '2026-07-01',
                              'draft',      NULL,                  NULL,              '1'),
      (25,'T-W5','위반 R→A «흔적 삭제» — 승계 미이행으로 잡힌다',
           'DOC-SAF-0029@r2', 'retired',    'maintenance_manager', '2026-07-01',
                              'approved',   'maintenance_manager', NULL,              '1'),
      -- 🔴 known gap ②. ①과 같은 이유다 — 두 상태의 잔여열 요건이 동일하다.
      (26,'T-W6','🔴 known gap 위반 R→S(중간 revision) «흔적 삭제» — 관측 가능한 차이 없음',
           'DOC-SAF-0029@r2', 'retired',    'maintenance_manager', '2026-07-01',
                              'superseded', 'maintenance_manager', '2026-07-01',      '0'),

      -- ── 미정의 «건너뜀» 3쌍 → 판정하지 않는다. 계수만 남긴다 ──────────────────
      -- 🔴 D→S는 승인자 없이 물러난 행을 만든다(C-23이 운다). 그러나 이 전이가 «위반인지»는
      --    스펙이 말한 적이 없다 — 그물이 우는 것과 그것이 위반인 것은 다른 문장이다.
      (31,'T-U1','미정의 D→S(스펙 침묵) — 계수만',
           'DOC-SAF-0029@r3', 'draft',      NULL,                  NULL,
                              'superseded', NULL,                  '2026-08-01',      'INFO'),
      (32,'T-U2','미정의 D→R(스펙 침묵) — 계수만',
           'DOC-SAF-0029@r3', 'draft',      NULL,                  NULL,
                              'retired',    'maintenance_manager', '2026-08-01',      'INFO'),
      (33,'T-U3','미정의 A→R(스펙 침묵) — 계수만',
           'DOC-SAF-0029@r3', 'approved',   'maintenance_manager', NULL,
                              'retired',    'maintenance_manager', '2026-08-01',      'INFO')
    ) AS t(ord, cid, what, tgt, f_state, f_by, f_to, i_state, i_by, i_to, expected)
    ORDER BY ord
  LOOP
    rejected := true; errc := NULL;
    d_new := NULL; d_old := NULL;

    BEGIN
      -- ① 설정 — from 상태와 잔여열을 «앞뒤 맞게» 세운다.
      --    설정 자체가 그물을 울릴 수 있으므로(예: r3을 draft로 두면 C-21이 운다)
      --    반드시 설정 «후»를 기준선으로 잡는다. 증분만이 전이의 몫이다.
      UPDATE document_revision
         SET approval_state = c.f_state,
             approved_by    = c.f_by,
             effective_to   = c.f_to::date
       WHERE id = c.tgt;
      SELECT n_new, n_old INTO s_new, s_old FROM pg_temp.f_nets();

      -- ② 전이 주입
      UPDATE document_revision
         SET approval_state = c.i_state,
             approved_by    = c.i_by,
             effective_to   = c.i_to::date
       WHERE id = c.tgt;
      SELECT n_new, n_old INTO a_new, a_old FROM pg_temp.f_nets();

      rejected := false;
      d_new := a_new - s_new;
      d_old := a_old - s_old;

      -- 하위 블록을 «스스로» 되감는다. plpgsql 변수는 되감기를 넘어 살아남으므로
      -- 위에서 잰 값은 그대로 남는다.
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__undo__';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> '__undo__' THEN
        rejected := true;
        errc := SQLSTATE;
      END IF;
    END;

    INSERT INTO _tn VALUES (
      c.ord, c.cid, c.what, c.expected,
      CASE WHEN rejected THEN format('DB 거부(SQLSTATE %s)', COALESCE(errc,'?'))
           ELSE format('전이 그물 %s%s · 기존 그물 %s%s',
                       CASE WHEN d_new >= 0 THEN '+' ELSE '' END, d_new,
                       CASE WHEN d_old >= 0 THEN '+' ELSE '' END, d_old) END,
      CASE
        WHEN c.expected = 'INFO'   THEN 'INFO'
        WHEN c.expected = 'REJECT' THEN CASE WHEN rejected THEN 'PASS' ELSE 'FAIL' END
        WHEN rejected              THEN 'FAIL'
        WHEN d_new = c.expected::bigint THEN 'PASS'
        ELSE 'FAIL' END);
  END LOOP;
END $do$;

-- --- T-B: 손대지 않은 표본에서의 기준선 ---------------------------------------
-- 🔴 이 파일과 seed-integrity.sql은 같은 술어를 «따로» 조립한다. 한쪽이 낡으면 깨끗한
--    표본에서의 기준선이 갈린다 — 그 최소 신호를 여기서 본다(전수 대조는 아니다).
INSERT INTO _tn
SELECT 90, 'T-B', '기준선 — 손대지 않은 표본에서 전이 그물 / 기존 그물 계수', '0 / 0',
       format('%s / %s', n_new, n_old),
       CASE WHEN n_new = 0 AND n_old = 0 THEN 'PASS' ELSE 'FAIL' END
FROM pg_temp.f_nets();

-- --- T-0: 되감기 확인 (하위 블록 격리가 실제로 작동했는가) --------------------
INSERT INTO _tn
SELECT 99, 'T-0', '되감기 확인 — 전 주입 후 대상 2행의 상태·잔여열 원형 일치', '2',
       count(*)::text,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END
FROM document_revision
WHERE (id='DOC-SAF-0029@r2' AND approval_state='superseded'
         AND approved_by='maintenance_manager' AND effective_to = DATE '2026-07-01')
   OR (id='DOC-SAF-0029@r3' AND approval_state='approved'
         AND approved_by='maintenance_manager' AND effective_to IS NULL);

SELECT cid, what, expected, actual, verdict FROM _tn ORDER BY ord;

ROLLBACK;
