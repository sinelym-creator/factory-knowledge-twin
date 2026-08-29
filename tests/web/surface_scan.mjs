/**
 * 계약 표면 «독립» 대조 — 구현의 scripts/contract-surface.mjs 를 부르지 않는다.
 *
 *   node tests/web/surface_scan.mjs [appDir] [contractMd]
 *
 * 🔴 왜 따로 세우는가: contract_surface_drill.mjs 가 구현 검사기의 사정거리 밖 5건(절대 URL·
 *    템플릿 접두·ROOTS 밖 디렉터리·EXT 밖 확장자·전역 정규식 lastIndex 잔류)을 실측했다.
 *    그 검사기의 초록은 「계약 밖 0」의 근거로 쓰기에 좁다 — 그물이 좁은 것과 주장이 거짓인 것은
 *    다르므로, 주장 쪽을 «내 모집단»으로 다시 잰다.
 *
 * 이 도구의 규율 3가지
 *   ① 모집단을 먼저 센다 — 훑은 파일과 «훑지 않은» 파일을 둘 다 출력한다.
 *      「위반 없음」과 「보지 않음」은 화면에서 똑같이 생겼다(센쿠2 6대).
 *   ② 허용 목록을 손으로 옮겨 적지 않는다 — 동결 계약 문서(rest-api-v0.1.md)를 직접 파싱한다.
 *      옮겨 적은 표는 원본이 바뀌어도 조용하다.
 *   ③ 정규식에 /g + .test() 를 쓰지 않는다(구현 검사기가 그것으로 샜다 — D-13).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const APP = process.argv[2] ?? join(process.cwd(), "apps", "web-console");
const CONTRACT_MD = process.argv[3] ?? join(process.cwd(), "packages", "contracts", "rest-api-v0.1.md");

/* ── ① 동결 계약을 직접 파싱한다 ─────────────────────────────────────────────── */
function contractSurface(md) {
  const src = readFileSync(md, "utf8");
  const baseM = /base\s*=\s*`([^`]+)`/.exec(src);
  if (!baseM) throw new Error("🔴 FAIL 계약 문서에서 base 선언을 못 찾았다 — 파서가 틀렸거나 계약이 바뀌었다");
  const base = baseM[1];
  const eps = [];
  for (const line of src.split("\n")) {
    const t = line.trim();
    const m = /^\|\s*(GET|POST|PUT|PATCH|DELETE|WS)\s+`([^`]+)`/.exec(t);
    if (m) eps.push({ method: m[1], path: base + m[2] });
    // `POST /a | /b` 처럼 한 칸에 두 경로를 적은 행(승인/반려)
    const alt = /^\|\s*(GET|POST|PUT|PATCH|DELETE|WS)\s+`([^`]+)`\s*\\?\|\s*`([^`]+)`/.exec(t);
    if (alt) eps.push({ method: alt[1], path: base + alt[3] });
  }
  if (eps.length === 0) throw new Error("🔴 FAIL 계약 엔드포인트 0건 파싱 — 표 형식이 바뀌었다(초록이 아니라 고장이다)");
  return { base, eps };
}

const RX_META = new RegExp("[.*+?^${}()|\\[\\]\\\\]", "g");

/** `/api/sessions/{sid}/reset` → 코드에 나타나는 형태(`${...}`·리터럴 id)를 함께 받는 정규식 */
function toMatcher(p) {
  const body = p
    .split(/\{[^}]+\}/)
    .map((s) => s.replace(RX_META, (c) => "\\" + c))
    .join("(?:\\$\\{[^}]*\\}|[^/?#]+)");
  return new RegExp("^" + body + "(?:\\?.*)?$");
}

/* ── ② 모집단 — 앱 전체를 훑고, 훑지 않은 것을 «명시»한다 ────────────────────── */
const SKIP_DIR = new Set(["node_modules", ".next", ".git", "public"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".css", ".json", ".html"]);
const SKIP_FILE = new Set(["pnpm-lock.yaml", "package-lock.json"]);

function census(dir, acc = { scanned: [], skipped: [] }) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIR.has(e)) acc.skipped.push([relative(APP, p) + "/", "디렉터리 제외(빌드·의존·정적자산)"]);
      else census(p, acc);
    } else if (SKIP_FILE.has(e)) acc.skipped.push([relative(APP, p), "락파일"]);
    else if (TEXT_EXT.has(extname(e))) acc.scanned.push(p);
    else acc.skipped.push([relative(APP, p), "비텍스트 확장자 " + (extname(e) || "(없음)")]);
  }
  return acc;
}

/* ── ③ 나가는 호출과 URL 리터럴 ──────────────────────────────────────────────── */
const NET = [
  ["fetch", /\bfetch\s*\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["axios", /\baxios\b/],
  ["WebSocket", /\bnew\s+WebSocket\s*\(/],
  ["EventSource", /\bnew\s+EventSource\s*\(/],
  ["sendBeacon", /\bsendBeacon\s*\(/],
  ["node:http", /\brequire\(["']https?["']\)|from\s+["']node:https?["']/],
];
// 따옴표 «직후»를 요구하지 않는다 — 접두 표현(`${base}/api/x`)까지 잡으려는 것이다.
const LITERAL = /(["'`])((?:https?:\/\/|\/)[^"'`\n]*?)\1/g;
const EMBEDDED = /(["'`])[^"'`\n]*?(\$\{[^}]*\}\/[A-Za-z0-9_\-./:{}$*]+)[^"'`\n]*?\1/g;

/**
 * 🔴 주석은 «지우지» 않고 «표시»한다.
 *
 *    첫 판에서 나는 주석을 안 가르고 4건을 「계약 밖」으로 냈다 — 넷 다 설명문이었다.
 *    내 주입이 틀리면 그 축은 검사가 없는 것과 같다(5대). 그런데 주석을 지워 버리면 이번엔
 *    내가 «보지 않은 것»이 생긴다. 그래서 코드/주석을 나눠 세고, 주석 쪽도 계속 «출력»한다:
 *    판정은 코드 줄로만 내리고, 설명문에 남은 경로는 사람이 읽도록 남긴다.
 */
function commentMask(src) {
  const lines = src.split("\n");
  const mask = new Array(lines.length).fill(false);
  let block = false;
  lines.forEach((l, i) => {
    const t = l.trim();
    if (block) { mask[i] = true; if (t.includes("*/")) block = false; return; }
    if (/^\/\*/.test(t)) { mask[i] = true; if (!t.includes("*/")) block = true; return; }
    if (/^(\/\/|\*)/.test(t)) mask[i] = true;
  });
  return { lines, mask };
}

const { base, eps } = contractSurface(CONTRACT_MD);
const matchers = eps.map((e) => ({ ...e, re: toMatcher(e.path) }));
const { scanned, skipped } = census(APP);

const callSites = [];
const apiPaths = new Map();   // 계약 base 아래 경로
const routePaths = new Map(); // 화면 라우트로 보이는 경로
const absolute = new Map();   // 절대 URL

const push = (map, k, where) => {
  const cur = map.get(k) ?? { code: new Set(), comment: new Set() };
  cur[where.isComment ? "comment" : "code"].add(where.rel + ":" + where.line);
  map.set(k, cur);
};

for (const f of scanned) {
  const rel = relative(APP, f).replace(/\\/g, "/");
  const raw = readFileSync(f, "utf8");
  for (const [name, re] of NET) if (re.test(raw)) callSites.push([rel, name]);  // 🔴 /g 없음 = 상태 없음
  const { lines, mask } = commentMask(raw);
  lines.forEach((line, i) => {
    const where = { rel, line: i + 1, isComment: mask[i] };
    const spans = [];
    for (const m of line.matchAll(LITERAL)) {
      spans.push([m.index, m.index + m[0].length]);
      const v = m[2];
      if (/^https?:\/\//.test(v)) push(absolute, v, where);
      else if (v.startsWith(base + "/") || v === base) push(apiPaths, v, where);
      else push(routePaths, v, where);
    }
    // 🔴 LITERAL이 이미 통째로 집은 리터럴은 다시 세지 않는다(첫 판에서 reset 경로를
    //    조각으로 한 번 더 세어 위양성 1건을 만들었다 — 같은 것을 두 번 세면 없는 결함이 는다).
    for (const m of line.matchAll(EMBEDDED)) {
      if (spans.some(([a, b]) => m.index >= a && m.index + m[0].length <= b)) continue;
      push(apiPaths, "«접두 표현» " + m[2], where);
    }
  });
}

const w = (s, n) => String(s).padEnd(n);
let fail = 0;
console.log("== 독립 계약 표면 대조");
console.log("계약 정본  " + relative(process.cwd(), CONTRACT_MD) + "  base=" + base + " · 엔드포인트 " + eps.length + "건 파싱");
console.log("모집단     훑음 " + scanned.length + "파일 / 제외 " + skipped.length + "항");
for (const [p, why] of skipped) console.log("   제외  " + w(p, 34) + why);
if (scanned.length === 0) { console.error("🔴 FAIL 모집단 0 — 고장이다"); process.exit(1); }

console.log("\n-- 나가는 호출 지점 (" + callSites.length + ")");
for (const [f, k] of callSites) console.log("   " + w(f, 34) + k);

// rewrite 표기 = next.config.ts의 `/api/:path*` 원본·대상 한 쌍(포트만 갈아 끼우는 통로다).
const isRewriteToken = (p) => /(^|\})\/api\/:path\*$/.test(p.replace("«접두 표현» ", ""));

console.log("\n-- base(" + base + ") 아래 경로 " + apiPaths.size + "종  [코드 줄 = 판정 대상 · 주석 줄 = 참고]");
for (const [p, at] of [...apiPaths].sort()) {
  const hit = matchers.find((m) => m.re.test(p));
  const ok = Boolean(hit) || isRewriteToken(p);
  const inCode = at.code.size > 0;
  if (!ok && inCode) fail++;
  const tag = hit ? hit.method : isRewriteToken(p) ? "rewrite 표기" : inCode ? "🔴 계약 밖" : "주석 전용";
  const mark = !inCode ? "·" : ok ? "○" : "🔴";
  const src = (inCode ? "코드 " + [...at.code].join(",") : "") + (at.comment.size ? "  주석 " + [...at.comment].join(",") : "");
  console.log("   " + mark + " " + w(p, 50) + w(tag, 14) + src);
}

console.log("\n-- 절대 URL " + absolute.size + "종 (rewrite 대상 base인지 사람이 판정)");
for (const [u, at] of [...absolute].sort())
  console.log("   " + w(u, 50) + (at.code.size ? "코드 " + [...at.code].join(",") : "") + (at.comment.size ? "  주석 " + [...at.comment].join(",") : ""));

console.log("\n-- 그 밖 절대경로 리터럴 " + routePaths.size + "종 (화면 라우트·정적자산 — 계약 축 아님)");
for (const [p, at] of [...routePaths].sort())
  console.log("   " + w(p, 50) + (at.code.size ? "코드 " + [...at.code].join(",") : "") + (at.comment.size ? "  주석 " + [...at.comment].join(",") : ""));

console.log("\n== " + (fail === 0 ? "계약 밖 0 (내 모집단 " + scanned.length + "파일 · 코드 줄 기준)" : "🔴 계약 밖 " + fail + "건"));
process.exit(fail === 0 ? 0 : 1);
