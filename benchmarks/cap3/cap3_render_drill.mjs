/** CAP3 ⑤/⑥ 렌더 축 — 「서버 문자열이 화면 «본문»에 실리는가」를 브라우저에서 묻는다.
 *
 *  🔴 A 열(셸 리터럴) 0건은 화면에 금칙어가 없다는 뜻이 «아니다». `rejectedReason` 은
 *     ai-api 가 만들고 화면이 싣는다 — 실측된 서버 문장 3종이 「게이트웨이」를 담는다.
 *     정본 v0.2.4 개정 = 문장 고정 + 원문은 `<details>`「자세히」 안. 그래서 판정선은
 *     ⓐ 안내 문장이 서는가 ⓑ 금칙어가 «본문»(details 밖)에 있는가 ⓒ details 가 열리는가 이다.
 *
 *  node cap3_render_drill.mjs <shellBase> [incidentPath]
 */
const PW = "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, API = "http://127.0.0.1:8851"] = process.argv.slice(2);
if (!B) { console.error("usage: <shellBase> [incidentPath]"); process.exit(2); }
const WORDS = ["LLM", "게이트웨이", "429", "토큰", "걸쇠"];

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
/* 🔴 **run 은 세션 소유다.** 밖에서 만든 run 을 브라우저가 열면 화면에 «아무것도» 안 뜬다 —
   1차 실행이 그랬다(배지 0 · 문단 0). 「자극 미성립」과 「처방이 안 보인다」는 다른 사실이라,
   자극은 브라우저 «자신의» 컨텍스트에서 만든다(page.request 가 그 쿠키를 공유한다). */
await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
/* 본문 sessionId 는 쿠키와 «같아야» 한다(서버가 둘이 다르면 422 로 거절한다 — 실측). */
const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
if (!sid) { console.log("자극 실패 — 브라우저에 fkt_sid 쿠키가 없다"); await br.close(); process.exit(2); }
const mk = await page.request.post(`${API}/api/scenarios/GS-01/runs`, { data: { sessionId: sid, mode: "live" } });
const made = await mk.json().catch(() => null);
if (!made?.runId) { console.log(`자극 실패 — run 생성 ${mk.status()} ${JSON.stringify(made)}`); await br.close(); process.exit(2); }
let term = "timeout";
for (let i = 0; i < 60; i += 1) {
  const r = await page.request.get(`${API}/api/runs/${made.runId}`);
  const b = await r.json().catch(() => null);
  if (b?.status && ["completed", "failed", "stopped"].includes(b.status)) { term = b.status; break; }
  await new Promise((res) => setTimeout(res, 700));
}
console.log(`자극 = run ${made.runId} · mode ${made.mode} · 종결 ${term} · incident ${made.incidentId}`);
await page.goto(`${B}/incidents/${made.incidentId}?run=${made.runId}`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2500);

const badge = page.getByTestId("synthesis-badge");
const reason = page.getByTestId("synthesis-rejected-reason");
const bCount = await badge.count();
const rCount = await reason.count();
console.log(`배지 ${bCount}개 · 안내문단 ${rCount}개`);
if (bCount) console.log(`  배지 문면 = ${JSON.stringify((await badge.first().innerText()).trim())} · data-axis=${await badge.first().getAttribute("data-axis")}`);
if (!rCount) { console.log("  안내 문단 없음 — 이 화면은 live-rejected 상태가 아니다(자극 미성립)"); await br.close(); process.exit(0); }

const full = (await reason.first().innerText()).trim();
/* 🔴 본문 = 문단 전체에서 details 안의 텍스트를 뺀 것. 「접혀 있다」가 아니라 「본문 밖인가」가 축이다. */
const inDetails = await reason.first().locator("details").count()
  ? (await reason.first().locator("details").first().innerText()).trim() : "";
const body = full.replace(inDetails, "").trim();
console.log(`  문단 전체 = ${JSON.stringify(full.slice(0, 160))}`);
console.log(`  details 안 = ${JSON.stringify(inDetails.slice(0, 120))}`);
console.log(`  본문(details 밖) = ${JSON.stringify(body.slice(0, 160))}`);
for (const w of WORDS) {
  const inBody = body.includes(w), inDet = inDetails.includes(w);
  if (inBody || inDet) console.log(`  [${w}] 본문 ${inBody ? "🔴 있다" : "없다"} · details 안 ${inDet ? "있다" : "없다"}`);
}
const bodyHits = WORDS.filter((w) => body.includes(w));
console.log(`== 본문 금칙어 ${bodyHits.length}건${bodyHits.length ? " 🔴 " + bodyHits.join(",") : ""} ==`);
/* ⓒ details 가 실제로 열리는가 — 「숨김이 아니다」의 판정선. */
const det = reason.first().locator("details");
if (await det.count()) {
  const before = await det.first().getAttribute("open");
  await det.first().locator("summary").click();
  await page.waitForTimeout(300);
  const after = await det.first().getAttribute("open");
  console.log(`== details 클릭 前 open=${before} → 後 open=${after} ${after !== null ? "(열린다)" : "🔴 (안 열린다)"} ==`);
  /* 🔴 **접힌 details 의 innerText 는 summary 뿐이다.** 1차 실행에서 「details 안 = "자세히"」만
     잡혔다 — 원문이 거기 «있다»는 것은 그 값으로 말할 수 없다. 열고 다시 읽어야 원문이 보인다. */
  const opened = (await det.first().innerText()).trim().replace(/^자세히\s*/, "");
  console.log(`== 연 뒤 details 안 = ${JSON.stringify(opened.slice(0, 160))} ==`);
  const detHits = WORDS.filter((w) => opened.includes(w));
  console.log(`== 연 뒤 details 안 금칙어 ${detHits.length}건${detHits.length ? " (" + detHits.join(",") + " · 정본 「코드·evidence 에는 쓴다」 경계 · 본문 밖)" : ""} ==`);
} else {
  console.log("== details 없음 — 원문이 본문에 그대로 있거나 사유가 비었다 ==");
}
await br.close();
