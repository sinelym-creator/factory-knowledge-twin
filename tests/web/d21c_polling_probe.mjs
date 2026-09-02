/**
 * d21c_polling_probe — D-21 ⓒ 「주기 조회 대체」를 **공개 셸에서 실물로** 잰다 (검증 좌석 · 27대).
 *
 * 🔴 **로컬 그물과 같은 것을 재지 않는다.** `tests/web/e2e/t42b-shell-axes.spec.ts` ⓗ 는
 *    브라우저의 `WebSocket` 을 갈아 끼워 «미개통»을 **내가 만든다**. 여기서는 아무것도 만들지
 *    않는다 — 공개 셸에서는 그 미개통이 **실물로 일어난다**(D-21 · `evidence/d21-ws-layer-split.md`).
 *    두 초록은 뜻이 다르므로 판정문에서도 같은 칸에 쓰지 않는다.
 *
 * 🔴 **자극을 주지 않는 프로브다.** 429 는 운영값(env) 축이라 여기서 건드리지 않는다 — 자극하면
 *    공개 인스턴스의 rate limit 을 내가 소모하는 것이고, 그것은 잰 것이 아니라 만든 것이다.
 *
 * 🔴 **간격은 화면이 말하는 값으로 잰다.** `data-interval-ms` 가 정본이고, 이 파일에 숫자를 박지
 *    않는다. 상수를 고친 날 프로브가 빨강을 내면 그 빨강은 대상의 것이 아니다.
 *
 * 🔴 **어디에 붙었는지를 근거로 남긴다.** 공개 URL 을 쳐도 tailnet self 로 붙는 일이 있었다
 *    (19대 계보 「밖은 한 칸이 가른다」). 그래서 첫 문서 응답의 엣지 헤더를 함께 적는다 —
 *    없으면 「공개 경로로 쟀다」고 주장하지 않는다.
 *
 *      FKT_WEB_BASE      재는 공개 셸 (기본값 없음 · Q-62)
 *      FKT_DIRECT_BASE   대조군 — 직결 경로(선택). 주면 「101 이 서면 폴링 0」을 나란히 잰다
 *      FKT_SCENARIO      기본 GS-01
 *      FKT_WATCH_MS      종단 뒤 «더 두드리는지» 보는 창(기본 8000)
 *
 * exit: 0 = 잰 축 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가(무대 없음)
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const WEB = process.env.FKT_WEB_BASE;
const DIRECT = process.env.FKT_DIRECT_BASE ?? "";
const SCENARIO = process.env.FKT_SCENARIO ?? "GS-01";
const AFTER_MS = Number(process.env.FKT_WATCH_MS ?? 8000);

if (!WEB) {
  console.log("🔴 측정 불가 — `FKT_WEB_BASE` 를 명시하라(기본값 없음 · Q-62).");
  process.exit(2);
}

const browser = await chromium.launch();

/**
 * 한 경로에서 조사 하나를 열고, WS 와 폴링의 «자취»를 함께 남긴다.
 * 🔴 관측은 전부 자취다 — 「폴링이 돈다」를 화면 문면으로 말하지 않는다.
 */
async function observe(base, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const t0 = Date.now();
  const ws = { opened: 0, closed: [], marks: [] };
  page.on("websocket", (sock) => {
    ws.opened += 1;
    ws.marks.push({ at: Date.now() - t0, what: "open" });
    sock.on("close", () => {
      ws.closed.push(Date.now());
      ws.marks.push({ at: Date.now() - t0, what: "close" });
    });
  });

  const polls = [];
  let mine = false; // 🔴 내 검산 fetch 를 폴링으로 세지 않는다(측정 면에 내 출력이 섞인다)
  let edge = null;
  page.on("request", (r) => {
    const u = new URL(r.url());
    // 🔴 «요청» 시각이다. 응답 시각으로 재면 왕복이 긴 공개 경로에서 간격이 뭉쳐 보인다.
    if (!mine && /^\/api\/runs\/[^/]+\/events$/.test(u.pathname))
      polls.push({ rel: Date.now() - t0, status: null });
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (/^\/api\/runs\/[^/]+\/events$/.test(u.pathname)) {
      const open = polls.find((x) => x.status === null);
      if (open) open.status = r.status();
    }
    if (edge === null && u.pathname === "/overview") {
      const h = r.headers();
      edge = h["x-vercel-id"] ?? h["server"] ?? h["via"] ?? "(엣지 표지 없음)";
    }
  });

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/overview$/, { timeout: 60_000 });
  // 🔴 화면이 클라이언트까지 서야 진입 버튼이 «누를 수 있는» 상태가 된다.
  await page.locator("[data-testid=start-from-alarm]").first().waitFor({ state: "visible", timeout: 60_000 });

  const startedAt = Date.now();
  await page.locator("[data-testid=start-from-alarm]").first().click();
  await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 60_000 });
  const runId = new URL(page.url()).searchParams.get("run");

  // ① 배너 — 뜨는가, 그리고 간격을 스스로 밝히는가.
  let interval = null;
  let bannerAt = null;
  let bannerRel = null;
  try {
    const banner = page.locator("[data-testid=run-polling]");
    await banner.waitFor({ state: "visible", timeout: 45_000 });
    bannerAt = Date.now() - startedAt;
    bannerRel = Date.now() - t0;
    interval = Number(await banner.getAttribute("data-interval-ms"));
  } catch {
    /* 안 뜬 것도 사실이다 — 아래에서 갈라 읽는다 */
  }

  // ③ 종단까지 — 폴링만으로 완주 상태에 닿는가.
  const console_ = page.locator("[data-testid=run-console]");
  let settled = false;
  try {
    await console_.waitFor({ state: "visible", timeout: 60_000 });
    for (let i = 0; i < 240; i += 1) {
      if ((await console_.getAttribute("data-status")) === "completed") {
        settled = true;
        break;
      }
      await page.waitForTimeout(1_000);
    }
  } catch {
    /* 화면이 안 서면 settled=false 로 남는다 */
  }

  const bannerAfterSettle = await page.locator("[data-testid=run-polling]").count();
  // 🔴 종단 «뒤»에 창을 새로 연다 — 먼저 열고 세면 종단 전 요청이 섞인다.
  const beforeWindow = polls.length;
  await page.waitForTimeout(AFTER_MS);
  const afterWindow = polls.length - beforeWindow;

  // ④ 화면이 적용한 이벤트 수 ↔ 서버 정본 seq 수.
  let applied = null;
  let total = null;
  const cursor = page.locator("[data-testid=replay-cursor]");
  if (await cursor.count()) {
    applied = Number(await cursor.getAttribute("data-applied"));
    total = Number(await cursor.getAttribute("data-total"));
  }
  mine = true;
  const serverSeqs = runId
    ? await page.evaluate(async (id) => {
        const res = await fetch(`/api/runs/${id}/events`);
        if (!res.ok) return null;
        return (await res.json()).map((e) => e.seq);
      }, runId)
    : null;

  await ctx.close();
  return { label, base, edge, runId, ws, polls, bannerRel, t0, interval, bannerAt, settled, bannerAfterSettle, afterWindow, applied, total, serverSeqs };
}

function report(o) {
  console.log(`\n── ${o.label} (${o.base})`);
  console.log(`   붙은 곳 표지     : ${o.edge ?? "(못 읽음)"}`);
  console.log(`   run              : ${o.runId ?? "🔴 열지 못함"}`);
  console.log(`   WS 열림/닫힘     : ${o.ws.opened} / ${o.ws.closed.length}`);
  console.log(`   배너             : ${o.bannerAt !== null ? `${o.bannerAt}ms 에 출현 · 간격 정본 ${o.interval}ms` : "안 뜸"}`);
  console.log(`   폴링 요청        : ${o.polls.length}회 (429 ${o.polls.filter((p) => p.status === 429).length}건)`);
  console.log(`   타임라인(ms)     : WS ${o.ws.marks.map((m) => `${m.what}@${m.at}`).join(" ")}`);
  console.log(`                      배너@${o.bannerRel ?? "-"} · 조회 ${o.polls.map((p) => `${p.rel}(${p.status})`).join(" ")}`);
  // 🔴 배너가 «선 뒤»의 조회만 폴링이다 — 그 앞의 되감기 조회(onclose ⓐ)는 다른 사건이다.
  const after = o.bannerRel === null ? [] : o.polls.filter((p) => p.rel >= o.bannerRel);
  if (after.length > 1) {
    const d = after.slice(1).map((p, i) => p.rel - after[i].rel).sort((a, b) => a - b);
    console.log(`   배너 뒤 조회 델타 : ${d.join(" · ")}ms (중앙값 ${d[Math.floor(d.length / 2)]}ms · 표본 ${after.length}회)`);
  } else {
    console.log(`   배너 뒤 조회      : ${after.length}회 — 간격을 잴 표본이 없다`);
  }
  console.log(`   되감기/폴링 구분  : WS close 뒤 조회 = 되감기(구현 onclose ⓐ) · 배너+간격 뒤 조회 = 폴링`);
  console.log(`   완주 도달        : ${o.settled ? "○" : "🔴"} · 종단 뒤 배너 ${o.bannerAfterSettle}개 · 종단 뒤 조회 ${o.afterWindow}회`);
  console.log(`   이벤트 수        : 화면 ${o.applied}/${o.total} · 서버 seq ${o.serverSeqs ? o.serverSeqs.length : "(못 읽음)"}`);
}

const shell = await observe(WEB, "공개 셸");
report(shell);

let direct = null;
if (DIRECT) {
  direct = await observe(DIRECT, "대조군 — 직결");
  report(direct);
}

await browser.close();

/* ── 판정 ────────────────────────────────────────────────────────────────────
 * 🔴 «못 잼»과 «어긋남»을 가른다. 무대가 없으면(조사가 안 열림 · 화면이 안 섬) 어느 색도 내지
 *    않는다 — 그때의 「배너 없음」은 대상의 성질이 아니라 내 창의 침묵이다.
 * ────────────────────────────────────────────────────────────────────────── */
const fail = [];
const unmeasurable = [];

if (!shell.runId) unmeasurable.push("공개 셸에서 조사를 열지 못했다");
else if (shell.bannerAt === null && shell.ws.opened > 0 && shell.polls.length === 0) {
  // WS 가 «섰을» 수도 있다 — 그러면 폴링 0 이 정본이고 이 프로브는 잴 것이 없다.
  unmeasurable.push("배너도 폴링도 없다 — 공개 경로에서 WS 가 섰을 수 있다(D-21 이 그 사이에 풀렸는가부터 확인하라)");
} else {
  if (shell.bannerAt === null) fail.push("① 미개통인데 주기 조회 배너가 안 떴다");
  if (!(shell.interval > 0)) fail.push("① 배너가 간격(data-interval-ms)을 밝히지 않는다");
  const after = shell.bannerRel === null ? [] : shell.polls.filter((p) => p.rel >= shell.bannerRel);
  if (after.length < 2) unmeasurable.push(`② 배너 뒤 조회가 ${after.length}회뿐이다 — 간격을 잴 표본이 없다(조사가 먼저 끝났을 수 있다)`);
  else if (shell.interval > 0) {
    const d = after.slice(1).map((p, i) => p.rel - after[i].rel).sort((a, b) => a - b);
    const median = d[Math.floor(d.length / 2)];
    if (median < shell.interval * 0.5 || median > shell.interval * 2.5)
      fail.push(`② 배너 뒤 관측 간격 중앙값 ${median}ms 가 정본 ${shell.interval}ms 와 어긋난다 (델타 ${d.join("·")})`);
  }
  if (!shell.settled) fail.push("③ 폴링만으로 완주 상태에 닿지 못했다");
  if (shell.settled && shell.bannerAfterSettle > 0) fail.push("③ 끝난 조사에 「진행 중」 배너가 남았다");
  if (shell.settled && shell.afterWindow > 0) fail.push(`③ 종단 뒤 ${AFTER_MS}ms 동안 ${shell.afterWindow}회 더 두드렸다`);
  if (shell.serverSeqs) {
    const uniq = new Set(shell.serverSeqs).size;
    if (uniq !== shell.serverSeqs.length) fail.push("④ 서버 seq 가 유일하지 않다 — 중복 판정의 바탕이 흔들린다");
    if (shell.applied !== shell.serverSeqs.length) fail.push(`④ 화면 적용 ${shell.applied} ≠ 서버 ${shell.serverSeqs.length} (중복·누락)`);
  } else unmeasurable.push("④ 서버 events 를 못 읽었다");
}

if (direct) {
  if (!direct.runId) unmeasurable.push("대조군에서 조사를 열지 못했다");
  else if (direct.ws.opened === 0) unmeasurable.push("대조군에서 WS 를 한 번도 열지 않았다 — 대조가 성립 안 한다");
  else if (direct.polls.length > 0 || direct.bannerAt !== null)
    fail.push(`대조군: 직결인데 폴링 ${direct.polls.length}회 · 배너 ${direct.bannerAt !== null ? "출현" : "없음"} (계약 :156 = 폴링 0)`);
}

console.log("\n── 판정");
for (const f of fail) console.log(`   🔴 ${f}`);
for (const u of unmeasurable) console.log(`   ◌ 못 잼: ${u}`);
if (!fail.length && !unmeasurable.length) console.log("   ○ 잰 축 전건 기대대로");

process.exit(fail.length ? 1 : unmeasurable.length ? 2 : 0);
