# X 예외 축 무대 (T7-21·T7-22) — **4/4 완성 · 전 무대 selftest PASS**

검증이 X-01~X-25 를 «실행»하려면 **자극을 만드는 무대**가 먼저 있어야 한다. 여기 있는 것은 그 무대다.
🔴 **`tests/**` 는 검증 좌석 자산이다** — 그쪽 `_blackhole_server.mjs` 는 **읽기만** 했고, 이 자리에 새로 뒀다.

## 🔴 무대마다 «자기 생존 증인»

「띄웠다」는 증거가 아니다. **안 울리는 무대는 「예외가 안 났다」를 만들어 낸다.**
그래서 각 무대는 두 가지를 갖는다:

- `GET /__stage` — 지금까지 자기가 «무엇을 했는지»를 수로 낸다.
- `--selftest` — 자기 자신에게 자극을 한 번 넣고 **울렸는지 판정**한다. **안 울리면 exit 1.**

## ① 끊는 프록시 — `blackhole-proxy.mjs` ✅ **완성**

**X-16**: 「상류엔 «닿았는데» 응답만 유실된다」 → 다시 누르면 **상태가 두 번 바뀌는가**.

```
node blackhole-proxy.mjs --port 8811 --upstream 127.0.0.1:8101
node blackhole-proxy.mjs --selftest --port 8899 --upstream 127.0.0.1:8101 --probe api/plants
```

- **상류가 «끝까지» 답한 뒤에** 클라이언트 소켓을 끊는다. 먼저 끊으면 상류가 중간에 죽어 X-16 이 아니라 그냥 요청 실패가 된다.
- 🔴 **자기 생존 증인 실측(09-04 08:05)** — `SELFTEST PASS` · 상류 응답 **200 · 81 B · 2 ms** · 클라이언트 **ECONNRESET(수신 0 B)**. **두 사실이 같은 실행에서 나왔다.**
- 🔴 **이 무대가 «못 하는 말»**: 「상태가 두 번 바뀌었나」는 **상류가 답한다.** 기본 상류 `:8101` 은 정적 재생본이라 상태가 없다 — **상태를 가진 상류를 `--upstream` 으로 지정해야** 그 판정이 선다.
- ⚠ MSYS 셸에서 `--probe /api/plants` 처럼 **앞 슬래시**를 주면 `C:/Program Files/Git/...` 로 번역된다. `--probe api/plants` 로 준다(이 함정에 한 번 걸렸다).
- 🔴 **재확인(09-04 09:11 · T7-22)** — 위 08:05 값은 38대의 것이라 **오늘 다시 울렸다**: 임시 상류(`:8896`)를 세우고 `--selftest --port 8898 --upstream 127.0.0.1:8896` → `SELFTEST PASS` **exit 0**(상류 도달 1 · 클라이언트 수신 0). 🔴 이 무대의 selftest 는 **외부 상류가 있어야 선다** — 기본값 `:8101` 이 죽어 있으면 「무대 고장」과 구분되지 않는다(②③④ 는 그래서 자기 상류를 데려온다).

## ② 늦추는 프록시 — `delay-proxy.mjs` ✅ **완성**

**X-03·X-07**: 지연 후 **정상 복구** · 잠정 상태가 그려졌다 걷히는가.

```
node delay-proxy.mjs --port 8812 --upstream 127.0.0.1:8101 --delay-ms 1200
node delay-proxy.mjs --selftest --delay-ms 800                       # 내부 상류 + 대조군까지 자족
node delay-proxy.mjs --selftest --upstream 127.0.0.1:<levi2-ai-api-port> --probe api/plants
```

- 상류 응답을 `--delay-ms` 만큼 «개시하지 않고» 붙들었다가 상태·헤더·본문을 그대로 흘린다(끊지 않는다 — ①과 다른 점).
- 🔴 **버퍼가 아니라 `pause()` 로 붙든다.** 버퍼로 받아 두면 SSE·chunked 의 스트림 «형태»까지 바뀌어, 실 ai-api 앞에 세웠을 때 지연이 아닌 것을 같이 주입한다.
- 🔴 **selftest 가 자기 상류를 데려온다** — 외부 스텁(`:8101`)에 기대면 「무대 고장」과 「상류 부재」가 같은 빨강으로 나온다. 내부 상류를 세우고 **무대를 안 거친 대조군 요청**을 먼저 넣어 기준선을 잡는다. `--upstream` 을 명시하면 그쪽을 쓴다(실 ai-api 앞에 세울 때).
- 🔴 **자기 생존 증인 실측(09-04 08:58)** — `SELFTEST PASS` · 실측 지연 **804 ms**(설정 800) · **대조군 대비 +789 ms**(대조군 19 ms → 무대 808 ms) · 정상 복구 **200 · 48 B** = 대조군 **200 · 48 B** · `delivered` 1 · stagePort **59184**. 판정 4축(자극 설정 · 실측이 설정에 닿음 · 대조군보다 늦음 · 끊기지 않고 동일 응답) 전부 충족.
- 🔴 **반대 방향 대조군** — `--delay-ms 0` 은 `SELFTEST FAIL — 미충족 축: stimulusConfigured` · **exit 1**. 판정선이 «내려가기도» 한다는 것을 같은 계측기로 확인했다(안 울리는 판정선은 판정선이 아니다).
- 🔴 **이 무대가 «못 하는 말»**: 「잠정 상태가 그려졌다 걷혔다」는 **화면이 답한다.** 이쪽은 지연이 실제로 걸렸고 응답이 온전했다는 두 사실만 낸다.
- 포트 **8812**.

## ③ 용량 거절 — `capacity-proxy.mjs` ✅ **완성**

**X-11**: 동시 요청 상한 초과 시 **503 + `Retry-After`** (`t42b:208` 이 기다리는 자리).

```
node capacity-proxy.mjs --port 8813 --upstream 127.0.0.1:8101 --max-inflight 2 --retry-after 1
node capacity-proxy.mjs --selftest --max-inflight 2 --burst 6          # 내부(느린) 상류로 자족
node capacity-proxy.mjs --selftest --upstream 127.0.0.1:<levi2-ai-api-port> --burst 40 --probe api/plants
```

- 진행 중 요청 수를 세어 `--max-inflight` **초과분만** 503(+`Retry-After`). 나머지는 상류로 통과.
- 🔴 **무대가 울리려면 상류가 «겹칠 만큼» 느려야 한다.** 상류가 즉답하면 요청이 사실상 직렬로 끝나 동시 진행 수가 상한에 닿지 못한다 — 그러면 전량 200 이 나오고, 이건 「상한이 없다」가 아니라 **「자극이 안 섰다」**이다. selftest 의 내부 상류는 그래서 일부러 느리다(`--upstream-delay-ms` 기본 400 ms). **실 상류 앞에 세울 때는 버스트를 그만큼 키운다.**
- 🔴 그래서 증인에 **`peakInflight`** 를 둔다 — 이게 상한 미만이면 판정 자체가 무효다(자극 미달을 「상한 없음」으로 읽지 않기 위해).
- 🔴 **자기 생존 증인 실측(09-04 09:07)** — `SELFTEST PASS` · 버스트 **6** · **503 4건**(`Retry-After: 1` **전건 부착** 4/4) · **200 2건** · `peakInflight` **2/2** · 상류 응답 2 · 응답 수신 6/6 · stagePort 60443. **503 과 200 이 «같은 버스트»에서 나왔다.**
- 🔴 **반대 방향 대조군 2본** — 양쪽 끝을 다 눌러 판정선이 «내려가는» 것을 확인했다.
  - `--max-inflight 0` → `FAIL — passedAtLeastOne, passedReachedUpstream, passedIs200` (503 6 · 통과 0) · **exit 1**. 전량 503 은 상한이 아니라 고장이라는 것을 판정식이 말한다.
  - `--max-inflight 99` → `FAIL — rejectedAtLeastOne, everyRejectHasRetryAfter, peakReachedLimit` (503 0 · 통과 6 · peak 6/99) · **exit 1**.
- 🔴 **클라이언트가 끊어도 자리는 반드시 돌려준다**(`res.on("close")`). 안 돌려주면 무대가 스스로 막혀 그 뒤 전량이 503 이 되는데, 그건 상한이 아니라 무대 고장이다.
- 🔴 **이 무대가 «못 하는 말»**: 「화면이 `Retry-After` 를 읽고 되묻는가」는 **화면이 답한다.** 이쪽은 상한이 실제로 걸렸고 통과분은 상류에 닿았다는 두 사실만 낸다.
- 포트 **8813**.

## ④ 합성 게이트웨이 — `synthetic-gateway.mjs` ✅ **완성**

**X-23**: `online:true` 인데 **근거 0건** → 화면이 「모른다」로 가는가 (`t6-6:226`).

```
node synthetic-gateway.mjs --port 8814 --upstream 127.0.0.1:8101
node synthetic-gateway.mjs --port 8814 --upstream 127.0.0.1:8101 --block-upgrade
node synthetic-gateway.mjs --selftest                    # 내부 상류 + 대조군까지 자족(WS 통과 축)
node synthetic-gateway.mjs --selftest --block-upgrade    # 426 거절 + 폴링 경로 재작성 축
node synthetic-gateway.mjs --selftest --passthrough      # 역방향 대조군(FAIL 이 나야 정상)
```

- 🔴 **«따로 도는» 형태다 — 기본 회귀 스택에 끼우지 않는다.** 전량 회귀는 `online:false` 라야 다른 스펙이 정상이다(검증 신고분). X-23 을 «칠 때만» 세운다.
- 상류를 그대로 통과시키되 **두 곳만** 바꾼다: ① `GET /api/live/status` → `online:true` 합성(상류가 죽어 있어도 합성한다 — 그게 이 무대의 이름이다) ② JSON 안의 근거 배열(`evidenceIds`·`evidence`·`citations` · `--evidence-keys`)을 **길이 0**.
- 🔴 **근거를 비우면 옆의 `evidenceCount` 도 0 으로 맞춘다.** 안 그러면 자극이 「근거 0건」이 아니라 **「계수와 목록이 어긋난다」**가 된다 — X-23 이 묻는 것과 다른 질문이다.
- 🔴 **WS 업그레이드는 손대지 않고 소켓째 넘긴다.** 콘솔의 run 스트림(`/api/ws/runs/{id}`)이 여기로 붙는다 — 막으면 X-23 을 칠 «화면 자체»가 안 서서 무대가 아니라 장애물이 된다. 주석으로 두지 않고 selftest 에서 실제로 울린다.
- 🔴 JSON 이 아닌 응답(SSE `text/event-stream`·바이너리)은 **버퍼링하지 않고 흘린다** — 버퍼링하는 순간 형태가 바뀐다.
- 🔴 **자기 생존 증인 실측(09-04 09:07)** — `SELFTEST PASS`
  - 상류(대조군) **`online:false` · 근거 [3, 1] · 계수 [3, 1]** → 게이트웨이 **`online:true` · 근거 [0, 0] · 계수 [0, 0]** (배열 2본·계수 2본 비움)
  - `paired` = `00:06:54.331Z` / `00:06:54.335Z` — 🔴 **두 사실이 «같은 실행»에 짝으로** 있다
  - WS 축 실측 — `HTTP/1.1 101 Switching Protocols` + 에코 수신 · `upgradesProxied` 1 · stagePort 56028
- 🔴 **반대 방향 대조군 2본**
  - `--passthrough` → `FAIL — servedOnlineTrue, everyEvidenceArrayEmpty, everyEvidenceCountZero, pairedInSameRun` · **exit 1**.
  - `--evidence-keys nosuchkey` → `FAIL — controlHadEvidence, …` · **exit 1**. 🔴 **비어 있던 것을 비운 초록**을 막는 축이다 — 상류가 근거를 «실제로 갖고 있었다»가 먼저 서야 「0 으로 만들었다」가 참이 된다.
- 🔴 **이 무대가 «못 하는 말»**: 「화면이 «모른다»로 갔는가」는 **화면이 답한다.** 이쪽은 online:true 를 냈고 근거가 0 이었다는 두 사실만 낸다.
- 🔴 **T7-32 — 무대는 «배열»만 비운다.** 카드 요약 문장(`confidenceNote` = 「정비 이력 1건 · 문서 인용 1건…」)은 **상류 원문**이라 그대로 남는다. 그래서 화면에 「근거 스트립 0」과 「카드 요약 1건」이 **동시에** 뜨는데, 그 어긋남은 **무대 인공물**이지 앞판의 결함이 아니다 — 문자열까지 바꾸면 무대가 「서버가 낼 문장」을 **추측**하게 되므로 바꾸지 않는다(오케 판정). **X-23 판정은 근거 스트립·카드 근거 «표기» 축으로만** 한다.
- 🔴 **T7-32 — 자극 경로는 run 의 «상태»가 정한다.** 끝난 run 의 화면 근거는 WS 가 아니라 **`GET /api/runs/<id>` 스냅샷**으로 온다(`snapshotRewritten`). 진행 중 run 은 WS/폴링 축(`--block-upgrade` · `pollingRewritten`). 🔴 `live` run 은 벡터 색인·그래프 투영이 없는 스택에서 `status:"failed"` · 근거 0 이라 **`mode:"replay"`** 로 쳐야 「비운 것」이 증거가 된다.
- 포트 **8814**.

## 포트

| 무대 | 포트 | 상태 |
|---|---|---|
| 끊는 프록시 | **8811** | ✅ 완성 · selftest PASS |
| 늦추는 프록시 | **8812** | ✅ 완성 · selftest PASS(실측 804 ms · 대조군 +789 ms) |
| 용량 거절 | **8813** | ✅ 완성 · selftest PASS(503 4 + 200 2 · peak 2/2) |
| 합성 게이트웨이 | **8814** | ✅ 완성 · selftest PASS(online:true + 근거 [0,0] · WS 101 통과) |

🔴 **`:8799`·`:8102`·`:8010` 은 검증·배포 것이다 — 쓰지 않는다.**
