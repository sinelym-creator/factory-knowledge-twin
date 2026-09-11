/** E-7 — 승인 «직후»에 무엇이 일어나는가(폐하 실기기 증상 재현). 읽기 전용 관측 · 구독 0(replay 축).
 *
 * 찍는 것: 승인 POST 의 status·body · `wo-screen[data-state]` · 두 버튼의 disabled ·
 *          화면이 주는 «다음 행동» 링크/버튼 · 콘솔 오류 · run 상태와 events 꼬리.
 * 판정하지 않는다 — 판정문은 evidence 가 한다.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright");

const BASE = process.argv[2] ?? "http://127.0.0.1:8196";
const MODE = process.argv[3] ?? "replay";

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 600 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
p.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));

const calls = [];
p.on("response", async (r) => {
  const u = r.url();
  if (/\/api\/work-orders\/[^/]+\/(approve|reject)/.test(u)) {
    let body = "";
    try { body = (await r.text()).slice(0, 200); } catch { body = "(unreadable)"; }
    calls.push({ url: u.replace(BASE, ""), status: r.status(), body });
  }
});

await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForURL(/\/overview$/, { timeout: 20000 }).catch(() => {});
const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value ?? null;

/* 조사 한 판 — replay 축(구독 0) */
const started = await p.evaluate(async ({ mode, s }) => {
  const r = await fetch("/api/scenarios/GS-01/runs", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: s, mode }),
  });
  return { status: r.status, body: await r.json() };
}, { mode: MODE, s: sid });
console.log("run start:", started.status, JSON.stringify(started.body).slice(0, 120));

const runId = started.body.runId;
await p.goto(`${BASE}/incidents/${started.body.incidentId}?run=${runId}`, { waitUntil: "domcontentloaded" });
await p.getByTestId("run-console").waitFor({ timeout: 30000 }).catch(() => {});
/* 🔴 live 축은 hold 스텁이 붙잡아 «영원히» 돈다 — 구독을 태우지 않으려 스텁을 썼으니,
   완주시키려면 붙잡은 것을 «거둔다». 몇 건을 풀었는지 계수로 남긴다(0 이면 자극이 없던 것). */
await p.waitForTimeout(4000);
const released = await fetch("http://127.0.0.1:8858/release", { method: "POST" })
  .then((r) => r.json()).then((j) => j.released).catch(() => -1);
console.log("hold released:", released);
await p.waitForFunction(
  () => document.querySelector('[data-testid="run-console"]')?.getAttribute("data-status") === "completed",
  null, { timeout: 90000 },
).catch(() => console.log("run did not reach completed in 90s"));

/* 작업지시 초안으로 */
const woHref = await p.evaluate(() =>
  Array.from(document.querySelectorAll('a[href*="/work-orders/"]')).map((a) => a.getAttribute("href"))[0] ?? null);
console.log("wo link from run screen:", woHref);
if (!woHref) { console.log("무대 없음 — run 화면에 작업지시 링크가 없다"); await b.close(); process.exit(2); }
await p.goto(BASE + woHref, { waitUntil: "domcontentloaded" });
await p.getByTestId("wo-screen").waitFor({ timeout: 20000 });

const snap = async (label) => {
  const s = await p.evaluate(() => {
    const q = (t) => document.querySelector(`[data-testid="${t}"]`);
    const btn = (t) => { const e = q(t); return e ? { visible: true, disabled: e.hasAttribute("disabled") } : { visible: false }; };
    const nextLinks = Array.from(document.querySelectorAll('[data-testid="wo-screen"] a, [data-testid="wo-actions"] a'))
      .map((a) => `${(a.textContent || "").trim().slice(0, 20)} -> ${a.getAttribute("href")}`);
    return {
      state: q("wo-screen")?.getAttribute("data-state") ?? null,
      saveState: (q("wo-save-state")?.textContent || "").trim(),
      approve: btn("wo-approve"), reject: btn("wo-reject"),
      error: (q("wo-error")?.textContent || "").trim() || null,
      history: Array.from(document.querySelectorAll('[data-testid="wo-history"] li')).map((li) => (li.textContent || "").trim().slice(0, 60)),
      nextLinks,
      url: location.pathname + location.search,
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

await snap("BEFORE:");
await p.getByTestId("wo-approve").click();
await p.waitForTimeout(500);
/* 확인 모달의 확인 버튼 — 문면을 지어내지 않고 dialog 안의 버튼을 훑는다 */
const dlg = p.locator('[role="dialog"], [role="alertdialog"]');
if (await dlg.count()) {
  const bs = dlg.last().locator("button");
  for (let i = 0, n = await bs.count(); i < n; i += 1) {
    const t = (await bs.nth(i).innerText().catch(() => "")).trim();
    if (t && t !== "취소" && t.indexOf("✕") === -1) { console.log("modal confirm:", t); await bs.nth(i).click().catch(() => {}); break; }
  }
}
await p.waitForTimeout(2500);
await snap("AFTER :");
/* 승인 «직후» 화면 그대로 한 장 — 폐하가 본 것과 같은 폭(412×600). */
await p.locator('[data-testid="wo-actions"]').scrollIntoViewIfNeeded().catch(() => {});
await p.waitForTimeout(400);
/* 🔴 개인 절대경로를 적지 않는다(ci hygiene 게이트). 기본은 이 프로브 «옆»이고,
   다른 자리에 찍으려면 `FKT_SHOT` 으로 덮는다 — 다른 사람의 체크아웃에서도 같은 자리를 가리킨다. */
await p.screenshot({ path: process["env"].FKT_SHOT ?? new URL("./e7-after-approve.png", import.meta.url).pathname });
const visual = await p.evaluate(() => {
  const a = document.querySelector('[data-testid="wo-approve"]');
  const cs = a ? getComputedStyle(a) : null;
  return a ? { text: (a.textContent || "").trim(), opacity: cs.opacity, cursor: cs.cursor, disabled: a.hasAttribute("disabled") } : null;
});
console.log("approve button visual:", JSON.stringify(visual));

console.log("approve/reject calls:", JSON.stringify(calls));
const run = await p.evaluate(async (id) => {
  const r = await fetch(`/api/runs/${id}`); const j = await r.json();
  const ev = await (await fetch(`/api/runs/${id}/events`)).json();
  return { status: j.status ?? null, tail: ev.slice(-3).map((e) => e.type) };
}, runId);
console.log("run after approve:", JSON.stringify(run));
console.log("console errors:", JSON.stringify(errors.slice(0, 5)));
await b.close();
