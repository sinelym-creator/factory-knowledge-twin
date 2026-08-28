-- =============================================================================
-- 001_core_schema.sql — T0-6 데이터·온톨로지 스펙 v0.1 → PostgreSQL 실물 스키마
--
-- 🔴 유일 원천 = docs/product/data-ontology-spec.md (동결 v0.1)
-- 🔴 재실행 멱등: 전 객체가 IF NOT EXISTS. CHECK/FK는 CREATE TABLE 안에 두어
--    테이블이 이미 있으면 통째로 건너뛴다(ADD CONSTRAINT IF NOT EXISTS가 없는 PG 제약 회피).
-- 🔴 기능 코드 없음 — 스키마뿐. seed는 T1-2, 색인은 T1-4, 그래프 투영은 T1-5.
--
-- 임베딩 차원은 모델 미확정이라 파라미터다(스펙 §8 Q2 · dev-environment §8 E3):
--   psql -v embedding_dim=768 ...   ← migrate 스크립트가 넘긴다
-- 기본값 768은 «자리표시자»이며 모델 확정 시 마이그레이션을 새로 추가해 교체한다
-- (이미 만들어진 칼럼은 IF NOT EXISTS 때문에 재적용으로 바뀌지 않는다).
-- =============================================================================

\if :{?embedding_dim}
\else
  \set embedding_dim 768
\endif

CREATE EXTENSION IF NOT EXISTS vector;

-- 마이그레이션 적용 이력 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migration (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 1. 물리·계층 (스펙 §1.1)
-- =============================================================================

-- E01 Factory — ID 패턴 FAC-{SITE}
CREATE TABLE IF NOT EXISTS factory (
  id         text PRIMARY KEY CHECK (id ~ '^FAC-[A-Z0-9]+$'),
  name       text        NOT NULL,
  site_code  text        NOT NULL,
  timezone   text        NOT NULL DEFAULT 'Asia/Seoul',
  status     text        NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'inactive', 'retired')),
  semantic_id text,      -- 외부 교환용 URI (스펙 §3.2-6): urn:fkt:Factory:{id}
  created_at timestamptz NOT NULL DEFAULT now()
);

-- E02 ProductionLine — LN-{SITE}-{NN} · R01 Factory 1:N
CREATE TABLE IF NOT EXISTS production_line (
  id          text PRIMARY KEY CHECK (id ~ '^LN-[A-Z0-9]+-[0-9]{2}$'),
  factory_id  text        NOT NULL REFERENCES factory(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  line_no     smallint    NOT NULL,
  status      text        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'stopped', 'maintenance', 'retired')),
  semantic_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, line_no)
);

-- E03 Equipment — EQ-{CLASS3}-{NNN} · R02 ProductionLine 1:N
CREATE TABLE IF NOT EXISTS equipment (
  id              text PRIMARY KEY CHECK (id ~ '^EQ-[A-Z]{2,4}-[0-9]{3}$'),
  line_id         text        NOT NULL REFERENCES production_line(id) ON DELETE RESTRICT,
  name            text        NOT NULL,
  equipment_class text        NOT NULL
                  CHECK (equipment_class IN ('CNC', 'CONVEYOR', 'ROBOT', 'PRESS')),
  model           text        NOT NULL,
  installed_on    date        NOT NULL,
  status          text        NOT NULL DEFAULT 'normal'
                  CHECK (status IN ('normal', 'warning', 'critical', 'stopped', 'retired')),
  criticality     text        NOT NULL DEFAULT 'medium'
                  CHECK (criticality IN ('low', 'medium', 'high')),
  semantic_id     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- E04 Component — CP-{EQ_NUM}-{CLASS3}-{NN} · R03 Equipment 1:N
CREATE TABLE IF NOT EXISTS component (
  id              text PRIMARY KEY CHECK (id ~ '^CP-[0-9]{3}-[A-Z]{2,4}-[0-9]{2}$'),
  equipment_id    text        NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  component_class text        NOT NULL,
  installed_on    date        NOT NULL,
  semantic_id     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- E05 Sensor — SN-{EQ_NUM}-{MEAS} · R04 Equipment 1:N
CREATE TABLE IF NOT EXISTS sensor (
  id               text PRIMARY KEY CHECK (id ~ '^SN-[0-9]{3}-[A-Z]{2,5}$'),
  equipment_id     text        NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  measurement_type text        NOT NULL
                   CHECK (measurement_type IN ('VIB', 'TEMP', 'CUR', 'SPD')),
  unit             text        NOT NULL,
  sampling_hz      numeric(8,3) NOT NULL CHECK (sampling_hz > 0),
  warn_threshold   numeric(12,4),
  alarm_threshold  numeric(12,4),
  semantic_id      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- 임계는 «주의 < 위험» 순서여야 한다(둘 다 있을 때만 검사)
  CHECK (warn_threshold IS NULL OR alarm_threshold IS NULL
         OR warn_threshold < alarm_threshold)
);

-- E06 SensorReading — 복합 PK(sensor_id, ts) · R05 · 🔴 PostgreSQL 전용(그래프 미투영)
-- 규모 추정 ≈ 95만 row(스펙 §5): 기저 1분×21일 + 사건구간 1초×4시간
CREATE TABLE IF NOT EXISTS sensor_reading (
  sensor_id text        NOT NULL REFERENCES sensor(id) ON DELETE CASCADE,
  ts        timestamptz NOT NULL,
  value     numeric(12,4) NOT NULL,
  quality   text        NOT NULL DEFAULT 'good'
            CHECK (quality IN ('good', 'suspect', 'bad')),
  PRIMARY KEY (sensor_id, ts)
);

-- =============================================================================
-- 2. 운영 사건 (스펙 §1.2)
-- =============================================================================

-- E08 Incident — INC-{YYYY}-{NNN} · R14 Equipment N:1
-- (Alarm보다 먼저 만든다 — R13 alarm→incident FK가 이 테이블을 참조한다)
CREATE TABLE IF NOT EXISTS incident (
  id           text PRIMARY KEY CHECK (id ~ '^INC-[0-9]{4}-[0-9]{3}$'),
  equipment_id text        NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  title        text        NOT NULL,
  opened_at    timestamptz NOT NULL,
  closed_at    timestamptz,
  status       text        NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  severity     text        NOT NULL
               CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

-- E07 Alarm — AL-{YYYYMMDD}-{NNNN} · R06 Sensor 1:N · R07 Equipment N:1(역정규화) · R13 Incident N:1
CREATE TABLE IF NOT EXISTS alarm (
  id              text PRIMARY KEY CHECK (id ~ '^AL-[0-9]{8}-[0-9]{4}$'),
  sensor_id       text        NOT NULL REFERENCES sensor(id) ON DELETE CASCADE,
  equipment_id    text        NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  incident_id     text        REFERENCES incident(id) ON DELETE SET NULL,
  severity        text        NOT NULL
                  CHECK (severity IN ('info', 'warning', 'critical')),
  threshold_value numeric(12,4) NOT NULL,   -- 발생 시점 임계 스냅샷(AlarmRule을 별도 entity로 두지 않은 이유 · 스펙 §1.5)
  observed_value  numeric(12,4) NOT NULL,
  raised_at       timestamptz NOT NULL,
  cleared_at      timestamptz,
  status          text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'acknowledged', 'cleared')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (cleared_at IS NULL OR cleared_at >= raised_at)
);

-- E09 WorkOrder — WO-{YYYY}-{NNNN} · R16 Incident 1:N
CREATE TABLE IF NOT EXISTS work_order (
  id                text PRIMARY KEY CHECK (id ~ '^WO-[0-9]{4}-[0-9]{4}$'),
  incident_id       text        REFERENCES incident(id) ON DELETE SET NULL,
  equipment_id      text        NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  title             text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'planned', 'in_progress', 'done', 'cancelled')),
  approval_state    text        NOT NULL DEFAULT 'pending'
                    CHECK (approval_state IN ('pending', 'approved', 'rejected')),
  priority          text        NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'urgent')),
  planned_at        timestamptz,
  assignee_role     text,
  parts             jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{partNo, qty}]
  checklist         jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ["점검 항목", ...]
  estimated_minutes integer     CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- E10 MaintenanceRecord — MR-{YYYY}-{NNNN} · R18 WorkOrder 1:N · R19 Equipment N:1
CREATE TABLE IF NOT EXISTS maintenance_record (
  id            text PRIMARY KEY CHECK (id ~ '^MR-[0-9]{4}-[0-9]{4}$'),
  equipment_id  text        NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  work_order_id text        REFERENCES work_order(id) ON DELETE SET NULL,
  -- MaintenanceAction을 별도 entity로 두지 않고 유형 속성으로 흡수(스펙 §1.5)
  action_type   text        NOT NULL
                CHECK (action_type IN ('inspect', 'replace', 'lubricate', 'calibrate', 'repair')),
  performed_at  timestamptz NOT NULL,
  duration_min  integer     CHECK (duration_min IS NULL OR duration_min >= 0),
  result        text        NOT NULL DEFAULT 'completed'
                CHECK (result IN ('completed', 'partial', 'failed')),
  note          text,                                            -- 유사 사례 vector 검색 대상(스펙 §4)
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. 문서·SSOT (스펙 §1.4) — 지식(§1.3)이 이 테이블을 참조하므로 먼저 만든다
-- =============================================================================

-- E14 Document — DOC-{DOCTYPE}-{NNNN}
CREATE TABLE IF NOT EXISTS document (
  id                   text PRIMARY KEY CHECK (id ~ '^DOC-[A-Z]{3,4}-[0-9]{4}$'),
  doc_type             text        NOT NULL
                       CHECK (doc_type IN ('SOP', 'MANUAL', 'SAFETY', 'MAINT_REPORT', 'SPEC')),
  title                text        NOT NULL,
  owner_role           text        NOT NULL,
  current_revision_no  integer     NOT NULL DEFAULT 1 CHECK (current_revision_no >= 1),
  status               text        NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'retired')),
  semantic_id          text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- E15 DocumentRevision — {document_id}@r{N} · R24 Document 1:N
-- 🔴 스펙 §3.3: 인용 가능 = approval_state='approved' AND effective 기간 내
CREATE TABLE IF NOT EXISTS document_revision (
  id             text PRIMARY KEY CHECK (id ~ '^DOC-[A-Z]{3,4}-[0-9]{4}@r[0-9]+$'),
  document_id    text        NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  revision_no    integer     NOT NULL CHECK (revision_no >= 1),
  content_sha256 char(64)    NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  body_uri       text        NOT NULL,
  body           text,                                   -- 원문(SSOT · 청크의 원천)
  effective_from date        NOT NULL,
  effective_to   date,
  approval_state text        NOT NULL DEFAULT 'draft'
                 CHECK (approval_state IN ('draft', 'approved', 'superseded', 'retired')),
  approved_by    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, revision_no),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- 승인된 revision은 승인자가 반드시 있어야 한다
  CHECK (approval_state <> 'approved' OR approved_by IS NOT NULL)
);

-- E16 DocumentChunk — {revision_id}#{NNN} · R25 DocumentRevision 1:N
-- 🔴 embedding 차원 = :embedding_dim (기본 768 · 모델 확정 시 신규 마이그레이션으로 교체)
CREATE TABLE IF NOT EXISTS document_chunk (
  id           text PRIMARY KEY CHECK (id ~ '^DOC-[A-Z]{3,4}-[0-9]{4}@r[0-9]+#[0-9]{3}$'),
  revision_id  text        NOT NULL REFERENCES document_revision(id) ON DELETE CASCADE,
  chunk_index  integer     NOT NULL CHECK (chunk_index >= 0),
  text         text        NOT NULL,
  token_count  integer     NOT NULL CHECK (token_count > 0),
  chunk_sha256 char(64)    NOT NULL CHECK (chunk_sha256 ~ '^[0-9a-f]{64}$'),
  embedding    vector(:embedding_dim),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, chunk_index)
);

-- =============================================================================
-- 4. 지식 (스펙 §1.3)
-- =============================================================================

-- E11 FailureMode — FM-{SLUG}
CREATE TABLE IF NOT EXISTS failure_mode (
  id               text PRIMARY KEY CHECK (id ~ '^FM-[A-Z0-9]+(-[A-Z0-9]+)*$'),
  name             text        NOT NULL,
  description      text        NOT NULL,                  -- vector 색인 대상(스펙 §4)
  typical_symptoms jsonb       NOT NULL DEFAULT '[]'::jsonb,
  severity_class   text        NOT NULL
                   CHECK (severity_class IN ('low', 'medium', 'high')),
  semantic_id      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- E12 SOP — SOP-{DOMAIN}-{NNN} · R21 DocumentRevision 1:1(current)
CREATE TABLE IF NOT EXISTS sop (
  id                  text PRIMARY KEY CHECK (id ~ '^SOP-[A-Z]+(-[A-Z]+)*-[0-9]{3}$'),
  title               text        NOT NULL,
  domain              text        NOT NULL,
  current_revision_id text        REFERENCES document_revision(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'retired')),
  semantic_id         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- E13 SafetyRule — SAF-{CODE}-{NN} · R22 DocumentRevision 1:1(current)
CREATE TABLE IF NOT EXISTS safety_rule (
  id                  text PRIMARY KEY CHECK (id ~ '^SAF-[A-Z0-9]+-[0-9]{2}$'),
  title               text        NOT NULL,
  rule_class          text        NOT NULL,
  mandatory           boolean     NOT NULL DEFAULT true,
  current_revision_id text        REFERENCES document_revision(id) ON DELETE SET NULL,
  semantic_id         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. N:M 관계 (스펙 §2 — FK로 표현되지 않는 나머지)
-- =============================================================================

-- R08 Component HAS_FAILURE_MODE FailureMode (N:M)
CREATE TABLE IF NOT EXISTS component_failure_mode (
  component_id    text NOT NULL REFERENCES component(id)    ON DELETE CASCADE,
  failure_mode_id text NOT NULL REFERENCES failure_mode(id) ON DELETE CASCADE,
  PRIMARY KEY (component_id, failure_mode_id)
);

-- R09 Equipment HAS_FAILURE_MODE FailureMode (N:M · 부품 미특정 모드)
CREATE TABLE IF NOT EXISTS equipment_failure_mode (
  equipment_id    text NOT NULL REFERENCES equipment(id)    ON DELETE CASCADE,
  failure_mode_id text NOT NULL REFERENCES failure_mode(id) ON DELETE CASCADE,
  PRIMARY KEY (equipment_id, failure_mode_id)
);

-- R10 FailureMode INDICATED_BY Sensor (N:M · 속성 signal_pattern)
CREATE TABLE IF NOT EXISTS failure_mode_indicator (
  failure_mode_id text NOT NULL REFERENCES failure_mode(id) ON DELETE CASCADE,
  sensor_id       text NOT NULL REFERENCES sensor(id)       ON DELETE CASCADE,
  signal_pattern  text NOT NULL,
  PRIMARY KEY (failure_mode_id, sensor_id)
);

-- R11 FailureMode MITIGATED_BY SOP (N:M)
CREATE TABLE IF NOT EXISTS failure_mode_sop (
  failure_mode_id text NOT NULL REFERENCES failure_mode(id) ON DELETE CASCADE,
  sop_id          text NOT NULL REFERENCES sop(id)          ON DELETE CASCADE,
  PRIMARY KEY (failure_mode_id, sop_id)
);

-- R12 SOP REQUIRES SafetyRule (N:M) — ④ WO 화면의 «삭제 불가 안전 조치»의 근거
CREATE TABLE IF NOT EXISTS sop_safety_rule (
  sop_id        text NOT NULL REFERENCES sop(id)         ON DELETE CASCADE,
  safety_rule_id text NOT NULL REFERENCES safety_rule(id) ON DELETE CASCADE,
  PRIMARY KEY (sop_id, safety_rule_id)
);

-- R15 Incident DIAGNOSED_AS FailureMode (N:M · 속성 confidence·rank)
CREATE TABLE IF NOT EXISTS incident_diagnosis (
  incident_id      text NOT NULL REFERENCES incident(id)     ON DELETE CASCADE,
  failure_mode_id  text NOT NULL REFERENCES failure_mode(id) ON DELETE CASCADE,
  rank             smallint NOT NULL CHECK (rank >= 1),
  confidence_note  text,
  PRIMARY KEY (incident_id, failure_mode_id),
  UNIQUE (incident_id, rank)
);

-- R17 WorkOrder REFERENCES SOP (N:M)
CREATE TABLE IF NOT EXISTS work_order_sop (
  work_order_id text NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  sop_id        text NOT NULL REFERENCES sop(id)        ON DELETE RESTRICT,
  PRIMARY KEY (work_order_id, sop_id)
);

-- R20 MaintenanceRecord ADDRESSED FailureMode (N:M)
CREATE TABLE IF NOT EXISTS maintenance_record_failure_mode (
  maintenance_record_id text NOT NULL REFERENCES maintenance_record(id) ON DELETE CASCADE,
  failure_mode_id       text NOT NULL REFERENCES failure_mode(id)       ON DELETE CASCADE,
  PRIMARY KEY (maintenance_record_id, failure_mode_id)
);

-- R23 Equipment DESCRIBED_BY Document (N:M · 매뉴얼)
CREATE TABLE IF NOT EXISTS equipment_document (
  equipment_id text NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES document(id)  ON DELETE CASCADE,
  PRIMARY KEY (equipment_id, document_id)
);

-- =============================================================================
-- 6. 조회 인덱스 (FK 역방향 · GS-01 질의 경로 대비 · 스펙 §6)
--    🔴 벡터 인덱스(HNSW/IVFFlat)는 데이터가 있어야 의미가 있으므로 T1-4에서 만든다.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_line_factory        ON production_line (factory_id);
CREATE INDEX IF NOT EXISTS ix_equipment_line      ON equipment (line_id);
CREATE INDEX IF NOT EXISTS ix_component_equipment ON component (equipment_id);
CREATE INDEX IF NOT EXISTS ix_sensor_equipment    ON sensor (equipment_id);
-- S1 「최근 N분 추세」 = (sensor_id, ts DESC) 범위 스캔
CREATE INDEX IF NOT EXISTS ix_reading_sensor_ts   ON sensor_reading (sensor_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_alarm_equipment_raised ON alarm (equipment_id, raised_at DESC);
CREATE INDEX IF NOT EXISTS ix_alarm_status        ON alarm (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_incident_equipment  ON incident (equipment_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS ix_work_order_incident ON work_order (incident_id);
-- S3 「이 설비의 최근 정비 이력」
CREATE INDEX IF NOT EXISTS ix_mr_equipment_perf   ON maintenance_record (equipment_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS ix_revision_document   ON document_revision (document_id, revision_no DESC);
-- S6 SSOT 검증: 「지금 인용 가능한 revision」 조회
CREATE INDEX IF NOT EXISTS ix_revision_effective  ON document_revision (approval_state, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS ix_chunk_revision      ON document_chunk (revision_id, chunk_index);

INSERT INTO schema_migration (filename) VALUES ('001_core_schema.sql')
ON CONFLICT (filename) DO NOTHING;
