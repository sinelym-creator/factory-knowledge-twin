/**
 * X-11 재실행 — 「동시 요청 상한(503 + `Retry-After`)을 **화면이 배지로 말하는가**」. 리바이2 41대.
 * 대상 처방 = #586(T7-31 · D-49) · `components/live-status.tsx:171~172` (`data-congested` · `data-retry-after-sec`).
 *
 * 🔴 **두 열을 «따로» 낸다.** ① 무대가 «거절했다» ② 화면이 «그 거절을 그렸다».
 *    합치면 「무대가 울렸으니 화면도 맞겠지」가 되고, 오늘 X-23 에서 정확히 그 자리가 갈렸다
 *    (무대는 비웠는데 화면은 다른 출처를 읽고 있었다).
 *
 * 🔴 **`peakInflight` 가 상한에 «닿은» 회차만 유효하다.** 상류가 즉답하면 요청이 사실상 직렬로
 *    끝나 동시 진행 수가 상한에 안 닿는다 — 그때의 「배지 안 뜸」은 **초록이 아니라 무효**다.
 * 🔴 **dev 셸은 무효** — 클라이언트 JS 가 안 돌면 배지는 애초에 안 그려진다. prod 빌드만.
 *
 *   node t7x11_congestion_badge.mjs --shell=http://127.0.0.1:8104 --stage=http://127.0.0.1:8812
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8104");
const STAGE = arg("stage", "http://127.0.0.1:8812");
/* 🔴 **probe 는 «느린» 것으로 고른다.** 즉답하는 경로로 채우려면 초당 수천 발이 필요하고,
   그러면 내 부하가 상류의 «분당 상한»을 먼저 태워 셸의 폴링이 429 를 받는다 — 그때의
   「배지 안 뜸」은 대상의 답이 아니라 **내 부하가 만든 다른 사건**이다(첫 판 실측:
   61,386발 · 부하 뒤 직접 프로브 429). `/api/health` 는 의존 프로브를 돌아 수십 ms 걸리므로
   초당 100발 이하로도 슬롯이 겹친다. */
const PROBE = arg("probe", "/api/health");
const RATE_MS = Number(arg("rate-ms", "200"));   // 러너당 간격 — 총 발사율 = width / RATE_MS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROXY = arg("proxy", "../../apps/web-console/scripts/x-stages/capacity-proxy.mjs");
const UPSTREAM = arg("upstream", "127.0.0.1:8103");
const PORT = Number(arg("port", "8812"));
const stage = async () => (await fetch(STAGE + "/__stage").then((r) => r.json()).catch(() => null)) ?? {};

/* 🔴 **무대를 이 실행이 «직접» 갈아 끼운다.** 상한을 바꾸는 것이 자극이자 대조군이므로,
   두 형상이 «같은 실행·같은 브라우저»에서 교대해야 「배지가 그 상한 때문에 떴다」가 선다. */
let child = null;
const stopProxy = async () => {
  if (child) {
    child.kill();
    child = null;
    await sleep(600);
  }
};
const startProxy = async (maxInflight) => {
  await stopProxy();
  child = spawn(process.execPath, [PROXY, "--port", String(PORT), "--upstream", UPSTREAM, "--max-inflight", String(maxInflight), "--retry-after", "3"], { stdio: "ignore" });
  for (let i = 0; i < 25; i++) {
    await sleep(300);
    const w = await stage();
    if (w.maxInflight === maxInflight) return w;
  }
  return null;
};

/* 🔴 **허용 목록이 있는 표면엔 «대상이 주는» 자격으로 들어간다.** 첫 판은 쿠키 없이 쏴서
   전부 401 이었고, 그러면 「초과분만 거절」의 통과분이 0 이 되어 무대가 안 선 것으로 읽힌다. */
let COOKIE = "";
const mintSession = async () => {
  const r = await fetch(STAGE + "/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  const sc = r?.headers.get("set-cookie");
  if (sc) COOKIE = sc.split(";")[0];
  return !!COOKIE;
};

/** 무대를 «포화»시킨다 — 상류가 빠르면 겹치지 않으므로 계속 겹쳐 쏜다. */
function burst({ ms, width }) {
  let stop = false;
  let sent = 0;
  let got503 = 0;
  let got200 = 0;
  const one = async () => {
    while (!stop) {
      sent += 1;
      try {
        const r = await fetch(STAGE + PROBE, { headers: COOKIE ? { cookie: COOKIE } : {} });
        if (r.status === 503) got503 += 1;
        else if (r.status === 200) got200 += 1;
        await r.arrayBuffer().catch(() => {});
      } catch {}
      await sleep(RATE_MS);
    }
  };
  const runners = Array.from({ length: width }, one);
  const done = (async () => {
    await sleep(ms);
    stop = true;
    await Promise.allSettled(runners);
    return { sent, got503, got200 };
  })();
  return { done, halt: () => (stop = true) };
}

const BADGE = () => {
  const el = document.querySelector("[data-congested], [data-mode]");
  const live = document.querySelector('[data-testid="live-status"], [data-mode]');
  const pick = (e) =>
    e
      ? {
          congested: e.getAttribute("data-congested"),
          retryAfterSec: e.getAttribute("data-retry-after-sec"),
          mode: e.getAttribute("data-mode"),
          text: (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        }
      : null;
  return {
    anyCongested: document.querySelectorAll('[data-congested="true"]').length,
    badge: pick(el),
    liveStatus: pick(live),
    bodyHasCongestionWord: /혼잡/.test(document.body.textContent ?? ""),
  };
};

/* ── 무대 ①: «넉넉한» 상한으로 시작한다 = 대조군 형상 ────────────────────── */
const wideOk = await startProxy(64);
if (!wideOk) {
  console.log("🔴 무대(넉넉한 상한)를 못 세웠다. exit 2");
  process.exit(2);
}
await mintSession();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
/* 🔴 **배지는 «브라우저 자신의» 요청이 503 을 두 번 맞아야 뜬다**(`contract.ts` 는 502/503 을
   1회 되묻고, 되묻고도 503 일 때만 신호한다). 내 node 버스트는 무대를 채울 뿐이므로,
   「화면이 안 그렸다」를 판정하려면 **브라우저가 실제로 무엇을 받았는지**를 세야 한다. */
const seenByBrowser = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/")) seenByBrowser.push({ at: Date.now(), status: r.status(), url: u.replace(SHELL, "") });
});
await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
const eb = page.locator('[data-testid="enter-button"]');
if (await eb.count().then((n) => n > 0).catch(() => false)) {
  await eb.first().click().catch(() => {});
  await sleep(2000);
}
await page.goto(SHELL + "/overview", { waitUntil: "domcontentloaded" }).catch(() => {});
await sleep(4000);

/* ── ① 대조군 — 거절 0 인 무대에서 배지가 «안 뜬다» ─────────────────────── */
const wWide = await stage();
const baseline = await page.evaluate(BADGE);
const baselineProbe = await fetch(STAGE + PROBE, { headers: COOKIE ? { cookie: COOKIE } : {} }).then((r) => r.status).catch(() => "ERR");

/* ── ② 자극 — 무대를 상한 1 로 «교체»하고 포화시킨다 ────────────────────── */
await startProxy(1);
await mintSession();
const w0 = await stage();
const tBurst0 = Date.now();
const b = burst({ ms: 24000, width: 20 });  // 20 / 200ms = 100발/초(상류 분당 상한 안쪽) · 겹침은 width 로 키운다
await sleep(2500);
const during = [];
/* 🔴 **화면이 «요청을 하지 않으면» 배지는 애초에 못 뜬다.** 첫 판에서 자극 창 24초 동안
   브라우저의 `/api` 응답이 **0건**이었다 — 부하만 걸고 화면을 가만히 두면 그 창의
   「배지 없음」은 대상의 답이 아니다. 그래서 **방문자가 실제로 하는 일**(레일 이동)을
   혼잡 중에 시킨다: 클라이언트 전환이 곧 `/api` 요청이다. */
for (let i = 0; i < 8; i++) {
  const target = i % 2 === 0 ? "nav-incidents" : "nav-overview";
  await page.locator(`[data-testid="${target}"]`).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(2600);
  during.push({ atMs: 2500 + (i + 1) * 2600, clicked: target, view: await page.evaluate(BADGE), stage: await stage() });
}
const burstResult = await b.done;
const tBurst1 = Date.now();
const w1 = await stage();

/* ── ③ 걷힘 — 무대를 다시 «넉넉한» 상한으로 교체하고 같은 브라우저에서 본다 ── */
await startProxy(64);
await mintSession();
const after = [];
/* 🔴 **걷힘도 «방문자가 다시 요청해야» 일어난다.** 부하만 멈추고 화면을 가만히 두면
   브라우저는 아무것도 안 물어보고, 그때의 「배지 그대로」는 대상의 답이 아니다.
   그래서 교체 뒤에도 같은 이동을 시켜 **200 을 실제로 받게** 한다. */
for (let i = 0; i < 6; i++) {
  const target = i % 2 === 0 ? "nav-overview" : "nav-incidents";
  await page.locator(`[data-testid="${target}"]`).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(3000);
  after.push({ atMs: (i + 1) * 3000, clicked: target, view: await page.evaluate(BADGE) });
}
const probe200 = await fetch(STAGE + PROBE, { headers: COOKIE ? { cookie: COOKIE } : {} }).then((r) => r.status).catch((e) => "ERR " + e.message.slice(0, 20));
const w2 = await stage();
await ctx.close();
await browser.close();
await stopProxy();

/* ── 보고 ────────────────────────────────────────────────────────────────── */
const j = JSON.stringify;
console.log("\n=============== X-11 · 혼잡 배지 · 두 열 ===============");
console.log(`무대 = capacity-proxy ${STAGE} · 셸 = ${SHELL}(prod 빌드) · probe ${PROBE}`);
console.log(`\n[열 A · 무대가 «거절했다»]`);
console.log(`  버스트: 보냄 ${burstResult.sent} · **503 ${burstResult.got503}** · 200 ${burstResult.got200}`);
console.log(`  증인 델타: arrived +${(w1.arrived ?? 0) - (w0.arrived ?? 0)} · **rejected +${(w1.rejected ?? 0) - (w0.rejected ?? 0)}** · passedThrough +${(w1.passedThrough ?? 0) - (w0.passedThrough ?? 0)}`);
console.log(`  🔴 peakInflight = **${w1.peakInflight}** / maxInflight ${w1.maxInflight} · retryAfter ${w1.retryAfter}`);
console.log(`\n[열 B · 화면이 «그 거절을 그렸다»]`);
console.log(`  기준선(부하 전): ${j(baseline)}`);
for (const d of during) console.log(`  t=${d.atMs}ms · 클릭 ${d.clicked} · congested ${d.view.anyCongested} · 배지 ${j(d.view.badge)} · 「혼잡」 문면 ${d.view.bodyHasCongestionWord}`);
console.log(`\n[걷힘]`);
for (const a of after) console.log(`  +${a.atMs}ms · 클릭 ${a.clicked} · congested ${a.view.anyCongested} · 배지 ${j(a.view.badge)}`);
console.log(`  무대를 상한 64 로 되돌린 뒤 직접 프로브 = **${probe200}** · 최종 rejected 누계 ${w2.rejected}`);

const burstWindow = seenByBrowser.filter((x) => x.at >= tBurst0 && x.at <= tBurst1);
const b503 = burstWindow.filter((x) => x.status === 503);
console.log(`
🔴 브라우저가 «자극 창»에서 받은 /api 응답 ${burstWindow.length}건 · **503 ${b503.length}건** · 상태 분포 ${j(burstWindow.reduce((a, x) => ((a[x.status] = (a[x.status] ?? 0) + 1), a), {}))}`);
if (b503.length) console.log(`   503 경로: ${j([...new Set(b503.map((x) => x.url))].slice(0, 6))}`);
else console.log(`   경로 분포: ${j([...new Set(burstWindow.map((x) => x.url))].slice(0, 8))}`);

/* ── 판정 ────────────────────────────────────────────────────────────────── */
console.log("\n=============== 판정 ===============");
const limitReached = w1.peakInflight === w1.maxInflight && (w1.maxInflight ?? 0) > 0;
const rejected = (w1.rejected ?? 0) - (w0.rejected ?? 0);
const stageRejected = rejected > 0 && burstResult.got200 > 0; // 「초과분만」 거절 = 상한이지 고장이 아니다
const baseClean = baseline.anyCongested === 0;
const shown = during.some((d) => d.view.anyCongested > 0);
const shownWithRetry = during.some((d) => d.view.badge?.retryAfterSec != null && d.view.badge.retryAfterSec !== "");
const cleared = after.length > 0 && after[after.length - 1].view.anyCongested === 0;
console.log(`🔴 회차 유효성 — peakInflight ${w1.peakInflight}/${w1.maxInflight} 상한 도달 = ${limitReached ? "✓" : "✗ **무효 회차**(자극이 안 섰다 — 판정 금지)"}`);
console.log(`[열 A] 무대가 초과분만 거절 = ${stageRejected ? `✓ (503 ${rejected}건 · 통과 ${burstResult.got200}건)` : "✗"}`);
console.log(`대조군(부하 전) 배지 없음 = ${baseClean ? "✓" : "✗ — 부하 없이도 떠 있었다(이 열은 판정력이 없다)"}`);
if (!limitReached || !stageRejected) {
  console.log(`[X-11] **무효/미검증** — 무대가 안 울렸다. 화면 축은 묻지 않는다.`);
} else if (!baseClean) {
  console.log(`[X-11] **미검증** — 기준선부터 배지가 떠 있었다(자극이 무엇을 바꿨는지 못 가른다).`);
} else {
  console.log(`[열 B] 배지 등장 = ${shown ? "✓" : "✗"} · \`data-retry-after-sec\` 값 = ${shownWithRetry ? "✓" : "✗"} · 걷힘 = ${cleared ? "✓" : "✗"} · 부하 뒤 프로브 ${probe200}`);
  const browserSaw503 = b503.length >= 2;
  console.log(`🔴 브라우저 자신이 503 을 맞았나(배지의 «전제») = ${browserSaw503 ? `✓ ${b503.length}건` : `✗ ${b503.length}건 — 자극이 «화면이 읽는 경로»에 안 닿았다`}`);
  if (!shown && !browserSaw503) {
    console.log(`[X-11] **미검증** — 무대는 거절했지만 **브라우저 자신의 요청은 503 을 (충분히) 안 맞았다**. 배지는 «브라우저가 되묻고도 503» 일 때만 뜨므로, 이 창의 「배지 없음」은 대상의 답이 아니다.`);
  } else
  console.log(`[X-11] ${shown && shownWithRetry && cleared ? "PASS(무대 거절 + 화면 배지 + 걷힘 · 같은 브라우저)" : shown ? "FAIL(배지는 떴으나 재시도 초 또는 걷힘이 미충족)" : "FAIL(무대는 거절했는데 화면이 말하지 않는다)"}`);
}
console.log("\n🔴 안 잼: 실제 ai-api 자체 503(여기서는 무대가 낸다) · 모바일 폭 · 다른 엔진 · 배지 문면의 접근성 이름.");
