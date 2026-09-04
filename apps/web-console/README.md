# web-console — Factory Knowledge Twin 공개 셸 (Next.js)

> 🔴 **이 파일은 2026-09-04 에 `create-next-app` 기본 문면에서 교체됐다.** 그 전까지 이 자리에는 이 앱에 관한 사실이 한 줄도 없었다(템플릿 그대로). 아래에는 **리포 실물에서 확인한 것만** 적는다.
> 🔴 **세우는 절차의 정본은 여기가 아니다** — 새 클론에서 스택을 세우는 순서는 `docs/deployment/runbook.md` §4 다. 이 파일은 «이 앱만»의 손잡이를 적는다.

## 구조 (2026-09-04 실물)

| 자리 | 무엇 |
|---|---|
| `app/` | 라우트 7본 — `/`(입장) · `/overview` · `/incidents/[incidentId]` · `/evidence/[evidenceId]` · `/documents/[docId]` · `/compare` · `/work-orders/[woId]` · 그리고 `app/enter/route.ts`(입장 핸들러) · `app/api/[...path]/route.ts`(함수 프록시) |
| `components/` | 화면 묶음 6 — `overview`·`incident`·`evidence`·`compare`·`work-order`·**`tour`** · 공통 `app-shell.tsx`·`live-status.tsx`(모드/혼잡 배지)·`unavailable.tsx`(못 물어봤을 때의 화면) |
| `lib/` | `contract.ts`(🔴 **셸에서 나가는 fetch 는 여기 한 곳에 모인다** · `contract:surface` 가 그 불변식을 검사) · `static-replay/`(ai-api 없이 GS-01 재생 · 고정 run id `STATIC-GS-01`) · `boot-check.ts` · `server-dns.ts` |
| `scripts/` | `copy-static-replay.mjs`·`harvest-static-replay.mjs` · `contract-surface.mjs` · `retry-drill.mjs` · `x-stages/`(예외 무대) |
| 루트 | `next.config.ts`(빌드 상수·rewrite·보안 헤더) · `instrumentation.ts`(부팅 대조) · `vercel.json` · `proxy.ts` |

## 패키지 매니저

`package.json` 의 `packageManager` = **pnpm 10.32.1**(선언) · `pnpm-lock.yaml` 이 리포에 있다. 배포도 같은 것을 쓴다 — `vercel.json` 의 `installCommand` = `pnpm install --frozen-lockfile`.

## 스크립트 (`package.json` 실물)

| 스크립트 | 하는 일 |
|---|---|
| `dev` / `build` / `start` | `next dev` / `next build` / `next start` |
| `predev` · `prebuild` | `scripts/copy-static-replay.mjs` — 🔴 **자동으로 먼저 돈다.** 정적 replay 자산을 제자리에 넣는 단계라, 빼먹으면 ai-api OFF 경로가 조용히 빈다 |
| `static-replay:harvest` / `static-replay:copy` | 정적 replay 사본 수확 / 복사 |
| `contract:surface` | `scripts/contract-surface.mjs` — 「셸에서 나가는 fetch 는 한 파일(`lib/contract.ts`)에 모인다」 불변식 검사 |
| `retry:drill` | `scripts/retry-drill.mjs` |
| `test:unit` | `vitest run` |
| `lint` | `eslint` |

## 🔴 환경 변수는 «빌드 시점»에 정해진다

- **`FKT_API_BASE`** — `next.config.ts` 가 `FKT_API_BASE_BUILD` 로 **구워** 앱 코드가 그것만 읽는다(Q-37 · T4-1 ⓑ). 기본값 `http://127.0.0.1:8000`.
- **`FKT_PUBLIC_HTTPS=1`** — HSTS 부착 여부. 같은 이유로 함께 구워진다(D-4). 🔴 로컬 http 에 붙이면 그 호스트가 https 로 캐시돼 개발이 막힌다 — 공개 배포에서만 켠다.
- 🔴 **목적지를 바꾸려면 재빌드한다.** `next start` 에만 새 값을 주면 부팅이 «죽는다» — `instrumentation.ts` 가 `lib/boot-check.ts` 의 대조를 부르고, 빌드 값과 런타임 값이 갈리면 거기서 멈춘다. 이것은 결함이 아니라 설계다(화면 상단 경고 같은 «부드러운» 신호를 두지 않는 이유 = 정상처럼 보이는 자리를 하나 더 만들지 않는다).

## `/api/*` 가 나가는 길 (두 갈래 · `next.config.ts`)

| 경로 | 받는 곳 | 왜 |
|---|---|---|
| `/api/*` | **Vercel 함수 프록시** `app/api/[...path]/route.ts` | 엣지 rewrite 층이 간헐 502 `DNS_HOSTNAME_EMPTY` 를 냈다(D-11 (B)) — 두 길을 남기지 않는다 |
| `/api/ws/*` | `next.config.ts` 의 rewrite(`beforeFiles`) | Route Handler 는 Request→Response 라 **101 을 낼 수 없다**. 이 경로를 함께 걷어내면 조사 실행의 실시간 축이 죽는다 |

보안 헤더(CSP·`X-Content-Type-Options`·`Referrer-Policy`·`Permissions-Policy`·조건부 HSTS)도 같은 파일에서 붙는다. 🔴 CSP 는 「막고 싶은 것」이 아니라 **「이 셸이 실제로 쓰는 것」**의 목록이고, 위반은 콘솔에 보이게 둔다(report-only 로 숨기지 않는다).

## 가이드 투어 (`components/tour/`)

실제 화면 위에서 도는 튜토리얼이다. 🔴 **REPLAY 로만 돈다** — 튜토리얼이 Live 합성 예산을 쓰지 않는다. OFF 면 화면·동작 변화가 **0** 이고(오버레이가 트리에 없다), 규격서는 `docs/design/t6-5-guided-tour-spec.md` 다.

🔴 투어가 배경을 `inert` 로 덮을 때 **허용 노드로 가는 조상 경로는 통과시키고 그 형제만 덮는다** — 안내 카드를 배경으로 분류하면 그 카드의 「안내 닫기」가 `inert` 뒤로 들어가 **출구가 사라진다**(재열람 19/19 FAIL 로 실측된 자리 · `tour-overlay.tsx`). `inert` 를 지원하지 않는 브라우저를 위한 포인터 가드가 따로 있고, **지원 브라우저에서는 그 가드의 발동이 0 인 것이 정상**이다.

## 🔴 dev 셸에서는 클라이언트 JS 가 실행되지 않는다 (CSP)

`next.config.ts` 의 `script-src` 는 `'self' 'unsafe-inline'` 이고 **`'unsafe-eval'` 이 없다**(2026-09-04 파일 확인). `next dev` 는 그 자리를 필요로 하므로, **개발 서버 셸에서는 클라이언트 JS 가 돌지 않는다**(팀 실측 2026-09-04 · X-11 재실행이 dev 셸에서 막혔던 자리). 

🔴 그래서 **화면 축 검증은 prod 빌드 셸에서 한다** — `pnpm build` 뒤 `pnpm start`. dev 셸에서 나온 「아무 일도 안 일어난다」는 결과는 **빨강이 아니라 미검증**이다.

## 배포 (`vercel.json`)

`framework: nextjs` · Production 만 배포된다 — `lane/*`·`develop` 을 포함한 **11개 브랜치 패턴의 preview 가 꺼져 있다**(D-14 · Vercel Hobby 일일 배포 상한 소진 재발 방지).

## 개발 서버

`pnpm dev` → `http://localhost:3000`. 화면이 실제 데이터를 보려면 ai-api 가 `FKT_API_BASE` 자리에 떠 있어야 한다. 떠 있지 않으면 셸은 그것을 «미연결»로 접고, 정적 replay 진입을 **제안**한다(자동 진입이 아니다).

🔴 **dev 셸은 «보는 용도»까지다** — 위 CSP 절 때문에 클라이언트 JS 가 안 돈다. 상호작용이 걸린 것을 확인하려면 `pnpm build` → `pnpm start` 로 세운다.
