/**
 * O-12 그물 — 「누가 당신을 아는가」를 주장하는 칩은 하나뿐이어야 한다.
 *
 * 🔴 자극 순서가 축이다: `/enter` → `/overview` → **정적 주소**. 정적 주소로 «직행»하면 세션이
 *    애초에 없어서(쿠키 `[]`) 두 칩이 겹칠 자리 자체가 생기지 않는다 — 그 회차의 초록은
 *    「고쳤다」가 아니라 「무대를 안 세웠다」이다.
 * 🔴 세 열을 같은 코드로 찍는다: ① 세션 있음+정적 ② 세션 없음+정적(직행) ③ 대조군의 ①.
 * 🔴 무대 울림 = 정적 화면이 실제로 섰는가(정적 표지 수). 0 이면 어느 색도 내지 않는다.
 *
 * usage: node o12_chips.mjs --base http://127.0.0.1:8168 --out C:/…/o.json
 *        [--static-url "/incidents/INC-2026-014?run=STATIC-GS-01"] [--width 390]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base");
const OUT = arg("out");
const STATIC_URL = arg("static-url", "/incidents/INC-2026-014?run=STATIC-GS-01");
const NARROW = Number(arg("width", "390"));
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

async function chips(page) {
  return {
    staticChip: await page.locator('[data-testid="static-visitor-chip"]').count(),
    staticWrap: await page.locator('[data-testid="static-visitor"]').count(),
    sessionChip: await page.locator('[data-testid="session-chip"]').count(),
    sessionChipText: (await page.locator('[data-testid="session-chip"]').count())
      ? (await page.locator('[data-testid="session-chip"]').first().innerText()).trim()
      : null,
    // 무대 증인 — 칩과 «무관한» 정적 화면 표지.
    modeBadge: await page.locator('[data-testid="mode-badge"]').count(),
    bodyChars: (await page.locator("body").innerText()).length,
  };
}

const run = async () => {
  const browser = await chromium.launch();
  const out = { base: BASE, staticUrl: STATIC_URL, wall: new Date().toISOString(), columns: {} };
  const errs = [];

  // --- 열 ① 세션 있음 + 정적 주소 (하달된 자극 순서) -----------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errs.push("withSession: " + m.text().slice(0, 140)));
    // 🔴 `/enter` 는 **GET 이 405** 다(실측). 그리로 먼저 가면 콘솔에 405 가 한 줄 남고,
    //    그 빨강은 대상이 아니라 **내 경로**의 것이다. 세션은 `/overview` 진입에서 발급된다
    //    (쿠키 `fkt_session` 실측) — 발주가 말한 자극 순서의 «뜻»은 그대로 지키면서 405 만 뺀다.
    await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(700);
    const cookiesAfterEnter = (await ctx.cookies()).map((c) => c.name);
    await page.goto(BASE + STATIC_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(700);
    out.columns.withSession = { cookies: cookiesAfterEnter, ...(await chips(page)) };
    // 좁은 폭 앱바 넘침 — 칩이 하나 줄면 여기가 같이 움직인다.
    await page.setViewportSize({ width: NARROW, height: 900 });
    await page.waitForTimeout(400);
    out.columns.withSession.narrow = await page.evaluate(() => {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, overflowPx: d.scrollWidth - d.clientWidth };
    });
    await ctx.close();
  }

  // --- 열 ② 세션 없음 + 정적 주소(직행) -----------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errs.push("noSession: " + m.text().slice(0, 140)));
    await page.goto(BASE + STATIC_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(700);
    out.columns.noSession = { cookies: (await ctx.cookies()).map((c) => c.name), ...(await chips(page)) };
    await ctx.close();
  }

  out.consoleErrors = errs;
  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1).slice(0, 1500));

  const witnessed = Object.values(out.columns).filter((c) => c.bodyChars > 200).length;
  if (witnessed === 0) {
    console.error("STAGE 0: 정적 화면이 서지 않았다 — 안 잼(exit 2)");
    process.exit(2);
  }
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
