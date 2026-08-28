// agent-events 스키마의 type↔payload 결속을 «양방향»으로 실측한다 (검증 F-1·F-2·F-3b·F-4 재검증).
//
// 통과 케이스만 보면 결속은 증명되지 않는다 — 「틀린 조합이 실제로 거부되는가」가 결속의 정의다.
// 의존성 없음. 사용: node event-binding.check.js <schema.json>
//
// 지원 키워드(본 스키마가 쓰는 것만): $ref · type · required · additionalProperties:false
//                                   properties · enum · const · minimum · minItems · allOf · if/then
const fs = require('fs');
const schema = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const deref = s => (s && s.$ref) ? s.$ref.split('/').slice(1).reduce((o, k) => o[k], schema) : s;

function validate(sch, v, path = '') {
  sch = deref(sch);
  if (!sch) return [];
  const e = [];
  const t = sch.type;
  if (t === 'object' && (typeof v !== 'object' || v === null || Array.isArray(v))) return [`${path}: object 아님`];
  if (t === 'array' && !Array.isArray(v)) return [`${path}: array 아님`];
  if (t === 'string' && typeof v !== 'string') return [`${path}: string 아님`];
  if ((t === 'integer' || t === 'number') && typeof v !== 'number') return [`${path}: number 아님`];
  if (t === 'boolean' && typeof v !== 'boolean') return [`${path}: boolean 아님`];
  if (sch.enum && !sch.enum.includes(v)) e.push(`${path}: enum 위반(${JSON.stringify(v)})`);
  if ('const' in sch && v !== sch.const) e.push(`${path}: const 불일치`);
  if (typeof sch.minimum === 'number' && v < sch.minimum) e.push(`${path}: minimum 위반`);
  if (Array.isArray(v)) {
    if (typeof sch.minItems === 'number' && v.length < sch.minItems) e.push(`${path}: minItems 위반`);
    if (sch.items) v.forEach((it, i) => e.push(...validate(sch.items, it, `${path}[${i}]`)));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const r of sch.required || []) if (!(r in v)) e.push(`${path}: 필수 «${r}» 누락`);
    const props = sch.properties || {};
    if (sch.additionalProperties === false)
      for (const k of Object.keys(v)) if (!(k in props)) e.push(`${path}: 미허용 속성 «${k}»`);
    for (const [k, sub] of Object.entries(props)) if (k in v) e.push(...validate(sub, v[k], `${path}.${k}`));
  }
  for (const sub of sch.allOf || []) {
    if (sub.if) { if (validate(sub.if, v, path).length === 0 && sub.then) e.push(...validate(sub.then, v, path)); }
    else e.push(...validate(sub, v, path));
  }
  return e;
}

const env = (type, payload, extra = {}) =>
  ({ runId: 'R1', seq: 0, ts: '2026-08-28T06:00:00Z', mode: 'live', type, payload, ...extra });

const DOC = { evidenceId: 'E1', kind: 'doc-chunk', sourceId: 'DOC-SOP-0014@r2#007', revisionId: 'DOC-SOP-0014@r2', contentHash: 'abc', stale: false };

// [기대, 라벨, 이벤트]  기대 accept = 통과해야 정상 / reject = 거부돼야 정상
const CASES = [
  // ① 정상 8종 — 전부 통과해야 한다
  ['accept', '① run.started',            env('run.started', { scenarioId: 'GS-01', question: 'q' })],
  ['accept', '① plan.updated',           env('plan.updated', { steps: ['structured'] })],
  ['accept', '① step.started(최소형)',    env('step.started', { step: 'vector' })],
  ['accept', '① step.evidence',          env('step.evidence', { step: 'vector', evidence: DOC })],
  ['accept', '① step.completed',         env('step.completed', { step: 'vector', elapsedMs: 120 })],
  ['reject', '① step.completed에 elapsedMs 누락', env('step.completed', { step: 'vector' })],  // F-9 지원 위해 필수화됨
  ['accept', '① run.completed',          env('run.completed', { candidates: [{ rank: 1, failureModeId: 'FM-BRG-WEAR', label: 'x', evidenceIds: ['E1'] }] })],
  ['accept', '① run.stopped(F-3b)',      env('run.stopped', { reason: 'user' })],
  ['accept', '① run.failed',             env('run.failed', { code: 'E', message: 'm' })],
  // ② 오배선 — 전부 거부돼야 한다 (F-2의 본체)
  ['reject', '② completed에 failed payload', env('run.completed', { code: 'E', message: 'm' })],
  ['reject', '② failed에 completed payload', env('run.failed', { candidates: [{ rank: 1, failureModeId: 'F', label: 'x', evidenceIds: ['E1'] }] })],
  ['reject', '② started에 completed 전용필드', env('step.started', { step: 'vector', summary: 's' })],
  ['reject', '② completed에 started 전용필드', env('step.completed', { step: 'vector', elapsedMs: 1, note: 'n' })],
  ['reject', '② stopped에 failed payload',   env('run.stopped', { code: 'E', message: 'm' })],
  ['reject', '② evidence에 started payload', env('step.evidence', { step: 'vector' })],
  ['reject', '② 미정의 stepId',              env('step.started', { step: 'nope' })],
  ['reject', '② 미정의 stop reason',         env('run.stopped', { reason: 'nope' })],
  // ③ F-4 신뢰 필드 — doc-chunk 조건부 required
  ['reject', '③ doc-chunk에 revisionId 누락', env('step.evidence', { step: 'vector', evidence: { evidenceId: 'E1', kind: 'doc-chunk', sourceId: 'S', contentHash: 'a' } })],
  ['reject', '③ doc-chunk에 contentHash 누락', env('step.evidence', { step: 'vector', evidence: { evidenceId: 'E1', kind: 'doc-chunk', sourceId: 'S', revisionId: 'R' } })],
  ['accept', '③ 비 doc-chunk는 면제(alarm)',  env('step.evidence', { step: 'vector', evidence: { evidenceId: 'E2', kind: 'alarm', sourceId: 'AL-20260826-0041' } })],
  // ④ replay ⊂ live — 동일 payload가 mode만 바꿔 통과해야 한다
  ['accept', '④ replay 모드 동일 이벤트',     env('step.evidence', { step: 'vector', evidence: DOC }, { mode: 'replay' })],
];

let fail = 0;
for (const [expect, label, ev] of CASES) {
  const errs = validate(schema, ev, '');
  const got = errs.length === 0 ? 'accept' : 'reject';
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(32)} 기대 ${expect.padEnd(6)} 실제 ${got}${ok ? '' : '  ← ' + (errs[0] || '거부 사유 없음')}`);
}
console.log(`\n결속 검사: ${CASES.length - fail}/${CASES.length} 통과 · 실패 ${fail}건`);

// 부가 관찰 — stale 필드가 doc-chunk 필수인지 (보고 주장 대조)
const noStale = env('step.evidence', { step: 'vector', evidence: { evidenceId: 'E1', kind: 'doc-chunk', sourceId: 'S', revisionId: 'R', contentHash: 'h' } });
console.log(`관찰: doc-chunk에서 «stale» 생략 시 → ${validate(schema, noStale, '').length === 0 ? '통과(= 선택 필드)' : '거부(= 필수 필드)'}`);
