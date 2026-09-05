/* 리셋 버튼 부재의 주어 가르기 — 「폭 탓」인가 「그 컨텍스트의 첫 페이지 탓」인가. */
import { chromium } from "@playwright/test";
const BASE = "https://factory-knowledge-twin.vercel.app";
const b = await chromium.launch();
const col = async (name, w, warm) => {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  let warmSid = null;
  if (warm) { const p0 = await ctx.newPage(); await p0.goto(BASE + "/overview", { waitUntil: "domcontentloaded" }); await p0.waitForTimeout(2500); await p0.close(); }
  const p = await ctx.newPage();
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const r = { name, w, warm,
    reset: await p.locator('[data-testid="reset-button"]').count(),
    tour: await p.locator('[data-testid="intro-reopen"]').count(),
    sessionChip: await p.locator('[data-testid="session-chip"]').count(),
    cookies: (await ctx.cookies()).map((c) => c.name) };
  await ctx.close();
  return r;
};
const rows = [];
rows.push(await col("390 cold(첫 페이지)", 390, false));
rows.push(await col("390 warm(두 번째 페이지)", 390, true));
rows.push(await col("1280 cold(첫 페이지)", 1280, false));
await b.close();
for (const r of rows) console.log(JSON.stringify(r));
