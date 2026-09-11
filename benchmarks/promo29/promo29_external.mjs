/** PROMO29-X — 승격 29 외부 재검 (리바이2 61대)
 *
 *  🔴 **구독 0 이 이 창의 전제다**: Live 실행 버튼을 누르지 않고, 조사 프로브도 쏘지 않는다.
 *     읽기(GET)와 화면 렌더만 본다.
 *
 *  🔴 **「밖」의 근거**: 공개 URL 을 쳤다는 사실은 증거가 아니다(tailnet self 로 붙을 수 있다).
 *     이 드릴은 공개 도메인에 «브라우저로» 붙어 `Tailscale-User-*` 계열 표지가 화면·응답에
 *     없음을 확인하고, 그 판별이 실제로 갈리는지는 §대조(오케 보고)에서 내부 경로와 맞댄다.
 *
 *  node promo29_external.mjs <publicBase> <axis> [width] [height]
 *    axis: badge | tour | replay
 */
const PW = "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, AXIS = "badge", W = "1280", H = "900"] = process.argv.slice(2);
if (!B) { console.error("usage: <publicBase> <axis> [w] [h]"); process.exit(2); }
const WORDS = ["LLM", "게이트웨이", "429", "토큰", "걸쇠"];

const br = await chromium.launch();
const ctx = await br.newContext({
  viewport: { width: Number(W), height: Number(H) },
  ...(Number(W) < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2.6,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" } : {}),
});
const page = await ctx.newPage();
/* 🔴 Live 를 «태우는» 요청이 나가지 않는지 스스로 감시한다. 0 이 아니면 이 창의 전제가 깨진 것이다. */
const live = [];
page.on("request", (r) => { const u = r.url(); if (/\/runs\b/.test(u) && r.method() === "POST") live.push(`${r.method()} ${u}`); });

if (AXIS === "badge") {
  await page.goto(`${B}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  const badge = page.locator("[data-mode]").first();
  const n = await badge.count();
  const why = page.getByTestId("mode-badge-why");
  const whyN = await why.count();
  const body = await page.evaluate(() => document.body.innerText);
  console.log(`[④] data-mode=${n ? await badge.getAttribute("data-mode") : "(배지 없음)"}`);
  console.log(`[④] mode-badge-why 요소 ${whyN}개 · 문면 ${whyN ? JSON.stringify((await why.first().innerText()).trim()) : "(없음)"}`);
  const hits = WORDS.filter((w) => body.includes(w));
  console.log(`[④] 본문 금칙어 ${hits.length}건${hits.length ? " 🔴 " + hits.join(",") : ""}`);
  /* 밖 표지 — tailnet 을 탔다면 화면·문서에 사용자 표지가 뜬다. */
  const ts = /Tailscale|tailnet|Tailscale-User/i.test(body);
  console.log(`[밖] 문서에 tailnet 표지 = ${ts ? "🔴 있다(내부 경로 의심)" : "없다"}`);
}

if (AXIS === "tour") {
  /* ③ D-89 회귀 — 링이 화면 안에 있는가. 정본 판정선 `bottom <= vh && top >= 16`. */
  await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => localStorage.setItem("fkt.tour.v1", JSON.stringify({ v: 1, status: "running", step: 3 })));
  await page.goto(`${B}/incidents/INC-2026-014?run=STATIC-GS-01&tour=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const a = await page.evaluate(() => {
    const sp = document.querySelector('[data-testid="tour-spotlight"]');
    if (!sp) return { spot: 0 };
    const r = sp.getBoundingClientRect();
    return { spot: 1, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, y: Math.round(window.scrollY) };
  });
  await page.waitForTimeout(3000);
  const b = await page.evaluate(() => {
    const sp = document.querySelector('[data-testid="tour-spotlight"]');
    if (!sp) return { spot: 0 };
    const r = sp.getBoundingClientRect();
    return { spot: 1, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, y: Math.round(window.scrollY) };
  });
  if (!b.spot) console.log(`[③] 무효 — 링 없음(자극 미성립)`);
  else console.log(`[③] 정착 top ${a.top} · +3s top ${b.top} bottom ${b.bottom} vh ${b.vh} | ${b.bottom <= b.vh && b.top >= 16 ? "PASS" : "🔴 FAIL"}`);
}

if (AXIS === "replay") {
  /* ⑤ replay 완주 — 화면이 녹화 재생본을 끝까지 그리는가. 새 조사를 «시작하지 않는다». */
  await page.goto(`${B}/incidents/INC-2026-014?run=STATIC-GS-01`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(4000);
  const badge = page.getByTestId("synthesis-badge");
  const cards = await page.locator('[data-testid^="candidate"]').count();
  /* 🔴 `[role="alert"]` 을 오류로 세면 **빈 aria-live 영역**이 1건으로 잡힌다(실측: testid=null ·
     문면 "" · `error-screen` 은 0). 화면에 아무 말도 없는 자리를 「오류 화면 1개」로 적을 뻔했다.
     오류는 «전용 testid» 또는 «문면이 있는 alert» 로만 센다. */
  const errNodes = page.locator('[data-testid="error-screen"], [role="alert"]');
  let err = 0;
  for (let i = 0; i < (await errNodes.count()); i += 1) {
    const tid = await errNodes.nth(i).getAttribute("data-testid");
    const txt = ((await errNodes.nth(i).innerText()) || "").trim();
    if (tid === "error-screen" || txt.length > 0) err += 1;
  }
  console.log(`[⑤] synthesis-badge ${await badge.count()}개${await badge.count() ? ` · ${JSON.stringify((await badge.first().innerText()).trim().replace(/\n/g, " "))}` : ""}`);
  console.log(`[⑤] 후보 카드 ${cards}개 · 오류 화면 ${err}개`);
}

console.log(`[구독] 이 실행에서 나간 run 생성 POST = ${live.length}건${live.length ? " 🔴 " + live.join(" · ") : " (전제 지켜짐)"}`);
await br.close();
