# T7-38 독립 검증 — 세션 단위 조사 실행 상한

> 리바이2 42대 · 2026-09-04 16:07~16:15 KST · 대상 = **`lane/senku2-t7-38` `56d2af3`(미병합)** ·
> 판정문 기준 = **정정 «후» 계약 v0.1.15 append 1·2·3** · 발주 = 스자쿠 36대 16:06.

## 0. 무대와 귀속

| | |
|---|---|
| 자극 열 ai-api | `:8108` — `56d2af3` 워크트리에서 기동 · `FKT_RUN_CAP_PER_SESSION=2` · `FKT_RUN_CAP_WINDOW_SEC=60` |
| 자극 열 셸 | `:8109` — 같은 트리 prod 빌드(`BUILD_ID EoAyCLrQg40cDVCDZkz9v` · 목적지 `:8108` 로 구움) |
| 대조군 ai-api | `:8103` — 처방 «없는» 빌드 |
| 대조군 셸 | `:8106` — `452de78` 빌드 |

**sha 역확인(산출물 심볼 · 양방향)** — 인계 sha 는 전언이므로 빌드 산출물에서 직접 떴다:

| 심볼 | 자극 열(`:8109` 빌드) | 🔴 대조군(`:8106` 빌드) |
|---|---|---|
| `data-runcap-limit` | **2 파일** | **0** |
| `data-runcap-used` | **2 파일** | — |
| `data-runcap-remaining` | **2 파일** | — |
| `X-FKT-Run-Cap-Limit` | (서버측) | **0** |

⇒ 자극 열은 처방을 실었고 **대조군은 «안» 실었다**. 두 방향을 다 찍어야 대조군이 성립한다.

## 1. 판정선 — 「201」이 아니라 **200**

v0.1.15 초안 문면의 「201」은 발주자가 실물을 안 보고 쓴 값이다(오케 자수 14:45). 내가 직접 확인:
`investigations.py:160` 의 데코레이터에 **`status_code` 지정이 없고**, 그 파일에서 **`response.status_code`
대입이 0건**이다(있는 것은 `response.headers` 1건). ⇒ 200 은 «기본값»이 아니라 **구조적으로 확정**이다.
기본 계약 표(`rest-api-v0.1.md`)의 해당 행도 상태코드를 적지 않는다. **판정은 정정 후 문면에 댄다.**

## 2. 축별 — 「증인 / 실측 / 빨강 확인 ✓ / 안 잼」

그물 = `tests/api/t738_runcap_probe.mjs`(API) · `tests/web/t738_runcap_screen.mjs`(화면).

| 축 | 실측(자극 열) | 🔴 빨강 확인(대조군) |
|---|---|---|
| **생성 응답 = 200** | **200** | :8103 도 200(이 축은 T7-38 신규가 아니다 — 판정력 없음, 명시) |
| **① 쿼리 없는 `/live/status` 불변** | 32B → 32B **동일**(`checkedAt` 제외) | 동일 |
| **② 새 세션 = 0/2** | 화면 `data-runcap-*` = **0/2 · remaining 2** | :8106 **손잡이 없음** → rc=1 ✓ |
| **③ live 1회 → 1/2 즉시** | 헤더 `used=1 remaining=1` · 화면 **1/2** · 문면 「조사 1/2 · 남은 1회」 | :8103 헤더 **없음** → rc=1 ✓ |
| **④ replay 는 계수 0** | replay 요청 뒤 `used` **불변** | — |
| **⑤ 2/2 → 3회째 429** | `used=2 remaining=0` → **429** · `code=session_run_cap_exceeded` · detail 4칸 **`limit=2 used=2 remaining=0 retryAfterSec=58`** · `Retry-After: 58` · 본문 = 헤더 **일치** | :8103 **429 안 남**(9축 빨강) ✓ |
| **⑤b 거절 중에도 replay** | replay **200** — 문면(「재생은 계속」)이 스스로 거짓말하지 않는다 | — |
| **⑥ 미연결 열은 계수 미표시** | `online:false` 상태에서 배지 **안 뜸**(자극 열·대조군 둘 다) | — |
| **⑦ 창 만료 회복** | 창 60s 만료 뒤 **200 · used=1**(슬라이딩) | — |
| **⑧ 재사용은 계수 0** | 비종결 재요청 → `X-FKT-Run-Reused: RUN-0dfbfadfbe16` · **`used` 1 → 1** | — |

**자극 열 rc=0(API 15축 · 화면 4축) · 대조군 rc=1(API 9축 빨강 · 화면 손잡이 없음).**
같은 그물에서 빨강이 실제로 났으므로 이 초록은 검출력 있는 초록이다.

### 🔴 ⑧ 의 판정선 — 「N번 눌렀다」 ≠ 「N건 계수됐다」

`investigations.py` 228~237: 같은 세션의 **비종결** live run 은 새로 만들지 않고 **재사용**되고,
그 분기는 **상한 검사보다 앞**에 있다(주석: 뒤에 두면 중복 요청이 상한과 Live 슬롯을 먼저 먹는다).
그래서 계수는 **호출 수가 아니라 `X-FKT-Run-Cap-Used` 헤더**로 읽고, 재사용 회차는
**`X-FKT-Run-Reused`** 로 갈라 세야 한다. 실측 = 재사용 회차 계수 **0** ✓.
셸 경유로는 이 헤더가 안 온다(**O-9**) → 축 ⑧ 은 **ai-api 직결로만** 쟀다.

## 3. 계측기 자수 (내 손 · 3건 전부 내 것 · 대상 결함 0)

1. **쿠키 없이 쏴서 전 축이 401 이었다.** 이 표면은 body 의 `sessionId` 만으로는
   `session_required` 이고 세션은 **`fkt_sid` 쿠키**로 확인한다. 첫 판의 13축 빨강은
   처방이 아니라 **내가 자격을 안 준 것**이다. 「허용 목록 있는 표면엔 대상이 «주는» 자격으로.」
2. **화면 배지가 «없다»를 결함으로 적을 뻔했다.** `RunCapCounter` 는 `mode !== "live"` 면
   `null` 을 돌려주는데(`live-status.tsx:250`) 내 무대엔 synthesis 게이트웨이가 없어
   `/api/live/status` 가 `online:false` 다 — **배지가 한 줄도 안 그려지는 것이 정상**이다.
   🔴 갈랐던 것: **자극 열과 대조군이 «똑같이» 빨강**이었다. 아무것도 못 가르는 빨강은
   대상의 것이 아니라 내 것이다. `/api/live/status` 를 가로채 `online:true` 한 칸만 참으로
   만들어(자극 증인 = 바꿔 준 응답 수 2건) 갈래를 강제하니 자극 열만 초록이 됐다.
3. **ai-api 를 DSN 없이 띄워 `degraded` 로 재고 있었다.** `settings.py` 는 env 파일을 안 읽고
   프로세스 env 만 본다(`env_prefix="FKT_"`). 커밋된 `docker-compose.yml` 의 로컬 기본값으로
   다시 띄워 `postgres ok · neo4j ok` 를 확인한 뒤에 쟀다(시크릿 파일은 읽지 않았다).

## 4. 안 잼 (이름과 함께)

- **상한 도달 «화면» 문면**(「상한 도달 · N분 뒤 1회 회복 · 재생은 계속」) — 코드(`live-status.tsx:258~260`)
  로는 확인했으나 **화면 실측은 안 했다**(세션을 2회 태우고 배지를 강제해야 서는 조합).
- **실제 live 조사 완주와의 상호작용** — 이번 축은 «시작 계수»만 봤다(구독 미사용).
- **`nextFreeInSec` 이 `null` 인 회차의 문면**(「N분 뒤」 절이 빠지는 갈래) · 다중 세션 LRU 축 ·
  `limit <= 0`(상한 끄기) 갈래 · 프로세스 재기동 시 리셋 성질.
- **O-9**(셸이 `X-FKT-Run-Reused` 를 전달하지 않는 프록시 허용 목록) — 이 티켓 밖.

## 5. 판정

**T7-38 = PASS.** 계약 v0.1.15 append 1·2·3(정정 후 문면)의 축을 자극 열이 전건 만족했고,
같은 그물이 대조군에서 빨강을 냈다. **대상 결함 0.**

## 6. 재현

```bash
# 무대
cd services/ai-api && FKT_RUN_CAP_PER_SESSION=2 FKT_RUN_CAP_WINDOW_SEC=60 \
  FKT_POSTGRES_DSN=postgresql://fkt:<compose 기본값>@127.0.0.1:5534/fkt \
  FKT_NEO4J_URI=bolt://127.0.0.1:7587 python -m uvicorn app.main:app --port 8108
cd apps/web-console && FKT_API_BASE=http://127.0.0.1:8108 pnpm build && \
  FKT_API_BASE=http://127.0.0.1:8108 pnpm exec next start -p 8109
# 그물
node tests/api/t738_runcap_probe.mjs  --api=http://127.0.0.1:8108 --limit=2   # PASS / :8103 이면 FAIL
node tests/web/t738_runcap_screen.mjs --shell=http://127.0.0.1:8109 --limit=2 # PASS / :8106 이면 FAIL
```
