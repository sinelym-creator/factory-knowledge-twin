/** E-7 ⓒ — 종단(approved) 화면 412×600 자기 확인. 스텁 무대(:8804 ← :8803) · 구독 0. */
const _pw = await import("file:///C:/Users/sinel/repos/_wt/senku2-m1/tests/web/node_modules/@playwright/test/index.js");
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B = "http://127.0.0.1:8804", WO = "WOD-stub0001", OUT = "shot.png"] = process.argv.slice(2);
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${B}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.goto(`${B}/work-orders/${WO}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="wo-screen"]', { timeout: 20000 });
await page.waitForTimeout(1200);
const r = (el) => el ? (() => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null;
const m = await page.evaluate(() => {
  const q = (s) => document.querySelector(`[data-testid="${s}"]`);
  const box = (el) => el ? (() => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null;
  return {
    state: q("wo-screen")?.getAttribute("data-state"),
    approve: document.querySelectorAll('[data-testid="wo-approve"]').length,
    reject: document.querySelectorAll('[data-testid="wo-reject"]').length,
    final: q("wo-final")?.innerText ?? null,
    exit: q("wo-exit")?.innerText ?? null,
    exitHref: q("wo-exit")?.getAttribute("href") ?? null,
    exitBox: box(q("wo-exit")),
    saveState: q("wo-save-state")?.innerText ?? null,
    overflow: `scrollWidth ${document.documentElement.scrollWidth} / clientWidth ${document.documentElement.clientWidth}`,
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: OUT, fullPage: true });
console.log("스크린샷:", OUT);
await br.close();
