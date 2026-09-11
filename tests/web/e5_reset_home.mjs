/** T-E5-V - reset takes the screen home, and the failure branch does not move anything.
 * Columns, in this order (the stimulus first, so a control cannot eat it):
 *   A  investigation screen -> reset -> lands on /overview, no run card, intro back, tour key gone
 *   B  already on /overview -> reset -> address unchanged, the served screen is refreshed
 *   C  reset forced to 500 -> no navigation, keys kept, the screen says it failed
 * ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
if (!BASE) { console.error("usage: --base URL"); process.exit(2); }

const RUNADDR = "/incidents/INC-2026-014?run=STATIC-GS-01";
const TOUR_KEY = "fkt.tour.v1";
const T_CANCEL = "취소";
const rows = [];
const rec = (k, vp, got, want, pass, note) => rows.push({ k, vp, got: String(got), want, pass, note: note || "" });

const snap = (p) => p.evaluate(() => ({
  path: location.pathname, search: location.search,
  tour: localStorage.getItem("fkt.tour.v1"),
  intro: Object.keys(sessionStorage).filter((k) => k.indexOf("fkt.intro.seen:") === 0).length,
  runCard: document.querySelectorAll('[data-testid="run-console"], [data-testid="run-timeline"]').length,
  introCard: document.querySelectorAll('[data-testid="intro-card"]').length,
  nav: performance.getEntriesByType("navigation").length,
}));

async function doReset(p) {
  await p.locator('[data-testid="reset-button"]').click();
  await p.waitForTimeout(600);
  const dlg = p.locator('[role="dialog"], [role="alertdialog"]');
  const scope = (await dlg.count()) ? dlg.last() : p.locator("body");
  const cand = scope.locator("button");
  let pressed = "(none)";
  for (let i = 0, m = await cand.count(); i < m; i++) {
    const t = (await cand.nth(i).innerText().catch(() => "")).trim();
    if (t && t !== T_CANCEL && t.indexOf("✕") === -1) { pressed = t; await cand.nth(i).click().catch(() => {}); break; }
  }
  await p.waitForTimeout(2600);
  return pressed;
}

const b = await chromium.launch();

for (const vp of [{ w: 1440, h: 900, n: "1440" }, { w: 412, h: 915, n: "412" }]) {
  /* A - reset from the investigation screen */
  {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
      [TOUR_KEY, JSON.stringify({ v: 1, status: "dismissed", step: 2 })]);
    const p = await ctx.newPage();
    /* the investigation address needs a session; visit home first so the shell mints one,
       and close the intro card so the app bar is operable */
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    const c0 = p.locator('[data-testid="intro-card"]');
    if (await c0.count()) { const bb = c0.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
    await p.waitForTimeout(300);
    await p.goto(BASE + RUNADDR, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2200);
    const before = await snap(p);
    const pressed = await doReset(p);
    const after = await snap(p);
    rec("A/land", vp.n, before.path + " -> " + after.path + after.search, "/overview with no run query",
      after.path.indexOf("/overview") === 0 && after.search === "", "confirm=" + pressed);
    rec("A/runcard", vp.n, before.runCard + " -> " + after.runCard, "0 after", after.runCard === 0, "");
    rec("A/intro", vp.n, "introCard=" + after.introCard, ">=1 (first-visit card is back)", after.introCard >= 1, "");
    rec("A/tourkey", vp.n, (before.tour === null ? "null" : "set") + " -> " + (after.tour === null ? "null" : "set"),
      "cleared", before.tour !== null && after.tour === null, "");
    await ctx.close();
  }

  /* B - reset while already on /overview */
  {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1600);
    const card = p.locator('[data-testid="intro-card"]');
    if (await card.count()) { const bb = card.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
    await p.waitForTimeout(400);
    const before = await snap(p);
    const pressed = await doReset(p);
    const after = await snap(p);
    rec("B/stay", vp.n, before.path + " -> " + after.path, "stays on /overview",
      after.path.indexOf("/overview") === 0, "confirm=" + pressed);
    rec("B/noreload", vp.n, "nav " + before.nav + " -> " + after.nav, "unchanged (soft refresh, not a reload)",
      before.nav === after.nav, "");
    rec("B/intro", vp.n, before.introCard + " -> " + after.introCard, "card returns after the refresh",
      before.introCard === 0 && after.introCard >= 1, "served screen was re-fetched");
    await ctx.close();
  }

  /* C - failure branch */
  {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
      [TOUR_KEY, JSON.stringify({ v: 1, status: "dismissed", step: 2 })]);
    let hits = 0;
    await ctx.route("**/api/sessions/*/reset", async (route) => {
      hits += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"internal","message":"forced"}}' });
    });
    const p = await ctx.newPage();
    /* the investigation address needs a session; visit home first so the shell mints one,
       and close the intro card so the app bar is operable */
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    const c0 = p.locator('[data-testid="intro-card"]');
    if (await c0.count()) { const bb = c0.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
    await p.waitForTimeout(300);
    await p.goto(BASE + RUNADDR, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2200);
    const before = await snap(p);
    await doReset(p);
    const after = await snap(p);
    const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    rec("C/stimulus", vp.n, "intercepted=" + hits, ">=1", hits >= 1, "else the column tested nothing");
    rec("C/nomove", vp.n, before.path + before.search + " -> " + after.path + after.search, "unchanged",
      before.path === after.path && before.search === after.search, "");
    rec("C/keys", vp.n, (after.tour === null ? "null" : "kept"), "kept", after.tour !== null, "");
    rec("C/message", vp.n, body.indexOf("초기화하지 못했습니다") !== -1, "screen says it failed",
      body.indexOf("초기화하지 못했습니다") !== -1, "");
    await ctx.close();
  }
}

await b.close();
console.log("cell        | vp   | got | want | verdict | note");
for (const r of rows) console.log(r.k.padEnd(12) + "| " + r.vp.padEnd(4) + " | " + r.got + " | " + r.want + " | " + (r.pass ? "PASS" : "FAIL") + " | " + r.note);
const bad = rows.filter((r) => !r.pass).length;
console.log("cells=" + rows.length + " fail=" + bad);
process.exit(0);
