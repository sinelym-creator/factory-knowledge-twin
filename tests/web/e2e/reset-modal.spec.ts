import { test, expect, type Page } from "@playwright/test";

/**
 * 축 ① — 리셋 «모달 동작». 구현이 재지 않은 두 번째 축.
 *
 * 여기서 갈리는 것은 P0 11항의 «리셋»이 참인가 거짓인가다. 버튼이 있다는 것과, 눌렀을 때
 * ⓐ 확인을 «먼저» 묻고 ⓑ 계약 경로로 나가고 ⓒ 응답을 받기 «전»에는 성공을 말하지 않는 것은
 * 서로 다른 주장이다. 렌더 확인은 ⓐ~ⓒ 중 아무것도 증명하지 않는다.
 */

async function enter(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
}

/** 쿠키에 실린 세션 id — 나가는 요청 경로가 «이 세션»을 가리키는지 대조하기 위한 것. */
async function sessionId(page: Page): Promise<string> {
  const c = (await page.context().cookies()).find((x) => x.name === "fkt_session");
  expect(c, "세션 쿠키가 없다 — 입장 절차가 깨졌다").toBeTruthy();
  const [, id] = decodeURIComponent(c!.value).split(":");
  expect(id).toBeTruthy();
  return id;
}

test.describe("세션 리셋", () => {
  test("🔴 버튼만 눌러서는 리셋되지 않는다 — 확인 모달이 먼저 서고, 그때까지 네트워크 0", async ({ page }) => {
    await enter(page);
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/reset")) calls.push(r.method() + " " + new URL(r.url()).pathname);
    });

    await page.getByTestId("reset-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("되돌릴까요?");
    // 무엇을 잃는지 먼저 말한다 — 확인 모달의 값은 «되돌릴 수 없는 것»을 알리는 데 있다.
    await expect(dialog).toContainText("사라집니다");
    await expect(dialog.getByRole("button", { name: "취소" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "되돌리기" })).toBeVisible();
    expect(calls, "모달 단계에서 이미 요청이 나갔다 = 확인이 확인이 아니다").toEqual([]);
  });

  test("R-3 회귀 — 모달 스크림이 토큰 계층을 «지난다»(하드코딩 색값 아님)", async ({ page }) => {
    // 있었던 일: 스크림만 `bg-black/60` 으로 토큰 계층 «밖»에 있었다. AC 「하드코딩 최소」는
    // 만족했지만, UX 폴리시 패스가 @theme 만 훑으면 이 한 곳이 빠진다.
    // 고쳐진 것: --color-scrim 토큰 + `bg-scrim`.
    // 🔴 값을 고정하지 않는다 — 색은 D-002 유보분이다. 재는 것은 「토큰을 지나는가」뿐이다.
    await enter(page);
    await page.getByTestId("reset-button").click();
    const scrim = page.locator(".fixed.inset-0").first();
    await expect(scrim).toBeVisible();
    const [bg, token] = await scrim.evaluate((e) => [
      getComputedStyle(e).backgroundColor,
      getComputedStyle(document.documentElement).getPropertyValue("--color-scrim").trim(),
    ]);
    expect(token, "--color-scrim 토큰이 브라우저에 없다").not.toBe("");
    // 적용된 배경이 «투명하지 않다» = 선언이 유효했다(V-2 처럼 무효 선언이면 버려진다)
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg).toMatch(/^rgba?\(/);
  });

  test("취소 → 모달만 닫히고 아무 일도 없다", async ({ page }) => {
    await enter(page);
    const calls: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/reset")) calls.push(r.url()); });

    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(calls).toEqual([]);
    /* 🔴 D-22 §④ — 재려는 것은 「성공 문면이 화면에 없다」인데, 옛 단언
     *   `expect(page.getByRole("status")).not.toContainText("되돌렸습니다")` 은 그것을 재지 못했다.
     *   이 화면에서 `role=status` 를 다는 것은 **FallbackBanner 하나뿐**이고, 그 배너는 모드가
     *   replay·unavailable 일 때만 선다. 그래서 결과가 «문면»이 아니라 «배너의 존재»에 묶였다 —
     *   mode=live 열에서는 읽을 영역이 없어 `element(s) not found` 로 빨강이 났고, 그 빨강은
     *   대상의 것이 아니었다(취소 뒤 `/reset` 0건 · 문면 0 · dialog 0 — 두 모드에서 같다).
     *   ⇒ 롤이 아니라 **문면의 수**를 센다. 검출력은 대조군이 재고 있다:
     *   `_ctrl` 아닌 `reset-modal-detection-control.spec.ts` 4칸(replay/live × 취소/성공모킹) —
     *   문면 0 인 두 칸은 초록, 문면 1 인 두 칸은 빨강(1/1). 옛 단언은 같은 4칸에서 3칸 빨강이었다.
     */
    await expect(page.getByText("되돌렸습니다")).toHaveCount(0);
  });

  test("되돌리기 → 계약 경로 그대로 나간다 (POST /api/sessions/{sid}/reset · E1)", async ({ page }) => {
    await enter(page);
    const sid = await sessionId(page);

    const req = page.waitForRequest((r) => r.url().includes("/reset"));
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "되돌리기" }).click();
    const sent = await req;

    // 🔴 정적 스캔은 «소스에 무엇이 적혀 있는가»를 본다. 이건 «실제로 무엇이 나갔는가»다.
    expect(sent.method()).toBe("POST");
    expect(new URL(sent.url()).pathname).toBe(`/api/sessions/${encodeURIComponent(sid)}/reset`);
  });

  test("백엔드 실패 → «못 했다»고 말한다 (성공으로 접지 않는다)", async ({ page }) => {
    // 🔴 표본을 «모킹»으로 옮겼다. 이 칸은 T1-9 때 실제 백엔드가 501 을 주던 시절에
    //    「501 이라고 말하는가」로 세웠는데, T3-1 이 reset 을 구현하면서 그 전제가 사라졌다 —
    //    낡은 단언이 빨강을 냈고, 그 빨강은 대상의 것이 아니었다.
    //    이 칸이 «재려던 것»은 501 이라는 숫자가 아니라 **실패를 성공으로 접지 않는가**다.
    //    그래서 실패를 내가 만들어 던진다(성공 경로를 모킹으로 재는 아래 칸과 같은 idiom).
    await page.route("**/api/sessions/*/reset", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "dependency_unavailable", message: "x" } }),
      }),
    );
    await enter(page);
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "되돌리기" }).click();

    const status = page.getByRole("status").filter({ hasText: "초기화" });
    await expect(status).toBeVisible();
    await expect(status).toContainText("초기화하지 못했습니다");
    await expect(status).toContainText("503");
    // 🔴 이 한 줄이 P0 「리셋 동작」의 참·거짓을 가른다.
    await expect(status).not.toContainText("되돌렸습니다");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("응답이 ok 일 때만 «되돌렸습니다» — 모킹으로 성공 경로 실측", async ({ page }) => {
    await page.route("**/api/sessions/*/reset", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );
    await enter(page);
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "되돌렸습니다" })).toBeVisible();
  });

  test("느린 응답 동안 «되돌리는 중…» + 버튼 잠금 — 두 번 눌러 두 번 나가지 않는다", async ({ page }) => {
    let n = 0;
    await page.route("**/api/sessions/*/reset", async (route) => {
      n++;
      await new Promise((r) => setTimeout(r, 900));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    /* 🔴 «지나가는 상태»를 제때 봐서 잡지 않는다 — 자취를 읽는다 (Q-45 · Q-41 과 같은 병).
     *
     * 앞판은 응답을 900ms 늦추고 그 창 «안에서» 잠금·문구를 관측했다. 자극은 벽시계인데
     * 관측 시점은 부하에 끌려가므로(Q-41 실측: 전체 실행에서 드라이버가 3.4배 느려진다),
     * 그 여유가 사라지는 날 이 행은 대상이 아니라 부하 때문에 빨강을 낸다.
     * 응답을 «관측이 끝날 때까지» 잡아 두는 길은 막혀 있다 — 클라이언트 계약 시간초과가
     * 2s 라 그보다 오래 잡으면 다른 사건(오류)을 재게 된다.
     * ⇒ 문서가 만들어지기 «전»에 관찰자를 심어 버튼이 거쳐 간 상태를 적는다.
     */
    await page.addInitScript(() => {
      const w = window as unknown as { __resetTrail: [boolean, string][] };
      w.__resetTrail = [];
      const push = () => {
        const btn = document.querySelector('[role="dialog"] button:last-of-type') as
          | HTMLButtonElement
          | null;
        if (!btn) return;
        const now: [boolean, string] = [btn.disabled, (btn.textContent ?? "").trim()];
        const last = w.__resetTrail[w.__resetTrail.length - 1];
        if (!last || last[0] !== now[0] || last[1] !== now[1]) w.__resetTrail.push(now);
      };
      new MutationObserver(push).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      document.addEventListener("DOMContentLoaded", push);
    });

    await enter(page);
    await page.getByTestId("reset-button").click();
    const go = page.getByRole("button", { name: /되돌리기|되돌리는 중/ });
    await go.click();
    await expect(page.getByRole("status").filter({ hasText: "되돌렸습니다" })).toBeVisible();
    expect(n, "리셋 요청이 두 번 나갔다").toBe(1);

    // 🔴 끝 상태만 보면 「잠긴 적이 없어도」 초록이다. 자취가 그 둘을 가른다.
    const trail = await page.evaluate(
      () => (window as unknown as { __resetTrail: [boolean, string][] }).__resetTrail,
    );
    expect(
      trail.some(([disabled, text]) => disabled && /되돌리는 중/.test(text)),
      `버튼이 «잠긴 채 되돌리는 중»인 적이 없다 — 자취: ${JSON.stringify(trail)}`,
    ).toBe(true);
  });
});
