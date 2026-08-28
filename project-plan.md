# 프로젝트 플랜 — factory-knowledge-twin

> **확정 계획 요약 단일본.** 정본 = `docs/baseline/poc-baseline-v0.2.md`(§21 개발 단계 · §33.4 14일 일정 · §12 P0/P1/P2) — 여기 재기술하지 않는다. 「지금 어디」 = checkpoint · 현황 = PROGRESS.

## 0. 방향 (3줄)

- 제조 도메인에서 RAG·지식그래프/온톨로지·LangGraph Agent를 **하나의 제품 경험**으로 통합해 시연하는 Portfolio-grade PoC.
- 이중 실행 구조: Vercel Always-on Sandbox(노트북 OFF에도 동작) + 노트북 Live AI(FastAPI·LangGraph·pgvector·Neo4j).
- 구현 속도보다 **검증·재현·release closure**가 Critical Path. 멀티에이전트 3좌석 + 독립 검증 Gate.

## 1. 단계 (baseline §21 — Phase 상태만 여기서 추적)

| Phase | 내용 | 상태 |
|---|---|---|
| — | 부트스트랩: 리포·SSOT·팀 구성 | ⏳ 진행 중(54차) |
| 0 | 제품·UX 방향 확정(visual 3안·wireframe·storyboard) | 대기 |
| 1 | SSOT·Ontology·Synthetic Data | 대기 |
| 2 | Retrieval·Agent Backend | 대기 |
| 3 | Always-on Sandbox UX | 대기 |
| 4 | Live AI 연결(Tunnel·streaming·fallback) | 대기 |
| 5 | 평가·보안·운영 완성(Gate 1~8) | 대기 |
| 6 | 포트폴리오 패키징(영상·README·Release) | 대기 |

## 2. 팀 기동 선결 (운영자 몫 대기)

봇 앱 3 생성 · 봇명 확정 · 신규 좌석 slug·크리덴셜 계보 재가 · PoC 팀 채널 신설.

## 3. 상시 금지

baseline §33.6 Stop 조건 · 측정-주장 경계 위반 · Day 8 후 신규 기능 · secret/실데이터 커밋.
