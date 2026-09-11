# D-96 — 느린 조건의 「투어 안 열림」은 **수화 전 클릭이 버려진 것** (센쿠2 55대)

base = `origin/develop` **eef58e296ac40aab9f334113084692d847415304**(실측) · lane `lane/senku2-d96`
무대 = `:8809`(이 트리 prod 빌드 · API = develop 스택 `:8020`) · 구독 **0** · **코드 변경 0**
느린 조건 = CDP `Network.emulateNetworkConditions`(400kbps · RTT 400ms) + `Emulation.setCPUThrottlingRate 4`

## 0. 먼저 — 내 앞 보고 한 줄을 정정한다

T-OPEN 문서에 「URL 은 4.7초에 이미 `/overview?intro=1&tour=1` 이었다」고 적었다. **틀렸다.**
그 계측기는 `location.pathname.startsWith("/overview")` 만 봤고 **쿼리를 보지 않았다** —
쿼리가 있었는지는 그 측정이 말할 수 없는 것이었다. 이번에 쿼리까지 찍어 보니 그 조건의 URL 은
**쿼리 «없는» `/overview`** 다. 「본 축」을 넘어서 적은 문장이었다.

## 1. 창부터 갈랐다 (「안 열림」 vs 「내 창이 짧았다」)

| 창 | 말풍선 |
|---|---|
| 20,000ms | 부재 3/3 |
| **60,000ms** | **부재 3/3** |

⇒ 창 문제 아님. 부재는 실재한다.

## 2. 상태 덤프 — 무엇이 없는가

느린 조건 · 버튼이 보이자마자 클릭 · 16초까지 추적:

```
① 클릭 직전   url=/            ev=0  headline=0 card=0 title=0 invite=0 reopen=1
② 클릭+6s     url=/overview    ev=0  headline=1 card=1 title=0 invite=1 reopen=1
② 클릭+16s    url=/overview    ev=0  headline=1 card=1 title=0 invite=1 reopen=1
```

🔴 **`ev = 0`** — `fkt:tour-open` 이 **한 번도 안 나갔다**. 그리고 URL 에 **쿼리가 없다**.
즉 「투어가 못 열었다」가 아니라 **아무도 투어에게 열라고 말하지 않았다**. 앱 자체는 멀쩡하다
(`headline`·`card`·`invite` 전부 1). `/overview` 로 간 것은 그 클릭이 아니라 **입장 흐름**이다.

## 3. 갈림 변수 — **클릭 시점** 하나 (같은 느린 무대 · 한 변수만)

| 클릭 시점 | 이벤트 | URL | 말풍선 |
|---|---|---|---|
| **early** = 버튼이 «보이자마자»(서버 렌더만으로도 참) | **0건** | `/overview`(쿼리 없음) | **0/3 부재** |
| **late** = 개요 본문이 선 뒤 | **1건** | `/overview?intro=1&tour=1` | **3/3 · 16·18·21ms** |

발주가 준 후보 대조:
- ① URL 경로 / ② 이벤트 경로 → **둘 다 결백**. late 에서 둘 다 정상 작동한다(3/3).
- ③ 첫 걸음 `info` 대상 부재 → **기각(축이 다름)**. 그 논의는 링(`tour-spotlight`) 축이고
  여기 부재는 말풍선(`tour-title`) 축이다. 말풍선은 late 3/3·빠른 조건 6/6 으로 뜬다.
- ④ 폴링 8초 종료 → **결백**. 폴링은 «열린 뒤» 스크롤 보정의 것이고, 여기선 열림 자체가 없다.

## 4. 판정 — **대상 결함**(느린 기기 축 · 실기기에서 재현 가능)

**진범 = 앱바 「튜토리얼」이 수화 «전»에 이미 눌리는 모양으로 서 있고, 그때의 클릭은 통째로 버려진다.**
`apps/web-console/components/tour/tour-reopen.tsx:62~89` — 열림은 **전부 `onClick` 안**에 있다
(`markTourOpenRequested()` · `dispatchEvent` · `pushState`/`router.push`). React 핸들러가 붙기
전의 클릭에는 **기본 동작이 없다**(`<button type="button">`). 그래서 아무 일도 안 일어나고,
**사람에게는 되먹임조차 없다** — 「눌렀는데 아무 반응 없음」이 정확히 폐하 실기기 증상의 모양이다.

🔴 **D-95 래치로도 못 막는다**: 래치는 「신호는 났는데 들을 사람이 늦게 왔다」를 고친 장치다.
여기서는 **신호 자체가 나지 않는다**(ev 0) — 적을 것이 없다. 층이 다르다.

## 5. 처방 1안 — 수화 전에도 «기본 동작»이 있게 한다

`<a href="/overview?intro=1&tour=1">` 로 두고, **수화 뒤에는 `onClick` 이 `preventDefault()` 하고
지금 로직을 그대로 수행**한다(같은 화면이면 `pushState`, 다른 화면이면 `router.push`).

- 수화 «전» 클릭 → 브라우저 기본 이동이 먹는다 → 서버가 `?tour=1` 을 읽어(`tour-provider.tsx:73~83`
  `wants`) 투어가 열린다. **버려지는 클릭이 0 이 된다.**
- 수화 «후» 클릭 → `preventDefault` 로 라우터를 타지 않으므로 **D-71 이 고친 것을 되돌리지 않는다**
  (`tour-reopen.tsx:15~23`: `<Link>` 는 overview 에서 **16/18 회차 이동 실패** · 원인 = 같은
  pathname 쿼리 이동이 자기 prefetch 캐시에 흡수 · 그래서 pushState 로 뗐다). 🔴 **`<Link>` 가
  아니라 평범한 `<a>` 여야 한다** — Next 의 prefetch 경로에 다시 올리면 그 병이 돌아온다.
- 비용: 앱바 요소가 버튼→링크로 바뀐다(역할·포커스 순서·기존 `wo-*`/`intro-reopen` testid 유지).
  키보드 Enter 동작과 `fkt-hit` 44 히트는 재측 필요.

**판정선**: 느린 조건 × fresh × **early 클릭**에서 말봉선 **3/3 개방**(지금 0/3) · 빠른 조건 회귀
6/6 유지 · late 3/3 유지 · D-71 회귀(overview 에서 반복 클릭 시 쿼리 이동 성공률) 재측.

## 6. 안 잰 것

- 처방 적용 후 값(이 발주는 판독 · 코드 변경 0). · 실기기·다른 엔진.
- 「수화가 언제 끝나는가」의 절대값 — 본문 출현(4.8~5.7초)을 앵커로 썼을 뿐, 앱바 버튼 자체의
  수화 시각은 따로 재지 않았다(그 축을 재려면 계측 코드가 필요 = 코드 변경 0 위반).
