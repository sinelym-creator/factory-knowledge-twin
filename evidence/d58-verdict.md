# D-58 독립 검증 판정문 — 근거 화면 경로 표시(`evidence-breadcrumb`)

> 검증 좌석(리바이2 44대) · 2026-09-04 · 발주 = 스자쿠 38대 18:46
> 대상 = PR **#620** `lane/senku2-d58nav` **`12a915a`** · 대조군 = **`e590294`**
> 정본 = 센쿠2 보고(18:30 · #620 본문 표) + 규격 `docs/design/t6-5-guided-tour-spec.md` §⑧-7
> 그물 = `tests/web/d58_breadcrumb.mjs`(이 lane · 두 세계에 같은 코드로 걸었다)

## 판정 — **조건부 FAIL**

- 세 갈래의 **조각 수·문면·링크/라벨 구분·클릭 도달·콘솔 0·투어 target 실재는 전건 PASS**.
- 🔴 **「한 줄(줄바꿈 0 · 390 폭 포함)」 축만 위반** — 조건: **390 폭 · B(실제 run) 갈래 · 긴 evidenceId**.

## 0. 무대 (실측)

| | 대상 | 대조군 |
|---|---|---|
| 포트 | `127.0.0.1:8160` | `127.0.0.1:8161` |
| 트리 | `_wt/levi2-d58tgt` @ `12a915a` | `_wt/levi2-d58ctl` @ `e590294` |
| 빌드 | `next build` 산출물 확인(`.next/BUILD_ID` `_AY3d9hff-HUCjUV2b2fn`) | 같은 방식(`WySDYn83O52s8etbLjokK`) |
| ai-api | `:8118`(양쪽 같은 통로 — 손잡이는 셸 빌드 하나뿐) | 같음 |
| 무대 울림 | 근거 화면 4회 전부 200 · `trust-header` 실재 | 200 · `trust-header` 실재 |

🔴 **파이프 뒤 rc 를 판정에 쓰지 않았다** — 빌드 성공은 `.next/BUILD_ID` **산출물**로 확인했다(두 값이 서로 다르다 = 서로 다른 빌드).
🔴 **양방향 grep** — `evidence-breadcrumb` 심볼이 대상 트리 4건 / **대조군 0건**. `git diff --stat e590294 12a915a -- apps/web-console` = 2파일 +124줄.

## 1. 갈래별 실측 (390 폭 · evidenceId = `DOC-MAN-0021@r1#001` — **화면이 실제로 내놓은 링크에서 뽑았다**)

| 갈래 | 조각 | 문면 | 첫 조각 | 가운데 조각 | 한 줄 |
|---|---|---|---|---|---|
| **A** 정적 재생본(`?run=STATIC-GS-01`) | **3** | `Incidents › 둘러보기 재생 › 근거 DOC-MAN-0021@r1#001` | **라벨**(`a` 없음) | **링크** `href=/incidents/INC-2026-014?run=STATIC-GS-01` | **한 줄**(top 차 0.5px) |
| **B** 실제 run(`?run=RUN-…`) | **3** | `Incidents › 조사 RUN-29b7fa… › 근거 DOC-MAN-0021@r1#001` | **링크** `/incidents` | **`span` 라벨**(href 없음) | 🔴 **두 줄**(top 차 **23.5px** · 조각 높이 19.5) |
| **C** run 없음 | **2** | `Incidents › 근거 DOC-MAN-0021@r1#001` | **링크** `/incidents` | (조각 없음) | **한 줄** |
| A @1280 | 3 | 위와 같음 | 라벨 | 링크 | **한 줄** |
| **대조군 e590294** | **0** | (경로 표시 없음 · `present:false`) | — | — | — |

- **클릭 도달(A)** — 가운데 링크를 **실제로 눌러** `http://127.0.0.1:8160/incidents/INC-2026-014?run=STATIC-GS-01` 에 섰고, 본문은 REPLAY 화면(「정적 재생본 기억 리셋」 등) = **투어 밖으로 나가지 않는다**. 🔴 href 존재와 클릭 도달을 따로 쟀다.
- **콘솔** — 대상 4갈래 전부 **0건**(pageerror 포함).
- **투어 7걸음 target** — `tour-steps.ts` 의 7번째 걸음 `target: "trust-header"` 이고, 근거 화면에 `data-testid="trust-header"` 가 **실재**(오버레이는 `document.querySelector('[data-testid=…]')` 로 찾는다) ⇒ **PASS**.

## 2. 위반의 «조건» — 좁혀서 회부한다

| 열 | 폭 | 갈래 | evidenceId | top 차 | 판정 |
|---|---|---|---|---|---|
| 1 | 390 | B | `DOC-MAN-0021@r1#001`(20자) | **23.5px** | 🔴 두 줄 |
| 2 | 390 | B | `EQ-CNC-204`(10자) | 0.5px | 한 줄 |
| 3 | 390 | A · C | `DOC-MAN-0021@r1#001` | 0.5px | 한 줄 |
| 4 | 1280 | B | `DOC-MAN-0021@r1#001` | 0.5px | 한 줄 |

⇒ **좁은 폭 + 세 조각 + 긴 근거 id** 가 함께여야 난다. 마지막 조각에 `min-w-0 truncate` 가 있으나
컨테이너가 `flex-wrap` 이라 **줄이기 전에 줄바꿈이 먼저 일어난다**. A 갈래가 같은 조건에서 한 줄인 이유는
가운데 문면(「둘러보기 재생」)이 「조사 RUN-29b7fa…」보다 짧기 때문이다 — 즉 **문면 길이에 걸린 축**이다.

## 3. 자수 (내 계측기)

1. 🔴 **1차 측정의 「전 갈래 두 줄」은 위양성이었다.** 한 줄 판정을 `Math.round(top)` 집합 크기로 재서,
   **0.5px 정렬 오차**(조각마다 높이가 19.5/20.5 로 다르다)를 줄바꿈으로 읽었다. 판정선을
   **「top 차 < 조각 높이 × 0.6」** 으로 고쳤다.
   🔴 **완화가 검출력을 팔지 않았음을 같은 실행에서 확인**했다 — 고친 뒤에도 열 1(B · 긴 id)은 **여전히 빨강**이고,
   열 2~4 만 초록으로 바뀌었다. 완화 전후로 «갈린 것»이 정확히 위 조건표다.
2. `npm --prefix <lane>/tests/web install` 이 **리포 루트의 package.json 을 찾다 실패**했다(`--prefix` 는 설치 위치만 바꾼다).
   스크립트 안에서 `cd` 후 `npm install` 로 고쳤다 — 대상의 결함이 아니라 내 호출 형식이었다.

## 4. 잰 것 / 안 잰 것

**잰 것** — 갈래 A/B/C × (390, 1280 일부) × 두 세계 · 클릭 도달 1건 · 콘솔 · 투어 target 실재.
raw = `evidence/d58-breadcrumb-target.json`(긴 id)·`d58-breadcrumb-target-short.json`(짧은 id)·`d58-breadcrumb-control.json`.

**안 잰 것(이름으로)**
1. **키보드 도달·포커스 표시** — 링크의 `focus:outline` 은 코드에 있으나 눌러 보지 않았다.
2. **다른 뷰포트 폭의 경계값** — 390 과 1280 만 봤다. 줄바꿈이 시작되는 폭은 못 잰다.
3. **`?run=` 이 «남의» run 인 경우** — 소유권 밖 run id 로는 안 열어 봤다(이 티켓 축 밖).
4. **스크린리더 읽기 순서** — `aria-label="경로"`·`aria-current="page"` 는 코드로 확인, 보조기술 실측 0.

## 5. 재현

```
# 무대(각 트리에서) : FKT_API_BASE=http://127.0.0.1:8118 pnpm build → next start -p 8160 / 8161
cd tests/web && npm install
MSYS_NO_PATHCONV=1 node d58_breadcrumb.mjs --base http://127.0.0.1:8160 --out C:/…/tgt.json \
  --evidence "DOC-MAN-0021@r1#001"      # 열 1 = 빨강
MSYS_NO_PATHCONV=1 node d58_breadcrumb.mjs --base http://127.0.0.1:8160 --out C:/…/short.json \
  --evidence "EQ-CNC-204"               # 열 2 = 초록(조건 좁히기)
MSYS_NO_PATHCONV=1 node d58_breadcrumb.mjs --base http://127.0.0.1:8161 --out C:/…/ctl.json
```
