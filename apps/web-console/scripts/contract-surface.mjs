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
 *
 * 🔴 이 검사기의 «사정거리» — levi2 T1-9 독립 검증이 주입 14건으로 잰 결과(D-06~D-09).
 *    초록을 인용할 때 이 한계를 함께 인용하지 않으면 그 인용은 과대계상이다:
 *      ① 절대 URL(`http://127.0.0.1:8000/api/…`)은 문자열 «직후»가 `/api/`가 아니라 안 문다.
 *         rewrite를 우회해 포트를 직접 부르는 형태가 여기 해당한다.
 *      ② 접두 표현(`` `${base}/api/…` ``)도 같은 이유로 안 문다.
 *      ③ ROOTS·EXT는 «손으로 적은» 목록이다. 코드가 자라면 뒤처진다 — 「스캔 N파일」은
 *         정직하지만 N이 전부인지는 이 검사기가 세지 않는다.
 *    🔴 그래서 사정거리를 넓히지 «않는다». 넓히면 이 검사기가 「계약 밖 0」의 증명이라는
 *       착각이 굳는다. 주장 자체는 독립 모집단으로 따로 재는 것이 맞다(tests/web/surface_scan.mjs
 *       가 22파일로 그 축을 이미 세웠다). 이 검사기는 «가장 흔한 형태»의 회귀 알람으로 남는다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 계약 v0.1(rest-api-v0.1.md)에서 이 셸이 쓰는 경로 — lib/contract.ts의 CONTRACT_SURFACE와 짝.
const ALLOWED = [
  /^\/api\/sessions$/,
  /^\/api\/sessions\/\$\{[^}]+\}\/reset$/, // 템플릿 리터럴 형태 그대로
  /^\/api\/live\/status$/,
  /^\/api\/:path\*$/, // next.config.ts의 rewrite 원본·대상 표기
  // --- T3-2 조회 계층(계약 v0.1.7 + 정정 append) ------------------------------
  // 🔴 목록을 «계약에 있는 것»으로만 늘린다. 화면이 필요하다는 이유로 여기에 줄을 더하면
  //    이 검사기는 「계약 밖 0」이 아니라 「내가 쓴 것 전부 허용」이 된다.
  /^\/api\/plants$/,
  /^\/api\/plants\/\$\{[^}]+\}\/overview$/,
  /^\/api\/equipment\/\$\{[^}]+\}$/,
  /^\/api\/equipment\/\$\{[^}]+\}\/sensors\/\$\{[^}]+\}\/series\?window=\$\{[^}]+\}$/,
  /^\/api\/incidents\/\$\{[^}]+\}$/,
  /^\/api\/scenarios$/,
  /^\/api\/scenarios\/\$\{[^}]+\}\/runs$/,
  /^\/api\/runs\/\$\{[^}]+\}$/,
  // --- T3-3 근거 열람(계약 §근거·그래프 동결 본문 + v0.1.1 형상 append) --------------
  // 🔴 이 둘은 계약 «동결 본문»에 이미 있는 라우트다(v0.1.6 이 읽기 예외로 지목한 그 둘).
  //    새로 만든 표면이 아니라, 화면이 이제야 소비하기 시작한 표면이다.
  /^\/api\/evidence\/\$\{[^}]+\}$/,
  /^\/api\/documents\/\$\{[^}]+\}$/,
  /^\/api\/documents\/\$\{[^}]+\}\?highlight=\$\{[^}]+\}$/,
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

const API = /["'`](\/api\/[^"'`]*)["'`]/g; // matchAll — /g가 «필요»하다
// 🔴 `/g`를 뗐다(D-13 · levi2 실측). `/g` 정규식에 `.test()`를 쓰면 lastIndex가 «남아»,
//    다음 파일에서 그보다 앞에 있는 `fetch(`를 건너뛴다. 지금까지 안 샌 이유는 설계가 아니라
//    파일 이름 순서였다 — `lib/session.ts`가 `contract.ts` 뒤에 읽히며 lastIndex를 0으로
//    되돌렸을 뿐이다. 그 파일을 지우거나 이름을 바꾸면 새고, 새면 «검사기가 본 것과 답한 것»이
//    갈린다: 경로 목록에는 그 파일이 찍히는데 fetch 호출 파일 목록에는 없는 출력이 나온다.
const FETCH = /\bfetch\s*\(/;

// 🔴 같은 사고가 조용히 돌아오지 못하게 «불변식을 검사기가 스스로» 확인한다.
//    상태를 가진 정규식(/g)은 .test()에 쓰지 않는다 — 한 번 어기면 증상이 파일 이름에 달린다.
for (const [name, re] of [["FETCH", FETCH], ["EXT", EXT]]) {
  if (re.global) {
    console.error(`🔴 FAIL ${name}은 .test()에 쓰이는데 /g가 붙었다 — lastIndex가 남아 샌다(D-13)`);
    process.exit(1);
  }
}

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
  // 🔴 두 사실을 «한 변수»에서 낸다. 경로 목록의 표시와 아래 fetch 목록이 서로 다른 판단을
  //    쓰면, 검사기가 「proxy.ts에서 /api 경로를 봤다」고 찍으면서 「fetch는 contract.ts 하나」
  //    라고 답하는 출력이 나온다(D-13에서 실제로 나왔다). 같은 값을 두 번 쓰면 갈릴 수 없다.
  const callsFetch = FETCH.test(src);
  if (callsFetch) fetchers.push(f);
  for (const m of src.matchAll(API)) {
    const path = m[1];
    seen.add(`${path}  (${f}${callsFetch ? " · fetch 호출" : " · 문자열만"})`);
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
  const stray = fetchers.filter((f) => !f.endsWith("contract.ts"));
  console.error(
    `🔴 FAIL fetch는 lib/contract.ts 한 곳에만 있어야 한다 — 실측 ${fetchers.length}곳` +
      (stray.length ? `: ${stray.join(", ")}` : " (contract.ts에 fetch가 없다)")
  );
  bad++;
}

console.log(bad === 0 ? "== 계약 표면 대조: PASS (계약 밖 0)" : `== 계약 표면 대조: FAIL ${bad}건`);
process.exit(bad === 0 ? 0 : 1);
