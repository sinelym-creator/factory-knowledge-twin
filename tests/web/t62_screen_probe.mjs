/**
 * t62_screen_probe — T6-2 축 ⑧ «화면» (검증 좌석 · 29대).
 *
 * 재는 것 넷:
 *   ⓐ 게이트웨이 OFF 일 때 **모드 배지**와 **OFF 사유 문면**이 서는가(= 조용한 폴백 0 의 화면 쪽)
 *   ⓑ 합성 배지가 `live-rejected` 를 말하는가
 *   ⓒ 🔴 **API 내부 사유(`ConnectionRefusedError`)가 화면으로 새는가** — 회부 후보 1의 판정선
 *   ⓓ 세션 상한(3/시간)을 넘긴 4회째에 **429 배너**가 서는가(조용히 삼키지 않는가)
 *
 * 🔴 게이트웨이가 OFF 인 창에서만 참인 측정이다 — 켜져 있으면 ⓐⓑ 는 다른 축이 된다.
 * 🔴 조사 4회는 «생성»만 한다. GW OFF 라 합성이 없어 **구독 소모 0**.
 *
 *     FKT_WEB_BASE  셸 (기본 http://127.0.0.1:3013)
 *
 * exit: 0 = 측정됨 · 2 = 무대 없음
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3013";
const LEAK = "ConnectionRefusedError";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/overview$/, { timeout: 60_000 });

/** 화면 전체 텍스트 — 「문면이 있는가」는 셀렉터가 아니라 본문으로 묻는다. */
const bodyText = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");

const overview = await bodyText();
const modeBadge = page.locator("[data-testid=mode-badge]");
const modeCount = await modeBadge.count();
console.log(`== 축 ⑧ 화면 · ${WEB}`);
console.log(`  overview 모드 배지 : ${modeCount}개 · "${modeCount ? (await modeBadge.first().innerText()).trim() : "(없음)"}"`);
console.log(`  OFF 사유 문면      : ${/Live AI 합성이 꺼져/.test(overview) ? "○ 있다" : "🔴 없다"}`);
console.log(`  overview 에 내부 예외명: ${overview.includes(LEAK) ? "🔴 샌다" : "○ 0건"}`);

// ── 조사 1회 — 합성 배지와 화면 누출 ────────────────────────────────────────
await page.locator("[data-testid=start-from-alarm]").first().click();
await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 60_000 });
const consoleEl = page.locator("[data-testid=run-console]");
for (let i = 0; i < 120; i += 1) {
  if ((await consoleEl.getAttribute("data-status")) === "completed") break;
  await page.waitForTimeout(1_000);
}
const runText = await bodyText();
const badge = page.locator("[data-testid=synthesis-badge]");
const axis = (await badge.count()) ? await badge.first().getAttribute("data-axis") : null;
const runMode = (await modeBadge.count()) ? (await modeBadge.first().innerText()).trim() : null;
console.log(`  run 모드 배지      : "${runMode}"`);
console.log(`  합성 배지          : ${await badge.count()}개 · data-axis=${axis}`);
const leakAt = runText.includes(LEAK)
  ? runText.slice(Math.max(0, runText.indexOf(LEAK) - 90), runText.indexOf(LEAK) + 40)
  : null;
console.log(`  run 화면 내부 예외명: ${runText.includes(LEAK) ? `🔴 샌다 → "…${leakAt}…"` : "○ 0건"}`);
console.log(`  run 화면 OFF 문면  : ${/Live AI 합성이 꺼져|게이트웨이/.test(runText) ? "○ 있다" : "— 없다"}`);

// ── 상한 배너 — 같은 세션으로 조사를 더 만든다(3/시간 상한) ──────────────────
let capBanner = null;
let attempts = 0;
for (let i = 0; i < 5; i += 1) {
  await page.goto(`${WEB}/overview`, { waitUntil: "domcontentloaded" });
  const btn = page.locator("[data-testid=start-from-alarm]").first();
  if ((await btn.count()) === 0) break;
  await btn.click();
  attempts += 1;
  await page.waitForTimeout(2_500);
  const t = await bodyText();
  // 🔴 「상한」만으로 찾으면 **문서 본문의 「이송 속도 상한」**까지 잡힌다(29대 1차 오탐).
  //    배너의 고유 문면으로 좁힌다.
  if (/다 썼습니다/.test(t)) {
    capBanner = t.match(/[^.]*다 썼습니다[^.]*\.?/)?.[0]?.trim() ?? "(문면 추출 실패)";
    break;
  }
}
console.log(`  상한 배너          : ${capBanner ? `○ "${capBanner.slice(0, 120)}"` : "🔴 안 떴다"} (조사 시도 ${attempts}회)`);
const finalText = await bodyText();
console.log(`  배너 화면 내부 예외명: ${finalText.includes(LEAK) ? "🔴 샌다" : "○ 0건"}`);

await browser.close();
process.exit(0);
