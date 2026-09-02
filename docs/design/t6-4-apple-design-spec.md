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
| 모바일 <md | 고정폭 레일(w-70/80/95/100) → `flex-col` | — | P1 |

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
| 스크린샷 기준선 | 5화면(overview·incident·evidence·work-order·compare) × 라이트/다크 × 390·1280·1440 × reduced on/off · `toHaveScreenshot({animations:'disabled'})` · 🔴 Playwright 기본 colorScheme=light → 프로젝트별 명시 | 전/후 이미지 |
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
| 3 진행·마감 | ④ 3·4·7(+6) + ③ P1 | 390 스택 · 진행 바 추정+done 스냅 · reduced 열 | 전 축 / 0 목표 |

각 PR = 전/후 스크린샷 1쌍 이상 · 상한 09-04.
