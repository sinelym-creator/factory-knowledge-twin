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

  test("E-2 연쇄 — 조사→근거→WO 승인이 «클릭으로» 이어진다", async ({ page }) => {
    test.fixme(true, "브라우저 데이터 경로(V-1) 복구 후 — 401 위에서는 잴 수 없다");
    await page.goto("/overview");
  });

  test("E-3 전략 비교 — 세 score 를 «크기»로 견주지 않는다 (Q-17)", async ({ page }) => {
    test.fixme(true, "브라우저 데이터 경로(V-1) 복구 후 — 막대 길이·정렬·「가장 높은」 라벨이 red");
    await page.goto("/compare");
  });

  test("E-4 인용 강조 — 강조가 «그 문장» 위에 그려진다", async ({ page }) => {
    test.fixme(true, "브라우저 데이터 경로(V-1) 복구 후 — 좌표가 없는데 그럴듯한 위치를 그리면 red");
    await page.goto("/overview");
  });

  test("E-5 R12 — 화면이 안전 조치를 «지울 수 있다»고 말하지 않는다", async ({ page }) => {
    test.fixme(true, "Phase 3 WO 화면 데이터 착지 후 — 서버가 막아도 UI 가 성공을 말하면 red");
    await page.goto("/overview");
  });

  test("E-6 배지 — Live/Replay 를 «두 축의 조합»으로 말한다 (v0.1.3)", async ({ page }) => {
    test.fixme(true, "기존 mode-badge.spec.ts 축과 합류 시점 판단 — 한 축만 보고 말하면 red");
    await page.goto("/overview");
  });
});

test("골격 정직성 — «못 잼»을 조건으로 묶는다", async ({ page }) => {
  // 🔴 유일하게 조건 없이 도는 행. 재는 것은 대상이 아니라 «이 파일의 정직성»이다.
  //    E-2~E-6 을 미룬 이유는 「나중에 하자」가 아니라 **브라우저 데이터 경로가 401**이라는
  //    측정 가능한 사실이다. 그 사실이 뒤집히면 미룰 근거가 사라지므로, 여기서 실패시킨다.
  const alive = await browserDataAlive(page);
  expect(
    alive,
    "브라우저 데이터 경로가 살아났다 — E-2~E-6 의 fixme 를 걷어내고 red 문장을 채워라" +
      "(그물이 판정보다 낡았다)",
  ).toBe(false);
});
