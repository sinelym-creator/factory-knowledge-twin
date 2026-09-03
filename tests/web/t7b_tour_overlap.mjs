/**
 * T7-B 투어 겹침 그물 — 「투어 말풍선이 «읽어야 하는 글자»를 얼마나 덮는가」를 9단계 전수로 센다.
 *
 * 회부 원문: PR #493(`fix(tour): choose the callout's side by what it would cover`).
 * 처방 = 런타임 겹침 회피(후보 2곳 · 렌더 직전 1회 · 앵커 대비 80% 미만일 때만 비킴 ·
 * `data-tour-covered`/`data-tour-placement` 기록). 🔴 처방은 **겹침 0 을 약속하지 않는다**.
 *
 * 🔴 전대의 그물(`t7b/tour_overlap.mjs`)은 좌석과 함께 내려가 리포에 없다. 이 파일은 **새로 쓴 것**이고,
 *    따라서 전대의 기준선 수치(11·4·10·8·0·6·10·10·10)는 **전언**이다 — 같은 알고리즘이라는 보장이 없다.
 *    그래서 BEFORE 열을 **이 그물로 다시 찍고**, 판정은 「내 BEFORE vs 내 AFTER」로만 한다.
 *
 * 🔴 이 그물이 세우는 것 / 못 세우는 것
 *   ⓐ **무대가 실재했는가** — 초대 카드(`tour-invite`)를 «실제로» 만나 `tour-start` 를 눌러 연다.
 *      localStorage 주입으로 건너뛰지 않는다. 9단계 각각에서 `tour-callout` 과 제목 문면을 확인한다.
 *      한 단계라도 못 서면 `exit 2` — 안 열린 채 나온 「겹침 0」은 처방의 초록이 아니라 빈 화면의 초록이다.
 *   ⓑ **내 스캐너가 살아 있는가**(같은 실행 대조군) — 1단계 판정 «직후» 말풍선 한가운데에
 *      합성 텍스트를 심고 같은 스캐너를 다시 돌린다. 증가분이 심은 글자 수와 안 맞으면 `exit 2`.
 *      죽은 검사기는 언제나 초록을 낸다.
 *   ⓒ 못 세우는 것 — 이 그물은 «이 뷰포트(1440×900) · 이 데이터 · 이 엔진(chromium)»의 문면만 잰다.
 *      다른 폭·다른 회차의 화면은 이 창 밖이다. 「가려도 되는 글자」와 「읽어야 하는 글자」를 못 가른다 —
 *      보이는 글자를 전부 센다(그래서 절대값보다 **BEFORE→AFTER 차이**가 값이다).
 *
 * 사용: node t7b_tour_overlap.mjs --base http://127.0.0.1:3110 --label before --out x.json [--shot dir]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3110");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const SHOT = arg("shot", "");

/** 스텝 표 = `components/tour/tour-steps.ts` 정본과 «같은 순서». 제목은 그 단계에 도달했다는 표지다. */
const STEPS = [
  { i: 1, id: "headline", title: "지금 무슨 일이 났는지부터", advance: "next", hole: true },
  { i: 2, id: "alarm", title: "알람은 «울린 행»의 값이 앵커다", advance: "next", hole: true },
  { i: 3, id: "start", title: "조사를 시작하면 에이전트가 5단계를 돕니다", advance: "goto", hole: true },
  { i: 4, id: "timeline", title: "다섯 단계가 실제로 지나간 자리", advance: "next", hole: true },
  { i: 5, id: "candidate", title: "후보마다 근거 ID 가 붙는다", advance: "next", hole: true },
  { i: 6, id: "evidence", title: "근거 칩을 직접 눌러 보세요", advance: "click-target", hole: true },
  { i: 7, id: "trust", title: "출처·시각·신선도를 함께 말한다", advance: "next", hole: true },
  // 🔴 target: null 인 두 스텝은 hole 이 없다 → 처방의 useLayoutEffect 가 `setPlacement(null)` 로
  //    빠지고 `--tour-left` 자체가 안 붙는다. 즉 **처방이 구조적으로 닿지 않는 자리**다.
  { i: 8, id: "approval", title: "AI 는 제안까지, 승인은 사람이", advance: "next", hole: false },
  { i: 9, id: "done", title: "둘러보기가 끝났습니다", advance: "end", hole: false },
];

/**
 * 🔴 판정선 = 「말풍선 사각형과 «보이는 글자»의 교차」.
 *    - `coveredChars`  : 조금이라도 겹친 글자 수(전대 보고와 같은 계열의 계수 — 관대한 쪽)
 *    - `coveredHalf`   : 글자 면적의 50% 이상이 덮인 글자 수(엄한 쪽 · 두 계수를 함께 적는다)
 *    - `coveredAreaPx` : 겹친 면적 합(처방이 자기 판단에 쓰는 `data-tour-covered` 와 같은 계열)
 *    세 계수를 함께 내는 이유 = 전대 알고리즘을 모르므로 한 계수의 차이를 「처방의 효과」로 못 읽는다.
 */
const MEASURE = () => {
  const callout = document.querySelector('[data-testid="tour-callout"]');
  if (!callout) return { error: "no-callout" };
  const cb = callout.getBoundingClientRect();
  const box = { left: cb.left, top: cb.top, right: cb.right, bottom: cb.bottom };
  const inter = (r) =>
    Math.max(0, Math.min(box.right, r.right) - Math.max(box.left, r.left)) *
    Math.max(0, Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top));

  let coveredChars = 0;
  let coveredHalf = 0;
  let visibleChars = 0;
  let coveredAreaPx = 0;
  const byOwner = {};

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (!text.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    // 🔴 말풍선·스포트라이트 «자신»의 글자는 대상이 아니다(자기가 자기를 덮었다고 세면 안 된다).
    if (parent.closest('[data-testid="tour-callout"]') || parent.closest('[data-testid="tour-spotlight"]')) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    // sr-only(1px + clip) 는 사람이 못 읽는다 — 덮여도 결함이 아니다.
    if (cs.clip && cs.clip !== "auto") continue;
    if (cs.clipPath && cs.clipPath !== "none") continue;
    const pr = parent.getBoundingClientRect();
    if (pr.width <= 1 || pr.height <= 1) continue;

    const ownerEl = parent.closest("[data-testid]");
    const owner = ownerEl ? ownerEl.getAttribute("data-testid") : parent.tagName.toLowerCase();

    for (let i = 0; i < text.length; i++) {
      if (!text[i].trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // 화면 밖 글자는 「가려진 것」이 아니다(스크롤 아래는 애초에 안 보인다).
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
      visibleChars++;
      const a = inter(r);
      if (a > 0) {
        coveredChars++;
        coveredAreaPx += a;
        byOwner[owner] = (byOwner[owner] ?? 0) + 1;
      }
      if (a >= r.width * r.height * 0.5) coveredHalf++;
    }
  }

  const spot = document.querySelector('[data-testid="tour-spotlight"]');
  const sr = spot ? spot.getBoundingClientRect() : null;
  const badge = document.querySelector('[data-testid="mode-badge"]');

  /* 🔴 «비켰다/안 비켰다»만으로는 처방을 판정할 수 없다 — 안 비킨 자리가
     「두 후보를 재고 물린 것」인지 「애초에 후보가 하나뿐이었던 것」인지 갈라야 한다.
     그래서 처방의 산식(tour-overlay.tsx: CALLOUT_W=360 · besideLeft=hole.right+12 ·
     clampLeft · coverAt · `b < a*0.8`)을 여기서 **그대로 재현해** 두 후보를 직접 잰다.
     이것은 대상 코드의 복제다 — 대상이 그 값을 쓰는지는 `data-tour-covered` 와 대조한다. */
  let cand = null;
  if (sr) {
    const W = 360;
    const clampL = (x) => Math.min(Math.max(12, x), Math.max(12, window.innerWidth - W - 12));
    const coverAt = (left, top, h) => {
      const b = { left, top, right: left + W, bottom: top + h };
      let s = 0;
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el.closest('[data-testid="tour-callout"]') || el.closest('[data-testid="tour-spotlight"]')) continue;
        if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) continue;
        const c = getComputedStyle(el);
        if (c.visibility === "hidden" || c.display === "none" || c.opacity === "0") continue;
        if (c.clipPath && c.clipPath !== "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        s +=
          Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)) *
          Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
      }
      return Math.round(s);
    };
    const top = cb.top;
    const h = cb.height;
    const aL = clampL(sr.left);
    const bL = clampL(sr.left + sr.width + 12);
    const a = coverAt(aL, top, h);
    const b = bL === aL ? a : coverAt(bL, top, h);
    cand = {
      anchorLeft: Math.round(aL),
      besideLeft: Math.round(bL),
      shiftPx: Math.round(Math.abs(bL - aL)),
      anchorCover: a,
      besideCover: b,
      wouldMove: b < a * 0.8,
      // ⓐ 후보가 하나뿐(클램프가 둘을 같은 자리로 접었다) ⓑ 둘을 재고 물림 ⓒ 비킴
      verdict: bL === aL ? "single-candidate" : b < a * 0.8 ? "moved" : "declined-80pct",
    };
  }
  return {
    coveredChars,
    coveredHalf,
    coveredAreaPx: Math.round(coveredAreaPx),
    visibleChars,
    byOwner,
    calloutRect: { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) },
    spotlightRect: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) } : null,
    // 처방이 «스스로 신고한» 값 — AFTER 열에만 존재한다. 신고는 알리바이가 아니므로 내 계수와 나란히 적는다.
    dataTourPlacement: callout.getAttribute("data-tour-placement"),
    dataTourCovered: callout.getAttribute("data-tour-covered"),
    cand,
    targetMissing: !!document.querySelector('[data-testid="tour-target-missing"]'),
    modeBadge: badge ? (badge.textContent ?? "").trim() : null,
    url: location.pathname + location.search,
  };
};

const die = (why, extra) => {
  console.error(`[exit2] ${why}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(2);
};

const waitTitle = async (page, title, ms = 25000) => {
  const t0 = Date.now();
  for (;;) {
    try {
      const got = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="tour-title"]');
        return el ? (el.textContent ?? "").trim() : null;
      });
      if (got === title) return true;
    } catch {
      /* 이동 중 실행 컨텍스트가 죽는다 — 다시 묻는다. */
    }
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

/* 🔴 무대의 손잡이는 «하나»다 — `/api/live/status` 를 online:false 로 고정해 REPLAY 를 세운다.
   두 열에 똑같이 건다. 이 한 칸 말고는 두 서버가 같은 트리에서 나왔다(diff = tour-overlay.tsx 뿐). */
await page.route("**/api/live/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }),
  }),
);

const result = { label: LABEL, base: BASE, at: new Date().toISOString(), stage: {}, steps: [], control: null };

await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});

/* ⓐ 무대 증거 — 초대 카드가 «실제로» 떴는가. 안 뜨면 이 실행에는 잴 무대가 없다. */
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
result.stage.tourStartClicked = true;

for (const s of STEPS) {
  const ok = await waitTitle(page, s.title);
  if (!ok) {
    result.steps.push({ ...s, reached: false });
    fs.writeFileSync(OUT || "t7b_out.json", JSON.stringify(result, null, 2));
    die(`step ${s.i}(${s.id}) 에 도달 못 함 — 9/9 를 못 돌았다`, { url: page.url() });
  }
  // 배치 계산(useLayoutEffect)과 진입 모션이 끝나기를 기다린다 — 값이 흔들리면 판정선이 죽는다.
  await page.waitForTimeout(700);
  const m = await page.evaluate(MEASURE);
  if (m.error) die(`step ${s.i}: ${m.error}`, m);
  if (m.visibleChars === 0) die(`step ${s.i}: 화면에 보이는 글자가 0 — 빈 화면이다`, m);
  result.steps.push({ ...s, reached: true, ...m });
  if (SHOT) await page.screenshot({ path: path.join(SHOT, `${LABEL}-step${s.i}.png`) });

  /* ⓑ 같은 실행 대조군 — 1단계 판정 직후에만 한다. 말풍선 한가운데에 글자를 심고 다시 센다. */
  if (s.i === 1) {
    const NEEDLE = "겹침대조군샘플0123456789";
    const before = m.coveredChars;
    await page.evaluate(
      ({ rect, needle }) => {
        const d = document.createElement("div");
        d.id = "__net_control__";
        d.textContent = needle;
        d.style.cssText = `position:fixed;left:${rect.x + 8}px;top:${rect.y + Math.round(rect.h / 2)}px;` +
          `z-index:1;font-size:12px;white-space:nowrap;color:#000;background:#fff;`;
        document.body.appendChild(d);
      },
      { rect: m.calloutRect, needle: NEEDLE },
    );
    await page.waitForTimeout(120);
    const after = await page.evaluate(MEASURE);
    const delta = after.coveredChars - before;
    result.control = { needleChars: NEEDLE.length, before, after: after.coveredChars, delta };
    await page.evaluate(() => document.getElementById("__net_control__")?.remove());
    await page.waitForTimeout(120);
    if (delta !== NEEDLE.length) {
      die(`대조군 불발 — 심은 ${NEEDLE.length}자 중 ${delta}자만 잡혔다. 이 실행의 초록은 근거가 아니다`, result.control);
    }
  }

  if (s.advance === "next") await page.click('[data-testid="tour-next"]');
  else if (s.advance === "goto") await page.click('[data-testid="tour-goto"]');
  else if (s.advance === "click-target") {
    // 「대상 직접 클릭」 스텝 — 후보 카드 «안»의 근거 칩을 누른다(그 클릭이 곧 이동이다).
    const chip = page.locator('[data-testid="candidate"] a[href^="/evidence/"]').first();
    await chip.waitFor({ state: "visible", timeout: 15000 });
    await chip.click();
  }
}

const sum = (k) => result.steps.reduce((a, s) => a + (s[k] ?? 0), 0);
result.total = {
  coveredChars: sum("coveredChars"),
  coveredHalf: sum("coveredHalf"),
  coveredAreaPx: sum("coveredAreaPx"),
  stepsWithOverlap: result.steps.filter((s) => (s.coveredChars ?? 0) > 0).length,
  stepsReached: result.steps.filter((s) => s.reached).length,
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ label: LABEL, control: result.control, total: result.total }, null, 2));
for (const s of result.steps) {
  console.log(
    `step${s.i} ${s.id.padEnd(10)} covered=${String(s.coveredChars).padStart(4)} half=${String(s.coveredHalf).padStart(4)}` +
      ` area=${String(s.coveredAreaPx).padStart(7)} visible=${String(s.visibleChars).padStart(5)}` +
      ` placement=${s.dataTourPlacement ?? "-"} selfCovered=${(s.dataTourCovered || "-").padStart(6)}` +
      ` | cand=${s.cand ? `${s.cand.verdict} shift=${s.cand.shiftPx}px a=${s.cand.anchorCover} b=${s.cand.besideCover}` : "no-hole"}`,
  );
}
await browser.close();
