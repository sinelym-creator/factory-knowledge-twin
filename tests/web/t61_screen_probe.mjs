/**
 * t61_screen_probe — T6-1 축 ⑤ «화면» — 구현 좌석이 안 잰 축 (검증 좌석 · 27대).
 *
 * 🔴 이벤트에 `synthesis`·`rationale` 이 «있다»와 화면이 그것을 «그린다»는 다른 사실이다.
 *    앞의 것은 API 축(축 ①②)이 이미 쟀다. 여기서는 브라우저가 실제로 무엇을 띄우는지만 본다.
 *
 * 🔴 **두 열을 나란히 잰다.** 채택(live)에서 rationale 이 뜨는 것만 보면 「늘 뜬다」와 구별이
 *    안 된다. 거부(live-rejected)에서 **문장이 없고 사유가 뜨는지**까지 봐야 배지가 축을 말한
 *    것이 된다. 열 전환은 스텁 모드로 한다(대상 코드 무접촉).
 *
 *      FKT_WEB_BASE   셸 (기본 http://127.0.0.1:3012)
 *      FKT_EXPECT     live | live-rejected  — 이 열에서 기대하는 축
 *
 * exit: 0 = 기대대로 · 1 = 어긋남 · 2 = 측정 불가(무대 없음)
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3012";
const EXPECT = process.env.FKT_EXPECT ?? "live";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/overview$/, { timeout: 60_000 });
await page.locator("[data-testid=start-from-alarm]").first().waitFor({ state: "visible", timeout: 60_000 });
await page.locator("[data-testid=start-from-alarm]").first().click();
await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 60_000 });

// 🔴 완주까지 기다린다 — 합성은 마지막 단계라, 중간에 재면 «아직 안 그린 것»을 «없다»로 읽는다.
const console_ = page.locator("[data-testid=run-console]");
let settled = false;
for (let i = 0; i < 120; i += 1) {
  if ((await console_.getAttribute("data-status")) === "completed") { settled = true; break; }
  await page.waitForTimeout(1_000);
}

const badge = page.locator("[data-testid=synthesis-badge]");
const badgeCount = await badge.count();
const axis = badgeCount ? await badge.getAttribute("data-axis") : null;
const badgeText = badgeCount ? (await badge.innerText()).replace(/\s+/g, " ").trim() : null;
const rationale = page.locator("[data-testid=candidate-rationale]");
const rationaleCount = await rationale.count();
const candidates = await page.locator("[data-testid=candidate]").count();
const firstRationale = rationaleCount ? (await rationale.first().innerText()).replace(/\s+/g, " ").trim() : null;
const rejectNote = await page.locator("[data-testid=run-console] :text('거부')").count();

await ctx.close();
await browser.close();

console.log(`화면 축 · 기대 ${EXPECT}`);
console.log(`  완주        : ${settled ? "○" : "🔴"}`);
console.log(`  합성 배지    : ${badgeCount}개 · data-axis=${axis} · "${badgeText}"`);
console.log(`  후보/rationale: ${candidates} / ${rationaleCount}`);
console.log(`  첫 rationale : ${firstRationale ? firstRationale.slice(0, 160) : "(없음)"}`);

const fail = [];
if (!settled) {
  console.log("◌ 못 잼: 화면이 완주에 닿지 않았다");
  process.exit(2);
}
if (!candidates) {
  console.log("◌ 못 잼: 후보가 0개 — 그릴 것이 없다");
  process.exit(2);
}
if (badgeCount !== 1) fail.push(`합성 배지가 ${badgeCount}개다 — 화면이 축을 말하지 않는다`);
if (axis !== EXPECT) fail.push(`배지 축이 ${axis} 다 (기대 ${EXPECT})`);
if (EXPECT === "live") {
  if (rationaleCount !== candidates) fail.push(`채택인데 rationale 이 ${rationaleCount}/${candidates} 만 그려진다`);
  if (firstRationale && firstRationale.length < 10) fail.push("rationale 자리가 비었다");
} else {
  if (rationaleCount !== 0) fail.push(`거부인데 rationale 이 ${rationaleCount}건 그려진다 — 부분 채택이 화면에 샜다`);
  if (!rejectNote) fail.push("거부인데 화면이 사유를 말하지 않는다");
}

for (const f of fail) console.log(`   🔴 ${f}`);
if (!fail.length) console.log("   ○ 기대대로");
process.exit(fail.length ? 1 : 0);
