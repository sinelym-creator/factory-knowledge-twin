// 최소 JSON Schema 검증기 — 계약 스키마가 실제로 쓰는 키워드만 지원한다.
//
// 외부 의존 0을 유지하기 위한 자체 구현이다. 범용 validator가 아니다 —
// 지원하지 않는 키워드를 만나면 «조용히 통과»시키므로, 계약이 새 키워드를 쓰기 시작하면
// 여기에 추가해야 한다. 그 사실을 잊지 않도록 run.js가 자기 검증으로 감시한다.
//
// 지원: $ref · type · required · additionalProperties:false · properties
//       enum · const · minimum · minItems · items · allOf · if/then · format(date-time)
//
// 🔴 `format`은 JSON Schema 2020-12 기본 규정상 «주석»이지 «단언»이 아니다.
//    본 harness는 계약 테스트이므로 의도적으로 «단언»으로 다룬다 — 계약이 date-time을
//    선언해 두고 아무 문자열이나 통과시키면 계약이라 부를 수 없다.

const SUPPORTED = new Set([
  '$ref', 'type', 'required', 'additionalProperties', 'properties',
  'enum', 'const', 'minimum', 'minItems', 'items', 'allOf', 'if', 'then', 'format',
  // 검증에 영향 없는 주석성 키워드
  '$schema', '$id', 'title', 'description', '$defs',
]);

/**
 * 스키마가 미지원 키워드를 쓰고 있으면 경로 목록으로 돌려준다(조용한 통과 방지).
 * 🔴 `properties`·`$defs`의 «키»는 속성 이름이지 키워드가 아니다 — 값만 스키마로 내려간다.
 *    (이 구분을 빼면 runId·seq 같은 필드명이 전부 미지원 키워드로 오탐된다.)
 */
const SCHEMA_MAP_KEYS = new Set(['properties', '$defs']);       // 값이 «이름→스키마» 맵
const SCHEMA_VALUE_KEYS = new Set(['items', 'if', 'then']);      // 값이 스키마 1개
const SCHEMA_LIST_KEYS = new Set(['allOf']);                     // 값이 스키마 배열

function unsupportedKeywords(schema, path = '#') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const out = [];
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED.has(k)) { out.push(`${path}.${k}`); continue; }
    if (SCHEMA_MAP_KEYS.has(k) && v && typeof v === 'object') {
      for (const [name, sub] of Object.entries(v)) out.push(...unsupportedKeywords(sub, `${path}.${k}.${name}`));
    } else if (SCHEMA_VALUE_KEYS.has(k)) {
      out.push(...unsupportedKeywords(v, `${path}.${k}`));
    } else if (SCHEMA_LIST_KEYS.has(k) && Array.isArray(v)) {
      v.forEach((sub, i) => out.push(...unsupportedKeywords(sub, `${path}.${k}[${i}]`)));
    }
  }
  return out;
}

/**
 * 스키마가 «선언한» 속성 전부를 Map<속성 스키마 노드, 표시 경로>로 수집한다.
 *
 * 🔴 이름이 아니라 «노드»로 센다. `note`처럼 같은 이름이 여러 def에 있을 때
 *    한 곳만 실행하고 전부 실행했다고 세면 그게 곧 거짓 초록이다.
 *    (`if`/`then`은 판정 술어이지 데이터 선언이 아니므로 수집 대상이 아니다.)
 */
function collectDeclaredProperties(schema, path = '#', out = new Map(), seen = new Set()) {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return out;
  seen.add(schema);
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [name, sub] of Object.entries(schema.properties)) {
      out.set(sub, `${path}.${name}`);
      collectDeclaredProperties(sub, `${path}.${name}`, out, seen);
    }
  }
  if (schema.$defs && typeof schema.$defs === 'object') {
    for (const [name, sub] of Object.entries(schema.$defs)) collectDeclaredProperties(sub, name, out, seen);
  }
  if (schema.items) collectDeclaredProperties(schema.items, `${path}[]`, out, seen);
  return out;
}

function validate(schema, root, value, path = '', touched = null) {
  let sch = schema;
  if (sch && sch.$ref) sch = sch.$ref.split('/').slice(1).reduce((o, k) => o && o[k], root);
  if (!sch || typeof sch !== 'object') return [];

  const errors = [];
  const t = sch.type;
  if (t === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) return [`${path || '#'}: object 아님`];
  if (t === 'array' && !Array.isArray(value)) return [`${path || '#'}: array 아님`];
  if (t === 'string' && typeof value !== 'string') return [`${path || '#'}: string 아님`];
  if ((t === 'integer' || t === 'number') && typeof value !== 'number') return [`${path || '#'}: number 아님`];
  if (t === 'integer' && !Number.isInteger(value)) errors.push(`${path}: integer 아님`);
  if (t === 'boolean' && typeof value !== 'boolean') return [`${path || '#'}: boolean 아님`];

  if (sch.enum && !sch.enum.includes(value)) errors.push(`${path}: enum 위반(${JSON.stringify(value)})`);
  if (sch.format === 'date-time' && typeof value === 'string' && Number.isNaN(Date.parse(value))) {
    errors.push(`${path}: date-time 형식 위반(${JSON.stringify(value)})`);
  }
  if ('const' in sch && value !== sch.const) errors.push(`${path}: const 불일치`);
  if (typeof sch.minimum === 'number' && typeof value === 'number' && value < sch.minimum) errors.push(`${path}: minimum 위반`);

  if (Array.isArray(value)) {
    if (typeof sch.minItems === 'number' && value.length < sch.minItems) errors.push(`${path}: minItems 위반`);
    if (sch.items) value.forEach((item, i) => errors.push(...validate(sch.items, root, item, `${path}[${i}]`, touched)));
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of sch.required || []) if (!(r in value)) errors.push(`${path}: 필수 «${r}» 누락`);
    const props = sch.properties || {};
    if (sch.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in props)) errors.push(`${path}: 미허용 속성 «${k}»`);
    }
    for (const [k, sub] of Object.entries(props)) {
      if (k in value) {
        if (touched) touched.add(sub);   // «실제로 이 속성으로 내려갔다»는 사실만 계수한다
        errors.push(...validate(sub, root, value[k], `${path}.${k}`, touched));
      }
    }
  }

  for (const sub of sch.allOf || []) {
    if (sub.if) {
      // if는 판정 술어다 — 여기서의 진입은 커버리지로 계수하지 않는다(touched 미전달).
      if (validate(sub.if, root, value, path).length === 0 && sub.then) {
        errors.push(...validate(sub.then, root, value, path, touched));
      }
    } else {
      errors.push(...validate(sub, root, value, path, touched));
    }
  }

  return errors;
}

module.exports = { validate, unsupportedKeywords, collectDeclaredProperties };
