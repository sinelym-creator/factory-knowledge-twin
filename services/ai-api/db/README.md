# DB 마이그레이션 · 스펙 대조표 (T1-1)

> 🔴 **유일 원천 = `docs/product/data-ontology-spec.md`(동결 v0.1).** 이 표는 스펙 항목이 DDL의 어디에 착지했는지를 1:1로 보여준다 — 검증 좌석은 이 표로 대조한다.
> DDL 파일 = `migrations/001_core_schema.sql` · 적용 = `pwsh services/ai-api/db/migrate.ps1`

## 적용 (1명령)

```powershell
docker compose up -d                        # 선행: 스택 기동
pwsh services/ai-api/db/migrate.ps1         # 재실행 멱등
pwsh services/ai-api/db/migrate.ps1 -EmbeddingDim 1024   # 차원 바꿔 새로 만들 때
```

🔴 **임베딩 차원은 파라미터**(기본 768 = 자리표시자). 모델이 확정되면 **신규 마이그레이션 파일로 교체**한다 — `IF NOT EXISTS` 때문에 기존 칼럼은 재적용으로 바뀌지 않는다.

## A. Entity 16종 → 테이블

| 스펙 | Entity | 테이블 | ID CHECK 정규식 | 비고 |
|---|---|---|---|---|
| E01 | Factory | `factory` | `^FAC-[A-Z0-9]+$` | |
| E02 | ProductionLine | `production_line` | `^LN-[A-Z0-9]+-[0-9]{2}$` | `UNIQUE(factory_id, line_no)` |
| E03 | Equipment | `equipment` | `^EQ-[A-Z]{2,4}-[0-9]{3}$` | `equipment_class` CHECK 4종 |
| E04 | Component | `component` | `^CP-[0-9]{3}-[A-Z]{2,4}-[0-9]{2}$` | |
| E05 | Sensor | `sensor` | `^SN-[0-9]{3}-[A-Z]{2,5}$` | `warn < alarm` 임계 순서 CHECK |
| E06 | SensorReading | `sensor_reading` | — (복합 PK `sensor_id, ts`) | 🔴 그래프 미투영 |
| E07 | Alarm | `alarm` | `^AL-[0-9]{8}-[0-9]{4}$` | `threshold_value` = 발생 시점 스냅샷 |
| E08 | Incident | `incident` | `^INC-[0-9]{4}-[0-9]{3}$` | `closed_at >= opened_at` |
| E09 | WorkOrder | `work_order` | `^WO-[0-9]{4}-[0-9]{4}$` | `parts`·`checklist` = jsonb |
| E10 | MaintenanceRecord | `maintenance_record` | `^MR-[0-9]{4}-[0-9]{4}$` | `action_type` = 흡수된 MaintenanceAction |
| E11 | FailureMode | `failure_mode` | `^FM-[A-Z0-9]+(-[A-Z0-9]+)*$` | `description` = vector 색인 대상 |
| E12 | SOP | `sop` | `^SOP-[A-Z]+(-[A-Z]+)*-[0-9]{3}$` | 🔴 ID에 버전 없음(스펙 P2) |
| E13 | SafetyRule | `safety_rule` | `^SAF-[A-Z0-9]+-[0-9]{2}$` | `mandatory` boolean |
| E14 | Document | `document` | `^DOC-[A-Z]{3,4}-[0-9]{4}$` | `doc_type` CHECK 5종 |
| E15 | DocumentRevision | `document_revision` | `^DOC-…@r[0-9]+$` | §3.3 전량 반영 — 아래 C절 |
| E16 | DocumentChunk | `document_chunk` | `^DOC-…@r[0-9]+#[0-9]{3}$` | `embedding vector(:dim)` |

**합계 16/16** · 추가 테이블 = `schema_migration`(적용 이력) 1개.

## B. Relation 25건 → FK / 조인 테이블

| 스펙 | 관계 | 카디널리티 | DDL 위치 |
|---|---|---|---|
| R01 | Factory CONTAINS ProductionLine | 1:N | `production_line.factory_id` FK |
| R02 | ProductionLine CONTAINS Equipment | 1:N | `equipment.line_id` FK |
| R03 | Equipment HAS_COMPONENT Component | 1:N | `component.equipment_id` FK |
| R04 | Equipment MONITORED_BY Sensor | 1:N | `sensor.equipment_id` FK |
| R05 | Sensor EMITS SensorReading | 1:N | `sensor_reading.sensor_id` FK (PK 일부) |
| R06 | Sensor TRIGGERS Alarm | 1:N | `alarm.sensor_id` FK |
| R07 | Alarm ON_EQUIPMENT Equipment | N:1 | `alarm.equipment_id` FK (역정규화) |
| R08 | Component HAS_FAILURE_MODE FailureMode | N:M | `component_failure_mode` |
| R09 | Equipment HAS_FAILURE_MODE FailureMode | N:M | `equipment_failure_mode` |
| R10 | FailureMode INDICATED_BY Sensor | N:M | `failure_mode_indicator` (+`signal_pattern`) |
| R11 | FailureMode MITIGATED_BY SOP | N:M | `failure_mode_sop` |
| R12 | SOP REQUIRES SafetyRule | N:M | `sop_safety_rule` |
| R13 | Alarm ESCALATES_TO Incident | N:1 | `alarm.incident_id` FK |
| R14 | Incident AFFECTS Equipment | N:1 | `incident.equipment_id` FK |
| R15 | Incident DIAGNOSED_AS FailureMode | N:M | `incident_diagnosis` (+`rank`·`confidence_note` · `UNIQUE(incident_id, rank)`) |
| R16 | Incident RESOLVED_BY WorkOrder | 1:N | `work_order.incident_id` FK |
| R17 | WorkOrder REFERENCES SOP | N:M | `work_order_sop` |
| R18 | WorkOrder RESULTS_IN MaintenanceRecord | 1:N | `maintenance_record.work_order_id` FK |
| R19 | MaintenanceRecord ON_EQUIPMENT Equipment | N:1 | `maintenance_record.equipment_id` FK |
| R20 | MaintenanceRecord ADDRESSED FailureMode | N:M | `maintenance_record_failure_mode` |
| R21 | SOP DOCUMENTED_BY DocumentRevision | 1:1(current) | `sop.current_revision_id` FK |
| R22 | SafetyRule DOCUMENTED_BY DocumentRevision | 1:1(current) | `safety_rule.current_revision_id` FK |
| R23 | Equipment DESCRIBED_BY Document | N:M | `equipment_document` |
| R24 | Document HAS_REVISION DocumentRevision | 1:N | `document_revision.document_id` FK + `UNIQUE(document_id, revision_no)` |
| R25 | DocumentRevision HAS_CHUNK DocumentChunk | 1:N | `document_chunk.revision_id` FK + `UNIQUE(revision_id, chunk_index)` |

**합계 25/25** (FK 16 · 조인 테이블 9).

## C. 문서 revision·hash 규칙 (스펙 §3.3) → 제약

| 스펙 규칙 | DDL |
|---|---|
| revision 1부터 정수 증가·문서당 유일 | `revision_no >= 1` CHECK + `UNIQUE(document_id, revision_no)` |
| `content_sha256` = 소문자 hex 64자 | `char(64)` + `~ '^[0-9a-f]{64}$'` CHECK |
| `chunk_sha256` 동일 | `document_chunk.chunk_sha256` 동일 CHECK |
| 상태 전이 draft→approved→superseded→retired | `approval_state` CHECK 4값 |
| 인용 가능 = approved **및** effective 기간 내 | 두 칼럼 실재 + `ix_revision_effective` 인덱스 (판정 로직은 질의 계층 = S2) |
| effective 기간 정합 | `effective_to > effective_from` CHECK |
| 승인에는 승인자가 있어야 함 | `approval_state <> 'approved' OR approved_by IS NOT NULL` CHECK |

## D. 스펙에 있으나 DDL에 «의도적으로» 없는 것

| 항목 | 이유 |
|---|---|
| 벡터 인덱스(HNSW/IVFFlat) | 데이터가 있어야 의미가 있다 — **T1-4**에서 생성 |
| `ontology_version`·`ssot_manifest_hash`·index build 기록 | 색인 파이프라인 산출물 — **T1-4** 소관 |
| Neo4j 투영 | **T1-5** 소관 (본 스키마가 그 원천) |
| 인용 가능 여부 «판정» | 스키마는 사실만 담고 판정은 질의/서비스 계층에서 한다 |

## E. 실측 로그 (E1 · 2026-08-28)

| 검증 | 결과 |
|---|---|
| 1차 적용 | 성공 · `schema_migration` 1행 |
| **2차 적용(멱등)** | **exit 0 · 오류 0**(NOTICE «already exists»만) |
| 테이블 수 | **26** (entity 16 + 조인 9 + 이력 1) |
| 임베딩 칼럼 타입 | `vector(768)` |
| 제약 실효성 | 정상 INSERT 1건 **ACCEPTED** / 위반 7종 **전부 REJECTED** — ID 패턴·NOT NULL·PK 중복·FK·status CHECK·승인자 누락 CHECK·sha256 형식 |
| asyncpg 실런타임 | **asyncpg 0.31.0 · Python 3.14 · 연결→INSERT→SELECT→DELETE 왕복 성공** (PostgreSQL 16.14) |
