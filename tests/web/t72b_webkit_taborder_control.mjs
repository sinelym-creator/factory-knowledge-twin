/* webkit 의 「Tab 이 body 로 떨어진다」가 «드로어 트랩» 탓인지 «엔진 탭 순서» 탓인지 가른다(cap 0).
   🔴 손잡이 하나만 다르다 — 같은 폭·같은 화면에서 «드로어 열림» 여부만 바꾼다. */
import { webkit, chromium } from "@playwright/test";
const BASE = "https://factory-knowledge-twin.vercel.app";
const trail = async (page, n = 10) => {
  const t = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(90);
    t.push(await page.evaluate(() => {
      const a = document.activeElement;
      const p = document.querySelector('[data-testid="nav-drawer"]');
      return { id: a?.getAttribute?.("data-testid") ?? a?.tagName?.toLowerCase() ?? null, inDrawer: Boolean(p && a && p.contains(a)) };
    }));
  }
  return t;
};
const col = async (engine, tag, openDrawer) => {
  const b = await engine.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s); if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(400); }
  }
  if (openDrawer) { await p.locator('[data-testid="nav-menu-toggle"]').first().click(); await p.waitForTimeout(500); }
  const t = await trail(p);
  const bodyHits = t.filter((x) => x.id === "body").length;
  console.log(JSON.stringify({ engine: tag, drawerOpen: openDrawer, bodyHits, trail: t.map((x) => x.id) }));
  await b.close();
};
await col(webkit, "webkit", false);   // 드로어 «닫힘» — 트랩이 없는 화면
await col(webkit, "webkit", true);    // 드로어 «열림» — 트랩이 있는 화면
await col(chromium, "chromium", false); // 같은 조건의 다른 엔진(닫힘)
