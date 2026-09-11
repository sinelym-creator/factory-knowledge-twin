/** E-7 자기 확인 — 412×600 · replay 모드(🔴 구독 0) · 승인 뒤 화면이 «다음 자리»를 말하는가.
 *  재는 것: ① 승인 버튼의 실제 잠김(disabled + 계산된 opacity) ② 결과 카드와 두 출구의 실재. */
const _pw = await import("file:///C:/Users/sinel/repos/_wt/senku2-m1/tests/web/node_modules/@playwright/test/index.js");
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = process.argv[2] ?? "http://127.0.0.1:8802";
const OUT = process.argv[3] ?? "e7-412x600.png";
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${B}/`, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/overview/, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
console.log("sid:", sid ? "있음" : "🔴 없음(측정 불가)");
const woId = await page.evaluate(async (sid) => {
  const r = await fetch("/api/scenarios/GS-01/runs", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: sid, mode: "replay" }) });      // 🔴 replay — 구독 호출 0
  if (!r.ok) throw new Error(`run 생성 ${r.status}`);
  const { runId } = await r.json();
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await (await fetch(`/api/runs/${runId}`)).json();
    if (s.status !== "running") { if (!s.workOrderDraftId) throw new Error("WO 없음"); return s.workOrderDraftId; }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("run timeout");
}, sid);
console.log("woId:", woId);
await page.goto(`${B}/work-orders/${encodeURIComponent(woId)}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="wo-approve"]', { timeout: 20000 });
const before = await page.evaluate(() => ({
  state: document.querySelector('[data-testid="wo-screen"]')?.getAttribute("data-state"),
  approveDisabled: document.querySelector('[data-testid="wo-approve"]')?.disabled,
  approveOpacity: getComputedStyle(document.querySelector('[data-testid="wo-approve"]')).opacity,
  result: document.querySelectorAll('[data-testid="wo-result"]').length,
}));
console.log("승인 전:", JSON.stringify(before));
await page.getByTestId("wo-approve").click();
await page.getByTestId("wo-confirm").click({ timeout: 7000 }).catch(async () => {
  await page.getByRole("button", { name: /승인/ }).last().click();
});
await page.waitForFunction(() => document.querySelector('[data-testid="wo-screen"]')?.getAttribute("data-state") !== "pending", null, { timeout: 20000 });
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const a = document.querySelector('[data-testid="wo-approve"]');
  const r = document.querySelector('[data-testid="wo-result"]');
  const rect = (el) => el ? (() => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null;
  return {
    state: document.querySelector('[data-testid="wo-screen"]')?.getAttribute("data-state"),
    approveDisabled: a?.disabled, approveOpacity: getComputedStyle(a).opacity,
    rejectOpacity: getComputedStyle(document.querySelector('[data-testid="wo-reject"]')).opacity,
    result: document.querySelectorAll('[data-testid="wo-result"]').length,
    resultText: r?.innerText.replace(/\n+/g, " / ") ?? null,
    incident: rect(document.querySelector('[data-testid="wo-result-incident"]')),
    overview: rect(document.querySelector('[data-testid="wo-result-overview"]')),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log("승인 후:", JSON.stringify(after, null, 1));
await page.screenshot({ path: OUT, fullPage: true });
console.log("스크린샷:", OUT);
await br.close();
