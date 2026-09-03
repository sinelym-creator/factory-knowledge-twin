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
 *       [--browser chromium|webkit|firefox] [--scheme dark|light]   ← T7-A 로 열린 인자(기본 = 종전)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);
const playwright = require_("@playwright/test");

/**
 * 🔴 브라우저를 «인자»로 연다(T7-A · 2026-09-03). 규격서 §8 은 검증 프로젝트를
 *    chromium·webkit·firefox 로 적어 놨는데 이 자는 chromium 하드코딩이었다 —
 *    기본값을 chromium 으로 두어 **기존 호출자는 한 칸도 달라지지 않는다**(넓힌 것이지
 *    바꾼 것이 아니다). 모르는 이름은 조용히 chromium 으로 떨어지지 않고 죽는다:
 *    오타가 「chromium 으로 세 번 잰 결과」를 3브라우저 표로 둔갑시키면 안 된다.
 */
export function launchBrowser(name = "chromium") {
  const engine = playwright[name];
  if (!engine || typeof engine.launch !== "function") {
    throw new Error(`모르는 브라우저다: ${name} (chromium|webkit|firefox)`);
  }
  return engine.launch();
}

/**
 * 입장 — 세션이 없으면 모든 화면이 가드 홉으로 «같은 그림»이 된다(= 아무것도 안 찍은 것).
 * T7-A 가 같은 손을 쓰도록 여기서 내보낸다.
 */
export async function enterShell(page, base) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const entered = await page
    .waitForURL(/\/overview$/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (entered) return;
  await page
    .getByRole("link", { name: /입장하기/ })
    .or(page.getByRole("button", { name: /입장하기/ }))
    .first()
    .click({ timeout: 10_000 });
  await page.waitForURL(/\/overview$/, { timeout: 45_000 });
}

// 🔴 이 파일은 이제 «자» 이면서 «부품»이다 — T7-A 가 같은 손(launchBrowser·enterShell)을
//    쓰도록 내보낸다. 그래서 CLI 본문을 main() 안으로 넣는다: import 만 해도 브라우저가
//    떠서 스크린샷을 찍어 버리면, 부품을 빌린 쪽이 자기도 모르게 남의 측정을 돌린 것이 된다.
const isMain = (() => {
  const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
  return entry === import.meta.url;
})();

async function main() {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : d;
  };

  const BASE = arg("base", "http://127.0.0.1:3102");
  const OUT = arg("out", "");
  const LABEL = arg("label", "before");
  // 🔴 기본값 = 종전 거동(chromium · dark). 인자를 안 주면 이 자는 예전 그대로다.
  const BROWSER = arg("browser", "chromium");
  const SCHEME = arg("scheme", "dark");
  if (!OUT) throw new Error("--out 이 필요하다");
  if (!["light", "dark"].includes(SCHEME)) throw new Error(`모르는 스킴이다: ${SCHEME}`);
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

  const browser = await launchBrowser(BROWSER);
  const manifest = {
    label: LABEL,
    base: BASE,
    at: new Date().toISOString(),
    browser: BROWSER,
    // 🔴 «무엇을 상대로 쟀는가»를 매니페스트에 박는다 — 나중에 두 열을 나란히 놓을 때
    //    브라우저·스킴이 안 적혀 있으면 그 차이가 팔레트의 것인지 엔진의 것인지 못 가른다.
    scheme: SCHEME,
    shots: [],
  };

  for (const width of WIDTHS) {
    for (const reduced of MOTION) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: SCHEME,
        reducedMotion: reduced,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      await enterShell(page, BASE);

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

        // 기본(chromium·dark)은 종전 파일명 그대로 — 이전 기준선과 이름으로 짝지어진다.
        const tag = BROWSER === "chromium" && SCHEME === "dark" ? "" : `_${BROWSER}-${SCHEME}`;
        const file = `${LABEL}${tag}_${s.id}_${width}_${reduced === "reduce" ? "reduced" : "motion"}.png`;
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
  fs.writeFileSync(path.join(OUT, `manifest-${LABEL}${BROWSER === "chromium" && SCHEME === "dark" ? "" : `-${BROWSER}-${SCHEME}`}.json`), JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify(manifest.summary, null, 2));
  if (manifest.shots.length !== SCREENS.length * WIDTHS.length * MOTION.length) {
    console.error("🔴 칸 수가 안 맞는다 — 기준선이 불완전하다");
    process.exit(2);
  }

}

if (isMain) await main();
