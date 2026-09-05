import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { IconMark, IconQuestion } from "@/components/icons";
import { FallbackBanner, LiveStatusProvider, ModeBadge, RunCapCounter } from "@/components/live-status";
import { NavDrawer } from "@/components/nav-drawer";
import { ResetButton } from "@/components/reset-button";
import { ShellNav } from "@/components/shell-nav";
import { TruncationTitles } from "@/components/truncation-titles";
import { StaticVisitorChip } from "@/components/static-visitor";
import { TourAllowedProvider } from "@/components/tour/tour-allowed";
import { TourProvider } from "@/components/tour/tour-provider";
import { TourReopen } from "@/components/tour/tour-reopen";
import { SESSION_COOKIE, chipLabel, parseSession } from "@/lib/session";

/**
 * 전역 셸 (wireframes §0) — 5화면 공통. P0 11항 중 4항(세션 격리·리셋·Live 감지·Replay
 * fallback)을 «어디서든 보이게» 담는 자리다.
 *
 * 구조는 ux-direction A안(Control Room)의 재수립본: **좌측 260px 라벨 레일 + 52px glass 앱바**.
 * 🔴 폐하 09-03 14:24 「지금 디자인으로는 안 된다 · 레이아웃도 다시」 → 셸에서 바뀐 것 3:
 *    ① 아이콘만 있던 56px 레일 → 라벨형 260px(무엇을 누르는지 글자가 말한다)
 *    ② 유니코드 글리프(▣▲⧉?⟲) → 선형 SVG(글리프는 폰트마다 굵기·정렬이 달라 값싸 보인다)
 *    ③ 1px 테두리로 나누던 면 → **표면 밝기 차**로 나눈다(테두리는 리스트 행 사이에만)
 * 🔴 셸이 담는 것은 «구조»까지다 — 화면별 내용(트리·도크)은 화면이 채운다.
 * 🔴 chat-first 금지(§10) — 셸에 입력창을 두지 않는다.
 * 🔴 내비 자리는 둘이다(레일 = ≥md 상주 · 드로어 = <md 이고 «열렸을 때만» DOM 에 있다 · D-79).
 *    목록·순서는 `shell-nav.tsx` 한 곳에서 온다.
 */

/**
 * 🔴 드로어가 열리면 이 노드에 `inert` 가 걸린다(포커스 계약 ⓒ). 드로어는 포털로 `body` 에
 *    나가 있어서 자기가 끈 배경 «밖»에 선다 — id 를 넘겨 주는 이유가 그것이다.
 */
const SHELL_ROOT_ID = "fkt-shell-root";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);

  // 🔴 **`api` 출신 세션만 싣는다**(T7-38 · 계약 v0.1.15) — `pending` 은 백엔드가 모르는
  //    임시 id 라, 그것으로 상한을 물으면 서버는 «그 id 의» 빈 상한을 답한다(화면이 실제로는
  //    쓸 수 없는 세션에 대해 「N회 남음」을 말하게 된다). 모를 때는 묻지 않는다.
  const capSessionId = session?.origin === "api" ? session.id : null;

  return (
    <LiveStatusProvider sessionId={capSessionId}>
      {/* 🔴 T7-28 — 투어의 «허용 노드» 등록소. `<TourProvider />` 는 `<main>` 의 **형제**라
          거기 만든 컨텍스트는 본문의 안내 카드에 닿지 않는다. 그래서 둘의 공통 조상인 이
          자리에 둔다. 🔴 투어 OFF 면 등록은 배열 하나를 늘릴 뿐 화면은 변하지 않는다 —
          `inert` 를 거는 것은 오버레이이고, OFF 면 오버레이가 트리에 없다. */}
      <TourAllowedProvider>
      {/* 잘린 글자에 전체 값을 `title` 로 — 한 곳에서 훑는다(요소마다 달면 새 카드가 빠진다). */}
      <TruncationTitles />
      <div id={SHELL_ROOT_ID} className="flex min-h-screen">
        {/* ── 좌측 레일 260 — glass 위에 라벨형 항목(리서치 §7-2·3) ───────────── */}
        <nav
          /* 🔴 간격 8 — 행 36 + 간격 8 = 리듬 44. 간격 4 면 44 히트가 이웃을 6px 씩 침범한다. */
          className="fkt-glass hidden w-(--spacing-rail) shrink-0 flex-col gap-2 px-3 py-4 md:flex"
          aria-label="주요 화면"
        >
          <div className="mb-5 flex items-center gap-2.5 px-3">
            <IconMark className="text-[1.375rem] text-ai" />
            <span className="text-body-c font-semibold">Factory Twin</span>
          </div>

          <p className="mb-1 px-3 text-cap font-semibold text-placeholder">화면</p>
          <ShellNav variant="rail" />

          <p className="mt-auto px-3 text-cap text-placeholder">
            synthetic PoC · 실제 공장 데이터가 아닙니다
          </p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── 앱바 52 — sticky glass + 하단 헤어라인 1px(리서치 §7-2) ────────── */}
          <header
            /* 🔴 390 가로 스크롤의 근인이 이 줄이었다(실측: 우측 액션 묶음 폭 237~327 →
               scrollWidth 593~682). 배지·칩·리셋은 P0 표지라 «숨길» 수 없으므로 좁은 폭에서는
               줄을 늘린다 — 높이를 고정(h-)에서 최소(min-h-)로 바꾸고 wrap 을 연다. */
            className="fkt-glass sticky top-0 z-20 flex min-h-(--spacing-appbar) shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-edge px-5 py-1.5 md:flex-nowrap md:py-0"
            data-testid="app-bar"
          >
            {/* 🔴 D-79 — <md 내비는 텍스트 탭이 아니라 «햄버거 + 드로어»다. 탭 3개가 브랜드와
                같은 줄을 다투면서 앱바가 두 줄로 접혔다(390 실측). 버튼은 브랜드 «왼쪽»에
                둔다 — 여는 자리와 열리는 자리(좌측 슬라이드)가 같은 쪽이라야 방향이 읽힌다. */}
            <NavDrawer shellRootId={SHELL_ROOT_ID} />
            {/* 🔴 <md 는 「Factory Twin」(드로어 머리와 같은 축약) · ≥md 는 전체명. 브랜드를 두 벌
                두고 하나씩 숨기면 문면 선택자가 «둘»을 찾는다 — 그래서 **가운데 낱말만** 접는다.
                DOM 은 한 벌이고 텍스트 노드도 한 흐름이다. */}
            <span className="text-body-c font-semibold whitespace-nowrap" data-testid="app-brand">
              Factory <span className="hidden md:inline">Knowledge </span>Twin
            </span>

            {/* 🔴 앱바 우측은 «버튼»만 남긴다(D-79 ②) — 상태 표지 3종은 아래 한 줄로 내려간다.
                누르는 것과 읽는 것이 한 줄에 섞여 있으면 좁은 폭에서 어느 쪽도 자리를 못 지킨다. */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              <TourReopen />
              {session && <ResetButton sessionId={session.id} />}
            </div>

            {/*
              🔴 상태 3종 = **단일 DOM**(D-79 ③). <md 는 앱바 아래 한 줄(`basis-full order-last`)에
                 테두리·채움 없는 텍스트로, ≥md 는 지금의 pill 그대로 — 가르는 것은 `md:` 접두뿐이다.
                 DOM 을 두 벌 두면 히트·문면 실측이 «숨은 쪽»을 집는다(D-41 이 남긴 값).
              🔴 pill 껍데기는 각 컴포넌트가 자기 클래스로 들고 있어서, 벗기는 일은 이 줄이
                 자손 선택자로 한다. `.fkt-pill` 의 배경은 `background` 단축이라 `background-color`
                 유틸로는 안 덮인다 — 그래서 `!` 를 쓴다(사정거리 = 이 행 · <md 뿐).
            */}
            <div
              data-testid="app-status-row"
              className="flex min-w-0 items-center gap-x-1.5 text-foot text-muted
                         max-md:order-last max-md:basis-full max-md:gap-x-0 max-md:pb-0.5
                         max-md:[&_.fkt-pill]:!min-h-0 max-md:[&_.fkt-pill]:!bg-transparent max-md:[&_.fkt-pill]:!px-0 max-md:[&_.fkt-pill]:!font-normal
                         max-md:[&_[data-testid=session-chip]]:!bg-transparent max-md:[&_[data-testid=session-chip]]:!px-0 max-md:[&_[data-testid=session-chip]]:!font-normal
                         max-md:[&_[data-testid=static-visitor-chip]]:!border-0 max-md:[&_[data-testid=static-visitor-chip]]:!px-0 max-md:[&_[data-testid=static-visitor-chip]]:!py-0
                         max-md:[&>*+*]:before:mx-1.5 max-md:[&>*+*]:before:text-placeholder max-md:[&>*+*]:before:content-['·']"
            >
              <ModeBadge />
              {/* 🔴 T7-38 — 배지 «곁». LIVE 일 때만 서고, 그 밖의 모드에서는 렌더 0 이라
                  앱바 폭은 지금과 같다(계약 v0.1.15 규격 · 새 요소는 이 하나뿐). */}
              <RunCapCounter />
              {/* 🔴 정적 재생본 방문자 — 서버 세션 칩과 «같은 자리, 다른 사실»이다.
                  🔴 **조건을 여기에 둔다**(O-12). 이 주석은 「서버 세션이 없을 때만 선다」고
                     말해 왔지만 `StaticVisitorChip` 은 `?run=` 이 정적 id 인지만 보고 세션은
                     보지 않는다 — 세션을 가진 사람이 정적 주소를 열면 두 칩이 나란히 떴고,
                     그러면 화면이 「이 브라우저가 기억한다」와 「서버가 이 세션을 안다」를
                     한꺼번에 주장한다. 조건은 세션을 «아는 층»인 여기가 건다(컴포넌트는
                     `?run=` 만 알면 된다 · T4-2a ⓒ). */}
              {!session && <StaticVisitorChip />}
              {session && (
                <span
                  className="fkt-pill id bg-fill text-cap text-muted"
                  title={
                    session.origin === "api"
                      ? `내 세션 ${chipLabel(session)} · 이 세션에서 바꾼 것은 다른 방문자에게 보이지 않습니다`
                      : `내 세션 ${chipLabel(session)} · 이 세션에서 바꾼 것은 다른 방문자에게 보이지 않습니다 · 아직 백엔드에 등록되지 않은 임시 세션입니다`
                  }
                  data-testid="session-chip"
                  data-origin={session.origin}
                >
                  내 세션 <span className="id">{chipLabel(session)}</span>
                  {session.origin === "pending" && <span className="ml-1 text-warn">*</span>}
                </span>
              )}
            </div>
          </header>

          {/* fallback 배너 슬롯 — 조건이 설 때만 자리를 차지한다(§0 조건부) */}
          <FallbackBanner sessionPending={session?.origin === "pending"} />

          {/* T6-5 가이드 투어 — 🔴 **OFF 면 렌더 0**(폐하 13:46). 상태는 브라우저에만 있고,
              대상은 `data-testid` 로 찾으므로 다른 컴포넌트는 한 줄도 바뀌지 않는다.
              🔴 `useSearchParams` 를 쓰므로 Suspense 경계가 필요하다 — 없으면 이 한 컴포넌트가
                 셸 전체를 클라이언트 렌더로 끌고 내려간다(빌드가 그 자리에서 막는다). */}
          {/* 🔴 초대 배너는 본문 «위»에 문서 흐름으로 선다(겹침 0) · 스텝 오버레이는 이
              안에서 fixed 로 뜬다(그건 대상 위에 떠야 하는 것이 맞다). */}
          <div className="px-5 md:px-6">
            <Suspense fallback={null}>
              <TourProvider />
            </Suspense>
          </div>

          {/* 본문 = 최대 1440 · 좌우 24 · 위아래 24(리서치 §7-10 컨테이너) */}
          <main className="mx-auto min-w-0 w-full max-w-[1440px] flex-1 px-5 py-6 md:px-6">
            {children}
          </main>
        </div>
      </div>
      </TourAllowedProvider>
    </LiveStatusProvider>
  );
}
