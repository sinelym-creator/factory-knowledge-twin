/**
 * T4-1 ⑤ — `/live/status` **외부축 bounded timeout** (검증 좌석 · 13대).
 *
 * 🔴 자극: 「죽은 API」가 아니라 **「받기만 하고 답하지 않는 API」**다. 연결 거부(ECONNREFUSED)는
 *    «즉시» 실패라 상한을 재지 못한다 — 상한이 있는지는 **끝나지 않는 응답**으로만 드러난다.
 *    그래서 TCP 를 accept 하고 한 바이트도 쓰지 않는 블랙홀을 세우고, 셸을 그쪽으로 «빌드»한다
 *    (목적지는 빌드 값이 정본 — Q-37 · start 에만 주면 부팅이 죽는다).
 *
 * 🔴 두 사실을 «따로» 잰다. 섞으면 초록도 빨강도 무엇의 것인지 모른다:
 *      ⓐ **네트워크 상한** — `/api/live/status` 요청이 몇 ms 에 끊기는가(계약 상한 2s)
 *      ⓑ **화면이 그 사실을 말하는 시각** — 배지가 «확인 중» → «미연결» 로 바뀌는 ms
 *    실측(13대): ⓐ 2.003s/2.011s · ⓑ **12.4s**. 대조군(같은 빌드 · API 만 즉시 응답) ⓑ = 415ms.
 *    ⇒ 상한은 실재하나 화면은 그 상한을 쓰지 않는다(첫 tick 결과가 마운트 교체로 버려진다).
 *
 * 준비:
 *   node _blackhole_server.mjs 8064                      # 답하지 않는 서버
 *   cd apps/web-console && FKT_API_BASE=http://127.0.0.1:8064 pnpm build && pnpm start -p 3155
 *   FKT_WEB_BASE=http://127.0.0.1:3155 node t41_live_status_timeout.mjs
 *
 * exit: 0 = 상한 실재 + 결국 «미연결» + 빈 화면 0 · 1 = 어긋남 · 2 = 측정 불가(자극 부재)
 */
import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3155";
const BOUND_MS = Number(process.env.FKT_APP_TIMEOUT_MS ?? 2000);   // 계약 상한(contract.ts TIMEOUT_MS)
const WATCH_MS = Number(process.env.FKT_WATCH_MS ?? 40000);

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());

  const net = [];
  page.on("request", (r) => { if (r.url().includes("/api/live/status")) net.push([Date.now(), "REQ"]); });
  page.on("requestfinished", (r) => { if (r.url().includes("/api/live/status")) net.push([Date.now(), "FIN"]); });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/live/status")) net.push([Date.now(), `CUT ${r.failure()?.errorText ?? ""}`]);
  });

  const t0 = Date.now();
  const resp = await page.goto(WEB + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  if (!resp) { console.error("측정 사고 — 셸에 닿지 못했다"); await browser.close(); process.exit(2); }
  const firstPaint = Date.now() - t0;

  // 배지 전이를 «흐름»으로 본다 — 한 시점만 찍으면 「아직 안 바뀜」과 「영영 안 바뀜」을 못 가른다.
  const flips = [];
  let prev = null;
  const deadline = Date.now() + WATCH_MS;
  while (Date.now() < deadline) {
    const t = await page.getByTestId("mode-badge").first().innerText().catch(() => "(없음)");
    const flat = t.replace(/\s+/g, " ").trim();
    if (flat !== prev) { flips.push([Date.now() - t0, flat]); prev = flat; }
    if (/미연결/.test(flat)) break;
    await page.waitForTimeout(250);
  }

  const bodyText = (await page.locator("body").innerText().catch(() => "")) ?? "";
  const chars = bodyText.replace(/\s+/g, "").length;
  await browser.close();

  console.log(`  ⓐ 첫 화면(domcontentloaded)  : ${firstPaint} ms`);
  console.log("  ⓐ /api/live/status 네트워크  :");
  let cuts = [], lastReq = null;
  for (const [ts, kind] of net) {
    console.log(`       ${String(ts - t0).padStart(6)} ms  ${kind}`);
    if (kind === "REQ") lastReq = ts;
    if (kind.startsWith("CUT") && lastReq !== null) { cuts.push(ts - lastReq); lastReq = null; }
  }
  console.log(`  ⓐ 끊긴 간격(= 앱 상한)       : ${cuts.length ? cuts.map((c) => `${c}ms`).join(" · ") : "(끊긴 요청 없음)"}`);
  console.log("  ⓑ 배지 전이                  :");
  for (const [ms, txt] of flips) console.log(`       ${String(ms).padStart(6)} ms  ${JSON.stringify(txt)}`);
  console.log(`  ⓒ 본문 글자 수(공백 제외)     : ${chars}`);

  if (!cuts.length) { console.log("\n결과: 측정 불가 — 요청이 끊긴 적이 없다(블랙홀이 안 섰다?)"); process.exit(2); }

  const bounded = cuts.every((c) => c >= BOUND_MS - 300 && c <= BOUND_MS + 800);
  const said = flips.some(([, t]) => /미연결/.test(t));
  const saidAt = flips.find(([, t]) => /미연결/.test(t))?.[0] ?? null;
  const notBlank = chars >= 40;

  console.log(`\n  판정  상한 ${BOUND_MS}ms 실재 ${bounded ? "○" : "🔴"} · 배지 «미연결» ${said ? `○(${saidAt}ms)` : "🔴"} · 빈 화면 아님 ${notBlank ? "○" : "🔴"}`);
  if (said && saidAt !== null && saidAt > BOUND_MS * 3) {
    console.log(`  🔵 관찰  상한은 ${BOUND_MS}ms 인데 화면이 그것을 말하기까지 ${saidAt}ms — 그 사이 화면은 «확인 중»이라 말한다(D-3)`);
  }
  process.exit(bounded && said && notBlank ? 0 : 1);
};

main().catch((e) => { console.error("측정 사고:", e); process.exit(2); });
