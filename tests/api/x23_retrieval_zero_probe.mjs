/**
 * X-23 · X-13 API 축 — 「근거 «검색» 0건」을 두 무대로 가른다(cap 0 · live run 0).
 *
 * 정본: `test-plan-v1.md:151` X-23 = 근거 검색 0건 → 「모른다」·지어내지 않는다·그 사실이 화면에 보인다
 *       `test-plan-v1.md:133` X-13 = 근거가 없는 질문 → 「모른다」·지어내지 않는다
 *
 * 🔴 **자극이 사는 층은 retrieval 이다.** 셸↔ai-api 사이에 스텁을 두면 «화면이 받는 근거»만 비게 되고,
 *    답변은 이미 근거를 갖고 합성된 뒤라 「답은 자신 있는데 근거 0」이라는 **내가 만든 불일치**가 난다.
 *    그래서 무대를 **스키마만 있고 행이 0인 DB + 빈 neo4j** 로 세운다(오류가 아니라 «0건»이라야 한다).
 * 🔴 **질문은 지어내지 않는다** — `GET /api/scenarios` 가 주는 allowlist 정본을 그대로 쓴다.
 * 🔴 **자극 열을 먼저**, 대조군(정상 무대)은 「내 그물이 0을 만든 게 아니다」를 증명한다.
 *
 * usage: node x23_retrieval_zero_probe.mjs --empty http://127.0.0.1:8811 --normal http://127.0.0.1:8190 --out o.json
 */
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("out");
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }

/** 쿠키 항아리 하나 — 세션 불일치는 계약대로 404/401 을 내므로 항아리를 반드시 이어 붙인다. */
const jarFetch = () => {
  let cookie = "";
  return async (url, init = {}) => {
    const h = { ...(init.headers || {}) };
    if (cookie) h.cookie = cookie;
    const r = await fetch(url, { ...init, headers: h, redirect: "manual" });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON 이 아니면 원문만 */ }
    return { status: r.status, json, raw: text.slice(0, 200) };
  };
};

const column = async (name, base) => {
  const f = jarFetch();
  const col = { name, base };
  const health = await f(`${base}/api/health`);
  col.health = {
    status: health.json?.status ?? null,
    postgres: health.json?.dependencies?.postgres?.state ?? null,
    neo4j: health.json?.dependencies?.neo4j?.state ?? null,
    embedding: health.json?.models?.embedding ?? null,
  };
  const live = await f(`${base}/api/live/status`);
  col.online = live.json?.online ?? null;
  const sess = await f(`${base}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  col.sessionId = sess.json?.sessionId ?? null;
  const scen = await f(`${base}/api/scenarios`);
  const first = Array.isArray(scen.json) ? scen.json[0] : null;
  col.scenarioId = first?.scenarioId ?? null;
  col.question = first?.questions?.[0] ?? null;   // 🔴 allowlist 정본 그대로
  if (!col.sessionId || !col.question) { col.error = "세션 또는 질문을 못 받았다 — 계측 실패"; return col; }

  const cmp = await f(`${base}/api/retrieval/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: col.sessionId, question: col.question, strategies: ["vector", "hybrid", "graphrag"] }),
  });
  col.compareStatus = cmp.status;
  if (!Array.isArray(cmp.json)) { col.compareRaw = cmp.raw; col.strategies = null; col.totalHits = null; return col; }
  col.strategies = cmp.json.map((r) => ({
    strategy: r.strategy ?? null,
    hits: Array.isArray(r.hits) ? r.hits.length : (Array.isArray(r.results) ? r.results.length : null),
    keys: Object.keys(r).slice(0, 8),
  }));
  col.totalHits = col.strategies.reduce((a, b) => a + (b.hits ?? 0), 0);
  return col;
};

const out = { wall: new Date().toISOString(), cols: {} };
// 🔴 자극 열 먼저.
out.cols.empty = await column("자극(스키마만·행 0)", arg("empty"));
out.cols.normal = await column("대조군(정상 무대)", arg("normal"));

const E = out.cols.empty, N = out.cols.normal;
out.verdict = {
  a_emptyHealthOk: E.health?.status === "ok" && E.health?.postgres === "ok" && E.health?.neo4j === "ok",
  b_emptyOnline: E.online === true,
  c_emptyZeroHits: E.totalHits === 0,
  d_controlHasHits: (N.totalHits ?? 0) >= 1,     // 🔴 대조군이 0이면 내 그물이 0을 만든 것이다
  e_sameQuestion: E.question === N.question,     // 두 열이 같은 질문을 물었는가
  f_compareOk: E.compareStatus === 200 && N.compareStatus === 200, // 오류가 아니라 «0건»
};
out.verdict.stimulusStands = Object.entries(out.verdict).filter(([k]) => /^[a-f]_/.test(k)).every(([, v]) => v === true);
out.verdict.fails = Object.entries(out.verdict).filter(([k, v]) => /^[a-f]_/.test(k) && v !== true).map(([k]) => k);
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  `empty: health=${E.health?.status}/${E.health?.postgres}/${E.health?.neo4j} online=${E.online} compare=${E.compareStatus} hits=${E.totalHits} ${JSON.stringify(E.strategies)}\n` +
  `normal: health=${N.health?.status} online=${N.online} compare=${N.compareStatus} hits=${N.totalHits} ${JSON.stringify(N.strategies)}\n` +
  `stimulus stands = ${out.verdict.stimulusStands}${out.verdict.fails.length ? " FAILS: " + out.verdict.fails.join(",") : ""}`,
);
process.exit(out.verdict.stimulusStands ? 0 : 2); // 🔴 무대가 안 서면 색을 내지 않는다
