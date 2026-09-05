import { chromium } from "@playwright/test";
const [,, BASE] = process.argv;
const b = await chromium.launch();
const out = {};
for (const w of [390, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(1800);
  for (const s of ['[data-testid="tour-skip"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s); if (await l.count()) { await l.first().click().catch(()=>{}); await p.waitForTimeout(300); } }
  out[w] = {
    toggle: await p.locator('[data-testid="nav-menu-toggle"]').count(),
    drawer: await p.locator('[data-testid="nav-drawer"]').count(),
    statusRow: await p.locator('[data-testid="app-status-row"]').count(),
    navBar: await p.locator('[data-nav-variant="bar"]').count(),
    navRail: await p.locator('[data-nav-variant="rail"]').count(),
    navDrawerLinks: await p.locator('[data-nav-variant="drawer"]').count(),
    hScroll: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  };
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await b.close();
