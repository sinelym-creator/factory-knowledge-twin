/**
 * D-55 독립 검증 — 「API 세션이 사라져도 화면이 «한 번» 스스로 재입장해 데이터가 돌아오는가」.
 * 판정선 = 발주 원장 D-55 행 ①~⑦. 리바이2 43대.
 *
 * 🔴 **자극 열을 «먼저»**, 대조군은 **같은 실행**. 열마다 제 자극(재기동)을 따로 받는다 —
 *    한 번 재기동하고 두 열을 이어 돌리면 뒤 열은 «이미 복구된 세계»를 밟는다.
 * 🔴 **자극 실재를 «수»로** — 재기동 전 200 / 후 401 을 API 층에서 직접 찍고 시작한다.
 *    안 죽었으면 빨강이 아니라 `exit 2`.
 * 🔴 **표지를 이름으로 찾지 않는다** — `data-why`·`data-kind`·`data-mode` 를 «집합»으로 훑는다.
 * 🔴 **`/api/` 만 담으면 문서 항해로 일어나는 복구가 안 보인다**(43대 자수 1) · **쿠키는 «값»으로**
 *    비교한다(자수 2).
 *
 *   node d55_reenter_verify.mjs --fix … --ctrl … --api … --restart <sh> --out <json> --shotdir <dir>
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const FIX = arg("fix", "http://127.0.0.1:8120");
const CTRL = arg("ctrl", "http://127.0.0.1:8119");
const API = arg("api", "http://127.0.0.1:8118");
const RESTART = arg("restart", "");
const OUT = arg("out", "");
const SHOTDIR = arg("shotdir", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const restart = () => {
  const t0 = Date.now();
  const o = execFileSync("sh", [RESTART], { encoding: "utf8", timeout: 180000 }).trim();
  return { out: o, ms: Date.now() - t0, ready: /READY/.test(o) };
};

/* 「되살리는 중」 표지는 «지나가는 상태»라 한 시점 읽기로는 놓친다 — 문서 열리기 전에 감시자를 심는다. */
const marker = () => {
  window.__mk = { recovering: 0, seen: [] };
  const scan = () => {
    document.querySelectorAll("[data-kind],[data-why],[data-mode]").forEach((e) => {
      const k = `${e.getAttribute("data-kind") ?? ""}|${e.getAttribute("data-why") ?? ""}|${e.getAttribute("data-mode") ?? ""}`;
      if (k !== "||" && !window.__mk.seen.includes(k)) window.__mk.seen.push(k);
    });
    const t = document.body ? document.body.innerText || "" : "";
    if (/되살리는 중|재입장 중|복구 중/.test(t)) window.__mk.recovering += 1;
  };
  new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  setInterval(scan, 100);
};

const census = (page) => page.evaluate(() => {
  const set = (a) => Array.from(new Set(Array.from(document.querySelectorAll(`[${a}]`)).map((e) => e.getAttribute(a)))).filter(Boolean);
  return {
    why: set("data-why"), kind: set("data-kind"), mode: set("data-mode"),
    testids: Array.from(new Set(Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")))),
    buttons: Array.from(document.querySelectorAll("button")).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 14),
    text: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 420),
    marker: window.__mk ?? null,
  };
});

const column = async (browser, { base, label, block, fresh }) => {
  const col = { label, base, block: !!block, fresh: !!fresh, reqs: [] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(marker);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  page.on("request", (r) => { const t = r.resourceType(); if (t !== "image" && t !== "font" && t !== "stylesheet" && t !== "script") col.reqs.push({ m: r.method(), rt: t, u: r.url().replace(base, "").slice(0, 74), t: Date.now() }); });

  /* ① 입장 */
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL(/overview/, { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  col.before = await census(page);
  col.cookiesBefore = (await ctx.cookies()).map((c) => `${c.name}=${(c.value || "").slice(0, 12)}`);
  col.enteredOk = /overview/.test(page.url()) && col.before.testids.length > 3;

  if (fresh) { /* 첫 방문 열은 자극을 안 준다 — 흐름 «불변»만 본다. */
    col.mark = col.reqs.length;
    col.after = col.before; col.cookiesAfter = col.cookiesBefore;
  } else {
    /* ②-a 차단 열이면 `/enter` 를 «renew 포함» 정규식으로 막는다(센쿠2 자수 2 재현). */
    if (block) await page.route(/\/enter(\?|$)|\/enter\?.*renew=1/, (r) => r.abort());
    /* ②-b 자극 = ai-api 재기동 */
    col.mark = col.reqs.length;
    col.restart = restart();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await sleep(7000);
    col.after = await census(page);
    col.cookiesAfter = (await ctx.cookies()).map((c) => `${c.name}=${(c.value || "").slice(0, 12)}`);
  }
  const post = col.reqs.slice(col.mark);
  col.postReqs = post.slice(0, 30).map((r) => `${r.m} ${r.rt} ${r.u}`);
  col.enterCount = post.filter((r) => /\/enter(\?|$)/.test(r.u)).length;
  col.enterAll = col.reqs.filter((r) => /\/enter(\?|$)/.test(r.u)).length;
  col.sidChanged = JSON.stringify(col.cookiesBefore) !== JSON.stringify(col.cookiesAfter);
  col.urlAfter = page.url();
  col.consoleErrors = errs.slice(0, 6);
  if (SHOTDIR) await page.screenshot({ path: `${SHOTDIR}/${label}.png` }).catch(() => {});
  await ctx.close();
  return col;
};

/* 🔴 자극 실재 — API 층에서 먼저 증명한다. */
const out = { at: new Date().toISOString(), fixBase: FIX, ctrlBase: CTRL, api: API };
const mk = await fetch(API + "/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const ck = (mk.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
out.stimulus = { created: mk.status, cookie: ck ? "yes" : "no" };
/* 🔴 재기동 «직후» 첫 fetch 가 ECONNRESET 을 낸다 — keep-alive 소켓이 «죽은 프로세스»를 가리킨다.
   그 빨강은 대상의 답이 아니라 내 커넥션 풀의 것이다(43대 자수 3). 그래서 connection:close 로
   새 소켓을 강제하고, 네트워크 오류는 3회까지 다시 묻는다. */
const probe = async (ck) => {
  for (let n = 0; n < 3; n++) {
    try { return (await fetch(API + "/api/plants", { headers: { cookie: ck, connection: "close" } })).status; }
    catch (e) { if (n === 2) return "NETERR " + String(e).slice(0, 40); }
  }
};
out.stimulus.before = await probe(ck);
out.stimulus.restart = restart();
out.stimulus.after = await probe(ck);
if (!(out.stimulus.before === 200 && out.stimulus.after === 401)) {
  out.abort = `자극 미성립(전 ${out.stimulus.before} · 후 ${out.stimulus.after}) — 재기동이 세션을 안 죽였다. 빨강이 아니라 exit 2.`;
  console.log(JSON.stringify(out, null, 1)); process.exit(2);
}

const browser = await chromium.launch();
out.A_fix = await column(browser, { base: FIX, label: "A-fix-warm" });
out.B_ctrl = await column(browser, { base: CTRL, label: "B-ctrl-warm" });
out.C_fixBlocked = await column(browser, { base: FIX, label: "C-fix-blocked", block: true });
out.D_fixFresh = await column(browser, { base: FIX, label: "D-fix-firstvisit", fresh: true });
await browser.close();
/* 🔴 두 열이 똑같으면 아무것도 못 가른다 — 그건 내 것이다. */
out.discriminates = out.A_fix.enterCount !== out.B_ctrl.enterCount ||
  JSON.stringify(out.A_fix.after.why) !== JSON.stringify(out.B_ctrl.after.why);
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
