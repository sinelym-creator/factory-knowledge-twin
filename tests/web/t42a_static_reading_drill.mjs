/**
 * T4-2a ①·⑦ 잔여 — 정적 경로의 «열람»과 «Live 전용 안내» (14대).
 *
 * 🔴 「막힌 자리는 막힌 채로」가 이 축의 핵심이다. 굳히기가 404 로 받은 6건(그래프 경로 근거 5 +
 *    WO 1)을 정적 사본이 «성공»으로 바꿔 놓으면, 화면은 서버가 못 준 것을 준 척하게 된다.
 *    그래서 열리는 것과 안 열리는 것을 **둘 다 세어** 매니페스트와 맞댄다.
 *
 * 🔴 세는 눈 자기 검증: 「404 유지」를 세기 전에 «열리는» 근거를 먼저 세어 눈이 사는지 본다.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OFF = process.env.FKT_WEB_OFF ?? "http://127.0.0.1:3181";
const STATIC = `/incidents/INC-2026-014?run=STATIC-GS-01`;
const RUNQ = "?run=STATIC-GS-01";   // 🔴 정적 열람은 이 «꼬리표»가 있어야 정적 사본을 본다(page.tsx isStaticRun)
const MAN = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "data", "replay", "static", "manifest.json"), "utf8"),
);

let failures = 0;
const ok = (n, p, d) => {
  if (!p) failures += 1;
  console.log(`  ${p ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
};

const idFromPath = (p) => decodeURIComponent(p.split("/").pop());
const declaredEvidence = MAN.files.filter((f) => f.route.includes("/evidence/")).map((f) => idFromPath(f.path));
const declaredDocs = MAN.files.filter((f) => f.route.includes("/documents/")).length;
const blockedEvidence = MAN.skipped.filter((s) => s.route.includes("/evidence/")).map((s) => idFromPath(s.path));

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const api = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) api.push(`${r.method()} ${u.pathname}`);
  });

  await page.goto(OFF + STATIC, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByTestId("run-console").waitFor({ state: "visible", timeout: 60000 });

  console.log(`\n매니페스트: 굳힘 evidence ${declaredEvidence.length} · document ${declaredDocs} · 막힌 evidence ${blockedEvidence.length}`);

  // ── 열람: 굳혀 둔 근거는 «열린다» ─────────────────────────────────────────
  const openable = declaredEvidence.slice(0, 3);
  let opened = 0;
  for (const id of openable) {
    await page.goto(`${OFF}/evidence/${encodeURIComponent(id)}${RUNQ}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const unavailable = await page.getByTestId("screen-unavailable").count();
    if (unavailable === 0) opened += 1;
    else console.log(`     열리지 않음: ${id}`);
  }
  ok("🔴 세는 눈 자기 검증 — 굳힌 근거는 실제로 «열린다»", opened === openable.length,
     `${opened}/${openable.length}`);

  // ── 막힌 자리: 굳히기가 404 로 받은 것은 «404 인 채로» ─────────────────────
  let stillBlocked = 0;
  for (const id of blockedEvidence) {
    await page.goto(`${OFF}/evidence/${encodeURIComponent(id)}${RUNQ}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const box = page.getByTestId("screen-unavailable");
    if ((await box.count()) > 0) stillBlocked += 1;
    else console.log(`     🔴 막혔어야 하는데 열린다: ${id}`);
  }
  ok(`그래프 경로 근거 ${blockedEvidence.length}건 = «막힌 채로»(없는 것을 있다고 하지 않는다)`,
     stillBlocked === blockedEvidence.length, `${stillBlocked}/${blockedEvidence.length}`);

  // ── 문서 열람 ─────────────────────────────────────────────────────────────
  await page.goto(OFF + STATIC, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByTestId("run-console").waitFor({ state: "visible", timeout: 60000 });
  /* 🔴 카드 «자신»은 링크가 아니다 — 링크는 카드 «안»에 있다(run-panels.tsx). 첫 판에 카드
     엘리먼트의 href 와 `closest("a")` 를 봤다가 「링크 아님」 19건으로 위양성 FAIL 을 냈다. */
  const hrefs = await page.locator("[data-testid=evidence-card] a[href]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")),
  );
  console.log(`     근거 카드 href 예: ${hrefs.slice(0, 2).join(" · ")}`);
  ok("🔴 근거 카드가 정적 꼬리표(`?run=`)를 달고 간다 — 방문자가 실제로 걷는 길",
     hrefs.length > 0 && hrefs.every((h) => h.includes("run=STATIC-GS-01")),
     `${hrefs.filter((h) => h.includes("run=STATIC-GS-01")).length}/${hrefs.length}`);
  const docCard = page.getByTestId("evidence-card").filter({ hasText: "DOC-" }).first();
  const hasDoc = (await docCard.count()) > 0;
  if (hasDoc) {
    await docCard.click();
    await page.waitForURL(/\/evidence\//, { timeout: 20000 }).catch(() => {});
    const openedDoc = (await page.getByTestId("screen-unavailable").count()) === 0;
    ok("근거 카드 클릭 → 문서 계열 근거가 열린다", openedDoc, page.url().split("/").pop());
  } else {
    ok("근거 카드 클릭 → 문서 계열 근거가 열린다", false, "문서 계열 카드를 못 찾았다");
  }

  // ── ⑦ 추세 창 · 조사 시작 ─────────────────────────────────────────────────
  await page.goto(OFF + STATIC, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByTestId("run-console").waitFor({ state: "visible", timeout: 60000 });
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const trendBtns = await page.locator("[data-testid=sensor-trend] button").allInnerTexts().catch(() => []);
  console.log(`     추세 창 버튼: ${JSON.stringify(trendBtns)}`);
  const other = trendBtns.findIndex((t) => /3w|3주/.test(t));
  if (other >= 0) {
    await page.locator("[data-testid=sensor-trend] button").nth(other).click();
    await page.waitForTimeout(800);
    const after = (await page.getByTestId("sensor-trend").innerText()).replace(/\s+/g, " ");
    ok("굳히지 않은 추세 창 = 「Live 전용」이라 말한다(빈 그래프 0)", /Live 전용/.test(after),
       after.slice(0, 120));
  } else {
    ok("굳히지 않은 추세 창 = 「Live 전용」이라 말한다", false, "다른 창 버튼을 못 찾았다");
  }

  ok("조사 시작 진입로가 정적 화면에 «열린 채로» 있지 않다",
     (await page.getByTestId("start-from-alarm").count()) === 0 &&
       (await page.getByTestId("start-from-headline").count()) === 0);
  ok("조용한 실패 0 — 「Live 전용」 안내가 화면에 실재", /Live 전용/.test(body));

  const kinds = [...new Set(api)];
  ok("🔴 열람까지 마쳐도 /api 호출은 live/status 1종뿐",
     kinds.length === 1 && kinds[0] === "GET /api/live/status", kinds.join(" · ") || "(0건)");
  console.log(`     /api 총 ${api.length}건 · 종류 ${kinds.length}`);

  await browser.close();
  console.log(`\n결과: 어긋남 ${failures}건`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error("측정 사고:", e);
  process.exit(2);
});
