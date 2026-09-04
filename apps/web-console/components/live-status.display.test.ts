import { describe, expect, it } from "vitest";

import { displayState, type LiveMode } from "../lib/live-display";

/* D-53 처방 2 — 「보이는 값」 규칙을 화면 없이 잰다.
   🔴 자극 건수를 세는 것이 이 파일의 목적이다: 창이 지나야만 보이는 규칙이라, 브라우저
      축에서는 「한 번도 발동하지 않은 초록」이 나오기 쉽다. */
type Row = { mode: LiveMode; why: string | null; sessionExpired: boolean; checkedAt: string; seenAt: number };

const base: Row = {
  mode: "live",
  checkedAt: "2026-09-04T09:00:00Z",
  why: null,
  sessionExpired: false,
  seenAt: 1_000,
};

describe("displayState", () => {
  it("신선하면 아무것도 바꾸지 않는다", () => {
    expect(displayState(base, false)).toBe(base);
    expect(displayState({ ...base, mode: "replay" }, false).mode).toBe("replay");
  });

  it("낡으면 live·replay 만 «확인 중» 으로 내린다", () => {
    expect(displayState(base, true).mode).toBe("checking");
    expect(displayState({ ...base, mode: "replay" }, true).mode).toBe("checking");
  });

  it("낡아도 «못 물어봤다»는 후퇴시키지 않는다", () => {
    expect(displayState({ ...base, mode: "unavailable", why: "TypeError" }, true).mode).toBe(
      "unavailable",
    );
    expect(displayState({ ...base, mode: "checking" }, true).mode).toBe("checking");
  });

  it("세션 만료가 신선도를 이긴다", () => {
    const out = displayState({ ...base, sessionExpired: true }, true);
    expect(out.mode).toBe("unavailable");
    expect(out.why).toBe("재입장 필요");
  });

  it("원값은 건드리지 않는다 — 바뀌는 것은 «보이는» 사본뿐", () => {
    const src = { ...base };
    const out = displayState(src, true);
    expect(src.mode).toBe("live");
    expect(out).not.toBe(src);
    expect(out.checkedAt).toBe(src.checkedAt);
    expect(out.seenAt).toBe(src.seenAt);
  });
});
