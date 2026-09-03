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
const WIDTHS = arg("widths", "390,768,1024,1280").split(",").map(Number);
const SCHEMES = arg("schemes", "light,dark").split(",");
/**
 * 🔴 pointer 축(T7 재측 준비 · 2026-09-03). 기본값 "false" = 종전 거동(마우스 열만).
 *    처방이 `max-width` → `(pointer: coarse)` 로 바뀌면 **폭이 아니라 pointer 로 갈려야** 하므로
 *    같은 그물이 두 열을 다 떠야 한다. `--pointers false,true` 로 2차원을 연다.
 *    🔴 손잡이는 `hasTouch` 하나인데 엔진은 `pointer:fine`·`hover:none` 까지 함께 민다(실측).
 *       그래서 «요청한 손잡이»가 아니라 «실제 매체 질의 값»을 칸마다 따로 기록한다.
 */
const POINTERS = arg("pointers", "false").split(",").map((v) => v === "true");
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
  // 🔴 «요청한 손잡이»가 아니라 «대상이 실제로 보는 값». 자극이 실재했는지는 여기서만 갈린다.
  const media = {
    pointerCoarse: matchMedia("(pointer: coarse)").matches,
    pointerFine: matchMedia("(pointer: fine)").matches,
    hoverNone: matchMedia("(hover: none)").matches,
  };
  // 위반을 «수»가 아니라 «자리»로 말하려면 안정된 이름표가 필요하다 — 처방 후
  // 「몇 건 남았나」가 아니라 「어느 자리가 남았나」를 말해야 부분 수리를 잡는다.
  const placeOf = (n) => {
    const tid = n.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
    const parts = [];
    for (let e = n; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      const cls = String(e.className || "").split(/\s+/).filter(Boolean)[0];
      parts.unshift(e.tagName.toLowerCase() + (cls ? "." + cls : ""));
    }
    return { testid: tid, path: parts.join(">") };
  };
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
      ...placeOf(n),
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
    media,
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
    await ctx.close();

    // 🔴 pointer 축이 이 엔진에서 «갈리는가». 처방이 `(pointer: coarse)` 로 바뀌면 이 축이
    //    판정선이 된다 — 두 열이 안 갈리면 처방 후 초록은 「고쳐졌다」가 아니라 «안 잰 것»이다.
    const mediaOf = async (hasTouch) => {
      const c = await browser.newContext({ viewport: { width: 1024, height: 800 }, hasTouch });
      const pg = await c.newPage();
      await pg.setContent("<html><body>probe</body></html>");
      const m = await pg.evaluate(() => ({
        pointerCoarse: matchMedia("(pointer: coarse)").matches,
        pointerFine: matchMedia("(pointer: fine)").matches,
        hoverNone: matchMedia("(hover: none)").matches,
      }));
      await c.close();
      return m;
    };
    const mMouse = await mediaOf(false);
    const mTouch = await mediaOf(true);

    report.controls.push({
      browser: name,
      overflowDetectorFired: !before.overflow && after.overflow,
      overflowBefore: `${before.scrollWidth}/${before.clientWidth}`,
      overflowAfter: `${after.scrollWidth}/${after.clientWidth}`,
      touchDetectorFired: Boolean(tiny),
      touchUnderDelta: after.touchUnder.length - before.touchUnder.length,
      // 🔴 손잡이 하나(`hasTouch`)가 세 매체 질의를 함께 민다 — 그 사실을 열로 남긴다.
      //    처방이 `hover` 를 섞어 쓰면 이 그물은 「어느 쪽이 걸었나」를 못 가른다.
      pointerAxisFired: mMouse.pointerCoarse === false && mTouch.pointerCoarse === true,
      pointerMouseColumn: mMouse,
      pointerTouchColumn: mTouch,
    });
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
   for (const hasTouch of POINTERS) {
    for (const width of WIDTHS) {
      let ctx;
      try {
        ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch });
        const page = await ctx.newPage();
        await enterShell(page, BASE);
        for (const s of SCREENS) {
          await page.goto(`${BASE}${s.route}`, { waitUntil: "domcontentloaded" });
          await settle(page);
          const v = await page.evaluate(READ, TOUCH_SEL);
          const cell = { browser: name, scheme, width, hasTouch, screen: s.id, route: s.route, ...v };
          // 증상 있는 칸만 찍는다 — 전 칸 촬영은 상한 안에 안 들어온다(그것도 「안 잰 것」).
          if ((v.overflow || v.touchUnder.length > 0) && shots < 14) {
            const file = `t7a_${name}_${scheme}_${width}_${hasTouch ? "coarse" : "fine"}_${s.id}.png`;
            await page.screenshot({ path: path.join(OUT, file), fullPage: false });
            cell.shot = file;
            shots++;
          }
          report.cells.push(cell);
        }
      } catch (e) {
        report.errors.push({ browser: name, scheme, width, hasTouch, stage: "sweep", message: String(e).slice(0, 300) });
      } finally {
        if (ctx) await ctx.close().catch(() => {});
      }
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
// 🔴 처방이 `max-width` → `(pointer: coarse)` 로 바뀌면 **폭이 아니라 pointer 로 갈려야** 한다.
//    그래서 계수를 «폭 × pointer» 2차원으로 편다. 한 축으로 접으면 그 이동이 안 보인다.
const grid = {};
for (const c of report.cells) {
  const k = `${c.width}|${c.hasTouch ? "coarse" : "fine"}`;
  const g = (grid[k] ??= { cells: 0, overflow: 0, uniq: new Set(), uniqWidget: new Set() });
  g.cells++;
  if (c.overflow) g.overflow++;
  for (const u of c.touchUnder) {
    const id = `${u.tag}|${u.role || "-"}|${u.text}`;
    g.uniq.add(id);
    if (!u.inline) g.uniqWidget.add(id);
  }
}
for (const k of Object.keys(grid)) {
  grid[k] = { cells: grid[k].cells, overflow: grid[k].overflow, uniq: grid[k].uniq.size, uniqWidget: grid[k].uniqWidget.size };
}

// 위반을 «자리»로 고정한다 — 처방(`.fkt-hit` 이름표)이 «어디에 붙었나»를 재는 축.
const places = new Map();
for (const c of report.cells) {
  for (const u of c.touchUnder) {
    const id = `${u.tag}|${u.role || "-"}|${u.text}`;
    const e = places.get(id) ?? {
      id, tag: u.tag, text: u.text, inline: u.inline, cls: u.cls,
      testid: u.testid, path: u.path,
      screens: new Set(), widths: new Set(), pointers: new Set(), engines: new Set(), dims: new Set(),
    };
    e.screens.add(c.screen); e.widths.add(c.width);
    e.pointers.add(c.hasTouch ? "coarse" : "fine"); e.engines.add(c.browser);
    e.dims.add(`${u.w}x${u.h}`);
    places.set(id, e);
  }
}
report.places = [...places.values()].map((e) => ({
  ...e,
  screens: [...e.screens], widths: [...e.widths].sort((a, b) => a - b),
  pointers: [...e.pointers], engines: [...e.engines], dims: [...e.dims],
}));

report.summary = {
  expectedCells: BROWSERS.length * SCHEMES.length * POINTERS.length * WIDTHS.length * SCREENS.length,
  measuredCells: report.cells.length,
  axes: { browsers: BROWSERS, schemes: SCHEMES, widths: WIDTHS, pointers: POINTERS },
  byBrowser,
  byWidthPointer: grid,
  places: report.places.length,
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
const needPointer = POINTERS.length > 1;
const dead = report.controls.filter(
  (c) => !c.overflowDetectorFired || !c.touchDetectorFired || (needPointer && !c.pointerAxisFired),
);
if (report.controls.length === 0 || dead.length) {
  console.error("🔴 대조군 불발 — 판정기가 울지 않는 브라우저가 있다:", JSON.stringify(dead));
  process.exit(2);
}
