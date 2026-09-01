/**
 * Q-50 — 「배지가 «미연결»이라 말하기까지」를 **경로별로 갈라서** 잰다 (검증 좌석 · 14대).
 *
 * 🔴 왜 이 그물이 따로 필요한가. 13대는 12.4초를 재고 **「첫 tick 결과가 마운트 교체로
 *    버려진다」**는 소견을 달았다(D-3). 구현(센쿠2)은 같은 자리를 drop 축으로 갈라
 *    **「12.4초 = 입장 2s + /overview SSR 8s 직렬 + tick 2s 이고 배지 로직은 정상」**이라
 *    보고했고, 오케는 D-3 을 **Q-50 으로 재분류**하며 「기각 여부는 검증이 정한다」고 했다.
 *    두 주장은 **같은 12.4초를 놓고 다른 주어**를 말한다 — 그래서 시간이 아니라 «자취»를 본다.
 *
 * 🔴 세 사실을 «따로» 적는다:
 *      ⓐ `/api/live/status` 요청이 몇 ms 에 끊기는가(앱 상한 2s)
 *      ⓑ 배지가 «미연결»로 바뀐 시각과 **그때 브라우저가 서 있던 URL**
 *      ⓒ 그 사이의 항해 비용 — `POST /enter` 와 `/overview` SSR 이 각각 몇 ms 인가
 *    ⓑ 가 `/` 위에서 상한 + ε 안에 일어나면 「첫 tick 이 버려진다」는 **거짓**이고,
 *    12.4초의 주어는 ⓒ 다. 반대로 `/` 에서도 상한을 한참 넘겨야 바뀌면 소견이 **참**이다.
 *
 * 🔴 자극이 실재해야 한다 — 블랙홀이 accept 를 못 하면 어느 색도 내지 않는다(exit 2).
 *
 * 준비:
 *   node _blackhole_server.mjs 8074
 *   cd apps/web-console && FKT_API_BASE=http://127.0.0.1:8074 pnpm build && pnpm start -p 3171
 *   FKT_WEB_BASE=http://127.0.0.1:3171 node q50_entry_badge_timing.mjs
 *
 * exit: 0 = 측정 성립(판정문이 값을 읽는다) · 2 = 측정 불가(자극 부재·셸 무응답)
 */
import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3171";
const BOUND_MS = Number(process.env.FKT_APP_TIMEOUT_MS ?? 2000);
const WATCH_MS = Number(process.env.FKT_WATCH_MS ?? 45000);
const TICK_MS = 50;

const pad = (n) => String(n).padStart(6);

/**
 * 🔴 **대조군 — 「항해가 없으면 배지는 상한 안에 바뀌는가」.**
 *
 * 본 측정에서 배지가 늦는 자리가 둘로 갈린다: ⓘ tick 자체가 느리다 · ⓙ tick 은 제때 끝났는데
 * 그 결과가 **항해(마운트 교체)로 버려진다**. 두 갈래는 같은 「늦은 배지」를 낸다.
 * 그래서 `POST /enter` 를 막아 브라우저를 `/` 에 **묶어 두고** 같은 자극을 준다 —
 * 여기서 배지가 상한+ε 에 바뀌면 tick 은 제때 끝난 것이고, 늦음의 주어는 항해다.
 */
const stayOnEntry = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  /* 🔴 **막지 말고 «늦춘다».** 첫 판에 `route.abort()` 를 썼더니 입장이 «실패»로 끝나며
     셸이 통째로 사라졌다(배지 mode=null · 821ms) — 대조군이 대상을 없애 버려 아무것도
     못 갈랐다. 항해를 지연시키면 화면은 `/` 위에 그대로 있고 자극만 계속 돈다. */
  await page.route("**/enter", async (route) => {
    await new Promise((r) => setTimeout(r, 55000));
    await route.continue().catch(() => {});
  });
  const t0 = Date.now();
  const cuts = [];
  let reqAt = null;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/live/status")) reqAt = Date.now() - t0;
  });
  page.on("requestfailed", (r) => {
    if (r.url().endsWith("/api/live/status") && reqAt !== null) {
      cuts.push(Date.now() - t0 - reqAt);
      reqAt = null;
    }
  });
  await page.goto(WEB + "/", { waitUntil: "commit", timeout: 60000 }).catch(() => null);
  const flips = [];
  let prev = null;
  const deadline = Date.now() + 50000;   // 🔴 30s 폴 주기를 «넘겨» 본다 — 첫 tick 만 버려진 것인지 가른다
  while (Date.now() < deadline) {
    const snap = await page
      .evaluate(() => {
        const b = document.querySelector("[data-testid=mode-badge]");
        return {
          badge: b ? (b.textContent ?? "").replace(/\s+/g, " ").trim() : "(없음)",
          mode: b ? b.getAttribute("data-mode") : null,
          offer: !!document.querySelector("[data-testid=static-replay-offer]"),
          url: location.pathname,
        };
      })
      .catch(() => null);
    if (snap) {
      const key = `${snap.url}|${snap.mode}|${snap.badge}|${snap.offer}`;
      if (key !== prev) {
        flips.push({ ms: Date.now() - t0, ...snap });
        prev = key;
      }
      if (/미연결/.test(snap.badge)) break;
    }
    await page.waitForTimeout(TICK_MS);
  }
  await ctx.close();
  return { flips, cuts };
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());

  const net = [];
  const mark = (t, kind, url) => net.push({ ms: t, kind, url });
  const t0ref = { v: 0 };
  const rel = () => Date.now() - t0ref.v;

  const watched = (u) => /\/api\/live\/status|\/enter|\/overview|\/$/.test(new URL(u).pathname + "$");
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (/\/api\/live\/status$|^\/enter$|^\/overview$|^\/$/.test(p)) mark(rel(), `REQ  ${r.method()}`, p);
  });
  page.on("response", (r) => {
    const p = new URL(r.url()).pathname;
    if (/\/api\/live\/status$|^\/enter$|^\/overview$|^\/$/.test(p)) mark(rel(), `RES  ${r.status()}`, p);
  });
  page.on("requestfailed", (r) => {
    const p = new URL(r.url()).pathname;
    if (/\/api\/live\/status$/.test(p)) mark(rel(), `CUT  ${r.failure()?.errorText ?? ""}`, p);
  });
  void watched;

  t0ref.v = Date.now();
  const resp = await page.goto(WEB + "/", { waitUntil: "commit", timeout: 60000 }).catch(() => null);
  if (!resp) {
    console.error("측정 사고 — 셸에 닿지 못했다(초록도 빨강도 아니다)");
    await browser.close();
    process.exit(2);
  }

  /* 🔴 배지를 «흐름»으로 본다. 한 시점만 찍으면 「아직」과 「영영」을 못 가른다.
     그리고 **그때의 URL 을 함께** 적는다 — 어느 경로에서 일어난 일인지가 이 판정의 전부다. */
  const flips = [];
  let prev = null;
  const deadline = Date.now() + WATCH_MS;
  let offerAt = null;
  while (Date.now() < deadline) {
    const snap = await page
      .evaluate(() => {
        const b = document.querySelector("[data-testid=mode-badge]");
        const o = document.querySelector("[data-testid=static-replay-offer]");
        return {
          badge: b ? (b.textContent ?? "").replace(/\s+/g, " ").trim() : "(없음)",
          mode: b ? b.getAttribute("data-mode") : null,
          offer: !!o,
          url: location.pathname,
        };
      })
      .catch(() => null);
    if (snap) {
      const key = `${snap.url}|${snap.mode}|${snap.badge}|${snap.offer}`;
      if (key !== prev) {
        flips.push({ ms: rel(), ...snap });
        prev = key;
      }
      if (snap.offer && offerAt === null) offerAt = rel();
    }
    if (offerAt !== null && /미연결/.test(prev ?? "")) break;
    await page.waitForTimeout(TICK_MS);
  }

  const bodyChars = ((await page.locator("body").innerText().catch(() => "")) ?? "").replace(/\s+/g, "").length;
  const finalUrl = page.url();
  const control = await stayOnEntry(browser);
  await browser.close();

  console.log(`대상    : ${WEB}  (블랙홀 빌드 · 앱 상한 ${BOUND_MS}ms)`);
  console.log("\nⓐ·ⓒ 네트워크 자취");
  for (const e of net) console.log(`   ${pad(e.ms)} ms  ${e.kind.padEnd(10)} ${e.url}`);

  // 끊긴 간격 = 앱 상한의 실측
  const cuts = [];
  let lastReq = null;
  for (const e of net) {
    if (e.url.endsWith("/live/status") && e.kind.startsWith("REQ")) lastReq = e.ms;
    if (e.kind.startsWith("CUT") && lastReq !== null) {
      cuts.push(e.ms - lastReq);
      lastReq = null;
    }
  }
  const stimulated = net.some((e) => e.url.endsWith("/live/status"));

  console.log("\nⓑ 배지·제안 전이 (URL 병기)");
  for (const f of flips) {
    console.log(
      `   ${pad(f.ms)} ms  url=${f.url.padEnd(12)} mode=${String(f.mode).padEnd(10)} ` +
        `제안=${f.offer ? "있음" : "없음"}  ${JSON.stringify(f.badge)}`,
    );
  }

  const firstUnreachable = flips.find((f) => /미연결/.test(f.badge));
  const enterRes = net.find((e) => e.url === "/enter" && e.kind.startsWith("RES"));
  const enterReq = net.find((e) => e.url === "/enter" && e.kind.startsWith("REQ"));
  const ovReq = net.find((e) => e.url === "/overview" && e.kind.startsWith("REQ"));
  const ovRes = net.find((e) => e.url === "/overview" && e.kind.startsWith("RES"));

  console.log("\n요약");
  console.log(`   자극 실재            : ${stimulated ? `/api/live/status 요청 ${net.filter((e) => e.url.endsWith("/live/status") && e.kind.startsWith("REQ")).length}건` : "🔴 0건"}`);
  console.log(`   ⓐ 끊긴 간격(앱 상한) : ${cuts.length ? cuts.map((c) => `${c}ms`).join(" · ") : "(끊긴 요청 없음)"}`);
  console.log(`   ⓑ «미연결» 최초      : ${firstUnreachable ? `${firstUnreachable.ms}ms · url=${firstUnreachable.url}` : "🔴 관측 안 됨"}`);
  console.log(`   ⓑ 정적 제안 최초     : ${offerAt !== null ? `${offerAt}ms` : "🔴 관측 안 됨"}`);
  console.log(`   ⓒ POST /enter        : ${enterReq && enterRes ? `${enterRes.ms - enterReq.ms}ms (${enterReq.ms} → ${enterRes.ms})` : "(미관측)"}`);
  console.log(`   ⓒ /overview SSR      : ${ovReq && ovRes ? `${ovRes.ms - ovReq.ms}ms (${ovReq.ms} → ${ovRes.ms})` : "(미관측)"}`);
  console.log(`   최종 url             : ${finalUrl}`);
  console.log(`   빈 화면 아님(글자수) : ${bodyChars}`);

  console.log("\n🔴 대조군 — `/enter` 를 막아 «항해 없이» 같은 자극");
  for (const f of control.flips) {
    console.log(
      `   ${pad(f.ms)} ms  url=${f.url.padEnd(12)} mode=${String(f.mode).padEnd(10)} ` +
        `제안=${f.offer ? "있음" : "없음"}  ${JSON.stringify(f.badge)}`,
    );
  }
  const ctlUnreachable = control.flips.find((f) => /미연결/.test(f.badge));
  console.log(`   대조군 끊긴 간격      : ${control.cuts.length ? control.cuts.map((c) => `${c}ms`).join(" · ") : "(없음)"}`);
  console.log(`   대조군 «미연결» 최초  : ${ctlUnreachable ? `${ctlUnreachable.ms}ms · url=${ctlUnreachable.url}` : "🔴 50초 안에 관측 안 됨"}`);

  if (!stimulated) {
    console.error("\n🔴 자극 0건 — 블랙홀을 향한 요청이 없었다. 어느 색도 내지 않는다(측정 불가).");
    process.exit(2);
  }
  console.log("\n판정 재료는 위 자취다 — 이 그물은 «값»을 내고 판정은 판정문이 한다.");
  process.exit(0);
};

main().catch((e) => {
  console.error("측정 사고:", e);
  process.exit(2);
});
