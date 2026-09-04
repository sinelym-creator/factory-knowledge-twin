/**
 * T7-38 독립 검증 — 세션 단위 조사 실행 상한(계약 v0.1.15 append 1·2·3). 리바이2 42대.
 *
 * 🔴 **판정선은 «정정 후» 문면이다.** v0.1.15 초안의 「201」은 발주자가 실물 안 보고 쓴 값이고
 *    실제·정본은 **200**(`investigations.py:160` 데코레이터에 `status_code` 없음 + 그 파일에
 *    `response.status_code` 대입 0건 = 구조적으로 200). 관측값을 그대로 적고, 어느 판의
 *    어느 줄에 대는 판정인지 남긴다.
 *
 * 🔴 **「N번 눌렀다」는 「N건 계수됐다」가 아니다.** 같은 세션의 «비종결» live run 은 새로
 *    만들지 않고 **재사용**되며(`investigations.py` 228~237) 그 분기는 **상한 검사보다 앞**에
 *    있다. 그래서 계수는 호출 수가 아니라 **`X-FKT-Run-Cap-Used` 헤더**로 읽고,
 *    재사용 회차는 **`X-FKT-Run-Reused`** 로 갈라 센다.
 *
 * 🔴 **셸 경유로는 `X-FKT-Run-Reused` 가 안 온다**(프록시 허용 목록 · O-9). 축 ⑧ 은
 *    **ai-api 직결**로만 재고, 셸 경유 열은 「미도달 · 판정 제외」로 적는다.
 *
 * 🔴 **빨강 확인은 대조군으로** — 처방 없는 빌드(`--api` 를 옛 ai-api 로)에서 같은 그물이
 *    rc=1 이어야 이 초록이 검출력 있는 초록이다.
 *
 *   node t738_runcap_probe.mjs --api=http://127.0.0.1:8108 [--limit=2]
 */
const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const API = arg("api", "http://127.0.0.1:8108");
const LIMIT = Number(arg("limit", "2"));
const SCENARIO = arg("scenario", "GS-01");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const J = async (res) => {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 200) };
  }
};
const capOf = (res) => ({
  limit: res.headers.get("x-fkt-run-cap-limit"),
  used: res.headers.get("x-fkt-run-cap-used"),
  remaining: res.headers.get("x-fkt-run-cap-remaining"),
  reused: res.headers.get("x-fkt-run-reused"),
  retryAfter: res.headers.get("retry-after"),
});

const rows = [];
const rec = (name, ok, detail) => {
  rows.push({ name, ok, detail });
  console.log(`${ok === null ? "  " : ok ? "✓ " : "🔴"} ${name}${detail ? " · " + detail : ""}`);
};

/* ── 세션 ─────────────────────────────────────────────────────────────────── */
const s = await fetch(API + "/api/sessions", { method: "POST" });
/* 🔴 **자격은 «대상이 주는» 것으로 들고 다닌다.** 이 표면은 body 의 `sessionId` 만으로는
   401 `session_required` 다 — 세션은 `fkt_sid` **쿠키**로 확인한다(42대 실측: 쿠키 없이
   쏘면 전 축이 401 이고, 그 빨강은 처방이 아니라 «내가 자격을 안 준 것»이다). */
const COOKIE = (s.headers.get("set-cookie") ?? "").split(";")[0];
const sess = await J(s);
const sid = sess.sessionId ?? sess.id;
console.log(`\n=== T7-38 세션 실행 상한 · api=${API} · 기대 limit=${LIMIT} ===\n세션 = ${sid}\n`);
if (!sid) {
  console.log("🔴 세션 발급 실패 — 무대 미성립(exit 2)");
  process.exit(2);
}

/* ── 축 ① 쿼리 없는 /live/status 는 «불변» ────────────────────────────────── */
const H = { "content-type": "application/json", cookie: COOKIE };
const ls0 = await fetch(API + "/api/live/status", { headers: { cookie: COOKIE } }).then((r) => r.text());

/* ── 축 ⑧ 재사용은 계수 0 (ai-api 직결) ───────────────────────────────────── */
const start = (mode) =>
  fetch(API + `/api/scenarios/${SCENARIO}/runs`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ sessionId: sid, mode }),
  });
const stop = (rid) => fetch(API + `/api/runs/${rid}/stop`, { method: "POST", headers: H }).catch(() => null);

const r1 = await start("live");
const c1 = capOf(r1);
const b1 = await J(r1);
rec("생성 응답 상태코드 = 200 (정정 후 문면)", r1.status === 200, `실측 ${r1.status}`);
rec("헤더 limit 이 env 와 같다", c1.limit === String(LIMIT), `실측 ${c1.limit}`);
rec("live 1회 뒤 used=1", c1.used === "1", `실측 used=${c1.used} remaining=${c1.remaining}`);

/* 같은 세션·비종결 상태에서 곧바로 또 요청 = 재사용되어야 하고 계수는 안 늘어야 한다. */
const rDup = await start("live");
const cDup = capOf(rDup);
await J(rDup);
rec("비종결 재요청 = 재사용(X-FKT-Run-Reused 존재)", !!cDup.reused, `실측 ${cDup.reused ?? "(없음)"}`);
rec("🔴 재사용 회차는 계수 0 (used 그대로)", cDup.used === c1.used, `${c1.used} → ${cDup.used}`);

/* ── 축 ④ replay 는 계수하지 않는다 ───────────────────────────────────────── */
const rRep = await start("replay");
const cRep = capOf(rRep);
await J(rRep);
rec("replay 는 계수 0", cRep.used === null || cRep.used === c1.used, `실측 used=${cRep.used}`);

/* ── 축 ⑤ 상한 도달 → 429 ─────────────────────────────────────────────────── */
if (b1.runId) await stop(b1.runId);
await sleep(1200);
const r2 = await start("live");
const c2 = capOf(r2);
const b2 = await J(r2);
rec(`live ${LIMIT}회째 used=${LIMIT}`, c2.used === String(LIMIT), `실측 used=${c2.used} remaining=${c2.remaining}`);
if (b2.runId) await stop(b2.runId);
await sleep(1200);

const r3 = await start("live");
const c3 = capOf(r3);
const b3 = await J(r3);
rec("상한 초과 = 429", r3.status === 429, `실측 ${r3.status}`);
const det = b3.error ?? b3.detail ?? b3;
rec("code = session_run_cap_exceeded", det.code === "session_run_cap_exceeded", `실측 ${det.code}`);
const four = ["limit", "used", "remaining", "retryAfterSec"];
const missing = four.filter((k) => det[k] === undefined);
rec("detail 수치 4칸(limit·used·remaining·retryAfterSec)", missing.length === 0, missing.length ? `없음: ${missing}` : JSON.stringify(four.map((k) => `${k}=${det[k]}`)));
rec("remaining 은 상수 0", det.remaining === 0, `실측 ${det.remaining}`);
rec("Retry-After 헤더", !!c3.retryAfter, `실측 ${c3.retryAfter}`);
rec("본문 retryAfterSec = 헤더 Retry-After", String(det.retryAfterSec) === String(c3.retryAfter), `${det.retryAfterSec} vs ${c3.retryAfter}`);

/* ── 축 ⑤b 거절 중에도 replay 는 열린다(문면이 스스로 거짓말하지 않는가) ──── */
const rRep2 = await start("replay");
rec("🔴 상한 도달 중에도 replay 는 200", rRep2.status === 200, `실측 ${rRep2.status}`);
await J(rRep2);

/* ── 축 ① 다시 — 쿼리 없는 /live/status 가 바뀌지 않았나 ──────────────────── */
const ls1 = await fetch(API + "/api/live/status", { headers: { cookie: COOKIE } }).then((r) => r.text());
const norm = (t) => t.replace(/"checkedAt":"[^"]*"/, '"checkedAt":"·"');
rec("쿼리 없는 /live/status 불변(checkedAt 제외 바이트 동일)", norm(ls0) === norm(ls1), `${norm(ls0).length}B vs ${norm(ls1).length}B`);

/* ── 축 ⑦ 창 만료 → 회복 ──────────────────────────────────────────────────── */
const WIN = Number(arg("window", "60"));
if (arg("skipwindow", null) === null) {
  console.log(`\n(창 ${WIN}s 만료 대기 — 슬라이딩이라 첫 회차가 빠지면 1자리가 돌아온다)`);
  await sleep((WIN + 6) * 1000);
  const r4 = await start("live");
  const c4 = capOf(r4);
  await J(r4);
  rec("창 만료 뒤 회복(200)", r4.status === 200, `실측 ${r4.status} used=${c4.used}`);
}

const bad = rows.filter((r) => r.ok === false);
console.log(bad.length === 0 ? "\n[T7-38] PASS" : `\n[T7-38] 🔴 FAIL — ${bad.map((b) => b.name).join(" · ")}`);
process.exit(bad.length === 0 ? 0 : 1);
