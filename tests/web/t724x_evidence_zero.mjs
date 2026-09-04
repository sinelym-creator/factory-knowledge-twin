/**
 * T7-24 2차 · **X-23**(online:true 인데 근거 0건 → 화면이 「모른다」로 가는가) ·
 *            **X-13**(정본 `test-plan-v1.md:133` = 「**근거가 없는 질문** → 「모른다」 · **지어내지 않는다**」).
 * 리바이2 41대.
 *
 * 🔴 **끝난 run 의 화면 근거는 `GET /api/runs/<id>` 스냅샷으로 온다**(센쿠2 T7-32 #581).
 *    그래서 자극 경로는 그 JSON 재작성이고, 계수는 `snapshotRewritten` 델타로 «경로별로» 센다.
 * 🔴 **`live` 는 색인 없는 스택에서 근거 0** 이라 무효 — **`mode:"replay"` run 으로만** 잰다.
 * 🔴 **비어 있던 것을 비운 것은 증거가 아니다** — ai-api 직결에서 근거 길이 ≥1 을 «먼저» 확인한다.
 * 🔴 **`confidenceNote` 문장은 상류 원문 = 무대 인공물** → 판정 축에서 제외한다(값으로만 적는다).
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const API = arg("api", "http://127.0.0.1:8103");
const GW_ON = arg("on", "http://127.0.0.1:8812");
const GW_OFF = arg("off", "http://127.0.0.1:8811");
const SHELL = arg("shell", "http://127.0.0.1:8104");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = "";
const call = async (base, path, init = {}) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
};
const stage = async (base) => (await fetch(base + "/__stage").then((r) => r.json()).catch(() => null)) ?? {};

/** 스냅샷 안의 근거 배열 길이를 전부 모은다(키 이름은 게이트웨이가 비우는 것과 같은 세 개). */
const evidenceLens = (obj) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    for (const k of ["evidenceIds", "evidence", "citations"]) if (Array.isArray(n[k])) out.push({ k, len: n[k].length });
    for (const v of Object.values(n)) walk(v);
  };
  walk(obj);
  return out;
};
const totalLen = (arr) => arr.reduce((a, b) => a + b.len, 0);

/* ── ① replay run 을 만든다(ai-api 직결) ─────────────────────────────────── */
const sess = await call(API, "/api/sessions", { method: "POST", body: "{}" });
const SID = sess.json?.sessionId;
const scen = await call(API, "/api/scenarios");
const sid0 = (scen.json?.items ?? scen.json ?? [])[0]?.scenarioId;
if (!SID || !sid0) {
  console.log("🔴 세션/시나리오를 못 구했다 — 무대가 아니다. exit 2");
  process.exit(2);
}
const started = await call(API, `/api/scenarios/${sid0}/runs`, {
  method: "POST",
  body: JSON.stringify({ sessionId: SID, mode: "replay" }),
});
const runId = started.json?.runId;
const incidentId = started.json?.incidentId;
console.log(`replay run = ${runId} · incident = ${incidentId} · 응답 ${started.status} · mode=${started.json?.mode}`);
if (!runId) {
  console.log(`🔴 replay run 을 못 만들었다: ${started.text.slice(0, 160)} · exit 2`);
  process.exit(2);
}
await sleep(1500);

/* ── ② 대조군 — 상류가 «근거를 실제로 갖고 있었다» ──────────────────────── */
const direct = await call(API, `/api/runs/${runId}`);
const dLens = evidenceLens(direct.json);
const dTotal = totalLen(dLens);
console.log(`\n[대조군 · ai-api 직결] status=${direct.status} · 근거 배열 ${dLens.length}본 · 총 길이 **${dTotal}**`);
console.log(`   상세: ${JSON.stringify(dLens.slice(0, 8))}`);

/* ── ③ 자극 열(ON) — 게이트웨이 경유 ─────────────────────────────────────── */
const on0 = await stage(GW_ON);
const via = await call(GW_ON, `/api/runs/${runId}`);
await sleep(400);
const on1 = await stage(GW_ON);
const vLens = evidenceLens(via.json);
const vTotal = totalLen(vLens);
const dSnap = (on1.snapshotRewritten ?? 0) - (on0.snapshotRewritten ?? 0);
console.log(`\n[자극 · 게이트웨이 ON] status=${via.status} · 근거 총 길이 **${vTotal}** · snapshotRewritten Δ **${dSnap}**`);
console.log(`   lastSnapshotRewrite = ${JSON.stringify(on1.lastSnapshotRewrite ?? null)}`);
console.log(`   liveStatus online 서빙 = ${on1.liveStatusServed ?? "—"} · paired = ${JSON.stringify(on1.paired ?? null)}`);

/* ── ④ 🔴 빨강 확인 — 같은 실행의 «끔» 열 ──────────────────────────────── */
const offRes = await call(GW_OFF, `/api/runs/${runId}`);
const oLens = evidenceLens(offRes.json);
const oTotal = totalLen(oLens);
console.log(`\n[빨강 확인 · 게이트웨이 끔(--evidence-keys nosuchkey)] 근거 총 길이 **${oTotal}** (기대: 대조군과 같다 = ${dTotal})`);

/* ── ⑤ 화면 축 ───────────────────────────────────────────────────────────── */
const READ = () => {
  const t = (sel) => {
    const e = document.querySelector(sel);
    return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) : null;
  };
  const n = (sel) => document.querySelectorAll(sel).length;
  const links = Array.from(document.querySelectorAll('[data-testid="evidence-card"] a[href], [data-testid="evidence-strip"] a[href]')).map((a) => a.getAttribute("href"));
  return {
    url: location.pathname + location.search,
    strip: t('[data-testid="evidence-strip"]'),
    evidenceCards: n('[data-testid="evidence-card"]'),
    candidates: n('[data-testid="candidate"]'),
    candidatesIdle: t('[data-testid="candidates-idle"]'),
    rationale: t('[data-testid="candidate-rationale"]'),
    evidenceLinks: links,
    body: (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 260),
  };
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
/* 🔴 **화면의 근거가 «어느 응답»에 실려 오는지 직접 잡는다.** 「무대가 비웠는데 화면이 그린다」면
   비운 경로와 그린 경로가 다르다는 뜻이고, 그 이름을 모르면 판정을 못 쓴다. */
const carriers = [];
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  try {
    const t = await r.text();
    const ids = (t.match(/"(DOC-[A-Z0-9-]+@r\d+#\d+|GP-[0-9a-f]+-\d+|REC-[A-Za-z0-9-]+)"/g) ?? []).length;
    const keys = ["evidenceIds", "evidence", "citations"].filter((k) => t.includes('"' + k + '"'));
    if (ids > 0 || keys.length) carriers.push({ url: u.replace(SHELL, ""), status: r.status(), bytes: t.length, evidenceIdLike: ids, keys });
  } catch {}
});
await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
const eb = page.locator('[data-testid="enter-button"]');
if (await eb.count().then((x) => x > 0).catch(() => false)) {
  await eb.first().click().catch(() => {});
  await sleep(1800);
}
/* 🔴 **화면의 세션은 내 node 클라이언트의 세션이 아니다.** 첫 판에서 그대로 열었더니 화면이
   「서버가 이 조사를 찾지 못했습니다 — 다른 세션의 조사」라고 답했고, 그때의 «근거 0» 은
   비워서 0 이 아니라 **run 이 없어서 0** 이었다(0 의 뜻은 그 창이 정한다). 그래서 run 을
   **브라우저 안에서** 만든다 — 셸 → 게이트웨이(ON) → ai-api 로 같은 세션에서 흐른다. */
const made = await page.evaluate(async () => {
  const j = async (u, o) => (await fetch(u, { headers: { "content-type": "application/json" }, ...o })).json().catch(() => null);
  const s = await j("/api/sessions", { method: "POST", body: "{}" });
  const sc = await j("/api/scenarios");
  const sid = (sc?.items ?? sc ?? [])[0]?.scenarioId;
  const r = await j(`/api/scenarios/${sid}/runs`, { method: "POST", body: JSON.stringify({ sessionId: s?.sessionId, mode: "replay" }) });
  return { sessionId: s?.sessionId ?? null, scenarioId: sid ?? null, runId: r?.runId ?? null, incidentId: r?.incidentId ?? null, raw: r };
});
console.log(`
[화면 세션에서 만든 replay run] ${JSON.stringify(made)}`);
await sleep(1500);
await page.goto(`${SHELL}/incidents/${made.incidentId ?? incidentId}?run=${made.runId ?? runId}`, { waitUntil: "domcontentloaded" }).catch(() => {});
await sleep(4500);
const screen = await page.evaluate(READ);
screen.__madeRun = made.runId;
await ctx.close();
await browser.close();
const on2 = await stage(GW_ON);

console.log(`\n[화면] ${JSON.stringify(screen, null, 1)}`);
console.log(`화면까지 포함한 누계 Δ(자극 전 대비) — snapshotRewritten ${(on2.snapshotRewritten ?? 0) - (on0.snapshotRewritten ?? 0)} · pollingRewritten ${(on2.pollingRewritten ?? 0) - (on0.pollingRewritten ?? 0)} · upgradesProxied ${(on2.upgradesProxied ?? 0) - (on0.upgradesProxied ?? 0)} · upgradesBlocked ${(on2.upgradesBlocked ?? 0) - (on0.upgradesBlocked ?? 0)}`);
/* 🔴 **화면의 근거가 «어느 경로»로 왔는지가 판정을 가른다.** 스냅샷만 비우고 이벤트 경로로
   근거가 흐르면 화면은 그대로 19건을 그린다 — 그때의 초록/빨강은 둘 다 그 경로에 대한 말이 아니다. */
const screenPathDelta = {
  snapshot: (on2.snapshotRewritten ?? 0) - (on1.snapshotRewritten ?? 0),
  polling: (on2.pollingRewritten ?? 0) - (on1.pollingRewritten ?? 0),
  wsProxied: (on2.upgradesProxied ?? 0) - (on1.upgradesProxied ?? 0),
  wsBlocked: (on2.upgradesBlocked ?? 0) - (on1.upgradesBlocked ?? 0),
};
console.log(`화면 구간에서만의 경로 델타 = ${JSON.stringify(screenPathDelta)}`);
console.log(`
🔴 근거를 «싣고 온» 응답(브라우저가 실제로 받은 것):`);
for (const c of carriers.slice(-14)) console.log(`   ${c.status} ${c.url} · ${c.bytes}B · 근거id 유사 ${c.evidenceIdLike} · 키 ${JSON.stringify(c.keys)}`);

/* ── 판정 ────────────────────────────────────────────────────────────────── */
console.log("\n=============== 판정 ===============");
const controlHad = dTotal >= 1;
const emptied = vTotal === 0;
const rewrote = dSnap >= 1;
const redOk = oTotal === dTotal && oTotal >= 1;
console.log(`대조군: 상류가 근거를 갖고 있었다(총 ${dTotal} ≥ 1) = ${controlHad ? "✓" : "✗ — 비어 있던 것을 비운 것은 증거가 아니다"}`);
console.log(`자극: 게이트웨이가 비웠다(총 ${vTotal} = 0) = ${emptied ? "✓" : "✗"} · 경로 재작성 Δ ${dSnap} ≥ 1 = ${rewrote ? "✓" : "✗"}`);
console.log(`🔴 빨강 확인(같은 실행 · 끔 열에서 근거 원문 도착 ${oTotal}) = ${redOk ? "✓" : "✗"}`);
const stimulusReal = controlHad && emptied && rewrote && redOk;
const invented = (screen.evidenceLinks ?? []).length;
const cardsZero = screen.evidenceCards === 0;
const saysSomething = !!(screen.strip || screen.candidatesIdle || (screen.body ?? "").length > 0);
/* 🔴 화면이 그 run 을 «찾았는가»부터. 못 찾았으면 근거 0 은 «비워서 0» 이 아니다. */
const notFound = /찾지 못했|사라진 조사|다른 세션/.test(screen.body ?? "");
console.log(`화면이 그 run 을 찾았나 = ${notFound ? "✗ — 「찾지 못함」 문면이 떴다(이 창의 0 은 자극의 0 이 아니다)" : "✓"}`);
if (!stimulusReal) {
  console.log(`[X-23] **미검증** — 자극이 축에 안 닿았다(대조군 ${controlHad} · 비움 ${emptied} · 재작성 ${rewrote} · 빨강 ${redOk}).`);
} else {
  console.log(`화면: 근거 카드 ${screen.evidenceCards}건 · 후보 ${screen.candidates}건 · 근거 링크 ${invented}건 · 스트립 문면 ${JSON.stringify(screen.strip)}`);
  /* 🔴 **화면이 근거를 그렸다고 곧바로 FAIL 이 아니다.** 브라우저가 «실제로 받은» 응답에
     근거가 그대로 실려 있었다면, 그건 화면의 정직성 문제가 아니라 **내 자극이 그 경로에
     안 닿았다**는 뜻이다 — 초록도 빨강도 아니고 «미검증»이다. */
  const deliveredEvidence = carriers.reduce((a, c) => a + c.evidenceIdLike, 0);
  const stimulusHitScreenPath = deliveredEvidence === 0;
  console.log(`브라우저가 «받은» 응답에 남아 있던 근거 id 수 = **${deliveredEvidence}** (0 이어야 자극이 화면 경로에 닿은 것)`);
  console.log(
    `[X-23] ${
      notFound
        ? "**미검증(화면 축)** — 화면이 run 을 못 찾았다."
        : !stimulusHitScreenPath
          ? "**미검증(화면 축)** — 게이트웨이는 비웠는데 브라우저가 받은 응답엔 근거가 남아 있다: 자극이 화면이 읽는 경로에 «안 닿았다». API·스냅샷 축은 아래 값으로 성립."
          : cardsZero && invented === 0 && saysSomething
            ? "PASS(근거 0 을 정직하게 표기 · 지어낸 근거 링크 0 · 조용한 폴백 아님)"
            : "FAIL — 근거 0 인데 화면이 근거를 그린다"
    }`,
  );
  console.log(`[X-23 · API/스냅샷 축] **PASS** — 대조군 ${dTotal} → 게이트웨이 ON ${vTotal} · 끔 열 ${oTotal} · 재작성 경로 명시.`);
}
console.log(`[X-13] 정본 인용: 「**근거가 없는 질문** → 「모른다」 · **지어내지 않는다**」(test-plan-v1.md:133)`);
console.log(
  `   같은 무대에서 근거를 0 으로 만든 상태의 화면 문면 = ${JSON.stringify(screen.rationale ?? screen.candidatesIdle ?? (screen.body ?? "").slice(0, 120))}`,
);
console.log("\n🔴 판정 축 제외: `confidenceNote` 문장(상류 원문 = 무대 인공물).");
console.log("🔴 안 잼: 진행 «중» run 의 WS/폴링 경로 · 색인 있는 스택의 live run · 다른 엔진.");
