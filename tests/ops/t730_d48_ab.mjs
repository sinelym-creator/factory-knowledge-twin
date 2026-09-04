/**
 * T7-30 · D-48 독립 검증 — 「같은 조사를 «동시에» 두 번 시작해도 run 은 하나」.
 * 리바이2 41대. 처방 = #571 `services/ai-api/app/routers/investigations.py` (+62/−2 · 헤더 `X-FKT-Run-Reused`).
 *
 * 🔴 **두 세대를 «같은 실행»에서 번갈아 친다.** 전(33506b2 · 규칙 없음) ↔ 후(265262d · 규칙 있음).
 *    따로 재면 「층이 죽었다」와 「이 열만 갈렸다」를 못 가른다.
 *
 * 🔴 **세는 자.** 응답을 받는 열(①②③)은 **runId 집합**이 정본이다. 응답이 유실되는 열(④ X-16)은
 *    상류 로그로만 셀 수 있는데, **처방 뒤에는 «재사용 200» 도 access log 에 200 으로 찍힌다** —
 *    그래서 `POST …/runs 200` 줄 수는 «만들어진 run 수»가 아니다. 만들어진 수 =
 *      (POST 200 줄 수) − (재사용 로그 줄 수)
 *    이고, 재사용 줄은 ASCII 마커 `session=… scenario=… run=RUN-…` 로 센다(한글 grep 은 콘솔
 *    인코딩에서 거짓 0 을 낸다 — 센쿠2 40대 자수).
 *    🔴 그 뺄셈이 성립하는지를 **같은 실행의 대조군**(무대 없이 직접 1회 → created 1)으로 먼저 묻는다.
 *
 * 사용:
 *   node t730_d48_ab.mjs --pre=http://127.0.0.1:8103 --preLog=<path> --preStage=http://127.0.0.1:8811 \
 *                        --post=http://127.0.0.1:8101 --postLog=<path> --postStage=http://127.0.0.1:8812
 */
import { readFileSync } from "node:fs";

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REUSE_HEADER = "x-fkt-run-reused";

const GENS = [
  { label: "전(33506b2)", api: arg("pre"), stage: arg("preStage"), log: arg("preLog"), rule: false },
  { label: "후(265262d)", api: arg("post"), stage: arg("postStage"), log: arg("postLog"), rule: true },
];
if (GENS.some((g) => !g.api || !g.log || !g.stage)) {
  console.log("🔴 --pre/--preLog/--preStage/--post/--postLog/--postStage 가 모두 필요하다. exit 2");
  process.exit(2);
}

/* ── 계수기 ─────────────────────────────────────────────────────────────── */
const RE_POST = /POST \/api\/scenarios\/[^ ]+\/runs HTTP\/1\.1" 200/g;
/* 재사용 로그 줄의 ASCII 지문. 다른 `run=` 줄(대기 상한·구독 큐)과 겹치지 않는다. */
const RE_REUSE = /session=[^ ]+ scenario=[^ ]+ run=RUN-[0-9a-f]+/g;
const readLog = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
const counters = (p) => {
  const t = readLog(p);
  return { posts: (t.match(RE_POST) ?? []).length, reuse: (t.match(RE_REUSE) ?? []).length };
};
const created = (c) => c.posts - c.reuse;

/* ── HTTP ───────────────────────────────────────────────────────────────── */
const jar = () => ({ cookie: "" });
const call = async (base, path, { j = null, method = "GET", body = null, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    body,
    headers: { "content-type": "application/json", ...(j?.cookie ? { cookie: j.cookie } : {}), ...headers },
  });
  const sc = res.headers.get("set-cookie");
  if (sc && j) j.cookie = sc.split(";")[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, reused: res.headers.get(REUSE_HEADER) };
};
const newSession = async (api) => {
  const j = jar();
  const r = await call(api, "/api/sessions", { j, method: "POST", body: "{}" });
  return { j, sid: r.json?.sessionId ?? null };
};
const startRun = (api, j, sid, scen) =>
  call(api, `/api/scenarios/${scen}/runs`, {
    j,
    method: "POST",
    body: JSON.stringify({ sessionId: sid, mode: "live" }),
  }).catch((e) => ({ status: "ERR", err: String(e.cause?.code ?? e.message).slice(0, 40) }));

/* ── 무대(blackhole) 증인 ──────────────────────────────────────────────── */
const witness = async (stage) =>
  (await fetch(stage + "/__stage")
    .then((r) => r.json())
    .catch(() => null)) ?? {};

/* ── 자극: 무대 경유 · 응답은 유실된다 ─────────────────────────────────── */
/* 🔴 무대를 거치는 요청도 «세션 쿠키»를 지고 가야 한다. 안 주면 상류는 401 로 답하고,
   그 401 도 「상류가 답했다」로 증인에 잡힌다 — 자극은 실재했는데 «축에는 안 닿은» 상태다
   (첫 실행에서 실제로 그랬다: upstreamAnswered +2 · created +0 · 상류 로그 401 6건 · 자수). */
const blindShot = (stage, scen, sid, cookie) =>
  fetch(`${stage}/api/scenarios/${scen}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ sessionId: sid, mode: "live" }),
  }).then(
    (r) => ({ got: true, status: r.status }),
    (e) => ({ got: false, err: String(e.cause?.code ?? e.message).slice(0, 24) }),
  );

/* ── 한 세대를 전부 잰다 ───────────────────────────────────────────────── */
async function measure(g) {
  const out = { label: g.label, cols: {} };
  const h = await fetch(g.api + "/api/health")
    .then((r) => r.json())
    .catch(() => null);
  out.health = h
    ? {
        build: h.build,
        pg: h.dependencies?.postgres?.state,
        neo: h.dependencies?.neo4j?.state,
        emb: h.models?.embedding,
      }
    : null;
  if (!out.health || out.health.pg !== "ok" || out.health.neo !== "ok") {
    out.dead = true;
    return out;
  }
  const w0 = await witness(g.stage);
  if (w0.forwarded === undefined) {
    out.stageDead = true;
    return out;
  }

  /* 🔴 `/api/scenarios` 는 세션을 요구한다(`session_required`) — 목록은 «대상이 부르게» 한다. */
  const boot = await newSession(g.api);
  const scenRes = await call(g.api, "/api/scenarios", { j: boot.j });
  const scen = (scenRes.json?.items ?? scenRes.json ?? [])[0]?.scenarioId;
  if (!scen) {
    out.noScenario = true;
    return out;
  }
  out.scenario = scen;

  /* 워밍 1회 — 차가운 무대의 첫 run 은 임베딩 로딩으로 느려 우연한 초록을 만든다. */
  {
    const s = await newSession(g.api);
    await startRun(g.api, s.j, s.sid, scen);
    await sleep(1200);
  }

  /* 대조군 0 — 계수기가 1 을 세는가(뺄셈이 성립하는가). */
  {
    const c0 = counters(g.log);
    const s = await newSession(g.api);
    const r = await startRun(g.api, s.j, s.sid, scen);
    await sleep(900);
    const c1 = counters(g.log);
    out.cols.counter = {
      status: r.status,
      runId: r.json?.runId ?? null,
      dPosts: c1.posts - c0.posts,
      dReuse: c1.reuse - c0.reuse,
      dCreated: created(c1) - created(c0),
    };
  }

  /* ① X-15 주축 — 같은 세션·같은 시나리오·live 동시 2 POST. 3회 반복(경합 재현율). */
  out.cols.same = [];
  for (let i = 0; i < 3; i++) {
    const c0 = counters(g.log);
    const s = await newSession(g.api);
    const [a, b] = await Promise.all([
      startRun(g.api, s.j, s.sid, scen),
      startRun(g.api, s.j, s.sid, scen),
    ]);
    await sleep(900);
    const c1 = counters(g.log);
    const ids = [a.json?.runId, b.json?.runId].filter(Boolean);
    out.cols.same.push({
      statuses: [a.status, b.status],
      ids,
      distinct: new Set(ids).size,
      header: [a.reused, b.reused].filter(Boolean),
      dPosts: c1.posts - c0.posts,
      dReuse: c1.reuse - c0.reuse,
      dCreated: created(c1) - created(c0),
    });
  }

  /* ② 대조 — «다른» 세션 동시 2. 변하면 옆을 건드린 것이다. */
  {
    const c0 = counters(g.log);
    const s1 = await newSession(g.api);
    const s2 = await newSession(g.api);
    const [a, b] = await Promise.all([
      startRun(g.api, s1.j, s1.sid, scen),
      startRun(g.api, s2.j, s2.sid, scen),
    ]);
    await sleep(900);
    const c1 = counters(g.log);
    const ids = [a.json?.runId, b.json?.runId].filter(Boolean);
    out.cols.other = {
      statuses: [a.status, b.status],
      ids,
      distinct: new Set(ids).size,
      header: [a.reused, b.reused].filter(Boolean),
      dCreated: created(c1) - created(c0),
    };
  }

  /* ③ 종결 «뒤» 재요청 — 새 run 이어야 한다(규칙은 비종결에만 건다). */
  {
    const s = await newSession(g.api);
    const a = await startRun(g.api, s.j, s.sid, scen);
    let term = null;
    for (let i = 0; i < 40 && !term; i++) {
      await sleep(150);
      const r = await call(g.api, `/api/runs/${a.json?.runId}`, { j: s.j });
      if (r.json && (r.json.terminal === true || ["completed", "failed", "stopped"].includes(r.json.status)))
        term = r.json.status;
    }
    const b = await startRun(g.api, s.j, s.sid, scen);
    await sleep(600);
    out.cols.afterTerminal = {
      first: a.json?.runId ?? null,
      terminalStatus: term,
      second: b.json?.runId ?? null,
      header: b.reused ?? null,
      isNew: !!(a.json?.runId && b.json?.runId && a.json.runId !== b.json.runId),
    };
  }

  /* 🔴 창 측정 — 「비종결 체류」가 이 무대에서 몇 ms 인가. 재시도 간격은 **이 무대의 시계**로
     고른다. 남의 무대에서 잰 103~114ms 를 그대로 쓰면, 창이 더 짧은 무대에서는 재시도가
     «창 밖»에 떨어지고 그 run 2 를 결함으로 오독한다(발주문의 값도 전언이다). */
  out.cols.window = [];
  for (let i = 0; i < 3; i++) {
    const s = await newSession(g.api);
    const t0 = Date.now();
    const a = await startRun(g.api, s.j, s.sid, scen);
    let ms = null;
    for (let k = 0; k < 400 && ms === null; k++) {
      const r = await call(g.api, `/api/runs/${a.json?.runId}`, { j: s.j });
      if (r.json && (r.json.terminal === true || ["completed", "failed", "stopped"].includes(r.json.status)))
        ms = Date.now() - t0;
      else await sleep(5);
    }
    out.cols.window.push({ runId: a.json?.runId ?? null, terminalAfterMs: ms, status: null });
    await sleep(300);
  }
  const seen = out.cols.window.map((w) => w.terminalAfterMs).filter((n) => typeof n === "number");
  const resMs = seen.length ? Math.min(...seen) : null;
  out.residenceMs = resMs;
  /* 창 «안» 간격 = 관측된 최단 체류의 30%(하한 1ms). 0ms 열(동시)은 항상 창 안이다. */
  const insideGap = resMs ? Math.max(1, Math.round(resMs * 0.3)) : 1;
  out.insideGap = insideGap;

  /* ④ X-16 — 상류엔 닿고 응답만 유실 → 재시도. 창 «안» 두 열(0ms·insideGap) + 창 «밖» 1000ms. */
  out.cols.x16 = [];
  for (const gapMs of [0, insideGap, 1000]) {
    const c0 = counters(g.log);
    const w1 = await witness(g.stage);
    const s = await newSession(g.api);
    const t0 = Date.now();
    const p1 = blindShot(g.stage, scen, s.sid, s.j.cookie);
    await sleep(gapMs);
    const t1 = Date.now();
    const p2 = blindShot(g.stage, scen, s.sid, s.j.cookie);
    const [r1, r2] = await Promise.all([p1, p2]);
    await sleep(1500);
    const c1 = counters(g.log);
    const w2 = await witness(g.stage);
    out.cols.x16.push({
      gapMs,
      inside: gapMs === 0 || (resMs !== null && t1 - t0 < resMs),
      sendGapMs: t1 - t0,
      clientGot: [r1.got, r2.got],
      errs: [r1.err ?? null, r2.err ?? null],
      dUpstreamAnswered: (w2.upstreamAnswered ?? 0) - (w1.upstreamAnswered ?? 0),
      dDropped: (w2.dropped ?? 0) - (w1.dropped ?? 0),
      dUpstreamFailed: (w2.upstreamFailed ?? 0) - (w1.upstreamFailed ?? 0),
      dPosts: c1.posts - c0.posts,
      dReuse: c1.reuse - c0.reuse,
      dCreated: created(c1) - created(c0),
    });
  }
  return out;
}

/* ── 실행 ──────────────────────────────────────────────────────────────── */
const results = [];
for (const g of GENS) results.push(await measure(g));

const j = JSON.stringify;
console.log("\n================ T7-30 · D-48 독립 검증 (A/B · 같은 실행) ================");
for (const r of results) {
  console.log(`\n--- ${r.label} ---`);
  if (r.dead) {
    console.log(`🔴 무대가 안 산다: ${j(r.health)}`);
    continue;
  }
  if (r.stageDead) {
    console.log("🔴 blackhole 무대 /__stage 무응답");
    continue;
  }
  if (r.noScenario) {
    console.log("🔴 시나리오를 못 구했다");
    continue;
  }
  console.log(`무대: ${j(r.health)} · scenario=${r.scenario}`);
  console.log(
    `[계수기 대조군] 직접 1회 → posts +${r.cols.counter.dPosts} · reuse +${r.cols.counter.dReuse} · **created +${r.cols.counter.dCreated}** (기대 1)`,
  );
  r.cols.same.forEach((c, i) =>
    console.log(
      `[① 같은 세션 동시 2 · 시행 ${i + 1}] 응답 ${j(c.statuses)} · **distinct runId ${c.distinct}** · 재사용 헤더 ${c.header.length}건 · created +${c.dCreated} (posts +${c.dPosts} / reuse +${c.dReuse})`,
    ),
  );
  const o = r.cols.other;
  console.log(
    `[② 다른 세션 동시 2] 응답 ${j(o.statuses)} · **distinct runId ${o.distinct}** · 헤더 ${o.header.length}건 · created +${o.dCreated}`,
  );
  const t = r.cols.afterTerminal;
  console.log(
    `[③ 종결 뒤 재요청] 첫 run 종결상태=${t.terminalStatus} · 두번째=${t.isNew ? "**새 run**" : "같은 run(재사용)"} · 헤더 ${t.header ?? "없음"}`,
  );
  console.log(
    `[창 실측] 비종결 체류 ${j(r.cols.window.map((w) => w.terminalAfterMs))} ms → 최단 ${r.residenceMs} · 창 «안» 간격으로 ${r.insideGap}ms 를 쓴다`,
  );
  for (const x of r.cols.x16)
    console.log(
      `[④ X-16 · 간격 ${x.gapMs}ms(실측 송신간격 ${x.sendGapMs}ms · 창 ${x.inside ? "«안»" : "«밖»"})] 클라이언트 수신 ${x.clientGot.filter(Boolean).length}건 · 상류가 답한 수 +${x.dUpstreamAnswered} · 끊긴 수 +${x.dDropped} · 상류실패 +${x.dUpstreamFailed} · **created +${x.dCreated}** (posts +${x.dPosts} / reuse +${x.dReuse})`,
    );
}

/* ── 판정 ──────────────────────────────────────────────────────────────── */
const [pre, post] = results;
const bad = [];
const ok = (cond, msg) => {
  if (!cond) bad.push(msg);
  return cond;
};
const counterOk = ok(
  pre.cols?.counter?.dCreated === 1 && post.cols?.counter?.dCreated === 1,
  "계수기 대조군이 +1 이 아니다",
);
const preSame = (pre.cols?.same ?? []).map((c) => c.distinct);
const postSame = (post.cols?.same ?? []).map((c) => c.distinct);
const redSeen = ok(
  preSame.some((n) => n === 2),
  "빨강 확인 실패 — 전 세대 ①에서 run 2 를 못 봤다",
);
const x15 = postSame.length > 0 && postSame.every((n) => n === 1);
const headerSaid =
  (post.cols?.same ?? []).length > 0 && (post.cols?.same ?? []).every((c) => c.header.length >= 1);
const other = ok(
  pre.cols?.other?.distinct === 2 && post.cols?.other?.distinct === 2,
  "② 다른 세션 축이 갈렸다(옆을 건드림)",
);
const term = ok(
  pre.cols?.afterTerminal?.isNew === true && post.cols?.afterTerminal?.isNew === true,
  "③ 종결 뒤 재요청이 새 run 이 아니다",
);
/* 🔴 「창 안」은 «이 무대에서 실측한 체류»가 정한다 — 발주문의 50ms 가 아니다. */
const x16pre = (pre.cols?.x16 ?? []).filter((x) => x.inside);
const x16post = (post.cols?.x16 ?? []).filter((x) => x.inside);
/* 🔴 빈 배열에 `every` 를 걸면 «측정 0건»이 초록이 된다(첫 실행에서 실제로 그랬다 — 자수).
   그래서 「열이 있는가」를 먼저 묻는다. 못 잰 것은 0 이 아니라 «안 잼»이다. */
const x16stim =
  x16pre.length > 0 &&
  x16post.length > 0 &&
  [...x16pre, ...x16post].every(
    (x) => x.dUpstreamAnswered >= 2 && x.dDropped >= 2 && x.clientGot.filter(Boolean).length === 0,
  );
const x16red = x16pre.some((x) => x.dCreated === 2);
const x16pass = x16post.length > 0 && x16post.every((x) => x.dCreated === 1);

console.log("\n================ 판정 ================");
console.log(`계수기 대조군(전·후 각 +1): ${counterOk ? "✓" : "✗"}`);
console.log(`빨강 확인 ① (전 세대에서 distinct 2): ${redSeen ? "✓" : "✗"} · 전 ${j(preSame)} → 후 ${j(postSame)}`);
console.log(
  `[X-15] ${!counterOk ? "미검증(계수기)" : !redSeen ? "미검증(빨강 없음)" : x15 ? "PASS" : "FAIL"}` +
    ` — 후 세대 동시 2 → run ${j(postSame)} · 재사용 헤더 전 회차 존재 ${headerSaid ? "✓" : "✗"}`,
);
console.log(`② 다른 세션(전·후 2): ${other ? "✓ 안 건드렸다" : "✗"} · ③ 종결 뒤 새 run: ${term ? "✓" : "✗"}`);
console.log(`X-16 자극 실재(상류 답함 ≥2 · 끊김 ≥2 · 클라 수신 0): ${x16stim ? "✓" : "✗"}`);
console.log(
  `X-16 빨강 확인(전 세대 창 «안» 열 created 2): ${x16red ? "✓" : "✗"} · 창 실측 전 ${pre.residenceMs}ms / 후 ${post.residenceMs}ms`,
);
console.log(
  `[X-16] ${!x16stim ? "미검증(자극 미도달)" : !x16red ? "미검증(빨강 없음)" : x16pass ? "PASS (비종결 창 «안» 재시도 → run 1)" : "FAIL"}`,
);
const x16b = (post.cols?.x16 ?? []).filter((x) => !x.inside).map((x) => x.dCreated);
console.log(
  `  · 1000ms 열(창 «밖») 후 세대 created ${j(x16b)} — 2 는 «규칙의 정의»(비종결 창을 벗어난 재시도) · FAIL 아님`,
);
const verdict =
  counterOk && redSeen && x15 && other && term && x16stim && x16red && x16pass ? "PASS" : "FAIL/미검증";
console.log(`\n[T7-30] ${verdict}${bad.length ? " · 미충족: " + bad.join(" / ") : ""}`);
console.log(
  "🔴 안 잼: 다중 워커(uvicorn 1 워커만) · 셸/화면 축(브라우저가 두 번 누르는 길) · 프로세스 간 경합(단일 프로세스 저장소)",
);
if (!counterOk || !x16stim) process.exit(2);
