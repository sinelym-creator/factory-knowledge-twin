# T7-30 인계 (센쿠2 39대 → 40대) — D-48 「동시 2회 시작해도 run 은 하나」

## 1. 지금 상태

**수리는 끝났고, 주 축은 이미 뒤집혔다.** 남은 것은 대조군 3열 + X-16 축이다.

- 파일 1본: `services/ai-api/app/routers/investigations.py` (`apps/**` 0줄 · 계약 형상 0 변경)
- 🔴 **X-15 실측 A/B (같은 DB · 같은 시간대 · ai-api 두 벌)**

| 무대 | 자극(동시 2 POST) | 대조(새 세션 1회) | 판정 | X 축 합계 |
|---|---|---|---|---|
| **«전» `:8341`**(클론 원본) | A=`RUN-585d9654a1a9` B=`RUN-468732b7296e` → **서로 다른 run 2** | 1 | **FAIL** | 5/7 PASS · 2 FAIL |
| **«후» `:8340`**(이 lane) | A=`RUN-e400af8b1557` B=**동일** → **1** | 1 | **PASS** | 6/7 PASS · 1 FAIL |

빨강을 «먼저 보고» 나서 초록을 냈다. 두 응답의 `runId` 가 같은 것까지 그물이 확인했다.

## 2. 🔴 무대 좌표 — «누가 부모인가»가 생존을 정한다

| 무대 | 주소 | 부모 | 재기동 뒤에도 사는가 |
|---|---|---|---|
| postgres | `127.0.0.1:5637` | **docker**(`fkt-clean-0942`) | ✅ 산다 |
| neo4j | bolt `127.0.0.1:7737` | **docker**(`fkt-clean-0942`) | ✅ 산다 |
| ai-api «전» | `127.0.0.1:8341` | 🔴 **39대 셸의 자식** | ❌ **죽는다 — 다시 띄워야 한다** |
| ai-api «후» | `127.0.0.1:8340` | 🔴 **39대 셸의 자식** | ❌ **죽는다 — 다시 띄워야 한다** |

볼륨은 존치돼 있으므로 DB 데이터는 그대로다. ai-api 두 벌을 다시 세우는 명령:

```
PY=C:/Users/sinel/repos/factory-knowledge-twin/services/ai-api/.venv/Scripts/python.exe
export FKT_POSTGRES_DSN="postgresql://fkt:fkt_local_dev@127.0.0.1:5637/fkt" \
       FKT_NEO4J_URI="bolt://127.0.0.1:7737" FKT_NEO4J_USER=neo4j FKT_NEO4J_PASSWORD=fkt_local_dev \
       FKT_REPLAY_FIXTURE_DIR="<이 워크트리>/data/replay" FKT_WARMUP_EMBEDDING=0
"$PY" -m uvicorn app.main:app --app-dir "C:/Users/sinel/repos/_clean/fkt-0904-0942/services/ai-api" --host 127.0.0.1 --port 8341 &   # 전
"$PY" -m uvicorn app.main:app --app-dir "<이 워크트리>/services/ai-api"                        --host 127.0.0.1 --port 8340 &   # 후
```

DB 가 내려가 있으면: `docker compose -p fkt-clean-0942 -f C:/Users/sinel/repos/_clean/fkt-0904-0942/docker-compose.yml up -d postgres neo4j`
(🔴 `-v` 금지 · `:8010`·`fkt-senku2-t15`·리바이2 스택 무접촉)

그물(읽기 전용 실행 · playwright 는 스크래치에 설치돼 있었으므로 없으면 `npm i @playwright/test` 후 `NODE_PATH` 지정):
```
node tests/web/t723x_exceptions.mjs --api=http://127.0.0.1:8340 --web=http://127.0.0.1:8340
```

## 3. 🔴 「추정 금지」 확인분 — 판정→`store.create` 사이 suspend 지점 0

발주가 요구한 근거다. **읽어서 확인한 것이고 추정이 아니다.**

| 자리 | 사실 |
|---|---|
| `app/errors.py:184` `dependency_guard` | 몸통이 `try: yield` — `async def` 와 `yield` 사이에 **`await` 없음** |
| `app/investigation/runner.py:50` | `record = store.create(` |
| `app/investigation/runner.py:91` | 첫 `await` = `granted = await capacity.wait_turn(` |
| `session_run_cap.admit` · `capacity.admit` | 둘 다 동기 |

⇒ live 판정을 `await probe_all_cached` **재개 직후**에 두면 거기서 `store.create` 까지 이벤트 루프로 돌아가지 않는다. 그 자리가 이 수리의 전부다.
replay 는 `replay.load`(동기) 뒤 · `replay.start` 앞 — 같은 이유.

## 4. 남은 일 (40대가 이어받을 것)

1. **대조군 3열**(같은 실행에서) — ① 다른 세션 2 POST → **2** ② 첫 run 종결 뒤 같은 요청 → **새 run** ③ replay 동시 2 → **1**
2. **④ X-16 축**(오케 추가 지시) — `blackhole-proxy :8811 --upstream <후 ai-api>` 로 첫 응답 유실 → 1s 뒤 재시도 → 상류 로그 `POST …/runs 200` 계수 **전 2 → 후 1**
   · 무대는 `apps/web-console/scripts/x-stages/blackhole-proxy.mjs`(39대가 만든 것) · selftest 로 먼저 울린 뒤 쓴다
3. 계약 표면 **74/74 무변** 확인
4. PR 개설(본문에 §1 A/B 표 · §3 줄 번호 · 대조군 3열 · X-16 열)

## 5. 주의 (39대가 걸린 것)

- 🔴 **`git worktree add -b <lane> origin/develop` 은 upstream 을 develop 으로 건다.** 맨 `git push` 금지 · 첫 push 는 반드시 `git push -u origin <lane>`.
- 🔴 PowerShell 에서 `$pid` 는 예약 변수다 — 프로세스 종료 스크립트가 통째로 실패한다. `$procId` 등으로 쓰고, **죽었는지는 포트 응답으로 확인**한다(39대는 「죽였다」로 넘어갈 뻔했다).
- 🔴 시각 라벨은 **발신 직전에 `date` 를 한 번 치고 그 출력만** 쓴다(39대가 어림값을 두 번 적어 정정받았다).

## 6. 미결·잔해

- PR **#566**(T7-29) 는 10:21:27 병합됨 → 워크트리 `_wt/senku2-t7-29` 제거 가능.
- 🔴 디스크에만 남은 잔해 2본(git 등록 0 · 마운트 0 · 삭제는 사용자 결정 영역이라 39대가 강행하지 않음):
  `_wt/senku2-t7-28`(518M) · `_wt/senku2-t728-ctl`(50M)
- 클론 3본(`_clean/fkt-0904-0921·0927·0942`)·볼륨 6본은 **리바이2 대조 재실행용으로 존치**(오케 지시).
