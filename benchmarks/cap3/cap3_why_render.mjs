/** CAP3-R ②③⑤ — 사유 한 줄이 «본문»에 서는가 · 겹침을 깨지 않는가 (리바이2 61대)
 *
 *  정본 v0.2.4 화면 문면 개정 = 「문장(셸이 만든다 · `reason`·시각 값만 서버)」 ·
 *  「방문자 경험 = 왜·언제가 한 줄」. 앞 창(#967 O-2)에서 그 문장은 `title` 툴팁에만 있었다 —
 *  같은 리포가 `run-panels.tsx:150~153` 에서 그 형태를 「숨긴 것과 같다」고 배격한다.
 *
 *  🔴 판정선은 `body.innerText` 다. `title` 에 있는 것만으로는 해소가 아니다.
 *  🔴 폴링 30s — 창을 40초 이상 준다(3.5초로 재고 「문면 0」을 볼 뻔한 자리).
 *  🔴 겹침은 «좌표로 눌러» 묻는다. boundingBox 산수만으로 판정하면 없는 결함을 지어낸다.
 *
 *  node cap3_why_render.mjs <shellBase> <expectWord> [width] [shotPath]
 */
const PW = "../../tests/web/node_modules/@playwright/test/index.js";
const _pw = await import(new URL(PW, import.meta.url).href);
const chromium = _pw.chromium ?? _pw.default.chromium;
const [B, EXPECT = "", W = "1280", SHOT = ""] = process.argv.slice(2);
if (!B) { console.error("usage: <shellBase> <expectWord> [width] [shot]"); process.exit(2); }
const WORDS = ["LLM", "게이트웨이", "429", "토큰", "걸쇠"];

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: Number(W), height: 900 } });
const page = await ctx.newPage();
await page.goto(`${B}/overview`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(41000);

const badge = page.locator("[data-mode]").first();
const mode = await badge.getAttribute("data-mode");
const title = await badge.getAttribute("title");
const why = page.getByTestId("mode-badge-why");
const whyN = await why.count();
const whyText = whyN ? (await why.first().innerText()).trim() : "";
const body = await page.evaluate(() => document.body.innerText);

console.log(`폭 ${W} | data-mode=${mode}`);
console.log(`  mode-badge-why 요소 ${whyN}개 | 문면 ${JSON.stringify(whyText)}`);
console.log(`  title = ${JSON.stringify(title)}`);
console.log(`  body.innerText 안에 그 문장 = ${whyText ? body.includes(whyText) : "(요소 없음)"}`);
if (EXPECT) console.log(`  기대 낱말 ${JSON.stringify(EXPECT)} 본문 포함 = ${body.includes(EXPECT)}`);
const hhmm = whyText.match(/([0-2]?\d:[0-5]\d)/);
console.log(`  시각 표기 = ${hhmm ? hhmm[1] : "(없음)"}`);
const bodyHits = WORDS.filter((w) => body.includes(w));
console.log(`  본문 금칙어 ${bodyHits.length}건${bodyHits.length ? " 🔴 " + bodyHits.join(",") : ""}`);

/* ⑤ 겹침 — 좌표로 눌러 「그 자리에 있는 것이 무엇인가」를 묻는다. */
if (whyN) {
  const box = await why.first().boundingBox();
  if (box) {
    const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2);
    const top = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return "(없음)";
      const owner = el.closest("[data-testid]");
      return `${el.tagName.toLowerCase()}${owner ? ` · testid=${owner.getAttribute("data-testid")}` : ""}`;
    }, [cx, cy]);
    console.log(`  가운데 좌표(${cx},${cy}) 위 요소 = ${top} ${top.includes("mode-badge-why") ? "(덮개 없음)" : "🔴 (덮여 있다)"}`);
    console.log(`  박스 = ${Math.round(box.width)}x${Math.round(box.height)} @ ${Math.round(box.x)},${Math.round(box.y)} · 뷰포트 폭 ${W} · 넘침 ${box.x + box.width > Number(W) ? "🔴 있다" : "없다"}`);
  }
}
/* 가로 스크롤 = 폭이 깨졌는가의 값 */
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log(`  문서 가로 넘침 = ${overflow ? "🔴 있다" : "없다"}`);
if (SHOT) { await page.screenshot({ path: SHOT, fullPage: false }); console.log(`  스크린샷 = ${SHOT}`); }
await br.close();
