/* 🔴 개인 절대경로를 적지 않는다(ci hygiene `.github/workflows/ci.yml:27` 게이트).
   이 트리의 `tests/web` 에 설치된 playwright 를 **상대 경로**로 연다 — 다른 사람의
   체크아웃에서도 같은 자리를 가리킨다. 다른 트리를 쓰려면 `FKT_PW` 로 덮는다. */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const B = "http://127.0.0.1:8802", WO = process.argv[2];
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 412, height: 600 } });
const page = await ctx.newPage();
await page.goto(`${B}/`, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/overview/, { timeout: 20000 }).catch(()=>{});
await page.waitForTimeout(1000);
const r = await page.goto(`${B}/work-orders/${WO}`, { waitUntil: "domcontentloaded" });
console.log("status", r.status(), "url", page.url());
await page.waitForTimeout(2500);
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
await br.close();
