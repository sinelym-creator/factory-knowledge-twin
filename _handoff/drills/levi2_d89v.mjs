/** D-89v 독립 검증 드릴 (리바이2 61대 · 내 손으로 다시 쓴다 · 센쿠2 드릴은 참고만)
 *  node levi2_d89v.mjs <base> <N> <mode> [w] [h]
 *  mode: direct | operator | user | prog | selfcheck
 *  🔴 교정 게이트: selfcheck 는 «참을 내야 하는 칸»과 «반드시 빨강이어야 하는 칸»을 함께 물어
 *     이 드릴이 무엇이든 초록으로 보내는 문이 아님을 같은 실행에서 증명한다. */
const PW = "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, N = "8", MODE = "direct", W = "412", H = "600"] = process.argv.slice(2);
const VW = Number(W), VH = Number(H);
const HREF = "/incidents/INC-2026-014?run=STATIC-GS-01&tour=1";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

/* 🔴 판정식은 발주문 ⓑ① 정본 그대로: 링(spotlight)의 bottom <= vh && top >= 16.
   대상(target)이 아니라 «링»이 주체다 — 링은 대상보다 SPOT_PAD 만큼 밖으로 나간다. */
const verdict = (r) => r.bottom <= r.vh && r.top >= 16;

const read = (page) => page.evaluate(() => {
  const sp = document.querySelector('[data-testid="tour-spotlight"]');
  if (!sp) return { spot: 0, n: document.querySelectorAll('[data-testid^="tour-"]').length };
  const r = sp.getBoundingClientRect();
  return { spot: 1, top: Math.round(r.top), bottom: Math.round(r.bottom),
           vh: window.innerHeight, y: Math.round(window.scrollY),
           docH: Math.round(document.documentElement.scrollHeight) };
});

async function enter(page, mode) {
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (mode === "operator") {
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
}

const br = await chromium.launch();
const ctxOpts = { viewport: { width: VW, height: VH }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 };
let ok = 0, invalid = 0;

for (let i = 1; i <= Number(N); i += 1) {
  const ctx = await br.newContext(ctxOpts);
  const page = await ctx.newPage();
  await enter(page, MODE === "selfcheck" ? "direct" : MODE);

  if (MODE === "prog") {
    /* known-true — 사람 입력이 «아닌» 같은 크기 이동에는 보정이 «돌아야» 한다.
       민 «직후»를 같은 evaluate 안에서 읽는다(보정이 700ms보다 빠르다 · 센쿠2 자수 2 반영). */
    await page.waitForSelector('[data-testid="tour-spotlight"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2600);
    const m = await page.evaluate(() => { window.scrollBy(0, 120); return { y: Math.round(window.scrollY) }; });
    await page.waitForTimeout(3000);
    const n = await read(page);
    const moved = Math.abs(n.y - m.y) > 2;
    console.log(`prog rep${i} | 민 직후 y ${m.y} -> 3s y ${n.y} | 보정 ${moved ? "있음(계측기 참)" : "0 — 계측기가 못 본다"}`);
    if (moved) ok += 1; await ctx.close(); continue;
  }

  if (MODE === "user") {
    /* 사람 입력 대조군 — wheel 뒤 보정이 0 이어야 한다.
       🔴 mouse.wheel 은 «적용 전»에 돌아온다 — 휠이 앉은 뒤(700ms)를 기준선으로. */
    await page.waitForSelector('[data-testid="tour-spotlight"]', { timeout: 15000 }).catch(() => {});
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(700);
    const m = await read(page);
    await page.waitForTimeout(3000);
    const n = await read(page);
    const moved = Math.abs(n.y - m.y) > 2;
    console.log(`user rep${i} | wheel 직후 y ${m.y} -> 3s y ${n.y} | 보정 ${moved ? "있음(빨강)" : "0"}`);
    if (!moved) ok += 1; await ctx.close(); continue;
  }

  await page.waitForTimeout(2600);
  const a = await read(page);
  await page.waitForTimeout(3000);
  const b = await read(page);
  if (!a.spot || !b.spot) {
    invalid += 1;
    console.log(`${MODE} rep${i} | 무효 — 링 없음(tour-* 노드 ${b.n ?? a.n})`);
    await ctx.close(); continue;
  }
  const pass = verdict(b);

  if (MODE === "selfcheck") {
    /* 🔴 교정 게이트 — 같은 표본에 «심은 빨강»을 물린다.
       링을 프로그램으로 vh 밖까지 밀어 넣고 곧바로 읽으면 판정식은 반드시 FAIL 을 내야 한다.
       이 칸이 PASS 로 나오면 드릴이 무엇이든 초록으로 보내는 문이다 → exit 2. */
    const planted = await page.evaluate(() => {
      const sp = document.querySelector('[data-testid="tour-spotlight"]');
      /* 링은 fixed + 클래스로 위치가 잡힌다 — 인라인 transform 은 덮인다.
         top 을 !important 로 직접 밀어 «화면 밖»을 실제 DOM 으로 만든다. */
      sp.style.setProperty("top", (window.innerHeight + 200) + "px", "important");
      sp.style.setProperty("bottom", "auto", "important");
      sp.getBoundingClientRect();
      const r = sp.getBoundingClientRect();
      return { spot: 1, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
    });
    const plantedPass = verdict(planted);
    console.log(`selfcheck rep${i} | 참값칸 top ${b.top} bottom ${b.bottom} vh ${b.vh} -> ${pass ? "PASS" : "FAIL"} | 심은빨강칸 bottom ${planted.bottom} -> ${plantedPass ? "PASS(교정 실패)" : "FAIL(교정 참)"}`);
    if (plantedPass) { console.log("== 교정 게이트 불성립 — 이 드릴은 판정력이 없다 =="); await br.close(); process.exit(2); }
    ok += 1; await ctx.close(); continue;
  }

  if (pass) ok += 1;
  console.log(`${MODE} ${VW}x${VH} rep${i} | 정착 top ${a.top} · +3s top ${b.top} bottom ${b.bottom} vh ${b.vh} y ${b.y} docH ${b.docH} | ${pass ? "PASS" : "FAIL"}`);
  await ctx.close();
}
console.log(`== ${MODE} ${VW}x${VH} · ${ok}/${Number(N) - invalid} PASS${invalid ? ` · 무효 ${invalid}` : ""} ==`);
await br.close();
if (invalid === Number(N)) process.exit(2);
