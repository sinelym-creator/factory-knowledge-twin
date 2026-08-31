/**
 * gate6_offline_probe — §32.7 「FastAPI OFF → **Offline 표시와 Replay 전환**」 한 행 전용.
 *
 * 🔴 **왜 기존 그물을 못 쓰는가.** `t41_live_status_timeout.mjs` 는 «블랙홀»(accept 하고 안 답함)
 *    자극에 맞춰 짜였고 「요청이 «끊긴» 적이 있다」를 전제로 앱 상한을 잰다. FastAPI 가 아예
 *    **꺼진** 자극에서는 연결이 «거부»되어 요청이 즉시 끝나므로 그 전제가 서지 않고, 그 그물은
 *    정직하게 `측정 불가` 를 낸다 — 그걸 「Offline 을 안 그린다」로 읽으면 대상에 없는 죄를 씌운다.
 *    **같은 «미연결»도 자극이 다르면 그물이 다르다**(14대 계보).
 *
 * 그래서 이 행이 정본에서 요구하는 «두 가지»만 곧장 잰다:
 *    ⓐ Offline 표시 — 배지가 «미연결» 로 바뀐다(색이 아니라 낱말로)
 *    ⓑ Replay 전환   — 정적 replay 제안이 뜬다(= 방문자에게 «다음 수»가 실제로 주어진다)
 *  + 대조군 — 빈 화면이 아니다(둘 다 «없는» 화면도 낱말 0 을 내므로)
 *
 *    FKT_WEB_BASE   재는 셸 (외부판은 URL 만 바꾼다)
 *
 * exit: 0 = ⓐⓑ 둘 다 · 1 = 하나라도 없음 · 2 = 셸에 닿지 못함(측정 불가)
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3191";
const WATCH_MS = Number(process.env.FKT_WATCH_MS ?? 30000);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const t0 = Date.now();
const resp = await page.goto(WEB + "/", { waitUntil: "commit", timeout: 30000 }).catch(() => null);
if (!resp) {
  console.log(`측정 불가 — 셸에 닿지 못했다 ${WEB}(초록도 빨강도 아니다)`);
  await browser.close();
  process.exit(2);
}

let offlineAt = null;
let offerAt = null;
const flips = [];
let prev = null;
const deadline = Date.now() + WATCH_MS;
while (Date.now() < deadline) {
  const snap = await page
    .evaluate(() => {
      const b = document.querySelector("[data-testid=mode-badge]");
      return {
        badge: b ? (b.textContent ?? "").replace(/\s+/g, " ").trim() : "(없음)",
        offer: !!document.querySelector("[data-testid=static-replay-offer]"),
        banner: !!document.querySelector("[data-testid=fallback-banner]"),
        url: location.pathname,
      };
    })
    .catch(() => null);
  if (snap) {
    const key = `${snap.url}|${snap.badge}|${snap.offer}|${snap.banner}`;
    if (key !== prev) {
      flips.push({ ms: Date.now() - t0, ...snap });
      prev = key;
    }
    if (offlineAt === null && /미연결/.test(snap.badge)) offlineAt = Date.now() - t0;
    if (offerAt === null && (snap.offer || snap.banner)) offerAt = Date.now() - t0;
    if (offlineAt !== null && offerAt !== null) break;
  }
  await page.waitForTimeout(50);
}

const chars = ((await page.locator("body").innerText().catch(() => "")) ?? "").replace(/\s+/g, "").length;
await browser.close();

console.log(`대상 ${WEB}`);
console.log("전이 자취");
for (const f of flips) {
  console.log(
    `   ${String(f.ms).padStart(6)} ms  url=${f.url.padEnd(10)} 제안=${f.offer ? "있음" : "없음"} ` +
      `배너=${f.banner ? "있음" : "없음"}  ${JSON.stringify(f.badge)}`,
  );
}
console.log(`ⓐ Offline 표시(«미연결») : ${offlineAt !== null ? `${offlineAt}ms` : "🔴 관측 안 됨"}`);
console.log(`ⓑ Replay 전환(제안·배너)  : ${offerAt !== null ? `${offerAt}ms` : "🔴 관측 안 됨"}`);
console.log(`대조군 빈 화면 아님        : ${chars}자`);

const ok = offlineAt !== null && offerAt !== null && chars > 0;
console.log(`\n결과: ${ok ? "기대대로" : "어긋남"}`);
process.exit(ok ? 0 : 1);
