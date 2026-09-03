import { test, expect, type Page } from "@playwright/test";

/**
 * 축 ② — AC 재검을 «브라우저»에서. AC ①(6라우트)·②(AppShell 4요소).
 *
 * 🔴 구현의 실측은 SSR 응답 본문이었다. 본문에 태그가 있다는 것과 그 요소가 «보인다»는 것은
 *    다르다(display:none·클라이언트 예외로 사라지는 자리가 실제로 있다). 여기서는 보이는 것을 센다.
 * 🔴 그리고 4요소는 5화면 «공통»이어야 셸이다 — 한 화면에서만 보이면 그건 셸이 아니라 부품이다.
 */

const P0 = [
  { route: "/", lands: "/overview", screen: "Factory Overview" },
  { route: "/overview", lands: "/overview", screen: "Factory Overview" },
  { route: "/incidents/INC-2025-019", lands: "/incidents/INC-2025-019", screen: "Incident" },
  { route: "/evidence/EV-2025-001", lands: "/evidence/EV-2025-001", screen: "Evidence" },
  { route: "/work-orders/WO-2025-001", lands: "/work-orders/WO-2025-001", screen: "" },
  { route: "/compare", lands: "/compare", screen: "" },
];

async function enter(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
}

/**
 * 🔴 백엔드가 «발급한» 세션(origin=api) 상태를 만든다 — 쿠키를 직접 심는다.
 *
 *    처음에 나는 page.route 로 `POST /api/sessions` 를 200 으로 모킹했고, 안 먹었다.
 *    세션 발급은 proxy.ts 가 «서버에서» 하므로 그 요청은 브라우저를 지나지 않는다 —
 *    가로챌 것이 애초에 없었다. 안 먹는 모킹은 「조건을 세웠다」는 착각만 남긴다.
 */
async function seedApiSession(page: Page, id: string) {
  await page.context().addCookies([
    { name: "fkt_session", value: `api:${id}`, url: process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101" },
  ]);
}

test.describe("셸·라우트 골격", () => {
  test("P0 6경로 전건 도달 — `/` 는 /overview 로 흡수된다(§6)", async ({ page }) => {
    await enter(page); // 세션을 먼저 받는다 — 가드는 session-guard.spec 의 축이다
    for (const r of P0) {
      const res = await page.goto(r.route);
      expect(res?.status(), `${r.route} 최종 응답`).toBe(200);
      await expect(page, `${r.route} 착지`).toHaveURL(new RegExp(esc(r.lands) + "(\\?.*)?$"));
      await expect(page.locator("main")).toBeVisible();
      if (r.screen) await expect(page.locator("h1")).toContainText(r.screen);
    }
  });

  test("AppShell 4요소가 5화면 «전부»에서 보인다", async ({ page }) => {
    await enter(page);
    for (const r of P0.filter((x) => x.route !== "/")) {
      await page.goto(r.route);
      await expect(page.getByTestId("app-bar"), `${r.route} 앱바`).toBeVisible();
      await expect(page.getByTestId("mode-badge"), `${r.route} 모드 배지`).toBeVisible();
      await expect(page.getByTestId("session-chip"), `${r.route} 세션 칩`).toBeVisible();
      await expect(page.getByTestId("reset-button"), `${r.route} 리셋`).toBeVisible();
      // ④ fallback 배너 «슬롯» — 조건부다. 조건이 선 지금(백엔드 미연결) 실제로 자리를 차지한다.
      await expect(page.getByTestId("fallback-banner"), `${r.route} 배너 슬롯`).toBeVisible();
    }
  });

  test("배너 슬롯은 «조건부»다 — 조건이 없으면 자리를 먹지 않는다", async ({ page }) => {
    // 🔴 「항상 보인다」면 슬롯이 아니라 고정 영역이다. 조건을 없애 사라지는 것까지 봐야 슬롯이다.
    await page.route("**/api/live/status", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: true, checkedAt: new Date().toISOString() }) }),
    );
    await seedApiSession(page, "abcd1234efgh");
    await page.goto("/overview");
    await expect(page.getByTestId("session-chip")).toHaveAttribute("data-origin", "api");
    await expect(page.getByTestId("fallback-banner")).toHaveCount(0);
    await expect(page.getByTestId("mode-badge")).toBeVisible(); // 배너만 사라지고 셸은 선다
  });

  test("세션 칩은 sessionId 앞 4자다(§0)", async ({ page }) => {
    await seedApiSession(page, "WXYZ-9999-0000");
    await page.goto("/overview");
    const chip = page.getByTestId("session-chip");
    await expect(chip).toContainText("WXYZ");
    await expect(chip).not.toContainText("9999");
    await expect(chip).not.toContainText("*"); // api 발급분에는 pending 표시가 붙지 않는다
  });

  test("🔴 chat-first 금지(§10) — 셸에 입력창이 없다", async ({ page }) => {
    await enter(page);
    await expect(page.locator("input, textarea, [contenteditable='true']")).toHaveCount(0);
  });

  test("내비는 P0 화면만 노출한다 — P1(/knowledge·/documents·/system) 링크 0", async ({ page }) => {
    await enter(page);
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    for (const p1 of ["/knowledge", "/documents", "/system"]) {
      expect(hrefs, `${p1} 는 P1 이다(§6) — 셸이 미리 노출하면 없는 화면으로 보낸다`).not.toContain(p1);
    }
    expect(hrefs).toEqual(expect.arrayContaining(["/overview", "/compare"]));
  });

  /* ────────────────────────────────────────────────────────────────────────────
   * V-2 회귀 그물 — spacing 토큰이 «요소에 닿는가».
   *
   * 있었던 일(develop 8bca478): `h-[--spacing-appbar]` / `w-[--spacing-rail]` 는 Tailwind v3 의
   * «맨 변수» 축약이다. v4 는 대괄호 안을 값 그대로 쓰므로 `height: --spacing-appbar` 라는
   * 무효 선언이 났고(빌드 산출 CSS 실물 확인), 브라우저가 그 선언만 조용히 버렸다 —
   * 토큰은 :root 에 56px 로 있는데 앱바는 27px · 레일은 37px 로 섰다.
   * 고쳐진 것(e3ca284): `h-(--spacing-appbar)` / `w-(--spacing-rail)` — v4 괄호 축약. 토큰 무수정.
   *
   * 🔴 이 결함이 왜 소스 리뷰를 통과했는지가 이 그물의 존재 이유다: 규칙은 생기고, 클래스도
   *    붙어 있고, 토큰도 있고, 빌드 경고 0 · lint 통과 · «색 토큰은 정상 적용»된다. 화면도
   *    깨져 보이지 않고 내용 높이로 선다. computed style 을 재는 이 행 말고는 아무도 못 본다.
   *    표기가 다시 `[--토큰]` 으로 돌아가면 여기서 운다.
   *    (대조군 = tests/web/token_layer_probe.mjs — 같은 토큰 네 표기를 고정 4.3.3 로 컴파일한다)
   * ──────────────────────────────────────────────────────────────────────────── */
  test("V-2 회귀 — 앱바·레일 치수가 토큰 값(56px)으로 선다", async ({ page }) => {
    await enter(page);
    const bar = page.getByTestId("app-bar");
    const rail = page.locator('nav[aria-label="주요 화면"]');
    // 🔴 **리터럴이 아니라 토큰 계산값과 맞댄다**(T6-4 ⓕ · #446·#454 와 같은 처방).
    //    앞판은 `56px` 을 박아 두었다 — 이 행의 주어는 「치수가 토큰을 탄다」인데, 리터럴은
    //    «이 팔레트의 이 값»을 재고 있었다. 재설계가 앱바를 52px·레일을 260px 로 바꾸자
    //    설계대로 바뀐 화면이 빨강이 됐다(그때 죽은 것은 화면이 아니라 이 그물이다).
    const tok = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        appbar: cs.getPropertyValue("--spacing-appbar").trim(),
        rail: cs.getPropertyValue("--spacing-rail").trim(),
      };
    });
    // 🔴 토큰이 비면 초록도 빨강도 아니다 — 「잴 것이 없었다」를 통과로 만들지 않는다.
    expect(tok.appbar, "--spacing-appbar 가 비었다 — 측정 불가").toMatch(/^\d+(\.\d+)?px$/);
    expect(tok.rail, "--spacing-rail 이 비었다 — 측정 불가").toMatch(/^\d+(\.\d+)?px$/);
    expect(await bar.evaluate((e) => getComputedStyle(e).height), `앱바 높이 ↔ --spacing-appbar(${tok.appbar})`).toBe(tok.appbar);
    expect(await rail.evaluate((e) => getComputedStyle(e).width), `레일 폭 ↔ --spacing-rail(${tok.rail})`).toBe(tok.rail);
    // 🔴 대조군 — 이 비교가 «아무 값이나» 통과시키지 않는다(같은 실행에서 보인다).
    expect(tok.appbar).not.toBe("0px");
    expect(await bar.evaluate((e) => getComputedStyle(e).height)).not.toBe(`${parseFloat(tok.appbar) + 4}px`);
  });

  test("V-2 대조군 — 토큰 «자체»는 브라우저에 살아 있다(원인이 표기임을 분리)", async ({ page }) => {
    await enter(page);
    const t = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { appbar: cs.getPropertyValue("--spacing-appbar").trim(), rail: cs.getPropertyValue("--spacing-rail").trim() };
    });
    // 🔴 토큰이 없어서가 아니다. 이 두 줄이 초록인 채로 위 행이 빨강이라는 것이 진단이다.
    // 🔴 값이 아니라 «선언이 살아 있는가»를 잰다 — 토큰 값 자체는 디자인이 정한다(52·260 등).
    expect(t.appbar, "--spacing-appbar 선언이 사라졌다").toMatch(/^\d+(\.\d+)?px$/);
    expect(t.rail, "--spacing-rail 선언이 사라졌다").toMatch(/^\d+(\.\d+)?px$/);
    // 같은 토큰 계층의 «색»은 실제로 적용된다 — 계층 전체가 죽은 게 아니라 두 표기만 죽었다.
    //
    // 🔴 **리터럴이 아니라 토큰 계산값으로 잰다**(T6-4 ⑥-0). 앞판은 `rgb(17, 24, 35)` 를
    //    박아 두었다 — 그 행은 「토큰이 적용된다」를 재는 게 아니라 «이 팔레트의 이 값»을
    //    재고 있었고, 팔레트를 갈아 끼우면 설계대로 바뀐 화면이 빨강이 된다(T6-4 PR 1).
    //    그래서 판정선을 「앱바 배경 == 앱바 표면 토큰의 계산값 중 하나」로 옮긴다.
    //    허용 집합이 둘 이상인 이유: PR 2 에서 앱바가 패널면(`--fkt-bg-2` / 별칭
    //    `--color-panel`)에서 유리면(`--fkt-glass`)으로 바뀐다. 두 면 다 «토큰에서 온 값»이다.
    const surfaces = await page.evaluate(() => {
      const names = ["--fkt-bg-2", "--fkt-glass", "--color-panel"];
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.opacity = "0";
      probe.style.pointerEvents = "none";
      document.body.appendChild(probe);
      const out: Record<string, string> = {};
      for (const n of names) {
        // 선언 자체가 없으면 «허용 집합에 넣지 않는다» — 없는 토큰을 통과 사유로 쓰지 않기 위해서다.
        if (!root.getPropertyValue(n).trim()) continue;
        probe.style.setProperty("background-color", `var(${n})`);
        out[n] = getComputedStyle(probe).backgroundColor;
      }
      probe.remove();
      return out;
    });
    const barBg = await page.getByTestId("app-bar").evaluate((e) => getComputedStyle(e).backgroundColor);
    const allowed = Object.values(surfaces);
    // 🔴 토큰이 하나도 안 풀리면 이 행은 초록도 빨강도 아니다 — 잴 것이 없었다는 뜻이다.
    expect(allowed.length, "앱바 표면 토큰이 하나도 안 풀렸다 — 측정 불가").toBeGreaterThan(0);
    expect(allowed, `앱바 배경 ${barBg} · 토큰 ${JSON.stringify(surfaces)}`).toContain(barBg);
    // 대조군 — 이 멤버십 검사가 «아무거나 통과시키는 눈»이 아님을 같은 자리에서 보인다.
    expect(allowed, `허용 집합 ${JSON.stringify(allowed)}`).not.toContain("rgb(255, 0, 0)");
  });

  test("다크가 기본이다(§10) — 배경이 밝게 뜨지 않는다", async ({ page }) => {
    await enter(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    // 🔴 특정 색값을 고정하지 않는다 — 색은 UX 폴리시 패스 «유보»분이다(D-002).
    //    지금 재는 것은 「어두운가」라는 구조 축뿐이고, 팔레트가 바뀌어도 이 행은 살아야 한다.
    expect(0.299 * r + 0.587 * g + 0.114 * b, `body 배경 ${bg}`).toBeLessThan(64);
  });
});

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
