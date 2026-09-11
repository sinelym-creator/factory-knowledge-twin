/** D-89 FIX3 판정 — direct × 412×600 만 N회. 🔴 前 재현율이 1 이 아니므로 «비율»로 잰다.
 *  node d89_direct.mjs <base> <N> [mode]   mode: direct(기본) | operator | user
 *  user = 사람 입력(wheel) 뒤 보정이 0 인가 = 처방이 그 보장을 안 깼는지 보는 대조군. */
const PW_ENTRY = process["env"].FKT_PW ?? "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW_ENTRY, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, N = "8", MODE = "direct"] = process.argv.slice(2);
const HREF = "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const br = await chromium.launch();
const read = (page) => page.evaluate(() => {
  const sp = document.querySelector('[data-testid="tour-spotlight"]');
  if (!sp) return { spot: 0 };
  const r = sp.getBoundingClientRect();
  return { spot: 1, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, y: Math.round(window.scrollY) };
});
let ok = 0, invalid = 0;
for (let i = 1; i <= Number(N); i += 1) {
  const ctx = await br.newContext({ viewport: { width: 412, height: 600 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  const page = await ctx.newPage();
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (MODE === "operator") {
    await page.getByTestId("intro-reopen").click();
    await page.waitForTimeout(900);
    for (let k = 0; k < 3; k += 1) {
      const go = page.getByTestId("tour-goto"), nx = page.getByTestId("tour-next");
      if (await go.count()) await go.first().click(); else if (await nx.count()) await nx.first().click();
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(1500);
  } else {
    await page.evaluate(() => localStorage.setItem("fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: 3 })));
    await page.goto(`${B}${HREF}`, { waitUntil: "domcontentloaded" });
  }
  if (MODE === "prog") {
    /* 🔴 **계측기 known-true.** `user` 축이 늘 「보정 0」을 내면 그것이 보장인지 «계측기가
       못 보는 것»인지 알 수 없다. 사람 입력이 «아닌» 같은 크기의 이동(프로그램 스크롤)을 주면
       보정이 «돌아야» 한다 — 그 참을 먼저 본 뒤에야 user 의 0 이 값이 된다. */
    await page.waitForSelector('[data-testid="tour-spotlight"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2600);
    /* 🔴 창을 좁힌다 — 700ms 뒤에 읽었더니 «이동 직후»가 이미 보정된 값이었다(519).
       민 직후를 기준선으로 잡아야 「되돌아왔다」가 보인다. */
    const m = await page.evaluate(() => { window.scrollBy(0, 120); return { y: Math.round(window.scrollY), top: null, bottom: null, vh: window.innerHeight, spot: 1 }; });
    await page.waitForTimeout(3000);
    const n = await read(page);
    const moved = Math.abs(n.y - m.y) > 2;
    console.log(`prog rep${i} | 이동 직후 y ${m.y} → 3초 후 y ${n.y} | 보정 ${moved ? "있음(계측기 참)" : "🔴 0 — 계측기가 못 본다"}`);
    if (moved) ok += 1;
    await ctx.close();
    continue;
  }
  if (MODE === "user") {
    /* 🔴 사람 입력 대조군 — 링이 잡히자마자 wheel 을 쏜다(`userMoved` 축). 그 뒤 보정이 «0» 이어야
       한다: 처방이 「사람이 보던 자리를 빼앗지 않는다」를 깨지 않았는지 여기서만 알 수 있다. */
    await page.waitForSelector('[data-testid="tour-spotlight"]', { timeout: 15000 }).catch(() => {});
    await page.mouse.wheel(0, 120);
    /* 🔴 `mouse.wheel` 은 «스크롤이 적용되기 전»에 돌아온다. 바로 읽으면 그 뒤에 적용되는
       휠 자신의 이동(+120)이 「보정」으로 잡힌다 — 1차 측정에서 467→587 을 보정으로 적을 뻔했다.
       휠이 앉은 뒤를 기준선으로 삼는다. */
    await page.waitForTimeout(700);
    const m = await read(page);
    await page.waitForTimeout(3000);
    const n = await read(page);
    const moved = Math.abs(n.y - m.y) > 2;
    console.log(`user rep${i} | wheel 직후 y ${m.y} → 3초 후 y ${n.y} | 보정 ${moved ? "🔴 있음" : "0"}`);
    if (!moved) ok += 1;
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(2600);
  const a = await read(page);
  await page.waitForTimeout(3000);
  const b = await read(page);
  if (!a.spot || !b.spot) { invalid += 1; console.log(`${MODE} rep${i} | 🔴 무효 — 링 없음`); await ctx.close(); continue; }
  const pass = b.bottom <= b.vh && b.top >= 16;
  if (pass) ok += 1;
  console.log(`${MODE} rep${i} | 정착 top ${a.top} · +3초 top ${b.top} bottom ${b.bottom} vh ${b.vh} y ${b.y} | ${pass ? "PASS" : "🔴 FAIL"}`);
  await ctx.close();
}
console.log(`== ${MODE} · ${ok}/${Number(N) - invalid} PASS${invalid ? ` · 무효 ${invalid}` : ""} ==`);
await br.close();
