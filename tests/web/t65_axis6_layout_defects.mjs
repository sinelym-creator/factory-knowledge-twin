/**
 * T6-4/T6-5 축 ⑥ — **「후」 50칸의 시각 검수를 «값»으로 판정한다.**
 *
 * 「예쁜가」는 판정이 아니다. 여기서 세는 것은 요소 단위로 되돌릴 수 있는 네 가지뿐이다:
 *   ① 가로 넘침(body) ② 잘린 요소(`scrollWidth > clientWidth`) ③ 겹친 쌍(형제끼리 bounding box
 *   교차) ④ 대비 미달(본문 텍스트 < 4.5:1 · t6-4 spec ⑤).
 * 50칸 = 5화면 × 5뷰포트(390·768·1024·1280·1440 · t6-4 ⑧) × 2 colorScheme.
 *
 * 🔴 **네 검사기 각각에 제 대조군을 붙인다**(같은 실행 · 마지막 칸에서). 넓힌 검사기가 무는지
 *    묻지 않으면 「0 건」은 깨끗함이 아니라 눈이 죽은 것이다 — 넷 중 하나라도 안 물면 exit 2.
 * 🔴 겹침은 «부모-자식»을 세지 않는다(그건 정상 포함이다). 형제 관계만, 그리고 떠 있는 층
 *    (position fixed/absolute)이 문서 흐름 카드를 덮는 경우를 본다 — 사람이 「가려졌다」고
 *    느끼는 것이 그것이다.
 *
 * 사용: node t65_axis6_layout_defects.mjs --base http://127.0.0.1:3107 --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3107");
const OUT = arg("out", "");

const SCREENS = [
  { id: "overview", route: "/overview" },
  { id: "incident", route: "/incidents/INC-2026-014?run=STATIC-GS-01" },
  { id: "evidence", route: "/evidence/MR-2025-0087?run=STATIC-GS-01" },
  { id: "work-order", route: "/work-orders/WO-2025-001" },
  { id: "compare", route: "/compare" },
];
const WIDTHS = [390, 768, 1024, 1280, 1440];
const SCHEMES = ["dark", "light"];

/** 브라우저 안에서 도는 검사기 — 네 지표를 한 번에 뽑는다. */
const PROBE = () => {
  const lum = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    if (a !== undefined && a < 0.9) return null; // 반투명은 배경 추적이 부정확 — 세지 않는다
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const l = lum(bg);
      if (l !== null) return l;
      n = n.parentElement;
    }
    return lum(getComputedStyle(document.body).backgroundColor);
  };

  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };

  // ① body 가로 넘침
  const overflowPx = document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth;

  // ② 잘린 요소 — 가로로 내용이 상자를 넘는데 스크롤 컨테이너가 아닌 것
  const clipped = [];
  for (const el of document.querySelectorAll("[data-testid]")) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const scrollable = cs.overflowX === "auto" || cs.overflowX === "scroll";
    if (!scrollable && el.scrollWidth > el.clientWidth + 1) {
      clipped.push({ id: el.getAttribute("data-testid"), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }

  // ③ 겹친 쌍 — 떠 있는 층이 문서 흐름 요소를 덮는 경우(부모-자식 제외)
  const nodes = [...document.querySelectorAll("[data-testid]")].filter(vis);
  const overlaps = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      const y = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      const area = x * y;
      if (area <= 4) continue;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      const pct = smaller > 0 ? (100 * area) / smaller : 0;
      if (pct < 20) continue; // 스치는 겹침은 세지 않는다 — 사람이 「가려졌다」고 느끼는 선만
      overlaps.push({
        a: a.getAttribute("data-testid"),
        b: b.getAttribute("data-testid"),
        areaPx2: Math.round(area),
        coveredPct: Number(pct.toFixed(1)),
      });
    }
  }

  // ④ 대비 — 본문 텍스트(≥12px)만, 4.5:1 기준(t6-4 ⑤)
  const lowContrast = [];
  for (const el of document.querySelectorAll("p, span, td, th, li, a, button, h1, h2, h3")) {
    if (!vis(el)) continue;
    const t = (el.textContent ?? "").trim();
    if (!t || t.length < 2) continue;
    if ([...el.children].some((c) => (c.textContent ?? "").trim().length > 0)) continue; // 잎만
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < 12) continue;
    const fg = lum(cs.color);
    const bg = bgOf(el);
    if (fg === null || bg === null) continue;
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    const large = size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700;
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      lowContrast.push({
        text: t.slice(0, 40),
        ratio: Number(ratio.toFixed(2)),
        need,
        fontSize: size,
        color: cs.color,
      });
    }
  }

  return { overflowPx, clipped, overlaps, lowContrast, testidCount: nodes.length };
};

const report = { base: BASE, at: new Date().toISOString(), cells: [] };
const browser = await chromium.launch();

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 900 },
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    // 셸 입장 1회
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const auto = await page
      .waitForURL(/\/overview/, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!auto) {
      await page
        .getByRole("link", { name: /입장하기/ })
        .or(page.getByRole("button", { name: /입장하기/ }))
        .first()
        .click({ timeout: 10_000 })
        .catch(() => {});
      await page.waitForURL(/\/overview/, { timeout: 45_000 }).catch(() => {});
    }

    for (const s of SCREENS) {
      await page.goto(`${BASE}${s.route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const probe = await page.evaluate(PROBE);
      report.cells.push({ screen: s.id, width, scheme, ...probe });
    }
    await ctx.close();
  }
}

/* 🔴 네 검사기의 대조군 — 위반을 «실제로 심고» 같은 검사기로 다시 본다. */
const ctrlCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
const ctrlPage = await ctrlCtx.newPage();
await ctrlPage.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
await ctrlPage.waitForTimeout(1200);
const before = await ctrlPage.evaluate(PROBE);
await ctrlPage.evaluate(() => {
  const mk = (id, css, text) => {
    const d = document.createElement("div");
    d.setAttribute("data-testid", id);
    d.style.cssText = css;
    d.textContent = text ?? "";
    document.body.appendChild(d);
    return d;
  };
  // ① 가로 넘침 ② 잘린 요소
  mk("levi2-ctrl-overflow", "position:absolute;top:0;left:0;width:3000px;height:8px;background:#111");
  const clip = mk("levi2-ctrl-clip", "width:80px;overflow:hidden;white-space:nowrap;", "아주 긴 문자열".repeat(8));
  clip.style.position = "relative";
  // ③ 겹친 쌍 — 떠 있는 층이 다른 요소를 덮는다
  const base = mk("levi2-ctrl-under", "position:fixed;top:300px;left:300px;width:200px;height:200px;background:#222");
  mk("levi2-ctrl-over", "position:fixed;top:320px;left:320px;width:200px;height:200px;background:#333;z-index:9");
  void base;
  // ④ 대비 미달
  const p = document.createElement("p");
  p.style.cssText = "color:#3a3a3a;background:#2e2e2e;font-size:14px;";
  p.textContent = "대조군 저대비 문장";
  document.body.appendChild(p);
});
const after = await ctrlPage.evaluate(PROBE);
await ctrlCtx.close();
await browser.close();

const bumped = {
  overflow: after.overflowPx > before.overflowPx,
  clipped: after.clipped.length > before.clipped.length,
  overlaps: after.overlaps.length > before.overlaps.length,
  lowContrast: after.lowContrast.length > before.lowContrast.length,
};
report.control = { before: { overflowPx: before.overflowPx, clipped: before.clipped.length, overlaps: before.overlaps.length, lowContrast: before.lowContrast.length }, after: { overflowPx: after.overflowPx, clipped: after.clipped.length, overlaps: after.overlaps.length, lowContrast: after.lowContrast.length }, bumped };

report.summary = {
  cells: report.cells.length,
  overflowCells: report.cells.filter((c) => c.overflowPx > 0).map((c) => ({ screen: c.screen, width: c.width, scheme: c.scheme, px: c.overflowPx })),
  clippedTotal: report.cells.reduce((n, c) => n + c.clipped.length, 0),
  overlapTotal: report.cells.reduce((n, c) => n + c.overlaps.length, 0),
  lowContrastTotal: report.cells.reduce((n, c) => n + c.lowContrast.length, 0),
  worstOverlaps: report.cells
    .flatMap((c) => c.overlaps.map((o) => ({ screen: c.screen, width: c.width, scheme: c.scheme, ...o })))
    .sort((a, b) => b.coveredPct - a.coveredPct)
    .slice(0, 10),
  clippedExamples: report.cells
    .flatMap((c) => c.clipped.map((x) => ({ screen: c.screen, width: c.width, scheme: c.scheme, ...x })))
    .slice(0, 10),
  contrastExamples: report.cells
    .flatMap((c) => c.lowContrast.map((x) => ({ screen: c.screen, width: c.width, scheme: c.scheme, ...x })))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 10),
  control: bumped,
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

if (report.cells.length !== SCREENS.length * WIDTHS.length * SCHEMES.length) {
  console.error("STAGE MISSING — 칸 수가 50 이 아니다", report.cells.length);
  process.exit(2);
}
if (!Object.values(bumped).every(Boolean)) {
  console.error("CONTROL DID NOT DISCRIMINATE", JSON.stringify(bumped));
  process.exit(2);
}
const clean =
  report.summary.overflowCells.length === 0 &&
  report.summary.clippedTotal === 0 &&
  report.summary.overlapTotal === 0 &&
  report.summary.lowContrastTotal === 0;
process.exit(clean ? 0 : 1);
