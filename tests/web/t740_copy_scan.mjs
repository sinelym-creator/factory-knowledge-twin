/**
 * T7-40 독립 검증 — 「방문자에게 보이는 문구가 존댓말체인가 · 내부 표기가 남았는가」.
 * 판정선 = 발주 원장 T7-40 행 ①②(금지 패턴 0 · 값 집합 불변). 리바이2 43대.
 *
 * 🔴 **금지 정규식은 발주문 문자열을 «그대로» 쓴다** — 내가 넓히면 엄격함이 아니라 오답이다.
 * 🔴 **제외는 «삭제»가 아니라 «표시»다** — 문서 본문(`data/**` 매뉴얼)을 지우고 세면 그 안에 숨은
 *    위반을 영영 못 본다. 그래서 모든 히트를 담되 `excluded` 로 «갈라» 세고, 제외 노드 수도 값으로 낸다.
 * 🔴 **화면·id 를 지어내지 않는다** — 근거·문서 화면은 «화면이 준 링크»로만 간다. 못 찾으면 「안 잼」.
 * 🔴 **대조군이 울어야 판정이 선다** — 대조군에서 히트가 0 이면 이 그물은 아무것도 못 가른 것이고,
 *    그때는 대상의 초록도 무효(`exit 2`).
 *
 *   node t740_copy_scan.mjs --base http://127.0.0.1:8130 --label target --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8130");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const SHOTDIR = arg("shotdir", "");
const STEPS = Number(arg("steps", "9"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 발주문 그대로. 넓히지도 좁히지도 않는다. */
const BANNED = "이다\.|한다\.|둔다\.|없다\.|아니다\.|«|»|계약 v0\.|원장|Q-\d|D-\d|T\d-";
/* 문서 본문 = `data/**` 매뉴얼을 그대로 그리는 자리. 화면 문구가 아니라 «자료»다. */
const EXCLUDE_SEL = '[data-testid="cited-body"]';

const scan = (page, screen) => page.evaluate(({ re, sel, screen }) => {
  const rx = new RegExp(re, "g");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = []; let nodes = 0, excludedNodes = 0;
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el) continue;
    /* 🔴 «보이는 문구»만 잰다 — script/style 안의 RSC 직렬화 payload 는 방문자가 읽는 글이 아니다.
       1차 실행에서 self.__next_f.push(...) 가 히트로 잡혔다(43대 자수: 내 그물이 만든 빨강). */
    if (el.closest("script, style, template, noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    nodes += 1;
    const inExcluded = !!(el && el.closest(sel));
    if (inExcluded) excludedNodes += 1;
    rx.lastIndex = 0;
    const m = t.match(rx);
    if (m) hits.push({ screen, excluded: inExcluded, pat: Array.from(new Set(m)), text: t.slice(0, 110), tid: el ? (el.closest("[data-testid]")?.getAttribute("data-testid") ?? null) : null });
  }
  const set = (a) => Array.from(new Set(Array.from(document.querySelectorAll(`[${a}]`)).map((e) => e.getAttribute(a)))).filter(Boolean).sort();
  return { screen, nodes, excludedNodes, hits, attrs: {
    testid: set("data-testid"), why: set("data-why"), kind: set("data-kind"),
    mode: set("data-mode"), runcapUsed: set("data-runcap-used"),
    tourPlacement: set("data-tour-placement"), tourClear: set("data-tour-clear"),
  } };
}, { re: BANNED, sel: EXCLUDE_SEL, screen });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = { label: LABEL, base: BASE, at: new Date().toISOString(), screens: [], notMeasured: [] };
const errs = []; page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 130)));

/* ① Overview */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
await sleep(3000);
out.screens.push(await scan(page, "overview"));

/* ② 조사 화면 — 화면이 준 손잡이로만 들어간다. */
let entered = false;
for (const sel of ['[data-testid="start-from-alarm"]', '[data-testid="start-from-headline"]']) {
  const l = page.locator(sel);
  try { await l.first().waitFor({ state: "visible", timeout: 30000 }); } catch { continue; }
  await l.first().click().catch(() => {});
  await page.waitForURL(/incidents\//, { timeout: 30000 }).catch(() => {});
  await sleep(3500); entered = true; break;
}
if (entered) out.screens.push(await scan(page, "incident-run")); else out.notMeasured.push("incident-run: 손잡이 미발견");

/* ③④ 근거·문서 — 화면이 준 링크로만. id 를 지어내지 않는다. */
const links = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")));
const ev = links.find((h) => /^\/evidence\//.test(h ?? ""));
const doc = links.find((h) => /^\/documents\//.test(h ?? ""));
for (const [name, href] of [["evidence", ev], ["documents", doc]]) {
  if (!href) { out.notMeasured.push(`${name}: 화면에 링크 없음`); continue; }
  await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(2500);
  out.screens.push(await scan(page, name));
}

/* ⑤ 투어 말풍선 — 걸음마다. 제목이 안 바뀌면 같은 걸음 재독이라 세지 않는다. */
/* 🔴 초대 카드는 «화면이 주는» 것으로만 연다 — 1차 실행에서 ?intro=1&tour=1 로 갔더니 초대가 없었다.
   손잡이 후보를 열거해 고르고, 없으면 이름과 함께 「안 잼」으로 남긴다(지어내지 않는다). */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await sleep(3000);
out.tourHandles = await page.evaluate(() => Array.from(document.querySelectorAll("button")).map((b) => (b.textContent || "").replace(/s+/g, " ").trim()).filter(Boolean).slice(0, 16));
const startBtn = page.getByRole("button", { name: /둘러보기 시작|둘러보기|안내와 둘러보기/ });
if (await startBtn.count().then((n) => n > 0).catch(() => false)) {
  await startBtn.first().click().catch(() => {});
  await sleep(1200);
  const seenTitles = [];
  for (let i = 0; i < STEPS; i++) {
    const s = await scan(page, `tour-step-${i + 1}`);
    const title = await page.evaluate(() => {
      const b = document.querySelector("[data-tour-placement]") || document.querySelector('[role="dialog"]');
      return b ? (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : null;
    });
    if (title && seenTitles.includes(title)) { out.notMeasured.push(`tour-step-${i + 1}: 같은 걸음 재독(제목 불변) — 세지 않음`); break; }
    if (title) seenTitles.push(title);
    s.tourTitle = title;
    out.screens.push(s);
    const next = page.getByRole("button", { name: /다음|계속|넘어가/ });
    if (!(await next.count().then((n) => n > 0).catch(() => false))) { out.notMeasured.push(`tour-step-${i + 2}: «다음» 손잡이 없음(사람이 눌러야 하는 걸음)`); break; }
    await next.first().click().catch(() => {});
    await sleep(900);
  }
  out.tourSteps = seenTitles.length;
} else out.notMeasured.push("tour: 초대 카드 없음");

if (SHOTDIR) await page.screenshot({ path: `${SHOTDIR}/${LABEL}-tour.png` }).catch(() => {});
await browser.close();

const all = out.screens.flatMap((s) => s.hits);
out.total = {
  screens: out.screens.length,
  nodes: out.screens.reduce((a, s) => a + s.nodes, 0),
  excludedNodes: out.screens.reduce((a, s) => a + s.excludedNodes, 0),
  hitsJudged: all.filter((h) => !h.excluded).length,
  hitsExcluded: all.filter((h) => h.excluded).length,
};
out.judgedHits = all.filter((h) => !h.excluded).slice(0, 40);
out.consoleErrors = errs.slice(0, 8);
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
process.exit(out.total.hitsJudged > 0 ? 1 : 0);
