/**
 * T4-1 ④ — **CSP 무해성 전 동선** (검증 좌석 · 13대).
 *
 * 🔴 무엇을 재는가: 「CSP 가 붙어 있다」가 아니라 **「붙은 CSP 가 이 앱을 조용히 깨지 않는가」**다.
 *    헤더 실재는 curl 한 줄이면 끝난다. 어려운 것은 **조용한 차단**이다 — 막힌 리소스는 화면에서
 *    「없는 기능」과 구별되지 않고, 스펙도 그것을 지나친다(막힌 폰트·막힌 이미지·막힌 fetch).
 *
 * 🔴 그래서 «자극 실재»부터 센다. 방문 0·클릭 0·WS 0 이면 위반 0 은 아무 뜻이 없다 —
 *    표지가 0 건이면 어느 색도 내지 않는다(9대 유언). 아래 `stim` 이 그 계수기다.
 *
 * 수집 3층(하나로 안 잡힌다):
 *   ⓐ `securitypolicyviolation` DOM 이벤트  — 브라우저가 «위반»이라 부른 것 전건
 *   ⓑ 콘솔 `Refused to …`                  — DOM 이벤트가 안 나는 자리(일부 인라인)까지
 *   ⓒ `requestfailed`                      — 차단이 네트워크 실패로만 보이는 자리
 *
 * exit: 0 = 위반 0 · 1 = 위반 있음 · 2 = 측정 불가(자극 부족 — 판정 아님)
 */
import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3151";
const SCENARIO = process.env.FKT_SCENARIO ?? "GS-01";

const cspEvents = [];   // ⓐ
const refused = [];     // ⓑ
const reqFailed = [];   // ⓒ
const stim = { visits: 0, clicks: 0, sockets: 0, frames: 0, runs: 0, responses: 0 };

const INIT = `
  document.addEventListener('securitypolicyviolation', (e) => {
    (window.__csp = window.__csp || []).push({
      directive: e.violatedDirective, blocked: e.blockedURI || '(inline)',
      doc: e.documentURI, line: e.lineNumber, sample: (e.sample || '').slice(0, 80),
    });
  });
`;

async function drain(page, where) {
  const found = await page.evaluate(() => {
    const v = window.__csp || []; window.__csp = []; return v;
  }).catch(() => []);
  for (const v of found) cspEvents.push({ where, ...v });
}

async function visit(page, path) {
  stim.visits += 1;
  await page.goto(WEB + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await drain(page, path);
  return page.url();
}

async function click(page, testid, where) {
  const el = page.getByTestId(testid).first();
  if (await el.count() === 0) return false;
  if (!(await el.isVisible().catch(() => false))) return false;
  await el.click({ timeout: 5000 }).catch(() => {});
  stim.clicks += 1;
  await page.waitForTimeout(800);
  await drain(page, `${where}#${testid}`);
  return true;
}

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();

  page.on("console", (m) => {
    const t = m.text();
    if (/Refused to |Content Security Policy/i.test(t)) refused.push({ url: page.url(), text: t.slice(0, 240) });
  });
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    // 🔴 사용자가 «취소»한 요청(ERR_ABORTED)은 차단이 아니다 — 섞으면 위반을 지어내게 된다.
    if (/ABORTED/i.test(f)) return;
    reqFailed.push({ url: r.url().slice(0, 160), why: f });
  });
  page.on("websocket", (ws) => {
    stim.sockets += 1;
    ws.on("framereceived", () => (stim.frames += 1));
  });
  page.on("response", () => (stim.responses += 1));

  // ── ① 입장 (/ → 가드 → /overview)
  const landed = await visit(page, "/");
  console.log(`  입장      /  →  ${landed}`);

  // ── ② overview 상호작용
  for (const id of ["intro-card", "alarm-dock", "kpi-strip", "evidence-strip"]) {
    await click(page, id, "/overview");
  }

  // ── ③ live 완주 — 브라우저 자신이 계약 경로로 부른다(쿠키·가드 그대로 지난다)
  const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
  let runId = null;
  if (sid) {
    const started = await page.evaluate(async ({ scenario, sid }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mode: "live" }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, { scenario: SCENARIO, sid });
    runId = started.body?.runId ?? started.body?.id ?? null;
    if (runId) stim.runs += 1;
    console.log(`  조사 시작 POST /api/scenarios/${SCENARIO}/runs → ${started.status} · runId=${runId ?? "(없음)"}`);
  } else {
    console.log("  🔴 fkt_sid 없음 — 입장이 안 끝났다");
  }

  // 실행 화면에서 WS 를 «실제로» 열게 한다
  if (runId) {
    await visit(page, `/incidents/INC-2025-019?run=${encodeURIComponent(runId)}`);
    await page.waitForTimeout(6000);           // 이벤트가 흐를 시간
    await drain(page, "run-screen");
    const st = await page.getByTestId("run-status").first().textContent().catch(() => null);
    console.log(`  실행 화면 run-status = ${JSON.stringify(st)} · WS ${stim.sockets}본 · 프레임 ${stim.frames}건`);
  }

  // ── ④ compare
  await visit(page, "/compare");
  await click(page, "compare-controls", "/compare");
  const cmpBtn = page.getByRole("button", { name: /비교|실행|compare/i }).first();
  if (await cmpBtn.count() > 0 && await cmpBtn.isVisible().catch(() => false)) {
    await cmpBtn.click({ timeout: 8000 }).catch(() => {});
    stim.clicks += 1;
    await page.waitForTimeout(9000);
    await drain(page, "/compare#run");
  }
  const cols = await page.getByTestId("compare-column").count().catch(() => 0);
  console.log(`  compare   전략 열 ${cols}개`);

  // ── ⑤ evidence 모달 · ⑥ WO
  await visit(page, "/evidence/EV-2025-001");
  await visit(page, "/evidence/EV-2025-001?run=RUN-1&tab=graph");
  await visit(page, "/work-orders/WO-2025-001");
  await visit(page, "/overview");

  await drain(page, "final");

  // ── 🔴 자기 검증 — «심사기가 우는가». 이 절이 없으면 위의 0 은 「위반이 없다」와
  //    「내 눈이 감겨 있다」를 구별하지 못한다. 일부러 두 절을 어겨 보고, 잡히는지 센다.
  //    여기서 난 위반은 판정에 «섞지 않는다»(별 배열).
  //  🔴 자기 검증이 «판정에 섞이지 않게» 여기서 동선분 계수를 잠근다. ⓐ 는 배열이 갈리지만
  //     ⓑⓒ 는 page 리스너라 자기 검증분까지 계속 쌓인다 — 첫 실행에서 실제로 섞였다.
  const walkRefused = refused.length;
  const walkReqFailed = reqFailed.length;
  const selfcheck = [];
  await page.evaluate(() => { window.__csp = []; });
  await page.evaluate(() => {
    const img = document.createElement("img");     // img-src 'self' data: 위반
    img.src = "http://127.0.0.1:9/blocked-by-csp.png";
    document.body.appendChild(img);
    fetch("http://127.0.0.1:9/blocked-by-csp").catch(() => {});   // connect-src 'self' 위반
  });
  await page.waitForTimeout(1500);
  const caught = await page.evaluate(() => { const v = window.__csp || []; window.__csp = []; return v; }).catch(() => []);
  for (const c of caught) selfcheck.push(c);

  await browser.close();

  // ── 판정
  console.log("\n== 자극 계수기(0 이면 위반 0 은 아무 뜻이 없다)");
  console.log(`   방문 ${stim.visits} · 클릭 ${stim.clicks} · 응답 ${stim.responses} · WS ${stim.sockets}본/${stim.frames}프레임 · run ${stim.runs}건`);

  const enough = stim.visits >= 6 && stim.responses >= 20 && stim.clicks >= 1;

  console.log("\n== 자기 검증 — 일부러 어긴 2절(img-src · connect-src)을 잡았나");
  const dirs = new Set(selfcheck.map((c) => (c.directive || "").split(" ")[0]));
  for (const c of selfcheck) console.log(`   잡힘  ${c.directive}  ← ${c.blocked}`);
  const blind = !(dirs.has("img-src") && dirs.has("connect-src"));
  if (blind) console.log(`   🔴 심사기가 울지 않았다 — 잡은 절 ${[...dirs].join(",") || "(없음)"} · 아래 0 을 믿으면 안 된다`);

  console.log("\n== CSP 위반(ⓐ DOM 이벤트)      :", cspEvents.length);
  for (const v of cspEvents) console.log(`   🔴 ${v.where}  ${v.directive}  ← ${v.blocked}  ${v.sample}`);
  console.log("== 콘솔 Refused(ⓑ)             :", walkRefused);
  for (const r of refused.slice(0, walkRefused)) console.log(`   🔴 ${r.text}`);
  console.log("== 네트워크 실패(ⓒ · ABORTED 제외):", walkReqFailed);
  for (const r of reqFailed.slice(0, walkReqFailed)) console.log(`   ?  ${r.why}  ${r.url}`);

  if (!enough) { console.log("\n결과: 측정 불가 — 자극이 모자란다(exit 2)"); process.exit(2); }
  if (blind) { console.log("\n결과: 측정 불가 — 심사기가 위반을 못 본다(exit 2)"); process.exit(2); }
  const bad = cspEvents.length + walkRefused;
  console.log(bad === 0 ? "\n결과: CSP 위반 0 · 조용한 차단 0" : `\n결과: 위반 ${bad}건`);
  process.exit(bad === 0 ? 0 : 1);
};

main().catch((e) => { console.error("측정 사고:", e); process.exit(2); });
