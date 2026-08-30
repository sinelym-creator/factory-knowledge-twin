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

## 원장 (진행률 = ✅ 30 / 총 31 — 🔴 **T2-5 완결 08-30 15:18**(독립 검증 PASS · PR#137 착지 1146ca4) · T2-4 완결 08-30 09:17(재검 PASS · PR#129) · T2-3 완결 04:30(PR#121) · T2-2 완결 03:17(PR#114) · T2-1 완결 01:41(PR#108) · Phase 2 진입 재가 00:04 · Phase 1 완결 08-29 19:05 · 분모 이력: 🔴 25→31 T2-1~T2-6 등재 · 24→25 T1-10 등재 · 15→24 Phase 1 분해)

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
| T1-9 | Next.js A안 셸 skeleton | 구현 | AppShell·라우트 골격·세션 칩 | ✅ PASS(구현 PR#81 · 검증 PR#90 결함 2+검사기 1 적발 · 정정 PR#93 · 재검 PR#95 — 🔴 판정문 「그물 4행 빨강 전환 확인 후 해소 계수 · svg 5건 기준선 회귀 0 · PASS의 뜻 = 37행+17주입+22스캔+22드릴 범위에서 0건」 · P-04 «둘 다 참, 다른 표본» 처방 착지 — 관측 출처 표기 정정: senku2 측정 DB = fkt-senku2-q3의 fkt) |
| T1-10 | harness 커버리지 상시 경고(미실행 스키마 속성 검출) | 검증 | 계약 필드 추가 시 구멍 재발 방지 — 러너 경고+옵션 실패 | ✅ PASS(오케 판정 — 로컬 strict 37/37 exit 0 · levi2 · PR#25) |

### Phase 2 — Retrieval·Agent Backend (S4~ · 🔴 진입 재가 08-30 00:04 — 「분모 25→31」 선언과 함께 등재 · 분해안 = baseline §21 정본 대조 08-29 그대로)

| ID | 티켓 | 담당 | 요지 (AC 전문 = 티켓 파일) | 의존 | 상태 |
|---|---|---|---|---|---|
| T2-1 | retrieval 3전략 API(vector·hybrid·graphrag) — `/retrieval/compare` 501 해제 계열 | 구현 | pgvector 검색 경로 + 구조화 결합 + Neo4j traversal · 동일 질문 3전략 실행이 완료 증거 | T1-4 ✅ · graph 축은 T1-5 ✅ | ✅ PASS 08-30(구현 PR#100+정정 PR#106 · 검증 1차 불합격→재검 PASS PR#108 — 결함 계보: 구현 자기 적발 2(graphrag 종단 상한·hybrid 이웃 랭킹) + 검증 적발 V-1(조사 앵커 절단)·V-2(오류 형상 이탈)·V-3(검사기 제목 경계)·V-4(임베딩 원문 입력 — canonical로 닫힘·nobold 0건 확정)·V-5(CP 화이트리스트 누락 — T2-2 왕복 적발·PR#107 정정) · E-8 성문 · AC③ 해석 = ⓑ GS-01 계열 전체 충족(티켓 append) · 검증 그물 3종 신설 tests/api) |
| T2-2 | 문서·evidence 읽기 API — `/documents`(highlight)·`/evidence` 501 해제 + STALE 배지 데이터(`v_index_freshness`) + `/scenarios`(Q-18 귀속) | 구현 | 인용 강조 offset · revision/hash 표면 — evidence ID ↔ source 문장 일치가 완료 증거 · Q-20 울음 자리 | T1-4 ✅ · evidenceId 실물은 T2-1 | ✅ PASS 08-30(구현 PR#107+정정 PR#112·#113 · 검증 1차 불합격→재검 PASS PR#114 — 결함 계보: V-6(ghost chunk 조용한 200 — ①②③ 세 갈래 · ③ = 500 citation_integrity_broken 판정 · I-05 「sha 신선도는 chunk drift를 못 본다」 실증이 근거)·V-7(의존 단절 코드 분열 — dependency_guard 1곳 수렴 「잊을 자리 자체를 없앴다」) · 축③ STALE 표면 도달 실증(Q-20 닫음) · 보안 축 30건 4xx·대상 생존 실증 · tests/api 8종 172항) |
| T2-3 | LangGraph 조사 워크플로우 — plan 5단계(structured→vector→graph→synthesize→draft_work_order) · GS-01 대본 결속 | 구현 | step 이벤트 산출(agent-events 스키마) · 🔴 Claude 구독 공개 API 노출 금지(§15.2) — Live 게이트웨이 전 로컬 실행 경계 | T2-1 ✅ · T1-5 ✅ | ✅ PASS 08-30(구현 PR#118 · 검증 PR#121 — 🔴 결함 0 · 축 8 판정 행 176 · «못 잰 열» 성문 = 합성 게이트 도달(online=true) 열 → 데모 리허설 결속 · egress 가드 독립 재현 · SSOT 쓰기 0 실측 · mode 축 v0.1.3 전건 참 · 검증 소견 3(graph/paths 해제 단위 · runs 세션 축 = Q-25 · blocking 초록의 주어) · 계약 성문 = v0.1.2·v0.1.3 · Q-9 종결 근거 확보) |
| T2-4 | structured audit event + replay fixture 녹화(seq 기준) | 구현 | 조사 실행 스트림 기록 — Phase 3 replay engine·Phase 4 fallback의 원천 | T2-3 ✅ | ✅ PASS 08-30(구현 PR#124+정정 PR#127·#128 · 검증 1차 불합격→재검 PASS PR#129 — 결함 계보: V-8(심사기가 «이름표 없는 키 값» 미검출 — 자기 확인적 대조군 · 축 분리+표본 강제로 정정) · V-9(값 형상 축 종단 `\b` 한글 불발 — 🔴 V-1 기전의 «세 번째» 발현 + 형제 5칸 · 문자집합 잠금 처방) · fixture 32건 무가공·왕복 «치환 2필드 제외 전건 일치»·무의존 replay 200(Phase 4 fallback 축)·재검 표 재현기 성문 · 판정 J-A~J-I) |
| T2-5 | WO 초안 생성·승인 API — CRUD·approve/reject·🔴 안전 조치 서버측 삭제 불가(R12 REQUIRES 강제) + 승인 이력·`approval_state` 전이 규칙(Q-11 종결분) | 구현 | 화면 ④의 「지울 수 없는 항목」을 UI가 아니라 서버가 강제 | T2-3 ✅ | ✅ PASS 08-30 15:18(구현 PR#134 착지 b138610 · senku2 12대 — approvals 원장·4라우트·R12 화이트리스트+형제 6종+7번째 422·계약 v0.1.4·v0.1.5·Q-11 종결 ∥ 독립 검증 리바이2 10대 PR#137 — 🔴 착지분 결함 0·신규 회부 0 · 축⓪~⑦: 형상 12/12(🔴 신설 wo_shape_drill — 기존 그물이 v0.1.4로 세워져 v0.1.5 3필드에 침묵하던 결함 자수 정정 · 12필드 매 실행 계약 추출+대조군 감도 실증) · 전이 합법3=200·위반6=409·침묵0 · R12 형제 6 차단+실반영·실삭제 대조군+note 단독 403(화이트리스트 실증) · 7번째 «못 찾았다»(6칸 전건 차단+parts/안전 구조 비겹침 근거) · Q-27 4경로 전건 501 단일 코드+404/live 200 대조군 · SSOT W-01~03 무변 · 세션 축 = Q-25 확장의 독립 재현(신규 회부 아님 — 「세션 스코프」는 저장 축의 말) · 회귀 14/14 · 사유 코드 5종 = 계약 append 「분리 요구·이름 비열거」에 어긋남 0(E3 소견 — 갈림 2쌍은 성문 병기) · 못 잰 열 = 승인 권한·이력 조회 표면·이력 내구성·합성 게이트 online 열·화면 축 · 검증 그물 결함 5건 자수·수정 N-1~N-5) |
| T2-6 | Phase 2 독립 검증 — GS integration · 3전략 동일 질문 실측 · evidence↔원문 일치 · 계약 준수 | 검증 | baseline §21 Phase 2 완료 증거 4종 전건 + Gate 결속 | T2-1~T2-5 ✅ | 🔶 발주 08-30 15:35(검증 리바이2 10대 · lane/levi2-t2-6 — 선행 = T2-5 완결·Q-30 green 종결) |

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
| Q-9 | 「2순위 후보」 3자 정합 — seed 실물 rank2 = FM-SPDL-OVERHEAT ↔ 화면(wireframes ②)·대본은 FM-TOOL-IMB | senku2 6대 회부 ① · T2-3 실물 확정(검증 PASS PR#121) | ✅ 종결(08-30 오케 판정 — **재바인딩 불요**: 후보 생성 규칙 = A «울린 센서가 지시하는 고장»(failure_mode_indicator) 채택 → 실물 rank2 = FM-TOOL-IMB로 화면·대본과 일치(검증 실측 · confidenceNote까지 D-5 정합). E-6의 「seed rank2 = SPDL-OVERHEAT」는 R15 «진단 이력» 축 — «후보 생성» 축과 다른 축이라는 구분이 정합의 답. 개수 일치는 채택 결과지 근거 아님 병기) |
| Q-10 | G-1 CHECK 확장 — retired 잔여열 요건 | levi2 5대 회부 ②(PR#75 · T-I3 실측) | ✅ 구현 완료 접수(007 `ck_retired_keeps_effective_to` — 대리 축 approved_by · 정당 경로 통과 · 기존 축 생존 확인) |
| Q-11 | work_order 승인 축 — 스펙 §4 「전체 행 + 승인 이력」 vs 스키마 = 상태 1열·이력 테이블 없음 + 전이 규칙 부재 | levi2 5대 회부 ③(PR#75) · T2-5 게이트 1 실측(08-30) | ✅ 종결(오케 판정 — 🔴 «스펙 §4 = 공장 WO 저장 규격» 해석 확정(계약 v0.1.4 성문): 조사 초안(WOD-)은 별개 축(세션 스코프 · id CHECK 배타·enum 어긋남·seed 멱등이 근거) · 이력 테이블 신설(009) 불요 — 초안 승인 이력 = 세션 축·초안보다 오래 사는 형태 · 전이 규칙 = pending→approved\|rejected 2쌍·종단·PATCH pending만(E-7 해석 규율) · 공장 WO 이력 실체화는 실공장 연동 시 재론) |
| Q-12 | E-7의 대가 — 최상위 revision은 retired 불가(retired ⇒ superseded 경유 ⇒ 승계자 필요) = «문서 전체 폐기 revision 경로 없음». 현 PoC 범위 밖 «수용»(GS·평가에 폐기 시나리오 없음 · seed retired 0행 · 레지스트리 축 `document.status='retired'`는 별개). 폐기 시나리오 필요 시 §3.3 개정으로 개방 — 그때 C-28이 FAIL로 알린다 | levi2 5대 대가 계수(PR#79 · E-7 집행분) | §3.3 개정 시 재론 |
| Q-7b | migrate.ps1 헤더 dim 표기 — 구현 정정분과 검증 «재현» 보고가 갈림 → 실물 대조 판정 | levi2 회부 ①(PR#85) | ✅ 종결(senku2 7대 실측 — 구현 정정분 참 · 「값이 아니라 값의 뜻」 · 양쪽 자기 축에서 참 · 코드 변경 0 · 잔여 docs 자리 = 오케 PR#87 정정) |
| Q-13 | 덤프 «형식» 정본 없음 — 구현·검증 덤프가 각자 뜬다(각자 재현성만 보므로 현재 무해 E3) → 교차 검증 필요 시점에 정본화 | levi2 회부 ②(PR#85) | 필요 시점 오케 판정 |
| Q-14 | `index_build.graph_projection_version` 채움(indexer 연동) | levi2 회부 ③(PR#85) | ✅ 불요 종결(오케 판정 — 006 «전» 관점의 회부였고 B안 확정이 답: 열 = NULL이 참(색인 경로 비관측) · 짝 판정 = view. COMMENT 성문분이 정본) |
| Q-15 | 그래프 «낡음» 축 부재 → 원장 데이터 지문 + 짝 판정 상태 | levi2 회부 ④(PR#85) | ✅ 구현 완료 접수(008 · PR#88 — 처방 이탈 3건 전건 승인: 2열(지문+사정거리)·2상태(STALE/UNVERIFIED)·🔴 사정거리 = «투영이 읽는 열»(23테이블 78열 — 경보 사정거리 = 해소 범위 원칙) · 대조군 8종 · 🔴 착지 여파 = 재투영 전 기존 행 UNVERIFIED(설계) — 검증 재검 몫) |
| Q-16 | 🔴 정본 내부 긴장 — wireframes §6 「모든 라우트 세션 가드」 ↔ §3:244 「Evidence 딥링크는 세션 밖에서도 열람만 가능」. 현행 = 가드 정본 유지 · 🔴 §3:244는 «지금도 미구현»(levi2 실측 — V-1 처방 전후 무관 · 우연 구현도 아님) → 세션 밖 «읽기 전용 열람» 설계 = Phase 3 evidence 뷰 티켓 결속. 🔴 재검·이후 검증이 §3:244를 초록으로 못 내는 것은 결함이 아니라 «이연분»이다 | 🔴 귀속 분리(08-29 정정): 현상(딥링크 목적지 유실) 보고 = levi2 6대 R-1(PR#90) · §3 교차·긴장 특정 = 오케 · 미구현 실측 = levi2(id 1543155687297781793) | Phase 3 T3-x 발주 시 오케 설계 |
| Q-5 | spec §4 pgvector 보유분 2건(`MaintenanceRecord.note`·`FailureMode.description` 임베딩) | levi2 4대 부수 계수 · T2-1 AC 실측 결속 | ✅ 종결(08-30 오케 판정 — 센쿠2 실측 채택: MR.note 색인 9/40 · FM.description 문서 커버 0 · 🔴 P0 allowlist 10문 전건 ID 앵커 포함 → hybrid 구조화 축이 전문을 집으므로 «현 질문 집합에서 임베딩 불필요» 확정. 재론 조건 = 앵커 없는 자유 질문 개방 시 — 조용한 누락 아님, 조건부 종결) |
| Q-17 | `CompareResult.score` 정규화 규칙 계약 부재 — 전략 간 직접 비교 불가(전략 내 서수 의미만). 응답 확장 금지(동결) · T2-1은 완료 보고+코드 성문으로 한계 명시 → 계약 v0.2 개정 시 정규화 명시 재론 | senku2 9대 T2-1 게이트 1 실독(계약 72행 · 08-30) | 계약 개정 시 재론 |
| Q-18 | 잔여 501 라우트 티켓 귀속 — 🔴 확정(08-30): `GET /scenarios` = **T2-2** ✅ · `GET /graph/paths` = **T2-3 해제 확정**(J-2 · S5 기대 evidence 라우트 강제) · `POST /sessions` = **Phase 3 결속**(콘솔 세션 실체화 시 — 그때까지 501이 참) · `GET /incidents`·`/plants`·`/equipment` 조회 계층 = **후속 발주 시 판정**(T2-3 J-1에서 범위 밖 확정) | senku2 9대 T2-1 게이트 1 실독 · T2-3 J-1·J-2 판정(08-30) | /sessions·조회 계층 잔여 |
| Q-19 | hybrid 이웃 정렬 «사전순» 한계 — 질문의 「진동」→`measurement_type=VIB` 잇는 낱말 사전 부재(SN-204-CUR가 SN-204-VIB에 앞섬). 사전은 평가셋과 함께 설계 | senku2 9대 T2-1 구현 실측(08-30) | D3 측정·평가 티켓 결속 |
| Q-20 | «STALE인데 검색됨» 노출 경로 — compare 응답의 신선도 침묵은 계약상 참(F-4: 배지 표면 = `/evidence`·`/documents`). 🔴 울음 판정선 = 「낡음 주입 시 어느 층도 안 운다 = FAIL」(응답 침묵 자체는 FAIL 아님 — 검증 축①ⓑ 재규정 08-30) | senku2 소견 + levi2 축① + 오케 판정(08-30) | T2-2 배지 표면 + 검증 축①에 결속 |
| Q-21 | ai-api torch 무게 — 질의 임베딩 도입으로 「indexer 컨테이너화 비대상」 판정의 근거 무게가 ai-api로 이전. 임베딩 분리(별도 프로세스/서비스) 재론 | senku2 9대 T2-1 구현(08-30 · dev-environment §8 E2 결속) | Phase 4 컨테이너화 시 재론 |
| Q-22 | 배지 `stale` = 계약상 boolean 1개 vs 신선도 뷰 6상태 — 현행 확정 = 보수 매핑 `stale=(freshness!="FRESH")`(모르는 값을 false로 흘리지 않음 · 도달 불가 상태 가드 성문) + 세 층 분리(의존 단절 = 오류 코드 · 색인 상태 = 배지 · 인용 가능 = approvalState/effective). 6상태 enum «노출»은 계약 개정 사안 | senku2 9대 T2-2 소견 + levi2 소견② + 오케 판정(08-30) | 계약 v0.2 재론 |
| Q-23 | 오류 message가 요청 문자열 반사(28/30 · 4KB·방향 제어문자 포함) — 결함 아님(JSON+React · 실행 위험 0) · 공개 Sandbox 위생: 반사 길이·문자 상한 | levi2 8대 보안 축 소견④(08-30) | T2 후반 하드닝 조각 |
| Q-24 | `DEPENDENCY_ERRORS`가 `asyncpg.PostgresError` 광포착 — 진짜 SQL 결함도 503 dependency_unavailable로 접힘. 좁힘(연결 계열만 503 · 나머지 500) 별건 | senku2 10대 fix 소견(08-30) | T2 후반 하드닝 조각 |
| Q-25 | `GET /runs/{runId}`에 세션 축 부재 — runId 아는 쪽은 누구나 읽는다(난수라 실질 위험 낮음 · 결함 아님). 세션 격리를 «주장하게 될 때» 전에 계약 확정 필요 · 🔴 확장(08-30 T2-5): WO 초안 CRUD·승인 개방으로 «읽기 축에 쓰기가 열렸다» — 초안·승인 경로에도 세션 소유권 검사 없음(위험의 «종류» 변화: 조회 노출 → 상태 변경) | levi2 8대 T2-3 검증 소견②(08-30) + senku2 12대 T2-5 회부 ①(08-30) | Phase 3 sessions 실체화와 결속 |
| Q-26 | `/graph/paths` 해제 «단위» 성문 — 계약 표가 `?from&to`와 `?byRun`을 한 행에 적어 단위(라우트 vs 질의 형태)가 미성문. 판정(08-30) = **단위 = 질의 형태**: byRun 해제 완료로 계수 · from&to는 소비처(Phase 3 그래프 화면) 생기는 시점 재판정 — 사유 단 501 유지가 참 | levi2 8대 T2-3 검증 소견①(08-30) · 오케 판정 | Phase 3 그래프 화면 발주 시 |
| Q-27 | replay run의 «이벤트 밖 부산물» — graphPaths·workOrderDraft 본문은 fixture(이벤트 축)에 없어 재생에서 복원 불가(파싱 복원 = 금지된 재조립). T2-4 판정 = byRun 명시 오류(`replay_path_source_absent`) · 🔴 T2-5(WO 저장소 개방) «착수 전 재확인 의무» · Phase 3 replay 화면의 그래프 패널이 이 오류를 어떻게 접는지 함께 판정 · GP- evidenceId 내 녹화 runId ≠ envelope.runId 동일성 가정 금지 병기 · 데모 주경로 = 실행(live)이라 현 데모 품질 훼손 없음 | senku2 11대 J-G·J-H(08-30) · 오케 판정 | T2-5 착수 전 + Phase 3 replay 화면 |
| Q-28 | 심사기 오탐 3건(https:// «s:/» 드라이브 오인 · §15.2 인용 문장 · 버전 4연 숫자 — 전후 같은 모집단 delta 0 · 실물 fixture 구간 0건 = 현 영향 0) + `projector/manifest.py:205` `\bFROM` 저위험 후보(입력 = 마이그레이션 SQL ASCII 지배적 — V-9 두 조건 결합 실질 낮음) | senku2 11대 오탐 delta 보고 + 전역 형제 세기(08-30) | T2 후반 하드닝 조각 |
| Q-29 | http_400 fallback 응답의 영어 message — 알려진 이연분(검증에서 red로 계수하지 않는다 · 성문 = 스자쿠 5대 wake 발주문 + 리바이2 9대 접수, 팀 채널 08-30). 원장 미등재 상태로 «인지»만 돌던 것을 08-30 등재 | T2-3~T2-5 검증 인지(E2 — 팀 채널 성문) | T2 후반 하드닝 조각 |
| Q-30 | 🔴 develop CI 20+연속 red(08-29 18:19~) — hygiene 잡이 검증 픽스처의 합성 토큰(evidence/t2-4-recheck-matrix.py:23-24 · tests/api/replay_fixture_drill.py:285-286 — ghp_·AKIA 프로브)을 secret 오검출. 대조군 = origin/develop과 lane에서 동일 4줄 히트(E1) · 🔴 오케 태만 병기 — PR#98~135 병합하며 CI 미확인(「항상 빨간 신호는 안 보는 신호」의 실물 — 진짜 유출이 섞였어도 구분 못 했을 것). 🔴 처방 방향 성문 = 제외 목록 «금지» · 픽스처 값 런타임 조립(제외는 그 파일 안의 진짜 유출까지 눈감는다) 🔴 범위 확장(08-30 15:19 오케 판정 — 완료 정의 「러너 green」이 범위를 정한다): hygiene 잡 = set -e 직렬 «2게이트» — secret 오검출 «뒤에» personal absolute path 게이트가 가려져 있었다(리바이2 10대 E1 — 러너 동일 정규식 chr(92) 조립 로컬 전수 스캔). path 히트 5건 = 🔴 진짜 개인 절대경로 3(evidence/t2-4-final-run.log:340 · evidence/t2-4-recheck-matrix.py:6 · evidence/t2-baseline-prescription-free.md:15 — §34.6이 막으라던 그것이 오검출에 가려져 통과) + 합성 프로브 2(services/ai-api/tools/audit_replay_fixture.py:242 · tests/api/credential_leak_drill.py:100). 🔴 git «이력» 잔존 축 = 공개 경계 사안 · 폐하 상신(HEAD 제거까지가 이번 범위) | senku2 12대 경보(08-30 12:12 · E1) + 리바이2 10대 2층 발견(15:19 · E1) + 오케 판정 | ✅ 종결(08-30 15:33 — 🔴 러너 green E1 · 리바이2 최종 판정: develop 시계열 1146ca4 fail → 63f60b9 fail(리바이2 4건만 착지 — 잔여 히트 1줄 실증) → 52a38fe·de24fe3 success = «두 좌석 합산» 귀속을 러너가 직접 찍음 · 로컬 3게이트 전수 재현 0·0·0(ci_hygiene_drill — 전부 돌고 전부 보고) · 빈 스캔 반증 «Users» 8줄/4파일 잔존·패턴 히트 0(전건 조립 픽스처·정규식 — 진짜 경로 0) · 가림 2건 = 값 제거+머리 성문 정합 · 이력 축 = D-003 ⓐ 재가로 종결) |
| Q-31 | 와이어프레임 ④ 「mandatory인 경우」 단서 ↔ 서버 R12는 «무조건» 차단(서버가 더 엄함 — 안전한 방향의 불일치라 결함 아님) → WO 화면 툴팁·안내 문구 정합 필요 | senku2 12대 T2-5 회부 ③(08-30) | Phase 3 WO 화면 발주 시 오케 설계 |
| Q-32 | WO 초안 응답에 `sourceSopId` 부재 — R12 «강제»에는 불요(서버측 화이트리스트로 충분)나 화면 「근거 툴팁」(어느 SOP가 이 안전 조치를 요구하는가) 축에는 필요 — 응답 확장 = 계약 개정 사안(동결 존중) | senku2 12대 T2-5 회부 ④(08-30) | 계약 v0.2 재론 + Phase 3 WO 화면 결속 |
