/**
 * 회귀 축 — 가로 넘침(`scrollWidth > clientWidth`)을 두 열에서 전수로 센다.
 *
 * 🔴 앞선 넘침 그물(`t7d_overflow_recheck.mjs`)은 무대 표를 **포트로 박아** 두었다
 *    (`:3102`·`:3103`·`:3104` = 35대 무대). 그 포트들은 이미 없거나 다른 sha 를 섬긴다 —
 *    **판정선은 설계와 함께 늙는다.** 그래서 무대를 인자로 받는 그물을 따로 판다.
 *
 * 🔴 **`pointer: coarse` 열을 반드시 함께 잰다.** 넘침의 근인이었던 히트 확장
 *    (`.fkt-hit::before`)은 `@media (pointer: coarse)` 안에만 산다 — fine 만 재면
 *    이 축에 대해 아무 말도 못 한다(35대 실측: coarse 60/60 넘침 · fine 0/60).
 *
 * 🔴 대조군(같은 실행 · 양방향): 넘침이 «보장된» 요소를 심어 검출되는지, 치운 뒤 안 나는지.
 *    한 방향만 보면 「아무것도 못 보는 눈」이 초록을 낸다.
 *
 * 사용: node t7b_overflow_two_columns.mjs --base http://127.0.0.1:3112 --label before --out x.json
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:3112");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");

const WIDTHS = [390, 768, 1024, 1280, 1440, 1920];
const ROUTES = [
  ["overview", "/overview"],
  ["incident", "/incidents/INC-2026-014?run=STATIC-GS-01"],
  ["evidence", "/evidence/MR-2025-0087?run=STATIC-GS-01"],
];
const MEASURE = () => {
  const d = document.documentElement;
  return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, over: d.scrollWidth - d.clientWidth };
};

const die = (why, extra) => { console.error(`[exit2] ${why}`); if (extra) console.error(JSON.stringify(extra)); process.exit(2); };

const browser = await chromium.launch();
const out = { label: LABEL, base: BASE, at: new Date().toISOString(), control: null, cells: [] };
let controlDone = false;

for (const pointer of ["fine", "coarse"]) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      ...(pointer === "coarse" ? { hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    await page.route("**/api/live/status", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }),
    );
    for (const [label, path] of ROUTES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);
      const media = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
      const m = await page.evaluate(MEASURE);

      if (!controlDone) {
        // ① 넘침 보장: 뷰포트보다 넓은 블록을 심는다 → 검출돼야 한다.
        await page.evaluate((w2) => {
          const d = document.createElement("div");
          d.id = "__ovf_ctl__";
          d.style.cssText = `position:absolute;left:0;top:0;width:${w2 + 200}px;height:4px;`;
          document.body.appendChild(d);
        }, w);
        await page.waitForTimeout(150);
        const planted = await page.evaluate(MEASURE);
        await page.evaluate(() => document.getElementById("__ovf_ctl__")?.remove());
        await page.waitForTimeout(150);
        const removed = await page.evaluate(MEASURE);
        out.control = { baseline: m, planted, removed };
        if (planted.over <= m.over) die("대조군① 불발 — 넘침을 심었는데 안 잡혔다", { m, planted });
        if (removed.over !== m.over) die("대조군② 불발 — 치웠는데 원래 값으로 안 돌아왔다", { m, removed });
        controlDone = true;
      }

      out.cells.push({ pointer, mediaCoarse: media, width: w, route: label, ...m, overflow: m.over > 0 });
    }
    await page.close();
    await ctx.close();
  }
}

out.total = {
  cells: out.cells.length,
  overflowing: out.cells.filter((c) => c.overflow).length,
  byPointer: {
    fine: out.cells.filter((c) => c.pointer === "fine" && c.overflow).length,
    coarse: out.cells.filter((c) => c.pointer === "coarse" && c.overflow).length,
  },
  worst: out.cells.reduce((a, c) => (c.over > (a?.over ?? -1) ? c : a), null),
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`[${LABEL}] 대조군: 심음 over=${out.control.planted.over} · 기준 ${out.control.baseline.over} · 치움 ${out.control.removed.over}`);
console.log(`[${LABEL}] 칸 ${out.total.cells} · 🔴 넘침 ${out.total.overflowing} (fine ${out.total.byPointer.fine} · coarse ${out.total.byPointer.coarse})`);
for (const c of out.cells.filter((c) => c.overflow))
  console.log(`     넘침: ${c.pointer} ${c.width}px ${c.route} — scrollWidth ${c.scrollWidth} / clientWidth ${c.clientWidth} (+${c.over})`);
await browser.close();
