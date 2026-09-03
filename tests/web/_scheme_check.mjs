import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const BASE = process.argv[2] ?? "http://127.0.0.1:3107";
const b = await chromium.launch();
for (const scheme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const link = document.querySelector('[data-testid="start-from-alarm"]');
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      rootScheme: getComputedStyle(document.documentElement).colorScheme,
      ctaBg: link ? getComputedStyle(link).backgroundColor : null,
      ctaColor: link ? getComputedStyle(link).color : null,
    };
  });
  console.log(scheme, JSON.stringify(v));
  await ctx.close();
}
await b.close();
