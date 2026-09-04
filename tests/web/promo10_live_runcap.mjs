/**
 * 승격 9회차 외부 재검 **축 ④** — 공개면에서 **Live 조사 1회**(구독 사용 1회 · 운영자 재가 14:10).
 * 이어서 같은 run 으로 **REPLAY 완주**를 잰다(구독은 1회만 쓴다). 리바이2 42대.
 *
 * 🔴 **1회만이다.** 재시도는 오케 청구 대상 — 이 그물은 조사를 «한 번» 시작하고, 실패해도
 *    다시 시작하지 않는다. 실패는 실패대로 적는다(고치지 않는다).
 * 🔴 **정찰과 실행을 한 세션에서** 한다 — 화면 진입마다 run 레코드가 생기므로, 손잡이를 보려고
 *    따로 한 번 더 들어가면 계수를 두 번 쓴다.
 * 🔴 **손잡이는 화면에서 열거해 고른다**(지어내지 않는다). 못 찾으면 이름과 함께 「안 잼」.
 * 🔴 **완주 = 상태값이 아니라 «단계별 산출 건수»**. `completed` 여도 어떤 단계는 0건일 수 있다.
 * 🔴 **합성·근거는 스냅샷이 아니라 `/runs/{id}/events` 가 정본**이다(29대 실측).
 * 🔴 **세션 소유 자원**이라 밖에서 못 읽는다 — 조회는 **페이지 안에서**(같은 쿠키로) 한다.
 *
 *   node _promo9_live.mjs --base=… --go        (--go 없으면 정찰만 하고 조사는 «안» 시작한다)
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const GO = has("go");
const SHOT = arg("shot", null);
const WAIT_MS = Number(arg("wait", "240000"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { go: GO, base: BASE };
const consoleErrors = [];
const serverAddrs = new Set();
const apiCalls = [];
let wsFrames = 0;
let wsUrls = [];
/* ── 43대 추가: 계약 v0.1.15 runCap 축 ────────────────────────────────────────
   화면 · 헤더 · 상태는 서로 다른 세 증인이다 - 한 칸으로 합치지 않는다.
   /live/status?sessionId= 는 계약상 peek(계수 안 함)이라 몇 번 읽어도 예산을 안 쓴다.
   배열 참조를 out 에 먼저 붙여 둔다 - 중간에 exit 해도 지금까지의 관측이 함께 나온다. */
const runCapHeaders = [];
const runCapDom = [];
const runCapStatus = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
page.on("websocket", (ws) => {
  wsUrls.push(ws.url().slice(0, 90));
  ws.on("framereceived", () => (wsFrames += 1));
});
page.on("response", async (r) => {
  if (/\/api\//.test(r.url())) apiCalls.push({ s: r.status(), u: r.url().replace(BASE, "").slice(0, 80), t: Date.now() });
  try {
    const u0 = r.url();
    if (u0.includes("/runs") && !u0.includes("/events")) {
      const h = await r.allHeaders();
      const cap = Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase().startsWith("x-fkt-run-cap")));
      runCapHeaders.push({ status: r.status(), url: u0.replace(BASE, "").slice(0, 80), cap, hasAny: Object.keys(cap).length });
    }
    const sa = await r.serverAddr();
    if (sa?.ipAddress) serverAddrs.add(sa.ipAddress);
  } catch {}
});

const ids = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid]"))
      .map((e) => e.getAttribute("data-testid"))
      .filter((v, i, a) => a.indexOf(v) === i),
  );
const textOf = (id) =>
  page.locator(`[data-testid="${id}"]`).first().textContent().then((t) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 120)).catch(() => null);

/* ── ① 관문 · live status ──────────────────────────────────────────────────── */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(1500);
out.liveStatus = await page.evaluate(() => fetch("/api/live/status").then((r) => r.json()).catch((e) => ({ err: String(e) })));
const enter = page.locator('[data-testid="enter-button"]');
if (await enter.count().then((n) => n > 0).catch(() => false)) {
  await enter.first().click().catch(() => {});
  await sleep(3500);
}
out.modeBadge = await textOf("mode-badge");
out.runCapHeaders = runCapHeaders;
out.runCapDom = runCapDom;
out.runCapStatus = runCapStatus;
/* 세션 id 는 대상이 주는 것으로만 - 지어내지 않는다. 없으면 그 축은 「안 잼」. */
out.sid = await page.evaluate(() => (document.cookie.match(/(?:^|;s*)fkt_sid=([^;]+)/) || [])[1] || null);
const snapCap = async (tag) => {
  const dom = await page.evaluate(() => {
    const e = document.querySelector("[data-runcap-limit], [data-runcap-used], [data-runcap-remaining]");
    const badge = document.querySelector('[data-testid="mode-badge"]');
    return {
      found: !!e,
      limit: e ? e.getAttribute("data-runcap-limit") : null,
      used: e ? e.getAttribute("data-runcap-used") : null,
      remaining: e ? e.getAttribute("data-runcap-remaining") : null,
      testid: e ? e.getAttribute("data-testid") : null,
      badgeText: badge ? (badge.textContent || "").replace(/s+/g, " ").trim().slice(0, 160) : null,
      badgeMode: badge ? badge.getAttribute("data-mode") : null,
    };
  });
  runCapDom.push({ tag, ...dom });
  const st = await page.evaluate(
    (sid) =>
      Promise.all([
        fetch("/api/live/status").then((r) => r.text()).catch((e) => "ERR " + e),
        sid ? fetch("/api/live/status?sessionId=" + encodeURIComponent(sid)).then((r) => r.text()).catch((e) => "ERR " + e) : null,
      ]),
    out.sid,
  );
  runCapStatus.push({ tag, plain: (st[0] || "").slice(0, 300), withSid: st[1] ? st[1].slice(0, 300) : null });
};
await snapCap("1-진입전-기준선");

/* ── ② 시나리오 진입 (run 레코드 1건 생성) ───────────────────────────────────
   🔴 **고정 sleep 으로 화면이 섰다고 치지 않는다.** 42대 실측: 컨테이너 재생성 직후에는
      임베딩 워밍업 때문에 `/overview` 가 `overview-loading` 인 채로 4초를 넘겼고, 그때
      `start-from-alarm` 은 «아직 없었다». 진입이 통째로 불발했는데 그 뒤 폴링이
      `/api/runs/null/events` 를 두드려 404 5건을 만들었다 — 그 404 는 **내 그물의 것**이지
      대상의 것이 아니다. 손잡이가 «나타날 때까지» 기다린 뒤에 누른다. */
let entered = false;
for (const sel of ['[data-testid="start-from-alarm"]', '[data-testid="start-from-headline"]']) {
  const l = page.locator(sel);
  try {
    await l.first().waitFor({ state: "visible", timeout: 60000 });
  } catch {
    continue;
  }
  await l.first().click().catch(() => {});
  await page.waitForURL(/[?&]run=/, { timeout: 45000 }).catch(() => {});
  await sleep(2500);
  entered = true;
  break;
}
out.entered = entered;
out.runUrl = page.url();
out.runId = (out.runUrl.match(/run=([^&]+)/) ?? [])[1] ?? null;
/* 🔴 **무대가 안 섰으면 색을 내지 않는다.** run 이 없는데 폴링을 돌리면 내 요청이 404 를
   만들고, 그 404 가 「대상의 콘솔 오류」로 보고된다(42대 1차 실패의 정확한 기전). */
if (!out.runId) {
  out.abort = "run 화면에 못 들어갔다 — 조사 시작 안 함(구독 사용 0). 무대 미성립이라 exit 2.";
  out.screenIdsAtAbort = await ids();
  out.serverAddrs = [...serverAddrs];
  out.consoleErrors = consoleErrors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(2);
}

/* ── ③ 정찰 — 손잡이를 «열거»한다(클릭 전) ─────────────────────────────────── */
const screenIds = await ids();
out.screenIds = screenIds;
out.labels = {};
for (const id of screenIds.filter((i) => /run|replay|ask|question|submit|send|start|live/i.test(i))) {
  out.labels[id] = await textOf(id);
}
out.statusBefore = await textOf("run-status");
out.cursorBefore = await textOf("replay-cursor");
out.pollingNoticeBefore = screenIds.includes("run-polling");

/* 조사를 시작하는 손잡이 후보 — 화면에 실제로 있는 것 중에서만. */
const startCandidates = screenIds.filter((i) => /^(run-start|run-ask|run-submit|ask-submit|run-question-submit|start-investigation)$/.test(i));
out.startCandidates = startCandidates;
/* 질문 입력이 있으면 그 폼이 실행 경로다. */
out.hasQuestionInput = await page.locator('[data-testid="run-question"] input, [data-testid="run-question"] textarea, [data-testid="run-question"]').count().catch(() => 0);

if (!GO) {
  out.note = "--go 없음 — 정찰만 하고 조사는 시작하지 않았다(구독 사용 0)";
  out.serverAddrs = [...serverAddrs];
  out.consoleErrors = consoleErrors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
}

/* ── ④ 🔴 Live 조사 «1회» 시작 ─────────────────────────────────────────────── */
const t0 = Date.now();
out.startedAt = new Date().toISOString();
await snapCap("2-live클릭직전");
let clicked = null;
for (const id of [...startCandidates, "run-question"]) {
  const l = page.locator(`[data-testid="${id}"]`);
  if (!(await l.count().then((n) => n > 0).catch(() => false))) continue;
  const btn = l.locator("button").first();
  if (await btn.count().then((n) => n > 0).catch(() => false)) {
    await btn.click().catch(() => {});
    clicked = `${id} > button`;
  } else {
    await l.first().click().catch(() => {});
    clicked = id;
  }
  break;
}
out.clickedControl = clicked;

/* ── ⑤ 완주 대기 — 상태값과 «이벤트 계수»를 함께 본다 ──────────────────────── */
const poll = [];
let done = false;
while (Date.now() - t0 < WAIT_MS) {
  await sleep(4000);
  const st = await textOf("run-status");
  const cur = await textOf("replay-cursor");
  const ev = await page.evaluate(
    (rid) =>
      fetch(`/api/runs/${rid}/events`)
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : (d.events ?? d.items ?? [])))
        .catch(() => null),
    out.runId,
  );
  const n = Array.isArray(ev) ? ev.length : null;
  poll.push({ ms: Date.now() - t0, status: st, cursor: cur, events: n });
  if (st && /완료|completed|실패|failed|오류/.test(st)) {
    done = true;
    out.events = ev;
    break;
  }
}
out.completedIn = Date.now() - t0;
out.done = done;
out.poll = poll;
if (!out.events) {
  out.events = await page.evaluate(
    (rid) => fetch(`/api/runs/${rid}/events`).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : (d.events ?? d.items ?? []))).catch(() => null),
    out.runId,
  );
}
out.statusAfter = await textOf("run-status");
await snapCap("3-live완주뒤");
out.wsFrames = wsFrames;
out.wsUrls = wsUrls;
out.pollingNoticeAfter = (await ids()).includes("run-polling");
if (SHOT) await page.screenshot({ path: SHOT }).catch(() => {});

/* ── ⑥ 화면이 «그렸는가» — 근거·후보를 수로 ────────────────────────────────── */
out.screen = await page.evaluate(() => {
  const c = (s) => document.querySelectorAll(s).length;
  const t = (id) => {
    const e = document.querySelector(`[data-testid="${id}"]`);
    return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200) : null;
  };
  return {
    evidenceStripText: t("evidence-strip"),
    evidenceCards: c('[data-testid="evidence-card"], [data-testid^="evidence-"]'),
    candidatesText: t("candidates"),
    candidateRows: c('[data-testid="candidate-row"], [data-testid^="candidate"]'),
    timelineText: t("run-timeline"),
    progressText: t("run-progress"),
  };
});

/* ── ⑦ REPLAY 완주 — 같은 run 의 이벤트로(구독 추가 사용 0) ────────────────── */
out.replay = { attempted: false };
if (await page.locator('[data-testid="replay-restart"]').count().then((n) => n > 0).catch(() => false)) {
  out.replay.attempted = true;
  out.replay.cursorAtStart = await textOf("replay-cursor");
  await page.locator('[data-testid="replay-restart"]').first().click().catch(() => {});
  await sleep(1500);
  out.replay.cursorAfterRestart = await textOf("replay-cursor");
  await page.locator('[data-testid="replay-play"]').first().click().catch(() => {});
  const rt0 = Date.now();
  let last = null;
  while (Date.now() - rt0 < 90000) {
    await sleep(3000);
    const cur = await textOf("replay-cursor");
    if (cur === last) break;
    last = cur;
    const m = (cur ?? "").match(/(\d+)\s*\/\s*(\d+)/);
    if (m && m[1] === m[2] && m[2] !== "0") break;
  }
  out.replay.cursorEnd = last;
  out.replay.ms = Date.now() - rt0;
}

out.serverAddrs = [...serverAddrs];
out.consoleErrors = consoleErrors;
await snapCap("4-replay뒤");
out.apiCalls = apiCalls.slice(-40);
console.log(JSON.stringify(out, null, 1));
await browser.close();
