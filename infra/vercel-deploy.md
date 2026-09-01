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
| **Root Directory** | `apps/web-console` | 리포 루트에 `package.json` 이 **없다**. 루트로 두면 Vercel 이 프레임워크를 못 찾는다 |
| **Include files outside the Root Directory** | 🔴 **켠다** | prebuild 가 리포 루트의 `data/replay/**` 를 읽는다(§3) |
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

| 경로 | ai-api 가 보는 첫 값 | IP 축 |
|---|---|---|
| 셸 경유 = **공개 트래픽 본류** | 셸 egress | «몇 통» — 켜나 끄나 방문자별이 아니다 |
| Funnel 을 직접 타격(curl · 외부 드릴) | 그 클라이언트 | 방문자별로 선다 |

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

## 6. 못 잰 것 (이 좌석이 잴 수 없었던 것)

| 항목 | 왜 | 무엇이 채우는가 |
|---|---|---|
| 실제 Vercel 빌드 통과 여부 | 배포 = 게이트 3 | 첫 배포 로그(§5-1) |
| 🔴 셸 경유 시 ai-api 가 보는 client ip | 배포 URL 부재 | §5-4 — §4-4 의 예측을 확증하거나 반증한다 |
| `vercel.json` 이 Root Directory 기준으로 읽히는지 | 배포해야 갈린다 | §5-1 · 안 읽히면 대시보드로 이관 |
| 외부 망·모바일 첫 화면 시간 | 공개 URL 부재 | T4-3 자기 실측 표 · T4-4 |
| CORS allowlist 에 Vercel origin 을 넣어야 하는지 | 구조상 **필요 없을 것**이다(§5-3 — rewrite 가 같은 origin 을 유지한다 · `FKT_CORS_ORIGINS` 기본 = 빈 값). 다만 이것은 **구조 추론(E3)** 이고 배포 형상에서 잰 값이 아니다 | 배포 후 브라우저 콘솔에 CORS 오류가 «0건»인지 1회 확인. 🔴 0건을 확인하기 전에는 「필요 없다」를 결론으로 적지 않는다 |
