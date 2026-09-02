import { test, expect, type Page } from "@playwright/test";

/**
 * 대조군 — 「취소 → 아무 일도 없다」 칸의 단언이 «무엇의» 초록인지 지킨다 (D-22 §④).
 *
 * 고친 그물은 스스로 초록을 만든다: `toHaveCount(0)` 은 훑을 것이 없어도 초록이라, 이 칸이
 * «성공 문면 1건»을 실제로 셀 수 있는지 따로 재지 않으면 「0개를 훑어서 난 초록」과 구별되지 않는다.
 * 그래서 손잡이 하나(성공 응답 모킹 + 「되돌리기」 클릭)만 다른 열을 나란히 두고, 옛 단언
 * `getByRole("status")).not.toContainText(...)` 도 같은 열에서 함께 찍어 위양성의 주어를 남긴다.
 *
 * 🔴 29대 실측 4칸 (셸 = 옛 코드 3011 · API = 배포 8010 · live 열은 `d22_live_axis_proxy.mjs`
 *    override 3022 · 자극 실재 `liveAsked=3 · overridden=3`):
 *
 *   | 열              | mode   | role=status | 「되돌렸습니다」 | 옛 단언 | 새 단언 |
 *   |-----------------|--------|-------------|------------------|---------|---------|
 *   | A 취소          | replay | 1           | 0                | PASS    | PASS    |
 *   | B 성공 모킹     | replay | 2           | 1                | FAIL    | FAIL    |
 *   | A 취소          | live   | **0**       | 0                | 🔴 FAIL | PASS    |
 *   | B 성공 모킹     | live   | 1           | 1                | FAIL    | FAIL    |
 *
 *   새 단언은 네 칸 모두 «문면의 수»를 따라간다(0→초록 · 1→빨강). 옛 단언은 mode=live·취소 칸에서
 *   대상이 옳게 동작하는데도 빨강이었다 — 그 칸이 재던 것은 문면이 아니라 배너의 존재였다.
 *
 * 이 파일은 baseURL 이 어느 모드든 성립한다(판정선은 열 B 에만 둔다 — 열 A 의 옛 단언 결과는
 * 모드에 따라 갈리므로 기록만 한다).
 */

async function enter(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
}

/** 단언을 «판정» 대신 «관측»으로 돌린다 — 통과/실패 자체가 이 대조군의 측정값이다. */
async function observe(label: string, fn: () => Promise<void>): Promise<"PASS" | "FAIL"> {
  try {
    await fn();
    console.log(`   ${label} → PASS`);
    return "PASS";
  } catch (e) {
    console.log(`   ${label} → FAIL (${(e instanceof Error ? e.message : String(e)).split("\n")[0]})`);
    return "FAIL";
  }
}

test.describe("리셋 «취소» 칸의 검출력", () => {
  test("열 A — 취소(문면 없음): 계수를 남긴다", async ({ page }) => {
    await enter(page);
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const roleCount = await page.getByRole("status").count();
    const textCount = await page.getByText("되돌렸습니다").count();
    console.log(`== 열 A (취소) · role=status ${roleCount} · 「되돌렸습니다」 ${textCount}`);
    const oldV = await observe("옛 단언 not.toContainText", () =>
      expect(page.getByRole("status")).not.toContainText("되돌렸습니다"),
    );
    const newV = await observe("새 단언 toHaveCount(0)  ", () =>
      expect(page.getByText("되돌렸습니다")).toHaveCount(0),
    );
    console.log(`   A: role=${roleCount} text=${textCount} old=${oldV} new=${newV}`);

    // 문면이 없는 열에서는 새 단언이 초록이어야 한다 — 여기가 빨강이면 본 칸의 초록도 못 믿는다.
    expect(newV, "문면 0 인데 새 단언이 빨강 = 그물이 다른 것을 재고 있다").toBe("PASS");
    expect(textCount).toBe(0);
  });

  test("열 B — 성공 모킹 + 되돌리기(문면 1건): 새 단언이 그것을 잡는가", async ({ page }) => {
    // ← 손잡이 하나. 응답 shape 은 본 스펙의 성공 칸과 같은 idiom.
    await page.route("**/api/sessions/*/reset", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );
    await enter(page);
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "되돌렸습니다" })).toBeVisible();

    const roleCount = await page.getByRole("status").count();
    const textCount = await page.getByText("되돌렸습니다").count();
    console.log(`== 열 B (성공 모킹) · role=status ${roleCount} · 「되돌렸습니다」 ${textCount}`);
    const oldV = await observe("옛 단언 not.toContainText", () =>
      expect(page.getByRole("status")).not.toContainText("되돌렸습니다"),
    );
    const newV = await observe("새 단언 toHaveCount(0)  ", () =>
      expect(page.getByText("되돌렸습니다")).toHaveCount(0),
    );
    console.log(`   B: role=${roleCount} text=${textCount} old=${oldV} new=${newV}`);

    // 🔴 판정선: 문면이 실제로 뜬 열에서 새 단언은 «빨강»이어야 한다.
    expect(textCount, "성공 모킹인데 문면이 1건이 아니다 = 자극이 실재하지 않았다").toBe(1);
    expect(newV, "새 단언이 문면 1건을 놓쳤다 = 검출력 없음").toBe("FAIL");
  });
});
