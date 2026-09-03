/**
 * T7-B 투어 접근성 실측 — 「키보드 완주 · 포커스 · ARIA · Esc · 포커스 복귀」 5축.
 *
 * 🔴 **판정선의 출처를 먼저 적는다**(정본 = `docs/design/t6-5-guided-tour-spec.md`).
 *   - §①-3(12행) 「**막지 않는다** — 첫 방문 = 모달이 **아니라** 초대 카드 · **배경 조작 가능**」
 *   - §③(41행) 콜아웃 `role="region" aria-label="가이드 투어"` · `aria-live="polite"`
 *   - §⑤(59행) 「Tab 순회 · Enter = 다음 · Esc = 종료(포커스 = `?` 링크로 복귀) ·
 *              **스텝 열릴 때 포커스 = 콜아웃 제목**」 · (60행) 딤·링 `aria-hidden`
 *   - §(74행) 인수 「Tab/Enter/Esc **만으로 완주** · 포커스 복귀」
 *   🔴 즉 **focus trap 은 우리 정본의 요구가 아니다 — 정본은 오히려 «안 가둔다»를 명시한다.**
 *      그래서 이 그물은 「갇히는가」를 **사실로만** 재고, 「안 갇힘 = 결함」으로 칠하지 않는다.
 *      성숙한 라이브러리의 관행(trap)과 우리 정본(non-modal)은 **다른 설계 선택**이고,
 *      어느 쪽이 옳은지는 이 좌석이 정하지 않는다. 대조표가 쓸 수 있게 **양쪽을 같이 적는다.**
 *
 * 🔴 못 세우는 것 — 실제 스크린리더(NVDA·VoiceOver)는 **못 돌린다**. 사정거리는 **DOM 속성까지**다.
 *    「aria-live 가 있다」와 「스크린리더가 실제로 읽는다」는 다른 사실이고, 뒤는 안 쟀다.
 *    뷰포트 1440×900 1벌 · chromium 1벌 · prod 1벌.
 *
 * 사용: node t7b_tour_a11y.mjs --base http://127.0.0.1:3111 --out x.json
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

/** 지금 포커스가 «어디»인가 — 말풍선 안인지 밖인지, 밖이면 그 자리 이름까지. */
const WHERE = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body", inCallout: false, label: "(document.body)" };
  const owner = el.closest("[data-testid]");
  return {
    tag: el.tagName.toLowerCase(),
    inCallout: !!el.closest('[data-testid="tour-callout"]'),
    testid: el.getAttribute("data-testid") ?? (owner ? owner.getAttribute("data-testid") : null),
    label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
    href: el.getAttribute("href"),
  };
};

const ARIA = () => {
  const c = document.querySelector('[data-testid="tour-callout"]');
  const s = document.querySelector('[data-testid="tour-spotlight"]');
  const t = document.querySelector('[data-testid="tour-title"]');
  const at = (el, ...names) =>
    el ? Object.fromEntries(names.map((n) => [n, el.getAttribute(n)])) : null;
  return {
    callout: at(c, "role", "aria-label", "aria-labelledby", "aria-live", "aria-modal", "aria-describedby", "tabindex", "aria-atomic"),
    spotlight: at(s, "aria-hidden", "role"),
    title: t ? { tag: t.tagName.toLowerCase(), id: t.id || null, tabindex: t.getAttribute("tabindex") } : null,
    // 배경을 «가리는» 장치가 있는가(모달형 라이브러리의 표지) — 우리 정본은 안 가린다고 했다.
    bodyInert: Array.from(document.body.children).some((el) => el.hasAttribute("inert")),
    bodyAriaHidden: Array.from(document.body.children).some((el) => el.getAttribute("aria-hidden") === "true" && !el.closest('[data-testid="tour-spotlight"]')),
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

/** 키보드만으로 `tour-start` 까지 가서 연다. 마우스를 한 번도 안 쓴다. */
const openByKeyboard = async (page, maxTab = 40) => {
  await page.keyboard.press("Tab"); // 문서 진입
  for (let i = 1; i <= maxTab; i++) {
    const w = await page.evaluate(WHERE);
    if (w.testid === "tour-start") {
      await page.keyboard.press("Enter");
      return { reached: true, tabs: i };
    }
    await page.keyboard.press("Tab");
  }
  return { reached: false, tabs: maxTab };
};

const browser = await chromium.launch();
const out = { base: BASE, at: new Date().toISOString(), passes: {} };
/* 🔴 pass 마다 «새 컨텍스트». 같은 컨텍스트를 나눠 쓰면 앞 pass 가 남긴 `fkt.tour.v1` 때문에
   초대 카드가 안 뜬다(status !== "never") — 내 계측기가 무대를 스스로 무너뜨리는 자리다. */
const fresh = async () => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.route("**/api/live/status", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }),
  );
  return { c, p };
};

/* ───────── Pass A — 축① 「Tab/Enter/Esc «만으로» 9단계 완주」(정본 74행 인수) ───────── */
{
  const { c: ctx, p: page } = await fresh();
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  const opened = await openByKeyboard(page);
  const steps = [];
  let alive = opened.reached;
  if (alive) alive = await waitTitle(page, TITLES[0]);
  for (let i = 0; alive && i < 9; i++) {
    await page.waitForTimeout(600);
    const focusAtOpen = await page.evaluate(WHERE);
    const kind = ADVANCE[i];
    const rec = { step: i + 1, title: TITLES[i], kind, focusAtOpen, tabsToControl: null, key: null, advanced: false };
    if (kind === "end") {
      steps.push({ ...rec, advanced: null, note: "마지막 스텝 — 넘길 곳이 없다" });
      break;
    }
    // 진행 컨트롤까지 Tab 으로 «닿는가»를 먼저 센다(Enter 단축키가 있어도 도달성은 별개 사실이다).
    const want = kind === "next" ? "tour-next" : kind === "goto" ? "tour-goto" : "__evidence-chip__";
    let found = false;
    for (let t = 1; t <= 60; t++) {
      await page.keyboard.press("Tab");
      const w = await page.evaluate(WHERE);
      const hit =
        want === "__evidence-chip__"
          ? w.tag === "a" && (w.href ?? "").startsWith("/evidence/")
          : w.testid === want;
      if (hit) {
        rec.tabsToControl = t;
        rec.focusOnControl = w;
        found = true;
        break;
      }
    }
    rec.controlReachableByTab = found;
    if (found) {
      await page.keyboard.press("Enter");
      rec.key = "Enter";
    } else {
      // 컨트롤에 못 닿았다 — Enter 단축키(정본 59행)라도 듣는지 마지막으로 물어본다.
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press("Enter");
      rec.key = "Enter(단축키 · 컨트롤 미도달)";
    }
    const next = i + 1 < 9 ? TITLES[i + 1] : null;
    rec.advanced = next ? await waitTitle(page, next, 12000) : true;
    steps.push(rec);
    alive = rec.advanced;
  }
  out.passes.keyboardOnly = {
    openedByKeyboard: opened,
    stepsCompleted: steps.filter((s) => s.advanced !== false).length,
    reachedLastStep: steps.some((s) => s.kind === "end"),
    steps,
  };
  await page.close();
  await ctx.close();
}

/* ───────── Pass B — 축②③ 포커스 누수 · ARIA · 스텝 열릴 때 포커스 ───────── */
{
  const { c: ctx, p: page } = await fresh();
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
  await page.click('[data-testid="tour-start"]');
  const steps = [];
  for (let i = 0; i < 9; i++) {
    if (!(await waitTitle(page, TITLES[i]))) break;
    await page.waitForTimeout(600);
    const focusAtOpen = await page.evaluate(WHERE);
    const aria = await page.evaluate(ARIA);
    // Tab 25회 순회 — 말풍선 밖으로 새는 자리를 전부 적는다.
    const ring = [];
    for (let t = 0; t < 25; t++) {
      await page.keyboard.press("Tab");
      ring.push(await page.evaluate(WHERE));
    }
    const leaks = ring.filter((w) => !w.inCallout);
    steps.push({
      step: i + 1,
      title: TITLES[i],
      focusAtOpen,
      focusAtOpenIsTitle: focusAtOpen.testid === "tour-title",
      aria,
      tabRingLen: ring.length,
      leakCount: leaks.length,
      trapped: leaks.length === 0,
      leakSample: [...new Set(leaks.map((w) => `${w.tag}:${w.testid ?? "-"}:${w.label}`))].slice(0, 6),
    });
    if (ADVANCE[i] === "next") await page.click('[data-testid="tour-next"]');
    else if (ADVANCE[i] === "goto") await page.click('[data-testid="tour-goto"]');
    else if (ADVANCE[i] === "click-target") {
      const chip = page.locator('[data-testid="candidate"] a[href^="/evidence/"]').first();
      await chip.waitFor({ state: "visible", timeout: 15000 });
      await chip.click();
    }
  }
  out.passes.focusAndAria = { steps };
  await page.close();
  await ctx.close();
}

/* ───────── Pass C — 축④⑤ Esc 로 나가지는가 · 나온 뒤 상태 · 포커스 복귀 ───────── */
{
  const { c: ctx, p: page } = await fresh();
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 20000 });
  await page.click('[data-testid="tour-start"]');
  await waitTitle(page, TITLES[0]);
  await page.click('[data-testid="tour-next"]');
  await waitTitle(page, TITLES[1]); // step2 에서 끊는다(중간 지점)
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.localStorage.getItem("fkt.tour.v1"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const closed = await page.evaluate(() => !document.querySelector('[data-testid="tour-callout"]'));
  const after = await page.evaluate(() => window.localStorage.getItem("fkt.tour.v1"));
  const focusAfter = await page.evaluate(WHERE);
  // 나간 뒤 다시 열리는가(진행이 남았는가) — 「중단」과 「완료」를 가른다.
  await page.click('[data-testid="intro-reopen"]');
  await page.waitForTimeout(1200);
  const reopenedTitle = await readTitle(page);
  out.passes.escape = {
    stateBefore: before,
    escapeClosedCallout: closed,
    stateAfter: after,
    focusAfterEscape: focusAfter,
    focusReturnedToReopen: focusAfter.testid === "intro-reopen",
    reopenedAtTitle: reopenedTitle,
    resumedWhereLeftOff: reopenedTitle === TITLES[1],
  };
  await page.close();
  await ctx.close();
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const A = out.passes.keyboardOnly;
console.log(`\n[축①] 키보드로 열기: ${A.openedByKeyboard.reached ? `OK(Tab ${A.openedByKeyboard.tabs}회)` : "실패"}`);
for (const s of A.steps) {
  console.log(
    `  step${s.step} ${String(s.kind).padEnd(12)} 컨트롤 Tab 도달=${s.controlReachableByTab ?? "-"}` +
      `(${s.tabsToControl ?? "-"}회) 진행=${s.advanced} 열릴때포커스=${s.focusAtOpen.tag}:${s.focusAtOpen.testid ?? "-"}`,
  );
}
console.log(`\n[축②③] 스텝별 포커스·ARIA`);
for (const s of out.passes.focusAndAria.steps) {
  console.log(
    `  step${s.step} 열릴때포커스=${s.focusAtOpen.tag}:${s.focusAtOpen.testid ?? "-"} (제목?${s.focusAtOpenIsTitle})` +
      ` | Tab25 중 말풍선 밖 ${s.leakCount}회 · trapped=${s.trapped}`,
  );
  if (s.step === 1) console.log(`        aria=${JSON.stringify(s.aria)}`);
  if (s.leakSample.length) console.log(`        새는 자리: ${s.leakSample.join(" | ")}`);
}
console.log(`\n[축④⑤] ${JSON.stringify(out.passes.escape, null, 1)}`);
await browser.close();
