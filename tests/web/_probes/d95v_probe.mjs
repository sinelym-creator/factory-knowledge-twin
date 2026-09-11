/** D-95v — 「앱바 튜토리얼을 누르면 투어가 열리는가」를 두 폭 × 두 진입로에서 2회씩.
 *
 * 축: ⓐ 412×600 × `/overview` 직행 2/2 · ⓑ 1440×900 × `/` 진입 회귀 2/2
 *     ⓒ 닫기 → 새로고침 되열림 0 (선재 결함 동수리분)
 * 열림의 판정선 = `intro-card` 가 서는가(앱바 버튼이 여는 것이 그것이다).
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const BASE = process.argv[2];
const TAG = process.argv[3] ?? "col";
if (!BASE) { console.error("usage: <base> <tag>"); process.exit(2); }

const b = await chromium.launch();

async function once({ width, height, entry }) {
  const ctx = await b.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
  await p.goto(BASE + entry, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(entry === "/" ? 2500 : 1800);
  /* 첫 방문 카드가 이미 서 있으면 닫아 둔다 — 「눌러서 열렸다」를 재려면 닫힌 데서 출발한다. */
  const card = p.locator('[data-testid="intro-card"]');
  if (await card.count()) {
    const bb = card.locator("button");
    if (await bb.count()) await bb.last().click().catch(() => {});
    await p.waitForTimeout(600);
  }
  const before = await p.locator('[data-testid="intro-card"]').count();
  await p.getByTestId("intro-reopen").click();
  let opened = 0, ms = null;
  const t0 = Date.now();
  try {
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="intro-card"]').length > 0, null, { timeout: 6000 });
    opened = 1; ms = Date.now() - t0;
  } catch { opened = 0; }
  const url = new URL(p.url());
  /* ⓒ 닫고 새로고침 — 「닫았다」가 지켜지는가 */
  let reopenedAfterReload = null;
  if (opened) {
    const c2 = p.locator('[data-testid="intro-card"]');
    const bb2 = c2.locator("button");
    if (await bb2.count()) await bb2.last().click().catch(() => {});
    await p.waitForTimeout(600);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2000);
    reopenedAfterReload = await p.locator('[data-testid="intro-card"]').count();
  }
  await ctx.close();
  return { width, entry, before, opened, ms, search: url.search, reopenedAfterReload, errs };
}

const plan = [
  { width: 412, height: 600, entry: "/overview" },
  { width: 412, height: 600, entry: "/overview" },
  { width: 1440, height: 900, entry: "/" },
  { width: 1440, height: 900, entry: "/" },
];
for (const cell of plan) {
  const r = await once(cell);
  console.log(`${TAG} ${r.width}x ${r.entry.padEnd(9)} opened=${r.opened} ${r.ms === null ? "(6s 안 안 열림)" : r.ms + "ms"} search=${r.search || "(none)"} 닫고새로고침=${r.reopenedAfterReload} err=${r.errs.length}`);
}
await b.close();
