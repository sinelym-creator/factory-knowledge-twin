/* chromium/1280 에서만 나온 `tour-target-missing` 1건 · `intro-card` 0 이 «엔진»인가 «1회성»인가.
   🔴 1회 관측을 결함으로 회부하지 않는다 — 같은 엔진·같은 폭으로 3회 반복해 재현률을 값으로 만든다. */
import { chromium, webkit } from "@playwright/test";
const BASE = "https://factory-knowledge-twin.vercel.app";
const one = async (engine, tag, rep) => {
  const b = await engine.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  await p.locator('[data-testid="intro-reopen"]').first().click();
  await p.waitForTimeout(1800);
  const steps = [];
  for (let s = 0; s < 3; s++) {
    steps.push({
      step: s,
      introCard: await p.locator('[data-testid="intro-card"]').count(),
      callout: await p.locator('[data-testid="tour-callout"]').count(),
      dots: await p.locator('[data-testid="tour-progress"] > *').count(),
      targetMissing: await p.locator('[data-testid="tour-target-missing"]').count(),
    });
    const n = p.locator('[data-testid="tour-next"]');
    if (!(await n.count())) break;
    await n.first().click().catch(() => {});
    await p.waitForTimeout(900);
  }
  console.log(JSON.stringify({ engine: tag, rep, steps }));
  await b.close();
};
for (let r = 1; r <= 3; r++) await one(chromium, "chromium", r);
await one(webkit, "webkit", 1);
