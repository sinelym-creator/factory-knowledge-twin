const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = process.argv[2];
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
const page = await ctx.newPage();
const snap = async (tag) => console.log(tag, JSON.stringify(await page.evaluate(() => ({
  url: location.pathname + location.search,
  headline: document.querySelectorAll('[data-testid="headline"]').length,
  reopen: document.querySelectorAll('[data-testid="intro-reopen"]').length,
  card: document.querySelectorAll('[data-testid="intro-card"]').length,
  title: document.querySelectorAll('[data-testid="tour-title"]').length,
  invite: document.querySelectorAll('[data-testid="tour-invite"]').length,
  spot: document.querySelectorAll('[data-testid="tour-spotlight"]').length,
}))));
await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
await snap("① goto 직후    ");
await page.getByTestId("intro-reopen").waitFor({ state: "visible", timeout: 20000 });
await snap("② 버튼 보임     ");
await page.getByTestId("intro-reopen").click();
for (const ms of [500, 1500, 3000, 6000, 10000]) { await page.waitForTimeout(ms === 500 ? 500 : ms - (globalThis.__p ?? 500)); globalThis.__p = ms; await snap(`③ 클릭+${String(ms).padStart(5)}ms`); }
await br.close();
