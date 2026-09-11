/** D-96 FIX 후속 — 세션 «없는» 방문자가 `?intro=1&tour=1` 을 들고 오면 그 쿼리가 살아남는가.
 *  수화 전 클릭의 기본 이동이 정확히 이 경로를 탄다. node d96_query.mjs <base> */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = process.argv[2];
const br = await chromium.launch();
for (const target of ["/overview?intro=1&tour=1", "/overview"]) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 } });
  const page = await ctx.newPage();
  const hops = [];
  page.on("response", (r) => { const s = r.status(); if (s >= 300 && s < 400) hops.push(`${new URL(r.url()).pathname}${new URL(r.url()).search} → ${s} → ${r.headers()["location"] ?? "?"}`); });
  await page.goto(`${B}${target}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => ({ url: location.pathname + location.search, title: document.querySelectorAll('[data-testid="tour-title"]').length, headline: document.querySelectorAll('[data-testid="headline"]').length }));
  console.log(`요청 ${target}\n  홉: ${hops.join(" | ") || "없음"}\n  끝: ${JSON.stringify(s)}`);
  await ctx.close();
}
await br.close();
