/**
 * q69_shell_mode_probe — Q-69 「평시 REPLAY 배너 = 기대값인가 강등인가」의 **관측 축**.
 *
 * 🔴 판정하지 않는다. 공개 셸에 외부 vantage 로 한 번 들어가서 다음만 남긴다:
 *    ① 배지 전이 시계열(`◌확인 중 → ◑REPLAY` 시각 · 셀렉터는 정본 그물과 같은 data-testid)
 *    ② 그 사이의 `/api/*` 응답 코드·시각 · **WebSocket 핸드셰이크 성패**(101 인지)
 *    ③ `/api/live/status` 200 본문 **전 필드 원문**
 *    ④ Live 시도 자극 1회 — 콘솔에 질문 1건을 보내고 스트림이 `run.started` 로 서는지
 *       `fallback=replay` 로 강등되는지 · **어느 응답 코드가 그 분기를 만들었는지**
 *
 *    FKT_WEB_BASE  재는 셸(공개 Production URL 만 · tailnet·127.0.0.1 금지)
 * exit: 0 = 관측 완료(판정 아님) · 2 = 셸에 닿지 못함(무대 없음)
 */
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const WEB = process.env.FKT_WEB_BASE ?? "https://factory-knowledge-twin.vercel.app";
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "";
const Q = process.env.FKT_Q ?? "지난 24시간 설비 이상 신호를 요약해줘";

const t0 = Date.now();
const rel = () => Date.now() - t0;
const log = {
  base: WEB,
  startedAt: new Date().toISOString(),
  question: Q,
  api: [],
  ws: [],
  flips: [],
  liveStatus: null,
  consoleCandidates: null,
  stimulus: null,
  tsHeaderHits: [],
  notes: [],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("response", (r) => {
  const u = r.url();
  if (!/\/api\/|\/enter|run|live|stream|sse/i.test(u)) return;
  const h = r.headers();
  const ts = Object.keys(h).filter((k) => k.startsWith("tailscale-"));
  if (ts.length) log.tsHeaderHits.push({ ms: rel(), url: u, ts });
  log.api.push({
    ms: rel(),
    url: u.replace(WEB, ""),
    status: r.status(),
    type: h["content-type"] ?? null,
  });
});
page.on("requestfailed", (r) => {
  const u = r.url();
  if (!/\/api\/|\/enter|run|live|stream|sse|^wss?:/i.test(u)) return;
  log.api.push({ ms: rel(), url: u.replace(WEB, ""), status: null, failure: r.failure()?.errorText ?? "?" });
});
page.on("websocket", (ws) => {
  const rec = { ms: rel(), url: ws.url(), frames: [], closed: null, error: null };
  log.ws.push(rec);
  ws.on("framereceived", (d) => rec.frames.length < 8 && rec.frames.push({ dir: "in", ms: rel(), data: String(d.payload).slice(0, 200) }));
  ws.on("framesent", (d) => rec.frames.length < 8 && rec.frames.push({ dir: "out", ms: rel(), data: String(d.payload).slice(0, 200) }));
  ws.on("socketerror", (e) => (rec.error = String(e)));
  ws.on("close", () => (rec.closed = rel()));
});

const snapshot = () =>
  page
    .evaluate(() => {
      const b = document.querySelector("[data-testid=mode-badge]");
      return {
        badge: b ? (b.textContent ?? "").replace(/\s+/g, " ").trim() : "(없음)",
        offer: !!document.querySelector("[data-testid=static-replay-offer]"),
        banner: !!document.querySelector("[data-testid=fallback-banner]"),
        url: location.pathname,
      };
    })
    .catch(() => null);

let prev = null;
async function watch(ms, tag) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await snapshot();
    if (s) {
      const key = `${s.url}|${s.badge}|${s.offer}|${s.banner}`;
      if (key !== prev) {
        log.flips.push({ ms: rel(), tag, ...s });
        prev = key;
      }
    }
    await page.waitForTimeout(120);
  }
}

const resp = await page.goto(WEB + "/", { waitUntil: "commit", timeout: 30000 }).catch(() => null);
if (!resp) {
  console.log("무대 없음 — 셸에 닿지 못했다");
  await browser.close();
  process.exit(2);
}
log.notes.push(`첫 응답 ${resp.status()} ${rel()}ms · x-vercel-id=${resp.headers()["x-vercel-id"] ?? "-"}`);
await watch(15000, "entry");

log.liveStatus = await page
  .evaluate(async () => {
    const r = await fetch("/api/live/status", { cache: "no-store" });
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = await r.text().catch(() => null);
    }
    return { status: r.status, body };
  })
  .catch((e) => ({ error: String(e) }));

log.consoleCandidates = await page
  .evaluate(() => {
    const pick = (el) => ({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
      ph: el.getAttribute("placeholder"),
      type: el.getAttribute("type"),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
    });
    return {
      url: location.pathname,
      inputs: [...document.querySelectorAll("textarea, input[type=text], input:not([type])")].map(pick),
      buttons: [...document.querySelectorAll("button")].map(pick).slice(0, 25),
      links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).slice(0, 25),
    };
  })
  .catch((e) => ({ error: String(e) }));

let box = page.locator("textarea, input[type=text]").first();
// /overview 에는 입력창이 없다(1차 관측) — 콘솔은 「조사 시작」 뒤에 열린다.
if ((await box.count().catch(() => 0)) === 0) {
  const starter = page.locator("[data-testid=start-from-headline]").first();
  if (await starter.count().catch(() => 0)) {
    log.notes.push(`조사 시작 클릭 ${rel()}ms`);
    await starter.click().catch((e) => log.notes.push("click 실패 " + e.message));
    await watch(8000, "start");
    log.consoleCandidates2 = await page
      .evaluate(() => ({
        url: location.pathname,
        inputs: [...document.querySelectorAll("textarea, input[type=text]")].map((el) => ({
          testid: el.getAttribute("data-testid"),
          ph: el.getAttribute("placeholder"),
          disabled: el.hasAttribute("disabled"),
        })),
      }))
      .catch((e) => ({ error: String(e) }));
    box = page.locator("textarea, input[type=text]").first();
  }
}
if (await box.count().then((n) => n > 0).catch(() => false)) {
  const before = log.api.length;
  await box.fill(Q).catch((e) => log.notes.push("fill 실패 " + e.message));
  const at = rel();
  await box.press("Enter").catch((e) => log.notes.push("Enter 실패 " + e.message));
  await watch(20000, "stimulus");
  log.stimulus = {
    sentAt: at,
    apiAfter: log.api.slice(before),
    wsAfter: log.ws.filter((w) => w.ms >= at),
  };
} else {
  log.stimulus = { skipped: "입력 후보 0 — 이 vantage 에서 질문을 보낼 자리를 못 찾았다" };
}

// 이벤트 스트림의 «분기»는 브라우저 세션 안에서만 읽힌다(밖에서는 401 session_required).
log.runEvents = await page
  .evaluate(async () => {
    const m = /run=([^&]+)/.exec(location.search);
    if (!m) return { skipped: "run id 없음 — 자극이 run 을 만들지 않았다" };
    const r = await fetch("/api/runs/" + m[1] + "/events", { cache: "no-store" });
    let body;
    try {
      body = await r.json();
    } catch {
      body = await r.text().catch(() => null);
    }
    return { run: m[1], status: r.status, body };
  })
  .catch((e) => ({ error: String(e) }));

log.endedAt = rel();
await browser.close();

for (const f of log.flips) console.log(`${String(f.ms).padStart(6)}ms [${f.tag}] ${f.url} 제안=${f.offer ? "Y" : "N"} 배너=${f.banner ? "Y" : "N"} ${JSON.stringify(f.badge)}`);
console.log("--- api ---");
for (const a of log.api) console.log(`${String(a.ms).padStart(6)}ms ${a.status ?? a.failure} ${a.url}`);
console.log("--- ws ---");
for (const w of log.ws) console.log(`${w.ms}ms ${w.url} frames=${w.frames.length} closed=${w.closed} err=${w.error}`);
console.log("--- live/status ---");
console.log(JSON.stringify(log.liveStatus).slice(0, 600));
if (OUT) {
  await writeFile(OUT, JSON.stringify(log, null, 1), "utf8");
  console.log(`# raw → ${OUT}`);
}
