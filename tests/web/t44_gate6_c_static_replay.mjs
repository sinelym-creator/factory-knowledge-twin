/**
 * Gate 6 ⓒ 「노트북 OFF」 — 관측자 축 치환 (T4-4 · 검증 좌석 19대).
 *
 * 정본 §32.7: 노트북 OFF = 「Public UX 와 Replay 정상」. 외부 대상의 노트북을 끄는 것은 파괴
 * 경계 밖이라, 자극을 **관측자 쪽**에 둔다: 브라우저가 셸의 `/api/**` 를 **한 건도 쓰지 못하게**
 * 막고, 정적 replay 가 그래도 완주하는가를 본다.
 *
 * 🔴 이 그물이 스스로 의심하는 것 — 「막았는데 멀쩡하다」는 두 가지로 설명된다:
 *      (가) 이 경로가 정말 `/api` 없이 돈다        ← 우리가 재려는 것
 *      (나) 자극이 아무 데도 안 걸렸다              ← 초록을 공짜로 만드는 쪽
 *    그래서 **열 C** 를 둔다: 똑같은 자극을 `/api` 를 «쓰는» 화면에 걸어 차단이 실제로 세어지는지
 *    본다. 열 C 가 0 이면 이 실행 전체가 **측정 불가**다(exit 2) — 초록으로 쓰지 않는다.
 *
 * 🔴 열 A(무자극)를 먼저 센다. A 와 B 가 «같은 값으로 완주»해야 의미가 있고, A 가 애초에 완주하지
 *    못하면 B 의 완주는 비교할 상대가 없다.
 *
 *      FKT_WEB_BASE=https://…  node t44_gate6_c_static_replay.mjs
 *
 * exit: 0 = 전건 통과 · 1 = 어긋남 · 2 = 측정 불가(대상 무응답 · 자극 부재 · 기준선 미완주)
 */
import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE;
if (!WEB) {
  console.log("🔴 측정 불가 — `FKT_WEB_BASE` 를 명시하라(기본값 없음 · Q-62).");
  process.exit(2);
}
const INCIDENT = process.env.FKT_INCIDENT ?? "INC-2026-014";
/** T4-2a 가 정적 fixture 에서 확정한 완주 지표 — 이 그물이 새로 정하는 값이 아니다. */
const EXPECT = { events: 32, steps: 5, evidence: 19, candidates: 2 };
const NAV_MS = Number(process.env.FKT_NAV_MS ?? 45000);

let failures = 0;
const ok = (name, pass, detail) => {
  if (!pass) failures += 1;
  console.log(`    ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

/** 화면이 «완주»했는가 — T4-2a 검출기 그대로(셀렉터를 새로 짓지 않는다). */
const snapshot = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const con = document.querySelector("[data-testid=run-console]");
    // 🔴 이벤트 수는 «커서가 신고하는 값»이다 — DOM 노드를 세지 않는다(1차 실행에서 내가
    //    `[data-testid=run-event]` 를 지어내 0/32 를 냈다. 대상이 아니라 내 눈이 틀렸다).
    const cur = document.querySelector("[data-testid=replay-cursor]");
    return {
      status: con?.getAttribute("data-status") ?? null,
      events: Number(cur?.getAttribute("data-total") ?? -1),
      applied: Number(cur?.getAttribute("data-applied") ?? -1),
      steps: q("[data-testid=run-step]"),
      evidence: q("[data-testid=evidence-card]"),
      candidates: q("[data-testid=candidate]"),
      sourceStatic: !!document.querySelector("[data-testid=run-source-static]"),
      bodyLen: document.body.innerText.length,
    };
  });

/**
 * 정적 replay 한 회차. `block` 이면 브라우저의 `/api/**` 를 연결 거부로 막고, 막힌 건수를 센다.
 * 🔴 세션은 자극 «전»에 받는다 — `/enter` 는 셸 «서버»가 나가는 홉이라 이 자극과 층이 다르다.
 */
async function walk(browser, { block }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let blocked = 0;
  let beforeOffer = 0;
  const seen = [];
  await page.goto(`${WEB}/`, { timeout: NAV_MS });   // 입장 마운트가 세션을 받는다
  await page.waitForTimeout(1500);
  if (block) {
    await ctx.route("**/api/**", (route) => {
      blocked += 1;
      const line = `${route.request().method()} ${new URL(route.request().url()).pathname}`;
      if (!seen.includes(line)) seen.push(line);
      return route.abort("connectionrefused");
    });
  }
  await page.goto(`${WEB}/incidents/${INCIDENT}`, { timeout: NAV_MS });
  const offer = page.getByTestId("static-replay-offer");
  let offered = false;
  try {
    await offer.waitFor({ state: "visible", timeout: 15000 });
    beforeOffer = blocked;   // 🔴 여기까지가 «incident 화면» 의 몫, 그 뒤가 «정적 replay» 의 몫
    await offer.click();
    offered = true;
  } catch { /* 제안이 없으면 아래 스냅샷이 그 사실을 말한다 */ }
  let completed = false;
  try {
    await page.waitForFunction(
      () => document.querySelector("[data-testid=run-console]")?.getAttribute("data-status") === "completed",
      null,
      { timeout: 90000 },
    );
    completed = true;
  } catch { /* 미완주도 값이다 */ }
  const snap = await snapshot(page);
  await ctx.close();
  return { ...snap, offered, completed, blocked, beforeOffer, seen: seen.slice(0, 8) };
}

/** 열 C — 같은 자극을 `/api` 를 «쓰는» 화면에 건다. 여기서 0 이면 자극 자체가 죽은 것이다. */
async function stimulusIsLive(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let blocked = 0;
  await page.goto(`${WEB}/`, { timeout: NAV_MS });
  await page.waitForTimeout(1500);
  await ctx.route("**/api/**", (route) => { blocked += 1; return route.abort("connectionrefused"); });
  await page.goto(`${WEB}/overview`, { timeout: NAV_MS });
  // 배지 폴링이 한 번은 돌 창을 준다(브라우저가 셸 `/api` 를 부르는 유일한 층).
  await page.waitForTimeout(35000);
  await ctx.close();
  return blocked;
}

const browser = await chromium.launch();
console.log(`\n== Gate 6 ⓒ 「노트북 OFF」 관측자 축 — ${WEB}  (incident ${INCIDENT})`);

const A = await walk(browser, { block: false });
console.log(`\n  열 A 대조군(무자극)   status=${A.status} events=${A.events} steps=${A.steps} evidence=${A.evidence} candidates=${A.candidates} static=${A.sourceStatic}`);
const B = await walk(browser, { block: true });
console.log(`  열 B 자극(/api 차단)  status=${B.status} events=${B.applied}/${B.events} steps=${B.steps} evidence=${B.evidence} candidates=${B.candidates} static=${B.sourceStatic} · 차단 ${B.blocked}건 ${B.seen.length ? JSON.stringify(B.seen) : ""}`);
const C = await stimulusIsLive(browser);
console.log(`  열 C 자극 실재       /api 를 쓰는 화면에서 차단 ${C}건`);
await browser.close();

console.log("\n  ── 판정 ──");
if (!A.completed) {
  console.log("  🔴 측정 불가 — 기준선(열 A)이 완주하지 못했다. 자극 열을 비교할 상대가 없다.");
  process.exit(2);
}
if (C === 0) {
  console.log("  🔴 측정 불가 — 자극이 «닿지 않았다»(열 C 차단 0). 열 B 의 완주는 자극의 것이 아니다.");
  process.exit(2);
}
ok("열 A 기준선이 완주한다", A.completed, `status=${A.status}`);
ok("열 A 지표가 T4-2a 정적 fixture 와 같다",
   A.events === EXPECT.events && A.steps === EXPECT.steps && A.evidence === EXPECT.evidence && A.candidates === EXPECT.candidates,
   `events ${A.events}/${EXPECT.events} steps ${A.steps}/${EXPECT.steps} evidence ${A.evidence}/${EXPECT.evidence} candidates ${A.candidates}/${EXPECT.candidates}`);
ok("🔴 열 B — `/api` 를 못 쓰는데도 완주한다", B.completed, `status=${B.status}`);
ok("🔴 열 B 지표가 열 A 와 «같다»(강등도 결손도 없다)",
   B.events === A.events && B.steps === A.steps && B.evidence === A.evidence && B.candidates === A.candidates,
   `A(${A.events}/${A.steps}/${A.evidence}/${A.candidates}) ↔ B(${B.events}/${B.steps}/${B.evidence}/${B.candidates})`);
ok("열 B 가 정적 출처로 그려진다", B.sourceStatic, `run-source-static ${B.sourceStatic}`);
// 🔴 판정하지 않는다 — T4-2a.md:24 의 AC 는 「정적 경로 화면 데이터 /api 호출 0
//    (**허용 = `GET /api/live/status` polling 1종**)」이다. 1차 실행에서 나는 그 허용을 빼먹고
//    위반으로 셌다. 그리고 남는 호출이 있어도 그 주어는 **T4-2a 축**이지 Gate 6 ⓒ행이 아니다 —
//    남의 판정선을 이 그물에 넣으면 옆 티켓의 빨강이 이 행의 색을 정하게 된다. 값만 남긴다.
const ALLOWED = /^GET \/api\/live\/status$/;
const extra = B.seen.filter((c) => !ALLOWED.test(c));
console.log("");
console.log("  ── 관측(판정 아님) — 정적 경로가 브라우저에서 부른 `/api` ──");
console.log(`    전체 ${B.blocked}건 · 허용 1종 제외 후 ${extra.length}건${extra.length ? ` → ${JSON.stringify(extra)}` : ""}`);
console.log(`    (열기 «전» ${B.beforeOffer}건 · «후» ${B.blocked - B.beforeOffer}건 — 정적 replay 자신의 것인지 incident 화면의 것인지는 이 두 수가 가른다)`);
if (extra.length) console.log("    🔴 허용 밖 호출이 있다 — **T4-2a AC 축으로 회부**(이 행의 판정에는 넣지 않는다).");
ok("자극 실재(열 C) — 같은 자극이 다른 화면에서는 «걸린다»", C > 0, `차단 ${C}건`);

console.log(`\n결과: ${failures ? `어긋남 ${failures}건` : "전건 통과"}`);
process.exit(failures ? 1 : 0);
