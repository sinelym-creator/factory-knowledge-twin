/**
 * 승격 16 — 「드로어 링크를 눌렀는데 URL 이 안 바뀐다」의 **주어를 가르는 대조군**(cap 0).
 *
 * 본 그물(promo16_external)에서 축 ⓒ(링크 클릭)는 **닫힘 0 · URL 은 `/overview` 그대로**로 나왔다.
 * 🔴 그 한 칸만으로는 「드로어가 이동을 삼켰다」와 「그 링크는 원래 여기로 온다」를 못 가른다.
 *    그래서 **손잡이 하나만 다른 열**을 세운다 — 같은 링크를 **레일**에서, 그리고 **직접 goto** 로.
 *
 * 열 ① drawer(390): 드로어를 열고 `nav-incidents` 클릭
 * 열 ② rail(1280): 레일의 같은 `nav-incidents` 클릭 (드로어 없음 = 닫힘 로직 없음)
 * 열 ③ direct(1280): `nav-incidents` 의 href 로 **직접 goto**
 * 세 열의 최종 URL 이 같으면 주어는 «드로어»가 아니라 «그 경로»다.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }

const dismiss = async (p) => {
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(300); }
  }
};
/** 이동 자취 — 서버 리다이렉트가 있으면 여기 남는다(한 상태코드에 여러 갈래가 있다). */
const trackNav = (p, sink) => {
  p.on("response", (r) => {
    try {
      const u = new URL(r.url());
      if (u.origin !== new URL(BASE).origin) return;
      if (!/^\/(incidents|overview)/.test(u.pathname)) return;
      sink.push({ path: u.pathname + u.search, status: r.status(), loc: r.headers()["location"] ?? null });
    } catch { /* 흘린다 */ }
  });
};

const out = { base: BASE, wall: new Date().toISOString(), cols: {} };
const browser = await chromium.launch();

// 열 ① drawer(390)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const net = [];
  trackNav(p, net);
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1200);
  await dismiss(p);
  await p.locator('[data-testid="nav-menu-toggle"]').first().click();
  await p.waitForTimeout(450);
  const href = await p.locator('[data-nav-variant="drawer"][data-testid="nav-incidents"]').first().getAttribute("href");
  await p.locator('[data-nav-variant="drawer"][data-testid="nav-incidents"]').first().click();
  await p.waitForTimeout(3500); // 클릭 직후 읽기는 이르다 — 라우팅이 끝날 시간을 준다.
  out.cols.drawer390 = { href, urlAfter: p.url(), drawerAfter: await p.locator('[data-testid="nav-drawer"]').count(), net: net.slice(-8) };
  await ctx.close();
}

// 열 ② rail(1280) — 손잡이 하나만 다르다(드로어 없음).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const net = [];
  trackNav(p, net);
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1200);
  await dismiss(p);
  const href = await p.locator('[data-nav-variant="rail"][data-testid="nav-incidents"]').first().getAttribute("href");
  await p.locator('[data-nav-variant="rail"][data-testid="nav-incidents"]').first().click();
  await p.waitForTimeout(3500);
  out.cols.rail1280 = { href, urlAfter: p.url(), net: net.slice(-8) };
  await ctx.close();
}

// 열 ③ direct goto(1280) — 화면 조작이 아예 없는 열.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const net = [];
  trackNav(p, net);
  await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 }); // 세션 먼저 세운다
  await p.waitForTimeout(800);
  await dismiss(p);
  const href = out.cols.rail1280.href ?? "/incidents/INC-2025-019";
  const resp = await p.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  out.cols.direct1280 = { href, gotoStatus: resp ? resp.status() : null, urlAfter: p.url(), net: net.slice(-8) };
  await ctx.close();
}

await browser.close();
const u = (s) => new URL(s).pathname;
out.verdict = {
  drawerUrl: u(out.cols.drawer390.urlAfter),
  railUrl: u(out.cols.rail1280.urlAfter),
  directUrl: u(out.cols.direct1280.urlAfter),
  /* 세 열이 같으면 주어는 드로어가 아니다 — 그 경로가 원래 그렇게 답한다. */
  sameAcrossColumns:
    u(out.cols.drawer390.urlAfter) === u(out.cols.rail1280.urlAfter) &&
    u(out.cols.rail1280.urlAfter) === u(out.cols.direct1280.urlAfter),
  drawerClosed: out.cols.drawer390.drawerAfter === 0,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  `href=${out.cols.rail1280.href} | drawer390 -> ${out.verdict.drawerUrl} (closed=${out.verdict.drawerClosed}) | ` +
    `rail1280 -> ${out.verdict.railUrl} | direct1280 -> ${out.verdict.directUrl} (goto ${out.cols.direct1280.gotoStatus}) ` +
    `=> same=${out.verdict.sameAcrossColumns}`,
);
process.exit(0);
