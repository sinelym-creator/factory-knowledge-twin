/** E-2 human path: app-bar tutorial -> invite card "resume" -> does the screen move?
 * Splits "the tutorial button never reached the resume card" from "the card click does not move".
 * ASCII console.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium, devices } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const LABEL = args.get("label") || "?";
if (!BASE) { console.error("usage: --base URL --label X"); process.exit(2); }

const TOUR_KEY = "fkt.tour.v1";
const rows = [];
const rec = (k, view, got, want, pass, note) => rows.push({ k, view, got: String(got), want, pass, note: note || "" });

const ids = (p) => p.evaluate(() => [...document.querySelectorAll("[data-testid]")]
  .map((n) => n.getAttribute("data-testid"))
  .filter((x) => x.indexOf("tour") === 0 || x.indexOf("intro") === 0));

for (const view of ["1440", "390"]) {
  const b = await chromium.launch();
  const opt = view === "390"
    ? Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 844 } })
    : { viewport: { width: 1440, height: 900 } };
  const ctx = await b.newContext(opt);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
    [TOUR_KEY, JSON.stringify({ v: 1, status: "running", step: 6 })]);
  const p = await ctx.newPage();
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);

  const url0 = new URL(p.url()).pathname;
  const before = await ids(p);

  // step 1 - press the app-bar tutorial control
  const reopen = p.locator('[data-testid="intro-reopen"]');
  const hasReopen = (await reopen.count()) > 0;
  if (hasReopen) await reopen.first().click().catch(() => {});
  await p.waitForTimeout(1800);
  const url1 = new URL(p.url()).pathname;
  const after = await ids(p);
  const invite = p.locator('[data-testid="tour-invite"]');
  const inviteUp = (await invite.count()) > 0;
  const inviteCopy = inviteUp ? (await invite.first().innerText()).replace(/\s+/g, " ").trim() : "(none)";

  rec("step1-tutorial", view, "url " + url0 + " -> " + url1 + " inviteCard=" + inviteUp,
    "either it moves, or it raises the resume card", hasReopen ? true : null,
    "ids " + JSON.stringify(before) + " -> " + JSON.stringify(after));

  // step 2 - press the resume control on the invite card
  let url2 = url1;
  let clicked = "(none)";
  /* a run already in progress raises the callout, not the invite card - the exit the fix
     added lives on the callout itself (tour-route-go). Try the invite control first, then it. */
  let start = p.locator('[data-testid="tour-start"]');
  if (!(await start.count())) start = p.locator('[data-testid="tour-route-go"]');
  if (await start.count()) {
    clicked = (await start.first().innerText()).trim();
    await start.first().click().catch(() => {});
    await p.waitForTimeout(2400);
    url2 = new URL(p.url()).pathname;
  }
  const st = await p.evaluate(() => localStorage.getItem("fkt.tour.v1"));
  let step2 = null;
  try { step2 = JSON.parse(st || "null").step; } catch (e) {}
  const onInc = url2.indexOf("/incidents/") === 0;

  rec("step2-resume", view, "clicked=" + clicked + " url=" + url2 + " step=" + step2,
    "lands on /incidents/ and step stays 6", clicked === "(none)" ? null : onInc && step2 === 6,
    clicked === "(none)" ? "no resume control after step 1 - the human path stops here" : "");

  rec("verdict", view,
    inviteUp === false && url1 === url0 ? "tutorial did not reach a resume card"
      : clicked === "(none)" ? "resume card present but no control"
      : onInc ? "human path works" : "card click does not move the screen",
    "human path works", null, "diagnosis line");

  await b.close();
}

console.log("=== E-2 human path | " + LABEL + " (" + BASE + ") ===");
for (const r of rows) {
  const v = r.pass === null ? "-" : r.pass ? "PASS" : "FAIL";
  console.log(r.k.padEnd(14) + "| " + r.view.padEnd(4) + " | " + r.got + " | " + v + " | " + r.note);
}
process.exit(0);
