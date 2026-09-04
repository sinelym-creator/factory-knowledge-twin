/**
 * 배지 캡처 — 🔴 **cap 0**. 새 run 을 만들지 않고 **이미 완주한 run 을 URL 로 다시 연다**.
 * 발주 A 의 「캡처 1(배지 `data-mode` 가 DOM 에 보이는 1280)」 자리.
 *
 * 겸해서 열 ① 의 두 갈래(«요소 0개» vs «속성 null»)를 **여기서는 완주 뒤 값으로만** 가른다 —
 * 🔴 early 시점의 갈래는 새 run 이 있어야 하므로 이 회차에서 «못 잰 것»으로 남는다.
 *
 * usage: node badge_capture.mjs --base https://... --path /incidents/X?run=Y --out o.json --shot p.png
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const PATH = arg("path");
const OUT = arg("out");
const SHOT = arg("shot");
if (!PATH || !OUT || !SHOT) {
  console.error("--path --out --shot 은 필수다");
  process.exit(9);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + PATH, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  for (const sel of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = page.locator(sel);
    if (await l.count()) {
      await l.first().click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  const badge = page.locator('[data-testid="run-mode-badge"]');
  const count = await badge.count();
  const out = {
    url: page.url(),
    wall: new Date().toISOString(),
    // 🔴 «요소 수» 와 «속성 값» 을 **따로** 적는다 — 하나로 합치면 0개와 null 이 같은 얼굴이 된다.
    badgeElementCount: count,
    dataMode: count ? await badge.first().getAttribute("data-mode") : null,
    badgeText: count ? (await badge.first().innerText()).replace(/\s+/g, " ").trim() : null,
    shellModeBadgeCount: await page.locator('[data-testid="mode-badge"]').count(),
    runConsoleStatus: (await page.locator('[data-testid="run-console"]').count())
      ? await page.locator('[data-testid="run-console"]').first().getAttribute("data-status")
      : null,
  };
  /* 🔴 **배지가 없으면 «없다»고 적기 전에 귀속부터 묻는다** — run 은 세션 스코프라
     새 브라우저 컨텍스트는 그 run 의 소유자가 아니다. 화면의 부재가 «대상 결함»인지
     «내가 남의 문을 두드린 것»인지는 API 가 가른다(같은 오리진 · 이 컨텍스트의 쿠키로). */
  const rid = (PATH.match(/run=([^&]+)/) || [])[1];
  out.attribution = rid
    ? await page.evaluate(async (r) => {
        const hit = async (p) => {
          try {
            const res = await fetch(p, { credentials: "include", headers: { accept: "application/json" } });
            return { status: res.status, raw: (await res.text()).slice(0, 160) };
          } catch (e) {
            return { status: null, error: String(e).slice(0, 120) };
          }
        };
        return {
          runApi: await hit(`/api/runs/${encodeURIComponent(r)}`),
          sessionApi: await hit("/api/live/status"),
        };
      }, decodeURIComponent(rid))
    : null;

  // 🔴 캡처는 배지가 실제로 DOM 에 있을 때만 남긴다 — 없는 화면을 증거로 붙이지 않는다.
  if (count) await badge.first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: SHOT, fullPage: false });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(
    `badgeCount=${out.badgeElementCount} dataMode=${out.dataMode} text=${out.badgeText} ` +
      `shellModeBadge=${out.shellModeBadgeCount} runStatus=${out.runConsoleStatus} ` +
      `| attribution runApi=${out.attribution?.runApi?.status} live=${out.attribution?.sessionApi?.status}`,
  );
  process.exit(out.badgeElementCount === 1 && out.dataMode ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
