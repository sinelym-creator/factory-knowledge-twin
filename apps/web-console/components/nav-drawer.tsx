"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconMark } from "@/components/icons";
import { ShellNav } from "@/components/shell-nav";

/**
 * <md 내비 드로어 (D-79) — 앱바의 텍스트 탭을 대신한다.
 *
 * 🔴 목록은 `shell-nav.tsx` 의 `NAV` 한 곳에서 온다 — 드로어는 «자리»만 다르고 항목은 레일과
 *    같은 것이다. 그래서 `ShellNav` 를 그대로 재사용하고 가르는 축은 `data-nav-variant` 하나만
 *    더한다(testid 불변 · D-41 계보).
 * 🔴 **드로어는 포털로 `body` 에 건다.** 배경을 `inert` 로 만들려면 «배경»과 «드로어»가 형제로
 *    갈라져 있어야 하는데, 앱바 안에 그리면 드로어가 자기가 끈 배경 안에 들어가 함께 죽는다.
 * 🔴 포커스 계약(오케 11:28 확정 ⓐⓑⓒ): ⓐ 열 때 포커스는 드로어 «안»으로 · ⓑ 닫을 때
 *    여는 버튼으로 «되돌아온다»(안 되돌리면 키보드 사용자는 문서 처음으로 떨어진다) ·
 *    ⓒ `aria-modal` + 배경 `inert` 속성 실재. ⓓ 초점 가둠은 이번 판정선 밖이라 두지 않았다.
 */
export function NavDrawer({ shellRootId }: { shellRootId: string }) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 🔴 포털은 `document` 가 있어야 하지만 «마운트 감지 상태»는 필요 없다 — 포털을 그리는 조건이
  //    `open` 이고, `open` 은 클릭으로만 참이 되므로 서버 렌더에서는 이 가지에 들어오지 않는다.
  //    (상태를 하나 두고 effect 로 켜면 그 자체가 「effect 안 동기 setState」 지적을 부른다.)

  /** 세 갈래(Esc·스크림·링크)가 모두 여기로 온다 — 닫는 «상태»만 바꾼다. */
  const close = useCallback(() => setOpen(false), []);

  // Esc — 문서 축에 건다(포커스가 드로어 어디에 있든 닫힌다).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ⓒ 배경 inert — 열려 있는 동안만. 🔴 정리 축을 반드시 되돌린다(안 지우면 문을 닫아도 화면
  //    전체가 죽은 채로 남는다).
  // 🔴 **이 효과가 아래 포커스 효과보다 «먼저» 선언돼야 한다.** 같은 커밋에서 효과는 선언
  //    순서로 도는데, `inert` 를 벗기기 «전»에 포커스를 부르면 여는 버튼이 아직 죽은 영역
  //    안이라 `focus()` 가 조용히 거부되고 초점이 `body` 로 떨어진다(실측으로 잡은 자리).
  useEffect(() => {
    const root = document.getElementById(shellRootId);
    if (!root) return;
    if (open) root.setAttribute("inert", "");
    else root.removeAttribute("inert");
    return () => root.removeAttribute("inert");
  }, [open, shellRootId]);

  // ⓐ 열 때는 드로어 첫 링크로 · ⓑ 닫을 때는 여는 버튼으로 되돌린다.
  // 🔴 «닫힘»은 처음 렌더와 구별해야 한다 — 열린 적이 없는데 포커스를 옮기면 페이지에 들어오자마자
  //    초점이 햄버거로 튄다. 그래서 열렸던 사실을 ref 로 들고 그때만 되돌린다.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const first = panelRef.current?.querySelector<HTMLElement>("a[href]");
      (first ?? panelRef.current)?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    toggleRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={toggleRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={drawerId}
        aria-label="화면 이동 메뉴"
        data-testid="nav-menu-toggle"
        /* 히트 44 — 가로도 44 라야 한다(이웃이 없는 자리라 넓혀도 남을 안 밟는다). */
        className="fkt-hit -ml-1.5 flex h-11 w-11 items-center justify-center rounded-chip text-muted transition-colors duration-(--fkt-dur-1) hover:bg-inset hover:text-ink md:hidden"
      >
        <span aria-hidden className="flex h-4 w-5 flex-col justify-between">
          <span className="h-0.5 w-full rounded bg-current" />
          <span className="h-0.5 w-full rounded bg-current" />
          <span className="h-0.5 w-full rounded bg-current" />
        </span>
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 md:hidden" data-testid="nav-drawer-layer">
              {/* 스크림 — 클릭 = 닫힘. 버튼으로 두어야 포인터 없이도 존재가 설명된다. */}
              <button
                type="button"
                aria-label="메뉴 닫기"
                data-testid="nav-drawer-scrim"
                onClick={close}
                className="absolute inset-0 h-full w-full bg-ink/40"
              />
              <div
                id={drawerId}
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="주요 화면"
                tabIndex={-1}
                data-testid="nav-drawer"
                /* 좌측 슬라이드 — 폭은 레일과 같은 토큰을 쓴다(새 토큰 0). */
                className="fkt-glass absolute inset-y-0 left-0 flex w-(--spacing-rail) max-w-[85vw] flex-col gap-2 px-3 py-4 shadow-xl"
                /* 링크 클릭 = 닫힘. 목록이 늘어도 이 한 줄이 계속 답한다(항목마다 달면 새 항목이 샌다). */
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a[href]")) close();
                }}
              >
                <div className="mb-5 flex items-center gap-2.5 px-3">
                  <IconMark className="text-[1.375rem] text-ai" />
                  <span className="text-body-c font-semibold">Factory Twin</span>
                </div>
                <p className="mb-1 px-3 text-cap font-semibold text-placeholder">화면</p>
                <ShellNav variant="drawer" />
                <p className="mt-auto px-3 text-cap text-placeholder">
                  synthetic PoC · 실제 공장 데이터가 아닙니다
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
