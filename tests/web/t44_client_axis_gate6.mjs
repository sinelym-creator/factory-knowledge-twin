/**
 * t44_client_axis_gate6 — Gate 6 §32.7 중 **외부에서 자극을 줄 수 없는 행**을 관측자 쪽으로 옮겨 잰다.
 *
 * 🔴 **왜 옮기는가.** 공개 대상의 의존을 부수는 것은 파괴 경계 밖이다(운영자 시연 자산).
 *    그래서 자극을 **대상이 아니라 관측자(브라우저)** 에 둔다 — `evidence/t4-4-stimulus-equivalence-control.md`
 *    가 이 치환을 **「클라이언트 축 한정」으로 조건부 성립** 시켰고, 금지 범위도 거기 적혀 있다:
 *    ① `why` 문면을 값으로 쓰는 자리 ② 서버가 그리는 데이터 층. 이 그물은 그 두 곳에 안 들어간다.
 *
 * 🔴 **자극 지점 = 셸 자신의 `/api/**`.** 브라우저는 ai-api 를 한 번도 직접 부르지 않는다
 *    (`lib/contract.ts` 의 호출은 상대 경로 · ai-api 로는 셸 «서버»가 나간다). ai-api 오리진을
 *    막는 자극은 아무 데도 닿지 않는다 — 17대가 초안에서 틀렸던 자리다.
 *
 * 🔴 **두 자극을 뭉개지 않는다.** 같은 «미연결»이라도 자극이 다르면 다른 행이다:
 *
 *      refused    연결이 즉시 «거부»된다        → §32.7 「FastAPI OFF」
 *      blackhole  accept 후 상한까지 «안 답한다» → §32.7 「Tunnel OFF」(bounded timeout 이 발화)
 *
 *    뭉치면 「상한이 있다」와 「화면이 그 상한을 쓴다」를 영영 못 가른다(13대 계보).
 *
 * 🔴 **검출기는 `gate6_offline_probe.mjs` 와 같은 것을 쓴다** — `mode-badge` 의 «미연결» 낱말,
 *    `static-replay-offer`/`fallback-banner`, 그리고 「빈 화면이 아니다」 대조군. 그물이 두 벌이
 *    되면 두 벌이 갈라지고, 그때 어느 쪽이 정본인지 아무도 모른다.
 *
 * 🔴 **자극 도달을 «센다».** 가로챈 요청이 0건이면 아무것도 안 막은 것이고, 그 «미연결 없음»은
 *    대상의 성질이 아니라 배선의 침묵이다.
 *
 *      FKT_WEB_BASE   재는 셸 (외부판은 URL 만 바꾼다)
 *      FKT_BOUND_MS   앱 상한 정본값(기본 2000 = lib/contract.ts:357 TIMEOUT_MS)
 *
 * exit: 0 = 잰 행 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const WEB = process.env.FKT_WEB_BASE;
const BOUND_MS = Number(process.env.FKT_BOUND_MS ?? 2000);
// 🔴 **관측 창은 «대상의 시계»보다 길어야 한다.** 배지는 `components/live-status.tsx:27`
//    `POLL_MS = 30_000` 으로 묻는다 — 25s 창에서는 자극 뒤 «한 번도 안 물어보고» 창이 끝나고,
//    그 「미연결 안 뜸」은 대상이 아니라 **내 창**의 것이다(실측으로 한 번 물렸다).
const WATCH_MS = Number(process.env.FKT_WATCH_MS ?? 60000);
if (!WEB) {
  console.log("🔴 측정 불가 — `FKT_WEB_BASE` 를 명시하라(기본값 없음 · Q-62).");
  process.exit(2);
}

const browser = await chromium.launch();

/** gate6_offline_probe 와 «같은» 검출기. 한 벌만 둔다. */
async function snap(page) {
  return page
    .evaluate(() => {
      const b = document.querySelector("[data-testid=mode-badge]");
      return {
        badge: b ? (b.textContent ?? "").replace(/\s+/g, " ").trim() : "(없음)",
        offer: !!document.querySelector("[data-testid=static-replay-offer]"),
        banner: !!document.querySelector("[data-testid=fallback-banner]"),
      };
    })
    .catch(() => null);
}

/**
 * @param stim "none" | "refused" | "blackhole"
 */
async function column(label, stim) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 🔴 입장은 «자극 전»에 끝낸다 — 입장 자체를 막으면 재는 것이 배지가 아니라 입장이 된다.
  await page.goto(WEB + "/", { waitUntil: "commit", timeout: 45_000 }).catch(() => {});
  await page.waitForURL(/\/overview$/, { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const before = await snap(page);

  let hits = 0;
  let pollAt = null;   // 🔴 배지가 «묻기 시작한» 시각 — 화면 반응은 여기서부터 재야 한다
  const cuts = [];
  if (stim !== "none") {
    await page.route("**/api/**", async (route) => {
      hits += 1;
      const t = Date.now();
      // 🔴 **「상한이 있다」와 「화면이 그 상한을 쓴다」는 다른 사실이다**(13대 계보).
      //    배지는 30s 마다 «묻는다» — 자극 시각부터 재면 그 30s 가 값에 섞여 상한이 안 보인다.
      //    그래서 «묻기 시작한 시각»을 따로 잡고, 화면 반응을 거기서부터 잰다.
      if (pollAt === null && /live\/status/.test(route.request().url())) pollAt = t;
      if (stim === "refused") {
        await route.abort("connectionrefused");
      } else {
        // 블랙홀 — accept 한 뒤 상한을 «넘겨» 붙잡는다. 앱의 AbortSignal 이 먼저 끊어야 한다.
        await new Promise((r) => setTimeout(r, BOUND_MS * 4));
        await route.abort("timedout").catch(() => {});
      }
      cuts.push(Date.now() - t);
    });
  }

  const t0 = Date.now();
  let offlineAt = null;
  let offerAt = null;
  const flips = [];
  let prev = null;
  const deadline = Date.now() + WATCH_MS;
  while (Date.now() < deadline) {
    const s = await snap(page);
    if (s) {
      const key = `${s.badge}|${s.offer}|${s.banner}`;
      if (key !== prev) {
        flips.push({ ms: Date.now() - t0, ...s });
        prev = key;
      }
      if (offlineAt === null && /미연결/.test(s.badge)) offlineAt = Date.now() - t0;
      if (offerAt === null && (s.offer || s.banner)) offerAt = Date.now() - t0;
      if (offlineAt !== null && offerAt !== null) break;
    }
    await page.waitForTimeout(50);
  }
  const chars = ((await page.locator("body").innerText().catch(() => "")) ?? "").replace(/\s+/g, "").length;
  await ctx.close();

  return { label, stim, before, hits, cuts, offlineAt, offerAt, chars, flips, pollAt, t0 };
}

const rows = [];
rows.push(await column("기준선(자극 없음)", "none"));
rows.push(await column("FastAPI OFF ≈ 연결 거부", "refused"));
rows.push(await column("Tunnel OFF ≈ 블랙홀", "blackhole"));

console.log(`\n== Gate 6 관측자 축 치환 — ${WEB} (앱 상한 정본 ${BOUND_MS}ms)`);
for (const r of rows) {
  console.log(`\n  ${r.label}`);
  console.log(`    자극 도달   가로챈 /api 요청 ${r.hits}건${r.stim === "none" ? " (기준선은 0 이 맞다)" : r.hits === 0 ? "  🔴 0 = 아무것도 안 막았다" : ""}`);
  if (r.cuts.length) {
    console.log(`    끊긴 시각   ${r.cuts.map((c) => c + "ms").join(" · ")}`);
  }
  console.log(`    ⓐ 미연결   ${r.offlineAt !== null ? r.offlineAt + "ms" : "관측 안 됨"}`);
  console.log(`    ⓑ Replay   ${r.offerAt !== null ? r.offerAt + "ms" : "관측 안 됨"}`);
  console.log(`    빈 화면 아님 ${r.chars}자 · 자극 전 배지 ${JSON.stringify(r.before?.badge ?? "?")}`);
  for (const f of r.flips.slice(0, 6)) {
    console.log(`      ${String(f.ms).padStart(6)}ms  제안=${f.offer ? "○" : "✕"} 배너=${f.banner ? "○" : "✕"}  ${JSON.stringify(f.badge)}`);
  }
}

const base = rows[0];
const refused = rows[1];
const black = rows[2];
const bad = [];

// 🔴 기준선이 자극과 «구분»되어야 이 대조가 무언가를 가른다.
if (base.offlineAt !== null) bad.push("기준선에서 이미 «미연결» 이다 — 자극이 아무것도 안 가른다");

if (refused.hits === 0) bad.push("FastAPI OFF 자극이 «닿지 않았다»(가로챈 요청 0)");
if (black.hits === 0) bad.push("Tunnel OFF 자극이 «닿지 않았다»(가로챈 요청 0)");
// 🔴 「전환」을 재려면 «전환 «전»» 상태가 있어야 한다. 공개 Sandbox 는 `online:false` 가
//    정본(ops.py:57~58)이라 배너가 «늘» 떠 있다 — 그러면 이 축은 자극 유무로 안 갈린다.
//    있는 것을 초록으로도 빨강으로도 쓰지 않고 «도달 불가»로 인쇄한다.
const offerMeasurable = base.offerAt === null;
if (refused.offlineAt === null)
  bad.push("FastAPI OFF ≈ 연결 거부에서 «미연결 표시» 가 안 온다");
if (offerMeasurable && refused.offerAt === null)
  bad.push("FastAPI OFF ≈ 연결 거부에서 «Replay 전환» 이 안 온다");
if (black.offlineAt === null) bad.push("Tunnel OFF ≈ 블랙홀에서 «미연결 판정» 이 안 온다");
if (refused.chars === 0 || black.chars === 0) bad.push("빈 화면이다 — 낱말 0 은 무엇도 증명하지 않는다");

console.log("\n  ── 판정 재료 ──");
console.log(`  기준선 미연결 ${base.offlineAt === null ? "없음(옳다)" : "🔴 있음"} · 제안·배너 ${base.offerAt === null ? "없음" : `이미 있음(${base.offerAt}ms)`}`);
if (base.offerAt !== null) {
  console.log("  🔴 ⓑ 「Replay 전환」 = **도달 불가**(초록 아님) — 공개 Sandbox 는 `online:false` 가 정본이라");
  console.log("     배너가 «늘» 떠 있다. «전환 전» 상태가 없으므로 이 축은 이 환경에서 자극으로 안 갈린다.");
  console.log("     재관측 좌표 = 합성 게이트웨이가 서는 자리(로컬) 또는 배너 없는 빌드.");
}
const react = (r) => (r.pollAt !== null && r.offlineAt !== null ? r.offlineAt - (r.pollAt - r.t0) : null);
console.log(`  🔴 「상한이 있다」  블랙홀 요청을 붙잡은 시간 = ${black.cuts.length ? Math.min(...black.cuts) + "ms" : "미측(창 안에 안 풀림)"} · 정본 상한 ${BOUND_MS}ms`);
console.log(`  🔴 「화면이 그 상한을 쓴다」  **묻기 시작한 뒤** 미연결까지 — 블랙홀 ${react(black) ?? "미측"}ms ↔ 연결 거부 ${react(refused) ?? "미측"}ms`);
console.log(`     (자극 시각부터 세면 ${black.offlineAt}ms / ${refused.offlineAt}ms 지만 그 안의 대부분은 폴링 주기 30s 다 — 층을 갈라 적는다)`);
console.log(`  🔵 두 자극이 «다른 행» 임을 가르는 값 = 연결 거부 미연결 ${refused.offlineAt}ms ↔ 블랙홀 ${black.offlineAt}ms`);
console.log("\n  🔴 이 그물이 «안 잰» 축 = 서버가 그리는 데이터 층(§3-2 금지 범위 ②) · `why` 문면(①).");

if (bad.length) {
  console.log(`\n결과: 어긋남 ${bad.length}건`);
  for (const b of bad) console.log(`  🔴 ${b}`);
} else {
  console.log("\n결과: 잰 행 전건 기대대로");
}
await browser.close();
process.exit(bad.length ? 1 : 0);
