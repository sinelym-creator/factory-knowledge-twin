/**
 * T7-41b 축 ⑤ — `GET /runs` 가 «못 답하는» 회차의 화면(구현이 안 잰 축).
 *
 * 🔴 `fetchSessionRuns` 는 서버 컴포넌트라 브라우저 가로채기로 401/503 을 못 만든다.
 *    그래서 **서버를 실제로 흔든다**: ① ai-api 정지 = 연결 실패 ② 재기동 = 옛 세션 401.
 *    이 스크립트는 «화면만» 연다 — 흔드는 일은 셸 쪽에서 하고, 여기선 그 순간을 찍는다.
 * 🔴 판정선은 「빈 화면이 아니다 + 지어낸 조사 0」이다. 0건 자체는 결함이 아니다.
 *
 * usage: node t41b_degraded_screen.mjs --base http://127.0.0.1:8166 --out C:/…/o.json --label api-down
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base");
const OUT = arg("out");
const LABEL = arg("label", "unlabeled");
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

const STATE_IN = arg("state-in", null);
const STATE_OUT = arg("state-out", null);

const run = async () => {
  const browser = await chromium.launch();
  // 🔴 401 축은 «옛 쿠키»가 있어야 선다 — 서버를 재기동하는 사이 브라우저 상태를 파일로 옮긴다.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(STATE_IN ? { storageState: STATE_IN } : {}),
  });
  if (STATE_OUT) {
    // 세션을 «화면 흐름»으로 받는다(셸이 자기 쿠키를 발급한다).
    const p = await ctx.newPage();
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForTimeout(800);
    // 🔴 run 이 «있는» 세션으로 만들어 둔다 — 0건 상태에서 서버를 흔들면 기준선과 down 회차가
    //    같은 화면이라 판정력이 없다(둘 다 「0건」). 있어야 할 것이 안 지어지는지를 봐야 한다.
    const intro = p.locator('[aria-label="안내 닫기"]');
    if (await intro.count()) {
      await intro.first().click();
      await p.waitForTimeout(300);
    }
    const start = p.locator('[data-testid="start-from-alarm"]');
    if (await start.count()) {
      await start.first().click();
      await p.waitForLoadState("domcontentloaded");
      await p.waitForTimeout(2500);
    }
    await p.close();
    await ctx.storageState({ path: STATE_OUT });
  }
  const errs = [];
  const out = { base: BASE, label: LABEL, wall: new Date().toISOString(), screens: {} };

  for (const route of ["/overview", "/incidents"]) {
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errs.push(route + ": " + m.text().slice(0, 140)));
    page.on("pageerror", (e) => errs.push(route + " pageerror: " + String(e).slice(0, 140)));
    let status = null;
    try {
      const res = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = res ? res.status() : null;
    } catch (e) {
      status = "goto-failed: " + String(e).slice(0, 80);
    }
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText().catch(() => "");
    out.screens[route] = {
      status,
      bodyChars: body.length,
      // 「빈 화면이 아니다」의 증인 — 셸의 뼈대가 서 있는가.
      appShell: await page.locator('[data-testid="mode-badge"], [data-testid="session-chip"]').count(),
      sessionRunsList: await page.locator('[data-testid="session-runs"]').count(),
      sessionRunLinks: await page.locator('[data-testid="session-run-link"]').count(),
      emptyMarker: await page.locator('[data-testid="session-runs-empty"]').count(),
      overviewResume: await page.locator('[data-testid="overview-resume"]').count(),
      head: body.slice(0, 220).replace(/\s+/g, " "),
    };
    await page.close();
  }

  out.consoleErrors = errs;
  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1).slice(0, 1600));
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
