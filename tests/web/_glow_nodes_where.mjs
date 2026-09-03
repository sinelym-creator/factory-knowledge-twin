import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const BASE = process.argv[2] ?? "http://127.0.0.1:3107";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await p.waitForURL(/\/overview/, { timeout: 20_000 }).catch(() => {});
await p.waitForTimeout(1200);
console.log(
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll(".fkt-glow-ai")].map((el) => {
        const r = el.getBoundingClientRect();
        const chain = [];
        let n = el.parentElement;
        while (n && chain.length < 6) {
          const t = n.getAttribute("data-testid");
          if (t) chain.push(t);
          n = n.parentElement;
        }
        return {
          text: (el.textContent ?? "").trim().slice(0, 24),
          testid: el.getAttribute("data-testid"),
          rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) },
          ancestors: chain,
        };
      }),
    ),
    null,
    2,
  ),
);
await ctx.close();
await b.close();
