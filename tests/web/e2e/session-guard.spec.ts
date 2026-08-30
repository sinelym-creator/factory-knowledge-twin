import { test, expect, type Page } from "@playwright/test";

const API = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";

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

  test("세션 origin 이 «지금의 사실»을 말한다 — 발급되면 api, 아니면 pending", async ({ page }) => {
    // 🔴 이 칸은 T1-9 때 「501 구간이니 origin 은 pending 이 참」으로 세웠다. T3-1 이
    //    POST /sessions 를 구현하면서 그 전제가 사라졌고, 낡은 단언이 빨강을 냈다 —
    //    대상이 바뀐 게 아니라 그물이 판정보다 낡은 것이다. 그래서 «사실을 따라가게» 고친다:
    //    무엇이 참인지를 백엔드에 먼저 묻고, 화면이 그것과 같은 말을 하는지 본다.
    const issued = (await fetch(`${API}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })).status === 200;

    await page.goto("/");
    const c = (await page.context().cookies()).find((x) => x.name === "fkt_session")!;
    const chip = page.getByTestId("session-chip");

    if (issued) {
      expect(decodeURIComponent(c.value)).toMatch(/^api:/);
      await expect(chip).toHaveAttribute("data-origin", "api");
      await expect(chip).not.toContainText("*"); // 서버가 아는 세션이면 표시가 없다
    } else {
      expect(decodeURIComponent(c.value)).toMatch(/^pending:/);
      await expect(chip).toHaveAttribute("data-origin", "pending");
      await expect(chip).toContainText("*"); // 서버가 모르는 세션이라는 표시
      await expect(chip).toHaveAttribute("title", /아직 백엔드에 등록되지 않은/);
    }
  });

  /* ────────────────────────────────────────────────────────────────────────────
   * V-1 회귀 그물 — 「.svg 로 끝나는 id 는 가드를 비껴간다」가 다시 살아나지 않게.
   *
   * 있었던 일(develop 8bca478): matcher 마지막 절이 `.*\.svg` 였다. 「.svg 면 정적 자산」이라는
   * 뜻으로 적혔지만 그 부정 전방탐색은 «경로 어디서든» 걸린다 — 동적 세그먼트가 .svg 로 끝나는
   * id 를 그대로 받으므로 세 라우트가 세션 없이 200 으로 열렸다.
   * 고쳐진 것(e3ca284): `[^/]+\.svg$` — «최상위 세그먼트 하나»로 한정.
   *
   * 🔴 이 세 행은 처방 착지 때 실제로 «빨강»을 냈다(test.fail 로 걸어 두었고, 「예상된 실패인데
   *    통과했다」로 4행이 울었다). 전환을 눈으로 본 뒤에 표시를 걷고 평범한 초록으로 바꿨다 —
   *    조용히 초록이 된 그물은 무엇이 바뀌었는지 아무것도 가르치지 못한다.
   * ──────────────────────────────────────────────────────────────────────────── */
  for (const bypass of ["/incidents/x.svg", "/evidence/x.svg", "/work-orders/x.svg"]) {
    test(`V-1 회귀 ${bypass} — .svg id 도 가드를 «지난다»(§6 「모든 라우트」)`, async ({ page }) => {
      await page.goto(bypass);
      await expect(page).toHaveURL(/\/overview$/);
      await expect(page.getByTestId("session-chip")).toBeVisible();
    });
  }

  test("V-1 대조군 — 확장자만 다르면 가드가 «돈다»(원인이 .svg 절임을 분리)", async ({ page }) => {
    await page.goto("/incidents/x.png");
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByTestId("session-chip")).toBeVisible();
  });

  test("🔴 V-1 처방의 «회귀 위험» — 최상위 정적 svg 는 가드에 걸리지 않는다", async ({ request }) => {
    // 🔴 이게 처방의 유일한 회귀 위험이었다. matcher 를 좁히다 정적 자산까지 끌어들이면
    //    public/ 의 파일이 307 로 튄다 — 처방 «전» 기준선(5건 200 image/svg+xml)을 잡아 둔 이유다.
    for (const f of ["/file.svg", "/globe.svg", "/next.svg", "/vercel.svg", "/window.svg"]) {
      const res = await request.get(f, { maxRedirects: 0 });
      expect(res.status(), `${f} 상태`).toBe(200);
      expect(res.headers()["content-type"], `${f} 타입`).toContain("image/svg+xml");
    }
  });

  test("🔵 V-1 처방이 «기대는 전제» — 중첩 자산은 가드에 걸린다(성문된 한계 · 실패 방향 확인)", async ({ page }) => {
    // 처방은 public/ 이 «평면»이라는 전제 위에 선다(현 public/ = svg 5개 · 전부 최상위).
    // 🔴 전제가 깨지면 자산이 «눈에 보이게» 깨지지, 가드에 «조용히» 구멍이 나지 않는다.
    //    잊었을 때의 실패 방향을 그렇게 둔 것이 처방의 값이라, 그 방향을 여기서 못박는다.
    //    public/img/logo.svg 같은 자산을 두게 되면 이 행이 먼저 운다.
    await page.goto("/img/logo.svg");
    await expect(page).toHaveURL(/\/overview$/);
  });
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
