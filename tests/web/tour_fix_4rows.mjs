/** T-TOUR-V axis 1 - E-1..E-4 table. ASCII console. Judged on results, not on calls. */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium, devices } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const LABEL = args.get("label") || "?";
if (!BASE) { console.error("usage: --base URL --label X"); process.exit(2); }

const TOUR_KEY = "fkt.tour.v1";
const INTRO_PREFIX = "fkt.intro.seen:";
const T_RESTART = "처음부터";
const T_GOTO_INV = "조사 화면으로 이동";
const T_CANCEL = "취소";

const rows = [];
const rec = (e, view, got, want, pass, note) => rows.push({ e, view, got: String(got), want, pass, note: note || "" });

async function open(b, view, seed) {
  const opt = view === "390"
    ? Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 844 } })
    : { viewport: { width: 1440, height: 900 } };
  const ctx = await b.newContext(opt);
  if (seed) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [TOUR_KEY, seed]);
  const p = await ctx.newPage();
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1000);
  return { ctx, p };
}

const snap = (p) => p.evaluate(() => ({
  ss: Object.keys(sessionStorage),
  tour: localStorage.getItem("fkt.tour.v1"),
  nav: performance.getEntriesByType("navigation").length,
}));

async function closeIntro(p) {
  const card = p.locator('[data-testid="intro-card"]');
  if (await card.count()) {
    const bb = card.locator("button");
    if (await bb.count()) await bb.last().click().catch(() => {});
  }
  await p.waitForTimeout(350);
}

/* the reset control opens a confirm dialog portalled to body; press the button that is not cancel */
async function doReset(p) {
  await p.locator('[data-testid="reset-button"]').click();
  await p.waitForTimeout(600);
  const dlg = p.locator('[role="dialog"], [role="alertdialog"]');
  const scope = (await dlg.count()) ? dlg.last() : p.locator("body");
  const cand = scope.locator("button");
  const m = await cand.count();
  let pressed = "(none)";
  for (let i = 0; i < m; i++) {
    const t = (await cand.nth(i).innerText().catch(() => "")).trim();
    if (t && t !== T_CANCEL && t.indexOf("✕") === -1) {
      pressed = t;
      await cand.nth(i).click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(2200);
  return pressed;
}

const b = await chromium.launch();

for (const view of ["1440", "390"]) {
  try {
    const o = await open(b, view, null);
    await closeIntro(o.p);
    const before = await snap(o.p);
    const introBefore = before.ss.filter((k) => k.indexOf(INTRO_PREFIX) === 0).length;
    const pressed = await doReset(o.p);
    const after = await snap(o.p);
    const introAfter = after.ss.filter((k) => k.indexOf(INTRO_PREFIX) === 0).length;
    rec("E-1", view, "before=" + introBefore + " after=" + introAfter, "before>=1 after=0",
      introBefore >= 1 && introAfter === 0, "confirm=" + pressed);
    await o.ctx.close();
  } catch (e) { rec("E-1", view, "runner threw: " + String(e && e.message).slice(0, 70), "-", null, "my runner"); }

  try {
    const seed = JSON.stringify({ v: 1, status: "running", step: 6 });
    const o = await open(b, view, seed);
    await closeIntro(o.p);
    const s0 = await snap(o.p);
    let st0 = null;
    try { st0 = JSON.parse(s0.tour || "null"); } catch (e) {}
    if (!st0 || st0.status !== "running" || st0.step !== 6) {
      rec("E-2", view, "seed not held: " + s0.tour, "status=running step=6", null, "stimulus never took - unmeasured");
    } else {
      const urlBefore = new URL(o.p.url()).pathname;
      /* a run already in progress shows no invite card - the resume control is the app-bar
         tutorial button, which fires TOUR_OPEN_EVENT */
      let start = o.p.locator('[data-testid="tour-start"]');
      if (!(await start.count())) start = o.p.locator('[data-testid="intro-reopen"]');
      const label = (await start.count()) ? (await start.first().innerText()).trim() : "(none)";
      if (!(await start.count())) {
        rec("E-2", view, "no resume control on screen", "a clickable resume control", null, "stimulus not delivered - unmeasured");
        await o.ctx.close();
        continue;
      }
      await start.first().click();
      await o.p.waitForTimeout(2200);
      let urlAfter = new URL(o.p.url()).pathname;
      /* attribution column: if the control did not move us, fire the documented open event
         directly. That separates "the fix does not work" from "my click did not reach it". */
      let via = "control";
      if (urlAfter.indexOf("/incidents/") !== 0) {
        await o.p.evaluate(() => window.dispatchEvent(new CustomEvent("fkt:tour-open")));
        await o.p.waitForTimeout(2200);
        const u2 = new URL(o.p.url()).pathname;
        if (u2 !== urlAfter) { via = "event"; urlAfter = u2; } else { via = "neither"; }
      }
      rec("E-2c", view, "moved via " + via, "control (event = control did not deliver)",
        via === "control" ? true : via === "event" ? null : false, "attribution of the stimulus");
      const s1 = await snap(o.p);
      let step1 = null;
      try { step1 = JSON.parse(s1.tour || "null").step; } catch (e) {}
      const onInc = urlAfter.indexOf("/incidents/") === 0;
      const body = (await o.p.locator("body").innerText()).replace(/\s+/g, " ");
      const goBtn = body.indexOf(T_GOTO_INV) !== -1;
      rec("E-2", view, "url " + urlBefore + " -> " + urlAfter + " step=" + step1,
        "lands on /incidents/ and step stays 6", onInc && step1 === 6, "start=" + label);
      rec("E-2b", view, "gotoLabel=" + goBtn, "true", goBtn, "copy from entryHrefFor");
    }
    await o.ctx.close();
  } catch (e) { rec("E-2", view, "runner threw: " + String(e && e.message).slice(0, 70), "-", null, "my runner"); }

  try {
    const o = await open(b, view, null);
    /* do not dismiss the intro card here - closing it also retires the invite card that
       carries the tour-start control, and then the stimulus never happens */
    await o.p.locator('[data-testid="tour-start"]').click();
    await o.p.waitForTimeout(1300);
    /* a running tour shows tour-skip, not tour-later; while the overlay is up the app bar is
       inert, so the run must be interrupted from the screen before reset can be pressed */
    const skip = o.p.locator('[data-testid="tour-skip"]');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await o.p.waitForTimeout(900);
    const mid = await snap(o.p);
    const hadTour = mid.tour !== null;
    /* "start over" belongs to the interrupted run, i.e. BEFORE the reset. After the reset the
       key is gone, so the first-visit invite is the correct copy - measuring it after the
       reset would invent a defect. Two cells, two moments. */
    const inviteMid = o.p.locator('[data-testid="tour-invite"]');
    const copyMid = (await inviteMid.count()) ? (await inviteMid.first().innerText()).replace(/\s+/g, " ").trim() : "(none)";
    const restartMid = (await o.p.locator('[data-testid="tour-restart"]').count()) > 0 || copyMid.indexOf(T_RESTART) !== -1;
    const pressed = await doReset(o.p);
    const after = await snap(o.p);
    const restart = o.p.locator('[data-testid="tour-restart"]');
    const invite = o.p.locator('[data-testid="tour-invite"]');
    const copy = (await invite.count()) ? (await invite.first().innerText()).replace(/\s+/g, " ").trim() : "(none)";
    const fromStart = (await restart.count()) > 0 || copy.indexOf(T_RESTART) !== -1;
    rec("E-3", view, "hadTour=" + hadTour + " tourAfter=" + (after.tour === null ? "null" : after.tour) + " nav " + mid.nav + "->" + after.nav,
      "key wiped and no reload", hadTour && after.tour === null && mid.nav === after.nav, "confirm=" + pressed);
    rec("E-3b", view, "beforeReset=" + restartMid + " afterReset=" + fromStart,
      "before=true (interrupted) after=false (key gone)", restartMid === true && fromStart === false,
      "mid=" + copyMid.slice(0, 40) + " | after=" + copy.slice(0, 40));
    await o.ctx.close();
  } catch (e) { rec("E-3", view, "runner threw: " + String(e && e.message).slice(0, 70), "-", null, "my runner"); }

  try {
    const o = await open(b, view, null);
    await o.p.locator('[data-testid="tour-start"]').click();
    await o.p.waitForTimeout(1400);
    /* step 0 has no spotlight target; walk one step so a target exists to measure */
    const next = o.p.locator('[data-testid="tour-next"]');
    if (await next.count()) await next.first().click().catch(() => {});
    await o.p.waitForTimeout(1600);
    const g = await o.p.evaluate(() => {
      const el = document.querySelector('[data-testid="tour-spotlight"]');
      if (!el) return { found: false, vh: window.innerHeight };
      const r = el.getBoundingClientRect();
      return { found: true, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
    });
    if (!g.found) rec("E-4", view, "tour-spotlight absent", "head>=0", null, "no node - unmeasured");
    else rec("E-4", view, "top=" + g.top + " vh=" + g.vh, "top>=0", g.top >= 0, "bottom=" + g.bottom);
    await o.ctx.close();
  } catch (e) { rec("E-4", view, "runner threw: " + String(e && e.message).slice(0, 70), "-", null, "my runner"); }
}

await b.close();

console.log("=== " + LABEL + " (" + BASE + ") ===");
console.log("E    | view | got | want | verdict | note");
for (const r of rows) {
  const v = r.pass === null ? "UNMEASURED" : r.pass ? "PASS" : "FAIL";
  console.log(r.e.padEnd(5) + "| " + r.view.padEnd(4) + " | " + r.got + " | " + r.want + " | " + v + " | " + r.note);
}
console.log("rows=" + rows.length + " fail=" + rows.filter((r) => r.pass === false).length +
  " unmeasured=" + rows.filter((r) => r.pass === null).length);
process.exit(0);
