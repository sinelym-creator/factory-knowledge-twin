/** 폐하 걸음(index 3 · timeline · run-timeline) 4칸 — 412×915 / 412×600 × (직접 진입 / 폐하 경로).
 *  🔴 대기용 예비 계측기. 리바이2 축이 막힐 때만 돌린다. */
/* 🔴 개인 절대경로 0(ci hygiene) · 진입점은 상대 경로 · 다른 트리는 FKT_PW 로 덮는다. */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = process.argv[2] ?? (() => { throw new Error("🔴 무대 주소를 인자로 달라 — 기본값 0"); })();
const HREF = "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const STEP = 3;
const br = await chromium.launch();
const read = (page) => page.evaluate(() => {
  const sp = document.querySelector('[data-testid="tour-spotlight"]');
  if (!sp) return { spot: 0 };
  const r = sp.getBoundingClientRect();
  return { spot: 1, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
           vh: window.innerHeight, scrollY: Math.round(window.scrollY),
           title: document.querySelector('[data-testid="tour-title"]')?.textContent?.slice(0, 18) ?? null };
});
for (const [w, h] of [[412, 915], [412, 600]]) {
  for (const mode of ["direct", "operator"]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
    const page = await ctx.newPage();
    await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    if (mode === "direct") {
      await page.evaluate((s) => localStorage.setItem("fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: s })), STEP);
      await page.goto(`${B}${HREF}`, { waitUntil: "domcontentloaded" });
    } else {
      // 폐하 경로 — 앱바 튜토리얼 → 다음 ×3(0→3) · 3번째는 link 걸음이라 이동 버튼
      await page.getByTestId("intro-reopen").click();
      await page.waitForTimeout(900);
      for (let i = 0; i < 3; i += 1) {
        const nx = page.getByTestId("tour-next"), go = page.getByTestId("tour-goto");
        if (await go.count()) await go.first().click();
        else if (await nx.count()) await nx.first().click();
        await page.waitForTimeout(1200);
      }
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2600);
    const a = await read(page);
    await page.waitForTimeout(3000);
    const b = await read(page);
    const ok = (m) => m.spot && m.top >= 16 && m.top <= m.vh - 16 && (m.h + 32 > m.vh || m.bottom <= m.vh);
    console.log(`${w}x${h} | ${mode.padEnd(8)} | 「${a.title ?? "-"}」 | 정착 top ${a.spot ? a.top : "-"} bottom ${a.spot ? a.bottom : "-"} h ${a.spot ? a.h : "-"} vh ${a.spot ? a.vh : "-"} scrollY ${a.spot ? a.scrollY : "-"} | +3초 top ${b.spot ? b.top : "-"} | ${a.spot ? (ok(a) && ok(b) ? "PASS" : "FAIL") : "무효"}`);
    await ctx.close();
  }
}
await br.close();
