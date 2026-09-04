# T6-4 애플 감성 디자인 규격서 v1.0

> 하명 09-03 08:14 「iOS/macOS 감성 · 아이폰식 진행 UI · 동적 애니메이션」. 대상 `apps/web-console`(Next 16·React 19·Tailwind v4). 새 의존성 0(framer-motion 금지)·CSS 전용. 개정 = 새 버전 파일. E1 실측·E2 HIG·E3 소견.
> 🔴 **무변경**: `data-testid` 142곳/21파일 · `data-*` · 배지 문구(확인 중/LIVE/REPLAY/미연결 · live 합성/live 거부/결정적) · role/aria · DOM 순서 · contracts · 서버 · `tests/**`.

## ① 원칙

| # | 원칙 | 규칙 |
|---|---|---|
| 1 | 콘텐츠 우선 | 장식 0 · 테두리 대신 배경 계층·그림자 |
| 2 | 8pt 그리드 | 카드 안 16 · 사이 12 · 섹션 24 |
| 3 | 계층 | 배경 3단+라벨 4단 · 강조 = 굵기·크기 |
| 4 | 절제된 색 | 틴트 1+상태 4 · 아이콘·문구 병기(§17.3) |
| 5 | 물리감 모션 | 스프링 · transform/opacity 만 · 120/240/400ms |
| 6 | reduced-motion | duration 0 · animation none |
| 7 | 다크/라이트 자동 | `color-scheme: light dark` · 토큰 값만 스위치 |

## ② 토큰 (`globals.css` `:root` + `@media (prefers-color-scheme: dark)`)

기존 `@theme` 이름은 `@theme inline`으로 `--fkt-*` 참조 → `bg-panel`·`text-ok` 등 그대로 동작.

| 토큰 | 라이트 | 다크 | 기존 |
|---|---|---|---|
| `--fkt-bg-1` 바탕 | #F2F2F7 | #000000 | bg |
| `--fkt-bg-2` 카드 | #FFFFFF | #1C1C1E | panel |
| `--fkt-bg-3` 인셋·트랙 | #E5E5EA | #2C2C2E | 신규 |
| `--fkt-label-1` 본문 | #000000 | #FFFFFF | ink |
| `--fkt-label-2` 보조 | rgb(60 60 67/.72) | rgb(235 235 245/.6) | muted |
| `--fkt-label-3` 플레이스홀더 | rgb(60 60 67/.5) | rgb(235 235 245/.4) | 신규·본문 금지 |
| `--fkt-label-4` 구분선 | rgb(60 60 67/.18) | rgb(84 84 88/.65) | edge |
| `--fkt-tint` | #0071E3 | #0A84FF | ai |
| `--fkt-success` | #248A3D | #30DB5B | ok |
| `--fkt-warning` | #C93400 | #FFB340 | warn |
| `--fkt-danger` | #D70015 | #FF6961 | danger |
| `--fkt-info` | #0071A4 | #70D7FF | 신규 |
| `--fkt-scrim` | rgb(0 0 0/.3) | rgb(0 0 0/.55) | scrim |
| `--fkt-glass` | rgb(255 255 255/.72) | rgb(28 28 30/.72) | 신규(앱바·레일·모달) |

값 = HIG 고대비 변형(E2) · label-2 라이트 .72 = 4.5:1 계산 상향(E3).

| 구분 | 토큰 · 값 |
|---|---|
| 폰트 | `--fkt-font-sans` `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`(Geist Sans 제거·fetch 0) · `--fkt-font-mono` `ui-monospace, "SF Mono", Menlo, Consolas, monospace`(`.id`) |
| 크기 | `--fkt-t-large` 34/28(≥md/모바일) · `-title` 22 · `-head` 17 semibold · `-body` 17 · `-body-c` 15(패널 본문·현 sm) · `-foot` 13(현 xs) · `-cap` 12(ID·시각) |
| 간격 | Tailwind 4px 스케일 짝수만(1·2·3·4·6·8) · 앱바·레일 56 유지 |
| 라운드 | `--fkt-r-card` 16 · `-btn` 12 · `-chip` 8 · `-pill` 999 |
| 그림자 | `--fkt-shadow-1` `0 1px 2px rgb(0 0 0/.06), 0 0 0 1px rgb(0 0 0/.04)` · `-2` `0 8px 24px rgb(0 0 0/.12)` · 다크 alpha ×2 + 1px label-4 헤어라인 |
| 반투명 | `--fkt-blur` `blur(20px) saturate(180%)` · 앱바·레일·모달 3면만 |
| 모션 | `--fkt-dur-1` 120(hover·press) · `-2` 240(진입·배지) · `-3` 400(페이지·시트) · `--fkt-ease-spring` `cubic-bezier(0.32,0.72,0,1)` · `--fkt-ease-out` `cubic-bezier(0.25,0.1,0.25,1)` · reduced → 0 |

총 35 토큰(색 14·폰트 2·크기 7·라운드 4·그림자 2·blur 1·모션 5).

## ③ 컴포넌트 변경표

지금(E1) = `rounded(4px) border-edge bg-panel` · transition 0곳.

| 컴포넌트 | 지금 → 애플 톤 | 모션 | P |
|---|---|---|---|
| 셸(레일·앱바) | glass+blur · 하단 1px label-4 · 현재 항목 틴트 12% pill | hover dur-1 | P0 |
| overview 헤드라인·KPI | 카드 r16 shadow-1 · title 22 · KPI 값 head 17 mono | 스태거·카운트업(P2) | P0 |
| overview 설비 그리드 | 카드 r16 · ◉▲■ 유지+좌측 4px 상태 바 | hover 상승+shadow-2·스태거 | P0 |
| 알람 dock·incident 헤더 | 구분선 → 항목 카드(bg-3 r12) · 심각도 pill | 스태거 | P0 |
| run 컨트롤 바 | glass sticky top | 상태 페이드 dur-2 | P0 |
| 모드 배지(`live-status`·run) | pill 999 · 상태색 12% bg+6px 점 · 문구 불변 | 점 pulse·pop | P0 |
| 타임라인(`run-progress`) | 점+연결선 레일 · n/m 유지 + **3px 진행 바 신설**(`run-progress-bar` 추가만) | ④-3·pulse | P0 |
| 후보 카드(`candidate`) | bg-3 r12 카드 · 순위 24px 틴트 원 | 스태거 | P0 |
| 합성 배지 | pill 999 · 문구·아이콘 불변 | pop | P0 |
| 되감기(`replay-*`) | 세그먼트(트랙 bg-3 r10·선택 bg-2 shadow-1) · 커서 텍스트 유지+커서 바 | ④-7 | P1 |
| 근거 스트립 | 카드 r12 · `scroll-snap-type: x mandatory` | 네이티브 | P1 |
| 모달(reset) | 스크림+blur · 시트 r16 shadow-2 · ≥md 중앙/<md 바텀 시트 · 주 버튼 틴트 채움 | ④-9 | P0 |
| 배너(`fallback-banner`) | glass 스트립 · 닫기 28px 원 | 슬라이드다운 dur-2 | P1 |
| 버튼 | 1차 틴트 채움/2차 bg-3/3차 틴트 텍스트 · h36(모바일 44) r12 · disabled .4 유지 | ④-8 | P0 |
| 입력(`enter-form`) | h44 r12 bg-3 무테두리 · 포커스 링 | dur-1 | P1 |
| 스켈레톤(`overview-loading`) | bg-3 r16 블록(가짜 데이터 0·§0.2) | ④-4 | P1 |
| 모바일·태블릿(⑧) | 고정폭 레일(w-70/80/95/100) → <md `flex-col` · md~lg 2열 · 가로 스크롤 0 · 터치 타깃 ≥44 | — | **P0**(폐하 08:18·08:19) |

## ④ 애니메이션 카탈로그 (CSS 전용 · `@layer components` · transform/opacity 만)

| # | 이름 | 구현 요지 · 트리거 |
|---|---|---|
| 1 | 페이지 진입 | `fkt-rise{from{opacity:0;transform:translateY(8px)}}` dur-3 spring · 페이지 루트 마운트 |
| 2 | 카드 스태거 | `.fkt-stagger>*` 에 ④-1 + `:nth-child(n)` 지연 40ms×n(≤8) · 리스트 마운트 |
| 3 | 진행 바 | 트랙 3px bg-3 r999 · 틴트 채움 `transform-origin:left` · 추정층 `scaleX(0→.9)` 9s ease-out(평균 조사 9s E3·「추정」 표기) + 실측층 `scaleX(var(--p))` dur-2(`--p`=done/total) · `[data-status=done]` → `scaleX(1)` dur-1 스냅 후 fade |
| 4 | shimmer | `::after` 그라디언트 `translateX(-100%→100%)` 1.4s infinite · loading.tsx |
| 5 | 배지 pop | `fkt-pop{0%{scale(.92)}60%{scale(1.04)}}` dur-2 · `key={mode}` 재마운트(속성 1) |
| 6 | 카운트업(P2) | `@property --n` + `transition:--n` + `::after{content:counter(n)}` · 실값 텍스트 DOM 유지 · 미지원 = 즉시 표시 |
| 7 | 되감기 커서 | 커서 바 `translateX(calc(var(--pos)*100%))` dur-2(`--pos`=applied/total) |
| 8 | 버튼 press | `:active{transform:scale(.97)}` dur-1 |
| 9 | 시트/모달 | `fkt-sheet{from{opacity:0;transform:scale(.96)}}` dur-3 · <md `translateY(24px)` |
| 10 | 점 pulse | `fkt-pulse{50%{transform:scale(1.4);opacity:.5}}` 1.6s infinite · checking·live·진행 단계 |

전역: `@media (prefers-reduced-motion:reduce){*,::before,::after{animation:none!important;transition-duration:0s!important}}`.

## ⑤ 접근성·성능

- 대비 본문 ≥4.5:1(label-1·2·상태색 고대비 변형) · label-3 텍스트 금지 · 상태 = 아이콘+문구(§17.3)
- 포커스 `:focus-visible{outline:2px solid var(--fkt-tint);outline-offset:2px}` 전역 1규칙
- reduced-motion 정지 시 정보 손실 0(값·문구 DOM 상주)
- 60fps: transform·opacity 만 · width/height/top 금지 · backdrop-filter 3면 · `will-change` 금지(E3)
- LCP: 웹폰트 0(E3) · ④-1 지연 가능(E3) → Lighthouse 전/후 · 악화 시 항해 전용
- 키보드: 기존 button 유지(tab 순서 불변) · 모달 Esc 유지

## ⑥ 검증 축 (리바이2)

| 축 | 기준 | 판정 |
|---|---|---|
| 스크린샷 기준선 | 5화면(overview·incident·evidence·work-order·compare) × 라이트/다크 × 390·768·1024·1280·1440(⑧) × reduced on/off × chromium(+webkit·firefox 는 ⑧ 축) · `toHaveScreenshot({animations:'disabled'})` · 🔴 Playwright 기본 colorScheme=light → 프로젝트별 명시 | 전/후 이미지 |
| e2e 무회귀 | 133/0/3 · 애니메이션 중 testid 142곳 `toBeVisible` · click 대기 ≤400ms | PASS/FAIL |
| GS-01 replay | 정적 완주 정합 · 진행 바 done 스냅 · 배지 문구 불변 | PASS/FAIL |
| 대비 | 본문·보조·상태 4.5:1 실측 × 다크/라이트(도구 자율·새 의존성이면 보고) | 표 |
| 성능 | Lighthouse LCP·CLS 전/후(1280 라이트) · CLS 0 | 수치 |
| 상태 전수 | 펼침/접힘/hover/빈/미연결/배너/모달 × 다크/라이트 | 체크리스트 |

## ⑦ PR 분할 (센쿠2 · `apps/web-console/**` 만)

| PR | 내용 | 완료 조건 | 잰/안 잰 |
|---|---|---|---|
| 1 기반 | 토큰 35+`@theme inline`+`color-scheme`+시스템 폰트(`layout.tsx` Geist Sans 제거)+유틸 `.fkt-card/-btn/-pill/-glass/-rise/-stagger/-progress/-shimmer`+포커스·reduced 전역 | 컴포넌트 diff 0(layout 제외) · e2e 무회귀 · 전/후 스크린샷 | e2e·스크린샷 / 대비·LCP |
| 2 재스킨+모션 | ③ P0 전부 + ④ 1·2·5·8·9·10 | testid·문구 diff 0(grep 수치) · 상태 전수 · 기준선 갱신 | e2e·GS-01 / 성능 |
| 3 진행·마감 | ④ 3·4·7(+6) + ③ P1 + ⑧ 잔여 | 390/768/1024 레이아웃(⑧ 가로 스크롤 0·터치 44) · 진행 바 추정+done 스냅 · reduced 열 · 호환 표 | 전 축 / 0 목표 |

각 PR = 전/후 스크린샷 1쌍 이상 · 상한 09-04.

## ⑧ 반응형·호환 (폐하 08:18 「태블릿·모바일 문제없게 · 호환성 체크」 · 08:19 「레이아웃 이상 있으면 수정 보완」 · D-005)

- **뷰포트 4열(+1440 기존)**: 390(폰 세로) · 768(태블릿 세로) · 1024(태블릿 가로) · 1280(데스크톱). 규칙: <md = 레일·패널 `flex-col` 스택 · md~lg = 2열 · ≥lg = 현 3열. 고정 px 폭 → `min()`/`clamp()` · 표·근거 스트립은 자기 컨테이너 `overflow-x:auto` · **body 가로 스크롤 0**. 터치 타깃 ≥44px(버튼·링크·세그먼트) · 모달 <md = 바텀 시트 전폭 · 뷰포트 높이는 `dvh`(iOS 주소창).
- **호환 대상**: iOS Safari 17+ · Chrome/Edge 최신 2 · Firefox 최신(E2 caniuse 기준 · 실기기는 안 잰 것 = 에뮬레이션만). 점검 항목: `backdrop-filter`(`-webkit-` 접두 + 미지원 시 불투명 폴백 `@supports not`) · `color-scheme` · `prefers-reduced-motion` · `:focus-visible` · `dvh` · `@layer` · `@property`(④-6 · 미지원 = 즉시 표시) · CSS 중첩 미사용(Tailwind v4 산출 그대로).
- **검증(리바이2 · ⑥ 확장)**: Playwright 프로젝트 = chromium·webkit·firefox × 뷰포트 4 × colorScheme 2 → ① 스크린샷 기준선 ② `scrollingElement.scrollWidth <= clientWidth` 전 화면 assert ③ 터치 타깃 ≥44 assert(버튼·링크 boundingBox) ④ 호환 표(브라우저 × 항목 · PASS/FAIL/미지원 폴백). 깨짐 = 수정 조각(센쿠2 · 같은 PR 내) · 판정 불가는 사유 명시.
- **PR 반영**: PR2 = ③ 「모바일·태블릿」 P0 행(스택·2열·터치 44) · PR3 = 뷰포트 4열 기준선 + 호환 표 + 잔여 수정.

## ⑨ 접근성 설정·터치 타깃 (T7 · 🔴 폐하 승인 09-03 18:44 「권장안 승인」 = 원칙 ①②③④ + 시안 형태 ⓐ)

> 하명 09-03 18:21 「디자인 개선건 티켓추가하고 설계하고 진행한다 · **develop 에만 PR · 메인 머지 하지 않는다** · **설계전 설계방향 보고 · 시안 컨펌** 받고 진행 · **현시점 메인 배포 무접촉**」.
> 🔴 **이 절은 새 룩이 아니다.** 지금의 애플 감성 화면이 **모든 사람·모든 브라우저에서도 그대로 성립하는가**를 세운다. 레이아웃·구성·색조 변경 0.

### 원칙 4 (승인분)

| # | 원칙 | 뜻 | 왜 |
|---|---|---|---|
| ① | **색조는 지키고 «경계»만 만든다** | 고대비 설정에서 브랜드 파랑을 바꾸지 않고, **그 설정일 때만** 테두리·구분선을 허용 | 평상시 원칙이 「테두리 대신 배경 계층」이라 테두리 0. 고대비는 **예외 조항**으로 연다 |
| ② | **강제 색상에선 우리 색을 «포기»한다** | `forced-colors: active` 면 시스템 색을 그대로 받는다 | 여기서 브랜드를 고집하면 **읽지 못하는 사람이 생긴다**. 🔴 `forced-color-adjust: none` 으로 되살리는 것 **금지** |
| ③ | **큰 글자에선 «잘림»보다 «줄바꿈»** | 토큰 px→rem 을 **먼저** 열고, 레이아웃이 못 견디면 **레이아웃을 고친다** | 🔴 실측(29대 18:30): 타이포 토큰 **10개 전부 px · rem 0 · html font-size 지정 0** = 글꼴 크기 설정을 **구조적으로 안 따라온다**. `clamp()` 상한은 **두지 않는다** — 상한은 「따라오기」를 다시 막는다 |
| ④ | **누르는 것은 44 이상** | **보이는 크기는 그대로**, 눌리는 영역만 확장(`::before` 등) | HIG 최소 44×44. 버튼을 키우면 애플 감성이 무너진다. 근거 = D-26(고유 19건 · 3엔진 공통) |

### 처방 자리 (값은 측정 착신 후 확정 — 여기 수치는 **설계 의도**다)

- **① 고대비** `@media (prefers-contrast: more)`: `--fkt-label-2` α.6→**.85** · `--fkt-label-3` α.3→**.6** · `--fkt-label-4` `#38383a`→**`#5a5a5e`** · `--fkt-fill` α.36→**.55** · `--fkt-tint-text` `#5aa9ff`→**`#7ab8ff`** · 카드에 `outline: 1px solid var(--fkt-label-4)` 허용 · glass 3면은 **투명도 감소 처방 재사용**(같은 처방을 두 벌 만들지 않는다).
- **② 강제 색상** `@media (forced-colors: active)`: glass·blur·shadow·glow **전부 무력화** · 색 토큰 → 시스템 키워드(`CanvasText`·`Canvas`·`LinkText`·포커스 `Highlight`). 🔴 상태색 소실이 **정보 소실이 아니다** — 상태는 이미 **도형(●▲■)+낱말** 병기라 여기서 그 원칙이 값을 한다.
- **③ 큰 글자** 16px 기준 환산: kpi 40→**2.5rem** · metric·large 28→**1.75** · large(≥md) 34→**2.125** · title 22→**1.375** · head·body 17→**1.0625** · body-c 15→**0.9375** · foot 13→**0.8125** · cap 12→**0.75**. 위험 지점 = 레일 260px 고정 · KPI 타일 · 표 헤더 · 배지 묶음(앱바는 wrap 처방 기존).
- **④ 터치** 히트 영역 확장. 대표 증상 = 닫기 ✕ **10.6×19.5**(패딩 0 = 글리프가 곧 히트 영역) · `select` 41~42px(chromium·firefox 만 · **webkit 51px 통과**).

### 브라우저 축 (T7-2 완결분 · 09-03 18:41)

- 🔴 **엔진 분기 금지.** `@supports` / `@supports not` 로만 간다 — 「Safari면 이렇게」는 다음 엔진에서 또 깨진다.
- 🔴 **측정 결과 = 호환 결함 0**(120/120칸 · 가로 넘침 0/40 전 엔진 · 폴백 알파 1 착지). **「애플 브라우저에서 깨져 있을 것」이라는 가설이 실측으로 반증됐다.** 오히려 `select` 는 WebKit 만 통과했다 — **통념으로 자리를 지목하면 틀린 곳을 판다.**
- **잰 범위** = 엔진 3종 헤드리스 에뮬레이션. 🔴 **실기기 · 실제 미지원 엔진에서의 폴백 · 엔진별 전 칸 스크린샷은 「안 잰 것」.**

### 시안 형태 ⓐ (승인분)

같은 화면 1장(**overview** — KPI·카드·레일·배지가 한 장에 다 있다) × **4상태**(기본 / 고대비 / 강제색상 / 큰 글자 24px) × **2열**(🔴 **지금 → 처방 후**).
「지금」 열 = 측정 산출물 그대로 · 「처방 후」 열 = **런타임 주입본**(코드 변경 «전»에 보여 드릴 수 있다).

### 🔴 강제 색상 «시각» 실측이 낳은 처방 추가 4건 (센쿠2 36대 09-03 19:12 · E1 그림)

수치 축(`borderless` 켬·끔 14건 «동일»)이 **무관해 보였는데 화면은 완전히 달라져 있었다.** 🔴 **살아 있는 계측기가 잘못된 것을 세고 있었다** — 「죽은 검사기의 초록」의 거울상이다. **그림이 잡았다.**

| # | 증상(지금) | 처방 | 착지 |
|---|---|---|---|
| 1 | **면 경계 전멸** — 카드 12·KPI 타일 4·알람 패널·사이드바의 배경·테두리가 통째로 사라져 **「텍스트 나열」**이 된다(칸을 **배경색으로만** 나눈 자리) | 경계를 **`border`/`outline` 으로 복원** — 시스템이 배경을 지워도 남는 것으로 | `.fkt-card` **클래스 층** |
| 2 | **버튼이 버튼으로 안 보인다** — 「조사 시작」이 배경 없는 평문 | 강제 색상에서 **`ButtonBorder`** 부여 | `.fkt-btn-primary` **클래스 층**(🔴 실물은 **4개 파일**에 흩어져 있다) |
| 3 | **탭 선택이 «굵기 하나로만 버틴다»**(19:29 정정 — 「소실」이 아니다) — `bg-fill`(반투명 그레이 α.36)이 사라지고 `font-semibold` 만 남는다 · `.fkt-pill` 의 `color-mix(… 12%, transparent)` 와 **같은 병**(반투명 배경으로만 상태를 말한 자리) | `@media (forced-colors: active){ [aria-pressed="true"]{ border:1px solid Highlight } }` | 🔴 **`[aria-pressed="true"]` 속성 셀렉터** — 클래스 신설도 컴포넌트 편집도 불요 · 사정거리 **2곳**(전수 grep: `overview-body.tsx:383` 설비 필터 탭 · `sensor-trend.tsx:112` 추세 토글 · 같은 패턴) · 🔴 **`.fkt-pill` 줄과 «분리»해서 쓴다** — 한 줄로 둘 다 덮으려 하면 또 한쪽만 고쳐진다 |
| 4 | 🔴 **유리가 «안» 꺼진다** — `backdrop-filter: blur(20px) saturate(1.8)` 가 강제 색상에서 그대로 남는다 | **같은 처방을 두 조건에** — `@media (prefers-reduced-transparency: reduce), (forced-colors: active)` | `globals.css` **한 자리**(사용처 = `app-shell.tsx` 2곳 = 측정 glass 2건과 계수 일치) |

**추가 처방 «없음»으로 판정한 것** — 발광(`.fkt-glow-ai`)은 **브라우저가 이미 끈다**(shadow 1→0 실측 · CSS 규칙 없이). 🔴 **안 해도 되는 것을 안 하는 것도 판정이다.**

### 도달 경로 — 🔴 처방은 «클래스 층»에 건다

「조사 시작」이 `app/overview/page.tsx` · `app/incidents/[incidentId]/page.tsx` · `components/overview/overview-body.tsx` · `components/overview/start-investigation.tsx` **4곳**에 있다(센쿠2 사전 grep E1). 낱말·컴포넌트 기준으로 고치면 **한 곳만 낫는다** — 「한 처방을 두 경로에 나누면 한쪽만 고쳐진다」의 실물. **D-26 히트 영역도 같다: 고유 19건은 «19개 자리»가 아니다** — 먼저 grep 하고 클래스 층에 건다.

### ✅ 원칙이 값을 한 자리 (실증)

강제 색상에서 **상태 점(색)은 배경과 동일색이 되어 죽었는데** `▲ 알람 1`·`■ 위험` 은 **살아남았다.** 🔴 **색만으로 뜻을 전한 자리는 죽고, 기호로 전한 자리는 살았다** — 규격 ⑤ 「색상만으로 상태 전달 금지 · ●▲■ 도형 + 낱말 병기」가 실제 상황에서 값을 했다. 포커스 링도 시스템 하이라이트로 강제되어 보인다(dark `rgb(26,235,255)` · light `rgb(55,0,110)`).

### 그림 증거 형식 (팀 표준으로 성문)

🔴 **파일명이 곧 증거다** — `W_rem24__root24-24__nameFs22.5-22.5__clip0-0.png`(앞 숫자 = 찍기 «직전», 뒤 = «직후»). `fullPage` 캡처가 CDP 글꼴 설정을 되돌리는 사고(센쿠2 09-03)를 겪은 뒤 채택. **그림 옆에 숫자가 없으면 다음 대가 또 믿는다.**

### 🔴 정정 (19:27) — 「rem 이 잘림 17건을 해소한다」는 틀렸다

시안 S1(기본 16px) BEFORE/AFTER 두 장이 **바이트까지 동일**하다. **root 가 16px 이면 rem 환산값은 원래 px 와 같은 수**이기 때문이다.
잘림 17건을 없앤 것은 **rem 전환이 아니라 «글꼴 확대»** 였다 — 좌석 원본 `C1_now_font24`(rem 없이 17→0)가 그 증거인데, **같은 값이 두 원인에서 나온 자리를 오케가 안 갈랐다.**

- ⇒ **③ rem 처방의 값 = 「기본 사용자 화면 회귀 0」(안전성)** 이지 개선이 아니다. 시안 S1 두 장이 동일한 것이 **그 증거**다.
- ⇒ **D-27(기본 상태 잘림 17건)은 이 처방으로 안 없어진다** — 별도 처방(카드 폭 또는 텍스트 처리)이 필요하고 **T7 범위 밖**이다.
- 🔴 「같은 값이 두 원인에서 나오면 그 관측을 분모에서 빼라」 — 오늘 팀이 세 번 말한 규율을 **성문한 쪽이 어겼다.**


## 문체 규칙 (37대 추가 · 폐하 하명 2026-09-04 17:10 · 정본)

- 방문자에게 보이는 **모든** 문자열은 「~습니다 / ~하세요」체로 쓴다. 반말(「~이다 · ~한다 · ~둔다 · ~없다」)·설계 노트체(「«»」 강조 · 「— 이유」 서술)·내부 용어(원장 번호 · 계약 버전 · Q-nn · 티켓 번호)를 화면에 내지 않는다.
- 버튼·탭 라벨은 명사형을 허용한다(「입장」 「리셋」 「문서 원문」).
- 값·식별자(`data-*` · `aria-*` · testid · 계측 심볼 · 서버가 말한 숫자)는 문체 정비의 대상이 아니다 — 사람에게는 문장을, 계측기에는 값을(D-51 원칙).
- 오류·빈 상태 문장은 「무엇이 안 됐는지 + 방문자가 할 수 있는 한 가지」 두 조각으로 끝낸다. 원인을 단정하지 않는다.
- **친절하게 · 일반인이 이해하도록**(폐하 17:17): 전문 용어(revision · chunk · 색인 · 계약 · offset · sha · FRESH)는 쉬운 말로 풀거나 툴팁/접힘으로 내린다. 설명 문장 = 「지금 보고 계신 것 + 다음에 할 수 있는 일」 두 조각. 식별자 조각(세션 id 등)을 라벨로 그대로 내지 않는다(모바일 「_xEq」 · 데스크톱 「PBSI」).
- **문서 본문(`data/**` 합성 매뉴얼·SOP 등 자료)은 문체 정비 대상이 아니다** — 자료는 원문 그대로 보여 준다(폐하 확정 2026-09-04 17:29 「매뉴얼은 그대로 가야지」).
- 성문 근거 = D-54(패널 설계 노트 문장) · D-58(근거 화면 3곳) · 전수 정비 티켓 = T7-40.
