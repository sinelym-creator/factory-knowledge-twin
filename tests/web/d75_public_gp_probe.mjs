/**
 * D-75 원인 실측 — 공개면 GP 근거 404 가 «저장 자리»인가 «수명 자리»인가.
 *
 * 🔴 **live 조사는 «한 번»만 태운다**(공개면 cap 5). 그래서 한 회차 안에서 세 표면을 모두 찍는다.
 * 🔴 **무대 울림**(안 울리면 exit 2):
 *      ① run 이 실제로 섰다(runId 확보) · ② `mode === "live"`(O-16 = 재생본 배제) ·
 *      ③ GP id 접두가 그 runId 접미와 «일치»한다.
 *
 * 🔴 **404 는 세 갈래를 못 가른다**(대상 코드 `routers/knowledge.py::_graph_path_evidence`):
 *      (a) record 자체가 없다(수명/소유권) · (b) record 는 있는데 `graphPaths` 가 비었다(저장)
 *      (c) `graphPaths` 는 있는데 evidenceId 가 안 맞는다(산식).
 *    그래서 `/evidence/GP-*` 하나로 판정하지 않고 **같은 회차에** 두 열을 더 세운다:
 *      · `GET /runs/{id}`         → record 생존 여부        → (a) 를 가른다
 *      · `GET /graph/paths?byRun` → `record.graphPaths` 원본 → (b)/(c) 를 가른다
 *        (대상 코드가 이 라우트에서 `record.graphPaths` 를 그대로 낸다)
 *
 * 🔴 **수명 축은 «두 시점»으로만 잰다** — 완주 «즉시»와 그 뒤 한 번. 한 시점은 「지나가는 상태」와
 *    「끝내 그 상태」를 못 가른다.
 *
 * usage: node d75_public_gp_probe.mjs --base https://... --out o.json [--shots DIR] [--settle 12000]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://factory-knowledge-twin.vercel.app");
const OUT = arg("out");
const SHOTS = arg("shots", null);
const SETTLE = Number(arg("settle", "12000"));
if (!OUT) {
  console.error("--out 은 필수다");
  process.exit(9);
}

/** 페이지의 세션·쿠키로 같은 오리진을 친다 — 밖에서 만든 fetch 는 그 셸의 것이 아니다. */
const probe = (page, path) =>
  page.evaluate(async (p) => {
    const t0 = performance.now();
    try {
      const r = await fetch(p, { credentials: "include", headers: { accept: "application/json" } });
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* 본문이 JSON 이 아니면 원문 앞머리로만 남긴다 */
      }
      return { path: p, status: r.status, ms: Math.round(performance.now() - t0), json, raw: text.slice(0, 400) };
    } catch (e) {
      return { path: p, status: null, ms: Math.round(performance.now() - t0), error: String(e).slice(0, 200) };
    }
  }, path);

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));

  const out = { base: BASE, wall: new Date().toISOString(), stage: {}, columns: {}, verdict: {} };

  // --- 무대 증인 ---------------------------------------------------------
  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  out.stage.health = (await probe(page, "/api/health")).json ?? null;

  // 투어·안내를 먼저 걷는다 — 살아 있으면 알람의 「조사 시작」이 오버레이에 intercept 된다.
  for (const sel of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = page.locator(sel);
    if (await l.count()) {
      await l.first().click().catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  out.stage.tourStillOpen = await page
    .locator('[data-testid="tour-invite"], [data-testid="tour-spotlight"], [data-testid="tour-callout"]')
    .count();

  // --- live run 1회 — 화면 「조사 시작」 클릭 ------------------------------
  // 🔴 이 버튼은 «알람 목록 안»에 있고 그 데이터는 브라우저가 직접 부른다(overview page.tsx).
  //    게다가 세션이 API 로 발급되기 전에는 `disabled` 다 — 고정 대기로는 「없다」가 찍힌다.
  //    그래서 **눌리는 상태가 될 때까지** 기다린다. 못 기다리면 cap 소모 0 으로 exit 2.
  const startBtn = page.locator('[data-testid="start-from-alarm"]:not([disabled])');
  out.stage.waitedForEnabled = await startBtn
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  out.stage.startCountAny = await page.locator('[data-testid="start-from-alarm"]').count();
  out.stage.startCount = await startBtn.count();
  if (out.stage.startCount === 0) {
    out.verdict.stageRang = false;
    out.verdict.why =
      `「조사 시작」이 눌리는 상태가 되지 않았다(총 ${out.stage.startCountAny} 개 · enabled 0)` +
      " — live 를 태우지 않았다(cap 소모 0)";
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    await browser.close();
    console.error("STAGE NOT RANG: " + out.verdict.why);
    process.exit(2);
  }
  await startBtn.first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  out.stage.landedUrl = page.url();
  const runIdRaw = (page.url().match(/run=([^&]+)/) || [])[1] ?? null;
  out.stage.runId = runIdRaw ? decodeURIComponent(runIdRaw) : null;
  if (!out.stage.runId) {
    out.verdict.stageRang = false;
    out.verdict.why = "클릭했으나 URL 에 runId 가 없다 — live 는 태웠는데 무대를 못 찍었다";
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    await browser.close();
    console.error("STAGE NOT RANG: " + out.verdict.why);
    process.exit(2);
  }
  const RID = out.stage.runId;
  const SUFFIX = RID.replace(/^RUN-/, "");

  // --- 완주까지 폴링 — graphPaths 는 완주 시점에 record 로 옮겨진다(runner.py) ---
  const statusTrail = [];
  let completed = false;
  for (let i = 0; i < 60; i++) {
    const r = await probe(page, `/api/runs/${encodeURIComponent(RID)}`);
    statusTrail.push({ t: new Date().toISOString(), status: r.status, runStatus: r.json?.status ?? null });
    if (r.status === 200 && ["completed", "failed", "stopped"].includes(r.json?.status)) {
      completed = true;
      out.stage.runRecordAtDone = r.json;
      break;
    }
    if (r.status === 404) break; // record 가 폴링 중에 사라졌다 — 그 자체가 관측이다
    await page.waitForTimeout(2000);
  }
  out.stage.statusTrail = statusTrail;
  out.stage.completed = completed;
  out.stage.mode = out.stage.runRecordAtDone?.mode ?? null;

  // --- 화면이 낸 GP id (대상이 부르게 한다 — 지어낸 id 가 아니다) ---------
  await page.waitForTimeout(1200);
  const gpHrefs = await page
    .locator('a[href*="/evidence/GP-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  out.stage.screenGpHrefs = gpHrefs.slice(0, 10);
  out.stage.evidenceLinkCount = await page.locator('a[href*="/evidence/"]').count();
  const screenGpId = (gpHrefs[0]?.match(/\/evidence\/(GP-[^/?#]+)/) || [])[1] ?? null;
  out.stage.screenGpId = screenGpId;
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/d75-run-after-complete.png` }).catch(() => {});

  // 🔴 무대 울림 ③ — GP id 접두 일치. 화면 id 가 있으면 그것으로, 없으면 산식으로 세운다.
  const derivedGpId = `GP-${SUFFIX}-00`;
  out.stage.derivedGpId = derivedGpId;
  out.stage.prefixMatch = screenGpId !== null ? screenGpId.startsWith(`GP-${SUFFIX}-`) : null; // null = 화면 표지 0건

  // --- 열 A/B/C — 완주 «즉시» / 그 뒤 --------------------------------------
  const sweep = async (label) => {
    const col = { at: new Date().toISOString() };
    col.run = await probe(page, `/api/runs/${encodeURIComponent(RID)}`);
    col.graphPaths = await probe(page, `/api/graph/paths?byRun=${encodeURIComponent(RID)}`);
    col.evidenceDerived = await probe(page, `/api/evidence/${derivedGpId}`);
    if (screenGpId && screenGpId !== derivedGpId) {
      col.evidenceScreen = await probe(page, `/api/evidence/${screenGpId}`);
    }
    out.columns[label] = col;
    return col;
  };
  const now = await sweep("immediate");
  await page.waitForTimeout(SETTLE);
  const later = await sweep("after_settle");

  // --- 판정 ---------------------------------------------------------------
  const gpArr = Array.isArray(now.graphPaths.json) ? now.graphPaths.json : null;
  // 🔴 **O-16 배제는 `mode` 필드로 하지 않는다** — `GET /runs/{id}` 응답에 그 키가 없다
  //    (실측 키 = status·candidates·workOrderDraftId). 없는 키를 축으로 삼으면 무대가 실제로
  //    울린 회차도 `mode=null` 로 「안 울림」이 된다(46대 1차 자수). 재생본이면 GP id 접두가
  //    «녹화 run» 의 것이므로, **화면이 낸 GP id 의 접두가 이 runId 접미와 같은가**가 축이다.
  out.verdict.prefixMatch = out.stage.prefixMatch;
  out.verdict.stageRang = Boolean(RID) && out.stage.completed && out.stage.prefixMatch === true;
  out.verdict.runAlive_immediate = now.run.status === 200;
  out.verdict.runAlive_after = later.run.status === 200;
  out.verdict.graphPathsStatus_immediate = now.graphPaths.status;
  out.verdict.graphPathsLen_immediate = gpArr ? gpArr.length : null;
  out.verdict.graphPathsIds_immediate = gpArr ? gpArr.map((p) => p?.evidenceId ?? null).slice(0, 10) : null;
  out.verdict.evidenceStatus_immediate = now.evidenceDerived.status;
  out.verdict.evidenceStatus_after = later.evidenceDerived.status;

  if (!out.verdict.stageRang) {
    out.verdict.call = "STAGE_NOT_RANG";
  } else if (now.run.status !== 200) {
    out.verdict.call = "LIFETIME"; // record 자체가 즉시에도 없다
  } else if (now.evidenceDerived.status === 200) {
    // 🔴 두 시점 모두 200 이면 이 배포본에서는 «저장»도 «수명»도 아니다 — 증상의 조건이
    //    이 회차 밖에 있다는 뜻이고, 그때는 «언제의 배포본이 그 증상을 냈는가»를 물어야 한다.
    out.verdict.call = later.evidenceDerived.status === 200 ? "NO_REPRO_ON_THIS_BUILD" : "LIFETIME";
  } else if (gpArr !== null && gpArr.length === 0) {
    out.verdict.call = "STORAGE"; // record 는 사는데 graphPaths 가 비었다
  } else if (gpArr !== null && gpArr.length > 0) {
    out.verdict.call = "ID_FORMULA"; // 저장은 됐는데 그 id 로 못 찾는다
  } else {
    out.verdict.call = "UNRESOLVED_SEE_COLUMNS";
  }
  out.consoleErrors = errs.slice(0, 20);

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(
    `runId=${RID} mode=${out.stage.mode} completed=${out.stage.completed} ` +
      `run=${now.run.status}/${later.run.status} paths=${now.graphPaths.status}(len=${out.verdict.graphPathsLen_immediate}) ` +
      `evidence=${now.evidenceDerived.status}/${later.evidenceDerived.status} => ${out.verdict.call}`,
  );
  if (!out.verdict.stageRang) process.exit(2);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
