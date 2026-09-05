# 승격 16 공개면 외부 재검 (`promo16ext`)

| | |
|---|---|
| 판정 | **조건부 PASS** — 발주 축 ①②③ 전건 통과 · **미판정 1**(②-b 「완주 재도달」 = 내 계측기 결함) · **회부 1**(축 밖 관측 · `/incidents/{id}` 되돌림) |
| 무대 | 공개면 `https://factory-knowledge-twin.vercel.app` (production) |
| 밖의 근거 | **`remote_ip=64.29.17.195`**(공인 · `curl -w %{remote_ip}` · tailnet `100.x` 아님) · `Server: Vercel` · `X-Vercel-Id: icn1::iad1::2lctd-…` · **Tailscale 헤더 0건** |
| 배포 전제(O-18) | 배포 `dpl_HeNH4y36…` **meta `githubCommitSha` = `aa48b2d3336…`** = main `aa48b2d` **일치** · `target=production` · `state=READY` · alias 에 공개 URL 포함 |
| ai-api 전제 | `/api/health.build` = **`879fc35` 유지**(🔴 승격에 컨테이너 재생성 없음 = 유지가 정답) · postgres·neo4j `ok` · embedding `ready` |
| 그물 | `tests/web/promo16_external.mjs`(신규) · `tests/web/promo16_navlink_control.mjs`(주어 분리 대조군 · 신규) |
| live 소모 | **1회**(발주 상한 1) — 1차 실행은 내 그물이 축 ① 에서 죽어 **cap 0 소모**(자극을 맨 뒤에 둔 순서가 값을 벌었다) |
| 측정 | 2026-09-05 12:16~12:28 KST |
| 검증자 | 리바이2 48대 |

🔴 **밖의 근거를 자극 «전»에 찍고 시작했다** — 공개 URL 을 쳤다는 사실은 증거가 아니다(tailnet self 로 붙을 수 있다).
🔴 **D-81(초점 트랩)은 이 판정의 축이 아니다** — main 에 없다(승격 17 대상). 그물도 묻지 않는다.

---

## 1. 축별 판정

### 축 ① D-79 모바일 드로어 (cap 0)

| 축 | 폭 | Actual | 판정 |
|---|---|---|---|
| 앱바 구성 | 390 | 햄버거 **보임** · 브랜드 문면 **`Factory Twin`** · 버튼 2(`intro-reopen` 1 · `reset-button` 1) | **PASS** |
| 상태 행 «새 줄» | 390 | `app-status-row.top=54.0` ≥ `app-brand.bottom=39.3` → **아래 줄** | **PASS** |
| 상태 행 «같은 줄»(대조군) | 1280 | `status.top=13.5` vs `brand.top=14.3` → **같은 줄** · 768 도 동일 | **PASS** |
| 드로어 열림 ×3 | 390 | 3회 모두 `count=1` · `role=dialog` · `aria-modal=true` · 링크 **3**(`nav-overview`·`nav-incidents`·`nav-compare`) · 스크림 1 · 배경 `inert` **1**(앱바가 그 안) | **PASS** |
| 닫힘 ⓐ Esc | 390 | 잔여 **0** | **PASS** |
| 닫힘 ⓑ 스크림 | 390 | 잔여 **0** (클릭 좌표 x=300 · 패널 우변 260 — §3 자수 1) | **PASS** |
| 닫힘 ⓒ 링크 | 390 | 잔여 **0** (URL 축은 §2 로 분리) | **PASS** |
| 재개방(이동 후) | 390 | `count=1` · 링크 3 | **PASS** |
| `inert` 정리 | 390 | 닫은 뒤 문서 전체 `[inert]` **0** | **PASS** |
| 레일 | 768 / 1280 | 보이는 레일 링크 **3 / 3** · 토글 보임 **false / false** | **PASS** |
| 가로 넘침 | 390 / 768 / 1280 | `scrollWidth − clientWidth` = **0 / 0 / 0** | **PASS** |

🔴 레일과 드로어는 **같은 `data-testid`** 를 쓴다(`shell-nav.tsx`) — 폭 축마다 `data-nav-variant` 로 좁혀 셌다. 안 좁히면 «숨은 쪽»을 함께 센다.

### 축 ② D-78 재생 재시작 + LIVE 배지

| 열 | Actual | 판정 |
|---|---|---|
| **live**(cap 1 · `RUN-0a078cfb6d06`) | 완주 `status=completed` · 배지 `data-mode=**live**` · 클릭 «전» `data-at-end=**true**` · 클릭 → **되감김 실측**(applied < total 자취) · 첫 스텝까지 **264ms** | **PASS** |
| live 「완주 재도달」 | **미판정** — §3 자수 2 | — |
| **정적 재생본**(cap 0 · `INC-2026-014?run=STATIC-GS-01`) | 배지 `data-mode=**replay**` · 총계 **38** · 클릭 → 되감김 · **8129ms 에 38/38 재도달** · 재도달 뒤 `data-at-end=true` | **PASS** |
| LIVE 배지 1280 캡처 | `evidence/promo16/promo16-live-badge-1280.png` — **자극을 태운 그 세션 안**에서 찍었다(run 은 세션 스코프 · 다른 컨텍스트로 열면 `GET /runs/{id}` 404) · **이월 종결** | **PASS** |

🔴 **클릭 셀렉터에 `data-at-end` 를 넣지 않았다**(발주 문면과 다른 점 1) — 그 속성은 처방이 «만든» 것이라 선택자에 박으면 처방이 있어야만 도는 그물이 된다. 클릭은 `replay-play` 로 하고 `data-at-end` 는 **값으로 읽어** 별도 판정선에 세웠다(축은 같고 귀속만 살렸다).

### 축 ③ 회귀 감시 (cap 0)

| 축 | Actual | 판정 |
|---|---|---|
| health 의존 | postgres `ok` · neo4j `ok` = **2/2** · embedding `ready` | **PASS** |
| 보안 헤더 | CSP(`default-src 'self'` …) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer` · HSTS `max-age=31536000; includeSubDomains` | **PASS** |
| `/api/live/status` | `200` · `online: true` | **PASS** |
| 콘솔 | 실오류 **0** · 제외한 WS 잡음 **5건**(공개면 기지 사항 · «셌다»는 사실을 남긴다) | **PASS** |

---

## 2. 회부 1 — `/incidents/{id}` 되돌림 (🔴 **D-79 축이 아니다**)

본 그물의 ⓒ 열에서 「드로어 링크 클릭 → 드로어 닫힘 0 · **URL 은 `/overview` 그대로**」가 나왔다.
🔴 그 한 칸으로는 **「드로어가 이동을 삼켰다」와 「그 경로가 원래 되돌린다」를 못 가른다.** 손잡이 하나만 다른 열을 세웠다(`promo16_navlink_control.mjs` · cap 0).

| 열 | 조작 | 최종 URL | 네트워크 자취 |
|---|---|---|---|
| ① 드로어(390) | 드로어 열고 `nav-incidents` 클릭 · **3500ms** 대기 | **`/incidents/INC-2025-019`**(머문다) · 드로어 잔여 0 | 인시던트 RSC `200` ×3 |
| ② 레일(1280) | 레일의 **같은 링크** 클릭 · 3500ms | **`/overview`**(되돌아옴) | 인시던트 RSC `200` → **같은 `_rsc` 토큰으로 `/overview`** |
| ③ 직접 goto(1280) | 화면 조작 0 · href 로 직접 이동 | **`/overview`** | **`/incidents/INC-2025-019?_rsc` → `307` → `/`** |

**그러므로 주어는 드로어가 아니다** — 드로어는 닫혔고(3갈래 전건) 이동도 했다(열 ①). 남은 물음은 **「`/incidents/INC-2025-019` 가 어떤 조건에서 `307 → /` 로 되돌리는가」**이며, 이는 발주 축(D-79 닫힘 3갈래) **밖**이다. 재현 자산 = 열 ③.
🔴 본 그물의 1차 판정선 `a8_closeLink` 는 «닫힘»에 «이동»을 함께 묶은 **정본보다 넓은 축**이었다 — 넓은 축은 엄격함이 아니라 오답이다(§3 자수 3).

---

## 3. 자수 — 내 계측기가 낸 값 3

1. **스크림 클릭이 드로어에 막혔다**(1차 실행 중단 · 대상 결함 아님). 스크림은 `inset-0`(뷰포트 전체)이고 드로어 패널이 그 **왼쪽 260px 을 덮는다**. Playwright 기본 클릭은 «요소 중앙»이라 390 에서 x≈195 → 패널 안 → `drawer intercepts pointer events` 로 30초 소진. 사람이 실제로 누르는 «어두운 여백» 좌표(x=300 · 패널 우변 +40)로 고쳤다. 보존: `evidence/promo16/promo16-run1-scrim-crash.json`.
   🔴 **cap 소모는 0이었다** — 자극(live)을 맨 뒤에 둔 순서가 구독을 지켰다.
2. **live 열 「완주 재도달」은 stale 총계로 쟀다 = 미판정.** 클릭 직전 클라이언트 총계가 **33** 이었는데, 재생 도중 이벤트가 계속 도착해 총계가 **38** 로 자랐다(`status=completed` 뒤에도 폴링으로 더 온다). 내 그물은 «클릭 시점의 33» 을 끝으로 보고 7173ms 에 `hit=true` 를 냈으나, 그때 실제 상태는 **33/38 · `data-at-end=false`(재생 중)** 였다. 되감김·재생 진행은 참이고, **«끝까지 재도달»만 미판정**이다. 같은 축의 초록은 **정적 재생본 열**(38/38 · `at-end=true` · 8129ms)이 낸다. 다음 그물은 «총계가 두 번 연속 같을 때»를 기준선으로 삼아야 한다.
3. **`a8_closeLink` 판정선이 정본보다 넓었다** — 발주 문면은 「닫힘 3갈래」이고 «이동»은 내가 더한 것이다. 그 한 칸의 빨강이 D-79 의 빨강처럼 보였다(§2 에서 주어를 갈랐다).

## 4. 산출물

- `tests/web/promo16_external.mjs` · `tests/web/promo16_navlink_control.mjs`
- `evidence/promo16/promo16.json`(본 실행) · `promo16-navlink-control.json`(대조군) · `promo16-run1-scrim-crash.json`(자수 1 보존)
- 캡처 3 — `promo16-d79-390-closed.png` · `promo16-d79-390-open.png` · `promo16-live-badge-1280.png`
