/** CAP3 독검 드릴 — 계약 v0.2.4 의 상한 두 축과 `/live/status` 형상 (리바이2 61대 · 선작성)
 *
 *  🔴 판정선은 전부 «정본의 어느 줄»에서 왔는지 적는다(발주 문면이 아니라 계약 원문):
 *    A ①ⓐ 「`FKT_RUN_CAP_PER_SESSION` 기본값 5 → 3 · v0.1.12 `429 session_run_cap_exceeded` 형상 불변」
 *    B ①ⓑ 「`FKT_RUN_CAP_GLOBAL_PER_HOUR` 기본 3 · 초과 시 `429 live_hourly_cap_exceeded`
 *           `detail { limit, used, remaining: 0, retryAfterSec }` + `Retry-After` 헤더」
 *      ①   「어느 하나라도 거절이면 계수하지 않는다(거절은 소모가 아니다)」 · 「replay 0」
 *    C ②  「`?sessionId` 가 있으면 `runCap` 옆에 `hourlyCap { limit, used, remaining, nextFreeInSec }`」
 *    D ②  「`online:true` 응답은 v0.1.2 형상 그대로(필드 추가 0 · 기존 소비자 무영향)」
 *    E ②  「`reason` enum `gateway_unreachable` | `synthesis_failing` | `hourly_cap_exhausted`」
 *      개정「`reason` 을 실을 때 `until`(iso · 선택)을 함께 싣는다」
 *
 *  구독 0: 게이트웨이 «자리»에는 `tests/api/t61_gateway_stub.py` 가 선다(계약 형상 200 · Claude 호출 0).
 *          스텁 JSONL 의 줄 수 = 자극 실재 칸 — 0 줄이면 어느 색도 아니다.
 *
 *  node cap3_api_drill.mjs <apiBase> <axis> [N]
 *    axis: session | global | shape | calib | all
 */
const [BASE, AXIS = "all", N = "4"] = process.argv.slice(2);
if (!BASE) { console.error("usage: <apiBase> <axis> [N]"); process.exit(2); }
const j = (r) => r.json().catch(() => null);

/* 🔴 **세션은 쿠키로 산다**(`set-cookie: fkt_sid=...`). 본문 `sessionId` 만 실어 보내면
   앞 문(`session_required`)에서 401 로 끊기고, 상한 코드는 «한 번도 돌지 않는다» —
   1차 교정에서 4발 전부 401 이 나 이 드릴이 그 자리를 밟지도 못했음이 드러났다.
   그래서 세션마다 제 쿠키를 들고 다닌다(자동 저장이 없는 fetch 라 손으로 나른다). */
async function newSession() {
  const r = await fetch(`${BASE}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const b = await j(r);
  if (!b?.sessionId) throw new Error(`세션 발급 실패 ${r.status}`);
  const setc = r.headers.getSetCookie?.() ?? [];
  const jar = setc.map((c) => c.split(";")[0]).join("; ");
  if (!jar) throw new Error("세션 쿠키가 없다 — 이 무대에서는 상한 축을 잴 수 없다");
  return { id: b.sessionId, jar };
}
async function startRun(session, mode = "live", scenario = "GS-01") {
  const sessionId = session.id ?? session;
  const r = await fetch(`${BASE}/api/scenarios/${scenario}/runs`, {
    method: "POST", headers: { "content-type": "application/json", cookie: session.jar ?? "" },
    body: JSON.stringify({ sessionId, mode }),
  });
  const body = await j(r);
  return { status: r.status, code: body?.error?.code ?? null, detail: body?.error?.detail ?? null,
           retryAfter: r.headers.get("retry-after"), runId: body?.runId ?? null,
           /* 🔴 «새 run 인가»를 대상이 말하게 한다(`X-FKT-Run-Reused`). 재사용은 계수되지
              않으므로(정본 ① 「v0.1.14 재사용 0」) 재사용 발은 자극이 «아니다» — 이 칸을
              안 보면 4발을 쐈는데 used 가 1 인 것을 「상한이 안 걸렸다」로 오독한다. */
           reused: (r.headers.get("x-fkt-run-reused") ?? "").toLowerCase() === "true",
           capLimit: r.headers.get("x-fkt-run-cap-limit") };
}

/* 🔴 재사용 판정은 「같은 세션 × 시나리오 × mode 의 «비종결» run」이다(`_reusable_run`).
   이 무대의 시나리오는 GS-01 하나뿐이라, 다음 발이 «새 run» 이 되려면 앞 run 이 끝나야 한다.
   기다리지 않고 연타하면 2발째부터 전부 재사용으로 접히고 상한은 영영 안 걸린다(실측). */
async function waitTerminal(session, runId, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await fetch(`${BASE}/api/runs/${runId}`, { headers: { cookie: session.jar ?? "" } });
    const b = await j(r);
    const st = b?.status ?? b?.state ?? null;
    if (st && ["completed", "failed", "stopped", "cancelled"].includes(String(st))) return st;
    await new Promise((res) => setTimeout(res, 800));
  }
  return "timeout";
}
/* 🔴 peek — 계약 v0.1.15 「읽어서 답한다 · 계수 0」. 거절이 소모가 아님을 이 값으로 잰다. */
async function peek(session) {
  const sessionId = session.id ?? session;
  const r = await fetch(`${BASE}/api/live/status?sessionId=${encodeURIComponent(sessionId)}`, { headers: { cookie: session.jar ?? "" } });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch {}
  return { raw: t, bytes: Buffer.byteLength(t, "utf8"), online: b?.online ?? null,
           reason: b?.reason ?? null, until: b?.until ?? null,
           runCap: b?.runCap ?? null, hourlyCap: b?.hourlyCap ?? null };
}

async function axisSession(n) {
  const s = await newSession();
  const before = await peek(s);
  console.log(`[A 세션 상한] sessionId=${s.id} · 前 runCap=${JSON.stringify(before.runCap)}`);
  const rows = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await startRun(s, "live");
    rows.push(r);
    let term = "-";
    if (r.runId && !r.reused) term = await waitTerminal(s, r.runId);
    const mid = await peek(s);
    console.log(`  발 ${i} | status ${r.status} · code ${r.code ?? "-"} · 재사용 ${r.reused ? "O(자극 아님)" : "X"} · 종결 ${term} · used ${mid.runCap?.used ?? "?"} · Retry-After ${r.retryAfter ?? "-"}`);
  }
  const after = await peek(s);
  console.log(`  後 runCap=${JSON.stringify(after.runCap)} · hourlyCap=${JSON.stringify(after.hourlyCap)}`);
  /* 🔴 「거절은 소모가 아니다」 — 거절이 한 건이라도 있었으면 그 뒤 used 가 «거절 수만큼» 늘지 않아야 한다. */
  const rejected = rows.filter((r) => r.status === 429).length;
  console.log(`  거절 ${rejected}건 · used ${before.runCap?.used ?? "?"} → ${after.runCap?.used ?? "?"}`);
  return { rows, before, after };
}

async function axisGlobal() {
  /* 정본 ①ⓑ 「프로세스 단위 · 세션 무관」 — 세션을 나눠 쏴야 «전역»을 재는 것이다.
     세션 상한(3)에 걸리지 않도록 세션마다 1발씩만 쏜다. */
  const sessions = [];
  for (let i = 0; i < 4; i += 1) sessions.push(await newSession());
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await startRun(sessions[i], "live");
    rows.push(r);
    if (r.runId && !r.reused) await waitTerminal(sessions[i], r.runId);
    console.log(`[B 전역] 세션${i + 1} 1발 | status ${r.status} · code ${r.code ?? "-"} · Retry-After ${r.retryAfter ?? "-"} · detail ${r.detail ? JSON.stringify(r.detail) : "-"}`);
  }
  /* replay 무영향 — 정본 ① 「replay 0」 */
  const rep = await startRun(sessions[3], "replay");
  console.log(`[B 전역] replay 1발 | status ${rep.status} · code ${rep.code ?? "-"}  ← 정본 「replay 0」`);
  const p = await peek(sessions[3]);
  console.log(`[B 전역] 거절 세션 peek | runCap=${JSON.stringify(p.runCap)} · hourlyCap=${JSON.stringify(p.hourlyCap)}`);
  return { rows, rep, p };
}

async function axisShape() {
  const s = await newSession();
  const withId = await peek(s);
  const r = await fetch(`${BASE}/api/live/status`, { headers: { cookie: s.jar } });
  const raw = await r.text();
  console.log(`[D 형상] sessionId 없음 | ${raw}`);
  console.log(`[D 형상] 바이트 ${Buffer.byteLength(raw, "utf8")} · 키 ${Object.keys(JSON.parse(raw)).sort().join(",")}`);
  console.log(`[C 형상] sessionId 있음 | runCap=${JSON.stringify(withId.runCap)} · hourlyCap=${JSON.stringify(withId.hourlyCap)}`);
  console.log(`[E 형상] reason=${withId.reason ?? "(없음)"} · until=${withId.until ?? "(없음)"}`);
  return { raw, withId };
}

/* 🔴 교정 게이트 — 이 드릴이 429 를 «실제로» 알아보는가.
   상한을 낮춘 무대에서 반드시 429 가 서야 한다. 안 서면 이 드릴의 초록은 판정력이 없다. */
async function axisCalib(expectRejectAt) {
  const s = await newSession();
  let seen = null;
  for (let i = 1; i <= expectRejectAt; i += 1) {
    const r = await startRun(s, "live");
    let term = "-";
    if (r.runId && !r.reused) term = await waitTerminal(s, r.runId);
    console.log(`  교정 발 ${i} | status ${r.status} · code ${r.code ?? "-"} · 재사용 ${r.reused ? "O" : "X"} · 종결 ${term}`);
    if (r.status === 429) { seen = i; break; }
  }
  if (seen === null) { console.log("== 교정 불성립 — 낮춘 상한에서도 429 를 못 봤다 =="); process.exit(2); }
  console.log(`== 교정 참 — ${seen}발째에 429 를 봤다 ==`);
}

if (AXIS === "session" || AXIS === "all") await axisSession(Number(N));
if (AXIS === "global" || AXIS === "all") await axisGlobal();
if (AXIS === "shape" || AXIS === "all") await axisShape();
if (AXIS === "calib") await axisCalib(Number(N));
