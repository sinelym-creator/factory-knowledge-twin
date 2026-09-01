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

---

## §8 D-16 재관측 — 색인 복구 «전/후» 대조 (22대 · lane `lane/levi2-d16-recheck`)

> 자극 = **같은** GS-01 `start-from-headline` · 외부 vantage 그대로(공개 셸만 · `tailscale-*` 0)
> 복구 집행 = 오케 19:11:51(`build_index.py` · `document_chunk` 0 → **59행/59임베딩**) · 내 손 0
> 대조군(복구 «전») = `q69-shell-mode-c5-prefail-control.json` 19:09 · 재관측 = `c6a` 19:13:26 · `c6b` 19:13:54

### §8.1 복구 전/후 — 같은 자극, 같은 vantage

| 축 | 복구 «전»(c3·c4·c5 = 3/3) | 복구 «후»(c6a·c6b = 2/2) | 바뀜 |
|---|---|---|---|
| 이벤트 수 | 15 | **32** | ✅ |
| 결말 | **`run.failed` `step_failed:vector`** | **`run.completed`** | ✅ |
| 5단계 | `structured` 완료 → **`vector` 중단** · 3단 대기 | **5/5 completed**(structured·vector·graph·synthesize·draft_work_order) | ✅ |
| 근거 | 9건 | **19건**(구조화 9 · 문서검색 5 · 그래프 5) | ✅ |
| 소요 | 중단 시점까지 2ms | **1.2초**(1266ms · totalElapsedMs 확정) | ✅ |
| `mode` | live 15/15 | **live 32/32** | — |
| fallback·replay 표지 | **0건** | **0건** | — |
| alert `run-failed` | **있음**(내부 코드 노출) | **없음** | ✅ |
| 본문 자수 | 12173 | **14498 / 14493** | ✅ |
| 배지 | `◑REPLAY` | **`◑REPLAY`** | ❌ 그대로 |
| 배너 문면 | 「Live AI 연결이 끊겨 **Replay로 전환했습니다**」 | **동일 문면 그대로** | ❌ 그대로 |
| 제안(`static-replay-offer`) | 없음 | 없음(성공 창이라 **판정력 없음**) | — |
| 「코드 1006 · 세션 만료」 안내 | 있음 | **있음** | ❌ 그대로 |
| WS 핸드셰이크 | **404** ×2 | **404** ×2 | ❌ 그대로 |
| run 카드 | `LIVE` / **중단됨** | `LIVE` / **완료** | ✅ |

### §8.2 관측 결론 (판정은 오케)

1. **D-16 = Golden Live 경로가 이 자극에서 복구됐다** — `run.completed` · 5/5 단계 · 근거 19건 · **2/2 재현**.
   `vector` 는 「인용 후보 5건 · 511ms · 근거 5건」으로 실제로 **문서 청크를 읽었다**(색인 복구가 근인이었다는 것과 정합).
2. 🔴 **화면 문면 어긋남은 복구로 사라지지 않았다** — 그것도 **더 선명해졌다**: 이제는
   **성공한 live run 위에서** 화면이 「Live AI 연결이 **끊겨** Replay로 **전환했습니다**」라고 말한다.
   이벤트에 fallback 표지는 여전히 0건이고 run 카드는 `LIVE 완료`인데 상단 배지는 `◑REPLAY` 다.
3. 🔴 **「코드 1006 — 세션이 만료됐거나」 안내도 완주 화면에 그대로 남는다.** 원인은 WS 라우트 **404**(§4)이고
   세션은 살아 있다(같은 세션으로 `/api/runs/…/events` **200** 을 읽었다) — **원인 오귀속이 유지된다.**
4. 사라진 것(`run-failed` alert)은 **자극의 결과가 성공으로 바뀐 부수효과**이지 문면이 고쳐진 것이 아니다.

⇒ **D-16(복구)과 Q-69(문면·배지)는 서로 다른 처방이 필요하다.** 복구는 ①을 고쳤고 ②③은 **그대로 살아 있다.**

### §8.3 결론 범위 = 측정 범위

자극 **GS-01 한 종**(`start-from-headline`) · 복구 후 **2회** · 외부 vantage 1곳 · 이 시점 배포 · 19:13 창.
**안 잰 것**: ⓐ **다른 Golden Scenario·다른 incident**(§33.1 전수가 아니다 — GS-01 만 봤다) ⓑ 실패
상황에서의 **제안 요소 거동**(성공 창이라 판정력 없음 — 이 축은 다시 장애를 넣어야 갈린다) ⓒ 배지·배너를
정하는 **코드 근거**(코드 축) ⓓ 부하·동시 접속 · 장시간 안정성.
