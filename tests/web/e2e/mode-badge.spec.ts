import { test, expect, type Page } from "@playwright/test";

/**
 * 축 ① — 모드 배지 «전이». 구현이 「재지 않았다」고 명시 이월한 축이다.
 *
 * 구현이 실측한 것은 SSR 이 4요소를 그린다는 것까지다. 배지는 마운트 시점에 `checking` 으로
 * 서고 useEffect 가 돈 «뒤에» 답으로 바뀐다 — 그 전이는 서버 응답 본문에 없다. 브라우저에서만 보인다.
 *
 * 🔴 전이를 재려면 «전» 상태를 붙잡을 시간이 있어야 한다. 그래서 응답을 일부러 늦춘다
 *    (계약 시간초과 2s 안쪽인 800ms — 늦추다 못해 타임아웃을 재면 다른 축을 재게 된다).
 * 🔴 4상태를 «내가 만든 응답»으로 각각 세우되, 마지막 한 건은 모킹 없이 실제 ai-api 로 잰다.
 *    모킹만으로 낸 초록은 「내 mock 이 계약대로다」의 초록이지 「셸이 백엔드와 맞물린다」가 아니다.
 */

const LIVE = "**/api/live/status";

/** 세션을 발급받아 셸이 선 상태로 만든다(`/` 가 쿠키를 심고 `/overview` 로 보낸다). */
async function enter(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
}

test.describe("모드 배지", () => {
  test("전이: 마운트 «확인 중» → 응답 후 REPLAY (online:false)", async ({ page }) => {
    await page.route(LIVE, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }),
      });
    });

    await enter(page);
    const badge = page.getByTestId("mode-badge");

    // 🔴 «전» 상태를 실제로 붙잡는다. 끝 상태만 보면 「처음부터 REPLAY 였다」와 구분되지 않는다.
    await expect(badge).toHaveAttribute("data-mode", "checking");
    await expect(badge).toContainText("확인 중");

    await expect(badge).toHaveAttribute("data-mode", "replay");
    await expect(badge).toContainText("REPLAY");
    await expect(badge).toContainText("◑"); // §11.3 색 단독 금지 — 아이콘 병행
  });

  test("online:true → LIVE", async ({ page }) => {
    await page.route(LIVE, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ online: true, checkedAt: new Date().toISOString() }),
      }),
    );
    // 🔴 배너를 「LIVE 니까 없다」로 재려면 «다른» 배너 사유도 함께 꺼야 한다.
    //    지금 세션은 pending(POST /sessions 501) 이라 그 사유만으로도 배너가 선다 —
    //    처음에 나는 그것을 빼먹고 「LIVE 인데 배너가 뜬다」를 결함으로 읽을 뻔했다.
    //    한 축을 재려면 나머지 축을 눌러 두어야 한다.
    await page.context().addCookies([
      { name: "fkt_session", value: "api:LIVE0000test", url: process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101" },
    ]);
    await enter(page);
    const badge = page.getByTestId("mode-badge");
    await expect(badge).toHaveAttribute("data-mode", "live");
    await expect(badge).toContainText("LIVE");
    await expect(badge).toContainText("◉");
    // LIVE + 서버가 아는 세션 = 알릴 것이 없다 → 조건부 슬롯이 자리를 비운다.
    await expect(page.getByTestId("fallback-banner")).toHaveCount(0);
  });

  test("응답 없음 → «미연결» + fallback 배너 · 🔴 REPLAY 라고 적지 않는다", async ({ page }) => {
    await page.route(LIVE, (route) => route.abort("connectionrefused"));
    await enter(page);
    const badge = page.getByTestId("mode-badge");
    await expect(badge).toHaveAttribute("data-mode", "unavailable");
    await expect(badge).toContainText("미연결");
    // 🔴 이 축이 요점이다: 「못 물어봤다」를 「Replay 로 전환됐다」로 적으면 화면이 모르는 것을
    //    아는 척한다(baseline §0.2). 두 문장이 섞이지 않는지 본문으로 확인한다.
    await expect(badge).not.toContainText("REPLAY");
    const banner = page.getByTestId("fallback-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("확인하지 못했습니다");
    await expect(banner).toContainText("오류가 아닙니다");
  });

  test("모킹 없이 실제 ai-api 로 — online:false → REPLAY (E1 왕복)", async ({ page }) => {
    await enter(page);
    const badge = page.getByTestId("mode-badge");
    await expect(badge).toHaveAttribute("data-mode", "replay");
    await expect(badge).toContainText("REPLAY");
    // rewrite 를 지나 ai-api 까지 «닿아» 온 답이라는 것 — 배너가 replay 문구로 선다.
    await expect(page.getByTestId("fallback-banner")).toContainText("Replay로 전환");
  });

  test("배지는 색 없이도 읽힌다 — 아이콘+텍스트 병행(§10·§11.3)", async ({ page }) => {
    await enter(page);
    const badge = page.getByTestId("mode-badge");
    // 🔴 「색으로 구분한다」의 반대 축: 텍스트를 지우고 색만 남겨도 되는가를 묻는 게 아니라,
    //    색을 못 보는 사람에게 «무엇이 남는가»를 묻는다. 아이콘 1자 + 상태어가 남아야 한다.
    const text = ((await badge.textContent()) ?? "").trim();
    expect(text).toMatch(/[◉◑◌]/);
    expect(text.replace(/[◉◑◌\s]/g, "")).not.toHaveLength(0);
  });
});
