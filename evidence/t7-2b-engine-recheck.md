# T7-2b 브라우저 호환 재측 — webkit·firefox (09-03 이후 변경분) (`t72b`)

| | |
|---|---|
| 판정 | **회부 1**(webkit 드로어 Tab) · 나머지 축 **엔진 델타 0** · **관측 1**(chromium 1회성 · 재현 0/3 → 결함 아님) |
| 무대 | 공개면 `https://factory-knowledge-twin.vercel.app` = main **`7fa6263`**(승격 17 · 배포 meta 로 확인 = `promo17ext`) · **live run 0 · cap 0** |
| 밖의 근거 | `remote_ip=64.29.17.3`(공인) · `Server: Vercel` · Tailscale 헤더 0 — 같은 세션의 승격 17 재검에서 자극 «전» 실측 |
| 엔진 | **chromium 151.0.7922.34 · webkit 26.5 · firefox 153.0** — 🔴 **셋을 같은 실행에 나란히** 돌렸다(chromium 값을 다른 창에서 가져오면 무대·시각이 달라 «엔진 델타»가 아니다) |
| 폭 | 390 · 768 · 1280 |
| 그물 | `t72b_engine_recheck.mjs`(신규) · `t72b_webkit_taborder_control.mjs`(주어 분리) · `t72b_tour_repeat_control.mjs`(재현률) |
| 측정 | 2026-09-05 14:00~14:06 KST |
| 검증자 | 리바이2 48대 |

---

## 1. 엔진 × 폭 표 (축 ①②③⑤ · 축 ④ 는 §3)

| 축 | 390 | 768 | 1280 | 3엔진 |
|---|---|---|---|---|
| ① 드로어 열림(`role=dialog`·`aria-modal`·링크 3) | 1·dialog·true·3 | — | — | **동일** |
| ① 닫힘 3갈래(Esc·스크림·링크) + 재개방 | 0·0·0 · 재개방 1 | — | — | **동일** |
| ② Incidents 착지 | `/incidents/INC-2025-019` | 〃 | 〃 | **동일 3/3** |
| ② 클릭 «전» 프리페치 / `307` | 0 / 0 | 0 / 0 | 0 / 0 | **동일**(D-82 처방이 3엔진 모두에서 산다) |
| ② 레일 링크 보임 / 토글 보임 | — / 보임 | 3 / false | 3 / false | **동일** |
| ③ 투어 걸음 0~2(말풍선·보임·진행점) | 1·true·9 ×3 | 〃 | 〃 | **동일**(예외 = §2 관측) |
| ⑤ 가로 넘침 | 0 | 0 | 0 | **동일** |
| ⑤ 콘솔 실오류(WS 제외분) | 0(0) | 0(0) | 0(0) | **동일** |
| ④(대체) 정적 재생본 배지·재생 라벨 | `data-mode=replay` · 「처음부터 재생」 · 총계 38 · `at-end=true` | | | **동일** |

🔴 **`LIVE` 배지 자체는 못 잤다** — 발주가 cap 0 이라 라이브 run 을 태우지 않았다. 정적 재생본의
`run-mode-badge`(replay)와 상태 줄 렌더로 **대체**했고, 그것이 「LIVE 배지가 3엔진에서 뜬다」를 말하지는 않는다.

## 2. 관측 1 — chromium/1280 1회성 (🔴 결함 아님 · 재현 0/3)

1차 판정에서 **chromium 1280 한 칸만** 걸음 1 에 `tour-target-missing` **1** · `intro-card` **0** 이 나왔다
(webkit·firefox 는 0/1). 🔴 **갈래표에 자리가 없는 모양이라 주어를 뒤집어 봤다 — 이상한 쪽은 chromium 이다.**
1회 관측을 결함으로 회부하지 않기 위해 **같은 엔진·같은 폭으로 3회 반복**했다:

| 열 | 걸음 0/1/2 `target-missing` | `intro-card` |
|---|---|---|
| chromium 1280 rep1·2·3 | **0 · 0 · 0**(3회 모두) | 1 |
| webkit 1280 rep1 | 0 · 0 · 0 | 1 |

→ **재현률 0/3.** 비결정(투어 대상이 아직 안 그려진 순간을 찍은 것으로 보인다)이며, **결함으로 회부하지 않는다.**

## 3. 회부 1 — webkit 드로어 초점 가둠 (D-83 후보)

| 엔진 | 390 드로어 열림 · Tab 10회 | 이탈 | 자취 |
|---|---|---|---|
| chromium | 열림 | **0** | `nav-incidents → nav-compare → nav-overview` **순환** |
| firefox | 열림 | **0** | 〃 |
| **webkit** | 열림 | **5** | **`body(밖) → nav-overview(안) → body → nav-overview …` 교대** |

🔴 **주어를 갈랐다**(`t72b_webkit_taborder_control.mjs` · 손잡이 = 드로어 열림 여부만):

| 열 | `body` 착지 | 자취 |
|---|---|---|
| webkit · 드로어 **닫힘** | **1** | `start-from-alarm → body → nav-menu-toggle → intro-reopen → reset-button → …` (정상 순회) |
| chromium · 드로어 **닫힘** | **1** | **webkit 닫힘 열과 같은 자취** |
| webkit · 드로어 **열림** | **5** | `body ↔ nav-overview` 교대 |

**그러므로 엔진의 탭 순서 탓이 아니다** — 닫힘 열에서 webkit 은 chromium 과 **같은 순서**로 링크·버튼을 탭한다.
이탈은 **드로어가 열렸을 때만** 난다. 관측된 사실 둘:

1. **매 두 번째 Tab 이 `body` 로 떨어진다**(가둠이 그 한 걸음을 못 잡는다).
2. 🔴 **초점이 언제나 첫 링크(`nav-overview`)로만 되돌아온다** — 즉 webkit 에서는 **드로어의 2·3번째
   링크에 Tab 으로 도달할 수 없다**. chromium·firefox 는 세 링크를 순환한다.

캡처 = `evidence/t72b/t72b-webkit-390-open.png`(비교용 chromium·firefox 캡처 동봉).

## 4. 못 잰 것 (이름으로)

- **실기기 Safari** — Playwright WebKit 은 엔진이지 Safari 앱이 아니다. macOS/iOS 실기기, VoiceOver, Safari 의
  「Tab 으로 각 항목 강조」 설정은 **에뮬레이션 밖**이다. 위 값은 **엔진 수준의 사실**이다.
- **Shift+Tab 축** — 이번 그물은 Tab 정방향만 10회 눌렀다(D-81 검증의 Shift 축은 chromium 에서만 실측됐다).
- **`LIVE` 배지** — cap 0(§1 각주).
- **`playwright.config.ts` 에 webkit·firefox 프로젝트 추가는 하지 않았다** — 그 설정은 `./e2e` 스위트를
  구동하고 `browserName: "chromium"` 한 벌을 전제로 서 있다. 프로젝트를 더하면 **CI 스위트가 조용히 3배가 되고
  그 초록의 뜻이 바뀐다**(새 축을 기존 allPass 에 섞지 않는다). 이번 측정은 엔진을 직접 import 하는
  독립 그물로 했고, 설정 변경이 필요하면 **별건 발주**로 받겠다.
