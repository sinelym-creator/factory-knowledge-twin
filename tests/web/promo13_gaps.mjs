/**
 * 승격 13 재검 — 1차에서 «못 잰» 두 칸만 다시 세운다.
 *
 * ⓔ D-67 카드 390: 1차는 **같은 컨텍스트를 재사용해 투어 상태가 이미 오염**돼 초대 카드가
 *    서지 않았다(`present:false` = 못 잼). 여기서는 **새 컨텍스트**로 연다.
 * ⓒ② 「이 조사로 돌아가기」·「이어보기」: 1차는 클릭 뒤 1.5초만 기다려 **URL 이 그대로**였다.
 *    이동을 «기다려» 잰다(`waitForURL`), 그리고 기다린 시간을 값으로 남긴다.
 *
 * usage: node promo13_gaps.mjs --base https://… --out o.json [--engine webkit]
 */
import { chromium, webkit } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
const ENGINE = arg("engine", "webkit");
if (!OUT) {
  console.error("--out 은 필수다");
  process.exit(9);
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

const run = async () => {
  const launcher = ENGINE === "webkit" ? webkit : chromium;
  const browser = await launcher.launch();
  const out = { base: BASE, engine: ENGINE, wall: new Date().toISOString() };

  // --- ⓔ 새 컨텍스트 · 390 ------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(1500);
    const c = p.locator('[aria-label="안내 닫기"]');
    if (await c.count()) {
      await c.first().click().catch(() => {});
      await p.waitForTimeout(800);
    }
    out.e_invite_390 = await measureCard(p);
    // resume 변형
    const start = p.locator('[data-testid="tour-start"]');
    if (await start.count()) {
      await start.first().click().catch(() => {});
      await p.waitForTimeout(1200);
      for (let k = 0; k < 2; k++) {
        const nx = p.locator('[data-testid="tour-next"]');
        if (await nx.count()) {
          await nx.first().click().catch(() => {});
          await p.waitForTimeout(700);
        }
      }
      const skip = p.locator('[data-testid="tour-skip"]');
      if (await skip.count()) {
        await skip.first().click().catch(() => {});
        await p.waitForTimeout(700);
      }
      await p.reload({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1500);
      const c2 = p.locator('[aria-label="안내 닫기"]');
      if (await c2.count()) {
        await c2.first().click().catch(() => {});
        await p.waitForTimeout(800);
      }
    }
    out.e_resume_390 = await measureCard(p);
    await ctx.close();
  }

  // --- ⓒ② 두 링크의 «도달» --------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 120)));
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(1500);
    const close = async () => {
      const c = p.locator('[aria-label="안내 닫기"]');
      if (await c.count()) {
        await c.first().click().catch(() => {});
        await p.waitForTimeout(600);
      }
    };
    await close();
    const later = p.locator('[data-testid="tour-later"]');
    if (await later.count()) {
      await later.first().click().catch(() => {});
      await p.waitForTimeout(700);
    }
    const c2 = { startCount: await p.locator('[data-testid="start-from-alarm"]').count() };
    if (c2.startCount > 0) {
      await p.locator('[data-testid="start-from-alarm"]').first().click();
      await p.waitForLoadState("domcontentloaded");
      await p.waitForTimeout(7000);
      c2.runUrl = p.url();
      c2.runId = decodeURIComponent((c2.runUrl.match(/run=([^&]+)/) || [])[1] ?? "") || null;

      const ev = p.locator('a[href*="/evidence/"]').first();
      if (await ev.count()) {
        await ev.click();
        await p.waitForLoadState("domcontentloaded");
        await p.waitForTimeout(2000);
        c2.evidenceUrl = p.url();
        const back = p.locator('[data-testid="evidence-back-to-run"]');
        c2.backHref = (await back.count()) ? await back.first().getAttribute("href") : null;
        if (await back.count()) {
          const t0 = Date.now();
          await back.first().click();
          try {
            // 🔴 «이동을 기다린다» — 1.5초 고정 대기로는 SPA 전환이 끝나기 전에 URL 을 읽는다.
            await p.waitForURL(/\/incidents\//, { timeout: 15000 });
            c2.backMs = Date.now() - t0;
          } catch {
            c2.backMs = null;
          }
          c2.backLanded = p.url();
          c2.backSameRun = c2.runId ? c2.backLanded.includes(c2.runId) : null;
        }
      }

      await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(2000);
      await close();
      const resume = p.locator('[data-testid="overview-resume"]');
      c2.resumePresent = await resume.count();
      if (c2.resumePresent > 0) {
        c2.resumeText = (await resume.innerText()).replace(/\s+/g, " ").trim();
        const link = resume.locator("a").first();
        c2.resumeHref = (await link.count()) ? await link.getAttribute("href") : null;
        if (await link.count()) {
          const t1 = Date.now();
          await link.click();
          try {
            await p.waitForURL(/\/incidents\//, { timeout: 15000 });
            c2.resumeMs = Date.now() - t1;
          } catch {
            c2.resumeMs = null;
          }
          c2.resumeLanded = p.url();
          c2.resumeSameRun = c2.runId ? c2.resumeLanded.includes(c2.runId) : null;
        }
      }
    }
    c2.consoleErrors = errs;
    out.c2_links = c2;
    await ctx.close();
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1).slice(0, 2000));
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
