/**
 * D-53 축②③ — 「배지가 «너무 오래된» 답으로 계속 말하지 않는가」.
 *
 * 🔴 신선도는 **브라우저 시계**로 잰다(`seenAt + 45s`) — 그래서 `page.clock` 으로 앞당길 수 있다.
 * 🔴 **그냥 앞당기면 폴링이 먼저 돈다** — 타이머가 함께 뛰어 새 응답이 오고 `seenAt` 이 갱신되어
 *    낡음이 «영영 안 온다». 그래서 첫 성공 뒤 `/live/status` 를 «끊고» 나서 앞당긴다
 *    (그것이 이 결함의 실제 무대다: 탭이 얼었다가 돌아온 상황).
 * 🔴 대조군은 같은 자극에서 «안 변해야» 한다. 둘 다 변하거나 둘 다 안 변하면 못 가른 것이다.
 *
 *   node d53_freshness.mjs --base http://127.0.0.1:8151 --label target --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8151");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const ADVANCE = arg("advance", "70");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const badge = (p) => p.evaluate(() => {
  const e = document.querySelector('[data-testid="mode-badge"]');
  return e ? { mode: e.getAttribute("data-mode"), text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) } : null;
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const out = { label: LABEL, base: BASE, advanceSec: Number(ADVANCE), at: new Date().toISOString(), statusCalls: 0, blockedCalls: 0 };
await page.clock.install();
page.on("response", (r) => { if (/\/api\/live\/status/.test(r.url())) out.statusCalls += 1; });

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
/* 시계를 멈춰 두었으므로 «수동으로» 조금 굴려 첫 폴링·렌더를 통과시킨다. */
await page.clock.runFor(3000);
await sleep(1500);
/* 🔴 «성공한 상태»가 서기 «전»에는 낡음을 잴 대상이 없다 — unavailable 로 시작하면 그건 무대 미성립이지
   처방의 답이 아니다(1차 실측: 양 열 다 unavailable 이었다). 성공 상태가 뜰 때까지 시계를 굴려 본다. */
for (let k = 0; k < 12; k++) {
  out.before = await badge(page);
  if (out.before && out.before.mode && out.before.mode !== "unavailable" && out.before.mode !== "checking") break;
  await page.clock.runFor(2000);
  await sleep(400);
}
out.settleTries = 12;

/* 🔴 이제 응답을 끊는다 — 자극은 「오래된 답을 들고 있는 상태」다. */
await page.route(/\/api\/live\/status/, (r) => { out.blockedCalls += 1; return r.abort(); });

/* 조금씩 굴리며 «전이 시점»을 찾는다 — 한 시점만 보면 「지나가는 상태」와 못 가른다. */
out.timeline = [];
for (let t = 0; t <= Number(ADVANCE); t += 5) {
  const b = await badge(page);
  const last = out.timeline[out.timeline.length - 1];
  if (!last || last.mode !== b?.mode || last.text !== b?.text) out.timeline.push({ atSec: t, ...(b ?? {}) });
  await page.clock.runFor(5000);
  await sleep(120);
}
out.after = await badge(page);
out.changed = JSON.stringify(out.before) !== JSON.stringify(out.after);
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
if (!out.before || !out.before.mode || out.before.mode === "unavailable" || out.before.mode === "checking") { console.error("무대 미성립 — 성공 상태가 안 섰다(" + JSON.stringify(out.before) + ")"); process.exit(2); }
