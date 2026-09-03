/**
 * D-46 확증 시도 — **히트 테스트가 「막혔다」고 한 자리를 «실제로 눌러» 본다.**
 *
 * 🔴 오늘 D-44 에서 세운 선의 «반대편»이다. 거기서는 「닿는다 ≠ 눌린다」를 눌러서 보였다.
 *    여기서는 **「안 닿는다」도 눌러서 보여야 한다** — 안 그러면 이 빨강은 **추론**이지 실측이 아니다.
 *
 * 판정선
 *   - `document.elementFromPoint` 는 `pointer-events:none` 을 **건너뛴다** ⇒ 거기 잡힌 것이
 *     **실제로 클릭을 받는 요소**다. 그래서 「상자 전체가 남의 것」이면 **사람도 못 누른다**가 «사양»이다.
 *   - 🔴 그래도 **눌러서 확인한다.** 사양에서 나온 결론과 실측이 어긋나면 **내 전제부터 의심**한다.
 *
 * 🔴 **양방향** — 같은 실행에서 **막히지 않은 대상**(넓은 폭에서 같은 버튼)도 눌러 본다.
 *    막힌 쪽만 보면 「이 그물은 아무것도 못 누른다」와 구별되지 않는다.
 *
 * 🔴 **이 측정이 사람보다 유리/불리한 점** — 유리: 클릭이 «어디로 갔는지»를 요소 단위로 읽는다.
 *    불리: 사람은 **덮개가 반투명하면 대상이 보이므로 누를 수 있다고 «믿고»** 누른다. 그 기대와
 *    실패의 간극(= 이 결함이 사람에게 얼마나 나쁜가)은 내가 못 잰다.
 *
 * 사용: node t78g_unpressable_click_check.mjs --base http://127.0.0.1:3115
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "");
if (!BASE) { console.error("[exit2] --base 가 없다"); process.exit(2); }

const CASES = [
  { label: "막힘 예상 · 390×480", w: 390, h: 480, path: "/overview", name: /전체 12대/ },
  { label: "대조군(막힘 없음 예상) · 1440×900", w: 1440, h: 900, path: "/overview", name: /전체 12대/ },
];

const browser = await chromium.launch();
const out = [];
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h } });
  const page = await ctx.newPage();
  await page.route("**/api/live/status", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }));
  await page.goto(`${BASE}${c.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  const loc = page.getByRole("button", { name: c.name }).first();
  const found = await loc.count();
  let probe = null, clicked = { ok: false, error: null }, changed = null;
  if (found) {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    /* ① 히트 테스트 — 상자 전체를 5×5 로 훑어 «내 것인 점»이 하나라도 있는가. */
    probe = await page.evaluate((re) => {
      const rx = new RegExp(re);
      const el = Array.from(document.querySelectorAll("button")).find((b) => rx.test((b.textContent ?? "").trim()));
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      let owned = 0; let blocker = null;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = r.left + 2 + ((r.width - 4) * i) / 4, y = r.top + 2 + ((r.height - 4) * j) / 4;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) owned++;
        else if (!blocker && hit) blocker = `${hit.tagName.toLowerCase()} 「${(hit.getAttribute("aria-label") || (hit.textContent ?? "").replace(/\s+/g, " ").trim()).slice(0, 30)}」 bg=${getComputedStyle(hit).backgroundColor}`;
      }
      return { found: true, box: `${r.width.toFixed(1)}×${r.height.toFixed(1)}`, ownedPoints: owned, blocker,
        inWindow: r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight };
    }, c.name.source);
    /* ② 실제 클릭 — `force` 를 쓰지 않는다. 가로막힘도 «결과»다. */
    const before = await page.evaluate(() => document.body.innerText.length);
    try { await loc.click({ timeout: 3000 }); clicked.ok = true; }
    catch (e) { clicked.error = String(e).split("\n")[0].slice(0, 120); }
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => document.body.innerText.length);
    changed = { before, after, moved: before !== after };
  }
  await ctx.close();
  out.push({ ...c, name: String(c.name), found: !!found, probe, clicked, changed });
}
await browser.close();

for (const o of out) {
  console.log(`\n=== ${o.label}`);
  if (!o.found) { console.log("  대상 없음 — 이 칸은 판정 불가"); continue; }
  console.log(`  ① 히트 — 상자 ${o.probe.box} · 창 안 ${o.probe.inWindow} · «내 것인 점» ${o.probe.ownedPoints}/25 · 막은 것: ${o.probe.blocker ?? "(없음)"}`);
  console.log(`  ② 클릭 — ${o.clicked.ok ? "성공" : "실패: " + o.clicked.error}`);
  console.log(`  ③ 화면 변화(글자 수) — ${o.changed.before} → ${o.changed.after} · ${o.changed.moved ? "바뀜" : "안 바뀜"}`);
}

const blocked = out[0], control = out[1];
if (!blocked?.found || !control?.found) { console.error("\n[exit2] 두 갈래 중 하나가 안 돌았다 — 대조 불성립"); process.exit(2); }
if (control.probe.ownedPoints === 0) { console.error("\n[exit2] 대조군 불발 — 넓은 폭에서도 «내 것인 점»이 0이다. 내 히트 테스트부터 의심하라"); process.exit(2); }
console.log(`\n대조: 390×480 «내 것인 점» ${blocked.probe.ownedPoints}/25 / 1440×900 ${control.probe.ownedPoints}/25`);
console.log(blocked.clicked.ok
  ? "⚠ 히트 테스트는 «막힘»인데 클릭은 «성공»했다 — 내 전제(=elementFromPoint 가 클릭 수신자다)부터 의심하라."
  : "🔴 D-46 확증 — 상자 전체가 남의 것이고, 실제 클릭도 가지 않는다.");
