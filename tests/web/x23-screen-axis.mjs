/**
 * X-23 화면 축 — 「근거 검색 0건 → 모른다 · 지어내지 않는다 · 그 사실이 화면에 보인다」
 * 정본 판정선 = `docs/plan/test-plan-v1.md` X-23 행.
 *
 * 🔴 무엇을 재는가: `/compare` 화면에서 **hit 0 인 전략의 열**이
 *    ① 「결과를 내지 않았습니다」를 «보이게» 말하고 ② 그 열의 근거 항목이 **0건**이며
 *    ③ 같은 실행의 다른 열은 근거 ≥1 이다(= 그물이 닿았고 화면이 근거를 그릴 줄 안다).
 * 🔴 ③ 이 없으면 이 초록은 「아무것도 못 그리는 화면」과 구별되지 않는다 — 같은 실행 안의 대조군이다.
 * 🔴 무대는 인자로 받는다(`--base`). 포트·질문·라벨을 파일에 박지 않는다 — 무대는 늙는다.
 * 🔴 콘솔로 나가는 문면은 ASCII 로만 쓴다(cp949 를 못 넘으면 스크립트가 제 손으로 죽는다).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const BASE = args.get("base");
const LABEL = args.get("label") ?? "col";
const NEEDLE = args.get("needle") ?? ""; // 질문 고르기용 부분 문자열. 비면 첫 항목.
const ZERO = args.get("zero") ?? "graphrag"; // 0 이길 기대하는 전략(대조군 열에서는 그냥 관측만)
const PW_DIR = args.get("pw"); // playwright 를 어디서 풀지(없으면 이 파일 옆에서)

if (!BASE) {
  console.error("usage: node x23-screen-axis.mjs --base http://127.0.0.1:PORT [--label B] [--needle TEXT] [--pw DIR]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(path.join(PW_DIR ? PW_DIR : here, "/"));
const { chromium } = require_("playwright");

const out = { label: LABEL, base: BASE, consoleErrors: [], pageErrors: [], columns: [] };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") out.consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => out.pageErrors.push(String(e).slice(0, 200)));

try {
  /* 🔴 `/compare` 는 세션이 없으면 `/` 로 307 한다 — 입장부터가 이 화면의 전제다.
     경계는 시계가 아니라 «사건»으로 잡는다(URL 전이). */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="enter-button"]', { timeout: 20000 });
  /* 🔴 «닿는다 ≠ 눌린다» — 첫 방문에 인트로/투어가 덮고 있으면 버튼은 보이는데 눌리지 않는다.
     무엇이 덮고 있는지 «값으로» 남기고, 덮개를 걷은 뒤 누른다. */
  out.overlays = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="enter-button"]');
    if (!b) return { found: false };
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      topTag: top ? top.tagName : null,
      topTestid: top ? top.getAttribute("data-testid") : null,
      isTheButton: top === b || (b.contains(top) ?? false),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute("data-testid") ?? d.tagName),
    };
  });
  if (!out.overlays.isTheButton) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  }
  /* 🔴 이 버튼은 계속 리렌더되어(«detached, retrying») 안정성 검사가 끝나지 않는다.
     입장은 판정 축이 아니라 «전제»이므로 강제 클릭 → 그래도 안 되면 폼 제출로 내려간다.
     어느 길로 들어갔는지는 값으로 남긴다. */
  out.enterPath = "force-click";
  try {
    await page.locator('[data-testid="enter-button"]').click({ timeout: 10000, force: true });
  } catch {
    out.enterPath = "form-submit";
    await page.evaluate(() => {
      const f = document.querySelector('[data-testid="entry-form"]');
      if (f) f.requestSubmit();
    });
  }
  await page.waitForURL("**/overview", { timeout: 60000 });
  out.entered = page.url().slice(-30);
  await page.goto(`${BASE}/compare`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="compare-panel"]', { timeout: 20000 });

  // 질문 — 지어내지 않고 화면이 준 목록에서 고른다(승인 목록 밖 질문은 서버가 400 으로 거절한다).
  const sel = page.locator('[data-testid="compare-question"]');
  const optionCount = await sel.locator("option").count();
  out.questionOptions = optionCount;
  if (optionCount === 0) {
    out.fatal = "no approved questions offered by the screen";
    throw new Error(out.fatal);
  }
  let chosen = null;
  for (let i = 0; i < optionCount; i += 1) {
    const v = await sel.locator("option").nth(i).getAttribute("value");
    if (!NEEDLE || (v && v.includes(NEEDLE))) {
      chosen = v;
      break;
    }
  }
  if (chosen === null) {
    out.fatal = `needle not found among ${optionCount} approved questions`;
    throw new Error(out.fatal);
  }
  out.question = chosen.slice(0, 60);
  await sel.selectOption(chosen);

  // 전략 세 개를 모두 켠다 — 켜져 있으면 두고, 꺼져 있으면 라벨을 눌러 켠다.
  const boxes = page.locator('[data-testid="compare-strategy"]');
  const n = await boxes.count();
  out.strategyBoxes = n;
  for (let i = 0; i < n; i += 1) {
    const box = boxes.nth(i);
    if (!(await box.isChecked())) await box.locator("xpath=..").click();
  }
  out.strategiesOn = [];
  for (let i = 0; i < n; i += 1) {
    const box = boxes.nth(i);
    if (await box.isChecked()) out.strategiesOn.push(await box.getAttribute("data-strategy"));
  }

  const t0 = Date.now();
  await page.locator('[data-testid="compare-run"]').click();
  /* 🔴 두 갈래를 «둘 다» 기다린다 — 결과 열이든 오류 문면이든, 화면이 무엇을 말하는지가 축이다.
     한 갈래만 기다리면 오류 무대에서 타임아웃이 나고, 그 타임아웃은 화면의 답이 아니라 내 그물의 답이다. */
  await Promise.race([
    page.waitForSelector('[data-testid="compare-columns"]', { timeout: 180000 }),
    page.waitForSelector('[data-testid="compare-error"]', { timeout: 180000 }),
  ]);
  out.errorBanner = await page
    .locator('[data-testid="compare-error"]')
    .innerText()
    .then((t) => t.replace(/\s+/g, " ").trim())
    .catch(() => null);
  out.errorBannerVisible = await page.locator('[data-testid="compare-error"]').isVisible().catch(() => false);
  if (!(await page.locator('[data-testid="compare-columns"]').count())) {
    out.columnCount = 0;
    out.hitsAnywhere = await page.locator('[data-testid="compare-hit"]').count();
    out.elapsedMs = Date.now() - t0;
    out.verdict = { errorPath: true, errorBannerVisible: out.errorBannerVisible, hitsAnywhere: out.hitsAnywhere };
    process.stdout.write(JSON.stringify(out, null, 1) + String.fromCharCode(10));
    await browser.close();
    process.exit(0);
  }
  // 열이 그려진 뒤에도 hit 목록이 채워질 틈을 준다 — 클릭 직후 읽기는 이르다.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="compare-column"]').length > 0,
    null,
    { timeout: 180000 },
  );
  out.elapsedMs = Date.now() - t0;

  const cols = page.locator('[data-testid="compare-column"]');
  const cn = await cols.count();
  out.columnCount = cn;
  for (let i = 0; i < cn; i += 1) {
    const c = cols.nth(i);
    const strategy = await c.getAttribute("data-strategy");
    const hits = await c.locator('[data-testid="compare-hit"]').count();
    // 「지어낸 근거」 계수 = 이 열에 실제로 그려진 근거 ID 링크 수.
    const idLinks = await c.locator('[data-testid="compare-hit"] a').count();
    const text = (await c.innerText()).replace(/\s+/g, " ").trim();
    const emptyLineVisible = await c.locator('li:has-text("결과를 내지 않았습니다")').isVisible().catch(() => false);
    const diff = await c.locator('[data-testid="compare-diff"]').innerText().catch(() => "");
    out.columns.push({
      strategy,
      hits,
      idLinks,
      emptyLineVisible,
      diff: diff.replace(/\s+/g, " ").trim(),
      textLen: text.length,
      textHead: text.slice(0, 90),
    });
  }

  const zeroCol = out.columns.find((c) => c.strategy === ZERO);
  const others = out.columns.filter((c) => c.strategy !== ZERO);
  out.verdict = {
    zeroStrategy: ZERO,
    zeroHits: zeroCol ? zeroCol.hits : null,
    zeroIdLinks: zeroCol ? zeroCol.idLinks : null,
    zeroSaysNothingFound: zeroCol ? zeroCol.emptyLineVisible : null,
    otherColumnsMinHits: others.length ? Math.min(...others.map((c) => c.hits)) : null,
    otherColumnsMaxHits: others.length ? Math.max(...others.map((c) => c.hits)) : null,
  };
} catch (e) {
  out.error = String(e).slice(0, 1200);
} finally {
  await browser.close();
}

process.stdout.write(JSON.stringify(out, null, 1) + "\n");
process.exit(out.error ? 1 : 0);
