/**
 * 말풍선 «가로 자리» 고르기 — 화면·DOM 없이 도는 순수 규칙(U-01~U-03).
 *
 * 🔴 규칙을 화면에서 떼어낸 이유: D-45 는 «규칙»의 결함이었는데 브라우저를 띄워야만 잴 수
 *    있었다. 입력(대상 상자·화면 폭·덮은 넓이)만 주면 답이 나오게 두면 그 결함을 단위로
 *    못 박을 수 있다. «얼마나 덮는가»만 바깥에서 준다 — 그건 DOM 이 있어야 아는 값이다.
 *
 * 순위(규격 ⑧-8) — ① «지목한 대상»을 덮지 않는다 ② 그중 글자를 덜 덮는다.
 * 곁(anchor·beside·before)을 화면 양 끝보다 앞세운다 — 안내는 대상 곁에 선다.
 */
export type TourRect = { top: number; left: number; width: number; height: number };
export type PlacementSide = "anchor" | "beside" | "before" | "edge-start" | "edge-end";
export type TourPlacement = { left: number; side: PlacementSide; covered: number; clear: boolean };

export function pickPlacement(input: {
  hole: TourRect;
  top: number;
  calloutW: number;
  calloutH: number;
  viewportW: number;
  /** 그 자리에 섰을 때 «읽는 것»을 얼마나 덮는가(px²). DOM 을 아는 쪽이 준다. */
  coverAt: (left: number) => number;
}): TourPlacement {
  const { hole, top, calloutW, calloutH, viewportW, coverAt } = input;
  const clampLeft = (x: number) => Math.min(Math.max(12, x), Math.max(12, viewportW - calloutW - 12));

  /* 🔴 «곁이냐»는 후보 자신이 들고 있어야 한다. 목록에서의 «순번»으로 판정하면, 앞의 후보가
     중복으로 빠진 걸음에서 화면 끝이 세 번째로 올라와 «곁»으로 둔갑한다(실측으로 겪은 자리). */
  const candidates: { side: PlacementSide; left: number; near: boolean }[] = [
    { side: "anchor", left: clampLeft(hole.left), near: true },
    { side: "beside", left: clampLeft(hole.left + hole.width + 12), near: true },
    { side: "before", left: clampLeft(hole.left - calloutW - 12), near: true },
    { side: "edge-start", left: clampLeft(12), near: false },
    { side: "edge-end", left: clampLeft(viewportW), near: false },
  ];
  /* 대상을 덮는가 — 가로·세로가 «둘 다» 겹쳐야 덮은 것이다. */
  const coversTarget = (left: number) =>
    left < hole.left + hole.width &&
    hole.left < left + calloutW &&
    top < hole.top + hole.height &&
    hole.top < top + calloutH;

  /* 같은 자리로 클램프된 후보는 하나로 친다 — 앞선 것(우선순위가 높은 것)이 이름을 갖는다. */
  const seen = new Set<number>();
  const scored = candidates
    .filter((c) => !seen.has(c.left) && (seen.add(c.left), true))
    .map((c) => ({ ...c, covered: coverAt(c.left), clear: !coversTarget(c.left) }));
  const near = scored.filter((c) => c.near && c.clear);
  const pool = near.length ? near : scored.filter((c) => c.clear);
  /* 동점은 앞선 후보가 이긴다(`<` 이므로) — 그래서 같은 화면에서 늘 같은 답이 나온다. */
  const best = (pool.length ? pool : scored).reduce((x, y) => (y.covered < x.covered ? y : x));
  return { left: best.left, side: best.side, covered: best.covered, clear: best.clear };
}
