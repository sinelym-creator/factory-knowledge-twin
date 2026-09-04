/**
 * D-75 화면 축 + 승격 14 ⓗ 캡처 — 공개면 GP 근거 «본문»을 화면 클릭으로 연다.
 *
 * 🔴 **마지막 live 1회**(cap 5/5). 그래서 판정과 캡처를 **한 회차**에 묶는다.
 * 🔴 **무대 울림**(안 울리면 `exit 2` · 캡처 없이 회부):
 *      ① run 이 섰다 · ② `completed` · ③ 화면이 낸 GP href 접두가 그 runId 접미와 «일치»
 *         (O-16 = 재생본 GP id 배제).
 * 🔴 **화면이 만드는 것은 화면 흐름으로** — 근거는 `fetch` 나 주소창이 아니라 **목록에서 클릭**해
 *    연다. fetch 로 연 본문은 그 셸이 그린 것이 아니다.
 *
 * 판정선(셀렉터는 배포본 `app/evidence/[evidenceId]/page.tsx` 실코드에서 굳혔다):
 *   · `[data-testid="graph-path-body"]`  = 1
 *   · `[data-testid="graph-path-steps"] > li` >= 2
 *   · `[data-testid="graph-path-walk"]`  문자열 비어 있지 않음
 *   · 본문 안 `a`                          = 0   (종단 노드를 링크로 만들지 않는다는 규율)
 *   · 「닿지 못했습니다」                    = 0
 *
 * usage: node d75_gp_body_screen.mjs --out o.json --shots DIR [--base https://...]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
const SHOTS = arg("shots");
if (!OUT || !SHOTS) {
  console.error("--out 과 --shots 는 필수다");
  process.exit(9);
}

const bail = async (browser, out, why) => {
  out.verdict = { ...(out.verdict ?? {}), stageRang: false, why, capture: "없음(무대 안 울림)" };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.error("STAGE NOT RANG: " + why);
  process.exit(2);
};

const run = async () => {
  const browser = await chromium.launch();
  // 🔴 캡처 폭이 판정 폭이다 — 1280 으로 «처음부터» 돈다. 다른 폭에서 돌고 캡처만 1280 으로
  //    바꾸면 그 그림은 내가 판정한 화면이 아니다.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));

  const out = { base: BASE, viewport: "1280x900", wall: new Date().toISOString(), stage: {}, screen: {}, verdict: {} };

  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  out.stage.health = await page
    .evaluate(async () => (await fetch("/api/health", { credentials: "include" })).json())
    .catch(() => null);

  for (const sel of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = page.locator(sel);
    if (await l.count()) {
      await l.first().click().catch(() => {});
      await page.waitForTimeout(600);
    }
  }

  // --- live run 1회 — 화면 「조사 시작」 클릭 ------------------------------
  const startBtn = page.locator('[data-testid="start-from-alarm"]:not([disabled])');
  const enabled = await startBtn
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  out.stage.startEnabled = enabled;
  if (!enabled) await bail(browser, out, "「조사 시작」이 눌리는 상태가 되지 않았다(cap 소모 0)");

  await startBtn.first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  out.stage.landedUrl = page.url();
  const rid = (page.url().match(/run=([^&]+)/) || [])[1];
  out.stage.runId = rid ? decodeURIComponent(rid) : null;
  if (!out.stage.runId) await bail(browser, out, "클릭했으나 URL 에 runId 가 없다");
  const RID = out.stage.runId;
  const SUFFIX = RID.replace(/^RUN-/, "");

  // 완주까지 — GP 근거는 완주 시점에 run 상태로 옮겨진다(runner.py).
  const trail = [];
  for (let i = 0; i < 60; i++) {
    const r = await page
      .evaluate(async (id) => {
        const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { credentials: "include" });
        return { s: res.status, j: res.status === 200 ? await res.json() : null };
      }, RID)
      .catch(() => ({ s: null, j: null }));
    trail.push({ t: new Date().toISOString(), status: r.s, runStatus: r.j?.status ?? null });
    if (r.s === 200 && ["completed", "failed", "stopped"].includes(r.j?.status)) break;
    if (r.s === 404) break;
    await page.waitForTimeout(2000);
  }
  out.stage.statusTrail = trail;
  out.stage.finalRunStatus = trail[trail.length - 1]?.runStatus ?? null;
  await page.waitForTimeout(1500);

  // --- 무대 울림 ③ — 화면이 낸 GP href 의 접두 -----------------------------
  // 🔴 목록이 그려지기 «전»에 세면 0건이 나오고, 그 0건은 부재가 아니라 내 조급함이다.
  out.stage.gpHrefAppeared = await page
    .locator('a[href*="/evidence/GP-"]')
    .first()
    .waitFor({ state: "attached", timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  const gpHrefs = await page
    .locator('a[href*="/evidence/GP-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  out.stage.gpHrefCount = gpHrefs.length;
  out.stage.gpHrefs = gpHrefs.slice(0, 10);
  const first = gpHrefs[0] ?? null;
  const firstId = (first?.match(/\/evidence\/(GP-[^/?#]+)/) || [])[1] ?? null;
  out.stage.firstGpId = firstId;
  out.stage.prefixMatch = firstId ? firstId.startsWith(`GP-${SUFFIX}-`) : false;
  if (out.stage.finalRunStatus !== "completed")
    await bail(browser, out, `run 이 completed 가 아니다(${out.stage.finalRunStatus})`);
  if (!out.stage.prefixMatch)
    await bail(browser, out, `GP href 접두가 runId 접미와 다르다(first=${firstId} · runId=${RID}) — O-16 배제 실패`);

  // --- 🔴 화면 클릭으로 근거 본문을 연다(fetch 아님) -----------------------
  await page.locator(`a[href*="/evidence/${firstId}"]`).first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  out.screen.url = page.url();
  out.screen.arrivedOnEvidence = page.url().includes(`/evidence/${firstId}`);

  const body = page.locator('[data-testid="graph-path-body"]');
  out.screen.bodyCount = await body.count();
  out.screen.stepsCount = await page.locator('[data-testid="graph-path-steps"] > li').count();
  out.screen.walkText =
    (await page.locator('[data-testid="graph-path-walk"]').count())
      ? (await page.locator('[data-testid="graph-path-walk"]').first().innerText()).replace(/\s+/g, " ").trim()
      : null;
  out.screen.anchorsInBody = out.screen.bodyCount ? await body.locator("a").count() : null;
  const pageText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  out.screen.unreachablePhrase = (pageText.match(/닿지 못했습니다/g) || []).length;
  out.screen.notFoundPhrase = (pageText.match(/찾을 수 없|찾을 수 없습니다/g) || []).length;
  out.screen.bodyTextHead = out.screen.bodyCount
    ? (await body.first().innerText()).replace(/\s+/g, " ").trim().slice(0, 400)
    : null;

  // --- 캡처 ⓗ — 판정한 그 화면 그대로 -------------------------------------
  const shot = `${SHOTS}/promo14-gp-body-1280.png`;
  await page.screenshot({ path: shot });
  out.screen.capture = shot.split("/").slice(-1)[0];

  // --- 판정 ---------------------------------------------------------------
  const v = {
    stageRang: true,
    runId: RID,
    build: out.stage.health?.build ?? null,
    a_bodyPresent: out.screen.bodyCount === 1,
    b_stepsAtLeast2: out.screen.stepsCount >= 2,
    c_walkNonEmpty: Boolean(out.screen.walkText && out.screen.walkText.length > 0),
    d_noAnchorsInBody: out.screen.anchorsInBody === 0,
    e_noUnreachablePhrase: out.screen.unreachablePhrase === 0,
  };
  v.pass = v.a_bodyPresent && v.b_stepsAtLeast2 && v.c_walkNonEmpty && v.d_noAnchorsInBody && v.e_noUnreachablePhrase;
  out.verdict = v;
  out.consoleErrors = errs.slice(0, 20);

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(
    `runId=${RID} build=${v.build} prefixMatch=${out.stage.prefixMatch} | body=${out.screen.bodyCount} ` +
      `steps=${out.screen.stepsCount} walk=${v.c_walkNonEmpty} anchors=${out.screen.anchorsInBody} ` +
      `unreachable=${out.screen.unreachablePhrase} => ${v.pass ? "PASS" : "FAIL"}`,
  );
  process.exit(v.pass ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
