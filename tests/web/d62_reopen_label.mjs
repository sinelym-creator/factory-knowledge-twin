/**
 * D-62 앱바 「튜토리얼」 그물 — 라벨·title·클릭 도달·좁은 폭 넘침.
 *
 * 🔴 두 세계에 같은 코드로 건다: 대상(#629 `409e1ed`) · 대조군(`1506f32`).
 *    대조군은 아이콘(`?`)에 `sr-only` 라벨이라 문면 축이 갈린다 — 그 «다름»이 판정력이다.
 * 🔴 넘침은 리터럴이 아니라 그 화면이 그 순간 낸 `scrollWidth`/`clientWidth` 로 잰다.
 * 🔴 「클릭했다」와 「열렸다」는 다른 사실이라 클릭 «후»의 오버레이 존재를 따로 센다.
 *
 * usage: node d62_reopen_label.mjs --base http://127.0.0.1:8162 --out C:/…/out.json [--width 390]
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
  const out = { base: BASE, wall: new Date().toISOString(), widths: {} };

  for (const width of [NARROW, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));

    const res = await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(600);
    const btn = page.locator('[data-testid="intro-reopen"]');
    const w = { status: res ? res.status() : null, consoleErrors: errs, present: (await btn.count()) > 0 };

    if (w.present) {
      w.visibleText = (await btn.innerText()).trim();
      w.title = await btn.getAttribute("title");
      w.ariaLabel = await btn.getAttribute("aria-label");
      w.srOnlyCount = await btn.locator(".sr-only").count();
      w.accName = await btn.evaluate((e) => (e.textContent || "").replace(/\s+/g, " ").trim());
      w.box = await btn.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      });
      // 🔴 앱바 넘침 — 버튼이 아니라 «그 버튼을 담은 가로 줄»이 넘치는지를 본다.
      w.overflow = await btn.evaluate((e) => {
        const bar = e.closest("header") || e.parentElement;
        const doc = document.documentElement;
        return {
          barScrollWidth: bar ? bar.scrollWidth : null,
          barClientWidth: bar ? bar.clientWidth : null,
          docScrollWidth: doc.scrollWidth,
          docClientWidth: doc.clientWidth,
        };
      });
      w.overflowPx = w.overflow.docScrollWidth - w.overflow.docClientWidth;
      w.noOverflow = w.overflowPx <= 0;

      // 클릭 → 투어가 «열렸는가».
      // 🔴 첫 방문이면 인트로가 **이미 떠 있다** — 그 상태에서 클릭 후 개수를 세면
      //    「내가 열었다」와 「원래 떠 있었다」가 같은 1 로 보인다(44대 1차 실측이 그랬다).
      //    그래서 «먼저 닫아» 0 을 만들고, 그 0 에서 1 이 되는 것을 잰다.
      const overlay = page.locator('[data-testid="tour-overlay"], [data-testid="intro-card"]');
      w.overlayOnArrival = await overlay.count();
      if (w.overlayOnArrival > 0) {
        // 🔴 닫기 손잡이는 화면이 쓰는 것을 그대로 쓴다(`aria-label="안내 닫기"`).
        //    Escape 로는 안 닫힌다 — 44대 2차 실측(`closedFirst:false`가 그 증거였다).
        const close = page.locator('[aria-label="안내 닫기"]');
        w.closeControlCount = await close.count();
        if (w.closeControlCount > 0) {
          await close.first().click();
          await page.waitForTimeout(600);
        }
      }
      w.overlayBefore = await overlay.count();
      w.closedFirst = w.overlayBefore === 0;
      // 🔴 고정 대기(900ms)로 읽으면 **같은 조건에서 3회 중 1회만 초록**이었다(44대 실측).
      //    「안 열렸다」가 아니라 「내가 일찍 봤다」였다. 기다리되 **기다린 시간을 값으로 남긴다** —
      //    그래야 「열린다」와 「얼마나 늦게 열리는가」가 한 줄에서 갈린다.
      const t0 = Date.now();
      await btn.click();
      try {
        await overlay.first().waitFor({ state: "attached", timeout: 5000 });
        w.openLatencyMs = Date.now() - t0;
      } catch {
        w.openLatencyMs = null; // 5초 안에 안 떴다 = 이 창에서는 «안 열림»
      }
      w.overlayAfter = await overlay.count();
      // 🔴 판정은 «전이»다 — 0 → 1 이어야 이 버튼이 연 것이다.
      w.opened = w.closedFirst && w.overlayAfter > 0;
      w.openedText = w.overlayAfter > 0
        ? (await page.locator('[data-testid="tour-overlay"], [data-testid="intro-card"]').first().innerText())
            .slice(0, 120)
            .replace(/\s+/g, " ")
        : null;
    }
    out.widths[String(width)] = w;
    await ctx.close();
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1).slice(0, 1800));
  const witnessed = Object.values(out.widths).filter((w) => w.status === 200 && w.present).length;
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
