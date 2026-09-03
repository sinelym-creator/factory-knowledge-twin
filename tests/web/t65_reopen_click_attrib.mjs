/**
 * 축 ① 부수 관측의 **귀속** — 「overview 에서 앱바 `?` 를 눌러도 URL 이 안 바뀌는 회차」가
 * 대상의 것인가, 내 클릭 방식의 것인가.
 *
 * 🔴 「안 바뀌었다」만으로는 아무것도 못 가른다. 한 자리에서 셋을 함께 찍는다:
 *    ① 링크에 **click 이벤트가 실제로 닿았는가**(capture 리스너로 센다)
 *    ② 그 뒤 `location.href` 가 바뀌었는가(2초·5초·10초)
 *    ③ 같은 href 로 **직접 이동**하면 열리는가(대상 자체는 멀쩡한가)
 * 세 값의 조합이 귀속을 정한다 — 클릭이 닿았는데 URL 이 안 바뀌면 대상, 클릭이 0 이면 내 손.
 *
 * 사용: node t65_reopen_click_attrib.mjs --base http://127.0.0.1:3107 --runs 6 --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3107");
const RUNS = Number(arg("runs", "6"));
const OUT = arg("out", "");

const report = { base: BASE, at: new Date().toISOString(), runs: [] };
const browser = await chromium.launch();

for (let n = 1; n <= RUNS; n += 1) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const run = { n };

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const auto = await page
    .waitForURL(/\/overview/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!auto) {
    await page
      .getByRole("link", { name: /입장하기/ })
      .or(page.getByRole("button", { name: /입장하기/ }))
      .first()
      .click({ timeout: 10_000 })
      .catch(() => {});
    await page.waitForURL(/\/overview/, { timeout: 45_000 }).catch(() => {});
  }

  // 투어를 스텝 1 까지 몰고 가서 Esc — 실제 사용자의 자리와 같게 만든다
  const start = page.locator('[data-testid="tour-start"]');
  await start.waitFor({ state: "visible", timeout: 20_000 });
  await start.click();
  await page.locator('[data-testid="tour-callout"][data-index="0"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-testid="tour-next"]').first().click();
  await page.locator('[data-testid="tour-callout"][data-index="1"]').waitFor({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page
    .locator('[data-testid="tour-callout"]')
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});

  run.urlBeforeClick = page.url();

  // ① 클릭이 링크에 닿는지 세는 계수기를 페이지에 심는다(대상 코드는 안 건드린다)
  await page.evaluate(() => {
    window.__levi2ClickHits = 0;
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target;
        if (el instanceof Element && el.closest('[data-testid="intro-reopen"]')) {
          window.__levi2ClickHits += 1;
        }
      },
      true,
    );
  });

  await page.locator('[data-testid="intro-reopen"]').first().click({ timeout: 10_000 });
  run.clickHits = await page.evaluate(() => window.__levi2ClickHits ?? -1);

  run.urlAt = [];
  let prev = 0;
  for (const ms of [2000, 5000, 10000]) {
    await page.waitForTimeout(ms - prev);
    prev = ms;
    run.urlAt.push({ atMs: ms, url: page.url(), callout: await page.locator('[data-testid="tour-callout"]').count() });
  }
  run.navigated = run.urlAt.some((s) => /tour=1/.test(s.url));

  // ③ 대상 자체는 멀쩡한가 — 같은 href 로 직접 이동
  if (!run.navigated) {
    await page.goto(`${BASE}/overview?intro=1&tour=1`, { waitUntil: "domcontentloaded" });
    const opened = await page
      .locator('[data-testid="tour-callout"]')
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    run.directGotoOpens = opened;
    run.directIndex = opened
      ? Number(await page.locator('[data-testid="tour-callout"]').getAttribute("data-index"))
      : null;
  }

  report.runs.push(run);
  await ctx.close();
}

await browser.close();

report.summary = {
  runs: RUNS,
  navigated: report.runs.filter((r) => r.navigated).length,
  clickHits: report.runs.map((r) => r.clickHits),
  directGotoOpens: report.runs.filter((r) => r.directGotoOpens === true).length,
  detail: report.runs.map((r) => ({ n: r.n, hits: r.clickHits, nav: r.navigated, direct: r.directGotoOpens ?? null, idx: r.directIndex ?? null })),
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
process.exit(0);
