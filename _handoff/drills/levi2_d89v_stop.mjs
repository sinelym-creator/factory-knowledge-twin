/** ④ 멈춤 보장 — 처방이 「8초 뒤 스스로 멈춘다」를 깼는가.
 *  거동으로 묻는다: 정착 «한참 뒤»(12초 = 폴링 창 8초 밖)에 프로그램 스크롤로 밀면
 *  보정이 «없어야» 한다. 🔴 대조군: 같은 크기의 밀기를 창 «안»(2.6초)에 주면 보정이 있어야 한다
 *  — 그 참이 없으면 「보정 0」은 멈춤이 아니라 내 계측기가 못 보는 것이다. */
const PW = "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, WAIT = "12000", N = "2"] = process.argv.slice(2);
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
for (let i = 1; i <= Number(N); i += 1) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => localStorage.setItem("fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: 3 })));
  await page.goto(`${B}/incidents/INC-2026-014?run=STATIC-GS-01&tour=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tour-spotlight"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(Number(WAIT));
  const m = await page.evaluate(() => { window.scrollBy(0, 120); return { y: Math.round(window.scrollY) }; });
  await page.waitForTimeout(3000);
  const n = await page.evaluate(() => ({ y: Math.round(window.scrollY) }));
  const moved = Math.abs(n.y - m.y) > 2;
  console.log(`stop rep${i} | 대기 ${WAIT}ms 뒤 민 직후 y ${m.y} -> 3s y ${n.y} | 보정 ${moved ? "있음" : "0"}`);
  await ctx.close();
}
await br.close();
