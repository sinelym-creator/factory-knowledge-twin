/**
 * T7-A · 브라우저 호환 축 «측정» — chromium · webkit · firefox × 뷰포트 4 × 스킴 2.
 *
 * 정본 = `docs/design/t6-4-apple-design-spec.md` **§8**:
 *   「Playwright 프로젝트 = chromium·webkit·firefox × 뷰포트 4 × colorScheme 2 →
 *    ② `scrollingElement.scrollWidth <= clientWidth` 전 화면 assert
 *    ③ 터치 타깃 ≥44 assert(버튼·링크 boundingBox)
 *    ④ 호환 표(브라우저 × 항목 · PASS/FAIL/미지원 폴백)」
 *
 * 🔴 이 자는 **재지 않은 것을 초록으로 만들지 않는다**. 세 가지를 지킨다:
 *
 * ① **손은 하나** — 브라우저·입장은 `t64_baseline_shots.mjs` 에서 빌린다(같은 입장 절차·
 *    같은 런처). 열마다 다른 손으로 재면 차이가 엔진의 것인지 도구의 것인지 안 갈린다.
 *
 * ② **대조군을 같은 실행에** — 축 ①②는 일부러 어긴 표본(5000px 블록 · 20×20 버튼)을
 *    같은 페이지에 심어 «판정기가 운다»를 브라우저마다 증명한다. 안 울면 그 브라우저의
 *    초록은 근거로 쓰지 않고 `exit 2` 로 죽는다 — 죽은 검사기는 언제나 초록을 낸다.
 *
 * ③ **폴백은 «걸리는가»를 잰다** — 세 엔진 모두 `backdrop-filter` 를 지원하면
 *    `@supports not (...)` 경로는 **한 번도 실행되지 않는다**. 그래서 CSS 응답을 가로채
 *    조건을 항상-참으로 바꿔 폴백을 강제하고, 강제 안 한 열과 나란히 찍는다.
 *    두 열이 같으면 「폴백이 잘 걸린다」가 아니라 **내 개입이 안 먹었다**는 뜻이다.
 *
 * 🔴 잰 범위 = **엔진 3종 · 데스크톱 헤드리스 에뮬레이션**. Playwright 의 webkit·firefox 는
 *    Safari·Firefox 제품이 아니라 그 엔진 빌드다. iOS Safari 실기기는 **안 잰 것**이다.
 *
 * 사용: node t7a_browser_compat.mjs --base http://127.0.0.1:3102 --out <디렉토리>
 */
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, enterShell } from "./t64_baseline_shots.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3102");
const OUT = arg("out", "");
if (!OUT) throw new Error("--out 이 필요하다");
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = arg("browsers", "chromium,webkit,firefox").split(",");
const WIDTHS = [390, 768, 1024, 1280];
const SCHEMES = ["light", "dark"];
const SCREENS = [
  { id: "overview", route: "/overview" },
  { id: "incident", route: "/incidents/INC-2025-019" },
  { id: "evidence", route: "/evidence/EV-2025-001" },
  { id: "work-order", route: "/work-orders/WO-2025-001" },
  { id: "compare", route: "/compare" },
];

/** 규격서 §8 문면 = 「버튼·링크·세그먼트」. 그 문면 그대로 훑는다. */
const TOUCH_SEL =
  'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="radio"], select, summary, input:not([type="hidden"])';

/** 한 화면에서 축 ①② 를 읽는다 — 판정하지 않고 «값»만 돌려준다. */
const READ = (sel) => {
  const el = document.scrollingElement ?? document.documentElement;
  const scrollWidth = el.scrollWidth;
  const clientWidth = el.clientWidth;

  const nodes = [...document.querySelectorAll(sel)];
  let scanned = 0;
  let hiddenSkipped = 0;
  const under = [];
  for (const n of nodes) {
    const cs = getComputedStyle(n);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = n.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // 🔴 스크린리더 전용(`sr-only`)은 «보이지 않는» 요소라 터치 타깃이 아니다. 처음 판에서
    //    1×1 input 24건이 위반으로 잡혔다 — 내 그물이 정본(§8 「버튼·링크·세그먼트」)보다
    //    넓었다. 조용히 빼지 않고 «몇 개를 뺐는지»를 남긴다: 빼는 순간 검출력이 팔린다.
    if (r.width <= 1 || r.height <= 1) {
      hiddenSkipped++;
      continue;
    }
    scanned++;
    const w = Math.round(r.width * 10) / 10;
    const h = Math.round(r.height * 10) / 10;
    if (Math.min(w, h) >= 44) continue;
    under.push({
      tag: n.tagName.toLowerCase(),
      role: n.getAttribute("role"),
      cls: String(n.className || "").slice(0, 70),
      text: (n.textContent || "").trim().slice(0, 28),
      w,
      h,
      // 🔴 문단 속 인라인 링크는 «세그먼트»가 아니다 — 지우지 않고 «표시»만 해서
      //    두 수(문면 그대로 / 위젯 모양만)를 둘 다 보고에 남긴다.
      inline: cs.display === "inline",
    });
  }

  // 넘칠 때 «누가» 넘치는지 — 회부문에 좌표를 실으려면 수만으로는 부족하다.
  let widest = null;
  if (scrollWidth > clientWidth) {
    for (const n of document.querySelectorAll("body *")) {
      const r = n.getBoundingClientRect();
      const right = r.left + r.width + (document.scrollingElement?.scrollLeft ?? 0);
      if (right > clientWidth + 1 && (!widest || right > widest.right)) {
        widest = {
          right: Math.round(right),
          tag: n.tagName.toLowerCase(),
          cls: String(n.className || "").slice(0, 70),
        };
      }
    }
  }

  const glassNodes = [...document.querySelectorAll(".fkt-glass")];
  const g = glassNodes[0] ? getComputedStyle(glassNodes[0]) : null;

  return {
    scrollWidth,
    clientWidth,
    overflow: scrollWidth > clientWidth,
    widest,
    touchScanned: scanned,
    touchHiddenSkipped: hiddenSkipped,
    touchUnder: under,
    glassCount: glassNodes.length,
    glassBg: g ? g.backgroundColor : null,
    glassFilter: g ? g.backdropFilter || g.webkitBackdropFilter || "none" : null,
  };
};

const alphaOf = (rgb) => {
  if (!rgb) return null;
  const m = /rgba?\(([^)]+)\)/.exec(rgb);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  return parts.length >= 4 ? Number(parts[3]) : 1;
};

const settle = async (page) => {
  await page.waitForLoadState("load").catch(() => {});
  // 🔴 networkidle 은 «떠 있는 연결 0» 이라 이 축(레이아웃)의 조건이 아니다. 레이아웃이
  //    앉을 시간만 준다 — 이 값도 「잰 범위」에 적는다.
  await page.waitForTimeout(450);
};

const report = {
  at: new Date().toISOString(),
  base: BASE,
  scope: "엔진 3종 · 데스크톱 헤드리스 에뮬레이션 · 실기기 미측",
  settleMs: 450,
  cells: [],
  controls: [],
  fallback: [],
  engineSupport: [],
  errors: [],
};

let shots = 0;

for (const name of BROWSERS) {
  let browser;
  try {
    browser = await launchBrowser(name);
  } catch (e) {
    report.errors.push({ browser: name, stage: "launch", message: String(e).slice(0, 300) });
    continue;
  }
  const version = browser.version();

  // ── 대조군: 판정기가 이 엔진에서 «우는가» ──────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: "dark" });
    const page = await ctx.newPage();
    await enterShell(page, BASE);
    await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
    await settle(page);

    const before = await page.evaluate(READ, TOUCH_SEL);
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.id = "__ctrl_wide";
      d.style.cssText = "width:5000px;height:4px;";
      document.body.appendChild(d);
      const b = document.createElement("button");
      b.id = "__ctrl_tiny";
      b.textContent = "x";
      b.style.cssText = "width:20px;height:20px;padding:0;";
      document.body.appendChild(b);
    });
    await page.waitForTimeout(120);
    const after = await page.evaluate(READ, TOUCH_SEL);

    const tiny = after.touchUnder.find((u) => u.w === 20 && u.h === 20);
    report.controls.push({
      browser: name,
      overflowDetectorFired: !before.overflow && after.overflow,
      overflowBefore: `${before.scrollWidth}/${before.clientWidth}`,
      overflowAfter: `${after.scrollWidth}/${after.clientWidth}`,
      touchDetectorFired: Boolean(tiny),
      touchUnderDelta: after.touchUnder.length - before.touchUnder.length,
    });
    await ctx.close();
  }

  // ── 축 ③: 폴백을 «강제»한 열 vs 안 한 열 ────────────────────────────────
  {
    const read = async (force) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
      const page = await ctx.newPage();
      const counter = { replaced: 0 };
      if (force) {
        await page.route("**/*.css", async (route) => {
          const res = await route.fetch();
          let css = await res.text();
          css = css.replace(/@supports\s+not\s*\([^{]*backdrop-filter[^{]*\)/g, () => {
            counter.replaced++;
            return "@supports (display:block)";
          });
          await route.fulfill({ response: res, body: css });
        });
      }
      await enterShell(page, BASE);
      await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const v = await page.evaluate(READ, TOUCH_SEL);
      const sup = await page.evaluate(() => ({
        std: CSS.supports("backdrop-filter", "blur(1px)"),
        webkit: CSS.supports("-webkit-backdrop-filter", "blur(1px)"),
      }));
      await ctx.close();
      return { replaced: counter.replaced, glassCount: v.glassCount, bg: v.glassBg, filter: v.glassFilter, sup };
    };

    try {
      const normal = await read(false);
      const forced = await read(true);
      report.engineSupport.push({ browser: name, version, ...normal.sup });
      report.fallback.push({
        browser: name,
        glassCount: normal.glassCount,
        normalBg: normal.bg,
        normalAlpha: alphaOf(normal.bg),
        normalFilter: normal.filter,
        forcedBg: forced.bg,
        forcedAlpha: alphaOf(forced.bg),
        forcedFilter: forced.filter,
        cssRulesRewritten: forced.replaced,
        // 🔴 세 값을 따로 남긴다: 개입이 먹었는가 / 두 열이 갈렸는가 / 폴백이 불투명한가.
        stimulusLanded: forced.replaced > 0,
        columnsDiffer: normal.bg !== forced.bg,
        fallbackOpaque: alphaOf(forced.bg) === 1,
      });
    } catch (e) {
      report.errors.push({ browser: name, stage: "fallback", message: String(e).slice(0, 300) });
    }
  }

  // ── 본 측정 ────────────────────────────────────────────────────────────
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      let ctx;
      try {
        ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await enterShell(page, BASE);
        for (const s of SCREENS) {
          await page.goto(`${BASE}${s.route}`, { waitUntil: "domcontentloaded" });
          await settle(page);
          const v = await page.evaluate(READ, TOUCH_SEL);
          const cell = { browser: name, scheme, width, screen: s.id, route: s.route, ...v };
          // 증상 있는 칸만 찍는다 — 전 칸 촬영은 상한 안에 안 들어온다(그것도 「안 잰 것」).
          if ((v.overflow || v.touchUnder.length > 0) && shots < 14) {
            const file = `t7a_${name}_${scheme}_${width}_${s.id}.png`;
            await page.screenshot({ path: path.join(OUT, file), fullPage: false });
            cell.shot = file;
            shots++;
          }
          report.cells.push(cell);
        }
      } catch (e) {
        report.errors.push({ browser: name, scheme, width, stage: "sweep", message: String(e).slice(0, 300) });
      } finally {
        if (ctx) await ctx.close().catch(() => {});
      }
    }
  }
  await browser.close();
  console.error(`[t7a] ${name} 완료 — 누적 ${report.cells.length}칸`);
}

// ── 요약(판정이 아니라 계수) ──────────────────────────────────────────────
const byBrowser = {};
for (const c of report.cells) {
  const b = (byBrowser[c.browser] ??= { cells: 0, overflow: 0, touchCells: 0, touchAll: 0, touchWidget: 0 });
  b.cells++;
  if (c.overflow) b.overflow++;
  if (c.touchUnder.length) b.touchCells++;
  b.touchAll += c.touchUnder.length;
  b.touchWidget += c.touchUnder.filter((u) => !u.inline).length;
}
report.summary = {
  expectedCells: BROWSERS.length * SCHEMES.length * WIDTHS.length * SCREENS.length,
  measuredCells: report.cells.length,
  byBrowser,
  shots,
};
fs.writeFileSync(path.join(OUT, "t7a-browser-compat.json"), JSON.stringify(report, null, 2), "utf8");
console.log(
  JSON.stringify(
    { summary: report.summary, controls: report.controls, fallback: report.fallback, engineSupport: report.engineSupport, errors: report.errors },
    null,
    2,
  ),
);

// 🔴 대조군이 안 울면 그 회차 초록은 근거가 아니다.
const dead = report.controls.filter((c) => !c.overflowDetectorFired || !c.touchDetectorFired);
if (report.controls.length === 0 || dead.length) {
  console.error("🔴 대조군 불발 — 판정기가 울지 않는 브라우저가 있다:", JSON.stringify(dead));
  process.exit(2);
}
