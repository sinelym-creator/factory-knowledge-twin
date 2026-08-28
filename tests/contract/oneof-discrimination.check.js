// T0-5 agent-events 스키마의 payload.oneOf 판별 가능성 실측
// 최소 검증기: required · additionalProperties:false · properties(enum/type/$ref-stepId)만 다룬다
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const defs = s.$defs;
const STEP = defs.stepId.enum;

function matches(def, obj) {
  const props = def.properties || {};
  const req = def.required || [];
  for (const r of req) if (!(r in obj)) return false;
  if (def.additionalProperties === false)
    for (const k of Object.keys(obj)) if (!(k in props)) return false;
  for (const [k, v] of Object.entries(obj)) {
    const p = props[k]; if (!p) continue;
    if (p.$ref === '#/$defs/stepId' && !STEP.includes(v)) return false;
    if (p.enum && !p.enum.includes(v)) return false;
    if (p.type === 'string' && typeof v !== 'string') return false;
    if (p.type === 'array' && !Array.isArray(v)) return false;
    if (p.type === 'object' && typeof v !== 'object') return false;
  }
  return true;
}

const names = s.properties.payload.oneOf.map(r => r.$ref.split('/').pop());
const cases = [
  ['step.started  (note 없음 — 최소형)', { step: 'vector' }],
  ['step.started  (note 있음)',          { step: 'vector', note: 'x' }],
  ['step.completed(summary 있음)',        { step: 'vector', summary: 'y' }],
  ['step.completed(최소형)',              { step: 'vector' }],
  ['step.evidence',                       { step: 'vector', evidence: { evidenceId: 'E1', kind: 'doc-chunk', sourceId: 'DOC-SOP-0014@r2#007' } }],
  ['run.started',                         { scenarioId: 'GS-01', question: 'q' }],
  ['plan.updated',                        { steps: ['structured'] }],
  ['run.failed',                          { code: 'E', message: 'm' }],
];

let bad = 0;
for (const [label, obj] of cases) {
  const hit = names.filter(n => matches(defs[n], obj));
  const ok = hit.length === 1;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} oneOf 매칭 ${hit.length}건 [${hit.join(', ')}]`);
}
console.log(`\noneOf 판별 실패 케이스: ${bad}건 / ${cases.length}`);
