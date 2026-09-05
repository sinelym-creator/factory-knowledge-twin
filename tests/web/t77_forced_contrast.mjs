/**
 * T7-7 — 강제 색 모드(`forced-colors: active`) 가독성 대비비 재측.
 *
 * 🔴 **교정 게이트가 전수보다 «먼저»다.** T7-16 초안의 실패 47건은 전부 `1.00` 이었고,
 *    표본 1(앱 바 `Factory Twin`)의 실제 값은 **21:1** 이었다 — 규칙(「배경이 투명이면 부모로」)은
 *    맞았는데 **태운 자리가 틀렸다**. 그래서 이 그물은 두 칸이 «같은 실행에서» 서지 않으면
 *    전수로 가지 않는다(`exit 2`):
 *      ⓐ 참값  : 앱 바 브랜드 글자가 **21:1** 로 나온다      (계기가 옳은 값을 낸다)
 *      ⓑ 심은 빨강: `#777` 위 `#888` 글자 하나가 **≈1.2:1 실패**로 잡힌다 (계기가 «문다»)
 *    ⓐ 만 있으면 「전부 통과시키는 자」와 구별되지 않고, ⓑ 만 있으면 참값을 못 낸다.
 * 🔴 **`1.00` 은 결과가 아니라 계기 결함 신호다** — 통과·실패 어느 버킷에도 넣지 않고
 *    «측정 불가(fg==bg)» 로 사유와 함께 센다.
 * 🔴 글자색 알파 0 = «측정 불가», 반투명 = 유효 배경 위로 **1회 합성** 후 그래도 안 되면 이름으로.
 * 🔴 강제 색 모드에서는 저작자 색이 무시된다 — 심은 빨강은 `forced-color-adjust: none` 을 달고,
 *    **심은 색이 실제로 계산됐는지 확인한 뒤에만** 교정으로 인정한다(안 그러면 안 심고 심었다고 한다).
 * 🔴 화면·무대·경로는 인자. 콘솔 문면은 ASCII.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const OUT = args.get("out");
const RUN = args.get("run") ?? null;
const SCHEMES = (args.get("schemes") ?? "light,dark").split(",");
const SETTLE = Number(args.get("settle") ?? 1200);
if (!BASE || !OUT) {
  console.error("usage: node t77_forced_contrast.mjs --base URL --out o.json [--run STATIC-ID] [--schemes light,dark]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "/"))("playwright");

/** 브라우저 안에서 도는 채집기. 반환은 순수 데이터. */
const COLLECT = `(opts) => {
  const RGBA = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({ // fg 를 bg 위에 1회 합성
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };

  // 시스템 Canvas 색 — 조상 사슬이 끝까지 투명일 때의 «진짜 바닥».
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-9999px;background-color:Canvas";
  document.body.appendChild(probe);
  const canvasBg = RGBA(getComputedStyle(probe).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  probe.remove();

  /** 유효 배경 = 자기 배경 알파 0 이면 부모로. 반투명이면 그 위 배경과 1회 합성. */
  const effBg = (el) => {
    const stack = [];
    let n = el, guard = 0;
    while (n && guard < 40) {
      const c = RGBA(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
      n = n.parentElement; guard += 1;
    }
    let base = { ...canvasBg, a: 1 };
    if (stack.length && stack[stack.length - 1].a >= 1) base = { ...stack.pop(), a: 1 };
    while (stack.length) base = over(stack.pop(), base);
    return { color: base, depth: guard, hitCanvas: base === canvasBg };
  };

  const keyOf = (el) => {
    let p = "";
    for (let n = el, g = 0; n && n !== document.body && g < 40; n = n.parentElement, g += 1) {
      p = Array.prototype.indexOf.call(n.parentElement?.children ?? [], n) + ">" + p;
    }
    return (el.getAttribute("data-testid") ?? "") + "|" + el.tagName + "|" + p;
  };

  const rows = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const shown = cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
    if (!shown) continue;
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
    if (!ownText) continue;

    const fg0 = RGBA(cs.color);
    const bgInfo = effBg(el);
    const bg = bgInfo.color;
    const size = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const text = (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 40);
    const row = { key: keyOf(el), testid: el.getAttribute("data-testid"), tag: el.tagName, text, size, weight, large, need,
                  fg: cs.color, bg: \`rgb(\${Math.round(bg.r)}, \${Math.round(bg.g)}, \${Math.round(bg.b)})\`, bgDepth: bgInfo.depth };

    if (!fg0) { row.bucket = "unmeasurable"; row.why = "color-unparsed"; rows.push(row); continue; }
    if (fg0.a === 0) { row.bucket = "unmeasurable"; row.why = "text-alpha-0"; rows.push(row); continue; }
    const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    row.composited = fg0.a < 1;
    const v = ratio(fg, bg);
    row.ratio = Math.round(v * 100) / 100;
    if (row.ratio === 1) { row.bucket = "unmeasurable"; row.why = "fg-equals-bg (instrument suspect)"; }
    else row.bucket = v >= need ? "pass" : "fail";
    rows.push(row);
  }
  return { canvasBg: \`rgb(\${canvasBg.r}, \${canvasBg.g}, \${canvasBg.b})\`, rows };
}`;

async function collect(page) {
  return page.evaluate(new Function("return " + COLLECT)(), {});
}

/** 교정 ⓑ — 강제 색을 «끄고» 심은 색을 실제로 계산시킨다. 안 심겼으면 교정 실패다. */
async function plantRed(page) {
  return page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "t77-planted";
    box.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:2147483647;background-color:#777777;forced-color-adjust:none;padding:6px";
    const s = document.createElement("span");
    s.textContent = "planted low contrast";
    s.style.cssText = "color:#888888;font-size:16px;forced-color-adjust:none";
    box.appendChild(s);
    document.body.appendChild(box);
    const cs = getComputedStyle(s);
    const cb = getComputedStyle(box);
    return { color: cs.color, background: cb.backgroundColor };
  });
}

const out = { base: BASE, schemes: SCHEMES, settleMs: SETTLE, calibration: {}, screens: [], consoleErrors: [] };

const browser = await chromium.launch();
try {
  // ---------- ① 교정 게이트 ----------
  const cctx = await browser.newContext({ forcedColors: "active", colorScheme: "light", viewport: { width: 1280, height: 900 } });
  const cpage = await cctx.newPage();
  await cpage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await cpage.waitForSelector('[data-testid="enter-button"]', { timeout: 30000 });
  try {
    await cpage.locator('[data-testid="enter-button"]').click({ timeout: 8000, force: true });
  } catch {
    await cpage.evaluate(() => document.querySelector('[data-testid="entry-form"]')?.requestSubmit());
  }
  await cpage.waitForURL("**/overview", { timeout: 60000 });
  await cpage.waitForTimeout(SETTLE);

  const planted = await plantRed(cpage);
  const c = await collect(cpage);
  out.calibration.canvasBg = c.canvasBg;
  out.calibration.plantedComputed = planted;
  out.calibration.plantedColorsHeld =
    /136/.test(planted.color) && /119/.test(planted.background); // #888=136, #777=119

  const brand = c.rows.find((r) => r.testid === "app-brand" || /Factory Twin/i.test(r.text));
  const red = c.rows.find((r) => /planted low contrast/.test(r.text));
  out.calibration.truth = brand ? { key: brand.key, text: brand.text, ratio: brand.ratio, fg: brand.fg, bg: brand.bg, bucket: brand.bucket } : null;
  out.calibration.planted = red ? { ratio: red.ratio, fg: red.fg, bg: red.bg, bucket: red.bucket } : null;
  out.calibration.aTruthIs21 = !!brand && brand.ratio >= 20.5;
  out.calibration.bPlantedFails = !!red && red.bucket === "fail" && red.ratio <= 1.5;
  out.calibration.gate = out.calibration.aTruthIs21 && out.calibration.bPlantedFails && out.calibration.plantedColorsHeld;
  await cctx.close();

  if (!out.calibration.gate) {
    out.abort = "calibration gate failed - sweep not run";
    process.stdout.write(JSON.stringify(out, null, 1) + String.fromCharCode(10));
    const fs = await import("node:fs");
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    await browser.close();
    process.exit(2);
  }

  // ---------- ② 전수 ----------
  const SCREENS = [
    { name: "overview", url: "/overview", w: 1280 },
    { name: "incidents", url: "/incidents", w: 1280 },
    { name: "incident-detail", url: `/incidents/INC-2026-014${RUN ? `?run=${encodeURIComponent(RUN)}` : ""}`, w: 1280 },
    { name: "compare", url: "/compare", w: 1280 },
    { name: "documents", url: "/documents/DOC-MAN-0021", w: 1280 },
    { name: "tour-step1", url: "/overview", w: 1280, tour: true },
    { name: "drawer-390", url: "/overview", w: 390, drawer: true },
  ];

  for (const scheme of SCHEMES) {
    for (const s of SCREENS) {
      const ctx = await browser.newContext({ forcedColors: "active", colorScheme: scheme, viewport: { width: s.w, height: 900 } });
      const page = await ctx.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") out.consoleErrors.push(`${scheme}/${s.name}: ${m.text().slice(0, 120)}`);
      });
      const rec = { scheme, screen: s.name, url: s.url, w: s.w };
      try {
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="enter-button"]', { timeout: 30000 });
        try {
          await page.locator('[data-testid="enter-button"]').click({ timeout: 8000, force: true });
        } catch {
          await page.evaluate(() => document.querySelector('[data-testid="entry-form"]')?.requestSubmit());
        }
        await page.waitForURL("**/overview", { timeout: 60000 });
        if (s.url !== "/overview") await page.goto(`${BASE}${s.url}`, { waitUntil: "domcontentloaded" });
        if (s.tour) {
          await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
          await page.locator('[data-testid="tour-start"]').click({ force: true });
          await page.waitForSelector('[data-testid="tour-callout"]', { timeout: 20000 });
        }
        if (s.drawer) {
          await page.locator('[data-testid="nav-menu-toggle"]').click({ force: true });
          await page.waitForSelector('[data-testid="nav-drawer"]', { timeout: 20000 });
        }
        await page.waitForTimeout(SETTLE);
        const got = await collect(page);
        rec.canvasBg = got.canvasBg;
        rec.total = got.rows.length;
        rec.pass = got.rows.filter((r) => r.bucket === "pass").length;
        rec.fail = got.rows.filter((r) => r.bucket === "fail").length;
        rec.unmeasurable = got.rows.filter((r) => r.bucket === "unmeasurable").length;
        rec.unmeasurableWhy = {};
        for (const r of got.rows.filter((x) => x.bucket === "unmeasurable")) {
          rec.unmeasurableWhy[r.why] = (rec.unmeasurableWhy[r.why] ?? 0) + 1;
        }
        rec.fails = got.rows
          .filter((r) => r.bucket === "fail")
          .map((r) => ({ key: r.key, testid: r.testid, text: r.text, fg: r.fg, bg: r.bg, ratio: r.ratio, need: r.need, large: r.large }));
      } catch (e) {
        rec.error = String(e).slice(0, 200);
      }
      out.screens.push(rec);
      await ctx.close();
    }
  }

  out.summary = {
    total: out.screens.reduce((a, s) => a + (s.total ?? 0), 0),
    pass: out.screens.reduce((a, s) => a + (s.pass ?? 0), 0),
    fail: out.screens.reduce((a, s) => a + (s.fail ?? 0), 0),
    unmeasurable: out.screens.reduce((a, s) => a + (s.unmeasurable ?? 0), 0),
    screensWithError: out.screens.filter((s) => s.error).length,
  };
} finally {
  await browser.close();
}

const fs = await import("node:fs");
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
process.stdout.write(JSON.stringify({ calibration: out.calibration, summary: out.summary, abort: out.abort ?? null }, null, 1) + String.fromCharCode(10));
process.exit(out.summary && out.summary.fail > 0 ? 1 : 0);
