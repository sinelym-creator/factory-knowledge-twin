/**
 * q39c_entry_drill — 입장 층이 «클라이언트 실행»으로 내려간 뒤에도 계약 v0.1.6 이 서는가.
 * (검증 좌석 · T3-3 D-3 단축 재검 · Q-39 ⓒ)
 *
 *   cd tests/web && node q39c_entry_drill.mjs
 *
 * 🔴 **왜 spec 이 아니라 따로 선 도구인가.** 재검 대상 중 하나가 «그 spec 자신»이다.
 *    같은 파일 안에서 재면 「그물이 초록이다」와 「대상이 옳다」가 한 문장이 된다.
 *    여기서는 브라우저·서버 양쪽을 내 눈으로 세고, spec 은 별도로 돈다.
 *
 * 🔴 **「생겼다 ≠ 선다」.** 세션 축은 네 곳에서 따로 잰다 —
 *      ⓐ 브라우저 쿠키(생겼나) ⓑ 응답 Set-Cookie(주었나) ⓒ ai-api 발급(서는 세션인가)
 *      ⓓ 그 쿠키로 `/api/*` 가 200 인가(쥐고 쓰는가). 앞의 셋이 0 이어도 ⓓ 가 죽으면
 *      그것은 「조용한 입장이 없다」가 아니라 「입장 자체가 없다」다.
 *
 * 🔴 **자극이 실재했는가부터.** 처방은 프리페치를 «막는» 것이 아니라 프리페치에 세션을
 *    «주지 않는» 것이다. 그러면 「세션 0」은 두 뜻을 갖는다 — 처방이 먹은 것과, 자극이
 *    아예 없던 것. 그래서 프리페치를 hover 로 «강제»하고 그 수를 센다. 0 건이면 그 행은
 *    초록도 빨강도 내지 않는다(exit 2).
 *
 * exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
 */
import { readFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101";
const API = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";
// 🔴 ai-api 의 access 로그. 「서는 세션이 몇 개 발급됐나」는 브라우저에서 안 보인다 —
//    서버 쪽에서 세지 않으면 이 축은 «못 잰» 것이지 0 이 아니다.
const API_LOG = process.env.FKT_API_LOG;
const DEEP_LINKS = ["/evidence/EV-2025-001", "/documents/DOC-MAN-0021"];
const SESSION_SCREEN = "/incidents/INC-2025-019";
const SETTLE_MS = 4000; // 11대 실측: networkidle 직후 0 → +2초에 2개. 기다린 뒤에 묻는다.

class Unmeasurable extends Error {}

/** ai-api 가 실제로 발급한 세션 수(누적). */
function issued() {
  if (!API_LOG) throw new Unmeasurable("FKT_API_LOG 가 없다 — ai-api 발급 축을 못 잰다");
  let text;
  try {
    text = readFileSync(API_LOG, "utf8");
  } catch (e) {
    throw new Unmeasurable(`ai-api 로그를 못 읽었다: ${e.message}`);
  }
  return (text.match(/"POST \/api\/sessions/g) ?? []).length;
}

/** 프리페치 표지·Set-Cookie 를 세는 눈을 페이지에 붙인다. */
function watch(page) {
  const seen = { prefetch: [], setCookie: [] };
  page.on("request", (r) => {
    const h = r.headers();
    if (h["next-router-prefetch"] || h["rsc"] || r.url().includes("_rsc=")) {
      seen.prefetch.push(new URL(r.url()).pathname);
    }
  });
  page.on("response", (r) => {
    if (r.headers()["set-cookie"]) seen.setCookie.push(new URL(r.url()).pathname);
  });
  return seen;
}

/** 셸 링크에 hover 해 프리페치를 «강제»한다 — 자극을 우연에 맡기지 않는다. */
async function forcePrefetch(page) {
  const links = await page.locator("a[href^='/']").all();
  for (const link of links.slice(0, 12)) {
    try {
      await link.hover({ timeout: 1000, force: true });
      await page.waitForTimeout(120);
    } catch {
      /* 화면 밖·가려진 링크는 건너뛴다 — 자극 «수»가 판정을 정한다 */
    }
  }
}

const rows = [];
function row(id, what, ok, note) {
  rows.push([id, what, ok, note]);
}

const browser = await chromium.launch();
let cannot = null;
try {
  // ── ① 딥링크 2행 — 열람은 되되 «조용한 입장»은 없다 ──────────────────────────
  for (const route of DEEP_LINKS) {
    const ctx = await browser.newContext({ baseURL: WEB });
    const page = await ctx.newPage();
    const seen = watch(page);
    const before = issued();
    await page.goto(route, { waitUntil: "networkidle" });
    const landed = new URL(page.url()).pathname;
    await forcePrefetch(page);
    await page.waitForTimeout(SETTLE_MS);
    const cookies = (await ctx.cookies()).map((c) => c.name);
    const after = issued();
    await ctx.close();

    if (seen.prefetch.length === 0) {
      throw new Unmeasurable(`${route} — 프리페치 표지 0건. 자극이 없으면 어느 색도 이 처방의 것이 아니다`);
    }
    row(`D3-1${route}`, "딥링크가 튕기지 않는다(열람 예외)", landed === route, landed);
    row(`D3-2${route}`, `🔴 +${SETTLE_MS / 1000}초 쿠키 0 (자극 ${seen.prefetch.length}건)`,
        cookies.length === 0, cookies.length ? cookies.join(",") : "0개");
    row(`D3-3${route}`, "🔴 응답 Set-Cookie 0", seen.setCookie.length === 0,
        seen.setCookie.length ? seen.setCookie.join(",") : "0건");
    row(`D3-4${route}`, "🔴 ai-api 발급 0 — 생겼다≠선다", after - before === 0, `${after - before}건`);
  }

  // ── ② T3-1 E-1 — 입장한 브라우저가 세션을 «쥐고 쓴다» ────────────────────────
  const ctx = await browser.newContext({ baseURL: WEB });
  const page = await ctx.newPage();
  const beforeEnter = issued();
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
  const names = (await ctx.cookies()).map((c) => c.name);
  const apiStatus = await page.evaluate(async () => (await fetch("/api/scenarios")).status);
  row("D3-5", "🔴 E-1 — 브라우저가 API 세션 쿠키를 쥐었다", names.includes("fkt_sid"), names.join(","));
  row("D3-6", "🔴 E-1 — 그 쿠키로 /api/* 가 200", apiStatus === 200, String(apiStatus));
  row("D3-7", "입장 1회 = ai-api 발급 1", issued() - beforeEnter === 1, `${issued() - beforeEnter}건`);

  // ── ③ 멱등 · GET 은 부작용 0 ────────────────────────────────────────────────
  const beforeAgain = issued();
  const again = await page.evaluate(async () => {
    const res = await fetch("/enter", { method: "POST" });
    return res.status;
  });
  row("D3-8", "🔴 재진입 POST /enter — 발급 0(멱등)", issued() - beforeAgain === 0,
      `${issued() - beforeAgain}건 · 응답 ${again}`);
  const getEnter = await page.evaluate(async () => (await fetch("/enter")).status);
  row("D3-9", "🔴 GET /enter = 405 — 프리페치·크롤러·주소창은 부작용 0", getEnter === 405, String(getEnter));
  await ctx.close();

  // ── ④ 무쿠키 «세션 화면» — 가드는 그대로 서 있다 ────────────────────────────
  const ctx4 = await browser.newContext({ baseURL: WEB });
  const page4 = await ctx4.newPage();
  const before4 = issued();
  await page4.goto(SESSION_SCREEN);
  await page4.waitForURL(/\/overview$/, { timeout: 15000 }).catch(() => {});
  const landed4 = new URL(page4.url()).pathname;
  const cookies4 = (await ctx4.cookies()).map((c) => c.name);
  await ctx4.close();
  row("D3-10", "무쿠키 세션 화면 → `/` → 입장 → /overview 착지", landed4 === "/overview", landed4);
  row("D3-11", "그 동선에서 세션이 «선다»(발급 1 · 쿠키 보유)",
      issued() - before4 === 1 && cookies4.includes("fkt_sid"), `발급 ${issued() - before4}건 · ${cookies4.join(",")}`);

  // ── ⑤ 딥링크 → 「세션을 만들고 조사 화면으로」 = 명시 입장 1회 ───────────────
  const ctx5 = await browser.newContext({ baseURL: WEB });
  const page5 = await ctx5.newPage();
  await page5.goto(DEEP_LINKS[0], { waitUntil: "networkidle" });
  const cta = page5.getByRole("link", { name: /세션을 만들고 조사 화면으로/ });
  const hasCta = (await cta.count()) > 0;
  let landed5 = "(링크 없음)";
  let delta5 = -1;
  if (hasCta) {
    const before5 = issued();
    await cta.first().click();
    await page5.waitForURL(/\/overview$/, { timeout: 15000 }).catch(() => {});
    landed5 = new URL(page5.url()).pathname;
    delta5 = issued() - before5;
  }
  const cookies5 = (await ctx5.cookies()).map((c) => c.name);
  await ctx5.close();
  row("D3-12", "🔴 딥링크의 «명시» 동선이 있다", hasCta, hasCta ? "링크 1" : "없음");
  row("D3-13", "그 동선 = /overview 착지 + 발급 «정확히» 1",
      landed5 === "/overview" && delta5 === 1, `${landed5} · 발급 ${delta5}건 · ${cookies5.join(",")}`);
} catch (e) {
  if (e instanceof Unmeasurable) cannot = e.message;
  else throw e;
} finally {
  await browser.close();
}

console.log(`대상      : web ${WEB} · api ${API}`);
console.log(`발급 정본 : ${API_LOG ?? "(없음)"}\n`);
let bad = 0;
for (const [id, what, ok, note] of rows) {
  bad += ok ? 0 : 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id.padEnd(34)} ${what.padEnd(52)} ${note}`);
}
if (cannot) {
  console.error(`\n측정 불가 — ${cannot}`);
  process.exit(2);
}
console.log(`\n결과: 어긋남 ${bad}건`);
process.exit(bad ? 1 : 0);
