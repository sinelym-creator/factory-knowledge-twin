/**
 * T7-24 2차 · **X-24**(폴백 «중» 원래 경로 복구) · **X-25**(폴백의 폴백). 리바이2 41대.
 *
 * 무대 3층 — 셸 `:8104`(빌드 시점에 `FKT_API_BASE=:8101` 로 구움) → **거울 스텁 `:8101`**
 *            → 내 ai-api `:8103`. 🔴 공용 `:8102` 는 건드리지 않는다.
 *   · 스텁의 `/__stub/down` 은 500 이 아니라 **소켓을 끊는다** — 「응답 코드」와 「연결 자체가
 *     안 된다」는 셸에서 다른 경로를 탄다. `refused` 델타가 **자극이 실재했다**의 증인이다.
 *
 * 🔴 **세는 자** — 「만들어진 run 수」 = `(POST …/runs 200 줄 수) − (재사용 로그 줄 수)`.
 *    처방(#571) 뒤에는 재사용 응답도 200 이라 access log 줄 수는 run 수가 아니다(T7-30 §1).
 *    재사용 줄은 ASCII 마커로 센다(한글은 콘솔 인코딩에서 통째로 사라진다).
 *
 * 판정선
 *   X-24 ① 자극이 실재(`refused` 델타 > 0) ② 폴백으로 **낙하했다**(화면 표지가 바뀐다)
 *        ③ 상류 복구 후 **되돌아온다** ④ 그 왕복 동안 **중복 실행 0**(created 델타가 조작 수를 안 넘는다)
 *   X-25 ① 대체 경로까지 끊는다 ② **30초 안에 «정의된 마지막 상태»** 에 선다(조용한 폴백 = 실패)
 *        ③ **요청 수가 유계**(무한 재시도 금지)
 *
 *   node t724x_fallback_recovery.mjs --shell=http://127.0.0.1:8104 --stub=http://127.0.0.1:8101 --log=<ai-api 로그>
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8104");
const STUB = arg("stub", "http://127.0.0.1:8101");
const LOG = arg("log", null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!LOG) {
  console.log("🔴 --log 가 없다 — 「만들어진 run 수」를 셀 수 없다. 판정하지 않는다. exit 2");
  process.exit(2);
}

const RE_POST = /POST \/api\/scenarios\/[^ ]+\/runs HTTP\/1\.1" 200/g;
const RE_REUSE = /session=[^ ]+ scenario=[^ ]+ run=RUN-[0-9a-f]+/g;
const counters = () => {
  let t = "";
  try {
    t = readFileSync(LOG, "utf8");
  } catch {}
  const posts = (t.match(RE_POST) ?? []).length;
  const reuse = (t.match(RE_REUSE) ?? []).length;
  return { posts, reuse, created: posts - reuse };
};
const stubStats = async () =>
  (await fetch(STUB + "/__stub/stats")
    .then((r) => r.json())
    .catch(() => null)) ?? {};
const stubSet = async (state) => {
  const r = await fetch(`${STUB}/__stub/${state}`).catch(() => null);
  return !!r;
};

/* 화면이 «무엇을 말하고 있는가» — 표지를 지어내지 않고 화면이 쓰는 testid 를 읽는다. */
const READ = () => {
  const txt = (sel) => {
    const e = document.querySelector(sel);
    return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 70) : null;
  };
  return {
    mode: txt('[data-testid="mode-badge"]'),
    banner: txt('[data-testid="fallback-banner"]'),
    live: txt('[data-testid="live-status"]'),
    url: location.pathname,
    bodyHead: (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 70),
  };
};

const enter = async (page) => {
  const b = page.locator('[data-testid="enter-button"]');
  if (await b.count().then((n) => n > 0).catch(() => false)) {
    await b.first().click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(1500);
  }
};

const browser = await chromium.launch();

/* ══ X-24 ══════════════════════════════════════════════════════════════════ */
await stubSet("up");
await fetch(STUB + "/__stub/reset").catch(() => {});
const x24 = { phases: [] };
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let netReq = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/")) netReq += 1;
  });

  const snap = async (label) => {
    const s = await stubStats();
    const c = counters();
    const v = await page.evaluate(READ);
    x24.phases.push({ label, stub: { refused: s.refused ?? 0, hit: s.hit ?? 0, miss: s.miss ?? 0 }, counters: c, view: v, netReq });
  };

  await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
  await enter(page);
  await page.waitForTimeout(2500);
  await snap("P0 기준선(상류 정상)");

  /* 자극 = 상류를 끊는다(소켓 거부). 🔴 자극 열을 «먼저» 잰다. */
  await stubSet("down");
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(4000);
  await snap("P1 상류 끊김(폴백 낙하 기대)");

  /* 복구 = 원래 경로를 되살린다. «폴백 중»에 되살아난다. */
  await stubSet("up");
  await page.waitForTimeout(4000);
  await snap("P2 상류 복구 · 화면 조작 없이");

  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(4000);
  await snap("P3 상류 복구 · 재방문 후");

  await ctx.close();
}

/* ══ X-25 ══════════════════════════════════════════════════════════════════ */
/* 🔴 «폴백의 폴백» — 상류를 끊고, **셸이 주는 대체 경로까지** 브라우저 쪽에서 끊는다.
   여기서 끊는 것은 클라이언트가 보는 `/api/**` 전부다. 즉 「상류도 없고 대체 사본도 못 읽는다」.
   내가 «무엇을» 끊었는지 이름으로 적는다 — 셸 내부의 정적 사본 파일을 지운 것이 아니다. */
await stubSet("down");
const x25 = { requests: 0, timeline: [], final: null, stub0: await stubStats() };
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("request", (r) => {
    if (r.url().includes("/api/")) x25.requests += 1;
  });
  await page.route("**/api/**", (route) => route.abort());
  await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await enter(page);
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    x25.timeline.push({ atMs: Date.now() - t0, requests: x25.requests, view: await page.evaluate(READ) });
  }
  x25.final = await page.evaluate(READ);
  await ctx.close();
}
await stubSet("up");
await browser.close();

/* ══ 보고 ══════════════════════════════════════════════════════════════════ */
const j = JSON.stringify;
console.log("\n=============== X-24 · 폴백 «중» 원래 경로 복구 ===============");
console.log("| 무대 | 자극 | 대체 동작(화면 표지) | 남은 흔적(스텁·계수기) | 시점 |");
console.log("|---|---|---|---|---|");
for (const p of x24.phases) {
  console.log(
    `| 셸→스텁→ai-api | ${p.label} | mode=${j(p.view.mode)} · banner=${j(p.view.banner)} | refused=${p.stub.refused} · created=${p.counters.created}(posts ${p.counters.posts}/reuse ${p.counters.reuse}) · /api 요청 ${p.netReq} | — |`,
  );
}
const P = (i) => x24.phases[i];
const refusedDelta = (P(1)?.stub.refused ?? 0) - (P(0)?.stub.refused ?? 0);
const fell = P(0)?.view.mode !== P(1)?.view.mode || P(0)?.view.banner !== P(1)?.view.banner;
const returned = P(3)?.view.mode === P(0)?.view.mode && P(3)?.view.banner === P(0)?.view.banner;
const createdRoundTrip = (P(3)?.counters.created ?? 0) - (P(0)?.counters.created ?? 0);
console.log(`\n자극 실재(refused 델타) = ${refusedDelta} ${refusedDelta > 0 ? "✓" : "✗ — 자극이 안 갔다"}`);
console.log(`낙하했는가 = ${fell ? "✓ 화면 표지가 바뀌었다" : "✗ 안 바뀌었다"}`);
console.log(`되돌아왔는가(재방문 후) = ${returned ? "✓ 기준선과 같은 표지" : "✗ 안 돌아왔다"}`);
console.log(`왕복 중 만들어진 run = ${createdRoundTrip} (조사 조작 0회 → 기대 0 · 중복 실행 0 의 뜻)`);
const x24Verdict =
  refusedDelta <= 0
    ? "미검증(자극 미도달)"
    : !fell
      ? "FAIL(낙하 안 함 — 상류가 끊겼는데 화면이 아무 말도 안 한다)"
      : returned && createdRoundTrip === 0
        ? "PASS"
        : !returned
          ? "FAIL(복구 후 원래 경로로 안 돌아온다)"
          : `FAIL(왕복 중 run ${createdRoundTrip} 건 — 중복 실행)`;
console.log(`[X-24] ${x24Verdict}`);

console.log("\n=============== X-25 · 폴백의 폴백(대체 경로까지 실패) ===============");
console.log("끊은 것: 상류(스텁 down · 소켓 거부) + **브라우저에서 /api/** 전부 abort**");
for (const t of x25.timeline) console.log(`  t=${t.atMs}ms · /api 요청 누계 ${t.requests} · mode=${j(t.view.mode)} · banner=${j(t.view.banner)} · main=${j(t.view.bodyHead)}`);
const last = x25.timeline[x25.timeline.length - 1];
const prev = x25.timeline[x25.timeline.length - 2];
const settled = !!last && !!prev && j(last.view) === j(prev.view);
const bounded = !!last && !!prev && last.requests - prev.requests <= 2;
const speaks = !!(last?.view.banner || last?.view.mode || (last?.view.bodyHead ?? "").length > 0);
console.log(`\n마지막 상태가 «정의»돼 있는가(마지막 두 관측이 같다) = ${settled ? "✓" : "✗ 아직 흔들린다"}`);
console.log(`화면이 그 상태를 «말하는가»(조용한 폴백 = 실패) = ${speaks ? "✓" : "✗ 아무 말도 없다"}`);
console.log(`요청이 유계인가(마지막 5초 증가 ${last && prev ? last.requests - prev.requests : "—"} ≤ 2) = ${bounded ? "✓" : "✗ 무한 재시도 의심"}`);
const x25Verdict = settled && speaks && bounded ? "PASS" : "FAIL";
console.log(`[X-25] ${x25Verdict} · 30초 관측 · 최종 화면 ${j(x25.final)}`);
console.log(
  "\n🔴 안 잼: 셸 내부 정적 사본 «파일»을 실제로 못 읽게 만든 열(여기서는 클라이언트 경로를 끊었다) · 다중 탭 · 다른 엔진.",
);
