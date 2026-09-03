/**
 * T6-5 축 ① — **중간 재개**: 스텝 5 에서 Esc 로 끊고 앱바 `?` 로 다시 열었을 때
 * «그 스텝»에서 이어지는가.
 *
 * 정본 = `docs/design/t6-5-guided-tour-spec.md` ⑥ 흐름 행 「Esc 종료 · 재개(`step` 기억)」.
 * 전임(33대)이 잰 것은 «완료 후 재개»(status=done → step 0)뿐이다. 여기서 재는 것은
 * **중간에 끊은 진행이 그 자리로 돌아오는가**이고, 그 자리로 돌아온 «뒤에 이어갈 수 있는가»
 * 까지가 한 축이다 — 인덱스만 맞고 앞이 막혀 있으면 사람에게는 이어진 것이 아니다.
 *
 * 🔴 **같은 실행 안에 대조군 1열을 둔다.** 「이어진다」가 참인 화면만 훑으면 이 그물이
 *    «아무것도 안 하는 그물»이어도 초록이 나온다. 그래서 재개 직전에 저장소 진행을 0 으로
 *    되돌린 열을 한 번 더 돌린다 — 그 열에서 그물이 「5 가 아니다」를 못 집으면 이 측정은
 *    판정력이 없는 것이고, 대상의 초록도 무효다.
 * 🔴 **무대가 안 서면 빨강이 아니라 exit 2** — 초대 카드가 없거나 스텝 5 에 못 닿으면
 *    그것은 「재개가 깨졌다」가 아니라 「재지 못했다」다.
 *
 * 사용: node t65_resume_drill.mjs --base http://127.0.0.1:3107 --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3107");
const OUT = arg("out", "");
const TARGET_STEP = Number(arg("step", "5"));

const report = { base: BASE, at: new Date().toISOString(), targetStep: TARGET_STEP, columns: [] };
const stage = { entered: false, invite: false, reachedTarget: false };

const browser = await chromium.launch();

/** 셸 입장 — 자동 리다이렉트가 늦으면 방문자처럼 「입장하기」를 누른다. */
async function enter(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const auto = await page
    .waitForURL(/\/overview/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!auto) {
    await page
      .getByRole("link", { name: /입장하기/ })
      .or(page.getByRole("button", { name: /입장하기/ }))
      .first()
      .click({ timeout: 10_000 });
    await page.waitForURL(/\/overview/, { timeout: 45_000 });
  }
}

const calloutAt = (page, i) => page.locator(`[data-testid="tour-callout"][data-index="${i}"]`);

/** 현재 스텝에서 «다음»으로 가는 한 걸음 — 스텝이 요구하는 조작을 그대로 한다. */
async function stepForward(page, i) {
  const callout = calloutAt(page, i);
  await callout.waitFor({ state: "visible", timeout: 20_000 });
  const goto = page.locator('[data-testid="tour-goto"]');
  const next = page.locator('[data-testid="tour-next"]');
  if (await goto.count()) {
    await goto.first().click();
  } else if (await next.count()) {
    await next.first().click();
  } else {
    return false; // 클릭 스텝 — 여기서 멈춘다
  }
  return true;
}

async function runColumn(label, { tamperToStep = null, reloadAfterReopen = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const col = { label, tamperToStep, steps: [], resume: null, verdict: null };

  await enter(page);
  stage.entered = true;

  // 초대 카드 → 투어 시작
  const invite = page.locator('[data-testid="tour-start"]');
  await invite.waitFor({ state: "visible", timeout: 20_000 });
  stage.invite = true;
  await invite.click();

  // 스텝 0 → TARGET_STEP 까지 전진
  for (let i = 0; i < TARGET_STEP; i += 1) {
    const moved = await stepForward(page, i);
    col.steps.push({ index: i, moved, url: page.url() });
    if (!moved) break;
  }
  const arrived = await calloutAt(page, TARGET_STEP)
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  col.reachedTarget = arrived;
  if (arrived) stage.reachedTarget = true;
  col.urlAtTarget = page.url();
  col.stepIdAtTarget = arrived
    ? await calloutAt(page, TARGET_STEP).getAttribute("data-step")
    : null;

  // Esc — 규격 ⑤ 「Esc = 종료(진행은 남는다)」
  await page.keyboard.press("Escape");
  await page
    .locator('[data-testid="tour-callout"]')
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  col.calloutAfterEsc = await page.locator('[data-testid="tour-callout"]').count();
  col.storedAfterEsc = await page.evaluate(() => window.localStorage.getItem("fkt.tour.v1"));

  // 🔴 대조군 열: 저장된 진행을 0 으로 되돌린다 — 그물이 「그 스텝이 아니다」를 집는지 본다.
  if (tamperToStep !== null) {
    await page.evaluate((s) => {
      const raw = window.localStorage.getItem("fkt.tour.v1");
      const parsed = raw ? JSON.parse(raw) : { v: 1, status: "skipped", step: 0 };
      window.localStorage.setItem("fkt.tour.v1", JSON.stringify({ ...parsed, step: s }));
    }, tamperToStep);
    col.storedAfterTamper = await page.evaluate(() => window.localStorage.getItem("fkt.tour.v1"));
  }

  // 앱바 `?` 로 재개
  /* 🔴 클릭이 «닿았는가»를 먼저 확인한다. 첫 회차에서 Esc 직후의 클릭이 URL 을 못 바꾼 회차가
     있었는데, 그 회차의 「안 열렸다」는 대상이 아니라 내 손의 빨강이다. 자극이 실재했는지부터
     세우고, 끝내 못 닿으면 그 열은 판정에서 뺀다(무대 미구비). */
  const reopen = page.locator('[data-testid="intro-reopen"]');
  let navigated = false;
  for (let tryN = 1; tryN <= 3 && !navigated; tryN += 1) {
    await reopen.first().click({ timeout: 10_000 });
    navigated = await page
      .waitForURL(/tour=1/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    col.reopenTries = tryN;
  }
  col.reopenNavigated = navigated;
  /* 🔴 손잡이 하나만 다른 열: 같은 URL 에 «마운트»를 강제한다. 클라이언트 이동만으로 안 열리고
     새로고침에서 열리면, 진범은 저장이 아니라 「다시 마운트되지 않는 재개 경로」다. */
  if (reloadAfterReopen) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  const callout = page.locator('[data-testid="tour-callout"]');
  const reopened = await callout
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  col.resume = {
    reopened,
    url: page.url(),
    index: reopened ? Number(await callout.getAttribute("data-index")) : null,
    stepId: reopened ? await callout.getAttribute("data-step") : null,
    stored: await page.evaluate(() => window.localStorage.getItem("fkt.tour.v1")),
    // 이어갈 수 있는가 — 화면이 「다른 화면에서 이어집니다」를 말하면서 이동 수단을 주는가
    text: reopened ? (await callout.innerText()).replace(/\s+/g, " ").trim() : null,
    hasGoto: await page.locator('[data-testid="tour-goto"]').count(),
    hasNext: await page.locator('[data-testid="tour-next"]').count(),
    hasAwaitClick: await page.locator('[data-testid="tour-await-click"]').count(),
    spotlight: await page.locator('[data-testid="tour-spotlight"]').count(),
    targetMissingNote: await page.locator('[data-testid="tour-target-missing"]').count(),
  };
  col.verdict = !col.reopenNavigated
    ? "stimulus-missing" // 자극이 안 실렸다 — 이 열은 대상에 대해 아무것도 말하지 않는다
    : col.resume.index === TARGET_STEP
      ? "index-preserved"
      : "index-lost";

  await ctx.close();
  return col;
}

try {
  // 🔴 대상 열은 3회 — 한 번의 「안 열렸다」는 흔들림일 수 있다(비결정은 대상이 말하게 한다).
  for (let n = 1; n <= 3; n += 1) report.columns.push(await runColumn(`target#${n}`, {}));
  // 손잡이 하나만 다른 열: 재개 뒤 새로고침(= 마운트 강제)
  report.columns.push(await runColumn("target-reload", { reloadAfterReopen: true }));
  // 판정력 열: 저장 진행을 0 으로 되돌린다 — 그물이 「그 스텝이 아니다」를 집어야 한다
  report.columns.push(await runColumn("control-step0", { tamperToStep: 0 }));
} finally {
  await browser.close();
}

report.stage = stage;
const targets = report.columns.filter((c) => c.label.startsWith("target#"));
const reload = report.columns.find((c) => c.label === "target-reload");
const control = report.columns.find((c) => c.label === "control-step0");
report.controlDiscriminates = control?.verdict === "index-lost";
report.summary = {
  targetRuns: targets.map((c) => ({ label: c.label, navigated: c.reopenNavigated, tries: c.reopenTries, reopened: c.resume?.reopened, index: c.resume?.index, url: c.resume?.url, stored: c.resume?.stored })),
  targetVerdicts: targets.map((c) => c.verdict),
  reloadColumn: { reopened: reload?.resume?.reopened, index: reload?.resume?.index, stored: reload?.resume?.stored, verdict: reload?.verdict },
  controlResumeIndex: control?.resume?.index ?? null,
  controlDiscriminates: report.controlDiscriminates,
};
const target = targets[0];

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log("--- target resume ---");
console.log(JSON.stringify(target?.resume, null, 2));

// 무대 미구비 = 판정 불가(exit 2) · 대조군이 안 물면 이 측정은 판정력이 없다(exit 2)
if (!stage.entered || !stage.invite || !stage.reachedTarget) {
  console.error("STAGE MISSING", JSON.stringify(stage));
  process.exit(2);
}
if (!report.controlDiscriminates) {
  console.error("CONTROL DID NOT DISCRIMINATE — 이 그물은 판정력이 없다");
  process.exit(2);
}
process.exit(targets.every((c) => c.verdict === "index-preserved") ? 0 : 1);
