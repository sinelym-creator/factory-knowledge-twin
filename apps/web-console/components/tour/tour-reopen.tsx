"use client";

import Link from "next/link";

/**
 * 앱바 「튜토리얼」 — 안내·투어 다시 열기.
 *
 * 🔴 **아이콘이 아니라 글자다**(폐하 하명 09-04 18:33 「? 가 아니라 튜토리얼 버튼」). `?` 는
 *    무엇을 여는지 눌러 보기 전에는 말하지 않는다 — 처음 온 사람이 가장 먼저 필요로 하는
 *    문이 가장 읽기 어려운 표지를 달고 있었다.
 *
 * 🔴 **링크만으로는 안 열리는 회차가 있다**(리바이2 34대 귀속 실측 6런): 클릭은 매번 닿는데
 *    (capture 계수 6/6) `location` 이 바뀌는 것은 2/6 이었다. 같은 pathname 에 쿼리만 붙는
 *    이동(`/overview` → `/overview?intro=1&tour=1`)에서만 나고, 경로가 바뀌는 이동은 3/3
 *    정상이었다. 즉 화면·저장·재개 로직은 멀쩡한데 **이동 자체가 안 일어난다**.
 *
 * 🔴 그래서 «열기»를 URL 에만 맡기지 않는다 — 클릭이 닿는 순간 이벤트도 함께 쏜다. 이동이
 *    성공하면 URL 이 열고, 실패해도 이벤트가 연다. 사람이 가장 자연스럽게 누르는 자리
 *    (overview 에서 다시 보기)가 정확히 실패하던 경로였다.
 *    링크 자체는 남긴다: 다른 화면에서는 «overview 로 데려가면서» 여는 일을 그것이 한다.
 */
export const TOUR_OPEN_EVENT = "fkt:tour-open";

export function TourReopen() {
  return (
    <Link
      href="/overview?intro=1&tour=1"
      /* 🔴 히트 44 는 «레이아웃 박스»로 만든다 — `::before` 를 좌우로 넓히면 요소가 그만큼
         밖으로 삐져나가 뷰포트 가장자리에서 문서가 넘친다(D-33 실측: coarse 60/60
         `scrollWidth 391 / clientWidth 390`). 이제 폭은 글자가 정하고(`px-3`), 고정 `w-11` 은
         버린다 — 「튜토리얼」이 44 보다 넓어서 좁은 상자에 가두면 글자가 잘린다. */
      className="fkt-hit fkt-hoverable flex h-8 items-center justify-center rounded-pill px-3 text-foot whitespace-nowrap text-muted hover:text-ink"
      title="처음부터 다시 보기"
      data-testid="intro-reopen"
      onClick={() => {
        window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT));
      }}
    >
      {/* 🔴 글자가 곧 이름이라 `sr-only` 를 함께 두지 않는다 — 두면 스크린리더가 같은 것을
          두 번 읽는다(보이는 라벨 + 숨은 라벨). `title` 은 설명이지 이름의 대체가 아니다. */}
      튜토리얼
    </Link>
  );
}
