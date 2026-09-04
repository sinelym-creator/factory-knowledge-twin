/**
 * T7-17 — `t3-2:484`(D-1) 빨강의 주어. 🔴 **막히는 것은 «두 번째» 닫기**다(재열람 뒤).
 * 스펙과 같은 순서를 밟고, 그 자리에서 「누가 클릭을 먹는가」를 상자로 찍는다.
 * 부정 판정은 «해 보고» 낸다 — 실제로 눌러 보고, 눌린 뒤 상태까지 읽는다.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:8799");

const DESCRIBE = () => {
  const card = document.querySelector('[data-testid="intro-card"]');
  if (!card) return { error: "intro-card 없음", url: location.href };
  const btn = Array.from(card.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "안내 닫기");
  if (!btn) return { error: "닫기 버튼 없음" };
  const d = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
      cls: (el.className ?? "").toString().slice(0, 90),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      z: cs.zIndex,
      pos: cs.position,
      pe: cs.pointerEvents,
    };
  };
  const r = btn.getBoundingClientRect();
  const grid = [];
  for (let iy = 0; iy < 5; iy++)
    for (let ix = 0; ix < 5; ix++) {
      const x = r.left + (r.width * (ix + 0.5)) / 5;
      const y = r.top + (r.height * (iy + 0.5)) / 5;
      const hit = document.elementFromPoint(x, y);
      grid.push({ mine: !!(hit && (hit === btn || btn.contains(hit))), hit: d(hit) });
    }
  const others = {};
  for (const g of grid) if (!g.mine) {
    const k = `${g.hit?.tag}|${g.hit?.testid ?? "-"}|${g.hit?.cls}|z=${g.hit?.z}|pos=${g.hit?.pos}`;
    others[k] = (others[k] ?? 0) + 1;
  }
  return {
    url: location.href,
    button: d(btn),
    card: d(card),
    mineOf25: grid.filter((g) => g.mine).length,
    coveredBy: others,
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    scrollY: Math.round(window.scrollY),
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="intro-card"]', { timeout: 15000 });
console.log("A) 첫 진입 —", JSON.stringify(await page.evaluate(DESCRIBE), null, 1));

const c1 = await page
  .locator('[data-testid="intro-card"] button[aria-label="안내 닫기"]')
  .click({ timeout: 8000 })
  .then(() => "성공")
  .catch((e) => "실패: " + String(e.message).split("\n")[0]);
console.log("A) 첫 닫기 —", c1);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
console.log("B) 새로고침 뒤 intro-card 수 —", await page.getByTestId("intro-card").count());

await page.getByTestId("intro-reopen").click({ timeout: 8000 });
await page.waitForSelector('[data-testid="intro-card"]', { timeout: 10000 });
await page.waitForTimeout(700);
console.log("C) 재열람 뒤 —", JSON.stringify(await page.evaluate(DESCRIBE), null, 1));

const c2 = await page
  .locator('[data-testid="intro-card"] button[aria-label="안내 닫기"]')
  .click({ timeout: 8000 })
  .then(() => "성공")
  .catch((e) => "실패: " + String(e.message).split("\n")[0]);
console.log("C) 두 번째 닫기 —", c2);
await page.waitForTimeout(1000);
console.log("C) 그 뒤 url —", page.url(), "· intro-card 수 —", await page.getByTestId("intro-card").count());

await browser.close();
