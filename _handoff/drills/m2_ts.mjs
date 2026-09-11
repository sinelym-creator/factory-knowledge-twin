/** 412×600 · index 3 · 직접 진입 vs 폐하 경로 — scrollY·링 top·문서 높이 시계열(100ms × 30).
 *  🔴 재는 것은 «전이»다: 보정이 몇 번 돌았고, 레이아웃이 언제 자랐는가. 코드 변경 0. */
/* 🔴 개인 절대경로 0(ci hygiene) · 진입점은 상대 경로 · 다른 트리는 FKT_PW 로 덮는다. */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = process.argv[2] ?? (() => { throw new Error("🔴 무대 주소를 인자로 달라 — 기본값 0(남의 무대를 조용히 재지 않는다)"); })();
const HREF = "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
for (const mode of ["direct", "operator"]) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (mode === "direct") {
    await page.evaluate(() => localStorage.setItem("fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: 3 })));
    await page.goto(`${B}${HREF}`, { waitUntil: "domcontentloaded" });
  } else {
    await page.getByTestId("intro-reopen").click();
    await page.waitForTimeout(900);
    for (let i = 0; i < 3; i += 1) {
      const go = page.getByTestId("tour-goto"), nx = page.getByTestId("tour-next");
      if (await go.count()) await go.first().click(); else if (await nx.count()) await nx.first().click();
      await page.waitForTimeout(1200);
    }
  }
  const series = [];
  for (let i = 0; i < 30; i += 1) {
    series.push(await page.evaluate(() => {
      const sp = document.querySelector('[data-testid="tour-spotlight"]');
      const tg = document.querySelector('[data-testid="run-timeline"]');
      return { y: Math.round(window.scrollY), sh: document.documentElement.scrollHeight,
               t: sp ? Math.round(sp.getBoundingClientRect().top) : null,
               abs: tg ? Math.round(tg.getBoundingClientRect().top + window.scrollY) : null };
    }));
    await page.waitForTimeout(100);
  }
  console.log(`\n== ${mode} (412x600) ==`);
  let prev = null, scrolls = 0, grows = 0;
  const line = [];
  series.forEach((s, i) => {
    if (prev) {
      if (Math.abs(s.y - prev.y) > 1) scrolls += 1;
      if (Math.abs(s.sh - prev.sh) > 1) grows += 1;
      if (prev.abs !== null && s.abs !== null && Math.abs(s.abs - prev.abs) > 1) line.push(`${i * 100}ms 대상절대top ${prev.abs}->${s.abs}`);
      if (Math.abs(s.sh - prev.sh) > 1) line.push(`${i * 100}ms 문서높이 ${prev.sh}->${s.sh}`);
    }
    prev = s;
  });
  console.log(series.map((s, i) => `${String(i * 100).padStart(4)}ms y=${String(s.y).padStart(4)} top=${String(s.t).padStart(5)} sh=${s.sh} abs=${s.abs}`).filter((_, i) => i % 3 === 0 || i > 25).join("\n"));
  console.log(`이동 구간 ${scrolls} · 문서높이 변화 ${grows}`);
  if (line.length) console.log("변화 지점: " + line.slice(0, 8).join(" | "));
  await ctx.close();
}
await br.close();
