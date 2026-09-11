/** T6-6 스켈레톤 규칙 — 「선표시 «전»」 창이 이 무대에 존재하기는 하는가.
 *
 * 본 그물(`t6-6-…spec.ts` ①)은 무대가 선 뒤부터 표집한다. 그 시점엔 선표시가 이미 서 있어서
 * 「선표시 0 → 스켈레톤 ≥1」 방향이 표본 0 개가 된다 — 빈 열의 every() 는 늘 참이라 그 초록은
 * 아무것도 막지 않는다. 그래서 **클릭 직후부터** 100ms 로 훑어, 그 창이 실재하는지만 묻는다.
 * 판정하지 않는다. 존재/부재를 세는 계측기다. 구독 0(게이트웨이 = hold 스텁).
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const BASE = process.argv[2] ?? "http://127.0.0.1:8196";
const MS = Number(process.argv[3] ?? 20000);

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForURL(/\/overview$/, { timeout: 15000 }).catch(() => {});
await p.getByTestId("start-from-headline").click();
await p.waitForURL(/\/incidents\/[^/]+\?run=/, { timeout: 30000 });

const t0 = Date.now();
const rows = [];
while (Date.now() - t0 < MS) {
  const s = await p.evaluate(() => {
    const n = (q) => document.querySelectorAll(q).length;
    const step = document.querySelector('[data-testid="run-step"][data-step="synthesize"]');
    return {
      synth: step?.getAttribute("data-state") ?? null,
      pending: n('[data-testid="synthesis-pending"]'),
      skeleton: n('[data-testid="synthesis-pending-skeleton"]'),
      provisional: n('[data-testid="synthesis-provisional"]'),
    };
  }).catch(() => null);
  if (s) rows.push({ at: Date.now() - t0, ...s });
  await p.waitForTimeout(100);
}
await b.close();

const running = rows.filter((r) => r.synth === "running");
const shown = running.filter((r) => r.pending > 0);
const cold = shown.filter((r) => r.provisional === 0);
const warm = shown.filter((r) => r.provisional >= 1);
console.log(`표본 ${rows.length} · synthesize=running ${running.length} · 표시>0 ${shown.length}`);
console.log(`선표시 0 (cold) ${cold.length}개 · 선표시 >=1 (warm) ${warm.length}개`);
if (cold.length) {
  console.log(`cold 창: ${cold[0].at}ms ~ ${cold[cold.length - 1].at}ms · skeleton 값 ${[...new Set(cold.map((c) => c.skeleton))].join(",")}`);
} else {
  console.log("cold 창 없음 — 이 무대에서는 「선표시 전」이 관측되지 않는다(부재지 0 이 아니다)");
}
console.log(`첫 표시 표본: ${JSON.stringify(shown[0] ?? null)}`);
