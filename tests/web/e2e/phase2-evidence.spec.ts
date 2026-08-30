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
  const res = await page.request.get("/api/scenarios");
  return res.status() === 200;
}

test.describe("§21 증거 — 브라우저에서만 보이는 축", () => {
  test.beforeEach(async () => {
    test.skip(!(await guardLanded()),
      "T3-1 세션 가드 미착지 — 🔴 skip 은 초록이 아니다(아직 안 쟀다는 뜻)");
  });

  test("E-1 세션 가드 — 가드 홉 «뒤»에서 ai-api 세션이 브라우저까지 선다", async ({ page }) => {
    // 🔴 307 만 보고 초록을 내지 않는다. 방문자는 리다이렉트를 «따라가고», 따라간 끝에서
    //    실제로 격리가 서는지는 브라우저 쿠키와 브라우저가 부르는 API 로만 보인다.
    await page.goto("/overview");

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

  test("E-2 연쇄 — 조사→근거→WO 승인이 «클릭으로» 이어진다", async ({ page }) => {
    test.fixme(await stillPlaceholder(page, "/overview"),
      "Overview 가 자리표시다 — 이을 화면이 아직 없다");
    await page.goto("/overview");
  });

  test("E-3 전략 비교 — 세 score 를 «크기»로 견주지 않는다 (Q-17)", async ({ page }) => {
    test.fixme(await stillPlaceholder(page, "/compare"),
      "Compare 가 자리표시다 — 견줄 3열이 아직 없다");
    await page.goto("/compare");
  });

  test("E-4 인용 강조 — 강조가 «그 문장» 위에 그려진다", async ({ page }) => {
    test.fixme(await stillPlaceholder(page, "/evidence/DOC-MAN-0021%40r1%23005"),
      "Evidence 뷰가 자리표시다 — 강조할 본문이 아직 없다");
    await page.goto("/evidence/DOC-MAN-0021%40r1%23005");
  });

  test("E-5 R12 — 화면이 안전 조치를 «지울 수 있다»고 말하지 않는다", async ({ page }) => {
    test.fixme(await stillPlaceholder(page, "/work-orders/WOD-x"),
      "WO 화면이 자리표시다 — 지울 안전 조치가 아직 없다");
    await page.goto("/work-orders/WOD-x");
  });

  test("E-6 배지 — Live/Replay 를 «두 축의 조합»으로 말한다 (v0.1.3)", async ({ page }) => {
    // 🔴 오늘 mode-badge.spec.ts 가 덮는 것은 «게이트 축»(/live/status.online) 뿐이다.
    //    v0.1.3 이 말한 나머지 한 축(run/envelope 의 `mode` = 이벤트 «출처»)은 그릴 run 화면이
    //    없어서 아직 축으로 서지 않는다 — 배지가 한 축만 말하는 것이 «지금은» 참이다.
    test.fixme(await stillPlaceholder(page, "/overview"),
      "run 을 그리는 화면이 자리표시다 — 조합할 두 번째 축이 아직 없다(게이트 축은 mode-badge.spec.ts 가 덮는다)");
    await page.goto("/overview");
  });
});

/** 그 화면이 아직 «자리표시»인가 — 축의 관문을 사람 말이 아니라 화면에게 묻는다. */
async function stillPlaceholder(page: Page, path: string): Promise<boolean> {
  await page.goto(path);
  return (await page.getByText(PLACEHOLDER).count()) > 0;
}

const PLACEHOLDER = "이 자리에 올 것";

const AXIS_SCREENS: ReadonlyArray<readonly [string, string]> = [
  ["E-2 연쇄", "/overview"],
  ["E-3 전략 비교", "/compare"],
  ["E-4 인용 강조", "/evidence/DOC-MAN-0021%40r1%23005"],
  ["E-5 R12", "/work-orders/WOD-x"],
  ["E-6 배지 두 축", "/overview"],
];

test("골격 정직성 — «못 잼»을 화면별 조건에 묶는다", async ({ page }) => {
  // 🔴 이 행은 대상이 아니라 «이 파일의 정직성»을 잰다. 미룬 축마다 관문이 하나씩 있고,
  //    그 관문이 열리면 여기서 실패해서 「그 축을 채워라」고 이름을 대며 말한다.
  //
  //    🔴 앞판의 관문(「브라우저 데이터 경로 401」)은 «틀린 관문»이었다. V-1 이 고쳐져
  //       조건이 풀렸는데도 축은 여전히 못 쟀다 — 화면이 자리표시였기 때문이다.
  //       조건을 잘못 잡으면 정직성 테스트가 «거짓 채근»을 한다. 그래서 화면으로 옮겼다.
  const ready: string[] = [];
  for (const [axis, path] of AXIS_SCREENS) {
    if (!(await stillPlaceholder(page, path))) ready.push(`${axis} (${path})`);
  }
  expect(
    ready,
    `화면이 자리표시를 벗었다 — 해당 축의 fixme 를 걷어내고 red 문장을 채워라: ${ready.join(", ")}`,
  ).toEqual([]);
});
