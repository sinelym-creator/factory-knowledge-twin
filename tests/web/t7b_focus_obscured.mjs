/**
 * T7-B — WCAG **2.4.11 / 2.4.12** 「포커스 가림」 실측.
 *
 * 🔴 **판정선의 출처 = SC 원문**(w3.org/WAI/WCAG22/Understanding/ · 2026-09-03 실독):
 *   - **2.4.11 Focus Not Obscured (Minimum) · Level AA**
 *     > "When a user interface component receives keyboard focus, the component is
 *     >  **not entirely hidden** due to author-created content."
 *   - **2.4.12 Focus Not Obscured (Enhanced) · Level AAA**
 *     > "When a user interface component receives keyboard focus, **no part** of the
 *     >  component is hidden by author-created content."
 *   🔴 **주어 = 「포커스를 받은 컴포넌트」**다 — 「화면의 읽을 글자」가 아니다.
 *      투어 겹침 실측(714→451자)은 **다른 축**이고, 원인이 같은 말풍선이라고 한 축이 되지 않는다.
 *   🔴 **퍼센트 문턱은 SC 어디에도 없다.** AA = 「전부 가림」만 위반 · AAA = 「일부라도 가림」이 위반.
 *      우리 내부 목표치(예: 10%)가 있다면 그건 **우리 것**이고 표준 합격선과 **다른 열**에 적는다.
 *
 * 🔴 왜 우리에게 이 축이 실재하는가 — 투어는 **비모달**이라 Tab 이 배경으로 나간다
 *    (36대 실측: Tab 25회 중 19~24회가 말풍선 밖). 그래서 **말풍선 «뒤»의 배경 요소에
 *    포커스가 갈 수 있고**, 그 순간이 정확히 2.4.11 의 시나리오다.
 *
 * 🔴 이 그물이 못 세우는 것
 *   - **기하학만 잰다.** 「사각형이 겹친다」와 「사람 눈에 안 보인다」는 다르다 — 반투명 딤·
 *     그림자·스크롤 컨테이너는 이 계수 밖이다. 딤(scrim)은 **가림으로 세지 않는다**(불투명 카드만).
 *   - 뷰포트 밖으로 나간 것은 **author-created content 가 가린 게 아니다** — 따로 센다.
 *   - 1440×900 1벌 · chromium 1벌 · prod 1벌.
 *
 * 사용: node t7b_focus_obscured.mjs --base http://127.0.0.1:3111 --out x.json
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3111");
const OUT = arg("out", "");
const RING = Number(arg("ring", "40"));

const TITLES = [
  "지금 무슨 일이 났는지부터",
  "알람은 «울린 행»의 값이 앵커다",
  "조사를 시작하면 에이전트가 5단계를 돕니다",
  "다섯 단계가 실제로 지나간 자리",
  "후보마다 근거 ID 가 붙는다",
  "근거 칩을 직접 눌러 보세요",
  "출처·시각·신선도를 함께 말한다",
  "AI 는 제안까지, 승인은 사람이",
  "둘러보기가 끝났습니다",
];
const ADVANCE = ["next", "next", "goto", "next", "next", "click-target", "next", "next", "end"];

/** 지금 포커스를 받은 컴포넌트가 말풍선(불투명 · author-created)에 얼마나 가려졌는가. */
const PROBE = () => {
  const el = document.activeElement;
  const callout = document.querySelector('[data-testid="tour-callout"]');
  if (!callout) return { error: "no-callout" };
  const cr = callout.getBoundingClientRect();
  if (!el || el === document.body) return { kind: "body", label: "(document.body)" };
  const r = el.getBoundingClientRect();
  const inCallout = !!el.closest('[data-testid="tour-callout"]');
  const area = r.width * r.height;
  const ix =
    Math.max(0, Math.min(cr.right, r.right) - Math.max(cr.left, r.left)) *
    Math.max(0, Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top));
  // 뷰포트 밖 = author-created content 가 가린 것이 아니다(따로 센다).
  const offscreen =
    r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth;
  const owner = el.closest("[data-testid]");
  return {
    kind: el.tagName.toLowerCase(),
    testid: el.getAttribute("data-testid") ?? (owner ? owner.getAttribute("data-testid") : null),
    label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
    href: el.getAttribute("href"),
    inCallout,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    area: Math.round(area),
    overlapPx: Math.round(ix),
    // 🔴 SC 문면 그대로 두 갈래로만 가른다. 퍼센트 문턱은 «우리 것»이지 표준이 아니다.
    ratio: area > 0 ? Number((ix / area).toFixed(4)) : 0,
    entirelyHidden: area > 0 && ix / area >= 0.995, // 2.4.11 (AA) 위반 후보
    anyPartHidden: ix > 0, //                          2.4.12 (AAA) 위반 후보
    offscreen,
    /* 🔴 Tab 이 배경 요소를 훑으면 페이지가 스크롤되고, 말풍선 자리는 «대상의 rect»에 매여
       있어 함께 움직인다 — 말풍선 자체가 화면 밖으로 나갈 수 있다. 그건 계측 부작용이 아니라
       키보드 사용자가 실제로 겪는 거동이므로 «값»으로 남긴다(다만 판정은 2.4.11 축과 분리한다). */
    calloutOffscreen: cr.bottom <= 0 || cr.top >= window.innerHeight || cr.right <= 0 || cr.left >= window.innerWidth,
    scrollY: Math.round(window.scrollY),
  };
};

const readTitle = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="tour-title"]');
    return el ? (el.textContent ?? "").trim() : null;
  }).catch(() => null);

const waitTitle = async (page, title, ms = 25000) => {
  const t0 = Date.now();
  for (;;) {
    if ((await readTitle(page)) === title) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
};

const die = (why, extra) => {
  console.error(`[exit2] ${why}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(2);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route("**/api/live/status", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }),
);

const out = { base: BASE, at: new Date().toISOString(), sc: {
  "2.4.11": "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content. (Level AA)",
  "2.4.12": "When a user interface component receives keyboard focus, no part of the component is hidden by author-created content. (Level AAA)",
  note: "퍼센트 문턱은 SC 에 없다. 내부 목표치는 별도 열.",
}, control: null, steps: [] };

await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
await page.click('[data-testid="tour-start"]');

for (let i = 0; i < 9; i++) {
  if (!(await waitTitle(page, TITLES[i]))) die(`step ${i + 1} 도달 못 함`, { url: page.url() });
  await page.waitForTimeout(650);

  /* ⓑ 같은 실행 대조군 — 🔴 **양방향**으로 건다.
     ① 말풍선 한가운데에 버튼을 심고 포커스 → `entirelyHidden` 이 **참**이어야 한다.
     ② 말풍선 밖 구석에 버튼을 심고 포커스 → `entirelyHidden`·`anyPartHidden` 이 **거짓**이어야 한다.
     한 방향만 검사하면 「전부 가림이라 답하는 눈」도, 「아무것도 못 보는 눈」도 초록을 낸다. */
  if (i === 0) {
    const cr = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="tour-callout"]').getBoundingClientRect();
      return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) };
    });
    const plant = async (left, top, id) =>
      page.evaluate(
        ({ left, top, id }) => {
          const b = document.createElement("button");
          b.id = id;
          b.textContent = "ctl";
          b.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:40px;height:20px;z-index:1;`;
          document.body.appendChild(b);
          b.focus();
        },
        { left, top, id },
      );
    await plant(cr.x + Math.round(cr.w / 2) - 20, cr.y + Math.round(cr.h / 2) - 10, "__ctl_in__");
    await page.waitForTimeout(100);
    const inside = await page.evaluate(PROBE);
    await page.evaluate(() => document.getElementById("__ctl_in__")?.remove());
    await plant(8, 8, "__ctl_out__");
    await page.waitForTimeout(100);
    const outside = await page.evaluate(PROBE);
    await page.evaluate(() => document.getElementById("__ctl_out__")?.remove());
    out.control = { inside, outside };
    if (!inside.entirelyHidden) die("대조군① 불발 — 말풍선 한가운데 요소를 «가림»으로 못 봤다", inside);
    if (outside.entirelyHidden || outside.anyPartHidden) die("대조군② 불발 — 말풍선 밖 요소를 «가림»이라 했다", outside);
  }

  // Tab 전 순회 — 각 지점마다 잰다. 🔴 순회가 페이지를 스크롤시키므로 원위치를 먼저 적어 둔다.
  const scroll0 = await page.evaluate(() => Math.round(window.scrollY));
  const stops = [];
  for (let t = 0; t < RING; t++) {
    await page.keyboard.press("Tab");
    const p = await page.evaluate(PROBE);
    if (p.error) die(`step ${i + 1}: ${p.error}`);
    stops.push(p);
  }
  const outside = stops.filter((s) => !s.inCallout && s.kind !== "body" && !s.offscreen);
  const aaViol = outside.filter((s) => s.entirelyHidden);
  const aaaViol = outside.filter((s) => s.anyPartHidden);
  const uniq = (arr) => [...new Map(arr.map((s) => [`${s.kind}:${s.testid}:${s.label}`, s])).values()];
  out.steps.push({
    step: i + 1,
    title: TITLES[i],
    stops: stops.length,
    inCalloutStops: stops.filter((s) => s.inCallout).length,
    offscreenStops: stops.filter((s) => s.offscreen).length,
    outsideStops: outside.length,
    aa_2_4_11_violations: uniq(aaViol).map((s) => ({ testid: s.testid, label: s.label, ratio: s.ratio, rect: s.rect })),
    aaa_2_4_12_violations: uniq(aaaViol).map((s) => ({ testid: s.testid, label: s.label, ratio: s.ratio })),
    aaCount: uniq(aaViol).length,
    aaaCount: uniq(aaaViol).length,
    // 순회 중 말풍선 자체가 화면 밖으로 나간 횟수(별도 축 · 2.4.11 판정에는 안 넣는다).
    calloutOffscreenStops: stops.filter((s) => s.calloutOffscreen).length,
    scrollAtOpen: scroll0,
    scrollMax: Math.max(...stops.map((s) => s.scrollY ?? 0)),
  });

  /* 🔴 순회로 흐트러진 스크롤을 «되감고» 진행한다 — 안 되감으면 진행 버튼이 뷰포트 밖이라
     클릭이 죽는다(첫 실행이 step3 에서 그렇게 죽었다). 되감기는 계측이 만든 부작용의
     복구이지 대상의 값이 아니다 — 그래서 판정에 안 쓰고 여기서만 한다. */
  await page.evaluate((y) => window.scrollTo(0, y), scroll0);
  await page.waitForTimeout(400);

  if (ADVANCE[i] === "next") await page.click('[data-testid="tour-next"]');
  else if (ADVANCE[i] === "goto") await page.click('[data-testid="tour-goto"]');
  else if (ADVANCE[i] === "click-target") {
    const chip = page.locator('[data-testid="candidate"] a[href^="/evidence/"]').first();
    await chip.waitFor({ state: "visible", timeout: 15000 });
    await chip.click();
  }
}

out.total = {
  aaUnique: [...new Set(out.steps.flatMap((s) => s.aa_2_4_11_violations.map((v) => `${v.testid}:${v.label}`)))],
  aaaUnique: [...new Set(out.steps.flatMap((s) => s.aaa_2_4_12_violations.map((v) => `${v.testid}:${v.label}`)))],
  stepsWithAA: out.steps.filter((s) => s.aaCount > 0).length,
  stepsWithAAA: out.steps.filter((s) => s.aaaCount > 0).length,
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`대조군: 안=${out.control.inside.entirelyHidden}(ratio ${out.control.inside.ratio}) · 밖=${out.control.outside.anyPartHidden}(ratio ${out.control.outside.ratio})`);
for (const s of out.steps) {
  console.log(
    `step${s.step} 정거장 ${s.stops}(말풍선안 ${s.inCalloutStops} · 밖 ${s.outsideStops} · 화면밖 ${s.offscreenStops})` +
      ` | 🔴AA(2.4.11) ${s.aaCount} · AAA(2.4.12) ${s.aaaCount}`,
  );
  for (const v of s.aa_2_4_11_violations) console.log(`      AA위반: ${v.testid ?? "-"} 「${v.label}」 가림 ${(v.ratio * 100).toFixed(1)}%`);
  if (!s.aaCount) for (const v of s.aaa_2_4_12_violations) console.log(`      AAA만: ${v.testid ?? "-"} 「${v.label}」 가림 ${(v.ratio * 100).toFixed(1)}%`);
}
console.log(`\n합계 AA 위반 스텝 ${out.total.stepsWithAA}/9 · AAA 위반 스텝 ${out.total.stepsWithAAA}/9`);
console.log(`AA 위반 요소: ${JSON.stringify(out.total.aaUnique)}`);
await browser.close();
