import { test, expect, type Page } from "@playwright/test";

/**
 * T3-6 선행 — §21 Phase 2 완료 증거를 «브라우저»에서 잴 축의 골격.
 *
 * 🔴 이 파일은 아직 «재지 않는다». 화면(Phase 3)과 세션 가드(T3-1)가 착지하기 전이라
 *    전건 skip 한다. 축 계획의 정본은 `evidence/t3-6-e2e-axis-plan.md` 다.
 *
 * 🔴 두 가지를 일부러 하지 않았다:
 *    ① **셀렉터를 적지 않았다.** 화면이 없는데 셀렉터를 먼저 적으면 화면이 그 셀렉터에
 *       맞춰 만들어진다 — 그물이 대상을 규정하는 역전이고, 그러면 이 spec 의 초록은
 *       「내가 시킨 대로 만들었다」의 초록이지 「증거가 참이다」가 아니다.
 *    ② **skip 을 초록으로 만들지 않았다.** playwright 는 skip 을 pass 와 다르게 적는다 —
 *       판정문에 옮길 때도 그 구분을 유지한다(「건너뛴 행은 초록으로 세지 않는다」).
 *
 * 착지 후 이 파일이 할 일은 `test.skip(...)` 조건을 지우고 red 문장을 채우는 것뿐이다.
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

/** 그 화면이 이 빌드에 있는가 — 없으면 재지 않는다(없는 것을 빨강으로 세지 않는다). */
async function screenExists(page: Page, path: string): Promise<boolean> {
  const res = await page.request.get(path, { maxRedirects: 0 });
  return res.status() < 400;
}

test.describe("§21 증거 — 브라우저에서만 보이는 축", () => {
  test.beforeEach(async () => {
    test.skip(!(await guardLanded()),
      "T3-1 세션 가드 미착지 — 🔴 skip 은 초록이 아니다(아직 안 쟀다는 뜻)");
  });

  test("E-1 세션 가드 — 가드 홉 «뒤»에서 세션이 실제로 선다", async ({ page }) => {
    test.fixme(true, "Phase 3 화면 착지 후 — 307 만 보고 초록 내지 않는다(브라우저로 따라간다)");
    await page.goto("/overview");
    expect(true).toBe(true);
  });

  test("E-2 연쇄 — 조사→근거→WO 승인이 «클릭으로» 이어진다", async ({ page }) => {
    test.fixme(true, "Phase 3 화면 착지 후 — id 를 손으로 옮겨야 이어지면 통합이 아니다");
    await page.goto("/overview");
  });

  test("E-3 전략 비교 — 세 score 를 «크기»로 견주지 않는다 (Q-17)", async ({ page }) => {
    test.fixme(true, "Phase 3 전략비교 화면 착지 후 — 막대 길이·정렬·「가장 높은」 라벨이 red");
    await page.goto("/overview");
  });

  test("E-4 인용 강조 — 강조가 «그 문장» 위에 그려진다", async ({ page }) => {
    test.fixme(true, "Phase 3 문서 화면 착지 후 — 좌표가 없는데 그럴듯한 위치를 그리면 red");
    await page.goto("/overview");
  });

  test("E-5 R12 — 화면이 안전 조치를 «지울 수 있다»고 말하지 않는다", async ({ page }) => {
    test.fixme(true, "Phase 3 WO 화면 착지 후 — 서버가 막아도 UI 가 성공을 말하면 red(«침묵» 계보)");
    await page.goto("/overview");
  });

  test("E-6 배지 — Live/Replay 를 «두 축의 조합»으로 말한다 (v0.1.3)", async ({ page }) => {
    test.fixme(true, "기존 mode-badge.spec.ts 축과 합류 시점 판단 — 한 축만 보고 말하면 red");
    await page.goto("/overview");
  });
});

test("골격 자기 검증 — 이 파일은 «아직 재지 않았다»를 정직하게 말한다", async () => {
  // 🔴 유일하게 지금 도는 행. 재는 것은 대상이 아니라 «이 파일의 정직성»이다:
  //    가드가 미착지인 동안 위 축들이 초록을 내지 않는다는 것을 스스로 확인한다.
  const landed = await guardLanded();
  if (!landed) {
    expect(landed).toBe(false); // 미착지 = 위 describe 는 전건 skip 된다
  } else {
    // 가드가 착지했는데 축들이 아직 fixme 라면, 그것은 «갱신되지 않은 그물»이다.
    // 🔴 그 사실을 조용히 두지 않는다 — 실패로 드러낸다.
    throw new Error(
      "가드가 착지했다 — 이 spec 의 fixme 를 걷어내고 red 문장을 채워라(그물이 판정보다 낡았다)",
    );
  }
});
