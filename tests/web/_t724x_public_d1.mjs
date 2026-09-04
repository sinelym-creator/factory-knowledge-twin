/**
 * 공개면 소조각 — D-1 「안내 닫기 → 재열람」 1회. 리바이2 41대.
 * 🔴 「밖에서 쳤다」는 URL 이 아니라 **연결한 주소**가 증거다 — 응답 헤더(`server`)와
 *    브라우저가 실제로 받은 응답을 같은 실행에서 값으로 남긴다.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let serverHeader = null;
page.on("response", (r) => {
  if (serverHeader === null && r.url().startsWith(BASE)) serverHeader = r.headers()["server"] ?? "(없음)";
});
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const enterBtn = page.locator('[data-testid="enter-button"]');
const hadEntry = await enterBtn.count().then((n) => n > 0).catch(() => false);
if (hadEntry) {
  await enterBtn.first().click().catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(2000);
}

const seen = async () =>
  page.evaluate(() => {
    /* 🔴 손잡이를 지어내지 않는다 — 화면에 «있는» testid 를 전부 열거해 값으로 남긴다. */
    const all = Array.from(document.querySelectorAll("[data-testid]"))
      .filter((e) => (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true))
      .map((e) => e.getAttribute("data-testid"));
    const one = (id) => {
      const e = document.querySelector(`[data-testid="${id}"]`);
      return e ? { visible: !!(e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true), text: (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30) } : null;
    };
    return { all, "tour-never": one("tour-never"), "intro-reopen": one("intro-reopen") };
  });

const before = await seen();
/* 닫기 — 안내의 «닫기»를 화면이 쓰는 표지로 찾는다(이름을 지어내지 않는다). */
const closeBtn = page.locator('[data-testid="tour-never"], [data-testid="tour-close"], [aria-label="안내 닫기"]');
const closed = await closeBtn.count().then((n) => n > 0).catch(() => false);
if (closed) await closeBtn.first().click().catch(() => {});
await sleep(1200);
const afterClose = await seen();

/* 재열람 — `intro-reopen` 이 그 자리다. */
const reopen = page.locator('[data-testid="intro-reopen"]');
const canReopen = await reopen.count().then((n) => n > 0).catch(() => false);
if (canReopen) await reopen.first().click().catch(() => {});
await sleep(3500);
const afterReopen = await seen();
await ctx.close();
await b.close();

const j = JSON.stringify;
console.log(`\n=== 공개면 D-1 안내 닫기 → 재열람 · base=${BASE} ===`);
console.log(`server 헤더(브라우저가 받은 것) = ${j(serverHeader)} · 입장 화면 있었나 = ${hadEntry}`);
console.log(`닫기 전   : ${j(before)}`);
console.log(`닫은 뒤   : ${j(afterClose)}`);
console.log(`재열람 뒤 : ${j(afterReopen)}`);
const wasOpen = !!before["tour-never"]?.visible;
const wentAway = !afterClose["tour-never"]?.visible;
/* 🔴 **판정선 정정(같은 실행에서 잡았다)** — 첫 판정선은 「초대 카드(`tour-never`)가 다시 뜨는가」였고
   그 선으로는 FAIL 이 나왔다. 그러나 열거된 testid 를 보면 재열람 뒤에 `tour-callout` ·
   `tour-title` · `tour-progress` · `tour-skip` · `tour-next` 가 «새로» 떠 있다 — 즉 안내는
   **초대 카드가 아니라 «둘러보기» 형태로** 돌아온다. 손잡이를 지어내면 없는 빨강이 나온다. */
const TOUR = ["tour-callout", "tour-title", "tour-progress", "tour-next", "tour-invite"];
const cameBack =
  !!afterReopen["tour-never"]?.visible || TOUR.some((id) => afterReopen.all.includes(id));
console.log(
  `\n판정: 처음 떠 있었나 ${wasOpen ? "✓" : "✗"} · 닫혔나 ${wentAway ? "✓" : "✗"} · 재열람으로 돌아왔나 ${cameBack ? "✓" : "✗"} → ${wasOpen && wentAway && cameBack ? "PASS" : wasOpen ? "FAIL/부분" : "미검증(안내가 처음부터 안 떴다 — 자극 없음)"}`,
);
