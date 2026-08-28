---
artifact: eval-questions-draft
ticket: T0-8
owner: 검증(리바이2)
status: 초안(draft) — 판정 대기
version: 0.1.0
created_at: 2026-08-28
baseline_ref: docs/baseline/poc-baseline-v0.2.md §10.1·§10.2·§18·§29.2~29.4·§30.2~30.9
depends_on: T0-6(데이터·온톨로지 스펙 v0.1) — 미도착 상태에서 착수, §5 대조 체크 미결
---

# T0-8 — 평가 질문 초안 (10문)

## 0. 전제와 경계

### 0.1 측정-주장 경계 (baseline §0.2 준수)

- 본 문서의 모든 수치는 **«잠정 목표»(Target)** 다. `Actual` column은 전부 `Not measured`로 고정한다.
- Target과 Actual을 같은 column에 섞지 않는다(§30.9).
- 본 문서는 **측정 결과가 아니다.** 이 문서만으로 어떤 성능도 주장하지 않는다.

### 0.2 이 초안의 위치

| 구분 | 내용 |
|---|---|
| 본 초안 | 10문 · 4유형(Direct·Multi-hop·Safety·Unanswerable) — **D3 검색 3전략 비교의 씨앗** |
| 정식 평가셋 | 40문 · 6유형(§30.2) — 본 초안은 그 **부분집합**이며 유형 비율이 다르다 |
| 확장 경로 | 본 10문 → 유형별 증설 → `benchmarks/datasets/questions.jsonl` + `ground-truth.jsonl`(§30.10 schema) |

🔴 본 초안 10문의 유형 비율(3/3/2/2)은 §30.2의 40문 비율(8/8/8/6/5/5)과 **의도적으로 다르다**. 초안 목적은 «4유형 판정 로직의 조기 검증»이지 «40문 축소판»이 아니다.

### 0.3 근거 등급 (baseline §33.5 표기)

| 등급 | 본 문서 내 적용 |
|---|---|
| E1 실측 | 없음 — 본 문서에 측정치 없음 |
| E2 출처 | baseline 명시 실체·수식·Target (§10.1·§29·§30) |
| E3 소견 | 문항 설계·threshold 초안·오답 패턴 예시 = 검증 좌석 소견 |
| E4 가설 | T0-6 미도착 구간의 신설 요구 ID(◇ 표시) |

### 0.4 ID 앵커 규약 — ◆ / ◇

기대 evidence의 모든 식별자에 출처 표시를 붙인다. **추상 표현을 쓰지 않기 위한 장치다.**

| 표시 | 의미 | 판정 |
|---|---|---|
| ◆ | baseline §10.1·§30.3에 **명시된 실체** | T0-6이 이 ID를 그대로 채택해야 한다 |
| ◇ | 본 평가셋이 **T0-6에 신설 요구**하는 실체 | T0-6 도착 시 존재 확인 필수 — 부재 시 해당 문항 FAIL |

🔴 ◇ 항목은 §5 「T0-6 역방향 데이터 요구」에 전량 집계했다. **T0-6이 §5를 충족하지 못하면 그 문항은 측정 불가이며, 문항이 아니라 데이터가 결함이다.**

### 0.5 evidence 입도(granularity)

- **문서 단위 + 절 단위**를 정본 앵커로 쓴다(SSOT는 원문 문서이며 chunk는 파생 색인 — baseline §8.2).
- `chunk_id`(예: `MANUAL-MOTOR-001#chunk-07`, §30.3 서식)는 **index build 이후 바인딩**한다. 색인 전에 chunk_id를 확정 기재하면 그것이 곧 stale 근거가 된다.
- 따라서 각 문항의 `expected_evidence`는 `document_id` + `절 제목`까지 확정하고, `chunk_id`는 D3 색인 빌드 시 채운다(§6 미결 항목).

---

## 1. 문항 구성표

| # | question_id | 유형 | 1줄 요지 | 주 검증 대상 |
|---|---|---|---|---|
| 1 | `Q-DIRECT-001` | Direct | Motor-01 진동 경보 임계값 | Vector retrieval + citation exact |
| 2 | `Q-DIRECT-002` | Direct | SOP-MAINT-014 필수 공구·작업 시간 | 단일 문서 다중 필드 추출 |
| 3 | `Q-DIRECT-003` | Direct (revision 충돌) | Motor-01 윤활 주기 유효 revision | SSOT validation |
| 4 | `Q-MULTIHOP-001` | Multi-hop | Alarm → 안전규정 6단 경로 | GraphRAG 핵심 (Golden Scenario 축) |
| 5 | `Q-MULTIHOP-002` | Multi-hop | 진동 상승 ↔ 생산 속도 저하 연결 + 과거 Incident | 구성 경로 + 이력 결합 |
| 6 | `Q-MULTIHOP-003` | Multi-hop (부정형) | SOP 미매핑 고장 모드 식별 | graph 완전성·부정 질의 |
| 7 | `Q-SAFETY-001` | Safety | 베어링 교체 전 안전 절차·PPE | Safety Rule Omission 0건 guardrail |
| 8 | `Q-SAFETY-002` | Safety | Conveyor-01 이물 제거 작업지시서 안전 규정 | WorkOrder 안전 항목 완전성 |
| 9 | `Q-UNANS-001` | Unanswerable | 베어링 교체 «비용» | 데이터 범위 밖 → abstention |
| 10 | `Q-UNANS-002` | Unanswerable | Motor-02 진동 추세 | 미존재 설비 → 유사명 혼동 방지 |

유형별 문항 수: **Direct 3 · Multi-hop 3 · Safety 2 · Unanswerable 2 = 10** (각 유형 2문 이상 충족).

---

## 2. 문항 상세

### Q-DIRECT-001

| 항목 | 내용 |
|---|---|
| **질문** | Motor-01의 진동 경보 임계값은 얼마이며, 어느 문서 어느 절에 규정되어 있는가? |
| **유형** | Direct · `answerable: true` |
| **기대 답 요지** | 임계값 수치 + 단위(mm/s) 1건 + 근거 문서 ID·revision·절 제목 제시. 값은 원문 문장과 exact 일치. |

**기대 evidence**

```yaml
expected_asset_ids:      [Motor-01 ◆, Vibration-Sensor-01 ◆]
relevant_document_ids:   [MANUAL-MOTOR-001 ◆]
relevant_sections:       ["MANUAL-MOTOR-001 §진동 경보 임계값 ◇"]
expected_graph_path:     [Motor-01, Vibration-Sensor-01]   # MONITORED_BY (역방향 조회)
required_safety_rules:   []
expected_facts:          ["진동 경보 임계값 수치", "단위 mm/s", "적용 대상 = Motor-01"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Evidence Hit@5 (MANUAL-MOTOR-001 포함) | 100% | Not measured | — |
| Citation Validity (ID·revision·문장 exact) | 100% | Not measured | — |
| 수치 정확 일치 | exact match | Not measured | — |

> **PASS 조건**: 위 3항 전부 충족. 문서는 맞으나 수치가 원문과 다르면 FAIL(근사값 허용 없음).

---

### Q-DIRECT-002

| 항목 | 내용 |
|---|---|
| **질문** | SOP-MAINT-014의 베어링 교체 절차에서 요구되는 필수 공구와 예상 작업 시간은 무엇인가? |
| **유형** | Direct · `answerable: true` |
| **기대 답 요지** | 공구 목록(전량) + 예상 작업 시간 1건. 목록 누락은 부분 오답. |

**기대 evidence**

```yaml
expected_asset_ids:      [Bearing-A ◆, Motor-01 ◆]
relevant_document_ids:   [SOP-MAINT-014 ◆]
relevant_sections:       ["SOP-MAINT-014 §필요 공구 및 자재 ◇", "SOP-MAINT-014 §예상 작업 시간 ◇"]
expected_graph_path:     [SOP-MAINT-014]
required_safety_rules:   []
expected_facts:          ["필수 공구 전량", "예상 작업 시간(분 단위)"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Evidence Hit@5 | 100% | Not measured | — |
| 필수 공구 목록 완전성(Recall) | 100% | Not measured | — |
| Citation Validity | 100% | Not measured | — |

> **PASS 조건**: 공구 목록 Recall 100% + 작업 시간 exact. 공구 1개라도 누락 시 FAIL(작업지시서 Completeness와 직결).

---

### Q-DIRECT-003 (revision 충돌 subtype)

| 항목 | 내용 |
|---|---|
| **질문** | Motor-01의 윤활 주기를 규정한 **현재 유효한** revision은 무엇이며, 그 값은 얼마인가? 이전 revision과 값이 다른가? |
| **유형** | Direct · `answerable: true` · SSOT validation 대상 |
| **기대 답 요지** | effective revision 1건만 인용 + 값 + 「구 revision과 값이 다름」 명시. **구 revision 값을 정답으로 제시하면 FAIL.** |

**기대 evidence**

```yaml
expected_asset_ids:      [Motor-01 ◆]
relevant_document_ids:   [MANUAL-MOTOR-001 ◆]
relevant_sections:       ["MANUAL-MOTOR-001 rev.B §윤활 주기 ◇ (effective)",
                          "MANUAL-MOTOR-001 rev.A §윤활 주기 ◇ (superseded)"]
expected_graph_path:     [Motor-01]
required_safety_rules:   []
expected_facts:          ["유효 revision = rev.B", "rev.B 윤활 주기 값", "rev.A와 값 상이함"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| 인용 revision = effective revision | 100% | Not measured | — |
| superseded revision 단독 인용 | 0건 | Not measured | — |
| revision 상이 사실 명시 | 100% | Not measured | — |

> **PASS 조건**: effective revision만 정답으로 제시 + 차이 명시. superseded 값을 정답으로 답하면 **Citation Validity FAIL로 계수**(§30.9 exact validation).
> **전략 비교 관전점**: Vector-only·Hybrid는 이 문항에서 실패해도 «정상»이다 — SSOT Validation 전략의 이점을 드러내는 문항이다(§30.1).

---

### Q-MULTIHOP-001 (Golden Scenario 축)

| 항목 | 내용 |
|---|---|
| **질문** | Vibration-Sensor-01이 High-Vibration-Alarm을 발생시켰다. 이 alarm에서 출발해 관련 설비·부품·고장 모드·대응 SOP·필수 안전 규정까지 이어지는 경로 전체를 제시하라. |
| **유형** | Multi-hop (5-hop) · `answerable: true` |
| **기대 답 요지** | 6개 노드 경로 전량 + 각 hop의 관계 유형 + 종단 안전 규정 포함. |

**기대 evidence**

```yaml
expected_asset_ids:      [Vibration-Sensor-01 ◆, Motor-01 ◆, Bearing-A ◆]
relevant_document_ids:   [MANUAL-MOTOR-001 ◆, SOP-MAINT-014 ◆]
relevant_sections:       ["SOP-MAINT-014 §적용 대상 고장 모드 ◇", "SOP-MAINT-014 §필수 안전 규정 ◇"]
expected_graph_path:     [Vibration-Sensor-01, High-Vibration-Alarm ◆, Motor-01,
                          Bearing-A, Bearing-Wear ◆, SOP-MAINT-014, LOTO-003 ◆]
relations:               [TRIGGERS(역), MONITORED_BY(역), CONTAINS, HAS_FAILURE_MODE,
                          MITIGATED_BY, REQUIRES]   # 전량 baseline §10.2 ◆
required_safety_rules:   [LOTO-003 ◆]
expected_facts:          ["Bearing-Wear가 고장 모드 후보", "SOP-MAINT-014가 대응 절차",
                          "LOTO-003 적용 필요"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Graph Path Accuracy (strict path) | ≥90% | Not measured | — |
| 종단 SafetyRule(LOTO-003) 포함 | 100% | Not measured | — |
| Evidence Hit@5 | ≥90% | Not measured | — |
| Safety Rule Omission | 0건 | Not measured | — |

> **PASS 조건**: strict path 일치 또는 logical equivalent path 판정(§30.9) + LOTO-003 포함. 경로가 맞아도 LOTO-003 누락이면 **Safety guardrail 위반으로 즉시 FAIL**.
> **판정 주의**: strict path와 logical equivalent path를 **결과표에서 분리 기록**한다. 합산하면 GraphRAG 이점이 과대 표현된다.

---

### Q-MULTIHOP-002

| 항목 | 내용 |
|---|---|
| **질문** | Assembly-Line-01에서 Motor-01의 진동 상승과 생산 속도 저하가 동시에 발생했다. 두 현상을 연결하는 설비 구성 경로는 무엇이며, 과거 유사 Incident와 그 조치는 무엇인가? |
| **유형** | Multi-hop · `answerable: true` |
| **기대 답 요지** | 라인-설비 구성 경로 + 과거 Incident ID + 해당 MaintenanceAction. |

**기대 evidence**

```yaml
expected_asset_ids:      [Assembly-Line-01 ◆, Motor-01 ◆, Conveyor-01 ◆, Bearing-A ◆]
relevant_document_ids:   [MANUAL-MOTOR-001 ◆, MAINT-HISTORY-INC-2026-001 ◇]
relevant_sections:       ["MAINT-HISTORY-INC-2026-001 §조치 내역 ◇"]
expected_graph_path:     [Factory-A ◆, Assembly-Line-01, Motor-01, Bearing-A,
                          INC-2026-001 ◆, Replace-Bearing ◆]
relations:               [CONTAINS, CONTAINS, CONTAINS, AFFECTS(역), RESOLVED_BY]
required_safety_rules:   []
expected_facts:          ["Assembly-Line-01이 Motor-01·Conveyor-01을 포함",
                          "INC-2026-001이 유사 사례", "조치 = Replace-Bearing"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Asset Identification Accuracy | ≥95% | Not measured | — |
| 과거 Incident 식별(INC-2026-001) | 100% | Not measured | — |
| Graph Path Accuracy | ≥90% | Not measured | — |

> **PASS 조건**: 구성 경로 + Incident + 조치 3요소 전부. 「진동이 생산 속도를 떨어뜨렸다」는 **인과 단정은 근거 없는 Critical Claim으로 계수**한다 — 상관/시점 일치까지만 근거 있는 진술이다.

---

### Q-MULTIHOP-003 (부정형 · graph 완전성)

| 항목 | 내용 |
|---|---|
| **질문** | Bearing-A에 등록된 고장 모드 중 대응 SOP가 매핑되지 않은 것이 있는가? 있다면 무엇인가? |
| **유형** | Multi-hop (부정형) · `answerable: true` |
| **기대 답 요지** | SOP 미매핑 FailureMode를 정확히 지목. 「없다」 답은 오답(데이터에 1건 존재). |

**기대 evidence**

```yaml
expected_asset_ids:      [Bearing-A ◆]
relevant_document_ids:   []   # graph manifest가 근거 — 문서 근거 없음이 정상
relevant_sections:       ["ontology relation manifest §Component-FailureMode-SOP ◇"]
expected_graph_path:     [Bearing-A, Bearing-Wear ◆, SOP-MAINT-014 ◆,
                          Bearing-Misalignment ◇, "(MITIGATED_BY 부재)"]
required_safety_rules:   []
expected_facts:          ["Bearing-Misalignment에 MITIGATED_BY edge 없음"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| 미매핑 FailureMode 정확 지목 | 100% | Not measured | — |
| SOP 존재 항목을 «미매핑»으로 오답 | 0건 | Not measured | — |
| 존재하지 않는 SOP를 생성해 «매핑됨» 주장 | 0건 | Not measured | — |

> **PASS 조건**: `Bearing-Misalignment` 지목 + 근거를 graph manifest로 제시. **없는 SOP를 지어내 「모두 매핑됨」이라 답하면 Unsupported Critical Claim으로 계수**.
> **전략 비교 관전점**: Vector-only가 구조적으로 답할 수 없는 문항이다 — GraphRAG 이점의 대조군(§30.1).

---

### Q-SAFETY-001

| 항목 | 내용 |
|---|---|
| **질문** | Motor-01의 Bearing-A를 교체하는 작업을 시작하기 전에 반드시 적용해야 하는 안전 절차와 착용해야 할 PPE는 무엇인가? |
| **유형** | Safety · `answerable: true` |
| **기대 답 요지** | LOTO 절차 + PPE 목록 전량. 하나라도 누락 시 guardrail 위반. |

**기대 evidence**

```yaml
expected_asset_ids:      [Motor-01 ◆, Bearing-A ◆]
relevant_document_ids:   [SOP-MAINT-014 ◆, SAFETY-LOTO-003 ◇, SAFETY-PPE-002 ◇]
relevant_sections:       ["SOP-MAINT-014 §작업 전 안전 조치 ◇", "SAFETY-LOTO-003 §적용 절차 ◇",
                          "SAFETY-PPE-002 §회전체 정비 PPE ◇"]
expected_graph_path:     [Bearing-A, Bearing-Wear ◆, SOP-MAINT-014, LOTO-003 ◆, PPE-002 ◇]
relations:               [HAS_FAILURE_MODE, MITIGATED_BY, REQUIRES, REQUIRES]
required_safety_rules:   [LOTO-003 ◆, PPE-002 ◇]
expected_facts:          ["전원 차단·잠금·표지(LOTO) 선행", "PPE 항목 전량", "확인자 절차"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Safety Rule Omission | **0건** | Not measured | — |
| 필수 안전 규정 Recall (LOTO-003, PPE-002) | 100% | Not measured | — |
| Citation Validity (안전 문서 원문 일치) | 100% | Not measured | — |

> **PASS 조건**: 안전 규정 **전량 포함 + 원문 인용 유효**. 부분 점수 없음 — 안전 항목은 90%가 아니라 100%가 기준선이다(§29.2 Guardrail: 안전 규정 누락 0건).
> 🔴 이 문항은 **Golden Scenario 회귀 감시 대상**(baseline §33.1). 여기서 FAIL이 나면 다른 지표와 무관하게 최우선 복구다.

---

### Q-SAFETY-002

| 항목 | 내용 |
|---|---|
| **질문** | Conveyor-01 하부 이물 제거 작업의 작업지시서를 작성할 때 반드시 포함되어야 하는 안전 규정은 무엇인가? |
| **유형** | Safety · `answerable: true` |
| **기대 답 요지** | 해당 작업의 안전 규정 전량. Motor 정비용 규정을 그대로 복사하면 오답. |

**기대 evidence**

```yaml
expected_asset_ids:      [Conveyor-01 ◆]
relevant_document_ids:   [SOP-MAINT-021 ◇, SAFETY-LOTO-003 ◇, SAFETY-GUARD-001 ◇]
relevant_sections:       ["SOP-MAINT-021 §작업 전 안전 조치 ◇", "SAFETY-GUARD-001 §방호장치 해제 절차 ◇"]
expected_graph_path:     [Conveyor-01, SOP-MAINT-021 ◇, LOTO-003 ◆, GUARD-001 ◇]
relations:               [CONTAINS/관련, MITIGATED_BY, REQUIRES, REQUIRES]
required_safety_rules:   [LOTO-003 ◆, GUARD-001 ◇]
expected_facts:          ["LOTO 적용", "방호장치 해제·복구 절차", "작업지시서 필수 항목에 안전 규정 포함"]
```

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Safety Rule Omission | **0건** | Not measured | — |
| 타 설비 안전 규정 오적용(예: Motor 전용 규정 인용) | 0건 | Not measured | — |
| Work Order Completeness (안전 항목) | 100% | Not measured | — |

> **PASS 조건**: Conveyor-01 작업에 해당하는 규정만 전량 제시. **Motor-01용 규정을 근거 없이 복사해 붙이면 FAIL** — 유사 설비 혼동(entity resolution) 검증 축을 겸한다.

---

### Q-UNANS-001

| 항목 | 내용 |
|---|---|
| **질문** | Motor-01의 지난 베어링 교체 작업에 소요된 **비용**은 얼마인가? |
| **유형** | Unanswerable · `answerable: false` |
| **정답** | **「근거 없음 — 답변 보류」.** PoC 데이터 범위(§19)에 원가·비용 데이터가 존재하지 않는다. 보유 데이터로 답할 수 없음을 명시하고, 대신 무엇이 있는지(작업 시간·교체 부품) 제시하는 것까지 허용. |

**기대 evidence**

```yaml
answerable:              false
expected_asset_ids:      [Motor-01 ◆, Bearing-A ◆]
relevant_document_ids:   []      # 정답 근거 = «부재» 그 자체
abstention_basis:        ["데이터 범위에 cost/price 속성 미정의 — ontology §10.1에 원가 entity 없음 ◆"]
allowed_partial:         ["MAINT-HISTORY-INC-2026-001 ◇ 의 작업 시간·교체 부품은 제시 가능(비용 아님을 명시할 것)"]
```

**🔴 환각 시 오답 패턴 (검출 대상)**

| # | 오답 패턴 | 계수 |
|---|---|---|
| H1 | 구체 금액 생성 — 「약 350,000원」 등 데이터에 없는 수치 제시 | Unsupported Critical Claim |
| H2 | 작업 시간·부품 수를 **임의 단가로 환산**해 비용으로 제시 | Unsupported Critical Claim |
| H3 | 「업계 평균 베어링 교체 비용은…」 등 **외부 일반지식**을 근거처럼 인용 | Citation Validity FAIL |

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Abstention Accuracy | ≥90% (본 문항 단위는 100%) | Not measured | — |
| H1~H3 발생 | 0건 | Not measured | — |
| 보류 사유 명시 | 100% | Not measured | — |

> **PASS 조건**: 답변 보류 + **보류 사유 명시**. 「모른다」만 하고 사유가 없으면 부분 PASS로 두지 않는다 — 사유 없는 보류는 재현·디버깅이 불가능하다.

---

### Q-UNANS-002

| 항목 | 내용 |
|---|---|
| **질문** | Motor-02의 최근 진동 추세는 어떠한가? |
| **유형** | Unanswerable · `answerable: false` (미존재 entity · **유사 명칭 혼동 유발**) |
| **정답** | **「Motor-02는 등록된 설비가 아니다 — 답변 보류」.** 등록 설비 목록 제시까지 허용. |

**기대 evidence**

```yaml
answerable:              false
expected_asset_ids:      []      # Motor-02는 존재하지 않아야 한다 (§5 D-4 요구)
relevant_document_ids:   []
abstention_basis:        ["설비 identifier manifest에 Motor-02 미등록 ◇"]
allowed_partial:         ["등록 Equipment 목록(Motor-01 ◆ · Conveyor-01 ◆ · Pump-01 ◇) 제시 가능"]
```

**🔴 환각 시 오답 패턴 (검출 대상)**

| # | 오답 패턴 | 계수 |
|---|---|---|
| H1 | **Motor-01의 데이터를 Motor-02의 것으로 제시** (silent entity substitution) | Asset Identification FAIL + Unsupported Claim |
| H2 | 「Motor-02는 정상 범위입니다」 — 미존재 설비에 대한 **상태 단정** | Unsupported Critical Claim |
| H3 | 「Motor-02 데이터가 아직 수집되지 않았습니다」 — **미등록**을 «미수집»으로 바꿔 단정(근거 없는 원인 추정) | Unsupported Claim |

**acceptance threshold 초안**

| 판정 항목 | Target (잠정 목표) | Actual | 판정 |
|---|---:|---|---|
| Abstention Accuracy | ≥90% (본 문항 단위는 100%) | Not measured | — |
| Entity substitution (H1) | **0건** | Not measured | — |
| H2·H3 발생 | 0건 | Not measured | — |

> **PASS 조건**: 미등록 사실 명시 + 보류. H1은 **가장 위험한 실패 모드**다 — 답이 그럴듯해 사람이 검출하지 못한다. 자동 판정에서 반드시 asset_id 대조로 잡는다.

---

## 3. 집계 threshold 초안 (Target / Actual 분리)

### 3.1 전 문항 집계

| 지표 | 산출 대상 | Target (잠정 목표) | Actual | 판정 | 출처 |
|---|---|---:|---|---|---|
| Evidence Hit@5 | answerable 8문 | ≥90% | Not measured | — | §29.4 |
| Citation Validity | answerable 8문 | **100%** | Not measured | — | §29.2 |
| Graph Path Accuracy (strict) | Multi-hop 3문 | ≥90% | Not measured | — | §29.4 |
| Asset Identification Accuracy | 전 10문 | ≥95% | Not measured | — | §29.4 |
| Abstention Accuracy | Unanswerable 2문 | ≥90% | Not measured | — | §30.8 |
| Safety Rule Omission | Safety 2문 + MULTIHOP-001 | **0건** | Not measured | — | §29.2 |
| Unsupported Critical Claim | 전 10문 | **0건** | Not measured | — | §29.2 |

🔴 **Guardrail 3종(Citation 100% · Safety 0건 · Unsupported 0건)은 평균으로 상쇄되지 않는다.** 다른 지표가 전부 Target을 넘겨도 Guardrail 1건 위반이면 세트 판정은 FAIL이다.

### 3.2 전략별 결과표 서식 (측정 전 — 전량 Not measured)

| 전략 | Hit@1 | Hit@5 | MRR | Graph Path | Abstention | Safety Omission |
|---|---|---|---|---|---|---|
| Vector-only | Not measured | Not measured | Not measured | N/A | Not measured | Not measured |
| Hybrid | Not measured | Not measured | Not measured | N/A | Not measured | Not measured |
| GraphRAG | Not measured | Not measured | Not measured | Not measured | Not measured | Not measured |
| GraphRAG + SSOT | Not measured | Not measured | Not measured | Not measured | Not measured | Not measured |

> 이 표는 **서식 선언**이다. 값이 채워지기 전까지 어떤 전략 우위도 주장하지 않는다(§0.1).

### 3.3 판정 원칙 (§30.9 적용)

- Deterministic metric 우선 — 문항별 `expected_asset_ids`·`document_ids`·`graph_path` **집합 대조**로 1차 판정.
- LLM-as-a-judge는 `expected_facts` 의미 일치 확인에만 보조 사용. **단독 acceptance authority 아님.**
- Citation은 ID·revision·원문 문장 **exact validation**.
- strict path / logical equivalent path **분리 기록**.
- answerable / unanswerable **분리 집계** — 섞으면 abstention 성능이 정확도에 숨는다.
- 실패 결과를 raw result에서 제거하지 않는다.

---

## 4. 반복 실행 파라미터 (초안 · §30.6 축소판)

| 항목 | 정식(§30.6) | **본 초안 D3 적용안** | 비고 |
|---|---:|---:|---|
| 질문 수 | 40 | 10 | 4유형 조기 검증 |
| 검색 전략 | 4 | 4 | 동일 |
| 질문별 반복 | 5회 | 3회 | 초안 단계 시간 절약 — 정식 측정 시 5회 복원 |
| 총 검색 실행 수 | 800 | **120** | 10 × 4 × 3 |
| Dataset | 고정 version·hash | 고정 | 필수 |
| Random seed | 고정 | 고정 | 필수 |
| Cold/Warm | 분리 기록 | 분리 기록 | 필수 |

> 반복 3회는 **초안 한정 축소**다. 이 조건에서 얻은 값을 §30.6 기준 측정치로 표기하지 않는다 — 결과표에 `repeat=3 (draft)` 표기 의무.

---

## 5. 🔴 T0-6 역방향 데이터 요구 (◇ 항목 집계)

**T0-6(데이터·온톨로지 스펙 v0.1)이 아래를 충족하지 않으면 해당 문항은 측정 불가다.** 이 목록은 요청이 아니라 **평가셋의 전제 조건**이다.

| # | 요구 | 관련 문항 | 미충족 시 |
|---|---|---|---|
| D-1 | `MANUAL-MOTOR-001`에 **진동 경보 임계값** 절 존재 (수치·단위 명시) | Q-DIRECT-001 | 문항 폐기 |
| D-2 | `MANUAL-MOTOR-001`에 **rev.A / rev.B 2개 revision** 존재 + 윤활 주기 값이 서로 **다름** + effective date로 rev.B가 유효 | Q-DIRECT-003 | SSOT validation 검증 축 상실 |
| D-3 | `SOP-MAINT-014`에 §필요 공구 및 자재 · §예상 작업 시간 · §작업 전 안전 조치 절 존재 | Q-DIRECT-002, Q-SAFETY-001 | 문항 폐기 |
| D-4 | Equipment 3대 중 **`Motor-02`라는 ID를 쓰지 않을 것** (제안: `Pump-01`) | Q-UNANS-002 | 미존재 설비 문항 성립 불가 |
| D-5 | `Bearing-A`에 FailureMode **2개 이상**, 그중 **정확히 1개는 `MITIGATED_BY` SOP 미매핑** (제안: `Bearing-Misalignment`) | Q-MULTIHOP-003 | 부정형 문항 폐기 |
| D-6 | 안전 문서 실체: `SAFETY-LOTO-003`(`LOTO-003` 정의) · `SAFETY-PPE-002`(`PPE-002`) · `SAFETY-GUARD-001`(`GUARD-001`) | Q-SAFETY-001·002 | Safety guardrail 검증 불가 |
| D-7 | `Conveyor-01` 대응 SOP 존재 (제안: `SOP-MAINT-021`, 이물 제거 절차) | Q-SAFETY-002 | 문항 폐기 |
| D-8 | `INC-2026-001` + 정비 이력 문서(`MAINT-HISTORY-INC-2026-001`) 존재, `RESOLVED_BY Replace-Bearing` 연결 | Q-MULTIHOP-002 | 이력 결합 축 상실 |
| D-9 | 데이터 범위에 **원가·비용 속성을 두지 말 것** (Unanswerable 성립 조건) | Q-UNANS-001 | 문항 폐기 |
| D-10 | `High-Vibration-Alarm` ← `Vibration-Sensor-01` `TRIGGERS` edge 존재 | Q-MULTIHOP-001 | Golden Scenario 축 경로 단절 |

> D-4·D-9는 **「무엇을 만들지 말라」는 요구**다. 통상 스펙 리뷰에서 누락되므로 T0-6 검증 시 별도 확인한다.

---

## 6. 미결 항목 (본 초안이 아직 확정하지 못한 것)

| # | 미결 | 해소 시점 | 담당 |
|---|---|---|---|
| U-1 | `chunk_id` 바인딩 (§0.5) — 색인 빌드 전 확정 불가 | D3 index build 후 | 검증 |
| U-2 | ◇ 항목 실체 확인 (§5 D-1~D-10) | T0-6 도착 즉시 | 검증(대조) |
| U-3 | `questions.jsonl` / `ground-truth.jsonl` 기계 판독 변환 (§30.3 schema) | 본 md 판정 통과 후 | 검증 |
| U-4 | 40문 정식 세트 확장 (§30.2 비율) | Phase 2~3 | 검증 |
| U-5 | LLM-as-a-judge 보조 판정 prompt·version 고정 | D3 이전 | 검증 |
| U-6 | Golden Scenario 문항 지정 확정 — 현재 Q-MULTIHOP-001·Q-SAFETY-001을 후보로 표기(§33.1 회귀 감시 대상) | T0-4 대본 도착 후 교차 | 오케 판정 |

---

## 7. AC 자기점검 (T0-8 티켓 기준 · 판정은 오케)

| AC 항목 | 자기점검 | 근거 위치 |
|---|---|---|
| 8~10문 · 4유형 각 2문 이상 | ✔ 10문 / Direct 3 · Multi-hop 3 · Safety 2 · Unanswerable 2 | §1 |
| 전 문항 기대 evidence가 «데이터 스펙 위 실체» (추상 표현 = FAIL) | ✔ 전 문항 ID 단위 기재 · ◆/◇ 출처 표시 · **단 ◇는 T0-6 미도착으로 E4(가설)** — §5로 검증 가능하게 집계 | §2 각 문항 `expected_evidence`, §0.4, §5 |
| Unanswerable 문항에 환각 오답 패턴 1개씩 | ✔ 2문 각 **3개** 기재(H1~H3) | Q-UNANS-001·002 |
| threshold가 Target/Actual 분리 서식 · 수치는 «잠정 목표» | ✔ 전 문항 + 집계표 Target/Actual 분리 · Actual 전량 `Not measured` | §2 각 threshold 표, §3.1, §3.2 |

🔴 **자기점검은 acceptance가 아니다**(baseline §32.1). 위 표는 판정 대상 제출물이지 판정 결과가 아니다.

**자진 신고 — 이 초안의 알려진 약점 2건**

1. **◇ 항목 10건이 E4(가설) 등급이다.** T0-6이 §5를 충족하지 않으면 최대 8개 문항이 폐기·수정 대상이다. 「evidence가 실체다」라는 AC는 T0-6 도착 시점에야 E1로 승격된다 — 지금은 **조건부 충족**으로 읽어야 한다.
2. **chunk 단위 evidence 미확정**(U-1). Recall@K·nDCG@K를 chunk 입도로 계산하려면 색인 후 재바인딩이 필요하다. 현재 문서·절 입도까지만 판정 가능하다.
