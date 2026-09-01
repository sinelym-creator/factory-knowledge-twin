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
  // 🔴 D-11 (B): rewrite 가 «WS 하나»로 좁아졌다. HTTP `/api/*` 는 이제 함수 프록시
  //    (`app/api/[...path]/route.ts`)가 받고, rewrite 에 남은 것은 Route Handler 가
  //    낼 수 없는 101 업그레이드 경로뿐이다. 그래서 이 허용 표기도 함께 «좁힌다» —
  //    검사기가 넓은 채로 남으면 다음에 누가 `/api/:path*` 를 되살려도 아무도 모른다.
  /^\/api\/ws\/:path\*$/, // next.config.ts 의 rewrite 원본·대상 표기(WS 전용)
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
  // --- T3-4 실행·재생·전략 비교 -----------------------------------------------------
  // 🔴 넷 다 계약 «동결 본문»에 이미 있는 라우트다(runs 표면 5 + WS + /retrieval/compare).
  //    새로 연 표면이 아니라, 화면이 이제야 소비하기 시작한 표면이다 — 대응표 실측으로 확인했고
  //    신규 해제 소요는 0 이었다.
  /^\/api\/runs\/\$\{[^}]+\}\/stop$/,
  /^\/api\/runs\/\$\{[^}]+\}\/events$/,
  /^\/api\/retrieval\/compare$/,
  // 🔴 WS 는 계약 표기(`/ws/runs/{runId}`)에 base `/api` 가 붙은 형태가 «실재»다(실측 101).
  /^\/api\/ws\/runs\/\$\{[^}]+\}$/,
  // --- T3-5 작업지시서 초안 ---------------------------------------------------------
  // 🔴 셋 다 계약 «동결 본문»의 라우트다(v0.1.4~5 가 형상만 확정했다). 화면이 이제야 소비한다.
  /^\/api\/work-orders\/\$\{[^}]+\}$/,
  /^\/api\/work-orders\/\$\{[^}]+\}\/approve$/,
  /^\/api\/work-orders\/\$\{[^}]+\}\/reject$/,
];

const ROOTS = ["app", "components", "lib", "proxy.ts", "next.config.ts"];
const EXT = /\.(ts|tsx|mjs|js)$/;

// 🔴 **굳힌 응답 «데이터»는 부르는 자리가 아니다**(T4-2a · 회부 판정 08-31). 정적 replay 사본은
//    ai-api 응답 원문을 무가공으로 담고, 매니페스트는 「어느 라우트에서 굳혔나」를 적는다 —
//    둘 다 구체 id 가 박힌 «과거의 기록»이라 템플릿 리터럴 형태인 ALLOWED 와 영영 안 맞는다.
//    🔴 스캔 자체에서 빼지 않고 «경로 대조»에서만 뺀다: 이 파일들에 fetch 가 생기면 아래
//       「fetch 는 contract.ts 한 곳」 검사가 그대로 잡아야 한다. 관대해지는 범위를 최소로 둔다.
//    🔴 `(^|[\\/])` 로 시작한다 — ROOTS 가 `"lib"` 라 실제 경로는 구분자 없이 `lib\…` 로
//       시작한다. 앞에 구분자를 «요구»한 첫 판은 한 파일도 물지 못했고, 그 사실은 사람 눈이
//       아니라 아래 불변식이 잡았다(FAIL 64→65). 규칙은 자기가 죽은 것을 스스로 말해야 한다.
const DATA_ONLY = /(^|[\\/])lib[\\/]static-replay[\\/]generated[\\/]/;

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
const excluded = new Set();   // 🔴 제외한 것도 «센다» — 0건이면 규칙이 죽은 것이다(아래 불변식)

for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  // 🔴 두 사실을 «한 변수»에서 낸다. 경로 목록의 표시와 아래 fetch 목록이 서로 다른 판단을
  //    쓰면, 검사기가 「proxy.ts에서 /api 경로를 봤다」고 찍으면서 「fetch는 contract.ts 하나」
  //    라고 답하는 출력이 나온다(D-13에서 실제로 나왔다). 같은 값을 두 번 쓰면 갈릴 수 없다.
  const callsFetch = FETCH.test(src);
  if (callsFetch) fetchers.push(f);
  const dataOnly = DATA_ONLY.test(f);
  for (const m of src.matchAll(API)) {
    const path = m[1];
    if (dataOnly) {
      excluded.add(`${path}  (${f})`);
      continue;
    }
    seen.add(`${path}  (${f}${callsFetch ? " · fetch 호출" : " · 문자열만"})`);
    if (!ALLOWED.some((re) => re.test(path))) {
      console.error(`🔴 FAIL 계약 밖 경로 ${path} — ${f}`);
      bad++;
    }
  }
}

// 🔴 **제외 규칙이 «살아 있는지»를 검사기가 스스로 확인한다.** 굳힌 데이터 폴더는 있는데
//    규칙이 0파일을 물면(경로 구분자 드리프트·폴더 이름 변경) 이 검사는 다시 64건 FAIL 로
//    울리거나, 반대로 규칙이 넓어졌는데 아무도 모르게 된다 — 「막았다」와 「막는 코드가
//    동작한다」는 다른 사실이다. 제외 건수를 출력에 세워 두는 이유도 같다.
const dataFiles = files.filter((f) => DATA_ONLY.test(f));
const generatedDir = join("lib", "static-replay", "generated");
if (statSync(generatedDir, { throwIfNoEntry: false })?.isDirectory() && dataFiles.length === 0) {
  console.error(
    `🔴 FAIL 제외 규칙이 아무 파일도 물지 않았다 — ${generatedDir} 는 실재하는데 DATA_ONLY 매칭 0건이다`
  );
  bad++;
}

console.log(`== 스캔 ${files.length}파일 · /api 경로 ${seen.size}종`);
console.log(
  `== 굳힌 데이터 제외 ${dataFiles.length}파일 · 경로 ${excluded.size}종 (경로 대조만 제외 · fetch 검사는 그대로)`
);
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
