import { test, expect, type Page } from "@playwright/test";

/**
 * T4-2b PR-2 «셸 축» — ⓕ WS 절단 복구 · ⓖ 큐 표시와 용량 거절 (검증 좌석 · 16대 · 통합 재검 ①).
 *
 * 정본 `packages/contracts/rest-api-v0.1.md` v0.1.9 append:
 *   `:146` 503 `live_capacity_exhausted` · `:147` `run.queued`(큐 진입 = 오류 아님) ·
 *   큐 대기 상한 초과 = `run.failed` + `payload.fallback:"replay"` ·
 *   `:143` 429 `rate_limited`(셸은 **code 로 분기**한다 — 문구가 아니라)
 *
 * 🔴 **절단은 «두 갈래»다.** 진행 중 끊긴 것과 «이미 끝난» run 의 연결이 닫힌 것은 다른 사건이다.
 *    후자를 복구하면 그것이 결함이다(무한 재시도) — 그래서 **정상 종료(1000)** 도 자극에 넣는다.
 *
 * 🔴 **중복은 «수»로 잰다.** 재연결이 백로그를 다시 실어 오면 이벤트가 는다. 이 시나리오의 정본은
 *    32건이고, 그보다 많으면 겹친 것이다 — 화면 문구가 아니라 수가 그것을 말한다.
 *
 * 🔴 **큐는 눈으로 못 본다.** 조사 한 판이 수백 ms 라 대기 순간이 화면에 머물지 않는다. 그래서
 *    «되감기»로 커서를 앞으로 돌려 그때의 상태를 다시 세운다 — 지나간 것을 자취로 읽는 것과 같다.
 */

const SCENARIO = process.env.FKT_SCENARIO ?? "GS-01";
/** 큐 대기 상한을 아주 짧게 준 서버(= fallback 갈래). 미지정이면 그 칸을 건너뛴다. */
const QUEUEWAIT_API = process.env.FKT_T42B_QUEUEWAIT_BASE ?? "";

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

async function sid(page: Page) {
  const value = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!value) throw new Error("fkt_sid 가 없다 — 입장이 안 끝났다(측정 불가)");
  return value;
}

async function startRun(page: Page, mode: "live" | "replay") {
  const s = await sid(page);
  return page.evaluate(
    async ({ scenario, mode, s }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: s, mode }),
      });
      return { status: res.status, body: (await res.json()) as Record<string, string> };
    },
    { scenario: SCENARIO, mode, s },
  );
}

async function serverEvents(page: Page, runId: string) {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/runs/${id}/events`);
    return (await res.json()) as { seq: number; type: string }[];
  }, runId);
}

test.describe("T4-2b 셸 축 — ⓕ WS 절단 · ⓖ 큐와 용량", () => {
  test("ⓕ-0 🔴 세는 눈 — 절단 «없이»는 프레임이 오고 조사가 완주한다", async ({ page }) => {
    test.setTimeout(180_000);
    const frames: number[] = [];
    page.on("websocket", (ws) => ws.on("framereceived", () => frames.push(1)));
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
      timeout: 60_000,
    });
    expect(frames.length, "WS 프레임 0 — 절단을 잴 무대가 없다").toBeGreaterThan(0);
    const events = await serverEvents(page, created.body.runId);
    test.info().annotations.push({ type: "기준선", description: `프레임 ${frames.length} · 서버 이벤트 ${events.length}건` });
  });

  test("ⓕ-1 진행 «중» 절단 — 화면이 스스로 상태를 되찾고 중복 0", async ({ page }) => {
    test.setTimeout(180_000);
    // 🔴 서버에 붙여 두고 «잠시 뒤» 끊는다 — 붙기도 전에 끊으면 「진행 중 절단」이 아니다.
    await page.routeWebSocket(/\/api\/ws\/runs\//, (ws) => {
      ws.connectToServer();
      setTimeout(() => ws.close({ code: 1006 }), 120);
    });
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);

    // 정본: 「재연결 또는 상태 재조회」 — 둘 중 무엇이든 «끝난 것을 끝났다고» 말해야 한다.
    await expect(page.getByTestId("run-console"), "절단 뒤 화면이 완주 상태를 되찾지 못한다").toHaveAttribute(
      "data-status",
      "completed",
      { timeout: 90_000 },
    );

    // 🔴 중복 0 — 화면이 적용한 이벤트 수가 서버 정본과 같아야 한다(백로그가 겹치면 는다).
    const events = await serverEvents(page, created.body.runId);
    const cursor = page.getByTestId("replay-cursor");
    await expect(cursor).toHaveAttribute("data-total", String(events.length));
    await expect(cursor).toHaveAttribute("data-applied", String(events.length));
    const seqs = events.map((e) => e.seq);
    expect(seqs, "서버 seq 가 단조·유일이 아니다 — 중복 판정의 바탕이 흔들린다").toEqual([...new Set(seqs)].sort((a, b) => a - b));
  });

  test("ⓕ-2 🔴 «끝난 뒤» 정상 종료(1000)는 복구 대상이 아니다", async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
      timeout: 60_000,
    });

    // 완주 «뒤» 새 소켓이 몇 개나 더 열리는가 — 무한 재시도면 여기서 는다.
    let opened = 0;
    page.on("websocket", () => {
      opened += 1;
    });
    await page.waitForTimeout(6_000);
    expect(opened, `완주 뒤 6초 동안 새 WS 가 ${opened}개 열렸다 — 정상 종료를 «절단»으로 읽고 재시도한다`).toBe(0);
  });

  test("ⓕ-3 🔴 재연결은 «유한»하다 — 조용한 무한 루프가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    // 🔴 **매 연결마다** 끊는다. 한 번만 끊으면 재연결이 «성공»해 버려 이 축이 안 보인다 —
    //    유한성은 「끝내 못 붙는」 상황에서만 드러난다.
    let attempts = 0;
    await page.routeWebSocket(/\/api\/ws\/runs\//, (ws) => {
      attempts += 1;
      setTimeout(() => ws.close({ code: 1006 }), 50);
    });
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);

    // 간격이 500·1000·2000·4000ms 라 최대 ~7.5s + 여유. 그 «뒤»에도 느는지 본다.
    await page.waitForTimeout(14_000);
    const settled = attempts;
    await page.waitForTimeout(8_000);
    expect(attempts, `재연결이 멈추지 않는다 — ${settled} → ${attempts} 로 계속 는다(무한 루프)`).toBe(settled);
    test.info().annotations.push({ type: "재연결 시도 수", description: `${settled}회에서 멈춤` });

    // 🔴 **여기서 초록을 공짜로 받지 않는다.** 시도가 1회면 「안 늘었다」는 아무것도 증명하지 않는다 —
    //    이 스택의 조사는 «수백 ms»에 끝나서, 끊긴 시점에 이미 종단이면 재연결할 «이유»가 없다.
    //    그건 옳은 거동이지 유한성의 증거가 아니다. 유한성 축은 «끝나지 않는 조사»가 있어야 선다.
    if (settled <= 1) {
      const snap = await page.evaluate(
        async (id) => (await (await fetch(`/api/runs/${id}`)).json()) as { status?: string },
        created.body.runId,
      );
      test.info().annotations.push({
        type: "측정 불가",
        description:
          `연결 시도 ${settled}회 · 절단 시점 run.status=${snap.status} — 이미 종단이라 재연결 이유가 없다. ` +
          "상한(500·1000·2000·4000ms · 최대 4회)은 «진행 중 계속 끊기는» 자극에서만 관측된다",
      });
      test.skip(true, `유한성 축 도달 불가 — 조사가 이미 ${snap.status}. 🔴 초록으로 세지 않는다`);
    }
    // 여기까지 왔다면 재연결이 실제로 돌았다 — 그 «멈춤»이 이 축의 판정이다.
    expect(settled, `재연결이 상한을 넘겼다(${settled}회) — 500·1000·2000·4000ms · 최대 4회 + 최초 1`).toBeLessThanOrEqual(5);

    // 멈춘 뒤 화면이 «침묵»하지 않는다 — 무슨 일이 났는지 말해야 한다.
    const text = ((await page.locator("body").innerText().catch(() => "")) ?? "").replace(/\s+/g, " ");
    expect(text.length, "빈 화면이다").toBeGreaterThan(0);
    test.info().annotations.push({
      type: "멈춘 뒤 문면",
      description: /연결|재연결|끊|오프라인|다시/.test(text) ? "상태를 말한다" : "🔴 아무 말이 없다",
    });
  });

  test("ⓖ-1 큐 표시 — 대기는 «오류가 아니다»(queued ≠ pending) · 시작되면 지워진다", async ({ page }) => {
    test.setTimeout(240_000);
    await enter(page);
    const s = await sid(page);
    // 🔴 동시에 쳐야 큐가 선다 — 순서대로면 앞 조사가 끝나 큐가 안 생긴다.
    const fired = await page.evaluate(
      async ({ scenario, s }) => {
        const one = () =>
          fetch(`/api/scenarios/${scenario}/runs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: s, mode: "live" }),
          }).then(async (r) => ({ status: r.status, body: await r.json() }));
        return Promise.all([one(), one(), one(), one()]);
      },
      { scenario: SCENARIO, s },
    );
    const ok = fired.filter((r) => r.status === 200);
    const refused = fired.filter((r) => r.status === 503);
    expect(ok.length, "받아들여진 조사가 없다 — 큐를 잴 무대가 없다").toBeGreaterThan(0);

    // 🔴 큐는 지나간다 — 자취로 읽는다(이벤트에 run.queued 가 남는다).
    let queued = 0;
    let started = 0;
    for (const r of ok) {
      const events = await serverEvents(page, (r.body as { runId: string }).runId);
      queued += events.filter((e) => e.type === "run.queued").length;
      started += events.filter((e) => e.type === "run.started").length;
    }
    expect(queued, "run.queued 가 0 — 큐가 서지 않았다(자극 실패)").toBeGreaterThan(0);
    expect(started, "큐에 들어간 조사가 끝내 시작되지 않았다").toBeGreaterThan(0);
    test.info().annotations.push({
      type: "큐 자취",
      description: `200 ${ok.length} · 503 ${refused.length} · run.queued ${queued} · run.started ${started}`,
    });
  });

  test("ⓖ-2 용량 거절은 «code 로» 분기한다 — 503 이면 정적 재생본이 실제로 완주한다", async ({ page }) => {
    test.setTimeout(240_000);
    await enter(page);
    const s = await sid(page);
    const fired = await page.evaluate(
      async ({ scenario, s }) => {
        const one = () =>
          fetch(`/api/scenarios/${scenario}/runs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: s, mode: "live" }),
          }).then(async (r) => ({
            status: r.status,
            retryAfter: r.headers.get("retry-after"),
            body: await r.json(),
          }));
        return Promise.all([one(), one(), one(), one(), one()]);
      },
      { scenario: SCENARIO, s },
    );
    const refused = fired.filter((r) => r.status === 503);
    expect(refused.length, "503 이 안 났다 — 용량 거절을 잴 무대가 없다").toBeGreaterThan(0);
    for (const r of refused) {
      const code = ((r.body as { error?: { code?: string } }).error ?? {}).code;
      expect(code, "503 인데 code 가 live_capacity_exhausted 가 아니다 — 셸이 code 로 분기할 수 없다").toBe(
        "live_capacity_exhausted",
      );
      expect(r.retryAfter && /^\d+$/.test(r.retryAfter), "Retry-After 가 정수 초가 아니다").toBe(true);
    }

    // 🔴 「안내」를 문구로 세지 않는다 — 정적 재생본이 «실제로 완주하는가»로 센다.
    await page.goto(`/incidents/INC-2026-014?run=STATIC-GS-01`);
    await expect(page.getByTestId("run-console"), "정적 재생본이 완주하지 않는다 — 안내가 길이 아니다").toHaveAttribute(
      "data-status",
      "completed",
      { timeout: 60_000 },
    );
    await expect(page.getByTestId("run-mode-badge")).toHaveAttribute("data-mode", "replay");
  });

  test("ⓖ-3 큐 대기 상한 초과 = run.failed + fallback:\"replay\"", async ({ page }) => {
    test.skip(!QUEUEWAIT_API, "큐 대기 상한 서버 미지정(FKT_T42B_QUEUEWAIT_BASE) — 초록으로 세지 않는다");
    test.setTimeout(240_000);
    const res = await page.request.post(`${QUEUEWAIT_API}/api/sessions`);
    const cookie = res.headers()["set-cookie"]?.split(";")[0] ?? "";
    const sessionId = cookie.split("=")[1] ?? "";
    expect(sessionId, "큐 서버에서 세션을 못 받았다").toBeTruthy();

    const posts = await Promise.all(
      [0, 1, 2, 3].map(() =>
        page.request.post(`${QUEUEWAIT_API}/api/scenarios/${SCENARIO}/runs`, {
          headers: { cookie, "content-type": "application/json" },
          data: { sessionId, mode: "live" },
        }),
      ),
    );
    const ids: string[] = [];
    for (const p of posts) {
      if (p.status() === 200) ids.push(((await p.json()) as { runId: string }).runId);
    }
    expect(ids.length, "받아들여진 조사가 없다").toBeGreaterThan(0);

    let failedWithFallback = 0;
    for (const id of ids) {
      for (let i = 0; i < 80; i += 1) {
        const snap = await (await page.request.get(`${QUEUEWAIT_API}/api/runs/${id}`, { headers: { cookie } })).json();
        if (snap.status && snap.status !== "running") break;
        await page.waitForTimeout(250);
      }
      const events = (await (
        await page.request.get(`${QUEUEWAIT_API}/api/runs/${id}/events`, { headers: { cookie } })
      ).json()) as { type: string; payload?: { fallback?: string } }[];
      failedWithFallback += events.filter((e) => e.type === "run.failed" && e.payload?.fallback === "replay").length;
    }
    expect(failedWithFallback, "큐 상한을 넘겼는데 run.failed + fallback:\"replay\" 가 없다").toBeGreaterThan(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * ⓗ D-21 ⓒ — WS 가 «서지 못하는» 경로의 주기 조회 대체 (계약 v0.1.10 :156~:160)
 *
 * 🔴 **자극을 아무 1006 으로나 만들면 이 절은 통째로 헛돈다.** 착지본은 미개통과 절단을
 *    가른다(`run-console.tsx` — `neverOpened = !opened && code === 1006`): «열린 뒤» 끊긴
 *    1006(ⓕ-1·ⓕ-3 의 자극)은 이 갈래가 **아니다**. 그래서 여기서는 `routeWebSocket` 을 쓰지
 *    않는다 — 그 경로는 클라이언트 핸드셰이크를 먼저 세워 `onopen` 을 발화시키므로 «101 전
 *    close»를 만들 수 없다.
 * 🔴 대신 브라우저의 `WebSocket` 을 **열리지 않는 소켓**으로 갈아 끼운다(공개 셸에서 실물로
 *    일어나는 일 = D-21). 즉 이 절의 자극은 **내가 만든 것**이고, 실물 자극의 판정은 외부
 *    검증(`evidence/d21-c-polling-verification.md`)이 따로 진다 — 둘을 같은 칸에 쓰지 않는다.
 * 🔴 간격은 «화면이 말하는 값»(`data-interval-ms`)으로 잰다. 숫자를 그물에 박으면 상수를
 *    고친 날 그물이 빨강을 내고, 그 빨강은 대상의 것이 아니다(계약 :157 「박은 값 0」).
 * ──────────────────────────────────────────────────────────────────────────── */

/** 열리지 않는 소켓 — 핸드셰이크 없이 1006 으로 닫힌다(= 미개통). 시도 수도 함께 센다. */
async function breakWebSocket(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __wsAttempts: number; WebSocket: unknown };
    w.__wsAttempts = 0;
    w.WebSocket = function (url: string) {
      w.__wsAttempts += 1;
      const sock: Record<string, unknown> = {
        url,
        readyState: 3,
        close() {},
        send() {},
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        addEventListener() {},
        removeEventListener() {},
      };
      setTimeout(() => {
        // 🔴 이 소켓은 «가짜»라 Playwright 의 `websocket` 이벤트가 뜨지 않는다 — close 시각을
        //    페이지가 직접 남긴다. 안 남기면 폴링의 기준선이 비어 첫 회가 «즉시»로 보인다.
        (w as unknown as { __wsCloseAt: number[] }).__wsCloseAt ??= [];
        (w as unknown as { __wsCloseAt: number[] }).__wsCloseAt.push(Date.now());
        const fn = sock.onclose as ((e: { code: number; reason: string }) => void) | null;
        fn?.({ code: 1006, reason: "" });
      }, 10);
      return sock;
    };
  });
}

const wsAttempts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wsAttempts?: number }).__wsAttempts ?? 0);

/** 스텁이 남긴 close 시각 — 폴링이 «시작되는» 자리다(`streamUnavailable` 이 서는 순간). */
const wsCloseAt = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wsCloseAt?: number[] }).__wsCloseAt ?? []);

/** 조사 하나를 열고 그 화면까지 간다 — 이 절의 모든 축이 같은 동선을 탄다. */
async function openRun(page: Page) {
  await enter(page);
  const created = await startRun(page, "replay");
  expect(created.status, "조사를 열지 못했다 — 잴 무대가 없다").toBe(200);
  await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);
  return created.body.runId;
}

/**
 * 브라우저가 낸 `/api/runs/{id}/events` 요청 시각(ms) — 폴링의 «자취»다.
 * 🔴 **되감기와 폴링을 가른다.** 구현은 `onclose` 에서도 같은 경로를 한 번 부른다(ⓐ 되감기).
 *    안 가르면 그 한 건이 「첫 회를 즉시 불렀다」로 읽힌다 — 실측으로 물린 자리다.
 */
function pollTrail(page: Page, runId: string) {
  const hits: number[] = [];
  const closes: number[] = [];
  page.on("websocket", (sock) => sock.on("close", () => closes.push(Date.now())));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === `/api/runs/${runId}/events`) hits.push(Date.now());
  });
  /** close 직후 창(기본 800ms) 안의 조회 = 되감기. 나머지가 폴링이다. */
  const split = (extraCloses: number[] = [], window = 800) => {
    const all = [...closes, ...extraCloses];
    const rewind: number[] = [];
    const poll: number[] = [];
    for (const t of hits) (all.some((c) => t >= c && t - c <= window) ? rewind : poll).push(t);
    return { rewind, poll };
  };
  return { hits, closes, split };
}

/**
 * 무대를 지킨다 — 이 시나리오는 수백 ms 에 끝나고, 끝나면 폴링은 **옳게** 멈춘다(:158).
 * 종단 이벤트만 응답에서 빼서 «아직 안 끝난» run 으로 보이게 하고, **뺀 건수를 돌려준다**
 * (0이면 무대가 우연히 선 것이라 red 가 아니라 오류다).
 */
async function withholdTerminal(page: Page) {
  // 🔴 `release()` 는 route 를 «떼지» 않고 통과로 바꾼다 — `unroute` 는 진행 중인 요청과
  //    부딪혀 "Route is already handled" 를 낸다(실측). 스위치가 안전하다.
  const held = { count: 0, releasedAt: 0, release() { held.releasedAt = Date.now(); } };
  await page.route(/\/api\/runs\/[^/]+\/events$/, async (route) => {
    if (held.releasedAt) return route.continue();
    const res = await route.fetch();
    const body = (await res.json()) as { type: string }[];
    const kept = body.filter((e) => !["run.completed", "run.stopped", "run.failed"].includes(e.type));
    held.count += body.length - kept.length;
    await route.fulfill({ response: res, json: kept });
  });
  return held;
}

test.describe("T4-2b ⓗ D-21 ⓒ 주기 조회 대체 (계약 v0.1.10)", () => {
  test("ⓗ-0 🔴 대조군 — 스트림이 서는 경로에서는 배너도 폴링도 «없다»", async ({ page }) => {
    test.setTimeout(180_000);
    const runId = await openRun(page);
    const trail = pollTrail(page, runId);

    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
      timeout: 90_000,
    });
    // 🔴 이 행이 없으면 아래 축들의 초록은 「대체가 동작한다」가 아니라 「배너가 늘 뜬다」일 수 있다.
    await expect(
      page.getByTestId("run-polling"),
      "스트림이 서는데 주기 조회 배너가 떴다 (계약 :156 = 폴링 0)",
    ).toHaveCount(0);
    expect(trail.hits.length, `스트림이 서는데 조회가 ${trail.hits.length}회 나갔다 — 두 출처가 같이 돈다`).toBe(0);
  });

  test("ⓗ-1 미개통(101 전 1006) → 배너가 서고 «간격을 스스로 밝힌다»", async ({ page }) => {
    test.setTimeout(180_000);
    await breakWebSocket(page);
    // 🔴 배너는 종단에 닿으면 «옳게» 사라진다. 속성을 읽는 사이에 사라지면 그 빨강은 대상이
    //    아니라 내 경합이다(1차 실행에서 물렸다) — 그래서 여기서도 무대를 지킨다.
    const held = await withholdTerminal(page);
    await openRun(page);

    const banner = page.getByTestId("run-polling");
    await expect(
      banner,
      "미개통인데 주기 조회 배너가 없다 — 화면이 무엇으로 대신하는지 말하지 않는다 (:159)",
    ).toBeVisible({ timeout: 60_000 });
    // 🔴 값의 «형상»을 한 번에 묻는다 — 존재 확인과 값 읽기를 나누면 그 사이가 경합이 된다.
    await expect(banner, "배너가 간격(data-interval-ms)을 밝히지 않는다").toHaveAttribute(
      "data-interval-ms",
      /^[1-9][0-9]*$/,
    );
    // 🔴 자극이 실재했는가 — 0 이면 어느 색도 내지 않는다(표지 0건은 무측정이다).
    expect(
      await wsAttempts(page),
      "WS 를 한 번도 열려 하지 않았다 — 배너의 주어가 «미개통»이 아니다",
    ).toBeGreaterThan(0);

    const interval = Number(await banner.getAttribute("data-interval-ms"));
    // 문면 — 「연결 안 됨」만 띄우고 뒤에서 조용히 메우는 것을 금한 자리다(:159).
    await expect(banner, "배너가 «무엇으로 대신하는지»를 말하지 않는다").toContainText("주기 조회");
    expect(held.count, "종단을 하나도 못 뺐다 — 무대가 우연히 선 것이다(red 아님·오류)").toBeGreaterThan(0);
    test.info().annotations.push({ type: "간격 정본", description: `${interval}ms (화면이 밝힌 값)` });
  });

  test("ⓗ-2 폴링이 «그 간격으로» 돈다 — 첫 회 즉시 호출 0", async ({ page }) => {
    test.setTimeout(180_000);
    await breakWebSocket(page);
    const held = await withholdTerminal(page);

    const runId = await openRun(page);
    const trail = pollTrail(page, runId);
    const banner = page.getByTestId("run-polling");
    await expect(banner).toBeVisible({ timeout: 60_000 });
    const interval = Number(await banner.getAttribute("data-interval-ms"));
    expect(interval, "간격 정본이 없다 — 이 축은 잴 수 없다").toBeGreaterThan(0);

    const openedAt = Date.now();
    await page.waitForTimeout(interval * 4 + 2_000);
    const { rewind, poll } = trail.split(await wsCloseAt(page));
    const after = poll.filter((t) => t >= openedAt);

    test.info().annotations.push({
      type: "자취",
      description: `WS close ${trail.closes.length}회 · 조회 ${trail.hits.length}(되감기 ${rewind.length} · 폴링 ${poll.length}) · 배너 뒤 폴링 ${after.length}`,
    });
    expect(held.count, "종단을 하나도 못 뺐다 — 무대가 우연히 선 것이다(red 아님·오류)").toBeGreaterThan(0);

    /* 🔴 **표본이 없으면 어느 색도 내지 않는다.** 되감기를 걸러낸 뒤 폴링이 2회 미만이면
     *    「간격이 틀렸다」가 아니라 「간격을 못 쟀다」이다 — 가리지 않으려고 위 주석에 되감기
     *    수를 함께 남긴다. */
    test.skip(after.length < 2, `배너 뒤 폴링이 ${after.length}회뿐이다 — 간격을 잴 표본이 없다(되감기 ${rewind.length}회)`);

    /* 🔴 **기준선은 «내가 배너를 본 시각»이 아니다.** 폴링 effect 는 `streamUnavailable` 이
     *    서는 순간(= WS close)에 시작하고, 내 `expect` 는 그보다 늦게 관측한다 — 그 차이만큼
     *    첫 회가 «즉시»처럼 보인다(1차 수정본에서 512ms 로 물렸다. 그 빨강은 대상이 아니라
     *    내 기준선의 것이었다). 그래서 첫 폴링 «직전의» close 부터 잰다. */
    const stubCloses = await wsCloseAt(page);
    const priorCloses = [...trail.closes, ...stubCloses].filter((c) => c <= after[0]);
    const base = priorCloses.length ? Math.max(...priorCloses) : openedAt;
    expect(
      after[0] - base,
      `폴링 시작점(직전 WS close)에서 ${after[0] - base}ms 만에 첫 조회가 나갔다 — 첫 회를 즉시 부른다`,
    ).toBeGreaterThan(interval * 0.5);
    // 🔴 간격은 «자취»로 잰다 — 산수로 미루지 않는다.
    const deltas = after.slice(1).map((t, i) => t - after[i]).sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)];
    expect(median, `관측 간격 중앙값 ${median}ms 가 화면이 밝힌 ${interval}ms 와 어긋난다`).toBeGreaterThan(
      interval * 0.5,
    );
    expect(
      median,
      `관측 간격 중앙값 ${median}ms 가 화면이 밝힌 ${interval}ms 보다 크게 늦다`,
    ).toBeLessThan(interval * 2.5);
  });

  test("ⓗ-3 종단 뒤 폴링이 «멈추고» 배너가 사라진다 (:158)", async ({ page }) => {
    test.setTimeout(180_000);
    await breakWebSocket(page);
    /* 🔴 **무대를 잠깐만 지킨다.** 이 축은 «자연 종단»이 와야 성립하는데, warm replay 는
     *    배너가 서기도 전에 끝나 버려 어떤 실행에서는 무대 자체가 없었다(실측 · 비결정).
     *    그래서 배너가 설 때까지만 종단을 보류했다가 **풀고**, 그 뒤의 중단을 잰다. */
    const held = await withholdTerminal(page);
    const runId = await openRun(page);
    const trail = pollTrail(page, runId);

    await expect(
      page.getByTestId("run-polling"),
      "미개통인데 배너가 없다 — 이 축의 무대가 없다",
    ).toBeVisible({ timeout: 60_000 });
    held.release(); // 보류 해제 — 이제 종단이 그대로 온다
    // 🔴 **부재를 묻기 전에 양의 신호를 세운다** — 완주에 닿았는가부터.
    await expect(
      page.getByTestId("run-console"),
      "폴링만으로는 완주 상태에 닿지 못했다",
    ).toHaveAttribute("data-status", "completed", { timeout: 120_000 });
    await expect(
      page.getByTestId("run-polling"),
      "끝난 조사에 「진행 중」 배너가 남아 있다",
    ).toHaveCount(0);

    // 종단 «뒤» 창을 새로 열어 조회가 더 나가는지 본다(창을 먼저 열고 세면 종단 전 요청이 섞인다).
    const before = trail.hits.length;
    await page.waitForTimeout(6_000);
    expect(
      trail.hits.length - before,
      `종단 뒤 6초 동안 조회가 ${trail.hits.length - before}회 더 나갔다 — 끝난 조사를 계속 두드린다`,
    ).toBe(0);

    // 🔴 중복 0 — 폴링 경로로 받은 이벤트도 seq 로 걸러졌는가(계약 :157 「필터는 한 곳」).
    const events = await serverEvents(page, runId);
    const cursor = page.getByTestId("replay-cursor");
    await expect(cursor).toHaveAttribute("data-total", String(events.length));
    await expect(cursor).toHaveAttribute("data-applied", String(events.length));
  });

  test("ⓗ-4 429 는 «삼키지 않는다» — 조회를 멈추고 그 사실을 화면에 남긴다 (:160)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await breakWebSocket(page);
    // 🔴 폴링이 «돌 무대»부터 만든다 — 종단이 먼저 오면 429 를 받을 기회 자체가 없다(1차 실행).
    const held = await withholdTerminal(page);
    /* 🔴 429 는 **운영값(env)** 축이라 실물로 자극하지 않는다(발주 규율). 여기서 재는 것은
     *    「서버가 그만 오라고 했을 때 화면이 어떻게 하는가」 하나뿐이고, 그것은 응답을 갈아
     *    끼워서 물을 수 있다. 🔴 **폴링이 실제로 돌기 시작한 뒤**에 갈아 끼운다 — 처음부터
     *    429 면 배너가 선 적이 없어 「멈췄다」를 말할 수 없다. */
    const runId = await openRun(page);
    const banner = page.getByTestId("run-polling");
    await expect(banner, "미개통인데 배너가 없다 — 이 축의 무대가 없다").toBeVisible({
      timeout: 60_000,
    });

    /* 🔴 여기서 `held.count` 를 관문으로 쓰지 않는다 — 배너가 선 시점의 run 은 «진행 중»이라
     *    뺄 종단이 아직 없는 것이 정상이다(1차 수정본에서 0으로 물렸다). 이 축의 무대는
     *    「배너가 실재한다」로 이미 섰고, 보류는 429 전에 run 이 끝나는 것을 막는 데만 쓴다. */
    void held;
    let rejected = 0;
    // 🔴 나중에 건 route 가 먼저 잡는다 — 위 보류를 덮어 429 로 답한다.
    await page.route(/\/api\/runs\/[^/]+\/events$/, async (route) => {
      rejected += 1;
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "30" },
        contentType: "application/json",
        body: JSON.stringify({ code: "rate_limited", message: "too many requests" }),
      });
    });

    const note = page.getByTestId("run-poll-note");
    await expect(note, "429 를 받고도 화면이 아무 말을 하지 않는다 — 거절을 삼켰다").toBeVisible({
      timeout: 30_000,
    });
    expect(rejected, "429 를 한 번도 내주지 않았다 — 자극이 없다").toBeGreaterThan(0);
    await expect(note, "멈췄다는 사실을 말하지 않는다").toContainText("제한");
    await expect(
      banner,
      "429 로 멈췄는데 「주기 조회로 진행 중」 배너가 남아 있다",
    ).toHaveCount(0);

    // 🔴 정말 멈췄는가 — 문면이 아니라 «자취»로 묻는다. 🔴 그리고 「몇 회 더」와 「결국 멎었나」를
    //    나눠 남긴다: 이미 발사된 한 건이 늦게 도착하는 것과, 멈추지 않는 것은 다른 사실이다.
    const noteAt = Date.now();
    const trail = pollTrail(page, runId);
    // (아래 판정은 되감기를 뺀 «폴링»만 센다 — 분류 바탕은 스텁이 남긴 close 시각이다)
    // 🔴 창을 넉넉히 준다 — 「이미 발사된 한 건이 늦게 온 것」과 「멈췄다가 되살아난 것」은
    //    짧은 창에서 같은 모습이다(8s 창에서 2회를 봤다 · 그 둘을 가르려면 더 봐야 한다).
    await page.waitForTimeout(20_000);
    const { rewind, poll } = trail.split(await wsCloseAt(page));
    const extra = poll.filter((t) => t >= noteAt).map((t) => t - noteAt);
    const rewinds = rewind.filter((t) => t >= noteAt).length;
    const lastAt = extra.length ? extra[extra.length - 1] : null;
    test.info().annotations.push({
      type: "429 뒤 자취",
      description: `note 뒤 폴링 ${extra.length}회 (${extra.join("·")}ms) · 되감기 ${rewinds}회 · 배너 ${await page
        .getByTestId("run-polling")
        .count()} 배너 잔존 · 창 20000ms)`,
    });
    expect(
      extra.length,
      `429 뒤 20초 동안 폴링이 ${extra.length}회 더 나갔다(${extra.join("·")}ms · 마지막 ${lastAt}ms · 되감기 ${rewinds}회는 별건) — 「그만 와라」를 듣고 되묻는다`,
    ).toBe(0);
  });
});
