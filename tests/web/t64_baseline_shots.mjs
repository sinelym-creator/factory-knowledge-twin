/**
 * T6-4 ⑥ 기준선 스크린샷 — 5화면 × 5폭 × reduced on/off · **다크 1스킴**.
 *
 * 이 스크립트는 판정하지 않는다. **「전」과 「후」를 같은 손으로 찍기 위한 자**다 —
 * 두 열을 다른 도구로 찍으면 차이가 팔레트의 것인지 도구의 것인지 갈리지 않는다.
 *
 * 🔴 다크는 **강제한다**(`colorScheme: "dark"`). 정본 §10 = neutral dark 기본이고, 헤드리스
 *    기본값은 라이트라 그냥 찍으면 「전」이 정본과 다른 화면이 된다.
 * 🔴 `reduced` 두 열을 함께 찍는다 — 모션이 걸린 화면은 «찍는 순간»에 따라 다른 그림이
 *    나온다. reduced 열은 그 흔들림이 없는 기준이고, on 열은 실제 방문자의 그림이다.
 * 🔴 매 칸마다 **가로 스크롤 실측**(`scrollingElement.scrollWidth` vs `clientWidth`)을 같이
 *    남긴다. 그림만 남기면 나중에 「그때 넘쳤나」를 다시 세울 수 없다.
 *
 * 사용: node t64_baseline_shots.mjs --base http://127.0.0.1:3102 --out <디렉토리> --label before
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3102");
const OUT = arg("out", "");
const LABEL = arg("label", "before");
if (!OUT) throw new Error("--out 이 필요하다");
fs.mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { id: "overview", route: "/overview" },
  { id: "incident", route: "/incidents/INC-2025-019" },
  { id: "evidence", route: "/evidence/EV-2025-001" },
  { id: "work-order", route: "/work-orders/WO-2025-001" },
  { id: "compare", route: "/compare" },
];
const WIDTHS = [390, 768, 1024, 1280, 1440];
const MOTION = ["reduce", "no-preference"];

const browser = await chromium.launch();
const manifest = { label: LABEL, base: BASE, at: new Date().toISOString(), scheme: "dark", shots: [] };

for (const width of WIDTHS) {
  for (const reduced of MOTION) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: "dark",
      reducedMotion: reduced,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    // 입장 — 세션이 없으면 모든 화면이 가드 홉으로 같은 그림이 된다(= 아무것도 안 찍은 것).
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const entered = await page
      .waitForURL(/\/overview$/, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!entered) {
      await page
        .getByRole("link", { name: /입장하기/ })
        .or(page.getByRole("button", { name: /입장하기/ }))
        .first()
        .click({ timeout: 10_000 });
      await page.waitForURL(/\/overview$/, { timeout: 45_000 });
    }

    for (const s of SCREENS) {
      await page.goto(`${BASE}${s.route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(reduced === "reduce" ? 500 : 1200);

      const box = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          h1: document.querySelector("h1")?.textContent?.trim() ?? null,
        };
      });

      const file = `${LABEL}_${s.id}_${width}_${reduced === "reduce" ? "reduced" : "motion"}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      manifest.shots.push({
        screen: s.id,
        route: s.route,
        width,
        reduced: reduced === "reduce",
        file,
        scrollWidth: box.scrollWidth,
        clientWidth: box.clientWidth,
        // 🔴 판정이 아니라 «관측»이다 — 이 열의 참·거짓은 재설계 뒤 열과 나란히 놓고 읽는다.
        horizontalOverflow: box.scrollWidth > box.clientWidth,
        bodyBg: box.bodyBg,
        h1: box.h1,
      });
    }
    await ctx.close();
  }
}
await browser.close();

const over = manifest.shots.filter((s) => s.horizontalOverflow);
manifest.summary = {
  shots: manifest.shots.length,
  horizontalOverflow: over.length,
  overflowCells: over.map((s) => `${s.screen}@${s.width}${s.reduced ? "/reduced" : ""} ${s.scrollWidth}/${s.clientWidth}`),
};
fs.writeFileSync(path.join(OUT, `manifest-${LABEL}.json`), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest.summary, null, 2));
if (manifest.shots.length !== SCREENS.length * WIDTHS.length * MOTION.length) {
  console.error("🔴 칸 수가 안 맞는다 — 기준선이 불완전하다");
  process.exit(2);
}
