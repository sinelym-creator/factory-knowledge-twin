/** CAP3-R ① — D-1 수리를 «두 방향»으로 묻는다 (리바이2 61대)
 *
 *  정본 v0.2.4 ① = 「어느 하나라도 거절이면 **계수하지 않는다**(거절은 소모가 아니다)」.
 *
 *  🔴 앞 창(#967)은 **전역 방향만** 쟀다. 처방이 두 계수기를 «예약-확정 2단» 으로 묶었다면
 *     반대 방향(세션 거절 뒤 전역 used)이 **새로 깨질 수 있는 자리**다 — 그래서 둘 다 센다.
 *
 *  🔴 **대조군이 이 파일의 절반이다.** 「거절 뒤 불변」만 보면 «아무것도 세지 않는 계수기»도
 *     초록이다. 그래서 「통과한 발은 양쪽이 **정확히 1** 올라간다」를 같은 실행에서 확인한다.
 *     그 참이 없으면 불변 0 은 보장이 아니라 「계측기가 못 보는 것」이다.
 *
 *  node cap3_d1_both_ways.mjs <apiBase>
 */
const [BASE] = process.argv.slice(2);
if (!BASE) { console.error("usage: <apiBase>"); process.exit(2); }

async function newSession() {
  const r = await fetch(`${BASE}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const b = await r.json();
  const jar = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!jar) throw new Error("세션 쿠키 없음");
  return { id: b.sessionId, jar };
}
async function startRun(s, mode = "live") {
  const r = await fetch(`${BASE}/api/scenarios/GS-01/runs`, {
    method: "POST", headers: { "content-type": "application/json", cookie: s.jar },
    body: JSON.stringify({ sessionId: s.id, mode }),
  });
  const b = await r.json().catch(() => null);
  return { status: r.status, code: b?.error?.code ?? null, runId: b?.runId ?? null,
           reused: (r.headers.get("x-fkt-run-reused") ?? "").toLowerCase() === "true" };
}
async function waitTerminal(s, runId, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const b = await (await fetch(`${BASE}/api/runs/${runId}`, { headers: { cookie: s.jar } })).json().catch(() => null);
    if (b?.status && ["completed", "failed", "stopped"].includes(b.status)) return b.status;
    await new Promise((r) => setTimeout(r, 700));
  }
  return "timeout";
}
/* peek — 계약 v0.1.15 「읽어서 답한다 · 계수 0」 */
async function peek(s) {
  const b = await (await fetch(`${BASE}/api/live/status?sessionId=${encodeURIComponent(s.id)}`, { headers: { cookie: s.jar } })).json();
  return { session: b.runCap?.used ?? null, global: b.hourlyCap?.used ?? null,
           sLimit: b.runCap?.limit ?? null, gLimit: b.hourlyCap?.limit ?? null };
}

/* ── 대조군: 통과한 발은 양쪽이 정확히 1 올라간다 ───────────────────────── */
const c = await newSession();
const c0 = await peek(c);
const cr = await startRun(c, "live");
if (cr.runId && !cr.reused) await waitTerminal(c, cr.runId);
const c1 = await peek(c);
const dS = c1.session - c0.session, dG = c1.global - c0.global;
console.log(`[대조군] 통과 1발 | 세션 used ${c0.session}→${c1.session}(Δ${dS}) · 전역 used ${c0.global}→${c1.global}(Δ${dG})`);
if (dS !== 1 || dG !== 1) {
  console.log("== 대조군 불성립 — 통과한 발이 양쪽 1 을 올리지 않는다. 이 실행의 「불변」은 값이 아니다 ==");
  process.exit(2);
}
console.log("[대조군] 참 — 계수기 둘 다 살아 있다");

/* ── 방향 A: 세션 상한에 걸린 거절이 «전역» 을 소모하는가 ───────────────── */
const a = await newSession();
for (let i = 0; i < (c1.sLimit ?? 3); i += 1) {
  const r = await startRun(a, "live");
  if (r.runId && !r.reused) await waitTerminal(a, r.runId);
  if (r.status === 429) break;
}
const a0 = await peek(a);
const ar = await startRun(a, "live");
const a1 = await peek(a);
console.log(`[방향 A] 세션 거절 | status ${ar.status} · code ${ar.code} | 전역 used ${a0.global}→${a1.global} ${a0.global === a1.global ? "불변 ✔" : "🔴 늘었다"} | 세션 used ${a0.session}→${a1.session} ${a0.session === a1.session ? "불변 ✔" : "🔴 늘었다"}`);
const aOk = ar.status === 429 && ar.code === "session_run_cap_exceeded" && a0.global === a1.global && a0.session === a1.session;

/* ── 방향 B: 전역 상한에 걸린 거절이 «세션» 을 소모하는가 (#967 D-1) ────── */
let bOk = null, rows = [];
for (let k = 1; k <= 4; k += 1) {
  const s = await newSession();
  const p0 = await peek(s);
  if (p0.global >= (p0.gLimit ?? 3)) {
    const r = await startRun(s, "live");
    const p1 = await peek(s);
    const same = p0.session === p1.session;
    rows.push({ k, status: r.status, code: r.code, from: p0.session, to: p1.session, same });
    console.log(`[방향 B] 회차${rows.length} | status ${r.status} · code ${r.code} | 세션 used ${p0.session}→${p1.session} ${same ? "불변 ✔" : "🔴 늘었다"}`);
    if (rows.length >= 3) break;
  } else {
    const r = await startRun(s, "live");
    if (r.runId && !r.reused) await waitTerminal(s, r.runId);
  }
}
if (rows.length) bOk = rows.every((r) => r.status === 429 && r.code === "live_hourly_cap_exceeded" && r.same);
else console.log("[방향 B] 전역 포화를 만들지 못했다 — 이 축은 «불성립»(측정 실패가 아니다)");

console.log(`== 방향 A ${aOk ? "PASS" : "🔴 FAIL"} · 방향 B ${bOk === null ? "불성립" : bOk ? "PASS" : "🔴 FAIL"} (B 표본 ${rows.length}) ==`);
