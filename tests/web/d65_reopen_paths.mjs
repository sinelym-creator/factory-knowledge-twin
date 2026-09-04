/**
 * D-65 + D-66 그물 — 「튜토리얼」이 매번 안내를 열고, 투어 중에도 눌리는가.
 *
 * 🔴 **6회 반복이 축이다** — D-65 의 진범은 「URL 이동이 간헐적으로 안 난다」였다.
 *    한 번 눌러 초록이면 그 회차가 «이동이 난» 회차였을 뿐이다. 회차마다 URL 변화도 함께 찍어
 *    「이동 없이도 열렸는가」를 가른다.
 * 🔴 **막힘은 «클릭»으로 잰다** — 보이는지·닿는지가 아니라 실제로 눌리는지가 축이다.
 *    Playwright 의 클릭이 intercept 로 실패하면 그 사실을 값으로 남긴다(예외를 삼키지 않는다).
 * 🔴 무대 울림 = 앱바 버튼과 투어가 실제로 선 회차 수. 0 이면 어느 색도 내지 않는다.
 *
 * usage: node d65_reopen_paths.mjs --base http://127.0.0.1:8180 --out C:/…/o.json [--rounds 6]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base");
const OUT = arg("out");
const ROUNDS = Number(arg("rounds", "6"));
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

const S = {
  reopen: '[data-testid="intro-reopen"]',
  intro: '[data-testid="intro-card"]',
  // 🔴 `tour-overlay` 라는 testid 는 **없다**(44대 1차 실측: 그 셀렉터로 6/6 «투어 0» 이 나왔고,
  //    그건 대상이 아니라 내 오답이었다). 실제 표지는 초대(`tour-invite`)와 진행(`tour-spotlight`/
  //    `tour-callout`) 이다.
  tourAny: '[data-testid="tour-invite"], [data-testid="tour-spotlight"], [data-testid="tour-callout"]',
  tourRunning: '[data-testid="tour-spotlight"], [data-testid="tour-callout"]',
  tourStart: '[data-testid="tour-start"]',
  close: '[aria-label="안내 닫기"]',
};

async function closeIntro(page) {
  const c = page.locator(S.close);
  if (await c.count()) {
    await c.first().click().catch(() => {});
    await page.waitForTimeout(350);
  }
}

/** 클릭을 «시도»하고 무엇이 막았는지까지 남긴다. */
async function tryClick(locator, timeout = 3000) {
  try {
    await locator.click({ timeout });
    return { clicked: true, blockedBy: null };
  } catch (e) {
    const msg = String(e).replace(/\s+/g, " ");
    const m = msg.match(/<([^>]{0,80})>\s*intercepts pointer events/);
    return { clicked: false, blockedBy: m ? m[1] : msg.slice(0, 160) };
  }
}

const run = async () => {
  const browser = await chromium.launch();
  const out = { base: BASE, wall: new Date().toISOString(), widths: {} };

  for (const width of [390, 1280, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(`${width}: ` + m.text().slice(0, 140)));
    page.on("pageerror", (e) => errs.push(`${width} pageerror: ` + String(e).slice(0, 140)));

    await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(700);

    const w = { rounds: [], consoleErrors: errs };
    w.reopenPresent = (await page.locator(S.reopen).count()) > 0;
    if (!w.reopenPresent) {
      out.widths[String(width)] = w;
      await ctx.close();
      continue;
    }

    // --- D-65: 6회 반복 · 「이동 여부와 무관하게」 안내가 열리는가 ------------
    for (let i = 0; i < ROUNDS; i++) {
      await closeIntro(page);
      const before = { url: page.url(), intro: await page.locator(S.intro).count(), tour: await page.locator(S.tourAny).count() };
      const click = await tryClick(page.locator(S.reopen));
      await page.waitForTimeout(900);
      const after = { url: page.url(), intro: await page.locator(S.intro).count(), tour: await page.locator(S.tourAny).count() };
      w.rounds.push({
        i,
        click,
        urlChanged: before.url !== after.url,
        introBefore: before.intro,
        introAfter: after.intro,
        tourAfter: after.tour,
        // 🔴 판정은 «전이»다: 닫힌 0 에서 1 로.
        introOpened: before.intro === 0 && after.intro > 0,
      });
    }
    w.introOpenedCount = w.rounds.filter((r) => r.introOpened).length;
    w.tourOpenedCount = w.rounds.filter((r) => r.tourAfter > 0).length;
    w.urlMovedCount = w.rounds.filter((r) => r.urlChanged).length;

    // --- D-66: 투어가 열린 «동안» 앱바 버튼이 눌리는가 ----------------------
    //     안내 카드를 닫아 허용 노드를 0 으로 만든 상태가 그 결함의 조건이었다.
    // 🔴 조건을 «세운다» — 투어를 실제로 시작(초대 → 시작)하고 안내를 닫아야
    //    허용 노드 0 인 그 상태가 된다. 안 세우고 재면 초록은 판정력이 없다.
    const startBtn = page.locator(S.tourStart);
    const d66 = { tourStartPresent: await startBtn.count() };
    if (d66.tourStartPresent > 0) {
      await startBtn.first().click().catch(() => {});
      await page.waitForTimeout(900);
    }
    d66.tourRunning = await page.locator(S.tourRunning).count();
    await closeIntro(page);
    d66.tourOpenBeforeClick = await page.locator(S.tourAny).count();
    d66.introBefore = await page.locator(S.intro).count();
    const c2 = await tryClick(page.locator(S.reopen));
    await page.waitForTimeout(900);
    d66.click = c2;
    d66.introAfter = await page.locator(S.intro).count();
    d66.reopenedWhileTourOpen = d66.tourOpenBeforeClick > 0 && c2.clicked && d66.introAfter > 0;

    // 키보드 도달 — `inert` 는 포인터만이 아니라 포커스도 막는다.
    let tabs = 0;
    let focused = false;
    while (tabs < 25 && !focused) {
      await page.keyboard.press("Tab");
      tabs += 1;
      focused = await page.evaluate(
        () => document.activeElement?.getAttribute?.("data-testid") === "intro-reopen"
      );
    }
    d66.keyboardReachable = focused;
    d66.tabsToReach = focused ? tabs : null;
    w.d66 = d66;

    // 새로고침 뒤 닫힘 유지(⑤) — 다시 열리면 「기억」이 깨진 것이다.
    await closeIntro(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    w.afterReload = {
      intro: await page.locator(S.intro).count(),
      tour: await page.locator(S.tourAny).count(),
    };

    out.widths[String(width)] = w;
    await ctx.close();
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  const brief = Object.fromEntries(
    Object.entries(out.widths).map(([k, v]) => [
      k,
      {
        introOpened: `${v.introOpenedCount ?? 0}/${ROUNDS}`,
        tourOpened: `${v.tourOpenedCount ?? 0}/${ROUNDS}`,
        urlMoved: `${v.urlMovedCount ?? 0}/${ROUNDS}`,
        d66Click: v.d66?.click,
        d66Reopened: v.d66?.reopenedWhileTourOpen,
        keyboard: v.d66?.keyboardReachable,
        afterReload: v.afterReload,
        consoleErrors: v.consoleErrors?.length ?? 0,
      },
    ])
  );
  console.log(JSON.stringify(brief, null, 1));
  const witnessed = Object.values(out.widths).filter((v) => v.reopenPresent).length;
  if (witnessed === 0) {
    console.error("STAGE 0: 앱바 버튼이 한 번도 서지 않았다 — 안 잼(exit 2)");
    process.exit(2);
  }
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
