/**
 * T7-2b 브라우저 호환 재측 — **09-03(T7-2) 이후 바뀐 것**만 3엔진으로 다시 묻는다(cap 0 · live run 0).
 *
 * 🔴 **chromium 을 같은 실행의 세 번째 열로 넣는다.** 판정선이 「chromium 과 «다른» 칸」인데
 *    chromium 값을 다른 창(승격 17 재검)에서 가져오면 무대·시각이 달라 비교가 오염된다.
 *    같은 배포본·같은 시각에 나란히 찍어야 «엔진 델타»다.
 * 🔴 **live cap 0 이라 «LIVE» 배지 자체는 못 잰다** — 정적 재생본의 `run-mode-badge`(replay)
 *    렌더와 상태 줄로 대체하고, 못 잰 축은 결과에 «이름»으로 남긴다(`liveBadge: "못 잼(cap 0)"`).
 * 🔴 **엔진 기동 실패는 빨강이 아니라 계측 실패**다 — 그 엔진 열을 `launchError` 로 적고 색을 내지 않는다.
 * 🔴 창은 무대의 시계로 — 공개면 `/enter` 왕복이 1.4~3.8s 라 `--settle` 기본을 3500 으로 둔다.
 *
 * usage: node t72b_engine_recheck.mjs --out o.json [--base https://...] [--settle 3500] [--shots DIR]
 */
import { chromium, webkit, firefox } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
const SHOTS = arg("shots", null);
const SETTLE = Number(arg("settle", "3500"));
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }
const ORIGIN = new URL(BASE).origin;
const INC = "/incidents/INC-2025-019";
const NAVV = (v) => `[data-nav-variant="${v}"]`;
const ENGINES = [["chromium", chromium], ["webkit", webkit], ["firefox", firefox]];
const WIDTHS = [390, 768, 1280];

const cellsOf = async (page, w, net, clickMsRef, tag) => {
  const cell = {};
  // ── 축 ④(대체) 상태 줄 렌더 ────────────────────────────────────────────
  const sr = page.locator('[data-testid="app-status-row"]');
  cell.statusRow = (await sr.count())
    ? await sr.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { present: true, w: +r.width.toFixed(1), h: +r.height.toFixed(1), children: el.children.length };
      })
    : { present: false };
  cell.brandText = (await page.locator('[data-testid="app-brand"]').count())
    ? (await page.locator('[data-testid="app-brand"]').first().innerText()).replace(/\s+/g, " ").trim() : null;
  cell.buttons = {
    tour: await page.locator('[data-testid="intro-reopen"]').count(),
    reset: await page.locator('[data-testid="reset-button"]').count(),
  };

  // ── 축 ③ 투어 걸음 0~2 ─────────────────────────────────────────────────
  /* 🔴 실측한 순서(1차 실행 자수): 첫 방문 화면에 이미 `tour-invite`·`tour-start` 가 서 있고,
     「튜토리얼」(`intro-reopen`)을 누르면 URL 이 `?intro=1&tour=1` 이 되며 **말풍선이 바로 뜬다**
     — `tour-start` 를 기다리면 «없는 문» 앞에서 0칸을 훑는다(빈 결과끼리의 일치는 일치가 아니다). */
  const tour = { reopenClicked: false, steps: [] };
  tour.inviteBefore = await page.locator('[data-testid="tour-invite"]').count();
  tour.startBefore = await page.locator('[data-testid="tour-start"]').count();
  if (cell.buttons.tour) {
    await page.locator('[data-testid="intro-reopen"]').first().click().catch(() => {});
    await page.waitForTimeout(1800);
    tour.reopenClicked = true;
    tour.urlAfter = new URL(page.url()).search;
    tour.introCard = await page.locator('[data-testid="intro-card"]').count();
    for (let s = 0; s < 3; s++) {
      const cal = page.locator('[data-testid="tour-callout"]');
      const cnt = await cal.count();
      tour.steps.push({
        step: s,
        callout: cnt,
        calloutVisible: cnt ? await cal.first().isVisible() : false,
        calloutBox: cnt ? await cal.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(0), h: +r.height.toFixed(0), top: +r.top.toFixed(0) }; }) : null,
        progressDots: await page.locator('[data-testid="tour-progress"] > *').count(),
        spotlight: await page.locator('[data-testid="tour-spotlight"]').count(),
        targetMissing: await page.locator('[data-testid="tour-target-missing"]').count(),
        awaitClick: await page.locator('[data-testid="tour-await-click"]').count(),
      });
      const nxt = page.locator('[data-testid="tour-next"]');
      if (!(await nxt.count())) break;
      await nxt.first().click().catch(() => {});
      await page.waitForTimeout(900);
    }
    for (const sel of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
      const l = page.locator(sel);
      if (await l.count()) { await l.first().click().catch(() => {}); await page.waitForTimeout(400); }
    }
  }
  cell.tour = tour;

  // ── 축 ① 드로어(390) / 레일(≥768) ─────────────────────────────────────
  if (w === 390) {
    const d = { };
    await page.locator('[data-testid="nav-menu-toggle"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    const drawer = page.locator('[data-testid="nav-drawer"]');
    d.openCount = await drawer.count();
    d.role = d.openCount ? await drawer.first().getAttribute("role") : null;
    d.ariaModal = d.openCount ? await drawer.first().getAttribute("aria-modal") : null;
    d.links = await page.locator(NAVV("drawer")).count();
    // Tab 순환 — 이탈 = 초점이 드로어 «밖»에 선 횟수.
    const trail = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(90);
      trail.push(await page.evaluate(() => {
        const a = document.activeElement;
        const panel = document.querySelector('[data-testid="nav-drawer"]');
        return {
          testid: a?.getAttribute?.("data-testid") ?? a?.tagName?.toLowerCase() ?? null,
          inside: Boolean(panel && a && panel.contains(a)),
        };
      }));
    }
    d.tabTrail = trail;
    d.tabEscapes = trail.filter((t) => !t.inside).length;
    if (SHOTS && d.openCount) await page.screenshot({ path: `${SHOTS}/t72b-${tag}-390-open.png` }).catch(() => {});
    // 닫힘 3갈래
    await page.keyboard.press("Escape");
    await page.waitForTimeout(450);
    d.closeEsc = await drawer.count();
    await page.locator('[data-testid="nav-menu-toggle"]').first().click().catch(() => {});
    await page.waitForTimeout(450);
    const panel = await drawer.count()
      ? await drawer.first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.left + r.width; }) : 260;
    await page.locator('[data-testid="nav-drawer-scrim"]').first()
      .click({ position: { x: Math.min(370, panel + 40), y: 450 } }).catch(() => {});
    await page.waitForTimeout(450);
    d.closeScrim = await drawer.count();
    await page.locator('[data-testid="nav-menu-toggle"]').first().click().catch(() => {});
    await page.waitForTimeout(450);
    d.reopen = await drawer.count();
    // 축 ② 착지 — 드로어 링크
    clickMsRef.value = Date.now();
    await page.locator(`${NAVV("drawer")}[data-testid="nav-incidents"]`).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    d.closeLink = await drawer.count();
    cell.drawer = d;
  } else {
    cell.railLinksVisible = await page.locator(`${NAVV("rail")}:visible`).count();
    cell.toggleVisible = (await page.locator('[data-testid="nav-menu-toggle"]').count())
      ? await page.locator('[data-testid="nav-menu-toggle"]').first().isVisible() : false;
    clickMsRef.value = Date.now();
    await page.locator(`${NAVV("rail")}[data-testid="nav-incidents"]`).first().click().catch(() => {});
    await page.waitForTimeout(3500);
  }
  cell.landedPath = new URL(page.url()).pathname;
  cell.overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  cell.prefetchBeforeClick = net.filter((e) => e.kind === "req" && e.path === INC && e.wall < clickMsRef.value).length;
  cell.inc307 = net.filter((e) => e.kind === "res" && e.path === INC && e.status === 307).length;
  return cell;
};

const engineColumn = async ([tag, engine]) => {
  const col = { engine: tag, widths: {}, static: null, launchError: null };
  let browser;
  try { browser = await engine.launch(); }
  catch (e) { col.launchError = String(e).slice(0, 220); return col; } // 🔴 계측 실패 — 색을 내지 않는다
  col.version = browser.version();
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    const net = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push({ excluded: /ws|websocket|wss:/i.test(m.text()), text: m.text().slice(0, 140) }); });
    page.on("pageerror", (e) => errs.push({ excluded: false, text: "pageerror: " + String(e).slice(0, 140) }));
    const keep = (u) => { try { const x = new URL(u); return x.origin === ORIGIN ? x.pathname : null; } catch { return null; } };
    page.on("request", (r) => { const p = keep(r.url()); if (p) net.push({ kind: "req", path: p, wall: Date.now() }); });
    page.on("response", (r) => { const p = keep(r.url()); if (p) net.push({ kind: "res", path: p, status: r.status(), wall: Date.now() }); });
    const clickMsRef = { value: Number.MAX_SAFE_INTEGER };
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(SETTLE);
      const cell = await cellsOf(page, w, net, clickMsRef, tag);
      cell.consoleReal = errs.filter((e) => !e.excluded).length;
      cell.consoleWs = errs.filter((e) => e.excluded).length;
      cell.consoleSample = errs.filter((e) => !e.excluded).slice(0, 3).map((e) => e.text);
      col.widths[w] = cell;
    } catch (e) {
      col.widths[w] = { cellError: String(e).slice(0, 200) };
    }
    await ctx.close();
  }
  // 정적 재생본 — 배지·재생 라벨(축 ④ 대체 · 축 ③ 「처음부터 재생」)
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/incidents/INC-2026-014?run=STATIC-GS-01", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(SETTLE);
    const badge = p.locator('[data-testid="run-mode-badge"]');
    const play = p.locator('[data-testid="replay-play"]');
    col.static = {
      badgeCount: await badge.count(),
      badgeMode: (await badge.count()) ? await badge.first().getAttribute("data-mode") : null,
      playCount: await play.count(),
      playLabel: (await play.count()) ? (await play.first().innerText()).replace(/\s+/g, " ").trim() : null,
      playAtEnd: (await play.count()) ? await play.first().getAttribute("data-at-end") : null,
      cursor: (await p.locator('[data-testid="replay-cursor"]').count())
        ? await p.locator('[data-testid="replay-cursor"]').first().getAttribute("data-total") : null,
      liveBadge: "못 잼(cap 0 · 라이브 run 을 태우지 않았다)",
    };
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/t72b-${tag}-static-1280.png` }).catch(() => {});
    await ctx.close();
  } catch (e) { col.static = { error: String(e).slice(0, 200) }; }
  await browser.close();
  return col;
};

const out = { base: BASE, settleMs: SETTLE, wall: new Date().toISOString(), engines: {} };
for (const e of ENGINES) out.engines[e[0]] = await engineColumn(e);

// ── 델타 = chromium 과 «다른» 칸만 ─────────────────────────────────────────
const base = out.engines.chromium;
const deltas = [];
for (const tag of ["webkit", "firefox"]) {
  const col = out.engines[tag];
  if (col.launchError) { deltas.push({ engine: tag, axis: "launch", note: "계측 실패 — 색 없음", detail: col.launchError }); continue; }
  for (const w of WIDTHS) {
    const a = base.widths[w] ?? {}, b = col.widths[w] ?? {};
    const cmp = (name, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) deltas.push({ engine: tag, w, axis: name, chromium: x, other: y }); };
    cmp("landedPath", a.landedPath, b.landedPath);
    cmp("overflowPx>0", (a.overflowPx ?? 0) > 0, (b.overflowPx ?? 0) > 0);
    cmp("prefetchBeforeClick", a.prefetchBeforeClick, b.prefetchBeforeClick);
    cmp("inc307", a.inc307, b.inc307);
    cmp("statusRowPresent", a.statusRow?.present, b.statusRow?.present);
    cmp("buttons", a.buttons, b.buttons);
    cmp("tourSteps", (a.tour?.steps ?? []).map((s) => [s.callout, s.calloutVisible, s.progressDots, s.targetMissing]),
                     (b.tour?.steps ?? []).map((s) => [s.callout, s.calloutVisible, s.progressDots, s.targetMissing]));
    cmp("tourStepCount", (a.tour?.steps ?? []).length, (b.tour?.steps ?? []).length);
    cmp("consoleReal", a.consoleReal, b.consoleReal);
    if (w === 390) {
      cmp("drawerOpen", [a.drawer?.openCount, a.drawer?.role, a.drawer?.ariaModal, a.drawer?.links],
                        [b.drawer?.openCount, b.drawer?.role, b.drawer?.ariaModal, b.drawer?.links]);
      cmp("tabEscapes", a.drawer?.tabEscapes, b.drawer?.tabEscapes);
      cmp("closes3", [a.drawer?.closeEsc, a.drawer?.closeScrim, a.drawer?.closeLink, a.drawer?.reopen],
                     [b.drawer?.closeEsc, b.drawer?.closeScrim, b.drawer?.closeLink, b.drawer?.reopen]);
    } else {
      cmp("rail", [a.railLinksVisible, a.toggleVisible], [b.railLinksVisible, b.toggleVisible]);
    }
  }
  cmp2: {
    const a = base.static ?? {}, b = col.static ?? {};
    for (const k of ["badgeCount", "badgeMode", "playCount", "playLabel", "cursor"]) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) deltas.push({ engine: tag, w: "static", axis: k, chromium: a[k], other: b[k] });
    }
  }
}
out.deltas = deltas;
out.summary = {
  engines: Object.fromEntries(Object.entries(out.engines).map(([k, v]) => [k, v.launchError ? "LAUNCH FAIL" : v.version])),
  deltaCount: deltas.length,
  deltaAxes: [...new Set(deltas.map((d) => `${d.engine}/${d.w ?? "-"}/${d.axis}`))],
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary, null, 1));
process.exit(0);
