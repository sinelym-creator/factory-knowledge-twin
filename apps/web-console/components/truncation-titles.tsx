"use client";

import { useEffect } from "react";

/**
 * 잘린 글자에 «전체 값»을 `title` 로 달아 둔다 — D-27 의 절반.
 *
 * 🔴 **보이는 것은 한 픽셀도 안 바뀐다.** 잘림 자체는 그대로 남는다(줄 수·글꼴·말줄임 위치는
 *    시안 영역이라 폐하 판단 대상이다). 바뀌는 것은 **「아무도 모른다」가 「알 수 있다」로**
 *    바뀌는 것뿐이다 — hover·롱프레스에서 전체 값이 뜬다.
 *
 * 🔴 **요소마다 손으로 달지 않는다.** 손으로 달면 «다음에 추가되는 카드»가 조용히 빠진다.
 *    한 곳에서 훑고, 잘린 것만 고른다.
 *
 * 🔴 **이미 `title` 이 있으면 건드리지 않는다.** 사람이 쓴 설명을 잘린 원문으로 덮으면
 *    그건 정보를 더한 게 아니라 바꾼 것이다.
 *
 * 🔴 우리가 «단» 것에는 `data-auto-title` 을 같이 남긴다 — 검증 그물이 「사람이 쓴 title」과
 *    「자동으로 붙은 title」을 가를 수 있어야 한다(그 구분이 없으면 title 을 읽는 기존 검사가
 *    조용히 다른 값을 읽게 된다).
 */

const MARK = "data-auto-title";

/** 그 요소가 «직접 가진» 글자. 자손의 글자는 그 자손의 것이다. */
function ownText(el: Element): string {
  let out = "";
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
  return out.trim().replace(/\s+/g, " ");
}

/**
 * 가로로 잘렸는가. 🔴 `scrollWidth > clientWidth` 하나로는 부족하다 — 스크롤되는 컨테이너도
 * 그 조건을 만족하지만 그건 «잘린» 것이 아니라 «넘겨 볼 수 있는» 것이다. 넘겨 볼 수 없게
 * 막아 둔 것(overflow hidden/clip)만 잘림으로 센다.
 */
function clipped(el: HTMLElement): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const cs = getComputedStyle(el);
  if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") return false;
  /* 🔴 **읽으라고 감춰 둔 글자를 「잘렸다」로 세지 않는다.** 스크린리더 전용 글자(`sr-only`)는
     1px 상자 + `clip-path` 로 «일부러» 접어 둔 것이라 `scrollWidth > clientWidth` 를 항상
     만족한다. 그걸 세면 수가 부풀고, 거기에 `title` 을 달면 «사람이 못 보는 자리»에 툴팁이
     생긴다(첫 실측: 14건 중 13건이 이 부류였다 — 진짜 잘림은 1건이었다). */
  if (cs.clipPath && cs.clipPath !== "none") return false;
  if (el.closest(".sr-only")) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 8 && r.height >= 8;
}

export function TruncationTitles() {
  useEffect(() => {
    let raf = 0;
    const ours = new Set<HTMLElement>();

    const sweep = () => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const text = ownText(el);
        if (!text) continue;
        const isOurs = el.hasAttribute(MARK);
        if (el.title && !isOurs) continue; // 사람이 쓴 title 은 덮지 않는다
        if (clipped(el)) {
          if (el.title !== text) {
            el.title = text;
            el.setAttribute(MARK, "");
            ours.add(el);
          }
        } else if (isOurs) {
          // 더 이상 안 잘리면 우리가 단 것을 거둔다(창을 넓혔을 때 낡은 title 이 남지 않게).
          el.removeAttribute("title");
          el.removeAttribute(MARK);
          ours.delete(el);
        }
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sweep);
    };

    schedule();
    window.addEventListener("resize", schedule);
    /* 내용이 늦게 오는 화면이 있어 DOM 이 바뀔 때도 다시 훑는다. 🔴 우리가 단 `title` 이
       다시 관찰을 부르지 않도록 속성 변화는 안 본다(무한 루프 자리). */
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      for (const el of ours) {
        el.removeAttribute("title");
        el.removeAttribute(MARK);
      }
    };
  }, []);

  return null;
}
