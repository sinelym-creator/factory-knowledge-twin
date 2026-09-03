/**
 * T7-6 — 규격 §⑧-4 「포커스 경계」 합격 조건 3 + 투어 OFF 무변.
 *
 * 판정선(정본 = `docs/design/t6-5-guided-tour-spec.md` §⑧-4 · 오케 성문 22:12):
 *   ① `interactive` 진입 후 **Tab 0회**에 `document.activeElement === 대상`
 *   ② 각 단계에서 **Tab 10회**가 순회 범위를 안 벗어남
 *      (`info` = 말풍선 내부만 · `interactive` = 말풍선 ∪ 대상·자손)
 *   ③ 🔴 **`inert` 배경에 «마우스로 눌리는» 요소 0**
 *      — 포커스 자격만 지우고 **클릭은 살아 있으면** 그건 2.4.11 밖의 다른 결함이다.
 *        「측정을 없애서 초록을 만드는」 처방이 되지 않게 하는 축이다.
 *
 * 🔴 **대조군(같은 실행 · 필수)** — **투어 OFF 열**에서 같은 계측을 돌린다.
 *    OFF 면 배경이 열려 있으므로 **「Tab 10회 = 바깥 10/10」**과 **「눌리는 배경 요소 > 0」**이
 *    나와야 한다. 안 나오면 이 실행의 «바깥 0»은 처방의 것이 아니라 **죽은 계측기의 것**이다.
 *
 * 🔴 못 세우는 것 — `inert` 의 «실제 이벤트 차단»을 클릭으로 확인하지 않는다(클릭하면 화면이
 *    바뀌어 다음 측정을 오염시킨다). `elementFromPoint` 가 돌려준 요소가 `inert` 조상을
 *    갖는지로 «판정»하고, 그것이 곧 이벤트 차단이라는 것은 **브라우저 명세에 기댄 추론(E3)**이다.
 *
 * 사용: node t76_focus_boundary.mjs --base http://127.0.0.1:3114 --label after --out x.json
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:3114");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const TOTAL_STEPS = 9;

const WHERE = () =>
  ((el) => {
    if (!el || el === document.body) return { tag: "body", where: "body", label: "(document.body)" };
    const inCallout = !!el.closest('[data-testid="tour-callout"]');
    const spot = document.querySelector('[data-testid="tour-spotlight"]');
    // 대상은 스포트라이트가 «가리키는» 요소다 — 좌표로 되찾는다(테스트 속성 의존을 줄인다).
    let inTarget = false;
    if (spot) {
      const s = spot.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      inTarget = r.left >= s.left - 2 && r.right <= s.right + 2 && r.top >= s.top - 2 && r.bottom <= s.bottom + 2;
    }
    const owner = el.closest("[data-testid]");
    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid") ?? (owner ? owner.getAttribute("data-testid") : null),
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
      inCallout,
      inTarget,
      inertAncestor: !!el.closest("[inert]"),
      where: inCallout ? "callout" : inTarget ? "target" : "outside",
    };
  })(document.activeElement);

/** ③ — 화면 격자 위 점들이 «무엇에» 닿는가. 눌리는 배경 요소를 센다. */
const MOUSE_GRID = () => {
  const IA = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[tabindex]';
  const spot = document.querySelector('[data-testid="tour-spotlight"]');
  const s = spot ? spot.getBoundingClientRect() : null;
  let live = 0, inertHit = 0, callout = 0, target = 0, nothing = 0;
  const samples = [];
  for (let x = 20; x < window.innerWidth; x += 40) {
    for (let y = 20; y < window.innerHeight; y += 40) {
      const el = document.elementFromPoint(x, y);
      if (!el) { nothing++; continue; }
      if (el.closest('[data-testid="tour-callout"]')) { callout++; continue; }
      const r = el.getBoundingClientRect();
      const inTarget = s && r.left >= s.left - 2 && r.right <= s.right + 2 && r.top >= s.top - 2 && r.bottom <= s.bottom + 2;
      if (inTarget) { target++; continue; }
      if (el.closest("[inert]")) { inertHit++; continue; }
      const hit = el.closest(IA);
      if (hit) {
        live++;
        if (samples.length < 8)
          samples.push({ tag: hit.tagName.toLowerCase(), testid: hit.getAttribute("data-testid"), label: (hit.getAttribute("aria-label") || hit.textContent || "").trim().slice(0, 28), x, y });
      } else nothing++;
    }
  }
  return { liveBackgroundInteractive: live, inertHits: inertHit, calloutHits: callout, targetHits: target, inertHitsNone: nothing, samples };
};

const DIGEST = () =>
  ({
    testids: Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")),
    elements: document.querySelectorAll("*").length,
    focusables: document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]').length,
    inertNodes: document.querySelectorAll("[inert]").length,
    tourNodes: document.querySelectorAll('[data-testid^="tour-"]').length,
  });

const readTitle = (page) => page.evaluate(() => { const el = document.querySelector('[data-testid="tour-title"]'); return el ? (el.textContent ?? "").trim() : null; }).catch(() => null);
const waitNewTitle = async (page, prev, ms = 25000) => {
  const t0 = Date.now();
  for (;;) { const t = await readTitle(page); if (t && t !== prev) return t; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, 150)); }
};
const advanceKind = (page) => page.evaluate(() => {
  const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  if (vis('[data-testid="tour-await-click"]')) return "click-target";
  if (vis('[data-testid="tour-goto"]')) return "goto";
  if (vis('[data-testid="tour-next"]')) return "next";
  return "end";
});
const die = (why, extra) => { console.error(`[exit2] ${why}`); if (extra) console.error(JSON.stringify(extra, null, 2)); process.exit(2); };

const browser = await chromium.launch();
const fresh = async () => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.route("**/api/live/status", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }));
  return { c, p };
};

const out = { label: LABEL, base: BASE, at: new Date().toISOString(), off: null, steps: [] };

/* ── 대조군 = 투어 OFF 열 (같은 실행) ─────────────────────────────────────── */
{
  const { c: ctx, p: page } = await fresh();
  // 🔴 OFF = 「한 번도 안 켰다」가 아니라 「끄고 나서」다. 초대 카드를 «다시 보지 않기»로 닫는다.
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
  await page.click('[data-testid="tour-never"]');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.body.focus());
  const ring = [];
  for (let t = 0; t < 10; t++) { await page.keyboard.press("Tab"); ring.push(await page.evaluate(WHERE)); }
  const grid = await page.evaluate(MOUSE_GRID);
  const digest = await page.evaluate(DIGEST);
  out.off = {
    outsideStops: ring.filter((w) => w.where === "outside").length,
    // 🔴 Tab 은 문서 끝에서 «되감기며» 브라우저 UI 를 거쳐 `body` 로 한 번 떨어진다 —
    //    그건 「갇혔다」가 아니다. 그래서 대조군의 판정선은 «가둠 0» 이지 «바깥 10» 이 아니다.
    confinedStops: ring.filter((w) => w.where === "callout" || w.where === "target").length,
    ring: ring.map((w) => `${w.where}:${w.testid ?? w.tag}`),
    grid,
    digest,
  };
  await page.close(); await ctx.close();
  // 🔴 대조군 판정 — OFF 면 «바깥 10/10» 이고 «눌리는 배경» 이 있어야 한다.
  if (out.off.confinedStops !== 0) die("대조군 불발 — 투어 OFF 인데 포커스가 말풍선·대상에 갇혔다", out.off);
  if (out.off.outsideStops < 8) die("대조군 불발 — 투어 OFF 인데 바깥 정거장이 8 미만이다(계측기 의심)", out.off);
  if (out.off.grid.liveBackgroundInteractive <= 0) die("대조군 불발 — 투어 OFF 인데 «눌리는 배경 요소»가 0이다", out.off.grid);
  if (out.off.digest.tourNodes !== 0) die("🔴 투어 OFF 인데 tour-* 노드가 남아 있다(규격 §⑤ 위반)", out.off.digest);
  if (out.off.digest.inertNodes !== 0) die("🔴 투어 OFF 인데 inert 노드가 남아 있다(폴백 복원 누락)", out.off.digest);
}

/* ── 본 측정 = 투어 ON 9단계 ──────────────────────────────────────────────── */
{
  const { c: ctx, p: page } = await fresh();
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
  await page.click('[data-testid="tour-start"]');
  let prevTitle = null;
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const title = await waitNewTitle(page, prevTitle);
    if (!title) die(`step ${i + 1} 도달 못 함`, { url: page.url(), prevTitle });
    prevTitle = title;
    await page.waitForTimeout(700);

    const kind = await advanceKind(page);
    const isInteractive = kind === "click-target";
    // ① Tab 0회 — 진입 직후 포커스가 어디인가
    const focusAt0 = await page.evaluate(WHERE);
    // ③ 마우스 격자
    const grid = await page.evaluate(MOUSE_GRID);
    // ② Tab 10회 — 순회 범위를 벗어나는가
    const ring = [];
    for (let t = 0; t < 10; t++) { await page.keyboard.press("Tab"); ring.push(await page.evaluate(WHERE)); }
    /* 🔴 **`document.body` 는 «이탈»이 아니다.** 브라우저는 문서 끝에서 탭 고리를 되감으며
       주소창 등 크롬 UI 를 거쳐 `body` 로 한 번 떨어진다 — 그건 배경 «내용»으로 나간 것이
       아니다. 첫 판정선이 이것을 이탈로 세어 «②도 미달성»이라는 거짓 빨강을 냈다.
       이탈의 정의 = **경계 밖의 «실재 요소»에 포커스가 갔는가**. body 는 따로 센다. */
    const allowed = (w) => (isInteractive ? w.where === "callout" || w.where === "target" : w.where === "callout");
    const escaped = ring.filter((w) => w.where === "outside" && !allowed(w));
    const bodyStops = ring.filter((w) => w.where === "body").length;

    out.steps.push({
      step: i + 1, title, kind, isInteractive,
      cond1_focusAt0: focusAt0,
      cond1_pass: isInteractive ? focusAt0.where === "target" : null,
      cond2_escapedOf10: escaped.length,
      cond2_bodyStops: bodyStops,
      cond2_pass: escaped.length === 0,
      cond2_sample: [...new Set(escaped.map((w) => `${w.where}:${w.testid ?? w.tag}:${w.label}`))].slice(0, 5),
      cond3_liveBackground: grid.liveBackgroundInteractive,
      cond3_pass: grid.liveBackgroundInteractive === 0,
      cond3_sample: grid.samples.slice(0, 4),
      inertHits: grid.inertHits,
      ringWhere: ring.map((w) => w.where),
    });

    if (kind === "end") break;
    if (kind === "next") await page.click('[data-testid="tour-next"]');
    else if (kind === "goto") await page.click('[data-testid="tour-goto"]');
    else if (kind === "click-target") {
      const chip = page.locator('[data-testid="candidate"] a[href^="/evidence/"]').first();
      await chip.waitFor({ state: "visible", timeout: 15000 });
      await chip.click();
    }
  }
  await page.close(); await ctx.close();
}

const inter = out.steps.filter((s) => s.isInteractive);
out.total = {
  steps: out.steps.length,
  interactiveSteps: inter.length,
  cond1_pass: inter.filter((s) => s.cond1_pass).length,
  cond2_pass: out.steps.filter((s) => s.cond2_pass).length,
  cond3_pass: out.steps.filter((s) => s.cond3_pass).length,
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`[${LABEL}] 대조군(투어 OFF): 바깥 ${out.off.outsideStops}/10 · 가둠 ${out.off.confinedStops} · 눌리는 배경 ${out.off.grid.liveBackgroundInteractive} · tour 노드 ${out.off.digest.tourNodes} · inert 노드 ${out.off.digest.inertNodes}`);
for (const s of out.steps)
  console.log(
    `  step${s.step} ${s.isInteractive ? "interactive" : "info       "} | ①진입포커스=${s.cond1_focusAt0.where}(${s.cond1_focusAt0.testid ?? s.cond1_focusAt0.tag})${s.cond1_pass === null ? "" : s.cond1_pass ? " ✅" : " 🔴"}` +
      ` | ②이탈 ${s.cond2_escapedOf10}/10(body ${s.cond2_bodyStops})${s.cond2_pass ? " ✅" : " 🔴"}` +
      ` | ③눌리는배경 ${s.cond3_liveBackground}${s.cond3_pass ? " ✅" : " 🔴"} (inert 적중 ${s.inertHits})`,
  );
console.log(`[${LABEL}] 합계 — ① ${out.total.cond1_pass}/${out.total.interactiveSteps} · ② ${out.total.cond2_pass}/${out.total.steps} · ③ ${out.total.cond3_pass}/${out.total.steps}`);
await browser.close();
