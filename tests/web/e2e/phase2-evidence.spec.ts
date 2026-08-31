import { test, expect, type Page } from "@playwright/test";

/**
 * §21 Phase 2 완료 증거를 «브라우저»에서 재는 축. 축 계획 정본 = `evidence/t3-6-e2e-axis-plan.md`.
 *
 * 🔴 T3-1 착지로 **E-1 이 살아났다**(세션 가드). 나머지 축(E-2~E-6)은 아직 «잴 수 없다» —
 *    브라우저가 부르는 `/api/*` 가 401 이라 화면에 데이터가 오지 않기 때문이다(V-1).
 *    그 «못 잼»을 손으로 선언하지 않고 **조건으로 묶는다**: 데이터 경로가 살아나는 순간
 *    아래 정직성 테스트가 실패해서 「이제 채워라」고 말한다.
 *
 * 🔴 셀렉터는 여전히 최소로만 쓴다 — 화면이 그물에 맞춰 자라지 않게(축 계획 §4).
 */

const API = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";

/** 세션 가드(T3-1)가 착지했는가 — `POST /sessions` 가 501 이면 아직이다. */
async function guardLanded(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(6000),
    });
    return res.status !== 501;
  } catch {
    return false;
  }
}

/** 브라우저가 부르는 API 가 실제로 서는가 — 데이터 축(E-2~E-6)의 선행 조건이다. */
async function browserDataAlive(page: Page): Promise<boolean> {
  await page.goto("/overview");
  await page.waitForURL(/\/overview$/); // 입장이 끝난 «뒤에» 묻는다(위 E-1 주석과 같은 자리)
  const res = await page.request.get("/api/scenarios");
  return res.status() === 200;
}

/**
 * 🔴 **클릭으로만** ④ 까지 간다 — url 을 손으로 만들면 「사슬이 이어진다」가 언제나 참이 된다.
 *    Overview 알람 → incident(run) → 완주 → 「작업지시서 초안 보기」 → ④. 돌려주는 것은
 *    화면이 «실제로 연» 초안 id 다(내가 고른 값이 아니다).
 */
async function reachWorkOrderByClicks(page: Page): Promise<string> {
  await page.goto("/overview");
  await page.waitForURL(/\/overview$/);
  await page.getByTestId("start-from-alarm").first().click();
  await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 30_000 });
  await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
    timeout: 180_000,
  });
  const link = page.getByTestId("work-order-draft");
  await expect(link, "완주했는데 「작업지시서 초안 보기」가 없다 — 사슬의 칸이 빈다").toBeVisible();
  await link.click();
  await page.waitForURL(/\/work-orders\//, { timeout: 20_000 });
  await expect(page.getByTestId("wo-screen")).toBeVisible();
  return decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
}

test.describe("§21 증거 — 브라우저에서만 보이는 축", () => {
  test.beforeEach(async () => {
    test.skip(!(await guardLanded()),
      "T3-1 세션 가드 미착지 — 🔴 skip 은 초록이 아니다(아직 안 쟀다는 뜻)");
  });

  test("E-1 세션 가드 — 가드 홉 «뒤»에서 ai-api 세션이 브라우저까지 선다", async ({ page }) => {
    // 🔴 307 만 보고 초록을 내지 않는다. 방문자는 리다이렉트를 «따라가고», 따라간 끝에서
    //    실제로 격리가 서는지는 브라우저 쿠키와 브라우저가 부르는 API 로만 보인다.
    //
    // 🔴 **끝까지 따라간 «뒤에» 묻는다**(Q-39 ⓒ · Q-41 에서 잡았다). 입장 발급이 서버 홉에
    //    있던 동안에는 `goto` 가 돌아온 시점에 이미 쿠키가 있었다. 이제 사슬은
    //    `307 /overview → 200 /`(클라이언트 마운트) `→ 303 /enter → 200 /overview` 이고,
    //    `goto` 는 그 «중간»인 `/` 에서 돌아온다. 여기서 바로 물으면 쿠키는 아직 없다 —
    //    그 빨강은 「가드가 세션을 안 세웠다」가 아니라 「내가 도착 전에 물었다」다.
    await page.goto("/overview");
    await page.waitForURL(/\/overview$/);

    const cookies = await page.context().cookies();
    const shell = cookies.find((c) => c.name === "fkt_session");
    expect(shell, "셸 세션 쿠키가 없다 — 가드 홉이 세션을 안 세웠다").toBeTruthy();

    const raw = decodeURIComponent(shell!.value);
    expect(raw, "origin 이 api 가 아니다 — 백엔드가 발급한 세션이 아니다").toMatch(/^api:/);

    // 🔴 대조군 — 그 id 가 «진짜» ai-api 세션인가. 지어낸 id 는 401 이어야 한다.
    const id = raw.slice("api:".length);
    const real = await fetch(`${API}/api/scenarios`, { headers: { Cookie: `fkt_sid=${id}` } });
    const fake = await fetch(`${API}/api/scenarios`, {
      headers: { Cookie: "fkt_sid=LEVI2FAKESESSION00000000" },
    });
    expect(real.status, "셸이 쥔 id 가 ai-api 에서 안 선다").toBe(200);
    expect(fake.status, "지어낸 id 가 통과한다 — 가드가 헐겁다").toBe(401);

    // 🔴 그리고 브라우저 «자신»이 그 세션을 들고 있어야 한다. 여기가 V-1 이 물린 자리다:
    //    셸이 받은 HttpOnly 쿠키를 브라우저까지 넘기지 못하면 화면의 API 호출이 전부 401 이다.
    const apiCookie = cookies.find((c) => c.name === "fkt_sid");
    expect(apiCookie, "ai-api 세션 쿠키가 브라우저에 없다 — 화면의 /api/* 가 전부 401 이 된다")
      .toBeTruthy();
    const viaBrowser = await page.request.get("/api/scenarios");
    expect(viaBrowser.status(), "브라우저가 부르는 /api/* 가 서지 않는다").toBe(200);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * E-2 ~ E-6 — 아직 «잴 수 없다». 🔴 그 이유가 바뀌었다.
   *
   * 앞판은 「브라우저 데이터 경로가 401」에 묶어 뒀다. V-1 이 고쳐지며 그 조건이 풀렸고,
   * 정직성 테스트가 «채우라»고 울렸다 — 설계대로다. 그런데 채우러 가 보니 못 채운다:
   * 화면들이 아직 **자리표시**다(「이 자리에 올 것 (Phase 3 · wireframes 기준)」).
   *
   * 🔴 즉 내 조건이 «틀린 관문»을 가리키고 있었다. 데이터 경로가 아니라 **화면이 데이터를
   *    그리는가**가 이 축들의 관문이다. 조건을 화면별로 다시 묶는다 — 그래야 T3-2~T3-5 가
   *    한 화면씩 착지할 때 그 화면의 축만 정확히 깨어난다.
   * ──────────────────────────────────────────────────────────────────────── */

  /* 🔴 E-2 는 **한 칸씩** 열린다(T3-2 착지 · 11대).
   *
   * 축 계획 정본의 red 는 「조사 실행 → 근거 열람 → WO 승인이 클릭으로 이어지지 않는다
   * (id 를 손으로 옮겨야 이어지면 통합이 아니다)」다. T3-2 가 착지시킨 것은 그 사슬의
   * **첫 칸**(Overview → incident)뿐이고, 근거 열람·WO 승인 화면은 T3-4·T3-5 자리다.
   * 사슬 전체를 지금 재려 들면 못 재는 칸 때문에 축이 통째로 미뤄지고, 착지한 칸의
   * 회귀가 아무에게도 안 물린다 — 그래서 칸별로 가른다.
   * 🔴 반대로 착지한 칸을 「E-2 통과」라고 부르지도 않는다. E-2b 가 남아 있는 동안
   *    이 축은 **미완**이며, 아래 정직성 행이 그 사실을 계속 든다. */
  test("E-2a 연쇄 1칸 — 조사 실행이 «클릭으로» incident 화면까지 잇는다", async ({ page }) => {
    test.fixme(await stillPlaceholder(page, "/overview"),
      "Overview 가 자리표시다 — 이을 화면이 아직 없다");

    await page.goto("/overview");
    const start = page.getByTestId("start-from-alarm").first();
    await expect(start, "알람 도크에 조사 진입이 없다 — 사슬의 첫 칸이 없다").toBeVisible();

    // 🔴 «클릭으로» 가 축이다. url 을 손으로 만들어 넣으면 이 축은 언제나 초록이 된다 —
    //    id 를 사람이 옮기지 않는다는 것이 정본이 말한 통합의 뜻이다.
    await start.click();
    await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 20_000 });

    const m = page.url().match(/\/incidents\/([^?]+)\?run=(.+)$/);
    expect(m, "incident 로 갔지만 run 이 url 에 실리지 않았다").toBeTruthy();
    const [, incidentId, runId] = m!;

    // 🔴 도착한 화면이 «그 id 들을 실제로 그리는가». 이동만 재면 빈 화면도 초록이다.
    await expect(page.getByTestId("incident-header")).toContainText(decodeURIComponent(incidentId));
    // 🔴 뒤집힌 사실(T3-4): run 의 이름표는 TTAE 행이 아니라 컨트롤 줄에 선다. 축의 뜻은
    //    「도착한 화면이 그 id 를 실제로 그리는가」이지 「어느 줄에 적히는가」가 아니다.
    await expect(page.getByTestId("run-controls")).toContainText(decodeURIComponent(runId));

    // 🔴 그리고 그 run 은 «내 세션의» run 이어야 한다 — 계약 v0.1.6 소유권. 남의 run id 를
    //    url 에 넣어 같은 화면이 서면, 클릭 연쇄가 아니라 id 를 아는 사람의 통로가 된다.
    const mine = await page.request.get(`/api/runs/${runId}`);
    expect(mine.status(), "방금 만든 run 을 내 세션이 못 읽는다").toBe(200);
  });

  /* 🔴 T3-5 착지로 **E-2b 가 깨어났다**(14대). 정직성 행이 이 이름을 대며 채근했고, 채운다.
   *    red 는 「사슬이 클릭으로 안 이어진다」이다 — url 을 손으로 만들어 넣으면 이 축은
   *    언제나 초록이 되므로(E-2a 와 같은 규율), **모든 홉을 클릭으로만** 간다. */
  test("E-2b 연쇄 잔여 — 근거 열람 → WO 승인이 클릭으로 이어진다", async ({ page }) => {
    test.slow();
    const woId = await reachWorkOrderByClicks(page);

    // ── 칸 ①: WO 화면이 «그 초안»을 그린다(도착만 재면 빈 화면도 초록이다)
    await expect(page.getByTestId("wo-header")).toContainText(woId);

    // ── 칸 ②: 근거 열람 — 근거 카드를 «클릭»해서 ③(T3-3)으로 간다
    const firstEvidence = page.getByTestId("wo-evidence-link").first();
    const evidenceId = (await firstEvidence.innerText()).trim();
    await firstEvidence.click();
    await page.waitForURL(/\/evidence\//, { timeout: 20_000 });
    expect(
      decodeURIComponent(new URL(page.url()).pathname),
      "근거 링크가 다른 자원을 열었다 — 사슬이 id 를 잃었다",
    ).toBe(`/evidence/${evidenceId}`);
    // 🔴 도착한 화면이 «못 물어봤다»가 아니어야 한다 — 링크만 맞고 화면이 비면 사슬은 끊긴 것이다
    await expect(page.getByTestId("screen-unavailable")).toHaveCount(0);

    // ── 칸 ③: 되돌아와 «승인»까지 클릭으로 — 사람이 결재하는 장면(§16.4)이 사슬의 끝이다
    await page.goBack();
    await page.waitForURL(new RegExp(`/work-orders/`), { timeout: 20_000 });
    await page.getByTestId("wo-approve").click();
    await page.getByTestId("wo-confirm").click();
    await expect(page.getByTestId("wo-screen")).toHaveAttribute("data-state", "approved");
    await expect(page.getByTestId("wo-history")).toContainText(/AUD-/);

    // 🔴 화면끼리의 일치는 일치가 아니다 — 서버가 그 결재를 실제로 갖고 있는가
    const server = await (await page.request.get(`/api/work-orders/${woId}`)).json();
    expect(server.approvalState, "화면은 승인이라는데 서버는 아니다").toBe("approved");
  });

  test("E-3 전략 비교 — 세 score 를 «크기»로 견주지 않는다 (Q-17)", async ({ page }) => {
    /* 🔴 T3-4 착지로 이 축이 깨어났다. red 는 「전략이 다른 score 를 «같은 자»로 재는 것」이다 —
     *    vector·hybrid·graphrag 의 점수는 서로 다른 공간의 수라 크기를 견주면 화면이 없는
     *    사실을 만든다(Q-17). 그래서 두 갈래로 묻는다:
     *      ⓐ 점수가 «자기 열 밖»으로 나와 견줌의 재료가 되지 않는가(차이 요약·각주에 점수 0)
     *      ⓑ 우열·순위를 말하는 낱말이 화면에 없는가
     */
    test.slow();
    await page.goto("/overview", { waitUntil: "networkidle" });
    await page.goto("/compare");
    await page.getByTestId("compare-run").click();
    await expect(page.getByTestId("compare-columns")).toBeVisible({ timeout: 120_000 });
    const columns = page.getByTestId("compare-column");
    expect(await columns.count(), "열이 하나뿐이면 «견주지 않는다»를 잴 것이 없다").toBeGreaterThan(1);

    // ⓐ 차이 요약은 «집합 사실»이다 — 거기 점수가 실리는 순간 그것이 크기 비교다.
    for (const text of await page.getByTestId("compare-diff").allInnerTexts()) {
      expect(text, `차이 요약에 점수가 실렸다: ${text}`).not.toMatch(/\d\.\d{2,}/);
    }
    /* ⓑ 우열 낱말 0 — 🔴 «주장하는 자리»에서만이다. 여기서 한 번 물렸다: 패널 전체를 훑었더니
     *    각주의 「…전략의 우열을 판정하지 않습니다」가 걸렸다. 극성 없는 정규식이 **부정문을
     *    긍정문으로 읽은** 것이고, 그 빨강은 대상이 아니라 내 그물의 것이었다.
     *    ⇒ 주장하는 자리(컨트롤·열)를 보고, 각주는 반대로 «그 말이 있는지»를 잰다. */
    const asserting = [
      await page.getByTestId("compare-controls").innerText(),
      ...(await columns.allInnerTexts()),
    ].join("\n");
    expect(asserting, "열·컨트롤이 우열을 말한다").not.toMatch(/우수|더 좋|더 나은|최고|1위|우월|best/i);
    await expect(page.getByTestId("compare-footnote")).toContainText("우열을 판정하지 않습니다");
    // 🔴 대조군 — 점수 자체는 «자기 열 안»에 있어야 한다. 아예 없으면 위 두 줄은 아무것도 안 막는다.
    expect((await columns.first().innerText()).match(/\d\.\d/), "열 안에 점수가 없다 — 금지 축의 표본이 없다").toBeTruthy();
  });

  /* 🔴 T3-3 착지로 **E-4 가 깨어났다**(11대). 축 계획 정본의 red 는 두 갈래다:
   *   ⓐ 강조 구간이 evidence 원문과 «다른 문장» 위에 있다
   *   ⓑ 좌표가 없는데 «그럴듯한 위치»를 그린다
   * 둘 다 화면만 보면 멀쩡하다 — 원문과 나란히 놓아야 드러난다. 그래서 화면에서 읽은 것을
   * 화면으로 검산하지 않고, 두 라우트가 낸 값으로 검산한다. */
  test("E-4 인용 강조 — 강조가 «그 문장» 위에 그려진다", async ({ page }) => {
    const CHUNK = "DOC-MAN-0021@r1#005";
    const path = `/evidence/${encodeURIComponent(CHUNK)}`;
    test.fixme(await stillPlaceholder(page, path), "Evidence 뷰가 자리표시다 — 강조할 본문이 아직 없다");

    await page.goto(path, { waitUntil: "networkidle" });
    const ev = await (await page.request.get(`/api/evidence/${encodeURIComponent(CHUNK)}`)).json();
    const docId = CHUNK.split("@")[0];
    const doc = await (
      await page.request.get(
        `/api/documents/${encodeURIComponent(docId)}?highlight=${encodeURIComponent(CHUNK)}`,
      )
    ).json();

    // ⓐ — 화면의 강조가 «원문에서 잘라 낸 그 구간»인가. 인용문을 따로 그리면 좌표가 틀려도
    //     화면은 멀쩡해 보인다(이 축이 잡으려는 것이 정확히 그 거짓이다).
    const slice = doc.body.slice(doc.highlight.start, doc.highlight.end);
    expect(slice, "두 라우트의 인용이 서로 다르다 — 좌표가 그 문장을 안 가리킨다").toBe(ev.text);
    expect(
      await page.getByTestId("cited-span").textContent(),
      "화면 강조가 원문 슬라이스와 다르다 — 강조가 «다른 문장» 위에 있다",
    ).toBe(slice);

    // ⓑ — 좌표를 화면이 밝힌다. 밝히지 않으면 「지어낸 위치」와 구별할 방법이 화면에 없다.
    await expect(page.getByTestId("cited-body")).toHaveAttribute("data-highlight", "ok");
    await expect(page.getByTestId("cited-body")).toContainText(
      `offset [${doc.highlight.start}, ${doc.highlight.end})`,
    );

    // 🔴 ⓑ의 나머지 절반(«좌표가 없을 때 그리지 않는가»)은 여기서 못 잰다 — 서버가 그 응답을
    //    내는 표본이 없고, 브라우저 모의는 이 화면의 서버 렌더 층에 닿지 않는다(11대 N-4).
    //    코드에 분기는 있으나 그것은 화면이 그린다의 증거가 아니라, «못 잼»으로 남긴다.
  });

  /* 🔴 T3-5 착지로 **E-5 가 깨어났다**(14대). red 는 「화면이 지울 수 있다고 «말한다»」이고,
   *    말하는 방식은 둘이다 — ⓐ 문구가 삭제 가능성을 열어 두거나(조건절 · 「mandatory 인 경우」)
   *    ⓑ 조작이 실제로 서버까지 나가거나. 둘을 따로 잰다.
   *    🔴 그리고 «세는 눈»을 대조군으로 증명한다: 같은 눈이 parts 에서는 진짜 삭제를 본다.
   *       그러지 않으면 이 축의 0 은 「내가 못 본 0」과 구별되지 않는다. */
  test("E-5 R12 — 화면이 안전 조치를 «지울 수 있다»고 말하지 않는다", async ({ page }) => {
    test.slow();
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().includes("/api/work-orders/")) writes.push(r.url());
    });
    const woId = await reachWorkOrderByClicks(page);
    const server = await (await page.request.get(`/api/work-orders/${woId}`)).json();
    expect(
      server.safetyMeasures.length,
      "이 초안에 안전 조치가 0건 — 「지울 수 있다고 말하지 않는가」의 표본이 없다",
    ).toBeGreaterThan(0);

    // ⓐ 문구 — 조건절 없이 «불가»를 말하는가(Q-31: 서버는 mandatory 와 무관하게 잠근다)
    const safety = page.getByTestId("wo-safety");
    const text = (await safety.innerText()).replace(/\s+/g, " ");
    expect(text, "안전 조치 블록이 «불가»를 말하지 않는다").toContain("편집·삭제할 수 없습니다");
    for (const conditional of ["mandatory", "인 경우", "필수인", "일 때만"]) {
      expect(text, `문구가 조건절로 삭제 가능성을 열어 둔다: ${conditional}`).not.toContain(conditional);
    }
    // 🔴 mandatory 두 값이 «같은» 문구로 잠기는가 — 서버가 그 축으로 가르지 않기 때문이다
    const flags = await page
      .getByTestId("wo-safety-item")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-mandatory")));
    expect(flags.length).toBe(server.safetyMeasures.length);

    // ⓑ 조작 — 편집 칸 0 · 삭제 시도가 서버까지 «안 나간다»
    expect(await safety.locator("input, textarea, select").count(),
      "안전 조치 블록에 편집 칸이 있다").toBe(0);
    const mark = writes.length;
    await safety.getByTestId("wo-safety-delete").first().click();
    await expect(page.getByTestId("wo-locked-note")).toBeVisible();
    expect(writes.slice(mark), "안전 조치 삭제 시도가 서버로 나갔다").toEqual([]);

    // 🔴 대조군 — 같은 눈이 «진짜 삭제»는 본다(parts). 안 보이면 위의 0 은 뜻이 없다.
    await page.getByTestId("wo-part-add").click();
    await expect
      .poll(async () => writes.length, { timeout: 15_000 })
      .toBeGreaterThan(mark);
    const mark2 = writes.length;
    await page.getByTestId("wo-part-delete").last().click();
    await expect.poll(async () => writes.length, { timeout: 15_000 }).toBeGreaterThan(mark2);

    // 🔴 서버 대조군 — 화면이 막은 그 자리를 서버도 막는가(느슨하게 말하지 않았음의 반쪽)
    const refused = await page.evaluate(async (id) => {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ safetyMeasures: [] }),
      });
      return { status: res.status, body: await res.json() };
    }, woId);
    expect(refused.status).toBe(403);
    expect(refused.body?.error?.code).toBe("safety_measure_immutable");
    const after = await (await page.request.get(`/api/work-orders/${woId}`)).json();
    expect(after.safetyMeasures.length, "안전 조치가 실제로 줄었다").toBe(
      server.safetyMeasures.length,
    );
  });

  test("E-6 배지 — Live/Replay 를 «두 축의 조합»으로 말한다 (v0.1.3)", async ({ page }) => {
    // 🔴 오늘 mode-badge.spec.ts 가 덮는 것은 «게이트 축»(/live/status.online) 뿐이다.
    //    v0.1.3 이 말한 나머지 한 축(run/envelope 의 `mode` = 이벤트 «출처»)은 그릴 run 화면이
    //    없어서 아직 축으로 서지 않는다 — 배지가 한 축만 말하는 것이 «지금은» 참이다.
    //
    // 🔴 관문을 **옮겼다**(11대). 앞판은 `/overview` 를 관문으로 삼았는데, T3-2 로 Overview 가
    //    자리표시를 벗자 이 축이 「채워라」고 울렸다 — 그러나 채울 수 없었다. run 의 `mode` 를
    //    그리는 화면은 Overview 가 아니라 **incident** 이고 그쪽은 여전히 T3-4 자리다.
    //    관문이 대상과 다른 화면을 가리키면 정직성 행이 «거짓 채근»을 한다(10대가 같은 형태의
    //    잘못된 관문을 한 번 고쳤고, 이것이 그 두 번째다).
    /* 🔴 T3-4 로 두 번째 축이 섰다 — run 화면이 envelope 의 `mode` 를 그린다.
     *    이제 배지는 «둘»이고, 둘은 서로 다른 원천을 말한다:
     *      게이트 축  `mode-badge`      ← `/live/status.online`(Live AI 에 닿는가)
     *      출처 축    `run-mode-badge`  ← 그 run 의 이벤트 봉투 `mode`(이 이벤트가 어디서 왔나)
     *    🔴 두 값이 «같아도» 축이 하나인 것은 아니다. 그래서 각각을 «자기 원천»과 대조한다 —
     *       한쪽을 다른 쪽으로 검산하면 그 초록은 「둘이 같다」만 말한다. */
    test.slow();
    await page.goto("/overview", { waitUntil: "networkidle" });
    const start = page.getByTestId("start-from-alarm").first();
    await start.click();
    await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 30_000 });
    const runId = new URL(page.url()).searchParams.get("run")!;
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
      timeout: 180_000,
    });

    const gate = await page.evaluate(async () => (await (await fetch("/api/live/status")).json()));
    const snap = await page.evaluate(
      async (id) => (await (await fetch(`/api/runs/${id}`)).json()),
      runId,
    );
    await expect(page.getByTestId("mode-badge")).toHaveAttribute(
      "data-mode",
      gate.online ? "live" : "replay",
    );
    await expect(page.getByTestId("run-mode-badge")).toHaveAttribute("data-mode", snap.mode);
  });
});

/**
 * 그 화면이 아직 «자리표시»인가 — 축의 관문을 사람 말이 아니라 화면에게 묻는다.
 *
 * 🔴 문구를 **둘** 안다(11대). 앞판은 「이 자리에 올 것」 하나만 알았는데, T3-2 가 채운
 *    화면들은 남은 칸을 「이 자리는 T3-4다」로 적었다 — 같은 뜻의 다른 낱말이다. 하나만 아는
 *    관문은 새 자리표시를 «벗은 것»으로 오독하고, 그러면 못 재는 축을 잰 것으로 센다.
 *    🔴 그물의 전제(문구)는 대상이 자랄 때 함께 늙는다 — 문구를 늘리는 자리를 여기 하나로 둔다.
 */
async function stillPlaceholder(page: Page, path: string): Promise<boolean> {
  /* 🔴 **관문이 그 화면에 실제로 도착했는지부터 본다**(11대 자수 · 두 번 틀렸다).
   *
   * 증상: 같은 경로를 보는 두 축(E-2b·E-5)이 실행마다 다른 답을 냈다.
   * 첫 독법은 「로드를 안 기다려서」였고 — **틀렸다**. 실측한 원인은 **첫 진입 딥링크 유실**이다:
   * 세션이 없는 첫 요청은 가드 홉이 `/overview` 로 돌려보내므로(정본 동작 · session-guard
   * 스펙 R-1 이 이미 못박은 사실), 관문은 «대상 화면이 아닌 화면»을 보고 「자리표시가 없다 =
   * 벗었다」고 오판한다. 배열의 «첫» 관문만 걸리고 뒤는 멀쩡했던 이유가 이것이다.
   *
   * ⇒ 세션을 먼저 세우고, 도착 url 이 요청한 경로인지 확인한 뒤에 묻는다. 도착하지 못하면
   *   «못 잼»이므로 안전한 쪽(자리표시로 본다)으로 답한다 — 관문이 흔들려서 축을 여는 것이
   *   가장 나쁜 실패다.
   */
  await page.goto("/overview", { waitUntil: "networkidle" }); // 세션 홉을 먼저 지난다
  await page.goto(path, { waitUntil: "networkidle" });
  if (!new URL(page.url()).pathname.startsWith(path.split("?")[0].split("#")[0])) return true;
  for (const text of PLACEHOLDERS) {
    if ((await page.getByText(text).count()) > 0) return true;
  }
  return false;
}

const PLACEHOLDERS = ["이 자리에 올 것", "이 자리는 T3-4다"] as const;

/**
 * run 을 그리는 화면(incident)이 아직 자리표시인가 — 🔴 **경로를 지어내지 않는다.**
 * incident id 를 코드에 박으면 seed 가 바뀐 날 이 관문이 조용히 죽는다(「표본은 이름이 아니라
 * 조건으로」 계보). 화면이 실제로 여는 동선을 그대로 타고 가서, 도착한 화면에게 묻는다.
 * 동선 자체가 없으면(Overview 가 아직 자리표시면) 그 역시 «못 잼»이다.
 */
async function runScreenIsPlaceholder(page: Page): Promise<boolean> {
  if (await stillPlaceholder(page, "/overview")) return true;
  const start = page.getByTestId("start-from-alarm").first();
  if ((await start.count()) === 0) return true;
  await start.click();
  await page.waitForURL(/\/incidents\//, { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  for (const text of PLACEHOLDERS) {
    if ((await page.getByText(text).count()) > 0) return true;
  }
  return false;
}

/** 축 → 그 축의 관문. 🔴 관문은 «그 축이 재려는 화면»이어야 한다 — 다른 화면을 가리키면 거짓 채근이 된다. */
const AXIS_GATES: ReadonlyArray<readonly [string, (page: Page) => Promise<boolean>]> = [
  // 🔴 E-4 는 T3-3 착지로 **채웠다**(11대) — 미룬 축이 아니므로 이 목록에서 내린다.
  //    채운 축을 여기 남겨 두면 정직성 행이 영영 빨강이고, 그 빨강은 아무 뜻도 없다.
  // 🔴 E-3·E-6 은 **T3-4 착지로 채웠다**(12대). 이 행이 그렇게 채근했고, 채운 뒤 내린다 —
  //    관문을 남겨 둔 채 축만 채우면 정직성 행이 「아직 안 채웠다」고 거짓을 말한다.
  // 🔴 E-2b·E-5 는 **T3-5 착지로 채웠다**(14대). 이 행이 「/work-orders 가 자리표시를 벗었다」고
  //    이름을 대며 채근했고, 그 채근이 옳았다 — 채운 뒤 내린다. 🔴 목록이 비었다고 이 행을
  //    지우지 않는다: 다음 화면이 자리표시를 벗을 때 여기 한 줄을 더하는 것이 이 파일의 규율이다.
];

test("골격 정직성 — «못 잼»을 화면별 조건에 묶는다", async ({ page }) => {
  // 🔴 이 행은 대상이 아니라 «이 파일의 정직성»을 잰다. 미룬 축마다 관문이 하나씩 있고,
  //    그 관문이 열리면 여기서 실패해서 「그 축을 채워라」고 이름을 대며 말한다.
  //
  //    🔴 앞판의 관문(「브라우저 데이터 경로 401」)은 «틀린 관문»이었다. V-1 이 고쳐져
  //       조건이 풀렸는데도 축은 여전히 못 쟀다 — 화면이 자리표시였기 때문이다.
  //       조건을 잘못 잡으면 정직성 테스트가 «거짓 채근»을 한다. 그래서 화면으로 옮겼다.
  //    🔴 11대에서 그 오독이 한 번 더 났다 — E-2·E-6 이 «Overview» 를 관문으로 삼고 있었는데
  //       둘 다 Overview 에서 끝나는 축이 아니었다. 관문을 각 축의 화면으로 옮겼고,
  //       E-2 는 착지한 칸(E-2a)을 열고 남은 칸(E-2b)만 여기 남긴다.
  const ready: string[] = [];
  for (const [axis, gate] of AXIS_GATES) {
    if (!(await gate(page))) ready.push(axis);
  }
  expect(
    ready,
    `화면이 자리표시를 벗었다 — 해당 축의 fixme 를 걷어내고 red 문장을 채워라: ${ready.join(", ")}`,
  ).toEqual([]);
});
