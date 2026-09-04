/**
 * T7-24 2차 · **X-22** — 「`inert` 미지원 브라우저에서 **감시 형태 대체가 포인터를 실제로 막는가**」.
 * 정본 `docs/plan/test-plan-v1.md:150`. 리바이2 41대.
 *
 * 🔴 **지원하는 엔진에서는 그 갈래가 한 줄도 안 돈다.** 그래서 조건을 «강제»한다 —
 *    문서가 뜨기 «전»에 `HTMLElement.prototype` 에서 `inert` 를 지워
 *    `"inert" in HTMLElement.prototype` 를 false 로 만든다. 앱의 효과는 그때 폴백 갈래로 간다.
 *
 * 🔴 **자극 증인** = 「투어가 켜졌을 때 `inert` 가 걸린 요소 수」. 지원 열은 > 0, 강제 열은 0
 *    이어야 «갈래가 실제로 갈렸다»가 성립한다. 0/0 이면 내가 조건을 못 바꾼 것이다.
 *
 * 🔴 **닿는다 ≠ 눌린다.** `elementFromPoint` 로 소유자를 보고, **실제로 클릭해서** 그 동작이
 *    일어났는지(주소가 바뀌는지)까지 본다. 덮개가 있어도 클릭이 통과하면 안 막은 것이다.
 *
 *   node t724x_inert_fallback.mjs --shell=http://127.0.0.1:8104
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8104");
const BG = arg("bg", "nav-compare"); // 배경 쪽 상호작용 요소(투어 허용 집합 밖)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KILL_INERT = () => {
  try {
    delete HTMLElement.prototype.inert;
  } catch {}
  Object.defineProperty(window, "__inertKilled", { value: !("inert" in HTMLElement.prototype) });
};

const PROBE = ({ bg }) => {
  const el = document.querySelector(`[data-testid="${bg}"]`);
  const inertCount = Array.from(document.querySelectorAll("*")).filter((e) => e.inert === true).length;
  const tourOn = !!document.querySelector('[data-testid="tour-callout"]');
  if (!el) return { found: false, inertCount, tourOn, supports: "inert" in HTMLElement.prototype };
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const owner = document.elementFromPoint(cx, cy);
  const desc = (n) =>
    n ? `${n.tagName.toLowerCase()}${n.getAttribute?.("data-testid") ? "[" + n.getAttribute("data-testid") + "]" : ""}` : "(없음)";
  return {
    found: true,
    supports: "inert" in HTMLElement.prototype,
    inertCount,
    tourOn,
    rect: { x: cx, y: cy, w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    ownerAtPoint: desc(owner),
    ownerIsTarget: !!(owner && (owner === el || el.contains(owner))),
    selfInert: el.inert === true,
    closestInert: (() => {
      let n = el;
      while (n) {
        if (n.inert === true) return desc(n);
        n = n.parentElement;
      }
      return null;
    })(),
  };
};

async function column({ killInert }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (killInert) await ctx.addInitScript(KILL_INERT);
  const page = await ctx.newPage();
  await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
  const eb = page.locator('[data-testid="enter-button"]');
  if (await eb.count().then((n) => n > 0).catch(() => false)) {
    await eb.first().click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(1800);
  }
  /* 투어를 켠다 — 초대 카드의 「시작」이 있으면 그것, 없으면 재열람 버튼. */
  for (const sel of ['[data-testid="tour-start"]', '[data-testid="intro-reopen"]']) {
    const l = page.locator(sel);
    if (await l.count().then((n) => n > 0).catch(() => false)) {
      await l.first().click().catch(() => {});
      await sleep(2500);
      if (await page.locator('[data-testid="tour-callout"]').count().then((n) => n > 0)) break;
    }
  }
  await sleep(1200);
  const supportsAtRuntime = await page.evaluate(() => "inert" in HTMLElement.prototype);
  const before = await page.evaluate(PROBE, { bg: BG });
  const urlBefore = page.url();

  /* ① 포커스 감시 — 배경 요소에 포커스를 줘 보고 되돌려지는지. */
  let focusPulled = null;
  if (before.found) {
    focusPulled = await page.evaluate(
      ({ bg }) =>
        new Promise((res) => {
          const el = document.querySelector(`[data-testid="${bg}"]`);
          el?.focus();
          setTimeout(() => {
            const a = document.activeElement;
            res({ stayed: a === el, active: a ? a.tagName.toLowerCase() + (a.getAttribute("data-testid") ? "[" + a.getAttribute("data-testid") + "]" : "") : null });
          }, 400);
        }),
      { bg: BG },
    );
  }

  /* ② 🔴 실제 클릭 — 「닿는다」가 아니라 「눌린다」를 본다. 좌표 클릭이라 덮개가 있으면 덮개가 받는다. */
  let clickErr = null;
  if (before.found) {
    try {
      await page.mouse.click(before.rect.x, before.rect.y);
    } catch (e) {
      clickErr = String(e.message).slice(0, 60);
    }
  }
  await sleep(2000);
  const urlAfter = page.url();
  const after = await page.evaluate(PROBE, { bg: BG });
  await ctx.close();
  await browser.close();
  return { killInert, supportsAtRuntime, before, after, urlBefore, urlAfter, focusPulled, clickErr };
}

const supported = await column({ killInert: false });
const forced = await column({ killInert: true });

const j = JSON.stringify;
const row = (label, c) => {
  console.log(`\n--- ${label} ---`);
  console.log(`런타임 "inert" in HTMLElement.prototype = **${c.supportsAtRuntime}**`);
  console.log(`투어 켜짐 = ${c.before.tourOn} · 대상(${BG}) 발견 = ${c.before.found}`);
  console.log(`🔴 자극 증인 — inert 가 걸린 요소 수 = **${c.before.inertCount}**`);
  console.log(`점 소유자 = ${c.before.ownerAtPoint} (대상 것인가 ${c.before.ownerIsTarget}) · 대상의 inert 조상 = ${c.before.closestInert ?? "없음"}`);
  console.log(`포커스 감시: 배경에 포커스 → ${c.focusPulled ? (c.focusPulled.stayed ? "**남았다**(안 되돌림)" : `되돌려짐 → ${c.focusPulled.active}`) : "—"}`);
  console.log(`실제 클릭: ${c.urlBefore} → ${c.urlAfter} ⇒ ${c.urlBefore === c.urlAfter ? "**주소 안 바뀜(막혔다)**" : "🔴 **주소가 바뀌었다 = 눌렸다**"}${c.clickErr ? " · 오류 " + c.clickErr : ""}`);
};

console.log(`\n=============== X-22 · inert 미지원 폴백이 포인터를 막는가 · base=${SHELL} ===============`);
row("지원 열(대조군 · 손대지 않음)", supported);
row("강제 열(`inert` 를 프로토타입에서 제거)", forced);

console.log("\n=============== 판정 ===============");
const branchSwitched = supported.supportsAtRuntime === true && forced.supportsAtRuntime === false;
const witness = supported.before.inertCount > 0 && forced.before.inertCount === 0;
const tourOn = supported.before.tourOn && forced.before.tourOn;
const supBlocked = supported.urlBefore === supported.urlAfter;
const fbBlocked = forced.urlBefore === forced.urlAfter;
console.log(`갈래가 갈렸나(지원 true / 강제 false) = ${branchSwitched ? "✓" : "✗"}`);
console.log(`자극 증인(지원 열 inert 건수 ${supported.before.inertCount} > 0 · 강제 열 ${forced.before.inertCount} = 0) = ${witness ? "✓" : "✗"}`);
console.log(`무대가 섰나(두 열 다 투어 켜짐) = ${tourOn ? "✓" : "✗"}`);
console.log(`대조군 — 지원 열에서 클릭이 막히나 = ${supBlocked ? "✓ 막힘" : "🔴 안 막힘(대조군이 빨강 — 이 그물로는 «막힘»을 못 잰다)"}`);
if (!tourOn || !branchSwitched || !witness) {
  console.log(`[X-22] **미검증** — 조건을 못 세웠다(투어 ${tourOn} · 갈래 ${branchSwitched} · 증인 ${witness}). 초록도 빨강도 아니다.`);
} else if (!supBlocked) {
  console.log(`[X-22] **미검증** — 지원 열에서도 안 막힌다(내 대조군이 「막힘」을 못 보인다).`);
} else {
  console.log(`[X-22] ${fbBlocked ? "PASS — 폴백도 포인터를 막는다" : "🔴 **FAIL** — `inert` 없는 갈래에서 배경 클릭이 «눌렸다»(주소가 바뀌었다). 폴백은 포커스만 지키고 포인터는 안 막는다."}`);
}
console.log("\n🔴 안 잼: 실제 구형 엔진(여기서는 프로토타입을 지워 «조건»만 강제했다) · 키보드 축 · 터치 축 · 다른 스텝.");
