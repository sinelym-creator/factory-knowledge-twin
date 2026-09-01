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
    /* 🔴 **지나간 상태를 «제때 봐서» 잡지 않는다 — 지나간 자취를 읽는다** (Q-41).
     *
     * 앞판은 응답을 800ms 늦추고 그 안에 관측이 끝나기를 기대했다. 그 여유는 어디에도
     * 강제돼 있지 않다 — 자극은 벽시계인데 관측 시점은 부하에 끌려간다. 그래서 이 행은
     * 단독으로는 통과하고 전체 실행에서는 죽었다(원장 Q-41).
     *   실측(E1): 단독 자극→관측 gap 24~36ms · 전체 실행(8 workers) 42~66ms · `goto` 는
     *   313ms → 1049ms(3.4배). 기전 증명 — 관측을 400ms 늦추면 `checking`, **900ms 면
     *   `replay`**. 즉 이 행의 판정은 「대상이 옳은가」가 아니라 「그날 드라이버가 빨랐나」였다.
     *
     * 🔴 응답을 «관측이 끝날 때까지» 잡아 두는 길은 막혀 있다 — 클라이언트 계약 시간초과가
     *    2s 라(`lib/contract.ts` `TIMEOUT_MS`), 3s 를 잡아 두면 배지는 `replay` 가 아니라
     *    `unavailable` 로 간다(실측으로 확인했다). 그 길은 창을 800ms→2s 로 넓힐 뿐
     *    의존을 없애지 못한다.
     *
     * 그래서 **자취를 남긴다**: 문서가 만들어지기 «전»에 관찰자를 심어 배지가 거쳐 간
     * 상태를 순서대로 적는다. 그러면 내가 언제 보든 전이는 기록에 남아 있고, 이 행의
     * 판정에서 시간이 빠진다. 남은 것은 **끝 상태**(자동 재시도가 지켜 준다)와 **자취**뿐이다.
     *
     * 🔴 그리고 **자극이 실재했는지 먼저 묻는다.** 클라이언트가 묻지도 않았다면 첫 자취
     *    `checking` 은 전이의 앞이 아니라 SSR 이 그린 마운트 상태일 뿐이다 — 그 초록은
     *    이 축의 것이 아니다.
     */
    await page.addInitScript(() => {
      const w = window as unknown as { __modeTrail: [string, string][] };
      w.__modeTrail = [];
      const push = () => {
        const el = document.querySelector('[data-testid="mode-badge"]');
        const mode = el?.getAttribute("data-mode");
        if (!mode) return;
        const last = w.__modeTrail[w.__modeTrail.length - 1];
        if (!last || last[0] !== mode) w.__modeTrail.push([mode, (el?.textContent ?? "").trim()]);
      };
      new MutationObserver(push).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-mode"],
      });
      document.addEventListener("DOMContentLoaded", push);
    });

    const asked = page.waitForRequest(LIVE, { timeout: 10_000 });
    await page.route(LIVE, async (route) => {
      // 지연은 «확인 중» 창이 실재하게 만드는 자극이다(계약 시간초과 2s 안쪽).
      // 관측이 그 안에 들어야 할 이유는 이제 없다 — 자취가 대신 본다.
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }),
      });
    });

    await enter(page);
    await asked;
    const badge = page.getByTestId("mode-badge");

    await expect(badge).toHaveAttribute("data-mode", "replay");
    await expect(badge).toContainText("REPLAY");
    await expect(badge).toContainText("◑"); // §11.3 색 단독 금지 — 아이콘 병행

    // 🔴 끝 상태만 보면 「처음부터 REPLAY 였다」와 구분되지 않는다. 자취가 그 둘을 가른다.
    const trail = await page.evaluate(
      () => (window as unknown as { __modeTrail: [string, string][] }).__modeTrail,
    );
    expect(trail.map(([mode]) => mode), `자취: ${JSON.stringify(trail)}`).toEqual([
      "checking",
      "replay",
    ]);
    expect(trail[0][1], "「확인 중」 자리에 그 낱말이 실제로 있었다").toContain("확인 중");
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
    // rewrite 를 지나 ai-api 까지 «닿아» 온 답이라는 것 — 배너가 online:false 문구로 선다.
    // 🔴 「끊겼다·전환했다」가 아니라 «게이트 없음»이다(Q-69 · baseline §0.2).
    await expect(page.getByTestId("fallback-banner")).toContainText("Live AI 게이트가 없습니다");
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
