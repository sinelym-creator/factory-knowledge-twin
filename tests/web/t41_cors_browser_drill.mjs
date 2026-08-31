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

const b = await chromium.launch();
const page = await (await b.newContext()).newPage();

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

console.log(`== 대상 ai-api ${API} · allowlist = ${ALLOWED}`);
const a = await probe(ALLOWED, "허용");
const d = await probe(DENIED, "비허용");
await b.close();

const ok = a.read === true && d.read === false;
console.log(ok ? "\n결과: 브라우저가 집행한다 — 허용은 읽히고 비허용은 못 읽는다" : "\n🔴 결과: 어긋남");
process.exit(ok ? 0 : 1);
