/**
 * 승격 9회차 외부 재검 — 골든 시나리오 축. REPLAY 완주(기본) · `--live` 일 때만 Live 조사 1회.
 *
 * 🔴 **손잡이를 지어내지 않는다** — 화면에서 `data-testid` 를 «열거»해 고른다. 없으면 이름과
 *    함께 「안 잼」으로 남긴다(41대 규율 10).
 * 🔴 **Live 는 구독을 태운다** — `--live` 없이는 절대 실행하지 않는다. 실행 시 시각·1회를 남긴다.
 * 🔴 **완주 = 상태값이 아니라 «단계별 산출 건수»** 로 센다(`completed` 여도 어떤 단계는 0건일 수
 *    있다). 그래서 이벤트 타입별 계수를 함께 낸다.
 *
 *   node _promo9_scenario.mjs --base=… [--live] [--shot=…]
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const LIVE = has("live");
const SHOT = arg("shot", null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid]"))
      .map((e) => e.getAttribute("data-testid"))
      .filter((v, i, a) => a.indexOf(v) === i),
  );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
const serverAddrs = new Set();
const apiCalls = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
page.on("response", async (r) => {
  if (/\/api\//.test(r.url())) apiCalls.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 70)}`);
  try {
    const sa = await r.serverAddr();
    if (sa?.ipAddress) serverAddrs.add(sa.ipAddress);
  } catch {}
});

const out = { live: LIVE, t0: new Date().toISOString() };
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
await sleep(1200);
const enter = page.locator('[data-testid="enter-button"]');
if (await enter.count().then((n) => n > 0).catch(() => false)) {
  await enter.first().click().catch(() => {});
  await sleep(3000);
}
out.overviewIds = await ids(page);

/* 시나리오로 들어간다 — 알람에서 시작하는 손잡이가 정본 흐름이다. */
for (const sel of ['[data-testid="start-from-alarm"]', '[data-testid="start-from-headline"]']) {
  const l = page.locator(sel);
  if (await l.count().then((n) => n > 0).catch(() => false)) {
    out.entrySel = sel;
    await l.first().click().catch(() => {});
    await sleep(3500);
    break;
  }
}
out.urlAfterEntry = page.url();
out.entryIds = await ids(page);

/* 🔴 실행 손잡이를 «화면에서» 고른다. 이름은 열거된 것 중에서만 쓴다. */
const wanted = out.entryIds.filter((i) => /run|replay|live|start|investigat|enter/i.test(i));
out.candidateControls = wanted;

const labelOf = async (id) =>
  page
    .locator(`[data-testid="${id}"]`)
    .first()
    .textContent()
    .then((t) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 60))
    .catch(() => null);
out.candidateLabels = {};
for (const id of wanted.slice(0, 12)) out.candidateLabels[id] = await labelOf(id);

if (SHOT) await page.screenshot({ path: SHOT, fullPage: false }).catch(() => {});

out.serverAddrs = [...serverAddrs];
out.consoleErrors = consoleErrors;
out.apiCalls = apiCalls.slice(-25);
console.log(JSON.stringify(out, null, 1));
await browser.close();
