# ai-api — 계약 v0.1 표면의 비동기 골격 (T1-8)

FastAPI 서비스. **계약 v0.1(`packages/contracts/`)이 약속한 API 표면을 전부 세우고, 도메인
구현은 아직 넣지 않았다.** 라우트는 존재하고, 호출하면 계약이 정한 오류 형상으로 「아직
없다」고 답한다.

> 🔴 골격이 그럴듯한 값을 지어내지 않는 이유: 없는 근거를 채운 응답은 화면과 통합될 때까지
> 살아남는다. 계약 README 원칙2(「붙일 근거가 없으면 필드를 비우는 게 아니라 이벤트를
> 내보내지 않는다」)와 같은 자리다.

## 실행

```powershell
cd services/ai-api
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt        # 실측·도구까지: requirements-dev.txt
# 🔴 --no-proxy-headers: XFF 는 앱 env 스위치(FKT_TRUST_FORWARDED_FOR) 한 곳만 읽는다 (D-8).
#    빼면 uvicorn 이 먼저 X-Forwarded-For 를 해석해 scope["client"] 를 덮고, 그 순간
#    「기본은 안 믿는다」가 거짓이 된다(헤더 한 줄로 IP 축 우회).
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --no-proxy-headers
# 확인: http://localhost:8000/api/health   ← 🔴 계약의 base = /api (아래 §정합 메모)
```

의존은 **환경변수로만** 준다(`.env` 파일을 읽지 않는다 — `app/settings.py` 머리말).
주지 않으면 서비스는 뜨고 `/api/health` 가 `unconfigured` 라고 말한다.

```powershell
$env:FKT_POSTGRES_DSN = 'postgresql://fkt:***@localhost:5634/fkt'
$env:FKT_NEO4J_URI    = 'bolt://localhost:7687'
$env:FKT_NEO4J_USER   = 'neo4j'
$env:FKT_NEO4J_PASSWORD = '***'
```

## 계약 표면 대조 (AC ①)

```powershell
.venv\Scripts\python.exe -m tools.contract_surface     # exit 0 = 전건 일치 · 계약 밖 경로 0
```

기대 목록을 도구에 적어 두지 않는다 — `packages/contracts/rest-api-v0.1.md` 에서 매 실행
뽑는다. 상수로 베껴 두면 계약이 개정될 때 도구가 옛 계약을 기준으로 green 을 말한다.

**실측 (E1 · 2026-08-29)**: 계약 표면 **23개 · 앱 등록 23개 · 전건 일치 · 계약 밖 경로 0**.

| 계약 v0.1 경로 | 메서드 | 골격 |
|---|---|---|
| `/sessions` | POST | 501 |
| `/sessions/{sid}/reset` | POST | 501 |
| `/plants` | GET | 501 |
| `/plants/{plantId}/overview` | GET | 501 |
| `/equipment/{equipmentId}` | GET | 501 |
| `/equipment/{equipmentId}/sensors/{sensorId}/series` | GET | 501 |
| `/scenarios` | GET | 501 |
| `/scenarios/{scenarioId}/runs` | POST | 501 |
| `/incidents/{incidentId}` | GET | 501 |
| `/runs/{runId}` | GET | 501 |
| `/runs/{runId}/stop` | POST | 501 |
| `/runs/{runId}/events` | GET | 501 |
| `/ws/runs/{runId}` | WS | accept 후 close 4501 |
| `/evidence/{evidenceId}` | GET | 501 |
| `/graph/paths` | GET | 501 |
| `/documents/{docId}` | GET | 501 |
| `/retrieval/compare` | POST | **구현 (T2-1)** — 아래 §retrieval |
| `/work-orders/{woId}` | GET | 501 |
| `/work-orders/{woId}` | PATCH | 501 |
| `/work-orders/{woId}/approve` | POST | 501 |
| `/work-orders/{woId}/reject` | POST | 501 |
| `/health` | GET | ✅ 동작 |
| `/live/status` | GET | ✅ 동작 (`online:false` — 아래) |

🔴 **위 표의 「501」 칸은 2026-08-29 T1-8 «골격»의 스냅샷이다 — 2026-09-04 현재는 사실이 아니다.** 그날 이후 T2·T3·T6 으로 대부분이 구현됐다. 오늘 다시 센 것(E1 · `app/routers/*.py`): **HTTP 라우트 데코레이터 22개 + WS 1개 = 23** — 계약 표면 수는 그대로다. 남아 있는 501 은 «일부러 남긴» 두 자리뿐이다 — `GET /graph/paths` 의 `from`·`to` 축(`knowledge.py:100` · 소비처가 `byRun` 뿐이라 열지 않는다)과 녹화본이 없는 시나리오(`investigations.py:181` · `replay_fixture_missing`). 🔴 **표의 개별 행을 «지금 상태»로 고치지 않은 이유**: 행마다 실행해 확인한 것이 아니기 때문이다. 「안 잰 것」을 초록으로 칠하지 않는다 — 각 경로의 현재 동작은 계약 문서와 아래 절들이 정본이다.

WebSocket 은 OpenAPI 에 실리지 않아 도구가 라우트 표에서 직접 확인한다. 종료 코드는
`4501` 이다 — `1011`(예기치 못한 조건)은 사실과 다르고, 이 종료는 «예정된 미구현»이라
애플리케이션 대역에서 HTTP 501 에 대응시켰다.

## blocking 0 — 근거와 실측 (AC ②)

**코드 경로 근거.** 이 서비스가 하는 IO 는 두 갈래뿐이고 둘 다 async 드라이버를 지난다.

| 경로 | 무엇을 쓰는가 | 어디 |
|---|---|---|
| PostgreSQL | `asyncpg` 풀(`await pool.acquire()` · `await conn.fetchval`) | `app/probes.py` |
| Neo4j | `neo4j.AsyncGraphDatabase` (`await driver.verify_connectivity()`) | `app/probes.py` |
| retrieval (T2-1) | 같은 두 드라이버 + 질의 임베딩은 `asyncio.to_thread` 로 오프로드 | `app/retrieval/*` |
| 그 외 라우트 | IO 없음 — 계약 형상만 알고 즉시 501 을 던진다 | `app/routers/*` |

동기 드라이버(psycopg2 계열·neo4j 동기 세션)는 의존 목록에 없다. 파일 읽기·`time.sleep`·
`requests` 도 런타임 코드에 없다. 두 프로브는 `asyncio.timeout` 으로 상한이 걸려 있고,
`CancelledError` 는 잡지 않고 그대로 올려 취소가 전파된다(§7).

**실측.**

```powershell
.venv\Scripts\python.exe -m tools.measure_loop_lag                  # 실제 라우트
.venv\Scripts\python.exe -m tools.measure_loop_lag --blocking-demo  # 대조군
```

10ms 주기로 깨어나기로 한 태스크가 실제로 언제 깨어났는지(lag)를 **유휴 구간과 부하 구간에서
각각** 모아 비교한다. 🔴 유휴 기준선을 먼저 재는 이유: Windows 의 기본 타이머 해상도가 10ms
보다 굵어 부하가 없어도 lag 이 수 ms 나온다. 그 바닥을 모르면 플랫폼 특성을 「루프 점유」로
읽는다. **판정은 언제나 기준선 대비 증가로 한다.**

| 측정 (E1 · 2026-08-29 · 동시 20 · 각 2초) | p50 | p95 | 최대 |
|---|---:|---:|---:|
| 유휴 기준선 | 5.87 ms | 6.45 ms | 6.84 ms |
| 부하 중 (`/api/health` · 4,040건 · 약 2,009 req/s) | 5.73 ms | 10.46 ms | 13.20 ms |
| **증가** | **-0.14 ms** | **+4.01 ms** | **+6.36 ms** |
| 대조군 — 핸들러에 `time.sleep(0.05)` 을 끼운 경우 **증가** | +1,224.61 ms | **+1,230.67 ms** | +1,230.27 ms |

증가분이 유휴 기준선 수준(수 ms)이고, 같은 측정이 블로킹 호출 하나에 **300배 이상** 반응한다.
대조군을 함께 두는 이유가 이것이다 — 「lag 이 작다」는 측정이 민감할 때만 증거가 된다.

**T2-1 재측정 — 위험이 있는 경로에서 다시 잰다 (E1 · 2026-08-30 · 동시 8 · 각 4초).**
`/api/health` 만 때리면 새로 들어온 위험(질의 임베딩 = 동기 CPU 작업)을 지나쳐 측정한다.
그래서 부하 대상을 `POST /api/retrieval/compare` 로 바꿔(`--retrieval`) 다시 쟀고, 임베딩이
없는 축(`--strategies graphrag`)을 **대조군**으로 함께 뒀다.

| 부하 대상 (증가 = 유휴 기준선 대비) | p50 | p95 | 최대 | 처리량 |
|---|---:|---:|---:|---:|
| compare · 3전략 | **-5.38 ms** | +3.40 ms | +64.42 ms | 11 req/s |
| compare · `vector` 만 (임베딩 있음) | **-5.10 ms** | +3.94 ms | +55.91 ms | 24 req/s |
| compare · `graphrag` 만 (임베딩 **없음**) | +4.06 ms | +13.66 ms | +61.26 ms | 239 req/s |
| 대조군 — `time.sleep(0.05)` | **+1,226.11 ms** | +1,228.79 ms | +1,228.29 ms | 19 req/s |

🔴 읽는 법: **최대치의 산발적 증가(55~64 ms)를 임베딩 탓으로 읽으면 안 된다** — 임베딩이
아예 없는 `graphrag` 축에서 같은 규모(+61 ms)가, 오히려 더 큰 p95 증가와 함께 나온다.
즉 그 꼬리는 «부하 자체»의 것이지 루프 점유의 서명이 아니다. 동기 블로킹의 서명은 대조군이
보여 주는 **중앙값 자체의 이동**인데, 실제 경로 어디에도 그것이 없다(p50 증가가 음수이거나
기준선 수준). `to_thread` 오프로드가 루프를 잡지 않는다는 뜻이다.

## 부팅·프로브 실측 (AC ① · E1 · 2026-08-29)

`uvicorn app.main:app` 로 실제 기동한 서버를 밖에서 확인했다.

| 확인 | 의존 없이 | 의존 붙이고 |
|---|---|---|
| `GET /api/health` | **200** · `ok:true` · `status:"degraded"` · 두 의존 `unconfigured` | **200** · `ok:true` · `status:"ok"` · postgres 17 ms · neo4j 24 ms |
| `GET /openapi.json` | **200** · paths 21개(WS 제외 · `/work-orders/{woId}` 는 GET·PATCH 한 경로) | 동일 |
| `POST /api/sessions` | **501** · `{"error":{"code":"not_implemented","message":"…"}}` | 동일 |
| `WS /api/ws/runs/{runId}` | accept 후 **close 4501** · `not_implemented: run 이벤트 원천 없음` | 동일 |

두 열을 다 본 이유: degraded 만 확인하면 「프로브가 성공하는 경로」를 한 번도 관측하지 않은
채 넘어간다. 의존을 실제로 붙여 `ok` 가 나오는 것까지 봐야 프로브가 동작한다고 말할 수 있다.

`tests/contract/run.js` (계약 harness) **34/34 · 자기 검증 PASS** — 계약 파일은 건드리지
않았고 골격만 얹었다(AC ④).

## 없는 것과 그 이유

| 없는 것 | 왜 |
|---|---|
| 도메인 구현 전부 | 티켓 범위가 표면이다. 라우터는 계약 형상만 알고, 저장소·조회·조사 실행을 모른다 |
| run-orchestrator 어댑터 | §7 이 요구하는 실행 격리 경계. 붙일 실행이 없는 단계에서 인터페이스만 먼저 굳히면 실제 실행이 그 모양을 못 따를 때 두 번 고친다 |
| bounded queue·backpressure·서킷브레이커 | 같은 이유 — 흘릴 작업이 생기는 티켓의 몫이다 |
| structured logging(run_id correlation)·지표 노출 | 상관시킬 run 이 아직 없다. 지금 넣으면 필드가 빈 로그만 쌓인다 |
| 일부 응답의 pydantic 모델 | 🔴 계약이 서술로만 둔 응답(설비 상세·evidence 실체·시나리오 항목 등)에는 모델을 만들지 않았다. 여기서 필드명을 지어내면 골격이 계약을 앞질러 정하고, 계약은 오케만 바꾼다 |
| agent-events 의 pydantic 전체 사본 | 정본은 `agent-events-v0.1.schema.json` 이다. 옮겨 적으면 정본이 둘이 되어 조용히 갈라진다 — envelope 필수 6필드만 얇게 두고 payload 는 열어 뒀다 |
| compose 의 ai-api 서비스 | `dev-environment.md` §3 판단(코드가 생긴 뒤 컨테이너화)을 유지한다 |

## 정합 메모 — 오케 확인 요청

1. **`/health` 경로가 `/api/health` 로 이동했다.** 계약 v0.1 이 「base = `/api`」를 선언하고
   운영 표의 `/health` 도 그 아래다. T1-0 이 임시로 쓰던 루트 `/health` 를 남기면 계약 밖
   경로가 하나 생기므로 옮겼다. `docs/product/dev-environment.md` §7 재현 절차와 §「검수」
   표가 아직 `http://localhost:8000/health` 를 친다 — 갱신 대상이다(docs 는 오케 scope).
2. **`/api/live/status` 는 `online: false` 를 답한다.** live 조사를 돌릴 실행 경로가 없으므로
   지금은 그게 참이다. true 가 되는 것은 실행이 붙는 티켓의 결과여야 한다.
3. **`/api/health` 응답에 `status`·`dependencies` 를 더했다.** 계약의 `ok`·`version` 은
   그대로 두었으므로 소비자 호환은 유지된다(계약 개정 아님). `ok` 는 프로세스 생존이고,
   의존 상태는 `status`(`ok`|`degraded`)가 말한다 — 의존이 죽었다고 `ok:false` 를 주면
   모니터가 프로세스 다운으로 읽고 재시작을 돌린다.

## 데이터 계층

DDL·마이그레이션은 `db/` 에 있다(T1-1). `pwsh db/migrate.ps1` — 자세한 것은 `db/README.md`.


## retrieval 3전략 — vector·hybrid·graphrag (T2-1)

`POST /api/retrieval/compare` 하나를 해제했다. **여기서 LLM 호출은 0이다** — 후보를 찾아
인용을 돌려줄 뿐이고, 합성(synthesize)은 T2-3의 몫이다.

| 전략 | 무엇을 하는가 | `score` 의 뜻 |
|---|---|---|
| `vector` | T1-4 색인 위 pgvector 최근접(코사인) | 코사인 유사도 |
| `hybrid` | 구조화 축(앵커 레코드 + 한 걸음 이웃 + ID 언급 chunk) **+ vector 축**을 RRF 결합 | RRF 점수 |
| `graphrag` | T1-5 투영 위 고정 template traversal(무방향 · 최대 6-hop · 종단 종류별 상한) | `1/(1+hops)` |

🔴 **`score` 는 «전략 내 서수»다.** 산출 방식이 전략마다 달라 전략 «사이»의 크기 비교는
뜻이 없다(오케 판정 2026-08-30 · 원장 Q-17). 화면이 세 숫자를 나란히 놓고 크기를 견주면
그것은 없는 사실을 말하는 것이다.

🔴 **`elapsedMs` 는 그 전략 1회의 관측치다**(계약 각주 · baseline §0.2). 모델 로드·색인
지문 대조는 «준비»라서 측정 구간 밖에서 끝낸다. 반대로 hybrid 는 vector 전략의 결과를
물려받지 않고 자기 벡터 축을 다시 돈다 — 물려받으면 hybrid 의 숫자에서 벡터 비용이 빠져
「hybrid 가 더 빠르다」는 없는 사실이 생긴다.

**게이트 — 요청이 검색에 닿기 전에 넘는 것**

1. `sessionId` 형식(영숫자·`-`·`_` 8~64자). 🔴 형식만 본다 — 세션 저장소와 결합하지 않으며,
   이 티켓은 격리를 «주장하지 않는다»(오케 판정 · 원장 Q-18).
2. `question` 은 서버측 allowlist(`app/retrieval/allowlist.py`) 통과분만. 목록 밖 질문은
   비슷한 질문으로 조용히 바꾸지 않고 **명시 거부**한다(`400 question_not_approved`).
   목록은 손으로 옮겨 적은 것이라 정본과 자동 대조한다 — `python -m tools.verify_allowlist`.
3. 색인 지문 대조 — `document_chunk` 의 `embedding_model`·차원이 질의 모델과 다르면
   `500 index_model_mismatch` 로 멈춘다. 🔴 차원만 보면 부족하다: 384차원 모델은 여럿이고
   다른 모델의 벡터도 «맞는 차원»으로 들어온다.

**실행 실물 (E1 · 2026-08-30 · 스택 `fkt-senku2-q3` · chunk 59 · 노드 309/관계 448)**

GS-01 축 질문(`Q-MULTIHOP-001`)을 3전략으로 1회:

| 전략 | elapsedMs | 상위 인용 |
|---|---:|---|
| vector | 94 | `DOC-MAN-0021@r1#005`(0.8628) 외 4건 — 전부 인용 가능 revision |
| hybrid | 41 | `AL-20260826-0041`(alarm 레코드 · `observed_value=6.3047`) + 문서 chunk 4건 |
| graphrag | 183 | `SOP-BRG-INSP-014`(3-hop) · `SAF-LOTO-01`(4-hop) — 경로 전문이 `excerpt` 에 |

🔴 graphrag 상한을 «종단 종류별»로 거는 이유가 여기서 나왔다. 전체 상한만 걸었을 때는
가까운 1~2-hop(Incident·Component)이 자리를 다 먹어 **SOP·SafetyRule 이 통째로 사라졌다**.
안전 규정 누락은 평가 규약에서 「경로가 맞아도 즉시 FAIL」이다(평가셋 `Q-MULTIHOP-001`).

**없는 것, 그리고 왜**

- `GET /evidence`·`/documents`·`/graph/paths` 는 여전히 501 이다(T2-2). 그래서 `evidenceId`
  로 전문을 되받는 소비 축은 이 티켓에서 검증되지 않았다.
- 색인 신선도(`v_index_freshness` 의 `STALE`)를 검색이 «거르지» 않는다. 계약의 compare 응답에
  그 사실을 담을 필드가 없고, 신뢰 배지는 `GET /evidence`·`/documents` 의 `stale` 필드가
  말하도록 계약이 정했기 때문이다(F-4). 실측 시점 색인은 `FRESH 45 · SKIPPED 15 · STALE 0`.


## 정정 이력 — 검증 적발 3건 (V-1·V-2·V-3 · 2026-08-30)

독립 검증이 T2-1 착지분에서 잡은 결함이다. 세 건 모두 **같은 병**이었다 — 「경계를 문자
종류로 판정했는데, 그 종류에 한글·후속 문자가 들어와 경계가 서지 않는다」.

**V-1 — 한글 조사가 붙으면 앵커가 잘린다.** `` 는 «단어 문자(`\w`) ↔ 비단어» 전이를
보는데 한글이 `\w` 에 든다. 그래서 「`EQ-CNC-204`의 …」의 평문 표기에서 끝 `` 가 서지
않고, 정규식은 실패하는 대신 **뒤로 물러나 `EQ-CNC` 로 «성공»한다**. 잘린 ID는 실재하지
않아 조회가 0행이 되고 화면에는 「근거 없음」으로만 보인다 — 그 사이 **안전 규정이 조용히
사라진다**(`SAF-LOTO-01` 소실).

| 실측 (E1) | 정정 전 | 정정 후 |
|---|---|---|
| 승인 10문 · 정본 표기 ↔ 평문 표기 앵커 일치 | **2/10** | **10/10** |
| `Q-MULTIHOP-001` 평문 표기 graphrag hits | 빈 목록 | `SOP-BRG-INSP-014`·`SAF-LOTO-01` 포함 |

처방은 두 겹이다. ⓐ 경계를 **ID 문자집합 밖**(`(?<![A-Z0-9-])…(?![A-Z0-9-])`)으로 바꿨다.
ⓑ 🔴 그리고 **승인 시점에 표준 표기 하나로 모은다**(`allowlist.canonical`) — 앵커만 고쳐도
`vector` 축은 여전히 갈린다. 질의 «문자열 자체»가 임베딩 입력이라 백틱 하나에 순위가
흔들리기 때문이다. `normalize()` 가 「같은 질문」이라 승인해 놓고 다르게 검색하는 구조
자체를 닫았다. 목록 밖 질문은 여전히 400 이므로 이것은 «조용한 폴백»이 아니다.

**재발 그물**: `python -m tools.verify_allowlist` 에 **표기 대조 축**을 넣었다 — 승인한 모든
표기로 앵커를 뽑아 10문 전건 비교한다. 그물이 실제로 잡는지는 대조군으로 확인했다(옛
정규식을 끼워 넣고 같은 검사기를 돌리면 **exit 1 · 불일치 8건**).

🔴 **0행을 오류로 만들지는 않았다.** 잘린 앵커의 0행이 「없음」과 구별되지 않는 것이 위험의
본체이지만, `EQ-CNC-999`(미존재 설비)처럼 **0행이 정답인 승인 질문**이 실재한다(환각 내성
문항). 근본은 경계에서 닫고, 재발은 그물이 지킨다.

**V-2 — 의존이 죽으면 계약 밖 응답이 나갔다.** Neo4j 정지 중 compare 를 부르면 미포착
예외가 ASGI 기본 500(`text/plain` «Internal Server Error»)으로 나갔다. 소비자는 「어떤
오류든 `{"error":{...}}`」를 전제로 파싱하는데, 하필 «의존이 죽은» 순간에만 형상이 달라지면
화면은 그 순간을 오류로도 인식하지 못한다.

| 실측 (E1 · q3 neo4j 정지 재현) | 응답 |
|---|---|
| 정정 전 | `500` · `text/plain` · `Internal Server Error` |
| 정정 후 | `503` · `application/json` · `{"error":{"code":"dependency_unavailable","message":"neo4j 에 연결할 수 없다 …"}}` |

전역 예외 핸들러(`internal_error`)로 구멍을 막고, 의존 단절은 **구분 코드**를 준다.
🔴 `message` 에 예외 문자열·traceback·경로를 싣지 않는다 — 인증 없는 공개 배포(REPLAY 축)라
내부 구조가 그대로 밖으로 나간다(§34.6). 전문은 서버 로그에만 남는다. 같은 이유로
기존 503 이 응답에 붙이던 프로브 사유 문자열(`res.notes`)도 걷어냈다.

**V-3 — 낡음을 잡는 도구가 낡음에 뚫려 있었다.** `verify_allowlist` 의 제목 정규식
`^###\s+(Q-[A-Z]+-\d+)` 에 뒤 경계가 없어, 정본이 `### Q-SAFETY-002x` 로 개정돼도 도구는
`Q-SAFETY-002` 로 읽고 «일치»를 말한다. V-1 과 같은 처방(문자집합 경계)으로 닫았다 —
제목 뒤에는 `〔C-4로 재설계〕` 같은 주석이 붙으므로 `$` 로는 잠글 수 없다.

| 대조군 (E1 · 정본은 읽기만 · 개정은 임시 사본에 주입) | 정정 전 | 정정 후 |
|---|---|---|
| 정본 그대로 | 10문 인식 | 10문 인식 |
| `Q-SAFETY-002x` 로 개정한 사본 | **10문 인식(낡음 못 잡음)** | 9문 · 불일치로 FAIL |


## 문서·evidence 읽기 — /scenarios · /evidence · /documents (T2-2)

retrieval(T2-1)이 «무엇을 인용할지 찾는» 쪽이라면 이쪽은 «그 인용을 펴 보이는» 쪽이다.
응답 형상의 정본은 계약 `rest-api-v0.1.md` 의 **「v0.1.1 응답 형상 append」** 절이다 —
계약이 서술로만 두었던 자리를 오케가 성문했고, 구현은 여기서 필드를 새로 짓지 않는다.

### 왕복이 이 티켓의 완료 증거 (E1 · 2026-08-30)

`GET /scenarios` 가 준 질문 → `POST /retrieval/compare` → 그 응답의 `evidenceId` →
`GET /evidence/{id}` → `GET /documents/{docId}?highlight={chunkId}` 까지 한 줄로 이었다.

| 축 | 실측 |
|---|---|
| compare 가 낸 evidenceId 전건 조회 | **11/11 → 200** (doc-chunk 5 · record 6) |
| `원문[start:end] == evidence.text` | **doc-chunk 5/5 True** |
| `/scenarios` 질문을 그대로 compare 에 | 400 없이 통과(단일 정본이 성립한다는 뜻) |

🔴 **왕복이 결함을 하나 잡았다.** `CP`(Component)가 테이블 화이트리스트에서 빠져 있어,
graphrag 가 종단으로 낸 `CP-204-BRG-01` 을 `/evidence` 가 404 로 답했다 — **자기가 낸
근거를 자기가 펴지 못하는** 상태였고, T2-1 안에서는 드러나지 않았다(hybrid 도 부품 레코드를
집지 못했다). 「찾는 쪽」과 「펴는 쪽」을 이어 봐야 보이는 종류의 구멍이다.

### 인용 좌표 (`highlight`)

`document_chunk` 에 offset 열이 없어 **원문 대조로 산출**한다. 착수 전 실측(chunk 59건):
본문에서 그대로 발견 59/59 · 본문 안 등장 횟수 정확히 1회 59/59 · 인접 chunk 간격 gap 0.

그럼에도 `body.find()` 한 방으로 끝내지 않고 **앞에서부터 순차**로 찾는다 — 「1회만 등장」은
동결 정책이 `overlap_ratio=0` 이라서 참이고, overlap 이 켜지면 같은 문장이 두 chunk 에 들어가
단순 `find` 는 뒤 chunk 좌표를 조용히 틀리게 만든다. 좌표를 못 찾으면 `highlight: null` 이며,
🔴 0 이나 전체 범위 같은 그럴듯한 값을 지어내지 않는다(엉뚱한 문장을 강조하는 거짓은 오류
없이 살아남는다).

**문장이 chunk 경계에 걸리는 경우** — 현 데이터 **0건**이다(chunk 59건 전부 절 제목에서
시작). 동결 정책 `section_sentence/512` 가 문장 경계를 지키기 때문이며, 발생 조건은
**한 문장이 512 token 예산을 넘길 때**다: 그때 `chunking._split_greedy` 가 더 쪼갤 계층을
소진하고 `split_fixed` 로 내려가 문장 중간에서 자른다. 그 경우 `highlight` 는 **그 chunk
구간만** 가리킨다 — 문장 전체가 아니라 인용된 조각의 좌표다.

### 🔴 chunk ID 와 URL — `#` 는 인코딩해야 한다

chunk ID 는 `{document_id}@r{N}#{NNN}`(T0-6 §3.1)이고 **`#` 는 URL 의 fragment 구분자**다.
`GET /api/evidence/DOC-SOP-0014@r2#001` 을 그대로 보내면 서버에는 `DOC-SOP-0014@r2` 까지만
닿아 **404** 가 난다(실제로 첫 왕복 실측이 여기서 걸렸다). 소비자는 경로 세그먼트를
percent-encoding 해야 한다 — `DOC-SOP-0014%40r2%23001`. 실패가 조용하지 않고 404 로 드러나는
것은 다행이지만, 화면을 붙일 때 같은 함정에 빠지기 쉬운 자리다.

### STALE 배지 — 「지문이 있다」와 「낡으면 운다」는 다르다

배지는 `v_index_freshness` 에서 온다. 낡음을 실제로 만들어 봐야 «운다»를 말할 수 있는데,
자기 스택은 읽기 전용이므로 **단일 트랜잭션 안에서 변조 → 배지 산출 경로 조회 → `ROLLBACK`**
으로 쟀다(오케 승인 «안 A» · 영구 쓰기 0).

| 대조군 (E1 · `index_build.source_sha256` 1행 · 커밋 없음) | `freshness` | 배지 `stale` |
|---|---|---|
| 주입 전 | `FRESH` | `false` |
| 주입 후 (같은 트랜잭션) | **`STALE`** (사유 `SOURCE_SHA`) | **`true`** |
| `ROLLBACK` 후 | `FRESH` | `false` (sha 원값 동일 확인) |

🔴 **이것은 SQL 계층 실증이지 HTTP 왕복이 아니다.** 커밋하지 않으므로 다른 세션에서는
그 상태를 볼 수 없고, 그래서 API 표면까지의 낡음 대조군은 독립 스택을 가진 검증 좌석의 몫이다.

| 대조군 2행 — `ontology_registry` 를 비워 «버전 확인 불가»를 만든다 | `freshness` | 배지 `stale` |
|---|---|---|
| 주입 전 | `FRESH` | `false` |
| 주입 후 (같은 트랜잭션) | **`ONTOLOGY_UNVERIFIED`** | **`true`** |
| `ROLLBACK` 후 | `FRESH` | `false` (registry 원값 동일 확인) |

**boolean 하나가 답하는 질문은 「신선한가」가 아니라 「신선이 «실증»됐는가」다.** 뷰는 여섯
상태를 가르는데(`FRESH`·`STALE`·`SKIPPED`·`NOT_INDEXED`·`ONTOLOGY_UNVERIFIED`·`BUILD_FAILED`)
계약의 `stale` 은 boolean 이다. 그 압축을 「`STALE` 만 true」로 하면 **`ONTOLOGY_UNVERIFIED`
가 false 로 나간다** — 「온톨로지 버전을 확인하지 못했다」를 「신선하다」로 말하는 것이고,
그것이 Phase 1이 Q-6로 잡은 «조용한 FRESH 단정» 병의 API 층 재발이다(오케 판정 08-30).

그래서 **`FRESH` 만 false** 다. 뷰에 새 상태가 생겨도 자동으로 true 가 되고, 값이 없는
경우(`None`)도 true 다 — 「모른다」는 「신선하다」가 아니다. `SKIPPED`·`NOT_INDEXED` 는 chunk
를 만들지 않아 doc-chunk 응답에 도달하지 않는데, 🔴 그 «믿음»은 주석으로 두지 않고 **가드가
실행 시점에 확인**한다(도달하면 로그 경고 · 그 경우에도 배지는 true 라 답은 안전하다).

**남는 한계**: 이 boolean 은 «왜» 신선이 실증되지 않았는지 말하지 못한다. 6상태 노출은
계약 개정 사안이라 **Q-22 로 등재**됐다(v0.2 재론). 실측 시점에는 chunk 를 가진 revision 45건이
전부 `FRESH` 라 이 압축이 겉으로 드러나지 않는다(뷰 60행 · 뷰에 없는 revision 0) — 데이터가
가려 주고 있을 뿐이다.

## 작업지시(WO) 초안 — 편집 화이트리스트와 그 실측 (T2-5)

`GET/PATCH /work-orders/{woId}` · `POST …/approve|reject` 는 조사가 낸 **초안**(`WOD-`)을 다룬다.
공장 `work_order` 테이블(`WO-` · seed 15행)은 **읽지도 쓰지도 않는다** — id CHECK 가 서로
배타이고 상태 enum 낱말이 어긋난다(계약 v0.1.4 저장 축 해석).

**R12 강제는 「막을 목록」이 아니라 「허용 목록」이다.** 편집 가능한 필드는 `title`·`parts`
둘뿐이고 나머지는 이름을 몰라도 거절된다. 막을 것을 세는 방식으로 갔다면 여섯을 막아도
일곱 번째가 남는다 — 실제로 성문된 형제 6종 밖에서 넷이 더 나왔다(`gaps` 삭제 = 「안전 조치가
없다는 경고」 제거 · `evidenceIds` 삭제 · `approvalState` 직접 승인 · **approve 본문에 편집을
실어 보내기**). 마지막 것은 pydantic 기본값이 여분 키를 조용히 버리던 자리라
`DecisionComment` 에 `extra="forbid"` 를 걸었다.

🔴 **전부 거절하는 서버는 R12 를 지킨 것이 아니라 편집을 막은 것이다.** 그래서 대조군이
판정에 포함된다 — 일반 항목(`parts`)은 빈 배열로 «지워져야» 하고 `title` 은 반영돼야 한다.

```powershell
.venv\Scripts\python.exe -m tools.verify_work_order_surface   # 서버·DB 필요 · 34행
.venv\Scripts\python.exe -m tools.probe_work_order_guards     # 프로세스 안 · 8행
```

두 도구로 나눈 이유가 곧 이 표면의 성질이다. 앞의 것은 실제 GS-01 run 으로 재지만, **화이트
리스트 때문에 만들 수 없는 상태**가 셋 있다(안전 조치 0건 초안의 승인 거절 · 한 초안 id 를 두
run 이 주장하는 충돌 · live run 인데 본문이 없는 경우). 그 셋은 34행 초록 아래에서 **한 번도
실행된 적 없는 분기**로 남아 있었다 — 뒤의 프로브가 합성 초안으로 그 자리를 연다. 앞 도구의
출력 말미에는 「못 잰 열」 표가 남아 있고, 각 행이 어느 프로브 번호에서 재지는지를 적는다.

**승인 이력**: `auditId` 는 실물이고 원장은 run 저장소와 **따로** 산다(run 은 `MAX_RUNS` 로
버려지는데 원장이 그 안에 있으면 대상보다 먼저 죽는다). 🔴 다만 **이력 조회 라우트는 없다** —
계약(v0.1 + append 전건)에 그 표면이 없고, 없는 경로를 구현이 지으면 「계약 밖 경로 0」을
구현이 깬다. 조회는 `ApprovalStore.get_audit`/`audits_for` 로 끝나며, 화면이 이력을 그려야 할
때 계약 append 가 선행이다.

## 컨테이너로 띄울 때 (T4-1)

```
docker compose up -d          # postgres · neo4j · ai-api (healthcheck = /api/health)
```

- 🔴 **이미지는 리포가 아니다.** `app/` 만 들어간다. 모듈이 `Path(__file__).parents[N]` 으로
  리포 루트를 «추측»하면 컨테이너에서 그 위가 없어 import 가 죽는다 — 실제로 그렇게 죽었고
  (`replay.py` crash loop), 지금은 자리를 지연 계산하고 없으면 「없는 자리」를 돌려준다.
  부재는 `501 replay_fixture_missing` 으로 드러나지 부팅 실패로 드러나지 않는다.
- 🔴 **`FKT_REPLAY_FIXTURE_DIR` = 리포 트리 바인드**(귀속 탐침 전제 · Q-42). 검증 좌석의
  colocation 탐침이 replay fixture 를 「이 서버가 어느 트리의 것인가」의 표식으로 쓴다.
  read-only 바인드라 호스트에서 손질한 자국이 컨테이너에서 보이고, 그래서 그 축이 선다.
  fixture 를 이미지에 구워 넣으면 탐침은 초록인 채로 «다른 것»을 맞추게 된다.
- 🔴 **`FKT_BUILD_SHA` 는 빌드 인자다**(Q-46). 이미지 안에서 git 을 부르지 않는다 —
  리포를 이미지에 넣어야 하고 그러면 경로·히스토리가 함께 들어간다.
  `docker compose build --build-arg FKT_BUILD_SHA=$(git rev-parse --short HEAD)`.
  안 주면 `/api/health` 가 `"build": "unknown"` 이라고 «사실대로» 답한다.
- 🔴 **자격 증명은 환경변수로만.** compose 파일·이미지에 DSN·비밀번호를 굽지 않는다(§16.3).
- 임베딩 warm-up 은 기동 시 «백그라운드»로 돈다(`FKT_WARMUP_EMBEDDING=0` 으로 끈다).
  준비 여부는 `/api/health` 의 `models.embedding` 이 말한다 — 실측: 콜드 120.8s ·
  모델 캐시 볼륨이 살아 있으면 14.9s.

## 문서 커밋 이후 붙은 축 — live 합성 · 세션 상한 · 진행 스트리밍 (2026-09-04 대조)

🔴 **이 파일의 마지막 갱신은 2026-09-01 `ce314c9` 이고, 위 서술은 T4-1(컨테이너) 까지다.** 그 뒤 T6-1·T6-2·T6-3 으로 붙은 축을 아래에 적는다 — **코드에서 확인한 것만**이고, 운영 절차의 정본은 `docs/deployment/runbook.md` §7 이다.

### live 합성 (T6-1·T6-2 · `app/investigation/live_synthesis.py`)

- 🔴 **`FKT_LOCAL_SYNTHESIS_GATEWAY` 가 켜졌을 때만 이 모듈이 import 된다**(`synthesize.resolve_synthesizer` · 상수 = `synthesize.LIVE_GATE_ENV`). 공개 배포 프로세스 안에는 이 코드가 «불려오지» 않는다 — 그것이 공개면의 결정적 축을 지키는 방식이다.
- 게이트웨이는 **운영자 PC 의 호스트 프로세스**이고 compose 에 없다(`services/synthesis-gateway/` · 기본 `127.0.0.1:8787`). 컨테이너에서 붙일 때 더하는 env 2개와 토큰 규율은 runbook §7-2.
- 🔴 **조용한 폴백 0** — 게이트웨이가 못 답했거나, 답이 근거 결속을 깨거나, 형상이 어긋나면 **전량 거부**한다. 그때도 결정적 순위를 그대로 쓰되 `axis="live-rejected"` 와 사유를 드러낸다. **부분 채택은 하지 않는다**(순위와 문장이 서로 다른 쪽에서 오면 화면의 근거 표기가 거짓이 된다).
- 의존은 표준 라이브러리(`urllib`)뿐이다 — 이 축 때문에 새로 들인 패키지가 없다.
- 🔴 타임아웃 불변식 = **게이트웨이 상한 < 클라이언트 예산**. 두 층이 같은 이름을 읽던 시절에는 「어느 쪽이 끊었나」가 사라졌다(runbook §7-1).

### 세션 단위 실행 상한 (`app/investigation/session_cap.py` · 계약 v0.1.12)

| 값 | 기본 | 어디 |
|---|---|---|
| `run_cap_per_session` | **3** | `app/settings.py`(env 접두사 `FKT_` = `FKT_RUN_CAP_PER_SESSION`) |
| `run_cap_window_sec` | **3600.0** | 같은 곳 |
| `run_timeout_sec` | **300.0** | run 하나가 붙잡을 수 있는 최대 시간 · 넘기면 `run.stopped reason=timeout` + 안전 종료 |

`admit()` 은 상한 안이면 `None`, 넘으면 **`Retry-After`(정수 초)**를 돌려주고 `429 session_run_cap_exceeded` 가 된다. 🔴 `Retry-After: 0` 을 내지 않는다 — 그것은 「지금 다시 두드리라」가 되어 거절의 뜻을 지운다. 🔴 **replay 는 이 상한이 막지 않는다**(runbook §7-2).

### 마이그레이션 — 실물 8본 (2026-09-04 확인)

`services/ai-api/db/migrations/` = `001_core_schema` · `002_id_integrity_checks` · `003_vector_index_build` · `004_ontology_freshness` · `005_ssot_manifest` · `006_graph_projection` · `007_freshness_unverified_and_integrity` · `008_graph_source_digest`. `pwsh db/migrate.ps1` 이 001~008 을 순차 적용한다(runbook §4-1 손순서 2단). 🔴 **`COMPOSE_PROJECT_NAME` 을 안 주면 postgres 가 healthy 인데도 「기동 중이 아닙니다」로 죽는다**(D-18 · runbook §4-1a).

### 진행 스트리밍 (T6-3 · 계약 v0.1.13)

이벤트 스키마 `type` 이 **10종**이 되었다 — `step.progress` 가 추가됐다(`app/investigation/events.py`). 방출 지점은 `app/investigation/workflow.py` 다.
