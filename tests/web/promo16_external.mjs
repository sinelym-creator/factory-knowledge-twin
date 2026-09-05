/**
 * 승격 16 외부 재검 — 공개면 · **live 1회만** 태운다.
 *
 * 축 = 오케 발주(03:15:53) ① D-79(cap 0) ② D-78 + LIVE 배지 캡처(live 1) ③ 회귀 감시(cap 0).
 * 🔴 D-81(초점 트랩)은 main 에 없다(승격 17 대상) — 이 그물은 그 축을 묻지 않는다.
 *
 * 🔴 **밖의 근거는 연결 IP 다** — 공개 URL 을 쳤다는 사실은 증거가 아니다(tailnet self 로 붙을 수 있다).
 *    셸에서 `curl -w %{remote_ip}` 로 먼저 찍고 그 값을 `--remote-ip` 로 받아 판정문에 함께 남긴다.
 *    브라우저에서는 응답 헤더(`server`·`x-vercel-id`)와 **Tailscale 헤더 부재**로 교차한다.
 * 🔴 `/api/health.build` 는 **`879fc35` 유지**가 정답이다(ai-api 컨테이너는 승격에 재생성되지 않는다).
 *    셸(Vercel) 배포 sha 는 이 응답이 말하지 않는다 — O-18 은 배포 meta 로 따로 잰다.
 * 🔴 **셀렉터에 `data-at-end` 를 넣지 않는다**(D-78 계보) — 그 속성은 처방이 «만든» 것이라
 *    선택자에 넣으면 처방이 있어야만 도는 그물이 된다. 클릭은 `replay-play` 로 하고, `data-at-end`
 *    는 **값으로 읽어** 남긴다.
 * 🔴 레일과 드로어는 **같은 `data-testid`** 를 쓴다 — 가르는 축은 `data-nav-variant` 뿐이다.
 *    폭 축마다 그 값으로 좁혀 세지 않으면 «숨은 쪽»을 함께 센다.
 * 🔴 무대가 안 울리면 색을 내지 않는다 — `exit 2`.
 *
 * usage: node promo16_external.mjs --out o.json --shots DIR [--base https://...]
 *        [--expect-build 879fc35] [--remote-ip 64.29.17.195] [--period 220]
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
const REMOTE_IP = arg("remote-ip", null);
const PERIOD = Number(arg("period", "220"));
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
      try { j = JSON.parse(t); } catch { /* JSON 이 아니면 원문 앞머리만 */ }
      return { status: r.status, json: j, raw: t.slice(0, 200) };
    } catch (e) {
      return { status: null, error: String(e).slice(0, 200) };
    }
  }, path);

const dismiss = async (p) => {
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(400); }
  }
};

const rect = async (p, sel) => {
  const l = p.locator(sel);
  if (!(await l.count())) return null;
  return l.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  });
};

const readCur = async (p) => {
  const c = p.locator('[data-testid="replay-cursor"]');
  if (!(await c.count())) return { applied: null, total: null };
  return {
    applied: Number(await c.first().getAttribute("data-applied")),
    total: Number(await c.first().getAttribute("data-total")),
  };
};
const readPlay = async (p) => {
  const b = p.locator('[data-testid="replay-play"]');
  if (!(await b.count())) return { present: false, atEnd: null, label: null };
  return {
    present: true,
    atEnd: await b.first().getAttribute("data-at-end"),
    label: (await b.first().innerText()).replace(/\s+/g, " ").trim(),
  };
};
/** 전이는 한 점으로 못 잡는다 — 주기보다 촘촘히 훑고 자취를 남긴다. */
const waitApplied = async (p, pred, budgetMs) => {
  const t0 = Date.now();
  const trail = [];
  while (Date.now() - t0 < budgetMs) {
    const c = await readCur(p);
    trail.push({ ms: Date.now() - t0, applied: c.applied });
    if (pred(c.applied)) return { hit: true, ms: Date.now() - t0, applied: c.applied, trailLen: trail.length, trail: trail.slice(-8) };
    await p.waitForTimeout(40);
  }
  const c = await readCur(p);
  return { hit: false, ms: Date.now() - t0, applied: c.applied, trailLen: trail.length, trail: trail.slice(-8) };
};

const out = {
  base: BASE, wall: new Date().toISOString(), shellRemoteIp: REMOTE_IP,
  gate: {}, ax3: {}, ax1: {}, ax2static: {}, ax2live: {}, verdict: {},
};
const errs = [];
const track = (p) => {
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 160);
    errs.push({ excluded: /ws|websocket|wss:/i.test(t), text: t });
  });
  p.on("pageerror", (e) => errs.push({ excluded: false, text: "pageerror: " + String(e).slice(0, 160) }));
};

const die = async (browser, why) => {
  out.verdict = { stageRang: false, why };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.error("STAGE NOT RANG: " + why);
  process.exit(2);
};

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // ═══ 전제 게이트 — 이게 초록이라야 cap 을 태운다 ═════════════════════════
  const page = await ctx.newPage();
  track(page);
  const nav = await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const h = nav ? await nav.allHeaders() : {};
  out.gate.respHeaders = {
    server: h["server"] ?? null,
    xVercelId: (h["x-vercel-id"] ?? "").slice(0, 60) || null,
    tailscaleKeys: Object.keys(h).filter((k) => /tailscale/i.test(k)),
  };
  out.gate.health = (await probe(page, "/api/health")).json ?? null;
  out.gate.buildHeld = out.gate.health?.build === EXPECT_BUILD;
  if (!out.gate.health || !out.gate.buildHeld) {
    return die(browser, `전제 미충족 — health.build=${out.gate.health?.build} (기대 ${EXPECT_BUILD})`);
  }

  // ═══ 축 ③ 회귀 감시(cap 0) ═══════════════════════════════════════════════
  out.ax3.headers = {
    csp: (h["content-security-policy"] ?? "").slice(0, 120) || null,
    xcto: h["x-content-type-options"] ?? null,
    referrer: h["referrer-policy"] ?? null,
    hsts: h["strict-transport-security"] ?? null,
  };
  out.ax3.deps = {
    postgres: out.gate.health?.dependencies?.postgres?.state ?? null,
    neo4j: out.gate.health?.dependencies?.neo4j?.state ?? null,
    embedding: out.gate.health?.models?.embedding ?? null,
  };
  const ls = await probe(page, "/api/live/status");
  out.ax3.liveStatus = { status: ls.status, online: ls.json?.online ?? null };

  // ═══ 축 ① D-79 (cap 0) ═════════════════════════════════════════════════
  const NAVV = (v) => `[data-nav-variant="${v}"]`;
  const widthCol = async (w) => {
    const p = await ctx.newPage();
    track(p);
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(1200);
    await dismiss(p);
    const col = { w };
    col.appBar = await rect(p, '[data-testid="app-bar"]');
    col.brand = await rect(p, '[data-testid="app-brand"]');
    col.brandText = (await p.locator('[data-testid="app-brand"]').first().innerText()).replace(/\s+/g, " ").trim();
    col.statusRow = await rect(p, '[data-testid="app-status-row"]');
    // 🔴 «새 줄»은 두 사각형의 관계다 — 좁은 폭에서만 아래로 내려가야 한다(넓은 폭 = 같은 줄 = 대조군).
    col.statusRowNewLine = col.statusRow && col.brand ? col.statusRow.top >= col.brand.bottom : null;
    col.buttons = {
      tour: await p.locator('[data-testid="intro-reopen"]').count(),
      reset: await p.locator('[data-testid="reset-button"]').count(),
    };
    col.toggleCount = await p.locator('[data-testid="nav-menu-toggle"]').count();
    col.toggleVisible = col.toggleCount ? await p.locator('[data-testid="nav-menu-toggle"]').first().isVisible() : false;
    col.railLinksVisible = await p.locator(`${NAVV("rail")}:visible`).count();
    col.drawerBeforeOpen = await p.locator('[data-testid="nav-drawer"]').count();
    col.overflow = await p.evaluate(() => {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, overflowPx: d.scrollWidth - d.clientWidth };
    });
    if (SHOTS && w === 390) await p.screenshot({ path: `${SHOTS}/promo16-d79-390-closed.png` }).catch(() => {});
    return { p, col };
  };

  const w390 = await widthCol(390);
  const w768 = await widthCol(768);
  const w1280 = await widthCol(1280);
  out.ax1.cols = { w390: w390.col, w768: w768.col, w1280: w1280.col };

  // 드로어 — 390 에서만. 🔴 열림 1 / 닫힘 3갈래 각 1회 + 매번 재개방.
  const p3 = w390.p;
  const open = async () => {
    await p3.locator('[data-testid="nav-menu-toggle"]').first().click();
    await p3.waitForTimeout(450);
    const d = p3.locator('[data-testid="nav-drawer"]');
    const cnt = await d.count();
    return {
      count: cnt,
      role: cnt ? await d.first().getAttribute("role") : null,
      ariaModal: cnt ? await d.first().getAttribute("aria-modal") : null,
      links: await p3.locator(`${NAVV("drawer")}`).count(),
      linkIds: await p3.locator(`${NAVV("drawer")}`).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))),
      scrim: await p3.locator('[data-testid="nav-drawer-scrim"]').count(),
      shellInert: await p3.evaluate(() => {
        const r = document.querySelector('[data-testid="app-bar"]')?.closest("[inert]");
        return { anyInert: document.querySelectorAll("[inert]").length, barInsideInert: Boolean(r) };
      }),
    };
  };
  const closedCount = async () => {
    await p3.waitForTimeout(450);
    return p3.locator('[data-testid="nav-drawer"]').count();
  };

  out.ax1.drawer = { openings: [], closes: {} };
  const o1 = await open();
  out.ax1.drawer.openings.push(o1);
  if (SHOTS) await p3.screenshot({ path: `${SHOTS}/promo16-d79-390-open.png` }).catch(() => {});

  // ⓐ Esc
  await p3.keyboard.press("Escape");
  out.ax1.drawer.closes.esc = { after: await closedCount() };
  out.ax1.drawer.openings.push(await open());
  // ⓑ 스크림 클릭
  /* 🔴 **가운데를 누르면 안 된다** — 스크림은 `inset-0`(뷰포트 전체)이고 드로어 패널이 그 위
     왼쪽을 덮는다. 기본 클릭은 «요소 중앙»이라 390 에서 x≈195 가 드로어 안이고, Playwright 가
     「drawer intercepts pointer events」로 30초를 태운다(1차 실행 실측 · 대상 결함 아님 · 내 자수).
     사람이 실제로 누르는 자리는 «어두운 여백»이므로 패널 밖 좌표를 지정해 누른다. */
  out.ax1.drawer.scrimGeom = {
    scrim: await rect(p3, '[data-testid="nav-drawer-scrim"]'),
    panel: await rect(p3, '[data-testid="nav-drawer"]'),
  };
  const panelRight = out.ax1.drawer.scrimGeom.panel?.left + (out.ax1.drawer.scrimGeom.panel?.w ?? 0);
  const clickX = Math.min(370, Math.max(panelRight + 20, 300));
  out.ax1.drawer.scrimClickAt = { x: clickX, y: 450, panelRight };
  await p3.locator('[data-testid="nav-drawer-scrim"]').first().click({ position: { x: clickX, y: 450 } });
  out.ax1.drawer.closes.scrim = { after: await closedCount() };
  out.ax1.drawer.openings.push(await open());
  // ⓒ 링크 클릭 — 닫히고 «이동»한다. 이동 뒤 그 화면에서 재개방까지 본다.
  await p3.locator(`${NAVV("drawer")}[data-testid="nav-incidents"]`).first().click();
  await p3.waitForLoadState("domcontentloaded");
  await p3.waitForTimeout(1200);
  out.ax1.drawer.closes.link = { after: await p3.locator('[data-testid="nav-drawer"]').count(), url: p3.url() };
  await dismiss(p3); // 이동한 화면에 안내가 서면 토글을 가린다 — 재개방 축이 내 탓으로 죽지 않게.
  out.ax1.drawer.reopenAfterNav = await open();
  await p3.keyboard.press("Escape");
  await p3.waitForTimeout(300);
  out.ax1.drawer.inertCleared = await p3.evaluate(() => document.querySelectorAll("[inert]").length);

  await w768.p.close();
  await w1280.p.close();
  await p3.close();

  // ═══ 축 ②-a 정적 재생본(cap 0) — 동형 1회 ═══════════════════════════════
  const st = await ctx.newPage();
  track(st);
  await st.goto(BASE + "/incidents/INC-2026-014?run=STATIC-GS-01", { waitUntil: "domcontentloaded", timeout: 60000 });
  await st.waitForTimeout(2000);
  await dismiss(st);
  out.ax2static.badge = (await st.locator('[data-testid="run-mode-badge"]').count())
    ? await st.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode")
    : null;
  out.ax2static.before = { cur: await readCur(st), play: await readPlay(st) };
  if (out.ax2static.before.play.present) {
    const t0 = Date.now();
    await st.locator('[data-testid="replay-play"]').first().click();
    const total = out.ax2static.before.cur.total;
    out.ax2static.toOne = await waitApplied(st, (a) => a !== null && a >= 1 && a < total, 6000);
    out.ax2static.rewound = out.ax2static.toOne.trail.some((x) => x.applied !== null && x.applied < total);
    out.ax2static.toEnd = await waitApplied(st, (a) => a === total, total * PERIOD + 8000);
    out.ax2static.totalMs = Date.now() - t0;
    out.ax2static.after = { cur: await readCur(st), play: await readPlay(st) };
  }
  await st.close();

  // ═══ 축 ②-b 라이브 1회(cap 1) — 마지막에 태운다 ═════════════════════════
  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await dismiss(page);
  const startBtn = page.locator('[data-testid="start-from-alarm"]:not([disabled])');
  const enabled = await startBtn.first().waitFor({ state: "visible", timeout: 45000 }).then(() => true).catch(() => false);
  out.ax2live.startEnabled = enabled;
  if (!enabled) return die(browser, "「조사 시작」이 눌리는 상태가 되지 않았다(cap 소모 0)");

  await startBtn.first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  const rid = (page.url().match(/run=([^&]+)/) || [])[1];
  out.ax2live.runId = rid ? decodeURIComponent(rid) : null;
  if (!out.ax2live.runId) return die(browser, "클릭했으나 URL 에 runId 가 없다");
  const RID = out.ax2live.runId;

  // 완주까지 — 상태 자취를 남긴다.
  const trail = [];
  for (let i = 0; i < 75; i++) {
    const r = await probe(page, `/api/runs/${encodeURIComponent(RID)}`);
    trail.push({ ms: i * 2000, status: r.status, runStatus: r.json?.status ?? null });
    if (r.status === 200 && ["completed", "failed", "stopped"].includes(r.json?.status)) break;
    if (r.status === 404) break;
    await page.waitForTimeout(2000);
  }
  out.ax2live.statusTrail = trail.slice(-6);
  out.ax2live.finalRunStatus = trail[trail.length - 1]?.runStatus ?? null;
  // 🔴 배지는 완주 «뒤»에 읽는다 — 공개면은 WS 404 라 폴링으로만 상태가 온다.
  const bc = await page.locator('[data-testid="run-mode-badge"]').count();
  out.ax2live.badgeCount = bc;
  out.ax2live.badgeMode = bc ? await page.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode") : null;
  // 🔴 배지 캡처는 «이 세션 안»에서만 가능하다(run 은 세션 스코프 · 다른 컨텍스트로 열면 404).
  if (SHOTS && bc) {
    await page.locator('[data-testid="run-mode-badge"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${SHOTS}/promo16-live-badge-1280.png` }).catch(() => {});
  }
  if (out.ax2live.finalRunStatus !== "completed") {
    return die(browser, `완주하지 않았다 — status=${out.ax2live.finalRunStatus} · run=${RID}`);
  }

  // D-78 자극 — 완주 상태에서 실클릭.
  out.ax2live.before = { cur: await readCur(page), play: await readPlay(page) };
  const total = out.ax2live.before.cur.total;
  if (!out.ax2live.before.play.present || !total) {
    return die(browser, `재생 손잡이가 없다 — play=${JSON.stringify(out.ax2live.before.play)} cur=${JSON.stringify(out.ax2live.before.cur)}`);
  }
  const t0 = Date.now();
  await page.locator('[data-testid="replay-play"]').first().click();
  out.ax2live.toOne = await waitApplied(page, (a) => a !== null && a >= 1 && a < total, 6000);
  out.ax2live.rewound = out.ax2live.toOne.trail.some((x) => x.applied !== null && x.applied < total);
  out.ax2live.toEnd = await waitApplied(page, (a) => a === total, total * PERIOD + 10000);
  out.ax2live.totalMs = Date.now() - t0;
  out.ax2live.after = { cur: await readCur(page), play: await readPlay(page) };

  // ═══ 판정 ═══════════════════════════════════════════════════════════════
  const A = out.ax1, C = out.ax1.cols, D = out.ax1.drawer;
  const v = {
    stageRang: true,
    // 축 ③
    c1_deps2of2: out.ax3.deps.postgres === "ok" && out.ax3.deps.neo4j === "ok",
    c2_headers: Boolean(out.ax3.headers.csp) && out.ax3.headers.xcto === "nosniff" && Boolean(out.ax3.headers.referrer),
    c3_liveOnline: out.ax3.liveStatus.online === true,
    // 축 ① D-79
    a1_bar390: C.w390.toggleVisible === true && C.w390.buttons.tour === 1 && C.w390.buttons.reset === 1 && /^Factory Twin$/.test(C.w390.brandText),
    a2_statusRowNewLine390: C.w390.statusRowNewLine === true,
    a3_statusRowSameLine1280: C.w1280.statusRowNewLine === false,
    a4_drawerDialog: D.openings.every((o) => o.count === 1 && o.role === "dialog" && o.ariaModal === "true"),
    a5_drawerLinks3: D.openings.every((o) => o.links === 3),
    a6_closeEsc: D.closes.esc.after === 0,
    a7_closeScrim: D.closes.scrim.after === 0,
    a8_closeLink: D.closes.link.after === 0 && /\/incidents\//.test(D.closes.link.url),
    a9_reopenAfterNav: D.reopenAfterNav.count === 1 && D.reopenAfterNav.links === 3,
    a10_inertCleared: A.drawer.inertCleared === 0,
    a11_rail768: C.w768.railLinksVisible === 3 && C.w768.toggleVisible === false,
    a12_rail1280: C.w1280.railLinksVisible === 3 && C.w1280.toggleVisible === false,
    a13_noOverflow: [C.w390, C.w768, C.w1280].every((c) => c.overflow.overflowPx <= 0),
    // 축 ② D-78
    b1_liveBadge: out.ax2live.badgeMode === "live",
    b2_liveAtEndBefore: out.ax2live.before.play.atEnd === "true",
    b3_liveRewound: out.ax2live.rewound === true && out.ax2live.toOne.hit === true,
    b4_liveReachedEnd: out.ax2live.toEnd.hit === true,
    b5_staticRewound: out.ax2static.rewound === true && out.ax2static.toOne?.hit === true,
    b6_staticReachedEnd: out.ax2static.toEnd?.hit === true,
    b7_staticBadgeReplay: out.ax2static.badge === "replay",
    // 콘솔
    n_consoleErrorsNonWs: errs.filter((e) => !e.excluded).length === 0,
  };
  v.consoleCounts = { real: errs.filter((e) => !e.excluded).length, excludedWs: errs.filter((e) => e.excluded).length };
  v.outsideEvidence = {
    shellRemoteIp: REMOTE_IP,
    server: out.gate.respHeaders.server,
    xVercelId: out.gate.respHeaders.xVercelId,
    tailscaleHeaderKeys: out.gate.respHeaders.tailscaleKeys,
  };
  v.measured = {
    liveRunId: RID, liveTotal: total,
    liveClickToOneMs: out.ax2live.toOne.ms, liveToEndMs: out.ax2live.toEnd.ms, liveTotalMs: out.ax2live.totalMs,
    staticTotal: out.ax2static.before?.cur?.total ?? null,
    staticClickToOneMs: out.ax2static.toOne?.ms ?? null, staticToEndMs: out.ax2static.toEnd?.ms ?? null,
  };
  v.allPass = Object.entries(v).filter(([k]) => /^([abc]\d+|n)_/.test(k)).every(([, val]) => val === true);
  v.fails = Object.entries(v).filter(([k, val]) => /^([abc]\d+|n)_/.test(k) && val !== true).map(([k]) => k);
  out.verdict = v;
  out.consoleErrors = errs.slice(0, 20);

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(
    `remote_ip=${REMOTE_IP} build=${out.gate.health?.build} badge=${out.ax2live.badgeMode} ` +
      `d79[390 bar=${v.a1_bar390} newline=${v.a2_statusRowNewLine390} closes=${v.a6_closeEsc}/${v.a7_closeScrim}/${v.a8_closeLink}] ` +
      `rail[768=${v.a11_rail768} 1280=${v.a12_rail1280}] overflow=${v.a13_noOverflow} ` +
      `d78[live rewound=${out.ax2live.rewound} toOne=${out.ax2live.toOne.ms}ms toEnd=${out.ax2live.toEnd.ms}ms hit=${out.ax2live.toEnd.hit} | ` +
      `static rewound=${out.ax2static.rewound} toEnd=${out.ax2static.toEnd?.ms}ms] ` +
      `errs=${v.consoleCounts.real}(ws ${v.consoleCounts.excludedWs}) => ${v.allPass ? "PASS" : "FAIL: " + v.fails.join(",")}`,
  );
  process.exit(v.allPass ? 0 : 1);
};

run().catch(async (e) => {
  console.error(e);
  try { writeFileSync(OUT, JSON.stringify({ ...out, crash: String(e).slice(0, 400) }, null, 2)); } catch { /* 못 쓰면 흘린다 */ }
  process.exit(1);
});
