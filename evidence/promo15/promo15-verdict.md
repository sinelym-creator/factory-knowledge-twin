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
