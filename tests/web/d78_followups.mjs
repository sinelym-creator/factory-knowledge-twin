/**
 * D-78 추가 3칸 — 1회차에서 못 갈랐거나 안 잰 것을 닫는다.
 *  ⓐ 🔴 **완주 «후» 라벨 재측정** — 1회차는 `applied===total` 을 본 «순간» 읽어 리렌더 전 값을
 *     받았다(내 계측기 흠). 여기서는 도달 뒤 상태가 «가라앉을» 시간을 주고 다시 읽는다.
 *  ⓑ 축 ⑤ 겹침 프레임 — 끝에 닿는 순간 연타해 「재생 중 클릭은 항상 일시정지」 가드를 흔든다.
 *     🔴 못 만들면 「미재현」이 아니라 «무대를 만들지 못함»으로 적는다(대상이 아니라 내 진술).
 *  ⓒ 서버 `mode=replay` run — 계약상 fixture 부재면 501 이 «참»이다.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i+1] ? process.argv[i+1] : d; };
const BASE = arg("base"), OUT = arg("out"), PERIOD = Number(arg("period","220"));
const STATIC = "/incidents/INC-2026-014?run=STATIC-GS-01";
const readPlay = async (p) => { const b = p.locator('[data-testid="replay-play"]');
  return (await b.count()) ? { atEnd: await b.first().getAttribute("data-at-end"),
    label: (await b.first().innerText()).replace(/\s+/g," ").trim() } : { atEnd:null, label:null }; };
const readCur = async (p) => { const c = p.locator('[data-testid="replay-cursor"]');
  return (await c.count()) ? { applied: Number(await c.first().getAttribute("data-applied")),
    total: Number(await c.first().getAttribute("data-total")) } : { applied:null, total:null }; };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const p = await ctx.newPage();
const out = { base: BASE, wall: new Date().toISOString() };
await p.goto(BASE + STATIC, { waitUntil:"domcontentloaded", timeout:60000 });
await p.waitForTimeout(2500);
for (const s of ['[data-testid="tour-skip"]','[aria-label="안내 닫기"]']) {
  const l = p.locator(s); if (await l.count()) { await l.first().click().catch(()=>{}); await p.waitForTimeout(300); } }

const start = await readCur(p);
out.start = { ...start, ...(await readPlay(p)) };

// ── ⓐ 되감고 완주까지 간 «뒤» 상태가 가라앉기를 기다려 읽는다 ─────────────
await p.locator('[data-testid="replay-play"]').first().click();
const t0 = Date.now();
let reached = false;
while (Date.now() - t0 < start.total * PERIOD + 8000) {
  const c = await readCur(p);
  if (c.applied === start.total) { reached = true; break; }
  await p.waitForTimeout(40);
}
out.reachedEnd = reached;
out.atArrival = await readPlay(p);              // 도달 «순간» (1회차와 같은 시점)
await p.waitForTimeout(PERIOD * 4);             // 🔴 리렌더가 가라앉을 시간
out.afterSettle = { ...(await readPlay(p)), ...(await readCur(p)) };

// ── ⓑ 겹침 프레임: 끝에 닿는 순간 연타 ────────────────────────────────────
await p.locator('[data-testid="replay-play"]').first().click();   // 다시 되감아 재생
const t1 = Date.now();
const shots = [];
let fired = 0;
while (Date.now() - t1 < start.total * PERIOD + 8000) {
  const c = await readCur(p);
  if (c.applied >= start.total - 1 && fired < 3) {   // 끝 직전/직후 창에서 연타
    await p.locator('[data-testid="replay-play"]').first().click().catch(()=>{});
    fired++;
    shots.push({ ms: Date.now()-t1, appliedAtClick: c.applied, ...(await readPlay(p)), after: (await readCur(p)).applied });
  }
  if (c.applied === start.total && fired >= 3) break;
  await p.waitForTimeout(30);
}
await p.waitForTimeout(PERIOD * 3);
out.axis5 = { clicksFired: fired, shots, endState: { ...(await readPlay(p)), ...(await readCur(p)) } };
// 🔴 「되감겼는가」가 가드 위반의 표지다 — 재생 중 클릭이 처음으로 되감으면 라벨과 거동이 어긋난다.
out.axis5.rewoundOnOverlapClick = shots.some((s) => s.after !== null && s.after < s.appliedAtClick && s.appliedAtClick >= start.total - 1);

// ── ⓒ 서버 mode=replay run ────────────────────────────────────────────────
out.serverReplay = await p.evaluate(async () => {
  const post = async (mode) => {
    try {
      const s = await fetch("/api/sessions", { method: "POST", credentials: "include" });
      const r = await fetch("/api/scenarios/GS-01/runs", { method: "POST", credentials: "include",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { sessionStatus: s.status, status: r.status, json: j, raw: t.slice(0, 200) };
    } catch (e) { return { error: String(e).slice(0,150) }; }
  };
  return await post("replay");
});
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ reachedEnd: out.reachedEnd, atArrival: out.atArrival, afterSettle: out.afterSettle,
  axis5_clicks: out.axis5.clicksFired, axis5_rewound: out.axis5.rewoundOnOverlapClick,
  axis5_end: out.axis5.endState, serverReplayStatus: out.serverReplay.status }, null, 1));
await b.close();
