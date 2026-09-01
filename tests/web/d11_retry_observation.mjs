/**
 * D-11 (C) «GET 1회 재시도» 부수 관측 — 판정 아님 (검증 좌석 19대 · 오케 요청).
 *
 * (C) 처방 = 브라우저 GET 이 502 를 받으면 **1회 더** 나간다. 그 효과를 밖에서 볼 수 있는 유일한
 * E1 축은 「502 를 받은 그 GET 이 곧바로 한 번 더 나가는가」 하나다.
 *
 * 🔴 이 그물은 D-11 을 «판정»하지 않는다 — 502 가 안 나오면 재시도도 관측되지 않고, 그것은
 *    「처방이 없다」가 아니라 **자극이 없었다**는 뜻이다. 두 경우를 출력에서 갈라 적는다.
 *
 *      FKT_WEB_BASE=https://…  node d11_retry_observation.mjs
 *
 * exit: 0 = 관측 종료(판정 없음) · 2 = 대상 무응답
 */
import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE;
if (!WEB) { console.log("🔴 측정 불가 — `FKT_WEB_BASE` 를 명시하라."); process.exit(2); }
const WATCH_MS = Number(process.env.FKT_WATCH_MS ?? 75000);
/** 「곧바로」의 폭 — (C) 는 즉시 1회 재시도다. 넉넉히 잡아도 폴링 주기(30s)와는 두 자릿수 차이다. */
const NEAR_MS = Number(process.env.FKT_NEAR_MS ?? 300);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
/** {path, status, at} — 브라우저가 낸 `/api` GET 만. */
const log = [];
page.on("response", async (res) => {
  const req = res.request();
  if (req.method() !== "GET") return;
  const p = new URL(res.url()).pathname;
  if (!p.startsWith("/api/")) return;
  log.push({ p, status: res.status(), at: Date.now() });
});

await page.goto(`${WEB}/`, { timeout: 45000 });
try { await page.waitForURL(/\/overview$/, { timeout: 30000 }); } catch {}
console.log(`\n== D-11 (C) 부수 관측 — ${WEB} · 창 ${WATCH_MS}ms · 「곧바로」 = ${NEAR_MS}ms`);
await page.waitForTimeout(WATCH_MS);
await browser.close();

const gets = log.length;
const bad = log.filter((r) => r.status === 502);
let retried = 0;
const rows = [];
for (const b of bad) {
  const next = log.find((r) => r.p === b.p && r.at > b.at && r.at - b.at <= NEAR_MS);
  if (next) retried += 1;
  rows.push(`${b.p} 502 → ${next ? `${next.at - b.at}ms 뒤 ${next.status}` : `${NEAR_MS}ms 안에 재시도 «없음»`}`);
}
console.log(`\n  브라우저 /api GET 총 ${gets}건 · 그중 502 ${bad.length}건`);
for (const r of rows) console.log(`    ${r}`);
console.log("\n  ── 읽는 법 ──");
if (bad.length === 0) {
  console.log("  🔵 502 가 한 건도 없었다 — **자극 부재**다. (C) 가 도는지 «안 도는지»를 이 실행은 말하지 못한다.");
} else {
  console.log(`  🔵 502 ${bad.length}건 중 ${NEAR_MS}ms 안에 같은 GET 이 다시 나간 것 = **${retried}건**`);
  console.log("     (C) 가 살아 있으면 이 수가 502 건수에 가깝다 · 0 이면 그 축은 이 경로에 없다.");
}
console.log("\n  🔴 판정 아님 — 이 그물은 값만 남긴다.");
