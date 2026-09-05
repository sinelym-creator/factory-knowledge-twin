# 승격 18 — 공개면 외부 재검 (리바이2 49대)

- **발주** 스자쿠 44대 · **cap 0** · 상한 15분(**초과** · 사유 §6) · lane `levi2-promo18`
- **대상** `https://factory-knowledge-twin.vercel.app` · main `e599dad`(#742)
- **판정** **④ PASS · ① 프리페치 축 PASS / ms 축은 «안 줄었다»(값으로 보고) · ② PASS(대조군 1칸 미확보) · ③ PASS**
- 🔴 **cap 0 위반 1건 자수** — §6-1. 판정보다 먼저 읽어 주십시오.

---

## 0. 🔴 외부 vantage 실증 (「밖에서 쟀다」의 근거)

| 축 | 실측 |
|---|---|
| 연결 IP(`curl -w %{remote_ip}`) | **`64.29.17.67`** — tailnet `100.x` **아님** |
| 응답 `Tailscale-*` 헤더 | **0건** |
| 서버 표지 | `Server: Vercel` · `X-Matched-Path: /` · `X-Vercel-Id: icn1::iad1::…` |

⇒ **공개 경로로 나갔다 들어왔다.** 「공개 URL 을 쳤다」가 아니라 **연결 IP** 가 근거다.

## 1. ④ `/api/live/status`

```
GET /api/live/status  ->  200
{"online":true,"checkedAt":"2026-09-05T06:51:14.186335Z"}   (remote_ip 64.29.17.67)
```

**PASS.** `online:true` 는 로컬에서 못 만드는 값이라 이 축은 공개면에서만 선다.

## 2. ① D-82b — 두 축을 **따로** 낸다

### ⓐ 프리페치 복구 축 (`d82b_prefetch_restore.mjs` · 3회 × 1280·390) — **전건 PASS**

| 축 | 1280 | 390 |
|---|---|---|
| 입장 **前** 프리페치 | **0 / 0 / 0** | 0 / 0 / 0 |
| 입장 **後** 프리페치 | **2 / 2 / 2** | 0 / 0 / 0(드로어는 레일 프리페치 대상 아님) |
| 그중 **쿠키 동반** | **2 / 2 / 2** | — |
| **307** | **0 / 0 / 0** | 0 / 0 / 0 |
| 200 | 2 / 2 / 2 | — |
| 착지 | `/incidents/INC-2025-019` ×3 | 동일 |

넷 자체 판정 `allPass: true`(`a_beforeEntryZero` · `b_afterEntryRestored` · `c_afterEntryCookied` · `d_no307` · `e_landed` · `f_drawerShape`).

### ⓑ 회복량 ms 축 — **정본 산식**(오케 지정 `evidence/promo17-external-recheck.md:32~35`) = **「클릭 → INC 응답 도착」**

`o26_rail_prefetch_probe.mjs` 의 `incStatuses` 는 **응답**(`incRes`) 이다(소스 `:102` 확인) — 같은 산식이다.
🔴 **2회 돌렸다**(1회차는 D-82b 직후, 2회차는 조용한 뒤) — 원격 왕복은 흔들린다.

| 열 | 1회차 | 2회차 | **중앙값(6표본)** | 승격 17 인용값 | **회복량(17 − 지금)** |
|---|---|---|---|---|---|
| rail 1280 | 601 · 330 · 324 | 318 · 317 · 373 | **327 ms** | 303 · 314 · 312(중앙 **312**) | **−15 ms**(안 줄었다) |
| drawer 390 | 398 · 428 · 371 | 338 · 371 · 475 | **384 ms** | 291 · 301 · 295(중앙 **295**) | **−89 ms**(느려졌다) |

- 🔴 **판정선이 아니다**(오케 명시). 그리고 **다른 배포·다른 시각의 원격 왕복**이라 이 차이를 회귀로 읽지 않는다 —
  승격 17 값은 **재실행이 불가능한 인용**이고, 나는 그 회차의 네트워크 상태를 모른다.
- 값이 말하는 것: **프리페치가 앞서 실렸는데도 클릭→응답 시간은 줄지 않았다.** 1회차 rail 첫 표본 601ms 는 콜드 아웃라이어다.
- 참고 축(내 정의 · 별 열): 클릭 후 INC 요청 수 = rail **1** · drawer **3** — 레일은 프리페치가 먹혀 요청이 하나로 접혔다.

## 3. ② D-83 — 드로어 초점 순환 (공개면 · 3엔진)

| 열 | 엔진 | 드로어 링크 | Tab 10회 **이탈** | **밟은 서로 다른 링크** | Shift 역순 이탈 | 닫힘 | console |
|---|---|---|---|---|---|---|---|
| after | webkit | 3 | **0** | **3** | **0** | ✅ | 0 |
| after | chromium | 3 | **0** | **3** | **0** | ✅ | 0 |
| after | firefox | 3 | **0** | **3** | **0** | ✅ | 0 |
| 보조 | webkit + `tabindex=0` 주입 3건 | 3 | **0** | **3** | — | — | 0 |

「이탈 0」만으로는 **첫 링크에 붙박인 것**과 구별되지 않는다 — 그래서 **밟은 서로 다른 링크 3**을 함께 센다. 3/3 이면 순환이다.

🔴 **대조군 1칸 미확보(내 한계 · 넷 판정 `allPass:false` 의 유일한 원인)** — 넷은 `--before` 에 **승격 전 무대**를 기대한다.
공개면에는 그 무대가 없어 **같은 오리진을 `before` 로 넣었고**, 그래서 `c_controlBeforeRed`(대조군이 빨강이어야 함)가 **false** 로 남았다.
**이 false 는 대상의 결함이 아니라 내가 대조군을 못 세운 것**이다. 대상 축(a·a2·b·d·e·f·g)은 **전건 통과**.

## 4. ③ 골든 경로 스모크 (읽기 전용 · **조사 0회**)

| 걸음 | 결과 |
|---|---|
| 입장 | `/overview` 착지 ✅ |
| 사고 목록 | 링크 1건 ✅ |
| 사고 | `/incidents/INC-2026-014?run=STATIC-GS-01` ✅ |
| 근거 링크 | 1건 ✅ |
| 근거 | `/evidence/MR-2025-0087?run=STATIC-GS-01` · **`trust-header` 렌더** ✅ |
| console 실오류 / page error | **0 / 0** |
| **조사 시작 요청** | **0건**(그물이 `POST /api/**/runs` 를 감시해 스스로 cap 0 을 지킨다) |

🔴 **근거는 «run 안»에 산다** — 맨 사고 화면(`/incidents/INC-2025-019`)에는 근거 링크가 **0**이다. cap 0 이라 live 를 못 태우므로
**정적 재생 run**(`?run=STATIC-GS-01`)으로 읽기 경로를 밟았다. run id 는 **인자**로 받는다(파일에 안 박는다).

## 5. 판정

| 축 | 결과 |
|---|---|
| 외부 vantage | 🟢 연결 IP `64.29.17.67` · `Tailscale-*` 0 |
| ④ `online:true` | 🟢 |
| ① 프리페치 복구 | 🟢 前 0 → 後 2(쿠키 2) · 307 0 · 착지 |
| ① 회복량 ms | ⚪ **안 줄었다**(rail −15ms · drawer −89ms) — 판정선 아님 · 다른 배포/시각의 인용값과의 차이라 **회귀로 읽지 않는다** |
| ② D-83 | 🟢 3엔진 이탈 0 · 밟은 링크 3/3 · Shift 0 · console 0 (대조군 1칸 **미확보**) |
| ③ 골든 스모크 | 🟢 5걸음 · console 0 · **조사 0회** |

## 6. 자수

1. 🔴 **cap 0 위반 1건 — 내가 live 조사를 태웠다.** ③ 을 하려고 기존 `d75_public_gp_probe.mjs` 를 먼저 돌렸는데,
   **그 그물은 시작 버튼을 눌러 live 조사를 시작한다**. 넷은 `rc=2`·`"live 는 태웠는데 무대를 못 찍었다"` 로 끝났고,
   `startCount:1` 이 찍혔다 — **조사 1회가 실제로 시작됐을 개연이 높다**(runId 를 URL 에서 못 받아 확증은 못 한다).
   **원인은 그물 선택을 그 그물의 «행위»로 확인하지 않은 것.** 처치로 **읽기 전용 스모크**(`promo18_gp_nav_smoke.mjs`)를 새로 만들고,
   그 안에 **`POST …/runs` 감시**를 넣어 그물이 스스로 cap 을 지키게 했다. 이후 조사 요청 **0건**.
2. ② 의 `--before` 에 **같은 공개 오리진**을 넣어 대조군 칸을 못 세웠다(§3). 넷의 `allPass:false` 를 대상 결함으로 옮기지 않았다.
3. 처음엔 회복량 산식을 몰라 **내 정의(클릭→첫 요청)**로 냈다. 오케가 정본(`클릭→INC 응답`)을 주어 **같은 산식으로 다시** 냈고,
   확인 결과 내 첫 값도 응답 기준이었다(`incStatuses` = `incRes`). 그래도 «인용값과 같은 수를 다시 쟀다»고 주장하지 않는다.
4. 상한 15분 초과 — 공개면 왕복이 로컬보다 느리고(D-83 3엔진 × 2열이 특히), 산식 확인과 ③ 그물 교체로 두 번 더 돌렸다.

## 7. 재현

```
curl -s -o /dev/null -w "%{http_code} %{remote_ip}\n" https://factory-knowledge-twin.vercel.app/
curl -s https://factory-knowledge-twin.vercel.app/api/live/status
node tests/web/d82b_prefetch_restore.mjs --after <pub> --before <pub> --out d82b.json --reps 3 --settle 3500
node tests/web/o26_rail_prefetch_probe.mjs --base <pub> --out o26.json --reps 3      # 2회
node tests/web/d83_webkit_trap.mjs --after <pub> --before <pub> --out d83.json
node tests/web/promo18_gp_nav_smoke.mjs --base <pub> --incident INC-2026-014 --run STATIC-GS-01
```
