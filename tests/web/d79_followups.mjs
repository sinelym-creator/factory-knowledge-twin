/**
 * D-79 추가 — 1회차에서 잘못 잰 칸과 안 잰 축을 닫는다.
 *
 * 🔴 자수 2를 고친다:
 *   ⓐ 햄버거 히트를 **드로어가 열린 상태**에서 쟀다 → 그 점의 주인이 `nav-drawer` 로 나왔다.
 *      히트는 **닫힌 상태**에서 물어야 한다(그게 사용자가 누르는 순간이다).
 *   ⓑ 반경을 AA 24 / AAA 44 의 **절반**(6 / 11)으로 잡았다 → 실제는 **12 / 22** 다.
 *      절반으로 물으면 24 만 되는 표적도 44 를 통과한 것처럼 보인다.
 *
 * 축 ④ = `app-status-row` DOM 단일 + `rect.top` 767/768 두 칸 + 앱바 버튼 수.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT = arg("out");
const TOGGLE = '[data-testid="nav-menu-toggle"]';
const DLINK = '[data-nav-variant="drawer"]';
if (!OUT) { console.error("--out 필수"); process.exit(9); }

const open = async (b, base, w) => {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1600);
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(250); }
  }
  return { ctx, p };
};
const ownerAt = (p, x, y) =>
  p.evaluate(([px, py]) => {
    const e = document.elementFromPoint(px, py);
    if (!e) return null;
    const o = e.closest("[data-testid],[data-nav-variant]");
    return { tag: e.tagName.toLowerCase(), owner: o ? o.getAttribute("data-testid") || o.getAttribute("data-nav-variant") : null };
  }, [x, y]);

/** 반경 r 사방의 주인이 모두 want 면 지름 2r 의 표적이 실제로 그 요소에 걸린다. */
const ring = async (p, cx, cy, r) => ({
  r,
  up: await ownerAt(p, cx, cy - r),
  down: await ownerAt(p, cx, cy + r),
  left: await ownerAt(p, cx - r, cy),
  right: await ownerAt(p, cx + r, cy),
});
const ringOk = (ring, want) =>
  ["up", "down", "left", "right"].every((k) => ring[k] && ring[k].owner === want);

const b = await chromium.launch();
const out = { wall: new Date().toISOString(), target: arg("target"), control: arg("control"), fixed: {}, axis4: {} };

// ── 자수 ⓐⓑ 고쳐서 히트 재측 ────────────────────────────────────────────────
{
  const { ctx, p } = await open(b, out.target, 390);
  // 🔴 «닫힌» 상태의 햄버거
  const tog = p.locator(TOGGLE).first();
  const tb = await tog.boundingBox();
  const tx = Math.round(tb.x + tb.width / 2), ty = Math.round(tb.y + tb.height / 2);
  out.fixed.toggleClosed = {
    box: { w: +tb.width.toFixed(1), h: +tb.height.toFixed(1) },
    centre: await ownerAt(p, tx, ty),
    aa24_r12: await ring(p, tx, ty, 12),
    aaa44_r22: await ring(p, tx, ty, 22),
  };
  out.fixed.toggleClosed.aa24_pass = ringOk(out.fixed.toggleClosed.aa24_r12, "nav-menu-toggle");
  out.fixed.toggleClosed.aaa44_pass = ringOk(out.fixed.toggleClosed.aaa44_r22, "nav-menu-toggle");

  // 드로어 링크는 열어야 존재한다 — 열고 재되, 반경은 12 / 22
  await p.mouse.click(tx, ty);
  await p.waitForTimeout(500);
  const lk = p.locator(DLINK).first();
  const lb = await lk.boundingBox();
  const lx = Math.round(lb.x + lb.width / 2), ly = Math.round(lb.y + lb.height / 2);
  out.fixed.drawerLink = {
    box: { w: +lb.width.toFixed(1), h: +lb.height.toFixed(1) },
    centre: await ownerAt(p, lx, ly),
    aa24_r12: await ring(p, lx, ly, 12),
    aaa44_r22: await ring(p, lx, ly, 22),
  };
  const want = out.fixed.drawerLink.centre ? out.fixed.drawerLink.centre.owner : null;
  out.fixed.drawerLink.want = want;
  out.fixed.drawerLink.aa24_pass = ringOk(out.fixed.drawerLink.aa24_r12, want);
  out.fixed.drawerLink.aaa44_pass = ringOk(out.fixed.drawerLink.aaa44_r22, want);
  await ctx.close();
}

// ── 축 ④ app-status-row : DOM 단일 · rect.top · 앱바 버튼 ───────────────────
for (const w of [390, 767, 768, 1280]) {
  const { ctx, p } = await open(b, out.target, w);
  out.axis4[w] = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="app-status-row"]')];
    const bar = document.querySelector('[data-testid="app-bar"]') || document.querySelector("header");
    const rowRect = rows[0] ? rows[0].getBoundingClientRect() : null;
    const barRect = bar ? bar.getBoundingClientRect() : null;
    // 앱바 «직속» 버튼만 센다(드로어 안 버튼을 끌어오지 않게)
    const barButtons = bar
      ? [...bar.querySelectorAll("button")].filter((x) => !x.closest('[data-testid="nav-drawer"]')).length
      : null;
    return {
      statusRowCount: rows.length,
      rowTop: rowRect ? +rowRect.top.toFixed(1) : null,
      rowHeight: rowRect ? +rowRect.height.toFixed(1) : null,
      barTop: barRect ? +barRect.top.toFixed(1) : null,
      barHeight: barRect ? +barRect.height.toFixed(1) : null,
      // 🔴 «새 줄인가» = 상태행 top 이 앱바 첫 줄보다 아래인가 (클래스가 아니라 좌표로)
      topDelta: rowRect && barRect ? +(rowRect.top - barRect.top).toFixed(1) : null,
      barButtons,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  await ctx.close();
}

// 대조군에도 같은 칸을 찍는다 — 「원래 그랬는가」를 가른다
{
  const { ctx, p } = await open(b, out.control, 390);
  out.axis4.control390 = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="app-status-row"]')];
    const bar = document.querySelector('[data-testid="app-bar"]') || document.querySelector("header");
    return {
      statusRowCount: rows.length,
      barButtons: bar ? [...bar.querySelectorAll("button")].length : null,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  await ctx.close();
}

writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
