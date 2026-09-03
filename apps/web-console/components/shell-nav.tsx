"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconAlert, IconCompare, IconGrid } from "@/components/icons";

/**
 * 셸 내비 — 레일(아이콘)·앱바(텍스트) 두 자리에서 «같은 목록»을 그린다(T6-4 ③ 셸 행).
 *
 * 🔴 클라이언트인 이유 하나: «현재 항목» 표시(틴트 12% pill)는 pathname 을 알아야 한다.
 *    셸 자체는 서버 컴포넌트(쿠키를 읽는다)라 여기만 떼어 냈다. 마크업은 떼어 내기 전과
 *    같다 — 링크 순서·sr-only 라벨 전부 그대로(DOM 순서 불변 규격). 아이콘만 글리프 → SVG.
 * 🔴 「현재」 판정은 «경로 앞부분»이다 — /incidents/INC-… 에서도 Incidents 가 켜져야 한다.
 */
export const NAV = [
  { href: "/overview", label: "Overview", Icon: IconGrid },
  { href: "/incidents/INC-2025-019", label: "Incidents", Icon: IconAlert },
  { href: "/compare", label: "Compare", Icon: IconCompare },
] as const;

function sectionOf(href: string) {
  return href.split("/").filter(Boolean)[0] ?? "";
}

export function ShellNav({ variant }: { variant: "rail" | "bar" }) {
  const pathname = usePathname();
  const current = sectionOf(pathname ?? "");

  if (variant === "rail") {
    return (
      <>
        {NAV.map((n) => {
          const active = sectionOf(n.href) === current;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-btn text-[20px] transition-colors duration-(--fkt-dur-1) ${
                active ? "bg-ai/12 text-ai" : "text-muted hover:bg-inset hover:text-ink"
              }`}
              title={n.label}
            >
              <n.Icon />
              <span className="sr-only">{n.label}</span>
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {NAV.map((n) => {
        const active = sectionOf(n.href) === current;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-pill px-2.5 py-1 transition-colors duration-(--fkt-dur-1) ${
              active ? "bg-ai/12 font-semibold text-ai" : "hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
