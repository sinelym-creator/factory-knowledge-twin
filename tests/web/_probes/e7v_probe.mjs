/** E-7v 독검 — 종단 화면의 «출구»가 서는가. 한 열(무대 하나)을 통째로 찍는다.
 *
 * 축: ① 종단에서 승인·반려 버튼 count ② `wo-final`·`wo-exit` 존재와 문면 ③ 출구 클릭 착지
 *     ④ pending 대조군(버튼 1/1 · final/exit 0) ⑤ 반려 경로 1회 · 스크린샷 1장.
 * 구독 0: live 축이지만 게이트웨이는 hold 스텁이고, 붙잡힌 것은 거둬서 완주시킨다.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const BASE = process.argv[2];
const TAG = process.argv[3] ?? "col";
const SHOT = process.argv[4] ?? "";
if (!BASE) { console.error("usage: <base> <tag> [screenshot path]"); process.exit(2); }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 600 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
const calls = [];
p.on("response", async (r) => {
  if (/\/api\/work-orders\/[^/]+\/(approve|reject)/.test(r.url())) {
    let body = ""; try { body = (await r.text()).slice(0, 120); } catch { body = "?"; }
    calls.push({ op: r.url().split("/").pop(), status: r.status(), body });
  }
});

const snap = () => p.evaluate(() => {
  const q = (t) => document.querySelector(`[data-testid="${t}"]`);
  const n = (t) => document.querySelectorAll(`[data-testid="${t}"]`).length;
  return {
    state: q("wo-screen")?.getAttribute("data-state") ?? null,
    approve: n("wo-approve"), reject: n("wo-reject"),
    approveDisabled: q("wo-approve")?.hasAttribute("disabled") ?? null,
    final: n("wo-final"), finalText: (q("wo-final")?.textContent || "").trim().slice(0, 60) || null,
    exit: n("wo-exit"), exitHref: q("wo-exit")?.getAttribute("href") ?? null,
    saveState: (q("wo-save-state")?.textContent || "").trim(),
  };
});

/** 새 세션으로 작업지시 초안 하나를 만든다(live + hold 스텁 → 구독 0). */
async function freshDraft() {
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/overview$/, { timeout: 20000 }).catch(() => {});
  const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value ?? null;
  const st = await page.evaluate(async (s) => {
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s, mode: "live" }),
    });
    return r.json();
  }, sid);
  await page.goto(`${BASE}/incidents/${st.incidentId}?run=${st.runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await fetch("http://127.0.0.1:8858/release", { method: "POST" }).catch(() => {});
  await page.waitForFunction(
    () => document.querySelector('[data-testid="run-console"]')?.getAttribute("data-status") === "completed",
    null, { timeout: 90000 },
  ).catch(() => {});
  const href = await page.evaluate(() =>
    document.querySelector('a[href*="/work-orders/"]')?.getAttribute("href") ?? null);
  await page.close();
  return { href, incidentId: st.incidentId };
}

async function decide(kind) {
  const d = await freshDraft();
  if (!d.href) return { kind, error: "작업지시 링크 없음 — 무대가 서지 않았다" };
  await p.goto(BASE + d.href, { waitUntil: "domcontentloaded" });
  await p.getByTestId("wo-screen").waitFor({ timeout: 20000 });
  const before = await snap();
  await p.getByTestId(kind === "approve" ? "wo-approve" : "wo-reject").click();
  await p.waitForTimeout(600);
  const dlg = p.locator('[role="dialog"], [role="alertdialog"]');
  if (await dlg.count()) {
    const box = dlg.last().locator('textarea, input[type="text"]');
    if (kind === "reject" && (await box.count())) await box.first().fill("독검용 사유");
    const bs = dlg.last().locator("button");
    for (let i = 0, m = await bs.count(); i < m; i += 1) {
      const t = (await bs.nth(i).innerText().catch(() => "")).trim();
      if (t && t !== "취소" && t.indexOf("✕") === -1) { await bs.nth(i).click().catch(() => {}); break; }
    }
  }
  await p.waitForTimeout(2500);
  const after = await snap();
  if (SHOT && kind === "approve") {
    await p.locator('[data-testid="wo-actions"]').scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(400);
    await p.screenshot({ path: SHOT });
  }
  let landed = null;
  if (after.exit >= 1) {
    const from = p.url();
    await p.getByTestId("wo-exit").click().catch(() => {});
    await p.waitForFunction((u) => location.href !== u, from, { timeout: 12000 }).catch(() => {});
    await p.waitForTimeout(1200);
    landed = new URL(p.url()).pathname + " ids=" + (await p.locator("[data-testid]").count());
  }
  return { kind, before, after, landed, incidentId: d.incidentId };
}

const approved = await decide("approve");
console.log(TAG, "APPROVE:", JSON.stringify(approved));
const rejected = await decide("reject");
console.log(TAG, "REJECT :", JSON.stringify(rejected));

/* pending 대조군 — 결정을 내리지 않은 초안 */
const pend = await freshDraft();
if (pend.href) {
  await p.goto(BASE + pend.href, { waitUntil: "domcontentloaded" });
  await p.getByTestId("wo-screen").waitFor({ timeout: 20000 });
  const s = await snap();
  console.log(TAG, "PENDING:", JSON.stringify(s));
  if (SHOT) { await p.screenshot({ path: SHOT.replace(/\.png$/, "-pending.png") }); }
} else {
  console.log(TAG, "PENDING: 무대 없음");
}
console.log(TAG, "calls:", JSON.stringify(calls), "pageerrors:", JSON.stringify(errors.slice(0, 3)));
await b.close();
