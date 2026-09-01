#!/usr/bin/env node
// contract test 러너 — 계약 스키마와 케이스 데이터를 대조한다.
//
//   node tests/contract/run.js                       # cases/*.cases.json 전건
//   node tests/contract/run.js --cases <파일|디렉터리>
//   node tests/contract/run.js --schema <경로>        # 케이스 파일의 schema를 덮어씀
//   node tests/contract/run.js --quiet                # 실패·요약만 출력
//   node tests/contract/run.js --strict-coverage      # 미실행 스키마 속성이 있으면 exit 1
//
// exit code: 0 = 전건 PASS(자기 검증 포함) · 1 = 1건이라도 실패 · 2 = 실행 오류(경로·JSON 등)
//
// 커버리지는 기본 «경고»다 — 계약이 필드를 추가한 직후, 케이스를 붙이기 전에
// CI가 죽는 것을 막기 위해서다. strict 전환 시점은 통합 담당이 정한다.

const fs = require('fs');
const path = require('path');
const { validate, unsupportedKeywords, collectDeclaredProperties } = require('./validator');

const ROOT = path.resolve(__dirname, '..', '..');
const CASE_DIR = path.join(__dirname, 'cases');

function parseArgs(argv) {
  const a = { cases: null, schema: null, quiet: false, strictCoverage: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases') a.cases = argv[++i];
    else if (argv[i] === '--schema') a.schema = argv[++i];
    else if (argv[i] === '--quiet') a.quiet = true;
    else if (argv[i] === '--strict-coverage') a.strictCoverage = true;
    else die(`알 수 없는 인자: ${argv[i]}`);
  }
  return a;
}

function die(msg) { console.error(`실행 오류: ${msg}`); process.exit(2); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`${p} — ${e.message}`); }
}

function caseFiles(target) {
  const t = target ? path.resolve(target) : CASE_DIR;
  if (!fs.existsSync(t)) die(`케이스 경로 없음: ${t}`);
  if (fs.statSync(t).isFile()) return [t];
  const found = fs.readdirSync(t).filter(f => f.endsWith('.cases.json')).map(f => path.join(t, f));
  if (found.length === 0) die(`케이스 파일 없음: ${t}/*.cases.json`);
  return found.sort();
}

/** 케이스 1건 실행 → { ok, got, detail } */
function runCase(schema, c, defaults, touched = null) {
  const event = { ...defaults, ...c.event };
  const errors = validate(schema, schema, event, '', touched);
  const got = errors.length === 0 ? 'accept' : 'reject';
  return { ok: got === c.expect, got, detail: errors[0] || '' };
}

function runSuite(file, override, quiet) {
  const suite = readJson(file);
  const schemaPath = path.resolve(ROOT, override || suite.schema);
  if (!fs.existsSync(schemaPath)) die(`스키마 없음: ${schemaPath}`);
  const schema = readJson(schemaPath);

  // 조용한 통과 방지 — 검증기가 모르는 키워드를 계약이 쓰기 시작하면 즉시 드러낸다.
  const unknown = unsupportedKeywords(schema);

  const defaults = suite.envelopeDefaults || {};
  const touched = new Set();
  const results = suite.cases.map(c => ({ c, r: runCase(schema, c, defaults, touched) }));
  const failed = results.filter(x => !x.r.ok);

  // 커버리지 — 케이스가 «한 번도 내려가 보지 않은» 속성 선언을 찾는다.
  // 한 번도 실행되지 않는 필드는 타입이 바뀌어도 suite가 초록을 유지한다.
  const declared = collectDeclaredProperties(schema);
  const uncovered = [...declared.entries()].filter(([node]) => !touched.has(node)).map(([, path]) => path).sort();

  if (!quiet) {
    console.log(`\n■ ${suite.name}`);
    console.log(`  스키마: ${path.relative(ROOT, schemaPath)}  ·  케이스: ${path.relative(ROOT, file)}`);
    let group = null;
    for (const { c, r } of results) {
      if (c.group !== group) { group = c.group; console.log(`  ${group}`); }
      const mark = r.ok ? 'PASS' : 'FAIL';
      const tail = r.ok ? '' : `  ← 기대 ${c.expect} / 실제 ${r.got}${r.detail ? ' · ' + r.detail : ''}`;
      console.log(`    ${mark}  ${c.label}${tail}`);
    }
  } else {
    for (const { c, r } of failed) console.log(`  FAIL  ${c.label}  ← 기대 ${c.expect} / 실제 ${r.got}`);
  }

  if (unknown.length) {
    console.log(`  🔴 검증기 미지원 키워드 ${unknown.length}건 — 계약이 앞서갔다. validator.js에 추가할 것:`);
    for (const u of unknown.slice(0, 5)) console.log(`     ${u}`);
  }

  if (uncovered.length) {
    console.log(`  ◻ 커버리지: 선언 속성 ${declared.size} 중 ${uncovered.length}건이 «한 번도 실행되지 않았다» — 케이스를 붙이지 않으면 타입이 바뀌어도 초록이 유지된다`);
    for (const u of uncovered) console.log(`     ${u}`);
  } else if (!quiet) {
    console.log(`  ✅ 커버리지: 선언 속성 ${declared.size}건 전부 실행됨`);
  }

  return { suite, schema, results, failed: failed.length, unknown: unknown.length, declared: declared.size, uncovered: uncovered.length };
}

// ── 자기 검증 ───────────────────────────────────────────────────────────────
// 러너가 «항상 초록»이 되는 함정을 막는다. 결속(allOf/if-then)을 제거한 스키마를 만들어
// 같은 케이스를 돌렸을 때 반드시 실패가 나와야 한다. 실패가 0이면 러너가 아무것도
// 검사하지 않고 있다는 뜻이므로, 그 자체를 실패로 처리한다.
function selfCheck(suites, quiet) {
  const lines = [];
  let broken = 0;
  for (const s of suites) {
    if (!Array.isArray(s.schema.allOf) || s.schema.allOf.length === 0) {
      lines.push(`  건너뜀 (${s.suite.name}) — allOf 결속이 없어 변형 대상이 아니다`);
      continue;
    }
    const mutated = JSON.parse(JSON.stringify(s.schema));
    delete mutated.allOf;                       // type↔payload 결속만 제거
    const defaults = s.suite.envelopeDefaults || {};
    const caught = s.suite.cases.filter(c => !runCase(mutated, c, defaults).ok).length;
    lines.push(`  결속 제거 스키마 → 실패 ${caught}건 감지 (${s.suite.name})`);
    if (caught === 0) broken++;
  }
  if (!quiet) { console.log('\n■ 자기 검증 — 고장난 스키마를 주면 러너가 반드시 실패를 낸다'); lines.forEach(l => console.log(l)); }
  else if (broken) lines.forEach(l => console.log(l));
  return broken;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = caseFiles(args.cases);
  const suites = files.map(f => runSuite(f, args.schema, args.quiet));

  const total = suites.reduce((n, s) => n + s.results.length, 0);
  const failed = suites.reduce((n, s) => n + s.failed, 0);
  const unknown = suites.reduce((n, s) => n + s.unknown, 0);
  const declared = suites.reduce((n, s) => n + s.declared, 0);
  const uncovered = suites.reduce((n, s) => n + s.uncovered, 0);
  const selfBroken = selfCheck(suites, args.quiet);

  const covTail = uncovered
    ? ` · 커버리지 ${declared - uncovered}/${declared} ${args.strictCoverage ? '🔴 strict — 미실행 있으면 실패' : '(경고 모드)'}`
    : ` · 커버리지 ${declared}/${declared}`;
  console.log(`\n결과: ${total - failed}/${total} 통과 · 실패 ${failed}건 · 자기 검증 ${selfBroken === 0 ? 'PASS' : 'FAIL(러너가 검사하지 않고 있다)'}${unknown ? ` · 미지원 키워드 ${unknown}건` : ''}${covTail}`);

  const coverageFails = args.strictCoverage && uncovered > 0;
  process.exit(failed === 0 && selfBroken === 0 && unknown === 0 && !coverageFails ? 0 : 1);
}

main();
