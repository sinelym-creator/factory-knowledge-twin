/**
 * T7-B 보조 — step1 「처방이 «비켰다면» 무엇을 벌었는가」.
 *
 * 배경(본 그물 실측): step1 은 처방이 `anchor` 에 남았는데(`data-tour-covered=16097`),
 * **정착 뒤** 같은 산식을 다시 돌리면 `a=18575 · b=14414` 로 `b < a*0.8` 이 성립한다 —
 * 즉 처방 자신의 규칙이 정착 시점에는 「비켜라」로 뒤집힌다. 처방은 «렌더 직전 1회»만 재고
 * 주변 내용이 늦게 도착하면 다시 재지 않기 때문이다(설계상 결정성을 위한 선택).
 *
 * 🔴 이 파일이 세우는 것 = 그 뒤집힘이 «글자 수»로 얼마인가. 규칙이 뒤집힌다는 사실만으로는
 *    사람이 읽는 글자가 몇 자 덜 가려지는지 알 수 없다(면적 계수 ≠ 글자 계수).
 *    말풍선의 `--tour-left` 만 beside 값으로 덮어쓰고 같은 스캐너로 다시 센다 — 손잡이는 하나다.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3111");
const BESIDE = Number(arg("beside", "1064"));

const COUNT = () => {
  const callout = document.querySelector('[data-testid="tour-callout"]');
  const cb = callout.getBoundingClientRect();
  const box = { left: cb.left, top: cb.top, right: cb.right, bottom: cb.bottom };
  const inter = (r) =>
    Math.max(0, Math.min(box.right, r.right) - Math.max(box.left, r.left)) *
    Math.max(0, Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top));
  let covered = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent ?? "";
    if (!t.trim()) continue;
    const p = n.parentElement;
    if (!p || p.closest('[data-testid="tour-callout"]') || p.closest('[data-testid="tour-spotlight"]')) continue;
    const cs = getComputedStyle(p);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (cs.clip && cs.clip !== "auto") continue;
    if (cs.clipPath && cs.clipPath !== "none") continue;
    const pr = p.getBoundingClientRect();
    if (pr.width <= 1 || pr.height <= 1) continue;
    for (let i = 0; i < t.length; i++) {
      if (!t[i].trim()) continue;
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
      if (inter(r) > 0) covered++;
    }
  }
  return { covered, left: Math.round(cb.x), placement: callout.getAttribute("data-tour-placement") };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route("**/api/live/status", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }),
);
await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
await page.click('[data-testid="tour-start"]');
await page.waitForSelector('[data-testid="tour-callout"]', { timeout: 20000 });
await page.waitForTimeout(700);

const asIs = await page.evaluate(COUNT);
await page.evaluate((x) => {
  const el = document.querySelector('[data-testid="tour-callout"]');
  el.style.setProperty("--tour-left", `${x}px`);
}, BESIDE);
await page.waitForTimeout(250);
const moved = await page.evaluate(COUNT);
console.log(JSON.stringify({ base: BASE, asIs, forcedBeside: moved, deltaChars: asIs.covered - moved.covered }, null, 2));
await browser.close();
