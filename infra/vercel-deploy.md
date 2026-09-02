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
| 셸 경유 · 스위치 **켬**(= 배포 현재 · E1 확인) | 셸 egress | «몇 통» — 방문자별 아님 | 🔶 **E2+E3** — Funnel replace 실측 + egress 추론. 🔴 관측점이 없어 E1 아님 |
| (참고) 접속 로그의 client | `172.22.0.1` transport peer | — | E1이지만 **IP 축 키가 아니다**(§5-ter) |
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

### 🔴 5-3-a. CORS — 추정이었고, 이제 «닫혔다»(E1)

앞판은 여기서 「브라우저는 셸 origin 만 부르므로 CORS 는 필요 없을 것」이라고 **추정(E3)** 했다.
그 문장은 결론이 맞았고 등급만 낮았다. 두 축으로 확정한다:

| 축 | 확인 | 결과 |
|---|---|---|
| 코드(E1) | 절대 URL(`apiBase()`) 참조 전수 | **2곳뿐이고 둘 다 서버** — `app/enter/route.ts` · `lib/contract.ts`(`apiGetServer`) |
| 코드(E1) | 브라우저 헬퍼의 base 인자 | `compareBrowser`·`apiGetBrowser`·`startRunBrowser`·`runEvents`·work-order 계열 **전건 `""`(상대)** |
| 코드(E1) | 클라이언트 컴포넌트의 자체 `fetch(` | **0건**(`scripts/contract-surface.mjs` 불변식대로 전부 `lib/contract.ts` 경유) |
| 코드(E1) | WebSocket | `components/incident/run-console.tsx` = `location.origin` → 같은 origin |
| 런타임(E1) | 공개 배포 브라우저 콘솔의 CORS 오류 | **0건**(검증 좌석 실측) |

⇒ **브라우저는 교차 출처 호출을 하지 않는다.** 따라서 `FKT_CORS_ORIGINS` 는 이 형상에서
**필수가 아니다.**

🔴 그럼에도 배포 컨테이너에는 구체 allowlist 가 들어가 있다(2026-09-01 11:13). **무해하고 유지한다** —
`*` 가 아니라 origin 하나이고, 브라우저가 직접 부르는 형상으로 바뀌는 날 미리 서 있다.
다만 **「allowlist 가 없어서 화면이 깨진다」는 문장은 참이 아니다** — 그렇게 적으면 다음 사람이
없는 인과를 좇는다. 실제 원인은 §7 이다.

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
| client = 도커 브리지 peer(`172.22.0.1` 류) | 접속 로그의 client = **`172.22.0.1`** — 일치 ✅ |
| XFF 첫 값 = Vercel egress(`76.76.x` 류) | 🔴 **못 쟀다** — 앱이 XFF 를 로그에 남기지 않는다(관측점 0) |

🔴 **예측 문장 자체가 두 가지를 뭉뚱그렸다**(자기 정정): 「ai-api 가 보는 client」는
접속 로그의 **transport peer** 일 수도, rate limit 이 실제로 쓰는 **IP 축 키** 일 수도 있다.
관측된 것은 **앞의 것뿐**이고, 판정에 필요한 것은 **뒤의 것**이다.

### 그래서 무엇이 «확정»됐고 무엇이 아닌가

- ✅ **확정(E1)**: 배포 컨테이너는 스위치가 **켜져 있다**(`FKT_TRUST_FORWARDED_FOR=1` ·
  `docker inspect` 의 `Config.Env` 로 확인).
- ✅ **확정(E1)**: 그 «켜진» 상태에서도 접속 로그의 client 는 `172.22.0.1` 이다. 즉
  **이 로그는 IP 축 키를 관측하지 못한다** — 스위치와 무관하게 언제나 transport peer 를 찍는다.
  이 관측이 답하는 것은 그것뿐이다.
- 🔶 **여전히 미확정**: 「셸 경유는 방문자별이 아니다」는 **Funnel replace 실측(E2) + 셸 egress
  구조 추론(E3)** 으로 서 있다. 🔴 **이 로그로는 E1 로 올릴 수 없다** — 관측점 코드가 생긴 뒤다.

🔴 앞판(이 문서 초판)은 바로 이 자리에서 「스위치가 꺼진 지금 = 한 통(E1)」이라고 적었다.
두 겹으로 틀렸다: 스위치는 켜져 있었고, 설령 꺼져 있었어도 **그 로그는 그 질문에 답하지 못한다**.
아래 「안 되는 길」을 스스로 적어 놓고 그 길로 결론을 낸 셈이다 —
**측정이 답하지 못하는 것을 답했다고 적지 않는다.**

### 🔴 이 축을 재려는 다음 세대에게 — 되는 길과 안 되는 길

- **안 되는 길**: uvicorn access log 를 보는 것. 그 줄의 client 는 **transport peer** 라
  `FKT_TRUST_FORWARDED_FOR` 를 켜도 **바뀌지 않는다**. 스위치를 켜 놓고 그 로그를 보면
  「켜도 안 변한다 = 스위치가 고장」이라는 **틀린 결론**이 나온다.
- **되는 길**: `services/ai-api/app/protection.py` 의 `_client_ip` 가 «무엇을 골랐는지»를 한 줄
  남기는 것. 그게 유일한 관측점이고, **코드 변경 = 별 티켓**이다.

「안 잰 것」이 아니라 **「관측점이 없어서 못 잰 것」**이다 — 처방이 다르다.

## 5-quater. 🔴 B⑥ — Preview 두 키는 «외부»에서 못 잰다 (Vercel Authentication)

§4-3 은 두 키를 Preview 에도 걸라 했고, §6 표는 그 확인을 「다음 develop push 의 preview」로
미뤄 두었다. 🔴 **그 길은 막혀 있다** — Preview 배포에는 **Vercel Authentication(SSO)** 이 걸려 있어
외부에서 열리지 않는다.

| 무엇 | 값 |
|---|---|
| 외부 `curl -sI <preview URL>` | **302** → `vercel.com/sso-api/…` — 앱의 응답이 «아니다» |
| §5 확인 4줄 중 2·3번 | preview URL 로는 **성립하지 않는다** — 잡히는 헤더도 본문도 SSO 관문의 것이다 |
| 두 키가 «빌드에 들어갔는가» | **빌드 로그(대시보드)로만** 갈린다 — 외부 검증 경로 0 |

🔴 그러므로 이 축의 표기는 **«Not measured · 사유 = Preview SSO»** 다. **FAIL 이 아니다.**
「안 잰 것」과 「이 경로로는 못 재는 것」은 표에서 같은 빈 칸이지만 처방이 정반대다 —
전자는 한 번 더 재면 채워지고, 후자는 **경로를 바꿔야** 채워진다(대시보드 빌드 로그 ·
또는 Production 승격 뒤 **Production URL** 에서 §5 4줄을 그대로).

**Preview URL 찾는 법(1줄)** —
`gh api repos/sinelym-creator/factory-knowledge-twin/deployments?sha=<전체 40자 SHA>` 로 deployment 를
잡고 그 `statuses` 의 `environment_url` 을 읽는다. 🔴 **짧은 sha(7자)는 빈 결과** 를 낸다(조회 키가
전체 SHA 다) — 「배포가 없다」로 읽지 마라.

> 근거 등급: 위 302·빈 결과는 **E2**(오케 13대 발주문 동봉 · 리바이2 19대 관측). 이 문서 티켓은
> 컨테이너·외부 호출 **무접촉**이라 이 좌석의 E1 이 아니다 — 재확인은 Production 승격 뒤.

## 6. 못 잰 것 (이 좌석이 잴 수 없었던 것)

| 항목 | 왜 | 무엇이 채우는가 |
|---|---|---|
| 🔴 스위치를 «켰을 때» 의 XFF 첫 값 | **관측점이 없다** — 앱이 XFF 를 로그에 안 남긴다(§5-ter) | 코드로 관측점을 만드는 별 티켓. 🔴 access log 로는 영원히 못 잰다 |
| Preview 환경에도 두 키가 «빌드에 들어갔는가» | 🔴 **외부에서 못 잰다** — Preview 는 Vercel Authentication(SSO) 잠김(§5-quater) · 첫 preview 는 루트 설정 «전» 빌드라 404 였다 | 대시보드 **빌드 로그** · 또는 Production 승격 뒤 Production URL 에서 §5 4줄. 🔴 표기는 «Not measured · 사유 = SSO» — FAIL 이 아니다. 대시보드에 «넣었다»는 설정 실측이고, «빌드에 들어갔다»는 다른 사실이다 |
| 외부 망·모바일 첫 화면 시간 | 값 측정은 T4-4 몫 | T4-3 자기 실측 표 · T4-4 |

---

## 7. 🔴 D-10 — 공개 셸 «콜드 입장»이 세션을 굳힌다 (2026-09-01 실측 · 처방 착지)

### 증상

공개 URL 의 `/compare` 가 「승인 질문 목록을 가져오지 못했습니다」를 띄운다.
같은 세션에서 `/overview` 도 함께 죽는다(둘은 같이 산다).

### 원인

`POST /enter` 의 세션 발급 호출이 **2초 상한**을 쓰고 있었다(`lib/contract.ts` 의 기본 `TIMEOUT_MS`).
공개 형상에서 그 호출은 셸 서버(Vercel `iad1`) → Funnel(ts.net) → 한국 노트북 왕복이라
**콜드 회차가 2초를 넘는다**. 넘으면 핸들러가 `pending` 세션(브라우저가 지어낸 uuid)을 심는데,
ai-api 는 그 id 를 발급한 적이 없어 그 방문자의 `/api/*` 가 **전건 401** 이 된다.

그리고 그 상태는 **스스로 풀리지 않았다** — `/enter` 는 「쿠키가 있으면 발급 0」이었고
`pending` 도 쿠키였다. maxAge **8시간** 동안 같은 방문자는 계속 깨진 화면을 본다.

### 실측 (공개 URL · curl · 컨테이너 무접촉)

| | 값 |
|---|---|
| 콜드 `POST /enter` | **3.06s** → `fkt_session=pending:…` · `fkt_sid` **없음** |
| 이어진 5회 | 2.16 / 0.86 / 1.01 / 0.82 / 0.65s → **전건** `api` · `fkt_sid` 있음 |
| pending 쿠키로 `/compare` | 실패 문구 1건 · `<select>` **0건** |
| pending 쿠키로 `/overview` | FAC-A 렌더 **0** · 오류 문구 3건 |
| `api` 쿠키로 두 화면 | `<select>` 1건 · FAC-A 렌더 ✅ |
| pending 으로 `/enter` **재호출**(옛 코드) | 303 · **0.40s** · 같은 pending · 발급 0 = 고착 |

🔴 원천은 결백하다: 로컬 `:8010` 에 세션을 받아 부르면 `/api/scenarios` 는 **GS-01 · 질문 4건**을
그대로 답한다. 마운트·시드·CORS 어느 것도 이 증상의 원인이 아니다.

### 처방 (착지)

1. **입장 전용 상한** `ENTER_TIMEOUT_MS = 8000`(조회와 동일) — 2초는 이 배치의 정상 왕복도 잘랐다.
2. **`pending` 은 재발급 대상** — `/enter` 는 `origin === "api"` 일 때만 발급 0 으로 돌아간다.
   실패하면 «있던» pending 을 그대로 둔다(id 를 갈아치우지 않는다).
3. **고착 방문자가 그 재발급에 닿는 길** — 가드가 `pending` 을 `/` 에서 되돌려보내지 않는다.
   `/` 의 입장 마운트가 곧 재시도다(새 화면·새 버튼 0). 되돌이는 없다 — `/overview` 는 `/` 로
   되돌려보내지 않으므로 순환이 성립할 변이 없다.

🔴 **상태(2026-09-01)**: 이 처방 = PR #278(`3739c84`) · **독립 검증 PASS 11:47 KST**(리바이2 ·
자극 열 401→200 전/후 표 · 회귀 0 · 🔴 콜드 «확률» 축은 Not measured — 사유 = Preview SSO §5-quater) ·
**Production 반영 = main 승격 11:5x** · **외부 재확인은 그 뒤**(Production URL). — E2(오케 13대 발주문 동봉)

### 남는 축

콜드 왕복이 8초마저 넘으면 여전히 `pending` 이 된다. 다만 이제 **다음 입장에서 회복한다** —
「한 번 실패 = 8시간 고착」이 「한 번 실패 = 그 회차만 실패」로 바뀌었다.
근본(콜드 지연 자체)은 warm-up·리전 배치의 문제이고 이 티켓의 범위가 아니다.

## 8. 🔴 D-14 — `lane/*` preview 를 끈다 (일일 배포 상한 · 2026-09-01)

**증상(E1)**: 2026-09-01 17:5x 이후 모든 PR 의 Vercel check 가
`Deployment rate limited — retry in 24 hours` (`upgradeToPro=build-rate-limit`) 로 떨어졌다.
같은 날 앞선 PR(#323·#325)은 `pass` 였으므로 **코드 축이 아니라 계정 일일 상한**이다
(Hobby · 100 배포/일). 상한을 먹는 주범은 lane 브랜치 push 마다 뜨는 **preview 빌드**다 —
lane 은 검토용이고 그 URL 을 아무도 열지 않는다.

**처방** (`apps/web-console/vercel.json`):

```json
"git": { "deploymentEnabled": { "lane/*": false } }
```

- 근거(E2): <https://vercel.com/docs/project-configuration/git-configuration> —
  `deploymentEnabled` 는 «브랜치명 → boolean» 맵이고 **적지 않은 브랜치는 기본 true** 다.
  같은 문서가 `"experiment-*": false` 형태로 **와일드카드**를 쓰고, 겹칠 때는
  「하나라도 true 면 배포한다」로 푼다. 그래서 `main`·`develop` 은 **손대지 않아도 그대로**다.
- 🔴 `*` 가 `/` 를 넘는지는 이 문서가 말하지 않는다 — 그러나 이 리포의 lane 이름은
  `lane/<슬러그>` 로 **`/` 뒤가 한 마디**라 어느 쪽이든 걸린다. 이름 규칙이 바뀌면 이 줄도 바뀐다.
- 🔴 **`ignoreCommand` 를 쓰지 않은 이유**: 그쪽은 배포를 «만든 뒤» 빌드를 접는 갈래다.
  `deploymentEnabled: false` 는 문서 문면이 「배포를 촉발하지 않는다」이므로 상한 축에 더 곧다.
- 🔴 **`vercel.json` 은 Root Directory(`apps/web-console`) 기준으로 읽힌다**(§2·§5-bis ①).
  그리고 Vercel 은 «그 브랜치의» 파일을 본다 — 이 설정이 develop 에 들어간 «뒤» 잘라 낸
  lane 만 적용된다. 이전에 만든 lane 은 rebase 하거나 다시 잘라야 한다.

**효과 검증(아직 안 쟀다)**: 다음 lane push 에서 deployments API 신규 preview **0건**.
상한이 풀리기 전에는 「상한 때문에 안 뜬 것」과 「이 설정 때문에 안 뜬 것」이 **같은 빈칸**으로
보이므로, 그때까지 이 축은 «측정 불가»다 — 초록으로 세지 않는다.
