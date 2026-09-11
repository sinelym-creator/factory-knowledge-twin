/** M-1 — spec:488(D-1) 을 «손»으로 같은 순서로 걷는다. 한 변수씩: 입장 경로 · 뷰포트.
 *  node m1_d1.mjs <base> <entry: overview|root> <w> <h>
 *  🔴 코드 변경 0 · 대상 조작만. 각 단계의 URL 과 카드 수를 전부 남긴다(값을 버리지 않는다). */
import { chromium } from "@playwright/test";
const B = process.argv[2] ?? "http://127.0.0.1:8801";
const ENTRY = process.argv[3] ?? "overview";
const W = Number(process.argv[4] ?? 1440), H = Number(process.argv[5] ?? 900);
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const log = [];
const snap = async (tag) => {
  const s = await page.evaluate(() => ({
    url: location.pathname + location.search,
    card: document.querySelectorAll('[data-testid="intro-card"]').length,
    reopen: document.querySelectorAll('[data-testid="intro-reopen"]').length,
    mode: document.querySelector('[data-testid="mode-badge"]')?.getAttribute("data-mode") ?? null,
    keys: (() => { try { return Object.keys(sessionStorage).filter(k => k.startsWith("fkt.intro.seen")); } catch { return ["<막힘>"]; } })(),
  }));
  log.push(`${tag.padEnd(16)} url=${s.url.padEnd(28)} card=${s.card} reopen=${s.reopen} mode=${s.mode} seenKeys=${JSON.stringify(s.keys)}`);
  return s;
};
const settle = async () => {
  // spec 과 같은 앵커 — 셸이 클라이언트까지 섰는가
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="mode-badge"]');
    return b && b.getAttribute("data-mode") !== "checking";
  }, null, { timeout: 15000 }).catch(() => log.push("  ⚠ mode-badge 앵커 timeout"));
};
try {
  await page.goto(ENTRY === "overview" ? `${B}/overview` : `${B}/`, { waitUntil: "domcontentloaded" });
  await settle();
  await snap("① 진입");
  if (ENTRY === "root") {
    // 폐하 경로 — 입장 버튼을 눌러 /overview 로 «들어간다»
    const enter = page.getByTestId("enter-button").or(page.getByRole("button", { name: /시작|입장|들어/ }));
    if (await enter.count()) { await enter.first().click(); await page.waitForURL(/\/overview/, { timeout: 15000 }).catch(()=>{}); }
    await settle();
    await snap("①' 입장 후");
  }
  await page.getByTestId("intro-card").getByRole("button", { name: "안내 닫기" }).click({ timeout: 7000 });
  await page.waitForTimeout(400);
  await snap("② 닫은 뒤");
  await page.reload(); await settle();
  await snap("③ 새로고침");
  const reopen = page.getByTestId("intro-reopen");
  log.push(`  재열기 visible=${await reopen.isVisible().catch(()=>"-")} count=${await reopen.count()}`);
  await reopen.click({ timeout: 7000 });
  for (const ms of [200, 500, 1000, 2000, 4000, 7000]) {
    await page.waitForTimeout(ms - (log.__last ?? 0)); log.__last = ms;
    const s = await snap(`④ 재열기+${ms}ms`);
    if (s.card > 0) break;
  }
} catch (e) {
  log.push(`🔴 예외: ${String(e).split("\n")[0]}`);
}
console.log(`== ${ENTRY} · ${W}x${H} ==`);
console.log(log.join("\n"));
await br.close();
