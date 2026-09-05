# 평가 계획 v0.3 — 40문 확정안 (T5-1 ① · 리바이2 49대)

- **정본** baseline §18.2(지표 9종) · §18.3(40문 · 재현 메타 4종) · §30.4(SSOT 층 대조)
- **산출 3종** `questions.v0.3.jsonl`(40) · `ground-truth.v0.3.jsonl`(40) · 이 파일 · 앵커 출처 = `t51-source-candidates.md`
- 🔴 **이 문서는 «계획»이다. 실행(②)은 폐하 재가 뒤 별 티켓**이며 여기에 `Actual` 을 적지 않는다.
- 🔴 **LLM judge = 0.** 아래 9지표 전부 **결정적 산식**이다. 「모델이 채점한다」를 이 계획에 넣지 않는다.

## 1. 유형별 배분 (폐하 재가 대상)

| 유형 | 문항 | 승계(v0.2) | 신규 | 이 유형이 잡는 실패 |
|---|---:|---:|---:|---|
| 골든 hard | **6** | 2 | 4 | 임계·관측값·경로 깊이를 지어냄 |
| 유사 명칭 설비 구분 | **6** | 0 | 6 | 이웃 번호/다른 종류의 답을 끌어옴 |
| multi-hop | **8** | 3 | 5 | 사슬을 중간에서 끊거나 한 단계로 합침 |
| 문서 revision 충돌 | **5** | 1 | 4 | 낡은 판을 현행처럼 인용 |
| 근거 부족 → 보류 | **7** | 2 | 5 | 없는 것을 만들어 답함 |
| 안전 규정 필수 | **8** | 2 | 6 | 필수 규정 누락 |
| **합계** | **40** | **10** | **30** | |

## 2. 채점 — 결정적 9지표 (§18.2)

| # | 지표 | 산식 | 입력 필드 |
|---|---|---|---|
| 1 | Asset Identification Accuracy | (정답 설비·부품 id 를 «모두» 맞힌 문항 수) / (해당 문항 수) | 답변 본문에서 추출한 id 집합 ↔ `ground-truth.must_include` 의 설비·부품 id |
| 2 | Evidence Recall@K | (정답 근거가 상위 K 검색 결과에 든 문항 수) / (근거 있는 문항 수) · **K 는 실행 시 인자로 선언** | `/api/retrieval/compare` 각 전략의 `hits[].evidenceId` ↔ `ground-truth.required_evidence` |
| 3 | SOP Retrieval Accuracy | (정답 SOP id 를 집은 문항 수) / (SOP 를 요구한 문항 수) | 위와 같은 hits ↔ `required_evidence` 중 `SOP-*` |
| 4 | Graph Path Correctness | (제시 경로의 «간선»이 Ontology 표에 실재하는 비율) | 답변 경로 ↔ `component_failure_mode`·`failure_mode_sop`·`sop_safety_rule` |
| 5 | Unsupported Claim Count | 답변 문장 중 **인용 근거가 붙지 않은 사실 주장 수**(합계 · 낮을수록 좋다) | 답변 문장 ↔ 인용 목록 |
| 6 | Safety Rule Omission | Σ(`required_safety_rules` − 답변이 실제로 말한 규정) | `ground-truth.required_safety_rules` |
| 7 | Citation Validity | (인용한 `docId@rev#chunk` 가 원문과 일치하는 비율) | 인용 문자열 ↔ `document_revision`·`document_chunk` 실물 |
| 8 | Response Latency | 전체 및 node 별 ms — **중앙값과 표본 전부**를 적는다(평균만 적지 않는다) | run 이벤트 타임스탬프 |
| 9 | Work Order Completeness | (필수 점검·안전·부품 항목 중 포함된 비율) | `WO-2026-0113` 축 문항 |

**보류 문항의 채점** — 위 9지표와 **별 축**이다:

| 축 | 산식 |
|---|---|
| Hold Precision | (보류해야 할 문항 중 실제로 보류한 수) / 7 |
| False Answer Count | 보류 문항에서 **`must_not_invent` 항목을 말한 수**(0 이 목표) |
| Cross-consistency | `Q-MULTIHOP-003` ↔ `Q-UNANS-005` 가 **같은 사실의 앞뒤**다 — 두 답이 모순이면 그 자체로 실패 1 |

## 3. 실행 절차 (②에서 집행 · cap 0 · 합성 0)

1. **전략 4열** — `vector` · `hybrid` · `graphrag` + **SSOT 층**(§30.4 대조). 앞 셋은 `POST /api/retrieval/compare` 1회로 함께 나온다.
   🔴 **cap 0 이므로 조사 run 을 태우지 않는다** — compare/retrieval 만 쓴다. 답변 «생성»이 필요한 지표(1·5·6·9)는
   **재가 뒤 별 티켓**으로 분리하고, 이번 실행에서는 **검색 축(2·3·4·7)만** 낸다. 못 재는 축은 **이름으로** 남긴다.
2. **질문은 allowlist 를 통과해야 한다** — `app/retrieval/service.py:70` 이 목록 밖을 **400** 으로 거절한다.
   ⇒ 40문을 실행하려면 **allowlist 등재가 선행**이다(구현 좌석 몫 · 이 계획의 선행 조건으로 명시).
3. 문항마다 4열의 `hits[].evidenceId` 를 기록하고 `ground-truth.required_evidence` 와 대조한다.
4. `binding: "pending"` 문항은 **실행 전에** `source_query` 를 돌려 `must_include` 를 확정한다.
   🔴 **확정 없이 실행하면 「기대값이 비어 있어서 통과」가 된다** — 빈 집합과의 비교는 판정이 아니다.

## 4. 재현 메타 4종 — **어디에 적는가**

| 메타 | 값의 출처 | 기록 위치 |
|---|---|---|
| dataset version | 이 3종 파일의 git sha | 실행 산출물 머리말 |
| source hash | 시드 데이터 해시(`v_ssot_manifest` 조회) | 〃 |
| model·embedding version | `/api/health` 의 `models.embedding.detail`(실측: `intfloat/multilingual-e5-small`) | 〃 |
| retrieval parameter | 요청 본문의 `strategies` · K · 그 밖의 인자 | 〃 |

🔴 **네 값을 «측정 시각»과 함께** 적는다. 뒤에 무대가 바뀌면 그 값이 이 실행을 다른 실행과 갈라 준다.

## 5. 알려진 한계 (실행 전에 이미 참인 것 — 이름으로)

- **「런 전체 근거 0」은 현 구현에서 도달 불가**(vector·hybrid 무임계 · 색인을 비우면 503 이 먼저다 · X-23).
  ⇒ 보류 7문의 기대는 **「전략 단위 근거 0 → 모른다」**이고, 각 문항 메타에 그 사실이 적혀 있다.
- **답변 생성 축(1·5·6·9)은 cap 0 에서 못 잰다** — 위 §3-1 대로 분리한다.
- `binding: "pending"` **7문**(`Q-SIM-005` · `Q-MULTIHOP-004~007` · `Q-SAFETY-004` · `Q-SAFETY-005`)은
  기대값이 아직 비어 있다. **채우기 전에는 그 문항의 초록을 세지 마라.**
- 승계 문항 `Q-UNANS-002` 는 **없는 id**(`EQ-CNC-999`)를 쓴다 — v0.2 승계라 id 를 유지하되,
  **신규 문항은 그 방식을 쓰지 않는다**(실재 id 의 «부재하는 사실»로 만든다).
