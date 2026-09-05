/**
 * D-81 검증 — 드로어 초점 가둠.
 *
 * 🔴 **회귀 판정은 «수»로** — D-79 실측 이탈 4건(tab#3 body · #4 scrim · #8 body · #9 scrim)이
 *    기준선이다. 「이탈이 있었다」와 「몇 건이었다」는 다른 사실이다.
 * 🔴 **前 열을 같은 실행에서** 돌려 그 4건이 재현되는지 본다 — 재현 안 되면 내 자극이 안 닿은 것이다.
 * 🔴 **막는 쪽만 보지 않는다** — `tabIndex=-1` 이 스크림 «클릭»을 죽였을 수 있으므로 닫힘·재개방까지.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("out");
const SCRIM = { x: Number(arg("scrim-x", "325")), y: Number(arg("scrim-y", "400")) };
const TOGGLE = '[data-testid="nav-menu-toggle"]';
const DRAWER = '[data-testid="nav-drawer"]';
const DLINK = '[data-nav-variant="drawer"]';
if (!OUT) { console.error("--out 필수"); process.exit(9); }

const openPage = async (b, base) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1600);
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(250); }
  }
  return { ctx, p };
};
const focusInfo = (p) =>
  p.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    const o = a.closest("[data-testid]");
    return {
      tag: a.tagName.toLowerCase(),
      testid: o ? o.getAttribute("data-testid") : null,
      insideDrawer: Boolean(a.closest('[data-testid="nav-drawer"]')),
      isDrawerItself: a.matches('[data-testid="nav-drawer"]'),
    };
  });
const ownerAt = (p, x, y) =>
  p.evaluate(([px, py]) => {
    const e = document.elementFromPoint(px, py);
    if (!e) return null;
    const o = e.closest("[data-testid],[data-nav-variant]");
    return { tag: e.tagName.toLowerCase(), owner: o ? o.getAttribute("data-testid") || o.getAttribute("data-nav-variant") : null };
  }, [x, y]);
const drawerVisible = async (p) => {
  const d = p.locator(DRAWER);
  return (await d.count()) ? await d.first().isVisible() : false;
};
const openDrawer = async (p) => {
  const t = p.locator(TOGGLE).first();
  const box = await t.boundingBox();
  await p.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
  await p.waitForTimeout(500);
};

const column = async (b, base, name) => {
  const col = { name, base };
  // ── 축 ① Tab 12회 ─────────────────────────────────────────────────────────
  {
    const { ctx, p } = await openPage(b, base);
    await openDrawer(p);
    col.openedVisible = await drawerVisible(p);
    col.focusOnOpen = await focusInfo(p);
    const tabs = [];
    for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); tabs.push(await focusInfo(p)); }
    col.tab = tabs;
    col.tabEscapes = tabs.map((s, i) => ({ n: i + 1, ...s })).filter((s) => s && !s.insideDrawer);
    col.tabEscapeCount = col.tabEscapes.length;
    await ctx.close();
  }
  // ── 축 ② Shift+Tab 6회 ────────────────────────────────────────────────────
  {
    const { ctx, p } = await openPage(b, base);
    await openDrawer(p);
    const back = [];
    for (let i = 0; i < 6; i++) { await p.keyboard.press("Shift+Tab"); back.push(await focusInfo(p)); }
    col.shiftTab = back;
    col.shiftEscapes = back.map((s, i) => ({ n: i + 1, ...s })).filter((s) => s && !s.insideDrawer);
    col.shiftEscapeCount = col.shiftEscapes.length;
    await ctx.close();
  }
  // ── 축 ③ 패널 자신에 초점을 두고 진입 방향 ─────────────────────────────────
  {
    const { ctx, p } = await openPage(b, base);
    await openDrawer(p);
    const focused = await p.evaluate(() => {
      const d = document.querySelector('[data-testid="nav-drawer"]');
      if (!d) return false;
      d.focus();
      return document.activeElement === d;
    });
    col.panelFocusable = focused;
    col.panelFocusState = await focusInfo(p);
    await p.keyboard.press("Tab");
    col.afterTabFromPanel = await focusInfo(p);
    await ctx.close();
  }
  {
    const { ctx, p } = await openPage(b, base);
    await openDrawer(p);
    await p.evaluate(() => { const d = document.querySelector('[data-testid="nav-drawer"]'); if (d) d.focus(); });
    await p.keyboard.press("Shift+Tab");
    col.afterShiftTabFromPanel = await focusInfo(p);
    await ctx.close();
  }
  // ── 축 ④⑤ 닫힘 3갈래 × (닫힘·복귀·재개방) ─────────────────────────────────
  col.close = {};
  for (const branch of ["link", "esc", "scrim"]) {
    const { ctx, p } = await openPage(b, base);
    await openDrawer(p);
    const rec = { opened: await drawerVisible(p) };
    if (branch === "link") {
      const l = p.locator(DLINK).first();
      const bx = await l.boundingBox();
      if (bx) await p.mouse.click(Math.round(bx.x + bx.width / 2), Math.round(bx.y + bx.height / 2));
    } else if (branch === "esc") {
      await p.keyboard.press("Escape");
    } else {
      rec.scrimOwner = await ownerAt(p, SCRIM.x, SCRIM.y); // 🔴 전언 좌표 검증
      await p.mouse.click(SCRIM.x, SCRIM.y);
    }
    await p.waitForTimeout(700);
    rec.closed = !(await drawerVisible(p));
    rec.focusAfterClose = await focusInfo(p);
    await openDrawer(p);
    rec.reopened = await drawerVisible(p);
    col.close[branch] = rec;
    await ctx.close();
  }
  return col;
};

const b = await chromium.launch();
const out = { wall: new Date().toISOString(), baseline_d79_escapes: 4 };
out.after = await column(b, arg("after"), "after(trap landed)");
out.before = await column(b, arg("before"), "before(no trap)");
await b.close();

const A = out.after, B = out.before;
out.verdict = {
  after_tabEscapes: A.tabEscapeCount,
  before_tabEscapes: B.tabEscapeCount,
  before_reproducesBaseline: B.tabEscapeCount === out.baseline_d79_escapes,
  after_shiftEscapes: A.shiftEscapeCount,
  before_shiftEscapes: B.shiftEscapeCount,
  after_panelFocusable: A.panelFocusable,
  after_tabFromPanel: A.afterTabFromPanel,
  after_shiftTabFromPanel: A.afterShiftTabFromPanel,
  after_close: Object.fromEntries(Object.entries(A.close).map(([k, v]) => [k, { closed: v.closed, reopened: v.reopened, focus: v.focusAfterClose && v.focusAfterClose.testid }])),
  scrimOwner: A.close.scrim.scrimOwner,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.verdict, null, 1));
