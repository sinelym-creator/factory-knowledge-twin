/**
 * D-58 근거 화면 «돌아갈 길» 그물 — 경로 표시(evidence-breadcrumb) 세 갈래 실측.
 *
 * 🔴 두 세계에 똑같이 건다: 대상(#620 `12a915a`) · 대조군(`e590294`). 대조군은 그 줄이
 *    아예 없으므로 조각 수 0 이 «정상»이고, 그 0 이 이 그물의 생존 증명이다.
 * 🔴 무대 울림을 수로 먼저 센다 — 근거 화면이 안 열리면(200 아님/본문 없음) 어느 색도
 *    내지 않고 exit 2.
 * 🔴 셀렉터는 지어내지 않는다 — 구현이 쓰는 testid(`evidence-breadcrumb`,
 *    `evidence-breadcrumb-run`, `trust-header`)와 화면이 실제로 내놓은 evidenceId 를 쓴다.
 *
 * usage:
 *   node d58_breadcrumb.mjs --base http://127.0.0.1:8160 --out C:/path/out.json
 *     [--evidence "DOC-MAN-0021@r1#001"] [--static-run STATIC-GS-01]
 *     [--incident INC-2026-014] [--width 390]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const BASE = arg("base");
const OUT = arg("out");
const EVIDENCE = arg("evidence", "DOC-MAN-0021@r1#001");
const STATIC_RUN = arg("static-run", "STATIC-GS-01");
const INCIDENT = arg("incident", "INC-2026-014");
const WIDTH = Number(arg("width", "390"));
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

const evUrl = (run) =>
  `${BASE}/evidence/${encodeURIComponent(EVIDENCE)}` + (run ? `?run=${encodeURIComponent(run)}` : "");

/** 한 갈래를 연다. 반환값에 «잰 것»만 담는다 — 없는 것은 null 이 아니라 존재 여부로 말한다. */
async function branch(ctx, { name, run, width }) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));
  await page.setViewportSize({ width, height: 900 });
  const res = await page.goto(evUrl(run), { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = res ? res.status() : null;

  const nav = page.locator('[data-testid="evidence-breadcrumb"]');
  const present = (await nav.count()) > 0;
  const out = { name, url: evUrl(run), width, status, present, consoleErrors };

  // 무대 증인 — 이 화면이 실제로 근거 화면인가(경로 표시와 «무관한» 표지로 센다).
  out.trustHeaderCount = await page.locator('[data-testid="trust-header"]').count();
  out.bodyChars = (await page.locator("body").innerText()).length;

  if (present) {
    const items = nav.locator("ol > li");
    out.pieces = await items.count();
    out.text = (await nav.innerText()).replace(/\s+/g, " ").trim();
    // 🔴 「한 줄」 = 조각들의 세로 위치 차가 «한 조각 높이»보다 작다.
    //    반올림 비교로 재면 0.5px 정렬 오차가 「줄바꿈」이 된다 — 44대 1차 실측이 그랬다.
    //    기준은 리터럴이 아니라 그 화면이 그 순간 쓴 조각 높이다.
    const box = await items.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, height: r.height };
      })
    );
    out.tops = box.map((b) => b.top);
    out.heights = box.map((b) => b.height);
    const minH = Math.min(...box.map((b) => b.height));
    out.topSpread = Math.max(...out.tops) - Math.min(...out.tops);
    out.oneLine = out.topSpread < minH * 0.6;
    // D-58b 재검 축 — 줄여서 한 줄을 지킨다면 «잘린 전체»가 `title` 로 남아야 한다.
    out.lastPieceTitle = await items.nth(-1).locator("[title]").first().getAttribute("title").catch(() => null);
    out.lastPieceText = (await items.nth(-1).innerText()).replace(/\s+/g, " ").trim();
    out.firstIsLink = (await items.nth(0).locator("a").count()) > 0;
    out.firstHref = out.firstIsLink ? await items.nth(0).locator("a").getAttribute("href") : null;
    const runPiece = page.locator('[data-testid="evidence-breadcrumb-run"]');
    out.runPieceCount = await runPiece.count();
    if (out.runPieceCount > 0) {
      out.runPieceText = (await runPiece.innerText()).trim();
      out.runPieceTag = await runPiece.evaluate((e) => e.tagName.toLowerCase());
      out.runPieceHref = await runPiece.getAttribute("href");
    }
  }
  await page.close();
  return out;
}

/** A 갈래의 «클릭 도달» — href 가 있다는 사실과 눌러서 그 화면에 서는 사실은 다르다. */
async function clickThrough(ctx, run) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.goto(evUrl(run), { waitUntil: "domcontentloaded", timeout: 30000 });
  const link = page.locator('[data-testid="evidence-breadcrumb-run"]');
  const isLink = (await link.count()) > 0 && (await link.evaluate((e) => e.tagName.toLowerCase())) === "a";
  let landed = null;
  let landedTitleish = null;
  if (isLink) {
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);
    landed = page.url();
    landedTitleish = (await page.locator("body").innerText()).slice(0, 160).replace(/\s+/g, " ");
  }
  const out = { isLink, landed, landedTitleish, consoleErrors: errs };
  await page.close();
  return out;
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const result = { base: BASE, evidence: EVIDENCE, wall: new Date().toISOString(), branches: {} };

  // B 갈래에 쓸 «실제» run id — 지어내지 않고 셸의 /api 로 만들게 한다.
  // 🔴 브라우저는 ai-api 를 직접 부르지 않는다. 셸의 /api 프록시가 유일한 통로다.
  const seed = await ctx.newPage();
  await seed.goto(`${BASE}/enter`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const made = await seed.evaluate(async () => {
    const s = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!s.ok) return { step: "session", status: s.status };
    const { sessionId } = await s.json();
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, mode: "replay" }),
    });
    if (!r.ok) return { step: "run", status: r.status, sessionId };
    const body = await r.json();
    return { step: "ok", status: r.status, sessionId, runId: body.runId };
  });
  result.seed = made;
  await seed.close();

  result.branches.C_noRun = await branch(ctx, { name: "C_noRun", run: null, width: WIDTH });
  result.branches.A_static = await branch(ctx, { name: "A_static", run: STATIC_RUN, width: WIDTH });
  if (made.runId) {
    result.branches.B_realRun = await branch(ctx, { name: "B_realRun", run: made.runId, width: WIDTH });
  }
  // 넓은 화면에서도 한 줄인가 — 「390 에서만 한 줄」과 갈린다.
  result.branches.A_static_1280 = await branch(ctx, { name: "A_static_1280", run: STATIC_RUN, width: 1280 });

  result.clickThrough = await clickThrough(ctx, STATIC_RUN);
  result.expectedStaticHref = `/incidents/${encodeURIComponent(INCIDENT)}?run=${encodeURIComponent(STATIC_RUN)}`;

  // 투어 7걸음 target 실재 — 근거 화면에 `trust-header` 가 실제로 서는가.
  result.tourTargetPresent = result.branches.A_static.trustHeaderCount > 0;

  await browser.close();
  writeFileSync(OUT, JSON.stringify(result, null, 2), "utf-8");

  const stageWitness = Object.values(result.branches).filter((b) => b.status === 200 && b.trustHeaderCount > 0).length;
  console.log(JSON.stringify({ stageWitness, seed: result.seed?.step, branches: Object.fromEntries(
    Object.entries(result.branches).map(([k, v]) => [k, { status: v.status, present: v.present, pieces: v.pieces ?? 0, oneLine: v.oneLine ?? null, text: v.text ?? null }])
  ), clickThrough: result.clickThrough }, null, 1));
  if (stageWitness === 0) {
    console.error("STAGE 0: 근거 화면이 한 번도 서지 않았다 — 안 잼(exit 2)");
    process.exit(2);
  }
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
