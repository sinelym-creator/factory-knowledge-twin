/** D-96 — 느린 조건에서 «무엇이 없는가»를 상태까지 찍는다. 코드 변경 0.
 *  node d96_state.mjs <base> [fast|slow] */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, MODE = "slow"] = process.argv.slice(2);
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__ev = 0; window.addEventListener("fkt:tour-open", () => { window.__ev += 1; }); });
if (MODE === "slow") {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
const dump = async (tag) => console.log(tag, JSON.stringify(await page.evaluate(() => {
  let tour = null; try { tour = localStorage.getItem("fkt.tour.v1"); } catch {}
  const q = (s) => document.querySelectorAll(`[data-testid="${s}"]`).length;
  return { url: location.pathname + location.search, ev: window.__ev, tour,
           headline: q("headline"), card: q("intro-card"), title: q("tour-title"),
           invite: q("tour-invite"), spot: q("tour-spotlight"), reopen: q("intro-reopen") };
})));
await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
await page.getByTestId("intro-reopen").waitFor({ state: "visible", timeout: 40000 });
await dump("① 클릭 직전  ");
await page.getByTestId("intro-reopen").click();
for (const ms of [1000, 3000, 6000, 10000, 16000]) { await page.waitForTimeout(ms === 1000 ? 1000 : 3000); await dump(`② 클릭+~${String(ms).padStart(5)}ms`); }
await br.close();
