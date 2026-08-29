---
asset_class: evidence
description: T1-9(Next.js A안 셸) 독립 검증 — E2E 브라우저 실측 · AC 6항 재검 · 구현 검사기 대조군
owner: 검증(리바이2 6대)
ticket: T1-9
base: develop 8bca478
status: 제출
version: 1.0.0
created_at: 2026-08-29
---

# T1-9 독립 검증 — 셸 · 라우트 · 세션 가드

## 0. 판정

| | |
|---|---|
| **AC 6항** | 6/6 **충족**(내 축이 잡는 범위에서 · §3) |
| **결함** | 🔴 **2건** — V-1 세션 가드 우회 · V-2 spacing 토큰 미적용 (§5) |
| **구현 검사기** | 🔴 사정거리 밖 **5건**(14주입 중) — 초록의 «넓이»가 주장보다 좁다 (§2) |
| **acceptance** | 🔴 **오케 판정 사항**. 나는 결함 2건을 보고할 뿐 게이트를 대신 열지 않는다(§32.1) |

🔴 **AC 충족과 결함 2건은 모순이 아니다.** AC 6항은 구현 티켓이 스스로 세운 문장이고, V-1·V-2는
그 문장들이 «닿지 않는 자리»에서 났다 — AC ③은 「쿠키 없이 `/overview` 진입 → `/`」만 요구하고
「모든 라우트」(wireframes §6)를 요구하지 않는다. AC ④는 「토큰 계층 경유」를 요구하고 「그 값이
요소에 적용되는가」를 요구하지 않는다. **AC를 통과했다는 것과 정본을 만족한다는 것은 다른 문장이다.**

---

## 1. 무엇을 독립적으로 세웠는가

계보 규율상 «남의 도구로 남의 산출물을 재는 것»은 검증이 아니다. 이번 대에 내가 끊은 지점:

| 축 | 구현이 쓴 것 | 내가 세운 것 |
|---|---|---|
| 계약 허용 목록 | `contract-surface.mjs`의 손수 옮긴 `ALLOWED` 4항 | **동결 계약 문서를 직접 파싱**(`rest-api-v0.1.md` → base `/api` + 엔드포인트 27건) |
| 모집단 | 하드코딩 `ROOTS` 5항 → 15파일 | 앱 전체 순회 → **22파일** + 🔴 «제외한 8항을 명시 출력» |
| 계약 밖 판정 | 따옴표 직후 `/api/`로 시작하는 리터럴만 | 절대 URL · 템플릿 접두 · 주석/코드 분리 표기 |
| 배지·모달·가드 | SSR 응답 «본문» | **브라우저 computed style·네트워크·쿠키·리다이렉트 사슬** |
| 검사기 자체 | (대조 없음) | **14주입 대조군**(§2) |

---

## 2. 축 ③ — 구현 검사기를 먼저 대조군에 넣었다

> 5대 → 6대 유언: 「네가 만든 도구부터 대조군에 넣어라」.
> 여기서 «내가 만든 도구»는 내가 판정 근거로 «인용하려던» 남의 검사기다.

`node tests/web/contract_surface_drill.mjs` — 원본 무접촉(사본에 주입) · **주입 14건 · 갈림 5건**

| ID | 주입 | 기대 | 실측 | |
|---|---|---|---|---|
| D-00 | 무주입 기준선 | PASS | PASS | ○ |
| D-01 | 계약 밖 경로 직접 주입 | FAIL | FAIL | ○ |
| D-02 | fetch를 `lib/contract.ts` 밖에 | FAIL | FAIL | ○ |
| D-03 | 0파일 겨냥 | FAIL | FAIL | ○ 「스캔 0 = FAIL」 **산다** |
| D-04·05 | 주석 속 계약 밖 경로 | PASS | PASS | ○ 설계 의도대로 |
| **D-06** | 절대 URL `fetch("http://127.0.0.1:8000/api/agents/run")` | FAIL | **PASS** | 🔴 |
| **D-07** | 템플릿 접두 `` fetch(`${b}/api/agents/run`) `` | FAIL | **PASS** | 🔴 |
| **D-08** | `ROOTS` 밖 새 디렉터리 `hooks/` | FAIL | **PASS** | 🔴 |
| **D-09** | `EXT` 밖 확장자 `.jsx` | FAIL | **PASS** | 🔴 |
| D-10·11 | 두 번째 fetch(proxy.ts·app/) | FAIL | FAIL | ○ |
| D-12 | 허용 목록 자체를 넓힘 | FAIL | FAIL | ○ |
| **D-13** | D-10 «재조준» — `lib` 안 파일 순서를 바꿔 `contract.ts`를 lib의 마지막으로 | FAIL | **PASS** | 🔴 |

### 갈림 5건의 성질 — 셋으로 갈린다

**ⓐ 코드 결함 1건 (D-13)** — `const FETCH = /\bfetch\s*\(/g` 를 `.test()` 로 쓴다. `/g` 정규식의
`.test()` 는 `lastIndex` 가 «남는다» — 앞 파일에서 맞은 위치보다 앞에 있는 다음 파일의 `fetch` 를
건너뛴다. 지금 새지 않는 이유는 설계가 아니라 **파일 이름 순서**다: `lib/session.ts` 가
`contract.ts` 뒤에 읽히며 `lastIndex` 를 0으로 되돌린다. 그 파일을 지우거나 이름을 바꾸면 샌다.

🔴 D-13 출력이 스스로 모순을 적는다 — 경로 목록에는 `/api/live/status (proxy.ts)` 가 «찍혀 있는데»
같은 실행이 `== fetch 호출 파일 1: lib\contract.ts` 라고 답한다. 검사기가 본 것과 답한 것이 다르다.

**ⓑ 사정거리 2건 (D-06·D-07)** — `/(["'`])(\/api\/[^"'`]*)/` 는 따옴표 «직후»가 `/api/` 여야 문다.
절대 URL(rewrite 우회)과 접두 표현은 문자열째 안 보인다. 🔴 이 둘은 계약 표면을 늘리는 «가장 자연스러운»
형태다 — 포트를 직접 부르거나 base 변수를 앞에 붙이는 것.

**ⓒ 모집단 2건 (D-08·D-09)** — `ROOTS`·`EXT` 가 손으로 적은 목록이라 코드가 자라면 뒤처진다.
검사기는 「스캔 15파일」이라고 «정직하게» 말하지만, 15가 전부인지는 아무도 세지 않는다.

### 그래서 「계약 밖 0」은 참인가 — 별도로 잰다

🔴 **그물이 좁은 것과 주장이 거짓인 것은 다르다.** 검사기의 초록을 근거로 쓸 수 없게 됐으니,
주장 쪽을 내 모집단으로 다시 쟀다: `node tests/web/surface_scan.mjs`

```
계약 정본  packages/contracts/rest-api-v0.1.md  base=/api · 엔드포인트 27건 «파싱»
모집단     훑음 22파일 / 제외 8항(전부 열거 — node_modules·.next·public·락파일·비텍스트)
나가는 호출 lib/contract.ts  fetch   ← 1지점
/api 경로   POST /api/sessions · POST /api/sessions/${...}/reset · GET /api/live/status
           + /api/:path* (rewrite 원본·대상 쌍)
== 계약 밖 0 (내 모집단 22파일 · 코드 줄 기준)
```

**AC ⑤ 「계약 밖 0」 = 참**(E1). 거짓인 것은 «그 초록을 낸 검사기가 그것을 증명한다»는 부분이다.

---

## 3. 축 ② — AC 6항 재검

| AC | 결과 | 근거 |
|---|---|---|
| ① 6라우트 200 렌더 | **충족** | 브라우저 6/6 착지·`main` 가시 · `/`는 §6대로 `/overview` 흡수 |
| ② AppShell 4요소 | **충족** | 🔴 5화면 **전부**에서 app-bar·mode-badge·session-chip·reset-button + 배너 «가시» 확인. 배너는 조건을 없애면 사라지는 것까지 봄 = 고정 영역이 아니라 슬롯 |
| ③ 세션 가드 | **충족** (AC 문언) · 🔴 **정본 §6은 미충족** | 5경로 전건 `/` 경유 후 세션 발급·칩 표시 실측. 단 V-1(§5) |
| ④ Tailwind·토큰 계층 | **충족** (설치·토큰) · 🔴 **적용은 부분 실패** | `tailwindcss 4.3.3`·`@tailwindcss/postcss 4.3.3` **node_modules 실물**에서 확인(선언 아님). hex 리터럴 토큰 계층 밖 **0**. 단 V-2(§5) |
| ⑤ 계약 밖 0 | **충족** | §2 독립 재측정 |
| ⑥ 새 의존 이유 명시 | **충족** | T1-0 대비 델타 = `tailwindcss`·`@tailwindcss/postcss` **2건뿐 · 둘 다 devDependencies** → 🔴 **런타임 의존 추가 0** (git diff 실측) |

부가 확인(정본 축, AC 밖): chat-first 금지 — 셸 입력 요소 **0** · P1 라우트(`/knowledge`·`/documents`·
`/system`) 링크 **0** · 다크 기본(body 휘도 실측) · 세션 칩 = sessionId 앞 4자 · 다른 방문자 = 다른 세션.

---

## 4. 축 ① — 브라우저 실측 (구현이 「재지 않았다」고 이월한 축)

`cd tests/web && npx playwright test` — **34행 · 30 통과 · 4 «예상된 실패»(V-1 3 + V-2 1)**

preflight 가 «무엇을 상대로 쟀는지»를 먼저 기록한다(도구가 살아 있는지부터 — 2대):
`GET /api/live/status → 200 {"online":false}` · `POST /api/sessions → 501` · 쿠키 없는 `/overview → 307`.

**모드 배지 전이** — 🔴 응답을 800ms 늦춰 «전» 상태를 실제로 붙잡았다. 끝 상태만 보면
「처음부터 REPLAY였다」와 구분되지 않는다.

| 조건 | `data-mode` | 표시 |
|---|---|---|
| 마운트 직후(응답 전) | `checking` | ◌ 확인 중 |
| `{online:false}` | `replay` | ◑ REPLAY + 배너 「Replay로 전환」 |
| `{online:true}` | `live` | ◉ LIVE · 배너 **0** |
| 응답 없음 | `unavailable` | ◌ 미연결 + 「오류가 아닙니다」 · 🔴 본문에 REPLAY **없음** |
| 모킹 없이 실제 ai-api | `replay` | E1 왕복(rewrite → ai-api → 배지) |

**리셋 모달** — 버튼 클릭만으로는 네트워크 **0**(확인이 확인이다) · 취소 시 요청 0 ·
「되돌리기」가 실제로 내보내는 것 = `POST /api/sessions/{쿠키의 sid}/reset` **런타임 실측**
(정적 스캔은 «적혀 있는가»를, 이건 «나갔는가»를 본다) · 501 → 「초기화하지 못했습니다(501)」이고
「되돌렸습니다」는 **나오지 않는다** · ok:true 일 때만 성공 문구 · 느린 응답 중 버튼 잠금으로
요청 **1회**.

**세션 가드** — 5경로 전건 홉 사슬에 `30x /` 포함 → 쿠키 생성 → 칩 가시. 이동해도 세션 불변.
`POST /sessions` 501 구간이므로 origin=`pending`·칩에 `*`·툴팁이 「아직 백엔드에 등록되지 않은」
이라고 말하는 것까지 확인 — **승인된 설계 판단대로이고 결함이 아니다.**

---

## 5. 🔴 결함 2건

### V-1 — 세션 가드가 동적 라우트 3종에서 «돌지 않는다»

**정본** wireframes §6: 「모든 라우트는 세션 쿠키 없이 진입 시 `/`로 보내 세션을 먼저 만든다(격리 보장)」
· §P0 3항 「세션 칩 + **모든 라우트** 진입 가드」.

**원인** `apps/web-console/proxy.ts:50`
```
matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"]
```
마지막 절 `.*\.svg` 는 «경로 어디서든» `.svg` 로 끝나면 제외한다. 정적 자산을 빼려는 규칙인데,
동적 세그먼트(`[incidentId]`·`[evidenceId]`·`[woId]`)는 `.svg` 로 끝나는 id 를 그대로 받는다.

**실측 · 대조군** (쿠키 없음)

| 경로 | 응답 | |
|---|---|---|
| `/incidents/x.svg` | **200** | 🔴 세션 없이 열린다 |
| `/incidents/x.png` | 307 → `/` | ○ 가드가 돈다 |
| `/incidents/x.ico` | 307 → `/` | ○ |
| `/incidents/xsvg` | 307 → `/` | ○ |
| `/evidence/x.svg`·`/work-orders/x.svg` | **200** | 🔴 |
| `/compare.svg`·`/overview.svg` | 404 | 정적 라우트는 세그먼트가 없어 막힌다 |

🔴 확장자 한 글자로 갈린다 = **원인이 이 절 하나임이 분리된다.**
우회 진입 시 실제 렌더 = `app-bar`·`mode-badge` 는 뜨고 **`session-chip`·`reset-button` 부재** —
셸이 «격리 없이» 선다.

**사정거리** P0 6라우트 중 동적 3종. 지금 화면이 자리표시자라 유출될 데이터는 없다 —
**Phase 3에서 화면이 세션 스코프 데이터를 부르기 시작하면 그때는 세션 키 없이 도는 경로가 된다.**

**처방 후보** matcher 의 `.*\\.svg` 를 정적 자산 접두(`/public` 계열)로 좁히거나 제거.
`public/*.svg` 는 `_next` 를 타지 않는 정적 파일이라 별도 확인 필요 — 판단은 구현 좌석.

**그물** `tests/web/e2e/session-guard.spec.ts` — 🔴 `test.fail()` 3행 + 대조군 1행.
처방이 착지하면 「예상된 실패인데 통과했다」로 **빨강이 되어 알린다**(조용히 사라지는 표시를 두지 않는다).

### V-2 — spacing 토큰이 요소에 «닿지 않는다»

**정본** wireframes §0 상단 바 · ux-direction A안 좌측 레일. 토큰 `--spacing-appbar: 56px` /
`--spacing-rail: 56px` 를 `app/globals.css` `@theme` 에 세웠다.

**실측** (브라우저 computed style)

| | 토큰 선언 | :root 실재 | 요소 실측 |
|---|---|---|---|
| 앱바 높이 | 56px | **56px 있음** | 🔴 **27px** |
| 레일 폭 | 56px | **56px 있음** | 🔴 **37px** |
| 앱바 배경 | `--color-panel` | 있음 | ○ `rgb(17,24,35)` 적용됨 |

**원인** `components/app-shell.tsx:32,53` 이 쓰는 `h-[--spacing-appbar]`·`w-[--spacing-rail]` 는
Tailwind **v3**의 «맨 변수» 축약이다. v4는 대괄호 안을 값 그대로 쓴다.
빌드 산출 CSS 실물:

```
.h-\[--spacing-appbar\]{height:--spacing-appbar}     ← 🔴 무효 선언
.w-\[--spacing-rail\]{width:--spacing-rail}          ← 🔴 무효 선언
.bg-panel{background-color:var(--color-panel)}       ← 정상
```

**대조군** `node tests/web/token_layer_probe.mjs` — 설치 실물과 «같은 버전»(4.3.3)에 같은 토큰,
표기만 넷:

| 표기 | 생성된 선언 | |
|---|---|---|
| `h-[--spacing-appbar]` | `height: --spacing-appbar` | 🔴 무효 |
| `h-[var(--spacing-appbar)]` | `height: var(--spacing-appbar)` | ○ |
| `h-(--spacing-appbar)` | `height: var(--spacing-appbar)` | ○ |
| `bg-panel` | `background-color: var(--color-panel)` | ○ |

🔴 **왜 아무도 못 봤는가** — 규칙은 «생긴다». 클래스도 «붙어 있다». 토큰도 «있다». 빌드 경고 0,
lint 통과, 색은 정상 적용. 브라우저는 무효 선언 하나만 조용히 버리고 요소는 내용 높이로 선다 —
화면이 «깨져» 보이지 않는다. **computed style 을 재기 전에는 소스 리뷰로 잡히지 않는 결함이다.**

**처방** 두 곳의 표기를 `h-(--spacing-appbar)` / `w-(--spacing-rail)` 로. 토큰·정본 무수정.

**그물** `tests/web/e2e/shell.spec.ts` — 🔴 `test.fail()` 1행(56px 기대) + 대조군 1행
(토큰 자체는 살아 있고 색은 적용된다 = 원인이 «표기»임을 분리).

---

## 6. 🔴 내 기대가 틀린 것 4건 — 전부 「구현이 틀렸다」로 나갈 뻔했다

첫 E2E 실행은 **7행 빨강**이었다. 독립 재현 결과 **구현 결함은 0건**이었다(3대 규율).

| # | 내 빨강 | 실제 |
|---|---|---|
| ① | `page.route("**/api/sessions")` 모킹이 안 먹음 → 「세션 칩이 틀렸다」 | **세션 발급은 `proxy.ts` 가 서버에서 한다** — 그 요청은 브라우저를 지나지 않아 가로챌 것이 없었다. 안 먹는 모킹은 「조건을 세웠다」는 착각만 남긴다 |
| ② | `online:true` 인데 배너가 뜸 → 「배너 조건이 틀렸다」 | 세션이 `pending`(501)이라 **다른 사유로** 뜬 것. 한 축을 재려면 나머지 축을 눌러 둬야 한다 |
| ③ | 쿠키 없이 `/compare` → `/compare` 로 안 돌아옴 (5중 4행 빨강) | **정본에 그런 문장이 없다.** §6은 「`/`로 보낸다」+「`/`는 `/overview`로」 두 줄뿐 — 착지는 `/overview` 가 맞다. 「원래 경로로 복귀」는 **내가 넣은 가정** |
| ④ | 내 `surface_scan` 이 계약 밖 4건 적발 | **넷 다 주석 속 설명문**이었다(주석/코드 미분리 + 같은 리터럴 중복 계수). 내 도구를 고쳤다 — 지우지 않고 «주석 전용»으로 표시해 남긴다 |

🔴 **내 주입·내 기대가 틀리면 그 축은 검사가 없는 것과 같다.** 이번 대에도 오보 4건이 나갈 뻔했고,
넷 다 남의 산출물이 아니라 «내 그물»을 의심해서 갈렸다.

---

## 7. 회부

| # | 내용 | 등급 | 대상 |
|---|---|---|---|
| **R-1** | 🔵 **첫 진입 딥링크 유실** — 쿠키 없는 방문자가 `/evidence/{id}?run=&tab=` 로 오면 세션을 받고 `/overview` 에 선다. 목적지·쿼리가 사라진다. **정본 두 줄을 그대로 따른 결과라 결함이 아니다** — §6이 Evidence를 「모달 + 딥링크」로 적어 둔 것과의 정합만 오케가 판단하면 된다. 처방하려면 §6 개정(가드가 목적지를 보존) | E1(현상)·E3(영향) | 오케 |
| **R-2** | 🔴 **구현 검사기 사정거리** — `contract-surface.mjs` 갈림 5건(§2). 특히 **D-13은 코드 결함**(`/g` + `.test()` 의 `lastIndex` 잔류)이고 지금 안 새는 이유가 파일 이름 순서다. 나머지 4건은 사정거리·모집단 — 「계약 밖 0」의 근거로 인용될 때마다 과대계상이 된다 | E1 | 오케→구현 |
| **R-3** | 모달 스크림 `bg-black/60`(`components/reset-button.tsx:45`)이 토큰 계층 밖 유일 색값. AC 「하드코딩 최소」는 만족하나 UX 폴리시 패스에서 `@theme` 만 훑으면 이 한 곳이 빠진다 | E1 | 구현(경미) |
| **R-4** | `--color-danger` 토큰이 정의만 있고 사용 0 — Tailwind v4가 미사용 토큰을 산출물에서 뺀다. 「자리」로 의도한 것이면 무해하나, 브라우저에 없다는 사실은 기록해 둔다 | E1 | 참고 |
| **R-5** | `app/page.tsx:6` 주석이 아직 「middleware가 한다」라고 적는다(파일은 `proxy.ts`로 정정됨). 문서 drift 1줄 | E1 | 구현(경미) |
| **R-6** | `tests/graph/graph_verify.py:344` 가 `GRAPH_DUMP_DIR` 미지정 시 cwd에 `graph-dump.txt` 를 떨군다(러너는 임시 폴더를 준다). 내 자산이라 **내가 `.gitignore` 1줄로 닫았다** — 현재 세 체크아웃 모두 파일 부재·미추적 실측 | E1 | 검증(집행 완료) |

---

## 8. 한계 — 내 판정도 대조군 없이는 믿지 마라

- **결함 2건 = 「구현에 결함이 2건」이 아니라 「내 34행 + 14주입 + 22파일 스캔이 잡는 범위에서 2건」이다.**
- 브라우저는 **Chromium 1종**(headless). 다른 엔진의 렌더·쿠키 정책 차이는 재지 않았다.
- 모드 배지 4상태 중 셋은 **내가 만든 응답**으로 세웠다. 실제 왕복은 `{online:false}` 1건뿐이다 —
  ai-api 가 501/연결거부 외의 실패 형태(부분 응답·잘못된 JSON)를 낼 때는 안 재 봤다.
- 30s 폴링(`POLL_MS`)의 «반복» 동작은 재지 않았다(첫 tick 만). 장시간 체류 시의 재확인은 미측정.
- `public/*.svg` 정적 자산이 V-1 처방 후에도 정상 서빙되는지는 **처방이 나온 뒤** 재야 한다.
- 계약 표면은 **정적 + 런타임 1경로**(리셋)까지다. 나머지 두 경로의 런타임 왕복은 배지(live/status)만 봤고
  `POST /sessions` 는 서버에서 나가 브라우저 축으로는 못 봤다.

---

## 9. 재현

```
# 서버 (두 개 · 검사기가 띄우지 않는다 — 무엇을 상대로 쟀는지가 판정의 절반이다)
cd apps/web-console && pnpm install && pnpm build && pnpm exec next start -p 3101
cd services/ai-api  && uvicorn app.main:app --host 127.0.0.1 --port 8000

# 축 ③ 구현 검사기 대조군 (서버 불요)
node tests/web/contract_surface_drill.mjs          # 주입 14 · 갈림 5

# 축 ② 독립 계약 표면 (서버 불요)
node tests/web/surface_scan.mjs                    # 22파일 · 계약 밖 0

# V-2 원인 대조군 (서버 불요 · tests/web 에서)
cd tests/web && npm install && node token_layer_probe.mjs

# 축 ① 브라우저
cd tests/web && npx playwright install chromium && npx playwright test   # 34행
bash tests/web/route_matrix.sh                     # 상태코드 매트릭스 + V-1 탐침
```

🔴 `tests/web/` 는 `apps/web-console` 의 의존을 **빌려 쓰지 않는다**(자기 `package.json`).
검사 도구가 대상 안에 결합하면 대상이 바뀔 때 도구가 함께 죽는다.
