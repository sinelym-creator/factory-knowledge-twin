/**
 * D-56 독립 검증 — 「리셋 확인창이 화면 위쪽으로 잘려 나가지 않는가」 + 센쿠2가 «안 잼»으로 남긴 배경 차단.
 *
 * 🔴 **「닿는다 ≠ 눌린다」** — 배경 차단은 좌표 계산이 아니라 **실제로 클릭해 막히는지**로 잰다.
 *    그래서 배경에 내가 만든 표적을 심고, 클릭이 그 표적에 «도달했는가»를 표적 스스로 신고하게 한다.
 * 🔴 **뷰포트마다 앱바 높이가 다르다** — 그것이 이 결함의 기전이라, 창 top 과 «앱바 높이»를 함께 찍는다.
 * 🔴 창이 안 열리면 빨강이 아니라 `exit 2`(무대 미성립).
 *
 *   node batch_d56_dialog.mjs --base http://127.0.0.1:8143 --label target --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8143");
const LABEL = arg("label", "unknown");
const OUT = arg("out", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORTS = [[1920, 900], [1280, 800], [1280, 400], [390, 844], [390, 500]];

const browser = await chromium.launch();
const out = { label: LABEL, base: BASE, at: new Date().toISOString(), rows: [], notes: [] };

for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const row = { vp: `${w}x${h}` };
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL(/overview/, { timeout: 40000 }).catch(() => {});
  await sleep(1800);

  /* 배경 표적을 심는다 — 창이 배경을 막는지 «실제 클릭»으로 물어보기 위해서. */
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "__levi2_bg_target";
    b.textContent = "bg";
    Object.assign(b.style, { position: "fixed", left: "8px", bottom: "8px", zIndex: "1", width: "60px", height: "30px" });
    b.addEventListener("click", () => { window.__bgClicked = (window.__bgClicked ?? 0) + 1; });
    window.__bgClicked = 0;
    document.body.appendChild(b);
  });

  const reset = page.getByRole("button", { name: /리셋/ });
  row.resetFound = await reset.count().then((n) => n > 0).catch(() => false);
  if (!row.resetFound) { row.note = "리셋 손잡이 없음 — 무대 미성립"; out.rows.push(row); await ctx.close(); continue; }
  await reset.first().click().catch(() => {});
  await sleep(900);

  row.geom = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"], [data-testid*="reset-modal"], [data-testid*="reset-dialog"]');
    const bar = document.querySelector("header, .fkt-glass");
    const r = dlg ? dlg.getBoundingClientRect() : null;
    const toast = document.querySelector('[role="status"]');
    const tr = toast ? toast.getBoundingClientRect() : null;
    return {
      dialogFound: !!dlg,
      top: r ? Math.round(r.top) : null,
      left: r ? Math.round(r.left) : null,
      height: r ? Math.round(r.height) : null,
      appBarHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
      parentIsBody: dlg ? dlg.parentElement === document.body : null,
      toastRight: tr ? Math.round(tr.right) : null,
      innerWidth: window.innerWidth,
      buttons: dlg ? Array.from(dlg.querySelectorAll("button")).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()) : [],
    };
  });

  /* 🔴 배경 차단 — 좌표가 아니라 «클릭»으로. 막히면 표적 계수가 안 오른다. */
  if (row.geom.dialogFound) {
    await page.locator("#__levi2_bg_target").click({ timeout: 3000, force: true }).catch(() => {});
    row.bgClicked = await page.evaluate(() => window.__bgClicked ?? -1);
    row.backgroundBlocked = row.bgClicked === 0;
    /* Esc 로 닫히는가 */
    await page.keyboard.press("Escape");
    await sleep(600);
    row.closedByEsc = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
  }
  out.rows.push(row);
  await ctx.close();
}
await browser.close();

const measured = out.rows.filter((r) => r.geom?.dialogFound);
out.summary = {
  viewports: out.rows.length,
  dialogOpened: measured.length,
  topAllNonNegative: measured.length > 0 && measured.every((r) => r.geom.top >= 0),
  tops: measured.map((r) => `${r.vp}:${r.geom.top}`),
  appBarHeights: measured.map((r) => `${r.vp}:${r.geom.appBarHeight}`),
  parentIsBody: measured.map((r) => `${r.vp}:${r.geom.parentIsBody}`),
  backgroundBlocked: measured.map((r) => `${r.vp}:${r.backgroundBlocked}`),
  closedByEsc: measured.map((r) => `${r.vp}:${r.closedByEsc}`),
  toastWithin: measured.map((r) => `${r.vp}:${r.geom.toastRight === null ? "없음" : r.geom.toastRight <= r.geom.innerWidth}`),
};
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
if (measured.length === 0) process.exit(2);
process.exit(out.summary.topAllNonNegative ? 0 : 1);
