/**
 * T7-23 축② — X-15 멱등의 **사용자 경로** 열(더블클릭). 리바이2 39대.
 *
 * API 축에서는 같은 본문 2회 동시 POST 가 run 을 2개 만들었다(D-48 후보). 그러나 정본 §6 의
 * 자극은 「**사용자 더블클릭**」이다 — 클라이언트 가드가 먼저 막으면 사용자는 그 결함을 못 만난다.
 * 🔴 **도달 가능성 ≠ 발견 가능성**: API 로 뚫린다고 화면에서도 뚫린다고 적으면 안 된다.
 *
 * 세는 방법 = 브라우저가 «받은» 응답에서 나온 **서로 다른 runId 수**. 화면 문면이 아니라
 * 네트워크에서 세는 이유는, 화면이 마지막 run 만 보여 주면 둘 생겨도 하나로 보이기 때문이다.
 *
 * 사용: node t723x_double_click_ui.mjs --web=http://127.0.0.1:8799
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const WEB = arg("web", "http://127.0.0.1:8799");
const TESTID = arg("testid", "start-from-headline");

const b = await chromium.launch();

/** 한 열 = 새 컨텍스트 · 새 세션. `clicks` 만 다르다 — 손잡이 하나. */
async function column(label, clicks) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  const runIds = new Set();
  const posts = [];
  p.on("response", async (res) => {
    const u = res.url();
    if (!/\/runs(\?|$)|\/runs\//.test(u) && !/scenarios\/[^/]+\/runs/.test(u)) return;
    posts.push(`${res.request().method()} ${u.replace(WEB, "")} → ${res.status()}`);
    try {
      const t = await res.text();
      for (const m of t.matchAll(/"(RUN-[A-Za-z0-9_-]+)"/g)) runIds.add(m[1]);
    } catch {}
  });
  await p.goto(WEB + "/overview", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(`[data-testid=${TESTID}]`, { timeout: 20000 });
  const btn = p.locator(`[data-testid=${TESTID}]`).first();
  const t0 = Date.now();
  const notes = [];
  if (clicks === 1) {
    await btn.click().catch((e) => notes.push("1클릭 실패: " + String(e.message).split("\n")[0].slice(0, 50)));
  } else {
    /* 🔴 «진짜» 더블클릭 — 첫 클릭이 화면을 옮겨도 두 번째가 «갔는지»를 값으로 남긴다.
       두 번째가 못 갔으면 그건 「멱등이라 하나」가 아니라 「자극이 하나뿐이었다」다. */
    const a = await btn.click({ timeout: 5000 }).then(() => "감").catch((e) => "못 감: " + String(e.message).split("\n")[0].slice(0, 40));
    const b2 = await btn.click({ timeout: 1500, force: true }).then(() => "감").catch((e) => "못 감: " + String(e.message).split("\n")[0].slice(0, 40));
    notes.push(`클릭① ${a} · 클릭② ${b2}`);
  }
  await p.waitForTimeout(6000);
  const out = { label, clicks, runIds: [...runIds], distinct: runIds.size, posts: posts.slice(0, 8), notes, ms: Date.now() - t0 };
  await c.close();
  return out;
}

/* 🔴 자극 열을 «먼저» — 대조군이 앞서면 그 run 이 슬롯·속도 제한을 잡아 자극을 먹는다(39대 자수). */
const stim = await column("자극: 더블클릭", 2);
const ctl = await column("대조군: 한 번만", 1);

const counterWorks = ctl.distinct === 1;
const bothClicksLanded = stim.notes.join(" ").includes("클릭① 감") && stim.notes.join(" ").includes("클릭② 감");
const verdict = !counterWorks
  ? "미검증(대조군이 1 을 안 냄 — 계수기를 못 믿는다)"
  : !bothClicksLanded
    ? `미검증(자극이 한 번만 갔다 — ${stim.notes.join(" ")})`
    : stim.distinct === 1
      ? "PASS"
      : "FAIL";

console.log(`\n=== X-15 사용자 경로(더블클릭) · web=${WEB} · 손잡이=[data-testid=${TESTID}] ===`);
for (const r of [stim, ctl]) {
  console.log(`\n[${r.label}] 클릭 ${r.clicks}회 · **서로 다른 runId 수=${r.distinct}** ${JSON.stringify(r.runIds)}`);
  console.log(`  네트워크: ${JSON.stringify(r.posts)}`);
  if (r.notes.length) console.log(`  비고: ${r.notes.join(" · ")}`);
}
console.log(`\n판정: ${verdict}`);
console.log(`빨강 확인: ${counterWorks ? `✓ 1회 클릭 → 1 종 ↔ 2회 클릭 → ${stim.distinct} 종 (같은 실행 · 서로 다른 컨텍스트)` : "✗ 대조군 열이 1 이 아니다"}`);
await b.close();
if (!counterWorks) process.exit(2);
