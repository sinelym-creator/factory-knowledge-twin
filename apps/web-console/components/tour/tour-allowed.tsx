"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * T7-28 — 포커스 경계의 «허용 노드»를 셀렉터가 아니라 **상태**로 든다 (D-1 재수리).
 *
 * 🔴 **왜 셀렉터로는 안 되는가.** 앞판은 `tour-overlay` 의 효과 안에서
 *    `document.querySelector('[data-testid="intro-card"]')` 를 **효과가 도는 «그 순간» 한 번**
 *    읽었다. 안내 카드가 그 뒤에 붙으면 다시 읽을 계기가 없어, 카드는 「배경」으로 분류된 채
 *    `inert` 뒤로 들어간다 — 그 카드의 「안내 닫기」가 출구인데 눌리지 않는다.
 *    실측(리바이2 19회차): 재열람 **19/19 FAIL** · 카드 첫 등장 시점에 `main` 은 이미 `inert`.
 *    상류·지연·커밋과 무관했다 — 그래서 원인은 «시점»이 아니라 «구조»다.
 *
 * 🔴 **MutationObserver 도 아니다**(2차 시도 · #553). 관찰로 다시 계산하게 만들었더니 카드가
 *    «사라졌다». 원인이 확정되지 않은 처방을 다시 쓰지 않는다.
 *
 * 🔴 **왜 `tour-provider` 안의 컨텍스트가 아닌가 — 트리가 그렇게 생기지 않았다.**
 *    `app-shell.tsx` 에서 `<TourProvider />` 는 `<main>{children}</main>` 의 **형제**다.
 *    거기서 만든 컨텍스트는 카드(`overview-body`)에 **닿지 않는다** — 그래서 둘의 «공통 조상»
 *    자리에 이 provider 를 따로 세운다. 발주 문면의 ①과 다른 것은 이 한 가지이고,
 *    이유는 코드가 아니라 트리다.
 *
 * 🔴 **투어 OFF 화면은 변하지 않는다.** 등록은 배열 하나를 늘릴 뿐이고, `inert` 를 거는 것은
 *    오버레이다 — 오버레이가 트리에 없으면 등록은 아무 일도 하지 않는다.
 *    `children` 은 prop 으로 그대로 통과하므로, 등록으로 인한 상태 변화가 본문을 다시 그리지도
 *    않는다(React 가 같은 element 참조를 보고 건너뛴다).
 */

type TourAllowedContextValue = {
  /** 지금 «허용»으로 등록되어 있는 노드들. 오버레이가 이것을 의존 배열에 넣는다. */
  allowed: readonly HTMLElement[];
  /** 등록하고, 해제 함수를 돌려준다(효과의 cleanup 에 그대로 쓴다). */
  registerAllowed: (el: HTMLElement) => () => void;
};

const NOOP = () => {};

const TourAllowedContext = createContext<TourAllowedContextValue>({
  allowed: [],
  registerAllowed: () => NOOP,
});

export function TourAllowedProvider({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<readonly HTMLElement[]>([]);

  const registerAllowed = useCallback((el: HTMLElement) => {
    /* 🔴 같은 노드를 두 번 넣지 않는다 — 넣으면 배열 «참조»가 매번 바뀌어 오버레이의 효과가
       끝없이 다시 돈다(내가 만든 전이를 내가 다시 만드는 자리). */
    setAllowed((prev) => (prev.includes(el) ? prev : [...prev, el]));
    return () => setAllowed((prev) => (prev.includes(el) ? prev.filter((x) => x !== el) : prev));
  }, []);

  const value = useMemo(() => ({ allowed, registerAllowed }), [allowed, registerAllowed]);
  return <TourAllowedContext.Provider value={value}>{children}</TourAllowedContext.Provider>;
}

export function useTourAllowed(): TourAllowedContextValue {
  return useContext(TourAllowedContext);
}
