import { test, expect, type Page } from "@playwright/test";

/**
 * 축 ① — 세션 가드 «브라우저» 실측. 구현이 재지 않은 세 번째 축.
 *
 * 🔴 상태코드 실측(307)과 브라우저 실측은 같은 것을 재지 않는다. curl 은 한 홉을 보고 멈추지만
 *    방문자는 리다이렉트를 «따라간다» — 따라간 끝에서 실제로 격리가 서는지, 즉 쿠키가 생기고
 *    세션 칩이 뜨는지는 브라우저에서만 보인다. 307 만 보고 「가드 동작」이라 적으면, 307 뒤에서
 *    세션이 안 생기는 경우를 초록으로 지나친다.
 *
 * 정본: wireframes §6 「모든 라우트는 세션 쿠키 없이 진입 시 `/`로 보내 세션을 먼저 만든다(격리 보장)」
 */

const P0_ROUTES = [
  "/overview",
  "/incidents/INC-2025-019",
  "/evidence/EV-2025-001",
  "/work-orders/WO-2025-001",
  "/compare",
];

/** 방문 중 지나간 응답의 상태코드 사슬 — 「어디를 거쳐 왔는가」를 보고서에 남긴다. */
function chain(page: Page) {
  const hops: string[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "document") hops.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return hops;
}

test.describe("세션 가드", () => {
  for (const route of P0_ROUTES) {
    test(`쿠키 없이 ${route} → \`/\` 경유 → /overview 착지 + 세션이 «실제로» 선다`, async ({ page }) => {
      const hops = chain(page);
      await page.goto(route);

      // ① 그 길에 `/` 가 실제로 끼어 있었다 — 가드를 «지났다»는 뜻
      expect(hops.some((h) => /^30\d \/$/.test(h)), `홉 사슬: ${hops.join(" → ")}`).toBeTruthy();
      // ② 착지는 «요청한 경로»가 아니라 /overview 다 — 정본 §6 두 줄의 합성 결과다:
      //    「세션 없이 진입 → `/`」 + 「`/` = 세션 생성 후 /overview 리다이렉트」.
      //    🔴 나는 처음에 「요청한 경로로 돌아온다」로 기대를 세웠고 5건 중 4건이 빨강이었다.
      //       정본에 그런 문장이 없다 — 틀린 것은 구현이 아니라 내 기대였다(§회부 R-1 로 올린다).
      await expect(page).toHaveURL(/\/overview$/);
      // ③ 격리 실물: 쿠키가 생겼다
      const c = (await page.context().cookies()).find((x) => x.name === "fkt_session");
      expect(c, "리다이렉트는 됐는데 세션이 안 생겼다 = 격리 없이 화면만 열렸다").toBeTruthy();
      // ④ 그것이 화면에도 나타난다
      await expect(page.getByTestId("session-chip")).toBeVisible();
    });
  }

  test("🔵 R-1 «지금의 뜻»을 못박는다 — 첫 진입 딥링크는 유실된다(정본대로 · 결함 아님)", async ({ page }) => {
    // wireframes §6 은 `/evidence/[id]?run=&tab=` 를 «딥링크»로 적어 두었다. 쿠키 없는 방문자가
    // 그 링크로 오면 세션을 받고 /overview 에 선다 — 목적지와 쿼리가 사라진다.
    // 🔴 이것은 정본 두 줄을 그대로 따른 결과다. 그래서 «결함»이 아니라 «현재 뜻»으로 고정한다.
    //    누가 나중에 목적지 보존을 넣으면 이 행이 빨강으로 알린다 — 조용히 바뀌지 않게(5대 절차 ②).
    await page.goto("/evidence/EV-2025-001?run=RUN-1&tab=graph");
    await expect(page).toHaveURL(/\/overview$/);
    expect(new URL(page.url()).search, "쿼리까지 사라진다").toBe("");

    // 두 번째 방문(쿠키 보유)에서는 목적지가 그대로 산다 — 유실은 «첫 진입 1회»에 한정된다.
    await page.goto("/evidence/EV-2025-001?run=RUN-1&tab=graph");
    await expect(page).toHaveURL(/\/evidence\/EV-2025-001\?run=RUN-1&tab=graph$/);
  });

  test("`/` 는 머무는 곳이 아니다 — 쿠키가 «있어도» /overview 로 보낸다", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/overview$/);
    await page.goto("/"); // 이제 쿠키가 있는 상태
    await expect(page).toHaveURL(/\/overview$/);
  });

  test("한 번 받은 세션은 이동해도 그대로다 (매 진입마다 새로 발급하지 않는다)", async ({ page }) => {
    await page.goto("/");
    const before = (await page.context().cookies()).find((x) => x.name === "fkt_session")!.value;
    for (const r of P0_ROUTES) await page.goto(r);
    const after = (await page.context().cookies()).find((x) => x.name === "fkt_session")!.value;
    expect(after, "라우트를 옮길 때마다 세션이 갈리면 «격리»가 아니라 «망각»이다").toBe(before);
  });

  test("다른 방문자는 다른 세션을 받는다 (격리의 최소 조건)", async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    try {
      await (await a.newPage()).goto("/");
      await (await b.newPage()).goto("/");
      const va = (await a.cookies()).find((x) => x.name === "fkt_session")!.value;
      const vb = (await b.cookies()).find((x) => x.name === "fkt_session")!.value;
      expect(va).not.toBe(vb);
    } finally {
      await a.close();
      await b.close();
    }
  });

  test("백엔드가 세션을 «발급하지 않았음»을 화면이 숨기지 않는다 (501 구간 · 승인분)", async ({ page }) => {
    await page.goto("/");
    const c = (await page.context().cookies()).find((x) => x.name === "fkt_session")!;
    // POST /sessions 가 501 인 지금, origin 은 pending 이 «참»이다 — 이것은 결함이 아니라 정직이다.
    expect(decodeURIComponent(c.value)).toMatch(/^pending:/);
    const chip = page.getByTestId("session-chip");
    await expect(chip).toHaveAttribute("data-origin", "pending");
    await expect(chip).toContainText("*"); // 서버가 모르는 세션이라는 표시
    await expect(chip).toHaveAttribute("title", /아직 백엔드에 등록되지 않은/);
  });

  /* ────────────────────────────────────────────────────────────────────────────
   * 🔴 결함 V-1 — 가드 matcher 의 `.*\.svg` 제외 규칙이 «라우트»까지 비껴간다.
   *
   * proxy.ts config.matcher = "/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"
   * 마지막 절이 «경로 어디에든» .svg 로 끝나면 제외한다. 정적 자산을 빼려던 규칙인데,
   * 동적 세그먼트(`[incidentId]` 등)는 .svg 로 끝나는 id 를 그대로 받는다 → 가드가 돌지 않는다.
   *
   * 실측(대조군 포함): /incidents/x.svg → 200 · /incidents/x.png → 307 · /incidents/xsvg → 307
   *   확장자 한 글자 차이로 갈린다 = 원인이 이 절 하나임이 분리된다.
   * 사정거리: 동적 라우트 3종(incidents·evidence·work-orders). /compare·/overview 는 404 로 막힌다.
   *
   * 🔴 test.fail() 로 둔 이유: 지금 «틀렸다»를 초록으로 덮지 않으면서, 고쳐지는 순간
   *    「예상된 실패인데 통과했다」로 이 스펙이 빨강이 되게 하려는 것이다. 처방이 착지하면
   *    이 행이 울어서 알린다 — 조용히 통과하고 표시가 사라지는 그물은 전환을 못 가르친다.
   * ──────────────────────────────────────────────────────────────────────────── */
  for (const bypass of ["/incidents/x.svg", "/evidence/x.svg", "/work-orders/x.svg"]) {
    test(`🔴 V-1 ${bypass} — 세션 없이 열린다(§6 「모든 라우트」 위반)`, async ({ page }) => {
      test.fail(true, "가드 matcher 의 .svg 제외 규칙이 동적 라우트까지 비껴간다 — 처방 착지 시 이 행이 빨강으로 알린다");
      await page.goto(bypass);
      await expect(page).toHaveURL(/\/overview$/); // 정본이 요구하는 결과
      await expect(page.getByTestId("session-chip")).toBeVisible();
    });
  }

  test("V-1 대조군 — 확장자만 다르면 가드가 «돈다»(원인이 .svg 절임을 분리)", async ({ page }) => {
    await page.goto("/incidents/x.png");
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByTestId("session-chip")).toBeVisible();
  });
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
