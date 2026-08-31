/**
 * T4-2a 독립 검증 — 조각 2 (② 네트워크 · ③ 쿠키 · ⑦ Live 전용 · ④(ii) 동형) · 14대.
 *
 * 🔴 ②의 「그 외 1건이라도 있으면 빨강」은 **부정 판정식**이다. 세는 눈이 죽어도 0이 나온다.
 *    그래서 «있어야 하는» 호출(`GET /api/live/status` polling)을 먼저 세어 눈이 살아 있음을
 *    증명하고, 그 눈으로 나머지 0을 센다.
 *
 * 🔴 ④(ii) 동형은 «같은 축»으로 정규화해 비교한다 — runId 는 빼고 mode 는 넣는다.
 *    서로 다른 두 경로가 같은 fixture 에서 같은 최종 상태에 닿는가가 이 축의 물음이다.
 *
 *   FKT_WEB_OFF=http://127.0.0.1:3181 FKT_WEB_LIVE=http://127.0.0.1:3161 \
 *     node t42a_static_replay_drill2.mjs
 */
import { chromium } from "@playwright/test";

const OFF = process.env.FKT_WEB_OFF ?? "http://127.0.0.1:3181";
const LIVE = process.env.FKT_WEB_LIVE ?? "http://127.0.0.1:3161";
const STATIC_RUN = "STATIC-GS-01";
const INCIDENT = "INC-2026-014";

let failures = 0;
const ok = (name, pass, detail) => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

/** 화면이 그린 최종 RunState 의 «관측 가능한 투영». runId 는 뺀다(축이 다르다). */
const projectRunState = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const cur = document.querySelector("[data-testid=replay-cursor]");
    const txt = (s) => (document.querySelector(s)?.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      status: document.querySelector("[data-testid=run-console]")?.getAttribute("data-status"),
      mode: document.querySelector("[data-testid=run-mode-badge]")?.getAttribute("data-mode"),
      applied: cur?.getAttribute("data-applied"),
      total: cur?.getAttribute("data-total"),
      steps: q("[data-testid=run-step]"),
      evidence: q("[data-testid=evidence-card]"),
      candidates: q("[data-testid=candidate]"),
      ttae: document.querySelector("[data-testid=ttae-row]")?.getAttribute("data-elapsed-ms"),
      question: txt("[data-testid=run-question]"),
      candidateText: [...document.querySelectorAll("[data-testid=candidate]")].map((e) =>
        (e.textContent ?? "").replace(/\s+/g, " ").trim(),
      ),
      evidenceIds: [...document.querySelectorAll("[data-testid=evidence-card]")]
        .map((e) => (e.getAttribute("data-evidence-id") ?? e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40))
        .sort(),
    };
  });

const main = async () => {
  const browser = await chromium.launch();
  const vp = { viewport: { width: 1440, height: 900 } };

  // ── ② 네트워크 축 ─────────────────────────────────────────────────────────
  console.log("\n② 네트워크 축 — 정적 경로가 부르는 것 전수");
  const ctx = await browser.newContext(vp);
  const page = await ctx.newPage();

  const api = [];
  const chunks = [];
  const carriedRunId = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) api.push(`${r.method()} ${u.pathname}`);
    if (/\.js(\?|$)/.test(u.pathname)) chunks.push(u.pathname);
    const post = r.postData() ?? "";
    if (u.href.includes(STATIC_RUN) || post.includes(STATIC_RUN)) {
      if (u.pathname.startsWith("/api/")) carriedRunId.push(`${r.method()} ${u.pathname}`);
    }
  });

  await page.goto(OFF + "/", { waitUntil: "commit", timeout: 60000 });
  await page.getByTestId("static-replay-offer").waitFor({ state: "visible", timeout: 45000 });
  const chunksBefore = new Set(chunks);
  const apiBefore = api.length;

  await page.getByTestId("static-replay-offer").click();
  await page.waitForURL(/\/incidents\//, { timeout: 30000 });
  await page.getByTestId("run-console").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(3000);

  const chunksAfter = chunks.filter((c) => !chunksBefore.has(c));
  const kinds = [...new Set(api)];
  ok("🔴 세는 눈이 살아 있다 — live/status polling 을 실제로 센다", api.length > 0,
     `/api 총 ${api.length}건`);
  ok("정적 경로의 /api 호출 = live/status 1종 «뿐»",
     kinds.length === 1 && kinds[0] === "GET /api/live/status", kinds.join(" · ") || "(0건)");
  ok("🔴 정적 runId 를 서버로 보내지 않는다", carriedRunId.length === 0,
     carriedRunId.join(" · ") || "0건");
  ok("첫 화면 청크에 정적 자산 0 · 진입 «후»에 실린다", chunksAfter.length >= 1,
     `진입 후 새 청크 ${chunksAfter.length}건: ${chunksAfter.slice(0, 3).join(" · ")}`);

  // ── ③ 쿠키 축 (정적 부분) ─────────────────────────────────────────────────
  console.log("\n③ 쿠키 축 — 정적 진입 후 서버 세션 쿠키가 «생기지 않는다»");
  const cookies = await ctx.cookies();
  const names = cookies.map((c) => c.name);
  ok("`fkt_session` 0건", !names.includes("fkt_session"), names.join(" · ") || "(쿠키 0건)");
  ok("`fkt_sid` 0건", !names.includes("fkt_sid"), names.join(" · ") || "(쿠키 0건)");
  console.log(`     이 브라우저가 쥔 쿠키: ${names.length ? names.join(" · ") : "(없음)"}`);
  const storage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      out[k] = String(localStorage.getItem(k)).slice(0, 60);
    }
    return out;
  });
  console.log(`     방문자 상태(localStorage): ${JSON.stringify(storage)}`);
  ok("방문자 상태는 browser storage 에 있다(§14.1)", Object.keys(storage).length > 0,
     `${Object.keys(storage).length}키`);

  // ── ⑦ Live 전용 안내 ──────────────────────────────────────────────────────
  console.log("\n⑦ Live 전용 안내 — 조용한 실패 0");
  const liveOnly = await page.evaluate(() => ({
    wo: !!document.querySelector("[data-testid=work-order-draft-live-only]"),
    woLink: !!document.querySelector("[data-testid=work-order-draft]"),
    compare: !!document.querySelector("[data-testid=to-compare-live-only]"),
    compareLink: !!document.querySelector("[data-testid=to-compare]"),
    text: (document.body.innerText || "").replace(/\s+/g, " "),
  }));
  ok("WO = Live 전용 표기 · 열리는 링크 0", liveOnly.wo && !liveOnly.woLink);
  ok("전략 비교 = Live 전용 표기 · 열리는 링크 0", liveOnly.compare && !liveOnly.compareLink);
  ok("「Live 전용」 낱말이 화면에 실재", /Live 전용/.test(liveOnly.text));

  // 추세 창 — 굳히지 않은 창은 「Live 전용」이라 말한다
  const windows = await page.getByTestId("sensor-trend").count();
  console.log(`     sensor-trend 존재: ${windows}`);

  const offState = await projectRunState(page);
  console.log(`     정적 최종 RunState: ${JSON.stringify({ ...offState, evidenceIds: `${offState.evidenceIds.length}건` })}`);
  await ctx.close();

  // ── ④(ii) 동형 — 서버 replay vs 정적 ──────────────────────────────────────
  console.log("\n④(ii) 동형 — 서버 replay 최종 RunState 와 맞댄다 (승계 회부 1건)");
  const lctx = await browser.newContext(vp);
  const lpage = await lctx.newPage();
  await lpage.goto(LIVE + "/", { waitUntil: "commit", timeout: 60000 });
  await lpage.waitForURL(/\/overview$/, { timeout: 60000 });
  const sid = (await lctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) {
    console.error("🔴 LIVE 셸에서 fkt_sid 를 못 얻었다 — 동형 축 측정 불가");
    await browser.close();
    process.exit(2);
  }
  const runId = await lpage.evaluate(async (sid) => {
    const res = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sid, mode: "replay" }),
    });
    if (!res.ok) throw new Error(`서버 replay 생성 ${res.status}`);
    return (await res.json()).runId;
  }, sid);
  await lpage.goto(`${LIVE}/incidents/${INCIDENT}?run=${encodeURIComponent(runId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await lpage.getByTestId("run-console").waitFor({ state: "visible", timeout: 60000 });
  await lpage.waitForFunction(
    () => document.querySelector("[data-testid=run-console]")?.getAttribute("data-status") === "completed",
    null,
    { timeout: 180000 },
  ).catch(() => {});
  await lpage.waitForTimeout(2000);
  const srvState = await projectRunState(lpage);
  console.log(`     서버 replay 최종 RunState: ${JSON.stringify({ ...srvState, evidenceIds: `${srvState.evidenceIds.length}건` })}`);

  const axes = ["status", "mode", "applied", "total", "steps", "evidence", "candidates", "ttae", "question"];
  const diffs = axes.filter((k) => String(offState[k]) !== String(srvState[k]));
  ok("🔴 최종 RunState 동형 (runId 제외 · mode 포함)", diffs.length === 0,
     diffs.length ? diffs.map((k) => `${k}: 정적 ${offState[k]} vs 서버 ${srvState[k]}`).join(" | ") : `${axes.length}축 일치`);
  const sameCandidates = JSON.stringify(offState.candidateText) === JSON.stringify(srvState.candidateText);
  ok("후보 문면 동형", sameCandidates,
     sameCandidates ? "일치" : `정적 ${JSON.stringify(offState.candidateText)} vs 서버 ${JSON.stringify(srvState.candidateText)}`);
  const sameEvidence = JSON.stringify(offState.evidenceIds) === JSON.stringify(srvState.evidenceIds);
  ok("근거 목록 동형", sameEvidence, sameEvidence ? `${offState.evidenceIds.length}건 일치` : "갈림");

  await lctx.close();
  await browser.close();
  console.log(`\n결과: 어긋남 ${failures}건`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error("측정 사고:", e);
  process.exit(2);
});
