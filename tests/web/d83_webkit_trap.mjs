/**
 * D-83 검증 — webkit 에서 드로어 초점 가둠이 «순환»하는가(cap 0 · live run 0).
 *
 * 배경(T7-2b 실측): webkit 은 드로어가 열렸을 때만 매 두 번째 Tab 이 `body` 로 떨어지고,
 * 초점이 **첫 링크로만** 되돌아와 2·3번째 링크에 Tab 으로 도달할 수 없었다(이탈 5/10).
 * chromium·firefox 는 3링크를 순환(이탈 0). 처방 = 패널 안 Tab roving(`indexOf(active)`).
 *
 * 🔴 **엔진 × 무대 두 축을 같은 실행에서** 찍는다 — 前 열이 빨강을 보여야 後 열의 초록이 뜻을 갖는다.
 * 🔴 **이탈 = 초점이 드로어 «밖»에 선 횟수**이고, 「순환」은 그 위에 **서로 다른 링크를 밟았는가**가 더 있어야 한다.
 *    이탈 0 만 보면 「첫 링크에 붙박여 안 움직이는」 것도 초록이 된다.
 * 🔴 ⑤ 반증 열은 **판정선이 아니다** — 오케 가설(webkit 이 링크를 탭 순서에서 건너뛴다)의 결과만 병기한다.
 *
 * usage: node d83_webkit_trap.mjs --after http://127.0.0.1:8370 --before http://127.0.0.1:8367 --out o.json [--shots DIR]
 */
import { chromium, webkit, firefox } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("out");
const SHOTS = arg("shots", null);
const SETTLE = Number(arg("settle", "1500"));
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }
const DRAWER = '[data-testid="nav-drawer"]';
const TOGGLE = '[data-testid="nav-menu-toggle"]';
const DLINK = '[data-nav-variant="drawer"]';

const dismiss = async (p) => {
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(300); }
  }
};
const focusNow = (p) => p.evaluate(() => {
  const a = document.activeElement;
  const panel = document.querySelector('[data-testid="nav-drawer"]');
  return { id: a?.getAttribute?.("data-testid") ?? a?.tagName?.toLowerCase() ?? null, inside: Boolean(panel && a && panel.contains(a)) };
});
const tabTrail = async (p, n, shift) => {
  const t = [];
  for (let i = 0; i < n; i++) {
    await p.keyboard.press(shift ? "Shift+Tab" : "Tab");
    await p.waitForTimeout(90);
    t.push(await focusNow(p));
  }
  return t;
};

const column = async (engineName, engine, base, stage, injectTabindex) => {
  const col = { engine: engineName, stage, base, injectTabindex };
  let browser;
  try { browser = await engine.launch(); } catch (e) { col.launchError = String(e).slice(0, 200); return col; }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push({ excluded: /ws|websocket|wss:/i.test(m.text()), text: m.text().slice(0, 140) }); });
  page.on("pageerror", (e) => errs.push({ excluded: false, text: "pageerror: " + String(e).slice(0, 140) }));
  await page.goto(base + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(SETTLE);
  await dismiss(page);

  await page.locator(TOGGLE).first().click().catch(() => {});
  await page.waitForTimeout(500);
  col.openCount = await page.locator(DRAWER).count();
  col.links = await page.locator(DLINK).count();
  if (injectTabindex) {
    // ⑤ 반증 열 — 링크에 명시 `tabindex=0` 을 주면 webkit 이 순환하는가(가설 검증 · 판정선 아님).
    col.injected = await page.locator(DLINK).evaluateAll((els) => { els.forEach((e) => e.setAttribute("tabindex", "0")); return els.length; });
  }
  col.tab = await tabTrail(page, 10, false);
  col.tabEscapes = col.tab.filter((t) => !t.inside).length;
  col.tabDistinctInside = [...new Set(col.tab.filter((t) => t.inside).map((t) => t.id))].length;
  if (SHOTS && col.openCount) await page.screenshot({ path: `${SHOTS}/d83-${engineName}-${stage}-390.png` }).catch(() => {});
  col.shift = await tabTrail(page, 10, true);
  col.shiftEscapes = col.shift.filter((t) => !t.inside).length;
  col.shiftDistinctInside = [...new Set(col.shift.filter((t) => t.inside).map((t) => t.id))].length;

  // ④ 닫힘 3갈래 + 초점 복귀
  const closes = {};
  await page.keyboard.press("Escape");
  await page.waitForTimeout(450);
  closes.esc = { left: await page.locator(DRAWER).count(), focus: (await focusNow(page)).id };
  await page.locator(TOGGLE).first().click().catch(() => {});
  await page.waitForTimeout(450);
  const right = await page.locator(DRAWER).count()
    ? await page.locator(DRAWER).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.left + r.width; }) : 260;
  await page.locator('[data-testid="nav-drawer-scrim"]').first().click({ position: { x: Math.min(370, right + 40), y: 450 } }).catch(() => {});
  await page.waitForTimeout(450);
  closes.scrim = { left: await page.locator(DRAWER).count(), focus: (await focusNow(page)).id };
  await page.locator(TOGGLE).first().click().catch(() => {});
  await page.waitForTimeout(450);
  await page.locator(`${DLINK}[data-testid="nav-incidents"]`).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  closes.link = { left: await page.locator(DRAWER).count(), url: new URL(page.url()).pathname };
  col.closes = closes;
  col.consoleReal = errs.filter((e) => !e.excluded).length;
  col.consoleWs = errs.filter((e) => e.excluded).length;
  await browser.close();
  return col;
};

const AFTER = arg("after"), BEFORE = arg("before");
const out = { after: AFTER, before: BEFORE, wall: new Date().toISOString(), cols: [] };
for (const [n, e] of [["webkit", webkit], ["chromium", chromium], ["firefox", firefox]]) {
  out.cols.push(await column(n, e, AFTER, "after", false));   // 🔴 자극(처방) 열 먼저
  out.cols.push(await column(n, e, BEFORE, "before", false));
}
// ⑤ 반증 열 — 前 무대 · webkit · 링크에 tabindex=0 주입
out.cols.push(await column("webkit", webkit, BEFORE, "before+tabindex0", true));

const find = (e, s) => out.cols.find((c) => c.engine === e && c.stage === s) ?? {};
const wA = find("webkit", "after"), wB = find("webkit", "before");
const cA = find("chromium", "after"), cB = find("chromium", "before");
const fA = find("firefox", "after"), fB = find("firefox", "before");
out.verdict = {
  a_webkitAfterNoEscape: wA.tabEscapes === 0,
  a2_webkitAfterCycles: wA.tabDistinctInside >= 3,             // 🔴 「이탈 0」만으로는 순환이 아니다
  b_webkitShiftNoEscape: wA.shiftEscapes === 0 && wA.shiftDistinctInside >= 3,
  c_controlBeforeRed: wB.tabEscapes > 0 || wB.tabDistinctInside < 3, // 前 열이 빨강이라야 후 열 초록이 뜻을 갖는다
  d_chromiumUnchanged: cA.tabEscapes === cB.tabEscapes && cA.tabDistinctInside === cB.tabDistinctInside,
  e_firefoxUnchanged: fA.tabEscapes === fB.tabEscapes && fA.tabDistinctInside === fB.tabDistinctInside,
  f_closes3: ["esc", "scrim", "link"].every((k) => wA.closes?.[k]?.left === 0)
    && wA.closes?.esc?.focus === "nav-menu-toggle" && wA.closes?.scrim?.focus === "nav-menu-toggle",
  g_console0: [wA, cA, fA].every((c) => c.consoleReal === 0),
};
out.verdict.allPass = Object.entries(out.verdict).filter(([k]) => /^[a-g]\d?_/.test(k)).every(([, v]) => v === true);
out.verdict.fails = Object.entries(out.verdict).filter(([k, v]) => /^[a-g]\d?_/.test(k) && v !== true).map(([k]) => k);
out.disproof = { // ⑤ 결과만 병기
  beforeTabindex0: (() => { const c = find("webkit", "before+tabindex0"); return { escapes: c.tabEscapes, distinctInside: c.tabDistinctInside, injected: c.injected }; })(),
  beforePlain: { escapes: wB.tabEscapes, distinctInside: wB.tabDistinctInside },
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
const row = (c) => `${c.engine}/${c.stage}: esc=${c.tabEscapes} distinct=${c.tabDistinctInside} shiftEsc=${c.shiftEscapes} shiftDistinct=${c.shiftDistinctInside} err=${c.consoleReal}`;
console.log(out.cols.map(row).join("\n"));
console.log("disproof:", JSON.stringify(out.disproof));
console.log(`=> ${out.verdict.allPass ? "PASS" : "FAIL: " + out.verdict.fails.join(",")}`);
process.exit(out.verdict.allPass ? 0 : 1);
