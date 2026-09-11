/** T-P26r ⑦ extra - after a human scrolls, the tour must stop re-centring the spotlight.
 * Measures the ring top before the scroll, right after it, and again after a settle window.
 * If the fix re-grabs the viewport, the third reading returns to the first. ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium, devices } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const ADDR = args.get("addr") || "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const STEP = Number(args.get("step") ?? 4);
if (!BASE) { console.error("usage: --base URL"); process.exit(2); }

const top = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-testid="tour-spotlight"]');
  return el ? Math.round(el.getBoundingClientRect().top) : null;
});
const scrollY = (p) => p.evaluate(() => Math.round(window.scrollY));

const b = await chromium.launch();
const ctx = await b.newContext(Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 844 } }));
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
  ["fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: STEP })]);
const p = await ctx.newPage();
await p.goto(BASE + ADDR, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2600);

const t0 = await top(p), y0 = await scrollY(p);
await p.mouse.wheel(0, 400);          // the human scrolls
await p.waitForTimeout(400);
const t1 = await top(p), y1 = await scrollY(p);
await p.waitForTimeout(2500);          // settle window - does anything pull it back?
const t2 = await top(p), y2 = await scrollY(p);

await b.close();

console.log("=== scroll latch (390 step " + STEP + ") ===");
console.log("phase       | spotlight top | scrollY");
console.log("settled     | " + t0 + " | " + y0);
console.log("after wheel | " + t1 + " | " + y1);
console.log("after 2.5s  | " + t2 + " | " + y2);
const moved = y1 !== y0;
const stayed = y2 === y1;
console.log("scroll took effect: " + moved + " (must be true, else nothing was tested)");
console.log("stayed where the human left it: " + stayed);
const verdict = !moved ? "UNMEASURED - the wheel did not move the page" : stayed ? "PASS" : "FAIL - it re-centred after the human scrolled";
console.log("verdict: " + verdict);
process.exit(0);
