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

| pointer 열 | 실측 media | AA(2.5.8) 통과 | AA 위반 후보 | AAA(44) 통과 | 24 미만 |
|---|---|---|---|---|---|
| **fine** | `coarse=false · fine=true · any-hover=true` | **65/65** | **0** | 10/65 | 20 |
| **coarse** | `coarse=true · fine=false · any-hover=false` | **65/65** | **0** | **25/65** | 20 |

화면별 AAA 통과 (fine → coarse):

| 화면 | 대상 수 | 24 미만 | AAA fine | AAA coarse |
|---|---|---|---|---|
| `/overview` | 16 | 0 | 3 | **13** |
| `/incidents/INC-2026-014?run=STATIC-GS-01` | 41 | 19 | 4 | **8** |
| `/evidence/MR-2025-0087?run=STATIC-GS-01` | 8 | 1 | 3 | **4** |

- 🔴 **24 미만 대상 20개가 전부 Spacing 예외로 통과**한다 — 각 대상의 24px 원이 **다른 대상의
  경계 상자와도, 다른 미달 대상의 원과도 한 건도 교차하지 않는다.**
- 🔴 **coarse 조건부 처방이 실측으로 산다** — AAA 통과가 **10 → 25** 로 오른다. **fine 만 쟀으면
  이 처방에 대해 아무 말도 못 한다**(「닿지 않는 계측」).

## 2. 대조군 — 같은 실행에서 **양방향**

| 대조군 | 심은 것 | 기대 | 실측(fine / coarse) |
|---|---|---|---|
| ① 위반 보장 | 12×12 버튼 2개 · 중심 간 18px | AA **위반** | **위반**(원 교차 파트너 1 / 2) |
| ② 통과 보장 | 60×60 버튼 1개 · 빈 자리 | AA·AAA **통과** | **통과** / **통과** |

한 방향만 검사하면 「전부 위반이라 답하는 자」도 「전부 통과라 답하는 자」도 초록을 낸다.
어긋나면 `exit 2`. **두 열 모두 통과** — 이 회차의 65/65 는 근거다.

## 3. 🔴 자수 ① — 첫 실행이 **AAA 0/65** 라는 거짓 빨강을 냈다

`getBoundingClientRect()` 만 읽었더니 **어느 화면에서도 44 통과가 0개**였다. 대상의 사실이 아니라
**내 계측기가 히트 영역을 못 본 것**이다 — 이 코드베이스는

```css
.fkt-hit::before { position:absolute; left:0; top:50%; width:100%; height:max(100%, 2.75rem); transform:translateY(-50%); }
```

로 히트 영역을 **세로로만** 넓히는데, 경계 상자는 그 확장을 포함하지 않는다.

**고쳤다** — 2.5.8 의 주어는 「pointer 가 실제로 잡는 target」이므로 **`elementFromPoint` 로
눌리는 상자를 중심에서 사방으로 훑는다**(블랙박스 · 셀렉터 아님). 경계 상자 값(`boxW`/`boxH`)도
원자료에 함께 남겼다 — **「계산된 상자」와 「눌리는 상자」는 두 층이고 갈릴 수 있다.**

🔴 **1px 격자 스캔이라 참값은 [span, span+2] 사이다.** 판정은 **관대한 상한(span+2)**으로 했다 —
그래야 내가 위반을 **과다 신고**하지 않는다. 즉 **실제 위반은 이 수보다 많을 수는 있어도 적지는
않다**(35대가 남긴 「+0.6px 편향」과 같은 자리, 반대 방향으로 안전하게 잡았다).

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
