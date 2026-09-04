/**
 * 포트폴리오 화면 3장 재캡처(공개면 · 1600 폭 · 다크). 리바이2 43대.
 *
 * 🔴 **Live 를 새로 쓰지 않는다** — 구독 예산은 상류 재생성 뒤 1발용이다. 그래서 조사 «시작» 손잡이는
 *    누르지 않고, 이미 있는 재생본/완주본으로만 들어간다. 새 run 이 생기면 그 회차는 실패로 적는다.
 * 🔴 **조건을 «값»으로 남긴다** — 경고 배너 유무·배지·뷰포트·다크 여부를 캡처마다 찍는다.
 *    「배너 없음」은 눈으로가 아니라 수로 확인한다.
 * 🔴 **손잡이는 화면에서 열거해 고른다.**
 *
 *   node portfolio_shots.mjs --base … --dir <out> [--incident INC-…] [--run STATIC-GS-01]
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const DIR = arg("dir", ".");
const RUN = arg("run", "STATIC-GS-01");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark", deviceScaleFactor: 1 });
let page = await ctx.newPage();
const out = { at: new Date().toISOString(), base: BASE, viewport: "1600x1000", scheme: "dark", shots: [], runsCreated: [] };
page.on("request", (r) => { if (r.method() === "POST" && /\/runs(\?|$)/.test(r.url())) out.runsCreated.push(r.url().slice(0, 80)); });

const state = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const txt = (e) => (e ? (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) : null);
  return {
    url: location.href,
    badge: txt(q('[data-testid="mode-badge"]')),
    mode: q('[data-testid="mode-badge"]')?.getAttribute("data-mode") ?? null,
    banners: Array.from(document.querySelectorAll('[data-testid*="notice"],[role="status"],[role="alert"]')).map((e) => txt(e)).filter(Boolean).slice(0, 4),
    unavailable: document.querySelectorAll("[data-why]").length,
    tourOpen: !!q("[data-tour-placement]"),
    inviteOpen: !!Array.from(document.querySelectorAll("button")).find((b) => /둘러보기 시작/.test(b.textContent || "")),
    synthetic: /synthetic PoC/.test(document.body.innerText || ""),
    timeline: txt(q('[data-testid="run-timeline"]'))?.slice(0, 60) ?? null,
    progress: txt(q('[data-testid="run-progress"]')),
    candidates: document.querySelectorAll('[data-testid^="candidate"]').length,
    evidenceCards: document.querySelectorAll('[data-testid^="evidence-"]').length,
    testids: Array.from(new Set(Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")))).length,
  };
});

const dismissOverlays = async () => {
  for (const name of [/나중에/, /다시 보지 않기/]) {
    const b = page.getByRole("button", { name });
    if (await b.count().then((n) => n > 0).catch(() => false)) { await b.first().click().catch(() => {}); await sleep(700); break; }
  }
  const x = page.locator('[data-testid="intro-card"] button, [data-testid="tour-invite"] button').filter({ hasText: "✕" });
  if (await x.count().then((n) => n > 0).catch(() => false)) { await x.first().click().catch(() => {}); await sleep(500); }
};

const shoot = async (name, note) => {
  const st = await state();
  const path = `${DIR}/${name}`;
  await page.screenshot({ path, fullPage: false });
  out.shots.push({ name, note, state: st });
  return st;
};

/* ① Overview */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
await sleep(4500);
await dismissOverlays();
await sleep(1200);
await shoot("fkt-overview-1600.png", "설비 카드 + 활성 알람");

/* ② 조사 화면 — 🔴 «시작» 손잡이는 누르지 않는다. 재생본 run 으로 직접 간다. */
/* 🔴 재생본이 «묶인» incident 를 쓴다 — overview 링크에서 아무 incident 나 집으면 그 run 의 상황이
   아니라 data-why 가 난다(43대 1차 실패 · manifest.ts:17 · tour-steps.ts:17 로 역확인). */
const inc = arg("incident", "/incidents/INC-2026-014");
out.incidentHref = inc;
if (inc) {
  const url = BASE + inc.split("?")[0] + `?run=${encodeURIComponent(RUN)}`;
  /* 🔴 항해 실패(chrome-error)를 «화면의 답»으로 적지 않는다 — 1차에서 그 빈 화면을 캡처할 뻔했다. */
  /* 🔴 같은 컨텍스트에서 /overview → 재생본으로 항해하면 chrome-error 로 죽는다(3회 재시도 전부 실패).
     같은 URL 을 «새 컨텍스트»로 열면 200·testid 76 이다 — 그러니 이건 대상의 답이 아니라
     내 세션/페이지 상태가 만든 빨강이다(43대 자수). 이 화면은 새 컨텍스트에서 연다. */
  /* 🔴 세션을 «가진 채» 연다 — 새 컨텍스트로 열면 근거 화면이 「세션 없이 열람만」 상태가 되어
     포트폴리오가 아니라 무세션 안내문을 찍는다(43대 1차 산출물이 그랬다).
     1차의 chrome-error 는 컨텍스트 탓이 아니라 «MSYS 가 --incident 인자의 경로를 변환»한 것이었다. */
  const r2 = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  out.navOk = !!r2 && r2.ok();
  await sleep(6000);
  await dismissOverlays();
  await sleep(1000);
  await shoot("fkt-run-replay-1600.png", "REPLAY 완주본");
} else out.shots.push({ name: "fkt-run-replay-1600.png", note: "안 잼 — incident 링크를 화면에서 못 찾음" });

/* ③ 근거 — 화면이 준 링크로만. */
/* 🔴 발주가 요구한 것은 «문서 원문 + sha256 + 색인 신선도 배지» 인데, 그건 kind=doc-chunk 근거에만 있다.
   1차 산출물은 kind=record 를 골라 sha256 이 «—» 이고 배지가 「색인 축 없음(SSOT 직독)」이었다(43대 자수).
   그래서 doc-chunk 꼴(@r{N}#{NNN})을 «먼저» 고르고, 없으면 아무거나 쓰되 그 사실을 값으로 남긴다. */
const evAll = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a[href]"))
    .map((x) => x.getAttribute("href"))
    .filter((h) => h && h.startsWith("/evidence/")),
);
out.evidenceCandidates = evAll.slice(0, 10);
/* 🔴 href 는 «인코딩된 채»로 온다 — doc-chunk id 의 @ 는 %40, # 은 %23 이다.
   원문 글자로만 찾으면 후보가 눈앞에 있는데도 못 고른다(43대 자수: 그래서 kind=record 를 집었다). */
const isDocChunk = (h) => /(@|%40)r\d/i.test(h || "");
const ev = evAll.find(isDocChunk) ?? evAll[0] ?? null;
out.evidencePickedDocChunk = isDocChunk(ev);
out.evidenceHref = ev;
if (ev) {
  await page.goto(BASE + ev, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await dismissOverlays();
  await sleep(800);
  await shoot("fkt-evidence-1600.png", "인용 1건 · 원문 + sha256 + 신선도 배지");
} else out.shots.push({ name: "fkt-evidence-1600.png", note: "안 잼 — evidence 링크를 화면에서 못 찾음" });

await browser.close();
console.log(JSON.stringify(out, null, 1));
