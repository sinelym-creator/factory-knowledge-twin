/**
 * D-79 검증 — 좁은 폭 내비를 드로어로.
 *
 * 🔴 **닫힘 3갈래는 갈래마다 «새 컨텍스트»에서** 돈다 — 한 흐름에 이어 붙이면 앞 갈래의 잔여
 *    상태가 뒤 갈래를 오염시킨다. 각 갈래는 「닫힘」과 «다시 열림» 두 칸을 함께 묻는다
 *    (여는 쪽만 시험한 문은 정리 축이 통째로 빈다).
 * 🔴 **히트는 `boundingBox` 로 재지 않는다** — 좌표로 실제 눌러 보고 `elementFromPoint` 로
 *    덮개까지 본다. 「닿는다」와 「눌린다」는 다른 사실이다.
 * 🔴 **스크림 좌표는 전언이므로** 누르기 «전»에 그 점이 정말 스크림인지 확인해 값으로 남긴다.
 * 🔴 **`count()` 는 숨은 요소도 센다** — 「DOM 에 있다」와 「보인다」를 따로 적는다.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT = arg("out");
const SHOTS = arg("shots");
const SCRIM = { x: Number(arg("scrim-x", "325")), y: Number(arg("scrim-y", "400")) };
if (!OUT) {
  console.error("--out 필수");
  process.exit(9);
}

const TOGGLE = '[data-testid="nav-menu-toggle"]';
const DRAWER = '[data-testid="nav-drawer"]';
const DLINK = '[data-nav-variant="drawer"]';

const open = async (b, base, w = 390) => {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1600);
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) {
      await l.first().click().catch(() => {});
      await p.waitForTimeout(250);
    }
  }
  return { ctx, p };
};

const ownerAt = (p, x, y) =>
  p.evaluate(([px, py]) => {
    const e = document.elementFromPoint(px, py);
    if (!e) return null;
    const o = e.closest("[data-testid],[data-nav-variant]");
    return {
      tag: e.tagName.toLowerCase(),
      owner: o ? o.getAttribute("data-testid") || o.getAttribute("data-nav-variant") : null,
      insideDrawer: Boolean(e.closest('[data-testid="nav-drawer"]')),
    };
  }, [x, y]);

const clickAtCentre = async (p, sel) => {
  const el = p.locator(sel).first();
  if (!(await el.count())) return { clicked: false, why: "absent" };
  const box = await el.boundingBox();
  if (!box) return { clicked: false, why: "no box (hidden?)" };
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const at = await ownerAt(p, x, y); // 🔴 누르기 «전»에 그 점의 주인부터
  await p.mouse.click(x, y);
  return { clicked: true, x, y, elementAtPoint: at, box: { w: +box.width.toFixed(1), h: +box.height.toFixed(1) } };
};

const drawerState = async (p) => {
  const d = p.locator(DRAWER);
  const n = await d.count();
  return {
    count: n,
    visible: n ? await d.first().isVisible() : false,
    role: n ? await d.first().getAttribute("role") : null,
    ariaModal: n ? await d.first().getAttribute("aria-modal") : null,
    links: await p.locator(DLINK).count(),
  };
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
    };
  });

const inertInfo = (p) =>
  p.evaluate(() => {
    const d = document.querySelector('[data-testid="nav-drawer"]');
    const marked = [...document.querySelectorAll("[inert]")].map((e) => {
      const o = e.closest("[data-testid]");
      return o ? o.getAttribute("data-testid") : e.tagName.toLowerCase();
    });
    return { inertCount: marked.length, inertOwners: marked.slice(0, 6), drawerInert: d ? d.hasAttribute("inert") : null };
  });

const b = await chromium.launch();
const out = { wall: new Date().toISOString(), target: arg("target"), control: arg("control"), axes: {} };

// ── 축 ① 열림 + 닫힘 3갈래 × (닫힘 / 재개방) ───────────────────────────────
const branches = ["link", "esc", "scrim"];
out.axes.close = {};
for (const branch of branches) {
  const { ctx, p } = await open(b, out.target);
  const rec = { branch };
  rec.beforeOpen = await drawerState(p);
  rec.toggleClick = await clickAtCentre(p, TOGGLE);
  await p.waitForTimeout(500);
  rec.opened = await drawerState(p);
  rec.focusOnOpen = await focusInfo(p);
  rec.inertOnOpen = await inertInfo(p);
  if (SHOTS && branch === "link") await p.screenshot({ path: `${SHOTS}/d79-drawer-390.png` }).catch(() => {});

  if (branch === "link") {
    rec.closeAction = await clickAtCentre(p, DLINK);
  } else if (branch === "esc") {
    await p.keyboard.press("Escape");
    rec.closeAction = { via: "Escape" };
  } else {
    rec.scrimPointOwner = await ownerAt(p, SCRIM.x, SCRIM.y); // 🔴 전언 좌표 검증
    await p.mouse.click(SCRIM.x, SCRIM.y);
    rec.closeAction = { via: "scrim-coord", ...SCRIM };
  }
  await p.waitForTimeout(700);
  rec.closed = await drawerState(p);
  rec.focusAfterClose = await focusInfo(p);
  rec.inertAfterClose = await inertInfo(p);
  // 🔴 재개방 — 「닫혔다」만으로는 문이 다시 열리는지 모른다
  rec.reopenClick = await clickAtCentre(p, TOGGLE);
  await p.waitForTimeout(500);
  rec.reopened = await drawerState(p);
  out.axes.close[branch] = rec;
  await ctx.close();
}

// ── 축 ② ⓓ Tab 순환(측정만) + 축 ③ 히트 ────────────────────────────────────
{
  const { ctx, p } = await open(b, out.target);
  await clickAtCentre(p, TOGGLE);
  await p.waitForTimeout(500);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press("Tab");
    seen.push(await focusInfo(p));
  }
  out.axes.tabCycle = { states: seen, escapedDrawer: seen.some((s) => s && !s.insideDrawer) };

  out.axes.hit = [];
  for (const t of [
    { name: "nav-menu-toggle", sel: TOGGLE },
    { name: "drawer-link", sel: DLINK },
  ]) {
    const el = p.locator(t.sel).first();
    if (!(await el.count())) {
      out.axes.hit.push({ ...t, present: false });
      continue;
    }
    const box = await el.boundingBox();
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);
    // 🔴 상자 크기로 판정하지 않는다 — 반경 지점의 «주인»을 물어 실제로 그 요소가 받는지 본다
    const ring = async (r) => ({
      up: await ownerAt(p, cx, cy - r),
      down: await ownerAt(p, cx, cy + r),
      left: await ownerAt(p, cx - r, cy),
      right: await ownerAt(p, cx + r, cy),
    });
    out.axes.hit.push({
      ...t,
      present: true,
      box: { w: +box.width.toFixed(1), h: +box.height.toFixed(1) },
      centre: { x: cx, y: cy, owner: await ownerAt(p, cx, cy) },
      aa24_ring6: await ring(6), // AA 24 → 중심에서 6px
      aaa44_ring11: await ring(11), // AAA 44 → 중심에서 11px
    });
  }
  await ctx.close();
}

// ── 축 ⑤ 768 / 1280 · 「DOM 에 있다」 vs 「보인다」 ──────────────────────────
out.axes.wide = {};
for (const w of [768, 1280]) {
  const { ctx, p } = await open(b, out.target, w);
  const tog = p.locator(TOGGLE);
  out.axes.wide[w] = {
    toggleInDom: await tog.count(),
    toggleVisible: (await tog.count()) ? await tog.first().isVisible() : false,
    rail: await p.locator('[data-nav-variant="rail"]').count(),
    bar: await p.locator('[data-nav-variant="bar"]').count(),
    drawerLinks: await p.locator(DLINK).count(),
    statusRow: await p.locator('[data-testid="app-status-row"]').count(),
    hScroll: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  };
  await ctx.close();
}

// ── 대조군: 같은 자극에 토글이 없는가 ───────────────────────────────────────
{
  const { ctx, p } = await open(b, out.control);
  const tog = p.locator(TOGGLE);
  out.axes.control = {
    toggleInDom: await tog.count(),
    toggleVisible: (await tog.count()) ? await tog.first().isVisible() : false,
    drawer: await p.locator(DRAWER).count(),
    bar: await p.locator('[data-nav-variant="bar"]').count(),
    rail: await p.locator('[data-nav-variant="rail"]').count(),
    statusRow: await p.locator('[data-testid="app-status-row"]').count(),
  };
  await ctx.close();
}

// ── 390 가로 넘침 ───────────────────────────────────────────────────────────
{
  const { ctx, p } = await open(b, out.target);
  out.axes.overflow390 = await p.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  await ctx.close();
}

writeFileSync(OUT, JSON.stringify(out, null, 1));
const c = out.axes.close;
console.log(
  JSON.stringify(
    {
      openedVisible: Object.fromEntries(branches.map((k) => [k, c[k].opened.visible])),
      role: c.link.opened.role,
      ariaModal: c.link.opened.ariaModal,
      drawerLinks: c.link.opened.links,
      closedVisible: Object.fromEntries(branches.map((k) => [k, c[k].closed.visible])),
      reopenedVisible: Object.fromEntries(branches.map((k) => [k, c[k].reopened.visible])),
      focusOnOpen: c.link.focusOnOpen,
      focusAfterClose: c.link.focusAfterClose,
      inertOnOpen: c.link.inertOnOpen,
      scrimOwner: c.scrim.scrimPointOwner,
      tabEscaped: out.axes.tabCycle.escapedDrawer,
      wide: out.axes.wide,
      control: out.axes.control,
      overflow390: out.axes.overflow390,
    },
    null,
    1,
  ),
);
await b.close();
