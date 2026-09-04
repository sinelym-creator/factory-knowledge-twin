/**
 * T7-24 2차 · **X-08**(320 / 2560 가로 넘침 0) · **X-09**(브라우저 글꼴 24px). 리바이2 41대.
 *
 * 🔴 **X-09 는 자극 증인이 먼저다.** CDP `Page.setFontSizes` 는 «기본 글꼴 크기»를 바꾼다 —
 *    화면이 px 로 크기를 못 박아 두면 그 자극은 **한 요소에도 안 닿는다**. 그때 나오는 「넘침 0」은
 *    초록이 아니라 **미검증**이다. 그래서 「computed font-size 가 실제로 바뀐 요소 수」를 먼저 센다.
 *
 * 🔴 **X-08 은 대조군이 먼저다.** 뷰포트보다 넓은 것을 «심어» 검사가 실제로 빨강을 내는지 본 뒤,
 *    걷어내고 진짜를 잰다. 안 그러면 「넘침 0」이 「검사가 아무것도 안 본다」와 구별되지 않는다.
 *
 *   node t724x_zoom_font.mjs --shell=http://127.0.0.1:8104
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8104");
const ROUTES = (arg("routes", "/overview,/incidents,/compare") ?? "").split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERFLOW = () => {
  const de = document.documentElement;
  const cw = de.clientWidth;
  const offenders = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > cw + 0.5 || r.left < -0.5) {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      offenders.push({
        id: el.getAttribute("data-testid") ?? el.tagName.toLowerCase() + "." + String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join("."),
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
      });
      if (offenders.length >= 6) break;
    }
  }
  return { scrollWidth: de.scrollWidth, clientWidth: cw, over: de.scrollWidth - cw, offenders };
};

/* 🔴 «변한 요소 수»만으로는 내 색인이 어긋난 것과 구별이 안 된다(재로드로 DOM 이 갈리면
   같은 자리끼리 비교하는 게 아니다). 그래서 **크기 분포**도 함께 낸다 — 16 → 24 처럼
   «값이 어떻게 움직였는지»가 보이면 그 델타는 내 색인 사고가 아니다. */
const FONTS = () => {
  const sizes = Array.from(document.body.querySelectorAll("*"))
    .slice(0, 600)
    .map((el) => getComputedStyle(el).fontSize);
  const dist = {};
  for (const s of sizes) dist[s] = (dist[s] ?? 0) + 1;
  return { sizes, dist, rootSize: getComputedStyle(document.documentElement).fontSize };
};

const PLANT = () => {
  const d = document.createElement("div");
  d.id = "__ctl_wide__";
  d.style.cssText = "position:relative;height:8px;width:" + (document.documentElement.clientWidth + 200) + "px;background:red";
  document.body.appendChild(d);
};
const UNPLANT = () => document.getElementById("__ctl_wide__")?.remove();

const enter = async (page) => {
  const b = page.locator('[data-testid="enter-button"]');
  if (await b.count().then((n) => n > 0).catch(() => false)) {
    await b.first().click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(1800);
  }
};

const browser = await chromium.launch();

/* ══ X-08 ══════════════════════════════════════════════════════════════════ */
const x08 = [];
for (const v of [{ w: 320, h: 568 }, { w: 2560, h: 1440 }]) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
  const page = await ctx.newPage();
  await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
  await enter(page);
  for (const route of ROUTES) {
    await page.goto(SHELL + route, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2200);
    /* 🔴 대조군 먼저 — 심어서 빨강이 나오는지. */
    await page.evaluate(PLANT);
    const ctl = await page.evaluate(OVERFLOW);
    await page.evaluate(UNPLANT);
    await sleep(200);
    const real = await page.evaluate(OVERFLOW);
    x08.push({ w: v.w, route, ctlOver: ctl.over, real });
  }
  await ctx.close();
}

/* ══ X-09 ══════════════════════════════════════════════════════════════════ */
const x09 = [];
for (const v of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
  await enter(page);
  await page.goto(SHELL + "/overview", { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(2200);
  const beforeF = await page.evaluate(FONTS);
  const before = beforeF.sizes;
  const beforeOver = await page.evaluate(OVERFLOW);

  /* 자극 = 브라우저 기본 글꼴을 24px 로. */
  let cdpOk = true;
  try {
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24, fixed: 24 } });
  } catch (e) {
    cdpOk = false;
    x09.push({ w: v.w, cdpError: String(e.message).slice(0, 80) });
  }
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(2500);
  const afterF = await page.evaluate(FONTS);
  const after = afterF.sizes;
  const afterOver = await page.evaluate(OVERFLOW);
  const n = Math.min(before.length, after.length);
  let changed = 0;
  for (let i = 0; i < n; i++) if (before[i] !== after[i]) changed += 1;
  x09.push({ w: v.w, cdpOk, sampled: n, changed, beforeOver, afterOver, beforeDist: beforeF.dist, afterDist: afterF.dist, rootBefore: beforeF.rootSize, rootAfter: afterF.rootSize });
  await ctx.close();
}
await browser.close();

/* ══ 보고 ══════════════════════════════════════════════════════════════════ */
const j = JSON.stringify;
console.log("\n=============== X-08 · 320 / 2560 가로 넘침 ===============");
console.log("| 무대 | 자극 | 대체 동작 | 남은 흔적 | 시점 |");
console.log("|---|---|---|---|---|");
for (const r of x08)
  console.log(
    `| 셸 ${r.w}px ${r.route} | 뷰포트보다 넓은 대조군 심기 → 걷기 | 대조군 상태 넘침 **${r.ctlOver}px** | 실제 넘침 **${r.real.over}px**(scrollWidth ${r.real.scrollWidth} / clientWidth ${r.real.clientWidth}) · 넘친 요소 ${r.real.offenders.length}건${r.real.offenders.length ? " " + j(r.real.offenders) : ""} | — |`,
  );
const ctlWorks = x08.length > 0 && x08.every((r) => r.ctlOver > 0);
const clean = x08.length > 0 && x08.every((r) => r.real.over <= 0 && r.real.offenders.length === 0);
console.log(`\n대조군이 빨강을 내는가(심으면 넘침 > 0) = ${ctlWorks ? "✓ 전 칸" : "✗ — 검사가 넘침을 못 본다"}`);
console.log(`[X-08] ${!ctlWorks ? "미검증(검사가 못 본다)" : clean ? "PASS(두 폭 · 라우트 전부 넘침 0)" : "FAIL"}`);

console.log("\n=============== X-09 · 브라우저 기본 글꼴 24px ===============");
for (const r of x09) {
  if (r.cdpError) {
    console.log(`  ${r.w}px · 🔴 CDP 실패: ${r.cdpError}`);
    continue;
  }
  console.log(
    `  ${r.w}px · 표본 ${r.sampled} 요소 · **변한 요소 = ${r.changed}** · root font-size ${r.rootBefore} → **${r.rootAfter}** · 넘침 ${r.beforeOver.over} → ${r.afterOver.over}
     크기 분포 전: ${j(r.beforeDist)}
     크기 분포 후: ${j(r.afterDist)}`,
  );
}
const stim = x09.filter((r) => typeof r.changed === "number");
const reached = stim.length > 0 && stim.some((r) => r.changed > 0);
const noOverflow = stim.length > 0 && stim.every((r) => r.afterOver.over <= 0);
console.log(`\n자극이 축에 «닿았는가»(변한 요소 > 0) = ${reached ? "✓" : "✗"}`);
console.log(
  `[X-09] ${!reached ? "**미검증** — 자극이 한 요소에도 안 닿았다(화면이 글꼴 크기를 px 로 못 박아 브라우저 기본값을 안 쓴다). 「넘침 0」은 초록이 아니다." : noOverflow ? "PASS(글꼴 24px 에서 넘침 0)" : "FAIL"}`,
);
console.log("\n🔴 안 잼: 브라우저 «확대»(zoom) 축 · 사용자 스타일시트 · 다른 엔진 · 라우트 3개 밖의 화면.");
