/**
 * 축 ⓕ **발광 노드 = 정확히 1개** · 축 ⓖ **투명도 감소에서 Glass·Glow 끔**.
 *
 * 정본 = 폐하 자료 §15(「AI 분석 실행 버튼에만 약한 Blue Glow」 · 피해야 할 것 「모든 버튼과
 * 카드에 Glow」) · §7.2(접근성 설정의 투명도 감소 고려) · `globals.css` 의 두 규칙
 * (`.fkt-glow-ai` / `@media (prefers-reduced-transparency: reduce)`).
 *
 * 🔴 **이 축의 자극은 Playwright 가 못 건다.** `emulateMedia` 에 `prefers-reduced-transparency`
 *    가 없어서, 그대로 두면 **자극이 안 실린 채 조용히 초록**이 난다(구현 좌석의 계측기가 바로
 *    그 자리에서 죽었다). 그래서 CDP `Emulation.setEmulatedMedia` 로 걸고, **브라우저에
 *    `matchMedia(...).matches` 를 되물어** true 가 아니면 빨강이 아니라 `exit 2` 로 끝낸다.
 * 🔴 **클래스가 붙었는가»가 아니라 «렌더된 값이 그런가»를 본다** — `.fkt-glow-ai` 를 세는 동시에
 *    computed `box-shadow` 를 읽는다. 클래스만 세면 CSS 가 안 실려도 초록이 난다.
 * 🔴 대조군 = 같은 실행의 «투명도 감소 끔» 열. 그 열에서 glass 의 backdrop-filter 와 glow 의
 *    box-shadow 가 **살아 있어야** 이 측정에 판정력이 있다.
 *
 * 사용: node t65_glow_transparency_drill.mjs --base http://127.0.0.1:3107 --out <json>
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

const PROBE = () => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const glowNodes = [...document.querySelectorAll(".fkt-glow-ai")].filter(seen);
  const primaries = [...document.querySelectorAll(".fkt-btn-primary")].filter(seen);
  const glass = [...document.querySelectorAll(".fkt-glass")].filter(seen);
  const alphaOf = (c) => {
    const m = c.match(/[\d.]+/g);
    return m && m.length >= 4 ? Number(m[3]) : 1;
  };
  return {
    media: {
      reducedTransparency: window.matchMedia("(prefers-reduced-transparency: reduce)").matches,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    glowClassCount: glowNodes.length,
    glowRendered: glowNodes.map((el) => ({
      text: (el.textContent ?? "").trim().slice(0, 20),
      boxShadow: getComputedStyle(el).boxShadow,
      isNone: getComputedStyle(el).boxShadow === "none",
    })),
    // 🔴 「다른 1차 버튼에는 발광 0」 — 클래스가 없는데 그림자가 살아 있는 버튼을 잡는다
    primariesWithShadow: primaries
      .filter((el) => !el.classList.contains("fkt-glow-ai") && getComputedStyle(el).boxShadow !== "none")
      .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 20), boxShadow: getComputedStyle(el).boxShadow })),
    primaryCount: primaries.length,
    glass: glass.slice(0, 6).map((el) => {
      const cs = getComputedStyle(el);
      return {
        testid: el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
        backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
        background: cs.backgroundColor,
        alpha: alphaOf(cs.backgroundColor),
      };
    }),
    glassCount: glass.length,
  };
};

async function column(label, { reduceTransparency }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (reduceTransparency) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
  }
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
  await page.waitForTimeout(1200);
  const probe = await page.evaluate(PROBE);
  await ctx.close();
  return { label, reduceTransparency, ...probe };
}

const browser = await chromium.launch();
const report = { base: BASE, at: new Date().toISOString(), columns: [] };
try {
  report.columns.push(await column("normal", { reduceTransparency: false }));
  report.columns.push(await column("reduced-transparency", { reduceTransparency: true }));
} finally {
  await browser.close();
}

const normal = report.columns[0];
const reduced = report.columns[1];

report.summary = {
  stimulusLanded: reduced?.media?.reducedTransparency === true,
  controlUntouched: normal?.media?.reducedTransparency === false,
  glow: {
    normalClassCount: normal?.glowClassCount,
    normalRendered: normal?.glowRendered,
    otherPrimariesWithShadow: normal?.primariesWithShadow,
    primaryCount: normal?.primaryCount,
  },
  glass: {
    normal: normal?.glass,
    reduced: reduced?.glass,
    glassCount: normal?.glassCount,
  },
  reducedGlow: reduced?.glowRendered,
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

/* 🔴 자극이 안 실렸으면 이 열은 아무것도 말하지 않는다 — 빨강이 아니라 판정 불가. */
if (!report.summary.stimulusLanded || !report.summary.controlUntouched) {
  console.error("STIMULUS NOT LANDED", JSON.stringify(report.summary.stimulusLanded), JSON.stringify(report.summary.controlUntouched));
  process.exit(2);
}
/* 대조군 판정력 — 평상 열에서 glass 의 blur 와 glow 의 그림자가 살아 있어야 한다. */
const controlAlive =
  (normal?.glass ?? []).some((g) => g.backdropFilter && g.backdropFilter !== "none") &&
  (normal?.glowRendered ?? []).some((g) => !g.isNone);
if (!controlAlive) {
  console.error("CONTROL COLUMN SHOWS NOTHING TO TURN OFF — 판정력 없음");
  process.exit(2);
}

const ok =
  normal.glowClassCount === 1 &&
  (normal.glowRendered ?? []).every((g) => !g.isNone) &&
  (normal.primariesWithShadow ?? []).length === 0 &&
  (reduced.glass ?? []).every((g) => (g.backdropFilter === "none" || !g.backdropFilter) && g.alpha === 1) &&
  (reduced.glowRendered ?? []).every((g) => g.isNone);
process.exit(ok ? 0 : 1);
