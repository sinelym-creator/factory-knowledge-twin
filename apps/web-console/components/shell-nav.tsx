"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconAlert, IconCompare, IconGrid } from "@/components/icons";

/**
 * 셸 내비 — 레일(≥md)·드로어(<md) 두 자리에서 «같은 목록»을 그린다(T6-4 ③ 셸 행 · D-79).
 *
 * 🔴 D-79 에서 앱바 텍스트 탭(`variant="bar"`)이 사라졌다 — 그 자리는 햄버거 + 드로어가 받는다.
 *    두 자리가 «같은 생김새»가 되어 분기가 하나로 줄었고, `variant` 는 이제 그리는 방식이
 *    아니라 «어느 자리에 선 것인지»만 말한다(그 값이 그대로 `data-nav-variant` 가 된다).
 *
 * 🔴 클라이언트인 이유 하나: «현재 항목» 표시는 pathname 을 알아야 한다. 셸 자체는 서버
 *    컴포넌트(쿠키를 읽는다)라 여기만 떼어 냈다. 링크 순서·sr-only 라벨은 그대로다.
 * 🔴 레일은 «아이콘만 56px» 이 아니라 «라벨형 260px» 이다(폐하 09-03 14:24 재수립). 아이콘
 *    타일만 있는 레일은 무엇을 누르는지 라벨이 말해 주지 않아 값싸 보였다 — 리서치 §7-2·3.
 * 🔴 「현재」 판정은 «경로 앞부분»이다 — /incidents/INC-… 에서도 Incidents 가 켜져야 한다.
 * 🔴 **이 링크들에는 `.fkt-hit` 를 붙이지 않는다**(실측 2026-09-03). 세로로 4px 간격을 두고
 *    붙어 있어서 히트를 44 로 넓히면 «이웃끼리 서로 침범»한다 — `nav-incidents` 아래로는
 *    0px 만 늘고 그 자리는 `nav-compare` 가 답했다. 잘못된 링크가 눌리는 것은 개선이 아니다.
 *    행 높이(36→44)를 올리는 쪽은 «보이는 크기»가 바뀌므로 오케 판정 대상으로 회부한다.
 */
export const NAV = [
  { href: "/overview", label: "Overview", Icon: IconGrid, testid: "nav-overview" },
  { href: "/incidents/INC-2025-019", label: "Incidents", Icon: IconAlert, testid: "nav-incidents" },
  { href: "/compare", label: "Compare", Icon: IconCompare, testid: "nav-compare" },
] as const;

function sectionOf(href: string) {
  return href.split("/").filter(Boolean)[0] ?? "";
}

export function ShellNav({
  variant,
  hasSession,
}: {
  variant: "rail" | "drawer";
  /** 서버가 쿠키로 확정한 세션 유무 — 프리페치를 되살릴지 정하는 «유일한» 축(D-82b). */
  hasSession: boolean;
}) {
  const pathname = usePathname();
  const current = sectionOf(pathname ?? "");

  return (
      <>
        {NAV.map((n) => {
          const active = sectionOf(n.href) === current;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              /* 🔴 **프리페치를 끈다**(D-82). 레일은 ≥md 에서 상주라 첫 로드 즉시 이 href 를
                 RSC 로 미리 가져오는데, 그 시점이 `/` 의 입장 마운트가 `POST /enter` 로 세션을
                 만들기 «전»이면 쿠키 없이 나가 `proxy.ts:134` 의 307 을 받는다. 라우터 캐시에
                 남은 그 답(`/` 로 가라)을 나중 클릭이 그대로 쓰면 화면이 `/overview` 로
                 되돌아간다(리바이2 1280 실측 3/3 · 드로어는 열려야 마운트돼 안 걸렸다).
                 🔴 끄는 대가는 «첫 클릭이 미리 받아 둔 것을 못 쓴다»뿐이고, 그때는 세션이
                 이미 있어 정상 fetch 가 쿠키를 달고 나간다. 캐시에 오답을 «안 만드는» 쪽이
                 지운 뒤 고치는 쪽보다 싸다.
                 🔴 **D-82b — 세션이 «있으면» 되살린다.** 오염은 쿠키 없는 시점에만 생기므로,
                 상시 끄기는 원인보다 넓었다(그 대가 = 공개면 첫 클릭 ≈300ms · 리바이2 #717).
                 세션 유무는 서버가 쿠키로 확정한 값(`app-shell.tsx` 의 `session`)만 쓴다 —
                 클라이언트가 «있는 것 같다»로 추측하면 그 추측이 틀린 회차에 307 이 다시
                 캐시된다. 🔴 첫 로드 `/` 는 SSR 시점에 쿠키가 없어 off 로 렌더되는 것이
                 **의도**다(입장 전 = off · 입장 뒤 `/overview` 서버 렌더부터 on). */
              prefetch={hasSession ? undefined : false}
              /* 행 높이 36 · 좌우 12 · r10 — 선택은 «채움 + 흰 글자», 아이콘만 틴트. */
              data-testid={n.testid}
              /* 🔴 레일과 드로어가 «같은 `data-testid`» 를 쓴다 — 좁은 폭에서는 레일이
                 `display:none` 이고 드로어는 열렸을 때만 DOM 에 있다. 사람 눈엔 하나지만
                 둘이 함께 서는 순간이 있으므로 히트 실측이 «숨은 쪽»을 집을 수 있다(D-41).
                 🔴 testid 를 바꾸면 이미 그걸 쓰는 선택자·증거가 같이 죽으므로, **가르는 축을
                 하나 «더한다»**. `variant` 가 곧 그 값이다. */
              data-nav-variant={variant}
              /* 🔴 `.fkt-hit` 은 세로 히트를 44 로 편다(coarse). 리듬이 44 라야 그 44 가
                 이웃을 안 밟는다 — 그래서 간격 8 과 «같이» 붙인다(둘 중 하나만은 회귀다). */
              className={`fkt-hit flex h-9 items-center gap-2.5 rounded-chip px-3 text-body-c transition-colors duration-(--fkt-dur-1) ${
                active
                  ? "bg-fill font-semibold text-ink"
                  : "text-muted hover:bg-inset hover:text-ink"
              }`}
              title={n.label}
            >
              <n.Icon className={`text-[1.1875rem] ${active ? "text-ai" : ""}`} />
              {n.label}
            </Link>
          );
        })}
      </>
  );
}
