/**
 * O-26 가르는 시험 — 「레일 링크는 `/overview` 로 되돌아오고 드로어 링크는 안 그런다」의 기전(cap 0 · live 0).
 *
 * 가설(오케 발주) : 레일은 **마운트 즉시** `/incidents/INC-2025-019` 를 프리페치한다. 그 요청이
 *   세션 발급(`POST /enter`)보다 **앞서면** 쿠키 없이 나가 **307** 을 받고, 그 응답이 라우터 캐시에
 *   앉아 나중의 클릭이 «되돌림»으로 끝난다. 드로어는 열기 «전»엔 DOM 에 없으므로 프리페치도 늦다.
 *
 * 🔴 그러니 이 시험의 값은 «코드»가 아니라 **순서**다 — 요청·응답 «양쪽»의 시각을 **같은 t0**
 *    (컨텍스트 시작)로 찍는다. 손 라벨이나 벽시계로 적으면 순서가 뒤집힌다.
 * 🔴 `Cookie` 동반 여부는 `request.allHeaders()` 로 «그 요청이 실제로 들고 간 것»을 본다 —
 *    컨텍스트에 쿠키가 있다는 사실과 그 요청이 그것을 보냈다는 사실은 다르다.
 * 🔴 열마다 **새 컨텍스트**(새 세션)이고, 자극은 **레일 열을 먼저** 돌린다.
 * 🔴 `prefetch={false}` 열은 이번 범위 밖(빌드가 필요하다 = 처방 단계).
 *
 * usage: node o26_rail_prefetch_probe.mjs --out o.json [--base https://...] [--reps 3]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
const REPS = Number(arg("reps", "3"));
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }
const ORIGIN = new URL(BASE).origin;
const INC = "/incidents/INC-2025-019";

const dismiss = async (p) => {
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(300); }
  }
};

/** 한 회차 = 새 컨텍스트(새 세션). 관심 경로만 시각순으로 적는다. */
const rep = async (browser, mode, w) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const net = [];
  const keep = (u) => {
    try {
      const url = new URL(u);
      if (url.origin !== ORIGIN) return null;
      if (!/^\/(enter|incidents|overview)|^\/$/.test(url.pathname)) return null;
      return { path: url.pathname, rsc: url.searchParams.has("_rsc") };
    } catch { return null; }
  };
  page.on("request", (r) => {
    const k = keep(r.url());
    if (!k) return;
    const ms = Date.now() - t0; // 🔴 헤더를 기다리기 «전»에 시각을 박는다(await 가 순서를 흔든다).
    r.allHeaders()
      .then((h) => net.push({ kind: "req", ms, method: r.method(), ...k, hasCookie: Boolean(h["cookie"]), cookieLen: (h["cookie"] ?? "").length }))
      .catch(() => net.push({ kind: "req", ms, method: r.method(), ...k, hasCookie: null, cookieLen: null }));
  });
  page.on("response", (r) => {
    const k = keep(r.url());
    if (!k) return;
    net.push({ kind: "res", ms: Date.now() - t0, ...k, status: r.status(), location: r.headers()["location"] ?? null });
  });

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000); // 프리페치가 나갈 시간을 준다(마운트 직후에 나간다).
  await dismiss(page);
  await page.waitForTimeout(800);

  const clickMs = Date.now() - t0;
  let clicked = false;
  if (mode === "rail") {
    const l = page.locator('[data-nav-variant="rail"][data-testid="nav-incidents"]');
    if (await l.count()) { await l.first().click(); clicked = true; }
  } else {
    await page.locator('[data-testid="nav-menu-toggle"]').first().click();
    await page.waitForTimeout(500);
    const l = page.locator('[data-nav-variant="drawer"][data-testid="nav-incidents"]');
    if (await l.count()) { await l.first().click(); clicked = true; }
  }
  await page.waitForTimeout(3500); // 🔴 클릭 직후 읽기는 이르다.
  const urlAfter = page.url();
  await ctx.close();

  net.sort((a, b) => a.ms - b.ms);
  // ── 이 회차가 말하는 것 ─────────────────────────────────────────────────
  const enterRes = net.find((e) => e.kind === "res" && e.path === "/enter");
  const enterReq = net.find((e) => e.kind === "req" && e.path === "/enter");
  const incReqs = net.filter((e) => e.kind === "req" && e.path === INC);
  const incRes = net.filter((e) => e.kind === "res" && e.path === INC);
  const preClickInc = incReqs.filter((e) => e.ms < clickMs);   // 클릭 «전» = 프리페치
  const postClickInc = incReqs.filter((e) => e.ms >= clickMs); // 클릭 «후» = 이동
  return {
    mode, w, clickMs, clicked, urlAfter, urlPath: new URL(urlAfter).pathname,
    enter: { reqMs: enterReq?.ms ?? null, resMs: enterRes?.ms ?? null, status: enterRes?.status ?? null },
    prefetch: {
      count: preClickInc.length,
      firstMs: preClickInc[0]?.ms ?? null,
      hasCookie: preClickInc.map((e) => e.hasCookie),
      /* 🔴 순서 판정은 「프리페치 요청이 `/enter` **응답**보다 앞섰는가」로 본다 —
         세션은 응답의 `Set-Cookie` 로 서기 때문이다(요청만으로는 아직 쿠키가 없다). */
      beforeEnterRes: preClickInc.length && enterRes ? preClickInc[0].ms < enterRes.ms : null,
    },
    incStatuses: incRes.map((e) => ({ ms: e.ms, status: e.status, loc: e.location })),
    postClickIncCount: postClickInc.length,
    net,
  };
};

const out = { base: BASE, wall: new Date().toISOString(), reps: REPS, cols: { rail1280: [], drawer390: [] } };
const browser = await chromium.launch();
// 🔴 자극(레일) 열을 먼저 — 대조군을 먼저 돌리면 공유 자원을 쥐어 초록을 만든다.
for (let i = 0; i < REPS; i++) out.cols.rail1280.push(await rep(browser, "rail", 1280));
for (let i = 0; i < REPS; i++) out.cols.drawer390.push(await rep(browser, "drawer", 390));
await browser.close();

const summarise = (rows) => ({
  urlPaths: rows.map((r) => r.urlPath),
  prefetchCounts: rows.map((r) => r.prefetch.count),
  prefetchBeforeEnterRes: rows.map((r) => r.prefetch.beforeEnterRes),
  prefetchCookies: rows.map((r) => r.prefetch.hasCookie),
  incStatuses: rows.map((r) => r.incStatuses.map((s) => s.status)),
  enterResMs: rows.map((r) => r.enter.resMs),
  firstPrefetchMs: rows.map((r) => r.prefetch.firstMs),
});
out.summary = { rail1280: summarise(out.cols.rail1280), drawer390: summarise(out.cols.drawer390) };
out.verdict = {
  /* 가설이 서려면 «레일 열에서» 프리페치가 세션보다 앞서고 307 을 받아야 한다. */
  railPrefetchedBeforeSession: out.summary.rail1280.prefetchBeforeEnterRes,
  railPrefetchSaw307: out.cols.rail1280.map((r) => r.incStatuses.some((s) => s.status === 307)),
  railLanded: out.summary.rail1280.urlPaths,
  drawerPrefetchedBeforeSession: out.summary.drawer390.prefetchBeforeEnterRes,
  drawerLanded: out.summary.drawer390.urlPaths,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  `rail1280  landed=${JSON.stringify(out.summary.rail1280.urlPaths)} prefetch=${JSON.stringify(out.summary.rail1280.prefetchCounts)} ` +
    `beforeEnter=${JSON.stringify(out.summary.rail1280.prefetchBeforeEnterRes)} cookie=${JSON.stringify(out.summary.rail1280.prefetchCookies)} ` +
    `incStatus=${JSON.stringify(out.summary.rail1280.incStatuses)}\n` +
    `drawer390 landed=${JSON.stringify(out.summary.drawer390.urlPaths)} prefetch=${JSON.stringify(out.summary.drawer390.prefetchCounts)} ` +
    `beforeEnter=${JSON.stringify(out.summary.drawer390.prefetchBeforeEnterRes)} cookie=${JSON.stringify(out.summary.drawer390.prefetchCookies)} ` +
    `incStatus=${JSON.stringify(out.summary.drawer390.incStatuses)}\n` +
    `enterResMs rail=${JSON.stringify(out.summary.rail1280.enterResMs)} drawer=${JSON.stringify(out.summary.drawer390.enterResMs)} ` +
    `firstPrefetchMs rail=${JSON.stringify(out.summary.rail1280.firstPrefetchMs)} drawer=${JSON.stringify(out.summary.drawer390.firstPrefetchMs)}`,
);
process.exit(0);
