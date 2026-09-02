import { test, expect, type Page } from "@playwright/test";

/**
 * T3-2 화면 ①② — 🔴 **브라우저에서만 보이는 것**을 잰다(검증 좌석 · 11대).
 *
 * 정본은 셋뿐이다. 이 파일의 red 는 전부 아래 «어느 줄»에서 왔는지 적을 수 있어야 한다 —
 * 적을 수 없는 축은 정본보다 넓은 축이고, 넓은 축은 엄격함이 아니라 오답이다(10대 유언).
 *
 *   ① `docs/plan/tickets/T3-2.md` AC — 화면 ①: KPI·헤드라인(0건 대체문 포함)·알람 도크·
 *      조사 시작 «이중 진입»·첫 진입 안내 «1회» / 화면 ②: incident 컨텍스트 + `?run=` 진입 ·
 *      이벤트 상세 패널은 T3-4 «자리 표시 명시»
 *   ② `docs/product/wireframes.md` §1 표시 데이터 항목 · §1 인터랙션 ⑥ · §0.1 ①
 *   ③ `packages/contracts/rest-api-v0.1.md` v0.1.7(+정정) — 화면이 그리는 값의 출처
 *
 * 🔴 **SSR 초록은 증거가 아니다**(V-1 계보). 이 파일은 실제 브라우저가 부른 `/api/*` 와
 *    쿠키 «유무» 대조를 함께 잰다 — 서버 렌더만 멀쩡하고 브라우저가 401 이던 자리가 있었다.
 */

const API = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";

/** 화면이 그리는 값의 «출처» — 화면에서 읽은 숫자를 화면으로 검산하지 않는다. */
async function overviewFromApi(page: Page) {
  const plants = await page.request.get("/api/plants");
  expect(plants.status(), "화면의 출처인 /api/plants 가 브라우저에서 서지 않는다").toBe(200);
  const first = (await plants.json())[0];
  const res = await page.request.get(`/api/plants/${first.plantId}/overview`);
  expect(res.status()).toBe(200);
  return { plant: first, overview: await res.json() };
}

test.describe("T3-2 ① Factory Overview", () => {
  test("브라우저 네트워크 축 — 화면이 부른 /api/* 가 전건 서고, 쿠키가 없으면 선다는 말이 거짓이 된다", async ({
    page,
    browser,
  }) => {
    const seen: Array<[number, string]> = [];
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/")) seen.push([r.status(), u.pathname]);
    });
    // 기다리던 것: 화면이 «클라이언트에서» /api/* 를 부르고 답까지 받은 상태 — 배지가 checking 을 벗는 것이 그 신호다(seen 표본은 그 뒤에 즉시 센다)
    await page.goto("/overview");
    await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
      .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });

    // 🔴 「호출이 없다」와 「전부 200」은 화면에서 같은 모습이다 — 표본이 실재하는지 먼저 본다.
    expect(seen.length, "브라우저가 /api/* 를 하나도 부르지 않았다 — 이 축은 아무것도 못 쟀다")
      .toBeGreaterThan(0);
    expect(seen.filter(([s]) => s !== 200), `브라우저 호출이 200 이 아니다: ${JSON.stringify(seen)}`)
      .toEqual([]);

    // 🔴 대조군 — 쿠키가 없으면 같은 경로가 401 이어야 한다. 없으면 이 초록은 «가드가 죽어서»
    //    난 초록이고, 그것은 V-1 의 반대편 사고다.
    const clean = await browser.newContext();
    const bare = await clean.request.get(`${page.url().replace(/\/overview.*$/, "")}/api/plants`);
    expect(bare.status(), "쿠키 없이도 열린다 — 초록의 주어가 «가드 부재» 다").toBe(401);
    await clean.close();
  });

  test("KPI 스트립 4칸이 응답의 kpi 를 그대로 말한다", async ({ page }) => {
    // 기다리던 것: 판정선은 아래 kpi-strip 의 toBeVisible 이 기다린다
    await page.goto("/overview");
    const { overview } = await overviewFromApi(page);
    const strip = page.getByTestId("kpi-strip");
    await expect(strip).toBeVisible();
    const text = (await strip.textContent())!.replace(/\s+/g, " ");

    // 계약 v0.1.7 kpi 4필드 — 화면 낱말은 wireframes §1 의 것.
    expect(text, "가동 라인이 응답과 다르다").toContain(`${overview.kpi.lineActive}/${overview.lines.length}`);
    for (const [label, value] of [
      ["활성 알람", overview.kpi.alarmCount],
      ["진행 Incident", overview.kpi.openIncidents],
      ["승인 대기 WO", overview.kpi.pendingWorkOrders],
    ] as const) {
      expect(text, `${label} 이 응답과 다르다`).toContain(`${label} ${value}`);
    }
  });

  test("헤드라인은 «정렬된 목록의 첫 줄»이다 — 화면이 최댓값을 다시 고르지 않는다", async ({ page }) => {
    // 기다리던 것: 판정선은 아래 headline 의 toBeVisible 이 기다린다
    await page.goto("/overview");
    const { overview } = await overviewFromApi(page);
    const top = overview.activeAlarms[0];
    test.skip(!top, "활성 알람이 0건인 seed — 이 행의 표본이 없다(0건 갈래는 아래 행이 잰다)");

    const headline = page.getByTestId("headline");
    await expect(headline).toBeVisible();
    const text = (await headline.textContent())!;
    // 🔴 계약 v0.1.7-정정: 정렬은 서버가 한다. 화면이 «그 첫 줄»을 말하는지가 축이다.
    const line = overview.lines.find((l: any) =>
      l.equipment.some((e: any) => e.equipmentId === top.equipmentId),
    );
    expect(text, "헤드라인이 최고 severity 알람의 라인을 말하지 않는다").toContain(line.name);
    expect(text, "헤드라인이 그 설비를 말하지 않는다").toContain(
      line.equipment.find((e: any) => e.equipmentId === top.equipmentId).name,
    );
    // 🔴 숫자의 앵커 = «그 알람 행의» thresholdValue(계약 v0.1.7-정정 2차 · 오케 판정 08-30).
    expect(text, "헤드라인 숫자가 그 알람의 임계·관측이 아니다").toContain(`${top.thresholdValue}`);
    expect(text).toContain(`${top.observedValue}`);
  });

  test("활성 알람 0건이면 헤드라인이 «정상 가동» 대체문이 된다 (§1 인터랙션 ⑥)", async ({ page }) => {
    /* 🔴 **못 잰다 — 그리고 그 이유를 적어 둔다**(11대 자수).
     *
     * 처음엔 `page.route` 로 overview 응답을 0건으로 갈아 끼웠고, 화면은 그대로 알람 문장을
     * 그렸다. 내 첫 독법은 「대체문이 없다」였는데 **틀렸다**: 이 화면의 overview 호출은
     * 서버 컴포넌트가 하고, 그 요청은 Next 서버 프로세스에서 나가 **브라우저를 지나지 않는다**.
     * 브라우저 라우팅으로는 닿지 못하는 층이라 모의가 «먹지 않은» 것이고, 그 빨강은 대상이
     * 아니라 내 계측기의 것이었다(「서버측은 모킹 불가」 — 6대 UI 함정 3).
     *
     * 🔴 지금 이 갈래를 정직하게 재려면 표본이 실물이어야 한다: 활성 알람 0건인 공장이
     *    없고(실측 `/plants` = FAC-A 하나), seed 를 고치면 다른 축들의 표본이 사라진다.
     *    남은 길은 **주입 후 원복**(내 스택 한정 · T2-2 `--inject-drift` 선례)인데, 그것은
     *    DB 층 자산이라 이 브라우저 스펙의 자리가 아니다.
     * ⇒ 관문: 「0건 표본이 실물로 서면 이 행을 켠다」. 그때까지 **초록으로도 빨강으로도
     *    세지 않는다** — 코드에 분기가 «있다»는 것은 화면이 «그린다»의 증거가 아니다.
     */
    // 기다리던 것: 판정선은 아래 headline·alarm-dock 의 expect 가 기다린다
    await page.goto("/overview");
    const { overview } = await overviewFromApi(page);
    test.fixme(
      overview.activeAlarms.length > 0,
      "활성 알람 0건 표본이 실물에 없다 — 브라우저 모의는 서버 렌더 층에 닿지 않는다(못 잼)",
    );

    await expect(page.getByTestId("headline")).toContainText("모든 라인이 정상 가동 중입니다");
    await expect(page.getByTestId("alarm-dock")).toContainText("활성 알람 0건");
  });

  test("알람 도크가 §1 표시 항목을 그린다 — id·severity·발생시각·임계·관측·설비·센서", async ({ page }) => {
    // 기다리던 것: 판정선은 아래 alarm-dock 의 toBeVisible 이 기다린다
    await page.goto("/overview");
    const { overview } = await overviewFromApi(page);
    const top = overview.activeAlarms[0];
    test.skip(!top, "활성 알람 0건 — 도크 표본이 없다");

    const dock = page.getByTestId("alarm-dock");
    await expect(dock).toBeVisible();
    const text = (await dock.textContent())!.replace(/\s+/g, " ");

    // wireframes §1 「알람 패널」 표시 데이터 = Alarm.id·severity·raised_at·threshold_value·
    // observed_value·equipmentId·sensorId — 일곱 항목을 «정본이 적은 대로» 전수로 본다.
    for (const [what, value] of [
      ["알람 id", top.alarmId],
      ["severity", top.severity],
      ["임계값", `${top.thresholdValue}`],
      ["관측값", `${top.observedValue}`],
      ["설비 id", top.equipmentId],
      ["센서 id", top.sensorId],
    ] as const) {
      expect(text, `알람 도크에 ${what} 이 없다`).toContain(value);
    }
    // 🔴 발생 시각은 목업의 「12:03」이 그 자리다. 표기 형식은 정본이 정하지 않았으므로
    //    «시각을 말하는가»만 본다 — 형식을 그물이 정하면 화면이 그물에 맞춰 자란다.
    const raised = new Date(top.raisedAt);
    const hh = String(raised.getHours()).padStart(2, "0");
    const utcHH = String(raised.getUTCHours()).padStart(2, "0");
    expect(
      text.includes(`${hh}:`) || text.includes(`${utcHH}:`) || text.includes(top.raisedAt.slice(0, 10)),
      "알람 도크가 발생 시각(raised_at)을 말하지 않는다 — §1 표시 항목 7 중 1 누락",
    ).toBeTruthy();
  });

  test("조사 시작이 «두 자리»에 있고 둘이 같은 동작이다 (§1 인터랙션 ⑥ 진입 이중화)", async ({ page }) => {
    // 기다리던 것: 판정선은 아래 start-from-headline 의 toHaveCount 가 기다린다
    await page.goto("/overview");
    const fromHeadline = page.getByTestId("start-from-headline");
    const fromAlarm = page.getByTestId("start-from-alarm");
    await expect(fromHeadline, "헤드라인 문장에 조사 시작이 없다").toHaveCount(1);
    expect(await fromAlarm.count(), "알람 카드에 조사 시작이 없다").toBeGreaterThan(0);

    // 🔴 «같은 동작»이 축이다. 둘이 다른 시나리오·다른 목적지로 가면 이중화가 아니라 분기다.
    await fromHeadline.click();
    await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 20_000 });
    const viaHeadline = new URL(page.url()).pathname;

    // 기다리던 것: 판정선은 아래 fromAlarm.click 의 actionability 대기가 기다린다
    await page.goto("/overview");
    await fromAlarm.first().click();
    await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 20_000 });
    expect(new URL(page.url()).pathname, "두 진입이 다른 incident 로 간다 — 같은 동작이 아니다")
      .toBe(viaHeadline);
  });

  test("🔴 첫 진입 안내는 «1회»다 — 닫으면 다시 뜨지 않고, 다시 열 자리가 있다 (§0.1 ①)", async ({
    page,
  }) => {
    test.slow(); // 진입·닫기·새로고침·재진입을 왕복한다 — 부하에서 기본 타임아웃을 먹는다
    // 기다리던 것: 판정선은 아래 intro-card 의 toHaveCount(1) 이 기다린다
    await page.goto("/overview");
    const intro = page.getByTestId("intro-card");
    await expect(intro, "첫 진입 안내가 아예 없다").toHaveCount(1);

    await intro.getByRole("button", { name: "안내 닫기" }).click();
    await expect(intro, "닫기를 눌러도 안 닫힌다").toHaveCount(0);

    // 🔴 정본 §0.1: 「세션의 첫 /overview 진입 1회(localStorage 아닌 **세션 상태** 기준 —
    //    세션 격리와 일관)」. 컴포넌트 지역 상태로만 두면 새로고침·재진입마다 다시 뜬다 —
    //    그것은 「1회」가 아니라 「매번」이고, AC 가 적은 낱말과 다르다.
    // 기다리던 것: 🔴 부재(카드 0개)를 묻기 전에 «화면이 다시 섰다»는 양의 신호 — 안 기다리면 아직 안 그려진 것을 «안 뜬 것»으로 읽는다
    await page.reload();
    await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
      .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });
    await expect(intro, "새로고침하니 안내가 다시 떴다 — «1회»가 아니다").toHaveCount(0);

    // 기다리던 것: 경유일 뿐이다 — 판정선은 다음 진입 뒤에 있다
    await page.goto("/");
    // 기다리던 것: 🔴 부재를 묻기 전의 앵커 — 재진입 화면이 클라이언트까지 섰는가(intro 는 hydration 뒤에 정해진다)
    await page.goto("/overview");
    await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
      .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });
    await expect(intro, "재진입하니 안내가 다시 떴다 — «1회»가 아니다").toHaveCount(0);

    // 🔴 정본 §0.1: 「재노출: 앱바 `?` 아이콘으로 언제든 다시 연다」. 닫으면 영영 못 여는
    //    안내는 「닫아도 다시 열 수 있다」는 카드 채택 사유(오버레이가 아닌 이유)를 지운다.
    // 🔴 «버튼»만 세지 않는다(11대 자수). 재열람 자리는 링크로도 설 수 있고, 정본이 요구한
    //    것은 「다시 열 수 있다」이지 「버튼이다」가 아니다 — 그물이 구현 형태를 정하면
    //    대상이 그물에 맞춰 자란다.
    const reopen = page.locator(
      '[data-testid=intro-reopen], button:has-text("?"), a:has-text("?"), [aria-label*="안내"], [title*="안내"]',
    );
    expect(await reopen.count(), "닫은 안내를 다시 열 자리가 화면에 없다 (§0.1 재노출)")
      .toBeGreaterThan(0);
  });

  test("설비 카드 스파크라인이 «브라우저가 부른» series 로 선다 (계약 v0.1.7 집계 비대 방지)", async ({
    page,
  }) => {
    const series: string[] = [];
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (/\/api\/equipment\/[^/]+\/sensors\/[^/]+\/series/.test(u.pathname)) series.push(u.pathname);
    });
    // 기다리던 것: series 호출 «수»를 즉시 세는 축이라, 스파크라인이 실제로 설 때까지 기다려야 표본이 있다
    await page.goto("/overview");
    await expect(page.getByTestId("sparkline").first(), "스파크라인이 서지 않는다 — series 표본이 없다").toBeVisible();
    const { overview } = await overviewFromApi(page);
    const withSensor = overview.lines.flatMap((l: any) => l.equipment).filter((e: any) => e.sensorIds.length);

    expect(series.length, "카드가 series 를 하나도 부르지 않았다 — 스파크라인의 출처가 없다")
      .toBeGreaterThan(0);
    await expect(page.getByTestId("sparkline")).toHaveCount(withSensor.length);
  });
});

test.describe("T3-2 ② Incident 조사", () => {
  /** 🔴 incident id 를 코드에 박지 않는다 — 화면이 실제로 여는 동선을 타고 간다. */
  async function enterIncident(page: Page) {
    // 기다리던 것: 판정선은 아래 start-from-alarm 의 click 이 기다린다
    await page.goto("/overview");
    await page.getByTestId("start-from-alarm").first().click();
    await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 20_000 });
    // 기다리던 것: incident 화면이 «컨텍스트까지» 섰는가 — 이 헬퍼를 쓰는 축들이 전부 그 화면에게 묻는다
    await expect(page.getByTestId("incident-header"), "incident 화면이 서지 않았다").toBeVisible();
  }

  test("컨텍스트가 계약 v0.1.7 의 incident·설비를 그린다", async ({ page }) => {
    await enterIncident(page);
    const incidentId = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
    const res = await page.request.get(`/api/incidents/${incidentId}`);
    expect(res.status()).toBe(200);
    const inc = await res.json();

    const header = page.getByTestId("incident-header");
    await expect(header).toContainText(inc.incidentId);
    await expect(header).toContainText(inc.equipmentId);
    await expect(header).toContainText(inc.title);
    await expect(header, "상태를 말하지 않는다").toContainText(inc.status);

    // 설비 컨텍스트(§2 「속성·상태·센서 현재값·최근 정비 요약」) — 정비 기록의 «자기 id» 가
    // 그려져야 한다(계약 v0.1.7-정정: MR- 은 근거 id 체계의 일부라 눌러서 열려야 한다).
    const eq = await (await page.request.get(`/api/equipment/${inc.equipmentId}`)).json();
    const ctx = page.getByTestId("equipment-context");
    await expect(ctx).toContainText(eq.name);
    if (eq.maintenanceSummary.length) {
      await expect(ctx, "정비 요약에 MR 기록 id 가 아닌 것이 그려진다").toContainText(
        eq.maintenanceSummary[0].maintenanceRecordId,
      );
    }
  });

  test("`?run=` 진입이 그 run 을 화면에 싣는다", async ({ page }) => {
    await enterIncident(page);
    const runId = new URL(page.url()).searchParams.get("run")!;
    // 🔴 **뒤집힌 사실**(T3-4): runId 는 더 이상 TTAE 행에 없다. 실행 축이 서면서 그 자리는
    //    「경과 · 수작업 대조」 전용이 됐고, run 의 이름표는 컨트롤 줄로 옮겼다. 축의 뜻은
    //    「그 run 을 화면이 싣는가」이지 「어느 줄에 적히는가」가 아니다 — 자리를 못박아 두면
    //    대상이 옳게 자란 날 그물이 빨강을 낸다.
    await expect(page.getByTestId("run-controls")).toContainText(runId);
    // §2.2 측정-주장 경계 — 실측 전 수치에는 꼬리표가 붙는다(단축률 % 금지).
    await expect(page.getByTestId("ttae-row")).toContainText("잠정 목표");
    expect(
      (await page.getByTestId("ttae-row").textContent())!.match(/단축률\s*\d+%/),
      "실측 전인데 단축률(%)이 화면에 있다 (§2.2)",
    ).toBeNull();
  });

  test("🔵 뒤집힘 — 이벤트 상세 패널이 «T3-4 자리»를 벗고 실물이 됐다 (AC)", async ({ page }) => {
    // 🔴 앞판은 화면이 「이 자리는 T3-4다」라고 «말하는지»를 AC 로 물었다. T3-4 가 착지하면서
    //    그 문장은 참이 아니게 됐다 — 자리표시가 사라진 것이 옳은 결과다. 지우기만 하면 축이
    //    사라지므로, 뒤집힌 사실을 새 기대로 못박는다(8대 계보 「그물이 판정보다 낡는다」).
    await enterIncident(page);
    await expect(page.getByTestId("timeline-placeholder")).toHaveCount(0);
    await expect(page.getByTestId("evidence-strip-placeholder")).toHaveCount(0);
    await expect(page.getByTestId("run-timeline")).toBeVisible();
    await expect(page.getByTestId("evidence-strip")).toBeVisible();
  });

  test("추세 창 전환이 «실제로 다른 창»을 부르고 캡션이 줄인 사실을 말한다", async ({ page }) => {
    await enterIncident(page);
    const calls: string[] = [];
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.pathname.includes("/series")) calls.push(u.search);
    });
    await page.getByTestId("window-3w").click();
    await expect(page.getByTestId("sensor-trend")).toContainText("bucket-minmax");
    expect(calls.some((s) => s.includes("window=3w")), "3주 버튼이 3w 를 부르지 않았다").toBeTruthy();

    // 🔴 §0.2 측정-주장 경계 — 「줄였다」를 응답만 말하고 화면이 지우면 보는 쪽은 전량을
    //    봤다고 믿는다. 두 수가 «둘 다» 있어야 축약이 보이는 것이므로 둘을 함께 본다.
    const caption = (await page.locator("[data-testid=sensor-trend] figcaption").textContent())!;
    expect(caption, "캡션이 원본 점수를 말하지 않는다").toMatch(/원본\s*[\d,]+점/);
    expect(caption, "캡션이 표시 점수를 말하지 않는다").toMatch(/[\d,]+점\s*표시/);
  });

  test("없는 incident 는 «없다»고 말한다 — «못 물어봤다»와 다른 문장이다", async ({ page }) => {
    // 기다리던 것: 경유일 뿐이다 — 판정선은 다음 진입 뒤 screen-unavailable 이다
    await page.goto("/overview");
    // 기다리던 것: 판정선은 아래 screen-unavailable 의 toBeVisible 이 기다린다
    await page.goto("/incidents/INC-DOES-NOT-EXIST");
    const box = page.getByTestId("screen-unavailable");
    await expect(box).toBeVisible();
    await expect(box, "404 를 «못 물어봤다»로 접었다 — 서버가 나눈 사유가 화면에서 사라진다")
      .toHaveAttribute("data-kind", "not-found");
  });
});

test("화면이 런타임 오류를 내지 않는다 — hydration 불일치 포함", async ({ browser }) => {
  // 🔴 표본을 여러 번 뜨는 축이라 기본 타임아웃 안에 못 끝난다(부하에서 실측) — 계측기가
  //    시간에 걸려 내는 빨강은 대상의 것이 아니다.
  test.slow();
  /* 🔴 red 의 출처: AC 「blocking 0」의 이웃이 아니라, **화면이 살아 있다는 주장 자체**다.
   * hydration 불일치(React #418)는 서버가 그린 트리를 브라우저가 버리고 다시 그리게 한다 —
   * 화면은 «멀쩡해 보이고» 콘솔에서만 운다. 눈으로 보는 검수가 못 잡는 자리라 그물이 든다.
   *
   * 🔴 **이 축은 확률적이다**(11대 실측: /overview 12회 중 2회). 서버가 찍은 시각과
   *    브라우저가 hydration 하는 시각이 «같은 초»면 텍스트가 우연히 일치해 오류가 안 난다.
   *    1회만 열고 초록을 내면 그 초록은 「없다」가 아니라 「이번엔 안 걸렸다」이다 —
   *    한 번의 통과를 부재의 증거로 쓰지 않으려고 표본을 여러 번 뜬다.
   *    대조군: 같은 셸의 `/compare`(시각 텍스트 없음)는 6회 중 0회 — 원인이 이 화면에 있다.
   */
  const N = 6;
  const seen: string[] = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => seen.push(String(e).slice(0, 160)));
    page.on("console", (m) => {
      if (m.type() === "error") seen.push(m.text().slice(0, 160));
    });
    // 기다리던 것: 판정선은 아래 mode-badge 가 checking 을 벗는 것이다(바로 아래 주석이 그 사유다)
    await page.goto("/overview");
    // 🔴 **뒤집힌 사실**(Q-45): 앞판은 500ms 를 «기다려» 「오류 0」을 말했다 — 창이 판정을
    //    정하던 자리다. 부하가 그 창을 먹으면 늦게 온 오류가 조용히 지워진다(위양성 초록).
    //    부재는 창이 아니라 **사건 뒤에** 묻는다: 클라이언트가 «실제로 돌았다»는 양의 신호를
    //    기다린다 — 배지가 `checking` 을 벗는 것은 마운트 effect 가 답까지 받았다는 뜻이고,
    //    hydration 불일치 오류는 그보다 «앞»에서 난다.
    await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
      .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });
    // 기다리던 것: 없다 — 바로 위 mode-badge 가 「클라이언트가 실제로 돌았다」는 양의 신호이고,
    //   hydration 불일치는 그보다 «앞»에서 난다(위 주석). 뒤에 덧댄 가라앉히기는 예산만 먹었다.
    await ctx.close();
  }
  expect(seen, `브라우저가 오류를 냈다(${seen.length}/${N} 표본):\n${seen.join("\n")}`).toEqual([]);
});

/* ────────────────────────────────────────────────────────────────────────────
 * T3-2 재검 축 — 픽스(PR#171)가 «거동»으로 섰는가 (11대).
 *
 * 🔴 red 가 green 이 된 것만 보고 닫지 않는다. D-1·R-3 은 **처방이 다른 형태로 되살아날 수
 *    있는** 병이라, 처방의 «뜻»을 거동으로 묻는 축을 새로 연다.
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe("T3-2 재검 — 처방의 뜻이 거동으로 서는가", () => {
  test("🔴 R-3 — 차트 센서가 «알람 행의 sensorId»에서 온다(문자열 추측이 아니다)", async ({
    page,
  }) => {
    test.slow();
    // ① 알람이 «있는» incident: 유래가 alarm 이고, 그 센서가 알람 행의 sensorId 다.
    // 기다리던 것: 판정선은 아래 start-from-alarm 의 click 이 기다린다
    await page.goto("/overview");
    const { overview } = await overviewFromApi(page);
    const top = overview.activeAlarms[0];
    test.skip(!top, "활성 알람 0건 — 이 축의 표본이 없다");

    await page.getByTestId("start-from-alarm").first().click();
    await page.waitForURL(/\/incidents\/[^/?]+\?run=/, { timeout: 20_000 });
    // 기다리던 것: 추세 패널 — 판정선은 아래 sensor-trend 의 toBeVisible 이 기다린다

    const trend = page.getByTestId("sensor-trend");
    await expect(trend, "알람이 있는데 추세가 안 선다").toBeVisible();
    await expect(trend, "차트가 알람의 센서를 그리지 않는다").toContainText(top.sensorId);
    await expect(
      page.getByTestId("sensor-provenance"),
      "이 곡선이 알람의 것인지 화면이 말하지 않는다",
    ).toContainText(top.alarmId);
    const alarmText = (await page.getByTestId("sensor-provenance").textContent())!;

    /* ② 🔴 **대조군 — 여기가 이 축의 값이다.** VIB 센서가 «있는데» 연결 알람이 없는 설비.
     *    앞판(`sensorId.includes("VIB")`)이었다면 SN-…-VIB 를 골라 놓고 그것을 근거처럼
     *    배치했을 자리다. 지금은 **못 골랐다고 말해야** 한다.
     *    🔴 표본을 이름이 아니라 **조건**으로 찾는다 — id 를 박으면 seed 가 바뀐 날 죽는다. */
    let control: { incidentId: string; sensors: string[] } | null = null;
    // incident 목록 라우트가 계약에 없다 — 화면이 여는 동선으로 닿을 수 있는 표본만 쓴다.
    // 활성 알람이 1건뿐인 seed 에서 «알람 없는» incident 는 딥링크로만 열린다.
    for (const candidate of ["INC-2026-005", "INC-2026-008", "INC-2026-011"]) {
      const r = await page.request.get(`/api/incidents/${candidate}`);
      if (r.status() !== 200) continue;
      const inc = await r.json();
      if (inc.alarmIds.length > 0) continue;
      const eq = await (await page.request.get(`/api/equipment/${encodeURIComponent(inc.equipmentId)}`)).json();
      control = { incidentId: candidate, sensors: eq.sensors.map((s: any) => s.sensorId) };
      if (control.sensors.some((s) => s.includes("VIB"))) break;
    }
    test.skip(!control, "알람이 연결되지 않은 incident 표본을 찾지 못했다 — 대조군 없이 판정하지 않는다");

    // 기다리던 것: 판정선은 아래 sensor-provenance 의 toBeVisible 이 기다린다
    await page.goto(`/incidents/${control!.incidentId}`);
    const prov = page.getByTestId("sensor-provenance");
    await expect(prov, "알람이 없는데 유래를 말하지 않는다").toBeVisible();

    /* 🔴 **낱말이 아니라 뜻을 묻는다**(11대 자수). 처음엔 「특정하지 못했다」라는 «문구»를
     *    기대했고, 화면은 「⚠ 알람 센서가 아니다 — 이 설비의 첫 센서다. 이 incident 에
     *    연결된 알람이 없다」라고 **더 정확히** 말하고 있었다. 정본이 요구한 것은 「못 골랐다고
     *    말한다」이지 「이 낱말로 말한다」가 아니다 — 문구를 그물이 정하면 대상이 그물에
     *    맞춰 자란다(「넓은 축은 엄격함이 아니라 오답」의 형제 형태).
     *    ⇒ 축 = ⓐ 알람 유래일 때와 **다른 문장**을 낸다 ⓑ 없는 알람을 **인용하지 않는다**. */
    const fallbackText = (await prov.textContent())!;
    expect(
      fallbackText === alarmText,
      "알람이 있을 때와 없을 때가 같은 문장이다 — 화면이 유래를 구분하지 않는다",
    ).toBeFalsy();
    expect(
      /AL-\d/.test(fallbackText),
      `연결 알람이 없는데 알람 id 를 인용한다: ${fallbackText}`,
    ).toBeFalsy();
  });

  test("🔴 D-1 — 안내는 «세션»에 묶인다: 닫으면 안 뜨고, 새 세션이면 다시 뜬다", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // 기다리던 것: 판정선은 아래 intro-card 의 toHaveCount(1) 이 기다린다
    await page.goto("/overview");
    await expect(page.getByTestId("intro-card"), "첫 진입 안내가 없다").toHaveCount(1);
    await page.getByTestId("intro-card").getByRole("button", { name: "안내 닫기" }).click();
    // 기다리던 것: 🔴 부재를 묻기 전의 앵커 — 새로고침한 화면이 클라이언트까지 섰는가
    await page.reload();
    await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
      .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });
    await expect(page.getByTestId("intro-card"), "새로고침에 다시 떴다").toHaveCount(0);

    // 재열람 — 앱바 「?」가 실재하고, 눌러서 «다시 열린다».
    const reopen = page.getByTestId("intro-reopen");
    await expect(reopen, "닫은 안내를 다시 열 자리가 없다").toBeVisible();
    await reopen.click();
    await expect(page.getByTestId("intro-card"), "「?」를 눌러도 안 열린다").toHaveCount(1);
    // 🔴 다시 닫으면 닫힌 채로 있어야 한다 — `?intro=1` 이 남아 새로고침이 되열면 「닫았다」가 안 지켜진다.
    await page.getByTestId("intro-card").getByRole("button", { name: "안내 닫기" }).click();
    // 🔴 닫기는 «두 가지»를 한다: 세션에 적고, 주소의 `?intro=1` 을 지운다. 뒤엣것은 라우터가
    //    비동기로 하므로 기다린 뒤에 새로고침한다 — 안 기다리고 reload 하면 아직 남은 쿼리가
    //    카드를 다시 열고, 그 빨강은 대상이 아니라 내 경합이다.
    await expect(page).toHaveURL(/\/overview$/);
    // 기다리던 것: 🔴 부재를 묻기 전의 앵커 — 「닫은 채로 있는가」는 화면이 다시 선 뒤에 묻는다
    await page.reload();
    await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
      .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });
    await expect(page.getByTestId("intro-card"), "닫았는데 새로고침이 다시 열었다").toHaveCount(0);
    await ctx.close();

    // 🔴 **대조군 — 새 세션이면 «다시» 본다.** 안 보이는 것이 「세션 기록」인지 「영영 안 뜸」인지
    //    가르는 유일한 축이다(브라우저 수명 저장소에 적으면 여기서 걸린다 — 정본 §0.1 명문).
    const fresh = await browser.newContext();
    const p2 = await fresh.newPage();
    // 기다리던 것: 판정선은 아래 intro-card 의 toHaveCount(1) 이 기다린다
    await p2.goto("/overview");
    await expect(
      p2.getByTestId("intro-card"),
      "새 세션인데 안내가 안 뜬다 — 세션이 아니라 브라우저에 적힌 것이다",
    ).toHaveCount(1);
    await fresh.close();
  });
});
