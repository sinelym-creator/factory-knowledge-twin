/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it } from "vitest";

import { markBackgroundInert, restoreBackgroundInert } from "./background-inert";

/* 🔴 jsdom 은 `inert` 의 «동작»(클릭·포커스 차단)을 구현하지 않는다. 여기서 재는 것은
   «장부»다 — 어디에 걸었고, 닫을 때 그것만 정확히 걷었는가. 실제 차단은 브라우저 축에서
   따로 쟀다(모달 열림 시 inert 루트 21 · 투어 13 · 닫으면 0). 그 경계를 흐리지 않는다. */
let polyfilled = false;
beforeAll(() => {
  if (!("inert" in HTMLElement.prototype)) {
    polyfilled = true;
    Object.defineProperty(HTMLElement.prototype, "inert", {
      get(this: HTMLElement) { return this.hasAttribute("inert"); },
      set(this: HTMLElement, v: boolean) { if (v) this.setAttribute("inert", ""); else this.removeAttribute("inert"); },
      configurable: true,
    });
  }
});

const build = () => {
  document.body.innerHTML = `
    <div id="a"><span>배경 1</span></div>
    <div id="b"><div id="modal-parent"><div id="modal">모달</div></div><div id="sibling">모달의 형제</div></div>
    <div id="c" inert>남이 이미 건 것</div>`;
  return document.getElementById("modal") as HTMLElement;
};

describe("U-05 inert 적용/해제", () => {
  it("먼저: 계측 환경이 `inert` 를 «읽고 쓸» 수 있는지 확인한다", () => {
    const el = document.createElement("div");
    el.inert = true;
    expect(el.inert).toBe(true); // 못 쓰면 아래 수치는 전부 거짓 0 이 된다
  });

  it("모달로 가는 조상 사슬은 통과시키고 그 형제만 덮는다", () => {
    const modal = build();
    const changed = markBackgroundInert(modal, document.body);
    const ids = changed.map((el) => el.id);
    expect(ids).toContain("a");
    expect(ids).toContain("sibling");
    expect(ids).not.toContain("b"); // 조상 사슬
    expect(ids).not.toContain("modal-parent"); // 조상 사슬
    expect(document.getElementById("modal")!.inert).toBe(false);
  });

  it("🔴 남이 이미 건 것은 «걸지도 지우지도» 않는다", () => {
    const modal = build();
    const changed = markBackgroundInert(modal, document.body);
    expect(changed.map((el) => el.id)).not.toContain("c");
    restoreBackgroundInert(changed);
    expect(document.getElementById("c")!.inert).toBe(true); // 남의 상태가 살아 있다
  });

  it("🔴 닫으면 «우리가 건 것» 잔여 0 — 수로 센다", () => {
    const modal = build();
    const before = document.querySelectorAll("[inert]").length; // 남이 건 1건
    const changed = markBackgroundInert(modal, document.body);
    const open = document.querySelectorAll("[inert]").length;
    expect(open).toBeGreaterThan(before); // 자극이 실제로 닿았다
    restoreBackgroundInert(changed);
    expect(document.querySelectorAll("[inert]").length).toBe(before);
  });

  it("🔴 두 번 걸어도 상태는 한 번만 바뀐다(멱등)", () => {
    const modal = build();
    const first = markBackgroundInert(modal, document.body);
    const second = markBackgroundInert(modal, document.body);
    expect(second.length).toBe(0); // 이미 걸린 것은 다시 안 센다
    const marked = document.querySelectorAll("[inert]").length;
    restoreBackgroundInert(second);
    expect(document.querySelectorAll("[inert]").length).toBe(marked); // 빈 되돌림은 아무것도 안 지운다
    restoreBackgroundInert(first);
    expect(document.querySelectorAll("[inert]").length).toBe(1); // 남이 건 1건만 남는다
  });

  it("계측 환경 기록: jsdom 에 `inert` 가 없어 폴리필했는가", () => {
    expect(typeof polyfilled).toBe("boolean"); // 값 자체를 남기려는 케이스 — 보고서에 적는다
  });
});
