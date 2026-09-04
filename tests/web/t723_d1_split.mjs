/**
 * T7-23 축① — D-1 「두 관측이 무엇 때문에 갈렸는가」 분리 실험 (리바이2 39대)
 *
 * 🔴 이 그물은 «어느 쪽이 옳은가»를 묻지 않는다. **손잡이 하나만 바꿔** 갈림을 재현하는지 묻는다.
 *
 * 갈린 두 관측 —
 *   검증(38대) : 「?」 재열람·주소직접 **0/25 · 8초 타임아웃** (셸 :8799 + 실 ai-api :8102)
 *   구현(38대) : **t=151ms 부터 25/25 · 닫기 637ms**   (셸 :8804 + 스텁 :8101)
 * 갈린 손잡이가 최소 셋(상류 실체 · 셸 포트/프로세스 · 빌드)이라 어느 하나도 단독 원인이 아니다.
 *
 * ── 측정 규율 ────────────────────────────────────────────────────────────────
 * 1. 🔴 **표본 시각(ms)의 원점 = 「묻기 시작한 시각」**(재열람 클릭이 반환된 직후 / 주소 이동이
 *    반환된 직후). 자극을 «건» 시각을 원점으로 잡으면 상류 지연분이 관측값에 섞여, 지연이
 *    변수인 실험에서 원인과 결과가 같은 축에 얹힌다.
 * 2. 🔴 **대조군 없는 초록은 근거가 아니다.** 매 회차 끝에 `main` 을 «일부러» inert 로 덮고
 *    같은 격자·같은 클릭을 다시 잰다. 그 열이 안 울면 이 회차 전체를 폐기한다(`exit 2`).
 * 3. 🔴 **지연 자극은 «걸렸는가»를 수로 남긴다.** route 가 0회 걸렸으면 그 행은 「빨강/초록」이
 *    아니라 **「자극 없음 = 안 잼」**이다.
 * 4. 못 잰 것은 0 이 아니라 이름과 함께 «안 잼»으로 낸다.
 *
 * 사용:
 *   node t723_d1_split.mjs --row=a --base=http://127.0.0.1:8799 [--delay=1500] [--json=out.json]
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const ROW = arg("row", "?");
const BASE = arg("base", "http://127.0.0.1:8799");
const DELAY = Number(arg("delay", "0"));
const JSON_OUT = arg("json", null);
const POLL_MS = 40;
const HORIZON_MS = 6000;

const out = { row: ROW, base: BASE, delayMs: DELAY, startedAt: new Date().toISOString(), paths: {}, control: null, routeHits: 0, routeUrls: [] };

/** 카드 「안내 닫기」 버튼이 자기 사각형의 5×5 격자 중 몇 점을 «실제로» 먹는지 + inert 사슬. */
const PROBE = () => {
  const card = document.querySelector('[data-testid="intro-card"]');
  const main = document.querySelector("main");
  const mainInert = !!(main && main.hasAttribute("inert"));
  if (!card) return { card: false, mainInert, own: null, ancInert: [], tour: !!document.querySelector('[data-testid="tour-callout"]') };
  const btn = Array.from(card.querySelectorAll("button")).find((x) => x.getAttribute("aria-label") === "안내 닫기");
  if (!btn) return { card: true, mainInert, own: null, ancInert: [], btn: false, tour: !!document.querySelector('[data-testid="tour-callout"]') };
  const r = btn.getBoundingClientRect();
  let own = 0;
  /* 🔴 「안 눌린다」의 주어를 남긴다 — 그 점을 «누가» 먹고 있는지 이름 없이는 회부할 수 없다. */
  const coverTally = {};
  for (let iy = 0; iy < 5; iy++)
    for (let ix = 0; ix < 5; ix++) {
      const h = document.elementFromPoint(r.left + (r.width * (ix + 0.5)) / 5, r.top + (r.height * (iy + 0.5)) / 5);
      if (h && (h === btn || btn.contains(h))) own++;
      else {
        const name = h
          ? `${h.tagName.toLowerCase()}${h.getAttribute("data-testid") ? `[${h.getAttribute("data-testid")}]` : ""}.${String(h.className ?? "").slice(0, 26)}`
          : "null";
        coverTally[name] = (coverTally[name] ?? 0) + 1;
      }
    }
  const ancInert = [];
  for (let e = card; e && e !== document.documentElement; e = e.parentElement)
    if (e.hasAttribute("inert")) ancInert.push(e.tagName.toLowerCase() + (e.getAttribute("data-testid") ? `[${e.getAttribute("data-testid")}]` : ""));
  return { card: true, btn: true, mainInert, own, cover: coverTally, ancInert, tour: !!document.querySelector('[data-testid="tour-callout"]'), rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) } };
};

/** t0(=묻기 시작) 부터 조밀 표본. 한 시점은 대상의 답이 아니다 — 전이 축은 계열로 낸다. */
async function series(p, t0) {
  const rows = [];
  let lastKey = null;
  while (Date.now() - t0 < HORIZON_MS) {
    const ms = Date.now() - t0;
    let s;
    try {
      s = await p.evaluate(PROBE);
    } catch (e) {
      s = { card: null, err: String(e.message).split("\n")[0].slice(0, 60) };
    }
    const key = `${s.card}|${s.own}|${s.mainInert}|${s.ancInert?.join(",")}|${s.tour}|${JSON.stringify(s.cover ?? null)}`;
    if (key !== lastKey) {
      rows.push({ ms, ...s });
      lastKey = key;
    }
    if (s.card && s.own === 25 && !s.mainInert) break; // 안정 상태 도달
    await p.waitForTimeout(POLL_MS);
  }
  return rows;
}

const digest = (rows) => {
  const firstCard = rows.find((r) => r.card);
  const firstOwn25 = rows.find((r) => r.own === 25);
  const firstInert = rows.find((r) => r.mainInert);
  const lastInert = [...rows].reverse().find((r) => r.mainInert);
  return {
    firstSampleMs: rows.length ? rows[0].ms : null,
    firstCardMs: firstCard ? firstCard.ms : null,
    firstOwn25Ms: firstOwn25 ? firstOwn25.ms : null,
    ownAtFirstCard: firstCard ? firstCard.own : null,
    mainInertAtFirstCard: firstCard ? firstCard.mainInert : null,
    mainInertEverTrue: !!firstInert,
    mainInertFirstMs: firstInert ? firstInert.ms : null,
    mainInertLastTrueMs: lastInert ? lastInert.ms : null,
    ancInertAtFirstCard: firstCard ? firstCard.ancInert : null,
    /* 🔴 자극이 실재했는가 — 투어가 «안 뜬» 행은 초록이 아니라 「안 잼」이다.
       투어 없이 카드가 눌리는 것은 D-1 과 무관한 평시 동작이다. */
    tourEverOpen: rows.some((r) => r.tour),
    tourFirstMs: rows.find((r) => r.tour)?.ms ?? null,
    tourAtFirstCard: firstCard ? firstCard.tour : null,
    coverAtFirstCard: firstCard ? firstCard.cover : null,
    coverAtLast: rows.length ? rows[rows.length - 1].cover : null,
    ownAtLast: rows.length ? rows[rows.length - 1].own : null,
    lastSampleMs: rows.length ? rows[rows.length - 1].ms : null,
    transitions: rows.length,
  };
};

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();

/* 🔴 지연 자극 — 브라우저가 «실제로» 무엇을 부르는지 모르는 채 api 글롭에만 걸면 한 번도
   안 걸린다(브라우저는 ai-api 를 직접 부르지 않는다 · 셸의 RSC 만 탄다). 그래서 셸로 나가는
   문서·RSC·API 를 «전부» 후보로 잡고, «걸린 수»를 값으로 남긴다. 0 이면 그 행은 안 잼이다. */
const reqLog = [];
p.on("request", (r) => reqLog.push({ t: Date.now(), url: r.url().replace(BASE, ""), m: r.method(), rt: r.resourceType() }));
if (DELAY > 0) {
  await p.route("**/*", async (route) => {
    const u = route.request().url();
    const isShellData = u.startsWith(BASE) && (u.includes("_rsc=") || u.includes("/api/") || route.request().resourceType() === "fetch" || route.request().resourceType() === "xhr");
    if (isShellData) {
      out.routeHits++;
      if (out.routeUrls.length < 12) out.routeUrls.push(u.replace(BASE, ""));
      await new Promise((r) => setTimeout(r, DELAY));
    }
    await route.continue();
  });
}

/* ── 경로 P1 = 앱바 「?」 재열람 ─────────────────────────────────────────── */
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-testid=intro-card]", { timeout: 20000 });
await p.locator('[data-testid=intro-card] button[aria-label="안내 닫기"]').click();
await p.waitForTimeout(500);
const reqMark1 = reqLog.length;
await p.getByTestId("intro-reopen").click();
const t0a = Date.now(); // 🔴 원점 = 묻기 시작
const rowsA = await series(p, t0a);
out.paths.reopen = { ...digest(rowsA), samples: rowsA };
const tc = Date.now();
out.paths.reopen.close = await p
  .locator('[data-testid=intro-card] button[aria-label="안내 닫기"]')
  .click({ timeout: 8000 })
  .then(() => "성공")
  .catch((e) => "실패: " + String(e.message).split("\n")[0].slice(0, 70));
out.paths.reopen.closeMs = Date.now() - tc;
await p.waitForTimeout(400);
out.paths.reopen.cardsLeft = await p.getByTestId("intro-card").count();
out.paths.reopen.requests = reqLog.slice(reqMark1, reqMark1 + 14).map((r) => `${r.rt}:${r.url.slice(0, 70)}`);

/* ── 경로 P2 = 주소로 직접 ?intro=1&tour=1 (재열람 버튼을 안 쓰는 두 번째 열) ── */
const reqMark2 = reqLog.length;
const navP = p.goto(BASE + "/overview?intro=1&tour=1", { waitUntil: "commit" }).catch(() => {});
const t0b = Date.now();
await navP;
const rowsB = await series(p, t0b);
out.paths.directUrl = { ...digest(rowsB), samples: rowsB };
const tc2 = Date.now();
out.paths.directUrl.close = await p
  .locator('[data-testid=intro-card] button[aria-label="안내 닫기"]')
  .click({ timeout: 8000 })
  .then(() => "성공")
  .catch((e) => "실패: " + String(e.message).split("\n")[0].slice(0, 70));
out.paths.directUrl.closeMs = Date.now() - tc2;
await p.waitForTimeout(400);
out.paths.directUrl.cardsLeft = await p.getByTestId("intro-card").count();
out.paths.directUrl.requests = reqLog.slice(reqMark2, reqMark2 + 14).map((r) => `${r.rt}:${r.url.slice(0, 70)}`);

/* ── 방문 상태(쿠키·localStorage) — 두 무대가 «같은 조건»에 있었는지의 증거 ── */
out.visitState = {
  cookies: (await c.cookies()).map((k) => `${k.name}=${String(k.value).slice(0, 24)}`),
  storage: await p.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      o[k] = String(localStorage.getItem(k)).slice(0, 40);
    }
    return o;
  }),
};

/* ── 🔴 대조군 = 계측기를 «양면»으로 시험한다 ──────────────────────────────────
   ① 양성 — 카드가 «자유로운» 상태(첫 진입 · 투어 없음)에서 격자가 실제로 카드 것이고 클릭이
      성공하는가. 이게 안 되면 내 격자는 「전부 0」만 내는 고장난 자다.
   ② 음성 — 그 자유로운 상태에 `main` 을 강제로 inert 로 덮으면 격자가 «떨어지고» 클릭이
      막히는가. 이게 안 울면 내 격자는 갇힘을 못 보는 눈이다.
   🔴 대조군은 «판정 행과 다른 새 컨텍스트»에서 잰다 — 판정 행이 이미 실패 상태면 그 위에서
      재는 음성 대조는 «이미 참인 기준선»이라 판정력이 0 이다(39대 첫 회차 실증: own 0→0). */
const cc = await b.newContext({ viewport: { width: 1440, height: 900 } });
const cp = await cc.newPage();
await cp.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await cp.waitForSelector("[data-testid=intro-card]", { timeout: 20000 });
await cp.waitForTimeout(1200);
const free = await cp.evaluate(PROBE);
await cp.evaluate(() => {
  const m = document.querySelector("main");
  if (m) m.setAttribute("inert", "");
});
await cp.waitForTimeout(200);
const covered = await cp.evaluate(PROBE);
const ctlClick = await cp
  .locator('[data-testid=intro-card] button[aria-label="안내 닫기"]')
  .click({ timeout: 4000 })
  .then(() => "성공")
  .catch(() => "타임아웃");
/* 양성 클릭은 «음성 검사 뒤»에 되돌려 잰다 — 순서 때문에 못 잰 칸을 남기지 않는다. */
await cp.evaluate(() => document.querySelector("main")?.removeAttribute("inert"));
await cp.waitForTimeout(200);
const posClick = await cp
  .locator('[data-testid=intro-card] button[aria-label="안내 닫기"]')
  .click({ timeout: 4000 })
  .then(() => "성공")
  .catch(() => "타임아웃");
await cc.close();
out.control = {
  freeOwn: free.own,
  freeMainInert: free.mainInert,
  freeCover: free.cover,
  coveredOwn: covered.own,
  coveredMainInert: covered.mainInert,
  clickWhenFree: posClick,
  clickUnderInert: ctlClick,
  positiveRings: free.own > 0 && posClick === "성공",
  negativeRings: covered.mainInert === true && ctlClick === "타임아웃" && covered.own < free.own,
};
out.control.rings = out.control.positiveRings && out.control.negativeRings;

await b.close();

/* ── 보고 ───────────────────────────────────────────────────────────────── */
const P = (n, d) =>
  `  ${n.padEnd(10)} 첫표본 ${String(d.firstSampleMs).padStart(4)}ms · 카드첫등장 ${String(d.firstCardMs).padStart(4)}ms · 25/25첫도달 ${String(d.firstOwn25Ms).padStart(4)}ms · 카드첫등장시 own=${d.ownAtFirstCard}/25 mainInert=${d.mainInertAtFirstCard} · mainInert 발생=${d.mainInertEverTrue}(${d.mainInertFirstMs}~${d.mainInertLastTrueMs}ms) · 조상inert=${JSON.stringify(d.ancInertAtFirstCard)} · 닫기=${d.close}(${d.closeMs}ms) · 남은카드=${d.cardsLeft}\n             투어 뜸=${d.tourEverOpen}(${d.tourFirstMs}ms · 카드첫등장시 ${d.tourAtFirstCard})${d.tourEverOpen ? "" : "  🔴 투어 없음 = 자극 없음 → 이 칸은 «안 잼»"} · 덮은자(카드첫등장)=${JSON.stringify(d.coverAtFirstCard)} · 덮은자(${d.lastSampleMs}ms)=${JSON.stringify(d.coverAtLast)} own=${d.ownAtLast}/25`;
console.log(`\n=== [행 ${ROW}] base=${BASE} · 지연=${DELAY}ms · route걸린수=${out.routeHits} ===`);
console.log(P("재열람", out.paths.reopen));
console.log(P("주소직접", out.paths.directUrl));
console.log(
  `  대조군    양성(자유 상태) own=${out.control.freeOwn}/25 클릭=${out.control.clickWhenFree} → ${out.control.positiveRings ? "✓" : "✗"} | 음성(main 강제 inert) own=${out.control.freeOwn}→${out.control.coveredOwn} 클릭=${out.control.clickUnderInert} → ${out.control.negativeRings ? "✓" : "✗"}`,
);
console.log(`  방문상태  쿠키=${JSON.stringify(out.visitState.cookies)} · localStorage=${JSON.stringify(out.visitState.storage)}`);
console.log(`  재열람 요청: ${JSON.stringify(out.paths.reopen.requests)}`);
if (DELAY > 0 && out.routeHits === 0) console.log(`  🔴 지연 자극이 한 번도 안 걸렸다 — 이 행은 «안 잼»이다(빨강도 초록도 아님).`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
if (!out.control.rings) {
  console.log(`  🔴 대조군이 안 울렸다 — 이 회차의 관측 전체를 폐기한다.`);
  process.exit(2);
}
