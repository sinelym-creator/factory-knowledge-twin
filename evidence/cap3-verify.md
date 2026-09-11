# CAP3 — 계약 v0.2.4 독립 검증 (리바이2 61대 · 前 열 선측정)

- 정본 = `packages/contracts/rest-api-v0.1.md` **v0.2.4 append**(#957) + **v0.2.4 화면 문면 개정**(#960 · develop `adcc08c`)
- 창(前 열) = `date 16:40:13` ~ `16:48:35` · 구독 **0** · production(`:8010`·`:8787`) **무접촉** · 팀 공용 `:8020` **무접촉**
- 트리 = `_wt/levi2-cap3v`(`lane/levi2-cap3v` · develop `adcc08c`) · 근거 등급 **E1**
- 🔴 **後 열은 센쿠2 구현 PR 착지 시 같은 드릴·같은 무대로 채운다.** 이 문서는 그때까지 «前 열만» 참이다.

## 0. 무대 — 2층 (구독 0 의 구조적 근거)

| 포트 | 정체 | 실측 |
|---|---|---|
| `:8859` | **게이트웨이 스텁** = `tests/api/t61_gateway_stub.py`(`mode=real` · 계약 형상 200) | `/health` 200 · **호출 26건**(JSONL · 🔴 무대를 «내린 뒤» 읽은 최종 계수) |
| `:8851` | 컨테이너 `fkt-levi2-cap3v-api`(`fkt-ai-api:dev-3ac2508`) · `FKT_LOCAL_SYNTHESIS_GATEWAY=http://host.docker.internal:8859` | `/api/health` ok · 컨테이너 안 `printenv` 로 env 실측 |

스텁이 답하므로 Claude 호출이 발생할 자리가 없다. **26건 = 자극이 실제로 그 문을 두드렸다**는 뜻이다 —
0 건이었다면 「스텁이 무대에 있기는 했는가」를 말할 수 없는 칸이다(어느 색도 못 냄).

🔴 **상한 env 를 두 열 모두 «명시»한다** — 기본값에 기대면 「기본값이 바뀌었나 / 내가 다른 값을 줬나」를 못 가른다.
前 열 = `FKT_RUN_CAP_PER_SESSION=5` · `FKT_RUN_CAP_WINDOW_SEC=3600` (컨테이너 `printenv` 실측).
`FKT_RUN_CAP_GLOBAL_PER_HOUR` 는 前 무대에 **존재하지 않는다**(grep·printenv 둘 다 0 = 미구현).

## 1. 🔴 자극 설계 — 「같은 세션 4발」은 그대로는 상한을 못 친다

발주 문면은 「같은 세션 live 4발 → 4발째」였다. 그대로 쏘면 **4발을 쐈는데 `used` 가 1** 이다.

- 정본 ① 이 계수에서 빼는 것 = `replay` · **`v0.1.14` 재사용** · 거절 · 읽기.
- `_reusable_run()` 실측 = 「같은 세션 × 시나리오 × mode 의 **비종결** run 이 있으면 그것이 답」.
- 이 무대의 시나리오는 **`GS-01` 하나뿐**이다(`/api/scenarios` 실측) — 그래서 연타하면 2발째부터 전부 재사용으로 접힌다.

⇒ 드릴은 발과 발 사이에 **앞 run 의 종결을 기다리고**, 응답 헤더 **`X-FKT-Run-Reused`** 로 「이 발이 자극인가」를 대상이 말하게 한다.
이 칸이 없으면 「4발 200 · used 1」을 **「상한이 안 걸렸다」로 오독**한다.

## 2. 🔴 교정 게이트 — 두 그물 모두 「무는 것」을 먼저 증명했다

| 그물 | 교정 방법 | 결과 |
|---|---|---|
| `cap3_api_drill.mjs` | 상한을 **2 로 낮춘 무대**에서 3발째에 429 가 서야 한다 | **교정 참** — 3발째 `429 session_run_cap_exceeded` |
| `cap3_forbidden_grep.mjs` | 심은 위반 1줄(`"LLM 호출에 실패했습니다"`)을 같은 실행에서 물어야 한다 | **교정 참** — 검출 O |

🔴 **1차 교정은 불성립이었고, 그것이 내 드릴의 결함을 잡았다**(§5 자수 1·2). 교정 없이 前 열을 적었다면
「4발 전부 401」과 「4발 전부 200」을 둘 다 「상한 미도달」로 적었을 것이다.

## 3. 前 열 실측

### A — ① 세션 상한 (`FKT_RUN_CAP_PER_SESSION=5` 명시)

| 발 | status | code | 재사용 | 종결 | `used` |
|---|---|---|---|---|---|
| 1 | 200 | — | X | completed | 1 |
| 2 | 200 | — | X | completed | 2 |
| 3 | 200 | — | X | completed | 3 |
| **4** | **200** | — | X | completed | **4** |

`runCap` 前 `{limit 5, used 0, remaining 5, windowSec 3600, nextFreeInSec null}` → 後 `{limit 5, used 4, remaining 1}` · 거절 **0건**.
**後 기대**(정본 ①ⓐ) = 기본값 **3** · 4발째 `429 session_run_cap_exceeded`(v0.1.12 형상 불변).

### B — ①ⓑ 전역 시간당 상한 (세션 4개 × 1발)

| 자극 | status | code | `Retry-After` |
|---|---|---|---|
| 세션1~4 각 1발(live) | **200 · 200 · 200 · 200** | — | 없음 |
| replay 1발 | 200 | — | — |

거절 세션 peek = `runCap {limit 5, used 1}` · **`hourlyCap` 없음**.
**後 기대** = 4발째 `429 live_hourly_cap_exceeded` · `detail { limit, used, remaining: 0, retryAfterSec }` · `Retry-After` 헤더 ·
거절 미계수(peek `used` 불변) · replay 무영향(200 유지).

### C·D·E — ② `/live/status` 형상

| 축 | 前 실측 | 後 기대(정본) |
|---|---|---|
| `online:true` 응답(sessionId 없음) | `{"online":true,"checkedAt":"…"}` · **57 바이트** · 키 = `checkedAt,online` | **바이트·키 동일**(「필드 추가 0 · 기존 소비자 무영향」) |
| `?sessionId` | `runCap` 만 · **`hourlyCap` 없음** | `runCap` **옆에** `hourlyCap {limit, used, remaining, nextFreeInSec}`(`limit ≤ 0` 이면 `remaining: null`) |
| `reason` / `until` | **둘 다 없음** | `online:false` 일 때만 · enum 3종 · `until`(iso · 선택 · `gateway_unreachable` 은 없음) |

### F — ⑤ 화면 금칙어 (「LLM」「게이트웨이」「429」「토큰」「걸쇠」)

前 = **0건** / 대상 74본(`apps/web-console` 의 `.ts`·`.tsx` · 주석 제외 · 한글이 든 문자열 리터럴만).
🔴 이 0 은 **교정(심은 위반 검출 O) 위에서의 0** 이다. **後 기대 = 여전히 0건**.

## 4. 안 잰 것 (後 열에서 채운다)

- **③ 걸쇠 축** — 게이트웨이 `/health.synth`(`lastOutcome`·`consecutiveFailures`·`latchedUntil`)는 **게이트웨이 구현**이고 이 무대의 스텁은 그 필드를 내지 않는다.
  前 무대의 ai-api 는 정본이 말한 하위 호환 경로(「본문에 `synth` 가 없는 구 게이트웨이 = 도달만으로 판정」)로 `online:true` 를 냈다 — **걸쇠 축은 前에서 성립 자체를 안 한다**(측정 실패가 아니라 **불성립**).
  後 열 = `FKT_SYNTH_CLI` 오경로 주입 → `consecutiveFailures 1` · `latchedUntil` · `reason:"synthesis_failing"` · 스텁 200 1회로 즉시 해제.
- **⑥ 실패 run 완주** — 스텁 5xx 주입 → 후보 카드 결정적 축 + 안내 1줄 · 오류 화면 0. 화면 축이라 셸 빌드가 필요하다(이 창 밖).
- **화면 문장 3종 렌더·`until` 로컬 시각 표기** — 같은 이유로 後 열.
- 실제 구독 한도로 인한 실패(정본 「잰 것/안 잰 것」) — 스텁으로는 **형태만** 잰다(E3 는 운영자 실기기 회차).

## 5. 내 계측기 자수

1. **1차 교정 = 4발 전부 `401 session_required`.** 세션이 **쿠키(`fkt_sid`)로 산다**는 것을 몰라 본문 `sessionId` 만 실어 보냈다 —
   상한 코드는 **한 번도 돌지 않았다**. 교정 게이트가 없었으면 이 401 을 「상한 미도달」로 적었을 것이다.
2. **2차 교정 = 상한 2 인데 4발 전부 200.** `used` 는 1 이었다 — **재사용 규칙**을 몰라 자극이 1발뿐이었다.
   「4발 쐈다」와 「4발이 계수됐다」는 다른 사실이고, 그것을 가른 것은 `X-FKT-Run-Reused` 헤더와 `used` 델타다.
3. **금칙어 그물의 축을 정본보다 넓게 잡을 뻔했다.** 정본은 「**사용자 문장**에 쓰지 않는다(코드·evidence 에는 쓴다)」이다 —
   파일 전체 grep 은 주석의 금칙어까지 물어 **옳은 코드를 고발**한다. 주석을 걷고 «한글이 든 문자열 리터럴»로 좁혔다.
4. **발주 문면과 정본이 갈린 자리를 정본으로 맞췄다.** 발주 ③은 `reason, until` 을 함께 적었는데 #957 시점 정본에는 `until` 이 없었다
   (#960 병합으로 정본에 들어왔다). 판정선은 **정본의 줄**에서만 가져왔고, 발주문은 작업 지시로만 읽었다.
5. **`git reset --hard` 를 쓰려다 hook 에 막혔다.** 트리를 최신 정본으로 올리는 데는 `merge --ff-only` 로 충분했다 — 파괴적 수단을 습관으로 집지 않는다.
