/** Urgent re-measure - Android phone, the step the operator saw (screen "4/9" = index 3,
 * timeline). Four cells: {412x915, 412x600} x {direct entry, the operator's own walk}.
 * Each cell reads at settle and again 3s later. ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const ADDR = args.get("addr") || "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const STEP = Number(args.get("step") ?? 3);
if (!BASE) { console.error("usage: --base URL [--step N]"); process.exit(2); }

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const dev = (h) => ({ viewport: { width: 412, height: h }, userAgent: UA, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const TOUR_KEY = "fkt.tour.v1";
const T_CANCEL = "취소";
const rows = [];

const read = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-testid="tour-spotlight"]');
  const cal = document.querySelector('[data-testid="tour-callout"]');
  const prog = document.querySelector('[data-testid="tour-progress"]');
  const base = { callout: !!cal, prog: prog ? prog.innerText.trim().replace(/\s+/g, "") : "",
    y: Math.round(window.scrollY), vh: window.innerHeight };
  if (!el) return Object.assign(base, { found: false });
  const r = el.getBoundingClientRect();
  return Object.assign(base, { found: true, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) });
});

async function cell(b, h, mode) {
  const ctx = await b.newContext(dev(h));
  if (mode === "direct") {
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
      [TOUR_KEY, JSON.stringify({ v: 1, status: "running", step: STEP })]);
  }
  const p = await ctx.newPage();
  if (mode === "direct") {
    await p.goto(BASE + ADDR, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2600);
  } else {
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    const card = p.locator('[data-testid="intro-card"]');
    if (await card.count()) { const bb = card.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
    await p.waitForTimeout(300);
    await p.locator('[data-testid="reset-button"]').click().catch(() => {});
    await p.waitForTimeout(500);
    const dlg = p.locator('[role="dialog"], [role="alertdialog"]');
    const scope = (await dlg.count()) ? dlg.last() : p.locator("body");
    const cand = scope.locator("button");
    for (let i = 0, m = await cand.count(); i < m; i++) {
      const t = (await cand.nth(i).innerText().catch(() => "")).trim();
      if (t && t !== T_CANCEL && t.indexOf("✕") === -1) { await cand.nth(i).click().catch(() => {}); break; }
    }
    await p.waitForTimeout(2000);
    const c2 = p.locator('[data-testid="intro-card"]');
    if (await c2.count()) { const bb = c2.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
    await p.waitForTimeout(400);
    const start = p.locator('[data-testid="tour-start"]');
    if (!(await start.count())) { rows.push({ h, mode, err: "no tour-start after reset" }); await ctx.close(); return; }
    await start.first().click();
    await p.waitForTimeout(1600);
    /* index 2 is a link step - it advances through tour-goto, not tour-next. Watch all three
       and record the title after every move, so a column that stalled cannot pass as step 3. */
    const trail = [];
    for (let i = 0; i < STEP; i++) {
      let used = "(none)";
      for (const sel of ["tour-next", "tour-goto", "tour-route-go"]) {
        const l = p.locator('[data-testid="' + sel + '"]');
        if (await l.count()) { used = sel; await l.first().click().catch(() => {}); break; }
      }
      await p.waitForTimeout(2000);
      const t = await p.locator('[data-testid="tour-title"]').first().innerText().catch(() => "(none)");
      trail.push(used + " -> " + t.replace(/\s+/g, " ").slice(0, 24));
    }
    await p.waitForTimeout(1400);
    const finalTitle = await p.locator('[data-testid="tour-title"]').first().innerText().catch(() => "(none)");
    console.log("  walk trail 412x" + h + ": " + JSON.stringify(trail) + " final=" + finalTitle.replace(/\s+/g, " ").slice(0, 30));
  }
  const ttl = await p.locator('[data-testid="tour-title"]').first().innerText().catch(() => "(none)");
  console.log("  " + mode + " 412x" + h + " title=" + ttl.replace(/\s+/g," ").slice(0,30));
  const a = await read(p);
  await p.waitForTimeout(3000);
  const c = await read(p);
  rows.push({ h, mode, a, c });
  await ctx.close();
}

const b = await chromium.launch();
for (const h of [915, 600]) for (const mode of ["direct", "walk"]) await cell(b, h, mode);
await b.close();

console.log("=== android step index " + STEP + " (screen 4/9) · " + BASE + " ===");
console.log("vp      | mode   | phase  | ring top | bottom | h | scrollY | prog | verdict");
let fail = 0, unm = 0;
for (const r of rows) {
  if (r.err) { unm += 1; console.log("412x" + r.h + " | " + r.mode.padEnd(6) + " | -      | " + r.err); continue; }
  for (const [tag, x] of [["settle", r.a], ["+3s", r.c]]) {
    if (!x.found) console.log("412x" + r.h + " | " + r.mode.padEnd(6) + " | " + tag.padEnd(6) + " | ABSENT callout=" + x.callout + " | scrollY=" + x.y + " | " + x.prog);
    else console.log("412x" + r.h + " | " + r.mode.padEnd(6) + " | " + tag.padEnd(6) + " | " + x.top + " | " + x.bottom + " | " + x.h + " | " + x.y + " | " + x.prog);
  }
  const f = r.c;
  if (!f.found) { unm += 1; console.log("412x" + r.h + " | " + r.mode + " -> UNMEASURED (no spotlight)"); }
  else { const ok = f.top >= 16; if (!ok) fail += 1; console.log("412x" + r.h + " | " + r.mode + " -> " + (ok ? "PASS" : "FAIL top=" + f.top)); }
}
console.log("cells=" + rows.length + " fail=" + fail + " unmeasured=" + unm);
process.exit(0);
