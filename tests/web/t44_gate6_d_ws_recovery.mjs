/**
 * Gate 6 ⓓ 「WebSocket 중단」 — 재연결·상태 재조회 (T4-4 · 검증 좌석 19대).
 *
 * 정본 §32.7: WebSocket 중단 = 「재연결 또는 상태 재조회」. 골격 §1.1 이 red 를 이렇게 못 박았다 —
 * 「끊겼다」가 아니라 **끊긴 뒤 무엇을 하는가**가 red 다. 그래서 이 그물은 «끊김»을 세지 않고
 * 끊긴 «뒤» 나가는 것을 센다: 재연결 시도(WS 재개통)와 상태 재조회(`/api/runs/{id}`·`/events`).
 *
 * 🔴 대조군이 이 그물의 절반이다. 비정상 종료만 재면 「아무 때나 다시 부른다」와
 *    「끊겨서 다시 부른다」가 같은 초록을 낸다. 그래서 두 열을 나란히 둔다:
 *      1011  비정상 — 재연결·재조회가 **있어야** 한다
 *      1000  정상   — 조사가 끝나면 서버가 닫는 자리다. 여기서 재연결이 «있으면» 완주한 화면마다
 *                     조용한 재시도가 도는 것이고, 그건 통과가 아니라 결함이다.
 *
 * 🔴 자극이 무대를 못 잡으면 «측정 불가»(exit 2)다 — 초록으로도 빨강으로도 쓰지 않는다:
 *      run 생성이 안 되거나(D-11 엣지 502), WS 가 한 번도 안 열리거나,
 *      자극 시점에 run 이 이미 종단이면(끝난 run 은 재연결 대상이 아니다 — 앱이 그렇게 가른다).
 *
 *      FKT_WEB_BASE=https://…  node t44_gate6_d_ws_recovery.mjs
 *
 * exit: 0 = 전건 통과 · 1 = 어긋남 · 2 = 측정 불가
 */
import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE;
if (!WEB) {
  console.log("🔴 측정 불가 — `FKT_WEB_BASE` 를 명시하라(기본값 없음 · Q-62).");
  process.exit(2);
}
const SCENARIO = process.env.FKT_SCENARIO ?? "GS-01";
/**
 * 🔴 어느 모드의 run 을 무대로 쓰는가 — **이 값이 판정 조건의 일부다**.
 *    공개 Sandbox 는 `online:false` 가 정본이라 `live` run 이 «3초 안에 completed» 로 끝났고,
 *    끝난 run 은 앱이 재연결 대상에서 제외한다(run-console.tsx:174). 그래서 그 열은 빨강이
 *    아니라 **무대 없음**이었다(19대 1차 실행 · 그물이 스스로 exit 2 를 냈다).
 *    WS 사슬 자체는 모드와 무관하므로 «진행이 남아 있는» 모드를 무대로 고른다.
 */
const MODE = process.env.FKT_RUN_MODE ?? "replay";
const NAV_MS = Number(process.env.FKT_NAV_MS ?? 45000);
/**
 * 자극 전 스트림을 살려 두는 시간.
 * 🔴 기본 **0** — 이 대상에서 run 은 **1초 안에 completed** 로 끝난다(19대 실측: 300ms 를 기다리면
 *    자극 시점에 이미 종단이라 무대가 사라진다). 창을 늘리는 것이 «관대함»이 아니라 여기서는
 *    **무대를 없애는 일**이다. 진행 구간이 긴 조건에서는 이 값을 올려서 쓴다.
 */
const HOLD_MS = Number(process.env.FKT_HOLD_MS ?? 0);
/** 자극 뒤 관측 창 — 백오프 [500,1000,2000,4000]ms 4회를 덮는다(run-console.tsx:46). */
const WATCH_MS = Number(process.env.FKT_WATCH_MS ?? 12000);

let failures = 0;
const ok = (name, pass, detail) => {
  if (!pass) failures += 1;
  console.log(`    ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const die = (why) => { console.log(`\n  🔴 측정 불가 — ${why}`); process.exit(2); };

/** 한 열: WS 를 열어 두었다가 `code` 로 닫고, 그 «뒤» 나가는 것을 센다. */
async function column(browser, code) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${WEB}/`, { timeout: NAV_MS });
  // 🔴 입장 완료의 표지는 «시간»이 아니라 `/overview` 도달이다(t3-6 의 `enter()` 와 같은 축).
  //    고정 대기로 세면 느린 회차에서 「세션이 없다」는 위양성이 난다 — 첫 실행에서 내가 그랬다.
  try { await page.waitForURL(/\/overview$/, { timeout: 30000 }); }
  catch { /* 아래 sid 검사가 그 사실을 말한다 */ }
  const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) return { fatal: "브라우저에 `fkt_sid` 가 없다 — 입장이 안 끝났다" };

  const made = await page.evaluate(
    async ({ scenario, sid, mode }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mode }),
      });
      const text = await res.text();
      try { return { status: res.status, body: JSON.parse(text) }; }
      catch { return { status: res.status, raw: text.slice(0, 60) }; }
    },
    { scenario: SCENARIO, sid, mode: MODE },
  );
  if (made.status !== 200 || !made.body?.runId) {
    return { fatal: `run 생성 실패 — ${made.status} ${made.raw ?? JSON.stringify(made.body).slice(0, 60)}` };
  }
  const { runId, incidentId } = made.body;

  // ── 계측기: 끊긴 «뒤» 나가는 것만 센다 ────────────────────────────────────
  let connects = 0;
  let stimulusAt = 0;
  const after = { snapshot: 0, events: 0 };
  const snapPath = `/api/runs/${runId}`;
  page.on("request", (r) => {
    if (!stimulusAt) return;              // 자극 «전» 호출은 이 축이 아니다
    const p = new URL(r.url()).pathname;
    if (p === `${snapPath}/events`) after.events += 1;
    else if (p === snapPath) after.snapshot += 1;
  });

  await page.routeWebSocket(/\/api\/ws\/runs\//, (ws) => {
    const nth = ++connects;
    ws.connectToServer();                 // 실제 스트림을 그대로 흘린다(프레임을 지어내지 않는다)
    if (nth === 1) {
      setTimeout(() => {
        stimulusAt = Date.now();
        ws.close({ code, reason: "t44-gate6-d" });
      }, HOLD_MS);
    }
  });

  await page.goto(`${WEB}/incidents/${incidentId}?run=${runId}`, { timeout: NAV_MS });
  const con = page.getByTestId("run-console");
  try { await con.waitFor({ state: "visible", timeout: 20000 }); }
  catch { await ctx.close(); return { fatal: "run-console 이 서지 않았다" }; }

  // 자극이 나갈 때까지 기다린다(핸들러의 setTimeout).
  const deadline = Date.now() + HOLD_MS + 15000;
  while (!stimulusAt && Date.now() < deadline) await page.waitForTimeout(200);
  const statusAtStimulus = await con.getAttribute("data-status");
  if (!stimulusAt) { await ctx.close(); return { fatal: `WS 가 열리지 않았다(연결 ${connects}건) — 자극할 무대가 없다` }; }

  await page.waitForTimeout(WATCH_MS);
  const note = await page.evaluate(() => {
    const n = document.querySelector("[data-testid=run-console]");
    return (n?.textContent ?? "").includes("연결") || (n?.textContent ?? "").includes("끊");
  });
  const statusAfter = await con.getAttribute("data-status");
  await ctx.close();
  return { runId, connects, after, statusAtStimulus, statusAfter, note };
}

const browser = await chromium.launch();
console.log(`\n== Gate 6 ⓓ 「WebSocket 중단」 — ${WEB}`);
console.log(`   무대 = ${MODE} run · 자극 = 첫 WS 를 ${HOLD_MS}ms 뒤 닫는다 · 관측 창 ${WATCH_MS}ms(백오프 4회 500·1000·2000·4000 을 덮는다)`);

const abnormal = await column(browser, 1011);
if (abnormal.fatal) { await browser.close(); die(`[1011 열] ${abnormal.fatal}`); }
console.log(`\n  열 1011 비정상   WS 연결 ${abnormal.connects}회 · 자극 후 재조회 snapshot ${abnormal.after.snapshot} · events ${abnormal.after.events} · status ${abnormal.statusAtStimulus} → ${abnormal.statusAfter}`);

const normal = await column(browser, 1000);
if (normal.fatal) { await browser.close(); die(`[1000 대조군] ${normal.fatal}`); }
console.log(`  열 1000 정상     WS 연결 ${normal.connects}회 · 자극 후 재조회 snapshot ${normal.after.snapshot} · events ${normal.after.events} · status ${normal.statusAtStimulus} → ${normal.statusAfter}`);
await browser.close();

console.log("\n  ── 판정 ──");
if (abnormal.statusAtStimulus === "completed" || abnormal.statusAtStimulus === "failed") {
  die(`자극 시점에 run 이 이미 «${abnormal.statusAtStimulus}» 다 — 끝난 run 은 재연결 대상이 아니다(run-console.tsx:174). 무대가 아니다`);
}
ok("자극 무대가 섰다 — WS 가 실제로 열렸다", abnormal.connects >= 1, `연결 ${abnormal.connects}회`);

const recovered = abnormal.connects >= 2 || abnormal.after.snapshot > 0 || abnormal.after.events > 0;
ok("🔴 정본 red — 끊긴 «뒤» 재연결 «또는» 상태 재조회가 있다", recovered,
   `재연결 ${Math.max(0, abnormal.connects - 1)}회 · snapshot ${abnormal.after.snapshot} · events ${abnormal.after.events}`);

// 🔴 대조군의 축은 «events 재조회 + 재연결»이지 스냅샷이 아니다.
//    1차 실행에서 나는 「1000 이면 전부 0」이라 적었고 FAIL 을 받았다. 코드를 보면 스냅샷 재조회는
//    **닫힘 코드를 보기 «전»** 에 있다(run-console.tsx:166 — 「끊겼으면 마지막 사실이라도 남긴다」).
//    「끝났다/끊겼다」를 가르는 줄은 그 «아래» :170 이고, 거기서 갈리는 것은 events 재조회와 재연결이다.
//    판정선을 값에 맞춰 옮긴 것이 아니라, 내가 읽지 않고 세운 선을 **구현의 그 줄**로 되돌린 것이다.
const quiet = normal.connects <= 1 && normal.after.events === 0;
ok("🔴 대조군 — 정상 종료(1000)에서는 «events 재조회·재연결»이 없다", quiet,
   quiet ? `events 0 · 재연결 0 (기대대로 · snapshot ${normal.after.snapshot} 은 코드가 :170 «위»에서 하는 정상 거동)`
         : `🔴 재연결 ${Math.max(0, normal.connects - 1)}회 · events ${normal.after.events} — 「끊겨서」가 아니라 「아무 때나」 부르는 것이다`);

// 🔴 세는 눈이 살아 있는가 — 두 열에서 «공통으로» 1 이 나오는 축이 있어야 events 의 0 이 의미를 갖는다.
//    이게 없으면 「대조군 0」은 「계측기가 죽어서 0」과 구분되지 않는다.
ok("세는 눈 — 두 열 모두에서 스냅샷 재조회가 «잡힌다»",
   abnormal.after.snapshot > 0 && normal.after.snapshot > 0,
   `1011 ${abnormal.after.snapshot} · 1000 ${normal.after.snapshot}`);

console.log(`\n  🔵 관측(판정 아님) — 1011 열 화면 문구 표지 ${abnormal.note ? "있음" : "없음"} · 1000 열 ${normal.note ? "있음" : "없음"}`);
console.log(`\n결과: ${failures ? `어긋남 ${failures}건` : "전건 통과"}`);
process.exit(failures ? 1 : 0);
