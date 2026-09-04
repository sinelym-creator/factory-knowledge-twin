/**
 * X-22 회귀 축 — 「수리가 **끝난 뒤에도** 클릭을 막고 있지는 않은가」. 리바이2 42대.
 *
 * 🔴 **그물을 고치면 검출력이 팔린다 — 처방도 같다.** #590 은 문서 전역에 «캡처 단계»
 *    `pointerdown`·`click` 가드를 단다. 그 가드가 정리(cleanup)에서 안 떨어지면 투어가 끝난
 *    화면에서 **모든 클릭이 죽는다** — 원래 결함보다 큰 회귀다(규격 ⑤ 「투어 OFF 화면 변화 0」).
 *    수리가 초록인 것만 보고 이 축을 안 보면, 나는 「막는 쪽」만 시험하고 「푸는 쪽」을 안 본 것이다.
 *
 * 🔴 **강제 열에서 봐야 한다.** 지원 엔진에서는 `inert` 가 먼저 막아 이 가드가 아예 안 돈다 —
 *    안 도는 코드의 정리를 검사하면 어떤 빌드든 초록이다(안 닿는 회귀 그물).
 *
 * 🔴 판정선은 **주소가 바뀌는가**다. 「가드가 없다」가 아니라 「클릭이 실제로 통한다」를 잰다.
 *
 *   node t724x_inert_guard_teardown.mjs --shell=http://127.0.0.1:8106
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8106");
const BG = arg("bg", "nav-compare");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KILL_INERT = () => {
  try {
    delete HTMLElement.prototype.inert;
  } catch {}
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(KILL_INERT); // 🔴 강제 열 — 폴백 갈래가 실제로 도는 자리
const page = await ctx.newPage();
await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
const eb = page.locator('[data-testid="enter-button"]');
if (await eb.count().then((n) => n > 0).catch(() => false)) {
  await eb.first().click().catch(() => {});
  await sleep(1800);
}
for (const sel of ['[data-testid="tour-start"]', '[data-testid="intro-reopen"]']) {
  const l = page.locator(sel);
  if (await l.count().then((n) => n > 0).catch(() => false)) {
    await l.first().click().catch(() => {});
    await sleep(2200);
    if (await page.locator('[data-testid="tour-callout"]').count().then((n) => n > 0)) break;
  }
}
await sleep(1000);

const supports = await page.evaluate(() => "inert" in HTMLElement.prototype);
const tourOn = await page.locator('[data-testid="tour-callout"]').count().then((n) => n > 0);
const inertCount = await page.evaluate(() => Array.from(document.querySelectorAll("*")).filter((e) => e.inert === true).length);

/* ① 투어 «켜진» 동안 — 여기서는 막혀야 한다(수리의 본래 목적). */
const urlDuring0 = page.url();
const box0 = await page.evaluate((bg) => {
  const el = document.querySelector(`[data-testid="${bg}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}, BG);
if (box0) await page.mouse.click(box0.x, box0.y);
await sleep(1500);
const urlDuring1 = page.url();

/* ② 투어를 «끝낸다» — 건너뛰기. 그 다음 같은 클릭이 통해야 한다. */
const skip = page.locator('[data-testid="tour-skip"]');
const skipFound = await skip.count().then((n) => n > 0).catch(() => false);
if (skipFound) await skip.first().click().catch(() => {});
await sleep(1800);
const tourOff = !(await page.locator('[data-testid="tour-callout"]').count().then((n) => n > 0));

const urlAfter0 = page.url();
const box1 = await page.evaluate((bg) => {
  const el = document.querySelector(`[data-testid="${bg}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}, BG);
if (box1) await page.mouse.click(box1.x, box1.y);
await sleep(2000);
const urlAfter1 = page.url();
await browser.close();

const p = (u) => new URL(u).pathname;
console.log(`\n====== X-22 회귀 · 투어가 끝난 뒤 클릭이 살아나는가 · shell=${SHELL} ======\n`);
console.log(`강제 열 성립: "inert" in prototype = ${supports}(false 여야 함) · 투어 켜짐 = ${tourOn} · inert 걸린 요소 = ${inertCount}(0 이어야 함)`);
console.log(`투어 «중»  클릭: ${p(urlDuring0)} → ${p(urlDuring1)} ⇒ ${p(urlDuring0) === p(urlDuring1) ? "막힘(수리 목적)" : "🔴 통과"}`);
console.log(`건너뛰기 눌림 = ${skipFound} · 투어 꺼짐 = ${tourOff}`);
console.log(`투어 «후»  클릭: ${p(urlAfter0)} → ${p(urlAfter1)} ⇒ ${p(urlAfter0) !== p(urlAfter1) ? "통과(정상)" : "🔴 여전히 막힘"}`);

/* 🔴 무대가 안 섰으면 색을 내지 않는다 — 강제 열이 성립하지 않았거나 투어가 안 켜졌으면
   「막혔다」도 「통했다」도 대상의 답이 아니다. */
if (supports || !tourOn || inertCount !== 0 || !skipFound || !tourOff) {
  console.log("\n🔴 무대 미성립 — 강제 열·투어 켜짐·건너뛰기 중 하나가 안 섰다(exit 2).");
  process.exit(2);
}
const blockedDuring = p(urlDuring0) === p(urlDuring1);
const freedAfter = p(urlAfter0) !== p(urlAfter1);
console.log(
  blockedDuring && freedAfter
    ? "\n[X-22 회귀] PASS — 투어 중에는 막고, 끝나면 푼다(규격 ⑤ 위반 없음)."
    : `\n[X-22 회귀] 🔴 **FAIL** — ${!blockedDuring ? "투어 중 안 막힘" : "투어가 끝났는데도 클릭이 막힌다(가드가 안 떨어졌다)"}`,
);
console.log("\n🔴 안 잼: 실제 구형 엔진 · 터치 축 · 투어 «완주»(마지막 단계까지) 로 끝낸 경우.");
process.exit(blockedDuring && freedAfter ? 0 : 1);
