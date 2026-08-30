import Link from "next/link";
import { cookies } from "next/headers";

import { FallbackBanner, LiveStatusProvider, ModeBadge } from "@/components/live-status";
import { ResetButton } from "@/components/reset-button";
import { SESSION_COOKIE, chipLabel, parseSession } from "@/lib/session";

/**
 * 전역 셸 (wireframes §0) — 5화면 공통. P0 11항 중 4항(세션 격리·리셋·Live 감지·Replay
 * fallback)을 «어디서든 보이게» 담는 자리다.
 *
 * 구조는 ux-direction A안(Control Room): 좌측 아이콘 레일 + 상단 앱바(내비/모드/세션/리셋).
 * 🔴 셸이 담는 것은 «구조»까지다 — 계층 트리(260px)·알람 도크(360px)는 화면별 내용이라
 *    Phase 3 티켓이 채운다. 여기서 미리 그리면 5화면이 서로 다른 자리에 같은 것을 갖게 된다.
 * 🔴 chat-first 금지(§10) — 셸에 입력창을 두지 않는다.
 */

const NAV = [
  { href: "/overview", label: "Overview", icon: "▣" },
  { href: "/incidents/INC-2025-019", label: "Incidents", icon: "▲" },
  { href: "/compare", label: "Compare", icon: "⧉" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <LiveStatusProvider>
      <div className="flex min-h-screen">
        {/* 좌측 아이콘 레일 — 화면이 늘어나도 내비가 자리를 먹지 않는다(A안 §②) */}
        <nav
          className="flex w-(--spacing-rail) shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel py-3"
          aria-label="주요 화면"
        >
          <span className="mb-3 text-ai" aria-hidden>
            ▣
          </span>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex h-9 w-9 items-center justify-center rounded text-muted hover:bg-bg hover:text-ink"
              title={n.label}
            >
              <span aria-hidden>{n.icon}</span>
              <span className="sr-only">{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="flex h-(--spacing-appbar) shrink-0 items-center gap-4 border-b border-edge bg-panel px-4"
            data-testid="app-bar"
          >
            <span className="text-sm font-semibold">Factory Knowledge Twin</span>
            <nav className="flex gap-3 text-xs text-muted" aria-label="화면 이동">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {/* 🔴 안내 카드 재노출 — wireframes §0.1 ① 「앱바 `?` 아이콘으로 언제든 다시
                  연다」. 이 자리가 없어서 한 번 닫은 사람은 영영 못 열었다(결함 D-1의 절반).
                  링크로 둔다: 어느 화면에 있든 `/overview` 로 데려가면서 열리고, 클라이언트
                  JS 없이 키보드로 잡힌다. */}
              <Link
                href="/overview?intro=1"
                className="rounded border border-edge px-2 py-1 text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
                title="처음 오셨나요? 안내 다시 보기"
                data-testid="intro-reopen"
              >
                <span aria-hidden>?</span>
                <span className="sr-only">안내 다시 보기</span>
              </Link>
              <ModeBadge />
              {session && (
                <span
                  className="id rounded border border-edge px-2 py-1 text-xs text-muted"
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

          <main className="min-w-0 flex-1 p-4">{children}</main>
        </div>
      </div>
    </LiveStatusProvider>
  );
}
