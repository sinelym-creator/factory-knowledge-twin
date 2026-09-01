# Vercel 배포 — 프로젝트 설정과 env 갈래 (T4-3 ⓓ · baseline §14.1)

> 🔴 **배포 실행은 게이트 3(오케 · 폐하 재가분)의 몫이고, 구현 좌석은 배포하지 않았다.**
> 이 문서는 「어디에 무엇을 넣는가」와 「틀리면 어떻게 드러나는가」를 적는다.
> ai-api 쪽(Funnel)은 `infra/tailscale-funnel-runbook.md` 다.

## 1. 이 배포가 무엇을 올리는가

| 층 | 어디 | 노트북이 꺼지면 |
|---|---|---|
| 셸(Next.js `apps/web-console`) | **Vercel** — 항상 켜져 있다 | 산다. 정적 replay 경로로 내려간다(T4-2a) |
| ai-api | 노트북 + Tailscale Funnel | 죽는다 → 셸이 「미연결」 배지 |

셸은 ai-api 를 **빌드 시점에 구운 주소**로 부른다. 그래서 이 문서의 핵심은 한 줄이다:
**«목적지 변경 = 재빌드»**(`apps/web-console/next.config.ts:20-23`).

## 2. 프로젝트 설정 (Vercel 대시보드 — 파일로 못 넣는 것들)

| 설정 | 값 | 왜 |
|---|---|---|
| **Root Directory** | `apps/web-console` | 리포 루트에 `package.json` 이 **없다**. 루트로 두면 Vercel 이 프레임워크를 못 찾는다 · ✅ 첫 배포에서 이 값으로 섰다 |
| **Include files outside the Root Directory** | 🔴 **켠다** | prebuild 가 리포 루트의 `data/replay/**` 를 읽는다(§3) · ✅ 첫 배포에서 `Enabled` 확인 |
| Framework Preset | Next.js | `vercel.json` 에도 적었다 |
| Node.js Version | 20.x 이상 | Next 16.3.3 요구. 리포에 버전 핀(`.nvmrc`·`engines`)이 **0건**이라 대시보드 기본값을 쓴다(로컬 실측 v22.20.0) |

`apps/web-console/vercel.json` 은 install·build 를 **명시**한다:

```json
{ "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build" }
```

- `--frozen-lockfile` — lockfile 이 `package.json` 과 어긋나면 «조용히 다른 버전으로 풀리는» 대신 빌드가 죽는다.
- `pnpm run build` — 이 앱의 `prebuild` 를 함께 돌린다. **pnpm 10.32.1 에서 pre 스크립트가 도는 것을 실측했다**
  (대조 스크립트 1개로 `prebuild` 실행 여부 확인 · E1). 도지 않았다면 정적 replay 없이 배포됐을 것이다.
- 🔴 **`vercel.json` 은 Root Directory 기준으로 읽힌다.** 그래서 이 파일은 `apps/web-console/` 에 있다.
  Root Directory 를 바꾸면 **이 파일도 함께 옮겨야 하고**, 안 옮기면 «조용히 무시»된다.
  확인법 = 첫 배포의 빌드 로그에 `pnpm install --frozen-lockfile` 문자열이 실제로 찍히는지 본다.
  안 찍히면 이 파일은 안 읽힌 것이다(대시보드 Install/Build Command 로 같은 값을 옮긴다).
  ✅ **확인됨**(E1 · §5-bis ①): 로그에 `Running "install" command: pnpm install --frozen-lockfile` 이
  찍혔다 — 이 파일은 Root Directory 기준으로 읽힌다.

## 3. prebuild 는 «Root Directory 밖»을 읽는다 — 이 배포의 유일한 구조적 함정

`apps/web-console/scripts/copy-static-replay.mjs:29` 가 `resolve(HERE, "../../..")` 로 리포 루트를 잡고
`data/replay/static/manifest.json` · `data/replay/gs-01.events.jsonl` 을 읽는다. 산출물
`lib/static-replay/generated/` 는 gitignore 라 **빌드마다 반드시 다시 만들어진다**.

실패 방향은 좋다 — 실측 대조군 2행(E1 · 2026-09-01):

| 상황 | 결과 |
|---|---|
| 리포 루트 파일이 보이는 자리에서 `pnpm run prebuild` | rc **0** · `동봉 28건 + 이벤트 32건 → 파일 3개` |
| 리포 루트 파일이 **없는** 자리(= Root Directory 밖 접근이 막힌 형상) | rc **1** · `중단 — 자산 매니페스트가 없다` |

즉 §2 의 「Include files outside」를 안 켜면 **빌드가 눈에 보이게 죽는다.**
빈 화면이 조용히 나가지 않는다 — 그래서 이 설정은 「잊으면 큰일」이 아니라 「잊으면 즉시 보인다」다.

## 4. env 갈래 — 정본 키는 **둘**이다

| 키 | 언제 읽히는가 | 값 형식 | Vercel 에 넣는가 | 안 넣으면 |
|---|---|---|---|---|
| `FKT_API_BASE` | 🔴 **빌드 시점** (`next.config.ts:23`) | Funnel URL **전체** — 포트 포함(`https://<host>.ts.net:8443`) | **예** | 기본값 `http://127.0.0.1:8000` 으로 구워진다 → 배포된 셸이 «자기 자신의» localhost 를 부른다 |
| `FKT_PUBLIC_HTTPS` | 🔴 **빌드 시점** (`next.config.ts:56`) | 정확히 문자열 **`1`** | **예** | HSTS 헤더가 안 붙는다. 화면에는 아무 표시가 없다(D-4 계보) |

두 값 다 `next.config.ts:67-70` 에서 `*_BUILD` 상수로 구워지고, 앱 코드는 **그 상수만** 읽는다
(`lib/contract.ts:387`). 런타임 env 는 대조용이다.

### 4-1. 🔴 이름 함정 — 이 둘은 env 가 «아니다»

| 써 봐야 아무 일도 안 일어나는 이름 | 실체 |
|---|---|
| `HTTPS_PUBLIC` | `next.config.ts:56` 의 **로컬 const 식별자**다. 셸 env 로 주는 코드는 리포에 **0건**. 대시보드에 넣으면 무시된다 — 정본 키는 `FKT_PUBLIC_HTTPS` 이고 값은 `"true"`·`"yes"` 가 아니라 **`"1"`** 이어야 한다 |
| `NEXT_PUBLIC_API_BASE` | 옛 유령 키. 이 이름을 읽는 코드는 리포에 **0건**이었고, 루트 `.env.example` 에서 **제거했다**(T4-3 ⓖ). 옛 문서를 보고 이 이름을 대시보드에 넣는 일이 없도록 이름만 남겨 둔다 |

✅ **회부 종결(T4-3 ⓖ)**: 루트 `.env.example` 에 `FKT_API_BASE`·`FKT_PUBLIC_HTTPS`·`FKT_CORS_ORIGINS`·
`FKT_TRUST_FORWARDED_FOR`·`FKT_RESTART_POLICY` 5키를 «빈 값 + 층·시점 + 읽는 좌표»로 추가하고
유령 키를 제거했다. 🔴 그 파일은 **로더가 아니라 목록**이다 — ai-api 는 `.env` 를 읽지 않는다.

### 4-2. 부팅 가드 — 「런타임에도 같이 넣어도 되는가」

된다. 그리고 그것이 안전한 쪽이다.

- `assertApiBaseMatchesBuild`(`lib/boot-check.ts:22-42`): 런타임 값이 **없으면 통과**, 있는데 빌드 값과
  **다르면 `exit(1)`**. Vercel 대시보드 env 는 빌드와 런타임에 같은 값으로 실리므로 → 같다 → 통과.
- `assertPublicHttpsMatchesBuild`(`lib/boot-check.ts:54-64`): 같은 방향. 단 여기서는 **빈 문자열도 «준 것»으로
  친다**(`undefined` 만 통과) — 대시보드에서 값을 지우지 말고 «변수 자체»를 지운다.

즉 이 가드들이 잡는 사건은 하나뿐이다: **「`next start` 에만 새 주소를 주고 재빌드를 안 한 경우」.**
그때는 부팅이 죽는다 — 화면에서 평상시 fallback 과 구별되지 않는 «조용한 오배송»보다 낫다.

### 4-3. 🔴 Preview / Production 환경 갈래

Vercel env 는 환경별로 켜고 끌 수 있다. `FKT_API_BASE` 를 **Production 에만** 걸어 두면
Preview 빌드는 기본값(`http://127.0.0.1:8000`)으로 구워진다 — 그리고 그 Preview 는
**죽지 않고 «미연결» 화면으로 그럴듯하게 뜬다**(부팅 가드는 런타임/빌드가 «같아서» 통과한다).

게이트 3 의 절차가 «Preview 로 먼저 1회»이므로 이 자리가 실제로 걸린다.
→ 두 키 다 **Production · Preview 양쪽에** 건다. Development 는 로컬 갈래라 안 건다.

### 4-4. 🔴 rewrite 가 방문자 IP 를 «지운다» — 배포 전에 알고 있어야 할 한계

`FKT_TRUST_FORWARDED_FOR` 는 **Vercel env 가 아니다**(ai-api 쪽 스위치다 — 대시보드에 넣지 마라).
다만 이 배포 형상이 그 스위치의 «효과»를 정하므로 여기에 적는다.

실측(E2 · 2026-09-01 · `infra/tailscale-funnel-runbook.md` §5-bis): Tailscale 프록시는 들어온
`X-Forwarded-*` 를 **전부 덮어쓴다**. 그래서 사슬이 이렇게 된다:

```
브라우저 ──▶ Vercel 셸(rewrite = 셸 «서버»가 새로 부른다) ──▶ Funnel ──▶ ai-api
                                                    ↑ 여기서 XFF 가 덮어써진다
```

- 좋은 쪽: 클라이언트가 XFF 를 지어내도 **버려진다** — 위조 경로 0. 그래서 `=1` 로 켜도 안전하다.
- 나쁜 쪽: 프록시가 보는 «직접 클라이언트»는 브라우저가 아니라 **셸의 egress** 다.
  셸이 실어 보낸 방문자 IP 는 거기서 **사라진다**.

| 경로 · 스위치 | ai-api 가 보는 첫 값 | IP 축 | 등급 |
|---|---|---|---|
| 셸 경유 · 스위치 **끔**(현재) | 도커 브리지 peer `172.22.0.1` | **1통** — 방문자 수와 무관 | **E1**(§5-ter) |
| 셸 경유 · 스위치 **켬** | 셸 egress | «몇 통» — 여전히 방문자별 아님 | 🔶 E3(관측점 없음) |
| Funnel 직접 타격(curl · 외부 드릴) | 그 클라이언트 | 방문자별로 선다 | E1(§5-bis · runbook §5-bis) |

🔴 **이 배치에서 「셸 경유 방문자별 IP rate limit」은 구조적으로 불가능하다.** 설정 실수가 아니라
형상의 성질이고, 방문자별 방어는 **세션 축**이 맡는다(Q-60 성문의 발현).
바꾸려면 판정을 「첫 값」이 아니라 「끝에서 n번째」로 옮겨야 하고, 그건 별 티켓이다.

## 5. 배포 직후 확인 4줄 (이 순서로 · 각각 다른 사실이다)

| # | 무엇 | 통과 기준 |
|---|---|---|
| 1 | 빌드 로그 | `pnpm install --frozen-lockfile` 이 찍혔다(= `vercel.json` 이 읽혔다) · `[static-replay] 동봉 …건` 이 찍혔다(= prebuild 가 리포 루트를 봤다) |
| 2 | 응답 헤더 | `curl -sI <배포 URL>` 에 `strict-transport-security` **있다**(= `FKT_PUBLIC_HTTPS=1` 이 빌드에 들어갔다) |
| 3 | 목적지 | `curl -s <배포 URL>/api/health` 의 **본문**이 노트북 ai-api 의 것인가 — `dependencies` 에 postgres·neo4j 가 있고 build sha 가 그 컨테이너 값과 같다 |
| 4 | 🔴 IP 귀속 | 셸 경유로 `/api/health` 1회 → ai-api 로그의 client ip 와 XFF 첫 값. **예측을 먼저 적어 둔다**: client = 도커 브리지 peer(`172.22.0.1` 류) · XFF 첫 값 = Vercel egress 대역(`76.76.x` 류). 다르면 §4-4 의 표가 틀린 것이므로 **회부**한다(재고 나서 이유를 만들지 않는다) |

🔴 2번을 «화면이 뜨는가»로 대신하지 않는다. HSTS 누락은 화면에 아무 표시도 남기지 않는다 —
헤더를 직접 봐야 갈린다.

🔴 3번을 **브라우저 network 탭으로 재지 않는다.** rewrite 는 셸 «서버»가 대신 부르는 구조라,
브라우저에는 언제나 셸 origin 만 보인다 — Funnel URL 은 network 탭에 **원래 안 나온다**.
「목적지가 맞았는가」는 응답 «본문»이 노트북의 것인지로만 갈린다. 같은 이유로 이 확인을
로컬 dev 에서 대신 하지 않는다(로컬은 rewrite 목적지가 다르다 — 「주장하는 그 경로에서 재라」).

같은 구조가 §6 의 CORS 행을 결정한다: 브라우저가 부르는 것은 언제나 셸 origin 이므로
**교차 origin 이 성립하지 않고, 그래서 `FKT_CORS_ORIGINS` 는 비운 채로 시작한다.**

## 5-bis. 첫 배포 실측 착지 (E1 · 2026-09-01 11:03 KST)

배포 = production · 빌드 26s · READY `02:02:01Z` · 공개 URL `factory-knowledge-twin.vercel.app`.

🔴 이 URL 은 **일부러 공개하는 제품의 얼굴**이라 그대로 적는다. 반대로 ts.net 호스트명은
«기반 시설의 신원»이라 계속 placeholder 다 — 둘을 같은 규칙으로 다루지 않는다.

| # | 잰 것 | 결과 |
|---|---|---|
| ① | 빌드 로그의 install 명령 | `Running "install" command: pnpm install --frozen-lockfile` ✅ → **`vercel.json` 은 Root Directory 기준으로 읽힌다**(§2 의 미확정이 이 줄로 닫혔다) |
| | 부수 | Vercel CLI 59.3.0 · pnpm 10.32.1 · Next.js 16.3.3(Turbopack) · Root Directory `apps/web-console` · **Include files outside root = Enabled** |
| ② | prebuild | `[static-replay] 동봉 28건 + 이벤트 32건 → lib/static-replay/generated/ (파일 3개)` · fixture sha `3eb624c237db` · 「서버가 막은 자리 6건은 막힌 채로」 ✅ → 리포 루트 접근이 실제로 열렸다 |
| ③ | 응답 헤더 | 200 · `Strict-Transport-Security: max-age=31536000; includeSubDomains` ✅ · `X-Content-Type-Options: nosniff` → `FKT_PUBLIC_HTTPS=1` 이 **빌드에** 들어갔다 |
| ④ | 목적지 귀속 | 셸 경유 `/api/health` → 200 · 본문이 **노트북의 것**(build `792470d` · pg ok · neo4j ok · embedding ready) ✅ → 사슬 전체가 섰다 |

## 5-ter. 🔴 B⑦ — 예측의 «절반»만 확인됐다

§5-4 는 두 값을 예측했다. 하나는 맞았고, 하나는 **이 형상에서 잴 수 없었다.**

| 예측 | 실측 |
|---|---|
| client = 도커 브리지 peer(`172.22.0.1` 류) | **`172.22.0.1`** — 일치 ✅ |
| XFF 첫 값 = Vercel egress(`76.76.x` 류) | 🔴 **못 쟀다** — 앱이 XFF 를 로그에 남기지 않는다(관측점 0) |

### 그래서 무엇이 «확정»됐고 무엇이 아닌가

- ✅ **확정(E1)**: 스위치가 **꺼진** 지금, 셸 경유 트래픽은 전부 `172.22.0.1` **한 통**이다.
  방문자가 몇이든 IP 축에서는 하나로 뭉친다 — §4-4 의 「셸 경유는 방문자별이 아니다」가 실측됐다.
- 🔶 **미확정(E3)**: 스위치를 **켰을 때** 첫 값이 「셸 egress」인지. 구조상 그래야 하지만 관측점이 없다.

### 🔴 이 축을 재려는 다음 세대에게 — 되는 길과 안 되는 길

- **안 되는 길**: uvicorn access log 를 보는 것. 그 줄의 client 는 **transport peer** 라
  `FKT_TRUST_FORWARDED_FOR` 를 켜도 **바뀌지 않는다**. 스위치를 켜 놓고 그 로그를 보면
  「켜도 안 변한다 = 스위치가 고장」이라는 **틀린 결론**이 나온다.
- **되는 길**: `services/ai-api/app/protection.py` 의 `_client_ip` 가 «무엇을 골랐는지»를 한 줄
  남기는 것. 그게 유일한 관측점이고, **코드 변경 = 별 티켓**이다.

「안 잰 것」이 아니라 **「관측점이 없어서 못 잰 것」**이다 — 처방이 다르다.

## 6. 못 잰 것 (이 좌석이 잴 수 없었던 것)

| 항목 | 왜 | 무엇이 채우는가 |
|---|---|---|
| 🔴 스위치를 «켰을 때» 의 XFF 첫 값 | **관측점이 없다** — 앱이 XFF 를 로그에 안 남긴다(§5-ter) | 코드로 관측점을 만드는 별 티켓. 🔴 access log 로는 영원히 못 잰다 |
| CORS 오류 «건수» | 브라우저가 있어야 센다 | T4-4 검증 좌석. 🔴 **0건을 확인하기 전에는 「CORS 불요」를 결론으로 적지 않는다**(구조 추론 E3 상태 유지) |
| Preview 환경에도 두 키가 걸렸는가 | 첫 preview 는 루트 설정 «전» 빌드라 404 였다 | 다음 develop push 의 preview. 🔴 대시보드에 «넣었다»는 설정 실측이고, «빌드에 들어갔다»는 아직 아니다 — 둘은 다른 사실이다 |
| 외부 망·모바일 첫 화면 시간 | 값 측정은 T4-4 몫 | T4-3 자기 실측 표 · T4-4 |
