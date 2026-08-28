---
artifact: eval-questions-draft
ticket: T0-8
owner: 검증(리바이2)
status: 초안(draft) — 판정 대기
version: 0.2.0
created_at: 2026-08-28
updated_at: 2026-08-28
baseline_ref: docs/baseline/poc-baseline-v0.2.md §10.1·§10.2·§18·§29.2~29.4·§30.2~30.9
spec_ref: docs/product/data-ontology-spec.md v0.1 (T0-6) — §1 entity · §2 relation · §3 ID · §5 인스턴스 · §6 GS-01 경로
supersedes: v0.1.0 (baseline 예시 ID 앵커 — stale)
---

# T0-8 — 평가 질문 초안 (10문) v0.2

## 0. 전제와 경계

### 0.1 측정-주장 경계 (baseline §0.2 준수)

- 본 문서의 모든 수치는 **«잠정 목표»(Target)** 다. `Actual` column은 전부 `Not measured`로 고정한다.
- Target과 Actual을 같은 column에 섞지 않는다(§30.9).
- 본 문서는 **측정 결과가 아니다.** 이 문서만으로 어떤 성능도 주장하지 않는다.

### 0.2 v0.1 → v0.2 변경 이력 (drift 기록 — 삭제 금지)

T0-6(`data-ontology-spec.md` v0.1) 도착 후 **실파일 대조**로 발견한 결함을 반영했다. v0.1은 baseline §10.1·§30.3의 **예시 ID**를 앵커로 삼았는데, **T0-6이 다른 ID 체계를 확정**해 앵커 전량이 stale이 됐다.

| # | v0.1 결함 | v0.2 조치 | 등급 |
|---|---|---|---|
| C-1 | ID 앵커 13종이 baseline 예시(`Motor-01`·`SOP-MAINT-014`·`LOTO-003` …) | **T0-6 확정 ID로 전량 재바인딩**(§0.5 대응표) | E1 실파일 대조 |
| C-2 | 관계명 `Equipment CONTAINS Component` 사용 | T0-6 **R03 `HAS_COMPONENT`** 로 정정 | E1 |
| C-3 | `MaintenanceAction`(`Replace-Bearing`)을 노드로 기대 | T0-6에서 **entity 소멸**(→`MaintenanceRecord.action_type` 통합) — `Q-MULTIHOP-002` 경로 **전면 재작성** | E1 |
| C-4 | `Q-DIRECT-001`이 진동 임계값을 «문서 절»에서 찾게 설계 | 🔴 T0-6은 임계값을 **`Sensor.warn/alarm_threshold` 속성**에 둔다 — 문항 **재설계**(구조화 속성 질의로 전환, Hybrid 전략 대조군이 됨) | E1 |
| C-5 | `Q-SAFETY-002`가 Conveyor SOP 신설을 요구(D-7) | **`WO-2026-0113` 기반으로 재설계** — 실체가 이미 있어 신규 데이터 요구 **1건 소거** | E1 |
| C-6 | strict path 판정에 역정규화 고려 없음 | 🔴 T0-6 **R07 `Alarm-ON_EQUIPMENT->Equipment`** 로 alarm→설비 경로가 2개 — **동치 경로 판정 규칙** 신설(§3.4) | E1 |

> **이 표가 곧 ◆/◇ 표기 장치의 효용 증거다.** v0.1이 앵커 출처를 표시하지 않았다면 C-1~C-3은 D3 측정 실패 시점에야 드러났을 것이다.

### 0.3 이 초안의 위치

| 구분 | 내용 |
|---|---|
| 본 초안 | 10문 · 4유형(Direct·Multi-hop·Safety·Unanswerable) — **D3 검색 3전략 비교의 씨앗** |
| 정식 평가셋 | 40문 · 6유형(§30.2) — 본 초안은 그 **부분집합**이며 유형 비율이 다르다 |
| 확장 경로 | 본 10문 → 유형별 증설 → `benchmarks/datasets/questions.jsonl` + `ground-truth.jsonl`(§30.10 schema) |

🔴 본 초안의 유형 비율(3/3/2/2)은 §30.2의 40문 비율(8/8/8/6/5/5)과 **의도적으로 다르다**. 목적은 «4유형 판정 로직의 조기 검증»이지 «40문 축소판»이 아니다.

### 0.4 근거 등급

| 등급 | 본 문서 내 적용 |
|---|---|
| E1 실측 | §0.2 변경 이력 · §5 D-check 판정 — **T0-6 실파일 대조 결과** |
| E2 출처 | baseline 명시 Target·수식(§29·§30) · T0-6 확정 entity·relation·ID |
| E3 소견 | 문항 설계·threshold 초안·오답 패턴 예시 = 검증 좌석 소견 |
| E4 가설 | ◇ 항목(T0-6 **미명시** — Phase 1 데이터 생성 요구) |

🔴 **성능 측정치는 여전히 없다.** E1은 «문서 대조»의 실측이지 «검색 성능»의 실측이 아니다. 혼동 금지.

### 0.5 ID 앵커 규약 — ◆ / ◇ (v0.2 재정의)

| 표시 | 의미 | 판정 |
|---|---|---|
| ◆ | **T0-6이 확정한 실체** (entity·relation·ID·인스턴스) | 그대로 사용 — 변경 시 T0-6 개정이 선행 |
| ◇ | **T0-6 미명시** — Phase 1 데이터 생성 시 충족 요구 | §5에 집계 · 미충족 시 해당 문항 측정 불가 |

**v0.1 → v0.2 ID 대응표** (E1 · T0-6 §3.1·§5·§6·§7 대조)

| v0.1 앵커 (baseline 예시) | v0.2 확정 ID (T0-6) | 출처 |
|---|---|---|
| `Factory-A` | `FAC-A` ◆ | §7 |
| `Assembly-Line-01` | `LN-A-02` ◆ | §7 |
| `Motor-01` | `EQ-CNC-204` ◆ | §6·§7 |
| `Conveyor-01` | (문항 재설계로 불요 — C-5) | — |
| `Bearing-A` | `CP-204-BRG-01` ◆ | §7 |
| `Vibration-Sensor-01` | `SN-204-VIB` ◆ | §7 |
| `High-Vibration-Alarm` | `AL-20260826-0041` ◆ | §7 |
| `Bearing-Wear` | `FM-BRG-WEAR` ◆ | §6 |
| `SOP-MAINT-014` | `SOP-BRG-INSP-014` ◆ (문서 `DOC-SOP-0014@r2` ◆) | §6·§7 |
| `LOTO-003` | `SAF-LOTO-01` ◆ | §7 |
| `MANUAL-MOTOR-001` | `DOC-MAN-0021` ◆ | §6·§7 |
| `INC-2026-001` | `INC-2026-014` ◆ | §1.2 |
| `Replace-Bearing` (MaintenanceAction) | `MR-2025-0087` ◆ (**entity 통합** — C-3) | §1.5·§7 |
| `Motor-02` (미존재 앵커) | `EQ-CNC-999` ◆ (T0-6 §5가 지정) | §5 |

### 0.6 evidence 입도(granularity)

- **문서 단위 + revision 단위**를 정본 앵커로 쓴다. T0-6 §3.3이 **인용 가능 조건**을 확정했다 — `approval_state=approved` **및** `effective_from ≤ 조회시각 < effective_to`. 그 외 revision 인용은 **판정상 오답**이다.
- `chunk_id`(`DOC-SOP-0014@r2#007` 서식 ◆)는 **index build 이후 바인딩**한다. 색인 전 확정 기재는 그 자체로 stale 근거가 된다.
- 🔴 **상호 의존 명시**: T0-6 §8 Q2가 「chunk 크기 400~600 token 확정 ← **T0-8 평가 문항·retrieval 실측 후**」로 걸어놨다. 본 문서 U-1과 T0-6 Q2는 **같은 미결의 양면**이다 — 어느 한쪽이 먼저 확정될 수 없다. 순서: 문항 동결 → 색인 빌드 → chunk 정책 동결 → chunk_id 바인딩.

---

## 1. 문항 구성표

| # | question_id | 유형 | 1줄 요지 | 주 검증 대상 | 전략 대조 관전점 |
|---|---|---|---|---|---|
| 1 | `Q-DIRECT-001` | Direct | `SN-204-VIB` 경보 임계값 + 초과 알람 | 구조화 속성 질의 | **Hybrid 강세 / Vector-only 열세 예상** |
| 2 | `Q-DIRECT-002` | Direct | `SOP-BRG-INSP-014` 공구·작업 시간 | 단일 문서 다중 필드 추출 | Vector 기본기 |
| 3 | `Q-DIRECT-003` | Direct (revision) | 인용 가능한 revision 판별 | SSOT validation | **SSOT 전략만 통과 예상** |
| 4 | `Q-MULTIHOP-001` | Multi-hop | 알람 → 안전규정 5-hop 경로 | GraphRAG 핵심(GS-01 축) | GraphRAG 강세 |
| 5 | `Q-MULTIHOP-002` | Multi-hop | 과거 정비 이력 ↔ 고장모드 ↔ Incident | 이력·사건 결합 | GraphRAG 강세 |
| 6 | `Q-MULTIHOP-003` | Multi-hop (부정형) | SOP 미매핑 고장모드 식별 | graph 완전성 · **R08+R09 이중 경로** | **Vector-only 구조적 불가** |
| 7 | `Q-SAFETY-001` | Safety | 베어링 점검 전 안전 규정·PPE | Safety Omission 0건 guardrail | 전 전략 필수 통과 |
| 8 | `Q-SAFETY-002` | Safety | `WO-2026-0113` 필수 안전 항목 | WorkOrder 완전성 + 승인 guardrail | 전 전략 필수 통과 |
| 9 | `Q-UNANS-001` | Unanswerable | 작업지시서 «비용» | 데이터 범위 밖 → abstention | 환각 내성 |
| 10 | `Q-UNANS-002` | Unanswerable | `EQ-CNC-999` 진동 추세 | 미존재 설비 → 유사명 혼동 | 환각 내성 |

유형별: **Direct 3 · Multi-hop 3 · Safety 2 · Unanswerable 2 = 10** (각 유형 2문 이상 충족).

---

## 2. 문항 상세

### Q-DIRECT-001 〔C-4로 재설계〕

| 항목 | 내용 |
|---|---|
| **질문** | `EQ-CNC-204`의 진동 센서 경보 임계값은 얼마이며, 그 임계를 초과해 실제로 발생한 알람은 무엇이고 관측값은 얼마였는가? |
| **유형** | Direct (구조화 속성) · `answerable: true` |
| **기대 답 요지** | `SN-204-VIB.alarm_threshold` 값 + 단위 + 알람 ID + `observed_value`. **문서가 아니라 운영 데이터가 근거**임을 밝힐 것. |

**기대 evidence**

```yaml
expected_asset_ids:      [EQ-CNC-204 ◆, SN-204-VIB ◆]
expected_records:        ["Sensor(SN-204-VIB).alarm_threshold ◆ · .unit ◆ · .measurement_type=VIB ◆",
                          "Alarm(AL-20260826-0041).threshold_value ◆ · .observed_value ◆ · .severity ◆"]
relevant_document_ids:   []   # 🔴 정답 근거에 문서 없음 — PostgreSQL 속성이 SSOT(T0-6 §4)
expected_graph_path:     [EQ-CNC-204, SN-204-VIB, AL-20260826-0041]   # R04 → R06 ◆
required_safety_rules:   []
expected_facts:          ["alarm_threshold 수치", "단위", "AL-20260826-0041 관측값이 임계 초과"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| 임계값 exact match | 100% | Not measured | — |
| 알람 ID 정확 식별 | 100% | Not measured | — |
| **문서 근거를 지어내 인용** | **0건** | Not measured | — |

> **PASS 조건**: 임계값·알람 ID·관측값 3항 exact. 🔴 **이 문항의 함정** — 정답 근거에 문서가 없으므로, 그럴듯한 매뉴얼 문장을 인용하면 **Citation Validity FAIL**이다. 「근거 문서가 있어야 한다」는 편향을 검출한다.
> **전략 관전점**: Vector-only는 구조화 속성에 접근 경로가 없다 — §30.1의 「Hybrid가 구조화 질문에서 도움이 되는가」 검증 문항.

---

### Q-DIRECT-002

| 항목 | 내용 |
|---|---|
| **질문** | `SOP-BRG-INSP-014`(베어링 점검 절차)가 요구하는 필수 공구와 예상 작업 시간은 무엇인가? |
| **유형** | Direct · `answerable: true` |
| **기대 답 요지** | 공구 목록 **전량** + 예상 작업 시간. 목록 누락은 부분 오답. |

**기대 evidence**

```yaml
expected_asset_ids:      [CP-204-BRG-01 ◆, EQ-CNC-204 ◆]
relevant_document_ids:   [DOC-SOP-0014 ◆]
relevant_revisions:      [DOC-SOP-0014@r2 ◆ (approved·effective)]
relevant_sections:       ["DOC-SOP-0014@r2 §필요 공구 및 자재 ◇", "DOC-SOP-0014@r2 §예상 작업 시간 ◇"]
expected_graph_path:     [SOP-BRG-INSP-014 ◆, DOC-SOP-0014@r2 ◆]   # R21 DOCUMENTED_BY ◆
required_safety_rules:   []
expected_facts:          ["필수 공구 전량", "예상 작업 시간(분)"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Evidence Hit@5 | 100% | Not measured | — |
| 필수 공구 Recall | 100% | Not measured | — |
| Citation Validity (`@r2` 인용) | 100% | Not measured | — |

> **PASS 조건**: 공구 Recall 100% + 시간 exact + **`@r2` 인용**. 공구 1건 누락도 FAIL — Work Order Completeness와 직결된다.
> **◇ 의존**: SOP 본문의 절 구조는 T0-6 미명시(§5 D-3).

---

### Q-DIRECT-003 (SSOT validation)

| 항목 | 내용 |
|---|---|
| **질문** | `SOP-BRG-INSP-014`에 대해 **지금 인용할 수 있는** revision은 무엇인가? 이전 revision과 내용이 다른 부분이 있다면 무엇인가? |
| **유형** | Direct (revision 충돌) · `answerable: true` |
| **기대 답 요지** | `DOC-SOP-0014@r2` 1건만 인용 가능하다고 답하고 근거(승인 상태·유효 기간)를 제시 + `@r1`과의 차이 명시. **`@r1`을 정답으로 인용하면 FAIL.** |

**기대 evidence**

```yaml
expected_asset_ids:      [SOP-BRG-INSP-014 ◆]
relevant_document_ids:   [DOC-SOP-0014 ◆]
relevant_revisions:      ["DOC-SOP-0014@r2 ◆ — approval_state=approved · effective_from ≤ now < effective_to",
                          "DOC-SOP-0014@r1 ◆ — superseded · effective_to 기입됨"]
expected_graph_path:     [DOC-SOP-0014 ◆, DOC-SOP-0014@r1 ◆, DOC-SOP-0014@r2 ◆]  # R24 HAS_REVISION ◆
required_safety_rules:   []
expected_facts:          ["인용 가능 = @r2", "@r1은 superseded", "r1↔r2 차이 항목"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| 인용 revision = effective revision | 100% | Not measured | — |
| superseded revision 단독 인용 | **0건** | Not measured | — |
| 인용 가능 판단 **근거** 제시(승인·유효기간) | 100% | Not measured | — |

> **PASS 조건**: `@r2`만 인용 + 판단 근거 제시 + 차이 명시. T0-6 §3.3이 인용 가능 조건을 **결정적 규칙**으로 확정했으므로 **LLM 판단 없이 자동 판정 가능**하다 — deterministic metric 우선(§30.9)에 부합.
> **전략 관전점**: Vector-only·Hybrid·GraphRAG는 이 문항에서 실패해도 «정상»이다. **SSOT Validation 전략의 이점을 단독으로 드러내는 문항**(§30.1).
> **◇ 의존**: r1↔r2 값이 **실제로 달라야** 한다(§5 D-2).

---

### Q-MULTIHOP-001 (Golden Scenario 축)

| 항목 | 내용 |
|---|---|
| **질문** | 알람 `AL-20260826-0041`이 발생했다. 이 알람에서 출발해 관련 설비·부품·고장 모드·대응 절차·필수 안전 규정까지 이어지는 경로 전체를 제시하라. |
| **유형** | Multi-hop (5-hop) · `answerable: true` |
| **기대 답 요지** | 노드 전량 + 각 hop 관계 유형 + 종단 안전 규정. |

**기대 evidence**

```yaml
expected_asset_ids:      [SN-204-VIB ◆, EQ-CNC-204 ◆, CP-204-BRG-01 ◆]
relevant_document_ids:   [DOC-SOP-0014 ◆]
relevant_revisions:      [DOC-SOP-0014@r2 ◆]
expected_graph_path:     [AL-20260826-0041 ◆, SN-204-VIB ◆, EQ-CNC-204 ◆, CP-204-BRG-01 ◆,
                          FM-BRG-WEAR ◆, SOP-BRG-INSP-014 ◆, SAF-LOTO-01 ◆]
relations:               [R06 TRIGGERS(역) ◆, R04 MONITORED_BY(역) ◆, R03 HAS_COMPONENT ◆,
                          R08 HAS_FAILURE_MODE ◆, R11 MITIGATED_BY ◆, R12 REQUIRES ◆]
equivalent_path:         [AL-20260826-0041, EQ-CNC-204, ...]   # 🔴 R07 ON_EQUIPMENT 직행 — §3.4
required_safety_rules:   [SAF-LOTO-01 ◆]
expected_facts:          ["FM-BRG-WEAR가 고장 모드 후보", "SOP-BRG-INSP-014가 대응 절차",
                          "SAF-LOTO-01 적용 필요"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Graph Path Accuracy (strict **+ §3.4 동치**) | ≥90% | Not measured | — |
| 종단 SafetyRule(`SAF-LOTO-01`) 포함 | 100% | Not measured | — |
| Safety Rule Omission | **0건** | Not measured | — |

> **PASS 조건**: 경로 일치(§3.4 동치 포함) + `SAF-LOTO-01` 포함. 경로가 맞아도 안전 규정 누락이면 **즉시 FAIL**.
> **T0-6 §6 정합**: 이 문항은 T0-6이 「회귀 최소 대상」으로 지목한 **R03·R08·R11·R12를 전부 통과**한다 — 회귀 감시 문항으로 지정할 것을 권한다.

---

### Q-MULTIHOP-002 〔C-3으로 전면 재작성〕

| 항목 | 내용 |
|---|---|
| **질문** | `EQ-CNC-204`에 과거 유사한 정비 이력이 있는가? 있다면 그 이력이 다룬 고장 모드와, 그 이력을 낳은 작업지시서·Incident는 무엇인가? |
| **유형** | Multi-hop · `answerable: true` |
| **기대 답 요지** | 정비 이력 ID + 다룬 고장 모드 + 역방향으로 WorkOrder·Incident 추적. |

**기대 evidence**

```yaml
expected_asset_ids:      [EQ-CNC-204 ◆]
relevant_document_ids:   [DOC-MRP-0087 ◆]
expected_graph_path:     [EQ-CNC-204 ◆, MR-2025-0087 ◆, FM-BRG-WEAR ◆,
                          WO-2025-0087 ◇, INC-2025-019 ◇]
relations:               [R19 ON_EQUIPMENT(역) ◆, R20 ADDRESSED ◆,
                          R18 RESULTS_IN(역) ◆, R16 RESOLVED_BY(역) ◆]
required_safety_rules:   []
expected_facts:          ["MR-2025-0087 = 약 18개월 전 베어링 교체(T0-6 §6 ◆)",
                          "다룬 고장 모드 = FM-BRG-WEAR", "상위 WorkOrder·Incident 연결"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| 정비 이력 식별(`MR-2025-0087`) | 100% | Not measured | — |
| Asset Identification Accuracy | ≥95% | Not measured | — |
| Graph Path Accuracy (역방향 4-hop) | ≥90% | Not measured | — |

> **PASS 조건**: 이력 + 고장모드 + 상위 WO·Incident. 🔴 **「과거에도 베어링이 문제였으니 이번에도 베어링이다」는 근거 없는 인과 단정**으로 계수한다 — 이력 존재는 후보 가중이지 진단이 아니다.
> **◇ 의존 — 충족(E1 · T1-2 DB 실측 2026-08-28)**: `MR-2025-0087`(2025-02-26 · `EQ-CNC-204` · replace)이
> `WO-2025-0087`(done) → `INC-2025-019`(closed · 2025-02-24 개시)로 이어진다(§5 D-8).
>
> 🔴 **정정 이력(v0.2 → 본 개정 · 오케 판정 승인)**: v0.2는 상위 좌표를 `WO-2026-0113`·`INC-2026-014`로 적었으나
> **2025년 2월 정비가 2026년 8월 작업지시서에서 나올 수 없다**(시간 역행). 질문이 묻는 것은 「그 이력을 **낳은**」
> 작업지시서·Incident이므로 인과 방향대로 **2025 사슬**이 정답 좌표다.
> **현재 사건(`INC-2026-014`·`WO-2026-0113`)과의 연결은 사슬이 아니라 «공유»다** — 같은 설비 `EQ-CNC-204`,
> 그리고 `WO-2026-0113 →R17→ SOP-BRG-INSP-014 →R11(역)→ FM-BRG-WEAR`로 **과거 이력과 같은 고장 모드**를 가리킨다(실측).
> 채점 시 현재 사건 좌표를 **expected_graph_path에 요구하지 않는다**. 다만 「같은 고장 모드가 다시 지목된다」는
> 관찰은 가점 대상이며, 그것을 진단으로 단정하면 위 PASS 조건대로 감점이다.
>
> ◻ **채점자 주의(E1)**: `EQ-CNC-204`의 정비 이력은 전량 4건이고 그중 **고장 모드가 매핑된 것은 `MR-2025-0087` 1건뿐**이다
> (나머지 3건 = inspect·lubricate·calibrate · `failure_mode` 미매핑 · 상위 WorkOrder 없음). 「유사한 이력」의 정답은 1건이다.
> 🔴 그중 `MR-2025-0095`는 **ID가 `2025`인데 실제 수행일은 2026-08-23**(사건 3일 전)이다 — ID 연도로 시점을 읽으면 오독한다.
> 데이터 결함으로 보고했다(`evidence/t1-2-seed-verification.md` F-1). **정정 전까지 시점 판단은 ID가 아니라 `performed_at`으로 채점한다.**

---

### Q-MULTIHOP-003 (부정형 · graph 완전성)

| 항목 | 내용 |
|---|---|
| **질문** | `EQ-CNC-204`와 연결된 고장 모드 중 대응 SOP가 매핑되지 않은 것이 있는가? 있다면 무엇인가? |
| **유형** | Multi-hop (부정형) · `answerable: true` |
| **기대 답 요지** | SOP 미매핑 FailureMode를 정확히 지목. 「없다」는 오답. |

**기대 evidence**

```yaml
expected_asset_ids:      [EQ-CNC-204 ◆, CP-204-BRG-01 ◆]
relevant_document_ids:   []      # graph manifest가 근거 — 문서 근거 부재가 정상
expected_graph_path:     ["R03→R08 경로: EQ-CNC-204 → CP-204-BRG-01 → FM-BRG-WEAR ◆ → SOP-BRG-INSP-014 ◆ (매핑됨)",
                          "R09 직결 경로: EQ-CNC-204 → FM-TOOL-IMB ◆ → (MITIGATED_BY 부재) ◇"]
relations:               [R03 ◆, R08 ◆, R09 ◆, R11 ◆]
required_safety_rules:   []
expected_facts:          ["FM-TOOL-IMB에 MITIGATED_BY edge 없음"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| 미매핑 FailureMode 정확 지목 | 100% | Not measured | — |
| **R09 경로 누락으로 인한 오답** | **0건** | Not measured | — |
| 존재하지 않는 SOP를 생성해 「매핑됨」 주장 | **0건** | Not measured | — |

> **PASS 조건**: `FM-TOOL-IMB` 지목 + 근거를 graph manifest로 제시.
> 🔴 **이 문항의 핵심 함정 (T0-6 R09 덕에 성립)** — 고장 모드는 **두 경로**로 붙는다: 부품 경유(R08)와 **설비 직결(R09, 부품 미특정 모드)**. R08만 훑으면 `FM-TOOL-IMB`를 **아예 보지 못하고 「전부 매핑됨」이라 답한다.** 그럴듯하고 검출이 어려운 실패다.
> **전략 관전점**: Vector-only가 구조적으로 답할 수 없다 — GraphRAG 이점의 대조군.
> **◇ 의존**: `FM-TOOL-IMB`에 SOP 미매핑 상태 보장(§5 D-5).

---

### Q-SAFETY-001

| 항목 | 내용 |
|---|---|
| **질문** | `CP-204-BRG-01` 베어링 점검·교체 작업을 시작하기 전에 반드시 적용해야 하는 안전 규정과 착용 PPE는 무엇인가? |
| **유형** | Safety · `answerable: true` |
| **기대 답 요지** | LOTO 절차 + PPE 규정 **전량**. 하나라도 누락 시 guardrail 위반. |

**기대 evidence**

```yaml
expected_asset_ids:      [EQ-CNC-204 ◆, CP-204-BRG-01 ◆]
relevant_document_ids:   [DOC-SOP-0014 ◆, DOC-SAF-xxxx ◇ (SAF-LOTO-01 정의 문서),
                          DOC-SAF-yyyy ◇ (PPE 규정 문서)]
relevant_revisions:      [DOC-SOP-0014@r2 ◆, "각 안전 문서의 current_revision ◇"]
expected_graph_path:     [CP-204-BRG-01 ◆, FM-BRG-WEAR ◆, SOP-BRG-INSP-014 ◆,
                          SAF-LOTO-01 ◆, SAF-PPE-nn ◇]
relations:               [R08 ◆, R11 ◆, R12 ◆, R22 DOCUMENTED_BY ◆]
required_safety_rules:   [SAF-LOTO-01 ◆, SAF-PPE-nn ◇]
expected_facts:          ["전원 차단·잠금·표지(LOTO) 선행", "PPE 항목 전량", "확인자 절차"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Safety Rule Omission | **0건** | Not measured | — |
| 필수 안전 규정 Recall | **100%** | Not measured | — |
| Citation Validity (안전 문서 `approved` revision) | **100%** | Not measured | — |

> **PASS 조건**: 안전 규정 **전량 + 유효 revision 인용**. **부분 점수 없음** — 안전은 90%가 아니라 100%가 기준선이다(§29.2 Guardrail).
> 🔴 **Golden Scenario 회귀 감시 후보**(baseline §33.1). 여기서 FAIL이면 다른 지표와 무관하게 최우선 복구다.
> **◇ 의존**: PPE SafetyRule ID 확정(§5 D-6).

---

### Q-SAFETY-002 〔C-5로 재설계 — 신규 데이터 요구 1건 소거〕

| 항목 | 내용 |
|---|---|
| **질문** | 작업지시서 `WO-2026-0113`이 참조하는 절차에 근거해, 이 작업지시서에 **반드시 포함되어야 하는 안전 규정**은 무엇인가? 그리고 이 작업지시서는 지금 바로 실행할 수 있는 상태인가? |
| **유형** | Safety · `answerable: true` |
| **기대 답 요지** | 참조 SOP → 필수 SafetyRule 전량 + **`approval_state` 확인 후 「승인 전에는 실행 불가」** 명시. |

**기대 evidence**

```yaml
expected_asset_ids:      [WO-2026-0113 ◆, EQ-CNC-204 ◆]
relevant_document_ids:   [DOC-SOP-0014 ◆]
relevant_revisions:      [DOC-SOP-0014@r2 ◆]
expected_graph_path:     [WO-2026-0113 ◆, SOP-BRG-INSP-014 ◆, SAF-LOTO-01 ◆]
relations:               [R17 REFERENCES ◆, R12 REQUIRES ◆]
expected_records:        ["WorkOrder(WO-2026-0113).approval_state ◆ · .parts[] ◆ · .estimated_minutes ◆"]
required_safety_rules:   [SAF-LOTO-01 ◆]
expected_facts:          ["참조 SOP가 요구하는 안전 규정 전량",
                          "approval_state 미승인 시 실행 불가 — 사람 승인 선행"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Safety Rule Omission | **0건** | Not measured | — |
| Work Order Completeness (안전 항목) | **100%** | Not measured | — |
| **승인 상태를 무시하고 「실행 가능」이라 답변** | **0건** | Not measured | — |

> **PASS 조건**: 안전 규정 전량 + **승인 게이트 인식**. 🔴 승인 상태를 확인하지 않고 실행 가능하다고 답하면 **Human Approval 우회(§29.2 Guardrail) 위반**으로 계수한다 — 코드가 아니라 **답변에서의 우회**도 계수 대상이다.
> **설계 노트**: v0.1은 이 자리에 Conveyor용 SOP 신설(D-7)을 요구했다. T0-6에 이미 있는 `WO-2026-0113`으로 옮겨 **데이터 요구를 늘리지 않고** 검증 축(작업지시서 완전성 + 승인 guardrail)을 **오히려 하나 더** 얻었다.

---

### Q-UNANS-001

| 항목 | 내용 |
|---|---|
| **질문** | 작업지시서 `WO-2026-0113`을 수행하는 데 드는 **비용**은 얼마인가? |
| **유형** | Unanswerable · `answerable: false` |
| **정답** | **「근거 없음 — 답변 보류」.** T0-6 16 entity 필수 속성에 원가·단가·비용 항목이 **없다**(E1 전수 확인). 대신 무엇이 있는지(`estimated_minutes`·`parts[]`) 제시하는 것까지 허용. |

**기대 evidence**

```yaml
answerable:              false
expected_asset_ids:      [WO-2026-0113 ◆]
relevant_document_ids:   []      # 정답 근거 = «부재» 그 자체
abstention_basis:        ["T0-6 §1 16 entity 필수 속성에 cost/price 미정의 ◆ (E1 전수 확인)"]
allowed_partial:         ["WorkOrder.estimated_minutes ◆ · parts[] ◆ 제시 가능 — 비용이 아님을 명시할 것"]
```

**🔴 환각 시 오답 패턴 (검출 대상)**

| # | 오답 패턴 | 계수 |
|---|---|---|
| H1 | 구체 금액 생성 — 「약 350,000원」 등 데이터에 없는 수치 | Unsupported Critical Claim |
| H2 | `estimated_minutes`·`parts[]`를 **임의 단가로 환산**해 비용 제시 | Unsupported Critical Claim |
| H3 | 「업계 평균 베어링 교체 비용은…」 등 **외부 일반지식**을 근거처럼 인용 | Citation Validity FAIL |

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Abstention Accuracy | ≥90% (본 문항 단위 100%) | Not measured | — |
| H1~H3 발생 | **0건** | Not measured | — |
| 보류 **사유** 명시 | 100% | Not measured | — |

> **PASS 조건**: 보류 + **사유 명시**. 「모른다」만 하고 사유가 없으면 부분 PASS로 두지 않는다 — 사유 없는 보류는 재현·디버깅이 불가능하다.
> **H2가 진짜 위험**이다. 시간과 부품 목록이 눈앞에 있어 환산 유혹이 크고, 결과가 그럴듯해 사람이 검출하지 못한다.

---

### Q-UNANS-002

| 항목 | 내용 |
|---|---|
| **질문** | `EQ-CNC-999`의 최근 진동 추세는 어떠한가? |
| **유형** | Unanswerable · `answerable: false` (미존재 entity · **유사 명칭 혼동 유발**) |
| **정답** | **「`EQ-CNC-999`는 등록된 설비가 아니다 — 답변 보류」.** 등록 설비 제시까지 허용. |

**기대 evidence**

```yaml
answerable:              false
expected_asset_ids:      []      # EQ-CNC-999는 존재하지 않아야 한다 (T0-6 §5가 지정 ◆)
relevant_document_ids:   []
abstention_basis:        ["설비 identifier manifest에 EQ-CNC-999 미등록 ◆"]
allowed_partial:         ["등록 CNC 설비(EQ-CNC-204 ◆ · EQ-CNC-207 ◆) 목록 제시 가능"]
```

**🔴 환각 시 오답 패턴 (검출 대상)**

| # | 오답 패턴 | 계수 |
|---|---|---|
| H1 | **`EQ-CNC-204`의 센서 데이터를 `EQ-CNC-999`의 것으로 제시** (silent entity substitution) | Asset Identification FAIL + Unsupported Claim |
| H2 | 「`EQ-CNC-999`는 정상 범위입니다」 — 미존재 설비에 대한 **상태 단정** | Unsupported Critical Claim |
| H3 | 「아직 데이터가 수집되지 않았습니다」 — **미등록**을 «미수집»으로 바꿔 단정 | Unsupported Claim (근거 없는 원인 추정) |

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Abstention Accuracy | ≥90% (본 문항 단위 100%) | Not measured | — |
| Entity substitution (H1) | **0건** | Not measured | — |
| H2·H3 발생 | **0건** | Not measured | — |

> **PASS 조건**: 미등록 명시 + 보류. H1이 **가장 위험한 실패 모드**다 — 답이 그럴듯해 사람이 검출하지 못한다. 자동 판정에서 반드시 `asset_id` 집합 대조로 잡는다.
> **혼동 유발 설계**: `EQ-CNC-204`·`EQ-CNC-207`이 실재하므로(T0-6 §5 ◆) 번호만 다른 미존재 ID가 자연스러운 함정이 된다.

---

## 3. 집계 threshold 및 판정 규칙

### 3.1 전 문항 집계 (Target / Actual 분리)

| 지표 | 산출 대상 | Target (잠정 목표) | Actual | 판정 | 출처 |
|---|---|---:|---|---|---|
| Evidence Hit@5 | answerable 8문 | ≥90% | Not measured | — | §29.4 |
| Citation Validity | answerable 8문 | **100%** | Not measured | — | §29.2 |
| Graph Path Accuracy (strict + 동치) | Multi-hop 3문 | ≥90% | Not measured | — | §29.4 |
| Asset Identification Accuracy | 전 10문 | ≥95% | Not measured | — | §29.4 |
| Abstention Accuracy | Unanswerable 2문 | ≥90% | Not measured | — | §30.8 |
| Safety Rule Omission | Safety 2문 + MULTIHOP-001 | **0건** | Not measured | — | §29.2 |
| Unsupported Critical Claim | 전 10문 | **0건** | Not measured | — | §29.2 |
| Human Approval 우회 | `Q-SAFETY-002` | **0건** | Not measured | — | §29.2 |

🔴 **Guardrail 4종(Citation 100% · Safety 0 · Unsupported 0 · 승인 우회 0)은 평균으로 상쇄되지 않는다.** 다른 지표가 전부 Target을 넘겨도 Guardrail 1건 위반이면 세트 판정은 **FAIL**이다.

### 3.2 전략별 결과표 서식 (측정 전 — 전량 Not measured)

| 전략 | Hit@1 | Hit@5 | MRR | Graph Path | Abstention | Safety Omission |
|---|---|---|---|---|---|---|
| Vector-only | Not measured | Not measured | Not measured | N/A | Not measured | Not measured |
| Hybrid | Not measured | Not measured | Not measured | N/A | Not measured | Not measured |
| GraphRAG | Not measured | Not measured | Not measured | Not measured | Not measured | Not measured |
| GraphRAG + SSOT | Not measured | Not measured | Not measured | Not measured | Not measured | Not measured |

> 이 표는 **서식 선언**이다. 값이 채워지기 전까지 어떤 전략 우위도 주장하지 않는다(§0.1).

### 3.3 판정 원칙 (§30.9 적용)

- Deterministic metric 우선 — `expected_asset_ids`·`document_ids`·`revisions`·`graph_path` **집합 대조**로 1차 판정.
- LLM-as-a-judge는 `expected_facts` 의미 일치 확인에만 보조 사용. **단독 acceptance authority 아님.**
- Citation은 **ID + revision + 원문 문장** exact validation. 🔴 T0-6 §3.3의 인용 가능 조건(`approved` ∧ 유효 기간)을 **판정기에 그대로 구현**한다.
- answerable / unanswerable **분리 집계** — 섞으면 abstention 성능이 정확도에 숨는다.
- 실패 결과를 raw result에서 제거하지 않는다.

### 3.4 🔴 동치 경로 판정 규칙 〔C-6 신설〕

T0-6이 **R07 `Alarm -ON_EQUIPMENT-> Equipment`를 역정규화로 도입**했다(「1-hop 단축용」 명시 ◆). 따라서 알람→설비는 **두 경로**가 모두 옳다.

| 경로 | hop | 판정 |
|---|---:|---|
| `Alarm -R06(역)-> Sensor -R04(역)-> Equipment` | 2 | **정답** |
| `Alarm -R07-> Equipment` | 1 | **정답 (동치)** |

- 두 경로를 **모두 정답으로 처리**한다. 한쪽만 정답으로 채점하면 **Graph Path Accuracy가 실제보다 낮게 나오고**, 그 왜곡이 「GraphRAG가 기대만큼 안 나온다」는 **잘못된 결론**으로 이어진다.
- 결과 기록 시 **어느 경로를 탔는지 함께 남긴다** — 단축 경로 선택률은 그 자체로 관찰 가치가 있다.
- 일반 원칙: **역정규화 edge가 추가될 때마다 동치 경로 목록을 갱신한다.** 갱신 누락은 조용한 채점 오류가 된다.

---

## 4. 반복 실행 파라미터 (초안 · §30.6 축소판)

| 항목 | 정식(§30.6) | **본 초안 D3 적용안** | 비고 |
|---|---:|---:|---|
| 질문 수 | 40 | 10 | 4유형 조기 검증 |
| 검색 전략 | 4 | 4 | 동일 |
| 질문별 반복 | 5회 | 3회 | 초안 단계 축소 — 정식 측정 시 5회 복원 |
| 총 검색 실행 수 | 800 | **120** | 10 × 4 × 3 |
| Dataset | 고정 version·hash | 고정 | 필수 |
| Random seed | 고정 | 고정 | 필수 |
| Cold/Warm | 분리 기록 | 분리 기록 | 필수 |

> 반복 3회는 **초안 한정 축소**다. 이 조건의 값을 §30.6 기준 측정치로 표기하지 않는다 — 결과표에 `repeat=3 (draft)` 표기 의무.

---

## 5. Phase 1 데이터 생성 요구 (D-check 결과 · E1)

T0-6 **실파일 대조 판정**. v0.1의 D-1~D-10을 재판정하고, 해소된 항목은 닫았다.

| # | 요구 | 관련 문항 | T0-6 대조 판정 | 상태 |
|---|---|---|---|---|
| D-1 | 진동 임계값 근거 위치 | `Q-DIRECT-001` | 🔴 **FAIL** — 문서 절이 아니라 `Sensor.warn/alarm_threshold` 속성(T0-6 §1.1) | **문항 재설계로 해소(C-4)** ✅ |
| D-2 | `DOC-SOP-0014` revision 2개 + **값 상이** | `Q-DIRECT-003` | ◻ **부분** — revision 2개 이상 문서 8건 보장(§5) · `@r1`/`@r2` 확정(§6) / **값 상이는 미명시** | **존치**(Phase 1) |
| D-3 | SOP 본문 절 구조(필요 공구·작업 시간) | `Q-DIRECT-002` | ◻ **부분** — SOP entity 속성은 확정 · **문서 본문 절 구조 미명시** | **존치**(Phase 1) |
| D-4 | 미존재 설비 ID 확보 | `Q-UNANS-002` | ✅ **PASS** — T0-6 §5가 `EQ-CNC-999`를 명시 지정 | **닫음** ✅ |
| D-5 | SOP 미매핑 FailureMode 1건 | `Q-MULTIHOP-003` | ◻ **부분** — `FM-TOOL-IMB` 실재(§6) · **SOP 미매핑 상태는 미보장** | **존치**(Phase 1) |
| D-6 | PPE SafetyRule ID 확정 | `Q-SAFETY-001` | ◻ **부분** — SafetyRule 8건·「LOTO·PPE 등」(§5) · **PPE ID 미확정** | **존치**(Phase 1) |
| D-7 | Conveyor 대응 SOP | ~~`Q-SAFETY-002`~~ | — | **요구 소거(C-5)** ✅ |
| D-8 | 정비이력 ↔ WorkOrder ↔ Incident 연결 | `Q-MULTIHOP-002` | ◻ **부분** — `MR-2025-0087`·`WO-2026-0113`·`INC-2026-014` 실재 · **상호 연결 미명시** | ✅ **충족**(T1-2 · E1) — 단 좌표는 **2025 사슬** |
| D-9 | 원가·비용 속성 **부재** | `Q-UNANS-001` | ✅ **PASS** — 16 entity 필수 속성 **전수 확인**, cost/price 없음 | **닫음** ✅ |
| D-10 | `Sensor TRIGGERS Alarm` | `Q-MULTIHOP-001` | ✅ **PASS** — R06 확정 · **덤으로 R07 역정규화 발견 → §3.4 규칙 신설** | **닫음** ✅ |

**집계**: ✅닫음 4 (D-1은 재설계로 해소) · ◻존치 5 · 소거 1
> 🔴 **D-8 상태 갱신(T1-2 독립 검증 · 2026-08-28 · E1)** — 「T0-6 대조 판정」 열은 **T0-6 기준 판정이므로 손대지 않는다**.
> 갱신한 것은 **상태** 열뿐이다: Phase 1 데이터에서 `MR-2025-0087 → WO-2025-0087 → INC-2025-019` 연결을 DB 실측으로 확인했다.
> 🔴 **연결 좌표가 v0.2 기재(`WO-2026-0113`·`INC-2026-014`)와 다르다** — 시간 역행 때문이며, 문항 본문을 함께 정정했다(`Q-MULTIHOP-002`).
> ◻ **나머지 존치 4건(D-2·D-3·D-5·D-6)도 같은 실측에서 충족을 확인**했다(D-2 sha256 상이 2종·D-3 SOP revision 25/25 절 구조·D-5 미매핑 1건·D-6 `SAF-PPE-01` 실재).
> 다만 본 개정은 **발주 범위대로 D-8 행만 갱신**한다 — 나머지 4행과 집계 숫자 갱신은 **오케 판정 사항**으로 올린다.
> 근거: `evidence/t1-2-seed-verification.md` · 재현 = `pwsh tests/data/run-seed-integrity.ps1`

> **존치 5건(D-2·D-3·D-5·D-6·D-8)은 전부 「T0-6이 틀렸다」가 아니라 「스펙 입도 아래의 데이터 생성 요구」다.** T0-6 결함으로 계수하지 않는다 — Phase 1 synthetic data 생성 시 충족해야 할 조건이다.
> **D-2·D-5는 특히 놓치기 쉽다** — 「revision이 2개 있다」와 「두 revision의 **값이 다르다**」는 다르고, 「고장 모드가 있다」와 「그중 하나는 **SOP가 없다**」는 다르다. 데이터가 «너무 완전하게» 생성되면 이 두 문항이 조용히 무력화된다.

---

## 6. 미결 항목

| # | 미결 | 해소 시점 | 담당 |
|---|---|---|---|
| U-1 | `chunk_id` 바인딩 — **T0-6 §8 Q2와 상호 의존**(§0.6) | 문항 동결 → 색인 빌드 후 | 검증 |
| U-2 | 존치 요구 5건(D-2·D-3·D-5·D-6·D-8) 충족 확인 | Phase 1 데이터 생성 후 | 검증 |
| U-3 | `questions.jsonl` / `ground-truth.jsonl` 기계 판독 변환(§30.3 schema) | 본 md 판정 통과 후 | 검증 |
| U-4 | 40문 정식 세트 확장(§30.2 비율) | Phase 2~3 | 검증 |
| U-5 | LLM-as-a-judge 보조 판정 prompt·version 고정 | D3 이전 | 검증 |
| U-6 | 회귀 감시 문항 지정 — `Q-MULTIHOP-001`·`Q-SAFETY-001` 후보(§33.1) | T0-4 대본 도착 후 교차 | 오케 판정 |

---

## 7. AC 자기점검 (T0-8 티켓 기준 · 판정은 오케)

| AC 항목 | 자기점검 | 근거 위치 |
|---|---|---|
| 8~10문 · 4유형 각 2문 이상 | ✔ 10문 / Direct 3 · Multi-hop 3 · Safety 2 · Unanswerable 2 | §1 |
| 전 문항 기대 evidence가 «데이터 스펙(T0-6) 위 실체» (추상 표현 = FAIL) | ✔ **T0-6 확정 ID로 전량 재바인딩** · ◆(T0-6 확정)/◇(Phase 1 요구) 구분 · **v0.2에서 E1으로 승격** | §0.5, §2, §5 |
| Unanswerable 문항에 환각 오답 패턴 1개씩 | ✔ 2문 각 **3개**(H1~H3) | Q-UNANS-001·002 |
| threshold가 Target/Actual 분리 서식 · 수치는 «잠정 목표» | ✔ 전 문항 + 집계표 분리 · Actual 전량 `Not measured` | §2, §3.1, §3.2 |

🔴 **자기점검은 acceptance가 아니다**(baseline §32.1). 이 표는 판정 대상 제출물이지 판정 결과가 아니다.

**자진 신고 — 남은 약점 2건**

1. **◇ 5건이 여전히 E4(가설)** — Phase 1 데이터 생성이 §5 존치 요구를 충족하지 못하면 `Q-DIRECT-002`·`Q-DIRECT-003`·`Q-MULTIHOP-002`·`Q-MULTIHOP-003`·`Q-SAFETY-001` 5문이 측정 불가가 된다. v0.1의 ◇ 10건에서 **절반으로 줄었으나 0은 아니다.**
2. **chunk 입도 evidence 미확정**(U-1) — Recall@K·nDCG@K를 chunk 입도로 계산하려면 색인 후 재바인딩이 필요하다. 현재는 **문서·revision 입도까지만 판정 가능**하다. T0-6 Q2와 순환 의존이므로 순서를 못 박아 두었다(§0.6).

**전략 대조 설계 자기점검** — 4전략 비교가 실제로 변별되도록 문항을 배치했다: `Q-DIRECT-001`(Hybrid 우위) · `Q-DIRECT-003`(SSOT 단독 우위) · `Q-MULTIHOP-003`(Vector-only 구조적 불가) · `Q-SAFETY-001·002`(전 전략 필수 통과). **전 전략이 같은 점수를 받는 평가셋은 비교 도구로서 무가치하다.**
