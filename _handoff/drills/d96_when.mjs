/** D-96 판별 — 「안 열림」이 대상 결함인가, «수화 전 클릭»인가.
 *  한 변수만 바꾼다: 클릭 시점. early = 버튼 보이자마자(사람이 서두른 조건) / late = 개요 본문이 선 뒤.
 *  node d96_when.mjs <base> <early|late> <N> */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, WHEN = "early", N = "3"] = process.argv.slice(2);
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
let opened = 0;
for (let i = 1; i <= Number(N); i += 1) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__ev = 0; window.addEventListener("fkt:tour-open", () => { window.__ev += 1; }); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("intro-reopen").waitFor({ state: "visible", timeout: 40000 });
  if (WHEN === "late") {
    /* 🔴 «수화가 끝난 뒤» 조건 — 개요 본문(클라이언트 컴포넌트)이 DOM 에 선 것을 앵커로 쓴다.
       앱바 버튼의 «보임»은 서버 렌더만으로도 참이라 상호작용 가능 여부를 말하지 않는다. */
    await page.waitForURL(/\/overview/, { timeout: 60000 }).catch(() => {});
    await page.getByTestId("intro-card").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.getByTestId("intro-reopen").click();
  const t0 = Date.now();
  let title = null;
  while (Date.now() - t0 < 25000 && title === null) {
    const s = await page.evaluate(() => ({ t: !!document.querySelector('[data-testid="tour-title"]'), ev: window.__ev, url: location.search })).catch(() => null);
    if (s && s.t) title = Date.now() - t0;
    await page.waitForTimeout(50);
  }
  const fin = await page.evaluate(() => ({ ev: window.__ev, url: location.pathname + location.search }));
  if (title !== null) opened += 1;
  console.log(`${WHEN} rep${i} | 이벤트 ${fin.ev}건 · url ${fin.url} · 말풍선 ${title === null ? "🔴 안 열림" : title + "ms"}`);
  await ctx.close();
}
console.log(`== ${WHEN} · 열림 ${opened}/${N} ==`);
await br.close();
