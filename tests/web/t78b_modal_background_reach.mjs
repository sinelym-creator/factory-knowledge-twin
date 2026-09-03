/**
 * D-44 확증 — **모달이 열린 채로 «배경»이 정말 눌리는가.**
 *
 * 🔴 스캔은 「`elementFromPoint` 가 배경 버튼을 돌려준다」까지만 말한다 = **가로막는 덮개가 없다.**
 *    그건 **「닿는다」**이지 **「눌린다」**가 아니다(반쪽 스텁의 반대 얼굴 — 닿는가 vs 답하는가).
 *    그래서 **실제로 클릭**해 보고 **대상이 반응했는지**를 값으로 남긴다.
 *
 * 판정선 = 규격 §⑧-5 계열 · WAI-ARIA `aria-modal="true"` 의 뜻:
 *   > "indicates whether an element is modal when displayed" — 보조기술은 **다이얼로그 밖을
 *   > 탐색 대상에서 제외**한다. 그렇게 «선언»했는데 포인터에는 배경이 열려 있으면
 *   > **선언과 실제가 다르다**(이름·역할·값이 실제와 같아야 한다 — 4.1.2 계열).
 *
 * 🔴 **이것은 2.5.8 축이 아니다.** 대상 크기 판정(T7-8b)의 PASS 와 무관하게 별건으로 낸다.
 *
 * 🔴 **양방향 대조군** — 같은 실행에서 **투어**(배경 `inert`)도 같은 방식으로 눌러 본다.
 *    투어에서 «안 눌리고» 모달에서 «눌리면», 이 그물이 「전부 눌린다」고 답하는 자가 아님이 증명된다.
 *    한 쪽만 보면 「내 클릭이 원래 안 통한다」와 「배경이 막혀 있다」를 못 가른다.
 *
 * 🔴 **이 측정이 사람보다 유리/불리한 점** — 유리: 클릭 전후의 DOM 을 정확히 대조한다.
 *    불리: 사람은 「눌러도 되는가」를 **보고** 판단하는데(흐려진 배경 = 누르지 말라는 신호),
 *    나는 그 시각적 만류를 못 읽는다. 그래서 이 그물의 빨강은 **「기술적으로 눌린다」**까지다.
 *
 * 사용: node t78b_modal_background_reach.mjs --base http://127.0.0.1:3116 [--width 1440]
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "");
const WIDTH = Number(arg("width", 1440));
if (!BASE) { console.error("[exit2] --base 가 없다"); process.exit(2); }

const browser = await chromium.launch();
const out = { base: BASE, width: WIDTH, at: new Date().toISOString(), cases: [] };

/** 배경 대상 하나를 이름으로 골라 «클릭»하고, 눌렸는지 흔적으로 판정한다. */
async function probe(label, openState) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
  const page = await ctx.newPage();
  await page.route("**/api/live/status", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }));
  await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);

  /* 배경 표적 = 「조사 시작」 — 누르면 **화면을 옮긴다**. 눌렸는지가 URL 로 드러난다. */
  const targetName = /조사 시작/;
  const before = { url: page.url(), count: await page.getByRole("button", { name: targetName }).count() };
  if (!before.count) { await ctx.close(); return { label, skipped: "배경 표적(「조사 시작」)이 없다" }; }

  const opened = await openState(page);
  const state = await page.evaluate(() => ({
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    ariaModal: document.querySelectorAll('[aria-modal],[aria-modal="true"]').length,
    inertRoots: document.querySelectorAll("[inert]").length,
  }));

  /* ① «닿는가» — 배경 표적의 중심에서 elementFromPoint 가 그 표적을 돌려주는가(덮개 유무). */
  const reach = await page.evaluate((re) => {
    const rx = new RegExp(re);
    const el = Array.from(document.querySelectorAll("button")).find((b) => rx.test((b.textContent ?? "").trim()));
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      ownsCenter: !!hit && (hit === el || el.contains(hit)),
      hitTag: hit ? `${hit.tagName}.${String(hit.className).slice(0, 30)}` : null,
      inertAncestor: !!el.closest("[inert]"),
    };
  }, targetName.source);

  /* ② «눌리는가» — 실제 클릭. force 를 쓰지 않는다(가로막힘도 «결과»다). */
  let clicked = { ok: false, error: null };
  try {
    await page.getByRole("button", { name: targetName }).first().click({ timeout: 3000 });
    clicked.ok = true;
  } catch (e) { clicked.error = String(e).split("\n")[0].slice(0, 160); }
  await page.waitForTimeout(1200);
  const after = { url: page.url(), dialogs: await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length) };

  await ctx.close();
  return {
    label, stateOpened: opened, state, reach, clicked,
    urlBefore: before.url, urlAfter: after.url,
    navigated: before.url !== after.url,
    verdict: before.url !== after.url ? "배경이 «눌렸다»" : clicked.ok ? "클릭은 갔으나 이동 없음(판정 보류)" : "배경이 «안 눌렸다»",
  };
}

out.cases.push(await probe("modal(세션 리셋 확인)", async (page) => {
  const b = page.getByRole("button", { name: /세션 리셋/ }).first();
  if (!(await b.count())) return false;
  await b.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
  return (await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)) > 0;
}));

out.cases.push(await probe("tour(대조군 — 배경 inert)", async (page) => {
  const b = page.getByRole("button", { name: /둘러보기 시작/ }).first();
  if (!(await b.count())) return false;
  await b.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(900);
  return (await page.evaluate(() => document.querySelectorAll("[inert]").length)) > 0;
}));

for (const c of out.cases) {
  console.log(`\n=== ${c.label}`);
  if (c.skipped) { console.log(`  건너뜀 — ${c.skipped}`); continue; }
  console.log(`  상태 열림 ${c.stateOpened} · dialog ${c.state.dialogs} · aria-modal ${c.state.ariaModal} · inert 루트 ${c.state.inertRoots}`);
  console.log(`  ① 닿는가 — 중심 소유 ${c.reach.ownsCenter} (덮은 것: ${c.reach.hitTag}) · inert 조상 ${c.reach.inertAncestor}`);
  console.log(`  ② 눌리는가 — 클릭 ${c.clicked.ok ? "성공" : "실패: " + c.clicked.error}`);
  console.log(`  URL ${c.urlBefore} → ${c.urlAfter}`);
  console.log(`  ⇒ ${c.verdict}`);
}

/* 🔴 대조군이 안 울면 이 회차의 초록은 근거가 아니다. */
const modal = out.cases.find((c) => c.label.startsWith("modal"));
const tour = out.cases.find((c) => c.label.startsWith("tour"));
if (!modal || !tour || modal.skipped || tour.skipped) { console.error("\n[exit2] 두 갈래 중 하나가 안 돌았다 — 대조가 성립 안 한다"); process.exit(2); }
if (tour.navigated) { console.error("\n[exit2] 대조군 불발 — inert 배경인데도 «눌렸다». 이 그물의 음성 방향이 죽었다"); process.exit(2); }
console.log(`\n대조: 모달 배경 «${modal.navigated ? "눌림" : "안 눌림"}» / 투어(inert) 배경 «${tour.navigated ? "눌림" : "안 눌림"}»`);
console.log(modal.navigated
  ? "🔴 D-44 확증 — aria-modal 을 «선언»했는데 포인터에는 배경이 열려 있다."
  : "모달 배경도 안 눌린다 — D-44 는 «선언과 실제의 불일치»가 아니다(회부 철회 근거).");
await browser.close();
