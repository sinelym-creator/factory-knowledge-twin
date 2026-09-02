/**
 * t61_public_replay_probe — T6-1 축 ⑦ «공개 replay» (검증 좌석 · 29대).
 *
 * 승격된 공개 셸에서 **정적 replay 녹화본**을 열어, T6-1 합성이 화면에 실제로 서는지 본다.
 *
 * 🔴 **live 축은 «녹화본»에서만 참이다.** 공개 셸에서 새 run 을 시작하면 그 인스턴스는 게이트웨이가
 *    없으므로 `data-axis=live` 를 기대하는 것 자체가 틀린 축이다(그리고 429 자극이 된다).
 *    그래서 이 프로브는 **run 을 만들지 않는다** — 진입은 정적 run id 하나뿐이다.
 *
 * 🔴 **판정선은 「배지가 떠 있다」가 아니라 「그 이벤트가 그것을 그린다」이다.** 배지가 늘 떠 있는
 *    화면과, 합성 이벤트가 적용될 때 비로소 서는 화면은 완주 시점만 보면 구별되지 않는다.
 *    그래서 되감기 경계를 잰다: 합성 이벤트 «직전»에서 부재 → 한 칸 앞으로 → 등장.
 *
 *      FKT_PUB_BASE  공개 셸 (기본 https://factory-knowledge-twin.vercel.app)
 *      FKT_PUB_RUN   정적 run id (기본 STATIC-GS-01)
 *      FKT_PUB_INC   사건 id (기본 INC-2026-014)
 *
 * exit: 0 = 축 충족 · 1 = 어긋남 · 2 = 측정 불가(무대 없음 — 초록도 빨강도 아니다)
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const BASE = process.env.FKT_PUB_BASE ?? "https://factory-knowledge-twin.vercel.app";
const RUN = process.env.FKT_PUB_RUN ?? "STATIC-GS-01";
const INC = process.env.FKT_PUB_INC ?? "INC-2026-014";

const out = [];
const say = (s) => { out.push(s); console.log(s); };
const bad = (s) => { say(`🔴 ${s}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

/** 나가는 요청을 센다 — 「정적 replay 만 봤다」를 자기 신고가 아니라 자취로 남기기 위한 것. */
const runPosts = [];
page.on("request", (r) => {
  if (r.method() !== "GET" && /\/api\//.test(r.url())) runPosts.push(`${r.method()} ${new URL(r.url()).pathname}`);
});

// ① 쿠키는 «/» 가 먼저 준다 — 곧장 /incidents 로 가면 가드가 되돌린다.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/overview$/, { timeout: 60_000 });
const cookieNames = (await ctx.cookies()).map((c) => c.name).sort().join(",");

// ② 정적 replay 진입 — 새 run 을 만들지 않는다.
const target = `${BASE}/incidents/${INC}?run=${RUN}`;
const resp = await page.goto(target, { waitUntil: "domcontentloaded" });
const landedStatus = resp ? resp.status() : null;
const landedUrl = page.url();

const consoleEl = page.locator("[data-testid=run-console]");
if ((await consoleEl.count()) === 0) {
  bad(`무대 없음 — 공개 셸에 run-console 이 없다 (status=${landedStatus} url=${landedUrl})`);
  await browser.close();
  process.exit(2);
}

const cursor = page.locator("[data-testid=replay-cursor]");
const badge = page.locator("[data-testid=synthesis-badge]");
const rationale = page.locator("[data-testid=candidate-rationale]");

/** 커서 계수는 매번 화면에서 다시 읽는다 — 내가 센 수를 판정에 옮기지 않는다. */
async function readCursor() {
  await cursor.first().waitFor({ state: "visible", timeout: 30_000 });
  return {
    applied: Number(await cursor.first().getAttribute("data-applied")),
    total: Number(await cursor.first().getAttribute("data-total")),
  };
}

/**
 * 🔴 클릭은 벽시계인데 화면은 리렌더를 기다린다 — 누른 «직후»에 읽으면 옛 값을 대상의 답으로
 *    적게 된다(29대 1차 실행에서 실제로 그렇게 읽어 restart 3건이 빨강으로 나왔다).
 *    그래서 값이 «바뀔 때까지» 기다리고, 안 바뀌면 안 바뀐 채로 기록한다(기다림이 판정을 만들지
 *    않게 — 변화 없음도 측정값이다).
 */
async function clickAndSettle(testid, expectChangeFrom) {
  const btn = page.locator(`[data-testid=${testid}]`);
  const n = await btn.count();
  const disabled = n ? await btn.first().isDisabled() : null;
  if (n === 1 && !disabled) await btn.first().click();
  let c = await readCursor();
  for (let i = 0; i < 30 && expectChangeFrom !== undefined && c.applied === expectChangeFrom; i += 1) {
    await page.waitForTimeout(100);
    c = await readCursor();
  }
  return { c, n, disabled };
}
async function readScreen() {
  const n = await badge.count();
  return {
    badge: n,
    axis: n ? await badge.first().getAttribute("data-axis") : null,
    badgeText: n ? (await badge.first().innerText()).replace(/\s+/g, " ").trim() : null,
    rationale: await rationale.count(),
    firstRationale: (await rationale.count())
      ? (await rationale.first().innerText()).replace(/\s+/g, " ").trim()
      : null,
    candidates: await page.locator("[data-testid=candidate]").count(),
  };
}

// 완주 상태로 안착할 때까지 — 커서 total 이 0 이면 아직 이벤트를 못 받은 것이다.
let end = await readCursor();
for (let i = 0; i < 60 && (end.total === 0 || end.applied !== end.total); i += 1) {
  await page.waitForTimeout(500);
  end = await readCursor();
}
const at_end = await readScreen();
const status = await consoleEl.getAttribute("data-status");

say(`== 축 ⑦ 공개 replay · ${BASE}`);
say(`  진입        : ${landedUrl} (status=${landedStatus}) · 쿠키 [${cookieNames}]`);
say(`  콘솔 상태    : data-status=${status}`);
say(`  커서(완주)   : ${end.applied}/${end.total}`);
say(`  합성 배지    : ${at_end.badge}개 · data-axis=${at_end.axis} · "${at_end.badgeText}"`);
say(`  후보/rationale: ${at_end.candidates} / ${at_end.rationale}`);
say(`  첫 rationale : ${at_end.firstRationale ? at_end.firstRationale.slice(0, 200) : "(없음)"}`);

// ③ 되감기 — 처음으로.
const r0 = await clickAndSettle("replay-restart", end.applied);
const at0 = r0.c;
const scr0 = await readScreen();
say(`  ⏮ 처음으로   : ${at0.applied}/${at0.total} · 배지 ${scr0.badge} · rationale ${scr0.rationale} (버튼 ${r0.n}개 disabled=${r0.disabled})`);

// ④ 합성 이벤트의 «경계»를 찾는다 — 앞으로 한 칸씩 밀며 배지가 처음 서는 지점.
let firstBadgeAt = null;
let prevAxis = null;
for (let i = 0; i < end.total + 1; i += 1) {
  const c = await readCursor();
  const n = await badge.count();
  if (n > 0) { firstBadgeAt = c.applied; prevAxis = await badge.first().getAttribute("data-axis"); break; }
  if (c.applied >= c.total) break;
  await clickAndSettle("replay-forward", c.applied);
}
say(`  ▶ 경계       : 배지가 처음 서는 커서 = ${firstBadgeAt ?? "(끝까지 없음)"} / ${end.total} · axis=${prevAxis}`);

// 경계 «직전» 한 칸 뒤로 → 다시 사라져야 한다(같은 화면에서 왕복으로 확인).
let backAxisGone = null;
if (firstBadgeAt !== null && firstBadgeAt > 0) {
  const rb = await clickAndSettle("replay-back", firstBadgeAt);
  const cb = rb.c;
  backAxisGone = await badge.count();
  say(`  ◀ 한 칸 뒤로  : ${cb.applied}/${cb.total} · 배지 ${backAxisGone}개`);
}

// ⑤ 「지금으로」 — 완주 상태로 복귀.
const rf = await clickAndSettle("replay-follow", firstBadgeAt !== null ? firstBadgeAt - 1 : 0);
const back = rf.c;
const scrBack = await readScreen();
say(`  ⏭ 지금으로   : ${back.applied}/${back.total} · 배지 ${scrBack.badge} · axis=${scrBack.axis} · rationale ${scrBack.rationale}`);
say(`  나간 비-GET /api 요청: ${runPosts.length}건 ${runPosts.length ? JSON.stringify(runPosts) : "(정적 replay 만 봤다)"}`);

await browser.close();

// ── 판정 ──────────────────────────────────────────────────────────────────
const fails = [];
if (end.total === 0) fails.push("녹화본 이벤트가 0건 — 무대가 없다");
if (at_end.badge !== 1) fails.push(`완주 시점 합성 배지가 ${at_end.badge}개(1 이어야)`);
if (at_end.axis !== "live") fails.push(`배지 축이 ${at_end.axis} — 녹화본은 live 를 실었다`);
if (at_end.rationale < 1) fails.push("후보 rationale 이 화면에 없다");
if (at_end.firstRationale && at_end.firstRationale.length < 30) fails.push("rationale 이 문장이 아니라 조각이다");
if (at0.applied !== 0) fails.push(`⏮ 이 커서를 0 으로 되돌리지 못했다(${at0.applied})`);
if (scr0.badge !== 0) fails.push(`되감았는데 배지가 남아 있다(${scr0.badge}) — 배지가 이벤트를 따라가지 않는다`);
if (firstBadgeAt === null) fails.push("앞으로 밀어도 배지가 서지 않는다");
if (backAxisGone !== 0) fails.push(`경계 직전으로 돌아갔는데 배지가 ${backAxisGone}개 — 경계가 없다`);
if (back.applied !== back.total) fails.push(`⏭ 이 완주로 복귀하지 못했다(${back.applied}/${back.total})`);
if (scrBack.badge !== 1 || scrBack.axis !== "live") fails.push("복귀 후 배지가 되돌아오지 않았다");
if (runPosts.length !== 0) fails.push(`정적 replay 만 봐야 하는데 비-GET /api 요청이 ${runPosts.length}건 나갔다`);

if (fails.length) {
  console.log("\n🔴 어긋남:");
  for (const f of fails) console.log(`   - ${f}`);
  process.exit(1);
}
console.log("\n○ 축 ⑦ — 공개 셸의 정적 replay 가 live 합성 배지·rationale 을 그리고, 되감기가 그것을 되돌린다");
process.exit(0);
