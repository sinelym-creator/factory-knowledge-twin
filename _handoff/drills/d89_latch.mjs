/** M-2 판별 — 88 에서 멈춘 것이 「래치」인가 「계기 부족」인가.
 *  자극: 정착 뒤 프로그램 스크롤 1px(= scroll 이벤트 → measure 재호출 · userMoved 는 wheel/touch/key 만).
 *  래치면 보정이 안 돈다(≈89 유지) · 계기 부족이면 그 자리에서 36 으로 간다. */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = process.argv[2];
const HREF = "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
const read = (page) => page.evaluate(() => {
  const sp = document.querySelector('[data-testid="tour-spotlight"]');
  if (!sp) return { spot: 0 };
  const r = sp.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), y: Math.round(window.scrollY), sh: document.documentElement.scrollHeight };
});
for (const rep of [1, 2]) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => localStorage.setItem("fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: 3 })));
  await page.goto(`${B}${HREF}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const a = await read(page);
  // 🔴 자극 = 1px 프로그램 스크롤. 폴링 창(8초) 안이고 사람 입력이 아니다.
  await page.evaluate(() => window.scrollBy(0, 1));
  await page.waitForTimeout(1500);
  const b = await read(page);
  const verdict = a.top === 88 ? (Math.abs(b.top - 36) <= 2 ? "계기 부족(자극 주니 보정됨)" : "래치(자극에도 안 움직임)") : "이 회차는 88 이 아니었다 — 판정 불가";
  console.log(`rep${rep} | 정착 top ${a.top} bottom ${a.bottom} y ${a.y} sh ${a.sh} | 1px 자극 뒤 top ${b.top} bottom ${b.bottom} y ${b.y} | ${verdict}`);
  await ctx.close();
}
await br.close();
