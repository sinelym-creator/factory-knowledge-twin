/**
 * 관측 O-1 귀속 — overview 의 `[data-testid]` 계수가 **46/69** 로 갈리는 현상.
 *
 * 전임 실측: `c4f9ab2` 3회 중 2회 69 · `b37cda6` 3회 전부 46 · 단독 프로브로는 재현 안 됨(46).
 * 오케 소견(E3 · 손잡이로만 쓴다): overview 레이아웃의 **스트리밍 교체 창**에서 옛 벌과 새 벌이
 * 잠깐 동거해 본문이 통째로 2벌로 잡히는 것 아닌가.
 *
 * 🔴 그래서 **한 시점이 아니라 창 전체를 훑는다**. 진입 직후 여러 시점에서 같은 자를 대고,
 *    69 가 나오는 시점이 있으면 그 시점의 «중복된 testid 목록»을 그대로 남긴다 — 계수만으로는
 *    「2벌」인지 「다른 요소가 늘었나」인지 갈리지 않는다.
 * 🔴 계수는 «관측»이지 판정이 아니다. 여기서 나오는 것은 결함이 아니라 D-n 승격에 쓸 표다.
 *
 * 사용: node t65_o1_overview_census.mjs --base http://127.0.0.1:3107 --runs 12 --out <json>
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
const RUNS = Number(arg("runs", "12"));
const OUT = arg("out", "");
const SAMPLES = [0, 60, 150, 400, 1200];

const report = { base: BASE, at: new Date().toISOString(), runs: [] };
const browser = await chromium.launch();

for (let n = 1; n <= RUNS; n += 1) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const run = { n, samples: [] };

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
  run.url = page.url();

  let prev = 0;
  for (const ms of SAMPLES) {
    await page.waitForTimeout(ms - prev);
    prev = ms;
    const snap = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-testid]")];
      const ids = els.map((e) => e.getAttribute("data-testid"));
      const counts = {};
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
      const dupes = Object.entries(counts)
        .filter(([, c]) => c > 1)
        .map(([id, c]) => ({ id, c }));
      return {
        total: ids.length,
        unique: Object.keys(counts).length,
        h1: document.querySelectorAll("h1").length,
        equipmentCards: counts["equipment-card"] ?? 0,
        headline: counts["headline"] ?? 0,
        dupes,
      };
    });
    run.samples.push({ atMs: ms, ...snap });
  }
  report.runs.push(run);
  await ctx.close();
}

/* 🔴 계측기 대조군 — 「69 를 못 봤다」를 값으로 만들려면 이 자가 «2벌»을 실제로 셀 수 있어야
   한다. overview 본문을 통째로 복제해 심고 같은 census 로 다시 센다. 여기서 수가 안 오르면
   위의 「전수 46」은 미재현이 아니라 안 본 것이다. */
const ctrlCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctrlPage = await ctrlCtx.newPage();
await ctrlPage.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
await ctrlPage.waitForTimeout(1500);
const ctrlBefore = await ctrlPage.evaluate(() => document.querySelectorAll("[data-testid]").length);
const ctrlAfter = await ctrlPage.evaluate(() => {
  const main = document.querySelector("main") ?? document.body;
  main.insertAdjacentHTML("beforeend", main.innerHTML);
  return {
    total: document.querySelectorAll("[data-testid]").length,
    h1: document.querySelectorAll("h1").length,
  };
});
await ctrlCtx.close();
await browser.close();

report.control = { before: ctrlBefore, after: ctrlAfter, discriminates: ctrlAfter.total > ctrlBefore };

const totals = report.runs.flatMap((r) => r.samples.map((s) => s.total));
report.summary = {
  runs: RUNS,
  distinctTotals: [...new Set(totals)].sort((a, b) => a - b),
  perRunFinal: report.runs.map((r) => r.samples.at(-1)?.total),
  perRunMax: report.runs.map((r) => Math.max(...r.samples.map((s) => s.total))),
  anyDupes: report.runs.some((r) => r.samples.some((s) => s.dupes.length > 0)),
  dupeExamples: report.runs
    .flatMap((r) => r.samples.filter((s) => s.dupes.length).map((s) => ({ run: r.n, atMs: s.atMs, total: s.total, dupes: s.dupes.slice(0, 6) })))
    .slice(0, 8),
  h1Values: [...new Set(report.runs.flatMap((r) => r.samples.map((s) => s.h1)))].sort(),
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
process.exit(0);
