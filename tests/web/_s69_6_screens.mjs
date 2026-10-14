/**
 * S69-6 축 ② — 공개 URL 의 주요 화면이 «브라우저에서» 서는가(hydration · 콘솔 오류 계수). 리바이2 · 2026-10-14.
 *
 * 🔴 live 조사는 시작하지 않는다(구독 사용 0). `start-from-alarm` 은 «보이는가»만 재고 누르지 않는다 —
 *    그 버튼은 mode:"live" 로 run 을 시작한다(start-investigation.tsx → startRunBrowser(…, "live")).
 * 🔴 hydration 의 근거는 «클라이언트만 할 수 있는 일»이다:
 *    ⓐ 입장 폼(EnterForm)이 «누르지 않아도» /enter 로 제출해 /overview 로 넘어간다(SSR 문면: 「자동으로 넘어가지 않으면…」)
 *    ⓑ mode-badge 의 data-mode 가 SSR 값 `checking` 에서 바뀐다(클라이언트 효과)
 * 🔴 근거 IP = Playwright 의 serverAddr(연결 IP). URL 을 쳤다는 사실은 vantage 의 근거가 아니다.
 *
 *   node _s69_6_screens.mjs [--base=…]   → JSON(stdout) · exit 0
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("@playwright/test");

const arg = (k, d) => (process.argv.find((x) => x.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { base: BASE, at: new Date().toISOString(), screens: [] };
let bucket = null;
const serverAddrs = new Set();
page.on("console", (m) => m.type() === "error" && bucket && bucket.consoleErrors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => bucket && bucket.pageErrors.push(String(e).slice(0, 200)));
page.on("response", async (r) => {
  if (bucket && r.status() >= 400) bucket.http4xx5xx.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 80)}`);
  try { const sa = await r.serverAddr(); if (sa?.ipAddress) serverAddrs.add(sa.ipAddress); } catch {}
});
const testIds = () => page.evaluate(() => [...new Set([...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")))]);
const attr = (id, a) => page.locator(`[data-testid="${id}"]`).first().getAttribute(a, { timeout: 2000 }).catch(() => null);
const text = (id) => page.locator(`[data-testid="${id}"]`).first().textContent({ timeout: 2000 }).then((t) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 100)).catch(() => null);

async function screen(name, fn) {
  bucket = { name, consoleErrors: [], pageErrors: [], http4xx5xx: [] };
  const t0 = Date.now();
  try { await fn(bucket); } catch (e) { bucket.error = String(e).slice(0, 200); }
  bucket.ms = Date.now() - t0;
  bucket.url = page.url().replace(BASE, "");
  bucket.modeBadge = { dataMode: await attr("mode-badge", "data-mode"), text: await text("mode-badge") };
  out.screens.push(bucket);
}

// ① 입구 — 누르지 않고 자동 제출되는가(hydration ⓐ)
await screen("entry-autosubmit", async (b) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  b.ssrModeBadge = await attr("mode-badge", "data-mode");
  await page.waitForURL(/\/overview/, { timeout: 30000 }).then(() => (b.autoNavigated = true)).catch(() => (b.autoNavigated = false));
  b.sessionCookie = (await ctx.cookies()).some((c) => c.name === "fkt_session");
});
// ② overview — 데이터가 ai-api(→ Vercel → funnel)에서 와서 손잡이가 서는가. 🔴 누르지 않는다.
await screen("overview", async (b) => {
  if (!/\/overview/.test(page.url())) await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
  b.startFromAlarmVisible = await page.locator('[data-testid="start-from-alarm"]').first().waitFor({ state: "visible", timeout: 60000 }).then(() => true).catch(() => false);
  await sleep(1500);
  b.testIdCount = (await testIds()).length;
  b.liveStatus = await page.evaluate(() => fetch("/api/live/status").then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) })).catch((e) => ({ err: String(e) })));
});
// ③ 정적 replay 화면(ai-api 없이 그려지는 고정 데이터)
await screen("static-replay-incident", async (b) => {
  await page.goto(BASE + "/incidents/INC-2026-014?run=STATIC-GS-01", { waitUntil: "domcontentloaded", timeout: 60000 });
  b.runStatusVisible = await page.locator('[data-testid="run-status"]').first().waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false);
  await sleep(2500);
  b.runStatus = await text("run-status");
  b.synthesisAxis = await attr("synthesis-badge", "data-axis");
  b.testIdCount = (await testIds()).length;
});
// ④ compare
await screen("compare", async (b) => {
  await page.goto(BASE + "/compare", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(4000);
  b.testIdCount = (await testIds()).length;
  b.status = (await page.evaluate(() => document.title)).slice(0, 60);
});
bucket = null;
out.serverAddrs = [...serverAddrs];
out.totals = {
  consoleErrors: out.screens.reduce((n, s) => n + s.consoleErrors.length, 0),
  pageErrors: out.screens.reduce((n, s) => n + s.pageErrors.length, 0),
};
console.log(JSON.stringify(out, null, 1));
await browser.close();
