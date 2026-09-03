# T7-4 — WCAG 2.5.8 Target Size (Minimum · AA) 판정기 + 현 형상 기준선

**판정: 🔴 **AA(2.5.8) 위반 0** — 인터랙티브 대상 65개 전건 통과(fine·coarse 두 열 모두). 오늘까지 팀이 인용해 온 「20 미달」은 **AAA(2.5.5 · 44px) 수**이지 AA 위반 수가 아니다.**

- 좌석: 리바이2 36대(검증) · 2026-09-03 · 근거 등급 **E1(실측)**
- 🔴 **기준선 sha = `5c7e9b5`**(= 측정 시점 develop tip · PR#500 병합분) · 무대 **`:3112`**

---

## 0. 🔴 판정선 = SC 원문 (2026-09-03 실독 · w3.org)

> **2.5.8 Target Size (Minimum) · Level AA**
> "The size of the target for pointer inputs is at least **24 by 24 CSS pixels**, except when:"
> - **Spacing:** "Undersized targets (those less than 24 by 24 CSS pixels) are positioned so that if a
>   **24 CSS pixel diameter circle is centered on the bounding box of each**, the circles **do not
>   intersect another target or the circle for another undersized target**"
> - **Equivalent** / **Inline** / **User agent control** / **Essential**

> **2.5.5 Target Size (Enhanced) · Level AAA** — 44×44 CSS px · **Spacing 예외 없음**

🔴 **기계가 판정하는 예외는 «Spacing» 하나뿐이다.** Equivalent·Inline·Essential·User-agent 는
의미 판단이라 기계가 못 정한다. 그래서 이 그물의 빨강은 **「AA 위반」이 아니라 「AA 위반 후보」**다
— 나머지 4예외로 면제될 수 있다. (이번 회차는 후보가 **0건**이라 그 구분이 결과를 안 바꿨다.)

🔴 **두 자를 섞지 마라.** 「44 미달 n건」은 **AAA 자**의 수다. AA 합격선은 24 이고, 24 미만이라도
**Spacing 예외**로 통과한다. 두 열을 한 줄에 적으면 표준을 못 지킨 것을 지킨 것처럼, 또는 그
반대로 읽게 된다.

## 1. 결과 — 3화면 · 인터랙티브 대상 65개

🔴 **아래 수치는 히트 스캔 결함을 고친 «2회차» 값이다.** 1회차 수치(AAA fine 10/65 · coarse 25/65)는
**철회했다** — 이유는 §3.

| pointer 열 | 실측 media | AA(2.5.8) 통과 | AA 위반 후보 | AAA(44) 통과 | 24 미만 |
|---|---|---|---|---|---|
| **fine** | `coarse=false · fine=true · any-hover=true` | **65/65** | **0** | **0/65** | 23 |
| **coarse** | `coarse=true · fine=false · any-hover=false` | **65/65** | **0** | **15/65** | 23 |

화면별 AAA 통과 (fine → coarse):

| 화면 | 대상 수 | 24 미만 | AAA fine | AAA coarse |
|---|---|---|---|---|
| `/overview` | 16 | 1 | 0 | **10** |
| `/incidents/INC-2026-014?run=STATIC-GS-01` | 41 | 20 | 0 | **4** |
| `/evidence/MR-2025-0087?run=STATIC-GS-01` | 8 | 2 | 0 | **1** |

- 🔴 **24 미만 대상 23개가 전부 Spacing 예외로 통과**한다 — 각 대상의 24px 원이 **다른 대상의
  경계 상자와도, 다른 미달 대상의 원과도 한 건도 교차하지 않는다.**
- 🔴 **coarse 조건부 처방이 실측으로 산다** — AAA 통과가 **0 → 15** 로 오른다. **fine 만 쟀으면
  이 처방에 대해 아무 말도 못 한다**(「닿지 않는 계측」).
- **fine 에서 AAA 0/65 는 결함이 아니라 설계**다 — `.fkt-hit::before` 확장은
  **`@media (pointer: coarse)` 안에만 있다.** 마우스 열에는 44 자를 맞출 장치가 **아예 없다.**

### 🔴 회부 답 — `fallback-banner` ✕ 는 모집단 «안»이고, AA 위반이 «아니다»

| 항목 | 값 |
|---|---|
| 모집단 포함 | ✅ 「배너 닫기」 — **배너가 실제로 떴다**(「닿지 않는 계측」 아님) |
| 히트 상자(fine) | **13×21** — **24 미만 맞다** |
| 24px 원의 교차 상대 | 🔴 **0건** — 중심에서 12px 안에 다른 대상도, 다른 미달 대상의 원도 없다 |
| 2.5.8 판정 | **Spacing 예외로 통과** |

⇒ 「24 미만」은 참이고 「**AA 위반**」은 거짓이다. **24 미만 = 위반**으로 읽으면 SC 가 둔 **다섯 예외**를
지운 것이 된다. (처방 자체는 **AAA 목표**라는 독립 근거로 서므로 되돌릴 이유가 없다 — 바뀌는 것은 문면이다.)

## 2. 대조군 — 같은 실행에서 **양방향**

| 대조군 | 심은 것 | 기대 | 실측(fine / coarse) |
|---|---|---|---|
| ① 위반 보장 | 12×12 버튼 2개 · 중심 간 18px | AA **위반** | **위반**(원 교차 파트너 1 / 2) |
| ② 통과 보장 | 60×60 버튼 1개 · 빈 자리 | AA·AAA **통과** | **통과** / **통과** |

한 방향만 검사하면 「전부 위반이라 답하는 자」도 「전부 통과라 답하는 자」도 초록을 낸다.
어긋나면 `exit 2`. **두 열 모두 통과** — 이 회차의 65/65 는 근거다.

## 3. 🔴 자수 ① — 나는 여기서 **두 번** 틀렸다. 두 번째는 내 «자수 자체»가 틀린 것이다.

**틀림 1 — 계측기 결함(실재).** 히트 스캔의 소유 판정에 `e === el.parentElement` 를 넣었다.
그래서 중심에서 밖으로 걸어 나가다 **부모 컨테이너에 닿는 순간 그 크기가 이 대상의 히트 상자로
둔갑**했다 — `fallback-banner` ✕ 가 **`39×36`** 으로 부풀었다(참값 **`13×21`**).
고침: `e === el || el.contains(e)` 만. 의사요소(`::before`)는 `elementFromPoint` 가 **요소 자신**을
돌려주므로 부모는 애초에 불필요했다.

**틀림 2 — 🔴 내 자수가 틀렸다.** 나는 1회차의 「AAA 0/65」를 **「경계 상자만 읽어서 생긴 거짓
빨강」이라고 자수했는데, 그 자수가 절반 틀렸다.**

```css
@media (pointer: coarse) {          /* 🔴 확장은 이 «안»에만 있다 */
  .fkt-hit::before { height: max(100%, 2.75rem); width: 100%; … }
}
```

**fine 열에는 히트 확장이 아예 없다.** 그러니 **fine 의 AAA 0/65 는 대상의 참값**이고,
내가 「내 결함」이라며 뒤집은 것이 오히려 오보였다. 결함이 있었던 것은 맞지만 **그 결함이 만든
것은 0/65 가 아니라 «부풀린 10/65·25/65»** 였다.

🔴 **교훈**: 자수도 검증 대상이다. 「내 계측기 탓」이라는 진단조차 **CSS 의 어느 줄이 언제 사는지**
확인하고 내야 한다 — 안 그러면 **참인 빨강을 내 손으로 지운다.**

**부작용의 방향**: 이 버그는 크기를 **부풀렸으므로 위반을 «숨기는»** 쪽이었다. 그런데 고쳐서
상자가 작아진 뒤에도 **AA 위반은 여전히 0** 이다 — 그래서 **AA 결론은 이 버그와 무관하게 선다.**
바뀐 것은 **AAA 수치뿐**이고, 그건 전부 철회 후 재측했다.

🔴 **1px 격자 스캔이라 참값은 [span, span+2] 사이다.** 판정은 **관대한 상한(span+2)**으로 했다 —
그래야 내가 위반을 **과다 신고**하지 않는다. 즉 **실제 위반은 이 수보다 많을 수는 있어도 적지는
않다**(35대가 남긴 「+0.6px 편향」과 같은 자리, 반대 방향으로 안전하게 잡았다).
경계 상자 값(`boxW`/`boxH`)과 `hitScanned` 플래그도 원자료에 남겼다 — **「계산된 상자」와
「눌리는 상자」는 두 층이고 갈릴 수 있다.**

## 4. 🔴 이 측정이 사람보다 유리한 점 / 불리한 점 (고정 기재)

- **유리** — `getBoundingClientRect` + `elementFromPoint` 로 **소수점 경계와 실제 눌리는 상자를
  직접 읽는다.** 사람은 그 상자를 볼 수 없고 「눌러서 빗나가는지」로만 안다. 65개를 빠짐없이
  전수로 도는 것도 사람이 못 하는 일이다.
- **불리** — **무엇이 «하나의 대상»인지 사람처럼 못 가른다.** 시각적으로 한 덩어리인 두 요소를
  둘로 셀 수 있고(그러면 대상 수가 부풀고 원 교차가 늘어난다), 반대로 한 요소 안의 두 기능을
  하나로 셀 수 있다. **Inline·Equivalent·Essential 예외 판단도 사람 몫이다.**

## 5. 자수 (나머지)

1. **블랙박스 규칙은 지켰다** — `data-testid` 셀렉터를 **한 번도 안 썼다**. 대상 수집은 HTML 의미
   (`a[href]`·`button`·`input`·`[role=…]`·`[tabindex]`)로, 식별은 **접근 가능한 이름 + 좌표**로 했다.
2. **3화면만 쟀다** — `/overview` · incident replay · evidence. `/compare` · `/work-orders` ·
   `/documents` · `/enter` 는 **안 쟀다.**
3. **1440×900 1벌 · chromium 1벌 · prod 1벌.** 좁은 폭은 안 쟀다 — 폭이 줄면 요소가 붙어
   **Spacing 예외가 깨질 수 있다**(이번 초록은 이 폭의 초록이다).
4. **모달·시트·투어가 열린 상태는 안 쟀다** — 그 상태에서는 겹침이 달라진다.
5. **스크롤 하단 대상은 뷰포트 밖이라 히트 스캔이 실패**할 수 있다. 그 경우 경계 상자로 대체하고
   `hitScanned:false` 로 표시했다 — 원자료에서 갈라 볼 수 있다.

## 6. 재현

```
# 기준선 무대 (sha 5c7e9b5)
git worktree add <wt> 5c7e9b5 && (cd <wt>/apps/web-console && \
  FKT_API_BASE=http://127.0.0.1:8010 FKT_API_BASE_BUILD=http://127.0.0.1:8010 pnpm build && \
  FKT_API_BASE=http://127.0.0.1:8010 pnpm exec next start -p 3112)

node tests/web/t74_target_size.mjs --base http://127.0.0.1:3112 --pointer fine   --out evidence/t74-target-size-fine.json
node tests/web/t74_target_size.mjs --base http://127.0.0.1:3112 --pointer coarse --out evidence/t74-target-size-coarse.json
```
