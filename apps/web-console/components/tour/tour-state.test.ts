import { describe, expect, it } from "vitest";

import {
  INITIAL_TOUR_STATE,
  migrateStatus,
  openedFrom,
  parseTourState,
  resumeStepOf,
  type TourState,
} from "./tour-state";

const TOTAL = 9;
const st = (status: TourState["status"], step = 0): TourState => ({ v: 1, status, step });

describe("U-04 정의된 상태로만 간다", () => {
  it("5상태는 그대로 통과한다", () => {
    for (const s of ["never", "running", "dismissed", "suppressed", "completed"] as const) {
      expect(migrateStatus(s)).toBe(s);
    }
  });

  it("구버전 이름은 «정해진 한 곳»으로만 간다", () => {
    expect(migrateStatus("active")).toBe("running");
    expect(migrateStatus("done")).toBe("completed");
    /* 🔴 `skipped` 는 어느 쪽인지 알 수 없다 — 「영구히 못 봄」이 「한 번 더 뜸」보다 나쁘므로
       보수적으로 `dismissed` 다. 이 비대칭이 뒤집히면 사용자가 투어를 영영 못 본다. */
    expect(migrateStatus("skipped")).toBe("dismissed");
  });

  it("🔴 모르는 값·빈 값은 «고쳐 쓰지 않고» 처음으로", () => {
    for (const bad of [undefined, null, "", "RUNNING", "paused", 3, {}, []]) {
      expect(migrateStatus(bad)).toBe("never");
    }
  });
});

describe("U-04b 재개 지점 — 이어서 갈 수 있는 것은 둘뿐", () => {
  it("먼저: 다섯 상태를 «전부» 넣는지 확인한다", () => {
    const all = ["never", "running", "dismissed", "suppressed", "completed"] as const;
    expect(all.length).toBe(5); // 하나라도 빠지면 아래 판정이 좁아진다
  });

  it("running·dismissed 만 단계를 기억하고 나머지는 1단계", () => {
    expect(resumeStepOf(st("running", 4))).toBe(4);
    expect(resumeStepOf(st("dismissed", 4))).toBe(4);
    expect(resumeStepOf(st("never", 4))).toBe(0);
    expect(resumeStepOf(st("suppressed", 4))).toBe(0);
    expect(resumeStepOf(st("completed", 4))).toBe(0);
  });

  it("🔴 「다시 보기」는 어떤 상태에서도 열리고, 이어갈 수 있으면 이어간다", () => {
    expect(openedFrom(st("completed", 7))).toEqual({ v: 1, status: "running", step: 0 });
    expect(openedFrom(st("dismissed", 7))).toEqual({ v: 1, status: "running", step: 7 });
    /* 끝낸 사람도 열려야 한다(규격 ①-3) — 열리지 않으면 「?」가 아무 반응 없는 버튼이 된다. */
  });
});

describe("U-04c 저장값 읽기", () => {
  it("없는 값·깨진 JSON·다른 버전은 처음으로", () => {
    expect(parseTourState(null, TOTAL)).toEqual(INITIAL_TOUR_STATE);
    expect(parseTourState("{not json", TOTAL)).toEqual(INITIAL_TOUR_STATE);
    expect(parseTourState(JSON.stringify({ v: 2, status: "running", step: 3 }), TOTAL)).toEqual(INITIAL_TOUR_STATE);
  });

  it("🔴 단계는 범위 안으로 «접는다» — 저장값이 화면을 벗어나게 두지 않는다", () => {
    expect(parseTourState(JSON.stringify({ v: 1, status: "running", step: 99 }), TOTAL).step).toBe(TOTAL - 1);
    expect(parseTourState(JSON.stringify({ v: 1, status: "running", step: -5 }), TOTAL).step).toBe(0);
    expect(parseTourState(JSON.stringify({ v: 1, status: "running", step: "3" }), TOTAL).step).toBe(0);
  });
});
