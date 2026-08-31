# T4-1 «공개 형상 골격» 독립 검증 — **12대 인계본**(판정본은 아래 13대 절)

> 검증 좌석 리바이2 **12대** · lane `lane/levi2-t4-1-verify` @ `d588cb7`(구현 `57d58ed` 포함) ·
> 근거 **E1**. 🔴 **판정 없음** — 착수 10분 차에 교대가 걸렸다. 여기 있는 것은 **잰 것뿐**이고,
> 나머지 축은 손대지 않았다. 13대가 이어받는다.

## 0. 지금까지 잰 것 — AC① 「1커맨드 boot」

🔴 **내 조건에서 `docker compose up -d` 는 서지 않았다.**

| 무엇 | 실측 |
|---|---|
| 명령 | `docker compose up -d`(내 프로젝트 `fkt-levi2-t41` · pg **5544** · neo4j **7584/7597** · ai-api **8051** · `VOLUME_ROOT=./.volumes-levi2-t41`) |
| 결과 | **rc=1 · 181.1s** — `dependency failed to start: container …-postgres-1 is unhealthy` |
| ai-api | **Created**(한 번도 Start 안 됨) — 의존 게이트에서 막혔다 |
| postgres | `Up 6 minutes (unhealthy)` · healthcheck 로그 = `pg_isready` **`/var/run/postgresql:5432 - no response`** 반복 |
| postgres 컨테이너 로그 | `initdb` 가 **`performing post-bootstrap initialization ... ok`** 에서 6분 넘게 멈춰 있다(그 다음 줄이 안 나온다) |
| neo4j | `Up (unhealthy)` — 같은 게이트에서 함께 실패 처리 |

### 0.1 🔴 귀속 미결 — 이것은 아직 «대상의 빨강»이 아니다

두 갈래가 남아 있고, 이 실행만으로는 갈리지 않는다:

- ⓐ **내 조건** — Windows 호스트의 **bind mount** 위에서 첫 `initdb` 가 fsync 로 오래 끈다.
  compose 의 `start_period: 30s` + `interval 5s × retries 12` = 약 90초 예산이 그보다 짧다.
  (근거: 기존 좌석 스택 `fkt-levi2`·`fkt-senku2-*` 는 «이미 초기화된» 볼륨이라 이 구간이 없다 —
  즉 **아무도 이 경로를 «새 볼륨»으로 밟아 본 적이 없을 수 있다**.)
- ⓑ **대상** — 첫 부팅 예산이 실제로 부족하다면 AC①(1커맨드 boot)이 «빈 볼륨»에서 성립하지
  않는다는 뜻이고, 그것은 이 티켓의 결함이다.

🔴 **어느 쪽인지 «측정»으로 가르기 전에는 판정하지 않는다.** 가를 순서:

1. 컨테이너를 그대로 두고 **postgres 가 결국 healthy 가 되는지** 관찰(`docker ps` 상태 전이).
   된다면 갈래는 ⓐ 쪽으로 크게 기울고, 남는 질문은 「예산이 얼마여야 하나」다.
2. **named volume** 으로 같은 boot 를 한 번 더(= bind mount 만 바꾼 대조군). 그쪽이 예산 안에
   서면 원인이 bind mount 라는 것이 실측으로 확정된다.
3. 그때 비로소 ⓐ(환경 · 회부) / ⓑ(대상 · D-n)로 적는다.

### 0.2 🔵 1단계는 답이 나왔다 — **postgres 는 결국 healthy 가 됐다**(마감 직전 실측)

| 시점 | 상태 |
|---|---|
| `up -d` 반환(+181s) | postgres **unhealthy** → 의존 게이트에서 rc=1 |
| +6분 | 여전히 unhealthy(`initdb` 마지막 줄에서 멈춘 채) |
| **+24분** | **`Up 24 minutes (healthy)`** · neo4j 도 healthy |

⇒ **「서지 않는다」가 아니라 「예산 안에 못 선다」**이다. 갈래 ⓐ 로 크게 기울었고, 남은 질문은
**「첫 부팅 예산이 얼마여야 하나」**로 좁혀진다. 🔴 다만 이것이 ⓐ의 «확정»은 아니다 —
2단계(named volume 대조군)가 아직 없다. bind mount 가 원인인지, 이 머신의 첫 `initdb` 가
원래 느린지는 그 대조군만 가른다.

🔴 그리고 **ai-api 는 여전히 `Created`** 다(의존이 healthy 가 된 뒤에도 스스로 뜨지 않는다 —
`up` 이 이미 실패로 끝났기 때문). 다음 사람은 **같은 스택에서 `docker compose up -d` 를 한 번
더** 눌러 보는 것으로 「의존이 서 있으면 1커맨드가 서는가」를 바로 잴 수 있다. 그 결과가
AC① 의 판정을 「첫 부팅 1회」와 「재시도 포함」으로 갈라 준다.

## 1. 아직 «안 잰» 축 (전부)

②Q-37 부팅 실패 · ③CORS 두 축 · ④헤더·CSP 무해성 · ⑤`/live/status` 외부축 ·
⑥Q-44 콜드→ready · ⑦컨테이너 전용 결함(`replay.py` parents[4]) + `FKT_REPLAY_FIXTURE_DIR`
바인드에서 귀속 탐침 성립 · ⑧회귀 전부.

## 2. 인계 좌표

- 스택은 **존치**한다(내리지 않았다) — `fkt-levi2-t41` 3본. 위 상태 그대로가 다음 측정의 출발점이다.
- 내 다른 서버(`:3143` web · `:8043` ai-api · 스택 `fkt-levi2`)도 존치 — T3-4·Q-45 를 잰 자리다.
- 🔴 **환경 1행**: Docker Desktop 재시작 **미수행** · 자격 헬퍼 死 · `credsStore` 제거 상태
  (공개 이미지 pull·빌드는 통과 — 이번 build 도 통과했다).

---

# T4-1 «공개 형상 골격» 독립 검증 — **판정본** (13대)

> 검증 좌석 리바이2 **13대** · lane `lane/levi2-t4-1-verify` @ `7bb3db9`(12대 인계본 이어쓰기 ·
> rebase 없음) · 대상 = develop `47133a0`(구현 PR#201 `57d58ed` 포함) · 근거 **E1**(별도 표기 외
> 전건 실측) · 측정 2026-08-31 13:50~15:50 KST.
>
> **판정: 조건부 PASS**
> · **티켓 AC ①②③⑤ = PASS**(= 발주 범위 ①②③④⑥⑦⑧)
> · **티켓 AC④ = 조건부**(= 발주 범위 ⑤ `/live/status`) — 상한·빈 화면 PASS · **D-3 개방**
> 완결은 D-3 픽스(구현 좌석) + 단축 재검 1행 뒤다. 별건 결함 D-2·D-4 와 Q-52·Q-53 은 완결을 막지 않는다.

## §0 계측기 — **먼저 자수한다** (내 것 8건 · 대상 무관)

🔴 오늘 나를 여덟 번 속인 것은 대상이 아니라 **내 도구**였다. 다음 대가 같은 함정에 빠지지
않게 전건 남긴다. 「빨강도 그 주어를 물어야 한다」.

| # | 무엇이 거짓말했나 | 어떻게 드러났나 | 교정 |
|---|---|---|---|
| 1 | `docker kill` 로 restart 정책을 재려 했다 | 컨테이너가 `exited` · `RestartCount=0` → 「정책이 안 살린다」로 읽힐 뻔했다. **정책은 사용자 kill 을 되살리지 않는다 — 무효 자극이다** | 재부팅 복원 실측으로 대체(§1.3) |
| 2 | 컨테이너 «안»에서 `kill -9 1` | `OCI runtime exec failed: exec: "kill": executable file not found` — slim 이미지엔 바이너리가 없다. **자극 0인데 「변화 없음」을 읽을 뻔했다** | `sh -c 'kill -9 1'` 로 재시도 → 그래도 무효(아래 3) |
| 3 | `sh -c 'kill -9 1'` 도 무효 | `StartedAt` 불변 · `RestartCount=0`. **PID namespace 의 1번은 내부에서 온 SIGKILL 에 면역**이다(핸들러 없는 한) | 이 축은 «내 손으로는 못 흔든다»로 확정하고 재부팅 실측을 근거로 삼았다 |
| 4 | 임시 컨테이너의 `-e FKT_REPLAY_FIXTURE_DIR=/srv/data/replay` | 컨테이너 안에서 **`C:/Program Files/Git/srv/data/replay`** — Git Bash(MSYS) 경로 변환. 🔴 compose 스택은 정상이었다 | `MSYS_NO_PATHCONV=1 docker run …` 로 재생성 후 재측 |
| 5 | 회귀 러너의 stdout 인코딩 | `freshness_badge_drill` 이 `UnicodeEncodeError: 'cp949'` 로 죽었다 — **그것도 `_colocation` 이 «성공» 줄을 찍는 중에**. 대상은 멀쩡했다 | `PYTHONIOENCODING=utf-8` → PASS |
| 6 | `replay_fixture_drill` 의 `FKT_PYTHON` 미지정 | `FileNotFoundError: [WinError 2]` — 이 워크트리엔 `.venv` 가 없다(드릴은 자기 uvicorn 을 띄운다) | 정본 리포 `.venv` 를 `FKT_PYTHON` 으로 지정 → PASS |
| 7 | playwright 재실행에 `FKT_WEB_BASE`·`FKT_API_BASE` 를 안 실었다 | preflight 가 기본값(3101/8000)을 치고 실패 — **「셸이 죽었다」로 읽을 뻔했다**(셸은 살아 있었다) | 환경 실어 재실행 |
| 8 | CSP 워크의 **자기 검증분이 판정에 섞였다** | 일부러 어긴 2절이 ⓑⓒ 계수에 쌓여 첫 실행이 「위반 3건」을 냈다. ⓐ(배열)만 갈려 있었다 | 자기 검증 «직전»에 동선분 계수를 잠갔다(`walkRefused`/`walkReqFailed`) |

🔴 **12대 인계 문면의 오기 1건도 여기서 정정한다**: postgres healthcheck 에 `start_period` 는
**없다**. `interval 5s × retries 12` = **60s** 가 예산 전부다. 「start_period 30s + … ≈ 90초」는
**neo4j 의 것을 pg 에 붙인 오기**이며, 예산은 알려진 것보다 **1/3 짧다**.

### §0.1 측정 조건 (이 초록들이 무엇의 초록인가)

- 서버 = 내 트리 · 내 포트 · 내 컨테이너: `fkt-levi2-t41`(pg 5544 · neo4j 7584/7597 · ai-api **8051**) ·
  대조군 `…t41x`(bind) · `…t41n`(named · CORS 실험) · `…t41y`(bind 첫 부팅 전 구간) ·
  씨앗 DB 대상 임시 컨테이너 `fkt-levi2-t41-seeded`(**:8059** · 네트워크 `fkt-levi2_default` ·
  32테이블 씨앗 스택의 pg·neo4j 를 서비스명으로 붙였다) · 셸 `:3151`/`:3155`.
- 🔴 **브라우저 suite 는 `--workers=1` 로 판정했다.** 병렬(기본 workers)에서는 실행마다 **다른**
  1~2건이 timeout 으로 죽었고(1차 `reset-modal` 1건 · 2차 `phase2-evidence`+`reset-modal` 2건),
  같은 스펙 단건 재실행은 **3/3 초록**이었다. 이 머신이 도커 스택 여러 벌을 물고 있는 상태의
  **부하 flake**이며 대상의 것이 아니다 — 그물 안정화는 검증 좌석 후속 과제로 남긴다.
- Docker: `credsStore` 제거 유지 · 자격 헬퍼 死 — 공개 이미지 pull·빌드 통과(이 세션의 빌드 4회 전건 통과).
- 로그 인용은 절대경로 마스킹(Q-49).

---

## §1 AC① — 「`docker compose up` 1커맨드 boot · `/health` 200 · 재부팅 후 자동 시작」 = **PASS**

### 1.1 네 조건 (pg 컨테이너 «로그 타임스탬프»가 정본 — health poll 은 상한일 뿐이다)

| 행 | 조건 | pg `start → ready to accept` | `up -d` | ai-api | `/api/health` |
|---|---|---|---|---|---|
| ⓪ | 12대 · 새 bind · **부하 중**(12:39) | 6분+ 정체 → **+24분** | **rc=1 · 181.1s** | **Created** | — |
| ① | 같은 스택 **재시도**(볼륨 초기화됨) | (이미 healthy 25분) | **rc=0 · 1s** | Started → healthy | 200 |
| ② | `…t41x` 새 프로젝트 · **새 bind**(리포 기본값) | **32.8s** `05:02:24.31 → 05:02:57.14` | **rc=0 · 65s** | Started | (미측 — 내리기 전에 못 쟀다 · 자수) |
| ②′ | `…t41y` 새 프로젝트 · **새 bind** 전 구간 재측 | **34.2s** `05:08:52.79 → 05:09:26.94` | **rc=0 · 70s** | Started · healthy | **200 @ 72s** · **8057 리슨 실재** |
| ③ | `…t41n` 새 프로젝트 · **새 named volume**(대조군) | **1.76s** `05:05:34.62 → 05:05:36.38` | **rc=0 · 52s** | Started → healthy | **200** |

⇒ **AC① 「1커맨드 boot」 = PASS**(②′ 한 행으로 전 구간 성립 — 「생겼다≠선다」 네 곳 전부:
compose ps · healthcheck 상태 · 포트 리슨 · `/health` 본문).

### 1.2 D-2 — 「예산이 실측 분포를 못 덮는다」 (별건 · 등급 중 · 오케 채택)

② ↔ ③ 은 **같은 머신 · 3분 간격 · 한 변수(pg 데이터 자리)만** 다르다. 결과 **18.6배**.
내부 구간도 함께 갈렸다:

| 구간 | bind(②) | named(③) |
|---|---|---|
| `performing post-bootstrap initialization` | **10.6s** | 0.33s |
| `syncing data to disk` | **6.1s** | 0.42s |
| start → ready | **32.8s** | **1.76s** |

🔴 「이 머신의 첫 `initdb` 가 원래 느리다」는 ③이 **배제**했다. 원인은 **bind mount** 다(갈래 ⓐ 확정).
그러나 이것은 «내 환경»이 아니라 **대상 기본값**이다 — compose 가 배포하는 기본이
`${VOLUME_ROOT:-./.volumes}/postgres` = bind 이고 대상 플랫폼이 이 Windows 노트북이다(§14.2 노트북 Live).
마진은 **33s / 60s = 55% 소진**(무부하)이고, 부하가 얹히면 넘는다 — ⓪이 그 실측이다.
픽스 후보(구현 좌석 몫 · 검증이 고르지 않는다) = ⓐ pg healthcheck 에 `start_period` ⓑ DB 데이터
자리를 named volume ⓒ 둘 다. **재검 축은 하나**: 「**새 볼륨** 첫 부팅이 예산 안에 선다」.

### 1.3 재부팅 후 자동 시작 = **PASS**(내 스택 실측)

호스트 부팅 `04:28:29Z`. `fkt-levi2-t41` 의 pg·neo4j 는 `Created 03:39:29Z` / **`StartedAt 04:30:20Z`**
(부팅 +111s) — `restart: unless-stopped` 가 **재부팅 복원을 실제로 했다**. 같은 시각 타 좌석
스택 `fkt-senku2-t41` 의 **ai-api 도** `StartedAt 04:30:20Z` · healthy(관찰 1행).
🔴 내 ai-api 는 `created`(한 번도 Start 안 됨 · `StartedAt 0001-01-01`)라 **복원 대상이 아니었다** —
자극 부재이지 실패가 아니다.

---

## §2 AC② — `FKT_API_BASE` 빌드 타임 주입 · Q-37 종결 = **PASS**

### 2.1 「구워졌는가」

빌드 산출물(`.next`) 안에서 빌드 base 문자열 **13파일** 발견(`required-server-files.js/json` 포함).

### 2.2 세 행 + 정밀

| 행 | 런타임 `FKT_API_BASE` | 결과 |
|---|---|---|
| ⓐ | **없음** | `✓ Ready` · 리슨 2 · HTTP 응답 |
| ⓑ | **빌드 값과 같음** | `✓ Ready` · 리슨 2 · HTTP 응답 |
| ⓒ | **다름**(`…:9999`) | **부팅 중단 · `EXITCODE=1` · 리슨 0** · 사유를 두 값과 함께 인쇄 |

🔴 ⓒ 정밀 재측(100ms 간격 · 처음부터): **리스너 표본 0 · HTTP 응답 0 · +5.3s 프로세스 종료**.
⇒ 「잠깐 답하고 죽는」 창이 **없다**. 잘못된 목적지로는 **한 번도 답하지 않는다**.

### 2.3 「화면 경고 없음」 = 규정대로

`FKT_API_BASE` 를 읽는 자리는 `next.config.ts` · `lib/boot-check.ts` · `lib/contract.ts` **셋뿐**이고,
`app/`·`components/` 에는 **0건**. 부드러운 배너가 없다 = 「정상처럼 보이는 자리」를 안 만들었다.

### 2.4 `build` 필드(Q-46) — 두 행

| 빌드 인자 | `/api/health` `build` |
|---|---|
| `--build-arg FKT_BUILD_SHA=7bb3db9` | **`"7bb3db9"`**(짧은 sha) |
| 안 줌 | **`"unknown"`** |

경로·호스트명 노출 **0**(본문 필드 = `ok·version·status·dependencies·build·models` 뿐).

---

## §3 AC③ — CORS allowlist = **PASS** (「닿는다 ≠ 읽힌다」 두 축 분리)

### 3.1 curl 축 (헤더가 «무엇을 말하는가»)

| 축 | allowlist **없음**(:8051) | allowlist = `http://127.0.0.1:3151`(:8055) |
|---|---|---|
| 프리플라이트 · 허용 origin | **405 Method Not Allowed**(미들웨어 미장착) | **200** + `access-control-allow-origin: http://127.0.0.1:3151` + `allow-credentials: true` |
| 프리플라이트 · 비허용 origin | — | **400 `Disallowed CORS origin`** |
| 단순 GET · 허용 origin | — | 200 + `allow-origin` |
| 단순 GET · **비허용** origin | — | **200 인데 `allow-origin` 없음** |

🔴 **발주 문면 정정(오케 채택)**: 비허용 프리플라이트는 「헤더 없음」이 **아니다** —
`allow-methods`·`max-age`·`allow-headers`·`allow-credentials` 는 **나온다**. 없는 것은
**`access-control-allow-origin` 하나**이고, 브라우저를 막는 것도 정확히 그 하나다.
「목록이 비면 미들웨어를 아예 달지 않는다」는 성문도 405 로 실측 확인됐다(빈 문이 아니다).

### 3.2 브라우저 축 (누가 «집행»하는가)

🔴 셸(3151)에서 재면 CSP `connect-src 'self'` 가 CORS 보다 먼저 막아 무엇이 막았는지 못 가른다.
그래서 **CSP 없는 맨 페이지 두 벌**을 세우고 origin 한 변수만 갈랐다(`_origin_page_server.mjs`).

| origin | 결과 |
|---|---|
| `http://127.0.0.1:8066` (allowlist 에 있음) | **읽혔다** — `status=200` · 본문 272자 |
| `http://127.0.0.1:8068` (없음) | **못 읽었다** — `TypeError: Failed to fetch` |

⇒ 헤더가 «있다»가 아니라 **브라우저가 그 헤더로 실제로 갈랐다**. 그물 = `tests/web/t41_cors_browser_drill.mjs`.

---

## §4 AC④ — security header · CSP 무해성 = **PASS** (+ D-4 회부)

### 4.1 헤더 실재 (셸 `GET /`)

| 헤더 | 실측 |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; form-action 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Strict-Transport-Security` | **없음**(로컬 http) — 규정대로 |

### 4.2 CSP 무해성 — 전 동선 (`tests/web/t41_csp_walk.mjs`)

**자극 계수기**(0 이면 위반 0 은 아무 뜻이 없다): 방문 **7** · 클릭 **5** · 응답 **207** ·
WebSocket **1본 / 32프레임** · live run **1건 완주**(`run-status = "완료"`) · compare **전략 3열**.

**결과: CSP 위반 0 · 조용한 차단 0** — ⓐ `securitypolicyviolation` DOM 이벤트 0 ·
ⓑ 콘솔 `Refused to…` 0 · ⓒ 네트워크 실패(ABORTED 제외) 0.

🔴 **자기 검증 2/2 — 심사기가 운다.** 동선이 끝난 뒤 일부러 두 절을 어겼고(외부 origin 이미지 ·
외부 origin fetch), 심사기가 **`img-src`·`connect-src` 둘 다 잡았다**. 이 행이 없으면 위의 0 은
「위반이 없다」와 「내 눈이 감겼다」를 구별하지 못한다. (자기 검증분은 판정 계수에서 제외 — §0 자수 8.)

### 4.3 D-4 — HSTS 는 «빌드 값»인데 가드가 없다 (별건 · 등급 하 · 오케 채택)

| 언제 `FKT_PUBLIC_HTTPS=1` 을 주었나 | `Strict-Transport-Security` |
|---|---|
| **빌드 시**(런타임엔 안 줌) | **`max-age=31536000; includeSubDomains`** — 붙는다 |
| **런타임(`start`)에만** | **안 붙는다** |

Q-37 과 **같은 층 갈림**이다(빌드에 굽는 값을 start 에 주면 무효). 다른 점은 이쪽엔
`boot-check` 같은 **가드가 없어 조용히 빠진다**는 것이다. 공개 배포는 빌드 시 자연 만족하므로
T4-1 완결은 막지 않는다.

---

## §5 AC⑤ — `/live/status` 외부축 bounded timeout = **조건부**(상한·빈 화면 PASS + **D-3 개방**)

자극 = 「죽은 API」가 아니라 **「받기만 하고 답하지 않는 API」**다(연결 거부는 즉시 실패라 상한을
재지 못한다). TCP 를 accept 하고 한 바이트도 안 쓰는 블랙홀을 8064 에 세우고, 셸을 **그쪽으로 빌드**했다.
블랙홀 로그에 accept **5건** = 자극 실재.

| 축 | 실측 |
|---|---|
| ⓐ **네트워크 상한** | `REQ 224ms → CUT 2227ms`(**2.003s**) · `REQ 10320ms → CUT 12331ms`(**2.011s**) ⇒ **계약 상한 2s 실재** |
| ⓐ′ 30s poll 유지 | 다음 REQ `40327ms`(= 10320 + **30.007s**) |
| ⓑ **배지가 그 사실을 말한 시각** | `확인 중` → **`◌ 미연결` @ 12390ms** |
| ⓑ′ **대조군**(같은 빌드 · API 만 즉시 응답) | `확인 중` → **`◑ REPLAY` @ 415ms** |
| ⓒ 빈 화면 | **0** — 424ms 에 본문 231자 · 배너 「이 세션은 아직 백엔드에 등록되지 않았습니다(미연결)」가 이미 서 있다 |

🔴 **D-3 (등급 중 · 오케 채택 · AC⑤ 축이라 T4-1 완결을 막는다)** —
**상한은 실재하나 화면이 그 상한을 쓰지 않는다.** 앱은 **2.2초**에 「못 물어봤다」를 이미 알았는데,
배지는 **12.4초**까지 「확인 중」이라고 말한다. 대조군이 415ms 인 것이 그 10초가 «네트워크 탓이
아님»을 가른다. 관측된 기전: 첫 tick 의 결과가 **마운트 교체로 버려지고**(첫 REQ 는 224ms 에
났는데 두 번째 REQ 가 10.3s 에야 난다), 그 사이 화면은 낡은 초기 상태를 말한다.
컴포넌트 머리말이 성문한 「못 물어본 것을 아는 척하지 않는다」의 **반대 방향 사고**다 —
이미 물어봤고 실패한 것을 «아직 안 물어본 것»처럼 말한다.

**재검 축(픽스 후 1행)**: 「API 미도달 시 «미연결» 배지가 **상한 + ε** 안에 선다 ·
대조군(즉시 응답)은 **415ms 유지**」. 그물 = `tests/web/t41_live_status_timeout.mjs`(두 축을 따로 잰다).

---

## §6 AC⑥ / Q-44 — 콜드→ready 전이 = **PASS**

| 축 | 실측 |
|---|---|
| 전이 | `embedding: "loading"`(t=0) → **`"ready"`** |
| **cold**(모델 볼륨 비어 있음) | **60.0s** (`…t41` ) · **56.9s** (`…t41n`) |
| **warm**(모델 볼륨 채워짐) | **12.7s** (`…-seeded`) |
| 그 동안 `status` | **내내 `"ok"`** — 🔴 **콜드스타트가 degraded 를 만들지 않는다**(정본 준수) |
| 그 동안 `/api/health` | **200** — 컨테이너 healthcheck 가 침묵을 「죽음」으로 읽지 않는다 |

🔵 **관찰 → Q-53(오케 등재 · 결함 아님)**: **`cold` 는 `/health` 표면에 사실상 도달하지 않는다**.
`warmup=1` 이면 lifespan 이 즉시 `loading` 으로 넘기고, `warmup=0` 이면 라우터가 `cold` 를
**`disabled` 로 덮는다**(`routers/ops.py:35`). 5상태 열거는 실물이나 표면 도달성은 4다.

---

## §7 AC⑦ — 컨테이너 전용 결함 · 귀속 탐침 = **PASS**

### 7.1 앞판 결함 재현 (컨테이너 «안»에서 직접 계산)

```
module path : /srv/app/investigation/replay.py
parents     : ['/srv/app/investigation', '/srv/app', '/srv', '/']
len(parents): 4
parents[4]  -> IndexError: 4      <= 앞판이 import 시점에 죽던 자리
```

### 7.2 현행 (같은 컨테이너 · 같은 순간)

| 무엇 | 실측 |
|---|---|
| `_repo_fixture_dir()` | `None` (가드 성립 — 위로 못 올라간다) |
| `fixture_dir(None)` | `/nonexistent/replay-fixtures` (부재가 «부재»로 드러난다) |
| `fixture_dir(env)` | `/srv/data/replay` |
| `ls /srv/data/replay` | `['README.md', 'gs-01.events.jsonl']` |
| F-11 fixture 부재 | **`501 replay_fixture_missing`** 유지 |

### 7.3 🔴 귀속 탐침이 «성립»한다 (이 티켓의 조건)

`FKT_REPLAY_FIXTURE_DIR` 가 호스트 트리를 바인드하므로, `_colocation` 이 fixture 한 칸을 고치면
그 손질이 재생본에 나온다. 두 드릴에서 실측:

```
  귀속 증명  내 fixture 의 손질이 재생본에 나온다 — http://127.0.0.1:8059 는 이 트리를 읽는다
```

⇒ **컨테이너 ai-api 를 대상으로 한 회귀 전건이 「이 트리의 것」임이 증명됐다.** fixture 를
이미지에 구우면 이 축이 조용히 죽는다 — 자리를 옮길 일이 생기면 이 탐침부터 회부한다.

---

## §8 AC⑧ — 회귀·위생 = **PASS**

| 축 | 결과 |
|---|---|
| `tests/api` 21종 (컨테이너 ai-api `:8059` · 귀속 단 ON · 직렬) | **21/21 PASS** · fixture 되감김 확인(`git status` 청결) |
| 브라우저 suite (`--workers=1`) | **77 passed · 0 failed · 3 skipped** |
| `contract_surface_drill` | rc=0 · **계약 밖 0** · fetch 호출 파일 1 (`lib/contract.ts`) · `/api` 경로 19종 |
| 이미지 — 비-root | **`uid=10001(fkt) gid=999(fkt)`** |
| 이미지 — 절대경로·사용자명 | `/srv` 전체 grep **0건** |
| 이미지 — `.env` / `.git` | **0** (`/srv` = `app`, `requirements.txt`, `data`(마운트점)) |
| 이미지 — `docker history` 자격/경로 흔적 | **0건** |
| 이미지 ENV 층 | FKT 자격 **0** — `FKT_BUILD_SHA` 뿐(그 외는 python 상류 이미지의 것) |

### 8.1 구현 커밋의 «손댄 자리» (SSOT 무접촉 · `tests/**` 무접촉)

`57d58ed` 가 바꾼 것은 14파일 전부 구현 좌석 scope 안이다 —
`apps/web-console/{instrumentation.ts,lib/boot-check.ts,lib/contract.ts,next.config.ts}` ·
`docker-compose.yml` · `services/ai-api/{.dockerignore,Dockerfile,README.md,app/…}`.
**`tests/**` 0 · `docs/**` 0 · `packages/contracts/**` 0 · `.claude/context/**` 0** ⇒
SSOT 무접촉 · 계약 표면 변경 0 · 그물 무접촉. `ci_hygiene_drill` PASS(secret/절대경로 커밋 0).

🔵 **관찰(판정에 안 섞음)**: `contract_surface_drill` 자신의 대조군 17건 중 **4건이 갈렸다**
(D-06 절대 URL 우회 · D-07 템플릿 접두 우회 · D-08 `ROOTS` 밖 디렉터리 · D-09 `EXT` 밖 확장자).
드릴이 스스로 인쇄하는 «검사기의 알려진 구멍»이고 rc=0 이라 T4-1 판정에 넣지 않는다 —
검증 좌석 그물 과제로 회부한다(이 4종은 「계약 밖 호출이 있어도 못 잡는 모양」이다).

---

## §9 Q-52 — BEFORE 대조군 (AC 밖 · 픽스 전 기준선)

🔴 **내 스택에는 자극이 «없었다»**: 재부팅 전 `…t41-ai-api-1` 은 `created`(`StartedAt 0001-01-01`)
라 정책이 되살릴 대상이 아니었고, 첫 `/api/health`(컨테이너 로그 `04:55:38.9`)는
`postgres.state = ok`. **표지 0건은 반증이 아니다.**

그래서 **재부팅을 기다리지 않고 직접 흔들었다**(폐기용 스택 `…t41y`):

| 단계 | 실측 |
|---|---|
| B1 postgres stop | `exited` |
| B2 그 상태에서 ai-api restart | 기동 로그 **「postgres 풀 생성 실패 — degraded 로 계속한다: TimeoutError」** ⇒ **자극 실재** |
| B3 pg DOWN 중 `/health` | `postgres.state = unavailable` · `status = degraded` |
| B6 postgres start | **healthy @ +9s** |
| B7 pg healthy 직후 | **여전히 `unavailable`** |
| B8 +20s | **여전히 `unavailable`** |
| B9 **+60s** | **여전히 `unavailable`** |
| B10 컨테이너 health | **`healthy`** — 프로브는 프로세스 생존만 묻는다 |

⇒ **재연결 0 확정(E1).** 코드 축도 같은 말을 한다: `open_resources()` 는 lifespan 에서 **한 번만**
불리고, `create_pool` 이 실패하면 `pg_pool` 이 **영구 `None`** 이며 `probe_postgres` 가 그때부터
`unavailable` 만 낸다. 🔴 neo4j 는 **다르다** — 드라이버 생성은 연결하지 않으므로 프로브마다
다시 붙어 **스스로 회복한다**. 그 비대칭이 이 결함의 모양이다.
자격 유출 없음(`_brief` 가 `TimeoutError: TimeoutError` 로 잘랐다 — DSN 미노출).

**픽스 후 재검 1행**: 「기동 역전(pg 없는 동안 ai-api 기동) 후 pg 회복 → `/api/health` 의
`postgres.state` 가 **`ok` 로 돌아온다**」.

---

## §10 판정 · 회부 · 재검

### 10.1 AC 판정표

| AC | 판정 | 근거 |
|---|---|---|
| ① 1커맨드 boot · `/health` 200 · 재부팅 자동 시작 | **PASS** | §1.1 ②′ · §1.3 |
| ② `FKT_API_BASE` 빌드 주입 · Q-37 종결 | **PASS** | §2 |
| ③ CORS allowlist(허용/비허용 대조군) · 헤더 · HTTPS 가정 | **PASS** | §3 · §4.1 |
| ④ `/live/status` 외부축 bounded timeout · 빈 화면 0 | **조건부** — 상한·빈 화면 PASS · **D-3 개방** | §5 |
| ⑤ SSOT 무접촉 · 계약 표면 변경 0 · secret/절대경로 0 · `tests/**` 무접촉 | **PASS** | §8.1 (구현 커밋 14파일 전건이 구현 scope 안) |

> 🔴 **번호가 두 벌이다** — 티켓 `docs/plan/tickets/T4-1.md` 의 AC 는 5개, 발주 범위는 ①~⑧ 이다.
> 위 표는 **티켓 AC 문면**이 정본이고, 발주 범위 ①~⑧ 은 §1~§8 이 1:1 대응한다.
> 그래서 **티켓 AC④ = 발주 범위 ⑤**(`/live/status`)이며, 조건부 판정이 걸린 곳은 그 한 자리다.
> 회귀·위생(발주 ⑧)은 티켓 AC⑤ 안에 들어간다.
>
> 이 판정문의 write 는 `evidence/**` 와 `tests/web/**` — 검증 좌석 scope 안이다.
> `apps/**`·`services/**`·`docs/**`·`packages/**` 무접촉.

**T4-1 = 조건부 PASS.** 완결 = **D-3 픽스 + 단축 재검 1행** 뒤.

### 10.2 회부(구현 좌석 · 검증이 픽스를 고르지 않는다)

| 번호 | 무엇 | 등급 | T4-1 완결 차단 |
|---|---|---|---|
| **D-2** | pg healthcheck 예산(60s)이 Windows bind mount 첫 initdb 분포를 못 덮는다 | 중 | 아니오(별건) |
| **D-3** | `/live/status` 상한은 2s 인데 배지가 «미연결»로 서기까지 12.4s — 첫 tick 결과가 버려진다 | 중 | **예** |
| **D-4** | `FKT_PUBLIC_HTTPS` 는 빌드 값인데 가드가 없어 start 에만 주면 조용히 빠진다 | 하 | 아니오 |
| **Q-52** | pg 없는 동안 기동하면 pool 이 영구 `None` — pg 회복 후에도 `unavailable` | (오케 등재) | 아니오 |
| **Q-53** | `cold` 가 `/health` 표면에 도달하지 않는다(문서 각주로 종결 예정) | (문서) | 아니오 |

### 10.3 단축 재검 (픽스 착지 후 · 3행이면 끝난다)

1. **D-2** — 새 프로젝트 · **새 볼륨** 첫 부팅 `up -d` rc=0 이고 pg 가 예산 «안»에 healthy.
2. **D-3** — 블랙홀 API 로 빌드 → 배지 «미연결»이 **상한 + ε** 안에 선다 · 대조군(즉시 응답) 415ms 유지.
3. **Q-52** — pg 정지 중 ai-api 기동 → pg 회복 → `/api/health` `postgres.state` 가 **`ok`** 로 돌아온다.

(D-4 는 「빌드 값과 런타임 값이 다르면 부팅이 죽는다」 축에 `FKT_PUBLIC_HTTPS` 1행을 더하면 된다.)

### 10.4 이 판정에 쓴 그물 (검증 좌석 자산 · 이번에 세운 것)

| 파일 | 무엇을 재는가 | 자기 검증 |
|---|---|---|
| `tests/web/t41_csp_walk.mjs` | CSP 무해성 전 동선(3층 수집 · 자극 계수기) | 일부러 어긴 2절을 잡는지 — 못 잡으면 `exit 2` |
| `tests/web/t41_live_status_timeout.mjs` | 상한(네트워크)과 «화면이 말한 시각»을 **따로** | 요청이 끊긴 적 없으면 `exit 2` |
| `tests/web/t41_cors_browser_drill.mjs` + `_origin_page_server.mjs` | 브라우저가 CORS 를 «집행»하는가(CSP 와 분리) | 허용/비허용 두 행이 모두 서야 0 |

### 10.5 좌석 인계 좌표

- 살아 있는 것: 스택 `fkt-levi2-t41`(8051) · `…t41n`(8055 · CORS allowlist `…:8066` 주입 상태) ·
  `…t41y`(8057 · **Q-52 BEFORE 상태 그대로 존치** — pg 회복됐는데 `unavailable` 인 그 서버다) ·
  임시 컨테이너 `fkt-levi2-t41-seeded`(8059 · 씨앗 DB) · 셸 `:3151`(빌드 = API 8059 + `FKT_PUBLIC_HTTPS=1`).
  `…t41x` 는 내렸다(bind 디렉터리 `.volumes-t41x` 는 남아 있다 · gitignore).
- `_wt/levi2-q40` 는 버리지 않았다(BEFORE `9949a68` = Q-45 대조군).
- 🔴 회귀 실행 시 반드시: `PYTHONIOENCODING=utf-8` · `FKT_PYTHON=<정본 리포>/services/ai-api/.venv/Scripts/python.exe` ·
  playwright 는 `FKT_WEB_BASE`·`FKT_API_BASE` 를 **둘 다** 실을 것 · 브라우저 suite 는 `--workers=1`.
- 🔴 `docker run` 으로 임시 컨테이너를 만들 때는 `MSYS_NO_PATHCONV=1` 을 앞에 붙일 것(§0 자수 4).

---

## §11 유언 (13대)

> **「상한이 있다」와 「화면이 그 상한을 쓴다」는 다른 사실이다.**
> 2.0초에 끊긴 요청과 12.4초에 바뀐 배지는 같은 실행 안에 함께 있었다. 상한만 재고 초록을 냈다면
> 나는 「10초 동안 거짓말하는 화면」을 통과시켰을 것이다. **재는 축이 처방의 축과 같은지부터 물어라.**

> **「내 도구가 여덟 번 먼저 거짓말했다」** — 오늘 대상은 세 번 틀렸고(D-2·D-3·D-4) 내 계측기는
> 여덟 번 틀렸다. 무효 자극(`docker kill`)·없는 자극(`kill: not found`)·변환된 경로(MSYS)·
> 잘못된 인코딩(cp949)·안 실은 환경(`FKT_WEB_BASE`)·내 자기 검증이 내 판정을 오염시킨 것까지.
> **빨강을 보면 대상을 의심하기 전에 자기 손을 보라. 초록을 보면 그 초록이 무엇을 봤는지 물어라.**
