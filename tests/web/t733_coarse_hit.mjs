/**
 * T7-33 · D-50 기전 재검 — 「`nav-incidents` 히트를 «coarse 포인터»에서 다시 잰다」. 리바이2 41대.
 *
 * 🔴 왜 다시 재는가: `.fkt-hit::before`(세로 `max(100%, 2.75rem)`)는 `globals.css` 에서
 *    **`@media (pointer: coarse)` 안에만** 있다. 34대의 236×36 은 `newContext({ viewport })`
 *    만으로 잰 값 — **규칙이 «적용되지 않은» 상태**의 값이다. 그러니 그 숫자로는 「덮였다」를
 *    말할 수 없다. 「touch 를 켰다」≠「coarse 가 됐다」이므로 **`matchMedia` 를 값으로 남긴다**.
 *
 * 판정 2열(같은 실행 · 같은 뷰포트):
 *   ① coarse(`hasTouch: true`) — 히트 세로 **44 이상이면 D-50 폐기**(측정 매체 오기)
 *      · **44 미만이면 덮임 확정** → 그때만 `elementFromPoint` 로 덮는 실물을 지목한다.
 *   ② fine(대조) — 36 이 나와야 「둘이 같은 것을 보고 있다」가 선다.
 *
 * 히트 계수법 = 중앙선에서 위·아래로 훑어 **자기 또는 자손이 답하는** 구간(= `::before` 는
 * 자기 요소로 히트테스트된다). 판정선을 셀렉터가 아니라 **화면이 쓰는 표지**(`data-testid`)로 잡는다.
 *
 *   node t733_coarse_hit.mjs --base=http://127.0.0.1:8798
 */
import { chromium } from "playwright";

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const BASE = arg("base", "http://127.0.0.1:8798");
const W = Number(arg("w", 1440));
const H = Number(arg("h", 900));
const TARGET = arg("testid", "nav-incidents");

/* 브라우저 안에서 도는 계수기. 중앙선에서 0.5px 씩 밖으로 훑는다. */
const MEASURE = ({ testid }) => {
  const els = Array.from(document.querySelectorAll(`[data-testid="${testid}"]`));
  const vis = els.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    return typeof el.checkVisibility === "function"
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : !!el.offsetParent;
  });
  if (vis.length === 0) return { found: 0 };
  const el = vis[0];
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = r.top + r.height / 2;
  const mine = (node) => !!node && (node === el || el.contains(node));

  /* 중앙점이 자기 것이 아니면 이미 덮여 있다 — 그 사실부터 값으로 낸다. */
  const atCenter = document.elementFromPoint(cx, cy);
  const describe = (n) =>
    n
      ? `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.getAttribute?.("data-testid") ? "[" + n.getAttribute("data-testid") + "]" : ""}.${(n.className && typeof n.className === "string" ? n.className : "").split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`
      : "(없음)";

  const walk = (dir) => {
    let y = cy;
    let last = y;
    for (let k = 0; k < 2000; k++) {
      const ny = cy + dir * k * 0.05;
      if (ny < 0 || ny > window.innerHeight) break;
      const n = document.elementFromPoint(cx, ny);
      if (!mine(n)) return { edge: last, blocker: describe(n), blockedAt: ny };
      last = ny;
      y = ny;
    }
    return { edge: y, blocker: null, blockedAt: null };
  };
  const up = walk(-1);
  const down = walk(1);

  const beforeH = (() => {
    const cs = getComputedStyle(el, "::before");
    return { content: cs.content, height: cs.height, position: cs.position };
  })();

  return {
    found: vis.length,
    navVariant: el.getAttribute("data-nav-variant"),
    rect: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top * 10) / 10 },
    centerOwned: mine(atCenter),
    centerNode: describe(atCenter),
    hitTop: Math.round(up.edge * 10) / 10,
    hitBottom: Math.round(down.edge * 10) / 10,
    hitH: Math.round((down.edge - up.edge) * 10) / 10,
    blockerAbove: up.blocker,
    blockerBelow: down.blocker,
    before: beforeH,
  };
};

/* 덤 — 1440 에 보이는 `.fkt-hit` 전부의 히트 세로. */
const SWEEP = () => {
  const out = [];
  for (const el of Array.from(document.querySelectorAll(".fkt-hit"))) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const ok =
      typeof el.checkVisibility === "function"
        ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : !!el.offsetParent;
    if (!ok) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cx = Math.round(r.left + r.width / 2);
    const cy = r.top + r.height / 2;
    const mine = (n) => !!n && (n === el || el.contains(n));
    const walk = (dir) => {
      let last = cy;
      for (let k = 0; k < 2000; k++) {
        const ny = cy + dir * k * 0.05;
        if (ny < 0 || ny > window.innerHeight) break;
        if (!mine(document.elementFromPoint(cx, ny))) return last;
        last = ny;
      }
      return last;
    };
    out.push({
      id: el.getAttribute("data-testid") || (el.textContent ?? "").trim().slice(0, 20) || "(이름 없음)",
      boxH: Math.round(r.height * 10) / 10,
      hitH: Math.round((walk(1) - walk(-1)) * 10) / 10,
    });
  }
  return out;
};

async function column(browser, { label, hasTouch }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  /* 입장 화면이 앞을 막으면 통과시킨다 — 못 들어가면 «무대 없음»이다. */
  const enter = page.locator('[data-testid="enter-button"]');
  if (await enter.count().then((n) => n > 0).catch(() => false)) {
    await enter.first().click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  }
  await page.waitForSelector(`[data-testid="${TARGET}"]`, { timeout: 15000 }).catch(() => {});
  const media = await page.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
    fine: matchMedia("(pointer: fine)").matches,
    anyCoarse: matchMedia("(any-pointer: coarse)").matches,
    maxTouch: navigator.maxTouchPoints,
    url: location.pathname,
  }));
  const m = await page.evaluate(MEASURE, { testid: TARGET });
  const sweep = await page.evaluate(SWEEP);
  await ctx.close();
  return { label, hasTouch, media, m, sweep };
}

const browser = await chromium.launch();
const coarse = await column(browser, { label: "coarse(hasTouch:true)", hasTouch: true });
const fine = await column(browser, { label: "fine(대조)", hasTouch: false });
await browser.close();

const j = JSON.stringify;
console.log(`\n=========== T7-33 · D-50 coarse 재검 · base=${BASE} · ${W}x${H} · target=${TARGET} ===========`);
for (const c of [coarse, fine]) {
  console.log(`\n--- ${c.label} ---`);
  console.log(`매체 실측: ${j(c.media)}`);
  if (!c.m.found) { console.log("🔴 대상이 화면에 없다 — 이 열은 «안 잼»"); continue; }
  console.log(`대상: variant=${c.m.navVariant} · box ${c.m.rect.w}×${c.m.rect.h} · 중앙 소유 ${c.m.centerOwned ? "✓" : "✗ " + c.m.centerNode}`);
  console.log(`**히트 세로 = ${c.m.hitH}** (top ${c.m.hitTop} → bottom ${c.m.hitBottom})`);
  console.log(`  경계에서 답한 남: 위 ${c.m.blockerAbove ?? "(뷰포트 끝)"} · 아래 ${c.m.blockerBelow ?? "(뷰포트 끝)"}`);
  console.log(`  ::before computed: ${j(c.m.before)}`);
}

/* ── 판정 ─────────────────────────────────────────────────────────────── */
console.log("\n=========== 판정 ===========");
const mediaOk = coarse.media.coarse === true && fine.media.coarse === false;
console.log(`매체가 실제로 갈렸나(coarse 열만 pointer:coarse): ${mediaOk ? "✓" : "✗ — 「touch 를 켰다」가 「coarse 가 됐다」로 이어지지 않았다"}`);
if (!coarse.m.found || !fine.m.found) {
  console.log("🔴 대상 미발견 — 판정하지 않는다(미검증). exit 2");
  process.exit(2);
}
if (!mediaOk) {
  console.log("🔴 매체를 못 갈랐다 — coarse 축은 «안 잼»이다(초록도 빨강도 아니다). exit 2");
  process.exit(2);
}
/* 🔴 **내 자를 먼저 교정한다.** 훑기는 «자기 것이 나온 마지막 표본»으로 끝을 잡으므로
   끝점 쪽에서 계통 오차가 붙는다. 규칙이 적용됐고 이웃과 안 겹치는 자리의 참값은 정확히
   44(`max(100%, 2.75rem)` · 박스 27.5~36)이므로, **관측 최댓값 − 44 = 내 자의 편향**이다.
   이 교정 없이 44 와 비교하면 편향만큼 «없는 여유»나 «없는 미달»을 만든다. */
const bias = Math.round((Math.max(...coarse.sweep.map((s) => s.hitH)) - 44) * 100) / 100;
const cal = (v) => Math.round((v - bias) * 10) / 10;
const cH = cal(coarse.m.hitH);
const fH = cal(fine.m.hitH);
console.log(`계측기 교정: 관측 최댓값 ${Math.max(...coarse.sweep.map((s) => s.hitH))} − 44 = **편향 +${bias}px** (이 값을 모든 히트에서 뺀다)`);
console.log(`coarse 히트 ${coarse.m.hitH} → 교정 **${cH}** · fine 히트 ${fine.m.hitH} → 교정 **${fH}** (fine 대조가 36 근방이어야 「같은 것을 봤다」)`);
if (cH >= 44) {
  console.log(`[D-50] **폐기 후보** — coarse 에서 히트 세로 ${cH} ≥ 44. 34대의 36 은 «규칙이 적용되지 않은 매체»에서 잰 값(측정 매체 오기 · O-3).`);
} else {
  console.log(`[D-50] **덮임 확정** — coarse 인데도 ${cH} < 44. 덮는 실물: 위 ${coarse.m.blockerAbove ?? "(없음)"} · 아래 ${coarse.m.blockerBelow ?? "(없음)"}`);
}
console.log(`\n[덤] 1440 가시 \`.fkt-hit\` coarse 히트 세로 (≥44 / <44)`);
for (const s of coarse.sweep)
  console.log(`  ${cal(s.hitH) >= 44 ? "✅" : "⚠"} ${s.id} — box ${s.boxH} → hit ${s.hitH} → **교정 ${cal(s.hitH)}**`);
console.log(`\n🔴 안 잼: 실제 터치 입력(장치)·모바일 뷰포트·rail 접힘 상태 밖의 형상.`);
