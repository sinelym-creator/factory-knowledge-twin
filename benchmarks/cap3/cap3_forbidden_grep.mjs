/** CAP3 ⑤ 금칙어 그물 — 정본 v0.2.4 화면 문면 개정:
 *    「화면 금칙어 = 「LLM」「게이트웨이」「429」「토큰」「걸쇠」— 사용자 문장에 쓰지 않는다
 *     (코드·evidence 에는 쓴다)」
 *
 *  🔴 판정 주체는 «사용자 문장»이지 파일이 아니다. 주석·식별자·import 는 금칙이 아니다 —
 *     정본이 그것을 명시적으로 허용한다. 그래서 주석을 먼저 걷어내고, 남은 줄에서
 *     «한글이 든 문자열 리터럴»만 본다.
 *  🔴 교정 칸 동봉: 심은 위반 1줄을 같은 실행에서 물어 본다. 안 물면 이 그물의 0 은 「잰 0」이 아니다.
 *
 *  node cap3_forbidden_grep.mjs <webConsoleDir>
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2];
if (!ROOT) { console.error("usage: <webConsoleDir>"); process.exit(2); }
const WORDS = ["LLM", "게이트웨이", "429", "토큰", "걸쇠"];

function files(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "generated") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files(p, acc);
    else if (/\.(tsx|ts)$/.test(e)) acc.push(p);
  }
  return acc;
}

/* 주석을 지운다 — 정본이 「코드에는 쓴다」고 했으므로 주석 안의 금칙어는 위반이 아니다. */
function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlock.split("\n").map((l) => {
    if (l.trim().startsWith("//")) return "";
    return l.replace(/\/\/.*$/, "");
  }).join("\n");
}

/* 사용자 문장 후보 = 한글이 든 문자열 리터럴. 식별자·경로·import 는 한글을 담지 않는다. */
function userSentences(src) {
  const out = [];
  stripComments(src).split("\n").forEach((line, i) => {
    const lits = line.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
    for (const lit of lits) if (/[가-힣]/.test(lit)) out.push({ n: i + 1, text: lit });
  });
  return out;
}

function scan(src) {
  const hits = [];
  for (const s of userSentences(src)) {
    for (const w of WORDS) if (s.text.includes(w)) hits.push({ n: s.n, text: s.text, word: w });
  }
  return hits;
}

/* 🔴 교정 — 평범한 위반 한 줄을 심어 이 그물이 무는지 같은 실행에서 묻는다. */
const planted = 'const msg = "LLM 호출에 실패했습니다";';
if (scan(planted).length === 0) {
  console.log("== 교정 불성립 — 심은 위반을 못 문다 ==");
  process.exit(2);
}
console.log("[교정] 심은 위반 1줄 검출 = O");

const list = files(ROOT);
let total = 0;
for (const f of list) {
  for (const h of scan(readFileSync(f, "utf8"))) {
    total += 1;
    console.log(`  ${f.replace(ROOT, "")}:${h.n}  [${h.word}]  ${h.text.slice(0, 90)}`);
  }
}
console.log(`== 금칙어 위반 ${total}건 · 대상 파일 ${list.length}본 ==`);
