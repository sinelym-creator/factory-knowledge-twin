# T-TOUR-FIX 독립 검증 (PR #903)

- **검증 좌석** 리바이2 58대 · 발주 T-TOUR-V(오케 스자쿠 54대) · 상한 40분
- **대상** PR #903 `lane/senku2-tour-fix` head `d181de2` · base `develop` `f791fa5`
- **측정 모델** 아래 표는 **대상을 잰 값**이다. 러너가 죽어서 못 잰 칸은 `UNMEASURED` 로 따로 적었고, 그 사유가 내 도구인지 대상인지 칸마다 밝혔다.
- **무대** 같은 API(`:8020` build `3ac2508`) · 前 = `origin/develop` 트리 prod 빌드 `:8194` · 後 = PR 트리 prod 빌드 `:8195` · **손잡이는 코드 트리 하나**
- **뷰포트** 1440x900 · iPhone 13 에뮬 390x844
- production 3면 무접촉 · 구독 소모 0

## 판정 요약

| 축 | 판정 |
|---|---|
| 1 E-1~E-4 4행 표 前後 | **PASS** — 後 14행 중 FAIL 0, 前 동일 그물에서 **12 FAIL** |
| 2 tour e2e 7본 회귀 | **부분** — 3본 착지(회귀 0) · 4본 실행 중 |
| 3 preflight 가 D-87 이전 전제를 든다 | **확증(코드 축)** · 처방 적용은 **미착수** |
| 4 리셋 실패 갈래(키 보존) | **미측** |
| 5 변경 파일 스코프 | **PASS** — 7본 전부 `apps/web-console/**` |

## 1. E-1~E-4 — 같은 그물, 두 트리

`tests/web/_levi2_tour_4rows.mjs` 를 前後에 그대로 걸었다. 판정선은 **결과**다: 키가 0인가, 주소가 어디인가, 사각형이 화면 안인가. 「함수가 불렸다」는 세지 않는다.

### 後 (PR `d181de2` · `:8195`)

| E | view | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| E-1 | 1440 | before=1 after=0 | before>=1 after=0 | PASS |
| E-1 | 390 | before=1 after=0 | before>=1 after=0 | PASS |
| E-2 | 1440 | `/overview` -> `/incidents/INC-2026-014` step=6 | 조사 화면 착지 · step 불변 | PASS |
| E-2 | 390 | `/overview` -> `/incidents/INC-2026-014` step=6 | 같음 | PASS |
| E-2b | 1440·390 | gotoLabel=true | 「조사 화면으로 이동」 존재 | PASS |
| E-2c | 1440·390 | moved via **event** | control | **UNMEASURED**(아래 소견) |
| E-3 | 1440·390 | hadTour=true tourAfter=**null** nav 1->1 | 키 삭제 · 새로고침 0회 | PASS |
| E-3b | 1440·390 | beforeReset=true afterReset=false | 끊은 회차만 「처음부터」 | PASS |
| E-4 | 1440 | top=847 vh=900 | top>=0 | PASS |
| E-4 | 390 | top=507 vh=844 | top>=0 | PASS |

`rows=14 fail=0 unmeasured=2`

### 前 (`origin/develop` · `:8194` · 같은 파일·같은 인자)

| E | view | 실측 | 판정 |
|---|---|---|---|
| E-1 | 1440·390 | before=1 **after=1** | FAIL |
| E-2 | 1440·390 | `/overview` -> `/overview` step=6 | FAIL |
| E-2b | 1440·390 | gotoLabel=**false** | FAIL |
| E-2c | 1440·390 | moved via **neither** | FAIL |
| E-3 | 1440·390 | tourAfter=**`{"v":1,"status":"dismissed","step":0}`** | FAIL |
| E-3b | 1440·390 | beforeReset=false afterReset=**false** | FAIL |
| E-4 | 1440 | top=571 vh=900 | **PASS** |
| E-4 | 390 | top=507 vh=844 | **PASS** |

`rows=14 fail=12 unmeasured=0`

### 이 두 열이 말하는 것

- 처방이 **12칸을 뒤집었다**. 같은 그물·같은 API·같은 뷰포트에서 트리만 바꿨으므로 그 12칸의 주어는 이 PR 의 코드다.
- 🔴 **E-4 는 前後가 같다**(390 에서 top=507 로 **동일**). 이 축은 develop 에서 **이미 참**이었다 — 이 표에서 E-4 초록은 **처방에 대해 아무 말도 하지 않는다**. 발주의 「E-4 결과 기준」은 만족하지만 판정력은 없다.
- 前 열의 E-3 값이 결함을 문장으로 말한다: 리셋 뒤에도 투어 키가 `dismissed` 로 **남아 있었다**. 그래서 초대 카드가 계속 「보시던 곳부터 이어서 볼까요?」였다.

## 2. 소견(E3) — E-2 의 자극 귀속

E-2 의 자극을 두 단으로 갈라 쟀다.

1. 화면의 재개 컨트롤(앱바 「튜토리얼」 = `intro-reopen`) 클릭
2. 그것이 주소를 못 옮기면, 문서화된 열기 이벤트(`fkt:tour-open`)를 **직접** 발행

- 後: 1단으로는 **안 움직였고**, 2단(이벤트)에서 조사 화면으로 갔다 → `moved via event`.
- 前: 1단·2단 **둘 다 안 움직였다** → `moved via neither`.

⇒ **처방(열 때 그 걸음의 화면으로 민다)은 실제로 돈다**. 前後가 이벤트 경로에서 갈렸으므로 귀속은 섰다.
⇒ 다만 **「튜토리얼」 버튼 클릭이 그 이벤트를 이 상태에서 발행하는지는 이 표가 말하지 못한다**(前後 모두 미이동). 화면에서 사람이 누르는 경로가 실제로 재개를 일으키는지는 **별 축**이고, 여기서는 `UNMEASURED` 다. 회부한다.

## 2-1. E-2 사람 경로 — 갈랐다 (E1 · 추가 측정)

앞 절의 `moved via event` 를 오케가 되물었다: 「튜토리얼」로 **재개 카드까지 못 간 것**인가, **카드 클릭이 이동을 안 일으키는 것**인가. 둘 다 아니었다.

🔴 **진행 중인 투어로 `/overview` 에 오면 초대 카드가 아니라 콜아웃이 이미 떠 있다.** 앱바 「튜토리얼」은 재개 카드를 띄우는 경로가 아니다. 출구는 **콜아웃 위의 `tour-route-go`** 다. 내 앞 측정은 **엉뚱한 버튼을 누른 것**이었다(자수 6).

| 열 | 콜아웃의 testid | 누를 것 | 결과 |
|---|---|---|---|
| **後** 1440·390 | `tour-callout` `tour-title` **`tour-route-go`** `tour-progress` `tour-skip` `tour-next` | 「조사 화면으로 이동」 | **`/incidents/INC-2026-014` · step 6 불변** → **PASS** |
| **前** 1440·390 | `tour-callout` `tour-title` `tour-progress` `tour-skip` `tour-next` (**`tour-route-go` 부재**) | **없다** | `/overview` 그대로 · 사람 경로가 거기서 끝난다 |

⇒ 사람 경로는 **後에서 작동하고 前에는 그 출구 자체가 없다**. 「나머지 걸음에서는 출구가 없었다」는 처방의 문면이 前 열 그 줄과 정확히 맞는다. **FAIL 회부 대상이 아니다.**

그물 = `tests/web/tour_fix_e2_human.mjs`.

## 2-2. E-4 — 어느 경로가 그 화면인가 (소견)

구현 좌석의 값(390 에서 머리 −60 → 0)은 **재생본 주소로 직접 진입한** 경로에서 나왔고, 내 값(507, 前後 동일)은 **개요에서 투어를 시작해 한 걸음 걸은** 경로다. 운영자가 겪은 화면은 **재개로 조사 화면에 착지한 뒤의 걸음**이므로 **구현 좌석 경로 쪽**이다.

⇒ 내 E-4 는 **결함이 사는 걸음을 밟지 않았다**. 「前後 동일」의 이유가 그것이고, 그래서 그 칸은 판정력이 없다. 값이 틀린 게 아니라 **묻는 자리가 달랐다**.

## 3. preflight 가 D-87 이전 전제를 든다 (코드 축 확증)

- `tests/web/playwright.config.ts` 의 `globalSetup` 이 `./e2e/preflight.ts` 다.
- 그 preflight 는 깊은 검사로 `GET /openapi.json` 의 `paths` 수 하한 **10** 을 요구한다.
- `:8020/openapi.json` **실측 404**(D-87) → `pathCount = -1` → `throw` → `tests/web/e2e/**` 전량이 서지 못한다.
- ⇒ **무대 결함이 아니라 그물이 D-87 이전 전제를 들고 있는 것**이 맞다.
- 🔴 **축 2 와는 독립이다** — tour e2e 7본은 `tests/web/*tour*.mjs` 자체 러너이고 preflight 를 타지 않는다(`grep -l preflight` 0건).
- 대체 깊은 검사 후보를 실측해 두었다: `POST /api/sessions` → **200** + `fkt_sid` → 그 쿠키로 `GET /api/scenarios` → **200**(쿠키 없으면 **401** = 음성 대조군). 얕은 스텁이 흉내 낼 수 없는 깊이다.
- **처방 적용은 이 판정문 시점에 미착수**다(상한). 오케 승인(09-11)은 받았다.

## 4. 내 계측기 자수 (전부 내 손 · 대상 결함 아님)

측정에 이르기까지 내 그물을 다섯 번 고쳤다. 고치기 전의 빨강은 **전부 내 것**이었다.

1. **리셋 확인 모달을 안 눌렀다** — 리셋은 확인 창을 거치는데 버튼만 누르고 끝냈다. E-1 이 `after=1` 로 빨강이었고, 그것은 대상이 아니라 내 절차였다.
2. **주입한 상태의 모양이 정본과 달랐다** — `{status, step, seen}` 로 심었으나 정본은 `{v:1, status, step}` 다. 자극이 들어가지도 않은 채 「step=0」을 대상의 답으로 읽을 뻔했다.
3. **오버레이가 뜨면 앱바가 `inert` 다** — 투어 실행 중 리셋을 누르려 해 타임아웃. 화면에서 끊는 컨트롤은 `tour-later` 가 아니라 **`tour-skip`** 이었다.
4. **스포트라이트 셀렉터를 지어냈다** — `[data-tour-spotlight]` 로 찾아 「없다」고 적었다. 정본은 `[data-testid="tour-spotlight"]` 이고, 0번 걸음에는 대상이 없어 한 걸음 걸어야 나온다.
5. **E-3b 를 틀린 시점에 쟀다** — 「처음부터」는 **끊은 회차(리셋 전)**의 문면이다. 리셋 뒤에는 키가 없으니 첫 회 문면이 정상인데, 리셋 후에 재고 FAIL 로 회부할 뻔했다. 두 시점을 두 칸으로 갈라 고쳤다.

6. **재개 자극으로 엉뚱한 버튼을 눌렀다** — 진행 중인 투어에서는 초대 카드가 아니라 콜아웃이 떠 있고, 출구는 `tour-route-go` 다. 「튜토리얼」 클릭으로 「미이동」을 재고 자칫 **처방이 안 듣는다**고 회부할 뻔했다. 자극을 바꾸자 前後가 깨끗이 갈렸다.

## 5. 스코프 (E1)

변경 7본 전부 `apps/web-console/**` — `apps/**` 안이다.

`components/overview/intro-seen.ts` · `components/overview/overview-body.tsx` · `components/reset-button.tsx` · `components/tour/tour-overlay.tsx` · `components/tour/tour-provider.tsx` · `components/tour/tour-reset.ts` · `components/tour/tour-steps.ts`

## 6. 미측 — 이름으로 남긴다

- **축 2 tour e2e 7본 회귀** — 진행 중. 착지분:
  - `t714_tour_target_cover` **rc 0** · `t72b_tour_repeat_control` **rc 0**
  - `d71_tour_reopen` **rc 1 · PASS 34 / FAIL 6** — 🔴 **前에서 같은 본을 돌려 대조를 세웠다: PASS 34 / FAIL 6 · 실패 줄까지 글자 그대로 동일**. ⇒ **이 PR 이 깬 것이 아니다**(회귀 0). 그 6칸은 그물 자신의 교정 칸(⑮ 「실패 회차 0/6」)과 새로고침 뒤 초대·콜아웃 0(⑯)이라 **별건**으로 회부한다.
  - 나머지 4본은 실행 중 — 끝나는 대로 얹는다.
- **축 3 처방 적용·실행** — 미착수. 교체 뒤 `tests/web/e2e/**` 가 실제로 서는지 1회 실행이 판정이라는 조건도 아직 충족하지 않았다.
- **축 4 리셋 실패 갈래(서버 실패 시 키 보존)** — 미측. 실패를 만들려면 리셋 API 를 실패로 돌려야 하는데, 그 자극을 세우지 못했다.
- **E-2c 화면 경로** — 「튜토리얼」 클릭이 열기 이벤트를 발행하는지. 前後 모두 미이동이라 이 표로는 가릴 수 없다.
