/**
 * D-53 대조 실험 — 「상류가 죽었는데 첫 페인트가 «라이브»로 보이는가」의 **로컬 재현 여부만**.
 * 원인 규명은 이 그물의 것이 아니다(귀속 분리 · 발주 ⓔ).
 *
 * 🔴 **한 시점은 대상의 답이 아니다** — 첫 페인트는 «지나가는 상태»라 한 번 읽으면 놓친다.
 *    그래서 ① SSR 원문(HTML 문자열) ② document_start 부터 50ms 조밀 표본 ③ 속성 MutationObserver
 *    세 갈래로 «전이 열»을 만든다. 셋이 갈리면 갈린 채로 적는다.
 * 🔴 **자극이 실재했는가** — 상류가 실제로 죽어 있어야 이 측정이 뜻이 있다. 목적지 포트를
 *    직접 찔러 «죽음»을 수로 남기고(연결 실패), 살아 있으면 빨강이 아니라 exit 2.
 * 🔴 **대조군** = 같은 실행에서 «상류가 산» 열(공개면)을 한 번 더 밟는다. 두 열이 똑같으면
 *    그건 내 계측기가 아무것도 못 가르는 것이다.
 *
 *   node d53_first_paint_badge.mjs --dead http://127.0.0.1:8109 --alive https://… --out <json> --shot <png>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const DEAD = arg("dead", "http://127.0.0.1:8109");
const ALIVE = arg("alive", "");
const OUT = arg("out", "");
const SHOT = arg("shot", "");
const MS = Number(arg("ms", "9000"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sampler = () => {
  window.__modes = [];
  const t0 = performance.now();
  const read = (src) => {
    const e = document.querySelector('[data-testid="mode-badge"]') || document.querySelector("[data-mode]");
    const m = e ? e.getAttribute("data-mode") : null;
    const t = e ? (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) : null;
    const last = window.__modes[window.__modes.length - 1];
    if (!last || last.mode !== m || last.text !== t) window.__modes.push({ ms: Math.round(performance.now() - t0), mode: m, text: t, src });
  };
  setInterval(() => read("poll50"), 50);
  new MutationObserver(() => read("mutation")).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-mode"], childList: true });
  read("init");
};

const column = async (browser, base, label) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(sampler);
  const page = await ctx.newPage();
  const col = { label, base };
  const ssr = await fetch(base + "/").then((r) => r.text()).catch((e) => "ERR " + e);
  col.ssrDataMode = (ssr.match(/data-mode="([^"]*)"/) ?? [])[1] ?? null;
  col.ssrHasLiveWord = /LIVE|라이브/.test(ssr);
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(MS);
  col.timeline = await page.evaluate(() => window.__modes ?? []);
  col.finalMode = col.timeline.length ? col.timeline[col.timeline.length - 1].mode : null;
  col.everLive = col.timeline.some((x) => x.mode === "live" || /LIVE|라이브/.test(x.text ?? ""));
  col.firstNonNull = col.timeline.find((x) => x.mode) ?? null;
  if (SHOT && label === "dead") await page.screenshot({ path: SHOT }).catch(() => {});
  await ctx.close();
  return col;
};

/* 자극 실재 — 목적지가 «정말» 죽었는가. */
const out = { at: new Date().toISOString() };
out.upstreamProbe = await fetch("http://127.0.0.1:8108/health", { signal: AbortSignal.timeout(2500) })
  .then((r) => ({ reachable: true, status: r.status }))
  .catch((e) => ({ reachable: false, err: String(e).slice(0, 90) }));
if (out.upstreamProbe.reachable) {
  out.abort = "상류(:8108)가 살아 있다 — 「PC 오프」 무대가 성립하지 않는다. 빨강이 아니라 exit 2.";
  console.log(JSON.stringify(out, null, 1));
  process.exit(2);
}
const browser = await chromium.launch();
out.dead = await column(browser, DEAD, "dead");
if (ALIVE) out.alive = await column(browser, ALIVE, "alive");
out.discriminates = ALIVE ? JSON.stringify(out.dead.timeline.map((x) => x.mode)) !== JSON.stringify(out.alive.timeline.map((x) => x.mode)) : null;
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
