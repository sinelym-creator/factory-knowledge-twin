import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const [,, TARGET, CONTROL, OUT] = process.argv;
const b = await chromium.launch();
const look = async (base, w) => {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1600);
  for (const s of ['[data-testid="tour-skip"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s); if (await l.count()) { await l.first().click().catch(()=>{}); await p.waitForTimeout(250); } }
  const r = await p.evaluate(() => {
    const bar = document.querySelector('[data-testid="app-bar"]') || document.querySelector("header");
    if (!bar) return null;
    const br = bar.getBoundingClientRect();
    const mid = br.left + br.width / 2;
    const btns = [...bar.querySelectorAll("button")].filter((x) => !x.closest('[data-testid="nav-drawer"]'));
    const desc = btns.map((x) => {
      const rr = x.getBoundingClientRect();
      const o = x.closest("[data-testid]");
      return { testid: o ? o.getAttribute("data-testid") : null, x: +rr.left.toFixed(0),
               w: +rr.width.toFixed(0), h: +rr.height.toFixed(0), rightHalf: rr.left >= mid,
               visible: rr.width > 0 && rr.height > 0 };
    });
    return { barWidth: +br.width.toFixed(0), total: btns.length,
             rightHalf: desc.filter((d) => d.rightHalf).length,
             rightHalfVisible: desc.filter((d) => d.rightHalf && d.visible).length, buttons: desc };
  });
  await ctx.close();
  return r;
};
const out = { target390: await look(TARGET, 390), target1280: await look(TARGET, 1280), control390: await look(CONTROL, 390) };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
