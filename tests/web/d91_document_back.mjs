/**
 * D-91 / E-6 독검 — 「문서 열람에서 돌아갈 길이 없다」의 처방(`610a806`)을 두 무대로 가른다.
 *
 * 🔴 **판정선은 처방 코드의 줄에서 왔다**(`app/documents/[docId]/page.tsx` backHref 3단):
 *      ① `run && runIncidentId` → `/incidents/{incidentId}?run={run}`   라벨 「조사로 돌아가기」
 *      ② `highlight`            → `/evidence/{highlight}[?run=]`        라벨 「근거로 돌아가기」
 *      ③ 그 외                  → `/overview`                          라벨 「개요로 돌아가기」
 *    🔴 `runIncidentId` 는 `fetchSessionRuns()` 가 준다 — **세션에 달린 값**이다. 그래서
 *       「무세션 + run 있음」은 ①이 아니라 ②로 내려앉아야 한다. 이 줄이 무세션 열의 기대값이다.
 *
 * 🔴 **열은 조건을 «하나씩 없애며» 세운다** — run 있음 / run 없고 highlight 있음 / 둘 다 없음.
 *    한 열의 초록이 옆 열을 대신하지 않는다.
 * 🔴 **goto 가 아니라 click 으로 착지**한다(②) — href 가 맞아도 눌리지 않을 수 있다.
 * 🔴 **히트 영역은 `boundingBox` 가 아니라 `elementFromPoint`** 로 잰다(센쿠2 자수: 박스 24 ·
 *    실효 44). 상자는 상자일 뿐 눌리는 넓이가 아니다.
 * 🔴 대조군 `:8792` 는 **같은 셀렉터**로 0 을 내야 한다 — 다른 셀렉터로 잰 0 은 0 이 아니다.
 */
import { chromium, request } from "playwright";

const STAGE = process.env.STAGE ?? "http://127.0.0.1:8794";
const CONTROL = process.env.CONTROL ?? "http://127.0.0.1:8792";
const RUN_MODE = process.env.RUN_MODE ?? "replay";
const OUT = process.env.OUT_DIR ?? ".";

const rows = [];
const say = (r) => {
  rows.push(r);
  console.log(JSON.stringify(r));
};

/** 무대 하나를 세운다: 세션 발급 → 조사 1회 → doc-chunk 근거 한 건을 «대상이» 고르게 한다. */
async function stage(base) {
  const api = await request.newContext({ baseURL: base });
  const enter = await api.post("/enter", { maxRedirects: 0 });
  const { cookies } = await api.storageState();
  const raw = decodeURIComponent(cookies.find((c) => c.name === "fkt_session")?.value ?? "");
  const sessionId = raw.startsWith("api:") ? raw.slice(4) : null;
  if (!sessionId) throw new Error(`세션 미발급(${base}) enter=${enter.status()}`);

  const started = await api.post("/api/scenarios/GS-01/runs", {
    data: { sessionId, mode: RUN_MODE },
    headers: { "content-type": "application/json" },
  });
  const run = await started.json();
  const evs = await (await api.get(`/api/runs/${run.runId}/events`)).json();
  const chunk = evs
    .filter((e) => e.type === "step.evidence" && e.payload?.evidence?.kind === "doc-chunk")
    .map((e) => e.payload.evidence.evidenceId)[0];
  await api.dispose();
  if (!chunk) throw new Error(`doc-chunk 근거 0건(${base}) — 무대 불성립`);
  return { base, cookies, sessionId, runId: run.runId, incidentId: run.incidentId, chunk, mode: run.mode };
}

/** 「눌리는 넓이」 — 가운데에서 바깥으로 걸으며 그 점이 여전히 이 요소(또는 자손)인지 묻는다. */
async function hitExtent(page, testid) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cx = Math.round(b.x + b.width / 2);
    const cy = Math.round(b.y + b.height / 2);
    const owns = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const walk = (dx, dy) => {
      let n = 0;
      for (let i = 1; i <= 60; i += 1) {
        if (!owns(cx + dx * i, cy + dy * i)) break;
        n = i;
      }
      return n;
    };
    return {
      box: { w: Math.round(b.width), h: Math.round(b.height) },
      hit: { w: walk(-1, 0) + walk(1, 0) + 1, h: walk(0, -1) + walk(0, 1) + 1 },
      centerOwned: owns(cx, cy),
    };
  }, testid);
}

/**
 * 🔴 **클릭 직후 읽기는 이르다** — 클라이언트 항해(`<Link>`)는 `domcontentloaded` 를 다시
 *    내지 않아서, 그 상태를 기다리면 «누르기 전» 주소가 그대로 돌아온다. 1차 실행이 바로
 *    그 함정에 빠졌다(축 ② backStanding 0 · 축 ④⑤ hit null — 대상 결함이 아니라 내 시점).
 *    그래서 «주소가 바뀔 때까지»를 기다린다(고정 대기 아님).
 */
async function clickAndMove(page, locator) {
  const before = page.url();
  await locator.click();
  await page.waitForFunction((prev) => location.href !== prev, before, { timeout: 15_000 });
  return new URL(page.url());
}

const browser = await chromium.launch();

async function ctxFor(s, { withSession }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (withSession) await ctx.addCookies(s.cookies);
  return ctx;
}

/** 축 ③ — 한 조건 조합에서 `document-back` 의 href·라벨·«눌러서» 착지한 곳. */
async function backColumn(s, label, { withSession, highlight, run }) {
  const ctx = await ctxFor(s, { withSession });
  const page = await ctx.newPage();
  const docId = s.chunk.split("@")[0];
  const qs = [highlight ? `highlight=${encodeURIComponent(s.chunk)}` : null, run ? `run=${encodeURIComponent(s.runId)}` : null]
    .filter(Boolean)
    .join("&");
  const url = `${s.base}/documents/${encodeURIComponent(docId)}${qs ? `?${qs}` : ""}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const back = page.locator('[data-testid="document-back"]');
  const count = await back.count();
  let href = null;
  let text = null;
  let landed = null;
  if (count > 0) {
    href = await back.first().getAttribute("href");
    text = (await back.first().innerText()).replace(/\s+/g, " ").trim();
    const u = await clickAndMove(page, back.first());
    landed = u.pathname + u.search;
  }
  say({ axis: "3", stage: s.base, col: label, session: withSession, highlight, run, count, href, text, landed });
  await ctx.close();
  return { count, href, landed };
}

// ── 무대 ───────────────────────────────────────────────────────────────────────
const S = await stage(STAGE);
say({ axis: "0", stage: S.base, runId: S.runId, incidentId: S.incidentId, chunk: S.chunk, mode: S.mode });

// ── 축 ① 근거→문서 링크가 `&run=` 을 싣는가 ────────────────────────────────────
{
  const ctx = await ctxFor(S, { withSession: true });
  const page = await ctx.newPage();
  await page.goto(`${S.base}/evidence/${encodeURIComponent(S.chunk)}?run=${encodeURIComponent(S.runId)}`, {
    waitUntil: "domcontentloaded",
  });
  const link = page.locator('[data-testid="document-tab"] a[href^="/documents/"]');
  const n = await link.count();
  const href = n > 0 ? await link.first().getAttribute("href") : null;
  const backToRun = await page.locator('[data-testid="evidence-back-to-run"]').count();
  const backToRunHref =
    backToRun > 0 ? await page.locator('[data-testid="evidence-back-to-run"]').first().getAttribute("href") : null;
  say({
    axis: "1",
    stage: S.base,
    docLinks: n,
    href,
    carriesRun: !!href && href.includes(`run=${S.runId}`),
    carriesHighlight: !!href && href.includes("highlight="),
    evidenceBackToRun: backToRun,
    backToRunHref,
  });
  await ctx.close();
}

// ── 축 ② 근거→문서→«눌러서» 조사 복귀 ──────────────────────────────────────────
{
  const ctx = await ctxFor(S, { withSession: true });
  const page = await ctx.newPage();
  await page.goto(`${S.base}/evidence/${encodeURIComponent(S.chunk)}?run=${encodeURIComponent(S.runId)}`, {
    waitUntil: "domcontentloaded",
  });
  const onDoc = await clickAndMove(page, page.locator('[data-testid="document-tab"] a[href^="/documents/"]').first());
  const back = page.locator('[data-testid="document-back"]');
  await back.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  const standing = await back.count();
  let landed = null;
  if (standing > 0) {
    const u = await clickAndMove(page, back.first());
    landed = u.pathname + u.search;
  }
  say({
    axis: "2",
    stage: S.base,
    docUrl: onDoc.pathname + onDoc.search,
    backStanding: standing,
    landed,
    expected: `/incidents/${S.incidentId}?run=${S.runId}`,
    ok: landed === `/incidents/${S.incidentId}?run=${S.runId}`,
  });
  await ctx.close();
}

// ── 축 ③ 우선순위 3단 + 무세션 폴백 ────────────────────────────────────────────
await backColumn(S, "a run+highlight·세션", { withSession: true, highlight: true, run: true });
await backColumn(S, "b highlight만·세션", { withSession: true, highlight: true, run: false });
await backColumn(S, "c 둘다없음·세션", { withSession: true, highlight: false, run: false });
await backColumn(S, "a' run+highlight·무세션", { withSession: false, highlight: true, run: true });
await backColumn(S, "c' 둘다없음·무세션", { withSession: false, highlight: false, run: false });

// ── 축 ④⑤ 폐하 경로(412 · 1440) + 히트 영역 ───────────────────────────────────
async function walk(width, height, tag) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies(S.cookies);
  const page = await ctx.newPage();
  const steps = [];
  await page.goto(`${S.base}/overview`, { waitUntil: "domcontentloaded" });
  steps.push(["개요", new URL(page.url()).pathname]);
  await page.goto(`${S.base}/incidents/${encodeURIComponent(S.incidentId)}?run=${encodeURIComponent(S.runId)}`, {
    waitUntil: "domcontentloaded",
  });
  steps.push(["조사", new URL(page.url()).pathname]);
  // 근거: 이 조사 화면의 근거 카드에서 «눌러» 들어간다(주소를 지어내지 않는다).
  // 🔴 셀렉터를 지어내지 않는다 — 근거 카드의 «실물 링크»(`/evidence/…`) 중 이 doc-chunk 를
  //    가리키는 것을 고른다. 1차 실행은 이 자리가 0 매치라 goto 로 떨어졌고, 그러면 「눌러서
  //    간다」가 아니라 「주소를 쳐서 간다」가 되어 폐하 경로가 아니었다.
  // 🔴 근거 카드는 스냅샷/스트림이 «칠한 뒤에» 선다 — 묻는 시점이 이르면 0 매치가 나오고,
  //    그러면 「클릭 경로가 없다」가 아니라 「내가 일찍 물었다」가 0 으로 적힌다(1차 자수).
  await page
    .locator('[data-testid="evidence-card"] a[href^="/evidence/"]')
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => {});
  const evLinks = page.locator('[data-testid="evidence-card"] a[href^="/evidence/"]');
  const hrefs = await evLinks.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const wantIdx = hrefs.findIndex((h) => (h ?? "").includes(S.chunk.split("@")[0]));
  const evLink = wantIdx >= 0 ? evLinks.nth(wantIdx) : evLinks.first();
  const viaClick = hrefs.length > 0;
  if (viaClick) {
    await clickAndMove(page, evLink);
  } else {
    await page.goto(`${S.base}/evidence/${encodeURIComponent(S.chunk)}?run=${encodeURIComponent(S.runId)}`, {
      waitUntil: "domcontentloaded",
    });
  }
  steps.push([`근거${viaClick ? "(클릭)" : "(goto)"}`, new URL(page.url()).pathname]);
  const docU = await clickAndMove(page, page.locator('[data-testid="document-tab"] a[href^="/documents/"]').first());
  steps.push(["문서", docU.pathname]);
  await page
    .locator('[data-testid="document-back"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  const extent = await hitExtent(page, "document-back");
  const shot = `${OUT}/d91-${tag}.png`;
  await page.screenshot({ path: shot });
  const u = await clickAndMove(page, page.locator('[data-testid="document-back"]').first());
  steps.push(["돌아가기", u.pathname + u.search]);
  say({
    axis: tag === "412" ? "4" : "5",
    stage: S.base,
    viewport: `${width}x${height}`,
    steps,
    evLinks: hrefs.length,
    evHref: wantIdx >= 0 ? hrefs[wantIdx] : (hrefs[0] ?? null),
    hit: extent,
    landedOnRun: u.pathname + u.search === `/incidents/${S.incidentId}?run=${S.runId}`,
    shot,
  });
  await ctx.close();
}
await walk(412, 915, "412");
await walk(1440, 900, "1440");

// ── 축 ⑥ 대조군 ────────────────────────────────────────────────────────────────
try {
  const C = await stage(CONTROL);
  say({ axis: "0c", stage: C.base, runId: C.runId, incidentId: C.incidentId, chunk: C.chunk, mode: C.mode });
  {
    const ctx = await ctxFor(C, { withSession: true });
    const page = await ctx.newPage();
    await page.goto(`${C.base}/evidence/${encodeURIComponent(C.chunk)}?run=${encodeURIComponent(C.runId)}`, {
      waitUntil: "domcontentloaded",
    });
    const link = page.locator('[data-testid="document-tab"] a[href^="/documents/"]');
    const href = (await link.count()) > 0 ? await link.first().getAttribute("href") : null;
    say({
      axis: "6-1",
      stage: C.base,
      href,
      carriesRun: !!href && href.includes(`run=${C.runId}`),
      evidenceBackToRun: await page.locator('[data-testid="evidence-back-to-run"]').count(),
    });
    await ctx.close();
  }
  await backColumn(C, "a run+highlight·세션", { withSession: true, highlight: true, run: true });
  await backColumn(C, "b highlight만·세션", { withSession: true, highlight: true, run: false });
  await backColumn(C, "c 둘다없음·세션", { withSession: true, highlight: false, run: false });
} catch (e) {
  say({ axis: "6", stage: CONTROL, error: String(e).slice(0, 200) });
}

await browser.close();
console.log(JSON.stringify({ done: rows.length }));
