import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Page } from "@playwright/test";

/**
 * T3-4 «최소 형상» 독립 검증 — 조사 실행 축(② 화면) + 전략 비교(⑤).
 *
 * 🔴 이 그물은 구현 자기 실측을 «참고»로만 두고 전부 다시 센다. 그리고 초록마다 그 초록이
 *    «무엇의» 초록인지를 먼저 세운다:
 *      ⓐ 자극이 실재했는가 — WS 연결 수·이벤트 수를 세고 **0 이면 어느 색도 내지 않는다**
 *      ⓑ 생겼다 ≠ 선다 — 화면에 있는 것과 서버가 낸 것을 «따로» 세어 맞댄다
 *      ⓒ 대조군 — 「없을 때는 안 뜬다」를 같은 표에 둔다
 */

const APP = join(process.cwd(), "..", "..", "apps", "web-console");
const SCENARIO = "GS-01";

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

/**
 * 브라우저 «자신»이 부른다 — 쿠키·가드를 그대로 지나는 경로여야 측정이 실재한다.
 *
 * 🔴 본문 `sessionId` 는 «쿠키와 같아야» 한다(계약 v0.1.6 판정 · 다르면 422). 그래서
 *    지어낸 문자열을 쓰지 않고 브라우저가 쥔 `fkt_sid` 를 그대로 싣는다 — 내가 처음에
 *    지어낸 값을 넣었다가 422 를 받았고, 그 빨강은 대상의 것이 아니라 내 것이었다.
 */
async function startRun(page: Page, mode: "live" | "replay") {
  const sid = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) throw new Error("브라우저에 fkt_sid 가 없다 — 입장이 안 끝났다(측정 불가)");
  return page.evaluate(async ({ scenario, mode, sid }) => {
    const res = await fetch(`/api/scenarios/${scenario}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sid, mode }),
    });
    return { status: res.status, body: await res.json() };
  }, { scenario: SCENARIO, mode, sid });
}

async function serverEvents(page: Page, runId: string) {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/runs/${id}/events`);
    return { status: res.status, events: (await res.json()) as { seq: number; type: string }[] };
  }, runId);
}

/** 이 페이지가 연 WS 와 받은 프레임을 «세는» 눈. 자극이 실재했는지는 이것으로만 안다. */
function watchSockets(page: Page) {
  const seen = { sockets: 0, frames: 0 };
  page.on("websocket", (ws) => {
    seen.sockets += 1;
    ws.on("framereceived", () => (seen.frames += 1));
  });
  return seen;
}

test.describe("T3-4 — 조사 실행 축", () => {
  test("① live: 화면에서 시작 → 완주 (자극 실재 · 5단계 · 근거 누적 · TTAE 경계 · 초안 링크)", async ({
    page,
  }) => {
    test.slow();
    const ws = watchSockets(page);
    await enter(page);

    await page.getByTestId("start-from-headline").click();
    await page.waitForURL(/\/incidents\/[^/]+\?run=/, { timeout: 30_000 });
    const runId = new URL(page.url()).searchParams.get("run")!;

    const console_ = page.getByTestId("run-console");
    await expect(console_).toBeVisible();
    // 🔴 첫 live 는 임베딩 모델 적재가 섞여 느리다(실측: /compare 냉시작 29초). 그 느림은
    //    「완주하지 못한다」가 아니다 — 기다리는 창을 그 사실에 맞춘다(Q-44 회부 자리).
    await expect(console_).toHaveAttribute("data-status", "completed", { timeout: 180_000 });

    // ⓐ 🔴 자극 실재 — 연결도 프레임도 0 이면 아래 초록은 「화면이 스냅샷을 그렸다」의 초록이다.
    expect(ws.sockets, "WS 연결이 0건 — 실행 축을 «스트림»으로 잰 것이 아니다").toBeGreaterThanOrEqual(1);
    expect(ws.frames, "WS 프레임이 0건 — 자극이 없었다").toBeGreaterThan(0);

    // 서버가 낸 것과 화면이 든 것을 «따로» 센다.
    const { status, events } = await serverEvents(page, runId);
    expect(status).toBe(200);
    const cursor = page.getByTestId("replay-cursor");
    await expect(cursor).toHaveAttribute("data-total", String(events.length));
    expect(new Set(events.map((e) => e.seq)).size, "서버 events 에 seq 중복이 있다").toBe(events.length);

    // 단계 5/5
    const done = page.locator('[data-testid="run-step"][data-state="done"]');
    await expect(done).toHaveCount(5);

    // 근거 누적 — 서버가 낸 step.evidence 수와 화면 스트립 수가 같아야 한다(생겼다≠선다).
    const evidenceEvents = events.filter((e) => e.type === "step.evidence").length;
    await expect(page.getByTestId("evidence-strip")).toHaveAttribute(
      "data-count",
      String(evidenceEvents),
    );
    expect(evidenceEvents, "근거가 0건이면 kind 별 축은 잴 것이 없다").toBeGreaterThan(0);
    // kind 별로 갈린다 — 필터가 «종류 수»만큼 선다.
    expect(await page.getByTestId("evidence-filter").count()).toBeGreaterThan(1);

    // 🔴 TTAE §2.2 — 경과는 실측 · 수작업은 꼬리표 · 단축률(%)은 «부재»여야 한다.
    const ttae = page.getByTestId("ttae-row");
    const elapsed = Number(await ttae.getAttribute("data-elapsed-ms"));
    expect(elapsed, "경과가 0 이면 실측이 아니다").toBeGreaterThan(0);
    await expect(ttae).toContainText("잠정 목표 · 미실측");
    expect(await ttae.textContent(), "§2.2 — 실측 전 단축률(%)을 쓰지 않는다").not.toMatch(/\d\s*%/);

    // 초안 링크가 «활성»이다(완료 후).
    await expect(page.getByTestId("work-order-draft")).toBeVisible();
    await expect(page.getByTestId("work-order-draft-pending")).toHaveCount(0);

    // ⓒ 대조군 — 끊김 문구는 «정상 종료»에서는 뜨지 않는다.
    await expect(page.getByTestId("run-note")).toHaveCount(0);
  });

  test("② replay: 배지·문구 · 되감기가 «상태를 그 seq 로 다시 만든다» · 서버 events ≡ 화면", async ({
    page,
  }) => {
    test.slow();
    const ws = watchSockets(page);
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    const runId = created.body.runId as string;
    await page.goto(`/incidents/${created.body.incidentId}?run=${runId}`);

    const console_ = page.getByTestId("run-console");
    await expect(console_).toHaveAttribute("data-status", "completed", { timeout: 60_000 });
    expect(ws.frames, "WS 프레임 0 — 재생 축을 스트림으로 잰 것이 아니다").toBeGreaterThan(0);

    await expect(page.getByTestId("run-mode-badge")).toHaveAttribute("data-mode", "replay");
    await expect(page.getByTestId("ttae-replay-note")).toContainText("재생본 · 원 실행 관측치");

    const { events } = await serverEvents(page, runId);
    const cursor = page.getByTestId("replay-cursor");
    await expect(cursor).toHaveAttribute("data-total", String(events.length));
    await expect(cursor).toHaveAttribute("data-applied", String(events.length));

    // 🔴 되감기 = «상태를 그 seq 값으로 다시 만드는 일». 화면 요소 수가 그 접두사의 사실과 같아야 한다.
    const target = Math.max(1, Math.floor(events.length / 2));
    await page.getByTestId("replay-restart").click();
    for (let i = 0; i < target; i += 1) await page.getByTestId("replay-forward").click();
    await expect(cursor).toHaveAttribute("data-applied", String(target));

    const prefix = events.slice(0, target);
    await expect(page.getByTestId("evidence-strip")).toHaveAttribute(
      "data-count",
      String(prefix.filter((e) => e.type === "step.evidence").length),
    );
    await expect(page.locator('[data-testid="run-step"][data-state="done"]')).toHaveCount(
      prefix.filter((e) => e.type === "step.completed").length,
    );
    await expect(cursor).toContainText(`seq ${prefix[prefix.length - 1].seq}`);

    // 「지금으로」 = 되감기의 반대편. 되돌아왔다는 것까지가 측정이다.
    await page.getByTestId("replay-follow").click();
    await expect(cursor).toHaveAttribute("data-applied", String(events.length));
  });

  /**
   * 🔴 **red 정의를 정본에 맞춘다**(T4-2a ⑧ · 리바이2 16대). 앞판은 「분기 1곳」이라 못 박았는데,
   *    T4-2a 티켓 ⓓ 가 **명시로 요구한** Live 복귀 제안(`run-console.tsx:299`)이 두 번째 분기다.
   *    정본이 시킨 것을 그물이 금지하면 그 빨강은 대상의 것이 아니다 — 넓히는 쪽이 옳다.
   *
   * 🔴 허용은 «줄 번호»가 아니라 **그 분기가 그리는 것**(testid)으로 준다. `isStatic` 을 통째로
   *    허용하면 정적 경로가 분기를 몇 개 더 세워도 이 그물이 못 본다 — 허용 목록은 자기 분기를
   *    가린다. 그래서 아래 «허용 자리가 실재하는가» 불변식을 함께 둔다: 목록이 아무것도 물지
   *    않으면 그물이 죽은 것이므로 초록을 내지 않는다.
   */
  test("🔴 코드 축 — live/replay 렌더 분기는 허용 목록(testid·심볼) 밖 0", async () => {
    const files = [
      "components/incident/run-console.tsx",
      "components/incident/run-panels.tsx",
      "lib/run-events.ts",
    ];
    // ttae-replay-note = TTAE 배지 문구 · live-return-offer = T4-2a ⓓ Live 복귀 «제안»(강제 이동 아님).
    const ALLOW_TESTID = ["ttae-replay-note", "live-return-offer"];
    /**
     * 🔴 **그리지 않는 허용 자리**(T6-2 ③ · #435 승인). 합성 대기 표시의 게이트는 «함수 안의 한 줄»이라
     *    testid 를 달 자리가 없다. 그렇다고 목록에 testid 를 하나 더 얹는 방식으로 통과시키면 그것은
     *    「그리는 것으로 가른다」는 이 규칙의 근거를 버리는 일이고, 위양성 수정은 언제나 **전부 통과시키는
     *    쪽**으로 미끄러진다. 그래서 허용을 «파일 + 함수 이름» 으로 준다:
     *      · 줄 번호가 아니므로 그 함수가 옮겨 다녀도 따라간다
     *      · 다른 파일이나 다른 함수에 같은 분기가 생기면 그대로 잡힌다
     *      · 그 함수 «안»에서 분기가 둘로 늘어도 잡힌다(정확히 1건만 허용)
     *    이 자리가 판 검출력은 브라우저 축이 되사온다 — `t6-6-synthesis-pending.spec.ts` 가
     *    live·꼬리 보임 / replay·꼬리 0 / live·되감기 0 을 손잡이 하나씩 다른 열로 실측한다.
     */
    const ALLOW_SYMBOL = [{ file: "components/incident/run-panels.tsx", fn: "synthesizing" }];

    /** 이 줄을 «감싸는» 최상위 함수 이름. 사이에 최상위 닫힘(`^}`)이 오면 그 함수 밖이다. */
    const enclosingFn = (lines: string[], i: number): string | null => {
      for (let k = i - 1; k >= 0; k -= 1) {
        if (/^\}/.test(lines[k])) return null;
        const m = lines[k].match(/^(?:export\s+)?function\s+(\w+)/);
        if (m) return m[1];
      }
      return null;
    };

    const branches: { at: string; file: string; testid: string | null; fn: string | null }[] = [];
    for (const rel of files) {
      const lines = readFileSync(join(APP, rel), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/mode\s*[=!]==\s*["'](live|replay)["']/.test(line)) return;
        if (line.trim().startsWith("*")) return;
        // 분기가 «여는» 블록의 첫 요소에서 testid 를 읽는다 — 그리는 것으로 가른다.
        const opened = lines.slice(i + 1, i + 4).join("\n");
        branches.push({
          at: `${rel}:${i + 1} ${line.trim()}`,
          file: rel,
          testid: opened.match(/data-testid="([^"]+)"/)?.[1] ?? null,
          fn: enclosingFn(lines, i),
        });
      });
    }
    const allowed = (b: { file: string; testid: string | null; fn: string | null }) =>
      (b.testid !== null && ALLOW_TESTID.includes(b.testid)) ||
      ALLOW_SYMBOL.some((a) => a.file === b.file && a.fn === b.fn);

    const outside = branches.filter((b) => !allowed(b));
    expect(outside.map((b) => b.at), `허용 목록 밖 모드 분기: ${outside.map((b) => b.at).join(" | ")}`).toHaveLength(0);
    // 🔴 허용 자리가 «실재»해야 한다 — 0 을 물면 규칙이 죽은 것이지 통과가 아니다.
    for (const id of ALLOW_TESTID) {
      expect(
        branches.filter((b) => b.testid === id).map((b) => b.at),
        `허용 자리 ${id} 가 실재하지 않는다 — 허용 목록이 아무것도 물지 않았다`,
      ).toHaveLength(1);
    }
    for (const a of ALLOW_SYMBOL) {
      expect(
        branches.filter((b) => b.file === a.file && b.fn === a.fn).map((b) => b.at),
        `허용 자리 ${a.file}:${a.fn}() 가 실재하지 않거나 둘 이상이다 — 심볼 허용은 정확히 한 줄이다`,
      ).toHaveLength(1);
    }
  });

  test("④ graph 근거는 실데이터 체인이다 — 목업 하드코딩 0 · `byRun` 미사용", async ({ page }) => {
    test.slow();
    await enter(page);
    const created = await startRun(page, "replay");
    const runId = created.body.runId as string;
    const { events } = await serverEvents(page, runId);
    const graph = events.filter(
      (e) => e.type === "step.evidence" && (e as never as { payload: { evidence: { kind: string } } }).payload.evidence.kind === "graph-path",
    ) as never as { payload: { evidence: { excerpt: string; sourceId: string } } }[];
    expect(graph.length, "graph-path 근거가 0건 — 체인 축을 잴 것이 없다").toBeGreaterThan(0);
    const excerpt = graph[0].payload.evidence.excerpt;
    // 체인은 «관계로 이어진» 문장이다 — 화살표가 최소 2개(= 2-hop 이상)여야 한다.
    expect((excerpt.match(/→|->/g) ?? []).length, `excerpt: ${excerpt}`).toBeGreaterThanOrEqual(2);

    await page.goto(`/incidents/${created.body.incidentId}?run=${runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("evidence-strip")).toContainText(excerpt.slice(0, 16));

    // `?byRun=` 은 Q-43 이연이다 — 화면이 그 길을 쓰지 않는다는 것을 코드로 확인한다.
    const web = ["components/incident/run-console.tsx", "components/incident/run-panels.tsx"];
    for (const rel of web) expect(readFileSync(join(APP, rel), "utf8")).not.toContain("byRun");
  });

  test("⑤ WS 규율 — 없는 run 은 4404 문구 · 있는 run 에서는 안 뜬다 · 끊겨도 빈 화면 0", async ({
    page,
  }) => {
    test.slow();
    await enter(page);
    await page.goto("/incidents/INC-2025-019?run=RUN-levi2nosuchrun");
    const note = page.getByTestId("run-note");
    await expect(note).toBeVisible({ timeout: 30_000 });
    await expect(note).toContainText("서버가 이 조사를 찾지 못했습니다");
    // 🔴 끊겨도 화면은 서 있다 — 콘솔 자체가 사라지면 그것이 빈 화면이다.
    await expect(page.getByTestId("run-console")).toBeVisible();
    await expect(page.getByTestId("run-controls")).toBeVisible();
  });

  test("⑤ WS 가드 — 무쿠키는 «열리지 않는다»(대조군: 쿠키가 있으면 열린다)", async ({
    page,
    browser,
  }) => {
    test.slow();
    await enter(page);
    const created = await startRun(page, "replay");
    const runId = created.body.runId as string;

    /* 🔴 여기서 한 번 물렸다: `request.get` 에 Upgrade 헤더만 얹어 «핸드셰이크 흉내»를 냈더니
     *    400 이 왔다. 그 400 은 가드의 답이 아니라 **내 손짓이 WS 핸드셰이크가 아니라는**
     *    서버의 답이다 — 계측기의 빨강이었다. 그래서 진짜 브라우저 WebSocket 으로 묻는다:
     *    무쿠키면 핸드셰이크가 거부돼 «열리지 않고», 쿠키가 있으면 열린다. 대조군이 같은
     *    표에 있어야 「무쿠키라서 안 열렸다」가 성립한다.
     */
    const openWs = (p: Page) =>
      p.evaluate(
        (id) =>
          new Promise<{ opened: boolean; code: number | null }>((resolve) => {
            const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/api/ws/runs/${id}`);
            let opened = false;
            const done = (code: number | null) => resolve({ opened, code });
            ws.onopen = () => {
              opened = true;
              ws.close();
            };
            ws.onclose = (e) => done(e.code);
            ws.onerror = () => done(null);
            setTimeout(() => done(null), 10_000);
          }),
        runId,
      );

    const bare = await browser.newContext();
    const barePage = await bare.newPage();
    // 🔴 `/` 로 들어가면 «입장»이 실행돼 쿠키가 생긴다 — 무쿠키를 재려면 읽기 예외 딥링크로 선다.
    await barePage.goto("/evidence/EV-2025-001");
    expect((await bare.cookies()).map((c) => c.name), "무쿠키 조건이 깨졌다").not.toContain("fkt_sid");
    const noCookie = await openWs(barePage);
    await bare.close();

    const withCookie = await openWs(page);
    expect(noCookie.opened, "무쿠키인데 스트림이 열린다 — 가드가 헐겁다").toBe(false);
    expect(withCookie.opened, "쿠키가 있어도 안 열리면 이 대조군은 아무것도 안 가른다").toBe(true);
  });

  test("③ /compare — 승인 질문만 · 열 1~3 · 차이는 집합 사실 · 각주 상시 · hit → ③", async ({
    page,
  }) => {
    test.slow();
    await enter(page);
    await page.goto("/compare");
    const panel = page.getByTestId("compare-panel");
    await expect(panel).toBeVisible();

    // 🔴 자유 입력 0 — 임의 질의 표면은 이 화면의 조작 경계 밖이다(§16.2).
    expect(await panel.locator("textarea").count()).toBe(0);
    expect(await panel.locator('input[type="text"], input:not([type])').count()).toBe(0);
    await expect(page.getByTestId("compare-question")).toHaveJSProperty("tagName", "SELECT");

    // 각주는 «상시»다 — 결과 전에도 있다.
    await expect(page.getByTestId("compare-footnote")).toBeVisible();

    await page.getByTestId("compare-run").click();
    await expect(page.getByTestId("compare-columns")).toBeVisible({ timeout: 120_000 });
    const columns = page.getByTestId("compare-column");
    const n = await columns.count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("compare-footnote")).toBeVisible();

    // 🔴 차이 요약은 «집합 사실»이다 — 우열을 말하는 낱말이 없어야 한다.
    const diff = (await page.getByTestId("compare-diff").first().textContent()) ?? "";
    expect(diff, `차이 요약: ${diff}`).not.toMatch(/우수|더 좋|더 나|최적|best|우월/i);
    expect(diff).toMatch(/겹|만 |고유|공통/);

    // hit → ③ (근거 화면)으로 간다.
    const hit = page.getByTestId("compare-hit").first();
    await expect(hit.locator('a[href^="/evidence/"]').first()).toHaveCount(1);
  });

  test("③ 대조군 — 본문 sessionId 가 쿠키와 다르면 422 (운반은 쿠키다)", async ({ page }) => {
    await enter(page);
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/retrieval/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "levi2-not-my-session",
          question: "AL-20260826-0041 알람의 원인은?",
          strategies: ["vector"],
        }),
      });
      return res.status;
    });
    expect(status, "본문 sessionId 불일치가 통과한다 — 어느 쪽을 뜻하는지 서버가 골랐다").toBe(422);
  });
});

test.describe("T3-4 — 조사 실행 축 (이어서)", () => {
  test("① [중지] — 도는 조사를 멈추면 화면이 «중지됨»으로 선다", async ({ page }) => {
    test.slow();
    await enter(page);

    const console_ = page.getByTestId("run-console");
    // 🔴 이 축은 «도는 동안에만» 잴 수 있다. 화면 클릭으로는 늦는다(live 완주 ≈1초) —
    //    사람 손이 느린 것이지 버튼이 죽은 것이 아니다. 그래서 조사를 «만든 그 틱에서»
    //    중지를 쏘아 창을 스스로 만든다. 그래도 늦으면 초록도 빨강도 내지 않는다.
    const shot = await page.evaluate(async ({ scenario, sid }) => {
      const made = await (
        await fetch(`/api/scenarios/${scenario}/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, mode: "live" }),
        })
      ).json();
      const res = await fetch(`/api/runs/${made.runId}/stop`, { method: "POST" });
      return { runId: made.runId as string, incidentId: made.incidentId as string, status: res.status, body: await res.json() };
    }, { scenario: SCENARIO, sid: (await page.context().cookies()).find((c) => c.name === "fkt_sid")!.value });

    test.skip(
      shot.status !== 200 || shot.body?.status !== "stopped",
      `중지 시점에 조사가 이미 끝났다(${shot.status} ${JSON.stringify(shot.body)}) — 이 실행에서는 못 쟀다`,
    );

    await page.goto(`/incidents/${shot.incidentId}?run=${shot.runId}`);
    await expect(console_).toHaveAttribute("data-status", "stopped", { timeout: 30_000 });
    await expect(page.getByTestId("run-status")).toContainText("중지됨");
    // 🔴 중지는 «타임라인도 닫는다» — 끝나지 않은 단계가 계속 도는 것처럼 서 있으면 안 된다.
    await expect(page.locator('[data-testid="run-step"][data-state="running"]')).toHaveCount(0);
  });

  test("③ cold — 느려도 «빈 화면»이 아니다(준비 중을 말한다)", async ({ page }) => {
    test.slow();
    await enter(page);
    await page.goto("/compare");
    await page.getByTestId("compare-run").click();
    // 결과 전 구간에서도 화면은 무엇인가를 말하고 있어야 한다 — 패널·각주가 서 있다.
    await expect(page.getByTestId("compare-panel")).toBeVisible();
    await expect(page.getByTestId("compare-footnote")).toBeVisible();
    await expect(page.getByTestId("compare-run")).toBeDisabled();
    await expect(page.getByTestId("compare-columns")).toBeVisible({ timeout: 120_000 });
  });
});
