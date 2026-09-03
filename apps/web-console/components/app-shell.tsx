import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { IconMark, IconQuestion } from "@/components/icons";
import { FallbackBanner, LiveStatusProvider, ModeBadge } from "@/components/live-status";
import { ResetButton } from "@/components/reset-button";
import { ShellNav } from "@/components/shell-nav";
import { StaticVisitorChip } from "@/components/static-visitor";
import { TourProvider } from "@/components/tour/tour-provider";
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
 * 🔴 내비는 두 벌 다 DOM 에 있다(레일 = ≥md · 앱바 텍스트 = <md). 뷰포트마다 «하나만»
 *    보이므로 화면에는 중복이 없고, 목록·순서는 `shell-nav.tsx` 한 곳에서 온다.
 */

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <LiveStatusProvider>
      <div className="flex min-h-screen">
        {/* ── 좌측 레일 260 — glass 위에 라벨형 항목(리서치 §7-2·3) ───────────── */}
        <nav
          className="fkt-glass hidden w-(--spacing-rail) shrink-0 flex-col gap-1 px-3 py-4 md:flex"
          aria-label="주요 화면"
        >
          <div className="mb-5 flex items-center gap-2.5 px-3">
            <IconMark className="text-[22px] text-ai" />
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
            <span className="text-body-c font-semibold">Factory Knowledge Twin</span>
            <nav className="flex gap-1 text-foot text-muted md:hidden" aria-label="화면 이동">
              <ShellNav variant="bar" />
            </nav>

            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              {/* 🔴 안내 카드 재노출 — wireframes §0.1 ① 「앱바 `?` 아이콘으로 언제든 다시
                  연다」. 이 자리가 없어서 한 번 닫은 사람은 영영 못 열었다(결함 D-1의 절반).
                  링크로 둔다: 어느 화면에 있든 `/overview` 로 데려가면서 열리고, 클라이언트
                  JS 없이 키보드로 잡힌다. */}
              <Link
                href="/overview?intro=1&tour=1"
                className="fkt-hoverable flex h-8 w-8 items-center justify-center rounded-pill text-[18px] text-muted hover:text-ink"
                title="처음 오셨나요? 안내와 둘러보기 다시 보기"
                data-testid="intro-reopen"
              >
                <IconQuestion />
                <span className="sr-only">안내와 둘러보기 다시 보기</span>
              </Link>
              <ModeBadge />
              {/* 🔴 정적 재생본 방문자 — 서버 세션 칩과 «같은 자리, 다른 사실»이다.
                  서버 세션이 없을 때만 서므로 두 칩이 동시에 뜨지 않는다(T4-2a ⓒ). */}
              <StaticVisitorChip />
              {session && (
                <span
                  className="fkt-pill id bg-fill text-cap text-muted"
                  title={
                    session.origin === "api"
                      ? "이 세션의 변경은 다른 방문자에게 보이지 않습니다"
                      : "이 세션의 변경은 다른 방문자에게 보이지 않습니다 · 🔴 아직 백엔드에 등록되지 않은 임시 세션입니다"
                  }
                  data-testid="session-chip"
                  data-origin={session.origin}
                >
                  {chipLabel(session)}
                  {session.origin === "pending" && <span className="ml-1 text-warn">*</span>}
                </span>
              )}
              {session && <ResetButton sessionId={session.id} />}
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
    </LiveStatusProvider>
  );
}
