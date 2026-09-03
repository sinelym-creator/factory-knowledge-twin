/**
 * T6-4 ⓔ ② — **DOM/testid 회귀를 «주장»이 아니라 목록으로 잰다.**
 *
 * 구현 좌석의 「클래스만 바꿨다」는 주장이다. 주장을 면책 목록으로 쓰지 않으려면 전/후 두 열에서
 * 같은 자를 대고 **순서 있는 `[data-testid]` 전체 목록**을 떠서 diff 해야 한다. 신고된 변경과
 * 대조하는 것은 그 다음이다 — 신고에 없는 차이가 1건이라도 있으면 그것이 판정이다.
 *
 * 🔴 순서까지 뜬다. 집합만 같고 순서가 뒤집히면 스크린리더·키보드 이동 순서가 바뀌는데,
 *    집합 비교는 그것을 초록으로 통과시킨다.
 * 🔴 화면 문면도 함께 뜬다(축 ⑤ · 색각 표지 ●▲■ + 낱말 · 측정-주장 배지). 「코드에 있다」가
 *    아니라 «렌더된 문면»에서 세기 위해서다.
 *
 * 사용: node t64_dom_inventory.mjs --base http://127.0.0.1:3104 --label after --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3104");
const LABEL = arg("label", "after");
const OUT = arg("out", "");

const SCREENS = [
  { id: "overview", route: "/overview" },
  { id: "incident", route: "/incidents/INC-2025-019" },
  { id: "evidence", route: "/evidence/EV-2025-001" },
  { id: "work-order", route: "/work-orders/WO-2025-001" },
  { id: "compare", route: "/compare" },
];

/** 측정-주장 경계 표지(baseline §0.2) — 디자인이 정직성 표지를 지웠는지 본다. */
const HONESTY = ["잠정", "미실측", "Target", "Actual", "실측", "샘플", "sampling", "PASS", "FAIL"];
/** 색각 규율 — 색만으로 구분하지 않는다(§10·§11.3). 아이콘 글리프가 남아 있는가. */
const GLYPHS = ["●", "▲", "■", "◉", "◑", "◌", "◐", "⏱", "▣", "⧉"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await ctx.newPage();

const report = { label: LABEL, base: BASE, at: new Date().toISOString(), screens: [] };

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
  await page.waitForTimeout(1500);
  const shot = await page.evaluate(
    ({ honesty, glyphs }) => {
      const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("testid") ?? el.getAttribute("data-testid"));
      const text = document.body.innerText.replace(/\s+/g, " ").trim();
      return {
        testids: ids,
        testidCount: ids.length,
        // 🔴 문면은 «렌더된 것»만 센다(코드 grep 아님).
        honestyMarkers: honesty.filter((w) => text.includes(w)),
        glyphMarkers: glyphs.filter((g) => text.includes(g)),
        // 접근성 순서 축 — 탭 이동이 가능한 요소의 접근名 순서.
        focusables: [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
          .filter((el) => !el.hasAttribute("disabled"))
          .map((el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)),
        headings: [...document.querySelectorAll("h1, h2, h3")].map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60)),
        textLength: text.length,
      };
    },
    { honesty: HONESTY, glyphs: GLYPHS },
  );
  report.screens.push({ screen: s.id, route: s.route, ...shot });
}

await browser.close();
const text = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, text, "utf8");
console.log(JSON.stringify(report.screens.map((s) => ({ screen: s.screen, testids: s.testidCount, glyphs: s.glyphMarkers.length, honesty: s.honestyMarkers.length })), null, 1));
