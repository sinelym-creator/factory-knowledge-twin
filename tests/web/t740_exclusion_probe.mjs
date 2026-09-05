/**
 * O-31 — 문체 그물의 «제외»를 자료 본문까지 넓히되, 검출력을 팔지 않았음을 같은 실행에서 증명한다.
 * 리바이2 50대.
 *
 * ## 왜 셀렉터만으로는 안 되는가 (실측이 결정했다)
 *
 * #756 참고 열 6건의 조상 체인을 실제로 읽었더니 두 자리였다:
 *   `candidate-rationale` (아래 13노드 중 히트 1)  ·  `evidence-card` (아래 96노드 중 히트 5)
 * 🔴 그런데 그 조상 «아래»에는 **앱 문안이 함께 산다** — `evidence-card` 안의 「근거 보기」(버튼),
 *    `candidate-rationale` 안의 「인용」(칩) 등 비히트 노드가 각각 91·12개다.
 *    조상째 제외하면 **그 문면들의 위반을 영영 못 본다** — 제외는 삭제가 아니라 표시여야 한다.
 *
 * ## 그래서 제외는 «두 조건의 곱»이다
 *
 *   (1) 자리   — 노드가 인용 자료가 그려지는 조상 안에 있다(`EXCLUDE_ANCESTORS`)
 *   (2) 출처   — 그 문면이 **자료 말뭉치에 실재한다**(`data/replay/*.jsonl` · `data/replay/static/*.json`)
 *
 * 둘 다일 때만 제외한다. 자리에만 맞고 출처가 없으면 **그것은 앱이 쓴 문장**이라 계속 판정한다.
 * 🔴 이 곱이 「제외를 넓히면 검출력을 판다」를 막는 유일한 이유다.
 *
 * ## 같은 실행에서 서야 하는 열
 *
 *   ⓐ 확장 뒤 조사 화면 전면 스캔          → 6 → 0        (자료가 더는 위반으로 안 잡힌다)
 *   ⓑ 앱 문안 자리에 위반 주입             → ≥1 울림      (검출력 안 팔았다)
 *   ⓒ 제외 조상 «안»에 «자료 문면» 주입     → 0            (제외가 실제로 든다 — 「원래 0」과 구별)
 *   ⓒ' 제외 조상 «안»에 «앱 문안» 주입      → ≥1 울림      (조상이 통째 눈감개가 아니다)
 *
 * ⓑ 또는 ⓒ 가 안 서면 확장은 **되돌린다**. 실패도 산출이다.
 *
 *   node t740_exclusion_probe.mjs --base http://127.0.0.1:8831 --repo <repoRoot> --out <json>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8831").replace(/\/$/, "");
const REPO = arg("repo", path.resolve(process.cwd(), "../.."));
const RUN = arg("run", "/incidents/INC-2026-014?run=STATIC-GS-01");
const OUT = arg("out", "");
const SETTLE = Number(arg("settle", "4000"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 판정선은 §1 그물에서 그대로. 넓히지도 좁히지도 않는다. */
const BANNED = "이다\\.|한다\\.|둔다\\.|없다\\.|아니다\\.|«|»|계약 v0\\.|원장|Q-\\d|D-\\d|T\\d-";
/* 앞판(43대)의 제외 = 이것 하나. 아래 두 자리를 «출처 조건과 곱해서» 더한다. */
const EXCLUDE_ANCESTORS = ['[data-testid="cited-body"]', '[data-testid="evidence-card"]', '[data-testid="candidate-rationale"]'];

/* ── 자료 말뭉치 — 화면이 «그대로 그리는» 원본만 모은다 ─────────────── */
const corpusDir = path.join(REPO, "data", "replay");
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const f = path.join(d, e.name);
  if (e.isDirectory()) walk(f); else if (/\.(jsonl|json)$/.test(e.name)) files.push(f); } };
walk(corpusDir);
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
let corpus = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
/* JSON 이스케이프(\n·\")를 풀어야 화면 문면과 같은 모양이 된다. */
corpus = norm(corpus.replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
if (corpus.length < 1000) { console.error("EXIT2: 자료 말뭉치가 사실상 비었다 — 이 상태의 «제외 0»은 판정이 아니다"); process.exit(2); }

const out = { base: BASE, at: new Date().toISOString(), corpus: { files: files.length, chars: corpus.length },
              excludeAncestors: EXCLUDE_ANCESTORS, columns: {} };

/** 한 번 훑는다. 제외는 «자리 ∧ 출처». */
const scan = (page, corpusText) => page.evaluate(({ re, ancs, corpus }) => {
  const rx = new RegExp(re, "g");
  const n_ = (s) => String(s).replace(/\s+/g, " ").trim();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const judged = [], excluded = []; let nodes = 0; let n;
  while ((n = walker.nextNode())) {
    const t = n_(n.textContent || ""); if (!t) continue;
    const el = n.parentElement; if (!el) continue;
    if (el.closest("script, style, template, noscript")) continue;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
    nodes += 1;
    rx.lastIndex = 0;
    if (!t.match(rx)) continue;
    const inPlace = ancs.some((a) => el.closest(a));
    /* 출처 조건 — 짧은 문면은 우연 일치가 나므로 24자 이상만 말뭉치 대조에 건다. */
    const fromSource = t.length >= 24 && corpus.includes(t);
    const rec = { text: t.slice(0, 90), tid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? null, inPlace, fromSource };
    if (inPlace && fromSource) excluded.push(rec); else judged.push(rec);
  }
  return { nodes, judged, excluded };
}, { re: BANNED, ancs: EXCLUDE_ANCESTORS, corpus: corpusText });

/** 주입 — 어디에·무슨 문면을. 심고 재고 걷어낸다. */
async function inject(page, where, text, corpusText, label) {
  const before = (await scan(page, corpusText)).judged.length;
  const planted = await page.evaluate(({ where, text }) => {
    const host = where ? document.querySelector(where) : document.body;
    if (!host) return false;
    const d = document.createElement("p"); d.id = "__o31__"; d.textContent = text; host.appendChild(d); return true;
  }, { where, text });
  if (!planted) { return { label, planted: false, note: `주입 자리 없음: ${where}` }; }
  const after = (await scan(page, corpusText)).judged.length;
  await page.evaluate(() => document.getElementById("__o31__")?.remove());
  return { label, planted: true, where: where ?? "body", before, after, delta: after - before };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 0; i < 40; i++) { if ((await ctx.cookies()).find((c) => c.name === "fkt_sid")) break; await sleep(500); }
await page.goto(BASE + RUN, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(SETTLE);

/* ⓐ — 확장 뒤 전면 스캔 */
const a = await scan(page, corpus);
out.columns.a = { nodes: a.nodes, judged: a.judged.length, excluded: a.excluded.length,
                  judgedSample: a.judged.slice(0, 6), excludedSample: a.excluded.slice(0, 6).map((e) => ({ tid: e.tid, text: e.text.slice(0, 60) })) };

/* 자료 문면 하나를 «화면에서» 집어 온다 — 지어내지 않는다. */
const sourceText = a.excluded[0]?.text ?? null;
if (!sourceText) { out.columns.note = "제외된 노드가 0 — ⓒ 를 세울 «자료 문면»을 화면에서 얻지 못했다"; }

/* ⓑ — 앱 문안 자리(제외 조상 밖)에 위반 주입 */
out.columns.b = await inject(page, '[data-testid="run-console"]', "이 문장은 대조군이다. 원장 Q-1 · D-2 · T7- 계약 v0.1 «표기»", corpus, "ⓑ 앱 문안 자리 주입");

/* ⓒ — 제외 조상 «안»에 «자료 문면» 주입 → 0 이어야 제외가 실제로 든다 */
out.columns.c = sourceText
  ? await inject(page, '[data-testid="evidence-card"]', sourceText, corpus, "ⓒ 제외 조상 안 + 자료 문면")
  : { label: "ⓒ", planted: false, note: "자료 문면 없음" };

/* ⓒ' — 제외 조상 «안»에 «앱 문안»(말뭉치에 없는 글) 주입 → 울려야 조상이 눈감개가 아니다 */
out.columns.cPrime = await inject(page, '[data-testid="evidence-card"]',
  "이 줄은 자료가 아니라 새로 쓴 문장이다. 원장 D-9 · 계약 v0.1 «표기»", corpus, "ⓒ' 제외 조상 안 + 앱 문안");

await browser.close();

/* ── 판정 ─────────────────────────────────────────────── */
const v = {
  a_zero: out.columns.a.judged === 0,
  a_excludedFound: out.columns.a.excluded > 0,
  b_rang: (out.columns.b.delta ?? 0) >= 1,
  c_silent: out.columns.c.planted === true && out.columns.c.delta === 0,
  cPrime_rang: (out.columns.cPrime.delta ?? 0) >= 1,
};
out.verdict = v;
out.conclusion =
  !v.b_rang ? "REVERT — 앱 문안 주입이 안 울린다(검출력을 팔았다)"
  : !v.c_silent ? "REVERT — 제외 영역 안 자료 문면이 여전히 잡힌다(제외가 안 든다 · ⓐ 의 0 은 「원래 0」과 구별 불가)"
  : !v.cPrime_rang ? "REVERT — 제외 조상이 통째 눈감개다(그 안의 새 위반도 안 잡힌다)"
  : !v.a_excludedFound ? "판정력 없음 — 제외된 노드가 0 이라 확장이 무엇을 했는지 말할 수 없다"
  : v.a_zero ? "KEEP — 6→0 · 검출력 유지(ⓑ·ⓒ'울림 · ⓒ침묵)"
  : "확장은 유효하나 잔여 위반 있음 — judged 목록을 보라";

console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
process.exit(out.conclusion.startsWith("KEEP") ? 0 : 1);
