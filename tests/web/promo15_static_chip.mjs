/**
 * 승격 15 보정 측정 — 정적 방문자 칩(`static-visitor-chip`) · **live 0**.
 *
 * 🔴 본 측정(`promo15_external.mjs`)에서 이 칩이 0 이었는데, 그 회차의 컨텍스트는 `/overview` 를
 *    먼저 열어 **세션이 이미 발급된 상태**였다. 칩의 렌더 조건은 `if (!active || !visitor) return null`
 *    이고 `visitor` 는 effect 로 «로드»되므로, ① 세션 유무 ② 로드 대기 두 가지가 결과를 가른다.
 *    그래서 여기서는 **세션 없는 새 컨텍스트로 정적 URL 에 직행**하고 충분히 기다린다.
 *    「대조군이 자극을 먹는다」 — 앞서 연 화면이 뒤 화면의 조건을 바꾼 자리다.
 *
 * usage: node promo15_static_chip.mjs --out o.json [--base https://...]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
if (!OUT) {
  console.error("--out 은 필수다");
  process.exit(9);
}
const STATIC_URL = "/incidents/INC-2026-014?run=STATIC-GS-01";

const run = async () => {
  const browser = await chromium.launch();
  const out = { base: BASE, wall: new Date().toISOString(), columns: {} };

  /** 한 열 = 새 컨텍스트(쿠키 0) · 조건 하나만 다르게. */
  const column = async (label, warmOverview) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    if (warmOverview) {
      // 🔴 자극 열의 «오염 재현» — 본 측정이 밟았던 순서 그대로.
      await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
    }
    await page.goto(BASE + STATIC_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    // 칩은 effect 로 방문자를 만든 «뒤» 선다 — 나타날 때까지 기다리고, 못 나오면 그 사실을 값으로.
    const appeared = await page
      .locator('[data-testid="static-visitor-chip"]')
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const res = {
      appeared,
      staticChip: await page.locator('[data-testid="static-visitor-chip"]').count(),
      staticWrapper: await page.locator('[data-testid="static-visitor"]').count(),
      sessionChip: await page.locator('[data-testid="session-chip"]').count(),
      runModeBadge: (await page.locator('[data-testid="run-mode-badge"]').count())
        ? await page.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode")
        : null,
      sourceStatic: await page.locator('[data-testid="run-source-static"]').count(),
      cookies: (await ctx.cookies()).map((c) => c.name),
    };
    out.columns[label] = res;
    await ctx.close();
    return res;
  };

  const clean = await column("direct_no_session", false);
  const warmed = await column("after_overview", true);

  out.verdict = {
    chipShowsOnDirectEntry: clean.appeared === true,
    chipSuppressedAfterOverview: warmed.appeared === false,
    // 두 열이 갈리면 「본 측정의 0 은 내 순서가 만든 것」이 실증된다.
    orderExplainsIt: clean.appeared === true && warmed.appeared === false,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(
    `direct: chip=${clean.staticChip} badge=${clean.runModeBadge} session=${clean.sessionChip} | ` +
      `afterOverview: chip=${warmed.staticChip} badge=${warmed.runModeBadge} session=${warmed.sessionChip} | ` +
      `orderExplainsIt=${out.verdict.orderExplainsIt}`,
  );
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
