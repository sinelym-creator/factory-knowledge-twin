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
| `apps/web-console/` | Next.js 웹 콘솔(A안 AppShell·P0 6라우트·세션 가드 proxy·`lib/contract.ts` 단일 fetch 표면·`scripts/contract-surface.mjs` 검사기 — T1-9) | 화면 구현 진행 시 |
| `services/ai-api/` | FastAPI 백엔드(+ db/migrations) | S2~ 구현 |
| `services/indexer/` | 색인 파이프라인(동결 chunk 정책 정본 `FROZEN_POLICY`·probe 도구 2종 — T1-4) | S3 색인 진행 시 |
| `services/projector/` | Neo4j 투영(manifest 코드 정본 `--check-spec`·build·verify 값 전량 대조 — T1-5) | 스펙 §2.1 개정 동반 |
| `infra/` | 로컬 인프라 보조(postgres init SQL 등) | 환경 변경 시 |
| `tests/contract/` | 계약 테스트 harness(러너·케이스·strict coverage) | 계약 개정 동반 |
| `tests/schema/` | 스키마 제약 probe(트랜잭션 롤백·잔여물 0) | 스키마 개정 동반 |
| `tests/graph/` | 그래프 투영 독립 검증(스펙 독립 파싱 `graph_verify` 18축 · 끊김/변조 드릴 `graph_drill` 22축 · 러너 — T1-5 검증) | 투영 개정 동반 |
| `tests/web/` | 셸 E2E 검증(playwright 4스펙 · 검사기 드릴 17주입 · 독립 표면 스캔 `surface_scan` · 토큰 프로브 · 라우트 매트릭스 — T1-9 검증) | 셸 개정 동반 |
| `tests/api/` | retrieval API 독립 그물(앵커 경계 드릴 — 표기 변형 교차·생존 신호 exit 2 · 경계 직접 probe · 계약 오류 형상 드릴 — T2-1 검증) | retrieval 개정 동반 |
| `data/replay/` | replay fixture(재생 자산 · 🔴 seed 원천 아님 — README 성문 · JSONL·무가공·LF 고정 — T2-4) | fixture 재녹화 시 |
| `tests/data/` | seed 무결성 probe 28건(C-21~C-28 그물 포함) + net-liveness 생존 시험 + binding-scope 사정거리 probe + 자기점검 mutation 시험 + eval-chunk-binding(평가 chunk 좌표 그물) + transition-net(상태 전이 그물 27판정·증분/절대 이축 — G-3·E-7) | seed 개정 동반 |
| `data/` | synthetic seed 생성기(generators/·verify SQL·seed.ps1) | Phase 1~ 데이터 진행 시 |
| `benchmarks/` | 평가 데이터셋·결과(datasets/eval-questions 등) | 평가 축 진행 시 |
| `evidence/` | 독립 검증 보고(phase0-verification 등) | 검증 시 |
| `.github/workflows/ci.yml` | CI 위생 게이트(GitHub-hosted 전용) | 게이트 확장 시 |
| `.claude/context/checkpoint.md` | 재개점(로컬 전용·비추적 · 백지 재작성) | 세션 마감 시 |
