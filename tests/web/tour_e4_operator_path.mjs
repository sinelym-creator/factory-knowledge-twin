/** T-P26r axis 7 / E-4 on the operator's path: enter the replay address directly at 390 and
 * measure the spotlight head for each step that lives on that screen.
 *
 * My earlier E-4 started from overview and walked one step, which is a different path - it
 * read the same on both trees and therefore had no discriminating power. This net walks the
 * path the operator actually took. ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium, devices } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const ADDR = args.get("addr") || "/incidents/INC-2026-014";
if (!BASE) { console.error("usage: --base URL [--addr path]"); process.exit(2); }

const TOUR_KEY = "fkt.tour.v1";
const rows = [];

const b = await chromium.launch();
for (const view of ["390", "1440"]) {
  for (const step of [3, 4, 5]) {
    const opt = view === "390"
      ? Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 844 } })
      : { viewport: { width: 1440, height: 900 } };
    const ctx = await b.newContext(opt);
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
      [TOUR_KEY, JSON.stringify({ v: 1, status: "running", step })]);
    const p = await ctx.newPage();
    await p.goto(BASE + ADDR, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2600);
    const g = await p.evaluate(() => {
      const el = document.querySelector('[data-testid="tour-spotlight"]');
      const cal = document.querySelector('[data-testid="tour-callout"]');
      if (!el) return { found: false, callout: !!cal, vh: window.innerHeight };
      const r = el.getBoundingClientRect();
      return {
        found: true, callout: !!cal,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        vh: window.innerHeight, h: Math.round(r.height),
      };
    });
    rows.push({ view, step, g });
    await ctx.close();
  }
}
await b.close();

console.log("=== E-4 operator path (" + BASE + ADDR + ") ===");
console.log("view | step | spotlight | top | bottom | vh | head inside?");
let bad = 0, unmeasured = 0;
for (const r of rows) {
  if (!r.g.found) {
    unmeasured += 1;
    console.log(r.view.padEnd(5) + "| " + String(r.step).padEnd(5) + "| absent (callout=" + r.g.callout + ") | - | - | " + r.g.vh + " | UNMEASURED");
  } else {
    const ok = r.g.top >= 0;
    if (!ok) bad += 1;
    console.log(r.view.padEnd(5) + "| " + String(r.step).padEnd(5) + "| present | " + r.g.top + " | " + r.g.bottom + " | " + r.g.vh + " | " + (ok ? "PASS" : "FAIL"));
  }
}
console.log("rows=" + rows.length + " fail=" + bad + " unmeasured=" + unmeasured);
process.exit(0);
