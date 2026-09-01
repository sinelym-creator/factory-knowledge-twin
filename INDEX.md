---
asset_class: index
description: 리포 자산 목차 — 신규 파일은 생성 커밋에서 여기 등재(미등록 0 = 누락 검출기)
status: active
lifecycle: 파일 추가·이동·삭제 커밋에 동반 갱신
size_limit: 4KB
---

# INDEX — factory-knowledge-twin

| 경로 | 역할 | 갱신 시점 |
|---|---|---|
| `CLAUDE.md` | 리포 주법 | 규율 변경 시 |
| `README.md` | 공개 첫 화면 | release 단계(baseline §34.7) |
| `project-plan.md` | 확정 계획 요약 단일본(7일 일정·운영 사이클) | 변경 «즉시»(살아있는 플랜) |
| `PROGRESS.md` | 현황판 — «지금»만 · done 10행 초과 → CHANGELOG 회전 | 상태 변동 시 |
| `CHANGELOG.md` | 이력(append 전용) | 회전·완결 시 |
| `INDEX.md` | 자산 목차(본 파일) | 파일 증감 커밋 동반 |
| `LICENSE` | Apache-2.0 | — |
| `docs/baseline/poc-baseline-v0.2.md` | 단일 baseline 정본 | §0.3 절차로만 |
| `docs/plan/ticket-ledger.md` | 티켓 원장 = 진행률 유일 산법 | 단위 완료·분모 변경 시 |
| `docs/plan/tickets/` | 티켓 상세(1티켓 1파일) | 발주 시 생성 |
| `docs/decisions/` | 운영자 확정 기록(개정 = 새 번호 · 승인 원문 id 추적) | 확정 시 |
| `docs/product/` | 제품 설계 문서(brief·시나리오·아키텍처·UX·wireframe·환경) | Phase 진행 시 |
| `packages/contracts/` | API·이벤트 계약(🔴 동결 v0.1 · 오케 전용 write) | 개정 절차로만 |
| `packages/ontology/` | 온톨로지·투영 버전 정본(`ontology-version.json` §3.3 · `projection-version.json` SemVer+manifest 지문 — T1-4·T1-5) | 스펙·manifest 개정 동반 |
| `apps/web-console/` | Next.js 웹 콘솔(A안 AppShell·P0 6라우트·세션 가드 proxy·`lib/contract.ts` 단일 fetch 표면(+ D-12d `registerServerFetch` 구멍) · `lib/server-dns.ts` D-12d DNS 우회 lookup(family 4 → DoH 2곳 병렬 → 캐시 → 원래 오류 · undici Agent · #316) · `instrumentation.ts` 서버 부팅 주입·`scripts/contract-surface.mjs` 검사기 — T1-9) · **T4-2a 정적 replay**: `lib/static-replay/{index,run-id,visitor-state}.ts`(정적 이벤트 주입·mode 치환·`STATIC-GS-01` 상수·browser storage) · `components/static-visitor.tsx` · `scripts/harvest-static-replay.mjs`(굳히기 도구 · ai-api 읽기만 · 사람 1회) · `scripts/copy-static-replay.mjs`(prebuild/predev · sha256 잠금 · 네트워크 0) · 산출물 `lib/static-replay/generated/` gitignore(PR#216·#220) · `lib/boot-check.ts` = FKT_API_BASE + FKT_PUBLIC_HTTPS 빌드 상수 대조(Q-37·D-4 · PR#222) | 화면 구현 진행 시 · `vercel.json`(T4-3 ⓓ · Root Directory 기준 · install/build 명령 고정 — PR#268) · D-11: `app/api/[...path]/route.ts`(함수 프록시 · `force-dynamic`·`maxDuration=300` · WS 만 rewrite — PR#293) · `scripts/retry-drill.mjs`(`call()` GET 재시도 드릴 8케이스 · `pnpm retry:drill` — PR#289) |
| `services/ai-api/` | FastAPI 백엔드(+ db/migrations) | S2~ 구현 |
| `services/indexer/` | 색인 파이프라인(동결 chunk 정책 정본 `FROZEN_POLICY`·probe 도구 2종 — T1-4) | S3 색인 진행 시 |
| `services/projector/` | Neo4j 투영(manifest 코드 정본 `--check-spec`·build·verify 값 전량 대조 — T1-5) | 스펙 §2.1 개정 동반 |
| `infra/` | 로컬 인프라 보조(postgres init SQL) · **T4-3 배포 운영 자산(PR#268·#270·#273)**: `tailscale-funnel-runbook.md`(Funnel 절차·헤더 실측 E1/E2·외부 vantage 판별) · `vercel-deploy.md`(Root Directory·env 갈래·배포 후 확인 3줄) · `laptop-operating-conditions.md`(§14.4 노트북 조건·재부팅 확인법·§4-bis 감시) · `health-check.ps1`(4상태 rc · `-Containers` 실물 이름) · `container-budget-watch.ps1`(예산 계기 · 망 단위 벌 · rc 0/1/2/3) + `fixtures/budget-watch/*.json`(자기 계측 표본 4) · **D-13 복구 자산(PR#323)**: `neo4j-restore.ps1`(논리 덤프 3본 → 빈 neo4j 재적재 · UNIQUENESS 만 · `__rid` 임시키 · 자기 검증 309/448·라벨·관계 분포 · 비밀번호는 컨테이너 안에서만 · 순서 = 새 볼륨이면 `migrate.ps1` 선행) | 배포 형상·운영 규칙 변경 시 |
| `tests/contract/` | 계약 테스트 harness(러너·케이스·strict coverage) | 계약 개정 동반 |
| `tests/schema/` | 스키마 제약 probe(트랜잭션 롤백·잔여물 0) | 스키마 개정 동반 |
| `tests/graph/` | 그래프 투영 독립 검증(스펙 독립 파싱 `graph_verify` 18축 · 끊김/변조 드릴 `graph_drill` 22축 · 러너 — T1-5 검증) | 투영 개정 동반 |
| `tests/web/` | 셸 E2E 검증(playwright 9스펙 — shell·session-guard·reset-modal·mode-badge·phase2-evidence·t3-2-screens·t3-3-evidence·t3-4-run-screen·t3-5-wo-screen(PR#225) · 검사기 드릴 17주입 · d12_enter_retry_budget 시간 예산 그물(#302) · d12b_cause_redaction_probe 리댁션 반대 표본 9행(#308 · Q-68 정본 대조군) · 독립 표면 스캔 `surface_scan` · 토큰 프로브 · 라우트 매트릭스 — T1-9 검증) · T4-1 드릴 3종 `t41_csp_walk`(CSP 전 동선 · 자기 검증 2/2) · `t41_live_status_timeout`(상한과 «화면이 말한 시각» 분리 — D-3 검출) · `t41_cors_browser_drill`(닿는다≠읽힌다) + 보조 서버 2종 `_blackhole_server`(응답 없는 API) · `_origin_page_server`(CSP 없는 타 origin 페이지) · `README.md`(회귀 조건 4줄 · PR#218) · T4-4 §3-2 대조군 하네스 2본 `_ctrl_stimulus_equivalence`·`_ctrl_ssr_reach`(PR#264) · T4-4 외부 축(PR#281 · 리바이2 18대): `t44_client_axis_gate6.mjs`(관측자 축 §3-2 치환 · 연결 거부 60ms ≠ 블랙홀 2,022ms) · e2e `t4-4-viewport-mobile.spec.ts`(폭별 외부 9/9 · networkidle 대기 삼킴) · Gate 6 그물(PR#292 · 리바이2 19대): `t44_gate6_c_static_replay.mjs`(노트북 OFF = /api 전건 차단 vs 무자극 · 열 C 자극 실재) · `t44_gate6_d_ws_recovery.mjs`(WS 1011/1000 · 재조회 줄 :166/:170) · `d11_retry_observation.mjs`((C) 재시도 부수 관측 · 판정 없음) | 셸 개정 동반 |
| `tests/api/` | retrieval API 독립 그물(앵커 경계 드릴 — 표기 변형 교차·생존 신호 exit 2 · 경계 직접 probe · 계약 오류 형상 드릴 — T2-1 검증) · 🔴 Q-62 소유 안전장치 `_ownership.py`(2단 문 · self_check 양면+⑦ 실물 확인 · 진입점 6본 배선 — #255·#262·#263 · 걸쇠 = #265 보류) · T4-4 귀속 외부 모드 `_colocation.py`(`FKT_COLOCATION_LOCAL_PROBE` 명시 시만 · 쓰기 0 · 변이 B 양성1·음성3 — PR#281) · Gate 6 드릴 `Unowned` 건너뜀(#277) | retrieval 개정 동반 |
| `data/replay/` | replay fixture(재생 자산 · 🔴 seed 원천 아님 — README 성문 · JSONL·무가공·LF 고정 — T2-4) · `static/`(T4-2a · 조회 응답 사본 28건 + `manifest.json`(라우트·apiBuildSha·sha256·queriedBy) · 굳히기 도구 산출 · 원문 무가공 · `.gitattributes eol=lf` · PR#216) | fixture 재녹화 · 정적 사본 재굳힘 시 |
| `tests/data/` | seed 무결성 probe 28건(C-21~C-28 그물 포함) + net-liveness 생존 시험 + binding-scope 사정거리 probe + 자기점검 mutation 시험 + eval-chunk-binding(평가 chunk 좌표 그물) + transition-net(상태 전이 그물 27판정·증분/절대 이축 — G-3·E-7) | seed 개정 동반 |
| `data/` | synthetic seed 생성기(generators/·verify SQL·seed.ps1) | Phase 1~ 데이터 진행 시 |
| `benchmarks/` | 평가 데이터셋·결과(datasets/eval-questions 등) | 평가 축 진행 시 |
| `evidence/` | 독립 검증 보고 — 티켓별 판정문 `t{n}-{m}-*-verification.md`(phase0 ~ t4-2b · t3-5-wo-screen #225 · t4-2a #241 · t4-2b-live-guard #250·#260 · t4-4-external-gate6 골격 #256 · t4-3-public-rc(C 칸 재부팅 한정 · #298) · d12-enter-retry(형태 (나) · #302)) · 🔴 `t4-4-stimulus-equivalence-control.md`(#264 · §3-2 치환 대조군 정본 = 클라이언트 축 한정·SSR 층 갈림) · 그물 계획 `t3-6-e2e-axis-plan` · Q 실측(q40~q45) · 재검 로그 | 검증 시 |
| `.workspace/handoffs/` | 오케 선작성 발주문(세대 승계 · 트리거 대기 문면 · 팀 채널 발신 시 그대로) — `suzaku8-orders-20260831.md`(§A T4-2b wake · §B T4-2a 검증) · `suzaku9-orders-20260831.md`(§A D-3 · §B T4-2a 2조각 · §C T3-5 ②′ · §D PR-1 검증 · §E 리바이2 15대 wake · §F 재부팅 후 10대 1착) · `suzaku10-orders-20260831.md`(§A T4-1 ②′ · §B T4-2b PR-1 서버 축 · §C PR-1 검증 · §D 완결·관문 서식 · §E 11대 1착) | 교대·마감 시 |
| `.github/workflows/ci.yml` | CI 위생 게이트(GitHub-hosted 전용) | 게이트 확장 시 |
| `.claude/context/checkpoint.md` | 재개점(로컬 전용·비추적 · 백지 재작성) | 세션 마감 시 |
| `docs/plan/phase4-5-decomposition.md` | P4·P5 분해안(분모 37→46 · 결정 5건 · 관문 산정 · 선택지 ⓑ — 폐하 재가 08-31 09:55/09:57 · 원장 등재 10:05) | 분모·순서 변경 시 |
| `docs/plan/tickets/T3-4.md` · `T3-5.md` · `T3-6.md` | Phase 3 «최소 형상» 티켓(조사 실행·전략 비교 화면 / WO 편집·승인 화면 — Feature Freeze 조기 08-31 09:57) + Phase 3 통합 독립 검증(§21 증거 4종 · Gate smoke · 그물 선행) | 발주·완결 시 |
| `docs/plan/tickets/T4-1.md` · `T4-2.md` · `T4-2a.md` · `T4-3.md` · `T4-4.md` | Phase 4 티켓(공개 형상 골격·Q-37 해소 / Live 보호장치·fallback·queue / 정적 replay 경로 — T4-2 단위 분해 ⓐ · Q-51 / Tunnel·Vercel 공개 RC — 🔴 폐하 확인 2건 · 갈래 (b) Funnel / Phase 4 통합 독립 검증 — Gate 6 8행 외부 축 · §21 증거 4종 · 그물 선행) — 발주 시 status 갱신 | 발주·완결 시 |
| `docs/plan/tickets/T5-1.md` ~ `T5-5.md` | Phase 5 티켓 선작성(폐하 하명 08-31 23:25 「설계 미리 준비 · P5 까지 자동 승인」): Evaluation Lab(40문·4전략·800회·§30) / Gate 7 13항+이력 secret scan / CI 4 workflow §34.3~34.4 / 운영 runbook·자동 시작·clean env / Phase 5 통합 검증(Gate 1~8 전건·§35 점검표) | 발주 시 status 갱신 |
