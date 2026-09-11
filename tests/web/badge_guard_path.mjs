/**
 * ⑤ `evidence.flagged` 배지 — **가드 통과 경로 설계 실측**(리바이2 59대 · 코드 변경 0 · 구독 0).
 *
 * 58대가 남긴 미측: 「replay run 화면을 직접 열려면 세션 가드를 넘어야 하는데 쿠키를 심어도
 * `/overview` 로 되돌려졌다」. 이 파일은 그 문장을 **두 개의 다른 사실**로 쪼개 각각 잰다.
 *
 *   축 G (가드) — 어떤 조건이 `/incidents/{id}?run=…` 를 «열어 주는가».
 *     G1 쿠키 0                      → 기대: 닫힘(`/` 로 튄다)
 *     G2 `fkt_session=pending:…`     → 기대: 열림(서버 세션 불요 · proxy.ts `if (session)` 분기)
 *     G3 쿠키 0 + `?run=STATIC-GS-01`→ 기대: 열림(proxy.ts 정적 replay 문)
 *
 *   축 B (배지) — 열린 화면이 `evidence.flagged` 를 **그리는가**.
 *     B-STIM 폴 응답에 flagged 1건을 심는다 → 기대: 배지 ≥1
 *     B-CTRL 같은 항해 · 심지 않는다       → 기대: 배지 0
 *
 * 🔴 심는 자리는 **셸의 `/api/runs/{id}/events`** 다 — 브라우저는 ai-api 를 직접 부르지 않는다.
 * 🔴 WS 를 닫아 폴 갈래를 «세운다». 닫지 않으면 완주한 run 은 WS 로 0건을 받고, 내 심은 것이
 *    화면에 탈 길이 없다. 자극이 탔는가는 **가로채기 수**(ofCalls)로 따로 찍는다 — 0 이면
 *    그 열은 아무것도 시험하지 않은 초록이라 FAIL 이 아니라 exit 2 다.
 * 🔴 자극 열을 먼저 돌린다(대조군이 먼저 돌면 상태를 지우고 시작한다).
 */
import { chromium } from "playwright";

const SHELL = process.env.SHELL_BASE ?? "http://127.0.0.1:8194";
const RUN_ID = process.env.RUN_ID;
const INCIDENT_ID = process.env.INCIDENT_ID;
const STATIC_RUN_ID = "STATIC-GS-01";
const OUT = process.env.OUT_DIR ?? ".";

if (!RUN_ID || !INCIDENT_ID) {
  console.error("RUN_ID·INCIDENT_ID 필요 — 무대 없음");
  process.exit(2);
}

const runUrl = `${SHELL}/incidents/${INCIDENT_ID}?run=${RUN_ID}`;
const rows = [];
const say = (r) => {
  rows.push(r);
  console.log(JSON.stringify(r));
};

/** 실제 이벤트 열을 한 번 받아 «심을 대상 id» 를 대상이 고르게 한다(내가 지어내지 않는다). */
async function realEvents() {
  const res = await fetch(`${SHELL}/api/runs/${RUN_ID}/events`, {
    headers: { cookie: process.env.COOKIE_HEADER ?? "" },
  });
  if (!res.ok) throw new Error(`events ${res.status}`);
  return res.json();
}

const browser = await chromium.launch();

// ── 축 G ───────────────────────────────────────────────────────────────────────
async function guard(label, { cookie, url }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (cookie) {
    await ctx.addCookies([
      { name: "fkt_session", value: cookie, url: SHELL, sameSite: "Lax" },
    ]);
  }
  const page = await ctx.newPage();
  const resp = await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
  const landed = new URL(page.url());
  say({
    axis: "G",
    col: label,
    cookie: cookie ?? "(none)",
    asked: new URL(url).pathname + new URL(url).search,
    landed: landed.pathname + landed.search,
    status: resp?.status() ?? null,
    open: landed.pathname.startsWith("/incidents/"),
  });
  await ctx.close();
}

await guard("G1 쿠키0·live run", { cookie: null, url: runUrl });
await guard("G2 pending 쿠키·live run", { cookie: "pending:levi2probe", url: runUrl });
await guard("G3 쿠키0·정적 run", {
  cookie: null,
  url: `${SHELL}/incidents/${INCIDENT_ID}?run=${STATIC_RUN_ID}`,
});

// ── 축 B ───────────────────────────────────────────────────────────────────────
const base = await realEvents();
const firstEvidence = base.find((e) => e.type === "step.evidence");
if (!firstEvidence) {
  console.error("step.evidence 0건 — 심을 대상 없음(무대 불성립)");
  await browser.close();
  process.exit(2);
}
const targetId = firstEvidence.payload.evidence.evidenceId;
const maxSeq = base.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);

async function badgeColumn(label, { plant }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // 🔴 **가드 통과와 API 통과는 다른 문이다.** `pending:` 쿠키는 셸 가드는 지나지만
  //    `/api/*` 는 ai-api 가 모르는 id 라 401 이다 — 그래서 배지 열은 «진짜» 세션으로 선다.
  const jar = (process.env.COOKIE_HEADER ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const at = c.indexOf("=");
      return { name: c.slice(0, at), value: c.slice(at + 1), url: SHELL, sameSite: "Lax" };
    });
  await ctx.addCookies(jar);
  const page = await ctx.newPage();

  let wsClosed = 0;
  await page.routeWebSocket(/\/api\/ws\/runs\//, (ws) => {
    wsClosed += 1;
    ws.close();
  });

  let ofCalls = 0;
  let nonArray = 0;
  await page.route(/\/api\/runs\/[^/]+\/events/, async (route) => {
    ofCalls += 1;
    const got = await route.fetch();
    const body = await got.json();
    if (!Array.isArray(body)) {
      // 🔴 배열이 아니면 «이벤트 열»이 아니다(401 오류 객체 등). 심지 않고 그대로 흘린다 —
      //    이 열은 초록도 빨강도 아니고, 아래 판정이 badges 0 으로 잡는다.
      nonArray += 1;
      await route.fulfill({ response: got });
      return;
    }
    if (plant) {
      body.push({
        seq: maxSeq + 1,
        ts: new Date().toISOString(),
        type: "evidence.flagged",
        payload: { items: [{ evidenceId: targetId, flags: ["imperative"] }] },
      });
    }
    await route.fulfill({ response: got, body: JSON.stringify(body) });
  });

  await page.goto(runUrl, { waitUntil: "domcontentloaded" });
  // 🔴 고정 대기 금지 — 근거 카드가 «설 때까지» 기다린다(두 열의 공통 닻).
  await page
    .waitForFunction(() => document.querySelectorAll('[data-testid="evidence-card"]').length > 0, null, {
      timeout: 25_000,
    })
    .catch(() => {});
  if (plant) {
    await page
      .waitForFunction(
        () => document.querySelectorAll('[data-testid="evidence-flag-badge"]').length > 0,
        null,
        { timeout: 25_000 },
      )
      .catch(() => {});
  } else {
    // 대조군엔 기다릴 «양수»가 없다 — 자극 열이 배지를 세운 그 시점까지를 같은 닻으로 준다.
    await page.waitForTimeout(3_000);
  }

  const cards = await page.locator('[data-testid="evidence-card"]').count();
  const badges = await page.locator('[data-testid="evidence-flag-badge"]').count();
  const badgeIds = await page
    .locator('[data-testid="evidence-flag-badge"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-evidence-id")));
  const shot = `${OUT}/badge-${label.split(" ")[0]}.png`;
  if (badges > 0) {
    await page
      .locator('[data-testid="evidence-flag-badge"]')
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
  }
  await page.screenshot({ path: shot, fullPage: false });
  say({
    axis: "B",
    col: label,
    plantedId: plant ? targetId : null,
    ofCalls,
    nonArray,
    wsClosed,
    cards,
    badges,
    badgeIds,
    shot,
  });
  await ctx.close();
  return { ofCalls, nonArray, badges };
}

const stim = await badgeColumn("B-STIM", { plant: true });
const ctrl = await badgeColumn("B-CTRL", { plant: false });
await browser.close();

// ── 판정 ──────────────────────────────────────────────────────────────────────
if (stim.ofCalls === 0 || stim.nonArray === stim.ofCalls) {
  console.log(JSON.stringify({ verdict: "불성립", why: "자극 열 가로채기 0건 — 심은 것이 화면에 탈 길이 없었다" }));
  process.exit(2);
}
const pass = stim.badges > 0 && ctrl.badges === 0;
console.log(
  JSON.stringify({
    verdict: pass ? "PASS" : "FAIL",
    rule: "B-STIM badges>0 && B-CTRL badges==0",
    stim: stim.badges,
    ctrl: ctrl.badges,
  }),
);
process.exit(pass ? 0 : 1);
