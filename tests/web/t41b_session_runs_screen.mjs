/**
 * T7-41b 화면 축 그물 — 「이 세션의 조사」가 서버에서 오는가(계약 v0.1.16 판정선 ⑤).
 *
 * 🔴 두 세계에 같은 코드로 건다: 대상(#632 `5a95a51`) · 대조군(`61c48a7`). 두 셸 모두 **같은
 *    ai-api**(`:8152` = T7-41a 코드)를 본다 — 바뀌는 손잡이는 셸 빌드 하나뿐이다.
 * 🔴 무대 울림을 수로 먼저: 세션·run 이 안 서면 어느 색도 내지 않고 exit 2.
 * 🔴 `fetchSessionRuns` 는 **서버 컴포넌트**다 — 브라우저 route 가로채기로는 401/503 을 만들 수
 *    없다(그 요청은 브라우저를 지나지 않는다). 그 축은 서버를 실제로 흔드는 별도 단계로 잰다.
 *
 * usage: node t41b_session_runs_screen.mjs --base http://127.0.0.1:8166 --out C:/…/out.json
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base");
const OUT = arg("out");
const NARROW = Number(arg("width", "390"));
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  ctx.on("weberror", (e) => errs.push(String(e.error()).slice(0, 160)));
  const out = { base: BASE, wall: new Date().toISOString() };

  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));

  // --- 무대: run 을 «화면 흐름»으로 만든다 ---------------------------------
  // 🔴 내가 `fetch('/api/sessions')` 로 세션을 만들면 그 run 은 **화면의 것이 아니다** —
  //    셸은 자기 `fkt_session` 쿠키를 쓴다. 44대 1차 실측이 정확히 그 함정에 빠져
  //    「목록 0건 · 링크 0건」을 대상 결함처럼 보이게 했다. 그래서 알람의 「조사 시작」을 «누른다».
  // 🔴 live 가 아니라 무대의 모드를 따른다(이 무대는 게이트웨이 미도달 = REPLAY · 구독 0).
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(700);
  const intro = page.locator('[aria-label="안내 닫기"]');
  if (await intro.count()) {
    await intro.first().click();
    await page.waitForTimeout(400);
  }
  const start = page.locator('[data-testid="start-from-alarm"]');
  const seed = { startCount: await start.count() };
  if (seed.startCount > 0) {
    await start.first().click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500);
    seed.landed = page.url();
    const m = seed.landed.match(/run=([^&]+)/);
    seed.runId = m ? decodeURIComponent(m[1]) : null;
    const im = seed.landed.match(/incidents\/([^/?]+)/);
    seed.incidentId = im ? decodeURIComponent(im[1]) : null;
    seed.step = seed.runId ? "ok" : "no-run-in-url";
  } else {
    seed.step = "no-start-control";
  }
  out.seed = seed;
  if (seed.step !== "ok") {
    writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
    console.error("STAGE 0: 화면 흐름으로 run 을 못 만들었다 — 안 잼(exit 2)");
    process.exit(2);
  }
  const runId = seed.runId;
  const incidentId = seed.incidentId;

  // 🔴 `sessionStorage` 는 **탭 단위**다 — 다른 탭에서 재면 어느 세계든 0 이 나와
  //    「안 쓴다」가 공짜로 초록이 된다. run 을 만든 «그 탭»에서 센다.
  out.ax3_seedTabStorage = await page.evaluate(() => {
    try {
      return Object.keys(window.sessionStorage);
    } catch {
      return ["<접근 불가>"];
    }
  });

  // --- 축 ② 「다른 탭」에서 같은 목록 --------------------------------------
  //     같은 컨텍스트의 «새 페이지» = 같은 쿠키·다른 탭. 앞판이 실패하던 자리다.
  const tab2 = await ctx.newPage();
  await tab2.goto(`${BASE}/incidents`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await tab2.waitForTimeout(500);
  const listCount = await tab2.locator('[data-testid="session-run-link"]').count();
  out.ax2_otherTab = {
    sessionRunsPresent: (await tab2.locator('[data-testid="session-runs"]').count()) > 0,
    emptyMarker: await tab2.locator('[data-testid="session-runs-empty"]').count(),
    linkCount: listCount,
    hasMyRun: false,
    // 🔴 목록이 «내» run 을 말하는가 — 개수만 같고 남의 것이면 안 된다.
    hrefs: await tab2.locator('[data-testid="session-run-link"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute("href"))
    ),
  };
  // 🔴 개수만 같고 «남의» run 이면 안 된다 — 내가 만든 run 이 그 목록에 있는지로 본다.
  out.ax2_otherTab.hasMyRun = out.ax2_otherTab.hrefs.some((h) => h && h.includes(runId));

  // --- 축 ④ 알람 행 「상황 보기」 ------------------------------------------
  const alarmLink = tab2.locator('[data-testid="alarm-incident-link"]');
  out.ax4_alarmLink = {
    count: await alarmLink.count(),
    text: (await alarmLink.count()) ? (await alarmLink.first().innerText()).trim() : null,
    href: (await alarmLink.count()) ? await alarmLink.first().getAttribute("href") : null,
    incidentAttr: (await alarmLink.count()) ? await alarmLink.first().getAttribute("data-incident") : null,
  };
  await tab2.close();

  // --- 축 ①a 조사 → 근거 → 「이 조사로 돌아가기」 → 같은 조사 --------------
  const evPage = await ctx.newPage();
  evPage.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));
  await evPage.goto(`${BASE}/evidence/${encodeURIComponent("EQ-CNC-204")}?run=${encodeURIComponent(runId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const back = evPage.locator('[data-testid="evidence-back-to-run"]');
  const a1 = { linkCount: await back.count(), href: null, landed: null, sameRun: false };
  if (a1.linkCount > 0) {
    a1.href = await back.first().getAttribute("href");
    await back.first().click();
    await evPage.waitForLoadState("domcontentloaded");
    await evPage.waitForTimeout(700);
    a1.landed = evPage.url();
    a1.sameRun = a1.landed.includes(encodeURIComponent(runId)) || a1.landed.includes(runId);
  }
  out.ax1a_backToRun = a1;
  await evPage.close();

  // --- 축 ①b Overview 「이 세션의 조사 N건 · 이어보기」 → 같은 조사 --------
  const ovPage = await ctx.newPage();
  ovPage.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));
  await ovPage.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ovPage.waitForTimeout(600);
  const resume = ovPage.locator('[data-testid="overview-resume"]');
  const b1 = { present: (await resume.count()) > 0, text: null, landed: null, sameRun: false };
  if (b1.present) {
    b1.text = (await resume.innerText()).replace(/\s+/g, " ").trim();
    const link = resume.locator("a").first();
    b1.href = (await link.count()) ? await link.getAttribute("href") : null;
    if (await link.count()) {
      await link.click();
      await ovPage.waitForLoadState("domcontentloaded");
      await ovPage.waitForTimeout(700);
      b1.landed = ovPage.url();
      b1.sameRun = b1.landed.includes(runId) || b1.landed.includes(encodeURIComponent(runId));
      b1.sameIncident = incidentId ? b1.landed.includes(incidentId) : null;
    }
  }
  out.ax1b_overviewResume = b1;

  // --- 축 ③ 런타임 sessionStorage — 화면이 실제로 적는 키 ------------------
  out.ax3_sessionStorageKeys = await ovPage.evaluate(() => {
    try {
      return Object.keys(window.sessionStorage);
    } catch {
      return ["<접근 불가>"];
    }
  });
  await ovPage.close();

  // --- 축 ⑥ 390 넘침 · 콘솔 ------------------------------------------------
  const narrow = await ctx.newPage();
  narrow.on("console", (m) => m.type() === "error" && errs.push("narrow: " + m.text().slice(0, 160)));
  await narrow.setViewportSize({ width: NARROW, height: 900 });
  const widths = {};
  for (const route of ["/overview", "/incidents"]) {
    await narrow.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
    await narrow.waitForTimeout(400);
    widths[route] = await narrow.evaluate(() => {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, overflowPx: d.scrollWidth - d.clientWidth };
    });
  }
  out.ax6_narrow = widths;
  await narrow.close();

  out.consoleErrors = errs;
  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1).slice(0, 2200));
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
