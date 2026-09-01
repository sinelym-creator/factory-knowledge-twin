---
doc: Phase 4·5 분해안(분모 선언) — 재가본
author: 스자쿠 7대(오케)
date: 2026-08-31 09:50 상신 · 10:05 승격
status: ✅ 재가 완료 — 결정 5건 전체 승인(폐하 09:55) · 추가 결정 2건 권장안 승인(09:57 = ⓐ 분모 37→46 등재 · ⓑ Feature Freeze 조기 + T3-4·T3-5 최소 형상 + P4 병행) → 원장 등재 10:05(Phase 4·5 섹션) · 티켓 T4-1·T4-2 선작성 · 이후 변경 = 본 문서 개정 + 원장 「N→M」 선행 선언
정본: baseline §21 Phase 4·5 산출물·완료 증거 · §6.2 · §13 · §14 · §16.3 · §17 · §18 · §30.9~30.10 · §32 Gate 5~8 · §34.3 · project-plan §2 S7 · §3(배포 후 트랙 = 별도 재가 조항 → 본 상신이 P5 재가 요청을 겸함)
---

# Phase 4·5 분해안 — 분모 37→46 선행 선언

## 0. 기존 자산 대조 (E1 — 리포 실측 08-31 09:45)

| Phase 4 산출물(§21) | 상태 | 근거 |
|---|---|---|
| WebSocket streaming | ✅ 착지 | `services/ai-api/app/routers/investigations.py` `/ws/runs/{runId}` · T2-3 완결(계약 v0.1.2~3) |
| Live/Offline detection | ◐ 내부축만 | `GET /live/status` + `components/live-status.tsx`(4상태 · 30s poll) — «외부(Tunnel) 축·bounded timeout» 미실증 |
| fallback과 queue | ◐ 부분 | Replay fixture 32건(T2-4) · `run_stopped(timeout)` 이벤트 존재 — 동시 제한·bounded queue·rate limit·TTL 정리 없음 |
| one-click reset | ✅ 착지 | T3-1 reset(가드·소유권) |
| Tunnel 연결 | ✗ 없음 | compose = postgres·neo4j 2서비스뿐(ai-api·tunnel 미등재) · Vercel 배포 없음 · Q-37(env 빌드 타임) 미해소 |

| Phase 5 산출물(§21) | 상태 | 근거 |
|---|---|---|
| Evaluation Lab | ◐ 초안 | `benchmarks/datasets/eval-questions-draft.md`(48KB) · 3전략 retrieval(T2-1) — 실행기·지표 9종·artifact §30.10 없음 |
| rate limit·bot protection | ✗ | §16.3 미구현 |
| audit/replay | ◐ | Gate 5 실질 실증(T2-4 무가공 fixture) — 정밀 판정문 없음 |
| deployment/runbook | ✗ | `docs/product/dev-environment.md`(개발용)만 |
| demo 장애 대응 절차 | ✗ | Gate 6 매트릭스 미검증 |
| CI 게이트 §34.3 | ◐ | `ci.yml` = hygiene 1 job(Q-30 계보) — security.yml·benchmark-smoke.yml 없음 |

## 1. Phase 4 — Live AI 연결 (S7 · 4티켓)

| # | 제목 | 좌석 | 범위·AC 요지 | Exit Evidence | 선결 |
|---|---|---|---|---|---|
| T4-1 | 공개 형상 골격·env 주입 | 구현 | compose에 ai-api(+tunnel 자리) 등재 · web-console 배포 빌드 = **Q-37 해소**(FKT_API_BASE 빌드 타임 주입 정식화 · 공개 API base 갈래) · ai-api CORS allowlist·security header·CSP·HTTPS 가정 · `/live/status` 외부축 bounded timeout. AC: 1커맨드 «공개 형상» boot · 계약 회귀 22종 PASS · 브라우저 네트워크 축(타 origin CORS 통과/차단 대조군) | 공개 형상 boot + contract test PASS | T3-3 완결(셸 안정) — apps/services 분리 lane으로 병행 가능 |
| T4-2 | Live 보호장치·fallback·queue | 구현 | Live 동시 1~2 + bounded queue(초과 = 큐/Replay 안내) · run timeout → `run_stopped(timeout)` + Replay 안내 · IP/세션 rate limit(429 계약 형상) · body/자연어 길이 상한 · session TTL 자동 정리 · WS 재연결/상태 재조회(§17.2) · Live 실패 시 Replay 자동 제안(§6.2). AC: 동시 3요청 → 2 실행+1 큐 실측 · timeout 강제 → 안전 종료 · TTL 만료 = 404 은닉 유지(T3-1 그물 회귀 0) | 동시 제한·timeout 검증(§21 완료 증거 ④) | T4-1 — 병행 가능 |
| T4-3 | Tunnel·Vercel 공개 RC | 구현 · 🔴 운영자 게이트 | Tunnel 기동(선택 = 폐하 결정 ①) · Vercel Hobby 배포(공개 행위 — 결정 ②) · 노트북 운영 조건 §14.4(서비스 자동 시작 · 재부팅 후 health) · 외부 네트워크+모바일 접속 | **Public RC URL + 외부 접근 E2E PASS**(= S7 Exit) | T4-1·T4-2 · 결정 ①②③ |
| T4-4 | Phase 4 통합 독립 검증 | 검증 | Gate 6 축소판 8행 장애 매트릭스(외부 축) · §21 완료 증거 4종(외부·모바일 접속 · Live 조사 실행 · 노트북 종료 시 Replay 전환 · 동시 제한·timeout) · 그물 선행 소조각(T2-5 패턴 — T4-2 착지 전 API 축부터) | 판정문 `evidence/t4-*` | T4-1~T4-3(그물 선행) |

## 2. Phase 5 — 평가·보안·운영 (5티켓 · plan §3 별도 재가 = 본 상신)

| # | 제목 | 좌석 | 범위·AC 요지 | Exit Evidence | 선결 |
|---|---|---|---|---|---|
| T5-1 | Evaluation Lab | 구현 | dataset 40문(§18.3 7유형 · draft 기점) → questions/ground-truth jsonl · 3전략 비교 실행기(T2-1 기반) · deterministic 지표 9종(§18.2) · artifact §30.10 · evaluation report(Target/Actual 분리 · 실패 raw 포함 · 재현 메타 4종 · LLM judge 0 §30.9) | evaluation report | T2-1 ✅ — 즉시 병행 가능 |
| T5-2 | Gate 7 Security·Abuse 그물 + credential scan | 검증 | 13항 negative test(SQL·Cypher·prompt injection · 임의 tool · 관리자 endpoint · 타 세션 · oversized · rate limit · 잘못된 WS · path traversal · CORS 우회 · trace/env 노출 · 승인 우회) · secret scan(local+CI) · 기존 injection_surface·credential_leak 드릴 확장 | abuse negative test 판정문 + credential scan 0 | T4-2(rate limit·CORS 착지) — API 축은 선행 가능 |
| T5-3 | CI 게이트 §34.3 | 구현(결정 ⑤) | `ci.yml` → FE/PY lint·typecheck·test · API contract · fixture schema · SSOT manifest · ontology · Docker build · Replay E2E smoke · `security.yml`(CodeQL·dependency audit·container scan·license inventory·public endpoint policy) · `benchmark-smoke.yml`(8~10문) | 3 워크플로 green(러너 실측) · Q-30 회귀 0 | T5-1(smoke 질문) 부분 |
| T5-4 | 운영 runbook·장애 대응·자동 시작 | 구현 | deployment/runbook(§14.4 · Tunnel/Docker 자동 시작 · 재부팅 후 health check 스크립트) · demo 장애 대응 절차(Gate 6 8행 대응) · clean environment 실행 절차(새 클론 → 1커맨드) | runbook + clean env 실행 실측 기록 | T4-3 |
| T5-5 | Phase 5 통합 독립 검증 | 검증 | Gate 1~8 «전건» 정밀 판정(Gate 5 Live·Replay equivalence 재실증 + audit summary) · restart recovery test(실 재시작 → health → GS 완주) · clean env 실행 검증(타 경로 새 클론) · Release checklist §35.1~35.5 사전 점검(35.6~35.7 = Phase 6) | §21 Phase 5 완료 증거 5종 전건 | T5-1~T5-4 |

## 3. 폐하 결정 사항 (팀 밖 · 오케 대신 정하지 않음)

| # | 사안 | 선택지 | 오케 권장(E3) |
|---|---|---|---|
| ① | Tunnel | Tailscale Funnel(도메인 불요 · 무료 · beta) / Cloudflare Named Tunnel(고정 domain 필요) / Quick Tunnel(개발 전용 · SSE 미지원) | 초기 공개 = Tailscale Funnel → 최종 = Named Tunnel(도메인 확보 시) |
| ② | Vercel Hobby 배포 | 공개 행위(GitHub Public 연결) — 운영자 계정·확인 필요 | T4-3 착수 전 확인 1회 |
| ③ | Bot protection | Turnstile(Cloudflare 계정) / 동등 보호(rate limit+allowlist+TTL) | S7 = 동등 보호로 통과 · Turnstile은 T5-2에서 계정 가능 시 |
| ④ | Cloud DB(Neon·AuraDB) | 사용 / 미사용(정적 snapshot + 노트북 Live) | 미사용 유지(무료 quota 검증 부담 회피 · §14.1 기본 체험은 snapshot) |
| ⑤ | `.github/**`·`infra/**` write scope | baseline §33.2 미지정 | 구현 좌석(판정은 검증 좌석 hygiene drill 교차) |

## 4. 관문 수·소요 산정 (E3 — 6대 회고 ③ 방식: 페이스가 아니라 «남은 관문 수 × 왕복 시간»)

- 잔여 관문 = Phase 3 잔여 4(T3-3 완결 임박 · T3-4 최대 덩어리 · T3-5 · T3-6) + P4 4 + P5 5 = **13**.
- Phase 3 실측 왕복: T3-1 ≈ 2.5h · T3-2 ≈ 8h(재검 포함) · T3-3 ≈ 9h(FAIL) — 티켓당 평균 ≈ 5h(구현·검증 직렬 왕복 포함).
- 2좌석 병렬(구현·검증 분리 lane) 기준 낙관 2.5h/티켓 → 13 × 2.5 ≈ 32h · 현실 5h → 60h+. **「금일 P4·P5 완료」는 관문 수로 성립하지 않는다.** 금일 도달 가능(E3) = T3-3 완결 + T3-4·T3-5 + P4 T4-1·T4-2(구현 병행) ≈ P4 절반.
- 폐하 선택지: ⓐ 순서 유지(P3 완결 → P4 → P5 · 정직 ETA = P4 명일 · P5 모레) ⓑ Feature Freeze 조기 선언(T3-4 replay UI·T3-5 WO 화면을 «최소 형상»으로 축소) + P4 즉시 병행 ⓒ 좌석 증원(구현 2석 — 함대·예산 = 폐하 영역 · 자비스 소관 열쇠 계보 영향).
- 오케 권장 = ⓑ(정본 §33.1 Day 8 동결 대응 · 공개 RC가 포트폴리오 가치의 분기점) + ⓒ는 폐하 판단.

## 5. 진행률 (분모 변경 선행 선언)

- 현재: 원장 33/37(P3 3/6 «+미해소 1축») · 전체 Phase 3/6(P4~6 미분해) · 전체 계획 대비 ≈60%(E3).
- 재가 시: 분모 **37→46**(T4-1~4 · T5-1~5 등재) → 33/46 ≈72%(원장 E1 · Phase 6 미분해 잔존) · 전체 계획 대비 산법 = Phase 6 분해 전까지 E3 유지.
