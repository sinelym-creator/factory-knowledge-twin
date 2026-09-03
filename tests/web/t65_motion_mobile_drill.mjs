/**
 * T6-5 축 ④ **reduced-motion** · 축 ⑤ **390 바텀시트 + 가로 스크롤 0** — 한 실행 네 열.
 *
 * 정본
 *  - ④ `t6-5-guided-tour-spec.md` ④-6 「reduced-motion: 전역 규칙이 전부 0 → pulse 대신
 *    **정지 링 3px + 굵은 테두리** · 정보 손실 0」 + `t6-4-apple-design-spec.md` ⑤ 「reduced-motion
 *    정지 시 정보 손실 0(값·문구 DOM 상주)」.
 *  - ⑤ ⑤항 「모바일: 콜아웃 = <md **바텀 시트**」 + t6-4 ⑧ 「**body 가로 스크롤 0**」.
 *
 * 🔴 **두 손잡이를 각각 하나씩만 바꾼 네 열**(390/1440 × reduce/no-preference)로 찍는다.
 *    한 열만 보면 「reduced 라서 멈춘 것」과 「원래 안 움직이는 것」이 같은 값을 낸다 —
 *    차이에는 제 열이 필요하다.
 * 🔴 «링이 남는가»는 존재만이 아니라 **보이는 두께**로 잰다. 규격이 3px 을 말했으므로 실측값을
 *    그대로 적는다(내 판정선은 규격의 그 줄에서 왔다).
 *
 * 사용: node t65_motion_mobile_drill.mjs --base http://127.0.0.1:3107 --out <json>
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
const SHOTS = arg("shots", "");

const report = { base: BASE, at: new Date().toISOString(), columns: [] };
const stage = { entered: false, invite: false, spotlight: false };

const browser = await chromium.launch();

async function enter(page) {
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
      .click({ timeout: 10_000 });
    await page.waitForURL(/\/overview/, { timeout: 45_000 });
  }
  stage.entered = true;
}

async function column(label, { width, height, reduced }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const col = { label, width, height, reduced, steps: [] };

  await enter(page);
  const start = page.locator('[data-testid="tour-start"]');
  await start.waitFor({ state: "visible", timeout: 20_000 });
  stage.invite = true;
  await start.click();

  // 대상이 있는 overview 스텝 두 개(0 headline · 1 alarm-card)에서 잰다.
  for (const i of [0, 1]) {
    const callout = page.locator(`[data-testid="tour-callout"][data-index="${i}"]`);
    const shown = await callout
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      col.steps.push({ index: i, shown: false });
      break;
    }
    // 스포트라이트가 자리를 잡을 때까지 한 박자(overlay 는 240/640ms 에 재측한다)
    await page.waitForTimeout(900);

    const spot = page.locator('[data-testid="tour-spotlight"]');
    const hasSpot = (await spot.count()) > 0;
    if (hasSpot) stage.spotlight = true;

    const spotStyle = hasSpot
      ? await spot.first().evaluate((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            outlineWidth: cs.outlineWidth,
            outlineStyle: cs.outlineStyle,
            outlineColor: cs.outlineColor,
            boxShadow: cs.boxShadow.slice(0, 80),
            transitionDuration: cs.transitionDuration,
            animationName: cs.animationName,
            animationDuration: cs.animationDuration,
            opacity: cs.opacity,
            rect: { top: r.top, left: r.left, width: r.width, height: r.height },
          };
        })
      : null;

    const calloutBox = await callout.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom },
        position: cs.position,
        inlineTop: el.style.top || null,
        inlineLeft: el.style.left || null,
        inlineWidth: el.style.width || null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        // 규격 ⑤ 「<md 바텀 시트」 — 하단에 붙고 폭이 화면을 거의 채우는가
        bottomGap: window.innerHeight - r.bottom,
        widthRatio: r.width / window.innerWidth,
      };
    });

    const scrollAxis = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      clientWidth: document.scrollingElement.clientWidth,
      overflowPx: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    }));

    col.steps.push({ index: i, shown: true, hasSpot, spotStyle, calloutBox, scrollAxis });
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/${label}-step${i}.png` });
    }

    const next = page.locator('[data-testid="tour-next"]');
    if (await next.count()) await next.first().click();
  }

  await ctx.close();
  return col;
}

try {
  report.columns.push(await column("390-reduce", { width: 390, height: 844, reduced: true }));
  report.columns.push(await column("390-motion", { width: 390, height: 844, reduced: false }));
  report.columns.push(await column("1440-reduce", { width: 1440, height: 900, reduced: true }));
  report.columns.push(await column("1440-motion", { width: 1440, height: 900, reduced: false }));
} finally {
  await browser.close();
}

report.stage = stage;
const pick = (l) => report.columns.find((c) => c.label === l);
const s0 = (c) => c?.steps?.find((s) => s.index === 0);

report.summary = {
  // 축 ④ — 정지 링이 남는가 · 두 열의 «차이»가 실제로 있는가
  reduced: {
    "390-reduce": s0(pick("390-reduce"))?.spotStyle ?? null,
    "390-motion": s0(pick("390-motion"))?.spotStyle ?? null,
    "1440-reduce": s0(pick("1440-reduce"))?.spotStyle ?? null,
    "1440-motion": s0(pick("1440-motion"))?.spotStyle ?? null,
  },
  ringSurvivesReduced: !!s0(pick("1440-reduce"))?.hasSpot && !!s0(pick("390-reduce"))?.hasSpot,
  // 축 ⑤ — 390 바텀 시트 + 가로 스크롤
  mobile: report.columns
    .filter((c) => c.width === 390)
    .map((c) => ({
      label: c.label,
      steps: c.steps.map((s) => ({
        index: s.index,
        bottomGap: s.calloutBox?.bottomGap,
        widthRatio: s.calloutBox?.widthRatio,
        inlineTop: s.calloutBox?.inlineTop,
        overflowPx: s.scrollAxis?.overflowPx,
      })),
    })),
  horizontalOverflowMax: Math.max(
    ...report.columns.flatMap((c) => c.steps.map((s) => s.scrollAxis?.overflowPx ?? 0)),
  ),
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

if (!stage.entered || !stage.invite || !stage.spotlight) {
  console.error("STAGE MISSING", JSON.stringify(stage));
  process.exit(2);
}
process.exit(0);
