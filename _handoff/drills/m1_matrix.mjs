/** M-1 3변수 표 — 입장 경로 × 뷰포트 × (손). 러너 축은 playwright 러너가 따로 돈다.
 *  🔴 재는 것: 재열기 클릭 «그 순간» 개요 본문(OverviewBody)이 DOM 에 있었는가 + 카드가 열렸는가.
 *  node m1_matrix.mjs <base> <entry> <w> <h> <rep> */
const _pw = await import("file:///C:/Users/sinel/repos/_wt/senku2-m1/tests/web/node_modules/@playwright/test/index.js"); const chromium = _pw.chromium ?? _pw.default.chromium;
const [B = "http://127.0.0.1:8801", ENTRY = "overview", W = "1440", H = "900", REP = "1"] = process.argv.slice(2);
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: +W, height: +H } });
const page = await ctx.newPage();
const state = () => page.evaluate(() => ({
  headline: document.querySelectorAll('[data-testid="headline"]').length,
  card: document.querySelectorAll('[data-testid="intro-card"]').length,
  tour: document.querySelectorAll('[data-testid="tour-title"]').length,
}));
let note = "";
try {
  await page.goto(ENTRY === "overview" ? `${B}/overview` : `${B}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="intro-card"]', { timeout: 20000 });
  await page.getByTestId("intro-card").getByRole("button", { name: "안내 닫기" }).click();
  await page.waitForTimeout(400);
  await page.reload();
  // spec 과 «같은» 앵커 — 셸의 mode-badge 만 본다(개요 본문은 묻지 않는다)
  await page.waitForFunction(() => { const b = document.querySelector('[data-testid="mode-badge"]'); return b && b.getAttribute("data-mode") !== "checking"; }, null, { timeout: 15000 });
  const atClick = await state();                       // 🔴 클릭 «직전» 본문 유무
  await page.getByTestId("intro-reopen").click({ timeout: 7000 });
  await page.waitForTimeout(3000);
  const after = await state();
  console.log(`${ENTRY.padEnd(8)} ${String(W+"x"+H).padEnd(9)} rep${REP} | 클릭직전 본문=${atClick.headline} 카드=${atClick.card} | 3초후 본문=${after.headline} 카드=${after.card} 투어=${after.tour} | ${after.card === 1 ? "초록" : "빨강"}`);
} catch (e) { console.log(`${ENTRY.padEnd(8)} ${String(W+"x"+H).padEnd(9)} rep${REP} | 🔴 무효(예외): ${String(e).split("\n")[0].slice(0,90)}`); }
await br.close();
