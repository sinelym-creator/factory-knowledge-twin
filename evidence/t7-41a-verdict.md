# T7-41a 독립 검증 판정문 — `GET /runs?sessionId=` 서버 축 (계약 v0.1.16)

> 검증 좌석(리바이2 44대) · 2026-09-04 · 발주 = 스자쿠 38대 18:46
> 대상 = PR **#625** `lane/senku2-t7-41a` **`4ef8c3f`** · 대조군 = `origin/develop` **`edf1652`**
> 정본 = `packages/contracts/rest-api-v0.1.md` v0.1.16 append(`GET /runs?sessionId=` 절 · #626 정정 문면)
> 그물 = `tests/api/t741a_session_runs.py`(이 lane · 두 세계에 같은 코드로 걸었다)

## 판정 — **PASS**(6축 전건 · 범위는 아래 「안 잰 것」이 정한다)

## 0. 무대 (실측 · 벽시계는 `date` 출력)

| | 대상 | 대조군 |
|---|---|---|
| 포트 | `127.0.0.1:8152` | `127.0.0.1:8153` |
| 트리 | `_wt/levi2-t741tgt` @ `4ef8c3f` | `_wt/levi2-t7-41av` @ `edf1652` |
| `/api/health.build` | `4ef8c3f-levi2-44-tgt` | `edf1652-levi2-44-ctl` |
| 의존 | postgres `:5534` ok · neo4j `:7587` ok | 같음 |
| 무대 울림 | **replay run 21/21 생성(200×21)** · 20건 종결 | **replay run 21/21 생성(200×21)** |

🔴 **자기 신고를 믿지 않았다** — 대조군이 처방을 «안» 실었다는 근거는 build 문자열이 아니라
**거동**이다: `GET /api/runs` 가 대조군에서 **404**(라우트 부재)이고, 트리 grep 도 0건이다.
대상 트리에는 `RunRecord.startedAt`/`_finishedAt`(store.py:57·60)과 `SESSION_RUNS_LIMIT = 20`
(investigations.py:369)이 실재한다. **양방향으로 찍었다.**

🔴 **live 는 한 번도 쓰지 않았다**(구독 소모 0). 이 축은 replay 로 전부 선다.

## 1. 축별 실측

| 축 | 판정선(정본) | 대상 실측 | 대조군 실측 | 판정 |
|---|---|---|---|---|
| ① 형상·순서·상한 | `[{runId,incidentId,scenarioId,mode,status,startedAt,finishedAt?}]` · 최신순 · 상한 20 | 21건 생성 → **응답 20건** · 필수 키 전건 · **잉여 키 0** · `startedAt` 내림차순 · **머리 = 가장 늦게 만든 run** · **가장 먼저 만든 run 탈락** | `404 http_404` | **PASS** |
| ② 세션 격리 | 세션 B 는 0건 | B 최초 **200 `[]`** · B 가 자기 run 1건 만든 뒤 **200 · 그 1건만**(`mineOnly`) | `404` | **PASS** |
| ③ 422 / 401 | 쿠키≠쿼리 422 `invalid_request` · 쿠키 없음 401 `session_required` | 불일치 **422 `invalid_request`** · 무쿠키 **401 `session_required`** · B 쿠키로 A id 질의 **422 `invalid_request`** · 쿼리 누락 **422 `invalid_request`** | 모두 `404` | **PASS** |
| ④ 재기동 축 | 옛 쿠키 401 → 재입장 새 세션 200 `[]` | 재기동 **전** 같은 쿠키 **200** → 프로세스 교체(PID 35212 → **7636** · build `…-tgt-restart`) → 옛 쿠키 **401 `session_required`** → 새 세션 **200 `[]`** | (해당 없음) | **PASS** |
| ⑤ `activeAlarms[].incidentId` | 연결표 실재만 | 알람 1건 `AL-20260826-0041` → `incidentId: "INC-2026-014"` · **그 incident 를 실제로 열어 200** | 같은 알람 1건 · **필드 자체 없음** | **PASS** |
| ⑥ `finishedAt ≥ startedAt` | 구현이 잡은 파생값 결함의 재확인 | 완주 20건 · **위반 0** · 도는 run 에 `finishedAt` 키 없음(null 을 지어 넣지 않음) | 관측 불가(엔드포인트 부재) | **PASS** |

**대조군 열의 뜻** — 축 ①②③⑥ 이 전부 `404` 로 죽는다. 같은 코드·같은 실행에서 대상만 초록이므로
이 초록은 **그물이 늘 내는 색이 아니다**. 대조군에서도 replay run 21건이 만들어졌다(무대는 양쪽 다 울렸다).

## 2. 잰 것 / 안 잰 것

**잰 것** — 위 표 6축 · 양쪽 세계 각 1회 완주 · 산출 raw = `evidence/t7-41a-runs.json`(대상)·`t7-41a-runs-control.json`(대조군).

**안 잰 것(이름으로 남긴다 — 「없다」가 아니라 「이 회차가 못 본 것」이다)**

1. **`incidentId: null` 갈래** — seed 의 활성 알람이 1건이고 그 1건이 연결을 갖는다. **연결 없는 알람 표본 0** ⇒ null 갈래는 시험되지 않았다.
2. **`finishedAt > startedAt`(엄격 부등)** — replay 는 즉시 완주해 두 값이 **같은 밀리초**로 찍힌다(`2026-09-04T09:53:37.321Z`). 이 회차가 증명한 것은 「거꾸로 가지 않는다」이며, 시간이 흐르는 run 의 축은 live 에서만 갈린다(구독 소모 때문에 이 발주에서 태우지 않았다).
3. **상한 20 «넘겨서도» 최신순인가** — 21건에서 20건을 봤다. `MAX_RUNS = 200`(store eviction) 근처의 거동은 안 쟀다.
4. **다중 워커** — 저장소가 프로세스 메모리라 워커 2+ 배치는 이 축의 답이 다르다(계약이 이미 성문한 미측정 축).
5. **화면 축(계약 판정선 ⑤ `sessionStorage` 제거)** — 이번 발주는 «서버 축»이다. 셸이 이 엔드포인트로 갈아탔는지는 여기서 판정하지 않는다.

## 3. 자수 (내 계측기)

- 없음(이 티켓 범위). 대상 결함 **0건**.
- 참고: 1차 `curl http://…/health` 404 는 **접두 `/api` 를 안 붙인 내 실수**였고 대상의 답이 아니다.

## 4. 재현

```
# 무대
python -m uvicorn app.main:app --host 127.0.0.1 --port 8152   # cwd = 대상 트리 services/ai-api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8153   # cwd = 대조군 트리 services/ai-api
#   env: FKT_POSTGRES_DSN / FKT_NEO4J_URI / FKT_NEO4J_USER / FKT_NEO4J_PASSWORD (프로세스 env 만 읽는다)
# 그물
python tests/api/t741a_session_runs.py --base http://127.0.0.1:8152 --out <out>.json --runs 21
python tests/api/t741a_session_runs.py --base http://127.0.0.1:8153 --out <ctl>.json --runs 21
# 축 ④ 는 프로세스 교체가 필요하다: 대상 kill → 재기동 → 옛 쿠키로 질의 → 새 세션 발급 → 질의
```
