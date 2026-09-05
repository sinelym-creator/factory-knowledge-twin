/**
 * E-11 — 둘러보기 9걸음 완주(사람 대신 그물이 «화면으로만» 걷는다).
 *
 * 🔴 판정선의 «표»를 이 파일에 박지 않는다 — 정본(`components/tour/tour-steps.ts`)에서 **읽어 온다**.
 *    걸음 수·제목·대상·전이 방식이 바뀌면 그물이 따라 늙지 않고 **정본을 따라간다**.
 *    (그물에 오늘의 사실을 박으면 대상보다 먼저 낡는다.)
 * 🔴 우회 금지: 내부 상태 주입·스텝 건너뛰기·`?step=` 조작을 쓰지 않는다. 진행 수단은 화면의 세 가지뿐 —
 *    「다음」 버튼 · 「이동」 링크 · **대상 요소 클릭**.
 * 🔴 반증 열: `await` 걸음에서 «후보가 아닌 곳»을 눌러 **전이가 안 일어나는지**를 같은 실행에서 잰다.
 *    이 열이 없으면 「아무 클릭에나 넘어가는 투어」도 초록이 된다.
 * 🔴 콘솔로 나가는 문면은 ASCII.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const CANON = args.get("canon"); // tour-steps.ts 경로
const ENGINES = (args.get("engines") ?? "chromium,firefox,webkit").split(",");
const SIZES = (args.get("sizes") ?? "390x844,1280x800").split(",");
/* 🔴 대기는 «인자»로 선언하고 산출물에 적는다 — 오버레이는 대상 사각형을 렌더 «뒤»에 재고
   `SETTLE_MS`(700ms) 뒤에 자리를 확정한다. 그 전에 읽으면 «없는 스포트라이트»를 지어낸다. */
const SETTLE = Number(args.get("settle") ?? 1000);
if (!BASE || !CANON) {
  console.error("usage: node t76_e11_tour_walk.mjs --base URL --canon PATH/tour-steps.ts [--engines a,b] [--sizes WxH,...]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(path.join(here, "/"));
const pw = require_("playwright");

/** 정본에서 걸음 표를 읽는다 — 「9걸음」도 여기서 온다(내가 세지 않는다). */
function readCanon(file) {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf("TOUR_STEPS");
  if (start < 0) throw new Error("canon: TOUR_STEPS not found");
  const body = src.slice(src.indexOf("[", start));
  const chunks = body.split(/\n  \{/).slice(1);
  const steps = [];
  for (const c of chunks) {
    const id = /\n?\s*id:\s*"([^"]+)"/.exec(c);
    if (!id) continue;
    const route = /\n\s*route:\s*"([^"]*)"/.exec(c);
    const target = /\n\s*target:\s*(null|"[^"]*")/.exec(c);
    const title = /\n\s*title:\s*"([^"]*)"/.exec(c);
    const adv = /\n\s*advance:\s*("next"|\{[^}]*\})/.exec(c);
    let kind = null;
    let of_ = null;
    let to = null;
    if (adv) {
      const a = adv[1];
      if (a === '"next"') kind = "next";
      else if (/\bto:/.test(a)) {
        kind = "link";
        const lit = /to:\s*"([^"]*)"/.exec(a);
        to = lit ? lit[1] : null; // 상수 표기면 null — URL 이 «바뀌었는가»로만 판정한다
      } else if (/\bon:/.test(a)) {
        kind = "await";
        const o = /of:\s*"([^"]*)"/.exec(a);
        of_ = o ? o[1] : null;
      }
    }
    steps.push({
      id: id[1],
      route: route ? route[1] : null,
      target: target && target[1] !== "null" ? target[1].slice(1, -1) : null,
      title: title ? title[1] : null,
      kind,
      of: of_,
      to,
    });
  }
  return steps;
}

const CANON_STEPS = readCanon(CANON);

async function enter(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="enter-button"]', { timeout: 30000 });
  // 이 버튼은 리렌더로 안정성 검사가 안 끝난다 — 입장은 «전제»라 강제 클릭으로 내려간다.
  try {
    await page.locator('[data-testid="enter-button"]').click({ timeout: 8000, force: true });
  } catch {
    await page.evaluate(() => document.querySelector('[data-testid="entry-form"]')?.requestSubmit());
  }
  await page.waitForURL("**/overview", { timeout: 60000 });
}

async function walk(engineName, w, h) {
  const res = {
    engine: engineName,
    size: `${w}x${h}`,
    canonSteps: CANON_STEPS.length,
    walked: [],
    consoleErrors: [],
    pageErrors: [],
  };
  const browser = await pw[engineName].launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => {
    if (m.type() === "error") res.consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => res.pageErrors.push(String(e).slice(0, 160)));

  try {
    await enter(page);
    await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 30000 });
    await page.locator('[data-testid="tour-start"]').click({ timeout: 15000, force: true });

    for (let i = 0; i < CANON_STEPS.length; i += 1) {
      const s = CANON_STEPS[i];
      await page.waitForSelector('[data-testid="tour-callout"]', { timeout: 30000 });
      await page.waitForTimeout(SETTLE);
      const title = (await page.locator('[data-testid="tour-title"]').innerText().catch(() => "")).trim();
      const spotlight = await page.locator('[data-testid="tour-spotlight"]').count();
      const targetOnScreen = s.target
        ? await page.locator(`[data-testid="${s.target}"]`).first().isVisible().catch(() => false)
        : null;
      const missingWarn = await page.locator('[data-testid="tour-target-missing"]').count();
      const url0 = page.url();

      const cell = {
        n: i + 1,
        id: s.id,
        titleMatchesCanon: s.title !== null && title === s.title,
        titleLen: title.length,
        spotlightShown: spotlight > 0,
        spotlightExpected: s.target !== null,
        targetOnScreen,
        targetMissingWarn: missingWarn,
        kind: s.kind,
        canonRoute: s.route,
        urlAtRead: page.url().replace(BASE, ""),
        onRoute: s.route ? page.url().includes(s.route) : null,
      };

      // 🔴 반증 열 — `await` 걸음에서 «후보가 아닌 곳»을 먼저 눌러 본다. 넘어가면 그 투어는 아무 클릭에나 넘어간다.
      if (s.kind === "await") {
        const before = await page.locator('[data-testid="tour-title"]').innerText().catch(() => "");
        await page.locator('[data-testid="tour-callout"]').click({ position: { x: 5, y: 5 }, timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(700);
        const after = await page.locator('[data-testid="tour-title"]').innerText().catch(() => "");
        cell.counterColumn = { clickedNonTarget: true, advanced: before !== after };
        cell.awaitPillShown = (await page.locator('[data-testid="tour-await-click"]').count()) > 0;
      }

      if (s.kind === "next") {
        await page.locator('[data-testid="tour-next"]').click({ timeout: 15000, force: true });
      } else if (s.kind === "link") {
        await page.locator('[data-testid="tour-goto"]').click({ timeout: 15000, force: true });
        await page.waitForFunction((u) => location.href !== u, url0, { timeout: 30000 });
        cell.urlAfter = page.url().replace(BASE, "");
        if (s.to) cell.urlMatchesCanonTo = page.url().includes(s.to);
      } else if (s.kind === "await") {
        /* 🔴 걸음의 본문이 시키는 것은 «후보 카드 안의 근거 ID 를 누르라»다 — 카드 자체를 누르면
           투어는 넘어가지만 «근거 화면»으로는 안 간다. 다음 걸음의 route 가 `/evidence/` 이므로
           카드만 누른 그물은 그 다음 걸음을 «다른 화면에서» 만나 스포트라이트가 없다.
           그래서 `of` 안에 링크가 있으면 «그 링크»를 누른다(사람이 하는 그대로). */
        const inner = page.locator(`[data-testid="${s.of}"] a`).first();
        const useInner = (await inner.count()) > 0;
        cell.awaitClicked = useInner ? `${s.of} > a` : s.of;
        const urlBefore = page.url();
        await (useInner ? inner : page.locator(`[data-testid="${s.of}"]`).first()).click({ timeout: 15000, force: true });
        if (useInner) {
          await page.waitForFunction((u) => location.href !== u, urlBefore, { timeout: 30000 }).catch(() => {});
          cell.urlAfter = page.url().replace(BASE, "");
        }
      }
      res.walked.push(cell);

      // 마지막 걸음이 `{to:"/overview"}` 면 그 착지를 사건으로 잡는다.
      if (i === CANON_STEPS.length - 1 && s.kind === "link") {
        await page.waitForURL("**/overview", { timeout: 30000 });
      }
    }

    res.finalUrl = page.url().replace(BASE, "");
    res.landedOnOverview = /\/overview(\?|$)/.test(res.finalUrl);
    res.calloutGone = (await page.locator('[data-testid="tour-callout"]').count()) === 0;
    res.reopenBadge = await page.locator('[data-testid="intro-reopen"]').first().isVisible().catch(() => false);
  } catch (e) {
    res.error = String(e).slice(0, 400);
  } finally {
    await browser.close();
  }
  return res;
}

const out = { base: BASE, settleMs: SETTLE, canon: path.basename(CANON), canonSteps: CANON_STEPS.map((s) => s.id), runs: [] };
for (const eng of ENGINES) {
  for (const size of SIZES) {
    const [w, h] = size.split("x").map(Number);
    out.runs.push(await walk(eng, w, h));
  }
}
out.summary = out.runs.map((r) => ({
  engine: r.engine,
  size: r.size,
  stepsWalked: r.walked.length,
  allTitlesMatch: r.walked.every((c) => c.titleMatchesCanon),
  spotlightAgrees: r.walked.every((c) => c.spotlightShown === c.spotlightExpected),
  targetsOnScreen: r.walked.filter((c) => c.targetOnScreen === true).length,
  targetMissingWarns: r.walked.reduce((a, c) => a + c.targetMissingWarn, 0),
  counterColumnHeld: r.walked.filter((c) => c.counterColumn).every((c) => c.counterColumn.advanced === false),
  landedOnOverview: r.landedOnOverview ?? null,
  reopenBadge: r.reopenBadge ?? null,
  consoleErrors: r.consoleErrors.length,
  pageErrors: r.pageErrors.length,
  error: r.error ?? null,
}));
process.stdout.write(JSON.stringify(out, null, 1) + String.fromCharCode(10));
process.exit(out.runs.some((r) => r.error) ? 1 : 0);
