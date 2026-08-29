/**
 * 계약 표면 대조 — 「이 셸이 부르는 경로가 전부 계약 v0.1 안인가」 (T1-9 AC ⑤).
 *
 *   node scripts/contract-surface.mjs
 *
 * 🔴 검사기가 «아무것도 안 본 채» 초록을 내는 것을 먼저 막는다. 스캔한 파일이 0개면 FAIL이다 —
 *    경로를 잘못 줘서 0건이 나온 것을 「위반 0건」으로 읽는 사고가 실제로 일어난다(이 세션에서
 *    내가 한 번 밟았다: 잘못된 디렉터리에 grep을 걸고 빈 결과를 통과로 읽을 뻔했다).
 *
 * 🔴 이 검사는 «허용 목록»이지 문법 검사가 아니다. 계약에 없는 경로가 필요해 보이면 코드가 아니라
 *    오케에 간다(계약 동결 — 화면이 필요하다는 이유로 표면이 늘면 계약이 사후 추인이 된다).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 계약 v0.1(rest-api-v0.1.md)에서 이 셸이 쓰는 경로 — lib/contract.ts의 CONTRACT_SURFACE와 짝.
const ALLOWED = [
  /^\/api\/sessions$/,
  /^\/api\/sessions\/\$\{[^}]+\}\/reset$/, // 템플릿 리터럴 형태 그대로
  /^\/api\/live\/status$/,
  /^\/api\/:path\*$/, // next.config.ts의 rewrite 원본·대상 표기
];

const ROOTS = ["app", "components", "lib", "proxy.ts", "next.config.ts"];
const EXT = /\.(ts|tsx|mjs|js)$/;

function walk(p, out) {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return out;
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e), out);
  } else if (EXT.test(p)) {
    out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r, []));
if (files.length === 0) {
  console.error("🔴 FAIL 스캔한 파일 0개 — 검사 대상 경로가 틀렸다(초록이 아니라 고장이다)");
  process.exit(1);
}

const API = /["'`](\/api\/[^"'`]*)["'`]/g;
const FETCH = /\bfetch\s*\(/g;

/**
 * 주석을 걷어낸다 — 검사 대상은 «부르는 경로»이지 설명문이 아니다.
 * 🔴 줄 «중간»의 `//`는 건드리지 않는다(문자열 안의 `http://`를 잘라 먹으면, 그 줄에 있던 진짜
 *    경로가 조용히 검사에서 빠진다 — 관대해지는 쪽으로 틀리는 검사기가 제일 나쁘다).
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

let bad = 0;
const seen = new Set();
const fetchers = [];

for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  if (FETCH.test(src)) fetchers.push(f);
  for (const m of src.matchAll(API)) {
    const path = m[1];
    seen.add(`${path}  (${f})`);
    if (!ALLOWED.some((re) => re.test(path))) {
      console.error(`🔴 FAIL 계약 밖 경로 ${path} — ${f}`);
      bad++;
    }
  }
}

console.log(`== 스캔 ${files.length}파일 · /api 경로 ${seen.size}종`);
for (const s of [...seen].sort()) console.log(`   ${s}`);
console.log(`== fetch 호출 파일 ${fetchers.length}: ${fetchers.join(", ")}`);

// 🔴 fetch가 여러 파일로 흩어지면 표면이 «한 곳»에서 관리되지 않는다는 뜻이다.
if (fetchers.length !== 1 || !fetchers[0].endsWith("contract.ts")) {
  console.error("🔴 FAIL fetch는 lib/contract.ts 한 곳에만 있어야 한다");
  bad++;
}

console.log(bad === 0 ? "== 계약 표면 대조: PASS (계약 밖 0)" : `== 계약 표면 대조: FAIL ${bad}건`);
process.exit(bad === 0 ? 0 : 1);
