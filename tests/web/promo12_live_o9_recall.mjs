/**
 * 승격 12 공개면 — ⓔ O-9(live 2발 «동시») + ⓒ Incidents 목록·조사 복원 을 «한 세션»에서 잰다.
 *
 * 🔴 **구독을 아끼려고 묶는다** — ⓒ 의 복원 축도 실제 run 이 있어야 서는데, 따로 세션을 열면
 *    조사를 한 번 더 태운다. ⓔ 가 만든 run 을 ⓒ 가 그대로 쓴다.
 * 🔴 **재사용의 증인은 헤더가 아니라 «같은 runId»** 다. runId 가 갈리면 재사용 창을 못 밟은 것이고,
 *    그때 헤더가 없는 것은 대상의 답이 아니다(무대 미성립).
 * 🔴 **`used` 는 계약상 재사용 회차에 «안» 오른다** — 2발 동시가 재사용으로 접히면 +1 이어야 한다.
 *
 *   node promo12_live_o9_recall.mjs --base https://… --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runcap = (p) => p.evaluate(() => {
  const e = document.querySelector("[data-runcap-used]");
  return e ? { limit: e.getAttribute("data-runcap-limit"), used: e.getAttribute("data-runcap-used"), remaining: e.getAttribute("data-runcap-remaining") } : null;
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { base: BASE, at: new Date().toISOString(), notMeasured: [] };
const errs = []; page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 130)));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
await sleep(3500);
out.badgeBefore = await page.evaluate(() => document.querySelector('[data-testid="mode-badge"]')?.getAttribute("data-mode") ?? null);
out.runcapBefore = await runcap(page);

/* ── ⓔ live 2발 «동시» ─────────────────────────────────────────────────────── */
out.live = await page.evaluate(async () => {
  const mk = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const sessionId = (await mk.json().catch(() => ({}))).sessionId ?? null;
  const fire = async () => {
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, mode: "live" }),
    });
    const h = {}; r.headers.forEach((v, k) => { if (k.toLowerCase().startsWith("x-fkt")) h[k.toLowerCase()] = v; });
    let b = null; try { b = await r.json(); } catch {}
    return { status: r.status, headers: h, runId: b?.runId ?? null, err: b?.error?.code ?? null };
  };
  const [a, b] = await Promise.all([fire(), fire()]);
  return { sessionId: sessionId ? sessionId.slice(0, 6) + "…" : null, a, b };
});
out.o9 = {
  sameRunId: !!(out.live.a.runId && out.live.a.runId === out.live.b.runId),
  reusedOnA: out.live.a.headers["x-fkt-run-reused"] ?? null,
  reusedOnB: out.live.b.headers["x-fkt-run-reused"] ?? null,
  capA: Object.keys(out.live.a.headers).filter((k) => k.startsWith("x-fkt-run-cap")).sort(),
  capB: Object.keys(out.live.b.headers).filter((k) => k.startsWith("x-fkt-run-cap")).sort(),
  usedA: out.live.a.headers["x-fkt-run-cap-used"] ?? null,
  usedB: out.live.b.headers["x-fkt-run-cap-used"] ?? null,
};

/* ── ⓒ Incidents 목록 + 조사 복원 (같은 세션 · 위 run 을 쓴다) ───────────────── */
const inc = await page.goto(BASE + "/incidents", { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => null);
out.incidents = { status: inc ? inc.status() : null, url: page.url() };
await sleep(2500);
out.incidents.links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/incidents/"]')).map((a) => a.getAttribute("href")));
out.incidents.runRow = out.incidents.links.find((h) => /[?&]run=/.test(h)) ?? null;
if (out.incidents.runRow) {
  await page.goto(BASE + out.incidents.runRow, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
  await sleep(4000);
  out.recall = {
    url: page.url(),
    runAfter: (page.url().match(/run=([^&]+)/) ?? [])[1] ?? null,
    matchesLiveRun: (page.url().match(/run=([^&]+)/) ?? [])[1] === out.live.a.runId,
    testids: await page.evaluate(() => document.querySelectorAll("[data-testid]").length),
  };
  /* 근거 → «뒤로» 로도 복원되는가 */
  const ev = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/evidence/"]')).map((a) => a.getAttribute("href"))[0] ?? null);
  if (ev) {
    await page.goto(BASE + ev, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
    await sleep(1800);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2500);
    out.recall.afterBack = (page.url().match(/run=([^&]+)/) ?? [])[1] ?? null;
  } else out.notMeasured.push("근거 링크 없음 — 뒤로 복원 못 잼");
} else out.notMeasured.push("목록에 조사 행 없음 — 복원 못 잼");

out.runcapAfter = await runcap(page);
out.consoleErrors = errs;
out.consoleNonWs = errs.filter((e) => !/\/api\/ws\/runs/.test(e));
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
