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
  /**
   * 🔴 «눌리는 영역»을 잰다 — `getBoundingClientRect` 로는 못 본다.
   *
   * T7 처방(C 갈래)은 **보이는 크기 불변 · `::before` 로 히트 영역만 확장**이다. 그러면 요소의
   * 시각 상자는 한 픽셀도 안 바뀌고, rect 만 재는 판정선은 **처방이 완벽히 착지해도 그대로
   * 빨강**을 낸다. 그 빨강은 대상의 것이 아니라 **내 계측기가 못 본 것**이다.
   *
   * 그래서 중심에서 4방향으로 `elementFromPoint` 를 1px 씩 밀어 **그 요소가 실제로 잡히는
   * 연속 영역**을 잰다. `::before` 위의 점은 원소유 요소를 돌려주므로 확장이 값으로 보인다.
   * 🔴 `pointer-events:none` 인 `::before` 는 여기서 **안 잡힌다** — 그리고 실제로도 안 눌린다.
   *    즉 이 자는 「그림으로 넓힌 것」과 「눌리게 넓힌 것」을 가른다.
   */
  const HIT_MAX = 40; // 44 판정에 필요한 만큼만 — 상한이 없으면 큰 부모까지 타고 올라간다
  const hitBoxOf = (n, r) => {
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const owns = (el) => Boolean(el) && (el === n || n.contains(el));
    // 중심이 안 잡히면(가림막·오버레이) 이 칸은 «못 잰 것»이다 — 0 으로 적으면 결함이 된다.
    if (!owns(document.elementFromPoint(cx, cy))) return { ownedCenter: false, w: null, h: null };
    const scan = (dx, dy) => {
      const limit = Math.ceil((dx ? r.width : r.height) / 2) + HIT_MAX;
      let d = 0;
      for (let k = 1; k <= limit; k++) {
        const x = cx + dx * k;
        const y = cy + dy * k;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) break;
        if (!owns(document.elementFromPoint(x, y))) break;
        d = k;
      }
      return d;
    };
    return { ownedCenter: true, w: scan(-1, 0) + scan(1, 0) + 1, h: scan(0, -1) + scan(0, 1) + 1 };
  };

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
    // 시각 상자가 44 미만인 것만 히트 영역을 잰다 — 판정이 갈리는 자리가 거기뿐이고,
    // 전수로 재면 한 칸에 elementFromPoint 수만 회가 든다.
    const hit = hitBoxOf(n, r);
    under.push({
      tag: n.tagName.toLowerCase(),
      role: n.getAttribute("role"),
      cls: String(n.className || "").slice(0, 70),
      text: (n.textContent || "").trim().slice(0, 28),
      w,
      h,
      // 🔴 두 판정선을 «둘 다» 남긴다. 하나로 접으면 처방 전후의 수가 무엇 때문에
      //    움직였는지(시각이 커졌나 · 히트만 넓어졌나) 못 가른다.
      hitW: hit.w,
      hitH: hit.h,
      hitOwnedCenter: hit.ownedCenter,
      // 🔴 층을 둘 다 적는다 — `::before` 의 **computed** 치수(소수 그대로)와, 실제로 **눌리는**
      //    지점(내 스캔 · 정수 해상도)은 다른 층이다. 두 값이 갈리면 «어느 층에서 잃는지»가 보인다.
      beforeBox: (() => {
        const b = getComputedStyle(n, "::before");
        if (!b || b.content === "none") return null;
        return { w: b.width, h: b.height, pos: b.position };
      })(),
      hitPasses: hit.ownedCenter && Math.min(hit.w, hit.h) >= 44,
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
    // 🔴 히트 영역 판정선의 대조군 — 처방 전이라 «확장된 요소»가 하나도 없다. 그러니
    //    확장을 **내가 주입해서** 계측기가 그것을 보는지 증명한다. 안 보이면 처방이 착지해도
    //    내 그물은 계속 빨강을 내고, 그 빨강은 대상의 것이 아니다.
    //    ⓐ 눌리게 넓힌 것 / ⓑ 그림으로만 넓힌 것(`pointer-events:none`) 두 열을 함께 심어,
    //    이 자가 그 둘을 «가르는지»까지 본다. 못 가르면 처방 검수에서 가짜 초록이 난다.
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.textContent =
        // 🔴 `position:fixed` 로 «보이는 자리»에 세운다. 첫 판에서 body 끝에 붙였다가 접힌 화면
        //    아래로 나가 `elementFromPoint` 가 null 을 냈다 — 대조군이 «안 울린» 게 아니라
        //    **내가 화면 밖에 세운 것**이었다(계측기가 먼저 거짓말한다).
        // 🔴 글자를 «가둔다». 첫 판에서 라벨(HITOFF)이 30px 상자를 넘쳐, 넘친 글자가 그대로
        //    히트 영역이 되어 ⓑ 의 가로가 51 로 나왔다 — 대상이 아니라 **내 대조군이 만든 값**이다.
        //    🔴 그 정정으로 `overflow:hidden` 을 썼더니 이번엔 ⓐ 의 `::before` 가 **잘려서**
        //       두 열이 30×30 으로 같아졌다. 계측기를 고치다 계측기를 또 죽인 자리다 —
        //       글자를 가두는 대신 **글자를 작게** 해서 상자 안에 들어오게 한다.
        "#__hitctrl_on,#__hitctrl_off{position:fixed;left:120px;width:30px;height:30px;padding:0;z-index:99999;background:#333;font-size:6px;line-height:1}" +
        "#__hitctrl_on{top:120px}#__hitctrl_off{top:220px}" +
        '#__hitctrl_on::before{content:"";position:absolute;inset:-10px}' +
        '#__hitctrl_off::before{content:"";position:absolute;inset:-10px;pointer-events:none}';
      document.head.appendChild(st);
      // 🔴 판정선 교정(T7 재측 조건 1) — 「두 사람의 44 가 다른 44 일 수 있다」.
      //    구현 좌석의 프로브는 48 을 47 로 읽었다(1px 먹음). 내 히트 스캔은 1px 해상도라
      //    반대로 **1px 더 준다**(기준선에서 히트 = 시각 +1). 어느 쪽이든 **43 을 44 로 통과시키거나
      //    44 를 43 으로 떨어뜨리면 처방의 공로와 내 오차가 섞인다.**
      //    그래서 48·44·43 세 표본을 같은 실행에 심어 **내 판정선이 각각 무엇을 내는지** 찍는다.
      for (const px of [48, 44, 43]) {
        const cal = document.createElement("button");
        cal.id = `__cal_${px}`;
        cal.textContent = `C${px}`;
        cal.style.cssText = `position:fixed;left:320px;top:${px === 48 ? 120 : px === 44 ? 220 : 320}px;width:${px}px;height:${px}px;padding:0;z-index:99999;background:#333;font-size:6px;line-height:1`;
        document.body.appendChild(cal);
      }
      for (const id of ["__hitctrl_on", "__hitctrl_off"]) {
        const b = document.createElement("button");
        b.id = id;
        b.textContent = id === "__hitctrl_on" ? "A" : "B";
        document.body.appendChild(b);
      }
    });
    await page.waitForTimeout(120);
    const after = await page.evaluate(READ, TOUCH_SEL);

    const tiny = after.touchUnder.find((u) => u.w === 20 && u.h === 20);
    // 44·48 은 시각이 이미 ≥44 라 `touchUnder` 에 안 들어온다 — 그래서 페이지에서 직접 읽는다.
    const cal = await page.evaluate(() => {
      const out = {};
      for (const px of [48, 44, 43]) {
        const n = document.getElementById(`__cal_${px}`);
        if (!n) {
          out[px] = null;
          continue;
        }
        const r = n.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        const owns = (el) => Boolean(el) && (el === n || n.contains(el));
        const scan = (dx, dy) => {
          let d = 0;
          for (let k = 1; k <= 80; k++) {
            const x = cx + dx * k;
            const y = cy + dy * k;
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) break;
            if (!owns(document.elementFromPoint(x, y))) break;
            d = k;
          }
          return d;
        };
        out[px] = {
          visual: `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`,
          hit: `${scan(-1, 0) + scan(1, 0) + 1}x${scan(0, -1) + scan(0, 1) + 1}`,
        };
      }
      return out;
    });

    const hitOn = after.touchUnder.find((u) => u.text === "A" && u.w === 30);
    const hitOff = after.touchUnder.find((u) => u.text === "B" && u.w === 30);
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
      // 히트 축 대조군 — 두 값이 «갈려야» 이 축이 살아 있다.
      hitCtrlOn: hitOn ? { visual: `${hitOn.w}x${hitOn.h}`, hit: `${hitOn.hitW}x${hitOn.hitH}`, passes: hitOn.hitPasses } : null,
      hitCtrlOff: hitOff ? { visual: `${hitOff.w}x${hitOff.h}`, hit: `${hitOff.hitW}x${hitOff.hitH}`, passes: hitOff.hitPasses } : null,
      // 🔴 ⓐ 는 시각 30×30 그대로인데 히트가 «커져야» 하고, ⓑ 는 안 커져야 한다.
      // 🔴 교정표 — 판정문 맨 앞에 둔다. 이 값을 안 보고 44 를 말하면 남의 44 를 말하는 것이다.
      calibration: cal,
      hitAxisFired:
        Boolean(hitOn && hitOff) &&
        hitOn.hitW > hitOn.w &&
        hitOff.hitW === hitOff.w &&
        hitOn.w === 30 &&
        hitOff.w === 30,
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
/**
 * 🔴 «자리»의 이름 — `tag|role|text` 로는 부족하다(2026-09-03 실증).
 *    폭이 벌어지면 앱바 네비가 접히고 **다른 자리**의 링크가 같은 글자로 뜬다:
 *      390 = `app-bar` 안의 pill 75×27.5 / ≥768 = 이름표 없는 레일 링크 236×36.
 *    텍스트만으로 접으면 그 둘이 한 줄이 되고, 처방 사정거리에서 **세 자리가 사라진다**.
 *    그래서 이름표(testid)와 DOM 경로를 키에 넣는다 — 자리가 다르면 줄도 달라야 한다.
 */
const placeId = (u) => `${u.tag}|${u.role || "-"}|${u.text}|${u.testid ?? "-"}|${u.path ?? "-"}`;

// 🔴 처방이 `max-width` → `(pointer: coarse)` 로 바뀌면 **폭이 아니라 pointer 로 갈려야** 한다.
//    그래서 계수를 «폭 × pointer» 2차원으로 편다. 한 축으로 접으면 그 이동이 안 보인다.
const grid = {};
for (const c of report.cells) {
  const k = `${c.width}|${c.hasTouch ? "coarse" : "fine"}`;
  const g = (grid[k] ??= { cells: 0, overflow: 0, uniq: new Set(), uniqWidget: new Set() });
  g.cells++;
  if (c.overflow) g.overflow++;
  for (const u of c.touchUnder) {
    const id = placeId(u);
    g.uniq.add(id);
    if (!u.inline) g.uniqWidget.add(id);
    // 🔴 히트 판정선 = 「눌리는 영역이 44 미만」. 처방(C)이 착지하면 이 수만 줄고
    //    시각 판정선(uniq)은 그대로여야 한다 — 그 «갈림»이 처방이 원칙 ④를 지켰다는 증거다.
    (g.hitFail ??= new Set());
    if (!u.hitPasses) g.hitFail.add(id);
  }
}
for (const k of Object.keys(grid)) {
  grid[k] = {
    cells: grid[k].cells,
    overflow: grid[k].overflow,
    uniqVisual: grid[k].uniq.size,
    uniqVisualWidget: grid[k].uniqWidget.size,
    uniqHitFail: (grid[k].hitFail ?? new Set()).size,
  };
}

// 위반을 «자리»로 고정한다 — 처방(`.fkt-hit` 이름표)이 «어디에 붙었나»를 재는 축.
const places = new Map();
for (const c of report.cells) {
  for (const u of c.touchUnder) {
    const id = placeId(u);
    const e = places.get(id) ?? {
      id, tag: u.tag, text: u.text, inline: u.inline, cls: u.cls,
      testid: u.testid, path: u.path,
      screens: new Set(), widths: new Set(), pointers: new Set(), engines: new Set(), dims: new Set(),
      hitDims: new Set(), hitPassCells: 0, cells: 0,
    };
    e.cells++;
    if (u.hitPasses) e.hitPassCells++;
    if (u.hitW != null) e.hitDims.add(`${u.hitW}x${u.hitH}`);
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
  hitDims: [...e.hitDims],
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
  (c) => !c.overflowDetectorFired || !c.touchDetectorFired || !c.hitAxisFired || (needPointer && !c.pointerAxisFired),
);
if (report.controls.length === 0 || dead.length) {
  console.error("🔴 대조군 불발 — 판정기가 울지 않는 브라우저가 있다:", JSON.stringify(dead));
  process.exit(2);
}
