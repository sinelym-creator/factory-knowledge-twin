/** D-96bV ①② — 수화 «전» 클릭이 목적지 쿼리를 잃지 않는가 (리바이2 61대)
 *
 *  정본 = `docs/design/d96-entry-bounce-next.md` §4-1·§4-2:
 *    「느린 조건(CDP 400kbps·RTT 400·CPU×4) × fresh × early 클릭 → 말풍선 3/3(前 0/3)」
 *    「실체 = `?intro=1&tour=1` 이 303 뒤에도 살아 있음」 · 「late 3/3 · 빠른 6/6」
 *
 *  🔴 **자극 실재를 값으로 남긴다.** 느린 조건이 «걸렸는지»를 안 재면 「前에서도 3/3」이
 *     나왔을 때 그것이 처방 덕인지 내가 조건을 못 건 탓인지 가를 수 없다. 그래서 열마다
 *     ⓐ CDP 적용 여부 ⓑ 클릭 시점이 수화 «전» 이었는지(`__fktHydrated` 유무)를 함께 찍는다.
 *
 *  node d96b_early_click.mjs <shellBase> <mode> <N>
 *    mode: early | late | fast
 */
const PW = "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, MODE = "early", N = "3"] = process.argv.slice(2);
if (!B) { console.error("usage: <shellBase> <mode> <N>"); process.exit(2); }
const SLOW = MODE !== "fast";

const br = await chromium.launch();
let ok = 0, invalid = 0;
for (let i = 1; i <= Number(N); i += 1) {
  /* fresh = 매 회차 새 컨텍스트(쿠키 0) — 세션이 남으면 바운스 자체가 안 일어난다. */
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  let applied = "없음";
  if (SLOW) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    applied = "400kbps·RTT400·CPU×4";
  }
  const t0 = Date.now();
  await page.goto(`${B}/overview?intro=1&tour=1`, { waitUntil: "domcontentloaded" });
  const loadMs = Date.now() - t0;

  /* 입장 화면에 왔는가 — 바운스가 실제로 일어났는지의 값. */
  const onEnter = /\/(\?|$)/.test(new URL(page.url()).pathname + (new URL(page.url()).search ? "?" : ""));
  const btn = page.locator('form[action="/enter"] button, button[type="submit"]').first();
  if (!(await btn.count())) { invalid += 1; console.log(`${MODE} rep${i} | 무효 — 입장 버튼 없음(url ${page.url()})`); await ctx.close(); continue; }

  /* early = 수화 전에 누른다(대기 0) · late = 수화 뒤(networkidle) */
  let hydrated = null;
  if (MODE === "late") await page.waitForLoadState("networkidle").catch(() => {});
  hydrated = await page.evaluate(() => !!document.querySelector("[data-hydrated], #__next_hydrated") || (window).__fktHydrated === true).catch(() => null);
  await btn.click({ noWaitAfter: true }).catch(() => {});
  await page.waitForTimeout(SLOW ? 9000 : 4000);
  await page.waitForLoadState("networkidle").catch(() => {});

  const url = page.url();
  const kept = url.includes("intro=1") && url.includes("tour=1");
  /* 실체 = 말풍선(투어 말풍선)이 실제로 섰는가. 쿼리만 보면 「주소는 살았는데 화면은 모름」이다. */
  const bubble = await page.locator('[data-testid="tour-callout"], [data-testid="intro-card"]').count();
  const pass = kept && bubble > 0;
  if (pass) ok += 1;
  console.log(`${MODE} rep${i} | 조건 ${applied} · 첫 로드 ${loadMs}ms · 입장화면 ${onEnter} · 클릭시 수화 ${hydrated} | 최종 URL ${url.replace(B, "")} · 쿼리보존 ${kept} · 말풍선 ${bubble}개 | ${pass ? "PASS" : "FAIL"}`);
  await ctx.close();
}
console.log(`== ${MODE} · ${ok}/${Number(N) - invalid}${invalid ? ` · 무효 ${invalid}` : ""} ==`);
await br.close();
if (invalid === Number(N)) process.exit(2);
