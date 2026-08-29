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

## 원장 (진행률 = ✅ 24 / 총 25 — 🔴 분모 24→25: T1-10 등재 08-28 16:24 — 🔴 분모 15→24: Phase 1 분해 +9 등재 08-28 15:53 · 분모 정비이지 후퇴 아님)

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
| T1-0 | 개발 환경 기반 실측·골격(게이트 무관) | 구현 | compose up·양 서비스 boot E1 · 기능 코드 0 | ✅ PASS(①②③ 재현 완결 · senku2 구현 · levi2 재현 검증 · PR#29·35) |

### Phase 1 — SSOT·Ontology·Synthetic Data + skeleton (S2~S3 · 게이트 통과 08-28 15:53 등재)

| ID | 티켓 | 담당 | AC 요지 | 상태 |
|---|---|---|---|---|
| T1-1 | PG 스키마·마이그레이션(온톨로지 §4 분담표→DDL·pgvector) | 구현 | 스펙 1:1 대조·재실행 가능 | ✅ PASS(독립 검증 — 대조표 전건 일치·멱등 · senku2 · PR#30 · 검증 levi2 · PR#35) — 후속 소커밋 완료(002 CHECK 3줄·README C·D절 · PR#37) |
| T1-2 | synthetic seed 생성기 | 구현 | GS-01 무대 전량 + 🔴 D-2·D-5 의도적 불완전성 보존 | ✅ PASS(senku2 구현 PR#37·44 · levi2 검증 5축 PR#41 + 재검 20/20 반전 PR#46 — F-1 수정 실측 종결) |
| T1-3 | synthetic 문서 셋(SOP·매뉴얼·안전규정) | 구현 | revision·hash·approval_state·effective 기간 실체 | ✅ PASS(senku2 2·3대 구현 PR#40·44 · levi2 3대 독립 검증 PR#52 — 인용 9/9·hash 60/60 재계산·◇ 5/5·상표 0 · 🔴 V-1 chunk 좌표 축 = T1-4 인수 조건 이월) |
| T1-4 | ingestion·chunk·임베딩·pgvector 색인 | 구현 | seed→색인 재생성 멱등 · chunk 정책 실측→오케 동결 게이트 | ✅ PASS(senku2 4~5대 구현 PR#53·54·56·61 — 게이트 ①~⑤ · AC 6항 E1 · levi2 4대 독립 검증 PR#63 — 재현성 «덤프 sha 동일» 2회·chunk 59 unique·V-1 4/4+양방향 7/7 «해소») — 🔴 이월 2건 = Q-4(ontology STALE 축)·Q-5(spec §4 pgvector 보유분 판정 이연) |
| T1-5 | Neo4j projection | 구현 | R03·R07·R08·R11·R12 포함 · GS-01 4-hop 경로 실체 | ✅ PASS(senku2 6대 구현 PR#73·76 — 노드 309·관계 448·멱등·006 원장/pairing/가드 · levi2 5대 독립 검증 PR#85 — 스펙 독립 파싱·FK 도출·자기 투영 재현 3회·값 703+486칸 대조 0건·S5 3종·드릴 오류 3건 자기 적발 후 오보 차단 · 결함 0 = 「18+22축 범위에서 0」 한계 병기) — 이월 = Q-13·Q-14·Q-15 |
| T1-6 | contract test harness 승격(검사기→정식) | 검증 | 인자화·exit code·22케이스+ 유지 | ✅ PASS(오케 판정 — 로컬 실측 25/25·자기 검증 PASS · levi2 · PR#19) |
| T1-7 | seed→index 재현성·무결성 검증 | 검증 | ID unique·hash·재생성 diff 0 · +F-2·G-4b·G-2 계승축 | ✅ PASS(levi2 4대 — A단 PR#60: stale 6곳 정정·F-2 대체 분기(사정거리 2/20 실측·처방 회부)·G-2 그물 C-21/C-22+생존 6/6 · B단 PR#63: 재현성 PASS·index_build↔spec 8/9(⑨ 부분 — ontology 축 부재 «적발»·L-31/L-32 그물 고정)·V-1 해소·U-7 치환) |
| T1-8 | FastAPI async skeleton(§7 품질 원칙 골격) | 구현 | boot·health·계약 골격·blocking 0 | ✅ PASS(senku2 3대 구현 PR#48 · levi2 3대 독립 검증 PR#52 — 계약 표면 23/23 교차 대조·blocking 0(−9.36ms)·도메인 0 전수 실독·harness strict green) |
| T1-9 | Next.js A안 셸 skeleton | 구현 | AppShell·라우트 골격·세션 칩 | 구현 완료 «접수»(senku2 6대 · PR#81 — AC 6항 E1 · 4상태 배지·pending 세션 정직·세션 가드 단일화(proxy) · Tailwind 4.3.3 · 계약 밖 0 · 검사기 contract-surface.mjs 신설) — 계수는 독립 검증(E2E — 「재지 않은 것」 명시 이월분 포함) PASS 후(§32.1) |
| T1-10 | harness 커버리지 상시 경고(미실행 스키마 속성 검출) | 검증 | 계약 필드 추가 시 구멍 재발 방지 — 러너 경고+옵션 실패 | ✅ PASS(오케 판정 — 로컬 strict 37/37 exit 0 · levi2 · PR#25) |

### Phase 2 분해안 (준비 완료 · 🔴 분모 «밖» — Phase 2 진입 게이트 때 「분모 25→31」 선행 선언과 함께 등재 · baseline §21 Phase 2 정본 대조 08-29)

| 예정 ID | 티켓 | 담당 | 요지 (AC는 발주 시 티켓으로) | 의존 |
|---|---|---|---|---|
| T2-1 | retrieval 3전략 API(vector·hybrid·graphrag) — `/retrieval/compare` 501 해제 계열 | 구현 | pgvector 검색 경로 + 구조화 결합 + Neo4j traversal · 동일 질문 3전략 실행이 완료 증거 | T1-4 ✅ · graph 축은 T1-5 |
| T2-2 | 문서·evidence 읽기 API — `/documents`(highlight)·`/evidence` 501 해제 + STALE 배지 데이터(`v_index_freshness`) | 구현 | 인용 강조 offset · revision/hash 표면 — evidence ID ↔ source 문장 일치가 완료 증거 | T1-4 ✅ |
| T2-3 | LangGraph 조사 워크플로우 — plan 5단계(structured→vector→graph→synthesize→draft_work_order) · GS-01 대본 결속 | 구현 | step 이벤트 산출(agent-events 스키마) · 🔴 Claude 구독 공개 API 노출 금지(§15.2) — Live 게이트웨이 전 로컬 실행 경계 | T2-1 · T1-5 |
| T2-4 | structured audit event + replay fixture 녹화(seq 기준) | 구현 | 조사 실행 스트림 기록 — Phase 3 replay engine·Phase 4 fallback의 원천 | T2-3 |
| T2-5 | WO 초안 생성·승인 API — CRUD·approve/reject·🔴 안전 조치 서버측 삭제 불가(R12 REQUIRES 강제) + 승인 이력 테이블·`approval_state` 전이 규칙 확정(Q-11 결속 — 스펙 §4 「승인 이력」 실체화) | 구현 | 화면 ④의 「지울 수 없는 항목」을 UI가 아니라 서버가 강제 | CRUD 선행 가능 · 초안 생성은 T2-3 |
| T2-6 | Phase 2 독립 검증 — GS integration · 3전략 동일 질문 실측 · evidence↔원문 일치 · 계약 준수 | 검증 | baseline §21 Phase 2 완료 증거 4종 전건 + Gate 결속 | T2-1~T2-5 |

### 구현 대기열 (소조각 · 미발주 — 원장 분모 밖 · 발주 시 티켓 생성, 티켓化 안 되면 발주문 소조각)

| # | 조각 | 근거 | 예정 |
|---|---|---|---|
| Q-1 | F-2 처방: self_check 바인딩 «소유 테이블 대응표» 전환 + 기대표 2곳 전환 | evidence §2.4(levi2) | ✅ 종결(구현 PR#66 `config.GS_OWNER` · 검증 PR#68 — red 확인 후 전환 20/20·11/11·exit 0 · 사유 키 정밀화 · 미등록 키 FAIL 가드 생존) |
| Q-2 | `ssot_manifest_hash`(스펙 §3.3) 산출 | 센쿠2 판단 요청 ④ | ✅ 종결(005 `v_ssot_manifest` — SQL 단일 정본·view 파생 · 검증 PR#68 독립 조립 일치 · 🔴 collation 의존 = Q-8 이월) |
| Q-3 | `data/documents/README.md` 구 앵커 정정 | wireframes v0.4 · E-4/E-5 | ✅ 종결(PR#66 · 검증 확인) |
| Q-4 | ontology STALE 축 처방(스펙 §3.3 「동일 처리」) | levi2 B단 적발(PR#63) | ✅ 종결(004 `ontology_registry`+신선도 확장 · 검증 PR#68 3축 재현·L-32 전환·L-33 신설 · 🔴 거울 공란 표시 = Q-6 이월) |
| Q-6 | freshness `ONTOLOGY_UNVERIFIED` 신설 + 읽기 경로 FAIL | levi2 PR#68 ⓑ 잔여 | ✅ 구현 완료 접수(007 · PR#83 — «둘 다» 집행 · 아는 불일치 우선 순서 · 🔴 L-34 전환 = 검증 몫 잔여) |
| Q-7 | `migrate.ps1` 헤더 dim 표기 stale | levi2 회부 ③ | ✅ 종결(PR#83 — 자리표시자/최종 병기 배너) |
| Q-8 | `v_ssot_manifest` 정렬 collation 의존 | levi2 회부 ②(E3) | ✅ 구현 완료 접수(007 `COLLATE "C"` — 현 데이터 지문 불변 실측 · 갈림 우선 실증) |
| Q-9 | 「2순위 후보」 3자 정합 — seed 실물 rank2 = FM-SPDL-OVERHEAT ↔ 화면(wireframes ②)·대본은 FM-TOOL-IMB. «측정 후 바인딩» 계열(V-1 선례): T2-3(조사 워크플로우) 착지 시 실물 후보로 화면·대본 재바인딩 · 스펙 문구 혼선은 정오표 E-6 성문 | senku2 6대 회부 ①(FM-TOOL-IMB = 어떤 incident에도 진단 없음 실측 · D-5 정합) | T2-3 착지 시 오케 패스 |
| Q-10 | G-1 CHECK 확장 — retired 잔여열 요건 | levi2 5대 회부 ②(PR#75 · T-I3 실측) | ✅ 구현 완료 접수(007 `ck_retired_keeps_effective_to` — 대리 축 approved_by · 정당 경로 통과 · 기존 축 생존 확인) |
| Q-11 | work_order 승인 축 — 스펙 §4 「전체 행 + 승인 이력」 vs 스키마 = 현재 상태 1열·이력 테이블 없음 + `approval_state` 전이 규칙 스펙 부재 → 🔴 T2-5(WO API) 티켓에 «승인 이력 테이블 + 전이 규칙 확정(오케)» 편입 | levi2 5대 회부 ③(PR#75) | T2-5 발주 시 결속 |
| Q-12 | E-7의 대가 — 최상위 revision은 retired 불가(retired ⇒ superseded 경유 ⇒ 승계자 필요) = «문서 전체 폐기 revision 경로 없음». 현 PoC 범위 밖 «수용»(GS·평가에 폐기 시나리오 없음 · seed retired 0행 · 레지스트리 축 `document.status='retired'`는 별개). 폐기 시나리오 필요 시 §3.3 개정으로 개방 — 그때 C-28이 FAIL로 알린다 | levi2 5대 대가 계수(PR#79 · E-7 집행분) | §3.3 개정 시 재론 |
| Q-7b | migrate.ps1 헤더 dim 표기 — 구현 정정분(PR#83)과 검증 «재현» 보고(PR#85)가 갈림 → 실물 대조 1줄 판정 | levi2 회부 ①(PR#85) | 발주(senku2 7대 · 08-29) |
| Q-13 | 덤프 «형식» 정본 없음 — 구현·검증 덤프가 각자 뜬다(각자 재현성만 보므로 현재 무해 E3) → 교차 검증 필요 시점에 정본화 | levi2 회부 ②(PR#85) | 필요 시점 오케 판정 |
| Q-14 | `index_build.graph_projection_version` 채움(indexer 연동) — COMMENT 성문 확인분 · 새 빌드부터 채우는 연동 | levi2 회부 ③(PR#85 · T1-5 티켓 범위 밖 명시분) | 구현 묶음 후보 |
| Q-15 | 🔴 그래프 «낡음» 축 부재 — 색인은 sha 대조 STALE이 있는데 graph_build는 데이터 지문이 없어 재투영을 잊으면 조용히 낡는다(세 축 전수 확인 E1) → graph_build에 «원장 데이터 지문» 1열 + 짝 판정 상태 1종(GRAPH_STALE 계열) · T2 쓰기 경로 전 선결 | levi2 회부 ④(PR#85) | 발주(senku2 7대 · 08-29) |
| Q-5 | spec §4 pgvector 보유분 2건(`MaintenanceRecord.note`·`FailureMode.description` 임베딩) 미착지 — 명시 제외 vs 착지 «판정 이연»(T2 검색 전략 구현 진입 시 필요 실측으로 오케 판정 · 이연 자체를 여기 성문 — 조용한 누락 아님) | levi2 4대 부수 계수(vector 칼럼 전수 = document_chunk.embedding 1개) | T2 진입 시 오케 판정 |
