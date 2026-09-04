/**
 * D-55 독립 검증 — 「ai-api 재기동으로 세션이 사라져도, 화면이 스스로 재입장해 데이터가 돌아오는가」.
 *
 * 🔴 **자극 열을 «먼저»** 돌리고 대조군은 **같은 실행**에서 같은 자극으로 돌린다(41대 규율 1).
 * 🔴 **자극이 실재했는가를 수로 남긴다** — 재기동 «전» 세션이 살아 있었고(200), 재기동 «뒤»
 *    그 세션이 실제로 죽었는지(401 또는 재발급)를 값으로 찍는다. 안 죽었으면 빨강이 아니라 `exit 2`.
 * 🔴 **손잡이·문면을 지어내지 않는다** — 화면의 `data-testid` 를 «열거»하고, 눈에 보이는 문면을
 *    그대로 담는다. 「401 패널」이라는 이름으로 찾지 않는다(그 이름은 발주문의 말이지 화면의 말이 아니다).
 * 🔴 **판정은 «두 열의 차이»로만** — 한 열만 초록이면 그건 아무것도 안 가른다.
 *
 *   node d55_session_recovery.mjs --fix http://127.0.0.1:8120 --ctrl http://127.0.0.1:8119 \
 *        --restart <sh> --api http://127.0.0.1:8118 --out <json> --shotdir <dir>
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const FIX = arg("fix", "");
const CTRL = arg("ctrl", "");
const RESTART = arg("restart", "");
const API = arg("api", "http://127.0.0.1:8118");
const OUT = arg("out", "");
const SHOTDIR = arg("shotdir", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const restart = () => {
  const t0 = Date.now();
  const o = execFileSync("sh", [RESTART], { encoding: "utf8", timeout: 180000 }).trim();
  return { out: o, ms: Date.now() - t0, ready: /READY/.test(o) };
};

const ids = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")).filter((v, i, a) => a.indexOf(v) === i));

const visibleText = (page) => page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 700));

const badge = (page) => page.evaluate(() => {
  const e = document.querySelector('[data-testid="mode-badge"]') || document.querySelector("[data-mode]");
  return e ? { mode: e.getAttribute("data-mode"), text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) } : null;
});

const column = async (browser, base, label) => {
  const col = { label, base, api: [] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
  /* 🔴 «/api» 만 담으면 이 축은 안 보인다 — 복구가 «문서 항해»(리다이렉트 → 재발급)로 일어나면
     API 응답 목록에는 흔적이 한 줄도 안 남는다. 그래서 문서 응답까지 전부 담는다(1차 자수). */
  page.on("response", (r) => {
    const rt = r.request().resourceType();
    if (rt === "image" || rt === "font" || rt === "stylesheet" || rt === "script") return;
    col.api.push({ s: r.status(), m: r.request().method(), rt, u: r.url().replace(base, "").slice(0, 70), t: Date.now() });
  });

  /* ① 입장 — 손잡이는 화면에서 열거해 고른다. */
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1200);
  const landingIds = await ids(page);
  col.landingIds = landingIds;
  const enterId = landingIds.find((i) => /^(enter-button|enter|start)$/.test(i)) ?? landingIds.find((i) => /enter/i.test(i)) ?? null;
  col.enterHandle = enterId;
  if (enterId) { await page.locator(`[data-testid="${enterId}"]`).first().click().catch(() => {}); }
  await page.waitForURL(/overview/, { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  col.beforeIds = await ids(page);
  col.beforeText = await visibleText(page);
  col.beforeBadge = await badge(page);
  /* 🔴 이름만 비교하면 «같은 이름의 새 쿠키»를 못 본다 — 재입장의 증인은 «값»이다(2차 자수). */
  col.cookiesBefore = (await ctx.cookies()).map((c) => c.name + "=" + (c.value || "").slice(0, 10));
  col.before401 = col.api.filter((a) => a.s === 401).length;
  col.beforeOk = col.api.filter((a) => a.s === 200).length;
  if (SHOTDIR) await page.screenshot({ path: `${SHOTDIR}/${label}-1-before.png` }).catch(() => {});

  /* 🔴 무대 성립 — 입장이 실제로 됐는가. 안 됐으면 재기동해 봐야 아무 뜻이 없다. */
  col.entered = /overview/.test(page.url()) && col.beforeOk > 0;

  /* ② 자극 — ai-api 재기동(세션 저장소가 프로세스 메모리라 여기서 사라진다). */
  const mark = col.api.length;
  col.restart = restart();

  /* ③ 새로고침 */
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(6000);
  col.afterIds = await ids(page);
  col.afterText = await visibleText(page);
  col.afterBadge = await badge(page);
  col.cookiesAfter = (await ctx.cookies()).map((c) => c.name + "=" + (c.value || "").slice(0, 10));
  col.sidChanged = JSON.stringify(col.cookiesBefore) !== JSON.stringify(col.cookiesAfter);
  col.urlAfter = page.url();
  const post = col.api.slice(mark);
  col.postRequests = post.slice(0, 40);
  col.post401 = post.filter((a) => a.s === 401).length;
  col.postOk = post.filter((a) => a.s === 200).length;
  /* 「자동 재입장」의 증인 = 세션을 새로 만드는 요청이 내가 안 눌렀는데 일어났는가. */
  /* 자동 재입장 = 내가 안 눌렀는데 세션 발급 경로를 지났는가(문서 항해 포함). */
  col.autoReenter = post.filter((a) => /session|enter/i.test(a.u)).length;
  col.postDocs = post.filter((a) => a.rt === "document").map((a) => a.s + " " + a.u);
  col.consoleErrors = consoleErrors.slice(0, 8);
  if (SHOTDIR) await page.screenshot({ path: `${SHOTDIR}/${label}-2-after.png` }).catch(() => {});
  await ctx.close();
  return col;
};

const out = { at: new Date().toISOString(), api: API };
out.apiHealthBefore = await fetch(API + "/api/health").then((r) => r.json()).catch((e) => ({ err: String(e).slice(0, 80) }));
const browser = await chromium.launch();
if (FIX) out.fix = await column(browser, FIX, "fix");
if (CTRL) out.ctrl = await column(browser, CTRL, "ctrl");
await browser.close();
/* 🔴 두 열이 «똑같으면» 그건 내 것이다 — 아무것도 못 가르는 빨강·초록은 대상의 답이 아니다. */
if (out.fix && out.ctrl) {
  out.discriminates =
    out.fix.post401 !== out.ctrl.post401 ||
    out.fix.autoReenter !== out.ctrl.autoReenter ||
    out.fix.afterText.slice(0, 200) !== out.ctrl.afterText.slice(0, 200) ||
    out.fix.sidChanged !== out.ctrl.sidChanged;
}
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
