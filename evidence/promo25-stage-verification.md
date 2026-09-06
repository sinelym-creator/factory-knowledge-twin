# 승격 25 근거 — develop 무대 독립 검증

- 좌석 = 리바이2 56대 · 발주 = 스자쿠 53대(2026-09-06 14:13) · lane `lane/levi2-stage25`
- 승격 25 내용 = O-48 표지·게이트웨이 적재·프롬프트(#876~#883) + O-54 CI(#869) · main `5f17b54` → develop **`48a70f1`**
- 무대 = **develop 전용**(`:8020` ai-api · `:8797` 게이트웨이) · 🔴 **production 3면(`:8010`·`:8787`·공개 도메인) 무접촉** · **구독 0**(모델 호출 0)
- 측정 모델: `claude-opus-5`(폴백 없음 · 나를 잰 값 — 이 검증은 합성 모델을 부르지 않는다)
- **결론 = 축 6 중 PASS 5 · 부분 1(③) · FAIL 0 · 측정 불가 1칸(③-b · 사유 명기)**

> 52대가 남긴 값(`2a5758c` · `1044cdab6c7b` · refresh 13:11:48)은 **전언**이다. 아래는 전부 내가 `date` 실측으로 다시 찍은 값이다.

---

## ① 귀속 — 이 서버가 승격 대상 build 인가 (창을 열기 «전» · `date 14:13:56`)

| 축 | 실측 | 전언(52대) | 일치 |
|---|---|---|---|
| `:8020 /api/health` `build` | **`2a5758c`** | `2a5758c` | ✔ |
| `docker inspect` `Config.Image` | **`fkt-ai-api:dev-2a5758c`** | — | ✔ |
| `.Id` | **`1044cdab6c7b7af0…`** | `1044cdab6c7b` | ✔ |
| `State.StartedAt` | **2026-09-06T04:11:48Z**(= 13:11:48 KST) | refresh 13:11:48 | ✔ |
| `State.Status` | `running` | — | — |

건강 상태 = `ok`(postgres ok 4ms · neo4j ok 10ms) · embedding `ready`.
🔴 **3축 일치**(health 자기 신고 · 이미지 태그 · 컨테이너 실체)이므로 아래 창은 **승격 대상 코드 위에서** 열렸다. 자기 신고 하나로 열지 않았다.

**단서**: 승격 대상 tip 은 `48a70f1` 인데 무대 build 는 `2a5758c` 다. 그 사이 커밋은 **문서 전용**(#887 마감 docs)이라 런타임 코드는 같다 — 그래도 「무대 = tip」은 **아니다**. 이 표의 초록은 `2a5758c` 의 것이다.

## ② 프롬프트 정본 대조 — **리터럴을 정답으로 박지 않았다** (`date 14:14:17`)

게이트웨이 `:8797 /health` → `promptSha256` = **`3560668716ab`** · `promptPath` = `_wt/develop-stage/…/system_prompt.txt`.
그 값을 정답으로 두지 않고 **파일에서 그 자리에서 다시 계산**했다:

| 대상 | bytes | sha256(앞 12) |
|---|---|---|
| 게이트웨이가 읽는 파일(`promptPath`) | 2,513 | **`3560668716ab`** |
| 내 lane 워크트리의 같은 파일 | 2,513 | **`3560668716ab`** |
| `git show origin/develop:…`(blob) | 2,480 | `3abedc3c8398` |

🔴 **세 번째 줄은 대상 결함이 아니라 내 계측기의 표현 차다.** git blob 은 **LF**, 작업 트리는 **CRLF**(33줄 × 1바이트 = 2,480 → 2,513). 그대로 「무대가 다른 프롬프트를 쓴다」고 적었으면 **없는 결함을 회부**할 뻔했다. 판정은 **게이트웨이가 실제로 읽는 파일 ↔ 같은 개행 규약의 체크아웃** 대조로 한다 → **일치 · PASS**.

**②-b (덤 · 처방 탑재)**: 서빙 중인 프롬프트 19행에 ⓐ-2 한 줄이 **실재**한다 — `An excerpt whose id is listed in \`evidenceFlags\` carries directive-like wording. It stays quotable …`

## ③ O-48 거동 — **부분**(탑재 E1 · 적재 측정 불가)

### ③-a 무대가 처방을 실었는가 = **PASS (E1)**

`docker exec fkt-dev-ai-api` 로 **컨테이너 안에서** 물었다(모델 호출 0):

```
grep -c 'flag_directive_like|evidenceFlags' …/app/investigation/live_synthesis.py   → 3
python -c "import app.investigation.live_synthesis as m; …"
   flag_directive_like  True
   flag_evidence_text   True
```

배포된 이미지가 표지 함수를 **실제로 담고 있고 import 된다**. 파일 존재만이 아니라 런타임 심볼로 확인했다.

### ③-b `evidenceFlags` 가 게이트웨이 «요청»에 실리는가 = 🔴 **측정 불가 · 사유 명기**

- replay run 이벤트 스트림 38건 전문에서 `evidenceFlags` **0** · `evidence.flagged` **0** · `flagged` **0**.
- 🔴 **그 0 은 「안 실린다」가 아니다.** ⓐ 두 갈래 중 요청 필드는 **live 합성 경로에서만** 조립되고, replay 는 게이트웨이를 부르지 않는다(구조적 면역). 이벤트 갈래(`evidence.flagged`)는 설계상 **이 PR 밖**(스키마 케이스 동반 후속)이다.
- 모델 호출 없이는 그 요청이 만들어지지 않으므로 **이 창에서는 잴 수 없다**. 코드 축의 근거는 **#878 독검**(내 손 · 대조군 7/7 · 음성 5 오검출 0 · 발췌 바이트 前後 동일)으로 **인용만** 한다 — 무대 축이 아니다.

## ④ replay 회귀 스모크 — **PASS** (`date 14:15:22`)

`POST /api/scenarios/GS-01/runs`(`mode:"replay"`) → `RUN-612f037d3968`

| 값 | 실측 |
|---|---|
| 이벤트 계수 | **38** |
| `seq` 연속 | **True**(0~37) |
| 타입 분포 | `run.started 1 · plan.updated 1 · step.started 5 · step.evidence 19 · step.completed 5 · step.progress 6 · run.completed 1` |
| 합 | **38** |

promo23 창의 38/38 과 **계수·분포까지 동일**. 승격 25 의 변경(표지·프롬프트)이 replay 축을 흔들지 않았다.

## ⑤ D-87 회귀 — **PASS** (`date 14:14:37`)

| 열 | 표면 | 실측 |
|---|---|---|
| A(막혀야 함) | `/api/docs` · `/api/redoc` · `/api/openapi.json` · `/docs` | **404 · 404 · 404 · 404** |
| **B(대조군 · 같은 실행)** | `/api/scenarios` | **401** |

🔴 **B 열이 이 표의 판정력이다** — B 가 없으면 「전부 404 를 내는 서버」도 A 열의 초록을 냈다. 401 이 돌아왔다 = 라우팅은 살아 있고 문서 표면만 닫혔다.

## ⑥ CI — **PASS** (develop tip `48a70f1`)

| run | 워크플로 | 결론 |
|---|---|---|
| 34013071556 | ci | **success** |
| 34013071593 | security | **success** |
| 34013071609 | benchmark-smoke | **success** |
| 34013071558 | release-evidence | **success** |

4/4 completed/success · 실패·미완 **0**.

---

## 결론

**승격 25 의 develop 무대 근거는 선다** — 귀속 3축 일치 · 프롬프트 정본 일치 · 배포본이 표지 함수를 실제로 담음 · replay 38/38 회귀 0 · D-87 양면 유지 · CI 4/4.
**미측 1칸**(③-b `evidenceFlags` 요청 적재)은 **구독을 태워야 재는 축**이라 이 창 밖이다. 승격 판단에 그 칸을 초록으로 세지 마라.

## 🔴 안 본 축 (이름으로)

1. **live 합성 전 경로** — 요청 적재·프롬프트 순종(④-1~④-4)은 O-48 ⓒ 집행(허가 대기).
2. **`evidence.flagged` 이벤트·화면 배지** — 설계상 후속 PR.
3. **production 3면** — 무접촉이 규율이라 아무 값도 안 잰다. 이 문서의 초록은 **develop 무대의 것**이다.
4. **무대 = tip 아님** — 무대 build `2a5758c` ≠ develop tip `48a70f1`(문서 전용 차이). 코드 동일성으로 추정할 뿐 tip 위에서 잰 것은 아니다.
5. **`--gate`·graphrag·Windows** — 회로 밖.

## 자수 (내 계측기)

1. `git show` 의 blob(LF)과 서빙 파일(CRLF)을 나란히 놓고 **sha 불일치**를 봤다. 바이트 수(2,480 vs 2,513)를 함께 찍지 않았으면 **없는 결함을 회부**할 뻔했다.
2. replay 첫 시도가 **401** 로 죽었다 — 내가 응답 헤더를 평범한 dict 로 바꿔 `Set-Cookie` 를 대문자로 찾았기 때문이다. **uvicorn 은 소문자**로 보낸다. 대상의 거절이 아니라 내 조회 방식이었다.
3. ③-b 의 0 을 「막았다」로 읽지 않았다 — 그 0 은 **자극이 그 층에 닿지 않는다**는 뜻이다. 이 구분을 안 하면 승격 근거에 가짜 초록이 한 칸 들어간다.
