/**
 * D-60/61 ①② + T7-39 ① 독립 검증 — 세션이 있어야 서는 축들이라 브라우저로 잰다.
 * 🔴 `/incidents` 는 «세션 없이» 307 이다(내 curl 1차 실측) — 쿠키 없는 회차의 307 은 대상의 답이 아니다.
 * 🔴 손잡이·문면은 화면에서 열거해 고른다. 못 찾으면 이름과 함께 「안 잼」.
 *   node batch_d60_t739.mjs --base http://127.0.0.1:8140 --label target --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8140");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (p) => p.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")))));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { label: LABEL, base: BASE, at: new Date().toISOString(), notMeasured: [] };
const errs = []; page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 120)));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
await sleep(2500);

/* ── D-60/61 ① `/incidents` 목록 ── */
const r = await page.goto(BASE + "/incidents", { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => null);
out.incidents = { status: r ? r.status() : null, url: page.url() };
await sleep(1800);
out.incidents.testids = await ids(page);
out.incidents.rows = await page.evaluate(() => document.querySelectorAll('a[href^="/incidents/"]').length);
out.incidents.text = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 260));

/* ── D-60/61 ② 조사 시작 → 근거 → 복귀 시 같은 run 복원 ── */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
await sleep(2000);
let entered = false;
for (const sel of ['[data-testid="start-from-alarm"]', '[data-testid="start-from-headline"]']) {
  const l = page.locator(sel);
  try { await l.first().waitFor({ state: "visible", timeout: 20000 }); } catch { continue; }
  await l.first().click().catch(() => {});
  await page.waitForURL(/incidents\//, { timeout: 30000 }).catch(() => {});
  await sleep(3000); entered = true; break;
}
out.restore = { entered, urlAfterEnter: page.url() };
out.restore.runInUrl = /[?&]run=/.test(page.url());
out.restore.runId = (page.url().match(/run=([^&]+)/) ?? [])[1] ?? null;
if (entered) {
  const ev = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/evidence/"]')).map((a) => a.getAttribute("href"))[0] ?? null);
  out.restore.evidenceHref = ev;
  if (ev) {
    await page.goto(BASE + ev, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
    await sleep(1500);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2500);
    out.restore.urlAfterBack = page.url();
    out.restore.runAfterBack = (page.url().match(/run=([^&]+)/) ?? [])[1] ?? null;
    /* Overview 링크로 갔다가 돌아오는 길도 본다 — 「뒤로」와 «항해»는 다른 사건이다. */
    await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
    await sleep(2000);
    const back = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/incidents/"]')).map((a) => a.getAttribute("href"))[0] ?? null);
    out.restore.overviewIncidentHref = back;
    if (back) {
      await page.goto(BASE + back, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
      await sleep(2500);
      out.restore.urlAfterNav = page.url();
      out.restore.runAfterNav = (page.url().match(/run=([^&]+)/) ?? [])[1] ?? null;
      out.restore.testidsAfterNav = (await ids(page)).length;
    }
  } else out.notMeasured.push("근거 링크 없음 — 복귀 축 못 잼");
} else out.notMeasured.push("조사 진입 실패 — 복원 축 못 잼");

/* ── T7-39 ① 투어 「조사 보기」 걸음 꼬리 ── */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
await sleep(2500);
const start = page.getByRole("button", { name: /둘러보기 시작/ });
out.tour = { inviteFound: await start.count().then((n) => n > 0).catch(() => false), notes: [], titles: [] };
if (out.tour.inviteFound) {
  await start.first().click().catch(() => {});
  await sleep(1200);
  for (let i = 0; i < 9; i++) {
    const snap = await page.evaluate(() => {
      const b = document.querySelector("[data-tour-placement]") || document.querySelector('[role="dialog"]');
      return {
        note: document.querySelector("[data-tour-note]")?.getAttribute("data-tour-note") ?? null,
        title: b ? (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 46) : null,
      };
    });
    if (snap.title && out.tour.titles.includes(snap.title)) break;
    if (snap.title) out.tour.titles.push(snap.title);
    out.tour.notes.push(snap.note);
    const next = page.getByRole("button", { name: /다음|계속/ });
    if (!(await next.count().then((n) => n > 0).catch(() => false))) { out.tour.stoppedAt = i + 1; break; }
    await next.first().click().catch(() => {});
    await sleep(800);
  }
  out.tour.noteValues = Array.from(new Set(out.tour.notes.filter(Boolean)));
} else out.notMeasured.push("투어 초대 없음 — T7-39 ① 못 잼");

out.consoleErrors = errs.slice(0, 6);
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
