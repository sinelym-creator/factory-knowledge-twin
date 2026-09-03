/**
 * 모달이 열려 있는 동안 «배경»만 `inert` 로 덮는 순수 DOM 규칙 — D-44 / U-05.
 *
 * 🔴 화면(React) 없이 재기 위해 훅에서 떼어냈다. 여기서 증명해야 하는 것은 두 가지다 —
 *    ① 닫으면 «우리가 건 것»이 하나도 안 남는다(잔여 0) ② «남이 이미 건 것»은 걸지도
 *    지우지도 않는다. 둘 다 「오류가 안 났다」가 아니라 «수»로 나온다.
 */
export function markBackgroundInert(root: HTMLElement, scope: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  if (typeof HTMLElement === "undefined" || !("inert" in HTMLElement.prototype)) return changed;

  /* 모달로 가는 조상 사슬은 통과시킨다 — 최상위를 통째로 덮으면 모달 자신도 같이 죽는다. */
  const keep = new Set<Element>();
  for (let n: Element | null = root; n; n = n.parentElement) keep.add(n);

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
  walk(scope);
  return changed;
}

export function restoreBackgroundInert(changed: HTMLElement[]): void {
  for (const el of changed) el.inert = false;
}
