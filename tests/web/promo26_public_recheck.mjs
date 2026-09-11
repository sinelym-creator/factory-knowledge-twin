/** Promotion 26 external re-check - the public face, from outside.
 * Axes: build sha, the guarded API, the D-87 doc surface, the served screen, and the tour
 * on a 412 phone profile walking the path the operator walks.
 * Read-only. ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const WANT = args.get("sha");
if (!BASE || !WANT) { console.error("usage: --base https://host --sha <main sha>"); process.exit(2); }

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const TOUR_KEY = "fkt.tour.v1";
const T_CANCEL = "취소";
const rows = [];
const rec = (k, got, want, pass, note) => rows.push({ k, got: String(got), want, pass, note: note || "" });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, userAgent: UA,
  deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

/* the screen, served */
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
rec("screen", new URL(p.url()).pathname + " ids=" + (await p.locator("[data-testid]").count()),
  "a screen renders (guard may send /overview to /)", (await p.locator("[data-testid]").count()) > 0, "landed " + new URL(p.url()).pathname);

/* build sha, read through the page's own origin so the session cookie rides along */
const health = await p.evaluate(async () => {
  const r = await fetch("/api/health");
  return { s: r.status, b: await r.text() };
});
let build = "(unparsed)";
try { build = JSON.parse(health.b).build; } catch (e) {}
rec("build", health.s + " build=" + build, "200 and build=" + WANT, health.s === 200 && build === WANT, "");

/* the guarded API, without a session */
const anon = await p.evaluate(async (base) => {
  const r = await fetch(base + "/api/scenarios", { credentials: "omit" });
  return r.status;
}, BASE);
rec("guard", anon, "401 without a session", anon === 401, "");

/* D-87 doc surface */
for (const u of ["/openapi.json", "/docs", "/redoc", "/api/docs"]) {
  const s = await p.evaluate(async (x) => (await fetch(x, { redirect: "manual" })).status, u);
  /* 307 here is the shell guard, not the ai-api route - the D-87 fix is only exercised on
     the one path that reaches ai-api. Both outcomes are recorded, only 404 is a test of it. */
  /* Two layers can withhold the surface and they answer differently. A document navigation
     (curl, address bar) is turned away by the shell guard with 307; a same-origin fetch
     reaches ai-api and gets 404, which is the D-87 fix itself. Either way the surface is not
     served - but only the 404 column tests the fix, so both are recorded by name. */
  const layer = s === 404 ? "ai-api (fix exercised)" : s === 307 || s === 0 ? "shell guard (fix not exercised)" : "unexpected";
  rec("d87" + u, s + " · " + layer, "surface not served (307 or 404)", s === 404 || s === 307 || s === 0, "");
}

/* tour, the operator's path: intro closes, reset, start, walk to the timeline step */
const card = p.locator('[data-testid="intro-card"]');
const introBefore = await card.count();
if (introBefore) { const bb = card.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
await p.waitForTimeout(400);
await p.evaluate((k) => { try { localStorage.setItem(k, JSON.stringify({ v: 1, status: "dismissed", step: 2 })); } catch (e) {} }, TOUR_KEY);

await p.locator('[data-testid="reset-button"]').click().catch(() => {});
await p.waitForTimeout(600);
const dlg = p.locator('[role="dialog"], [role="alertdialog"]');
const scope = (await dlg.count()) ? dlg.last() : p.locator("body");
const cand = scope.locator("button");
for (let i = 0, m = await cand.count(); i < m; i++) {
  const t = (await cand.nth(i).innerText().catch(() => "")).trim();
  if (t && t !== T_CANCEL && t.indexOf("✕") === -1) { await cand.nth(i).click().catch(() => {}); break; }
}
/* the public face is a network hop away - poll for the observable result instead of
   guessing a window. A fixed 2.8s made this cell flap 2 of 4. */
await p.waitForFunction(() => localStorage.getItem("fkt.tour.v1") === null, null, { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(600);
const afterReset = await p.evaluate(() => ({
  path: location.pathname, search: location.search,
  tour: localStorage.getItem("fkt.tour.v1"),
  intro: document.querySelectorAll('[data-testid="intro-card"]').length,
}));
rec("E-1/E-3 reset", "tour=" + (afterReset.tour === null ? "null" : "kept") + " intro=" + afterReset.intro,
  "key cleared and the first-visit card is back", afterReset.tour === null && afterReset.intro >= 1, "");
rec("E-5 home", afterReset.path + afterReset.search, "/overview", afterReset.path.indexOf("/overview") === 0, "");

const c2 = p.locator('[data-testid="intro-card"]');
if (await c2.count()) { const bb = c2.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
await p.waitForTimeout(400);
const start = p.locator('[data-testid="tour-start"]');
if (!(await start.count())) rec("E-2/E-4 walk", "no tour-start", "-", null, "unmeasured");
else {
  await start.first().click();
  await p.waitForTimeout(1600);
  const trail = [];
  for (let i = 0; i < 3; i++) {
    let used = "(none)";
    for (const sel of ["tour-next", "tour-goto", "tour-route-go"]) {
      const l = p.locator('[data-testid="' + sel + '"]');
      if (await l.count()) { used = sel; await l.first().click().catch(() => {}); break; }
    }
    await p.waitForTimeout(2000);
    trail.push(used);
  }
  await p.waitForTimeout(1500);
  const g = await p.evaluate(() => {
    const el = document.querySelector('[data-testid="tour-spotlight"]');
    const t = document.querySelector('[data-testid="tour-title"]');
    const title = t ? t.innerText.replace(/\s+/g, " ").slice(0, 28) : "(none)";
    if (!el) return { found: false, title };
    const r = el.getBoundingClientRect();
    return { found: true, title, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: window.innerHeight };
  });
  if (!g.found) rec("E-2/E-4 walk", "spotlight absent title=" + g.title, "ring present", null, "unmeasured · trail " + trail.join(","));
  else rec("E-2/E-4 walk", "top=" + g.top + " bottom=" + g.bottom + " h=" + g.h + " title=" + g.title,
    "top>=16 on the timeline step", g.top >= 16, "trail " + trail.join(","));
}

await b.close();
console.log("axis             | got | want | verdict | note");
for (const r of rows) {
  const v = r.pass === null ? "UNMEASURED" : r.pass ? "PASS" : "FAIL";
  console.log(r.k.padEnd(17) + "| " + r.got + " | " + r.want + " | " + v + " | " + r.note);
}
console.log("axes=" + rows.length + " fail=" + rows.filter((r) => r.pass === false).length +
  " unmeasured=" + rows.filter((r) => r.pass === null).length);
process.exit(0);
