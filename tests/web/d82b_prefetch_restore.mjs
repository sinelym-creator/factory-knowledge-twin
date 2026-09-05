/**
 * D-82b 검증 — 「세션이 선 «뒤»에는 프리페치를 돌려준다」(cap 0 · live run 0).
 *
 * D-82 는 프리페치를 «껐다». D-82b 는 `prefetch={hasSession ? undefined : false}` 로
 * **입장 전에만** 끄고 **입장 후에는 되돌린다**. 그러니 이 검증의 축은 «있다/없다»가 아니라
 * **«언제»** 다.
 *
 * 🔴 **경계는 시간 창이 아니라 «URL 전이»다**(발주 명시). `waitForURL('**\/overview')` 가 풀린
 *    순간을 기준으로 요청을 before/after 로 가른다 — 「3초 안에 온 것」으로 가르면 무대가 빠르거나
 *    느릴 때 같은 사실이 다른 색을 낸다.
 * 🔴 요청이 «실제로 들고 간» 쿠키를 본다(`request.allHeaders()`) — 컨텍스트에 쿠키가 있다는 사실과
 *    그 요청이 그것을 보냈다는 사실은 다르다.
 * 🔴 회차마다 **새 컨텍스트**(새 세션). 자극 열(後 무대)을 먼저 돌린다.
 *
 * usage: node d82b_prefetch_restore.mjs --out o.json --after http://127.0.0.1:8367 --before http://127.0.0.1:8369 [--reps 3] [--settle 3500]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("out");
const REPS = Number(arg("reps", "3"));
const SETTLE = Number(arg("settle", "3500"));
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }
const INC = "/incidents/INC-2025-019";
const NAVV = (v) => `[data-nav-variant="${v}"]`;

const rep = async (browser, base, w) => {
  const ORIGIN = new URL(base).origin;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const net = [];
  let entered = false; // 🔴 URL 전이가 이 값을 뒤집는다 — 시계가 아니다.
  const keep = (u) => { try { const x = new URL(u); return x.origin === ORIGIN ? x.pathname : null; } catch { return null; } };
  page.on("request", (r) => {
    const p = keep(r.url());
    if (p !== INC) return;
    const phase = entered ? "after" : "before"; // 이벤트 시점의 상태를 «그때» 박는다
    r.allHeaders()
      .then((h) => net.push({ kind: "req", phase, hasCookie: Boolean(h["cookie"]) }))
      .catch(() => net.push({ kind: "req", phase, hasCookie: null }));
  });
  page.on("response", (r) => {
    const p = keep(r.url());
    if (p !== INC) return;
    net.push({ kind: "res", phase: entered ? "after" : "before", status: r.status() });
  });

  const urlReached = page.waitForURL("**/overview", { timeout: 30000 }).then(() => true).catch(() => false);
  await page.goto(base + "/", { waitUntil: "commit", timeout: 60000 });
  const reached = await urlReached;
  entered = true; // 🔴 여기가 경계다
  await page.waitForTimeout(SETTLE);
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = page.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await page.waitForTimeout(300); }
  }
  await page.waitForTimeout(800);

  const before = net.filter((e) => e.kind === "req" && e.phase === "before");
  const after = net.filter((e) => e.kind === "req" && e.phase === "after");
  const res = net.filter((e) => e.kind === "res");

  // 착지 — 폭에 따라 레일/드로어
  let drawer = null;
  if (w === 390) {
    await page.locator('[data-testid="nav-menu-toggle"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    const d = page.locator('[data-testid="nav-drawer"]');
    drawer = {
      openCount: await d.count(),
      role: (await d.count()) ? await d.first().getAttribute("role") : null,
      ariaModal: (await d.count()) ? await d.first().getAttribute("aria-modal") : null,
      links: await page.locator(NAVV("drawer")).count(),
    };
    await page.locator(`${NAVV("drawer")}[data-testid="nav-incidents"]`).first().click().catch(() => {});
  } else {
    await page.locator(`${NAVV("rail")}[data-testid="nav-incidents"]`).first().click().catch(() => {});
  }
  await page.waitForTimeout(3500);
  const landed = new URL(page.url()).pathname;
  await ctx.close();

  return {
    w, reachedOverview: reached, landed, drawer,
    beforeEntry: { count: before.length, withCookie: before.filter((e) => e.hasCookie).length },
    afterEntry: { count: after.length, withCookie: after.filter((e) => e.hasCookie).length },
    statuses: res.map((e) => `${e.phase}:${e.status}`),
    status307: res.filter((e) => e.status === 307).length,
    status200: res.filter((e) => e.status === 200).length,
  };
};

const column = async (browser, base, name) => {
  const rows = { name, base, w1280: [], w390: [] };
  for (let i = 0; i < REPS; i++) rows.w1280.push(await rep(browser, base, 1280));
  for (let i = 0; i < REPS; i++) rows.w390.push(await rep(browser, base, 390));
  return rows;
};

const browser = await chromium.launch();
const out = { wall: new Date().toISOString(), settleMs: SETTLE, reps: REPS, cols: {} };
// 🔴 자극 열 먼저.
out.cols.after = await column(browser, arg("after"), "after(D-82b landed)");
out.cols.before = await column(browser, arg("before"), "before(D-82 only)");
await browser.close();

const sum = (rows) => ({
  landed: rows.map((r) => r.landed),
  beforeEntryPrefetch: rows.map((r) => r.beforeEntry.count),
  afterEntryPrefetch: rows.map((r) => r.afterEntry.count),
  afterEntryWithCookie: rows.map((r) => r.afterEntry.withCookie),
  status307: rows.map((r) => r.status307),
  status200: rows.map((r) => r.status200),
  reachedOverview: rows.map((r) => r.reachedOverview),
});
out.summary = {
  after1280: sum(out.cols.after.w1280), after390: sum(out.cols.after.w390),
  before1280: sum(out.cols.before.w1280), before390: sum(out.cols.before.w390),
};
const A = out.summary.after1280, A3 = out.summary.after390;
out.verdict = {
  a_beforeEntryZero: A.beforeEntryPrefetch.every((n) => n === 0) && A3.beforeEntryPrefetch.every((n) => n === 0),
  b_afterEntryRestored: A.afterEntryPrefetch.every((n) => n >= 1),
  c_afterEntryCookied: A.afterEntryWithCookie.every((n) => n >= 1),
  d_no307: A.status307.every((n) => n === 0) && A3.status307.every((n) => n === 0),
  e_landed: A.landed.every((p) => p === INC) && A3.landed.every((p) => p === INC),
  f_drawerShape: out.cols.after.w390.every((r) => r.drawer && r.drawer.openCount === 1 && r.drawer.role === "dialog" && r.drawer.ariaModal === "true" && r.drawer.links === 3),
};
out.verdict.allPass = Object.entries(out.verdict).filter(([k]) => /^[a-f]_/.test(k)).every(([, v]) => v === true);
out.verdict.fails = Object.entries(out.verdict).filter(([k, v]) => /^[a-f]_/.test(k) && v !== true).map(([k]) => k);
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ after: out.summary.after1280, after390: out.summary.after390, before: out.summary.before1280, before390: out.summary.before390, verdict: out.verdict }, null, 1));
process.exit(out.verdict.allPass ? 0 : 1);
