---
asset_class: product
description: 시스템 아키텍처 — 컨테이너·네트워크·데이터 흐름·신뢰 경계·화면 폴백 계층 (T0-7 · 09-04 실물 반영)
status: draft
lifecycle: 검수 PASS 후 active · 구조 변경 = 플랜 갱신 동반
size_limit: 10KB
---

# System Architecture — Factory Knowledge Twin

## 1. 전체 구도 (이중 실행 구조)

```
[방문자 브라우저]
      │ HTTPS
      ▼
[Vercel — Next.js web console]  ←— Always-on: 노트북 OFF에도 전체 데모 동작
      │  ① REPLAY(배지 기본값): 서버 replay · ai-api 에 못 닿으면 정적 replay 를 «제안»
      │  ② LIVE(옵션):        `/api/live/status.online` 이 참일 때만 실시간 조사
      │  · `/api/*` = Vercel **함수 프록시**(`app/api/[...path]/route.ts` · D-11 (B) · 엣지 rewrite 제거)
      │  · `/api/ws/*` 만 rewrite 로 남긴다 — Route Handler 는 101 을 낼 수 없다(`next.config.ts`)
      ▼ (Live일 때만)
[Tailscale Funnel :8443 → 127.0.0.1:8010]  ←— 노트북 실주소 비노출(runbook §2-1)
      ▼
[노트북 — Live AI 스택]
      ├─ ai-api (FastAPI async · LangGraph 조사 workflow · WebSocket · rate limit · session)
      │    배포본은 compose 이미지를 `docker run` 으로 띄운다(호스트 `:8010` → 컨테이너 8000)
      ├─ PostgreSQL + pgvector · Neo4j (docker compose 3서비스 중 2)
      ├─ local embedding/reranker (외부 API 비용 0)
      └─ synthesis-gateway (호스트 프로세스 `127.0.0.1:8787` · compose 무등재 · §2)
```

## 2. 컨테이너·배치

| 구성요소 | 위치 | 근거 |
|---|---|---|
| web console (Next.js) | Vercel Hobby | always-on·무료 구간 · 🔴 `FKT_API_BASE` 는 **빌드 타임 상수**다(`next.config.ts` · Q-37) — 목적지 변경 = 재빌드 |
| 공개 진입로 | Tailscale Funnel `:8443` → `127.0.0.1:8010` | 도메인·Cloudflare 없음(운영자 인프라 갈래 (b)) · OFF→ON 은 핸들러까지 함께 세운다(runbook §2-1) |
| 정적 replay 자산 | 배포 번들(`apps/web-console/lib/static-replay/`) | ai-api 없이 GS-01 재생 · 고정 run id `STATIC-GS-01`(`run-id.ts`) · 🔴 **동적 import** — 첫 화면 번들에 안 넣는다 |
| 가이드 투어 (T6-5) | 브라우저 상태(`apps/web-console/components/tour/`) | REPLAY 로만 돈다(구독 소모 0) · 서버 무접촉 · OFF 면 화면 변화 0(`docs/design/t6-5-guided-tour-spec.md`) |
| ai-api (FastAPI+LangGraph) | 노트북 docker (배포본 = `docker run` · 호스트 `:8010`) | Claude/로컬 모델·DB 인접 · Live 조사 상한 = `FKT_RUN_CAP_PER_SESSION`(기본 3/세션·시간 · 초과 `429` + `Retry-After` · 🔴 replay 는 막지 않는다 · runbook §7-2) |
| synthesis-gateway (Claude Code CLI · 구독) | 🔴 **운영자 PC 호스트 프로세스**(`127.0.0.1:8787` · compose 무등재 · T6-1 · 폐하 결정 3 09-02) | LLM 합성 = **운영자 구독 Claude Code CLI 경유 · Anthropic API 키 0** · 컨테이너는 `FKT_LOCAL_SYNTHESIS_GATEWAY` 로만 도달(배포 컨테이너 env 0 = 결정적 축) · 인용 id ∉ run 근거집합 = 전량 거부(`axis=live-rejected` 드러냄 · 조용한 폴백 0) · 공개 방문자 = Claude 실행 기록본 replay |
| PostgreSQL+pgvector · Neo4j | 노트북 docker volume | 공개 리포에 volume 미포함(§34.6) |
| indexer · projector (배치) | 🔴 **호스트 venv**(`services/indexer/.venv`·`services/projector/.venv`) — 컨테이너 아님 | seed→index 재생성 재현성 · ai-api 이미지에는 indexer 소스가 없다(runbook §4-1 · `Dockerfile` = `COPY app ./app` 뿐) |

## 3. 데이터 흐름

1. **build 시**: synthetic seed → SSOT(구조화+문서) → ingestion → pgvector 임베딩 + Neo4j projection → 검증(ID unique·hash) → Golden Scenario replay fixture export.
2. **Live 질의 시**: FastAPI 수신 → LangGraph 단계 실행(각 단계 = audit event) → WebSocket으로 진행 스트리밍 → 종합 결과+evidence ID → fixture로 export 가능(run audit).
3. **REPLAY 질의 시**(옛 표기 「Sandbox Mode」 — 화면 배지 실물은 `LIVE`/`REPLAY`/`미연결`·`확인 중`이다 · `components/live-status.tsx`): replay engine이 fixture를 같은 event 스키마로 재생 — **replay event ⊂ live event 스키마**(T0-5 계약이 보장).

## 4. 신뢰 경계 (baseline §15.2·§16)

```
경계 A: 브라우저 ↔ Vercel        · 공개 — Turnstile·rate limit·CSP·세션 TTL
경계 B: Vercel 함수 ↔ Tailscale Funnel(:8443) ↔ ai-api(:8010)
                                  · 준공개 — allowlist 시나리오·고정 Cypher template·
                                    parameterized SQL·요청 크기 제한·동시 실행 1~2 bounded queue
경계 C: FastAPI ↔ DB/모델         · 사설 — 컨테이너 네트워크 내부 · secret은 env 주입
🔴 어떤 경계에서도: 임의 SQL/Cypher/코드 실행 경로 없음 · Claude 구독 비노출(공개 요청 = replay/로컬 모델 · LLM 합성은 운영자 PC 의 Claude Code CLI 구독 경유 로컬 게이트웨이 · API 키 0 · T6-1)
   · 실제 설비 제어 없음 · synthetic data만
```

## 5. 장애·성능 원칙

- Live API offline/timeout → 화면 무중단 **Replay fallback**(모드 배지 전환) — P0 요구.
- health endpoint(§12.1) · one-click reset · 방문자 session 격리(서버 세션 키 단위).
- 잠정 목표(실측 전): REPLAY 첫 화면 로드 < 3s · Live 조사 1건 < 60s — 측정 후 Target/Actual 분리.

### 5-1. 화면 폴백 계층 (실물 5층 — 각 행 = 코드 근거 1개)

🔴 **공통 규율 = 조용한 폴백 0.** 대체 경로로 내려가도 화면이 그 사실을 «말한다» — 정상처럼 보이는 자리를 하나 더 만들지 않는다.

| 층 | 언제 내려가는가 | 근거 파일 |
|---|---|---|
| ① WS → 주기 조회 | 공개 셸 경유 run WS 가 **열리지도 못할 때**(101 전 1006) — 「절단」과 갈라 `GET /api/runs/{id}/events` 를 주기 조회하고, 그 사실을 표시한다(D-21 ⓒ · 계약 v0.1.10) | `apps/web-console/components/incident/run-console.tsx` |
| ② 혼잡 배지 | 서버가 요청을 거절할 때(503) — 배지가 「혼잡」을 말하고, 재시도 초는 **서버가 `Retry-After` 로 말했을 때만** 적는다. Live 축(`data-mode`)은 안 건드린다 | `apps/web-console/components/live-status.tsx`(`data-congested`) |
| ③ 상류 단절 안내 화면 | 데이터를 «못 물어봤을» 때 — 「0건」과 「못 닿았다」를 가른다. 사람에게는 `describeWhy()` 의 문장, 계측기에는 원문 `data-why` | `apps/web-console/components/unavailable.tsx` |
| ④ 정적 replay | ai-api **응답 실패**일 때만 «제안»(자동 진입 아님 · `online:false` 는 참이므로 제안하지 않는다) · 고정 run id `STATIC-GS-01` | `apps/web-console/lib/static-replay/`(`run-id.ts`) |
| ⑤ inert 폴백 포인터 가드 | 투어 중 브라우저가 `inert` 를 지원하지 않을 때 — 키보드 축은 `focusin` 감시가, 마우스 축은 이 가드가 막는다(지원 브라우저에서는 **발동 0 이 정상**) | `apps/web-console/components/tour/tour-overlay.tsx` |

## 7. 백엔드 품질 원칙 (운영자 확정 08-28 — 실무 투입 수준 · Phase 2 AC에 결속)

- **완전 비동기 경로**: async 드라이버 일관(asyncpg·Neo4j async·httpx) · 이벤트 루프 블로킹 0(블로킹 작업 = `to_thread`/전용 executor) · 타임아웃·취소 전파(structured concurrency) 전 구간.
- **실행 분리·확장 경계**: API 계층 stateless(세션·run 상태 = 저장소) · agent 실행은 run-orchestrator 인터페이스 뒤로 격리 — PoC는 인프로세스 워커로 돌되 **분산 큐(Redis/NATS 계열)로 승격 가능한 어댑터 경계**를 계약으로 보존. 수평 확장 시 코드 변경 최소.
- **견고성**: bounded queue + backpressure(동시 조사 1~2 · 초과 = 대기/거절 명시 응답) · 외부 의존(DB·graph·모델) 재시도+서킷브레이커 · idempotent run 생성 · graceful shutdown(진행 run 정리·이벤트 flush).
- **관측성**: structured logging(JSON·run_id correlation) · audit event = 정본 흐름과 동일 스키마 · health/readiness 분리 · 지표 노출 지점 예약.
- **품질 게이트**: 위 원칙은 Phase 2 티켓 AC로 분해되어 독립 검증 대상이다 — «돌아간다»는 통과 기준이 아니다.

## 6. skeleton(S2) 착수 지시서 (이 문서가 주는 것)

- 리포 구조: `apps/web-console/`(Next.js) · `services/`(`ai-api`·`indexer`·`projector`·`synthesis-gateway`) · `packages/contracts/` · `packages/ontology/` · `data/`(seed) · `benchmarks/` · `tests/` · `evidence/`.
- docker compose: pg(pgvector)·neo4j·ai-api 3서비스 + `.env.example`(값 없는 키 목록만 — §34.6).
- contract test 자리: `tests/contract/` — T0-5 스키마 대조.
