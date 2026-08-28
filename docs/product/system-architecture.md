---
asset_class: product
description: 시스템 아키텍처 — 컨테이너·네트워크·데이터 흐름·신뢰 경계 (T0-7)
status: draft
lifecycle: D1 검수 후 active · 구조 변경 = 플랜 갱신 동반
size_limit: 8KB
---

# System Architecture — Factory Knowledge Twin

## 1. 전체 구도 (이중 실행 구조)

```
[방문자 브라우저]
      │ HTTPS
      ▼
[Vercel — Next.js web console]  ←— Always-on: 노트북 OFF에도 전체 데모 동작
      │  ① Sandbox Mode(기본): deterministic replay engine (fixture 재생 · 세션별 상태)
      │  ② Live Mode(옵션):   Live API online 감지 시 실시간 조사로 전환
      ▼ (Live일 때만)
[Cloudflare Tunnel / Tailscale Funnel]  ←— 노트북 실주소 비노출
      ▼
[노트북 — Live AI 스택 (docker compose)]
      ├─ FastAPI (async API · WebSocket streaming · rate limit · session)
      ├─ LangGraph agent (조사 workflow: plan→structured→vector→graph→종합→작업지시 초안)
      ├─ PostgreSQL + pgvector (구조화 데이터 · 문서 청크 임베딩)
      ├─ Neo4j (지식그래프 projection · multi-hop 추적)
      └─ local embedding/reranker (외부 API 비용 0)
```

## 2. 컨테이너·배치

| 구성요소 | 위치 | 근거 |
|---|---|---|
| web console (Next.js) | Vercel Hobby | always-on·무료 구간 |
| replay fixture | 리포/배포 번들 | 결정적 재생 — 백엔드 불요 |
| ai-api (FastAPI+LangGraph) | 노트북 docker | Claude/로컬 모델·DB 인접 |
| PostgreSQL+pgvector · Neo4j | 노트북 docker volume | 공개 리포에 volume 미포함(§34.6) |
| ingestion-indexer | 노트북 docker (배치) | seed→index 재생성 재현성 |

## 3. 데이터 흐름

1. **build 시**: synthetic seed → SSOT(구조화+문서) → ingestion → pgvector 임베딩 + Neo4j projection → 검증(ID unique·hash) → Golden Scenario replay fixture export.
2. **Live 질의 시**: FastAPI 수신 → LangGraph 단계 실행(각 단계 = audit event) → WebSocket으로 진행 스트리밍 → 종합 결과+evidence ID → fixture로 export 가능(run audit).
3. **Sandbox 질의 시**: replay engine이 fixture를 같은 event 스키마로 재생 — **replay event ⊂ live event 스키마**(T0-5 계약이 보장).

## 4. 신뢰 경계 (baseline §15.2·§16)

```
경계 A: 브라우저 ↔ Vercel        · 공개 — Turnstile·rate limit·CSP·세션 TTL
경계 B: Vercel ↔ Tunnel ↔ FastAPI · 준공개 — allowlist 시나리오·고정 Cypher template·
                                    parameterized SQL·요청 크기 제한·동시 실행 1~2 bounded queue
경계 C: FastAPI ↔ DB/모델         · 사설 — 컨테이너 네트워크 내부 · secret은 env 주입
🔴 어떤 경계에서도: 임의 SQL/Cypher/코드 실행 경로 없음 · Claude 구독 비노출(공개 요청 = replay/로컬 모델)
   · 실제 설비 제어 없음 · synthetic data만
```

## 5. 장애·성능 원칙

- Live API offline/timeout → 화면 무중단 **Replay fallback**(모드 배지 전환) — P0 요구.
- health endpoint(§12.1) · one-click reset · 방문자 session 격리(서버 세션 키 단위).
- 잠정 목표(실측 전): Sandbox 첫 화면 로드 < 3s · Live 조사 1건 < 60s — 측정 후 Target/Actual 분리.

## 7. 백엔드 품질 원칙 (운영자 확정 08-28 — 실무 투입 수준 · Phase 2 AC에 결속)

- **완전 비동기 경로**: async 드라이버 일관(asyncpg·Neo4j async·httpx) · 이벤트 루프 블로킹 0(블로킹 작업 = `to_thread`/전용 executor) · 타임아웃·취소 전파(structured concurrency) 전 구간.
- **실행 분리·확장 경계**: API 계층 stateless(세션·run 상태 = 저장소) · agent 실행은 run-orchestrator 인터페이스 뒤로 격리 — PoC는 인프로세스 워커로 돌되 **분산 큐(Redis/NATS 계열)로 승격 가능한 어댑터 경계**를 계약으로 보존. 수평 확장 시 코드 변경 최소.
- **견고성**: bounded queue + backpressure(동시 조사 1~2 · 초과 = 대기/거절 명시 응답) · 외부 의존(DB·graph·모델) 재시도+서킷브레이커 · idempotent run 생성 · graceful shutdown(진행 run 정리·이벤트 flush).
- **관측성**: structured logging(JSON·run_id correlation) · audit event = 정본 흐름과 동일 스키마 · health/readiness 분리 · 지표 노출 지점 예약.
- **품질 게이트**: 위 원칙은 Phase 2 티켓 AC로 분해되어 독립 검증 대상이다 — «돌아간다»는 통과 기준이 아니다.

## 6. D2 skeleton 착수 지시서 (이 문서가 주는 것)

- 리포 구조: `apps/web-console/`(Next.js) · `services/ai-api/`(FastAPI) · `packages/contracts/` · `packages/ontology/` · `data/`(seed) · `benchmarks/` · `tests/` · `evidence/`.
- docker compose: pg(pgvector)·neo4j·ai-api 3서비스 + `.env.example`(값 없는 키 목록만 — §34.6).
- contract test 자리: `tests/contract/` — T0-5 스키마 대조.
