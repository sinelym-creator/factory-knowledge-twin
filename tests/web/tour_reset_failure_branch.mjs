/** T-TOUR-V axis 4 - the reset failure branch keeps the keys.
 *
 * The fix clears the intro/tour keys only when the server replied ok. This net makes the
 * server fail and asks whether the keys survive - and runs the success column in the same
 * execution, because a net that only sees the failing side cannot tell a working guard from
 * a reset that never clears anything.
 *
 * ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium, devices } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
if (!BASE) { console.error("usage: --base URL"); process.exit(2); }

const TOUR_KEY = "fkt.tour.v1";
const INTRO_PREFIX = "fkt.intro.seen:";
const T_CANCEL = "취소";

const rows = [];
const rec = (k, got, want, pass, note) => rows.push({ k, got: String(got), want, pass, note: note || "" });

const snap = (p) => p.evaluate(() => ({
  intro: Object.keys(sessionStorage).filter((k) => k.indexOf("fkt.intro.seen:") === 0).length,
  tour: localStorage.getItem("fkt.tour.v1"),
}));

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
  await p.waitForTimeout(2400);
  return pressed;
}

/** one column. failServer=true intercepts the reset call and answers 500. */
async function column(b, failServer) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
    [TOUR_KEY, JSON.stringify({ v: 1, status: "dismissed", step: 3 })]);
  let intercepted = 0;
  if (failServer) {
    await ctx.route("**/api/sessions/*/reset", async (route) => {
      intercepted += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"internal","message":"forced"}}' });
    });
  }
  const p = await ctx.newPage();
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1000);
  // close the intro card so "seen" is written
  const card = p.locator('[data-testid="intro-card"]');
  if (await card.count()) {
    const bb = card.locator("button");
    if (await bb.count()) await bb.last().click().catch(() => {});
  }
  await p.waitForTimeout(400);
  const before = await snap(p);
  const pressed = await doReset(p);
  const after = await snap(p);
  const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  await ctx.close();
  return { before, after, pressed, intercepted, body };
}

const b = await chromium.launch();

// stimulus column first - a control run would otherwise leave state behind
const fail = await column(b, true);
const ok = await column(b, false);

await b.close();

rec("stimulus-live", "intercepted=" + fail.intercepted, ">=1 (otherwise nothing was forced)",
  fail.intercepted >= 1, "if 0, the failure column measured nothing");
rec("fail/intro", fail.before.intro + " -> " + fail.after.intro, "kept (before==after)",
  fail.before.intro >= 1 && fail.after.intro === fail.before.intro, "server failed");
rec("fail/tour", (fail.before.tour === null ? "null" : "set") + " -> " + (fail.after.tour === null ? "null" : "set"),
  "kept", fail.before.tour !== null && fail.after.tour !== null, "server failed");
rec("fail/message", fail.body.indexOf("초기화하지 못했습니다") !== -1,
  "screen says it failed", fail.body.indexOf("초기화하지 못했습니다") !== -1, "");
rec("ok/intro", ok.before.intro + " -> " + ok.after.intro, "cleared (after==0)",
  ok.before.intro >= 1 && ok.after.intro === 0, "server ok - the negative column");
rec("ok/tour", (ok.before.tour === null ? "null" : "set") + " -> " + (ok.after.tour === null ? "null" : "set"),
  "cleared", ok.before.tour !== null && ok.after.tour === null, "server ok - the negative column");

console.log("=== reset failure branch (" + BASE + ") ===");
console.log("cell            | got | want | verdict | note");
for (const r of rows) {
  console.log(r.k.padEnd(16) + "| " + r.got + " | " + r.want + " | " + (r.pass ? "PASS" : "FAIL") + " | " + r.note);
}
const bad = rows.filter((r) => !r.pass).length;
console.log("cells=" + rows.length + " fail=" + bad);
process.exit(bad ? 1 : 0);
