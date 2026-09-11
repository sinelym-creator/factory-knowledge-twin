/** T-P26r axis 5, second attempt - watch the live window while the replay run flows.
 * Polls for the badge every 500ms instead of reading once at the end, because a run screen
 * entered after completion is restored from a snapshot and the snapshot may not carry the
 * event. Also prints the evidence ids the cards actually use, so a mismatch is visible.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const SHOT = args.get("shot") || "/tmp/badge.png";
if (!BASE) { console.error("usage: --base URL [--shot p]"); process.exit(2); }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await ctx.newPage();
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
const card = p.locator('[data-testid="intro-card"]');
if (await card.count()) { const bb = card.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
await p.waitForTimeout(300);
const go = p.locator('[data-testid="start-from-alarm"]');
if (!(await go.count())) { console.log("no start control - unmeasured"); await b.close(); process.exit(2); }
await go.first().click();

let best = 0, seenAt = -1;
for (let i = 0; i < 60; i++) {
  const n = await p.locator('[data-testid="evidence-flag-badge"]').count().catch(() => 0);
  if (n > best) { best = n; seenAt = i; }
  if (best > 0 && i > seenAt + 4) break;
  await p.waitForTimeout(500);
}
console.log("url:", new URL(p.url()).search);
console.log("max badge count seen:", best, "(first at poll", seenAt, ")");

const info = await p.evaluate(() => {
  const badges = [...document.querySelectorAll('[data-testid="evidence-flag-badge"]')].map((n) => ({
    id: n.getAttribute("data-evidence-id"), flags: n.getAttribute("data-flags"),
    title: (n.getAttribute("title") || "").slice(0, 50), text: (n.textContent || "").trim(),
  }));
  const cardIds = [...document.querySelectorAll('[data-testid="evidence-card"]')]
    .slice(0, 8).map((n) => (n.innerText || "").split("\n")[0].trim());
  return { badges, cardIds };
});
console.log("evidence card ids on screen:", JSON.stringify(info.cardIds));
for (const x of info.badges) console.log("  badge", JSON.stringify(x));
await p.screenshot({ path: SHOT, fullPage: false });
console.log("screenshot:", SHOT);
await b.close();
process.exit(0);
