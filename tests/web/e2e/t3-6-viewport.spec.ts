import { test, expect, type Page } from "@playwright/test";

// 🔴 검출기는 `_layout-probes` 한 벌뿐이다 — T4-4 모바일 하네스가 같은 것을 쓴다.
import { STATE_TESTIDS, clipped, colorOnly, overlaps } from "./_layout-probes";

/**
 * T3-6 ④ — viewport 하네스. 3폭 × 5화면에서 «겹침 0 · 잘림 0 · 색만 구분 0».
 *
 * 정본: 티켓 `docs/plan/tickets/T3-6.md:30`(3폭 × 5화면) · wireframes §11.2(겹침·잘림) · §10(색만 구분 금지).
 *
 * 🔴 **스크린샷 기준선을 잡지 않는다.** 디자인이 확정되기 전 baseline 은 잡음만 만든다
 *    (10대 축 계획 §4). 대신 **레이아웃의 «사실»**을 잰다 — 넘친 픽셀, 겹친 사각형,
 *    글자 없는 상태 표시. 셋 다 스크린샷 없이 브라우저가 직접 답할 수 있는 것들이다.
 *
 * 🔴 **검출기마다 «검출할 수 있는가»를 먼저 증명한다.** 「겹침 0」은 「내 검출기가 아무것도
 *    못 본다」와 구별되지 않는다. 그래서 각 축에 **자극을 주입해 빨강을 내는 대조군**을 둔다.
 */

const WIDTHS = [1280, 1440, 1920];

/** 5화면 — run 을 만들지 않고 닿을 수 있는 자리로 골랐다(하네스가 대상 상태를 바꾸지 않게). */
const SCREENS = [
  { name: "overview", path: "/overview" },
  { name: "compare", path: "/compare" },
  { name: "incident", path: "/incidents/INC-2026-014" },
  { name: "evidence", path: "/evidence/EV-2025-001" },
  { name: "document", path: "/documents/DOC-MAN-0021" },
];

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

test.describe("T3-6 viewport 하네스 — 3폭 × 5화면", () => {
  test("🔴 검출기 자기 검증 — 겹침·잘림·색만 구분을 «실제로» 잡는가 (대조군 3본)", async ({ page }) => {
    await enter(page);

    // ⓐ 겹침 — 서로 포개지는 형제 둘을 주입한다
    const beforeOverlap = (await overlaps(page)).length;
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.style.cssText = "position:relative;height:60px";
      host.innerHTML =
        '<div data-testid="zz-ctl-a" style="position:relative;width:100px;height:40px"></div>' +
        '<div data-testid="zz-ctl-b" style="position:relative;width:100px;height:40px;margin-top:-30px"></div>';
      document.body.appendChild(host);
    });
    const injected = await overlaps(page);
    expect(
      injected.some((h) => h.includes("zz-ctl-a") && h.includes("zz-ctl-b")),
      `겹침 검출기가 «포개 놓은 둘»을 못 본다 — 기준선 ${beforeOverlap} · 주입 후 ${injected.length}`,
    ).toBe(true);

    // ⓑ 잘림 — 좁은 칸에 긴 글을 넣는다
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.setAttribute("data-testid", "zz-ctl-clip");
      el.style.cssText = "width:40px;overflow:hidden;white-space:nowrap";
      el.textContent = "이 문장은 사십 픽셀 안에 들어가지 않는다 " + "가".repeat(80);
      document.body.appendChild(el);
    });
    expect(
      (await clipped(page)).some((c) => c.includes("zz-ctl-clip")),
      "잘림 검출기가 «넘친 칸»을 못 본다",
    ).toBe(true);

    // ⓒ 색만 구분 — 글자도 라벨도 없는 상태 표시를 넣는다
    await page.evaluate(() => {
      const el = document.createElement("span");
      el.setAttribute("data-testid", "zz-ctl-color");
      el.style.cssText = "display:inline-block;width:12px;height:12px;background:red";
      document.body.appendChild(el);
    });
    expect(await colorOnly(page, ["zz-ctl-color"]), "색만 구분 검출기가 «글자 없는 표지»를 못 본다").toEqual([
      "zz-ctl-color",
    ]);
  });

  for (const width of WIDTHS) {
    for (const screen of SCREENS) {
      test(`${width}px × ${screen.name} — 겹침 0 · 잘림 0 · 색만 구분 0`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await enter(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(screen.path);
        // 🔴 그려지기 «전»에 재지 않는다 — 레이아웃은 늦게 선다(16대 자수 계보).
        await page.waitForLoadState("networkidle");
        await expect(page.locator("body"), "빈 화면이다 — 잴 것이 없다").not.toHaveText("");

        // 🔴 **훑은 «수»를 먼저 센다.** 0개를 훑고 낸 「위반 0」은 초록이 아니라 무측정이다
        //    (「제외한 것도 센다」·「빈 결과끼리의 일치는 일치가 아니다」 계보).
        const seen = await page.evaluate(
          (ids) => ({
            testids: document.querySelectorAll("[data-testid]").length,
            states: ids.reduce((n, id) => n + document.querySelectorAll(`[data-testid="${id}"]`).length, 0),
          }),
          STATE_TESTIDS,
        );
        expect(seen.testids, `이 화면에서 훑은 testid 가 0 이다 (${width}px · ${screen.name})`).toBeGreaterThan(5);
        expect(
          seen.states,
          `상태 표시를 하나도 못 찾았다 — 「색만 구분 0」이 공짜다 (${width}px · ${screen.name})`,
        ).toBeGreaterThan(0);
        test.info().annotations.push({
          type: "훑은 수",
          description: `${width}px ${screen.name}: testid ${seen.testids} · 상태 표시 ${seen.states}`,
        });

        expect(await clipped(page), `가로로 넘친 자리 (${width}px · ${screen.name})`).toEqual([]);
        expect(await overlaps(page), `겹친 자리 (${width}px · ${screen.name})`).toEqual([]);
        expect(
          await colorOnly(page, STATE_TESTIDS),
          `상태를 색«만»으로 말하는 자리 (${width}px · ${screen.name} · §10)`,
        ).toEqual([]);
      });
    }
  }
});
