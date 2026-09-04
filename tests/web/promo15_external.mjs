/**
 * 승격 15 외부 재검 — 공개면 · **live 1회만** 태운다(D-75 ⓑ 거동 축을 그 한 run 에 묶는다).
 *
 * 🔴 **판정선 정정 접수분**: `/api/health.build` 는 **`879fc35` 유지**가 정답이다 —
 *    ai-api 컨테이너는 이번 승격에서 재생성되지 않았다(app 변경 = `settings.py` 기본값뿐).
 *    「build = main sha」로 재면 승격이 닿았는데도 빨강이 난다. 셸 sha 는 Vercel 배포 meta 소관.
 *
 * 🔴 **live 회차 = 1**. 나머지 축은 전부 live 0 으로 잰다(정적 재생본·문면·헤더·칩·카드).
 *    무대가 안 울리면(`run-mode-badge` 가 live 가 아니거나 GP 접두 불일치) `exit 2` — 캡처도 안 남긴다.
 *
 * usage: node promo15_external.mjs --out o.json --shots DIR [--base https://...] [--expect-build 879fc35]
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
const EXPECT_BUILD = arg("expect-build", "879fc35");
if (!OUT || !SHOTS) {
  console.error("--out 과 --shots 는 필수다");
  process.exit(9);
}

const probe = (page, path) =>
  page.evaluate(async (p) => {
    try {
      const r = await fetch(p, { credentials: "include", headers: { accept: "application/json" } });
      const t = await r.text();
      let j = null;
      try {
        j = JSON.parse(t);
      } catch {
        /* JSON 이 아니면 원문 앞머리만 */
      }
      return { status: r.status, json: j, raw: t.slice(0, 300) };
    } catch (e) {
      return { status: null, error: String(e).slice(0, 200) };
    }
  }, path);

const dismiss = async (page) => {
  for (const sel of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = page.locator(sel);
    if (await l.count()) {
      await l.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
};

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const track = (p) => {
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text().slice(0, 160);
      // WS 404 는 공개면의 기지 사항 — 제외하되 «셌다»는 사실을 남긴다.
      errs.push({ excluded: /ws|websocket/i.test(t), text: t });
    });
    p.on("pageerror", (e) => errs.push({ excluded: false, text: "pageerror: " + String(e).slice(0, 160) }));
  };

  const out = { base: BASE, viewport: "1280x900", wall: new Date().toISOString(), live0: {}, live1: {}, verdict: {} };

  // ═══ live 0 축 ═══════════════════════════════════════════════════════
  const page = await ctx.newPage();
  track(page);
  const nav = await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  // ⓐ 보안 헤더 — 응답에서 그대로 읽는다(문서가 아니라 서버가 말하게).
  const h = nav ? await nav.allHeaders() : {};
  out.live0.headers = {
    csp: (h["content-security-policy"] ?? "").slice(0, 160) || null,
    xcto: h["x-content-type-options"] ?? null,
    referrer: h["referrer-policy"] ?? null,
    permissions: (h["permissions-policy"] ?? "").slice(0, 120) || null,
    hsts: h["strict-transport-security"] ?? null,
  };

  // ⓑ health — 🔴 build 는 `879fc35` «유지» 가 정답이다(정정 판정선).
  out.live0.health = (await probe(page, "/api/health")).json ?? null;

  // ⓒ 앞판 안내 — 닫기 «전» 수를 센다(닫고 세면 언제나 0 이다).
  out.live0.introBefore = await page.locator('[data-testid="intro-card"]').count();
  out.live0.tourInviteBefore = await page.locator('[data-testid="tour-invite"]').count();
  await dismiss(page);

  // ⓓ 정적 재생본 — live 를 태우지 않고 재생 화면을 본다(구독 0).
  const st = await ctx.newPage();
  track(st);
  await st.goto(BASE + "/incidents/INC-2026-014?run=STATIC-GS-01", { waitUntil: "domcontentloaded", timeout: 60000 });
  await st.waitForTimeout(1500);
  out.live0.staticReplay = {
    staticChip: await st.locator('[data-testid="static-visitor-chip"]').count(),
    sessionChip: await st.locator('[data-testid="session-chip"]').count(),
    runModeBadge: (await st.locator('[data-testid="run-mode-badge"]').count())
      ? await st.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode")
      : null,
  };
  if (SHOTS) await st.screenshot({ path: `${SHOTS}/promo15-static-replay-1280.png` }).catch(() => {});
  await st.close();

  // ⓔ D-67 — 390 폭에서 초대 카드가 서는가
  const narrow = await ctx.newPage();
  track(narrow);
  await narrow.setViewportSize({ width: 390, height: 900 });
  await narrow.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await narrow.waitForTimeout(1500);
  const nClose = narrow.locator('[aria-label="안내 닫기"]');
  if (await nClose.count()) {
    await nClose.first().click().catch(() => {});
    await narrow.waitForTimeout(600);
  }
  const inv = narrow.locator('[data-testid="tour-invite"]');
  out.live0.d67card390 = (await inv.count())
    ? await inv.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const body = el.querySelector("div");
        return {
          present: true,
          cardWidth: +r.width.toFixed(1),
          bodyWidth: body ? +body.getBoundingClientRect().width.toFixed(1) : null,
          dir: getComputedStyle(el).flexDirection,
        };
      })
    : { present: false };
  if (SHOTS) await narrow.screenshot({ path: `${SHOTS}/promo15-d67-390.png` }).catch(() => {});
  await narrow.close();

  // ═══ live 1 축 — D-75 ⓑ 를 이 한 run 에 묶는다 ════════════════════════
  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await dismiss(page);

  const startBtn = page.locator('[data-testid="start-from-alarm"]:not([disabled])');
  const enabled = await startBtn
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  out.live1.startEnabled = enabled;
  if (!enabled) {
    out.verdict = { stageRang: false, why: "「조사 시작」이 눌리는 상태가 되지 않았다(cap 소모 0)" };
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    await browser.close();
    console.error("STAGE NOT RANG: " + out.verdict.why);
    process.exit(2);
  }
  /* 🔴 열 ③의 계약 정본은 **POST 응답**이다(rest-api-v0.1.md:34 = `{ runId, incidentId, mode }`).
     화면이 시작하므로 내가 POST 를 칠 수 없다 — 네트워크에서 가로챈다(cap 소모 0). */
  const postRuns = [];
  page.on("response", async (r) => {
    try {
      if (r.request().method() !== "POST") return;
      if (!/\/scenarios\/[^/]+\/runs$/.test(new URL(r.url()).pathname)) return;
      postRuns.push({
        path: new URL(r.url()).pathname,
        status: r.status(),
        json: await r.json().catch(() => null),
      });
    } catch {
      /* 본문을 못 읽으면 흘린다 */
    }
  });
  await startBtn.first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  const rid = (page.url().match(/run=([^&]+)/) || [])[1];
  out.live1.runId = rid ? decodeURIComponent(rid) : null;
  if (!out.live1.runId) {
    out.verdict = { stageRang: false, why: "클릭했으나 URL 에 runId 가 없다" };
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    await browser.close();
    console.error("STAGE NOT RANG: " + out.verdict.why);
    process.exit(2);
  }
  const RID = out.live1.runId;
  const SUFFIX = RID.replace(/^RUN-/, "");

  // 🔴 LIVE 배지는 «문면»이 아니라 `data-mode` 속성으로 묻는다(문면은 늙는다).
  /* 🔴 «요소 0개» 와 «속성이 null» 을 **한 값으로 합치지 않는다** — 합치면 둘이 같은 얼굴이 되고,
     `null` 을 보고 「배지가 없다」인지 「값이 비었다」인지 못 가른다(47대 자수 자리). */
  const earlyCount = await page.locator('[data-testid="run-mode-badge"]').count();
  out.live1.runModeBadgeEarlyCount = earlyCount;
  out.live1.runModeBadgeEarly = earlyCount
    ? await page.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode")
    : null;

  // 완주 — GP 는 완주 시점에 run 상태로 옮겨진다.
  const trail = [];
  for (let i = 0; i < 60; i++) {
    const r = await probe(page, `/api/runs/${encodeURIComponent(RID)}`);
    trail.push({ t: new Date().toISOString(), status: r.status, runStatus: r.json?.status ?? null });
    if (r.status === 200 && ["completed", "failed", "stopped"].includes(r.json?.status)) break;
    if (r.status === 404) break;
    await page.waitForTimeout(2000);
  }
  out.live1.statusTrail = trail;
  out.live1.finalRunStatus = trail[trail.length - 1]?.runStatus ?? null;
  /* 🔴 **배지는 완주 «뒤»에 읽는다**(46대 자수). `{state.mode && ...}` 로 조건부이고
     `state.mode` 는 서버 상태가 닿은 뒤에야 채워진다. 공개면은 WS 가 404 라 폴링으로만 오므로,
     클릭 직후에 읽으면 `null` 이 나온다 — 그것은 «배지가 없다»가 아니라 «내가 일렀다»이다. */
  const badgeCount = await page.locator('[data-testid="run-mode-badge"]').count();
  out.live1.runModeBadgeCount = badgeCount;
  out.live1.runModeBadge = badgeCount
    ? await page.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode")
    : null;
  /* 🔴 **배지 캡처는 여기서 찍는다** — run 은 세션 스코프라 다른 컨텍스트로 같은 URL 을 다시 열면
     `GET /runs/{id}` 가 404 이고 run-console 자체가 안 선다(47대 실측: runApi=404 · live=200).
     즉 «캡처를 나중에 따로» 는 못 하는 자리다. 자극을 태운 이 세션 안에서 남긴다(cap 소모 0). */
  if (SHOTS && badgeCount) {
    await page.locator('[data-testid="run-mode-badge"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${SHOTS}/promo15-run-mode-badge-1280.png` }).catch(() => {});
  }

  /* 열 ③ — **API 가 말하는 mode**. 🔴 계약은 `GET /runs/{id}` 스냅샷을
     `{ status, candidates[], workOrderDraftId? }` 로 적는다 — 거기엔 mode 가 **없다**.
     그러니 세 자리(GET 스냅샷·POST 응답·이벤트 정본)를 다 찍고, 어느 자리가 답했는지를
     «이름»으로 남긴다. 못 잰 것은 안 잰 것과 다르다. */
  const runApi = await probe(page, `/api/runs/${encodeURIComponent(RID)}`);
  out.live1.runApi = {
    status: runApi.status,
    mode: runApi.json?.mode ?? null,
    keys: runApi.json && typeof runApi.json === "object" ? Object.keys(runApi.json).slice(0, 14) : null,
  };
  out.live1.postRuns = postRuns;

  // 완주 이벤트 — 스냅샷이 아니라 이벤트 정본에서 센다.
  const ev = await probe(page, `/api/runs/${encodeURIComponent(RID)}/events`);
  const evList = Array.isArray(ev.json) ? ev.json : (ev.json?.events ?? null);
  out.live1.events = {
    status: ev.status,
    count: Array.isArray(evList) ? evList.length : null,
    types: Array.isArray(evList) ? [...new Set(evList.map((e) => e?.type ?? e?.event ?? null))].slice(0, 12) : null,
    envelopeMode: ev.json && !Array.isArray(ev.json) ? (ev.json.mode ?? null) : null,
    firstEventMode: Array.isArray(evList) && evList.length ? (evList[0]?.mode ?? null) : null,
  };

  await page.waitForTimeout(1200);
  const gpAppeared = await page
    .locator('a[href*="/evidence/GP-"]')
    .first()
    .waitFor({ state: "attached", timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  const gpHrefs = await page
    .locator('a[href*="/evidence/GP-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  out.live1.gpAppeared = gpAppeared;
  out.live1.gpHrefCount = gpHrefs.length;
  const firstId = (gpHrefs[0]?.match(/\/evidence\/(GP-[^/?#]+)/) || [])[1] ?? null;
  out.live1.firstGpId = firstId;
  out.live1.prefixMatch = firstId ? firstId.startsWith(`GP-${SUFFIX}-`) : false;

  if (out.live1.finalRunStatus !== "completed" || !out.live1.prefixMatch) {
    out.verdict = {
      stageRang: false,
      why: `무대 안 울림 — status=${out.live1.finalRunStatus} · firstGp=${firstId} · runId=${RID}`,
    };
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    await browser.close();
    console.error("STAGE NOT RANG: " + out.verdict.why);
    process.exit(2);
  }

  // 🔴 근거는 «목록에서 클릭»해 연다 — fetch 로 연 본문은 그 셸이 그린 것이 아니다.
  /* 🔴 **fetch 자극 대조군 열(D-75 잔여)** — 「화면 클릭이 있어야 GP 가 서는가」를 묻는다.
     그러므로 **클릭 «전»에** 친다. 클릭 뒤에만 치면 자극이 이미 들어간 뒤라 «자극 불요»를
     말할 수 없다. 클릭 «뒤» 열도 함께 남겨 «순서 효과» 자체를 값으로 만든다(같은 run · cap 0). */
  out.live1.gpDirectBeforeClick = await probe(page, `/api/evidence/${encodeURIComponent(firstId)}`);
  out.live1.graphPathsBeforeClick = await probe(page, `/api/graph/paths?byRun=${encodeURIComponent(RID)}`);

  await page.locator(`a[href*="/evidence/${firstId}"]`).first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  const body = page.locator('[data-testid="graph-path-body"]');
  const pageText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  out.live1.gpBody = {
    url: page.url(),
    bodyCount: await body.count(),
    steps: await page.locator('[data-testid="graph-path-steps"] > li').count(),
    walk: (await page.locator('[data-testid="graph-path-walk"]').count())
      ? (await page.locator('[data-testid="graph-path-walk"]').first().innerText()).replace(/\s+/g, " ").trim()
      : null,
    anchorsInBody: (await body.count()) ? await body.locator("a").count() : null,
    unreachable: (pageText.match(/닿지 못했습니다/g) || []).length,
  };
  out.live1.gpDirectAfterClick = await probe(page, `/api/evidence/${encodeURIComponent(firstId)}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/promo15-gp-body-1280.png` }).catch(() => {});

  // ═══ 판정 ═══════════════════════════════════════════════════════════
  const g = out.live1.gpBody;
  const v = {
    stageRang: true,
    runId: RID,
    a_buildHeld: out.live0.health?.build === EXPECT_BUILD,
    b_depsOk:
      out.live0.health?.dependencies?.postgres?.state === "ok" &&
      out.live0.health?.dependencies?.neo4j?.state === "ok",
    c_embeddingReady: out.live0.health?.models?.embedding === "ready",
    /* 🔴 `staticChip` 은 여기서 판정하지 않는다 — 이 컨텍스트는 앞서 `/overview` 를
       열어 세션이 있고, 그 칩은 **세션 없는 방문자**에게만 선다(46대 자수 · 두 열 대조는
       `promo15_static_chip.mjs`). 여기서는 «재생 화면이 섬»을 배지로 묻는다. */
    d_staticReplayBadge: out.live0.staticReplay.runModeBadge === "replay",
    e_headers:
      Boolean(out.live0.headers.csp) &&
      out.live0.headers.xcto === "nosniff" &&
      Boolean(out.live0.headers.referrer),
    f_d67card390: out.live0.d67card390.present === true,
    g_liveBadge: out.live1.runModeBadge === "live",
    h_gpBodyPresent: g.bodyCount === 1,
    i_stepsAtLeast2: g.steps >= 2,
    j_walkNonEmpty: Boolean(g.walk),
    k_noAnchorsInBody: g.anchorsInBody === 0,
    l_noUnreachable: g.unreachable === 0,
    m_eventsCounted: typeof out.live1.events.count === "number" && out.live1.events.count > 0,
    n_consoleErrorsNonWs: errs.filter((e) => !e.excluded).length === 0,
  };
  v.d75b_pass = v.h_gpBodyPresent && v.i_stepsAtLeast2 && v.j_walkNonEmpty && v.k_noAnchorsInBody && v.l_noUnreachable;

  /* ── 발주 A 축 ─────────────────────────────────────────────────────────
     🔴 새 축을 a~n 에 섞지 않는다 — `allPass` 는 «승격 15 재검»의 이름이고, 축을 넓히면
     그 초록의 뜻이 조용히 바뀐다. 별도 군으로 두고 exit 만 둘을 함께 본다. */
  const apiModeVal = out.live1.runApi.mode ?? out.live1.postRuns?.[0]?.json?.mode ?? out.live1.events.envelopeMode ?? null;
  const apiModeSrc =
    out.live1.runApi.mode != null
      ? "GET /runs/{id}"
      : out.live1.postRuns?.[0]?.json?.mode != null
        ? "POST /scenarios/{id}/runs"
        : out.live1.events.envelopeMode != null
          ? "GET /runs/{id}/events (envelope)"
          : "없음 — 세 자리 모두 mode 를 내지 않았다";
  v.badge = {
    col1_early: out.live1.runModeBadgeEarly,
    col1_earlyElementCount: out.live1.runModeBadgeEarlyCount,
    col2_elementCount: out.live1.runModeBadgeCount,
    col2_afterFinish: out.live1.runModeBadge,
    col3_api: apiModeVal,
    col3_source: apiModeSrc,
    earlyDiffers: out.live1.runModeBadgeEarly !== out.live1.runModeBadge,
    pass: out.live1.runModeBadge === "live" && apiModeVal === "live",
  };
  v.fetchCtl = {
    gpBeforeClick: out.live1.gpDirectBeforeClick?.status ?? null,
    gpAfterClick: out.live1.gpDirectAfterClick?.status ?? null,
    graphPathsBeforeClick: out.live1.graphPathsBeforeClick?.status ?? null,
    orderEffect: (out.live1.gpDirectBeforeClick?.status ?? null) !== (out.live1.gpDirectAfterClick?.status ?? null),
  };
  v.allPass = Object.entries(v)
    .filter(([k]) => /^[a-n]_/.test(k))
    .every(([, val]) => val === true);
  out.verdict = v;
  out.consoleErrors = errs.slice(0, 20);

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(
    `build=${out.live0.health?.build} badge=${out.live1.runModeBadge} gp=${g.bodyCount}/${g.steps} ` +
      `events=${out.live1.events.count} errs=${errs.filter((e) => !e.excluded).length} ` +
      `| badge early=${v.badge.col1_early} after=${v.badge.col2_afterFinish} api=${v.badge.col3_api} (${v.badge.col3_source}) ` +
      `| gpDirect before=${v.fetchCtl.gpBeforeClick} after=${v.fetchCtl.gpAfterClick} paths=${v.fetchCtl.graphPathsBeforeClick} ` +
      `=> D75b=${v.d75b_pass ? "PASS" : "FAIL"} badge=${v.badge.pass ? "PASS" : "FAIL"} all=${v.allPass ? "PASS" : "FAIL"}`,
  );
  process.exit(v.allPass && v.badge.pass ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
