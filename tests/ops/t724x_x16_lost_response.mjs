/**
 * T7-24 · X-16 — 「첫 요청은 «서버에 도달했는데» 응답만 유실 → 재시도」. 리바이2 39대.
 * 정본 = `docs/plan/test-plan-v1.md` §6 X-16 · 무대 = `apps/web-console/scripts/x-stages/blackhole-proxy.mjs`.
 *
 * 🔴 이게 멱등의 «진짜» 시험이다 — 판정선은 「오류가 안 났다」가 아니라
 *    **「서버 상태가 두 번 바뀌지 않는다」를 «수»로 보인다**(판정선 2 ①).
 *
 * 세는 방법 = **상류 자신의 기록**(ai-api 로그의 `POST /api/scenarios/{id}/runs` 줄 수).
 * 응답이 유실되므로 runId 를 못 받는다 — 그러니 클라이언트가 아니라 **상류가 세게** 한다.
 *
 * 🔴 **화면 축은 이 그물이 «안 잰다».** 배포된 blackhole 무대는 경로 필터가 없어 «전부» 끊는다.
 *    셸을 그 앞에 세우면 화면 자체가 안 서서, 무대가 아니라 장애물이 된다. 그래서 이 열은
 *    API 축이고, 화면 축(사용자가 다시 눌렀을 때)은 **미검증**으로 남긴다.
 *
 * 사용:
 *   node blackhole-proxy.mjs --port 8811 --upstream 127.0.0.1:8102   # 무대 먼저
 *   node t724x_x16_lost_response.mjs --api=http://127.0.0.1:8102 --stage=http://127.0.0.1:8811 --log=<ai-api 로그>
 */
import { readFileSync } from "node:fs";

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const API = arg("api", "http://127.0.0.1:8102");
const STAGE = arg("stage", "http://127.0.0.1:8811");
const LOG = arg("log", null);
if (!LOG) {
  console.log("🔴 --log 가 없다 — 상류가 «몇 번 만들었는지»를 셀 수 없다. 판정하지 않는다.");
  process.exit(2);
}

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
  return { status: res.status, text, json };
};

/** 상류 자신의 기록으로 «만들어진 run 수»를 센다. */
const runsCreated = () =>
  (readFileSync(LOG, "utf8").match(/POST \/api\/scenarios\/[^ ]+\/runs HTTP\/1\.1" 200/g) ?? []).length;

const stage = async () => (await fetch(STAGE + "/__stage").then((r) => r.json()).catch(() => null)) ?? {};

/* ── 무대 증인 먼저 ────────────────────────────────────────────────────────── */
const w0 = await stage();
if (w0.forwarded === undefined) {
  console.log(`🔴 무대(${STAGE}/__stage)가 안 답한다 — 자극을 넣기 전에 무대가 없다. exit 2`);
  process.exit(2);
}

/* ── 세션·시나리오는 «정상 경로»로 마련한다(무대는 run 생성에만 쓴다) ─────── */
const SID = (await call(API, "/api/sessions", { method: "POST", body: "{}" })).json?.sessionId;
const scen = await call(API, "/api/scenarios");
const sid0 = (scen.json?.items ?? scen.json ?? [])[0]?.scenarioId;
if (!SID || !sid0) {
  console.log(`🔴 세션/시나리오를 못 구했다 — 무대가 아니다. exit 2`);
  process.exit(2);
}
const body = JSON.stringify({ sessionId: SID, mode: "live" });

/* ── 🔴 대조군 = 무대 «없이» 한 번. 계수기가 1 을 세는지부터. ─────────────── */
const cBefore = runsCreated();
const ctl = await call(API, `/api/scenarios/${sid0}/runs`, { method: "POST", body }).catch((e) => ({ status: "ERR " + e.message.slice(0, 40) }));
await new Promise((r) => setTimeout(r, 800));
const ctlDelta = runsCreated() - cBefore;

/* ── 자극 = 무대를 통해 두 번(첫 응답 유실 → 재시도) ─────────────────────── */
const sBefore = runsCreated();
const w1 = await stage();
const shot = async (n) => {
  try {
    const r = await call(STAGE, `/api/scenarios/${sid0}/runs`, { method: "POST", body });
    return `${n}: 응답 받음(${r.status}) — 🔴 무대가 안 끊었다`;
  } catch (e) {
    return `${n}: 응답 유실(${String(e.cause?.code ?? e.message).slice(0, 30)})`;
  }
};
const a = await shot("첫 요청");
await new Promise((r) => setTimeout(r, 1000));
const b = await shot("재시도");
await new Promise((r) => setTimeout(r, 1200));
const sDelta = runsCreated() - sBefore;
const w2 = await stage();

const stimulusReal = (w2.upstreamAnswered ?? 0) - (w1.upstreamAnswered ?? 0) >= 2 && (w2.dropped ?? 0) - (w1.dropped ?? 0) >= 2;
const counterWorks = ctlDelta === 1;
const verdict = !counterWorks
  ? "미검증(대조군이 1 을 안 냄 — 계수기를 못 믿는다)"
  : !stimulusReal
    ? "미검증(자극 없음 — 상류가 답했는데 끊긴 것이 2건 미만)"
    : sDelta === 1
      ? "PASS"
      : "FAIL";

console.log(`\n=== X-16 · 상류 도달 · 응답 유실 · 재시도 · stage=${STAGE} ===`);
console.log(`무대 증인: 자극 전 ${JSON.stringify(w1)}`);
console.log(`           자극 후 ${JSON.stringify(w2)}`);
console.log(`           ⇒ 상류가 답한 수 +${(w2.upstreamAnswered ?? 0) - (w1.upstreamAnswered ?? 0)} · 클라이언트로 못 간 수 +${(w2.dropped ?? 0) - (w1.dropped ?? 0)}`);
console.log(`\n대조군(무대 없이 1회): 응답 ${ctl.status} · **상류가 만든 run 수 +${ctlDelta}**`);
console.log(`자극: ${a}`);
console.log(`      ${b}`);
console.log(`      ⇒ **상류가 만든 run 수 +${sDelta}** (기대 = 1)`);
console.log(`\n[X-16] 판정: ${verdict}`);
console.log(`빨강 확인: ${counterWorks ? "✓ 무대 없이 1회 → +1" : "✗ 대조군이 +1 이 아니다"} · ${stimulusReal ? "✓ 상류는 답했는데 클라이언트는 못 받았다(같은 실행)" : "✗ 무대가 그 두 사실을 못 보였다"}`);
console.log(`🔴 화면 축(사용자가 다시 누르는 길)은 이 그물이 «안 잼» — 배포 무대에 경로 필터가 없어 셸을 그 앞에 세우면 화면이 안 선다.`);
if (!counterWorks || !stimulusReal) process.exit(2);
