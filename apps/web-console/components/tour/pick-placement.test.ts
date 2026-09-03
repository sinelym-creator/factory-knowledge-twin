import { describe, expect, it } from "vitest";

import { pickPlacement, type TourRect } from "./pick-placement";

const W = 1440;
const CALLOUT_W = 360;
const CALLOUT_H = 189;

/** 말풍선이 그 자리에 서면 대상과 겹치는가 — 판정식과 «독립»으로 다시 센다. */
const overlaps = (left: number, top: number, hole: TourRect) =>
  left < hole.left + hole.width &&
  hole.left < left + CALLOUT_W &&
  top < hole.top + hole.height &&
  hole.top < top + CALLOUT_H;

describe("U-01 대상이 화면 가운데", () => {
  const hole: TourRect = { left: 600, top: 300, width: 200, height: 100 };
  const top = 350;

  it("먼저: 이 형상이 «문제를 내는» 형상인지 확인한다", () => {
    /* 🔴 자극 증인. anchor 자리가 대상을 안 덮는 형상이면 이 케이스는 아무것도 안 묻는 셈이다. */
    expect(overlaps(hole.left, top, hole)).toBe(true);
  });

  it("대상을 안 덮는 자리를 고른다", () => {
    const p = pickPlacement({ hole, top, calloutW: CALLOUT_W, calloutH: CALLOUT_H, viewportW: W, coverAt: () => 1000 });
    expect(p.clear).toBe(true);
    expect(overlaps(p.left, top, hole)).toBe(false);
  });
});

describe("U-02 대상이 오른쪽 끝 (D-45 재현)", () => {
  /* 09-04 실측 그대로 — 도크 열이 x 1028~1424 를 차지하고 말풍선은 top 699 에 선다. */
  const hole: TourRect = { left: 1028, top: 57, width: 396, height: 786 };
  const top = 699;

  it("먼저: 두 옛 후보가 «같은 값으로 클램프»되어 문턱으로는 못 뒤집는 형상인지 확인한다", () => {
    const anchorLeft = Math.min(Math.max(12, hole.left), W - CALLOUT_W - 12);
    const besideLeft = Math.min(Math.max(12, hole.left + hole.width + 12), W - CALLOUT_W - 12);
    expect(besideLeft - anchorLeft).toBeLessThan(44); // 1068 - 1028 = 40
    expect(overlaps(anchorLeft, top, hole)).toBe(true);
    expect(overlaps(besideLeft, top, hole)).toBe(true);
  });

  it("덮은 넓이가 «전부 같아도» 대상을 안 덮는 자리로 간다", () => {
    /* 🔴 덮은 넓이를 상수로 준다 — 어떤 문턱도 못 뒤집는 조건에서 «경성 조건»만으로 움직이는지 본다. */
    const p = pickPlacement({ hole, top, calloutW: CALLOUT_W, calloutH: CALLOUT_H, viewportW: W, coverAt: () => 20789 });
    expect(p.clear).toBe(true);
    expect(p.side).not.toBe("anchor");
    expect(overlaps(p.left, top, hole)).toBe(false);
  });

  it("곁을 화면 끝보다 앞세운다 — 글자를 덜 덮어도 멀면 안 간다", () => {
    /* left=12 가 «가장 덜 덮는» 자리지만 대상은 x=1028 이다. 안내는 대상 곁에 서야 한다. */
    const p = pickPlacement({
      hole, top, calloutW: CALLOUT_W, calloutH: CALLOUT_H, viewportW: W,
      coverAt: (left) => (left <= 12 ? 1 : 9999),
    });
    expect(p.side).toBe("before");
    expect(p.left).toBeGreaterThan(12);
  });
});

describe("U-03 안 덮는 후보가 하나도 없음", () => {
  /* 대상이 화면을 통째로 차지하면 어느 자리에 서도 겹친다. */
  const hole: TourRect = { left: 0, top: 0, width: 1440, height: 900 };
  const top = 400;

  it("먼저: 정말로 «전부» 덮는 형상인지 확인한다", () => {
    for (const left of [12, 600, 1068]) expect(overlaps(left, top, hole)).toBe(true);
  });

  it("덜 덮는 쪽으로 떨어지고 clear=false 를 남긴다", () => {
    const p = pickPlacement({
      hole, top, calloutW: CALLOUT_W, calloutH: CALLOUT_H, viewportW: W,
      coverAt: (left) => (left === 12 ? 500 : 300),
    });
    expect(p.clear).toBe(false);
    expect(p.covered).toBe(300);
    /* 🔴 못 피한 것을 피한 척하지 않는다 — 자리는 고르되 `clear` 가 그 사실을 들고 나온다. */
  });
});

describe("U-02b 결정적이어야 한다", () => {
  const hole: TourRect = { left: 1028, top: 57, width: 396, height: 786 };
  it("같은 입력에 늘 같은 답", () => {
    const run = () => pickPlacement({ hole, top: 699, calloutW: CALLOUT_W, calloutH: CALLOUT_H, viewportW: W, coverAt: () => 7 });
    expect(run()).toEqual(run());
  });
});
