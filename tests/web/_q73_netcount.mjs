/**
 * Q-73 열 N — 두 화면의 네트워크를 «세기만» 한다.
 *
 * 🔴 여기서 원인을 «말하지» 않는다. URL 별 건수와 간격을 찍고, 정해진 창 안에서
 *    500ms 이상 조용한 구간(= networkidle 조건)이 있었는지 여부만 남긴다.
 *    못 센 것은 못 셌다고 적는다.
 *
 *     FKT_WEB_BASE=https://… node _q73_netcount.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101";
const WINDOW_MS = 30_000; // 관측 창 — 적재 후 이만큼 더 본다
const IDLE_MS = 500; // playwright networkidle 의 정의와 같은 값

const targets = [
  ["/overview", "스파크라인 칸이 쓰는 화면"],
  ["/evidence/GP-not-a-doc-chunk", "계약 밖 kind 칸이 쓰는 화면"],
];

const b = await chromium.launch();
for (const [path, why] of targets) {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const events = []; // {t, url, method}
  page.on("request", (r) => events.push({ t: Date.now(), url: r.url(), method: r.method() }));
  // 🔴 «시작»만 세면 안 끝나는 요청을 못 본다 — networkidle 은 «떠 있는 연결»이 0 이어야 뜬다.
  const inflight = new Map(); // req -> 시작 t
  const done = new Map(); // req -> 종료 t
  page.on("request", (r) => inflight.set(r, Date.now()));
  page.on("requestfinished", (r) => { done.set(r, Date.now()); inflight.delete(r); });
  page.on("requestfailed", (r) => { done.set(r, Date.now()); inflight.delete(r); });

  const t0 = Date.now();
  let loaded = "—";
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
    loaded = `load ${Date.now() - t0}ms status=${res?.status()}`;
  } catch (e) {
    loaded = `load 실패: ${String(e.message).split("\n")[0].slice(0, 60)}`;
  }
  const tLoad = Date.now();
  await page.waitForTimeout(WINDOW_MS);
  const tEnd = Date.now();

  // ── 적재 «후» 창에서만 센다(적재 자체의 폭주는 별개다)
  const after = events.filter((e) => e.t >= tLoad);
  const byUrl = new Map();
  for (const e of after) {
    const u = new URL(e.url);
    const key = `${e.method} ${u.origin === BASE ? u.pathname : u.host + u.pathname}`;
    const rec = byUrl.get(key) ?? { n: 0, ts: [] };
    rec.n += 1;
    rec.ts.push(e.t);
    byUrl.set(key, rec);
  }
  // ── 조용한 구간: 창 안에서 IDLE_MS 이상 요청이 없던 최장 구간
  const marks = [tLoad, ...after.map((e) => e.t), tEnd].sort((a, b2) => a - b2);
  let quietMax = 0;
  for (let i = 1; i < marks.length; i += 1) quietMax = Math.max(quietMax, marks[i] - marks[i - 1]);

  console.log(`\n== ${path}  (${why})`);
  console.log(`   ${loaded} · 관측 창 ${(tEnd - tLoad) / 1000}s · 창 안 요청 ${after.length}건`);
  console.log(`   최장 «새 요청 없음» 구간 ${quietMax}ms  (🔴 이것만으로는 networkidle 을 말하지 못한다)`);
  // 🔴 networkidle 의 «직접» 대응물: 떠 있는 연결이 0 인 구간이 IDLE_MS 이상 «있었는가».
  const timeline = [];
  for (const [r, t] of inflight) timeline.push({ t, d: +1 }, { t: Infinity, d: -1 });
  for (const [r, t] of done) timeline.push({ t: (inflight.get(r) ?? t), d: 0 });
  const starts = events.map((e) => ({ t: e.t, d: +1 }));
  const ends = [...done.values()].map((t) => ({ t, d: -1 }));
  const marks2 = [...starts, ...ends].sort((a, b3) => a.t - b3.t || a.d - b3.d);
  let cur = 0, zeroFrom = tLoad, firstIdle = null;
  for (const m of marks2) {
    if (cur === 0 && m.d === +1 && m.t - zeroFrom >= IDLE_MS && firstIdle === null) firstIdle = m.t - tLoad;
    cur += m.d;
    if (cur === 0) zeroFrom = m.t;
  }
  if (firstIdle === null && cur === 0 && tEnd - zeroFrom >= IDLE_MS) firstIdle = zeroFrom - tLoad;
  console.log(`   🔴 «떠 있는 연결 0» 이 ${IDLE_MS}ms 이상 유지된 첫 시점: ${firstIdle === null ? "창(30s) 안에 없음 ⇒ networkidle 도달 못 함" : `적재+${firstIdle}ms`}`);
  const stuck = [...inflight.entries()].map(([r, t]) => ({ url: r.url(), ms: tEnd - t }));
  console.log(`   창 끝에 «떠 있는» 요청 ${stuck.length}건 ⇒ networkidle ${stuck.length ? "불가(연결이 안 닫힌다)" : "가능"}`);
  for (const s2 of stuck.slice(0, 6)) console.log(`     ${String(s2.ms).padStart(6)}ms 째 미완  ${s2.url.slice(0, 100)}`);
  const rows = [...byUrl.entries()].sort((a, b2) => b2[1].n - a[1].n).slice(0, 8);
  for (const [key, rec] of rows) {
    const gaps = rec.ts.slice(1).map((t, i) => t - rec.ts[i]);
    const avg = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
    console.log(`     ${String(rec.n).padStart(4)}회  간격평균 ${avg === null ? "—" : avg + "ms"}  ${key.slice(0, 92)}`);
  }
  await ctx.close();
}
await b.close();
