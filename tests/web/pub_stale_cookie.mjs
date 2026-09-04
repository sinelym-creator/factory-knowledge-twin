/**
 * 공개면 «낡은 쿠키» 열 — 상류 재생성 «전»에 세션을 잡아 두고, 재생성 «뒤»에 그 쿠키로 새로고침한다.
 *
 * 🔴 **이 자극의 창은 재생성 «순간»에 닫힌다** — 재생성 뒤에 발급받은 쿠키는 낡은 쿠키가 아니다.
 *    그래서 «전» 단계(`--capture`)를 미리 돌려 두지 않으면 이 축은 영영 못 잰다(발주 전제가 먼저 죽는다).
 * 🔴 **패널은 «서버 렌더 fetch» 가 그린다** — `/api/` 만 보면 한 줄도 안 남는다(43대 D-55 규명).
 *    그래서 문서 응답까지 담고, 판정은 `data-why`·`data-kind`·`data-mode` «집합»으로 낸다.
 * 🔴 **`--state` 파일은 «리포 밖»에 둔다** — 살아 있는 세션 쿠키가 통째로 들어간다. 공개 리포에 커밋 금지.
 * 🔴 **밖의 근거는 연결 IP** — 사설이면 그 회차 화면 축은 버린다.
 *
 *   node pub_stale_cookie.mjs --capture --state <json>          (재생성 «전»)
 *   node pub_stale_cookie.mjs --replay  --state <json> --out <json> --shot <png>   (재생성 «뒤»)
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const STATE = arg("state", "./pub-state.json");
const OUT = arg("out", "");
const SHOT = arg("shot", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const census = (page) => page.evaluate(() => {
  const set = (a) => Array.from(new Set(Array.from(document.querySelectorAll(`[${a}]`)).map((e) => e.getAttribute(a)))).filter(Boolean);
  const el = document.querySelector("[data-runcap-limit],[data-runcap-used],[data-runcap-remaining]");
  return {
    why: set("data-why"), kind: set("data-kind"), mode: set("data-mode"),
    runcap: el ? { limit: el.getAttribute("data-runcap-limit"), used: el.getAttribute("data-runcap-used"), remaining: el.getAttribute("data-runcap-remaining") } : null,
    testids: Array.from(new Set(Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")))),
    buttons: Array.from(document.querySelectorAll("button")).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12),
    text: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 500),
  };
});

const browser = await chromium.launch();
const ctx = has("replay") && fs.existsSync(STATE)
  ? await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE })
  : await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { at: new Date().toISOString(), base: BASE, mode: has("replay") ? "replay" : "capture", reqs: [] };
const addrs = new Set();
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
page.on("response", async (r) => {
  const rt = r.request().resourceType();
  if (rt !== "image" && rt !== "font" && rt !== "stylesheet" && rt !== "script")
    out.reqs.push({ s: r.status(), m: r.request().method(), rt, u: r.url().replace(BASE, "").slice(0, 74) });
  try { const a = await r.serverAddr(); if (a?.ipAddress) addrs.add(a.ipAddress); } catch {}
});

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
await sleep(4000);
out.url = page.url();
out.census = await census(page);
out.cookies = (await ctx.cookies()).map((c) => `${c.name}=${(c.value || "").slice(0, 12)}`);
out.enterCount = out.reqs.filter((r) => /\/enter(\?|$)/.test(r.u)).length;
out.serverAddrs = [...addrs];
out.consoleErrors = errs.slice(0, 8);
out.status401 = out.reqs.filter((r) => r.s === 401).length;
/* 🔴 절대경로를 산출물에 찍지 않는다 — 공개 리포 위생 게이트가 그것을 잡는다(43대 회귀 1건). */
if (!has("replay")) { await ctx.storageState({ path: STATE }); out.saved = "(리포 밖 · 파일명 " + STATE.split("/").pop().split(String.fromCharCode(92)).pop() + ")"; }
if (SHOT) await page.screenshot({ path: SHOT }).catch(() => {});
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
