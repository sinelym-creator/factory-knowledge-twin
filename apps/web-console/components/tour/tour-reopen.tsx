"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useTourAllowed } from "@/components/tour/tour-allowed";

/**
 * 앱바 「튜토리얼」 — 안내·투어 다시 열기.
 *
 * 🔴 **아이콘이 아니라 글자다**(폐하 하명 09-04 18:33 「? 가 아니라 튜토리얼 버튼」). `?` 는
 *    무엇을 여는지 눌러 보기 전에는 말하지 않는다 — 처음 온 사람이 가장 먼저 필요로 하는
 *    문이 가장 읽기 어려운 표지를 달고 있었다.
 *
 * 🔴 **링크가 아니라 버튼이다**(D-71 · O-15 원인 실측). `<Link href="/overview?intro=1&tour=1">`
 *    은 overview 에서 누를 때 **16/18 회차에서 이동하지 않았다**(prod 무대 `4be9a48` ·
 *    1440·1280·390 × 6회). 실패 회차는 클릭도 닿고(1/1) 이벤트도 나갔는데
 *    `history.pushState` 가 **0**이고 대신 `replaceState("/overview")` — 쿼리 없는 제자리로
 *    접혔다. 성공한 2회만 `pushState("/overview?intro=1&tour=1")` 였다. 갈림의 축은 폭이
 *    아니라 **prefetch 상태**였다: 실패 회차 RSC 요청 38건 / 성공 16건, 그리고 클릭보다
 *    **794ms 앞서** `/overview?_rsc=…`(쿼리 «없는» 자기 자신)이 미리 받아져 있었다.
 *    같은 pathname 에 쿼리만 얹는 이동이 자기 자신의 prefetch 캐시에 흡수된 것이다.
 *
 * 🔴 그래서 **이동을 라우터 캐시 경로에서 떼어낸다** — 같은 화면이면 URL 은 우리가 직접
 *    민다(`history.pushState`). 엔진의 판정을 설득하려 들지 않고 판정이 걸리는 자리를
 *    지나지 않는 쪽을 골랐다(D-67 과 같은 원칙: 구조로 고친다).
 *    다른 화면에서는 «데려가는 일»이 남아 있으므로 그때만 `router.push` 를 쓴다 — 경로가
 *    바뀌는 이동은 실측에서 3/3 정상이었다.
 *
 * 🔴 «열기»를 URL 에만 맡기지 않는 것은 그대로다: 클릭이 닿는 순간 이벤트도 함께 쏜다.
 *    URL 이 열든 이벤트가 열든, 사람이 누른 것은 반드시 열려야 한다.
 */
export const TOUR_OPEN_EVENT = "fkt:tour-open";

/**
 * 🔴 **D-95 — 이벤트는 «그 순간» 듣고 있던 것에게만 간다.**
 *
 * 실측(M-1 · 8/8 일치): 새로고침 뒤 앱바의 「튜토리얼」을 누르면 신호는 창에 분명히 닿고
 * 투어도 열리는데 **안내 카드만 안 열리는 회차**가 있었다. 갈림을 전부 설명한 열은 하나였다 —
 * 「클릭 «직전»에 개요 본문이 DOM 에 있었는가」. 본문이 스트리밍으로 늦게 붙는 회차에는 그
 * 1회성 신호를 들을 사람이 아직 없고, 뒤늦게 마운트한 본문에는 신호가 지나갔다는 사실조차
 * 남지 않는다(412×600 × `/overview` 직행 = **2/2 빨강**).
 *
 * 🔴 그래서 「열라」를 **적어 둔다**(래치). 듣는 쪽은 구독으로 읽으므로 두 경우가 한 길이 된다:
 *    이미 서 있었으면 통지로, 늦게 섰으면 첫 렌더에 그 값을 읽어서.
 *
 * 🔴 **저절로 꺼진다** — 적힌 신호는 창이 지나면 스스로 지워지고 통지한다. 스냅샷이
 *    「시간을 재는 식」이면 구독자가 통지 없이 값이 바뀌는 것을 보게 되므로, 값은 **불린**으로
 *    두고 끄는 일만 타이머가 한다. 닫기는 그보다 먼저 지운다(아래 `clearTourOpenRequest`).
 * 🔴 서버 스냅샷은 **false** — 서버에는 누른 사람이 없다.
 */
const OPEN_REQUEST_TTL_MS = 10_000;
let openRequested = false;
let expiry: ReturnType<typeof setTimeout> | null = null;
const openListeners = new Set<() => void>();

function notifyOpenRequest(): void {
  for (const l of openListeners) l();
}

/** 「열라」를 적는다 — 쏘는 쪽(클릭)이 부른다. */
export function markTourOpenRequested(): void {
  openRequested = true;
  if (expiry) clearTimeout(expiry);
  expiry = setTimeout(() => {
    expiry = null;
    if (!openRequested) return;
    openRequested = false;
    notifyOpenRequest();
  }, OPEN_REQUEST_TTL_MS);
  notifyOpenRequest();
}

/** 적힌 것을 지운다 — 닫기가 부른다(안 지우면 다음 마운트가 한 번 더 연다). */
export function clearTourOpenRequest(): void {
  if (expiry) {
    clearTimeout(expiry);
    expiry = null;
  }
  if (!openRequested) return;
  openRequested = false;
  notifyOpenRequest();
}

export function tourOpenRequested(): boolean {
  return openRequested;
}

export function subscribeTourOpenRequest(onChange: () => void): () => void {
  openListeners.add(onChange);
  return () => openListeners.delete(onChange);
}

/** 🔴 목적지는 «한 곳»에만 적는다 — 두 자리에 적으면 pushState 와 router.push 가 갈린다. */
const TOUR_HREF = "/overview?intro=1&tour=1";
const OVERVIEW_PATH = "/overview";

export function TourReopen() {
  /**
   * 🔴 **D-66 — 투어가 열려 있는 동안 이 버튼이 눌리지 않았다.**
   *
   * 오버레이는 「허용 노드로 가는 조상 경로는 통과시키고 그 형제만 `inert` 로 덮는다」
   * (`tour-overlay.tsx`). 안내 카드가 닫혀 있으면 허용 노드가 **0** 이라 통과시킬 경로도
   * 없고, 앱바를 품은 `app-shell.tsx:68` 의 래퍼가 통째로 `inert` 아래 들어간다.
   *
   * 🔴 고치는 방법은 안내 카드가 이미 쓰는 것과 **같은 장치**다(`overview-body.tsx`).
   *    태그가 `a` 에서 `button` 으로 바뀌어도 이 등록은 그대로 살아야 한다 — 등록이
   *    빠지면 투어를 다시 보려는 사람이 그 투어에 갇힌다.
   */
  const { registerAllowed } = useTourAllowed();
  const ref = useRef<HTMLAnchorElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerAllowed(el);
  }, [registerAllowed]);

  return (
    /* 🔴 **D-96 — 수화 «전»에 눌린 클릭이 통째로 버려졌다.** 열림 로직이 전부 `onClick`
       안에 있고 `<button>` 에는 기본 동작이 없어, 느린 기기(실측 400kbps·RTT 400ms·CPU×4)에서는
       버튼이 «보이는데» 눌러도 아무 일이 없었다(이벤트 0건 · 말풍선 0/3 · 본문이 선 뒤 클릭은
       같은 무대에서 3/3). 그래서 **수화 전에도 기본 동작이 있는** 요소로 바꾼다.
       🔴 **`<Link>` 가 아니다**(D-71 보존 · 위 머리말) — Next prefetch 경로에 올리면 같은
          pathname 쿼리 이동이 자기 캐시에 흡수되는 그 병이 돌아온다. 수화 «뒤» 클릭은
          `preventDefault()` 로 기본 이동을 막고 지금까지의 로직을 그대로 쓴다.
       🔴 이 한 줄만으로는 **부족했다**(#959 실측 early 0/3) — 입장 바운스가 쿼리를 버렸기
          때문이다. 그 2층은 `lib/session.ts` `resolveNext` + `proxy.ts` + `/enter` 가 함께 닫는다.
       🔴 `role="button"` 을 덧대지 않는다 — 이 요소는 이제 정말로 이동한다(수화 전 경로). */
    <a
      ref={ref}
      href={TOUR_HREF}
      /* 🔴 히트 44 는 «레이아웃 박스»로 만든다 — `::before` 를 좌우로 넓히면 요소가 그만큼
         밖으로 삐져나가 뷰포트 가장자리에서 문서가 넘친다(D-33 실측: coarse 60/60
         `scrollWidth 391 / clientWidth 390`). 이제 폭은 글자가 정하고(`px-3`), 고정 `w-11` 은
         버린다 — 「튜토리얼」이 44 보다 넓어서 좁은 상자에 가두면 글자가 잘린다. */
      className="fkt-hit fkt-hoverable flex h-8 items-center justify-center rounded-pill px-3 text-foot whitespace-nowrap text-muted hover:text-ink"
      title="처음부터 다시 보기"
      data-testid="intro-reopen"
      onClick={(e) => {
        /* 🔴 수화가 끝난 회차만 여기 온다 — 그때는 기본 이동을 막고 아래 로직이 연다
           (막지 않으면 전체 문서 이동이 나서 지금껏 지켜 온 SPA 거동이 깨진다). */
        e.preventDefault();
        /* 🔴 적는 것이 «먼저»다 — 쏘기 전에 적어야 이 클릭으로 새로 마운트하는 쪽도
           같은 신호를 읽는다. 순서를 뒤집으면 그 사이에 선 본문이 빈손으로 뜬다. */
        markTourOpenRequested();
        window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT));
        if (pathname === OVERVIEW_PATH) {
          /* 🔴 같은 화면 — 라우터를 거치지 않고 주소만 바꾼다. 새로고침·딥링크 공유가
             `?intro=1` 을 그대로 물려받고(서버가 그것을 읽는다), 이동 판정에 걸릴 자리를
             아예 지나지 않는다. */
          window.history.pushState(null, "", TOUR_HREF);
        } else {
          /* 다른 화면 — 여기서는 «데려가는 일»이 남아 있고, 경로가 바뀌는 이동은
             실측에서 걸린 적이 없다. */
          router.push(TOUR_HREF);
        }
      }}
    >
      {/* 🔴 글자가 곧 이름이라 `sr-only` 를 함께 두지 않는다 — 두면 스크린리더가 같은 것을
          두 번 읽는다(보이는 라벨 + 숨은 라벨). `title` 은 설명이지 이름의 대체가 아니다. */}
      튜토리얼
    </a>
  );
}
