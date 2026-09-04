/**
 * T7-8b — 2.5.8 / 2.5.5 의 **아직 안 잰 열**: 화면 확장 · 상태 확장 · 높이 축.
 *
 * T7-8a(36대)가 닫은 것 = **폭 축**(390~1920 × pointer 2 × 3화면 = 36칸 · AA 위반 0).
 * 그 초록에는 아직 단서가 셋 붙어 있었다:
 *   ① **화면이 3개뿐**이었다 — `/compare`·`/work-orders/*`·`/documents/*` 는 안 쟀다.
 *   ② **상태가 «가만히 있는 화면» 하나**였다 — 모달·바텀시트·**투어 열린 상태**는 안 쟀다.
 *      🔴 투어가 열리면 말풍선·오버레이가 **새 대상**을 만들고 배경이 `inert` 가 된다 = **모집단이 바뀐다.**
 *   ③ **높이가 900 고정**이었다 — 짧은 뷰포트에서 요소가 붙는지 안 쟀다.
 *
 * 🔴 **못 잰 것을 «0» 으로 쓰지 않는다** — 위 셋은 「위반 0」이 아니라 **「안 잼」**이었다.
 *
 * 🔴 **그물에 «지금의 사실»을 박지 않는다**(§⑧-7 ④). 화면·폭·높이·상태는 전부 **인자**다.
 *    특히 `/work-orders/{id}`·`/documents/{id}` 는 **동적 세그먼트**라 id 가 필요한데,
 *    그 id 를 코드에 박으면 seed 가 바뀐 날 그물이 먼저 죽는다 ⇒ **씨앗 화면의 링크에서 «주워»
 *    쓴다**(`--routes discover`). 주워지지 않으면 **0 이 아니라 `unreachable` 로 적는다.**
 *
 * 🔴 **교정 열**(`--calibrate`) — 이 그물은 T7-8a 의 산식을 `_target_size_lib.mjs` 로 떼어 쓴다.
 *    떼어낸 산식이 **같은 수를 내는지**를 36대가 이미 낸 칸(fine · 1440×900 ·
 *    overview/incident/evidence)에서 다시 재어 확인한다. 다르면 **내 새 수부터 의심**한다.
 *
 * 사용:
 *   node t78b_target_size_states.mjs --base http://127.0.0.1:3115 \
 *     --widths 390,768,1440 --heights 480,640,900 --pointer both \
 *     --states base,modal,tour --routes discover --out evidence/x.json
 */
import fs from "node:fs";
import { SCAN, judge, PLANT, REMOVE, judgeControls, die, FIND_SCROLLERS, CLEAR_SCROLLERS, SCROLL_ONE } from "./_target_size_lib.mjs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const list = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);
const nums = (s) => list(s).map(Number);

const BASE = arg("base", "");
if (!BASE) die("--base 가 없다 — 무대를 인자로 받는다(그물에 포트를 박지 않는다)");
const WIDTHS = nums(arg("widths", "390,768,1440"));
const HEIGHTS = nums(arg("heights", "900"));
const POINTERS = arg("pointer", "both") === "both" ? ["fine", "coarse"] : [arg("pointer", "fine")];
const STATES = list(arg("states", "base,modal,tour"));
const ROUTES_ARG = arg("routes", "discover");
const OUT = arg("out", "");
/* 🔴 **내부 스크롤 컨테이너 스윕 — 켜기/끄기 두 열.**
   창 단위 스윕으로도 남는 「안 잼」의 대부분이 컨테이너 «안»에 있었다(T7-8b 278개 · 전부 incident).
   그런데 컨테이너를 굴리면 그 안의 요소가 뷰포트에서 «움직이므로», 정체 키가 부실하면
   **「안 잼이 줄었다」와 「내가 대상을 불렸다」가 같은 모양**이 된다.
   ⇒ **같은 칸을 `on`/`off` 두 번 돌려 `측정 + 안 잼 = distinct 총계`가 «불변»인지 본다.**
      총계가 늘면 그건 발견이 아니라 **내 중복 계수**다. */
const CONTAINERS = arg("containers", "on") !== "off";
/* 🔴 **스텝 상한도 «내 손잡이»다.** 390 에서 안 잼이 14로 남았을 때, 그것이 «화면의 사실»인지
   «내 상한이 자른 것»인지부터 갈라야 한다. 그래서 상한을 인자로 빼고 올려 보는 열을 만든다. */
/* 🔴 **실측으로 올렸다** — 기본값 y6/x4 로는 390 폭에서 「안 잼 14」가 남았는데, 상한만 올리자
   **0** 이 됐다(측정 41/41). ⇒ 그 14는 **화면의 사실이 아니라 내 상한이 자른 것**이었다.
   상한은 넉넉히 두고, **잘렸으면 `truncated` 로 신고**한다(침묵하는 절단이 폴백과 같은 병이다). */
const CONT_STEPS_Y = Number(arg("cont-steps-y", 16));
const CONT_STEPS_X = Number(arg("cont-steps-x", 32));

/* 🔴 씨앗 화면 = 링크를 «주울» 자리. 이것도 인자다. */
const SEEDS = list(arg("seeds", "/overview,/incidents/INC-2026-014?run=STATIC-GS-01,/evidence/MR-2025-0087?run=STATIC-GS-01"));
/* 교정 열 = 36대가 이미 낸 칸. 「같은 산식인가」만 묻는다. */
const CALIBRATE = list(arg("calibrate", "/overview,/incidents/INC-2026-014?run=STATIC-GS-01,/evidence/MR-2025-0087?run=STATIC-GS-01"));

const browser = await chromium.launch();

const mkCtx = async (width, height, pointer) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(pointer === "coarse" ? { hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  /* 🔴 `:8010` 은 **배포 컨테이너** — 끄지도 흔들지도 않는다. 여기서 값을 «고정»만 한다.
     `online:false` 면 REPLAY 가 서고 초대 카드가 뜬다(= 투어를 열 수 있는 조건). */
  await page.route("**/api/live/status", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }),
  );
  return { ctx, page };
};

/* 🔴 **모집단이 «자리 잡을» 때까지 기다린다 — 시간이 아니라 «수»로 기다린다.**
   첫 스모크에서 교정 열 `/overview` 가 **12**, 같은 회차 본 측정이 **16** 을 냈다. 같은 화면·같은
   폭·같은 상태인데 수가 갈렸다 = **내 계측기가 흔들렸다**(36대의 16 이 참값). 원인은 초대 카드가
   live-status 응답 «뒤»에 마운트되는데 `networkidle + 700ms` 가 그 앞에서 끊긴 것.
   ⇒ 대상 수가 **연속 2회 같아질 때까지** 기다리고, 못 자리 잡으면 그 사실을 값으로 남긴다.
   🔴 시간(700ms)으로 기다리면 무대가 느린 날 조용히 «다른 화면»을 재게 된다. */
const COUNT_SEL = [
  "a[href]", "button", "input", "select", "textarea", "summary",
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
  '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]', "[tabindex]",
].join(",");
const settle = async (page, { maxMs = 8000, step = 350 } = {}) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  let prev = -1, stable = 0, waited = 0, last = -1;
  while (waited < maxMs) {
    const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, COUNT_SEL).catch(() => -1);
    last = n;
    stable = n === prev ? stable + 1 : 0;
    if (stable >= 2) return { settled: true, waitedMs: waited, count: n };
    prev = n;
    await page.waitForTimeout(step);
    waited += step;
  }
  return { settled: false, waitedMs: waited, count: last };
};

/* 🔴 **세션 문**(gate) — 새 컨텍스트로 `/compare` 를 바로 치면 `/overview` 로 **되돌려진다**
   (첫 스모크에서 `landedAsRequested:false` 로 잡혔다). 36대 그물이 3화면을 잰 것은 한 컨텍스트
   안에서 `/overview` 를 «먼저» 밟았기 때문이고, 칸마다 컨텍스트를 새로 여는 이 그물은 그 전제를
   물려받지 못한다. ⇒ **문을 먼저 통과시키고** 목표로 간다. 통과 여부는 값으로 남긴다. */
const PRIME = arg("prime", "/overview");
async function primeSession(page) {
  const r = await page.goto(`${BASE}${PRIME}`, { waitUntil: "domcontentloaded" }).catch(() => null);
  const s = await settle(page);
  const landed = await page.evaluate(() => location.pathname).catch(() => "");
  return { status: r ? r.status() : null, landed, settled: s.settled };
}

/* ── 라우트 «발견» ────────────────────────────────────────────────────────
   🔴 id 를 박지 않는다. 씨앗 화면의 `a[href]` 에서 패턴에 맞는 첫 링크를 줍는다.
   못 주우면 그 화면은 **`unreachable`** — 「위반 0」이 아니다. */
async function discoverRoutes() {
  const { ctx, page } = await mkCtx(1440, 900, "fine");
  const found = new Map([["overview", "/overview"]]);
  const hrefs = new Set();
  const ids = new Set();
  await primeSession(page);
  for (const seed of SEEDS) {
    await page.goto(`${BASE}${seed}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await settle(page);
    const got = await page.evaluate(() => ({
      hrefs: Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")).filter(Boolean),
      /* 🔴 링크가 «없는» 자리도 있다 — 정적 재생본의 작업지시 초안은 링크가 아니라 **화면에 적힌
         식별자**로만 나온다. 그래서 hrefs 뿐 아니라 **보이는 글자**에서도 id 를 줍는다.
         이것도 블랙박스다(코드가 아니라 화면을 읽는다). */
      text: (document.body.innerText ?? "").slice(0, 200000),
    }));
    got.hrefs.forEach((h) => hrefs.add(h));
    for (const m of got.text.matchAll(/\b(WO|DOC|MR)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g)) ids.add(m[0]);
  }
  const pickHref = (re) => [...hrefs].find((h) => re.test(h)) ?? null;
  const pickId = (re) => [...ids].find((i) => re.test(i)) ?? null;
  const wanted = [
    ["compare", () => pickHref(/^\/compare(\?|$)/)],
    ["work-order", () => pickHref(/^\/work-orders\/[^/?#]+/) ?? (pickId(/^WO-/) ? `/work-orders/${pickId(/^WO-/)}` : null)],
    ["document", () => pickHref(/^\/documents\/[^/?#]+/) ?? (pickId(/^DOC-/) ? `/documents/${pickId(/^DOC-/).split("@")[0]}` : null)],
  ];
  const unreachable = [];
  for (const [label, get] of wanted) {
    const h = get();
    if (h) found.set(label, h);
    else unreachable.push(label);
  }
  await page.close(); await ctx.close();
  return { routes: [...found.entries()], unreachable, hrefSample: [...hrefs].slice(0, 30), idSample: [...ids].slice(0, 20) };
}

/* ── 상태 열기 ─────────────────────────────────────────────────────────────
   🔴 블랙박스(§⑧-7 ①) — 접근 가능한 «이름»으로만 연다. `data-testid` 를 안 쓴다.
   🔴 상태가 «실제로 열렸는지»를 값으로 남긴다. 안 열렸으면 그 칸은 `base` 의 재측일 뿐이라
      **다른 이름으로 부르면 안 된다**(자극이 실재했는가). */
async function openState(page, state) {
  if (state === "base") return { opened: true, how: "없음(기준 상태)", evidence: null };

  if (state === "modal") {
    const btn = page.getByRole("button", { name: /세션 리셋/ }).first();
    if (!(await btn.count())) return { opened: false, how: "「세션 리셋」 버튼 없음", evidence: null };
    await btn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
    return { opened: n > 0, how: "getByRole(button, /세션 리셋/).click()", evidence: { dialogCount: n } };
  }

  if (state === "tour") {
    /* 초대 카드의 「둘러보기 시작」. 새 컨텍스트마다 저장소가 비어 있어 카드가 뜬다.
       🔴 <md 폭에서는 같은 오버레이가 **바텀 시트**로 뜬다 — 「바텀시트」는 별도 상태가 아니라
          **투어 열린 상태 × 좁은 폭**이다. 그래서 상태를 하나 더 만들지 않고 «폭 열»로 가른다. */
    const start = page.getByRole("button", { name: /둘러보기 시작|투어 시작|이어서 보기|투어 재개/ }).first();
    if (!(await start.count())) return { opened: false, how: "투어 시작 버튼 없음(초대 카드 미표시)", evidence: null };
    await start.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      inertRoots: document.querySelectorAll("[inert]").length,
      /* 말풍선이 실제로 떴는지 = «투어를 끝내는 버튼»이 화면에 있는가(이름으로만 본다) */
      hasTourControls: Array.from(document.querySelectorAll("button")).some((b) =>
        /다음|건너뛰기|끝내기|닫기/.test((b.textContent ?? "").trim())),
    }));
    return { opened: st.dialogs > 0 || st.hasTourControls, how: "getByRole(button, /둘러보기 시작/).click()", evidence: st };
  }
  return { opened: false, how: `모르는 상태 «${state}»`, evidence: null };
}

/* ── 한 칸 재기 ───────────────────────────────────────────────────────────── */
async function measureCell({ route, path, state, width, height, pointer, legacy = false }) {
  const { ctx, page } = await mkCtx(width, height, pointer);
  const cell = { route, path, state, width, height, pointer, legacy };
  try {
    cell.prime = await primeSession(page);
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => null);
    const s = await settle(page);
    cell.settled = s.settled; cell.settleMs = s.waitedMs; cell.settleCount = s.count;
    const landed = await page.evaluate(() => location.pathname + location.search);
    cell.httpStatus = resp ? resp.status() : null;
    cell.landed = landed;
    /* 🔴 요청한 곳에 «내렸는가». 게이트가 다른 화면으로 돌리면 그 칸의 라벨이 거짓이 된다. */
    cell.landedAsRequested = landed.split("?")[0] === path.split("?")[0];
    const notFound = await page.evaluate(() => /(^|\s)404(\s|$)/.test((document.querySelector("h1")?.textContent ?? "").trim()));
    cell.notFound = notFound;

    const st = await openState(page, state);
    cell.stateOpened = st.opened;
    cell.stateHow = st.how;
    cell.stateEvidence = st.evidence;

    /* 대조군을 «이 칸에서» 심는다 — 폭·높이·상태가 다르면 전제도 다르다. */
    await page.evaluate(PLANT, { w: width, h: height });
    await page.waitForTimeout(150);
    const withCtl = await page.evaluate(SCAN);
    const ctl = judgeControls(withCtl.targets);
    await page.evaluate(REMOVE);
    await page.waitForTimeout(120);
    cell.control = {
      reached: ctl.reached, missing: ctl.missing,
      isolated: {
        bad: ctl.isolated.bad ? { size: `${ctl.isolated.bad.w}×${ctl.isolated.bad.h}`, aaPass: ctl.isolated.bad.aaPass, partners: ctl.isolated.bad.partnerCount } : null,
        good: ctl.isolated.good ? { size: `${ctl.isolated.good.w}×${ctl.isolated.good.h}`, aaPass: ctl.isolated.good.aaPass, aaaPass: ctl.isolated.good.aaaPass } : null,
      },
      /* 실페이지 안 값 — 게이트가 아니라 «값». 이웃이 가까우면 여기서 빨강이 날 수 있다. */
      inPageGoodAaPass: ctl.inPage.good ? ctl.inPage.good.aaPass : null,
      inPageGoodPartners: ctl.inPage.good ? ctl.inPage.good.partnerCount : null,
    };

    /* ── 🔴 **스크롤 스텝 스윕** ───────────────────────────────────────────
       한 번의 스캔은 «창 안»만 제대로 잰다. 창 밖 좌표에서 `elementFromPoint` 가 아무것도
       안 돌려주므로 아래쪽 대상은 경계 상자로 폴백하고, 그 상자에는 히트 확장이 없다.
       37대가 480 높이에서 「4개가 44 밑으로 내려갔다」는 없는 사실을 만든 자리다 —
       실제로는 **창 밖으로 나간 것**이었다. 그리고 그 폴백은 AA 도 «과소» 신고한다:
       Spacing 은 이웃의 «상자»와 교차를 보는데, 이웃이 실제보다 작게 적히면 있어야 할
       교차가 안 생긴다.
       ⇒ 뷰포트 높이만큼 내려가며 스텝마다 스캔하고, **판정은 스텝 «안»에서만** 한다
          (좌표계가 한 상태로 일관해야 교차 산식이 성립한다).
       ⇒ 끝내 한 번도 창 안에서 못 잰 대상은 **「위반 0」이 아니라 「안 잼」**으로 센다. */
    const first = await page.evaluate(SCAN);
    const stepH = first.innerH;
    /* 🔴 **`legacy` = 36대 그물과 «같은» 방식**(스크롤 0 · 한 번 스캔 · 창 밖 폴백 행 포함).
       교정 열은 이 모드로 돈다 — 그래야 「떼어낸 산식이 전대와 같은가」를 여전히 물을 수 있다.
       스윕 모드는 **모집단을 정당하게 바꾸므로** 전대 수와 달라지는 것이 «정상»이고, 그 둘을
       섞으면 「산식이 갈렸다」와 「모집단이 옳아졌다」를 못 가른다. */
    const maxSteps = legacy ? 1 : Math.max(1, Math.min(8, Math.ceil(first.scrollHeight / Math.max(1, stepH))));
    const seen = new Map();   // key -> { measured, row }
    const steps = [];
    const KEY = (t) => t.pinned
      ? `${t.role}|${t.name}|v|${Math.round(t.left)}|${Math.round(t.top)}`
      : `${t.role}|${t.name}|c|${Math.round(t.contLeft)}|${Math.round(t.contTop)}`;
    for (let k = 0; k < maxSteps; k++) {
      const y = k * stepH;
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(220);
      const snap = await page.evaluate(SCAN);
      const rows = snap.targets.filter((t) => !t.planted);
      const inView = legacy ? rows : rows.filter((t) => t.inViewport && t.hitScanned);
      /* 🔴 판정 열은 «inert 아닌 것끼리» 판정한다 — Spacing 문면의 "another **target**" 이
         inert 를 포함하지 않기 때문이다(판정 «뒤»에 거르면 없는 이웃이 원을 막는다). */
      const liveRows = legacy ? judge(inView).filter((t) => !t.inert) : judge(inView.filter((t) => !t.inert));
      const allRows = judge(inView);
      steps.push({
        y, scrolledTo: snap.scrollY, seenInStep: rows.length,
        judgedInView: inView.length,
        offscreenOrUnscanned: rows.length - inView.length,
        allTotal: allRows.length, liveTotal: liveRows.length,
        aaFail: liveRows.filter((r) => !r.aaPass).length,
        aaaFail: liveRows.filter((r) => !r.aaaPass).length,
      });
      /* 🔴 고정·스티키 요소는 «뷰포트» 좌표로, 흐르는 요소는 «문서» 좌표로 센다 —
         한 쪽만 쓰면 앱바가 스텝마다 새 대상이 되거나(문서 좌표), 스크롤로 자리를 옮긴
         같은 요소가 서로 다른 대상으로 갈린다(뷰포트 좌표). */
      /* 🔴 좌표계 셋 — 고정·스티키는 «뷰포트», 그 밖은 «콘텐츠»(조상 스크롤을 되더한 위치).
         문서 좌표(`top+scrollY`)를 쓰면 **컨테이너가 굴러갈 때** 같은 요소가 새 대상이 된다. */
      const keyOf = KEY;
      for (const t of rows) {
        const k2 = keyOf(t);
        const prev2 = seen.get(k2);
        if (!prev2) seen.set(k2, { measured: false, inert: t.inert, row: null, role: t.role, name: t.name, raw: t });
        else if (!prev2.measured && t.inWindow && !(prev2.raw && prev2.raw.inWindow)) { prev2.raw = t; seen.set(k2, prev2); }
      }
      for (const r of liveRows) {
        const k2 = keyOf(r);
        const e = seen.get(k2) ?? { measured: false, inert: r.inert, role: r.role, name: r.name };
        /* 여러 스텝에 걸쳐 보이면 «나쁜 쪽»을 남긴다(스티키 요소는 매 스텝에 나온다). */
        if (!e.measured || (e.row && r.aaPass === false && e.row.aaPass !== false)) { e.measured = true; e.row = r; }
        seen.set(k2, e);
      }
      for (const r of allRows) {
        const k2 = keyOf(r);
        const e = seen.get(k2);
        if (e && !e.allRow) { e.allRow = r; seen.set(k2, e); }
      }
    }
    /* ── 🔴 **컨테이너 스윕** — 창을 다 훑고도 못 잡은 것을 «안»에서 훑는다 ────────── */
    let scrollers = [];
    if (CONTAINERS) {
      scrollers = await page.evaluate(FIND_SCROLLERS);
      for (const sc of scrollers) {
        const spanY = Math.max(1, sc.clientHeight);
        const spanX = Math.max(1, sc.clientWidth);
        const nY = sc.vy ? Math.min(CONT_STEPS_Y, Math.ceil(sc.scrollHeight / spanY)) : 1;
        const nX = sc.vx ? Math.min(CONT_STEPS_X, Math.ceil(sc.scrollWidth / spanX)) : 1;
        sc.stepsY = nY; sc.stepsX = nX; sc.needY = Math.ceil(sc.scrollHeight / spanY); sc.needX = Math.ceil(sc.scrollWidth / spanX);
        for (let a = 0; a < nY; a++) {
          for (let b = 0; b < nX; b++) {
            const moved = await page.evaluate(SCROLL_ONE, { i: sc.i, top: a * spanY, left: b * spanX });
            if (!moved.ok) continue;
            await page.waitForTimeout(200);
            const snap = await page.evaluate(SCAN);
            const rows = snap.targets.filter((t) => !t.planted);
            const inView = rows.filter((t) => t.inViewport && t.hitScanned);
            const liveRows = judge(inView.filter((t) => !t.inert));
            const allRows = judge(inView);
            steps.push({
              scroller: sc.i, scrollerLabel: sc.label, top: moved.top, left: moved.left,
              seenInStep: rows.length, judgedInView: inView.length,
              offscreenOrUnscanned: rows.length - inView.length,
              allTotal: allRows.length, liveTotal: liveRows.length,
              aaFail: liveRows.filter((r) => !r.aaPass).length,
              aaaFail: liveRows.filter((r) => !r.aaaPass).length,
            });
            /* 🔴 안 잼 행의 «덮임» 근거를 남긴다 — 창 «안»에서 본 관측을 우선한다(밖은 스크롤 문제다). */
      for (const t of rows) {
        const k = KEY(t);
        const prev = seen.get(k);
        if (!prev) seen.set(k, { measured: false, inert: t.inert, row: null, role: t.role, name: t.name, raw: t });
        else if (!prev.measured && t.inWindow && !(prev.raw && prev.raw.inWindow)) { prev.raw = t; seen.set(k, prev); }
      }
            for (const r of liveRows) {
              const k = KEY(r);
              const e = seen.get(k) ?? { measured: false, inert: r.inert, role: r.role, name: r.name };
              if (!e.measured || (e.row && r.aaPass === false && e.row.aaPass !== false)) { e.measured = true; e.row = r; }
              seen.set(k, e);
            }
            for (const r of allRows) { const k = KEY(r); const e = seen.get(k); if (e && !e.allRow) { e.allRow = r; seen.set(k, e); } }
          }
        }
      }
      await page.evaluate(CLEAR_SCROLLERS);
    }
    /* 🔴 «필요한 스텝»과 «실제 밟은 스텝»을 나란히 남긴다 — 잘렸으면 그게 보인다. */
    cell.scrollers = scrollers.map((s2) => ({ i: s2.i, tag: s2.tag, label: s2.label, vy: s2.vy, vx: s2.vx, scrollHeight: s2.scrollHeight, clientHeight: s2.clientHeight, scrollWidth: s2.scrollWidth, clientWidth: s2.clientWidth, stepsY: s2.stepsY, stepsX: s2.stepsX, needY: s2.needY, needX: s2.needX, truncated: (s2.needY > s2.stepsY) || (s2.needX > s2.stepsX) }));
    cell.containersSwept = CONTAINERS;

    await page.evaluate(() => window.scrollTo(0, 0));

    const entries = [...seen.values()];
    const liveMeasured = entries.filter((e) => e.measured && !e.inert).map((e) => e.row);
    const allMeasured = entries.filter((e) => e.measured).map((e) => e.allRow ?? e.row);
    const unmeasured = entries.filter((e) => !e.measured);
    const sum = (rows) => ({
      total: rows.length,
      undersized24: rows.filter((r) => r.undersized).length,
      aaFailCount: rows.filter((r) => !r.aaPass).length,
      aaaFailCount: rows.filter((r) => !r.aaaPass).length,
    });
    cell.dialogOpen = first.dialogOpen;
    cell.inertRoots = first.inertRoots;
    cell.mediaCoarse = first.pointerCoarse;
    cell.innerW = first.innerW; cell.innerH = first.innerH;
    cell.scrollHeight = first.scrollHeight;
    cell.steps = steps;
    cell.all = sum(allMeasured);
    cell.nonInert = sum(liveMeasured);
    cell.inertExcluded = allMeasured.length - liveMeasured.length;
    /* 🔴 **「안 잼」을 «0» 과 갈라서 센다.** 스윕 뒤에도 창 안에서 히트 스캔이 안 된 대상 —
       내부 스크롤 컨테이너 안이거나 다른 요소에 덮여 중심이 안 잡히는 것들이다. */
    cell.distinct = entries.length;   // 🔴 측정 + 안 잼 = 이 수. on/off 두 열에서 «불변»이어야 한다.
    cell.unmeasured = unmeasured.length;
    cell.unmeasuredNames = unmeasured.slice(0, 12).map((e) => `${e.role}:${e.name}`);
    /* 🔴 **«덮임» 축 산출** — 안 잼마다 ① 이름 ② 덮은 것 ③ 자기/남 ④ 밖인가 덮인가.
       🔴 판정의 핵심 = `unpressableHere` — **창 «안»인데 상자 어느 점도 내 것이 아니다**
          = 그 자리에서는 **사람이 눌러도 이 대상이 안 받는다**(계측 한계가 아니라 대상의 사실).
       `elementFromPoint` 는 `pointer-events:none` 을 건너뛰므로, 여기 잡힌 덮개는
       **실제로 클릭을 받는 요소**다. */
    cell.occlusion = unmeasured.map((e) => {
      const t = e.raw;
      /* 🔴 **«관측 없음»을 «창 밖»으로 읽지 않는다.** 기본값에서 사실을 만들면, 못 본 것이
         「밖에 있었다」로 둔갑한다 — 폴백·상한과 같은 병이다(§⑧-7 ⑨). 별도 값으로 낸다. */
      if (!t) return { role: e.role, name: e.name, observed: false, why: "관측 없음(이 칸에서 원본 행을 못 잡았다 — 0 도 밖도 아니다)" };
      return {
        role: e.role, name: e.name, observed: true,
        inWindow: !!t.inWindow,
        unpressableHere: !!t.unpressableHere,
        box: t.boxW != null ? `${t.boxW}×${t.boxH}` : null,
        blocker: t.blockedAtCenter ?? null,
        why: !t.inWindow ? "창 밖(스크롤로 닿을 수 있다 — 내 한계)"
          : t.unpressableHere ? "🔴 창 안인데 상자 전체가 막힘 — 사람도 이 상자로는 못 누른다"
          : "창 안 · 일부 점은 내 것(중심만 막힘)",
      };
    });
    cell.unobservedCount = cell.occlusion.filter((o) => !o.observed).length;
    cell.unpressableCount = cell.occlusion.filter((o) => o.unpressableHere).length;
    cell.viaAnchorCount = liveMeasured.filter((r) => r.hitViaAnchor).length;
    cell.aaFailures = liveMeasured.filter((r) => !r.aaPass).map((r) => ({
      role: r.role, name: r.name, size: `${r.w}×${r.h}`, box: `${r.boxW}×${r.boxH}`,
      hitScanned: r.hitScanned, inlineCandidate: r.inlineCandidate,
      partnerCount: r.partnerCount, partners: r.partners,
    }));
    cell.aaFailInlineCandidates = cell.aaFailures.filter((f) => f.inlineCandidate).length;
    cell.aaaFailures = liveMeasured.filter((r) => !r.aaaPass).map((r) => ({
      role: r.role, name: r.name, size: `${r.w}×${r.h}`, box: `${r.boxW}×${r.boxH}`, hitScanned: r.hitScanned,
    }));
    cell.roster = liveMeasured.length <= 24
      ? liveMeasured.map((r) => ({ role: r.role, name: r.name, size: `${r.w}×${r.h}`, aaPass: r.aaPass, aaaPass: r.aaaPass }))
      : null;
  } catch (e) {
    cell.error = String(e).slice(0, 300);
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
  return cell;
}

/* ── ① 교정 열 — 떼어낸 산식이 36대와 같은 수를 내는가 ─────────────────── */
const calibration = [];
for (const path of CALIBRATE) {
  const c = await measureCell({ route: "calib", path, state: "base", width: 1440, height: 900, pointer: "fine", legacy: true });
  calibration.push({ path, total: c.all?.total ?? null, undersized24: c.all?.undersized24 ?? null, aaFailCount: c.all?.aaFailCount ?? null, landedAsRequested: c.landedAsRequested, control: c.control });
}
/* 대조군이 교정 열에서 한 번이라도 죽으면 그 아래 전부가 근거가 아니다. */
for (const c of calibration) {
  if (!c.control) die("교정 열에서 대조군이 아예 안 돌았다", c);
  if (c.control.missing.length) die(`교정 열 대조군 «소실» — 심은 것이 모집단에 없다(전제 죽음): ${c.control.missing.join(",")}`, c);
  if (c.control.isolated.bad?.aaPass !== false) die("교정 열 대조군① 불발 — 18px 간격 12×12 두 개를 «통과»라 했다", c);
  if (c.control.isolated.good?.aaPass !== true || c.control.isolated.good?.aaaPass !== true) die("교정 열 대조군② 불발 — 60×60 단독을 «위반»이라 했다", c);
}

/* ── ② 라우트 발견 ───────────────────────────────────────────────────────── */
let discovery = null;
let routes;
if (ROUTES_ARG === "discover") {
  discovery = await discoverRoutes();
  routes = discovery.routes;
} else {
  /* 🔴 **셸이 인자를 바꾼다.** Git Bash(MSYS)는 `/overview` 같은 인자를 «POSIX 경로»로 보고
     `C:/Program Files/Git/overview` 로 **번역해** 넘긴다 — RUN2 가 통째로 0칸이 된 원인이다.
     (그물이 착지 경로를 검사한 덕에 «/overview 를 쟀다»고 잘못 적히지는 않았다.)
     ⇒ 앞의 `/` 를 «요구하지 않고», 번역돼 온 절대경로에서 **마지막 조각만** 되살린다. */
  routes = list(ROUTES_ARG).map((raw) => {
    let p = raw;
    const m = /^[A-Za-z]:[\/].*?[\/]([^\/]+(?:[?#].*)?)$/.exec(p);
    if (m) p = m[1];                 // 셸이 번역한 절대경로 → 마지막 조각
    if (!p.startsWith("/")) p = `/${p}`;
    return [p.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root", p];
  });
}

/* ── ③ 본 측정 ───────────────────────────────────────────────────────────── */
const cells = [];
for (const pointer of POINTERS) {
  for (const width of WIDTHS) {
    for (const height of HEIGHTS) {
      for (const [route, path] of routes) {
        for (const state of STATES) {
          /* 🔴 투어는 초대 카드가 있는 화면에서만 열 수 있다 — 다른 화면에서 「투어 상태」라
             부르면 거짓 라벨이다. 열리는지 «해 보고» 안 열리면 `stateOpened:false` 로 남긴다.
             (안 열린 칸은 판정에 안 쓴다 — 「자극이 실재했는가」) */
          cells.push(await measureCell({ route, path, state, width, height, pointer }));
        }
      }
    }
  }
}

/* ── 집계 ────────────────────────────────────────────────────────────────── */
/* 🔴 «자리 잡지 못한» 칸은 쓰지 않는다 — 수가 아직 흔들리는 화면을 재면 그 값은 화면의 값이 아니다. */
const usable = cells.filter((c) => !c.error && c.landedAsRequested && !c.notFound && c.stateOpened && c.settled);
const skipped = cells.filter((c) => !usable.includes(c));
const ctlBroken = usable.filter((c) => !c.control || c.control.missing.length ||
  c.control.isolated.bad?.aaPass !== false || c.control.isolated.good?.aaPass !== true);

const out = {
  base: BASE, at: new Date().toISOString(),
  axes: { widths: WIDTHS, heights: HEIGHTS, pointers: POINTERS, states: STATES, routes: routes.map(([l, p]) => `${l}=${p}`) },
  sc: {
    "2.5.8": "at least 24 by 24 CSS pixels, except: Spacing / Equivalent / Inline / User agent control / Essential. (AA)",
    spacing: "if a 24 CSS pixel diameter circle is centered on the bounding box of each undersized target, the circles do not intersect another target or the circle for another undersized target.",
    "2.5.5": "44 by 44 CSS pixels, no exception. (AAA)",
    machineJudged: "Spacing 만 기계 판정 — 빨강은 «AA 위반 후보»다.",
    populationNote: "inert 조상 아래 요소는 pointer 로 활성화 불가 ⇒ SC 의 target 이 아니다. all / nonInert 두 수를 다 낸다.",
  },
  calibration, discovery,
  cells, skipped: skipped.map((c) => ({ route: c.route, path: c.path, state: c.state, width: c.width, height: c.height, pointer: c.pointer, why: c.error ? "error" : !c.landedAsRequested ? `다른 곳에 내림(${c.landed})` : c.notFound ? "404" : !c.stateOpened ? "상태가 안 열림" : "모집단이 안 자리 잡음(settle 실패)", stateHow: c.stateHow, error: c.error })),
  controlBroken: ctlBroken.map((c) => ({ route: c.route, state: c.state, width: c.width, height: c.height, pointer: c.pointer, control: c.control })),
  total: {
    cellsAttempted: cells.length,
    cellsUsable: usable.length,
    aaFailCellsNonInert: usable.filter((c) => c.nonInert.aaFailCount > 0).length,
    aaFailUnique: [...new Set(usable.flatMap((c) => c.aaFailures.map((f) => `${f.role}:${f.name}`)))],
    inertActiveCells: usable.filter((c) => c.inertRoots > 0).length,
    unmeasuredTargets: usable.reduce((a, c) => a + (c.unmeasured ?? 0), 0),
    aaaFailUnique: [...new Set(usable.flatMap((c) => (c.aaaFailures ?? []).map((f) => `${f.role}:${f.name} ${f.size}`)))],
  },
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

/* ── 출력 ────────────────────────────────────────────────────────────────── */
console.log(`=== 교정 열(fine · 1440×900 · base) — 36대 산식과 같은 수인가 ===`);
for (const c of calibration) console.log(`  ${c.path}  대상 ${c.total} · 24미만 ${c.undersized24} · AA위반후보 ${c.aaFailCount}`);
if (discovery) {
  console.log(`
=== 라우트 발견 ===`);
  for (const [l, p] of discovery.routes) console.log(`  ${l} = ${p}`);
  if (discovery.unreachable.length) console.log(`  🔴 못 주움(= «위반 0» 이 아니라 «안 잼»): ${discovery.unreachable.join(", ")}`);
}
console.log(`
=== 본 측정 ${usable.length}/${cells.length} 칸 사용 ===`);
for (const pointer of POINTERS) for (const state of STATES) {
  const cs = usable.filter((c) => c.pointer === pointer && c.state === state);
  if (!cs.length) { console.log(`  [${pointer} · ${state}] 사용 가능한 칸 0 — 안 잼`); continue; }
  console.log(`  [${pointer} · ${state}]`);
  for (const c of cs) {
    console.log(`    ${String(c.width).padStart(4)}×${String(c.height).padEnd(4)} ${c.route.padEnd(11)} 스텝 ${String(c.steps.length).padStart(1)} · 대상 ${String(c.nonInert.total).padStart(3)}(all ${String(c.all.total).padStart(3)}·inert제외 ${c.inertExcluded}) · AA통과 ${c.nonInert.total - c.nonInert.aaFailCount}/${c.nonInert.total}${c.nonInert.aaFailCount ? ` 🔴${c.nonInert.aaFailCount}` : ""} · AAA통과 ${c.nonInert.total - c.nonInert.aaaFailCount}/${c.nonInert.total}${c.unmeasured ? ` · 🔴안잼 ${c.unmeasured}` : ""} · distinct ${c.distinct}${c.containersSwept ? ` · 컨테이너 ${c.scrollers.length}` : " · 컨테이너 OFF"}`);
    if (c.unmeasured) console.log(`         ⌀ 안 잰 대상 ${c.unmeasured}${c.unpressableCount ? ` · 🔴 그중 «사람도 못 누름» 후보 ${c.unpressableCount}` : ""}${c.viaAnchorCount ? ` · (중심 대신 다른 점에서 잰 것 ${c.viaAnchorCount})` : ""}`);
    for (const o of (c.occlusion ?? [])) console.log(`            ${o.unpressableHere ? "🔴" : "▫"} ${o.role} 「${o.name}」 ${o.box ?? ""} — ${o.why}${o.blocker ? ` · 덮은 것: ${o.blocker.rel}/${o.blocker.tag} 「${o.blocker.name}」 op=${o.blocker.opacity} bg=${o.blocker.bg}${o.blocker.interactive ? " ⟨상호작용 요소⟩" : ""}` : ""}`);
    for (const f of c.aaFailures) console.log(`         🔴 AA ${f.role} 「${f.name}」 ${f.size} — 교차 ${f.partnerCount}: ${f.partners.map((x) => `${x.kind}:${x.name}`).join(" | ")}${f.inlineCandidate ? " ⟨Inline 예외 후보 — 사람 판단⟩" : ""}`);
    for (const f of (c.aaaFailures ?? [])) console.log(`         ▫ AAA(목표) ${f.role} 「${f.name}」 ${f.size}`);
  }
}
if (out.skipped.length) {
  console.log(`
=== 안 잰 칸 ${out.skipped.length} (🔴 «위반 0» 이 아니다) ===`);
  const by = {};
  for (const s of out.skipped) { const k = `${s.route}/${s.state}: ${s.why}`; by[k] = (by[k] ?? 0) + 1; }
  for (const [k, n] of Object.entries(by)) console.log(`  ${k} × ${n}`);
}
if (ctlBroken.length) console.log(`
🔴 대조군이 깨진 칸 ${ctlBroken.length} — 그 칸의 색은 근거가 아니다`);
console.log(`
AA 위반 후보 요소(non-inert): ${JSON.stringify(out.total.aaFailUnique)}`);
console.log(`inert 가 실제로 걸린 칸: ${out.total.inertActiveCells}/${usable.length}`);
console.log(`🔴 끝내 «안 잰» 대상 합계: ${out.total.unmeasuredTargets} (「위반 0」이 아니다)`);
console.log(`AAA(목표) 미달 요소: ${JSON.stringify(out.total.aaaFailUnique)}`);
await browser.close();
/* 🔴 대조군이 한 칸이라도 깨졌으면 초록으로 넘기지 않는다. */
if (ctlBroken.length) process.exit(2);
