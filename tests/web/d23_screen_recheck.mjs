/**
 * D-23 화면 재확인 — 「예외 클래스명이 공개 화면으로 새지 않는가」를 **화면에서** 다시 센다.
 *
 * 회부 원문(#432 §10 #1 · E1 대상 결함): run 타임라인이 API `rejectedReason` 원문을 그대로
 * 그려 방문자가 「게이트웨이 미도달(`ConnectionRefusedError`)」를 읽었다. 수리는 3층
 * (ai-api `_refusal_wording` · 게이트웨이 500 문면 · 셸 `visitorWhy()`).
 *
 * 🔴 이 그물이 세우는 것 / 세우지 못하는 것
 *   ⓐ **자극이 실재했는가** — 서버가 낸 `rejectedReason` 을 `/api/runs/{id}/events` 에서
 *      따로 읽는다. 서버가 사유를 «안 냈으면» 화면의 0건은 「막았다」가 아니라 「줄 게
 *      없었다」다(정보 0). 그래서 두 열을 항상 나란히 적는다: **서버 사유 · 화면 문면**.
 *   ⓑ **내 스캐너가 살아 있는가** — 판정 직후 «수리 전 문면»을 같은 페이지에 심고 같은
 *      스캐너를 다시 돌린다. 여기서 빨강이 안 나면 이 실행의 초록은 대상의 것이 아니라
 *      「아무것도 못 보는 눈」의 것이다(계보: 그물을 고치면 검출력이 팔린다).
 *   ⓒ 못 세우는 것 — 이 그물은 «이 셸 빌드 + 이 ai-api»의 문면만 잰다. 다른 자극
 *      (타임아웃·5xx·가드 거부)의 문면은 이 창 밖이다.
 *
 * 사용: node d23_screen_recheck.mjs --base http://127.0.0.1:3102 --stage a --out <json> --shot <png>
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3102");
const STAGE = arg("stage", "a");
const OUT = arg("out", "");
const SHOT = arg("shot", "");
const SCENARIO = arg("scenario", "GS-01");

/**
 * 🔴 판정선 = 「공개 화면에 예외 클래스명·Python 토큰이 0건」.
 *    `\b[A-Z]\w*(Error|Exception)\b` 하나로는 부족하다 — 계보 「경계 없는 정규식」대로
 *    한글 조사 앞에서 `\b` 가 어긋나므로 클래스명 목록은 경계 없이도 잡는다.
 */
const TOKEN_PATTERNS = [
  ["exc-class", /[A-Z][A-Za-z0-9_]*(?:Error|Exception)/g],
  ["traceback", /Traceback|most recent call last/gi],
  ["errno", /\[?Errno \d+|WinError \d+/gi],
  ["py-module", /urllib|asyncio|socket\.[a-z]|http\.client|\.py\b/gi],
  ["py-raise", /raise [A-Z]|from None\b/g],
];

function scan(text) {
  const hits = [];
  for (const [kind, re] of TOKEN_PATTERNS) {
    for (const m of String(text ?? "").matchAll(re)) hits.push({ kind, token: m[0] });
  }
  return hits;
}

/** 화면 한 칸: 그 자리의 사람 문면과 토큰 히트를 «따로» 남긴다. */
async function readScreen(page, name) {
  const shot = await page.evaluate(() => {
    const t = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
    };
    return {
      innerText: document.body.innerText.replace(/\s+/g, " ").trim(),
      banner: t('[data-testid="fallback-banner"]'),
      modeBadge: t('[data-testid="mode-badge"]'),
      timeline: t('[data-testid="run-timeline"]'),
      synthesisBadge: t('[data-testid="synthesis-badge"]'),
      synthesisAxis: document.querySelector('[data-testid="synthesis-badge"]')?.getAttribute("data-axis") ?? null,
      rejectedReason: t('[data-testid="synthesis-rejected-reason"]'),
      url: location.pathname + location.search,
    };
  });
  return { screen: name, ...shot, hits: scan(shot.innerText) };
}


/**
 * 🔴 셸 입장 직후에는 «화면이 아직 움직인다» — 그 창에서 `page.evaluate` 는 navigation 으로
 *    죽고, 그 빨강은 대상의 것이 아니라 내 타이밍의 것이다(계보: 계측기가 먼저 거짓말한다).
 */
async function evalRetry(page, fn, arg, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await page.evaluate(fn, arg);
    } catch (e) {
      last = e;
      if (!/Execution context was destroyed|navigation|Target closed/i.test(String(e))) throw e;
      await page.waitForTimeout(1500);
    }
  }
  throw new Error(`evaluate ${tries}회 모두 navigation 으로 죽었다 — 측정 불가: ${last}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

/** 자극 실재 계수 — WS 프레임이 0 이면 run 화면은 «아무 일도 안 일어난 화면»이다. */
const seen = { sockets: 0, frames: 0, consoleErrors: 0 };
page.on("websocket", (ws) => {
  seen.sockets += 1;
  ws.on("framereceived", () => (seen.frames += 1));
});
page.on("console", (m) => {
  if (m.type() === "error") seen.consoleErrors += 1;
});

const report = { stage: STAGE, base: BASE, at: new Date().toISOString(), screens: [], stimulus: null, control: null };

try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  // 🔴 자동 입장이 늦거나 실패하면 방문자와 같은 손잡이(「입장하기」)를 쓴다 — 여기서
  //    포기하면 「셸이 죽었다」로 보이지만 실제로는 «입장이 안 끝난 것»이다(측정 불가 ≠ 빨강).
  const entered = await page
    .waitForURL(/\/overview$/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!entered) {
    await page.getByRole("link", { name: /입장하기/ }).or(page.getByRole("button", { name: /입장하기/ })).first().click({ timeout: 10_000 });
    await page.waitForURL(/\/overview$/, { timeout: 45_000 });
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000); // live/status 왕복이 배너를 정하는 창
  report.screens.push(await readScreen(page, "overview(+배너)"));

  const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) throw new Error("fkt_sid 없음 — 입장이 안 끝났다(측정 불가 · exit 2)");

  const created = await evalRetry(
    page,
    async ({ scenario, sid }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mode: "live" }),
      });
      return { status: res.status, body: await res.json() };
    },
    { scenario: SCENARIO, sid },
  );
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`run 생성 실패 ${created.status} ${JSON.stringify(created.body)} — 무대 없음(exit 2)`);
  }
  const runId = created.body.runId;
  const incidentId = created.body.incidentId;

  // 🔴 **run 화면은 «흐르는 동안» 봐야 한다** — 완주 뒤에 열면 클라이언트는 0/0 이벤트로
  //    서서 「아직 계획이 오지 않았습니다」만 그린다(1차 실측). 그 0건은 수리의 초록이
  //    아니라 «늦게 연 창»의 0건이다. 그래서 run 을 만든 «직후» 화면으로 들어간다.
  await page.goto(`${BASE}/incidents/${incidentId}?run=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="run-timeline"]', { timeout: 30_000 }).catch(() => {});
  const drew = await page
    .waitForSelector('[data-testid="synthesis-badge"]', { timeout: 150_000 })
    .then(() => true)
    .catch(() => false);
  report.screenDrewBadge = drew;
  await page.waitForTimeout(2500);
  report.screens.push(await readScreen(page, "run 타임라인(+후보/사유)"));

  // 🔴 서버가 «무엇을 냈는가» — 화면과 무관하게 이벤트 정본에서 읽는다.
  const deadline = Date.now() + 60_000;
  let events = [];
  while (Date.now() < deadline) {
    const got = await evalRetry(page, async (id) => {
      const res = await fetch(`/api/runs/${id}/events`);
      return { status: res.status, events: await res.json() };
    }, runId);
    events = Array.isArray(got.events) ? got.events : [];
    if (events.some((e) => /completed|failed/i.test(String(e.type)))) break;
    await page.waitForTimeout(1000);
  }
  const synth = events
    .map((e) => e.synthesis ?? e.payload?.synthesis ?? null)
    .filter(Boolean)
    .at(-1);
  const typeCounts = {};
  for (const e of events) typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
  report.stimulus = {
    runId,
    incidentId,
    eventTypes: typeCounts,
    eventCount: events.length,
    completed: events.some((e) => /completed/i.test(String(e.type))),
    serverAxis: synth?.axis ?? null,
    serverRejectedReason: synth?.rejectedReason ?? null,
    rawSynthesisJson: JSON.stringify(synth ?? null),
  };

  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });

  // 🔴 ⓑ 검출력 대조군 — 수리 «전» 문면(#432 §10 원문)을 같은 페이지에 심고 같은 눈으로 본다.
  const before = "합성 축 = 결정적 집계(live 응답 거부 · 게이트웨이 미도달(ConnectionRefusedError))";
  await evalRetry(page, (t) => {
    const el = document.createElement("p");
    el.id = "levi2-control";
    el.textContent = t;
    document.body.appendChild(el);
  }, before);
  const ctrl = await readScreen(page, "대조군(수리 전 문면 주입)");
  report.control = { injected: before, hits: ctrl.hits, detected: ctrl.hits.length > 0 };
  await page.evaluate(() => document.getElementById("levi2-control")?.remove());

  report.stimulusCounters = seen;
  report.verdict = {
    screenHits: report.screens.flatMap((s) => s.hits.map((h) => ({ screen: s.screen, ...h }))),
    serverGaveReason: Boolean(report.stimulus.serverRejectedReason),
    controlDetected: report.control.detected,
  };
} catch (e) {
  report.error = String(e && e.message ? e.message : e);
} finally {
  await browser.close();
}

const text = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, text, "utf8");
console.log(text);

if (report.error) process.exit(2);
if (!report.verdict.controlDetected) {
  console.error("🔴 대조군 미검출 — 스캐너가 죽어 있다. 이 실행의 초록은 대상의 것이 아니다(exit 2).");
  process.exit(2);
}
if (!report.verdict.serverGaveReason) {
  console.error("🔴 서버가 사유를 안 냈다 — 화면 0건은 「막았다」가 아니라 「줄 게 없었다」(exit 2).");
  process.exit(2);
}
process.exit(report.verdict.screenHits.length === 0 ? 0 : 1);
