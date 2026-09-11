/** T-P26r axis 5, last cell - does the evidence.flagged event reach the browser as a frame?
 * If it does and no badge appears, the subject is the screen. If it never arrives, the
 * subject is the replay transport. Counts every frame type so the answer is not a bare zero.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
if (!BASE) { console.error("usage: --base URL"); process.exit(2); }

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();

const types = new Map();
let frames = 0, sockets = 0, flagged = 0;
const flaggedRaw = [];
p.on("websocket", (ws) => {
  sockets += 1;
  console.log("ws opened:", ws.url());
  ws.on("framereceived", (d) => {
    frames += 1;
    const s = typeof d.payload === "string" ? d.payload : String(d.payload);
    const m = s.match(/"type"\s*:\s*"([a-zA-Z._]+)"/);
    if (m) types.set(m[1], (types.get(m[1]) || 0) + 1);
    if (s.indexOf("evidence.flagged") !== -1) { flagged += 1; if (flaggedRaw.length < 1) flaggedRaw.push(s.slice(0, 220)); }
  });
});

await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
const card = p.locator('[data-testid="intro-card"]');
if (await card.count()) { const bb = card.locator("button"); if (await bb.count()) await bb.last().click().catch(() => {}); }
await p.waitForTimeout(300);
const go = p.locator('[data-testid="start-from-alarm"]');
if (!(await go.count())) { console.log("no start control - unmeasured"); await b.close(); process.exit(2); }
await go.first().click();
await p.waitForTimeout(20000);

const badges = await p.locator('[data-testid="evidence-flag-badge"]').count().catch(() => 0);
await b.close();

console.log("sockets:", sockets, "frames:", frames);
console.log("frame types:", JSON.stringify([...types.entries()].sort((a, b2) => b2[1] - a[1])));
console.log("evidence.flagged frames:", flagged);
if (flaggedRaw.length) console.log("first flagged frame:", flaggedRaw[0]);
console.log("badges on screen:", badges);
console.log("subject:", frames === 0 ? "UNMEASURED - no frames captured at all"
  : flagged > 0 ? (badges > 0 ? "no defect - badge rendered" : "SCREEN - the frame arrived and nothing was drawn")
  : "TRANSPORT - the event never reached the browser");
process.exit(0);
