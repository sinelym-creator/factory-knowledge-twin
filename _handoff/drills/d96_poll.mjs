/** T-OPEN — 클릭→열림을 «폴링»으로 잰다(관찰자가 문서 교체에서 죽는 것을 피한다).
 *  50ms 간격으로 URL·본문·말풍선을 함께 찍어 어느 층이 늦는지 한 시계로 가른다.
 *  node topen_poll.mjs <base> <N> [mode]  mode: fresh(기본 · 세션 없음) | warm(세션 있음) */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, N = "3", MODE = "fresh"] = process.argv.slice(2);
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
const rows = [];
for (let i = 1; i <= Number(N); i += 1) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  if (MODE === "slow") {
    /* 🔴 «무대 조건» 가설을 재는 자리 — production 은 원격이라 네트워크·CPU 가 이 로컬과 다르다.
       그 차가 초 단위를 만들 수 있는지 보려고 CDP 로 느린 회선 + CPU 4배 지연을 건다.
       (production 을 재는 것이 아니다 — 「이 크기의 값이 나올 수 있는가」만 본다.) */
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  if (MODE === "warm") {
    /* 🔴 «세션이 이미 있는» 조건 — 입장이 끝난 뒤 개요에서 누른다. 세션 없는 회차와 갈라
       재야, 지연이 「투어」의 것인지 「입장 항해」의 것인지 말할 수 있다. */
    await page.waitForURL(/\/overview/, { timeout: 20000 }).catch(() => {});
    await page.waitForSelector('[data-testid="headline"]', { timeout: 20000 }).catch(() => {});
  }
  await page.getByTestId("intro-reopen").waitFor({ state: "visible", timeout: 20000 });
  const at = () => Date.now();
  const t0 = at();
  await page.getByTestId("intro-reopen").click();
  let tUrl = null, tBody = null, tTitle = null, tSpot = null;
  /* 🔴 창을 «값»으로 받는다 — 20초는 판정선이 아니라 내가 고른 숫자였다.
     느린 무대에서는 「안 열렸다」와 「내 창이 짧았다」가 같은 빈 칸으로 보인다. */
  const WINDOW = Number(process["env"].D96_WINDOW ?? 20000);
  const deadline = t0 + WINDOW;
  while (Date.now() < deadline && (tTitle === null || tSpot === null)) {
    const s = await page.evaluate(() => ({
      overview: location.pathname.startsWith("/overview"),
      body: !!document.querySelector('[data-testid="headline"]'),
      title: !!document.querySelector('[data-testid="tour-title"]'),
      spot: !!document.querySelector('[data-testid="tour-spotlight"]'),
    })).catch(() => null);
    if (s) {
      const now = at() - t0;
      if (tUrl === null && s.overview) tUrl = now;
      if (tBody === null && s.body) tBody = now;
      if (tTitle === null && s.title) tTitle = now;
      if (tSpot === null && s.spot) tSpot = now;
    }
    await page.waitForTimeout(50);
  }
  console.log(`${MODE}(창 ${WINDOW}ms) rep${i} | /overview 도달 ${tUrl ?? "-"}ms · 개요 본문 ${tBody ?? "-"}ms · **말풍선 ${tTitle ?? "-"}ms** · 링 ${tSpot ?? "-"}ms`);
  rows.push(tTitle);
  await ctx.close();
}
const ok = rows.filter((r) => r !== null);
console.log(`== ${MODE} · 말풍선 지연 ${ok.join("/")}ms · 최소 ${Math.min(...ok)} 최대 ${Math.max(...ok)} ==`);
await br.close();
