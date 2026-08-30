---
asset_class: ssot
description: 확정 계획 요약 단일본 — 7일 배포 일정 · 운영 사이클
status: active
approval: 2026-08-28 14:34 운영자 승인 — docs/decisions/001
lifecycle: 변경 발생 «즉시» 갱신(살아있는 플랜) · 전략 변경 = 운영자 재가
size_limit: 10KB
---

# 프로젝트 플랜 — factory-knowledge-twin

> **확정 계획 요약 단일본.** 정본 = `docs/baseline/poc-baseline-v0.2.md`(§21 개발 단계 · §33 실행 계획 · §12 P0/P1/P2) — 여기 재기술하지 않는다. 「지금 어디」 = checkpoint · 현황 = PROGRESS.

## 0. 방향 (3줄)

- 제조 도메인에서 RAG·지식그래프/온톨로지·LangGraph Agent를 **하나의 제품 경험**으로 통합해 시연하는 Portfolio-grade PoC.
- 이중 실행 구조: Vercel Always-on Sandbox(노트북 OFF에도 동작) + 노트북 Live AI(FastAPI·LangGraph·pgvector·Neo4j).
- 구현 속도보다 **검증·재현·release closure**가 Critical Path. 멀티에이전트 3좌석 + 독립 검증 Gate.

## 1. 기한 제약 (운영자 확정 2026-08-28)

- 🔴 **유일한 날짜 제약 = 배포 상한: 작업 개시(08-28) 후 «최대» 7일 = 09-04.** 상한이지 목표가 아니다(「더 빠르게 완성해도 좋다」).
- 🔴 **일정을 날짜로 배정하지 않는다**(운영자 확정 08-28 15:19) — 작업은 §2의 «선행 조건 순서»로만 관리한다. 진행 가능한 작업은 «지금» 진행하고, 동결·검증·전환은 조건 충족 즉시 실행한다.
- baseline §33.4(14일표)는 원문 유지 — 운영 순서는 본 §2가 기준(운영자 하명 근거). Feature Freeze = **S5 종료 시점**(§33.1의 «Day 8» 대응).
- 범위 = **P0만**(§12.1). P1/P2는 P0 완료·독립 검증 후 운영자 승인(§12 원칙 유지).
- 🔴 **품질 기준(운영자 확정 08-28 15:06)**: PoC는 «내용 범위가 작은 것»이지 품질이 낮은 게 아니다 — Python 백엔드는 비동기·분산처리 **전문가 수준 구조·확장성**, 실무 투입에 손색없게. 단 당장 수만~수십만 건 처리 규모는 아니므로 «구조의 확장 경계 보존»이 기준이지 조기 스케일링이 아니다. 구체 원칙 = system-architecture §7(Phase 2 AC 결속).

## 2. 작업 순서 (선행 조건 기반 — 날짜 배정 없음 · Exit 충족 «즉시» 다음 단계 · Exit Evidence = 발주 AC의 상위 기준)

| # | 단계 | 선행 | Exit Evidence |
|---|---|---|---|
| S1 | Phase 0 마감: UX 승인·산출물 8종·독립 검증·contracts/ontology 동결 | — | T0-9 PASS · D-002 ✅ · 동결 선언 |
| S2 | skeleton: Next.js·FastAPI boot · DB schema · synthetic seed · test harness | S1 동결 | 각 service boot + contract test PASS |
| S3 | data→index: synthetic docs · ingestion · pgvector · Neo4j projection · 3-전략 retrieval | S2 | seed→index 재생성 · 동일 질문 전략별 raw result |
| S4 | agent backend: LangGraph E2E 기준선 + WebSocket streaming | S3 | Golden Scenario backend PASS · 실제 event streaming |
| S5 | P0 핵심 UX: Overview·Incident·Evidence·Work Order·Approval → 🔴 **Feature Freeze** | S2(셸 병행 가능) · S4(실데이터 연결) | Golden Scenario UI E2E PASS |
| S6 | Replay Sandbox · session 격리 · reset · Gate smoke(1~5 축소판) | S5 | 노트북 OFF E2E PASS · smoke evaluation report |
| S7 | 🔴 **배포**: Vercel·Tunnel·fallback · 보안 필수 게이트(§16.3) · 외부 네트워크 검증 | S6 | **Public RC URL + 외부 접근 E2E PASS** |

## 3. 배포 후 트랙 (시한 외 · 별도 재가)

정밀 Gate 1~8 전건(§32) · Full Benchmark·KPI Evidence(§34.8) · README 완성·데모 영상·Release checklist(§35) · NOTICE 등 §34.2 구조물 · 🔴 **UX 폴리시 패스**(D-002 유보 조항: 색상·디자인 재작업 + 모션·애니메이션 — 기능 완료 후 집행 · 시인성·기능 포커스는 Phase 3 구현 AC에 선반영). **배포 = RC이지 release closure가 아니다** — 측정-주장 경계(§0.2)에 따라 배포 시점 수치는 «잠정 목표»로만 표기.

## 4. Phase 상태 (baseline §21 — 상태만 추적)

| Phase | 내용 | 순서 매핑 | 상태 |
|---|---|---|---|
| — | 부트스트랩: 리포·SSOT·팀·Public 개설·CI | 완결 | ✅ |
| 0 | 제품·UX 방향 확정 | S1 | ✅ (T0-9 완결 · contracts/ontology 동결) |
| 1 | SSOT·Ontology·Synthetic Data | S2~S3 | ✅ (08-29 19:05 완결 25/25) |
| 2 | Retrieval·Agent Backend | S3~S4 | ✅ (08-30 15:58 게이트 통과 — T2-1~T2-6 독립 검증 전건 PASS) |
| 3 | Always-on Sandbox UX | S5~S6 | ⏳ 진행 — 6티켓(T3-1~T3-6 · 분모 31→37) · 진입 재가 08-30 15:58 |
| 4 | Live AI 연결(Tunnel·streaming·fallback) | S7 | 대기 |
| 5 | 평가·보안·운영(Gate 1~8 전건) | 배포 후 | 대기 |
| 6 | 포트폴리오 패키징(영상·README·Release) | 배포 후 | 대기 |

## 5. 실행 규율 (baseline 포인터 + 운영 사이클 — 운영자 확정 08-28)

- **플랜 계층(위→아래 단방향)**: 본 플랜(전략 · 변경 = 운영자 재가) → 티켓(`docs/plan/ticket-ledger.md` — Phase 분해 · 티켓마다 AC · 상세+하위 태스크 = `docs/plan/tickets/T{ID}.md` 1티켓 1파일 · 발주 시 생성) → 원장(티켓별 ✅/총 = 진행률 유일 정본 · 가중치 금지) → PROGRESS(«지금» 티켓만) → CHANGELOG(끝난 것 append). 같은 사실은 한 곳에만.
- 🔴 **살아있는 플랜**: 설계 변경·추가 요청·불필요 작업이 발생하는 «즉시» 플랜·티켓 md를 갱신하고 방향을 재정렬한 뒤 지속한다 — 플랜과 실제가 갈라진 채 진행 금지. scope급 변경의 재가 축 = 운영자 직보 유지(문서 갱신 자체는 오케 상시 업무).
- **cycle 루프**: 보드 순서 확정(운영자 우선순위 보존) → 티켓별 발주(실멘션+AC 동봉) → ack → 점검 → 검수(독립 검증 좌석 경유 — 구현자 자기 검증만으로 닫지 않는다) → 반영 → 원장 갱신+즉시 1줄 보고 → cycle 마감 4항.
- 🔴 **독립 검증 전면 의무(운영자 확정 08-28 14:41)**: **설계·구현·테스트 산출물 전부**(오케 몫 포함) 검증 좌석 독립 검증 PASS 없이는 완료로 계수하지 않는다.
- 🔴 **중간 보고 의무(운영자 확정 08-28 14:42)**: 오케는 **최종 검수 완료 시점마다** 운영자에게 중간 보고한다(티켓 묶음·Phase 게이트 단위).
- 🔴 **컨텍스트 임계 3단계(운영자 재가 08-28 17:31 · id 1542813843405934622)**: **40% = 인계물 정리 시작 · 50%(soft) = 교대 착수 · 60%(hard) = 완주 기한** — 마감 자체가 5~10%p를 소모하므로 50~60% 구간은 교대 «실행» 전용 마진. 전 좌석 동일 · 팀원 감시·선제 호출 = 오케.
- **Phase 게이트**: 전환 = DoD 실측 충족 + 운영자 직보 후 진입 · Gate 8종(§32)·측정-주장 경계(§0.2)를 Phase DoD에 결속.
- **변경 관리**: scope 변경·모호점·destructive = 즉시 운영자 회귀 · 결정 대기 항목엔 권장 1줄 병기 · 재가 인용 = 원문 message id.
- 발주 단위 = 티켓 · 발주문에 AC(Target/Actual/PASS·FAIL 분리)·필요 컨텍스트 동봉 · 판정 = 오케.
- **진행률·보고 서식(운영자·교육 확정 08-28)**: 진행률 = 🔴 **삼중 표기**(「현 Phase = N/M ≈%(원장 E1) · 전체 = Phase x/6(미분해 명시) · **전체 계획 대비 ≈%**(S1~S7 단계 가중 — 미분해 구간은 E3 소견 명기 · 전 Phase 분해 시 원장 E1 산법 전환)」 · 분모 변경은 % 앞에 선행 선언 · 전체 계획 대비 상시 표기 = 운영자 확정 08-28 20:54 · id 1542864839565770883·1542864909283364925) · 보고 3종 default(태스크 완료 시마다 3단 · 병합 직후 1줄 · cycle 마감 4항{잔여 0건도 명시}) · 현황 보고 = ①전체 ②진행중 ③닫음(근거) ④다음(= checkpoint 「다음」과 동일 값 · 결정 대기엔 권장 1줄) ⑤팀(좌석별 ctx·유휴) 고정 순서.
- **확정 기록** = `docs/decisions/NNN-*.md` — 수정 대신 새 번호(구본 superseded 표기) · 기록 6요소: 결정 1줄 · **결정의 범위(기각안 포함)** · 근거 상신 요지 · **승인 원문 무수정 인용**(해석은 별줄) · 승인 id · 일시 · 비확정 논의를 확정처럼 인용 금지 · 상신 시 결정 대기 항목마다 권장 1줄 병기.
- **누락 방지 장치**: 신규 파일 = 생성 커밋에서 루트 `INDEX.md` 등재(미등록 0 = 검출기) · 문서별 frontmatter `size_limit` = 비대 검출기(초과 = 회전·다이어트) · PROGRESS done 10행 초과 = CHANGELOG 회전 · 재개점(checkpoint)은 백지 재작성(이력 축적 금지 — 이력은 CHANGELOG·회고 몫).
- 🔴 **git 작업 구조(08-28 공유 index 사고 후 · 운영자 확정 14:54 · 교육 표준 반영)**: 좌석별 worktree(`../_wt/{seat}[-{조각}]` — 예: `repos/_wt/senku2-t1-4` · `lane/{seat}-{조각}` 브랜치 · 🔴 경로 정본 정정 08-29: 구표기 `../fkt-{seat}`는 실물과 갈라져 폐기 — 실물 우선)에서 작업·커밋 — 주 체크아웃 = 오케 전용. **통합 = lane push → PR(1티켓 1PR) → 오케 리뷰·서버 측 merge commit → 완료 PR의 worktree·브랜치 즉시 정리.** 🔴 develop 직접 push는 **전 좌석 소거**(오케 포함) — 로컬 develop = pull-only. non-ff 거부 = 「정본 경로 밖 커밋」 신호: force 금지 → 원격 실물 확인 → 뒤처짐이면 ff-pull · 고아 커밋이면 브랜치로 빼 PR. `add -A`·`commit -a`·`--amend`·`reset` 금지, 경로 지정 add만.
- 🔴 **원장 귀속 표준**: 원장 행에 담당 slug + 근거(PR#·sha·보고 id) 병기 · 귀속 분쟁 정본 = 보고 원문 message id · 원장 정정은 owner 단독 write + **정정 사실 append**(조용한 덮어쓰기 금지 — 정정 정본 = git log).
- 🔴 **신 팀 기동 전 점검 6축(08-28 사고 후 신설)**: ① git 격리(좌석별 worktree·주 체크아웃 오케 전용 — `git worktree list`+좌석 cwd 실측) ② 크리덴셜 계보(공유/독립 명시) ③ 수신 범위(좌석별 access) ④ 네임스페이스(기억·홈 격리) ⑤ SSOT writer 단일 지정 ⑥ 스폰 맵(모델·역할·cwd). 팀 확장·재기동 시 전 축 실측 후 기동.
- lane(§33.2→3좌석 매핑 = CLAUDE.md §3): 오케 = contracts·docs·통합 / 구현 = apps·services·data·ontology / 검증 = benchmarks·tests·evidence.
- 매일 통합 주기(§33.5) 최소 2회 · Golden Scenario 회귀 = 최우선 복구(§33.1) · Stop 조건(§33.6) 발생 = 신규 기능 중단→운영자 회귀.
- 순차 의존성(§33.3): Ontology→DB→Graph · Contract→Backend→Frontend · Live Golden Scenario→Replay Fixture→Sandbox.
