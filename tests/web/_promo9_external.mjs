/**
 * 승격 9회차 **외부 재검** — 공개면(Vercel)에서 D-51·D-52·D-49 를 «밖에서» 확인한다. 리바이2 42대.
 *
 * 🔴 **밖의 근거는 연결 IP 다.** 공개 URL 을 «쳤다»는 사실은 증거가 아니다 — 같은 URL 이
 *    tailnet self 로 붙을 수 있다. 그래서 응답마다 `serverAddr` 를 받아 두고, 공인 IP 가 아니면
 *    그 회차의 화면 축을 통째로 버린다.
 *
 * 🔴 **번들 적재와 화면 실측은 다른 사실이다 — 열을 갈라 낸다.**
 *    자극 무대가 없는 축(D-51 사유 문면 · D-49 배지)은 「떴다」로 적지 않는다.
 *
 * 🔴 **라우트 청크는 지연 로드**라 랜딩만 훑으면 착지한 심볼도 0건으로 읽힌다(30대 실측).
 *    그래서 화면을 실제로 연 뒤 **그 세션이 로드한 스크립트 전부**를 모아 grep 한다.
 *
 * 🔴 **Live 조사는 «실행»하지 않는다** — 구독·세션 상한을 태운다. 배지 존재만 본다.
 *
 *   node _promo9_external.mjs --base=https://factory-knowledge-twin.vercel.app --shot=<png>
 */
import { createRequire } from "node:module";
import fs from "node:fs";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const SHOT = arg("shot", "./promo9-live-badge.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isPrivate = (ip) =>
  !ip ||
  /^(10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const scripts = new Map(); // url → true
const serverAddrs = new Set();
const consoleErrors = [];
const failedReqs = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/\/_next\/static\/.*\.js(\?|$)/.test(u)) scripts.set(u, true);
  try {
    const sa = await res.serverAddr();
    if (sa?.ipAddress) serverAddrs.add(sa.ipAddress);
  } catch {}
});
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
});
page.on("requestfailed", (r) => failedReqs.push(`${r.url().slice(0, 90)} ${r.failure()?.errorText ?? ""}`));

const out = { base: BASE };

/* ── ① 관문 → overview ─────────────────────────────────────────────────────── */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
await sleep(1200);
const enter = page.locator('[data-testid="enter-button"]');
out.enterFound = await enter.count().then((n) => n > 0).catch(() => false);
if (out.enterFound) {
  await enter.first().click().catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(3000);
}
out.urlAfterEnter = page.url();

/* ── ② 배지: LIVE 표시 «존재»만(조사 실행 금지) ───────────────────────────── */
out.badges = await page.evaluate(() => {
  const pick = (id) => {
    const e = document.querySelector(`[data-testid="${id}"]`);
    return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) : null;
  };
  return {
    modeBadge: pick("mode-badge"),
    /** 🔴 혼잡 배지는 «무대가 없다» — 지금 뜰 이유가 없으므로 존재 여부만 남긴다. */
    congestedNodes: document.querySelectorAll("[data-congested]").length,
    congestedValues: Array.from(document.querySelectorAll("[data-congested]"))
      .map((e) => e.getAttribute("data-congested"))
      .slice(0, 5),
  };
});
await page.screenshot({ path: SHOT }).catch(() => {});

/* ── ③ D-52 회귀 축: 투어 «OFF» 상태에서 배경 클릭이 통하는가 ───────────────
   🔴 이것이 공개면에서 잴 수 있는 D-52 의 «화면» 축이다. 강제 열(inert 제거)은 여기서
      만들지 않는다 — 지원 엔진에서는 가드가 안 돌고, 안 도는 코드를 「막혔다/통했다」로
      적으면 그 값은 대상의 답이 아니다. 여기서 답하는 것은 **규격 ⑤(투어 OFF 변화 0)** 뿐이다. */
const navSel = '[data-testid="nav-compare"]';
out.tourOffClick = null;
if (await page.locator(navSel).count().then((n) => n > 0).catch(() => false)) {
  const before = new URL(page.url()).pathname;
  await page.locator(navSel).first().click().catch(() => {});
  await sleep(2500);
  out.tourOffClick = { before, after: new URL(page.url()).pathname };
  await page.goBack().catch(() => {});
  await sleep(2000);
}

/* ── ④ 투어 1걸음 열고 닫기 ────────────────────────────────────────────────── */
out.tour = { opened: false, closed: null, calloutText: null };
for (const sel of ['[data-testid="tour-start"]', '[data-testid="intro-reopen"]']) {
  const l = page.locator(sel);
  if (await l.count().then((n) => n > 0).catch(() => false)) {
    await l.first().click().catch(() => {});
    await sleep(2500);
    if (await page.locator('[data-testid="tour-callout"]').count().then((n) => n > 0)) {
      out.tour.opened = true;
      out.tour.calloutText = await page
        .locator('[data-testid="tour-callout"]')
        .first()
        .textContent()
        .then((t) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 80))
        .catch(() => null);
      break;
    }
  }
}
if (out.tour.opened) {
  const skip = page.locator('[data-testid="tour-skip"]');
  if (await skip.count().then((n) => n > 0).catch(() => false)) await skip.first().click().catch(() => {});
  await sleep(1800);
  out.tour.closed = !(await page.locator('[data-testid="tour-callout"]').count().then((n) => n > 0));
  /* 🔴 닫은 «뒤» 클릭이 통하는가 = D-52 가드가 정리되는가(규격 ⑤). */
  if (await page.locator(navSel).count().then((n) => n > 0).catch(() => false)) {
    const b = new URL(page.url()).pathname;
    await page.locator(navSel).first().click().catch(() => {});
    await sleep(2500);
    out.tourClosedThenClick = { before: b, after: new URL(page.url()).pathname };
    await page.goBack().catch(() => {});
    await sleep(1500);
  }
}

/* ── ⑤ 골든 시나리오 REPLAY 축 1회 (🔴 live 실행 금지) ──────────────────────── */
out.replay = { attempted: false, note: null };
const replaySel = '[data-testid="scenario-replay"], [data-testid="run-replay"], [data-testid="static-replay-offer"]';
if (await page.locator(replaySel).count().then((n) => n > 0).catch(() => false)) {
  out.replay.attempted = true;
  out.replay.label = await page.locator(replaySel).first().textContent().then((t) => (t ?? "").trim().slice(0, 60)).catch(() => null);
} else {
  out.replay.note = "replay 손잡이를 화면에서 못 찾음 — 이름을 지어내지 않는다(안 잼)";
}
out.testids = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-testid]"))
    .map((e) => e.getAttribute("data-testid"))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 60),
);

out.serverAddrs = [...serverAddrs];
out.consoleErrors = consoleErrors;
out.failedReqs = failedReqs;
out.scripts = [...scripts.keys()];
await browser.close();

/* ── ⑥ 번들 적재 — 이 세션이 실제 로드한 스크립트 전수에서 바늘을 뜬다 ──────── */
const NEEDLES = {
  "D-52 캡처 가드(pointerdown)": "pointerdown",
  "D-49 혼잡 배지(data-congested)": "data-congested",
  "D-51 사유 문면(서버와 연결이 끊겼습니다)": "서버와 연결이 끊겼습니다",
  "D-51 원문 속성(data-why)": "data-why",
};
const hits = Object.fromEntries(Object.keys(NEEDLES).map((k) => [k, []]));
let bytes = 0;
for (const u of out.scripts) {
  const body = await fetch(u).then((r) => r.text()).catch(() => "");
  bytes += body.length;
  for (const [name, needle] of Object.entries(NEEDLES)) if (body.includes(needle)) hits[name].push(u.split("/").pop());
}
out.bundle = { count: out.scripts.length, bytes, hits };

console.log(JSON.stringify(out, null, 1));
