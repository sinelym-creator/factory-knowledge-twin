/** 축 ③ⓑ — 서버 `mode=replay` run 화면에서 ① 동형인가. 🔴 run 은 세션 스코프라 «같은 컨텍스트»에서 만든다. */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const BASE = process.argv[2], OUT = process.argv[3], PERIOD = 220;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1280,height:900} })).newPage();
await p.goto(BASE + "/overview", { waitUntil:"domcontentloaded", timeout:60000 });
const made = await p.evaluate(async () => {
  const s = await (await fetch("/api/sessions", { method:"POST", credentials:"include" })).json();
  const r = await fetch("/api/scenarios/GS-01/runs", { method:"POST", credentials:"include",
    headers:{"content-type":"application/json"}, body: JSON.stringify({ sessionId: s.sessionId, mode: "replay" }) });
  return { status: r.status, body: await r.json() };
});
const out = { base: BASE, made };
if (made.status === 200) {
  const rid = made.body.runId, inc = made.body.incidentId;
  await p.goto(`${BASE}/incidents/${inc}?run=${encodeURIComponent(rid)}`, { waitUntil:"domcontentloaded", timeout:60000 });
  await p.waitForTimeout(2000);
  for (const s of ['[data-testid="tour-skip"]','[aria-label="안내 닫기"]']) {
    const l = p.locator(s); if (await l.count()) { await l.first().click().catch(()=>{}); await p.waitForTimeout(300); } }
  const cur = () => p.locator('[data-testid="replay-cursor"]');
  const play = () => p.locator('[data-testid="replay-play"]');
  const read = async () => ({
    applied: (await cur().count()) ? Number(await cur().first().getAttribute("data-applied")) : null,
    total:   (await cur().count()) ? Number(await cur().first().getAttribute("data-total")) : null,
    atEnd:   (await play().count()) ? await play().first().getAttribute("data-at-end") : null,
    label:   (await play().count()) ? (await play().first().innerText()).replace(/\s+/g," ").trim() : null,
  });
  // 완주 대기
  const t0 = Date.now(); let s0 = await read();
  while (Date.now() - t0 < 90000) { s0 = await read(); if (s0.total > 0 && s0.applied === s0.total && s0.atEnd === "true") break; await p.waitForTimeout(300); }
  out.atCompletion = s0;
  out.mode = (await p.locator('[data-testid="run-mode-badge"]').count())
    ? await p.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode") : null;
  out.staticSrc = await p.locator('[data-testid="run-source-static"]').count();
  if (s0.atEnd === "true") {
    const t1 = Date.now(); await play().first().click();
    let toOne = null, trail = [];
    while (Date.now() - t1 < 5000) { const c = await read(); trail.push({ms:Date.now()-t1, applied:c.applied});
      if (c.applied !== null && c.applied >= 1 && c.applied < s0.total) { toOne = Date.now()-t1; break; } await p.waitForTimeout(40); }
    out.rewound = trail.some(x => x.applied !== null && x.applied < s0.total);
    out.clickToFirstMs = toOne;
    const t2 = Date.now(); let end = false;
    while (Date.now() - t2 < s0.total * PERIOD + 8000) { const c = await read(); if (c.applied === s0.total) { end = true; break; } await p.waitForTimeout(40); }
    out.reachedEnd = end; out.endMs = Date.now()-t2;
    await p.waitForTimeout(PERIOD*4);
    out.afterSettle = await read();
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
