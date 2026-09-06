# 승격 23 근거 — develop 무대 독립 검증 (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-5`
- 측정 창: 2026-09-06 07:36:45 ~ 07:42:23 (`date` 실측 · 로컬)
- 대상: develop 무대 ai-api `127.0.0.1:8020` · 게이트웨이 `127.0.0.1:8797`
- 발주: 스자쿠 49대 (2/2) — 승격 23 근거 · 상한 약 15분
- 판정 lane: `lane/levi2-stage23`
- production 3면(`:8010`·`:8787`·공개 도메인) **무접촉** — 이 문서의 어떤 값도 production 에서 오지 않았다.

## 0. 귀속 — 이 서버가 승격 대상 build 인가 (창을 열기 «전»)

| 축 | 측정 | 값 | 판정 |
|---|---|---|---|
| 자기 신고 | `GET /api/health` `.build` | `dd1a2e1` | 일치 |
| 이미지 태그 | `docker inspect fkt-dev-ai-api .Config.Image` | `fkt-ai-api:dev-dd1a2e1` | 일치 |
| 컨테이너 | `.Id`(12) / `.State.StartedAt` | `d35afb978f13` / `2026-09-05T22:20:12Z` | 창 이전 기동 |
| 거동 | 축 ② D-87 4종 404 (처방 있을 때만 나오는 값) | 4/4 404 | 처방 적재 확증 |

자기 신고 2축이 서로를 확인하고, 거동 1축이 그 둘과 독립으로 같은 결론을 낸다(E1).

## 1. 축별 판정

### ① `/api/health` — **PASS**

`07:36:45` · `HTTP/1.1 200`

```
{"ok":true,"version":"0.1.0","status":"ok",
 "dependencies":{"postgres":{"state":"ok","latencyMs":55},"neo4j":{"state":"ok","latencyMs":3}},
 "build":"dd1a2e1",
 "models":{"embedding":"ready","detail":"intfloat/multilingual-e5-small · warm-up 53.4s"}}
```

postgres ok · neo4j ok · `models.embedding = ready` — 발주 요구 3항 전건 충족(E1).

### ② D-87 문서 표면 4종 404 + 대조군 B — **PASS**

한 루프 · `07:37:02` (같은 실행 · 같은 클라이언트):

| 경로 | 코드 | 뜻 |
|---|---|---|
| `/docs` | 404 | 닫힘 |
| `/redoc` | 404 | 닫힘 |
| `/openapi.json` | 404 | 닫힘 |
| `/docs/oauth2-redirect` | 404 | 닫힘 |
| `/api/scenarios` (대조군 B) | **401** | 서버는 살아서 라우팅한다 |

🔴 대조군 B 가 이 초록의 주어를 정한다 — 401 이 같은 실행에서 나왔으므로 위 404 는
「서버가 죽어서」도 「전부 404 를 뱉는 문」도 아니다. 4종만 닫혔다(E1).

### ③ replay 실행 — **PASS**

- `POST /api/sessions` → 200 · `sessionId`(24자) + `Set-Cookie` 수령
- `POST /api/scenarios/GS-01/runs` body `{"sessionId":…,"mode":"replay"}` → **200**
  `{"runId":"RUN-f400f5630ee1","incidentId":"INC-2026-014","mode":"replay"}`
- `GET /api/runs/RUN-f400f5630ee1/events` → 200 · **38건** · `seq` 0~37 **연속**(`seqs == range(38)`)
- `GET /api/runs/{id}` → `status=completed` · 발사~완주 4.6초
- 무대 fixture 실재: 컨테이너 `/srv/data/replay/gs-01.events.jsonl`(17045B)

🔴 `completed` 는 상태값일 뿐이라 **단계별 산출 건수**를 따로 셌다 — 0건 단계 없음:

```
run.started 1 · plan.updated 1 · step.started 5 · step.progress 6 ·
step.evidence 19 · step.completed 5 · run.completed 1   (합 38)
```

계수 기준선은 **총계가 두 번 연속 같을 때**로 잡았다(`completed` 뒤에도 총계가 자라는 자리를 피한다).
발주문이 인용한 센쿠2 O-42 값 「38건 seq 0~37」과 일치 — 다만 O-42 값 자체는 **전언**이고,
여기 38 은 이 창에서 내가 센 값이다.

### ④ 게이트웨이 `:8797` — **PASS**

`07:37:05` · `HTTP/1.1 200` · `{"ok":true,"timeoutMs":60000,"model":"opus","effort":"low","promptSha256":"a71c93b148db","bind":"127.0.0.1","authRequired":false}`

`promptSha256 = a71c93b148db` — 발주 인용값과 일치(불변). `bind=127.0.0.1`(loopback).
`promptPath` 는 운영자 홈 아래 develop-stage 워크트리의 절대경로를 그대로 싣는다 —
기지 사항이며(선대 evidence 3본에 이미 기록) loopback 전용이라 이 판정에서는 회부하지 않는다.

### ⑤ 회귀 — 기존 서버 드릴 **`tests/api/t741a_session_runs.py`** 1본 · **PASS**

`07:42:21~23` · `--base http://127.0.0.1:8020` · **rc=0**

```
{"requested":21,"created":21,"codes":{"200":21},"settledWithinWait":20}
{"status":200,"count":20,"madeMoreThanLimit":true,"limit20":true,"shapeOk":true,
 "extraKeys":[],"descOk":true,"newestFirstIsLastMade":true,"oldestMadeDropped":true}
{"mismatch":{"status":422,"code":"invalid_request"},
 "noCookie":{"status":401,"code":"session_required"},
 "missingParam":{"status":422,"code":"invalid_request"}}
```

`GET /runs?sessionId=` 표면(상한 20 · desc · 형상 · 여분 키 0)과 세션 가드 3열이 전건 계약대로다.
이 드릴은 run 생성을 **`mode:"replay"` 로만** 한다 — 구독 소비 0.

#### 드릴 선택 근거 (「이름 말고 행위로 골랐다」)

| 후보 | 실행 결과 / 배제 사유 |
|---|---|
| `t741a_session_runs` | **선택** · replay 전용 · docker 자극 0 · rc=0 |
| `cypher_surface_drill` | 실행 rc=**2** 「측정 불가 — 귀속 미증명」 — colocation 게이트가 **자기 트리를 읽는 서버**를 요구한다. 공유 무대에는 구조상 안 걸린다(대상 결함 아님) |
| `query_surface_sql_drill` | 같은 사유 rc=2 |
| `error_shape_drill` | `docker` 자극 5건(의존 정지 열) — 공유 무대에 파괴적이라 배제 |
| `event_schema_drill` | `mode:"live"` 열 포함 — 구독을 태운다, 배제 |
| `d68_gp_evidence` | `--target` + `--control` 2서버 요구 · 무대는 1본이라 성립 불가 |

rc=2 두 건은 **대상의 빨강이 아니다** — 그물의 전제(colocation)가 이 무대에서 성립하지 않는 것이고,
그물이 그 사실을 스스로 `exit 2` 로 말했다. 「측정 불가」로 분류하고 초록에도 빨강에도 넣지 않는다.

## 2. 정정 회부 — 발주문 전제 1건 (실물이 발주문을 이긴다)

발주문 축 ③: 「sessionId(`/enter` POST 로 발급)」.
**실물**: ai-api 라우트 표에 `/enter` 는 없다. 세션 발급은 `POST /api/sessions`
(`services/ai-api/app/routers/sessions.py:41`)이고, 응답 `sessionId` + `Set-Cookie` **둘 다**를
후속 요청에 실어야 한다(가드: 쿠키≠본문 = 422 · 본문 단독 = 401 — 축 ⑤ 3열이 실측).
`/enter` 는 셸(화면) 경로다. 이 문서의 측정은 실물 경로로 수행했다.

## 3. 무대에 남긴 것 (투명성)

- 축 ③: replay run 1건 · 축 ⑤: replay run 21건 — 전부 `mode:"replay"`, **구독 소비 0**.
- 세션 store 는 in-memory 라 컨테이너 재기동으로 소거된다. 파일·DB·fixture 변경 0.
- 내 워크트리 `git status --porcelain` = **0** (드릴 실행 후 재측정).

## 4. 결론

**축 ①②③④⑤ 전건 PASS · FAIL 0 · 측정 불가 2건(회귀 드릴 후보 2본 · 대상 무관).**
build `dd1a2e1` 는 develop 무대에서 승격 23 근거로 성립한다.

🔴 이 초록의 범위: **develop 무대 서버 축**이다. 공개 도메인·production 표면은 이 창에서 재지 않았다
(외부 재검은 승격 집행 «후» 별건 발주 소관).
