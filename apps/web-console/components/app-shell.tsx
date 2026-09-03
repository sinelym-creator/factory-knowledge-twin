import Link from "next/link";
import { cookies } from "next/headers";

import { IconMark, IconQuestion } from "@/components/icons";
import { FallbackBanner, LiveStatusProvider, ModeBadge } from "@/components/live-status";
import { ResetButton } from "@/components/reset-button";
import { ShellNav } from "@/components/shell-nav";
import { StaticVisitorChip } from "@/components/static-visitor";
import { SESSION_COOKIE, chipLabel, parseSession } from "@/lib/session";

/**
 * 전역 셸 (wireframes §0) — 5화면 공통. P0 11항 중 4항(세션 격리·리셋·Live 감지·Replay
 * fallback)을 «어디서든 보이게» 담는 자리다.
 *
 * 구조는 ux-direction A안(Control Room): 좌측 아이콘 레일 + 상단 앱바(내비/모드/세션/리셋).
 * 🔴 셸이 담는 것은 «구조»까지다 — 계층 트리(260px)·알람 도크(360px)는 화면별 내용이라
 *    Phase 3 티켓이 채운다. 여기서 미리 그리면 5화면이 서로 다른 자리에 같은 것을 갖게 된다.
 * 🔴 chat-first 금지(§10) — 셸에 입력창을 두지 않는다.
 *
 * T6-4 ③ 셸 행: 레일·앱바 = glass+blur · 하단 1px label-4 · 현재 항목 틴트 12% pill.
 * ⑧: <md 에서는 레일을 접는다(앱바 텍스트 내비가 같은 목록을 갖는다 · DOM 은 그대로).
 *    앱바는 sticky — 긴 화면에서 모드 배지·리셋이 시야를 떠나지 않는다.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <LiveStatusProvider>
      <div className="flex min-h-dvh">
        {/* 좌측 아이콘 레일 — 화면이 늘어나도 내비가 자리를 먹지 않는다(A안 §②) */}
        <nav
          className="fkt-glass sticky top-0 hidden h-dvh w-(--spacing-rail) shrink-0 flex-col items-center gap-1 border-r border-edge py-3 md:flex"
          aria-label="주요 화면"
        >
          <span className="mb-3 flex h-10 w-10 items-center justify-center text-[22px] text-ai" aria-hidden>
            <IconMark />
          </span>
          <ShellNav variant="rail" />
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="fkt-glass sticky top-0 z-40 flex h-(--spacing-appbar) min-w-0 shrink-0 items-center gap-3 overflow-hidden border-b border-edge px-3 md:gap-4 md:px-4"
            data-testid="app-bar"
          >
            {/* ⑧ <md: 제목은 마크 하나로 접고(레일이 숨는 자리라 마크가 여기로 온다) 내비 pill 만 남긴다 */}
            <span className="flex text-[22px] text-ai md:hidden" aria-hidden>
              <IconMark />
            </span>
            <span className="hidden whitespace-nowrap text-body-c font-semibold tracking-tight md:inline">
              Factory Knowledge Twin
            </span>
            <nav className="flex shrink-0 gap-0.5 text-foot text-muted md:gap-1" aria-label="화면 이동">
              <ShellNav variant="bar" />
            </nav>

            <div className="ml-auto flex min-w-0 items-center gap-1.5 md:gap-2">
              {/* 🔴 안내 카드 재노출 — wireframes §0.1 ① 「앱바 `?` 아이콘으로 언제든 다시
                  연다」. 이 자리가 없어서 한 번 닫은 사람은 영영 못 열었다(결함 D-1의 절반).
                  링크로 둔다: 어느 화면에 있든 `/overview` 로 데려가면서 열리고, 클라이언트
                  JS 없이 키보드로 잡힌다. */}
              <Link
                href="/overview?intro=1"
                className="hidden h-7 w-7 items-center justify-center rounded-pill bg-inset text-foot text-muted transition-colors duration-(--fkt-dur-1) hover:text-ink sm:flex"
                title="처음 오셨나요? 안내 다시 보기"
                data-testid="intro-reopen"
              >
                <IconQuestion className="text-[16px]" />
                <span className="sr-only">안내 다시 보기</span>
              </Link>
              <ModeBadge />
              {/* 🔴 정적 재생본 방문자 — 서버 세션 칩과 «같은 자리, 다른 사실»이다.
                  서버 세션이 없을 때만 서므로 두 칩이 동시에 뜨지 않는다(T4-2a ⓒ). */}
              <StaticVisitorChip />
              {session && (
                <span
                  className="id hidden rounded-chip bg-inset px-2 py-1 text-cap text-muted sm:inline"
                  title={
                    session.origin === "api"
                      ? "이 세션의 변경은 다른 방문자에게 보이지 않습니다"
                      : "이 세션의 변경은 다른 방문자에게 보이지 않습니다 · 🔴 아직 백엔드에 등록되지 않은 임시 세션입니다"
                  }
                  data-testid="session-chip"
                  data-origin={session.origin}
                >
                  ⬡ {chipLabel(session)}
                  {session.origin === "pending" && <span className="ml-1 text-warn">*</span>}
                </span>
              )}
              {session && <ResetButton sessionId={session.id} />}
            </div>
          </header>

          {/* fallback 배너 슬롯 — 조건이 설 때만 자리를 차지한다(§0 조건부) */}
          <FallbackBanner sessionPending={session?.origin === "pending"} />

          <main className="min-w-0 flex-1 p-3 md:p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </LiveStatusProvider>
  );
}
