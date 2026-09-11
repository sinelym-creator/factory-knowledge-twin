/** Promotion 27 - the operator's path on the public face, 412 phone profile, one pass.
 *
 * The path: overview -> investigation -> evidence -> document -> the back control.
 * D-91's fix is "there is a way back from a document". The judging line comes from the fix's
 * own code (app/documents/[docId]/page.tsx): a control carrying data-testid="document-back",
 * whose href is one of three branches. Which branch is a recorded value, not a pass line -
 * the branch depends on whether the session knows the run, and a static replay run has no
 * session behind it. What is judged: the control exists, it is hittable, and clicking it
 * lands on a served page.
 *
 * Read-only: static replay run id only, no scenario is started, no subscription is spent.
 * The hit area is measured with elementFromPoint, not boundingBox.
 * ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
if (!BASE) { console.error("usage: --base https://host [--run STATIC-GS-01]"); process.exit(2); }
const RUN = args.get("run") || "STATIC-GS-01";

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const rows = [];
const rec = (k, got, want, pass, note) => rows.push({ k, got: String(got), want, pass, note: note || "" });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

/** click and wait for the address to change - a client navigation never re-fires load. */
async function clickAndLand(locator, label) {
  const before = p.url();
  await locator.click({ timeout: 8000 }).catch(() => {});
  await p.waitForFunction((u) => location.href !== u, before, { timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(1200);
  return { from: new URL(before).pathname, to: new URL(p.url()).pathname + new URL(p.url()).search, label };
}

/* step 1 - overview */
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
const intro = p.locator('[data-testid="intro-card"]');
if (await intro.count()) { const bb = intro.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
await p.waitForTimeout(400);
rec("1 overview", p.url().replace(BASE, "") + " ids=" + (await p.locator("[data-testid]").count()),
  "a screen renders", (await p.locator("[data-testid]").count()) > 0, "");

/* step 2 - the investigation, reached by the static replay run */
/* the incident must be the one the static run belongs to - an incident picked off the
   overview may have no run attached, and then steps 3..6 walk a path with no run on it.
   The id is not invented: it is the incident in apps/web-console/lib/static-replay. */
const INCIDENT = args.get("incident") || "INC-2026-014";
await p.goto(BASE + "/incidents/" + INCIDENT + "?run=" + RUN, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
rec("2 investigation", new URL(p.url()).pathname + new URL(p.url()).search + " ids=" + (await p.locator("[data-testid]").count()),
  "the investigation is served with the static run", (await p.locator("[data-testid]").count()) > 0,
  "incident = the static replay run's own");

/* step 3 - evidence, chosen by the page itself (do not invent a coordinate) */
const evHref = await p.evaluate(() =>
  (Array.from(document.querySelectorAll('a[href*="/evidence/"]')).map((x) => x.getAttribute("href"))[0] || null));
if (!evHref) rec("3 evidence", "no evidence link on the investigation", "-", null, "unmeasured");
else {
  await p.goto(BASE + evHref, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  rec("3 evidence", new URL(p.url()).pathname + " ids=" + (await p.locator("[data-testid]").count()),
    "the evidence page is served", (await p.locator("[data-testid]").count()) > 0, "href " + evHref);
}

/* step 4 - the document, chosen by the evidence page itself */
const docHref = await p.evaluate(() =>
  (Array.from(document.querySelectorAll('a[href*="/documents/"]')).map((x) => x.getAttribute("href"))[0] || null));
/* the fallback keeps the run on it - a document reached without the run is a different
   branch of the fix, and judging that one while calling it the operator's path would be a
   quieter kind of wrong. */
const docPath = docHref || "/documents/DOC-MAN-0021?run=" + RUN +
  (evHref ? "&highlight=" + evHref.split("/").pop().split("?")[0] : "");
await p.goto(BASE + docPath, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
rec("4 document", new URL(p.url()).pathname + new URL(p.url()).search,
  "the document is served", (await p.locator("[data-testid]").count()) > 0,
  docHref ? "href from evidence" : "fell back to DOC-MAN-0021");

/* step 5 - the fix itself: the way back */
const back = p.locator('[data-testid="document-back"]');
const n = await back.count();
rec("5 back control", "count=" + n, ">=1 (D-91 fix present on the public face)", n >= 1, "");

if (n >= 1) {
  const info = await back.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    return {
      label: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 32),
      href: el.getAttribute("href") || "(not an anchor)",
      box: Math.round(r.height),
      inside: !!hit && (hit === el || el.contains(hit)),
      cx, cy, vh: window.innerHeight,
    };
  });
  rec("5a back label", info.label + " | href=" + info.href, "recorded, not judged - the branch is session-dependent", true, "");
  rec("5b hittable", "elementFromPoint inside=" + info.inside + " box_h=" + info.box + " at(" + info.cx + "," + info.cy + ") vh=" + info.vh,
    "the control is the top element at its own centre", info.inside === true, "");
  const land = await clickAndLand(back.first(), info.label);
  const served = await p.locator("[data-testid]").count();
  rec("6 landing", land.from + " -> " + land.to + " ids=" + served,
    "clicking lands on a served page", land.to !== land.from && served > 0, "");
} else {
  rec("5a back label", "-", "-", null, "unmeasured (no control)");
  rec("5b hittable", "-", "-", null, "unmeasured (no control)");
  rec("6 landing", "-", "-", null, "unmeasured (no control)");
}

await b.close();
console.log("axis           | got | want | verdict | note");
for (const r of rows) {
  const v = r.pass === null ? "UNMEASURED" : r.pass ? "PASS" : "FAIL";
  console.log(r.k.padEnd(15) + "| " + r.got + " | " + r.want + " | " + v + " | " + r.note);
}
console.log("axes=" + rows.length + " fail=" + rows.filter((r) => r.pass === false).length +
  " unmeasured=" + rows.filter((r) => r.pass === null).length);
process.exit(0);
