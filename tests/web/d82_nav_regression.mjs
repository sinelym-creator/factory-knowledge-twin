/**
 * D-82 회귀 감시 — 처방(`<Link prefetch={false}>`)이 **D-79 가 세운 것을 깨지 않았는가**(cap 0 · 1회).
 *
 * 🔴 처방은 `shell-nav.tsx` 한 파일이고 레일·드로어가 **같은 벌**을 쓴다 — 그러니 회귀 축도
 *    두 자리를 함께 물어야 한다. 6칸 = ⓐ 390 앱바 구성 ⓑ 390 상태행 새 줄 ⓒ 드로어 열림 형상
 *    ⓓ 닫힘 3갈래 ⓔ 768/1280 레일·토글 ⓕ 가로 넘침.
 * 🔴 레일과 드로어는 **같은 `data-testid`** 를 쓴다 — `data-nav-variant` 로 좁혀 센다.
 * 🔴 스크림은 뷰포트 전체라 «중앙» 클릭이 드로어 패널에 막힌다 — 패널 밖 좌표로 누른다.
 *
 * usage: node d82_nav_regression.mjs --base http://127.0.0.1:8367 --out o.json
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base");
const OUT = arg("out");
/* 🔴 무대마다 시계가 다르다 — 공개면은 `/enter` 왕복이 1.4~3.8s 라 로컬용 1500ms 로는
   세션이 서기 «전»을 찍는다(리셋 버튼이 없는 것처럼 보인다). 창은 «값»으로 선언한다. */
const SETTLE = Number(arg("settle", "1500"));
if (!BASE || !OUT) { console.error("--base 와 --out 은 필수다"); process.exit(9); }
const NAVV = (v) => `[data-nav-variant="${v}"]`;

const dismiss = async (p) => {
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(300); }
  }
};
const rect = async (p, sel) => {
  const l = p.locator(sel);
  if (!(await l.count())) return null;
  return l.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), w: +r.width.toFixed(1) }; });
};

const out = { base: BASE, settleMs: SETTLE, wall: new Date().toISOString(), cols: {} };
const errs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const widthCol = async (w) => {
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errs.push({ w, excluded: /ws|websocket|wss:/i.test(m.text()), text: m.text().slice(0, 140) }); });
  await p.setViewportSize({ width: w, height: 900 });
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(SETTLE);
  await dismiss(p);
  const col = { w };
  col.brandText = (await p.locator('[data-testid="app-brand"]').first().innerText()).replace(/\s+/g, " ").trim();
  col.brand = await rect(p, '[data-testid="app-brand"]');
  col.statusRow = await rect(p, '[data-testid="app-status-row"]');
  col.statusRowNewLine = col.statusRow && col.brand ? col.statusRow.top >= col.brand.bottom : null;
  col.buttons = { tour: await p.locator('[data-testid="intro-reopen"]').count(), reset: await p.locator('[data-testid="reset-button"]').count() };
  col.toggleVisible = (await p.locator('[data-testid="nav-menu-toggle"]').count())
    ? await p.locator('[data-testid="nav-menu-toggle"]').first().isVisible() : false;
  col.railLinksVisible = await p.locator(`${NAVV("rail")}:visible`).count();
  col.overflowPx = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { p, col };
};

const c390 = await widthCol(390);
const c768 = await widthCol(768);
const c1280 = await widthCol(1280);
out.cols = { w390: c390.col, w768: c768.col, w1280: c1280.col };

// ⓒⓓ 드로어 — 390 에서만.
const p3 = c390.p;
const open = async () => {
  await p3.locator('[data-testid="nav-menu-toggle"]').first().click();
  await p3.waitForTimeout(450);
  const d = p3.locator('[data-testid="nav-drawer"]');
  const cnt = await d.count();
  return {
    count: cnt,
    role: cnt ? await d.first().getAttribute("role") : null,
    ariaModal: cnt ? await d.first().getAttribute("aria-modal") : null,
    links: await p3.locator(NAVV("drawer")).count(),
  };
};
const closed = async () => { await p3.waitForTimeout(450); return p3.locator('[data-testid="nav-drawer"]').count(); };
out.drawer = { openings: [], closes: {} };
out.drawer.openings.push(await open());
await p3.keyboard.press("Escape");
out.drawer.closes.esc = await closed();
out.drawer.openings.push(await open());
const panel = await rect(p3, '[data-testid="nav-drawer"]');
const clickX = Math.min(370, (panel?.left ?? 0) + (panel?.w ?? 0) + 40);
out.drawer.scrimClickAt = { x: clickX, panelRight: (panel?.left ?? 0) + (panel?.w ?? 0) };
await p3.locator('[data-testid="nav-drawer-scrim"]').first().click({ position: { x: clickX, y: 450 } });
out.drawer.closes.scrim = await closed();
out.drawer.openings.push(await open());
await p3.locator(`${NAVV("drawer")}[data-testid="nav-incidents"]`).first().click();
await p3.waitForLoadState("domcontentloaded");
await p3.waitForTimeout(3500); // 🔴 클릭 직후 읽기는 이르다.
out.drawer.closes.link = await p3.locator('[data-testid="nav-drawer"]').count();
out.drawer.urlAfterLink = new URL(p3.url()).pathname;

await browser.close();

const C = out.cols, D = out.drawer;
const v = {
  a_bar390: C.w390.toggleVisible === true && C.w390.buttons.tour === 1 && C.w390.buttons.reset === 1 && /^Factory Twin$/.test(C.w390.brandText),
  b_statusRow: C.w390.statusRowNewLine === true && C.w1280.statusRowNewLine === false && C.w768.statusRowNewLine === false,
  c_drawerShape: D.openings.every((o) => o.count === 1 && o.role === "dialog" && o.ariaModal === "true" && o.links === 3),
  d_closes3: D.closes.esc === 0 && D.closes.scrim === 0 && D.closes.link === 0,
  e_rail: C.w768.railLinksVisible === 3 && C.w768.toggleVisible === false && C.w1280.railLinksVisible === 3 && C.w1280.toggleVisible === false,
  f_noOverflow: [C.w390, C.w768, C.w1280].every((c) => c.overflowPx <= 0),
};
v.drawerNavUrl = D.urlAfterLink;
v.consoleReal = errs.filter((e) => !e.excluded).length;
v.consoleWs = errs.filter((e) => e.excluded).length;
v.allPass = Object.entries(v).filter(([k]) => /^[a-f]_/.test(k)).every(([, val]) => val === true);
v.fails = Object.entries(v).filter(([k, val]) => /^[a-f]_/.test(k) && val !== true).map(([k]) => k);
out.verdict = v;
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`6칸: a=${v.a_bar390} b=${v.b_statusRow} c=${v.c_drawerShape} d=${v.d_closes3} e=${v.e_rail} f=${v.f_noOverflow} | drawerNav=${v.drawerNavUrl} errs=${v.consoleReal}(ws ${v.consoleWs}) => ${v.allPass ? "PASS" : "FAIL: " + v.fails.join(",")}`);
process.exit(v.allPass ? 0 : 1);
