#!/usr/bin/env node
/**
 * T5-1 ② — 검색 축 실행기 (검증 좌석 · 리바이2 50대)
 *
 * 40문을 `POST /api/retrieval/compare` 에 한 번씩 보내 raw 를 남기고, 검색 축 4지표(계획서 §2 의 2·3·4·7)를 낸다.
 *
 * 🔴 **cap 0 은 그물 «안»에 있다.** 아래 `guardedFetch` 가 조사 run 을 만드는 경로(`/runs`)를 스스로 거절한다.
 *    다짐이 아니라 코드가 막아야 한다 — 「읽기 전용처럼 보이는 스모크가 live 를 태웠다」가 이 규율의 출처다.
 * 🔴 **`status !== 200` 은 측정값이 아니다.** raw 에 남기되 지표 분모에서 «이름으로» 뺀다(뺀 수를 함께 낸다).
 * 🔴 **기대가 빈 문항은 분모에 넣지 않는다.** 빈 집합과의 비교는 판정이 아니다 — 그 수도 함께 낸다.
 * 🔴 **K 는 내가 고른 값이 아니다.** 이 계약에는 top-K 요청 인자가 없다(`CompareRequest` = sessionId·question·strategies).
 *    관측된 hits 상한을 그대로 K 로 «선언»하고, 실측 상한이 선언과 다르면 실패한다.
 * 🔴 **가짜 대조군**: 목록 밖 질문 1건을 같은 실행기로 친다. 40건이 전부 200 이어도 대조군이 없으면
 *    「이 실행기는 무엇을 보내도 200 을 받는다」와 구별되지 않는다.
 *
 * 못 재는 축은 값이 아니라 이름으로 — 답변 생성 축(지표 1·5·6·9)과 지표 8(run 이벤트 필요)은 cap 0 에서 못 잰다.
 *
 * 사용:
 *   node benchmarks/run-eval-v0.3.mjs \
 *     --base http://127.0.0.1:8830 --k 5 \
 *     --ssot-ids <ids.txt> --ssot-edges <edges.txt> \
 *     --out benchmarks/eval-raw-v0.3.jsonl
 */
import fs from 'node:fs';
import path from 'node:path';

// ---------- 인자 ----------
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = arg('base', 'http://127.0.0.1:8830').replace(/\/$/, '');
const K = Number(arg('k', '5'));
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const QS = arg('questions', path.join(HERE, 'datasets/questions.v0.3.jsonl'));
const GT = arg('ground-truth', path.join(HERE, 'datasets/ground-truth.v0.3.jsonl'));
const SSOT_IDS = arg('ssot-ids', path.join(HERE, 'ssot-snapshot/ssot-ids.txt'));
const SSOT_EDGES = arg('ssot-edges', path.join(HERE, 'ssot-snapshot/ssot-edges.txt'));
const OUT = arg('out', path.join(HERE, 'eval-raw-v0.3.jsonl'));
const STRATEGIES = ['vector', 'hybrid', 'graphrag'];

const readJsonl = (p) =>
  fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const readPipe = (p) =>
  fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split('|'));

const questions = readJsonl(QS);
const truth = new Map(readJsonl(GT).map((r) => [r.id, r]));

// SSOT 층 — 이 두 파일이 비면 검증이 «전부 통과»로 보인다. 비면 판정을 거부한다.
const ssotIds = new Set(readPipe(SSOT_IDS).map(([, id]) => id));
const ssotEdges = new Set(readPipe(SSOT_EDGES).map(([rel, a, b]) => `${a}|${rel}|${b}`));
const ssotEdgePairs = new Set(readPipe(SSOT_EDGES).map(([, a, b]) => `${a}|${b}`));
if (ssotIds.size === 0 || ssotEdges.size === 0) {
  console.error('EXIT2: SSOT 스냅샷이 비었다 — 이 상태의 «전부 유효»는 판정이 아니다');
  process.exit(2);
}
if (questions.length !== truth.size) {
  console.error(`EXIT2: 문항 ${questions.length} vs 기대 ${truth.size} — 짝이 안 맞는다`);
  process.exit(2);
}

// ---------- cap 0 자체 감시 ----------
let guardTrips = 0;
async function guardedFetch(url, init = {}) {
  if (/\/runs(\/|$|\?)/.test(url)) {
    guardTrips += 1;
    throw new Error(`cap 0 위반 시도를 그물이 막았다: ${url}`);
  }
  return fetch(url, init);
}

// ---------- 세션 ----------
const sres = await guardedFetch(`${BASE}/api/sessions`, { method: 'POST' });
if (sres.status !== 200 && sres.status !== 201) {
  console.error('EXIT2: 세션 발급 실패 status=' + sres.status);
  process.exit(2);
}
const setCookie = sres.headers.getSetCookie ? sres.headers.getSetCookie() : [sres.headers.get('set-cookie')];
const cookie = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
const { sessionId } = await sres.json();

async function compare(question) {
  const t0 = Date.now();
  const res = await guardedFetch(`${BASE}/api/retrieval/compare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ sessionId, question, strategies: STRATEGIES }),
  });
  const wallMs = Date.now() - t0;
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, wallMs };
}

// ---------- 실행 ----------
const rows = [];
for (const q of questions) {
  const { status, body, wallMs } = await compare(q.question);
  const row = { id: q.id, type: q.type, difficulty: q.difficulty, status, wallMs, strategies: {} };
  if (status === 200 && Array.isArray(body)) {
    for (const s of body) {
      row.strategies[s.strategy] = {
        elapsedMs: s.elapsedMs,
        hits: s.hits.map((h) => ({ evidenceId: h.evidenceId, score: h.score, excerpt: String(h.excerpt || '') })),
      };
    }
  } else {
    row.error = body?.error ?? null;
  }
  rows.push(row);
  process.stderr.write(`${q.id} status=${status} ${status === 200 ? 'ok' : 'NOT-200'}\n`);
}

// ---------- 가짜 대조군 ----------
const CONTROL_Q = '존재하지 않는 설비 EQ-NOT-A-REAL-ID 의 최근 알람을 전부 나열하라.';
const ctl = await compare(CONTROL_Q);
const controlRow = { id: '__CONTROL_OFF_LIST__', type: 'control', status: ctl.status, error: ctl.body?.error ?? null };
rows.push(controlRow);

// cap 0 감시기가 살아 있는지 — 실제로 한 번 물게 해서 확인한다(같은 실행에서)
let guardProven = false;
try { await guardedFetch(`${BASE}/api/scenarios/GS-01/runs`, { method: 'POST' }); }
catch { guardProven = true; }

fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

// ---------- 채점 ----------
const measured = rows.filter((r) => r.type !== 'control' && r.status === 200);
const excluded = rows.filter((r) => r.type !== 'control' && r.status !== 200);

// 관측된 hits 상한이 선언한 K 와 같은가 — 다르면 K 선언이 거짓이다.
let observedMax = 0;
for (const r of measured) for (const s of STRATEGIES) observedMax = Math.max(observedMax, r.strategies[s]?.hits.length ?? 0);

const bareId = (s) => String(s).trim().split(/\s+/)[0].replace(/[·(].*$/, '');
const requiredEvidence = (id) => (truth.get(id)?.required_evidence ?? []).map(bareId).filter(Boolean);

// 지표 2 — Evidence Recall@K (근거가 «있는» 문항만 분모)
// 매칭 규칙(명시): hit.evidenceId 가 기대 근거 id 와 «완전 일치»하거나,
//   기대가 `DOC-x@rN#NNN` 이면 같은 문서·판의 chunk 인지도 함께 본다.
const hitIds = (r, s) => (r.strategies[s]?.hits ?? []).slice(0, K).map((h) => h.evidenceId);
const matches = (need, got) =>
  got.includes(need) || (/@/.test(need) && got.some((g) => g.split('#')[0] === need.split('#')[0]));

const isCited = (id) => ssotIds.has(id);

const metric2 = {};
const metric3 = {};
for (const s of STRATEGIES) {
  const withEvidence = measured.filter((r) => requiredEvidence(r.id).length > 0);
  const anyHit = withEvidence.filter((r) => requiredEvidence(r.id).some((n) => matches(n, hitIds(r, s))));
  const allHit = withEvidence.filter((r) => requiredEvidence(r.id).every((n) => matches(n, hitIds(r, s))));
  metric2[s] = { denom: withEvidence.length, any: anyHit.length, all: allHit.length,
                 missedIds: withEvidence.filter((r) => !anyHit.includes(r)).map((r) => r.id) };

  const withSop = measured.filter((r) => requiredEvidence(r.id).some((n) => n.startsWith('SOP-')));
  const sopHit = withSop.filter((r) =>
    requiredEvidence(r.id).filter((n) => n.startsWith('SOP-')).every((n) => matches(n, hitIds(r, s))));
  metric3[s] = { denom: withSop.length, hit: sopHit.length,
                 missedIds: withSop.filter((r) => !sopHit.includes(r)).map((r) => r.id) };
}

// 지표 4 — Graph Path Correctness. graphrag 의 excerpt 가 경로를 문자로 싣는다:
//   "[SOP · 3-hop] EQ-CNC-204 -[HAS_COMPONENT]- CP-204-TOOL-01 -[HAS_FAILURE_MODE]- FM-AXIS-BACKLASH -[MITIGATED_BY]- SOP-AXIS-COMP-017"
// 🔴 구분자는 `-[REL]-` 다(`->` 가 아니다 · 50대 실측 — 앞판 정규식이 `->` 를 요구해 **0건**을 냈다.
//    그 0 은 대상의 값이 아니라 내 계기의 값이었다).
// 🔴 그래프의 관계명(Neo4j)과 내 SQL 덤프의 이름이 다르다 — 매핑을 «명시»하고, 매핑에 없는 이름은
//    통과로 세지 않고 이름을 남긴다. 판정값은 「간선(쌍)이 Ontology 표에 실재하는가」다.
// 🔴 참조 집합은 **스키마의 외래키 전수**(25종 · 522행)다 — 내가 «생각나는 표»만 덤프하면
//    참조가 좁아 그래프가 틀린 것처럼 보인다(1차 실측: 13종만 떠서 413 중 59 이 «부재»로 잡혔다).
// 🔴 판정값은 **「간선(쌍)이 Ontology 에 실재하는가」** 다 — 관계명 매핑이 필요 없다.
//    관계명 일치는 «부가 열»이고, 스키마가 단정해 주는 것만 매핑한다. 나머지는 실패가 아니라
//    **「매핑 미정」으로 이름을 남긴다**(모르는 것을 틀린 것으로 세지 않는다).
const REL_MAP = {
  HAS_COMPONENT: ['HAS_COMPONENT'],
  HAS_FAILURE_MODE: ['COMPONENT_FAILURE_MODE', 'EQUIPMENT_FAILURE_MODE'],
  MITIGATED_BY: ['FAILURE_MODE_SOP'],
  REQUIRES: ['SOP_SAFETY_RULE'],
  ON_EQUIPMENT: ['ALARM_ON_EQUIPMENT', 'INCIDENT_ON_EQUIPMENT', 'MAINTENANCE_ON_EQUIPMENT', 'WORK_ORDER_ON_EQUIPMENT', 'SENSOR_ON_EQUIPMENT'],
  MONITORED_BY: ['SENSOR_ON_EQUIPMENT'],
  ESCALATES_TO: ['ALARM_ESCALATES_TO_INCIDENT'],
  RESOLVED_BY: ['WORK_ORDER_FOR_INCIDENT'],
  HAS_REVISION: ['REVISION_OF_DOCUMENT', 'SOP_REVISION', 'SAFETY_RULE_REVISION'],
  // 🔴 실측 정정(50대): 처음엔 EQUIPMENT_DOCUMENT 하나만 넣어 15건이 «불일치»로 잡혔다.
  //    실물은 `safety_rule.current_revision_id`·`sop.current_revision_id` 쪽이었다 — 그래프가 아니라
  //    **내 매핑이 좁았다.** 스키마 FK 가 단정해 주는 만큼만 넓힌다(초록이 보고 싶어서가 아니라).
  DOCUMENTED_BY: ['EQUIPMENT_DOCUMENT', 'SAFETY_RULE_REVISION', 'SOP_REVISION', 'REVISION_OF_DOCUMENT'],
  DIAGNOSED_AS: ['INCIDENT_DIAGNOSIS'],
  INDICATED_BY: ['FAILURE_MODE_INDICATOR'],
};
function scanEdges(text, acc) {
  // 겹치는 경로(a-[r]-b-[r2]-c)를 다 잡으려면 토큰으로 쪼갠다.
  const parts = text.split(/\s*-\[([A-Z_]+)\]-\s*/);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const rel = parts[i];
    const a = String(parts[i - 1]).trim().split(/\s+/).pop();
    const b = String(parts[i + 1]).trim().split(/\s+/)[0];
    if (!a || !b) continue;
    acc.total += 1;
    const pair = ssotEdgePairs.has(`${a}|${b}`) || ssotEdgePairs.has(`${b}|${a}`);
    if (pair) acc.pairInOntology += 1; else acc.pairMissing.push(`${a} -[${rel}]- ${b}`);
    const mapped = REL_MAP[rel];
    if (!mapped) { acc.labelUnmapped += 1; acc.unmappedRels.set(rel, (acc.unmappedRels.get(rel) ?? 0) + 1); continue; }
    acc.labelDenom += 1;
    const labelOk = mapped.some((m) => ssotEdges.has(`${a}|${m}|${b}`) || ssotEdges.has(`${b}|${m}|${a}`));
    if (labelOk) acc.labelConsistent += 1; else acc.labelMismatch.push(`${a} -[${rel}]- ${b}`);
  }
}
const acc = { total: 0, pairInOntology: 0, labelDenom: 0, labelConsistent: 0, labelUnmapped: 0, pairMissing: [], labelMismatch: [], unmappedRels: new Map() };
for (const r of measured) for (const h of r.strategies.graphrag?.hits ?? []) scanEdges(h.excerpt, acc);
// 🔴 대조군 — 심은 가짜 간선이 «실재하지 않음»으로 잡히는가. 안 잡히면 이 축의 초록은 뜻이 없다.
const ctlAcc = { total: 0, pairInOntology: 0, labelDenom: 0, labelConsistent: 0, labelUnmapped: 0, pairMissing: [], labelMismatch: [], unmappedRels: new Map() };
scanEdges('[Control] EQ-NOT-REAL-001 -[HAS_COMPONENT]- CP-NOT-REAL-001', ctlAcc);
const edgeControlBites = ctlAcc.total === 1 && ctlAcc.pairInOntology === 0;

// 지표 7 — Citation Validity: hit 의 evidenceId 가 SSOT 에 실재하는가.
const cite = {};
for (const s of STRATEGIES) {
  let total = 0, valid = 0; const bad = new Set();
  for (const r of measured) for (const id of hitIds(r, s)) {
    total += 1;
    if (isCited(id)) valid += 1; else bad.add(id);
  }
  cite[s] = { total, valid, invalidSample: [...bad].slice(0, 8) };
}
// 🔴 대조군 — 심은 가짜 인용 2건이 «무효»로 잡히는가. 안 잡히면 200/200 은 「전부 유효로 세는 계기」다.
const citeControlBites = !isCited('DOC-NOT-REAL-9999@r9#999') && !isCited('EQ-NOT-REAL-001');

const summary = {
  base: BASE, declaredK: K, observedMaxHits: observedMax,
  questions: questions.length, measured: measured.length,
  excludedNot200: excluded.map((r) => ({ id: r.id, status: r.status, code: r.error?.code ?? null })),
  noEvidenceExpectation: measured.filter((r) => requiredEvidence(r.id).length === 0).map((r) => r.id),
  control: { question: CONTROL_Q, status: controlRow.status, code: controlRow.error?.code ?? null },
  cap0Guard: { proven: guardProven, trips: guardTrips },
  ssot: { ids: ssotIds.size, edges: ssotEdges.size },
  metric2_evidenceRecallAtK: metric2,
  metric3_sopRetrieval: metric3,
  metric4_graphPath: {
    edges: acc.total, pairInOntology: acc.pairInOntology,
    labelDenom: acc.labelDenom, labelConsistent: acc.labelConsistent, labelUnmapped: acc.labelUnmapped,
    pairMissingSample: acc.pairMissing.slice(0, 8), labelMismatchSample: acc.labelMismatch.slice(0, 8),
    unmappedRels: Object.fromEntries(acc.unmappedRels), controlBites: edgeControlBites,
  },
  metric7_citationValidity: { ...cite, controlBites: citeControlBites },
  latencyMsByStrategy: Object.fromEntries(STRATEGIES.map((s) => {
    const v = measured.map((r) => r.strategies[s]?.elapsedMs).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    return [s, { n: v.length, median: v.length ? v[Math.floor(v.length / 2)] : null, min: v[0] ?? null, max: v[v.length - 1] ?? null }];
  })),
};
console.log(JSON.stringify(summary, null, 2));

// 🔴 그물이 스스로 거부하는 자리 — 이 중 하나라도 어긋나면 이 실행의 수치는 판정에 못 쓴다.
const refusals = [];
if (!guardProven) refusals.push('cap 0 감시기가 물지 않았다 — 이 실행은 cap 0 을 증명하지 못한다');
if (controlRow.status === 200) refusals.push('가짜 대조군이 200 을 받았다 — 문이 무엇이든 통과시킨다');
if (observedMax !== K) refusals.push(`선언한 K=${K} 와 관측 상한 ${observedMax} 이 다르다`);
if (acc.total === 0) refusals.push('경로 간선을 0건 훑었다 — 지표 4 는 시험되지 않았다(계기 결함 의심)');
if (!edgeControlBites) refusals.push('심은 가짜 간선을 지표 4 가 못 잡는다 — 그 초록은 뜻이 없다');
if (!citeControlBites) refusals.push('심은 가짜 인용을 지표 7 이 못 잡는다 — 그 초록은 뜻이 없다');
if (refusals.length) { console.error('REFUSED:\n - ' + refusals.join('\n - ')); process.exit(2); }
process.exit(0);
