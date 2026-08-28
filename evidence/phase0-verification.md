---
artifact: phase0-verification
ticket: T0-9
owner: 검증(리바이2)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-28
verification_base: develop `2ff5525` (PR #6 merge · 재실측 완료)
size_limit: 20KB
---

# Phase 0 독립 검증 — T0-1~T0-8

> baseline §32.1: **구현 완료 보고 ≠ acceptance.** 본 문서는 티켓 AC와 산출물 실물을 대조한 **독립 판정의 근거**다. 판정 자체는 오케가 내린다.

## 0. 검증 방법·범위

| 항목 | 내용 |
|---|---|
| **검증 base** | `2ff5525` — 🔴 착수 시 base는 `12457be`였다. **stale base 위 판정을 전량 폐기하고 재실측**했다(아래 §0.2). |
| 대조 기준 | 각 티켓 md의 AC. 산문형 AC(T0-1·4·5·7)는 §1에서 **항목 단위로 분해**해 대조했다 — 분해안의 확정은 오케 판정 사항. |
| 판정 근거 | **실파일 Read + grep 실측 + 스키마 재현 스크립트**. SSOT 문서가 아니라 실제 로드/소비되는 파일을 읽었다. |
| 재현 | `tests/contract/oneof-discrimination.check.js` — F-1 재현용(의존성 없음, `node` 단독 실행). |
| 근거 등급 | 본 문서 전 판정 = **E1(실측)**. 권고·설계 소견만 E3으로 표기. |

### 0.1 🔴 독립성 선언 — T0-8은 판정 유보

**T0-8은 본 검증자(리바이2)의 산출물이다. 자기 산출물을 자기가 «독립 검증»할 수 없다.**
§2에 자기점검 결과는 제시하되 **PASS/FAIL 판정은 내리지 않는다.** 오케 또는 제3자가 판정해야 한다. 이 항목을 내가 PASS로 계수하면 T0-9의 존재 이유가 무너진다.

### 0.2 🔴 stale base 사고 기록 (자진 신고 · 재발 방지)

착수 시 worktree base가 `12457be`였고, 그 상태에서 **계약 갭 3건을 FAIL로 판정할 뻔했다.** 그중 2건(`F-3`·`F-5`)은 이미 `2ff5525`에서 수정된 상태였다 — 보고했다면 **false positive 2건**이 된다.

- 원인: 산출물이 다중 좌석에서 병렬 착지하는데 검증자 base를 갱신하지 않음.
- 규율: **판정 직전 `git fetch` + base 해시 대조 → 재실측 → 그 다음 보고.** 「CI 그린 ≠ 착지 상태 그린」.
- 본 문서의 모든 판정은 `2ff5525` 기준이며, 이후 커밋에 대해서는 **재실측 없이는 유효하지 않다.**

---

## 1. AC 체크리스트 시트 (8티켓)

산문형 AC는 **분해 항목**으로 표기했다(`†` = 분해).

| 티켓 | # | AC 항목 | 형식 |
|---|---|---|---|
| **T0-1** | 1 | 운영자가 「이 제품이 무엇/무엇을 보여주는가」를 승인 가능 | † |
| | 2 | 데모 서사가 **P0 기능만으로** 성립 | † |
| | 3 | T0-2/T0-3의 입력이 됨 | † |
| **T0-2** | 1 | 3안이 서로 뚜렷이 구분(색만 다른 3안 = FAIL) | 체크박스 |
| | 2 | 각 안에 대표 화면 1커트 실물 존재 | 체크박스 |
| | 3 | P0 핵심 화면 5종 수용 가능함을 **안별 1줄** 설명 | 체크박스 |
| | 4 | 운영자 제시용 요약표(3안 × 무드/강점/리스크) | 체크박스 |
| **T0-3** | 1 | 5화면 전부 **레이아웃 + 데이터 항목 + 인터랙션** 3요소 | 체크박스 |
| | 2 | baseline §12.1 공개 Sandbox **11항 전부 매핑**(매핑표 · 누락 = FAIL) | 체크박스 |
| | 3 | Golden Scenario 흐름을 **화면 전환으로 재현 가능** | 체크박스 |
| | 4 | 세션 격리·리셋 진입점 표시 | 체크박스 |
| **T0-4** | 1 | 단계마다 기대 evidence가 **T0-6 스펙 실체**로 표현 | † |
| | 2 | T0-3 화면 전환으로 재현 가능 | † |
| | 3 | **회귀 테스트 기준으로 쓸 수 있는 구체성** | † |
| **T0-5** | 1 | **T0-3 화면의 데이터 요구를 전부 커버** | † |
| | 2 | **replay event가 live event의 부분집합임이 «스키마로» 보장** | † |
| | 3 | 계약 위반을 잡을 검증 방법 1개 명시 | † |
| **T0-6** | 1 | 모든 entity에 ID 체계·필수 속성 정의 | 체크박스 |
| | 2 | relation마다 방향·카디널리티 명시 | 체크박스 |
| | 3 | pgvector·Neo4j 저장 분담표 1개 | 체크박스 |
| | 4 | GS 질의 경로를 스펙 위에서 손 추적 가능(예시 1건) | 체크박스 |
| **T0-7** | 1 | D2 skeleton 착수에 충분한 구체성 | † |
| | 2 | Live 장애 → Replay fallback 경로 명시 | † |
| | 3 | 공개 경계(§15.2 Claude 비노출) 반영 | † |
| **T0-8** | 1~4 | (티켓 체크박스 4항) | 🔴 **판정 유보 — §0.1** |

---

## 2. 티켓별 AC 대조 결과

### T0-1 — `docs/product/product-brief.md` … **PASS 3/3**

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | ✅ | §1 한 줄 · §3 문제 · §4 가치 4항 · §6 경계 — 승인 가능한 형태 |
| 2 | ✅ | §5 데모 서사 6장면이 쓰는 기능(Overview·시나리오 실행·agent streaming/replay·Evidence·전략 비교·WO 승인·reset·세션 격리)이 **T0-3 §6 Route 표에서 전부 P0** — P1 라우트(`/knowledge`·`/documents`·`/system`) 미사용 |
| 3 | ✅ | T0-2 `ux-direction.md`가 §5 서사를 안별 평가 축으로 사용 · T0-3 §8이 동일 서사 축 |

### T0-2 — `docs/product/ux-direction.md` + `mocks/*.html` … **PASS 4/4**

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | ✅ | A 고밀도 다크 3열 / B 서사형 2열 웜다크 / C 라이트 도면 — **레이아웃·정보밀도·테마가 전부 다름**(요약표 «레이아웃»·«정보 밀도» 행). 색만 다른 3안 아님 |
| 2 | ✅ | mock 3건 실물 존재(10~13KB HTML) |
| 3 | ✅ | 「P0 5화면 수용」 행 3건(L55·L88·L121) — 각 1줄 이상, **B·C는 제약까지 명시**(정직) |
| 4 | ✅ | 「운영자 제시용 요약표」 — 무드/주인공/레이아웃/밀도/강점/리스크/§11.3 정합/일정 리스크 8행 |

**소견(E3)**: C안 리스크에 「baseline §11.3 개정 선행 필요」를 **스스로 🔴로 올린 것**은 좋은 판단이다. 채택 시 §0.3 절차가 먼저다.
**보안(E1)**: mock 3건 스캔 — 외부 script/CDN/링크 **0건** · 시크릿·절대경로 **0건** · 실사명 **0건**. 공개 안전.

### T0-3 — `docs/product/wireframes.md` … **PASS 4/4** (단 F-6 영향 · 아래 교차 ①)

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | ✅ | 5화면 전부 3요소 — 레이아웃(ASCII 블록) · 데이터(①②③ 「블록/항목/출처」 표 L68·L118·L169 · ④⑤ 「표시 데이터 항목」 L211·L241) · 인터랙션(5블록) |
| 2 | ✅ | §7 매핑표 11행 전수 — **누락 0**. 실측: 항목 1~11 각 담당 화면·구체 위치 기재 |
| 3 | ✅ | §8 GS 교차표 S1~S9 전 단계 화면 전환·기대 evidence 표면 기재 |
| 4 | ✅ | §0 전역 셸 — 세션 칩(L34) · 리셋(L35) · §7 항목 3 「모든 라우트 진입 가드」 |

### T0-4 — `docs/product/golden-scenario-spec.md` … **PASS 2 / FAIL 1**

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | ✅ | §5 바인딩 표 12행이 자리표시자를 T0-6 확정 ID로 1:1 결속. 「본 표가 유일 해석」 선언 |
| 2 | ✅ | T0-3 §8이 S1~S9를 화면 전환으로 재현 |
| 3 | 🔴 **FAIL** | **F-6** — §3 S5 경로 서술이 `EQ-CNC-204 →(모델)→ FM-BRG-WEAR`로 **Component hop 누락(3-hop)**. 그런데 §5 바인딩 표·T0-6 §6·T0-3 §8은 **4-hop**(`→ CP-204-BRG-01 →`). §3이 «회귀 판정 기준»(L45)이므로 이대로 동결하면 **회귀 테스트가 3-hop을 정답으로 굳혀 T0-6과 어긋난다** |

### T0-5 — `packages/contracts/**` … **PASS 1 / FAIL 2**

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | 🔴 **FAIL(부분)** | **F-4**(문서 revision 메타 미명시) · **F-3b**(stop 이벤트 부재) — 아래 교차 ② |
| 2 | 🔴 **FAIL** | **F-1**(oneOf 판별 불능 — 재현 완료) · **F-2**(type↔payload 미결속). 「스키마로 보장」이라는 **주장이 스키마로 성립하지 않는다** |
| 3 | ✅ | README 「검증 방법」 3항(응답 대조 · live 스트림 · replay fixture 전건) |

### T0-6 — `docs/product/data-ontology-spec.md` … **PASS 4/4**

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | ✅ | §1 entity 16종 전건 ID 예시 + 필수 속성. `SensorReading`은 복합 PK로 예외 처리하고 **그 사유를 명시** |
| 2 | ✅ | §2 R01~R25 전건 방향·카디널리티·Neo4j 투영 여부 |
| 3 | ✅ | §4 저장 분담표 — 3열(PG/pgvector/Neo4j) + **재생성 경로**까지 기재(Gate 2 §32.3 대비) |
| 4 | ✅ | §6 GS-01 손 추적 11행 — 저장소·질의·결과 ID까지 |

**특기(E3)**: §5 인스턴스 수량을 **스스로 E4(가설)로 표기**하고 실측 갱신을 예고했다. 측정-주장 경계 준수 사례로 기록한다.

### T0-7 — `docs/product/system-architecture.md` … **PASS 3/3** (지적 1)

| # | 판정 | 근거(좌표) |
|---|---|---|
| 1 | ✅ | §6 — 리포 구조·docker compose 3서비스·`.env.example`·contract test 자리 |
| 2 | ✅ | §5 「Live offline/timeout → 화면 무중단 Replay fallback(모드 배지 전환)」 |
| 3 | ✅ | §4 경계표 「Claude 구독 비노출(공개 요청 = replay/로컬 모델)」 + 임의 SQL/Cypher 경로 부재 |

**지적 ◻ F-8**: §1 다이어그램의 노트북 스택에 **추론 LLM 노드가 없다**(`local embedding/reranker`만). §2 표는 근거란에 「Claude/로컬 모델」이라 적어 Live에 LLM이 있음을 시사한다. D2 skeleton 착수 시 **LLM이 어디서 도는지 모호**하다.

### T0-8 — `benchmarks/datasets/eval-questions-draft.md` … 🔴 **판정 유보**

§0.1 독립성 사유. 자기점검 결과만 제시한다(실측): 10문 · 유형 3/3/2/2 · `Not measured` 45곳 · 환각 패턴 2문×3 · stale 앵커 잔존 0. **판정은 오케 또는 제3자.**

---

## 3. 정합 교차 3건

### ① T0-4 대본 ↔ T0-3 화면 흐름 재현 가능성 … **조건부 PASS**

- T0-3 §8이 S1~S9 전 단계를 화면·전환·기대 evidence로 매핑. 각 단계에 대응 라우트와 API가 존재 — **재현 가능**.
- 🔴 **단 F-6 미해소 시 S5 회귀 기준이 T0-6과 어긋난다.** F-6을 고치면 무조건 PASS.

### ② T0-5 계약 ↔ T0-3 화면 데이터 요구 커버 … 🔴 **FAIL**

| 화면 요구 (T0-3) | 계약 (T0-5) | 판정 |
|---|---|---|
| 전역: 모드 배지·세션·리셋·fallback 배너 | `/live/status`·`/sessions`·`/sessions/{sid}/reset`·`runFailed.fallback` | ✅ |
| ① KPI 스트립(진행 Incident·대기 WO 포함) | `overview.kpi{lineActive,alarmCount,openIncidents,pendingWorkOrders}` | ✅ **(G4로 해소 확인)** |
| ① 트리·설비 카드·스파크라인·알람·시나리오 | `overview`·`…/series?window=`·`/scenarios` | ✅ |
| ② 「⏸ 중지」 | `POST /runs/{runId}/stop` | ✅ **(G2로 해소 확인)** |
| ② 중지 후 **타임라인 종료 신호** | 🔴 **event `type`에 `run.stopped` 부재** (7종: started/plan/step×3/completed/failed) | 🔴 **F-3b FAIL** |
| ② 타임라인·chart·컨텍스트·후보·evidence | WS 이벤트 + `/equipment/{id}` + `/runs/{runId}` | ✅ |
| ③ 문서 헤더 — `@rN`·`approval_state`·`effective_from/to`·`content_sha256`·**STALE 표시** | `GET /documents/{docId}?highlight=` 응답 = 「문서 미리보기 + 강조 좌표」뿐 | 🔴 **F-4 FAIL** |
| ③ 그래프·기타 kind | `/graph/paths?byRun=`·`/evidence/{id}` | ✅ |
| ④ WO 전문·편집·승인·반려 | `GET/PATCH/approve/reject` | ✅ |
| ⑤ 전략 비교 | `POST /retrieval/compare` | ✅ |

### ③ T0-6 스펙 ↔ T0-8 기대 evidence 실체 존재 … ✅ **PASS**

- T0-8 v0.2에서 앵커 13종을 T0-6 확정 ID로 재바인딩 완료. 대응표 = T0-8 §0.5.
- 잔여 ◇ 5건(D-2·D-3·D-5·D-6·D-8)은 **T0-6 결함이 아니라 스펙 입도 아래의 Phase 1 데이터 생성 요구**다. T0-6 판정에 반영하지 않는다.

---

## 4. 지적사항 — «무엇을 고치면 PASS인가»

| ID | 티켓 | 등급 | 좌표 | 무엇을 고치면 PASS인가 |
|---|---|---|---|---|
| **F-1** | T0-5 | 🔴 | `agent-events-v0.1.schema.json` `$defs.stepStarted` / `stepCompleted` | payload를 판별 가능하게 만든다 — envelope `type`별 `if/then`으로 payload를 결속하거나, 두 def에 상호 배타 필수 필드를 둔다. **재현: `node tests/contract/oneof-discrimination.check.js <schema>` → 현재 2/8 FAIL** |
| **F-2** | T0-5 | 🔴 | 같은 파일 `properties.type` ↔ `properties.payload` | `allOf` + `if(type==X) then(payload=$ref Y)` **7건**을 추가해 type과 payload를 결속한다(현재 `if/then/allOf` **0건**) |
| **F-3b** | T0-5 | 🔴 | `type` enum(7종)에 중지 이벤트 부재 | `run.stopped` event type 1개 + payload def 추가. `POST /runs/{runId}/stop`은 있는데 **스트림 종료 신호가 없다** |
| **F-4** | T0-5 | ◻ | `rest-api-v0.1.md` L47 | `GET /documents/{docId}` 응답 요지에 `documentId@rN`·`approval_state`·`effective_from/to`·`content_sha256`·`stale: bool` 명시(T0-6 §3.3 STALE 규칙을 화면이 쓰려면 필수) |
| **F-6** | T0-4 | 🔴 | `golden-scenario-spec.md` §3 S5 | S5 경로에 `CP-204-BRG-01` hop을 삽입해 **§5 바인딩 표·T0-6 §6·T0-3 §8과 동일한 4-hop**으로 통일. 「3~4 hop」 표기도 「4 hop」으로 확정 |
| **F-7** | T0-6↔T0-3↔T0-5 | ◻ | T0-6 §5(1초×4시간=43,200행) ↔ `window=24h\|3w` | 택일: ⓐ `window`에 `4h` 추가(고해상도 구간을 볼 화면을 만든다) 또는 ⓑ T0-6 사건 구간을 24h로 정렬. **현재는 생성 데이터를 볼 창이 없다** |
| **F-8** | T0-7 | ◻ | `system-architecture.md` §1 다이어그램 | 노트북 스택에 추론 LLM 노드 1행 추가 + 「공개 경로 비노출」 병기 — §2가 「Claude/로컬 모델」이라 적은 것과 정합 |

**해소 확인(재실측)**: `F-3`(stop 엔드포인트) · `F-5`(overview KPI) — `2ff5525`에서 **이미 수정됨**. 지적하지 않는다.

---

## 5. 판정 요약

| 티켓 | AC 항목 | PASS | FAIL | 판정 |
|---|---:|---:|---:|---|
| T0-1 | 3 | 3 | 0 | ✅ |
| T0-2 | 4 | 4 | 0 | ✅ |
| T0-3 | 4 | 4 | 0 | ✅ (F-6 해소 전제) |
| T0-4 | 3 | 2 | 1 | 🔴 **FAIL** |
| T0-5 | 3 | 1 | 2 | 🔴 **FAIL** |
| T0-6 | 4 | 4 | 0 | ✅ |
| T0-7 | 3 | 3 | 0 | ✅ (지적 1) |
| T0-8 | 4 | — | — | 🔴 **판정 유보(독립성)** |
| **정합 교차** | 3 | 2 | 1 | 교차 ② FAIL |

🔴 **Phase 0 게이트 = 현재 미통과.** baseline §32.1 「일부 축 통과를 합격이라 부르지 않는다」. 차단 항목은 **F-1·F-2·F-3b(T0-5) · F-6(T0-4)** 4건이며, 전부 **문서 수정으로 닫히는 결함**이다(재설계 불요).

**우선순위 권고(E3)**: F-6 → F-1 → F-2·F-3b → F-4 → F-7 → F-8.
F-6이 1순위인 이유는 **Golden Scenario 회귀 기준**이기 때문이다(baseline §33.1). 틀린 기준으로 동결하면 이후 모든 회귀 판정이 틀린다.

---

## 부록 A. T0-3 미결 W2 보안 검토 — ⑤ 자유 질문 입력 (리바이2 지정 · E3)

**결론: P0는 preset 전용 유지가 옳다.** 자유 입력을 여는 경우의 조건은 아래 5개이며, 하나라도 빠지면 열지 않는다.

| # | 조건 | 근거 |
|---|---|---|
| 1 | 자유 텍스트는 **embedding·retrieval 경로에만** 도달한다. **질의 생성기(text→SQL/Cypher)에 절대 연결하지 않는다** | baseline §16.2 임의 SQL·Cypher 실행 경로 금지 — 자유 입력이 질의 생성으로 이어지면 **금지 경로가 우회로 부활**한다 |
| 2 | 길이 상한 + 세션당 rate limit | 공개 엔드포인트 남용·비용 |
| 3 | 그래프는 **고정 template 조회만** 유지 | T0-3 L171이 이미 선언 — 자유 입력이 들어와도 불변이어야 한다 |
| 4 | 응답 evidence는 **실재 `evidenceId`만** 허용(존재하지 않으면 이벤트 미발행) | T0-5 README 원칙 2와 동일 규율 — 자유 질문에서 특히 환각 유인이 크다 |
| 5 | 자유 질문 원문·응답을 audit에 기록 | 사후 추적 |

**추가 소견**: 자유 입력은 T0-8 평가셋의 `Unanswerable` 검증과 직결된다. preset만으로는 **abstention 능력이 측정되지 않는다** — 시나리오 밖 질문을 사용자가 던질 수 없기 때문이다. 따라서 P1에서 자유 입력을 열 때 **T0-8 `Q-UNANS-001`·`Q-UNANS-002`를 그대로 preset에 포함**시켜 두면, 자유 입력 없이도 abstention 시연이 가능하다. 이쪽을 먼저 권고한다.

## 부록 B. 재현 방법

```
node tests/contract/oneof-discrimination.check.js packages/contracts/agent-events-v0.1.schema.json
# 기대: "oneOf 판별 실패 케이스: 0건 / 8"  → 현재 "2건 / 8" (F-1 미해소)
```

의존성 없음(`node` 단독). F-1 수정 후 회귀 확인용으로 `tests/contract/`에 존치한다.
