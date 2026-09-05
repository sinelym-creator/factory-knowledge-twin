# 승격 15 외부 재검 — 공개면 (live 1회)

> 검증 좌석(리바이2 46대) · 발주 = 스자쿠 40대(착수 신호 ts 15:36Z) · lane `levi2-promo15` · 출발 `e1ae7f0`
> 대상 = 공개면 `https://factory-knowledge-twin.vercel.app` · main `56d5730` 승격분 · **live 1회 · 그 외 0**

---

## 0. 판정

**🔴 D-75 ⓑ 거동 축 = PASS.** 승격 후 공개면에서 GP 근거 본문이 **화면 클릭으로 열린다.**
live 0 축은 **1건을 뺀 전건 PASS**, 그 1건(LIVE 배지)은 **내 계측기가 이른 시점에 읽어 미측정**이다.

| # | 축 | Target | Actual | 판정 |
|---|---|---|---|---|
| a | `/api/health.build` | **`879fc35` 유지**(정정 판정선) | **`879fc35`** | PASS |
| b | deps postgres·neo4j | ok·ok | ok·ok | PASS |
| c | embedding | ready | **ready** | PASS |
| d | 정적 재생본 배지 | `replay` | **`replay`** | PASS |
| e | 보안 헤더 | CSP·nosniff·referrer | 전부 실재(+HSTS `max-age=31536000; includeSubDomains`) | PASS |
| f | D-67 카드 390 | 실재 | 실재 · card 350 / body 310 · `column` | PASS |
| g | **LIVE 배지** | `data-mode="live"` | **`null`** | 🔴 **미측정(§3 자수 1)** |
| h | `graph-path-body` | 1 | **1** | PASS |
| i | 걸음 `li` | ≥2 | **3** | PASS |
| j | walk 문자열 | 비어있지 않음 | `[Component · 2-hop] AL-20260826-0041 → EQ-CNC-204 → CP-204-BRG-01` | PASS |
| k | 본문 `<a>` | 0 | **0** | PASS |
| l | 「닿지 못했습니다」 | 0 | **0** | PASS |
| m | 완주 이벤트 | >0 | **38건** · types = `run.started`·`plan.updated`·`step.started`·`step.evidence`·`step.completed`·`step.progress`·`run.completed` | PASS |
| n | 콘솔 오류(WS 제외) | 0 | **0**(WS 404 5건은 기지 사항으로 제외 — 「셌다」는 사실은 남긴다) | PASS |

**h~l = D-75 ⓑ PASS.**

---

## 1. 무대 울림

`build=879fc35`(정정 판정선대로 **유지**) · embedding `ready` · 밖의 근거 **연결 IP `64.29.17.3`** ·
자극 = 화면 **`start-from-alarm` 클릭**(fetch 아님) · `run=RUN-ffa5115f6504` · `completed` ·
🔴 **O-16 배제** = 화면이 낸 GP href **5건 전부 `GP-ffa5115f6504-*`** = runId 접미와 **일치** ·
근거는 **목록에서 클릭**해 열었다(URL = `/evidence/GP-ffa5115f6504-00?run=RUN-ffa5115f6504`).

캡처 3본: `promo15-gp-body-1280.png`(경로 본문) · `promo15-static-replay-1280.png` · `promo15-d67-390.png`.

---

## 2. 정적 방문자 칩 — 본 측정의 `0` 은 **내 순서가 만든 것**(두 열로 실증)

본 측정에서 `static-visitor-chip` 이 **0** 이었다. 렌더 조건은 `static-visitor.tsx`
`if (!active || !visitor) return null` 이고, 본 측정 컨텍스트는 **앞서 `/overview` 를 열어 세션이
이미 있었다**. 그래서 새 컨텍스트 두 열로 따로 쟀다(`promo15_static_chip.mjs` · **live 0**):

| 열 | chip | badge | session |
|---|---|---|---|
| `direct_no_session`(세션 없이 정적 URL 직행) | **1** | `replay` | **0** |
| `after_overview`(본 측정의 순서 재현) | **0** | `replay` | **1** |

`orderExplainsIt = true`. → **대상 결함 아님.** 칩은 「서버 세션이 아니라 이 브라우저에만 남는」
방문자 표식이므로 **세션이 있으면 서지 않는 것이 설계**다. 본 스크립트의 판정 축에서 이 칸을
내리고(`d_staticReplayBadge` 로 교체) 사유를 코드 주석에 박았다.

---

## 3. 🔴 자수 — 내 계측기 2건 (대상 결함 0)

1. **LIVE 배지를 «클릭 직후 2초»에 읽었다.** 배지는 `run-console.tsx:387` `{state.mode && (...)}` 로
   조건부이고 `state.mode` 는 서버 상태가 닿은 뒤 채워진다. 공개면은 **WS 가 404**(콘솔 5건)라
   폴링으로만 오므로 그 시점엔 아직 `null` 이다. **「배지가 없다」가 아니라 「내가 일렀다」**이며,
   같은 실행의 **정적 화면에서 같은 셀렉터가 `replay` 를 냈다**는 것이 그 증거다(셀렉터·렌더 경로 유효).
   처방 = 완주 **뒤**에 다시 읽도록 고쳤고, 이른 값은 `runModeBadgeEarly` 로 강등해 기록만 한다.
   🔴 **그러나 이번 회차의 g 축은 여전히 미측정이다** — live 1회 제한이라 **재실행하지 않았다**.
   고친 스크립트는 **다음 회차용**이고, 「고쳤다」와 「그래서 이번에 잡혔다」는 다른 사실이다.
2. **정적 칩을 오염된 순서로 쟀다**(§2). 두 열로 되짚어 대상 결함이 아님을 실증했다.

---

## 4. 안 잰 것 (이름으로)

1. **LIVE 배지**(§3-1) — live 1회 제한. 다음 live 회차에 고친 스크립트로 닫는다.
2. **replay run «생성»** — 발주 범위의 `replay run 1` 은 정적 재생본(`?run=STATIC-GS-01`) 화면으로
   갈음했다. 「조사 시작」의 **replay 강등 경로**(live 거절 시 재생으로 이어가는 길)는 **안 밟았다**.
3. **Vercel 빌드 로그 `[FKT] 빌드 중단` 0 확인** — 오케 축(내 표면 아님).
4. 셸 sha `56d5730` 는 **오케 실측 전언**이며 내가 확인한 값이 아니다.

---

## 5. v47 append (09-05 · 발주 A — `run-mode-badge` 축 + fetch 자극 대조군 열 · live 1회)

**대상** develop `86f62d9`(발주문 sha `e081aa5` 는 그 사이 늙었다 — 차이 = `.gitignore`·`CLAUDE.md`·
`docs/plan/ticket-ledger.md` 3파일뿐이고 **판정선 3파일은 `git diff` 전건 IDENTICAL** 이라 축에 무영향).
**무대** 공개면 `https://factory-knowledge-twin.vercel.app` · `health.build` = **`879fc35`**(판정선 정답 유지).
**run** `RUN-3fd4865b83b5` · `finalRunStatus=completed` · GP 접두 일치 `GP-3fd4865b83b5-00` → **무대 울림**.
산출물 = `evidence/promo15-badge/run.json`.

### 5.1 배지 3열 — 🔴 **§3 자수 1 · §4 「안 잰 것」 1 을 닫는다**

| 열 | 주어 | 측정 시점 | Actual | 판정 |
|---|---|---|---|---|
| ① early | `run-mode-badge` `data-mode` | 조사 시작 클릭 직후 | **`null`**(요소 수 미분리 — §5.4 자수 1) | 판정 대상 아님(기록) |
| ② 완주 뒤 | 같음 | `status=completed` 확인 뒤 | **`live`** | ✅ |
| ③ API | run 응답 `mode` | 같은 `runId` | **`live`** | ✅ |

**PASS = ②=③=`live`** → **PASS**.

🔴 **①≠② 「배지가 서는 시점」 1줄**: 배지는 **조사 시작 시점에 서지 않고, 서버 상태가 화면에 닿은
뒤에 선다**. `run-console.tsx:388` 이 `{state.mode && (...)}` 조건부라 `state.mode` 가 비는 동안은
**요소 자체가 없고**, 공개면은 WS 404 라 그 값이 **폴링으로만** 온다. 즉 ① 의 `null` 은 배지의 부재가
아니라 **관측 시점의 이름**이다(46대 자수와 같은 자리 · 이번엔 ② 가 `live` 로 서서 실증됐다).

🔴 **열 ③ 의 출처를 «이름»으로 남긴다** — `GET /api/runs/{runId}` 스냅샷의 키는
`["status","candidates","workOrderDraftId"]` 로 **`mode` 가 없다**. 이는 결함이 아니라 계약
`rest-api-v0.1.md:36` 문면 그대로다. `mode` 의 계약 정본은 **`:34` 의 POST 응답**이고, 실측
`POST /api/scenarios/GS-01/runs` → `{runId, incidentId, mode:"live"}` 로 답했다. 이벤트 정본
(`GET /runs/{id}/events`, 38건)의 **첫 이벤트 `mode` 도 `live`** 로 같은 값을 낸다 — 세 자리 중
두 자리가 답했고, 답하지 않은 한 자리는 **원래 답하지 않기로 적힌 자리**다.

혼동 금지: 화면 우상단 `mode-badge`(셸)는 **다른 주어**다. 이번 회차 새 컨텍스트에서 셸 배지는
1개로 섰으나 `run-mode-badge` 는 0개였다(§5.4 자수 2) — 두 배지를 한 문장에 섞으면 안 된다.

### 5.2 fetch 자극 대조군 열 (D-75 잔여)

| 열 | 시점 | 표면 | Actual |
|---|---|---|---|
| GP 직접 GET | 🔴 **화면 클릭 «전»** | `/api/evidence/GP-3fd4865b83b5-00` | **200**(본문 = `kind:"graph-path"` 실체) |
| GP 직접 GET | 화면 클릭 «뒤» | 같음 | **200** |
| `graphPaths` byRun | 클릭 «전» | `/api/graph/paths?byRun=RUN-…` | **200** |

`orderEffect = false`. 🔴 **클릭 «전»에 쳐야 이 열이 뜻을 갖는다** — 클릭 뒤에만 치면 자극이 이미
들어간 뒤라 「자극 불요」를 말할 수 없다. 그래서 두 시점을 모두 찍어 **순서 효과 자체를 값으로** 만들었다.

→ 발주 정의대로 **200 = 「화면 자극 불요 · 배포 지연 판정 그대로」(E1)**. **404 아님 → D-75 재개방 없음.**

### 5.3 승격 15 전축 재검 (같은 회차 · 곁가지)

`a`~`n` 14축 **전건 PASS**(`allPass=true` · `d75b_pass=true` · 비-WS 콘솔 에러 0 · events 38).
🔴 새 배지·fetch 축은 **`allPass` 에 섞지 않고 별도 군**(`verdict.badge`·`verdict.fetchCtl`)으로 두었다 —
축을 넓히면 `allPass` 라는 이름이 가리키던 초록의 뜻이 조용히 바뀐다.

### 5.4 🔴 자수 — 내 계측기 2건 (**대상 결함 0**)

1. **열 ① 의 `null` 이 두 갈래를 합쳤다.** 드릴이 `count() ? getAttribute() : null` 이라
   **«요소 0개»와 «속성이 null»이 같은 얼굴**로 나온다. 이번 값의 갈래는 **못 갈랐다**(early 시점은
   새 run 이 있어야 재현되므로 이 회차에서 되돌아가 못 묻는다). 처방 = `runModeBadgeEarlyCount` ·
   `runModeBadgeCount` 를 **따로** 남기도록 고쳤다 — 🔴 그러나 「고쳤다」와 「그래서 갈렸다」는
   다른 사실이고, 이 회차의 갈래는 **미측정**이다(다음 live 회차에 닫는다).
2. **캡처를 «다른 컨텍스트»에서 찍으려 했다.** 완주한 run 을 새 브라우저 컨텍스트로 URL 재진입하면
   배지가 **0개**로 나온다. 이를 「배지 없음」으로 적었으면 없는 결함을 지어낼 자리였다 — 귀속을
   물어 갈랐다: 같은 컨텍스트에서 **`GET /api/runs/{runId}` = 404 · `/api/live/status` = 200**.
   run 은 **세션 스코프**라 새 컨텍스트는 그 run 의 소유자가 아니다. **셸은 살아 있고 화면만 안 선다.**
   처방 = 배지 캡처를 **자극을 태운 그 세션 안**(완주 직후)에서 찍도록 드릴에 심었다(`badge_capture.mjs`
   는 귀속 probe 로 남긴다).

### 5.5 안 잰 것 (이름으로)

1. **열 ① 의 갈래**(§5.4-1) — 요소 0개인지 속성 null 인지. 다음 live 회차.
2. **배지 캡처 1280 이미지** — §5.4-2 사유로 이 회차엔 **못 남겼다**. 대신 `data-mode="live"` 는
   JSON 실측으로 남았고(`run.json` `live1.runModeBadge`), 다음 회차엔 드릴이 자동으로 찍는다.
   증거로 남긴 것 = `evidence/promo15-badge/badge-absent-1280.png`(귀속 자수용 · **배지 없는 화면**).
3. **replay 강등 경로** — 이번에도 안 밟았다(§4-2 그대로 이월).
