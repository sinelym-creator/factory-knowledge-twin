---
artifact: t1-8-api-skeleton-verification
ticket: T1-8 FastAPI async skeleton — 독립 검증
owner: 검증(리바이2 3대)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-29
verification_base: develop `8c82851` (lane/levi2-t13-t18-verify)
target: services/ai-api/** · packages/contracts/rest-api-v0.1.md(동결) · tests/contract/**
size_limit: 16KB
---

# T1-8 독립 검증 — 실측과 판정

> 🔴 **구현 좌석의 자기 실측 수치를 옮겨 적지 않았다.** 아래 값은 전부 이 머신에서 내가
> 다시 실행해 얻은 출력이다(E1). 도구가 초록을 말하는 곳에서는 **그 도구가 실패를 낼 수
> 있는 경로가 실재하는지**를 먼저 시험했다(§1).

## 0. 방법

| 항목 | 내용 |
|---|---|
| base | `8c82851` · 브랜치 `lane/levi2-t13-t18-verify` |
| 실행 환경 | 격리 스택 `COMPOSE_PROJECT_NAME=fkt-levi2` · pg 5534 · neo4j 7574/7587 · `VOLUME_ROOT=./.volumes-levi2` — 타 좌석 무접촉 |
| ai-api | `services/ai-api/.venv`(신규 생성) · `requirements-dev.txt` 설치 exit 0 · uvicorn **포트 8100**(8000 회피) |
| 근거 등급 | 수치는 전부 **E1**. 소견은 그렇게 표기했다 |

## 1. 먼저 — 도구가 살아 있는가 (판정 전 게이트)

초록을 판정 근거로 쓰기 전에, 그 초록을 내는 도구가 **실패를 낼 수 있는지**부터 물었다.

| 도구 | 감지력 시험 | 결과 |
|---|---|---|
| `tools/measure_loop_lag.py` | `--blocking-demo`(핸들러에 `time.sleep(0.05)` 주입) | 증가 p50 **+2551.64 ms** · p95 **+3056.16 ms** — **살아 있다** |
| `tests/contract/run.js` | 러너 내장 자기 검증(결속 제거 스키마 재실행) | **실패 15건 감지** — 살아 있다 |
| `tools/contract_surface.py` | 기대 목록을 상수로 갖지 않고 계약 문서에서 매 실행 추출(소스 실독) | 정본 종속 확인 · 별도로 §2에서 **계약 문서 독립 추출로 교차 대조** |

🔴 `contract_surface`는 「앱 라우트 ↔ 계약 문서」를 스스로 대조하는 도구다. 그 결과를 그대로
믿지 않고, 계약 문서에서 내가 따로 경로를 뽑아 **살아 있는 `/openapi.json`과 교차**했다(§2).

## 2. AC① — boot · `/api/health` 200 · 계약 표면 전건

**Target**: boot 성립 + `/api/health` 200(E1) + `/openapi.json` ↔ 계약 대조표

| # | 실행한 전체 명령 | Actual |
|---|---|---|
| 1 | `.venv/Scripts/python.exe -m uvicorn app.main:app --port 8100` (의존 env **미설정**) | 기동 성공 |
| 2 | `curl http://127.0.0.1:8100/api/health` | **HTTP 200** · `0.0044 s` · `{"ok":true,"version":"0.1.0","status":"degraded","dependencies":{"postgres":{"state":"unconfigured",…},"neo4j":{"state":"unconfigured",…}}}` |
| 3 | `curl http://127.0.0.1:8100/health` (구 경로) | **HTTP 404** — 계약 base=/api 로의 이동이 실물에서 확인된다 |
| 4 | `curl http://127.0.0.1:8100/openapi.json` | **HTTP 200** · 27,599 bytes |
| 5 | `curl -X POST http://127.0.0.1:8100/api/sessions` | **HTTP 501** · `{"error":{"code":"not_implemented","message":"POST /sessions 는 계약 v0.1 표면으로만 존재한다(T1-8 골격). 필요한 것: 세션 저장소"}}` |
| 6 | `GET /api/live/status` | **HTTP 200** · `{"online":false,…}` — 골격에서 `false`가 참이다 |

**의존 미설정으로도 boot 성립 + `degraded` 표기** = 티켓 산출물 요구(「연결 실패 시에도 boot는
성립 — degraded 표기」) 실측 충족.

### 2.1 `/openapi.json` ↔ 계약 대조 (교차 실측)

| 출처 | 추출 방법 | 건수 |
|---|---|---|
| 계약 정본 `packages/contracts/rest-api-v0.1.md` | 내가 grep으로 표 행의 `(메서드, 경로)` 직접 추출 | REST **22** + WS **1** |
| 살아 있는 `/openapi.json` | `paths × methods` 전개 | REST **22** |
| WS `/api/ws/runs/{runId}` | OpenAPI 미수록 → **실물 연결 실측** | `websocket.close` **code 4501** · `reason="not_implemented: run 이벤트 원천 없음(T1-8 골격)"` |
| `tools/contract_surface` | 도구 자체 실행 | **23/23 ✓ · 계약 밖 경로 0 · exit 0** |

- 계약에 있는데 라우트가 없다: **0건**
- 라우트가 있는데 계약에 없다(§16.2 검토 대상): **0건**
- OpenAPI 22 + WS 1 = 23 — 도구 집계와 내 독립 추출이 **같은 수에 도달**했다.

**판정 AC① = PASS (E1)**

## 3. AC② — blocking 0 · 이벤트 루프 점유 실측

**Target**: 동기 IO 부재 근거(코드 경로) + 루프 점유 실측 1건

| 구간 | p50 | p95 | 최대 |
|---|---:|---:|---:|
| 유휴 기준선(플랫폼 타이머 바닥) | 5.91 | 14.66 | 15.81 |
| 부하 중(`/api/health` 동시 20 · 2.0s × 2 · 7,220건 · 약 3,600 req/s) | 1.35 | 5.30 | 11.03 |
| **증가 (판정 줄)** | **-4.56** | **-9.36** | **-4.78** |

**Actual**: 증가가 **음수** — 부하 중 lag이 유휴 기준선보다도 낮다. 루프를 붙잡는 호출이 없다.
같은 측정이 대조군(`--blocking-demo`)에서는 **+3056 ms(p95)** 를 낸다(§1) — 측정이 둔감해서 나온
초록이 아니다.

**코드 경로 근거(정적)**: `app/probes.py`가 asyncpg 풀 · `neo4j.AsyncGraphDatabase`만 쓰고,
프로브는 `asyncio.timeout` + `asyncio.gather` 로 동시 실행된다. 동기 드라이버 import 0건.
`time.sleep`·`requests`·동기 `psycopg` 계열 호출 = 소스 전수 확인 결과 **실 라우트에 0건**
(존재하는 유일한 `time.sleep`은 `measure_loop_lag.py`의 대조군 전용 라우트다).

**판정 AC② = PASS (E1)**

## 4. AC③ — 도메인 기능 코드 0

라우터 6모듈(`sessions·factory·investigations·knowledge·work_orders·ops`) **전수 실독**.

| 라우터 | 실구현 | 확인 |
|---|---|---|
| `ops` | `/health`·`/live/status` **만** 실제 응답 | 살아 있는지 물을 창구 1개 — 티켓이 요구한 예외 |
| 나머지 21 REST | 전건 `raise NotImplementedRoute(...)` | 실물 호출 501 + 계약 오류 형상(§2 #5) |
| WS | `accept` 후 **4501 종료** | 가짜 이벤트 스트림 없음 — 실측 확인 |

저장소·조회 계층·orchestrator 호출 0건. 라우터가 아는 것은 계약 형상뿐이며, 계약이 형상을
정하지 않은 자리는 응답 모델을 **비워 두고** 그 이유를 주석으로 남겼다(지어내지 않았다).

**판정 AC③ = PASS (E1 실측 + 소스 전수)**

## 5. AC④ — contract harness green (strict)

```
node tests/contract/run.js --strict-coverage
```

**Actual**: `34/34 통과 · 실패 0건 · 자기 검증 PASS · 커버리지 37/37` · **exit 0**
(자기 검증 = 결속 제거 스키마로 같은 케이스 재실행 → **실패 15건 감지**. 러너가 실제로 무언가를
보고 있다는 증거이며, 이것이 0이면 그 자체가 FAIL로 처리되는 설계다.)

계약(`packages/contracts/**`) 파일 변경 **0** — 골격만 세웠고 계약 개정은 없다(`git log`·워킹트리 clean 확인).

**판정 AC④ = PASS (E1)**

## 6. 판정

| AC | 판정 | 근거 |
|---|---|---|
| ① boot·/api/health 200 · 계약 표면 전건 | **PASS** | §2 · §2.1 (교차 실측 23/23) |
| ② blocking 0 + 루프 점유 실측 | **PASS** | §3 (증가 음수 · 대조군 +3056 ms) |
| ③ 도메인 기능 0 | **PASS** | §4 (실물 501 · 소스 전수) |
| ④ contract harness green(strict) | **PASS** | §5 (34/34 · 커버리지 37/37 · exit 0) |

### 🟢 T1-8 = 독립 검증 PASS (게이트 전수 통과)

## 7. 소견 (판정을 바꾸지 않는 관찰 · E3)

1. **`/health` 경로 이동은 문서에 반영돼 있다** — `docs/product/dev-environment.md` §5 #7행이
   「T1-8부터 루트 `/health`는 없다(계약 base=/api)」를 명시한다. 내 404 실측과 일치한다.
   다만 발주문이 이 절을 **§7**로 지목했는데 §7은 「공개 경계 점검」이다 — 실제 boot 재현 좌표는
   **§4(재현 절차) + §5 #7행**이다. 후임 발주문의 좌표 정정을 권한다.
2. **의존 연결 상태(`status:"ok"`)는 이번에 재현하지 않았다** — AC가 요구한 축은 「연결 실패
   시에도 boot 성립」이고 그쪽을 실측했다. `ok` 경로는 T1-4 이후 DB 결속 티켓에서 함께 본다.
