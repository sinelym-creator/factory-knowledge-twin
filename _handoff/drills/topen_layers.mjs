/** T-OPEN — 「튜토리얼 클릭 → 투어 열림」 사이를 «층별»로 뜬다. 코드 변경 0 · 구독 0.
 *  한 계측기로 같은 시계(performance.now)에서 전부 찍는다 — 층마다 다른 채취기를 쓰면
 *  차이가 채취기의 것이 된다. node topen_layers.mjs <base> <N> */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, N = "3"] = process.argv.slice(2);
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
for (let i = 1; i <= Number(N); i += 1) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  const net = [];
  page.on("requestfinished", (r) => { const t = r.timing(); net.push({ url: r.url().replace(B, ""), start: t.startTime, dur: Math.round(t.responseEnd - t.requestStart) }); });
  await page.addInitScript(() => {
    window.__t = { marks: [] };
    const mark = (name) => { if (!window.__t.marks.some((m) => m.name === name)) window.__t.marks.push({ name, at: Math.round(performance.now()) }); };
    window.__mark = mark;
    document.addEventListener("DOMContentLoaded", () => mark("DOMContentLoaded"));
    window.addEventListener("fkt:tour-open", () => mark("이벤트 수신"));
    const mo = new MutationObserver(() => {
      if (document.querySelector('[data-testid="headline"]')) mark("개요 본문(headline)");
      if (document.querySelector('[data-testid="intro-reopen"]')) mark("앱바 재열기 버튼");
      if (document.querySelector('[data-testid="tour-title"]')) mark("투어 말풍선");
      if (document.querySelector('[data-testid="tour-spotlight"]')) mark("투어 링");
      if (document.querySelector('[data-testid="intro-card"]')) mark("안내 카드");
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  // 🔴 앱바 버튼은 셸과 함께 온다 — 「누를 수 있게 된 시각」까지 기다린 뒤 누른다(사람과 같은 조건).
  await page.getByTestId("intro-reopen").waitFor({ state: "visible", timeout: 20000 });
  const clickAt = await page.evaluate(() => { window.__mark("클릭"); return Math.round(performance.now()); });
  await page.getByTestId("intro-reopen").click();
  await page.waitForSelector('[data-testid="tour-title"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => window.__t.marks);
  const get = (n) => t.find((m) => m.name === n)?.at ?? null;
  const open = get("투어 말풍선");
  console.log(`\n== rep${i} · 클릭 ${clickAt}ms · 열림 ${open ?? "-"}ms · **클릭→열림 ${open !== null ? open - clickAt : "-"}ms** ==`);
  for (const m of t) console.log(`   ${String(m.at).padStart(6)}ms  ${m.name}${m.at >= clickAt ? "   (클릭 이후 +" + (m.at - clickAt) + "ms)" : ""}`);
  const after = net.filter((r) => r.start * 1000 >= 0).slice(-6);
  console.log("   최근 네트워크 6건: " + after.map((r) => `${r.url.slice(0, 34)}(${r.dur}ms)`).join(" · "));
  await ctx.close();
}
await br.close();
