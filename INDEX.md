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
| `README.md` | 공개 첫 화면 — 「▶ 실행」 절(runbook §4 정본 지목 · 전제조건 실측표 · #365) · 「Release 후보 — 축소 적용(v0.3)」 · KPI «측정 전 빈 칸» | release 단계(baseline §34.7) |
| `project-plan.md` | 확정 계획 요약 단일본(7일 일정·운영 사이클) | 변경 «즉시»(살아있는 플랜) |
| `PROGRESS.md` | 현황판 — «지금»만 · done 10행 초과 → CHANGELOG 회전 | 상태 변동 시 |
| `CHANGELOG.md` | 이력(append 전용) | 회전·완결 시 |
| `INDEX.md` | 자산 목차(본 파일) | 파일 증감 커밋 동반 |
| `LICENSE` | Apache-2.0 · 부록 보유자 = `Copyright 2026 sinelym-creator`(폐하 재가 09-02 08:59 ① · #360) | 보유자 변경 = `NOTICE` 와 한 PR |
| `NOTICE` | Apache-2.0 NOTICE(프로젝트 · 보유자 = LICENSE 와 바이트 동일 · 3rd-party NOTICE 전달 문구) — baseline §34.2 필수 파일 · #360 09-02 | LICENSE 와 함께 |
| `THIRD_PARTY_NOTICES.md` | 의존성 라이선스 인벤토리(실측 09-02 · JS 341(prod 59) · Python 80 · unknown 0 · copyleft prod 1 = sharp LGPL 바이너리 · 모델 e5-small MIT(E2) · synthetic 데이터) — baseline §35.5 · #360 | 의존성 변경 시 재실측 |
| `docs/baseline/poc-baseline-v0.2.md` | 단일 baseline 정본 — **v0.3 축소 적용 개정 09-02(#356 · 1-A~1-G · 파일명 유지)** | §0.3 절차로만 |
| `docs/plan/ticket-ledger.md` | 티켓 원장 = 진행률 유일 산법 | 단위 완료·분모 변경 시 |
| `docs/plan/tickets/` | 티켓 상세(1티켓 1파일) | 발주 시 생성 |
| `docs/decisions/` | 운영자 확정 기록(개정 = 새 번호 · 승인 원문 id 추적) — 001 7일 계획 · 002 UX 방향 A · 003 Q-30 이력 잔존 · **004 §35.7 최종 관문 「Release 후보 — 축소 적용(v0.3)」 + D-21 ⓐ(폐하 「전건 권장안 승인」 09-02 16:59 · id 1544617819784609803)** | 확정 시 |
| `docs/product/` | 제품 설계 문서(brief·시나리오·아키텍처·UX·wireframe·환경) | Phase 진행 시 |
| `docs/deployment/runbook.md` | **운영 runbook(T5-4 · PR#335)** — 재부팅 후 절차(손잡이 = `restart` 정책 1:1 · 로그온 0단 · `health-check.ps1` 두 층 `-Containers` 필수) · 자동 시작 두 축 · Funnel OFF/ON 실측(§2-1 · off 는 8443 핸들러까지 제거 · 복원 `--bg --https=8443 8010` · reset 금지) · Gate 6 8행(실측 2행 절차 · 미실측 6행 명시) · clean env 3단(compose→migrate→seed · `VOLUME_ROOT` 리포 밖 · D-13) · D-14 배포 상한·열쇠 창 | 운영 형상 변경·T4-4 실측 추가 시 |
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
| `tests/api/` | retrieval API 독립 그물(앵커 경계 드릴 — 표기 변형 교차·생존 신호 exit 2 · 경계 직접 probe · 계약 오류 형상 드릴 — T2-1 검증) · 🔴 Q-62 소유 안전장치 `_ownership.py`(2단 문 · self_check 양면+⑦ 실물 확인 · 진입점 6본 배선 — #255·#262·#263 · 걸쇠 = #265 보류) · T4-4 귀속 외부 모드 `_colocation.py`(`FKT_COLOCATION_LOCAL_PROBE` 명시 시만 · 쓰기 0 · 변이 B 양성1·음성3 — PR#281) · Gate 6 드릴 `Unowned` 건너뜀(#277) · **`public_boundary_scan.py`(#377 · P6 공개 경계 6축 × 모집단 2(트리·이력 832커밋) · 축별 대조군 양성 10/음성 7 어긋나면 exit 2 · 매치는 길이만 남기고 마스킹 · 09-02)** | retrieval 개정 동반 |
| `data/replay/` | replay fixture(재생 자산 · 🔴 seed 원천 아님 — README 성문 · JSONL·무가공·LF 고정 — T2-4) · `static/`(T4-2a · 조회 응답 사본 28건 + `manifest.json`(라우트·apiBuildSha·sha256·queriedBy) · 굳히기 도구 산출 · 원문 무가공 · `.gitattributes eol=lf` · PR#216) | fixture 재녹화 · 정적 사본 재굳힘 시 |
| `tests/data/` | seed 무결성 probe 28건(C-21~C-28 그물 포함) + net-liveness 생존 시험 + binding-scope 사정거리 probe + 자기점검 mutation 시험 + eval-chunk-binding(평가 chunk 좌표 그물) + transition-net(상태 전이 그물 27판정·증분/절대 이축 — G-3·E-7) | seed 개정 동반 |
| `data/` | synthetic seed 생성기(generators/·verify SQL·seed.ps1) | Phase 1~ 데이터 진행 시 |
| `benchmarks/` | 평가 데이터셋·결과(datasets/eval-questions 등) | 평가 축 진행 시 |
| `scripts/` | 리포 수준 검사기(구현 scope · #372 신설 · 09-02) — `check-readme-versions.mjs`(README 전제조건 표 ↔ 리포 실물 대조 · 기대값·출처 경로 0 = README 가 지목한 파일을 읽음 · 비교 0건 = 실패 · CI hygiene step 이 참/변조 사본 두 번 실행 · **#387 발췌 축 09-02**: 「▶ 실행」 발췌 블록 ↔ 링크가 지목한 파일·절 «일치» 대조 · 명령·개수 박지 않음 · 자기 검증 자극 계수 0 = 실패) | README 전제조건 표·발췌 블록·출처 파일 개정 시 |
| `evidence/` | 독립 검증 보고 — 티켓별 판정문 `t{n}-{m}-*-verification.md`(phase0 ~ t4-2b · t3-5-wo-screen #225 · t4-2a #241 · t4-2b-live-guard #250·#260 · t4-4-external-gate6 골격 #256 · t4-3-public-rc(C 칸 재부팅 한정 · #298) · d12-enter-retry(형태 (나) · #302)) · 🔴 `t4-4-stimulus-equivalence-control.md`(#264 · §3-2 치환 대조군 정본 = 클라이언트 축 한정·SSR 층 갈림) · 그물 계획 `t3-6-e2e-axis-plan` · Q 실측(q40~q45) · 재검 로그 · **t5-5-gate-verdict #357(본 판정 · 축소 적용 v0.3 · 로컬 축 · 09-02)** · **t5-5-clean-env #361(README 만으로 = 0단계 · 우회 5단 완주 · 09-02)** · **t5-2-gate7-new-nets #366(신설 3 = SQL 질의 표면 「도달 불가」 · Cypher 층 A/B · prompt injection 표지 선행·무결성 배제 · 09-02)** · **t5-2-gate7-map #367(§32.8 13항+유지 1 대응표 · 인용만 · 출처 [V]/[N] 전칸 · 「Gate 7 은 서 있지 않다」 · 09-02)** · t4-4-external-outage-verification **§9**(Q-70·Q-69 외부 재실측 · Funnel OFF 창 11:59:33~12:05:33 · #373) · **t5-6-public-boundary-final-scan #377(P6 공개 경계 최종 스캔 · 트리 위반 0 · 이력 축 §35.4 ⑦ 채움 · 회부 2 = D-19·D-20 · 09-02)** · **t3-6-e2e-verification #386(T3-6 본 판정 「조건부 PASS」 · 공개 셸 브라우저 E2E 97/32/2 · §21 ②③④ 초록 · 빨강 주어 셋 = 자기 부하/D-21/Q-73 · 09-02)** · **d21-ws-layer-split #388(같은 쿠키·run · Vercel 경유 opened=false / Funnel 직결 opened=true · 열 B = tailnet self)** · **q73-networkidle-split #390 · q73-part2-frequency #392(기전 = 연결 ~30초 미폐쇄 · 실제워커 2 → 3/4 빨강 · 층 미결 · 계측기 `tests/web/_q73_netcount.mjs`·`_q73_freq.sh`)** · **q73-nets-revision #398(45곳 3분류 · 131/14 동수 · §7 Not measured)** · **d21-c-polling-verification #404(로컬 ⓗ 5/5 · 공개 3/4 · 폴링 표본 2 · 자수 6)** · **t6-1-live-synthesis-verification #410(①결속 0위반(스텁 200 형상 · 가드 도달 각 1 · 대조군 2/2 rationale) ②갈림 3/3(off·미도달 8799·CLI 부재 8788 503 실재) ③env·키 0(코드 축 · 8787 로그 면 = 센쿠2 소유 미측) ④fixture 심사 PASS(32 이벤트 · 285 문자열 · sha 일치) ⑤화면 채택 2/2·거부 0/2+사유 렌더 + e2e 130/3/3(조건 갈림 online=true · 못 잼 2 · D-22 1) ⑥지연 미충족 · 자수 2 · Target 10s/Actual 합성 step 18.4~19.1s(벽시계 run 21.5~26.7s))** | 검증 시 |
| `.workspace/handoffs/` | 오케 선작성 발주문(세대 승계 · 트리거 대기 문면 · 팀 채널 발신 시 그대로) — `suzaku8-orders-20260831.md`(§A T4-2b wake · §B T4-2a 검증) · `suzaku9-orders-20260831.md`(§A D-3 · §B T4-2a 2조각 · §C T3-5 ②′ · §D PR-1 검증 · §E 리바이2 15대 wake · §F 재부팅 후 10대 1착) · `suzaku10-orders-20260831.md`(§A T4-1 ②′ · §B T4-2b PR-1 서버 축 · §C PR-1 검증 · §D 완결·관문 서식 · §E 11대 1착) | 교대·마감 시 |
| `.workspace/drafts/` | 초안(SSOT 아님) — decision-004 초안은 **09-02 16:59 승인으로 `docs/decisions/004` 승격 · 초안 파일 제거**(이력 = git) · `baseline-v0.3-scope-cut-draft.md`(축소 안 · 폐하 A~G 승인 09-01 · **baseline 본문 반영 완료 09-02 #356** · 재가 칸 ☑ · 이력 보존) | 초안 추가·baseline 반영 시 |
| `.github/workflows/ci.yml` | CI 위생 게이트(GitHub-hosted 전용) | 게이트 확장 시 |
| `.github/workflows/security.yml` | CodeQL 정적 분석(JS/TS+Python · build-mode none · T5-3 최소본 #337) + dependency-audit(JS 게이트 · Python 보고 전용 · #350 · D-17) · GitHub-hosted 전용 | 보류 항목(dependency audit·container scan·license·endpoint policy) 추가 시 |
| `.claude/context/checkpoint.md` | 재개점(로컬 전용·비추적 · 백지 재작성) | 세션 마감 시 |
| `docs/plan/phase4-5-decomposition.md` | P4·P5 분해안(분모 37→46 · 결정 5건 · 관문 산정 · 선택지 ⓑ — 폐하 재가 08-31 09:55/09:57 · 원장 등재 10:05) | 분모·순서 변경 시 |
| `docs/plan/tickets/T3-4.md` · `T3-5.md` · `T3-6.md` | Phase 3 «최소 형상» 티켓(조사 실행·전략 비교 화면 / WO 편집·승인 화면 — Feature Freeze 조기 08-31 09:57) + Phase 3 통합 독립 검증(§21 증거 4종 · Gate smoke · 그물 선행) | 발주·완결 시 |
| `docs/plan/tickets/T4-1.md` · `T4-2.md` · `T4-2a.md` · `T4-3.md` · `T4-4.md` | Phase 4 티켓(공개 형상 골격·Q-37 해소 / Live 보호장치·fallback·queue / 정적 replay 경로 — T4-2 단위 분해 ⓐ · Q-51 / Tunnel·Vercel 공개 RC — 🔴 폐하 확인 2건 · 갈래 (b) Funnel / Phase 4 통합 독립 검증 — Gate 6 8행 외부 축 · §21 증거 4종 · 그물 선행) — 발주 시 status 갱신 | 발주·완결 시 |
| `docs/plan/tickets/T5-1.md` ~ `T5-5.md` | Phase 5 티켓 선작성(폐하 하명 08-31 23:25 「설계 미리 준비 · P5 까지 자동 승인」): Evaluation Lab(40문·4전략·800회·§30) / Gate 7 13항+이력 secret scan / CI 4 workflow §34.3~34.4 / 운영 runbook·자동 시작·clean env / Phase 5 통합 검증(Gate 1~8 전건·§35 점검표) | 발주 시 status 갱신 |
