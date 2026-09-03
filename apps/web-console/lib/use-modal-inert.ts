"use client";

import { useEffect, type RefObject } from "react";

/**
 * 모달이 열려 있는 동안 «배경»을 실제로 막는다 — D-44.
 *
 * 🔴 **선언에 실제를 맞춘다.** `role="dialog" aria-modal` 은 보조기술에게 「밖은 탐색 대상이
 *    아니다」라고 «말한다». 그런데 포인터에는 배경이 열려 있었다 — 검증 좌석이 모달을 연 채
 *    배경의 「조사 시작」을 **실제로 눌러 화면 이동까지** 확인했다. 말과 실제가 다르면 고칠 것은
 *    말이 아니라 실제다(`aria-modal` 제거는 접근성을 되레 낮춘다 — 미채택).
 *
 * 🔴 **덮는 범위는 «경로»를 따른다.** 최상위를 통째로 `inert` 하면 모달 자신도 같이 죽는다.
 *    모달로 가는 조상 사슬은 통과시키고 그 형제만 덮는다.
 *
 * 🔴 **닫히면 «우리가 건 것»만, 그러나 전부 걷는다.** 남으면 화면이 죽는다 — 원래 `inert` 였던
 *    것은 애초에 건드리지 않으므로 되돌릴 때 남의 상태를 지우지도 않는다.
 *
 * 🔴 **폴백은 감시 형태다** — 배경 요소의 `tabindex` 를 저장·복원하지 않는다. 모달의 확인
 *    버튼은 대개 화면을 옮기고, 그러면 복원이 도는 시점에 그 DOM 이 없어 바꿔 둔 속성이 남는다
 *    (규격 §⑧-4 에서 같은 이유로 이미 이 형태를 골랐다). 감시는 아무것도 바꾸지 않아
 *    언마운트로 흔적 없이 사라진다.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalInert(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;

    const keep = new Set<Element>();
    for (let n: Element | null = root; n; n = n.parentElement) keep.add(n);

    const changed: HTMLElement[] = [];
    if (typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype) {
      const walk = (parent: Element) => {
        for (const child of Array.from(parent.children)) {
          if (!(child instanceof HTMLElement)) continue;
          if (child === root) continue;
          if (keep.has(child)) {
            walk(child);
            continue;
          }
          if (child.inert) continue; // 남이 건 것은 그대로 두고, 되돌릴 때도 안 건드린다
          child.inert = true;
          changed.push(child);
        }
      };
      walk(document.body);
    }

    const outside = (t: EventTarget | null) => t instanceof Node && !root.contains(t);
    /* 포인터만 막는다 — 키보드는 `inert` 와 아래 포커스 감시가 든다. `keydown` 까지 삼키면
       다른 화면의 Esc 를 대신 먹어 「닫으려던 것이 안 닫히는」 자리를 만든다. */
    const swallow = (e: Event) => {
      if (!outside(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!outside(e.target)) return;
      (root.querySelector<HTMLElement>(FOCUSABLE) ?? root).focus();
    };
    const types = ["pointerdown", "mousedown", "mouseup", "click"] as const;
    for (const t of types) document.addEventListener(t, swallow, true);
    document.addEventListener("focusin", onFocusIn, true);

    return () => {
      for (const t of types) document.removeEventListener(t, swallow, true);
      document.removeEventListener("focusin", onFocusIn, true);
      for (const el of changed) el.inert = false;
    };
  }, [open, ref]);
}
