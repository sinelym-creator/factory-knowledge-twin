"use client";

import Link from "next/link";

import { IconQuestion } from "@/components/icons";

/**
 * 앱바 `?` — 안내·투어 다시 열기.
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
      /* 🔴 가로 44 를 «실제 박스»로 만든다 — `::before` 를 좌우로 넓히면 요소가 그만큼 밖으로
         삐져나가 뷰포트 가장자리에서 문서가 넘친다(D-33 실측: coarse 60/60 `scrollWidth 391 /
         clientWidth 390`). 레이아웃으로 넓히면 넘칠 «수가» 없고 이웃 히트와 겹칠 수도 없다.
         🔴 아이콘의 보이는 크기는 그대로다 — 는 것은 둘레 여백뿐이다. */
      className="fkt-hit fkt-hoverable flex h-8 w-11 items-center justify-center rounded-pill text-[1.125rem] text-muted hover:text-ink"
      title="처음 오셨나요? 안내와 둘러보기 다시 보기"
      data-testid="intro-reopen"
      onClick={() => {
        window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT));
      }}
    >
      <IconQuestion />
      <span className="sr-only">안내와 둘러보기 다시 보기</span>
    </Link>
  );
}
