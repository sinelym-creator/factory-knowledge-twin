# 승격 10회차 외부 재검 + 라이브 재검증 + 둘러보기 — 판정문 (리바이2 43대)

- **대상** = main `0c2bc38` · 공개면 `https://factory-knowledge-twin.vercel.app`
- **판정선** = 계약 `packages/contracts/rest-api-v0.1.md` **v0.1.15 append 항목 1·2·3** · 투어 규격 `docs/design/t6-5-guided-tour-spec.md` §⑧-7·§⑧-8
- **측정 시각** = 2026-09-04 16:52~17:08 KST · **근거 등급 = E1(실측)** 로 표시된 것만 값이다
- 산출 원문 = `evidence/promo10/*.json` · 스크린샷 = `evidence/promo10/*.png`

## 0. 배포 귀속 — 「어느 커밋이 저기서 도는가」

| 축 | 증인 | 값 |
|---|---|---|
| 셸 | Vercel 배포 메타(API) | alias `factory-knowledge-twin.vercel.app` → `dpl_4yhFfW5PZhy8UBgtM1QwBUMLc3tb` · `githubCommitSha=0c2bc38d0e0f3c3f8c7c73913da617cd5f178cac` · ref `main` · READY · production · region iad1 |
| 밖인가 | 연결 IP | **`216.198.79.3`**(공인 · tailnet self 아님) · `Server: Vercel` · 3엔드포인트 전부 |
| **상류 ai-api** | `/api/health` 자기신고 | **`build: 7956e0c`** — `0c2bc38` 이 **아니다** |

🔴 **「셸이 0c2bc38」과 「상류도 0c2bc38」은 다른 사실이다.** 이 재검의 가장 큰 값이 이 한 칸에서 나왔다.

## 1. 축별 판정

| 축 | 판정 | 증인 | 빨강 확인(대조군) |
|---|---|---|---|
| ⓐ 외부 vantage | **PASS** | `/`·`/api/health`·`/api/live/status` 전부 **200** · remote_ip `216.198.79.3` · 콘솔 오류 0(랜딩) · 번들 11본 521,957B | 연결 IP 사설이면 그 회차 폐기(그물 내장) — 이번엔 전부 공인 |
| ⓑ Live 예행 **1회** | **PASS**(완주) | run `RUN-aa89c25cf59a` · 시작 07:57:52Z · **완주 11.5s** · 상태 「완료」 · 이벤트 **38건 / 7종**(`run.started`1·`plan.updated`1·`step.started`5·`step.evidence`19·`step.progress`6·`step.completed`5·`run.completed`1) · 후보 5행 · 근거 카드 24 · 진행 5/5 · 합성 문면 실재(모델 `claude-opus-5`) | 「완주」를 **상태값이 아니라 단계별 산출 건수**로 셌다(0건 단계 없음) |
| ⓒ REPLAY 완주 | **PASS** | 커서 `38/38` → 되감기 `0/38` → **`38/38` 9.0s** · 구독 추가 사용 **0** | 되감기가 0으로 안 갔으면 그 열은 무효 — 실제로 0/38 을 찍었다 |
| **계약 v0.1.15 (항목 1·2·3)** | 🔴 **판정 보류 — 대상이 안 올라 있음**(FAIL 아님) | 아래 §2 | — |
| ⓓ 둘러보기 | **PASS** | 아래 §3 | 대조군 2열 전부 울림 |
| ⓔ D-53 로컬 대조 | **재현 안 됨**(한정 있음) | 아래 §4 | 대조군이 갈랐다(`discriminates:true`) |

## 2. 계약 v0.1.15 — 공개면에서 «관측되지 않는다» · 원인 = 상류 미갱신 (→ D-57)

**관측(E1)**

| 계약 항목 | 요구 | 공개면 실측 |
|---|---|---|
| ① `GET /live/status?sessionId=` → `runCap` 블록 | `{limit,used,remaining,windowSec,nextFreeInSec}` 추가 | `{"online":true,"checkedAt":…}` **뿐** (sessionId 2종으로 시도 · `runCap` 없음) |
| ② `POST /scenarios/{id}/runs` (live) **200** + 헤더 3종 | `X-FKT-Run-Cap-Limit/Used/Remaining` | **200 ✅** · 헤더 **0개** (`/api/scenarios/GS-01/runs` 응답 전수 파싱) |
| ③ 화면 `data-runcap-*` | 배지 곁 「조사 used/limit · 남은 remaining회」 | 스냅샷 **4회**(진입 전 / 클릭 직전 / live 완주 뒤 / replay 뒤) 전부 `found:false` · 배지는 내내 `◉LIVE` |

**귀속 — 내 계측기도, 셸도 아니다**

1. `git grep X-FKT-Run-Cap-Limit` — **`0c2bc38` 있음**(`services/ai-api/app/routers/investigations.py`) · **`7956e0c` 없음**. `7956e0c` 는 `0c2bc38` 의 **조상**(PR#462).
2. 셸 프록시 **결백** — `apps/web-console/lib/contract.ts:901` 이 `apiBase() + url.pathname + url.search` 로 **쿼리를 그대로 넘기고**, 응답 헤더 허용목록(:930~936)에 `x-fkt-run-cap-limit`·`-used`·`-remaining` **3칸이 이미 있다**.
3. 오케 교차 실측(17:03) — 배포 컨테이너 이미지 = `fkt-deploy-ai-api:**7956e0c**`(`docker inspect`).

⇒ 🔴 **충분 원인 = 게이트웨이 뒤 ai-api 가 T7-38 이전 빌드로 떠 있다.** 셸만 승격되고 상류가 안 따라왔다.
⇒ **이 축은 「구현 FAIL」이 아니라 「대상이 공개면에 안 올라 있음 · 판정 보류」다.** 상류를 `0c2bc38` 로 재기동한 «뒤에» 다시 잰다(ⓑ Live 1발은 그때 쓴다).

🔴 **내가 못 가른 것(안 잼)** — 상류가 낡았다는 사실이 **충분 원인**이라, 「프록시가 헤더를 실제로 옮기는가」는 이번 회차에서 **시험되지 않았다**(허용목록에 이름이 있다 = 코드 문면일 뿐 거동이 아니다). 상류 갱신 뒤 그 축이 처음 시험된다.

**부수 관측(D-53 행에 붙일 값)** — live 클릭 직전 `/api/live/status` 가 **`online:false`** 를 한 번 냈다(07:57:55.185Z). 앞(07:57:47.560Z)·뒤(07:58:04.721Z)는 `true`. 🔴 **그 순간에도 배지는 `◉LIVE` 였다** — 「상태가 false 를 냈는데 화면이 LIVE 를 유지했다」는 D-53 의 후보 기전이다(확정 아님 · 표본 1).

## 3. ⓓ 둘러보기 — 공개면 전 걸음

**걸음 전수 · 표적 실재 · 말풍선 자리** (`t714_tour_target_cover.mjs` · 1440×900 · `d-tour-cover.json`)

- 초대 카드 **실재**(눌러서 열었다) · 배지 `◉LIVE` · **6걸음 전수 도달**(stepsReached 6)
- **표적 실재 5/5**(step2~6: `alarm-card`·`start-from-alarm`·`run-timeline`·`candidates`·`candidate` 전부 found) · step1(`headline`)은 규격상 **표적 없는 걸음**
- 🔴 **말풍선이 «지목한 대상»을 덮은 걸음 = 0** (`overlapTargetPx=0` · ratio 0 · 전 걸음) — §⑧-8 경성 조건 **유지**
- **곁에 섰는가** = 대상과의 실제 거리 **20~28.3px**(전 걸음) — 「안 덮지만 1,000px 떨어진 자리」 아님
- 자기 신고 `data-tour-clear=yes` 전 걸음 · `fixMarker present=true`
- 덮은 글자 총 478자(대상 «밖» · 페이지 전체 기준)

**대조군(같은 실행 · 둘 다 울림 = 계측기 생존)**
- 글자 스캐너 — 말풍선 한가운데 17자 심음 → 74→91 · **delta 17 = 심은 수** ✅
- 기하 스캐너 — 알려진 교차 4000px² → **got 4000** ✅

**닫기 → 재개 index 보존** (`t65_resume_drill.mjs` · `d-tour-resume.json`)
- 표적 열 **3회 전부 `index-preserved`** · 재개 지점 = step **5**(`evidence` · 「6/9」) · 저장값 `{"v":1,"status":"running","step":5}`
- 새로고침 열도 `index-preserved`
- 🔴 **대조군 판정력 있음** — 저장 진행을 0 으로 되돌린 열에서 그물이 `controlResumeIndex:0` 을 집었다(`controlDiscriminates:true`). 대조군이 안 울었다면 위 초록은 무효였다.

🔴 **안 잼(0 이 아니다)** — ① 「조사 보기」 걸음의 **녹화 재생 화면 이동**(step5 는 `hasAwaitClick:1`·`hasGoto:0` — 사람이 눌러야 넘어가는 걸음이라 자동 진행 밖) ② **투어 OFF 화면 대조** ③ 7~9걸음 ④ Tab/클릭 비용 계수(§⑧-7 규칙 2) — 이번 회차 그물이 재지 않았다.

**§⑧-7 규칙 3 · 자기 신고(고정 항목)** — *이 측정이 사람보다 유리한 점*: 표적 `data-testid` 를 **미리 알고 들어가** 사람처럼 눈으로 찾을 필요가 없고 픽셀 단위로 잰다. 🔴 그래서 이 초록은 **「닿는다」의 초록이지 「안내받는다」의 초록이 아니다** — 발견가능성은 이 그물이 못 잰다.

## 4. ⓔ D-53 로컬 대조 — 「상류가 죽었을 때 첫 페인트」

**자극 실재** — 목적지 `:8108` **연결 실패**(`fetch failed`)를 먼저 값으로 찍었다. 살아 있었으면 `exit 2`(빨강 아님).

| 열 | 무대 | SSR `data-mode` | 브라우저 전이 열 | everLive |
|---|---|---|---|---|
| **dead**(자극) | 로컬 셸 `:8109`(BUILD_ID `EoAyCLrQg40cDVCDZkz9v`) · 목적지 `:8108` **죽음** | `checking` | 98ms `checking`(◌확인 중) → **206ms `unavailable`(◌미연결)** | **false** |
| **alive**(대조군) | 공개면 `0c2bc38` | `checking` | 81ms `checking` → **1302ms `live`(◉LIVE)** | true |

- `discriminates: true` — 두 열이 갈렸다. **이 계측기는 판정력이 있다.**
- ⇒ 🔴 **「PC 오프인데 처음 «라이브»」는 이 무대에서 재현되지 않았다.** 첫 페인트는 **SSR 부터 `checking`** 이고, LIVE 는 **한 번도** 나오지 않았다.

🔴 **한정(이 결론이 못 덮는 것)**
1. **빌드가 다르다** — dead 열 셸은 `56d2af3`(T7-38 무대) · 폐하 관측은 공개면 `0c2bc38`. 같은 코드라는 확인을 **안 했다**.
2. 🔴 **실패 «모양»이 다르다** — 내 무대는 「셸은 살고 ai-api 만 죽음」이고, 「PC 오프」는 **게이트웨이(`:8787`) 자체가 죽는** 모양이다(프록시 타임아웃 대 즉시 거절). **다른 자극이다.**
3. 표본 1회 · 1440×900 · chromium · 캐시 없는 새 컨텍스트.
⇒ **「재현 안 됨」을 「D-53 없음」으로 읽지 말 것.** §2 의 부수 관측(`online:false` 인데 배지 LIVE)이 더 유망한 갈래다.

## 5. 내 계측기 자수

1. `document.cookie` 로 `fkt_sid` 를 못 읽었다(`sid:null`) — **HttpOnly** 로 보인다. 그래서 「브라우저 세션의 `?sessionId=`」 축은 **내 그물이 못 잰 것**이지 대상의 결함이 아니다. 대신 임의 sessionId 2종을 밖에서 찔러 §2 ①을 세웠다.
2. 인계받은 무대(`:8103`·`:8106`~`:8109`·`:8812`)는 기동 시점에 **전부 죽어 있었다**(포트 실측 0/6). 「살아 있는 채로 인계」는 **전언**이었고, 그대로 믿었으면 ⓔ 는 죽은 포트에 대고 색을 냈을 것이다.
3. ⓔ 무대를 **새로 굽지 않고** 기존 `.next`(`t738stage`)를 `next start` 로 되살려 썼다 — 빠른 대신 **빌드가 대상과 다른** 한정을 스스로 만들었다(§4 한정 1).
4. 콘솔 오류 — run 화면에서 `wss://…/api/ws/runs/{id}` **404 5건**. Vercel 이 WS 를 안 받는 구조라 폴링으로 완주했다(wsFrames 0). **기지 조건으로 보이나 확인 안 했다** — 「콘솔 오류 0」은 **랜딩 축에서만** 참이다.
5. 랜딩에서 `/overview`·`/compare` 프리페치 `net::ERR_ABORTED` 5건 — 내 그물이 화면을 넘기며 취소시킨 것으로 보이나 **가르지 않았다**.

## 6. 남은 일 (오케 판단 영역)

1. **D-57** — `:8010` ai-api 를 `0c2bc38` 로 재생성한 «뒤» **계약 v0.1.15 공개면 축 재검**(Live 1발 = 그때).
2. ⓓ 안 잼 4종(§3) · ⓔ 한정 2종(§4) 은 다음 회차 발주 후보.

---

## 7. 추가 실측 (17:08 · D-55 대기 중 무대 선구축에서 얻음) — 「보류」의 주어를 확정한다

§2 는 **공개면에서 관측되지 않는다**까지만 말할 수 있었다. 그 다음 물음 —
🔴 **「상류가 낡아서 안 보이는 것인가, 구현 자체가 못 하는 것인가」** — 는 §2 에서 **안 잼**이었다.

**무대** — `0c2bc38` 트리(내 lane 워크트리 · 앱 코드 diff 0)에서 ai-api 를 **로컬 `:8118`** 로 직접 띄웠다.
자기신고 `build: 0c2bc38-levi2-43`(내가 준 태그) · `postgres ok` · `neo4j ok` · 임베딩 ready.
DB = `fkt-levi2-postgres-1`(:5534) · `fkt-levi2-neo4j-1`(:7587) — `docker start` 후 **healthy 수신까지 확인**하고 썼다.

**계약 v0.1.15 항목 ① — `GET /live/status` 의 `runCap`** (E1 · peek 이라 구독 사용 0)

| 열 | 요청 | 응답 |
|---|---|---|
| **대조군** | `/api/live/status` (sessionId 없음) | `{"online":false,"checkedAt":"…"}` — **v0.1.2 형상 그대로** ✅ |
| **자극** | `/api/live/status?sessionId=probe-43` | `…,"runCap":{"limit":10,"used":0,"remaining":10,"windowSec":3600,"nextFreeInSec":null}` — **5칸 전부 계약대로** ✅ |
| **peek 검사** | 같은 sessionId 재조회 | `used:0` **유지** ⇒ 🔴 **읽기가 계수하지 않는다**(계약 「`peek` · `admit` 아님」 조항 충족) ✅ |

⇒ 🔴 **항목 ① 의 구현은 `0c2bc38` 에서 «참»이다.** 공개면 미관측의 원인은 **오직 배포 갭(D-57)** 이며,
   **구현 결함 가능성은 배제된다.** §1 표의 「판정 보류」는 이제 **「구현 참 · 공개면 미탑재」** 로 좁혀진다.

**여전히 안 잼(0 이 아니다)**
- 항목 ② (`POST /runs` 200 + 헤더 3종) · 항목 ③ (화면 `data-runcap-*`) 은 **live 실행이 필요**해 여기서 재지 않았다 —
  구독 예산은 이번 회차에 **1발만** 쓰기로 했고 그 1발은 §1 ⓑ 에 썼다. 상류 재생성 뒤 공개면에서 잰다.
- 🔴 **셸 프록시가 그 헤더를 실제로 옮기는가** 는 이 열에서도 시험되지 않았다(셸을 안 거쳤다).
- `online:false` 는 내 로컬 무대에 라이브 게이트웨이가 없어서다 — **대상의 답이 아니다**(무대 조건).

**자수 6** — 이 ai-api 는 **오케 전용 메인 체크아웃의 venv 인터프리터**로 띄웠다(내 워크트리에 venv 가 없다).
코드는 내 트리(`0c2bc38`)를 읽지만 **site-packages 는 메인 트리 것**이다. 의존성 판별이 걸리는 축이라면 이 열은 못 쓴다.
