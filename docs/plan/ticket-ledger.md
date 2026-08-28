---
asset_class: operations
description: 티켓 원장 — 진행률 유일 산법(✅/총)
status: active
lifecycle: 단위 완료·분모 변경 시 갱신 · 분모 변경은 「N→M」 선행 선언
size_limit: 8KB
---

# 티켓 원장 — factory-knowledge-twin

> **진행률의 유일 정본** = 본 원장의 티켓별 ✅/총(가중치 금지). 계층 = project-plan §5. 티켓은 해당 일차 발주 시 등재한다(선행 과계획 금지) — Phase 0은 전량 등재. 티켓 상세(AC 전문·하위 태스크·경과) = `docs/plan/tickets/T{ID}.md`(발주 시 생성 · 발주문 겸용).
>
> **단위 분해 트리거**: 티켓이 ⓐ 2일+ 소요 ⓑ 담당 2인 교차 ⓒ 부분 완료 보고 필요 중 하나면 «그 티켓만» 단위 분해(근거 붙일 수 있는 최소 완결 조각) — 분해 시 「분모 N→M」 선행 선언.

## 원장 (진행률 = ✅ 15 / 총 25 — 🔴 분모 24→25: T1-10 등재 08-28 16:24 — 🔴 분모 15→24: Phase 1 분해 +9 등재 08-28 15:53 · 분모 정비이지 후퇴 아님)

### 부트스트랩 (완결)

| ID | 티켓 | 담당 | 상태 |
|---|---|---|---|
| B-1 | GitHub Public 개설 + 공개 경계 감사 + 이력 재구성 | 오케 | ✅ 08-28 |
| B-2 | CI 위생 게이트(GitHub-hosted) 배선 | 오케 | ✅ 08-28 |
| B-3 | 7일 작업 플랜 수립 + 운영 사이클 결속 | 오케 | ✅ 08-28 |
| B-4 | README 일반인 눈높이 리라이트(개요·다이어그램 3종) | 오케 | ✅ 08-28(운영자 승격 승인 · PR#12) |

### Phase 0 — 제품·UX 방향 확정 (S1 · AC 상세는 발주문에)

| ID | 티켓 | 담당 | AC 요지 | 상태 |
|---|---|---|---|---|
| T0-1 | `docs/product/product-brief.md` 초안 | 오케 | 사용자·문제·가치·3분 데모 narrative — 운영자 승인 가능 상태 | ✅ PASS(T0-9 v1.1 · suzaku · ffaa9e0) |
| T0-2 | `docs/product/ux-direction.md` — visual direction 3안 | 구현 | 3안 각: 무드·레이아웃·팔레트·대표 화면 1커트 + 선택 근거 | ✅ PASS(T0-9 v1.1 · D-002 승인 · senku2 · PR#6) |
| T0-3 | P0 핵심 화면 wireframe + route/interaction 목록 | 구현 | Overview·Incident·Evidence·WorkOrder·전략비교 5화면 | ✅ PASS(T0-9 v1.1 · senku2 · PR#2) |
| T0-4 | `docs/product/golden-scenario-spec.md` 초안(storyboard) | 오케 | 시나리오 단계·기대 evidence·데모 스크립트 | ✅ PASS(재검증 v1.2 · suzaku · PR#10) |
| T0-5 | `packages/contracts/` API·event contract v0.1 | 오케 | REST·WebSocket·replay event 스키마 — 동결 대기 | ✅ PASS(v1.3 최종 확인 · suzaku · PR#14) — 🔴 v0.1 «동결» |
| T0-6 | `docs/product/data-ontology-spec.md` v0.1 | 구현 | entity·relation·identifier 체계 — 동결 대기 | ✅ PASS(T0-9 v1.1 · senku2 · 922eb7f) — 🔴 v0.1 «동결» |
| T0-7 | `docs/product/system-architecture.md` | 오케 | container·network·data flow·trust boundary | ✅ PASS(T0-9 v1.1 · suzaku · fcfb11e) |
| T0-8 | 평가 질문 초안 8~10문 + acceptance threshold | 검증 | Direct·Multi-hop·Safety·Unanswerable 포함 | ✅ PASS(오케 판정 · levi2 · PR#3 — 표본 검문 4축 일치) |
| T0-9 | Phase 0 산출물 독립 검증(AC 대조·정합) | 검증 | 전 산출물 PASS/FAIL 판정 + 지적사항 | ✅ 완결(v1.3 · levi2 · PR#9·13·15 — 차단 0 판정) |

> **정정 append(08-28 15:55)**: `4f638c7` 내 T0-8 파일 포함은 좌석 의사와 무관한 혼입(공유 index 사고)이다 — T0-8 산출물 귀속 = 검증 좌석(levi2), 귀속 정본 = 보고 message id(위 표 병기). 원장 행 근거 병기 표준은 plan §5.

### Phase 1+ (S2~ · 단계 진입 시 등재)

— 미등재.

### Phase 0 후행 delta · S2 선행 (병렬 발주 08-28 15:42 — 운영자 유휴 0 하명)

| ID | 티켓 | 담당 | AC 요지 | 상태 |
|---|---|---|---|---|
| T0-10 | wireframe D-002 delta 보강(F-11·F-9) | 구현 | B요소 2개·첫 진입 안내·TTAE 표시 1행 | ✅ PASS(재실측 v1.5 · senku2 · PR#17·21) |
| T1-0 | 개발 환경 기반 실측·골격(게이트 무관) | 구현 | compose up·양 서비스 boot E1 · 기능 코드 0 | 발주 |

### Phase 1 — SSOT·Ontology·Synthetic Data + skeleton (S2~S3 · 게이트 통과 08-28 15:53 등재)

| ID | 티켓 | 담당 | AC 요지 | 상태 |
|---|---|---|---|---|
| T1-1 | PG 스키마·마이그레이션(온톨로지 §4 분담표→DDL·pgvector) | 구현 | 스펙 1:1 대조·재실행 가능 | 대기 |
| T1-2 | synthetic seed 생성기 | 구현 | GS-01 무대 전량 + 🔴 D-2·D-5 의도적 불완전성 보존 | 대기 |
| T1-3 | synthetic 문서 셋(SOP·매뉴얼·안전규정) | 구현 | revision·hash·approval_state·effective 기간 실체 | 대기 |
| T1-4 | ingestion·chunk·임베딩·pgvector 색인 | 구현 | seed→색인 재생성 멱등 | 대기 |
| T1-5 | Neo4j projection | 구현 | R03·R07·R08·R11·R12 포함 · GS-01 4-hop 경로 실체 | 대기 |
| T1-6 | contract test harness 승격(검사기→정식) | 검증 | 인자화·exit code·22케이스+ 유지 | ✅ PASS(오케 판정 — 로컬 실측 25/25·자기 검증 PASS · levi2 · PR#19) |
| T1-7 | seed→index 재현성·무결성 검증 | 검증 | ID unique·hash·재생성 diff 0 | 대기 |
| T1-8 | FastAPI async skeleton(§7 품질 원칙 골격) | 구현 | boot·health·계약 골격·blocking 0 | 대기 |
| T1-9 | Next.js A안 셸 skeleton | 구현 | AppShell·라우트 골격·세션 칩 | 대기 |
| T1-10 | harness 커버리지 상시 경고(미실행 스키마 속성 검출) | 검증 | 계약 필드 추가 시 구멍 재발 방지 — 러너 경고+옵션 실패 | 발주 |
