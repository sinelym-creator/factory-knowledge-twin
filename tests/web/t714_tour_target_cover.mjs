/**
 * T7-14 — D-45 처방(「말풍선이 자기가 가리키는 대상을 덮는다」) **독립** 검증 그물.
 *
 * 🔴 이 파일은 구현의 그물·표를 **보지 않고** 쓴 것이다. 구현이 낸 수를 재현하는 게 아니라
 *    **내 판정선으로 다시 재고**, 그 다음에 대조한다(발주 §축).
 *
 * 🔴 판정선의 출처
 *   ① 「대상을 덮는가」 = **말풍선 사각형 ∩ «대상 요소» 사각형 > 0**.
 *      대상 = `tour-steps.ts` 의 `target`(data-testid). 🔴 스포트라이트가 아니라 **대상 요소**로 잰다 —
 *      스포트라이트는 처방과 같은 코드가 그리는 것이라, 그것으로 재면 «자기 신고»에 기댄 판정이 된다.
 *   ② 「곁에 있는가」 = **대상과 말풍선 사이 실제 px 거리**(gapToTargetPx). 🔴 후보 «순번»·이름으로
 *      판정하지 않는다(구현 자수: 순번으로 «곁»을 판정했다가 중복 제거 뒤 「화면 끝」이 «곁»으로 둔갑).
 *   ③ 회귀 = 걸음마다 **덮은 글자 수**(페이지 전체 · 대상 안 따로) · 자리 · left.
 *
 * 🔴 이 그물이 «못» 세우는 것
 *   - 뷰포트 1440×900 · chromium · 이 데이터의 문면만 잰다. 다른 폭·엔진·회차는 창 밖이다.
 *   - 「가려도 되는 글자」와 「읽어야 하는 글자」를 못 가른다 — 보이는 글자를 전부 센다.
 *   - 7~9걸음은 **안 잰다**(발주 = 6걸음 · 「6번째 뒤로는 자동 진행이 안 된다」).
 *     안 잰 것은 「0」이 아니라 **안 잼**으로 적는다.
 *
 * 🔴 사람보다 유리/불리한 점(고정 1줄)
 *   유리 = 대상 testid 를 «미리 알고» 들어가 사람처럼 눈으로 찾을 필요가 없다 · 픽셀 단위로 잰다.
 *   불리 = 사람은 스크롤·마우스로 말풍선을 피해 읽지만, 이 그물은 **한 시점의 정지 화면**만 본다.
 *
 * 대조군(같은 실행 · 안 울면 exit 2)
 *   ⓐ 글자 스캐너 — 말풍선 한가운데 합성 글자를 심고 증가분이 심은 수와 같은지.
 *   ⓑ 기하 스캐너 — 말풍선과 «알려진 만큼» 겹치는 사각형을 만들고 같은 교차 함수가 그 면적을 내는지.
 *   ⓒ 무대 — 초대 카드를 실제로 만나 눌러서 연다. 걸음마다 제목이 «바뀌어야» 한다(같으면 exit 2).
 *
 * 사용: node t714_tour_target_cover.mjs --base http://127.0.0.1:8797 --label before --out x.json
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:8797");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const SHOT = arg("shot", "");
const NSTEPS = Number(arg("steps", "6"));
const VW = Number(arg("vw", "1440"));
const VH = Number(arg("vh", "900"));

/**
 * 스텝 ↔ 대상 = `apps/web-console/components/tour/tour-steps.ts` 에서 읽은 것.
 * 🔴 두 무대가 **같은 `tour-steps.ts`** 를 쓴다는 사실을 git 으로 확인하고 쓴다
 *    (`git diff ea89b36 42c28fa -- components/tour/` = `tour-overlay.tsx` 한 파일뿐).
 * 🔴 제목은 여기 박지 않는다 — 제목은 늙는다(전대 그물의 제목표는 이미 1걸음에서 어긋나 있었다).
 */
const STEP_TARGETS = [
  { i: 1, id: "headline", target: null },
  { i: 2, id: "alarm", target: "alarm-card" },
  { i: 3, id: "start", target: "start-from-alarm" },
  { i: 4, id: "timeline", target: "run-timeline" },
  { i: 5, id: "candidate", target: "candidates" },
  { i: 6, id: "evidence", target: "candidate" },
];

const die = (why, extra) => {
  console.error("[exit2] " + why);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(2);
};

const MEASURE = (targetTestid) => {
  const callout = document.querySelector('[data-testid="tour-callout"]');
  if (!callout) return { error: "no-callout" };
  const R = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const inter = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const gap = (a, b) => {
    const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
    const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
    return Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
  };
  const cb = R(callout);

  const targetEl = targetTestid ? document.querySelector('[data-testid="' + targetTestid + '"]') : null;
  const tr = targetEl ? R(targetEl) : null;

  const spot = document.querySelector('[data-testid="tour-spotlight"]');
  const sr = spot ? R(spot) : null;

  /* 글자 스캔 — 말풍선/스포트라이트 «자신»의 글자는 대상이 아니다. */
  const scan = (root, box) => {
    let covered = 0;
    let coveredHalf = 0;
    let visible = 0;
    let area = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      if (!text.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('[data-testid="tour-callout"]')) continue;
      if (parent.closest('[data-testid="tour-spotlight"]')) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (cs.clip && cs.clip !== "auto") continue;
      if (cs.clipPath && cs.clipPath !== "none") continue;
      const pr = parent.getBoundingClientRect();
      if (pr.width <= 1 || pr.height <= 1) continue;
      for (let i = 0; i < text.length; i++) {
        if (!text[i].trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
        visible++;
        const a = inter({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, box);
        if (a > 0) {
          covered++;
          area += a;
        }
        if (a >= r.width * r.height * 0.5) coveredHalf++;
      }
    }
    return { covered, coveredHalf, visible, area: Math.round(area) };
  };

  const pageScan = scan(document.body, cb);
  const inTarget = targetEl ? scan(targetEl, cb) : null;

  const overlapTargetPx = tr ? Math.round(inter(cb, tr)) : null;
  const overlapSpotPx = sr ? Math.round(inter(cb, sr)) : null;
  const targetAreaPx = tr ? Math.round(tr.w * tr.h) : null;

  const titleEl = document.querySelector('[data-testid="tour-title"]');

  return {
    title: titleEl ? (titleEl.textContent ?? "").trim() : null,
    calloutRect: { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.w), h: Math.round(cb.h) },
    calloutLeft: Math.round(cb.left),
    /* 🔴 대상 요소를 «찾았는가»를 값으로 남긴다 — 못 찾은 것을 0 으로 쓰지 않는다. */
    targetTestid: targetTestid,
    targetFound: !!targetEl,
    targetRect: tr ? { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.w), h: Math.round(tr.h) } : null,
    targetAreaPx,
    /* 축 ① */
    overlapTargetPx,
    coversTarget: overlapTargetPx === null ? null : overlapTargetPx > 0,
    targetCoverRatio:
      overlapTargetPx === null || !targetAreaPx ? null : Math.round((overlapTargetPx / targetAreaPx) * 1000) / 1000,
    coveredCharsInTarget: inTarget ? inTarget.covered : null,
    visibleCharsInTarget: inTarget ? inTarget.visible : null,
    /* 축 ② — 이름·순번이 아니라 실제 px */
    gapToTargetPx: tr ? gap(cb, tr) : null,
    /* 참고 열 — 처방이 그리는 스포트라이트(처방과 같은 코드 · 판정선 아님) */
    spotlightRect: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.w), h: Math.round(sr.h) } : null,
    overlapSpotlightPx: overlapSpotPx,
    /* 축 ③ */
    coveredChars: pageScan.covered,
    coveredHalf: pageScan.coveredHalf,
    coveredAreaPx: pageScan.area,
    visibleChars: pageScan.visible,
    /* 처방의 «자기 신고» — 알리바이가 아니라 대조용 열이다 */
    selfPlacement: callout.getAttribute("data-tour-placement"),
    selfCovered: callout.getAttribute("data-tour-covered"),
    selfClear: callout.getAttribute("data-tour-clear"),
    fixMarkerPresent: !!document.querySelector("[data-tour-clear]"),
    url: location.pathname + location.search,
  };
};

const readTitle = (page) =>
  page
    .evaluate(() => {
      const el = document.querySelector('[data-testid="tour-title"]');
      return el ? (el.textContent ?? "").trim() : null;
    })
    .catch(() => null);

const waitTitleChange = async (page, prev, ms = 25000) => {
  const t0 = Date.now();
  for (;;) {
    const got = await readTitle(page);
    if (got && got !== prev) return got;
    if (Date.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, 150));
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
const page = await ctx.newPage();

/* 손잡이는 «하나» — online:false 로 REPLAY 를 세운다. 두 열에 똑같이 건다. */
await page.route("**/api/live/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }),
  }),
);

const result = {
  label: LABEL,
  base: BASE,
  at: new Date().toISOString(),
  viewport: { w: VW, h: VH },
  stepsRequested: NSTEPS,
  notMeasured: "7~9걸음 = 안 잼(발주 범위 밖 · 0 아님)",
  stage: {},
  control: {},
  steps: [],
};

await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});

const inviteSeen = await page
  .waitForSelector('[data-testid="tour-invite"]', { timeout: 20000, state: "visible" })
  .then(() => true)
  .catch(() => false);
result.stage.landedUrl = page.url();
result.stage.tourInvite = inviteSeen;
result.stage.modeBadge = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="mode-badge"]');
  return b ? (b.textContent ?? "").trim() : null;
});
if (!inviteSeen) die("tour-invite 가 안 떴다 — 무대 없음(빈 화면의 초록 방지)", result.stage);

await page.click('[data-testid="tour-start"]');

let prevTitle = null;
const seenTitles = [];

for (const s of STEP_TARGETS.slice(0, NSTEPS)) {
  const title = await waitTitleChange(page, prevTitle);
  if (!title) {
    result.steps.push({ ...s, reached: false });
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    die("step " + s.i + "(" + s.id + ") 제목이 안 바뀌었다 — 같은 걸음 재독이거나 진행이 막혔다", {
      prevTitle,
      url: page.url(),
    });
  }
  if (seenTitles.includes(title)) {
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    die("step " + s.i + ": 이미 본 제목이 다시 나왔다 — 걸음 수를 부풀리는 중이다", { title, seenTitles });
  }
  seenTitles.push(title);
  prevTitle = title;

  await page.waitForTimeout(700); // useLayoutEffect 배치 + 진입 모션
  const m = await page.evaluate(MEASURE, s.target);
  if (m.error) die("step " + s.i + ": " + m.error, m);
  if (m.visibleChars === 0) die("step " + s.i + ": 보이는 글자가 0 — 빈 화면이다", m);
  result.steps.push({ ...s, reached: true, ...m });
  if (SHOT) await page.screenshot({ path: path.join(SHOT, LABEL + "-step" + s.i + ".png") });

  /* 대조군 ⓐ·ⓑ — 1걸음 판정 «직후» 한 번. */
  if (s.i === 1) {
    const NEEDLE = "겹침대조군샘플0123456789";
    const before = m.coveredChars;
    await page.evaluate(
      ({ rect, needle }) => {
        const d = document.createElement("div");
        d.id = "__net_ctrl_chars__";
        d.textContent = needle;
        d.style.cssText =
          "position:fixed;left:" + (rect.x + 8) + "px;top:" + (rect.y + Math.round(rect.h / 2)) + "px;" +
          "z-index:1;font-size:12px;white-space:nowrap;color:#000;background:#fff;";
        document.body.appendChild(d);
      },
      { rect: m.calloutRect, needle: NEEDLE },
    );
    await page.waitForTimeout(120);
    const after = await page.evaluate(MEASURE, s.target);
    const delta = after.coveredChars - before;
    result.control.chars = { needleChars: NEEDLE.length, before, after: after.coveredChars, delta };
    await page.evaluate(() => document.getElementById("__net_ctrl_chars__")?.remove());
    await page.waitForTimeout(120);
    if (delta !== NEEDLE.length) {
      die("대조군 ⓐ 불발 — 심은 " + NEEDLE.length + "자 중 " + delta + "자만 잡혔다", result.control.chars);
    }

    /* ⓑ 기하 — 말풍선과 «알려진 만큼» 겹치는 사각형을 심고, 같은 교차 함수로 재게 한다. */
    const geo = await page.evaluate((cr) => {
      const d = document.createElement("div");
      d.id = "__net_ctrl_geo__";
      d.textContent = "x";
      const OVERLAP_W = 100;
      const H = 40;
      const top = cr.y + 10;
      d.style.cssText =
        "position:fixed;left:" + (cr.x + cr.w - OVERLAP_W) + "px;top:" + top + "px;" +
        "width:200px;height:" + H + "px;z-index:1;background:#fff;color:#000;";
      document.body.appendChild(d);
      const cb = document.querySelector('[data-testid="tour-callout"]').getBoundingClientRect();
      const r = d.getBoundingClientRect();
      const got =
        Math.max(0, Math.min(cb.right, r.right) - Math.max(cb.left, r.left)) *
        Math.max(0, Math.min(cb.bottom, r.bottom) - Math.max(cb.top, r.top));
      d.remove();
      return { expected: OVERLAP_W * H, got: Math.round(got) };
    }, m.calloutRect);
    result.control.geometry = geo;
    if (Math.abs(geo.got - geo.expected) > 2) {
      die("대조군 ⓑ 불발 — 교차 함수가 알려진 겹침 면적을 못 냈다", geo);
    }
  }

  if (s.i === NSTEPS) break;

  const which = await page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    if (vis(document.querySelector('[data-testid="tour-next"]'))) return "next";
    if (vis(document.querySelector('[data-testid="tour-goto"]'))) return "goto";
    return null;
  });
  if (!which) die("step " + s.i + ": 진행 버튼(next/goto)이 안 보인다 — 다음 걸음으로 못 간다", { url: page.url() });
  result.steps[result.steps.length - 1].advancedBy = which;
  await page.click('[data-testid="tour-' + which + '"]');
}

const sum = (k) => result.steps.reduce((a, s) => a + (typeof s[k] === "number" ? s[k] : 0), 0);
result.total = {
  stepsReached: result.steps.filter((s) => s.reached).length,
  stepsWithTargetOverlap: result.steps.filter((s) => s.coversTarget === true).length,
  stepsTargetNotFound: result.steps.filter((s) => s.target && s.targetFound === false).length,
  overlapTargetPx: sum("overlapTargetPx"),
  coveredChars: sum("coveredChars"),
  coveredHalf: sum("coveredHalf"),
  coveredAreaPx: sum("coveredAreaPx"),
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({ label: LABEL, base: BASE, stage: result.stage, control: result.control, total: result.total }, null, 2),
);
for (const s of result.steps) {
  console.log(
    "step" + s.i + " " + String(s.id).padEnd(9) +
      " tgt=" + String(s.targetTestid ?? "(none)").padEnd(16) +
      " found=" + s.targetFound +
      " left=" + String(s.calloutLeft).padStart(5) +
      " onTarget=" + String(s.overlapTargetPx).padStart(7) + "px2" +
      " ratio=" + String(s.targetCoverRatio).padStart(6) +
      " gap=" + String(s.gapToTargetPx).padStart(6) + "px" +
      " charsInTgt=" + String(s.coveredCharsInTarget).padStart(4) +
      " pageChars=" + String(s.coveredChars).padStart(4) +
      " self[place=" + (s.selfPlacement ?? "-") + " cov=" + (s.selfCovered ?? "-") + " clear=" + (s.selfClear ?? "-") + "]",
  );
}
console.log("fixMarker(data-tour-clear) present = " + result.steps[0]?.fixMarkerPresent);
await browser.close();
