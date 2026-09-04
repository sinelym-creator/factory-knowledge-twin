/**
 * T7-38 화면 축 — 「상한 계수가 «화면에» 서는가」. 리바이2 42대.
 *
 * 🔴 **「무대가 그랬다」와 「화면이 그렸다」는 다른 사실이다.** ai-api 헤더가 맞다고 화면이
 *    그것을 그린다는 뜻이 아니다 — 그래서 API 그물(`tests/api/t738_runcap_probe.mjs`)과 **따로** 낸다.
 * 🔴 **손잡이는 처방이 «선언한» 것으로만**: `data-runcap-limit`·`-used`·`-remaining`
 *    (`live-status.tsx:266~268`). 화면에서 열거해 확인한 뒤 쓴다.
 * 🔴 **빨강 확인** = 대조군 셸 `:8106`(처방 없는 빌드 · 산출물 grep 0건)에서 같은 그물이 rc=1.
 *
 *   node t738_runcap_screen.mjs --shell=http://127.0.0.1:8109 --limit=2
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8109");
const LIMIT = Number(arg("limit", "2"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const rec = (n, ok, d) => {
  rows.push({ n, ok, d });
  console.log(`${ok ? "✓ " : "🔴"} ${n}${d ? " · " + d : ""}`);
};

const READ = () =>
  (() => {
    const e = document.querySelector("[data-runcap-limit]");
    return e
      ? {
          present: true,
          limit: e.getAttribute("data-runcap-limit"),
          used: e.getAttribute("data-runcap-used"),
          remaining: e.getAttribute("data-runcap-remaining"),
          text: (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        }
      : { present: false, nodes: document.querySelectorAll("[data-runcap-limit]").length };
  })();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* 🔴 **안 도는 갈래는 강제한다.** `RunCapCounter` 는 `mode !== "live"` 면 `null` 을 돌려준다
   (`live-status.tsx:250`). 내 무대에는 synthesis 게이트웨이가 없어 `/api/live/status` 가
   `online:false` 이고, 그러면 이 배지는 **한 줄도 안 그려진다** — 그 「없음」은 처방의 결함이
   아니라 무대 조건이다. 그래서 «관측자 쪽»에서 그 한 칸만 참으로 만든다.
   🔴 자극은 셸의 `/api` 로 건다 — 브라우저는 ai-api 를 직접 부르지 않는다. */
const page = await ctx.newPage();
let liveForced = 0;
await page.route("**/api/live/status*", async (route) => {
  const r = await route.fetch();
  const j = await r.json().catch(() => ({}));
  liveForced += 1;
  await route.fulfill({ response: r, json: { ...j, online: true } });
});
await page.goto(SHELL + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
await sleep(1200);
const enter = page.locator('[data-testid="enter-button"]');
if (await enter.count().then((n) => n > 0).catch(() => false)) {
  await enter.first().click().catch(() => {});
  await sleep(3500);
}

/* ── 축 ② 새 세션 = 0/N ───────────────────────────────────────────────────── */
const s0 = await page.evaluate(READ);
rec("🔴 자극 증인 — live:true 로 바꿔 준 응답 수 > 0", liveForced > 0, `실측 ${liveForced}건`);
rec("계수 손잡이가 화면에 있다(data-runcap-*)", s0.present, s0.present ? `limit=${s0.limit} used=${s0.used} remaining=${s0.remaining}` : "없음");
if (!s0.present) {
  console.log("\n[T7-38 화면] 🔴 FAIL — 손잡이 없음(처방 미적재이거나 이 화면에 안 붙는다)");
  await browser.close();
  process.exit(1);
}
rec(`새 세션 = 0/${LIMIT}`, s0.used === "0" && s0.limit === String(LIMIT), `실측 ${s0.used}/${s0.limit}`);

/* ── 축 ③ live 1회 → 즉시 1/N ─────────────────────────────────────────────── */
for (const sel of ['[data-testid="start-from-alarm"]', '[data-testid="start-from-headline"]']) {
  const l = page.locator(sel);
  try {
    await l.first().waitFor({ state: "visible", timeout: 45000 });
  } catch {
    continue;
  }
  await l.first().click().catch(() => {});
  await page.waitForURL(/[?&]run=/, { timeout: 40000 }).catch(() => {});
  break;
}
await sleep(3000);
const s1 = await page.evaluate(READ);
rec(`live 1회 뒤 화면 = 1/${LIMIT}`, s1.used === "1", `실측 ${s1.used}/${s1.limit} remaining=${s1.remaining}`);

/* ── 축 ⑥ 문면이 수치와 맞는가 ────────────────────────────────────────────── */
rec("배지 문면이 계수와 어긋나지 않는다", !!s1.text && !/NaN|undefined/.test(s1.text), `「${s1.text}」`);

const bad = rows.filter((r) => !r.ok);
console.log(bad.length === 0 ? "\n[T7-38 화면] PASS" : `\n[T7-38 화면] 🔴 FAIL — ${bad.map((b) => b.n).join(" · ")}`);
console.log("\n🔴 안 잼: 상한 도달 화면 문면(429 배너)은 세션을 2회 태워야 서므로 API 그물이 답한다 · 미연결 열 · 창 만료 화면.");
await browser.close();
process.exit(bad.length === 0 ? 0 : 1);
