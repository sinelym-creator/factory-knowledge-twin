/**
 * T7-40 잔여 소조각 — evidence §4 의 「안 잼」 ①`documents` 화면 · ②투어 4~9걸음을 닫는다. 리바이2 50대.
 *
 * 🔴 **금지 정규식·제외 셀렉터는 `t740_copy_scan.mjs` 를 «그대로» 옮긴다** — 내가 넓히면 엄격함이 아니라 오답이고,
 *    좁히면 앞 회차와 다른 실험이 된다.
 * 🔴 **대조군이 울어야 0 이 값이 된다** — 화면마다 «대상 스캔 뒤»에 위반 1건을 심고 다시 훑어 델타를 센다.
 *    안 울면 그 화면은 PASS 가 아니라 **「판정력 없음」**이다(43대 §4-4 가 그 자리였다).
 *    🔴 대조군은 «대상 열 다음»에 돈다 — 먼저 돌리면 그 조작이 대상 열의 조건을 바꾼다.
 * 🔴 **걸음 수는 소스가 아니라 «도는 화면»이 정한다** — 콜아웃의 `tour-progress`(`i/total`)를 읽어 적는다.
 *    발주문의 「9」도 전언이다.
 * 🔴 **사람 조작 걸음은 실제로 수행한다** — 앞 회차 그물은 «다음» 손잡이가 없으면 멈췄다(3걸음).
 *    실물 진행 손잡이는 셋이다: `tour-next`(다음) · `tour-goto`(화면 이동 링크) · `tour-await-click`(대상을 직접 클릭).
 *    앞 그물은 첫째만 알았다 — 그래서 4걸음부터가 「안 잼」이었다.
 * 🔴 **id 를 지어내지 않는다** — 문서 id 는 API 응답(`/api/retrieval/compare` 의 `evidenceId`)에서만 얻는다.
 *
 *   node t740b_remainder_scan.mjs --base http://127.0.0.1:8831 --api http://127.0.0.1:8830 --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8831").replace(/\/$/, "");
const API = arg("api", "http://127.0.0.1:8830").replace(/\/$/, "");
const OUT = arg("out", "");
const SETTLE = Number(arg("settle", "2500"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 43대 그물에서 그대로 옮긴 판정선 ─────────────────────────────── */
const BANNED = "이다\\.|한다\\.|둔다\\.|없다\\.|아니다\\.|«|»|계약 v0\\.|원장|Q-\\d|D-\\d|T\\d-";
const EXCLUDE_SEL = '[data-testid="cited-body"]';

/* 🔴 root 를 인자로 받는다 — 투어 걸음의 «판정 대상»은 콜아웃 문면이지 그 뒤에 깔린 화면이 아니다.
   1차 실행에서 전면 스캔이 걸음 4~9 에 빨강 4건을 냈는데, 전부 그 화면에 인용된 **자료**였다
   (`data/replay/**` 실측 · 앱 `.tsx` 매칭 0). 내 판정선이 정본보다 넓었다. */
const scan = (page, screen, root = null) => page.evaluate(({ re, sel, screen, root }) => {
  const rx = new RegExp(re, "g");
  const base = root ? document.querySelector(root) : document.body;
  if (!base) return { screen, nodes: 0, excludedNodes: 0, hits: [], rootMissing: true };
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  const hits = []; let nodes = 0, excludedNodes = 0;
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el) continue;
    if (el.closest("script, style, template, noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    nodes += 1;
    const inExcluded = !!el.closest(sel);
    if (inExcluded) excludedNodes += 1;
    rx.lastIndex = 0;
    const m = t.match(rx);
    if (m) hits.push({ screen, excluded: inExcluded, pat: Array.from(new Set(m)), text: t.slice(0, 110),
                       tid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? null });
  }
  return { screen, nodes, excludedNodes, hits };
}, { re: BANNED, sel: EXCLUDE_SEL, screen, root });

/** 🔴 대조군 — 대상 스캔 «뒤»에 위반 1건을 심고 델타를 센다. 심은 노드는 바로 걷어낸다. */
async function control(page, screen, root = null) {
  const before = (await scan(page, screen, root)).hits.filter((h) => !h.excluded).length;
  await page.evaluate((root) => {
    const d = document.createElement("p");
    d.id = "__t740b_control__";
    d.textContent = "이 문장은 대조군이다. 원장 Q-1 · D-2 · T7- 계약 v0.1 «표기»";
    (root ? document.querySelector(root) : document.body)?.appendChild(d);
  }, root);
  const after = (await scan(page, screen, root)).hits.filter((h) => !h.excluded).length;
  await page.evaluate(() => document.getElementById("__t740b_control__")?.remove());
  return { before, after, delta: after - before, rang: after - before >= 1 };
}

const out = { base: BASE, api: API, at: new Date().toISOString(), axisA: {}, axisB: {}, notMeasured: [] };
const errs = [];

/* ── 문서 id 는 API 가 준다 (손타이핑 0) ──────────────────────────── */
const sres = await fetch(`${API}/api/sessions`, { method: "POST" });
const cookie = (sres.headers.getSetCookie ? sres.headers.getSetCookie() : [sres.headers.get("set-cookie")])
  .filter(Boolean).map((c) => c.split(";")[0]).join("; ");
const { sessionId } = await sres.json();
const sc = await (await fetch(`${API}/api/scenarios`, { headers: { cookie } })).json();
const cmp = await fetch(`${API}/api/retrieval/compare`, {
  method: "POST", headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ sessionId, question: sc[0].questions[0], strategies: ["vector"] }),
});
const cmpBody = await cmp.json();
const docIds = Array.from(new Set((cmpBody[0]?.hits ?? [])
  .map((h) => String(h.evidenceId)).filter((id) => /^DOC-/.test(id)).map((id) => id.split("@")[0])));
out.axisA.docIdSource = { via: "POST /api/retrieval/compare -> hits[].evidenceId", status: cmp.status, docIds };
if (docIds.length === 0) { console.error("EXIT2: API 가 문서 id 를 하나도 주지 않았다 — 지어내지 않는다"); process.exit(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 130)));

/* 입장 — `/` 가 세션을 발급하는 자리다. 쿠키를 기다린 뒤에 움직인다. */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
let sid = null;
for (let i = 0; i < 40 && !sid; i++) { sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid"); if (!sid) await sleep(500); }
if (!sid) { console.error("EXIT2: 세션이 안 열렸다 — 무대가 없다"); await browser.close(); process.exit(2); }
await page.waitForURL(/overview/, { timeout: 30000 }).catch(() => {});
await sleep(SETTLE);

/* ── 축 ⓐ documents ───────────────────────────────────────────── */
/* 🔴 발주문은 「/documents 목록 + 상세 1건」이라 했다. 목록 라우트가 실재하는지부터 «화면에» 묻는다. */
const listRes = await page.goto(BASE + "/documents", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
out.axisA.listRoute = { url: BASE + "/documents", status: listRes ? listRes.status() : null };
await sleep(SETTLE);
if (listRes && listRes.ok()) {
  out.axisA.list = await scan(page, "documents-list");
  out.axisA.listControl = await control(page, "documents-list");
} else {
  out.notMeasured.push(`documents 목록: 라우트 없음(status=${listRes ? listRes.status() : "no response"}) — 화면이 없으므로 «안 잼»이 아니라 «대상 없음»`);
}

const docId = docIds[0];
const detRes = await page.goto(`${BASE}/documents/${encodeURIComponent(docId)}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
out.axisA.detailRoute = { docId, url: `${BASE}/documents/${docId}`, status: detRes ? detRes.status() : null };
await sleep(SETTLE);
if (detRes && detRes.ok()) {
  out.axisA.detail = await scan(page, "documents-detail");
  out.axisA.detailControl = await control(page, "documents-detail");
} else {
  out.notMeasured.push(`documents 상세: ${docId} 미착지(status=${detRes ? detRes.status() : "no response"})`);
}

/* ── 축 ⓑ 투어 전 걸음 ────────────────────────────────────────── */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await sleep(SETTLE);
const invite = page.locator('[data-testid="tour-start"]');
if (!(await invite.count())) {
  out.notMeasured.push("tour: 초대 카드(tour-start)가 없다 — 걸음 0");
} else {
  await invite.first().click().catch(() => {});
  await sleep(1200);
  out.axisB.steps = [];
  /* 🔴 `tour-progress` 는 점(dot) 묶음이라 textContent 가 빈 문자열이다(1차 실행 실측).
     걸음 번호는 콜아웃 문면의 `i/total` 표기에서 읽는다. */
  const progress = async () => page.locator('[data-testid="tour-callout"]').first()
    .textContent().then((t) => ((t || "").match(/(\d+)\s*\/\s*(\d+)/) || [null])[0]).catch(() => null);
  const title = async () => page.locator('[data-testid="tour-title"]').first()
    .textContent().then((t) => (t || "").replace(/\s+/g, " ").trim()).catch(() => null);

  for (let guard = 0; guard < 14; guard++) {
    if (!(await page.locator('[data-testid="tour-callout"]').count())) {
      out.notMeasured.push(`tour: 콜아웃이 사라졌다(진행 ${out.axisB.steps.length}걸음째 뒤)`);
      break;
    }
    const prog = await progress();
    const CALLOUT = '[data-testid="tour-callout"]';
    const s = await scan(page, `tour-${prog ?? "?"}`, CALLOUT);          // 판정 대상 = 콜아웃 문면
    const bg = await scan(page, `tour-bg-${prog ?? "?"}`);               // 참고 열 = 뒤에 깔린 화면
    const rec = { progress: prog, title: await title(), route: new URL(page.url()).pathname,
                  nodes: s.nodes, hitsJudged: s.hits.filter((h) => !h.excluded).length,
                  hits: s.hits.filter((h) => !h.excluded).slice(0, 4),
                  bgNodes: bg.nodes, bgHits: bg.hits.filter((h) => !h.excluded).length,
                  bgHitSample: bg.hits.filter((h) => !h.excluded).slice(0, 4).map((h) => ({ tid: h.tid, text: h.text.slice(0, 60) })) };
    rec.control = await control(page, `tour-${prog ?? "?"}`, CALLOUT);
    out.axisB.steps.push(rec);

    /* 🔴 진행 손잡이 세 갈래를 «전부» 안다 — 앞 그물은 tour-next 하나만 알아 4걸음부터 못 갔다. */
    const goto_ = page.locator('[data-testid="tour-goto"]');
    const await_ = page.locator('[data-testid="tour-await-click"]');
    const next_ = page.locator('[data-testid="tour-next"]');
    if (await goto_.count()) { rec.advancedBy = "link(tour-goto)"; await goto_.first().click().catch(() => {}); await sleep(2200); }
    else if (await await_.count()) {
      rec.advancedBy = "interactive(click target)";
      /* 이 걸음은 «대상을 직접 눌러야» 넘어간다. 스포트라이트가 가린 자리면 좌표로 누른다. */
      const tgt = page.locator('[data-testid="candidate"]').first();
      if (await tgt.count()) { await tgt.click({ timeout: 5000 }).catch(async () => {
        const b = await tgt.boundingBox(); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      }); } else { rec.advancedBy = "interactive(target missing)"; out.notMeasured.push(`tour ${prog}: 클릭 대상 candidate 없음`); }
      await sleep(1800);
    }
    else if (await next_.count()) { rec.advancedBy = "next(tour-next)"; await next_.first().click().catch(() => {}); await sleep(1100); }
    else { rec.advancedBy = null; out.notMeasured.push(`tour ${prog}: 진행 손잡이 3종 모두 없음 — 여기서 멈춘다`); break; }

    if (rec.advancedBy && (await progress()) === prog && (await title()) === rec.title) {
      out.notMeasured.push(`tour ${prog}: 손잡이를 눌렀으나 걸음이 안 바뀌었다 — 여기서 멈춘다`);
      break;
    }
  }
  out.axisB.reached = out.axisB.steps.map((s) => s.progress);
  out.axisB.declaredTotal = out.axisB.steps[0]?.progress?.split("/")?.[1] ?? null;
}

await browser.close();
out.consoleErrors = errs.slice(0, 10);

/* ── 집계 · 그물이 스스로 거부하는 자리 ───────────────────────── */
const screensJudged = [];
if (out.axisA.list) screensJudged.push(["documents-list", out.axisA.list, out.axisA.listControl]);
if (out.axisA.detail) screensJudged.push(["documents-detail", out.axisA.detail, out.axisA.detailControl]);
for (const s of out.axisB.steps ?? []) screensJudged.push([`tour ${s.progress}`, { hits: s.hits, nodes: s.nodes }, s.control]);

out.summary = screensJudged.map(([name, s, c]) => ({
  screen: name, nodes: s.nodes, hitsJudged: (s.hits ?? []).filter((h) => !h.excluded).length,
  controlDelta: c?.delta ?? null,
  verdict: !c?.rang ? "판정력 없음(대조군 침묵)" : ((s.hits ?? []).filter((h) => !h.excluded).length === 0 ? "PASS" : "FAIL"),
}));
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const silent = out.summary.filter((r) => r.verdict.startsWith("판정력"));
if (screensJudged.length === 0) { console.error("REFUSED: 잰 화면이 0 — 이 실행은 아무 말도 하지 않는다"); process.exit(2); }
if (silent.length === screensJudged.length) { console.error("REFUSED: 모든 화면에서 대조군이 침묵 — 그물이 아무것도 못 가른다"); process.exit(2); }
process.exit(out.summary.some((r) => r.verdict === "FAIL") ? 1 : 0);
