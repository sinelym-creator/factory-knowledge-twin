/**
 * T4-1 ③ 브라우저 축 — 「닿는다 ≠ 읽힌다」(검증 좌석 · 13대).
 *
 * curl 은 헤더를 «보여 줄» 뿐 읽기 금지를 집행하지 않는다. 집행자는 브라우저다. 그래서 두
 * origin 에서 같은 fetch 를 던지고 «읽혔는가»를 센다.
 *
 * 🔴 **셸(3151)에서 재면 안 된다.** 셸에는 CSP `connect-src 'self'` 가 붙어 있어 타 origin
 *    fetch 가 CORS 이전에 CSP 로 막힌다 — 무엇이 막았는지 못 가른다. 그래서 CSP 없는 «맨»
 *    페이지 두 벌(`_origin_page_server.mjs`)을 따로 세우고, 한 변수(origin)만 가른다.
 *
 * 준비:
 *   node _origin_page_server.mjs 8066 &     # 허용될 origin
 *   node _origin_page_server.mjs 8068 &     # 허용 안 될 origin
 *   FKT_CORS_ORIGINS=http://127.0.0.1:8066 docker compose up -d ai-api    # allowlist 주입
 *   node t41_cors_browser_drill.mjs
 *
 * 실측(13대 · 대상 :8055): 허용 → 읽혔다 200/272자 · 비허용 → `TypeError: Failed to fetch`.
 */
import { chromium } from "@playwright/test";

const API = process.env.FKT_TARGET_API ?? "http://127.0.0.1:8055";
const ALLOWED = process.env.FKT_ORIGIN_ALLOWED ?? "http://127.0.0.1:8066";
const DENIED = process.env.FKT_ORIGIN_DENIED ?? "http://127.0.0.1:8068";

// 🔴 구조 가드 — 페이지 서버가 안 떠 있으면 「B 가 못 읽었다」가 CORS 차단인지 서버 부재인지
//    못 가른다. 두 origin 페이지가 실제로 200 을 주는지 먼저 확인하고, 아니면 exit 2.
async function pageAlive(origin) {
  try { const r = await fetch(origin + "/", { signal: AbortSignal.timeout(4000) }); return r.status === 200; }
  catch { return false; }
}
for (const [o, name] of [[ALLOWED, "허용 origin 페이지"], [DENIED, "비허용 origin 페이지"]]) {
  if (!(await pageAlive(o))) { console.error(`구조 가드 FAIL: ${name} ${o} 미도달 — 페이지 서버를 먼저 띄워라`); process.exit(2); }
}

const b = await chromium.launch();
const ctx = await b.newContext();
const page = await ctx.newPage();

async function probe(origin, label) {
  await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
  const r = await page.evaluate(async (api) => {
    try {
      const res = await fetch(api + "/api/health", { credentials: "include" });
      const body = await res.text();
      return { read: true, status: res.status, len: body.length };
    } catch (e) {
      return { read: false, err: `${e.name}: ${String(e.message).slice(0, 90)}` };
    }
  }, API);
  console.log(`  ${label.padEnd(10)} origin=${origin}  →  ${r.read ? `읽혔다 status=${r.status} 본문 ${r.len}자` : `못 읽었다 (${r.err})`}`);
  return r;
}

// 🔴 ③ preflight 축 — 브라우저가 «실제로» preflight 로 게이트하는가(계약 준수의 집행자).
//    단순요청(①②의 GET)은 preflight 를 안 띄운다. 비단순요청(content-type: application/json 인
//    fetch)을 던져 preflight 를 강제한다. method 를 손잡이로 둔다:
//      · POST(allowlist 메서드) : 허용 origin → preflight 200 → 통과 · 비허용 origin → preflight 400 → 차단
//      · DELETE(비허용 메서드)   : 허용 origin 이라도 preflight 가 method 를 거절 → 차단
//    🔴 «허용 origin 에서 POST 는 통과하는데 DELETE 는 차단»이 preflight 가 실제로 게이트한다는
//       거동 증거다(같은 origin · method 만 다름). OPTIONS 를 눈으로 못 봐도 이 차분이 증명한다.
//    🔴 playwright `page.on('request')` 는 CORS preflight(OPTIONS)를 request 이벤트로 «노출하지
//       않는다»(계측기 한계 · 55대 실측). 그래서 OPTIONS 는 «세지 않고» 거동 차분으로 판정하며,
//       OPTIONS 실계수는 서버 접근 로그(uvicorn)를 정본으로 evidence 에 병기한다.
async function nonsimple(origin, method, label) {
  await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
  const r = await page.evaluate(async ([api, m]) => {
    try {
      const res = await fetch(api + "/api/sessions", {
        method: m, credentials: "include",
        headers: { "content-type": "application/json" }, body: "{}",
      });
      return { read: true, status: res.status };
    } catch (e) {
      return { read: false, err: `${e.name}: ${String(e.message).slice(0, 90)}` };
    }
  }, [API, method]);
  console.log(`  ${label.padEnd(18)} origin=${origin} method=${method}  →  ${r.read ? `통과 status=${r.status}` : `차단 (${r.err})`}`);
  return r;
}

console.log(`== 대상 ai-api ${API} · allowlist(origin A) = ${ALLOWED} · 대조군(origin B) = ${DENIED}`);
console.log("-- ①② 단순 GET (읽힘 집행):");
const a = await probe(ALLOWED, "허용");
const d = await probe(DENIED, "비허용");
console.log("-- ③ 비단순요청 preflight 게이트(거동 차분):");
const apPost = await nonsimple(ALLOWED, "POST", "허용+POST");        // preflight 200 → 통과
const dpPost = await nonsimple(DENIED, "POST", "비허용+POST");       // preflight 400(origin) → 차단
const apDel = await nonsimple(ALLOWED, "DELETE", "허용+DELETE");     // preflight 400(method) → 차단
await b.close();

// 판정선: A 성공 1 · B 차단 1. + ③ 은 preflight 가 «게이트»함을 거동 차분으로:
//   허용 POST 통과 · 비허용 POST 차단 · 허용 DELETE(비허용 메서드) 차단.
const simpleOk = a.read === true && d.read === false;
const preflightGates = apPost.read === true && dpPost.read === false && apDel.read === false;
const ok = simpleOk && preflightGates;
console.log("\n판정:");
console.log(`  ① 허용 GET 읽힘 = ${a.read} · ② 비허용 GET 차단 = ${d.read === false}`);
console.log(`  ③ 허용 POST 통과 = ${apPost.read} · 비허용 POST 차단 = ${dpPost.read === false} · 허용 DELETE(비허용 메서드) 차단 = ${apDel.read === false}`);
console.log("  · preflight OPTIONS 실계수는 서버 접근 로그(uvicorn)를 정본으로 evidence 에 병기(playwright request 이벤트는 preflight 미노출).");
if (!simpleOk && !preflightGates) { console.error("🔴 드릴 미성립: A 성공·B 차단 어느 축도 성립 안 함(대상/무대 확인)"); process.exit(3); }
console.log(ok ? "\n결과: 브라우저가 CORS 를 집행한다 — 허용은 읽/통과 · 비허용은 차단 · preflight 가 method·origin 을 게이트"
              : "\n🔴 결과: 어긋남(축별 값 위 참조)");
process.exit(ok ? 0 : 1);
