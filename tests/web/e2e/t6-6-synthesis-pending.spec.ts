import { test, expect, type Page } from "@playwright/test";

/**
 * T6-6 ③ — 합성 대기 표시(`synthesis-pending`)의 «주어»를 가르는 그물.
 *
 * 발주 문면은 「live 축 `step.started(synthesize)`~`completed` 사이에만 보이고 replay 축에서 0」이다.
 * 그 문장을 그대로 assert 로 옮기면 초록이 무엇의 초록인지 모른다. 처방(#435)의 게이트는 두 겹이라
 * (`showingPast` 먼저, 그 다음 `mode === "replay"`) 한 축에서 둘이 겹치면 어느 쪽이 막았는지 못 가른다.
 * 그래서 **손잡이를 하나씩만 바꾼 네 열**로 세운다:
 *
 *      열   mode    커서      synthesize   기대   이 열이 혼자 말하는 것
 *      ─────────────────────────────────────────────────────────────────────────────
 *      ①   live    꼬리      running      보임   계측기 생존 — 나머지 셋의 공통 대조군
 *      ②   live    꼬리      완주 뒤      0      「영영 남는 표시」를 잡는다
 *      ③   replay  꼬리      running      0      ①과 손잡이 = **mode 하나**
 *      ④   live    되감기    running      0      ①과 손잡이 = **커서 하나**(#435 `4223f9f` 회귀 자리)
 *
 * 🔴 ① 이 빨강이면 ③·④ 의 0 은 아무것도 뜻하지 않는다 — 「막았다」와 「애초에 안 뜬다」가 같은 0 이다.
 *    그래서 ①은 먼저 서고, ③·④ 는 각자 «자기 무대»(synthesize 가 running 인 표본)를 세운 뒤에만 색을 낸다.
 *
 * 🔴 조건에 관한 실측 근거(판정선이 어디서 왔는가):
 *    게이트는 `state.candidates.length === 0 && synthesizing(state, showingPast)` 이고,
 *    `candidates` 는 리듀서(`lib/run-events.ts`)에서 **`run.completed` 에서만** 채워진다 —
 *    즉 synthesize 가 running 인 동안 후보는 언제나 0 이고, 발주 문면(단계 구간)과 실물 조건은
 *    이 앱에서 같은 창을 가리킨다. 문면이 아니라 이 사실을 근거로 축을 세웠다.
 *
 * 🔴 이 그물이 «상대하지 않는» 것: 게이트웨이가 없는 조건에서 잰다(`/live/status.online=false`).
 *    합성은 대본 축으로 돌고 Claude 구독 호출은 0건이다. 그래도 실행 mode 는 강등되지 않는다 —
 *    실측: `online=false` 에서 `POST /runs {mode:"live"}` → `{"mode":"live"}`. ① 의 무대는 그래서 선다.
 */

const SCENARIO = "GS-01";
const SYNTH = "synthesize";
/** 표집 간격. 🔴 창이 짧을 수 있어 촘촘히 뜬다 — 놓친 창은 「없는 창」과 구별되지 않는다. */
const TICK_MS = 100;

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

/** 브라우저 자신이 부른다 — 쿠키·가드를 그대로 지나야 자극이 실재한다(t3-4 와 같은 경로). */
async function startRun(page: Page, mode: "live" | "replay") {
  const sid = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) throw new Error("브라우저에 fkt_sid 가 없다 — 입장이 안 끝났다(측정 불가)");
  return page.evaluate(
    async ({ scenario, mode, sid }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mode }),
      });
      return { status: res.status, body: await res.json() };
    },
    { scenario: SCENARIO, mode, sid },
  );
}

type ServerEvent = { seq: number; type: string; payload: Record<string, unknown> };

async function serverEvents(page: Page, runId: string): Promise<ServerEvent[]> {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/runs/${id}/events`);
    return (await res.json()) as ServerEvent[];
  }, runId);
}

/** 이 페이지가 연 WS 와 받은 프레임을 «세는» 눈 — 자극 실재는 이것으로만 안다. */
function watchSockets(page: Page) {
  const seen = { sockets: 0, frames: 0 };
  page.on("websocket", (ws) => {
    seen.sockets += 1;
    ws.on("framereceived", () => (seen.frames += 1));
  });
  return seen;
}

type Sample = {
  status: string | null;
  synth: string | null;
  applied: string | null;
  pending: number;
  bar: number;
  skeleton: number;
  percent: number | null;
  since: string | null;
};

/**
 * 한 번의 evaluate 로 «같은 순간»의 단계 상태와 표시 수를 함께 뜬다.
 * 🔴 따로 읽으면 둘이 다른 시각의 사실이 되고, 그 표는 아무 창도 증명하지 못한다.
 */
async function sample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const n = (s: string) => document.querySelectorAll(s).length;
    const p = document.querySelector('[data-testid="synthesis-pending"]');
    const step = document.querySelector('[data-testid="run-step"][data-step="synthesize"]');
    const raw = p?.getAttribute("data-percent");
    return {
      status: document.querySelector('[data-testid="run-console"]')?.getAttribute("data-status") ?? null,
      synth: step?.getAttribute("data-state") ?? null,
      applied: document.querySelector('[data-testid="replay-cursor"]')?.getAttribute("data-applied") ?? null,
      pending: n('[data-testid="synthesis-pending"]'),
      bar: n('[data-testid="synthesis-pending-bar"]'),
      skeleton: n('[data-testid="synthesis-pending-skeleton"]'),
      percent: raw === null || raw === undefined ? null : Number(raw),
      since: p?.getAttribute("data-since") ?? null,
    };
  });
}

/** run 이 끝날 때까지 «지켜보며» 표를 남긴다. 한 방 assert 로는 짧은 창을 놓쳤는지 없는지 못 가른다. */
async function watchUntilDone(page: Page, budgetMs: number): Promise<Sample[]> {
  const samples: Sample[] = [];
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const s = await sample(page);
    samples.push(s);
    if (s.status === "completed" || s.status === "failed" || s.status === "stopped") break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(TICK_MS);
  }
  return samples;
}

/** 정해진 시간 동안 표를 뜬다(끝나면 일찍 멈춘다) — 「도는 중」을 잡는 쪽의 표집. */
async function watchFor(page: Page, ms: number): Promise<Sample[]> {
  const samples: Sample[] = [];
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const s = await sample(page);
    samples.push(s);
    if (s.status === "completed" || s.status === "failed" || s.status === "stopped") break;
    await page.waitForTimeout(TICK_MS);
  }
  return samples;
}

/**
 * 🔴 ① 의 무대 장치 — 합성이 «도는 채로 머무는» 조건이 실재하는가.
 *
 * 게이트웨이가 없으면 조사는 대본 축으로 **214ms 만에 완주**한다(실측). 그러면 화면이 그려지기도
 * 전에 끝나 있어 running 표본이 0개가 되고, 그때의 「안 보인다」는 결함이 아니라 정보 0이다
 * (실측: 표집 1개 · running 0개). 그래서 이 축은 hold 스텁을 **밖에서** 세우고 그 사실을 확인한 뒤에만 돈다.
 * 🔴 서버 기동을 이 파일이 하지 않는 이유는 preflight 와 같다 — 무엇을 상대로 쟀는지가 판정의 절반이다.
 */
async function requireHoldStage(page: Page) {
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/live/status");
    return (await res.json()) as { online?: boolean };
  });
  if (!status.online) {
    throw new Error(
      "🔴 무대 없음 — `/api/live/status.online` 이 false 다. 게이트웨이가 없으면 합성은 대본 축으로 " +
        "즉시 끝나고(실측 214ms) 「도는 중」이 존재하지 않는다. 이 축의 빨강은 처방이 아니라 무대의 것이다.\n" +
        "   무대를 세우고 다시 돌려라(구독 0 · 측정 뒤 반드시 내린다):\n" +
        "     node tests/web/_synthesis_hold_server.mjs 8787",
    );
  }
  console.log("   ⓞ 무대 — /live/status.online=true (합성이 붙잡혀 running 으로 머문다 · 구독 호출 0건)");
}

/** 무대를 «거둔다» — 붙잡힌 합성을 풀고 몇 건이었는지 돌려받는다(0건이면 자극이 없던 것이다). */
async function releaseHold(): Promise<number> {
  const url = `${process.env.FKT_SYNTH_HOLD ?? "http://127.0.0.1:8787"}/release`;
  const res = await fetch(url, { method: "POST" });
  const body = (await res.json()) as { released?: number };
  return body.released ?? 0;
}

/**
 * ⓞ 무대 게이트 — 🔴 **이 서버가 «지금 서빙하는 것»에 처방이 실렸는가.**
 *
 * 내 트리에 파일이 있는 것과 저 포트가 그 코드를 주는 것은 다른 사실이다. 이 게이트가 없으면
 * 「안 보인다」를 만났을 때 미착지인지 결함인지 못 가르고, 그 빨강은 구현 좌석에게 가는 오배송이 된다.
 *
 * 🔴 **run 화면을 연 뒤에** 부른다. 라우트 청크는 지연 로드라, 랜딩에서 세면 착지한 처방도 0건으로 읽힌다
 *    (설계 중 실제로 그렇게 오판했다 — 랜딩 청크 9개에 0건이었지만 run 청크에는 있었다).
 */
async function gateStage(page: Page) {
  const shipped = await page.evaluate(async () => {
    const srcs = [...document.querySelectorAll("script[src]")].map((s) => (s as HTMLScriptElement).src);
    let hits = 0;
    for (const src of srcs) {
      try {
        if ((await (await fetch(src)).text()).includes("synthesis-pending")) hits += 1;
      } catch {
        // 못 읽은 청크는 세지 않는다 — 계수가 «낮게» 나올 뿐 높아지지 않는다(게이트가 느슨해지지 않는 방향).
      }
    }
    return { scripts: srcs.length, hits, inHtml: document.documentElement.outerHTML.includes("synthesis-pending") };
  });
  if (shipped.hits === 0 && !shipped.inHtml) {
    throw new Error(
      `🔴 무대 없음 — 이 서버가 서빙하는 run 화면 번들에 \`synthesis-pending\` 이 0건이다(script ${shipped.scripts}개).\n` +
        "   초록도 빨강도 아니다: 처방이 이 빌드에 없다. 재빌드하고 다시 돌려라.\n" +
        "     FKT_API_BASE=http://127.0.0.1:8010 pnpm --dir apps/web-console build",
    );
  }
  console.log(`   ⓞ 무대 — run 화면 번들 적재: script ${shipped.hits}/${shipped.scripts} 청크 · html ${shipped.inHtml}`);
}

/** 되감기로 커서를 `step.started(synthesize)` 직후에 세운다. 세울 자리가 없으면 무대가 없는 것이다. */
async function parkAfterSynthesizeStart(page: Page, events: ServerEvent[]) {
  const idx = events.findIndex((e) => e.type === "step.started" && e.payload?.step === SYNTH);
  if (idx < 0) {
    throw new Error(
      `🔴 무대 없음 — 서버 events 에 step.started(${SYNTH}) 가 0건이다(총 ${events.length}건). ` +
        "되감기로 세울 자리가 없으므로 ④ 는 측정되지 않았다.",
    );
  }
  const target = idx + 1;
  await page.getByTestId("replay-restart").click();
  for (let i = 0; i < target; i += 1) await page.getByTestId("replay-forward").click();
  await expect(page.getByTestId("replay-cursor")).toHaveAttribute("data-applied", String(target));
  return target;
}

/** 표에서 「무대가 섰는가」와 「그 무대에서 몇 번 보였는가」를 함께 뽑는다. */
function stage(samples: Sample[]) {
  const running = samples.filter((s) => s.synth === "running");
  return { running, shown: running.filter((s) => s.pending > 0) };
}

test.describe("T6-6 ③ — 합성 대기 표시", () => {
  test("① live·꼬리: synthesize 가 도는 창에서 보인다 · ② 완주 뒤 0", async ({ page }) => {
    test.slow();
    const ws = watchSockets(page);
    await enter(page);

    await page.getByTestId("start-from-headline").click();
    await page.waitForURL(/\/incidents\/[^/]+\?run=/, { timeout: 30_000 });
    const runId = new URL(page.url()).searchParams.get("run")!;

    await expect(page.getByTestId("run-console")).toBeVisible();
    await gateStage(page);
    await requireHoldStage(page);

    const samples = await watchFor(page, 20_000);
    const { running, shown } = stage(samples);
    console.log(`   ① 표본 ${samples.length} · synthesize=running ${running.length} · 그중 표시 보임 ${shown.length}`);

    // ⓐ 자극 실재 — 0 이면 아래 초록은 「화면이 스냅샷을 그렸다」의 초록이다.
    expect(ws.sockets, "WS 연결 0건 — 실행 축을 스트림으로 잰 것이 아니다").toBeGreaterThanOrEqual(1);

    // ⓑ 무대 — running 표본이 0 이면 ① 은 판정이 아니라 «놓친 창»이다.
    expect(
      running.length,
      `🔴 무대 없음 — synthesize 가 running 인 표본이 0개다(표집 ${TICK_MS}ms · 총 ${samples.length}개). 판정 불가`,
    ).toBeGreaterThan(0);

    // ① 판정
    expect(
      shown.length,
      `🔴 synthesize 가 도는 ${running.length}개 표본 어디에서도 표시가 0건이다 — live 축에서 보이지 않는다`,
    ).toBeGreaterThan(0);

    // 한 벌로 그려지는가 — 바·스켈레톤이 «같은 표본»에 함께 있어야 한다.
    expect(shown.every((s) => s.bar === 1), "표시는 있는데 진행 바가 없는 표본이 있다").toBe(true);
    expect(shown.every((s) => s.skeleton >= 1), "표시는 있는데 스켈레톤 자리표시가 없는 표본이 있다").toBe(true);

    // 정직성 — 끝을 모르는 바가 100 을 그리면 「끝났는데 화면이 멈췄다」로 읽힌다(처방의 자기 선언 = 92 상한).
    expect(
      shown.every((s) => s.percent !== null && s.percent <= 92),
      `진행률이 92 를 넘은 표본이 있다: ${[...new Set(shown.map((s) => s.percent))].join(",")}`,
    ).toBe(true);
    expect(shown.every((s) => s.since === "shown"), "경과 기준(data-since)이 shown 이 아닌 표본이 있다").toBe(true);

    // 서버가 실제로 그 단계를 냈다는 교차 확인 — 화면끼리의 일치로 끝내지 않는다.
    const events = await serverEvents(page, runId);
    expect(
      events.filter((e) => e.type === "step.started" && e.payload?.step === SYNTH).length,
      "서버 events 에 step.started(synthesize) 가 없다 — 화면이 그린 running 은 무엇의 running 인가",
    ).toBe(1);

    // ── ② 소멸 ──────────────────────────────────────────────────────────────────
    // 🔴 보임만 재는 그물은 «영영 남는 표시»도 통과시킨다. 그래서 **자극을 거두고** 다시 센다.
    //
    // 🔴 손잡이로 화면의 「⏸ 중지」를 먼저 골랐다가 물렀다: 합성이 게이트웨이에 붙잡혀 있는 동안
    //    중지는 30초 안에 반영되지 않았고(실측 · 63회 폴링 내내 `data-status="running"`), 그 빨강은
    //    표시의 것이 아니라 **내가 고른 손잡이와 무대가 만든 것**이다. 무대를 거두는 쪽이 이 축의
    //    질문(「도는 것이 끝나면 사라지는가」)에 정확히 대응한다. 중지 축은 이 그물의 주어가 아니다.
    const released = await releaseHold();
    expect(released, "🔴 푼 합성이 0건 — 자극을 거둔 적이 없다. 아래 「사라졌다」는 다른 사건의 초록이다").toBeGreaterThan(0);

    await expect(page.getByTestId("run-console")).not.toHaveAttribute("data-status", "running", { timeout: 60_000 });
    const after = await sample(page);
    console.log(`   ② 자극 거둠(${released}건) 뒤 — status=${after.status} · synthesize=${after.synth} · 표시 ${after.pending}건`);
    expect(after.pending, "합성이 끝났는데 대기 표시가 남아 있다").toBe(0);
    expect(after.bar + after.skeleton, "합성이 끝났는데 대기 바/스켈레톤이 남아 있다").toBe(0);
  });

  test("③ replay·꼬리: 같은 자리에서 0 (①과 손잡이는 mode 하나)", async ({ page }) => {
    test.slow();
    const ws = watchSockets(page);
    await enter(page);

    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    expect(created.body.mode, "replay 를 요청했는데 다른 mode 로 왔다 — 이 열의 손잡이가 무너진다").toBe("replay");
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);
    await expect(page.getByTestId("run-console")).toBeVisible();
    await gateStage(page);

    const samples = await watchUntilDone(page, 120_000);
    const { running, shown } = stage(samples);
    console.log(`   ③ 표본 ${samples.length} · synthesize=running ${running.length} · 그중 표시 보임 ${shown.length}`);

    expect(ws.frames, "WS 프레임 0 — 재생 축을 스트림으로 잰 것이 아니다").toBeGreaterThan(0);
    await expect(page.getByTestId("run-mode-badge")).toHaveAttribute("data-mode", "replay");

    /**
     * 🔴 **이 축은 판정이 아니라 «사실»을 고정한다.** 처음엔 「replay 에서 0」을 판정으로 세우려 했고
     *    실측이 그것을 물렀다: 표본 1개 · running 0개. 재생본은 REST·WS 양쪽에서 즉시 완결돼
     *    꼬리에서 `synthesize=running` 이 «존재하지 않는다». hold 스텁도 걸리지 않는다 —
     *    녹화 재생은 게이트웨이를 부르지 않기 때문이다. 그리고 강등 경로도 없다:
     *    `online:false` 에서 `{mode:"live"}` 요청에 서버는 `{"mode":"live"}` 로 답한다(실측).
     *
     *    ⇒ `mode === "replay"` 게이트는 **관측 가능한 효과가 없다**. 지금 화면에서 replay 표시 차단을
     *      실제로 하는 것은 전부 `showingPast` 이고, 그것은 ⑤ 가 잰다.
     *
     * 🔴 그래서 「0건」을 초록으로 쓰지 않는다 — 빈 결과끼리의 일치는 일치가 아니다. 대신 **무대가
     *    없다는 사실 자체**를 기대값으로 박는다. 재생이 느려지거나 강등이 붙어 무대가 «생기는» 날
     *    이 줄이 빨강이 되고, 그 빨강은 결함이 아니라 「이제 mode 축을 판정할 수 있다」는 신호다.
     */
    expect(
      running.length,
      `replay 꼬리에 synthesize=running 표본이 ${running.length}개 생겼다 — 무대가 생겼다는 뜻이다. ` +
        "이 축을 «사실 고정»에서 «판정»으로 승격하라: running 표본 전부에서 표시 0 을 assert 하면 " +
        "그때 비로소 mode 게이트를 단독으로 귀속할 수 있다.",
    ).toBe(0);
    // 약한 사실 — 무대가 없었으므로 이 0 은 게이트를 증명하지 않는다. 기록만 한다.
    expect(shown.length, "무대가 없는데 표시가 떴다 — 조건 없이 그려지는 표시다").toBe(0);
    console.log("   🔴 ③ 은 판정이 아니다 — replay 꼬리 무대 없음(mode 단독 귀속 불가). 실제 차단은 ⑤(showingPast).");
  });

  test("⑤ replay·되감기: 커서를 synthesize 시작 직후에 세워도 0 (귀속 = showingPast)", async ({ page }) => {
    test.slow();
    await enter(page);

    // 🔴 발주 문면(「replay 축에서 0」)을 실측으로 만족시키는 열은 **이것**이다 — ③ 이 아니라.
    //    다만 여기서 표시를 막는 것은 mode 가 아니라 `showingPast` 다(③ 참조). 두 문이 겹쳐 서 있고,
    //    앞 문이 먼저 막으므로 이 초록의 주어는 **앞 문**이다. 초록에 그 이름을 적어 둔다.
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    expect(created.body.mode).toBe("replay");
    const runId = created.body.runId as string;
    await page.goto(`/incidents/${created.body.incidentId}?run=${runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", { timeout: 60_000 });
    await gateStage(page);

    const events = await serverEvents(page, runId);
    const at = await parkAfterSynthesizeStart(page, events);

    const s = await sample(page);
    expect(
      s.synth,
      `🔴 무대 없음 — 커서를 ${at} 로 세웠는데 synthesize 가 running 이 아니다(state=${s.synth}). 이 0 은 정보 0이다`,
    ).toBe("running");
    console.log(`   ⑤ 커서 ${at}/${events.length} · mode=replay · synthesize=${s.synth} · 표시 ${s.pending}건 (막은 문 = showingPast)`);
    expect(s.pending, "되감긴 replay 에서 대기 표시가 떴다").toBe(0);
    expect(s.bar + s.skeleton, "되감긴 replay 에서 대기 바/스켈레톤이 떴다").toBe(0);
  });

  test("④ live·되감기: 커서를 synthesize 시작 직후에 세워도 0 (①과 손잡이는 커서 하나)", async ({ page }) => {
    test.slow();
    await enter(page);

    const created = await startRun(page, "live");
    expect(created.status).toBe(200);
    expect(created.body.mode, "live 를 요청했는데 강등돼 왔다 — 이 열의 손잡이가 무너진다").toBe("live");
    const runId = created.body.runId as string;
    await page.goto(`/incidents/${created.body.incidentId}?run=${runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", { timeout: 180_000 });
    await gateStage(page);

    const events = await serverEvents(page, runId);
    const at = await parkAfterSynthesizeStart(page, events);

    const s = await sample(page);
    // 🔴 무대 확인이 판정보다 먼저. 이 줄이 없으면 아래 0 은 「안 뜬다」가 아니라 「그 상태가 아니었다」다.
    expect(
      s.synth,
      `🔴 무대 없음 — 커서를 ${at} 로 세웠는데 synthesize 가 running 이 아니다(state=${s.synth}). 이 0 은 정보 0이다`,
    ).toBe("running");
    expect(s.applied, "커서가 세운 자리에 서 있지 않다").toBe(String(at));
    console.log(`   ④ 커서 ${at}/${events.length} · synthesize=${s.synth} · 표시 ${s.pending}건 · 바 ${s.bar} · 스켈레톤 ${s.skeleton}`);

    // ④ 판정 — #435 `4223f9f` 가 닫은 자리(그 커밋의 실측: 되감기 전 커서 28/32 에서 표시 1개).
    expect(
      s.pending,
      "🔴 되감긴 live 실행에서 대기 표시가 떴다 — 도는 것이 없는데 「AI 근거 작성 중」이라 말한다(4223f9f 회귀)",
    ).toBe(0);
    expect(s.bar + s.skeleton, "되감긴 live 실행에서 대기 바/스켈레톤이 떴다").toBe(0);
  });
});
