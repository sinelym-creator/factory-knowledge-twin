// 승격 19 외부 재검 — 축 ⑥(replay 무영향 · 콘솔 0). 무대는 인자로 받는다(그물에 오늘의 사실을 박지 않는다).
import { chromium } from '@playwright/test';

const BASE = process.argv[2] || 'https://factory-knowledge-twin.vercel.app';
const ROUTES = (process.argv[3] || '/,/overview,/incidents,/compare').split(',');

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push({ route: page.url(), text: m.text().slice(0, 200) }); });
page.on('pageerror', (e) => errors.push({ route: page.url(), text: 'pageerror: ' + String(e).slice(0, 200) }));

const rows = [];
for (const r of ROUTES) {
  const t0 = Date.now();
  let status = null;
  try {
    const resp = await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = resp ? resp.status() : null;
    await page.waitForTimeout(2500);           // 정착 — 늦게 오는 콘솔까지 받는다
  } catch (e) {
    status = 'NAV-FAIL: ' + String(e).slice(0, 120);
  }
  const landed = page.url().replace(BASE, '') || '/';
  const bodyLen = await page.evaluate(() => document.body ? document.body.innerText.length : 0).catch(() => -1);
  rows.push({ route: r, status, landed, bodyLen, ms: Date.now() - t0 });
  console.log(`  ${r} -> http=${status} landed=${landed} text=${bodyLen} ${Date.now() - t0}ms`);
}
console.log('console errors =', errors.length);
for (const e of errors.slice(0, 12)) console.log('   !', e.route.replace(BASE, ''), e.text);
console.log(JSON.stringify({ base: BASE, rows, errorCount: errors.length, errors: errors.slice(0, 20) }));
await browser.close();
