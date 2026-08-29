---
asset_class: product
description: 데이터·온톨로지 스펙 v0.1 — entity·relation·identifier·SSOT/파생 저장 분담 (T0-6 · D1 동결 대상)
status: draft
lifecycle: D1(08-29) 동결 · 이후 변경 = contract 개정 절차(baseline §0.3)
size_limit: 20KB
depends_on: [docs/product/golden-scenario-spec.md, docs/baseline/poc-baseline-v0.2.md §7.7~§8.3 · §10 · §12.1]
---

# 데이터·온톨로지 스펙 v0.1

> 🔴 **본 문서는 D2 DB 스키마·D3 그래프 투영의 유일 원천이다.** 동결 후 entity·relation·ID 규칙 변경은 contract 개정 절차를 거친다.
> 🔴 **synthetic 전용.** 실 공장 데이터·실 설비 식별자를 이 스펙으로 적재하지 않는다(baseline §15.2).

## 0. 설계 원칙 4개

| # | 원칙 | 근거 |
|---|---|---|
| P1 | **SSOT는 PostgreSQL 하나** — pgvector·Neo4j는 언제든 삭제 후 재생성 가능한 파생물 | baseline §7.7·§7.8·§8.2 |
| P2 | **개념 ID에 버전을 넣지 않는다** — 버전은 `DocumentRevision`만 갖는다 | ID에 버전이 붙으면 동일 개념의 두 revision이 서로 다른 그래프 노드가 되어 근거 경로가 갈라진다(평가 «revision 충돌» 6문항이 무의미해짐) |
| P3 | **ID는 불변·재사용 금지** — 삭제는 tombstone(`status=retired`) | replay·audit이 과거 run의 ID를 해석할 수 있어야 한다(baseline §29.9 `run_id`+`ontology_version`) |
| P4 | **그래프에는 관계만, 시계열·본문은 올리지 않는다** | `SensorReading`(≈95만 row)·`DocumentChunk`를 Neo4j에 투영하면 multi-hop 질의가 죽는다 |

---

## 1. Entity (16종)

### 1.1 물리·계층

| # | Entity | ID 예시 | 필수 속성 | 비고 |
|---|---|---|---|---|
| E01 | `Factory` | `FAC-A` | `id·name·site_code·timezone·status` | GS-01 무대 1개 |
| E02 | `ProductionLine` | `LN-A-02` | `id·factory_id·name·line_no·status` | |
| E03 | `Equipment` | `EQ-CNC-204` | `id·line_id·name·equipment_class·model·installed_on·status·criticality` | `equipment_class` = CNC·CONVEYOR·ROBOT·PRESS |
| E04 | `Component` | `CP-204-BRG-01` | `id·equipment_id·name·component_class·installed_on` | 고장모드의 소유자 |
| E05 | `Sensor` | `SN-204-VIB` | `id·equipment_id·measurement_type·unit·sampling_hz·warn_threshold·alarm_threshold` | `measurement_type` = VIB·TEMP·CUR·SPD |
| E06 | `SensorReading` | PK(`sensor_id`,`ts`) | `sensor_id·ts·value·quality` | 🔴 PostgreSQL 전용(그래프 미투영) |

### 1.2 운영 사건

| # | Entity | ID 예시 | 필수 속성 |
|---|---|---|---|
| E07 | `Alarm` | `AL-20260826-0041` | `id·sensor_id·equipment_id·severity·threshold_value·observed_value·raised_at·cleared_at·status` |
| E08 | `Incident` | `INC-2026-014` | `id·equipment_id·title·opened_at·closed_at·status·severity` |
| E09 | `WorkOrder` | `WO-2026-0113` | `id·incident_id·title·status·planned_at·assignee_role·parts[]·estimated_minutes·approval_state` |
| E10 | `MaintenanceRecord` | `MR-2025-0087` | `id·equipment_id·action_type·performed_at·duration_min·result·note` |

### 1.3 지식

| # | Entity | ID 예시 | 필수 속성 |
|---|---|---|---|
| E11 | `FailureMode` | `FM-BRG-WEAR` | `id·name·description·typical_symptoms[]·severity_class` |
| E12 | `SOP` | `SOP-BRG-INSP-014` | `id·title·domain·current_revision_id·status` |
| E13 | `SafetyRule` | `SAF-LOTO-01` | `id·title·rule_class·mandatory·current_revision_id` |

### 1.4 문서·SSOT

| # | Entity | ID 예시 | 필수 속성 |
|---|---|---|---|
| E14 | `Document` | `DOC-SOP-0014` | `id·doc_type·title·owner_role·current_revision_no·status` |
| E15 | `DocumentRevision` | `DOC-SOP-0014@r2` | `id·document_id·revision_no·content_sha256·effective_from·effective_to·approval_state·approved_by·body_uri` |
| E16 | `DocumentChunk` | `DOC-SOP-0014@r2#007` | `id·revision_id·chunk_index·text·token_count·chunk_sha256·embedding` |

`doc_type` = `SOP` · `MANUAL` · `SAFETY` · `MAINT_REPORT` · `SPEC`.

### 1.5 baseline §10.1 대비 가감 근거 (각 1줄)

| 변경 | 대상 | 근거 |
|---|---|---|
| ➕ 추가 | `SensorReading` | GS-01 S1의 «3주 추세 + 최근 급등» chart는 시계열 인스턴스 없이는 렌더 불가. |
| ➕ 추가 | `Document`·`DocumentRevision`·`DocumentChunk` | revision·hash·STALE 검출이 P0(baseline §8.3)인데 §10.1에는 문서 entity가 없었다. |
| 🔀 통합 | `MaintenanceAction` → `MaintenanceRecord.action_type` | 별도 노드로 두면 인스턴스 몇 건짜리 카탈로그가 hop만 한 칸 늘린다 — 실제 필요한 것은 «수행 이력»이다. |
| ➖ 미채택 | `AlarmRule` | 임계값은 `Sensor.warn/alarm_threshold` + `Alarm.threshold_value` 스냅샷으로 충분(별도 entity는 P1 이후). |
| ✅ 유지 | `Component` | GS-01의 유력 원인 `FM-BRG-WEAR`가 부품(베어링)에 귀속되어야 근거 경로가 성립. |

---

## 2. Relation (방향·카디널리티)

### 2.1 관계표

| # | 출발 | 관계 | 도착 | 카디널리티 | Neo4j 투영 |
|---|---|---|---|---|---|
| R01 | `Factory` | `CONTAINS` | `ProductionLine` | 1:N | ✅ |
| R02 | `ProductionLine` | `CONTAINS` | `Equipment` | 1:N | ✅ |
| R03 | `Equipment` | `HAS_COMPONENT` | `Component` | 1:N | ✅ |
| R04 | `Equipment` | `MONITORED_BY` | `Sensor` | 1:N | ✅ |
| R05 | `Sensor` | `EMITS` | `SensorReading` | 1:N | ❌ PG 전용 |
| R06 | `Sensor` | `TRIGGERS` | `Alarm` | 1:N | ✅ |
| R07 | `Alarm` | `ON_EQUIPMENT` | `Equipment` | N:1 | ✅ (역정규화 — 1-hop 단축용) |
| R08 | `Component` | `HAS_FAILURE_MODE` | `FailureMode` | N:M | ✅ |
| R09 | `Equipment` | `HAS_FAILURE_MODE` | `FailureMode` | N:M | ✅ (부품 미특정 모드용 — 예: 공구 불균형) |
| R10 | `FailureMode` | `INDICATED_BY` | `Sensor` | N:M | ✅ (속성: `signal_pattern`) |
| R11 | `FailureMode` | `MITIGATED_BY` | `SOP` | N:M | ✅ |
| R12 | `SOP` | `REQUIRES` | `SafetyRule` | N:M | ✅ |
| R13 | `Alarm` | `ESCALATES_TO` | `Incident` | N:1 | ✅ |
| R14 | `Incident` | `AFFECTS` | `Equipment` | N:1 | ✅ |
| R15 | `Incident` | `DIAGNOSED_AS` | `FailureMode` | N:M | ✅ (속성: `confidence`·`rank`) |
| R16 | `Incident` | `RESOLVED_BY` | `WorkOrder` | 1:N | ✅ |
| R17 | `WorkOrder` | `REFERENCES` | `SOP` | N:M | ✅ |
| R18 | `WorkOrder` | `RESULTS_IN` | `MaintenanceRecord` | 1:N | ✅ |
| R19 | `MaintenanceRecord` | `ON_EQUIPMENT` | `Equipment` | N:1 | ✅ |
| R20 | `MaintenanceRecord` | `ADDRESSED` | `FailureMode` | N:M | ✅ |
| R21 | `SOP` | `DOCUMENTED_BY` | `DocumentRevision` | 1:1 (current) | ✅ |
| R22 | `SafetyRule` | `DOCUMENTED_BY` | `DocumentRevision` | 1:1 (current) | ✅ |
| R23 | `Equipment` | `DESCRIBED_BY` | `Document` | N:M | ✅ (매뉴얼) |
| R24 | `Document` | `HAS_REVISION` | `DocumentRevision` | 1:N | ✅ (revision 노드는 id·hash·상태만) |
| R25 | `DocumentRevision` | `HAS_CHUNK` | `DocumentChunk` | 1:N | ❌ PG/pgvector 전용 |

### 2.2 계층 요약

```text
Factory ─1:N─ ProductionLine ─1:N─ Equipment ─1:N─ Component
                                      │             └─N:M─ FailureMode ─N:M─ SOP ─N:M─ SafetyRule
                                      ├─1:N─ Sensor ─1:N─ Alarm ─N:1─ Incident ─1:N─ WorkOrder
                                      │        └─1:N─ SensorReading (PG 전용)
                                      └─N:M─ Document ─1:N─ DocumentRevision ─1:N─ DocumentChunk (PG/pgvector 전용)
```

---

## 3. Identifier 체계

### 3.1 패턴표

| Entity | prefix | 패턴 | 예시 |
|---|---|---|---|
| Factory | `FAC` | `FAC-{SITE}` | `FAC-A` |
| ProductionLine | `LN` | `LN-{SITE}-{NN}` | `LN-A-02` |
| Equipment | `EQ` | `EQ-{CLASS3}-{NNN}` | `EQ-CNC-204` |
| Component | `CP` | `CP-{EQ_NUM}-{CLASS3}-{NN}` | `CP-204-BRG-01` |
| Sensor | `SN` | `SN-{EQ_NUM}-{MEAS3}` | `SN-204-VIB` |
| SensorReading | — | 복합 PK `(sensor_id, ts)` | — |
| Alarm | `AL` | `AL-{YYYYMMDD}-{NNNN}` | `AL-20260826-0041` |
| Incident | `INC` | `INC-{YYYY}-{NNN}` | `INC-2026-014` |
| WorkOrder | `WO` | `WO-{YYYY}-{NNNN}` | `WO-2026-0113` |
| MaintenanceRecord | `MR` | `MR-{YYYY}-{NNNN}` | `MR-2025-0087` |
| FailureMode | `FM` | `FM-{SLUG}` | `FM-BRG-WEAR` |
| SOP | `SOP` | `SOP-{DOMAIN}-{NNN}` | `SOP-BRG-INSP-014` |
| SafetyRule | `SAF` | `SAF-{CODE}-{NN}` | `SAF-LOTO-01` |
| Document | `DOC` | `DOC-{DOCTYPE}-{NNNN}` | `DOC-SOP-0014` |
| DocumentRevision | — | `{document_id}@r{N}` | `DOC-SOP-0014@r2` |
| DocumentChunk | — | `{revision_id}#{NNN}` | `DOC-SOP-0014@r2#007` |

### 3.2 유일성 규칙

1. **전역 유일** — 전 entity의 ID가 하나의 네임스페이스를 공유한다(prefix가 충돌을 막는다).
2. **문자 집합** — 대문자 A–Z·숫자·하이픈만. 개념 ID 정규식 `^[A-Z]{2,3}-[A-Z0-9]+(-[A-Z0-9]+)*$`, revision `^...@r[0-9]+$`, chunk `^...@r[0-9]+#[0-9]{3}$`.
3. **고정폭 zero-pad** — 순번은 자릿수를 고정한다(문자열 정렬 = 생성 순 정렬).
4. **불변·재사용 금지** — 폐기는 `status=retired` tombstone. 삭제 후 같은 ID 재발급 금지(P3).
5. **버전 금지** — 개념 ID에 `-v2` 같은 접미사를 붙이지 않는다(P2).
6. **`semantic_id`(선택 속성)** — 외부 교환용 URI: `urn:fkt:{EntityType}:{id}` (예: `urn:fkt:FailureMode:FM-BRG-WEAR`). AAS 개념 참고 범위이며 AAS 전체 구현은 하지 않는다(baseline §10.2).

### 3.3 문서 revision·hash 규칙

| 항목 | 규칙 |
|---|---|
| revision 번호 | `1`부터 정수 증가. 문서당 단조 증가, 건너뛰기 금지. |
| 정규화 | UTF-8 NFC → CRLF를 LF로 → 행말 공백 제거 → 파일 끝 개행 1개. |
| `content_sha256` | 정규화된 본문 바이트의 SHA-256(소문자 hex 64자). |
| `chunk_sha256` | chunk 텍스트의 SHA-256. chunk 경계는 `chunking_policy_version`에 종속. |
| 유효성 | 인용 가능 = `approval_state=approved` **및** `effective_from ≤ 조회시각 < effective_to`. 그 외 revision은 AI가 인용할 수 없다. |
| 상태 전이 | `draft → approved → superseded → retired` (역방향 없음). 새 revision 승인 시 직전 revision은 `superseded` + `effective_to` 기입. |
| `ssot_manifest_hash` | `{document_id}@r{n}:{content_sha256}` 행을 문서 ID 오름차순 정렬·개행 결합한 텍스트의 SHA-256. |
| `ontology_version` | SemVer. entity/relation 추가 = minor, 카디널리티·ID 규칙 변경 = major. 정본 위치 `packages/ontology/ontology-version.json`. |
| STALE 판정 | index build 기록의 `source_sha256` ≠ 현행 approved revision의 `content_sha256` → `STALE INDEX` 표기(baseline §8.3). ontology_version 불일치도 동일 처리. |

---

## 4. 저장 분담표 (PostgreSQL / pgvector / Neo4j)

> 🔴 열 읽는 법: **PostgreSQL = 권위 원본** · pgvector·Neo4j 열의 내용은 **전부 PostgreSQL에서 재생성 가능**해야 한다(baseline §8.2 · Gate 2 §32.3의 «삭제 후 재생성» 검증 대상).

| Entity | PostgreSQL (SSOT/운영) | pgvector (파생 색인) | Neo4j (파생 투영) |
|---|---|---|---|
| Factory·ProductionLine | 전체 행 | — | 노드: `id·name` |
| Equipment | 전체 행 | — | 노드: `id·name·class·model·criticality` |
| Component | 전체 행 | — | 노드: `id·name·class` |
| Sensor | 전체 행(임계값 포함) | — | 노드: `id·measurement_type·unit` |
| SensorReading | 🔴 전체 시계열(단독 보유) | — | ❌ |
| Alarm | 전체 행 | — | 노드: `id·severity·raised_at·status` |
| Incident | 전체 행 | — | 노드: `id·title·status·opened_at` |
| WorkOrder | 전체 행 + 승인 이력 | — | 노드: `id·status·approval_state` |
| MaintenanceRecord | 전체 행 | 이력 `note` 임베딩(유사 사례 검색) | 노드: `id·action_type·performed_at` |
| FailureMode | 전체 행 | `description` 임베딩 | 노드: `id·name·severity_class` |
| SOP·SafetyRule | 전체 행 + `current_revision_id` | (본문은 chunk 경유) | 노드: `id·title` + `DOCUMENTED_BY` |
| Document | registry 행(상태·소유자) | — | 노드: `id·doc_type·title` |
| DocumentRevision | 🔴 원문 본문 + hash + 승인·유효기간 | — | 노드: `id·revision_no·content_sha256·approval_state` (본문 없음) |
| DocumentChunk | chunk 텍스트 + 메타 | 🔴 embedding 벡터 + chunk 메타(검색 단위) | ❌ |
| index build 기록 | 전체(§8.3 9항목) | — | — |
| Agent run·audit event | 전체 | — | — |

**재생성 경로**: `pgvector` ← `DocumentChunk`+`MaintenanceRecord.note`+`FailureMode.description` 재임베딩 / `Neo4j` ← entity 테이블 + relation manifest 재투영. 두 경로 모두 PostgreSQL만 있으면 성립한다.

---

## 5. Golden Scenario 최소 인스턴스 추정

> GS-01(«스핀들 진동 이상 조사») **및** 평가 40문항(baseline §30.2)을 동시에 지탱하는 최소치. 근거 등급 **E4(가설)** — Phase 1 생성 후 실측으로 갱신한다.

| Entity | 수량 | 근거 |
|---|---:|---|
| Factory | 1 | GS 무대 1개 |
| ProductionLine | 3 | «라인 2~3개 중 하나에 이상 집중»(GS §2) |
| Equipment | 12 | 라인당 4대. 그중 CNC 3대 — «유사 설비» 비교(GS `EQ-CNC-207`)에 최소 2대 필요 |
| Component | 24 | 설비당 2(베어링·공구 등 고장모드 귀속처) |
| Sensor | 30 | 설비당 2~3 · GS 대상 설비는 VIB/TEMP/CUR 3종 |
| SensorReading | **≈950,000 row** | 2단 해상도 — ⓐ 기저: 30센서 × 1분 간격 × 21일 = 907,200 (GS «3주 완만 상승» 서사) ⓑ 사건 구간: 3센서 × 1초 간격 × 4시간 = 43,200 (S1 급등 파형) |
| Alarm | 25 | GS 대상 1건 + 노이즈 24(Overview KPI가 비어 보이지 않을 최소) |
| Incident | 8 | 종결 6 + 진행 2 |
| WorkOrder | 15 | 이력 13 + GS 초안 1 + 반려 예시 1 |
| MaintenanceRecord | 40 | 설비당 평균 3~4 — 유사 이력 vector 검색의 모집단 |
| FailureMode | 18 | 설비군 4종 × 4~5 |
| SOP | 20 | 고장모드 대응 절차 |
| SafetyRule | 8 | 안전 규정 5문항 지탱(LOTO·PPE 등) |
| Document | 45 | SOP 20 + MANUAL 8 + SAFETY 8 + MAINT_REPORT 9 |
| DocumentRevision | 60 | 🔴 그중 **revision 2개 이상인 문서 8건** — 평가 «문서 revision 충돌» 6문항 지탱 |
| DocumentChunk | ≈900 | 문서 평균 20 chunk(400~600 token) |

**질문 유형별 지탱 확인**: 직접 검색 8 ← chunk 900 / 설비·부품 식별 8 ← 설비 12·센서 30 / multi-hop 8 ← FM 18·SOP 20·SAF 8 / revision 충돌 6 ← 다중 revision 문서 8 / 안전 5 ← SafetyRule 8 / 답변 불가 5 ← 스펙에 없는 ID(예: `EQ-CNC-999`)로 구성.

---

## 6. 시나리오 질의 경로 손 추적 (GS-01 1건)

**질문**: 「`EQ-CNC-204`의 진동 알람 원인은 무엇이고, 어떤 절차로 대응하나?」

| GS 단계 | 저장소 | 질의 | 결과 ID |
|---|---|---|---|
| S1 | PG | `SELECT * FROM alarm WHERE id='AL-20260826-0041'` → `equipment_id`, `sensor_id` | `EQ-CNC-204` · `SN-204-VIB` |
| S1 | PG | `SELECT ts,value FROM sensor_reading WHERE sensor_id='SN-204-VIB' AND ts BETWEEN …` (기저 21일 + 사건 4시간) | 추세 chart |
| S3 | PG | `SELECT * FROM maintenance_record WHERE equipment_id='EQ-CNC-204' ORDER BY performed_at DESC` | `MR-2025-0087` (18개월 전 베어링 교체) |
| S4 | pgvector | top-k(「스핀들 진동 상승 베어링 진단」) over `DocumentChunk` where `doc_type IN (MANUAL, MAINT_REPORT)` | `DOC-MAN-0021@r1#014` · `DOC-MRP-0087@r1#003` |
| S5 | Neo4j | `MATCH (e:Equipment {id:'EQ-CNC-204'})-[:HAS_COMPONENT]->(c)-[:HAS_FAILURE_MODE]->(fm)-[:MITIGATED_BY]->(s:SOP)-[:REQUIRES]->(sr:SafetyRule) RETURN path` | `EQ-CNC-204 → CP-204-BRG-01 → FM-BRG-WEAR → SOP-BRG-INSP-014 → SAF-LOTO-01` (4 hop) |
| S5 | Neo4j | `MATCH (fm:FailureMode {id:'FM-BRG-WEAR'})-[:INDICATED_BY]->(sn:Sensor) ` → 관측 신호가 고장모드 지표와 일치하는지 | `SN-204-VIB` ✅ (R10 `signal_pattern`) |
| S5 | Neo4j | 경쟁 후보: `EQ-CNC-204 -[:HAS_FAILURE_MODE]-> FM-TOOL-IMB` | 2순위 후보 |
| S6 | PG | SSOT 검증: `SOP-BRG-INSP-014.current_revision_id = DOC-SOP-0014@r2` → `approval_state=approved` · `effective_from ≤ now < effective_to` | 인용 허용 ✅ |
| S6 | PG | 색인 정합: `index_build.source_sha256 == DOC-SOP-0014@r2.content_sha256` | STALE 아님 ✅ |
| S7 | PG | `WorkOrder` 초안 생성 — `REFERENCES SOP-BRG-INSP-014`, 안전 조치에 `SAF-LOTO-01` 필수 삽입 | `WO-2026-0113` |

🔴 **경로 성립 조건**: R03·R08·R11·R12 4개 관계가 끊기면 S5가 실패한다 — 이 4개가 회귀 테스트 최소 대상이다.

---

## 7. GS-01 자리표시자 ↔ 확정 ID 바인딩 (제안)

> `docs/product/golden-scenario-spec.md` §5 바인딩 표에 그대로 옮겨 기입할 것을 제안한다(해당 파일은 오케스트레이터 lane).

| GS-01 자리표시자 | 확정 ID | 비고 |
|---|---|---|
| `PLANT-A` | `FAC-A` | prefix 규칙 통일 |
| `LINE-2` | `LN-A-02` | |
| `EQ-CNC-204` | `EQ-CNC-204` | 그대로 |
| `SEN-204-VIB` / `-TEMP` / `-CUR` | `SN-204-VIB` / `SN-204-TEMP` / `SN-204-CUR` | `SEN`→`SN` |
| `ALM-2041` | `AL-20260826-0041` | 날짜 포함 규칙 |
| `FM-BRG-WEAR` · `FM-TOOL-IMB` | 그대로 | |
| (베어링 부품) | `CP-204-BRG-01` | 신규 — 고장모드 귀속처 |
| `WO-HIST-0087` | `MR-2025-0087` | 이력 = `MaintenanceRecord` |
| `EQ-CNC-207` | 그대로 | 유사 설비 |
| `SOP-BRG-INSP-v2` | `SOP-BRG-INSP-014` + `DOC-SOP-0014@r2` | 🔴 P2 적용 — 버전은 revision이 갖는다 |
| `SAF-LOTO-01` | 그대로 | |
| `MAN-CNC-2xx` | `DOC-MAN-0021` | 매뉴얼 |

---

## 8. 미결·후속

| # | 항목 | 처리 |
|---|---|---|
| Q1 | `SensorReading` 기저 해상도(1분 · 21일)가 chart·이상탐지에 충분한가 | Phase 1 생성 후 실측 → 부족 시 30초로 상향(스키마 무변경) |
| Q2 | chunk 크기 400~600 token 확정 | T0-8 평가 문항·retrieval 실측 후 `chunking_policy_version=1`로 동결 |
| Q3 | `semantic_id` URI 스킴을 공개 도메인으로 바꿀지 | GitHub Public 개설 시 운영자 판단(현행 `urn:fkt:` 로컬 스킴 무해) |
| Q4 | 보조 시나리오 2종(품질 불량·에너지)의 추가 entity 필요 여부 | P1 — 현 16종으로 커버 가능한지 Phase 2에서 재검토 |

## 정오표 (v0.1 동결 본문 무수정 · append only)

| # | 위치 | 정정 | 근거 |
|---|---|---|---|
| E-1 | R15 속성 `confidence` | 구현·계약 정본 = `confidence_note`(contracts v0.1 동결·DDL 일치). R15의 `confidence` 표기는 초기 명명 — 이후 문서·구현은 `confidence_note`를 따른다 | T1-1 스키마 검증(evidence/t1-1-schema-verification.md) · 2026-08-28 |
| E-2 | §5 SensorReading 총량 추정 950,400 | 실측 = **949,680**(E1 · T1-2 생성기) — 추정이 기저·사건 구간 경계의 PK 중복 720행을 빼지 않았다. 스펙 결함 아님·실측 갱신 | T1-2 seed 생성기(PR#37 · 보고 id 1542836825981452298) · 2026-08-28 |
| E-3 | §8 Q2 chunk 정책 | 처리 확정(오케 동결): `chunking_policy_version=1` = **section_sentence · 512 token · overlap 0** · 계수기 = 택일 임베더의 실 토크나이저(잠정 e5-small · 임베더 확정 시 max≤512 재실측 병기). 근거: ⓐ 512는 임베딩 양 후보 생존(e5-small max_seq 512 — 600 정책은 최대 690으로 임베딩 단계에서 «조용히 잘림») ⓑ 절경계+문장 분할 = 절머리 100% + 동일 예산 인용 파손 상시 우위(30~250tok 대조군으로 온전성 지표 «포화» 실증) ⓒ overlap 15%는 예산 초과 chunk 생성 — 배제. GS-01 기대 인용 9건 파손 0(18개 후보안 전건) | T1-4 게이트 ① 실측 18종(probe_chunking.py · 센쿠2 4대 보고 id 1542974278998429801·1542974392395370506 · 오케 동결 08-29 04:12) |
| E-4 | §3.1 `DocumentChunk.id` 표기 | 해석 확정(오케): `#NNN` ≡ `chunk_index` **동치**(0-based · 3자리 zero-pad · `#000` = 첫 chunk) — id와 index 사이 변환 계층을 두지 않아 off-by-one을 구조 제거. 이 확정이 판정 코드의 진리값 오용 결함 1건을 flush함(«#000 falsy → 온전 인용을 절단으로 오보고» · 수정 커밋 fba90a1) | 오케 확정 08-29 04:20(보고 id 1542977089366401125) · 센쿠2 재표기·결함 수정(id 1542977710106615928 · PR#54·56) |
| E-5 | §5 GS-01 S4 기대 결과 chunk 좌표 | `DOC-MAN-0021@r1#014` · `DOC-MRP-0087@r1#003` = 색인 실재와 불일치(색인 전 가정값 · E4 — MAN-0021@r1 실재 #000~#007 · MRP-0087@r1 실재 #000 단독). 실측 정정(E1 · 색인 DB 재도출): 해당 인용 chunk = **`DOC-MAN-0021@r1#004`**(진동 RMS · Q4·Q5) · **`DOC-MRP-0087@r1#000`**(베어링 교체 · Q6·Q7). wireframes v0.4가 동일 값으로 바인딩 | T1-4 게이트 ⑤(센쿠2 5대 보고 id 1543005604002537646·1543005746461933668 · PR#61) · 2026-08-29 |
| E-6 | §6 S5 「경쟁 후보 … 2순위 후보」 | 해석 확정(오케): S5의 그래프 검증 축은 **구조 실재**(`EQ-CNC-204 -R09-> FM-TOOL-IMB` 직결 — T1-5 실측 ✅)까지다. 「2순위」는 그래프가 아니라 **R15(`DIAGNOSED_AS`) rank의 값**이며 그래프 검증 범위 밖. 🔴 seed 실물 진단 rank2 = `FM-SPDL-OVERHEAT`(FM-TOOL-IMB는 어떤 incident에도 진단 미부착 — D-5 「SOP 미매핑」 설계 정합) — 화면·대본의 「2순위 = FM-TOOL-IMB」 표기와의 정합은 T2-3(조사 워크플로우) 착지 시 실물 후보로 재바인딩(원장 Q-9) | T1-5 게이트 ③ ⓒ(센쿠2 6대 보고 id 1543073788575350896 · PR#73) · 2026-08-29 |
| E-7 | §3.3 상태 전이 「건너뜀」 3쌍 | 해석 확정(오케): 합법 전이 = **인접 전진 3쌍뿐**(`draft→approved` · `approved→superseded` · `superseded→retired`). 스펙이 침묵한 건너뜀 3쌍(`D→S` · `D→R` · `A→R`)도 **위반**이다. 근거 = ⓐ 사슬 표기는 단일 경로 의도 ⓑ `superseded` 정의 자체가 「새 revision 승인 시」 전제 — 승인 없이 도달할 정의가 없다 ⓒ `retired` 도달도 사슬 경유 ⓓ seed 실물 draft·retired 행 0(PoC 미사용). 필요 시 스펙 개정 절차로 재론 | G-3 전이 그물 적발 ①(리바이2 5대 보고 id 1543077073986388101·1543077208699179128 · PR#75) · 2026-08-29 |
| E-8 | contracts v0.1 `compare.question` 표기 | 해석 확정(오케): 승인 질문의 표기 변형(백틱·강조·조사 인접)은 **«같은 질문»**이며, 검색 입력은 승인 확인 즉시 **정본 문구로 모은다**(`allowlist.canonical` — 앵커·임베딩 모두 표기 무관이 계약 의도). 배경 = T2-1 V-1(한글 조사 앵커 절단 · 8/10문 갈림 · 안전 규정 조용 소실)·V-4(임베딩 입력이 원문이라 마크업 차이가 인용을 바꿈 — 재현 불가 비교). 🔴 교훈 성문: 「**승인한 입력 전부로 재라**」(구현 — normalize로 승인해 놓고 정본 표기로만 실측) · 「**빈 결과만 결함이 아니다 — 재현 안 되는 비교도 결함이다**」·「**빈 결과끼리의 일치는 일치가 아니다**(드릴 생존 신호 exit 2)」(검증) | T2-1 재검 사이클(V-1·V-4 — 센쿠2 PR#106 · 리바이2 PR#108 · 판정 id 1543295973051203595) · 2026-08-30 |
