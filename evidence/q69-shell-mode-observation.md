# Q-69 관측 축 — 「평시 REPLAY 배지 = 기대값인가 강등인가」 (외부 vantage)

> 검증 좌석 리바이2 **22대** · lane `lane/levi2-q69` · 2026-09-01 18:58~19:03
> 경로 = **공개 Production 셸(Vercel)만** · tailnet·127.0.0.1 무접촉 · 전 표본 `tailscale-*` 헤더 **0**
> 🔴 **관측이다. 판정이 아니다** — 코드 축(센쿠2)과 대조해 오케가 Q-69 를 판정한다.

## §1 잰 것 / 안 잰 것

**잰 것** = ① 첫 진입 배지 시계열과 그 사이 `/api/*` 응답 ② **WS 핸드셰이크 성패** ③ `/api/live/status`
200 본문 전 필드 ④ Live 시도 자극 1회(×2 회차)의 **이벤트 스트림 분기**.
**안 잰 것** = ⓐ `run.failed` **뒤 화면이 방문자에게 무엇을 보여주는지**(문면·제안 여부 — 배지만 봤다)
ⓑ 자유 질문 입력 경로가 **다른 화면에 있는지**(`/overview`·`/incidents/*` 2화면만 훑었다)
ⓒ `vector` 실패의 **원인 층**(ai-api·Qdrant·Neo4j 중 어디인지 — 컨테이너 무접촉)
ⓓ `live/status` 가 **무엇을 근거로** `online:false` 를 내는지(코드 축).

## §2 배지 시계열 (c0 · 회차별 동형)

| ms | 화면 | 배지 | 배너 | 직전 신호 |
|---|---|---|---|---|
| 1977 | `/` | `◌확인 중` | 없음 | — |
| **3751** | `/` | **`◑REPLAY`** | **있음** | `/api/live/status` **200 @3705ms** (**+46ms**) |
| 5896 | `/overview` | `◑REPLAY` | 있음 | `/enter` 303 @5097ms |

⇒ 배지를 `◑REPLAY` 로 넘긴 신호는 **`live/status` 200 응답 그 자체**다(46ms 뒤 전이).

## §3 `/api/live/status` 200 본문 — 전 필드 원문

```json
{"online": false, "checkedAt": "2026-09-01T09:58:22.903097Z"}
```

🔴 **200 은 「엔드포인트가 산다」이고, `online:false` 가 「Live 가 죽었다」다.** 21대가 Q-69 단서로
남긴 「`live/status` 는 200 인데 화면은 REPLAY」의 **모순은 없다** — 상태코드가 아니라 본문이 배지를 정한다.

## §4 WebSocket — **101 이 아니라 404**

```
wss://<셸>/api/ws/runs/<RUN>   핸드셰이크 실패  Unexpected response code: 404   (×2 시도 · 즉시 close)
GET  https://<셸>/api/ws/runs/<RUN>   404  {"error":{"code":"http_404","message":"Not Found"}}
```
⇒ 이 셸에 WS 라우트가 **없다**. 클라이언트는 폴링 `/api/runs/<RUN>/events` **200** 으로 대체한다.
(브라우저 밖에서 `/api/runs/<RUN>` · `.../events` 를 치면 **401 `session_required`** — 이벤트는 세션 안에서만 읽힌다.)

## §5 🔴 Live 시도 자극 — `run.started` 로 «서고», replay 로 **강등되지 않고**, `vector` 에서 **죽는다**

이 셸에는 **자유 질문 입력창이 없다**(`/overview`·`/incidents/*` 모두 `textarea/input` **0개**).
그래서 자극은 정본 UI 의 `[data-testid=start-from-headline]`(「조사 시작 ▸」 = 시나리오 GS-01 기동)으로 집행했다.

| 회차 | run | 이벤트 | mode | 결말 |
|---|---|---|---|---|
| c3 | `RUN-8c82…` | 15건 | **`live` 15/15** | **`run.failed` · `step_failed:vector`** |
| c4 | `RUN-3bee…` | 15건 | **`live` 15/15** | **`run.failed` · `step_failed:vector`** (**2/2 재현**) |

```
run.started > plan.updated > step.started(structured) > step.evidence ×9 > step.completed
           > step.started(vector) > run.failed  {"code":"step_failed:vector"}
```
**`fallback` · `replay` 표지 = 0건.** 배지는 시종 `◑REPLAY` 인데 **run 은 `mode:live` 로 돌았다.**

## §6 관측 결론 (판정은 오케)

1. **평시 `◑REPLAY` 는 «기대값인 상시 모드»가 아니라 «강등 표시»다** — `live/status.online=false` 가 만든다(§2·§3).
2. 🔴 **그 강등이 실행 경로까지 일관되지 않는다** — 화면은 REPLAY 라고 알리면서, 자극을 주면 run 은
   **live 로 서고 replay 로 내려가지 않은 채 `vector` 에서 실패**한다(2/2). 방문자 관점: 「REPLAY 라고
   안내받고 시작했는데 결과는 실패」. **Gate 6 의 「대안을 준다」와 어긋날 소지** — 회부한다(등급 판단 = 오케).
3. WS 는 이 셸에 **없다**(404) — 스트림은 폴링으로 선다. Live 여부와 별개 사실.

**결론 범위 = 측정 범위**: 공개 셸 1개 · 외부 vantage 1곳 · 이 시점 배포 · 진입 2회 + 자극 2회(11분).
`vector` 실패의 원인 층·화면 문면·다른 진입 경로는 **이 문서 밖이다**.

## §7 재현

```
FKT_WEB_BASE=<공개 셸> NODE_PATH=<tests/web 의 node_modules> \
  node tests/web/q69_shell_mode_probe.mjs --out=<json>
```
**raw**: `q69-shell-mode-c0.json`(진입·입력창 부재) · `c1`(WS 404) · `c2`(셸 밖 GET = 401/404) ·
`c3`·`c4`(자극 + 이벤트 스트림 · 2/2 재현).
