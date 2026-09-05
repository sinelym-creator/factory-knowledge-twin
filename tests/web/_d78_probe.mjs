/** D-78 무대 탐색 — 어떤 화면이 replay 컨트롤을 주는지, 이벤트 수는 몇인지. 판정 아님. */
import { chromium } from "@playwright/test";
const BASE = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const out = {};
for (const path of ["/incidents/INC-2026-014?run=STATIC-GS-01", "/replay"]) {
  try {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(2500);
    for (const sel of ['[data-testid="tour-skip"]', '[aria-label="안내 닫기"]']) {
      const l = p.locator(sel);
      if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(300); }
    }
    const cur = p.locator('[data-testid="replay-cursor"]');
    const play = p.locator('[data-testid="replay-play"]');
    out[path] = {
      url: p.url(),
      runConsole: await p.locator('[data-testid="run-console"]').count(),
      cursor: await cur.count(),
      applied: (await cur.count()) ? await cur.first().getAttribute("data-applied") : null,
      total: (await cur.count()) ? await cur.first().getAttribute("data-total") : null,
      play: await play.count(),
      atEnd: (await play.count()) ? await play.first().getAttribute("data-at-end") : null,
      label: (await play.count()) ? (await play.first().innerText()).trim() : null,
      staticSrc: await p.locator('[data-testid="run-source-static"]').count(),
      mode: (await p.locator('[data-testid="run-mode-badge"]').count())
        ? await p.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode") : null,
    };
  } catch (e) { out[path] = { error: String(e).slice(0, 120) }; }
}
console.log(JSON.stringify(out, null, 1));
await b.close();
