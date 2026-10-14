/**
 * S69-6 축 ③ — 공개 화면 → ai-api → 게이트웨이(새 토큰) → 결과 표시, **실합성 1회** 왕복. 리바이2 · 2026-10-14.
 *
 * 🔴 **1회만이다.** `start-from-alarm` 을 한 번 누르고, 실패해도 다시 누르지 않는다(실패는 실패대로 적는다).
 *    그 버튼 = startRunBrowser(scenarioId, sessionId, "live")(main `start-investigation.tsx`) — 손잡이는 소스에서 확인했다.
 * 🔴 손잡이가 안 보이면 누르지 않고 exit 2(무대 미성립 · 구독 사용 0).
 * 🔴 결과의 정본 = `/api/runs/{id}/events`(같은 쿠키로 페이지 안에서) + 화면 `synthesis-badge[data-axis]`.
 *    본문(합성 문장)은 옮기지 않는다 — 종류·건수·축만 센다.
 * 🔴 t0 를 로컬 시각으로도 남긴다 — 게이트웨이 접근 로그(로컬 시각)와 대조하기 위함.
 *
 *   node _s69_6_live_once.mjs --go [--base=…]   (--go 없으면 아무것도 안 누르고 exit 2)
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("@playwright/test");

const arg = (k, d) => (process.argv.find((x) => x.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const GO = process.argv.includes("--go");
const WAIT_MS = Number(arg("wait", "240000"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const local = () => new Date().toLocaleTimeString("ko-KR", { hour12: false, timeZone: "Asia/Seoul" });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { base: BASE, go: GO };
const consoleErrors = [], pageErrors = [], serverAddrs = new Set(), apiCalls = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
page.on("response", async (r) => {
  if (/\/api\//.test(r.url())) apiCalls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").replace(/\?.*$/, "").slice(0, 70)}`);
  try { const sa = await r.serverAddr(); if (sa?.ipAddress) serverAddrs.add(sa.ipAddress); } catch {}
});
const attr = (id, a) => page.locator(`[data-testid="${id}"]`).first().getAttribute(a, { timeout: 2000 }).catch(() => null);
const text = (id) => page.locator(`[data-testid="${id}"]`).first().textContent({ timeout: 2000 }).then((t) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 80)).catch(() => null);
const finish = (code) => { out.serverAddrs = [...serverAddrs]; out.consoleErrors = consoleErrors; out.pageErrors = pageErrors; out.apiCalls = [...new Set(apiCalls)].slice(0, 40); console.log(JSON.stringify(out, null, 1)); return browser.close().then(() => process.exit(code)); };

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/\/overview/, { timeout: 30000 }).catch(() => {});
out.liveStatusBefore = await page.evaluate(() => fetch("/api/live/status").then((r) => r.json()).catch((e) => ({ err: String(e) })));
const btn = page.locator('[data-testid="start-from-alarm"]').first();
const visible = await btn.waitFor({ state: "visible", timeout: 60000 }).then(() => true).catch(() => false);
out.startVisible = visible;
if (!visible || !GO) { out.abort = !visible ? "start-from-alarm 미가시 — 누르지 않음(구독 0)" : "--go 없음 — 누르지 않음"; await finish(2); }

out.t0Utc = new Date().toISOString(); out.t0Local = local();
const t0 = Date.now();
await btn.click();
await page.waitForURL(/[?&]run=/, { timeout: 45000 }).catch(() => {});
out.runUrl = page.url().replace(BASE, "");
out.runId = (out.runUrl.match(/run=([^&]+)/) ?? [])[1] ?? null;
if (!out.runId) { out.abort = "run 화면 진입 실패(클릭은 1회 했음 · 재시도 안 함)"; await finish(1); }

const poll = [];
while (Date.now() - t0 < WAIT_MS) {
  await sleep(3000);
  const st = await text("run-status");
  poll.push({ s: Math.round((Date.now() - t0) / 1000), st, axis: await attr("synthesis-badge", "data-axis"), pending: await page.locator('[data-testid="synthesis-pending"]').count() });
  if (st && /완료|completed|실패|failed|오류/.test(st)) break;
}
out.poll = poll; out.doneSec = Math.round((Date.now() - t0) / 1000); out.doneLocal = local();
await sleep(2000);
out.runStatus = await text("run-status");
out.badge = { axis: await attr("synthesis-badge", "data-axis"), text: await text("synthesis-badge") };
out.rejectedReason = await text("synthesis-rejected-reason");
const ev = await page.evaluate((rid) => fetch(`/api/runs/${rid}/events`).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) })).catch((e) => ({ err: String(e) })), out.runId);
const list = Array.isArray(ev.j) ? ev.j : (ev.j?.events ?? ev.j?.items ?? []);
out.events = { status: ev.s, count: list.length, byType: {} };
for (const e of list) { const t = e.type ?? e.kind ?? e.event ?? "?"; out.events.byType[t] = (out.events.byType[t] ?? 0) + 1; }
// 합성 관련 이벤트는 «키»와 비본문 필드만(축 · 모델 · 결과 · 근거 수)
out.events.synthesis = list.filter((e) => /synth/i.test(JSON.stringify(e.type ?? e.kind ?? ""))).map((e) => {
  const p = e.payload ?? e.data ?? e;
  return { type: e.type ?? e.kind, keys: Object.keys(p).slice(0, 20), axis: p.axis ?? p.mode ?? null, model: p.model ?? null, outcome: p.outcome ?? p.status ?? null, citations: Array.isArray(p.citations) ? p.citations.length : (Array.isArray(p.evidenceIds) ? p.evidenceIds.length : null) };
});
out.liveStatusAfter = await page.evaluate(() => fetch("/api/live/status").then((r) => r.json()).catch((e) => ({ err: String(e) })));
await finish(0);
