/**
 * O-9 독립 검증 — 「셸이 `X-FKT-Run-Reused` 를 브라우저까지 옮기는가」.
 *
 * 🔴 **재사용 창은 «비종결» 동안뿐이다**(계약 v0.1.14/15). 그러니 두 요청을 «연달아» 쏴야 하고,
 *    첫 run 이 이미 끝났으면 두 번째는 «새 run» 이라 재사용이 아니다 — 그때는 빨강이 아니라 `exit 2`.
 * 🔴 **재사용의 증인은 헤더가 아니라 «같은 runId»** 다. runId 가 갈리면 무대가 안 선 것이고,
 *    그 회차의 헤더 유무는 아무 뜻이 없다.
 * 🔴 **셸을 «거쳐야» 이 축이다** — 상류를 직접 찌르면 프록시를 안 거치므로 O-9 를 재는 게 아니다.
 *
 *   node batch_o9_reused.mjs --base http://127.0.0.1:8142 --label target --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8142");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const out = { label: LABEL, base: BASE, at: new Date().toISOString() };
const out2 = {};

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
await sleep(2000);
/* 🔴 `sessionId` 는 «필수»다(대상의 openapi 가 그렇게 말한다 — 내가 지어낸 body 는 422 였다).
   쿠키는 HttpOnly 라 못 읽으므로, 대상이 주는 경로로 세션을 하나 받아 그 id 를 쓴다. */
out.shots = await page.evaluate(async () => {
  const out2 = {};
  const mk = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const sess = await mk.json().catch(() => ({}));
  const sessionId = sess.sessionId ?? null;
  const fire = async () => {
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, mode: "replay" }),
    });
    const h = {};
    r.headers.forEach((v, k) => { if (k.toLowerCase().startsWith("x-fkt")) h[k.toLowerCase()] = v; });
    let body = null;
    try { body = await r.json(); } catch {}
    return { status: r.status, headers: h, runId: body?.runId ?? null, err: body?.error?.code ?? null };
  };
  /* 🔴 직렬로 쏘면 첫 run 이 «이미 끝난» 뒤라 두 번째는 새 run 이다(1차 실측: runId 갈림).
     재사용 창은 «비종결 동안»뿐이라 «동시»에 쏴야 한다. 그래도 안 걸리면 무대 미성립이지 빨강이 아니다.
     창이 좁으니 최대 5회 시도하고, 걸린 회차를 값으로 남긴다. */
  let a = null, b = null, tries = 0;
  for (; tries < 5; tries++) {
    const [x, y] = await Promise.all([fire(), fire()]);
    a = x; b = y;
    if (x.runId && x.runId === y.runId) break;
  }
  out2.tries = tries + 1;
  return { sessionCreated: mk.status, sessionId: sessionId ? sessionId.slice(0, 6) + "…" : null, tries: out2.tries, first: a, second: b };
});

out.sameRunId = !!(out.shots.first.runId && out.shots.first.runId === out.shots.second.runId);
out.reusedHeaderOnSecond = Object.keys(out.shots.second.headers).some((k) => k === "x-fkt-run-reused");
out.reusedValue = out.shots.second.headers["x-fkt-run-reused"] ?? null;
/* 나머지 허용 헤더가 그대로인가(축②) — 두 응답 모두에서 run-cap 3종을 본다. */
out.capHeadersFirst = Object.keys(out.shots.first.headers).filter((k) => k.startsWith("x-fkt-run-cap")).sort();
out.capHeadersSecond = Object.keys(out.shots.second.headers).filter((k) => k.startsWith("x-fkt-run-cap")).sort();
await browser.close();

console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
/* 🔴 무대 미성립(runId 가 갈림) = 색을 내지 않는다. */
if (!out.sameRunId) process.exit(2);
process.exit(out.reusedHeaderOnSecond ? 0 : 1);
