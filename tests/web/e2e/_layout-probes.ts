import { type Page } from "@playwright/test";

/**
 * _layout-probes — 레이아웃의 «사실»을 재는 검출기 3종 (T3-6 에서 세우고 T4-4 가 이어 쓴다).
 *
 * 🔴 **한 벌로 둔다.** 폭을 늘리려고 그물을 복사하면 두 벌이 갈라지고, 그때 어느 쪽이 정본인지
 *    아무도 모른다. 여기 있는 것만 고치면 데스크톱·모바일 양쪽이 함께 바뀐다.
 *
 * 🔴 검출기는 «검출할 수 있다»가 증명돼야 쓸 수 있다 — 자극을 주입해 빨강을 내는 대조군은
 *    `t3-6-viewport.spec.ts` 의 자기 검증 칸이 진다. 새 하네스는 그 칸을 다시 세우지 말고
 *    **같은 검출기를 쓴다는 사실**로 그 증명을 물려받는다.
 */

/** 상태를 «말하는» 자리 — 여기서 색만으로 구분하면 wireframes §10 위반이다. */
export const STATE_TESTIDS = [
  "mode-badge",
  "index-badge",
  "run-status",
  "wo-badge",
  "evidence-kind",
  "session-chip",
];

/** 가로로 넘친 자리. 🔴 «스크롤이 설계인» 칸(overflow-x auto/scroll)은 넘침이 아니다. */
export async function clipped(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) bad.push(`document(${doc.scrollWidth}>${doc.clientWidth})`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") continue; // 스크롤은 설계다
      if (el.scrollWidth > el.clientWidth + 1) {
        bad.push(`${el.getAttribute("data-testid")}(${el.scrollWidth}>${el.clientWidth})`);
      }
    }
    return bad;
  });
}

/** 형제끼리 사각형이 겹치는 자리. 부모-자식·겹칠 수 있는 층(모달·스크림)은 뺀다. */
export async function overlaps(page: Page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-testid]")).filter((e) => {
      const s = getComputedStyle(e);
      if (s.position === "fixed" || s.position === "absolute") return false; // 겹치라고 만든 층
      const r = e.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    const hits: string[] = [];
    for (let i = 0; i < els.length; i += 1) {
      for (let j = i + 1; j < els.length; j += 1) {
        const [a, b] = [els[i], els[j]];
        if (a.contains(b) || b.contains(a)) continue; // 포함은 겹침이 아니다
        const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) {
          hits.push(`${a.getAttribute("data-testid")} ∩ ${b.getAttribute("data-testid")} (${Math.round(w)}×${Math.round(h)})`);
        }
      }
    }
    return hits;
  });
}

/** 상태를 색«만»으로 말하는 자리 — 글자도 아이콘도 없으면 위반이다(§10). */
export async function colorOnly(page: Page, testids: string[]) {
  return page.evaluate((ids) => {
    const bad: string[] = [];
    for (const id of ids) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`))) {
        const text = (el.textContent ?? "").replace(/\s+/g, "").trim();
        const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
        if (!text && !label) bad.push(id);
      }
    }
    return bad;
  }, testids);
}
