/**
 * 승격 13 공개면 재검 — 폐하 경로 3건 · 칩 · D-67 카드 · 콘솔 · 캡처.
 *
 * 🔴 **공개면이다** — 연결 IP 를 함께 남긴다(「밖에서 들어갔다」의 근거는 주소가 아니라 IP).
 * 🔴 **live 조사는 «한 번»만 태운다**(공개면 cap 5 · 구독 소모). 폐하 경로 ②가 그것을 요구한다.
 * 🔴 무대 울림 = 각 축이 실제로 선 회차. 0 이면 그 축은 「못 잼」이지 초록이 아니다.
 *
 * usage: node promo13_external.mjs --base https://… --out o.json --shots C:/dir [--engine webkit]
 */
import { chromium, webkit } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
const SHOTS = arg("shots");
const ENGINE = arg("engine", "chromium");
if (!OUT) {
  console.error("--out 은 필수다");
  process.exit(9);
}

const STATIC_URL = "/incidents/INC-2026-014?run=STATIC-GS-01";

const run = async () => {
  const launcher = ENGINE === "webkit" ? webkit : chromium;
  const browser = await launcher.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  const out = { base: BASE, engine: ENGINE, wall: new Date().toISOString() };

  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // WS 404 는 공개면의 기지 사항(발주 문면) — 제외하되 «셌다»는 사실을 남긴다.
    if (/ws|websocket|404/i.test(t)) errs.push({ excluded: true, text: t.slice(0, 120) });
    else errs.push({ excluded: false, text: t.slice(0, 160) });
  });
  page.on("pageerror", (e) => errs.push({ excluded: false, text: "pageerror: " + String(e).slice(0, 160) }));

  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  // --- ⓒ① 「튜토리얼」 → 안내 카드 · 투어 --------------------------------
  const closeIntro = async () => {
    const c = page.locator('[aria-label="안내 닫기"]');
    if (await c.count()) {
      await c.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  };
  await closeIntro();
  const introBefore = await page.locator('[data-testid="intro-card"]').count();
  await page.locator('[data-testid="intro-reopen"]').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  out.c1_tutorial = {
    introBefore,
    introAfter: await page.locator('[data-testid="intro-card"]').count(),
    tourAfter: await page.locator('[data-testid="tour-invite"], [data-testid="tour-spotlight"], [data-testid="tour-callout"]').count(),
  };
  out.c1_tutorial.opened = introBefore === 0 && out.c1_tutorial.introAfter > 0;

  // --- ⓔ D-67 카드(초대) 390 -------------------------------------------
  const narrow = await ctx.newPage();
  await narrow.setViewportSize({ width: 390, height: 900 });
  await narrow.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await narrow.waitForTimeout(1200);
  const nClose = narrow.locator('[aria-label="안내 닫기"]');
  if (await nClose.count()) {
    await nClose.first().click().catch(() => {});
    await narrow.waitForTimeout(600);
  }
  const measureCard = async (p) => {
    const inv = p.locator('[data-testid="tour-invite"]');
    if (!(await inv.count())) return { present: false };
    return await inv.first().evaluate((el) => {
      const body = el.querySelector("div");
      const r = el.getBoundingClientRect();
      const br = body.getBoundingClientRect();
      return {
        present: true,
        cardWidth: +r.width.toFixed(1),
        bodyWidth: +br.width.toFixed(1),
        ratio: +(br.width / r.width).toFixed(3),
        dir: getComputedStyle(el).flexDirection,
        startText: el.querySelector('[data-testid="tour-start"]')?.textContent?.trim() ?? null,
      };
    });
  };
  out.e_d67_invite_390 = await measureCard(narrow);
  // resume 변형 — 시작 → 걸음 2 → skip → 새로고침
  const start = narrow.locator('[data-testid="tour-start"]');
  if (await start.count()) {
    await start.first().click().catch(() => {});
    await narrow.waitForTimeout(900);
    for (let k = 0; k < 2; k++) {
      const nx = narrow.locator('[data-testid="tour-next"]');
      if (await nx.count()) {
        await nx.first().click().catch(() => {});
        await narrow.waitForTimeout(600);
      }
    }
    const skip = narrow.locator('[data-testid="tour-skip"]');
    if (await skip.count()) {
      await skip.first().click().catch(() => {});
      await narrow.waitForTimeout(600);
    }
    await narrow.reload({ waitUntil: "domcontentloaded" });
    await narrow.waitForTimeout(1200);
    const c3 = narrow.locator('[aria-label="안내 닫기"]');
    if (await c3.count()) {
      await c3.first().click().catch(() => {});
      await narrow.waitForTimeout(600);
    }
  }
  out.e_d67_resume_390 = await measureCard(narrow);
  await narrow.close();

  // --- ⓓ 정적 주소 + 세션 = 칩 1개 --------------------------------------
  const st = await ctx.newPage();
  await st.goto(BASE + STATIC_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await st.waitForTimeout(1200);
  out.d_chips = {
    staticChip: await st.locator('[data-testid="static-visitor-chip"]').count(),
    sessionChip: await st.locator('[data-testid="session-chip"]').count(),
  };
  await st.close();

  // --- ⓒ② 조사 시작 → 근거 → 돌아가기 / Overview 이어보기 --------------
  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  // 🔴 **투어를 먼저 닫는다** — ⓒ① 에서 열어 둔 투어가 살아 있으면 알람의 「조사 시작」이
  //    오버레이에 intercept 된다(1차 회차 크래시). 그 잠김은 규격 §⑧-7 대로이며 대상 결함이
  //    아니다 — 다만 이 축의 무대가 아니므로 걷어낸다.
  const skipNow = page.locator('[data-testid="tour-skip"]');
  if (await skipNow.count()) {
    await skipNow.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
  const later = page.locator('[data-testid="tour-later"]');
  if (await later.count()) {
    await later.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
  await closeIntro();
  const c2 = {
    tourStillOpen: await page.locator('[data-testid="tour-invite"], [data-testid="tour-spotlight"], [data-testid="tour-callout"]').count(),
    startCount: await page.locator('[data-testid="start-from-alarm"]').count(),
  };
  if (c2.startCount > 0) {
    await page.locator('[data-testid="start-from-alarm"]').first().click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(6000); // live 조사 — 완주를 기다린다
    c2.landed = page.url();
    c2.runId = (c2.landed.match(/run=([^&]+)/) || [])[1] ?? null;
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fkt-run-replay-1600-v3.png` });
    // 근거로 들어간다 — 화면이 주는 첫 근거 링크
    const evLink = page.locator('a[href*="/evidence/"]').first();
    c2.evidenceLinks = await page.locator('a[href*="/evidence/"]').count();
    if (c2.evidenceLinks > 0) {
      await evLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      c2.evidenceUrl = page.url();
      c2.breadcrumb = (await page.locator('[data-testid="evidence-breadcrumb"]').count())
        ? (await page.locator('[data-testid="evidence-breadcrumb"]').innerText()).replace(/\s+/g, " ").trim()
        : null;
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/fkt-evidence-1600-v3.png` });
      // ⓒ③ 근거 재진입 배지 — 「미연결」이 아니라 「확인 중」/정상 배지인가
      const badgeSamples = [];
      for (let i = 0; i < 6; i++) {
        const b = (await page.locator('[data-testid="mode-badge"]').count())
          ? (await page.locator('[data-testid="mode-badge"]').first().innerText()).replace(/\s+/g, " ").trim()
          : null;
        badgeSamples.push(b);
        await page.waitForTimeout(700);
      }
      c2.badgeOnEvidence = badgeSamples;
      c2.everUnavailableOnEvidence = badgeSamples.some((x) => (x || "").includes("미연결"));
      // 「이 조사로 돌아가기」
      const back = page.locator('[data-testid="evidence-back-to-run"]');
      c2.backLink = await back.count();
      if (c2.backLink > 0) {
        await back.first().click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1500);
        c2.backLanded = page.url();
        c2.backSameRun = c2.runId ? c2.backLanded.includes(c2.runId) : null;
      }
    }
    // Overview 이어보기
    await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await closeIntro();
    const resume = page.locator('[data-testid="overview-resume"]');
    c2.resumePresent = await resume.count();
    if (c2.resumePresent > 0) {
      c2.resumeText = (await resume.innerText()).replace(/\s+/g, " ").trim();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/fkt-overview-1600-v3.png` });
      const link = resume.locator("a").first();
      if (await link.count()) {
        await link.click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1500);
        c2.resumeLanded = page.url();
        c2.resumeSameRun = c2.runId ? c2.resumeLanded.includes(c2.runId) : null;
      }
    }
  }
  out.c2_investigation = c2;

  out.consoleErrors = errs;
  out.consoleErrorsExcludedWs = errs.filter((e) => e.excluded).length;
  out.consoleErrorsReal = errs.filter((e) => !e.excluded).length;

  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1).slice(0, 2600));
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
