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
 *
 * ── Q-71(2026-09-02 · 리바이2 25대) ────────────────────────────────────────────
 * T5-5 본 판정에서 이 그물이 **위양성 10건**을 냈다. 모집단이 22→53파일로 자라며(scripts/ 3본)
 * 드러난 네 갈래였고, 계약 위반은 **0건**이었다. 네 갈래를 각각 «다른 규칙»으로 고쳤다:
 *
 *   ⓐ 계약의 축약 표기 `` `/a/{id}/approve` \| `/reject` `` 를 파서가 `base + "/reject"` 로
 *      등록했다 — 꼬리 조각은 **앞 경로의 마지막 세그먼트를 대체**한다.
 *   ⓑ 계약이 쿼리까지 적은 행(`?highlight={chunkId}`·`?window=24h\|3w`)을 경로 리터럴로 굳혔다 —
 *      matcher 는 이미 쿼리를 옵셔널로 받으므로, 계약 쪽 쿼리는 **잘라내고 경로로만** 대조한다.
 *   ⓒ Next rewrite 표기를 `/api/:path*` 하나로만 알아봤다 — `:param` 세그먼트 일반형으로 넓히되,
 *      🔴 **`next.config.ts` 에서 온 줄로 한정**한다. 넓히기만 하면 다른 파일이 `:path*` 를 달아
 *      계약 밖 경로를 통과시킬 수 있다.
 *   ⓓ 경로가 아닌 진행률 템플릿(`${pass}/${total}`)을 「접두 표현」으로 셌다 — 접두 표현은
 *      **뒤가 base 로 이어질 때만** 판정 대상이고, 그 밖은 **지우지 않고 별도 목록으로 출력**한다.
 *
 * 🔴 넷 다 「눈을 좁혀」 고치지 않았음을 스스로 증명한다 — `--self-check` 가 네 갈래 각각에
 *    «그 우회로 들어온 진짜 계약 밖 경로»를 주입해 여전히 빨강인지 잰다. 위양성을 없애는 가장
 *    쉬운 길은 검출력을 버리는 것이고, 그 길로 갔는지는 주입해 봐야만 안다.
 *
 *   node tests/web/surface_scan.mjs --self-check    # 주입 5종 + 깨끗한 사본 대조군
 */
import { readFileSync, readdirSync, statSync, cpSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SELF_CHECK = process.argv[2] === "--self-check";
const APP = (SELF_CHECK ? undefined : process.argv[2]) ?? join(process.cwd(), "apps", "web-console");
const CONTRACT_MD =
  (SELF_CHECK ? undefined : process.argv[3]) ?? join(process.cwd(), "packages", "contracts", "rest-api-v0.1.md");

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
    // 🔴 두 번째 캡처는 «경로처럼 생긴 것»으로 한정한다 — `/` 로 시작하고 공백이 없다.
    //    안 그러면 표의 «다음 칸»(응답 형상 `{ ok, version }`)을 대체 경로로 읽는다. §expandAlt 주석.
    const alt = /^\|\s*(GET|POST|PUT|PATCH|DELETE|WS)\s+`([^`]+)`\s*\\?\|\s*`(\/[^`\s]*)`/.exec(t);
    if (alt) eps.push({ method: alt[1], path: base + expandAlt(alt[2], alt[3]) });
  }
  if (eps.length === 0) throw new Error("🔴 FAIL 계약 엔드포인트 0건 파싱 — 표 형식이 바뀌었다(초록이 아니라 고장이다)");
  return { base, eps };
}

/**
 * 🔴 Q-71 ⓐ — 축약 표기를 «편다».
 *
 * 계약은 `` `/work-orders/{woId}/approve` \| `/reject` `` 처럼 뒤 경로를 **꼬리 조각**으로만 적는다.
 * 앞판은 그 조각을 그대로 base 에 붙여 `/api/reject` 라는 **없는 경로**를 등록했고, 그 결과
 * 진짜 계약 경로인 `/api/work-orders/{woId}/reject` 가 「계약 밖」으로 나왔다.
 *
 * 규칙: 뒤가 세그먼트 «하나»뿐이면 앞 경로의 마지막 세그먼트를 그것으로 갈아 끼운다.
 *       두 개 이상이면 그 자체가 완전한 경로다(그대로 쓴다).
 *
 * 🔴 **이 함수가 처음에 검출력을 팔았다 — `--self-check` 가 그것을 잡았다.**
 *    호출부의 두 번째 캡처를 제한하기 «전»에는 마크다운 표의 다음 칸(응답 형상)까지 들어와서
 *    `` | GET `/health` | `{ ok, version }` | `` 가 `/api/{ ok, version }` 이라는 엔드포인트로
 *    등록됐다. matcher 는 `{…}` 를 경로 파라미터로 읽으므로 그것은 `^/api/[^/?#]+$` —
 *    **`/api/` 아래 단일 세그먼트를 전부 통과시키는 와일드카드**다. 위양성 4종을 고치는 김에
 *    `/api/secret-endpoint` 같은 진짜 위반을 통째로 눈감을 뻔했다.
 *    그래서 두 방어를 함께 둔다: 호출부 정규식이 «경로처럼 생긴 것»만 캡처하고, 여기서도
 *    한 번 더 확인한다. 한 겹은 고쳐 쓰다 지워질 수 있다.
 */
const RX_PATHISH = /^\/[A-Za-z0-9_\-./{}]*$/;

function expandAlt(first, second) {
  if (!RX_PATHISH.test(second)) return first; // 경로가 아니다 — 대체하지 않는다
  const segs = second.split("/").filter(Boolean);
  if (segs.length !== 1) return second;
  const head = first.split("/").filter(Boolean).slice(0, -1);
  return "/" + [...head, segs[0]].join("/");
}

const RX_META = new RegExp("[.*+?^${}()|\\[\\]\\\\]", "g");

/**
 * `/api/sessions/{sid}/reset` → 코드에 나타나는 형태(`${...}`·리터럴 id)를 함께 받는 정규식
 *
 * 🔴 Q-71 ⓑ — 계약 쪽 «쿼리»는 잘라내고 경로로만 대조한다.
 *    계약 문서는 어떤 행에만 쿼리를 적는다(`/documents/{docId}?highlight={chunkId}` ·
 *    `/…/series?window=24h\|3w`). 앞판은 그 `?…` 를 경로 리터럴로 굳혀, 같은 엔드포인트를
 *    쿼리 없이(또는 다른 쿼리로) 부르는 코드를 「계약 밖」으로 냈다.
 *    matcher 는 꼬리에서 이미 `(?:\?.*)?` 로 **모든 쿼리를 허용**하고 있었다 — 즉 이 그물에
 *    «쿼리 축»은 원래 없다. 계약 쪽만 그 사실과 어긋나 있었을 뿐이라, 잘라내도 검출력은
 *    한 칸도 줄지 않는다(쿼리를 재려면 그것은 별도 축으로 새로 세워야 한다).
 */
function toMatcher(p) {
  const pathOnly = p.split("?")[0];
  const body = pathOnly
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

/* ── ④ 🔴 자기 검증 — 「위양성을 없앴는가」와 「검출력을 팔았는가」는 다른 물음이다 ────────
 *
 * Q-71 의 네 수정은 전부 «통과시키는 쪽»으로 갔다. 그런 수정은 위양성과 함께 진양성도 지운다 —
 * 그 여부는 **그 우회로 들어온 진짜 계약 밖 경로를 넣어 봐야만** 안다. 네 갈래 각각 하나씩,
 * 그리고 아무 재주도 부리지 않은 평범한 위반 하나를 넣고 **여전히 빨강인지** 잰다.
 * 대조군으로 «주입하지 않은 같은 사본»도 돌린다 — 그게 초록이어야 위 빨강이 주입에 귀속된다.
 */
const INJECTIONS = [
  ["ⓐ 축약 표기 우회 — 형제처럼 생긴 없는 경로",
   'export const wo = (id) => fetch(`/api/work-orders/${id}/escalate`);'],
  ["ⓑ 쿼리 뒤에 숨은 계약 밖 «경로»",
   'export const doc = (id) => fetch(`/api/documents/${id}/raw?highlight=1`);'],
  ["ⓒ next.config 밖에서 :param 을 단 계약 밖 경로",
   'export const adm = () => fetch("/api/admin/:path*");'],
  ["ⓓ base 로 이어지는 접두 표현의 계약 밖 경로",
   'export const pre = (b) => fetch(`${b}/api/admin/reset`);'],
  ["ⓔ 평범한 계약 밖 리터럴(대조 기준)",
   'export const plain = () => fetch("/api/secret-endpoint");'],
];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "fkt-surface-scan-"));
  cpSync(APP, dir, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.next|\.git)([\\/]|$)/.test(src),
  });
  return dir;
}

function runOn(dir) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), dir, CONTRACT_MD], {
    encoding: "utf8",
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function runSelfCheck() {
  console.log("== surface_scan 자기 검증 (Q-71) — 「눈을 좁혀 고쳤는가」를 주입으로 묻는다\n");
  let bad = 0;

  const clean = sandbox();
  try {
    const base0 = runOn(clean);
    const okBase = base0.code === 0;
    if (!okBase) bad++;
    console.log(`  ${okBase ? "PASS" : "FAIL"}  대조군 — 주입 없는 사본은 초록이어야 한다        exit ${base0.code}`);
    if (!okBase) console.log(base0.out.split("\n").filter((l) => l.includes("🔴")).slice(0, 6).join("\n"));

    for (const [name, code] of INJECTIONS) {
      const target = join(clean, "lib", "__q71_inject.ts");
      if (!existsSync(dirname(target))) { console.log("  🔴 FAIL  사본에 lib/ 가 없다 — 사본 구성이 틀렸다"); bad++; break; }
      writeFileSync(target, code + "\n", "utf8");
      const r = runOn(clean);
      rmSync(target, { force: true });
      const caught = r.code === 1;
      if (!caught) bad++;
      console.log(`  ${caught ? "PASS" : "FAIL"}  ${name.padEnd(46)}exit ${r.code}${caught ? "" : "  🔴 주입한 위반을 놓쳤다 — 검출력이 줄었다"}`);
    }
  } finally {
    rmSync(clean, { recursive: true, force: true });
  }

  console.log("\n== " + (bad === 0 ? "자기 검증 통과 — 위양성 4종을 고치고도 진양성 5종을 전부 잡는다" : `🔴 자기 검증 실패 ${bad}건`));
  return bad === 0 ? 0 : 1;
}

const { base, eps } = contractSurface(CONTRACT_MD);
if (SELF_CHECK) process.exit(runSelfCheck());
const matchers = eps.map((e) => ({ ...e, re: toMatcher(e.path) }));
const { scanned, skipped } = census(APP);

const callSites = [];
const apiPaths = new Map();   // 계약 base 아래 경로
const routePaths = new Map(); // 화면 라우트로 보이는 경로
const absolute = new Map();   // 절대 URL
const templates = new Map();  // `${x}/${y}` 꼴이나 base 로 이어지지 않는 것 — 판정 대상 아님(Q-71 ⓓ)

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
      // 🔴 Q-71 ⓓ — 「접두 표현」은 `${base}` «뒤가 계약 base 로 이어질 때»만 판정 대상이다.
      //    앞판은 `${pass}/${total}` 같은 진행률 문자열까지 base 아래 경로로 세어 4건을 만들었다.
      //    그렇다고 버리지는 않는다 — 아래 별도 목록으로 «출력»한다(지우면 내가 안 본 것이 된다).
      const tail = m[2].replace(/^\$\{[^}]*\}/, "");
      if (tail === base || tail.startsWith(base + "/")) push(apiPaths, "«접두 표현» " + m[2], where);
      else push(templates, m[2], where);
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

/**
 * rewrite 표기 = next.config.ts 의 `/api/:path*` 원본·대상 한 쌍(포트만 갈아 끼우는 통로다).
 *
 * 🔴 Q-71 ⓒ — `:param` 세그먼트 일반형으로 넓히되 **파일로 한정**한다.
 *    앞판은 `/api/:path*` 한 형태만 알아봐서 `/api/ws/:path*` 를 계약 밖으로 냈다. 그렇다고
 *    「`:param` 이 있으면 통과」로 넓히면, 다른 파일이 계약 밖 경로에 `:path*` 를 달아 그물을
 *    지나갈 수 있다 — 위양성을 없애자고 검출력을 파는 짓이다. 그래서 rewrite 문법이 실제로
 *    뜻을 갖는 자리(`next.config.*`)의 **코드 줄에서만** 인정하고, 한 줄이라도 다른 파일에서
 *    왔으면 인정하지 않는다.
 */
const RX_REWRITE_SEG = /\/:[A-Za-z_][A-Za-z0-9_]*\*?(?=\/|$)/;
const RX_NEXT_CONFIG = /(^|\/)next\.config\.[cm]?[jt]s:/;
const isRewriteToken = (p, at) =>
  RX_REWRITE_SEG.test(p.replace("«접두 표현» ", "")) &&
  at.code.size > 0 &&
  [...at.code].every((loc) => RX_NEXT_CONFIG.test(loc));

console.log("\n-- base(" + base + ") 아래 경로 " + apiPaths.size + "종  [코드 줄 = 판정 대상 · 주석 줄 = 참고]");
for (const [p, at] of [...apiPaths].sort()) {
  const hit = matchers.find((m) => m.re.test(p));
  const rewrite = isRewriteToken(p, at);
  const ok = Boolean(hit) || rewrite;
  const inCode = at.code.size > 0;
  if (!ok && inCode) fail++;
  const tag = hit ? hit.method : rewrite ? "rewrite 표기" : inCode ? "🔴 계약 밖" : "주석 전용";
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

// 🔴 Q-71 ⓓ — 판정 «대상은 아니지만» 내가 본 것은 남긴다. 여기 목록이 갑자기 0이 되면
//    그것은 「깨끗해졌다」가 아니라 「내 EMBEDDED 가 죽었다」는 신호다.
console.log("\n-- `${…}/…` 템플릿 " + templates.size + "종 (base 로 이어지지 않는다 — 경로가 아니다 · 판정 대상 아님)");
for (const [p, at] of [...templates].sort())
  console.log("   " + w(p, 50) + (at.code.size ? "코드 " + [...at.code].join(",") : "") + (at.comment.size ? "  주석 " + [...at.comment].join(",") : ""));

console.log("\n== " + (fail === 0 ? "계약 밖 0 (내 모집단 " + scanned.length + "파일 · 코드 줄 기준)" : "🔴 계약 밖 " + fail + "건"));
process.exit(fail === 0 ? 0 : 1);
