/**
 * T7-D · 가로 넘침 축 «만» 재측 — 세 열을 같은 실행에.
 *
 * 🔴 세 무대를 나란히 세운다. 「고쳐졌다」는 **고쳐지기 전 열이 같은 실행에서 빨간 것**으로만
 *    성립한다 — 수리 무대 하나만 초록이면 그 초록의 주어가 처방인지 그날의 무대인지 못 가른다.
 *      기준선(develop) / 회귀(ee3daab) / 수리(992ea73)
 *
 * 🔴 `pointer` 두 열도 함께 — 회귀가 `coarse` 에서만 났으므로 `fine` 열은 «변하지 않아야 하는»
 *    대조군이다.
 *
 * 🔴 대가도 함께 잰다 — 수리는 `::before` 를 **세로만** 넓히므로 가로가 44 미만인 자리는
 *    가로 미달이 남는다(구현 자기 회부: `intro-reopen` 32 · `fallback-banner` ✕ 10.6).
 *    **처방의 사정거리가 줄었다는 것을 값으로 남긴다.**
 *
 * 사용: node t7d_overflow_recheck.mjs --out <디렉토리>
 */
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, enterShell } from "./t64_baseline_shots.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const OUT = arg("out", "");
if (!OUT) throw new Error("--out 이 필요하다");
fs.mkdirSync(OUT, { recursive: true });

const STAGES = [
  { id: "baseline-develop", base: "http://127.0.0.1:3102", sha: "develop(9509124 빌드)" },
  { id: "regression-ee3daab", base: "http://127.0.0.1:3103", sha: "ee3daab" },
  { id: "fix-992ea73", base: "http://127.0.0.1:3104", sha: "992ea73" },
];
const BROWSERS = arg("browsers", "chromium,webkit,firefox").split(",");
const WIDTHS = [390, 768, 1024, 1280];
const SCREENS = [
  { id: "overview", route: "/overview" },
  { id: "incident", route: "/incidents/INC-2025-019" },
  { id: "evidence", route: "/evidence/EV-2025-001" },
  { id: "work-order", route: "/work-orders/WO-2025-001" },
  { id: "compare", route: "/compare" },
];
/** 대가 2자리 — 수리가 세로만 넓히므로 가로 미달이 남는지 본다. */
const COST_SEL = ['[data-testid="intro-reopen"]', '[data-testid="fallback-banner"] button'];

const READ = (costSel) => {
  const el = document.scrollingElement ?? document.documentElement;
  const out = { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, cost: [] };
  out.overflow = out.scrollWidth > out.clientWidth;
  for (const sel of costSel) {
    const n = document.querySelector(sel);
    if (!n) {
      out.cost.push({ sel, found: false });
      continue;
    }
    const r = n.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const owns = (e) => Boolean(e) && (e === n || n.contains(e));
    if (!owns(document.elementFromPoint(cx, cy))) {
      out.cost.push({ sel, found: true, visual: `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`, hit: null, why: "중심 가림 = 못 잰 것" });
      continue;
    }
    const scan = (dx, dy) => {
      let d = 0;
      for (let k = 1; k <= 60; k++) {
        const x = cx + dx * k;
        const y = cy + dy * k;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) break;
        if (!owns(document.elementFromPoint(x, y))) break;
        d = k;
      }
      return d;
    };
    const b = getComputedStyle(n, "::before");
    out.cost.push({
      sel,
      found: true,
      visual: `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`,
      hit: `${scan(-1, 0) + scan(1, 0) + 1}x${scan(0, -1) + scan(0, 1) + 1}`,
      before: b && b.content !== "none" ? `${b.width}x${b.height}` : null,
    });
  }
  return out;
};

const report = { at: new Date().toISOString(), axis: "가로 넘침 전용", stages: STAGES, rows: [], errors: [] };

for (const name of BROWSERS) {
  const browser = await launchBrowser(name);
  for (const st of STAGES) {
    for (const hasTouch of [false, true]) {
      for (const width of WIDTHS) {
        let ctx;
        try {
          ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark", hasTouch });
          const page = await ctx.newPage();
          await enterShell(page, st.base);
          for (const s of SCREENS) {
            await page.goto(`${st.base}${s.route}`, { waitUntil: "domcontentloaded" });
            await page.waitForLoadState("load").catch(() => {});
            await page.waitForTimeout(400);
            const v = await page.evaluate(READ, COST_SEL);
            report.rows.push({ browser: name, stage: st.id, pointer: hasTouch ? "coarse" : "fine", width, screen: s.id, ...v });
          }
        } catch (e) {
          report.errors.push({ browser: name, stage: st.id, width, hasTouch, message: String(e).split("\n")[0].slice(0, 200) });
        } finally {
          if (ctx) await ctx.close().catch(() => {});
        }
      }
    }
  }
  await browser.close();
  console.error(`[t7d] ${name} 완료 — 누적 ${report.rows.length}칸`);
}

fs.writeFileSync(path.join(OUT, "t7d-overflow-recheck.json"), JSON.stringify(report, null, 2), "utf8");

const grid = {};
for (const r of report.rows) {
  const k = `${r.stage}|${r.pointer}`;
  const g = (grid[k] ??= { cells: 0, overflow: 0, values: new Set() });
  g.cells++;
  if (r.overflow) {
    g.overflow++;
    g.values.add(`${r.scrollWidth}/${r.clientWidth}`);
  }
}
console.log("무대 × pointer — 넘침 계수");
for (const k of Object.keys(grid).sort()) {
  const g = grid[k];
  console.log(`  ${k.padEnd(28)} ${String(g.overflow).padStart(2)}/${g.cells} ${[...g.values].join(",")}`);
}
console.log("\n대가 2자리(coarse · 무대별 · 첫 표본)");
for (const st of STAGES) {
  const r = report.rows.find((x) => x.stage === st.id && x.pointer === "coarse" && x.screen === "overview" && x.width === 390);
  if (!r) continue;
  for (const c of r.cost) console.log(`  ${st.id.padEnd(20)} ${c.sel.slice(0, 44).padEnd(46)} 시각 ${c.visual ?? "-"} 히트 ${c.hit ?? c.why ?? "-"} ::before ${c.before ?? "없음"}`);
}
console.log("\n오류", report.errors.length);

// 🔴 대조군: 회귀 무대가 이 실행에서 «빨간가». 안 빨가면 수리 무대의 초록은 근거가 아니다.
const reg = grid["regression-ee3daab|coarse"];
if (!reg || reg.overflow === 0) {
  console.error("🔴 회귀 무대가 이 실행에서 안 빨갛다 — 수리의 초록을 근거로 쓸 수 없다");
  process.exit(2);
}
