/**
 * T4-2a ③ 쿠키 축 — 「정적 경로가 서버 세션 쿠키를 만들거나 위조하는가」 (14대).
 *
 * 🔴 **첫 판에서 내 그물이 먼저 틀렸다.** `/` 로 들어가 제안을 눌러 정적 화면에 닿은 뒤
 *    쿠키를 셌더니 `fkt_session` 이 있었다. 그런데 그 쿠키는 **`/` 의 입장 시도**가 남긴
 *    것이지 정적 경로가 만든 것이 아니다 — 두 사건을 한 항아리에서 세면 주어를 잃는다.
 *    그래서 세 갈래로 갈라 잰다:
 *      ⓐ **딥링크** — `/` 를 한 번도 안 밟고 정적 URL 로 «바로» 들어간다(정적 경로 단독)
 *      ⓑ **입장 경유** — `/` → 제안 → 정적(방문자가 실제로 걷는 길)
 *      ⓒ **LIVE 대조군** — 서버가 살아 있을 때의 `fkt_session` 값과 «모양»을 맞댄다
 */
import { chromium } from "@playwright/test";

const OFF = process.env.FKT_WEB_OFF ?? "http://127.0.0.1:3181";
const LIVE = process.env.FKT_WEB_LIVE ?? "http://127.0.0.1:3161";
const STATIC_URL = `/incidents/INC-2026-014?run=STATIC-GS-01`;

let failures = 0;
const ok = (n, p, d) => {
  if (!p) failures += 1;
  console.log(`  ${p ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
};
const show = (cs) =>
  cs.length ? cs.map((c) => `${c.name}=${String(c.value).slice(0, 60)}${String(c.value).length > 60 ? "…" : ""}`).join(" | ") : "(없음)";

const main = async () => {
  const browser = await chromium.launch();
  const vp = { viewport: { width: 1440, height: 900 } };

  console.log("\nⓐ 딥링크 — `/` 를 밟지 않고 정적 URL 로 바로");
  const a = await browser.newContext(vp);
  const ap = await a.newPage();
  await ap.goto(OFF + STATIC_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ap.getByTestId("run-console").waitFor({ state: "visible", timeout: 60000 });
  const ac = await a.cookies();
  console.log(`     쿠키: ${show(ac)}`);
  ok("정적 경로 단독으로는 `fkt_session` 을 만들지 않는다", !ac.some((c) => c.name === "fkt_session"));
  ok("정적 경로 단독으로는 `fkt_sid` 를 만들지 않는다", !ac.some((c) => c.name === "fkt_sid"));
  const aStore = await ap.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  console.log(`     방문자 상태: ${JSON.stringify(aStore).slice(0, 200)}`);
  await a.close();

  console.log("\nⓑ 입장 경유 — `/` → 제안 → 정적 (방문자가 실제로 걷는 길)");
  const b = await browser.newContext(vp);
  const bp = await b.newPage();
  await bp.goto(OFF + "/", { waitUntil: "commit", timeout: 60000 });
  await bp.getByTestId("static-replay-offer").waitFor({ state: "visible", timeout: 45000 });
  const beforeClick = await b.cookies();
  console.log(`     제안 «전»(= '/' 입장 시도 직후) 쿠키: ${show(beforeClick)}`);
  await bp.getByTestId("static-replay-offer").click();
  await bp.getByTestId("run-console").waitFor({ state: "visible", timeout: 60000 });
  const afterClick = await b.cookies();
  console.log(`     정적 진입 «후» 쿠키          : ${show(afterClick)}`);
  const added = afterClick.filter((c) => !beforeClick.some((x) => x.name === c.name && x.value === c.value));
  ok("🔴 정적 진입이 «새 쿠키를 더하지 않는다»", added.length === 0, show(added));
  ok("`fkt_sid`(ai-api 세션)는 끝내 없다", !afterClick.some((c) => c.name === "fkt_sid"),
     afterClick.map((c) => c.name).join(" · ") || "(없음)");
  await b.close();

  console.log("\nⓒ LIVE 대조군 — 서버가 살아 있을 때의 쿠키 모양");
  const c = await browser.newContext(vp);
  const cp = await c.newPage();
  await cp.goto(LIVE + "/", { waitUntil: "commit", timeout: 60000 });
  await cp.waitForURL(/\/overview$/, { timeout: 60000 });
  const cc = await c.cookies();
  console.log(`     쿠키: ${show(cc)}`);
  const liveSession = cc.find((x) => x.name === "fkt_session");
  const offSession = beforeClick.find((x) => x.name === "fkt_session");
  ok("LIVE 에서는 `fkt_sid`(ai-api 세션)가 실재한다 — 대조군이 산다",
     cc.some((x) => x.name === "fkt_sid"), cc.map((x) => x.name).join(" · "));
  ok("🔴 OFF 의 `fkt_session` 값이 LIVE 의 것과 «다르다»(위조 0)",
     !!offSession && !!liveSession && offSession.value !== liveSession.value,
     `OFF ${String(offSession?.value).slice(0, 48)}… vs LIVE ${String(liveSession?.value).slice(0, 48)}…`);
  await c.close();

  await browser.close();
  console.log(`\n결과: 어긋남 ${failures}건`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error("측정 사고:", e);
  process.exit(2);
});
