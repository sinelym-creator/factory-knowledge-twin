/**
 * E-12 — `/compare` 화면이 **상류를 그대로 그리는가**.
 *
 * 🔴 판정선은 「열이 3개 그려졌다」가 아니다. **전략별 화면 hit 수 = 그 실행의 `/compare` 응답 JSON 수**.
 *    이걸 안 재면 「화면이 5개를 그렸다」와 「상류가 5개를 줬다」가 구별되지 않는다.
 *    그래서 응답을 **같은 실행에서 가로채** 두 수를 나란히 찍는다.
 * 🔴 질문은 지어내지 않는다 — 화면이 준 승인 목록에서 고른다(목록 밖은 상류가 400 으로 거절한다).
 * 🔴 콘솔 문면은 ASCII.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const LABEL = args.get("label") ?? "col";
const NEEDLE = args.get("needle") ?? "";
const ENGINE = args.get("engine") ?? "chromium";
if (!BASE) {
  console.error("usage: node t76_e12_compare.mjs --base URL [--label L] [--needle TEXT] [--engine chromium]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const pw = createRequire(path.join(here, "/"))("playwright");

const out = { label: LABEL, base: BASE, engine: ENGINE, consoleErrors: [], pageErrors: [], upstream: null, screen: [] };
const browser = await pw[ENGINE].launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") out.consoleErrors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => out.pageErrors.push(String(e).slice(0, 160)));

/* 🔴 같은 실행의 상류 응답을 잡아 둔다 — 다른 회차의 JSON 과 비교하면 두 사실을 섞는 것이다. */
page.on("response", async (r) => {
  if (!r.url().includes("/api/retrieval/compare")) return;
  out.upstreamStatus = r.status();
  try {
    const body = await r.json();
    out.upstream = Array.isArray(body)
      ? body.map((s) => ({ strategy: s.strategy, hits: (s.hits ?? []).length }))
      : { error: body?.error?.code ?? "non-array" };
  } catch (e) {
    out.upstream = { parseError: String(e).slice(0, 120) };
  }
});

try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="enter-button"]', { timeout: 30000 });
  try {
    await page.locator('[data-testid="enter-button"]').click({ timeout: 8000, force: true });
  } catch {
    await page.evaluate(() => document.querySelector('[data-testid="entry-form"]')?.requestSubmit());
  }
  await page.waitForURL("**/overview", { timeout: 60000 });

  await page.goto(`${BASE}/compare`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="compare-panel"]', { timeout: 30000 });

  const sel = page.locator('[data-testid="compare-question"]');
  const n = await sel.locator("option").count();
  out.approvedQuestions = n;
  if (n === 0) throw new Error("screen offered no approved questions");
  let chosen = null;
  for (let i = 0; i < n; i += 1) {
    const v = await sel.locator("option").nth(i).getAttribute("value");
    if (!NEEDLE || (v && v.includes(NEEDLE))) {
      chosen = v;
      break;
    }
  }
  if (chosen === null) throw new Error("needle not among approved questions");
  out.question = chosen.slice(0, 50);
  await sel.selectOption(chosen);

  const boxes = page.locator('[data-testid="compare-strategy"]');
  const bn = await boxes.count();
  for (let i = 0; i < bn; i += 1) {
    if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).locator("xpath=..").click();
  }
  out.strategiesOn = [];
  for (let i = 0; i < bn; i += 1) {
    if (await boxes.nth(i).isChecked()) out.strategiesOn.push(await boxes.nth(i).getAttribute("data-strategy"));
  }

  await page.locator('[data-testid="compare-run"]').click({ force: true });
  await Promise.race([
    page.waitForSelector('[data-testid="compare-columns"]', { timeout: 180000 }),
    page.waitForSelector('[data-testid="compare-error"]', { timeout: 180000 }),
  ]);
  out.errorBanner = await page.locator('[data-testid="compare-error"]').innerText().catch(() => null);

  const cols = page.locator('[data-testid="compare-column"]');
  const cn = await cols.count();
  out.columnCount = cn;
  for (let i = 0; i < cn; i += 1) {
    const c = cols.nth(i);
    out.screen.push({
      strategy: await c.getAttribute("data-strategy"),
      hits: await c.locator('[data-testid="compare-hit"]').count(),
      evidenceChips: await c.locator('[data-testid="compare-hit"] a').count(),
      emptyLine: await c.locator('li:has-text("결과를 내지 않았습니다")').isVisible().catch(() => false),
    });
  }

  /* 🔴 화면 수 vs 상류 수 — 전략마다 «짝을 지어» 본다. 총계만 맞추면 열이 뒤바뀐 화면도 통과한다. */
  if (Array.isArray(out.upstream)) {
    const up = new Map(out.upstream.map((u) => [u.strategy, u.hits]));
    out.mirror = out.screen.map((s) => ({
      strategy: s.strategy,
      screenHits: s.hits,
      upstreamHits: up.has(s.strategy) ? up.get(s.strategy) : null,
      same: up.get(s.strategy) === s.hits,
    }));
    out.mirrorsUpstream = out.mirror.every((m) => m.same === true);
    out.strategySetsMatch =
      out.upstream.length === out.screen.length &&
      out.upstream.every((u) => out.screen.some((s) => s.strategy === u.strategy));
  }
  out.evidenceChipsTotal = out.screen.reduce((a, s) => a + s.evidenceChips, 0);
} catch (e) {
  out.error = String(e).slice(0, 300);
} finally {
  await browser.close();
}

process.stdout.write(JSON.stringify(out, null, 1) + String.fromCharCode(10));
process.exit(out.error ? 1 : 0);
