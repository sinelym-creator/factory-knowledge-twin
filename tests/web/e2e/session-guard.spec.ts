import { test, expect, type Page } from "@playwright/test";

// 🔴 기본값을 두지 않는다(D-74) — `:8000` 은 **다른 좌석의 대역**이라, 미지정 실행이 남의
//    서버를 조용히 재고 그 초록·빨강을 이 리포의 판정으로 적게 된다. 기본값이 남을 가리키면
//    그것은 편의가 아니라 오측정 장치다(D-72 동형 · `d21c_polling_probe.mjs` 선례).
const API = process.env.FKT_API_BASE;
if (!API) throw new Error("🔴 측정 불가 — `FKT_API_BASE` 를 지정하라(기본값 없음 · D-74 · 무접촉 대역 `:8000`·`:8010`·`:8787` 금지).");

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

/**
 * 🔴 **딥링크 2라우트가 이 목록에서 빠졌다**(T3-3 착지 · 11대).
 *
 * `/evidence/{id}` · `/documents/{id}` 는 계약 v0.1.6 이 「세션 없이 «열람만»」으로 연
 * 라우트이고(§3:244 집행 · Q-16), T3-3 이 셸 쪽 절반(`proxy.ts` `READ_ONLY_DEEP_LINK`)을
 * 세우면서 **더는 `/` 로 튕기지 않는다**. 이 목록에 남겨 두면 정본대로 바뀐 거동을 그물이
 * 「깨졌다」고 부르게 된다 — 그물이 대상보다 낡은 자리다(8대 계보 「그물이 판정보다 낡는다」).
 *
 * 🔴 그렇다고 지우기만 하면 축이 사라진다. 아래 «딥링크» 절이 그 자리를 이어받아,
 *    **열리는 것 + 세션 화면은 여전히 닫히는 것**을 한 벌로 잰다.
 */
const P0_ROUTES = [
  "/overview",
  "/incidents/INC-2025-019",
  "/work-orders/WO-2025-001",
  "/compare",
];

/** 계약 v0.1.6 읽기 예외 2라우트 — 세션 «없이» 열려야 하는 쪽. */
const DEEP_LINK_ROUTES = ["/evidence/EV-2025-001", "/documents/DOC-MAN-0021"];

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
      //
      // 🔴 **뒤집힌 사실**(Q-39 ⓒ): `/` 는 더 이상 «지나가는 307» 이 아니다. 입장 발급이
      //    `proxy.ts` 의 서버 홉에서 `/` 의 «클라이언트 마운트»로 내려가면서, `/` 는 스스로
      //    서서 입장을 실행하는 **200** 이 됐다(프리페치는 문서를 가져갈 뿐 JS 를 안 돌리므로,
      //    그 이동이 「가져간 사람」과 「들어온 사람」을 가른다). 앞 형태는 그 자리를 상태코드
      //    `/^30\d \/$/` 로 못박아 두었고, 그래서 **대상이 옳게 바뀐 날 빨강**을 낸다.
      //    낡은 그물은 뒤집힌 사실로 못박는다 — 문구가 아니라 «뜻»을 남긴다:
      //      ⓐ 가드가 돌았다 = 요청한 경로가 리다이렉트로 답했다(여기는 여전히 30x 다)
      //      ⓑ 그 길에 `/` 가 끼어 있었다 = 상태와 «무관하게» `/` 를 지났다
      expect(hops[0], `홉 사슬: ${hops.join(" → ")}`).toMatch(/^30\d /);
      expect(hops.some((h) => / \/$/.test(h)), `홉 사슬: ${hops.join(" → ")}`).toBeTruthy();
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

  /* 🔴 **R-1 이 뒤집혔다 — 대상이 정본을 따라잡았다**(T3-3 착지 · 11대).
   *
   * 앞판은 「첫 진입 딥링크는 유실된다(정본대로 · 결함 아님)」를 못박고 있었다. 그때의 정본
   * 상태가 그랬다 — 계약 v0.1.6 은 읽기 예외 2라우트를 이미 열었는데 **셸 쪽 절반이 없어서**
   * §3:244 가 미구현이었고(Q-16 이 그렇게 적어 두었다), 그 미구현이 「지금의 뜻」이었다.
   * T3-3 이 그 절반을 세웠다. 그러니 이 행은 «깨진» 것이 아니라 **역할이 끝난** 것이다.
   *
   * 🔴 앞판이 이 행에 남긴 부탁을 그대로 지킨다: 「누가 나중에 목적지 보존을 넣으면 이 행이
   *    빨강으로 알린다 — 조용히 바뀌지 않게」. 조용히 바뀌지 않았다. 여기서 **뒤집힌 사실을
   *    새 기대로 못박는다** — 지우고 넘어가면 그 부탁이 아무 데도 남지 않는다. */
  test("🔵 R-1 뒤집힘 — 딥링크 2라우트는 «유실되지 않는다»(v0.1.6 읽기 예외 · T3-3 착지)", async ({
    page,
  }) => {
    await page.goto("/evidence/EV-2025-001?run=RUN-1&tab=graph");
    await expect(page, "딥링크가 여전히 /overview 로 튕긴다 — 읽기 예외가 셸에서 죽었다").toHaveURL(
      /\/evidence\/EV-2025-001\?run=RUN-1&tab=graph$/,
    );
    // 🔴 목적지 «와 쿼리»가 함께 살아야 딥링크다 — 경로만 남고 쿼리가 죽으면 탭·run 이 사라진다.
    expect(new URL(page.url()).search, "쿼리가 사라졌다").toBe("?run=RUN-1&tab=graph");

  });

  test("🔵 R-1 대조군 — 예외는 «딥링크만»이다(세션 화면은 여전히 목적지를 잃는다)", async ({
    browser,
  }) => {
    // 🔴 `clearCookies()` 로 같은 페이지에서 이어 재지 않는다(11대 자수). 쿠키만 지우면
    //    Next 의 클라이언트 라우터 캐시·프리페치본이 남아 다음 `goto` 가 서버를 안 거치고,
    //    그러면 「가드가 안 돈다」가 아니라 「가드에 물어보지 않았다」인데 표는 전자로 읽는다.
    //    무세션 축은 **매번 새 컨텍스트**에서만 참이다.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/work-orders/WO-2025-001");
    await expect(page, "세션 화면까지 열린다 — 예외가 넓다").toHaveURL(/\/overview$/);
    await ctx.close();
  });

  for (const route of DEEP_LINK_ROUTES) {
    test(`딥링크 ${route} — 쿠키 없이 열리되 «조용한 입장»은 없다 (v0.1.6 「열람만」)`, async ({
      browser,
    }) => {
      test.slow();
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      /* 🔴 **자극이 실재했는지부터 잰다.**
       *
       * 이 축의 처방은 프리페치를 «막는» 것이 아니라 프리페치 요청에 **세션을 안 만드는**
       * 쪽이다. 그러면 「세션 0」이 두 가지 뜻을 갖는다:
       *   ⓐ 프리페치가 일어났는데 세션이 안 생겼다 ← 처방이 먹은 것
       *   ⓑ 프리페치 자체가 안 일어나서 세션이 안 생겼다 ← 아무것도 증명하지 못한 초록
       * 둘을 안 가르면 이 그물은 언젠가 «자극이 사라진 날» 조용히 초록이 된다.
       * ⇒ 표지 요청을 세고, **0 건이면 초록도 빨강도 내지 않는다**(측정 불가).
       */
      const prefetches: string[] = [];
      const settling: Promise<unknown>[] = [];
      page.on("request", (r) => {
        const h = r.headers();
        if (h["next-router-prefetch"] || h["rsc"] || r.url().includes("_rsc=")) {
          prefetches.push(new URL(r.url()).pathname);
          // 🔴 «한 사건»은 요청이 아니라 그 응답까지다 — 세션은 응답 헤더로 심긴다.
          settling.push(r.response().catch(() => null));
        }
      });

      // 기다리던 것: 도착 경로 — 판정선은 아래 URL 검사이고, 세션 축은 프리페치 사슬이 따로 기다린다
      await page.goto(route);
      expect(new URL(page.url()).pathname, "딥링크가 튕겼다").toBe(route);

      // 🔴 **여기가 이 축의 값이다.** 「열렸다」만 보면 초록인데, 계약이 연 것은 «열람»이지
      //    «입장»이 아니다. 세션이 생기면 HttpOnly 쿠키와 소유권 축이 조용히 열린다.
      //    🔴 그리고 그것은 **늦게** 생긴다(11대 실측: networkidle 직후 0 → +2초에 2개).
      //       프리페치가 `/` 홉을 긁기 때문이다 — 그래서 «기다린 뒤에» 묻는다.
      //       기다리지 않고 물으면 이 축은 언제나 초록이다.
      //
      /* 🔴 **뒤집힌 사실**(Q-45): 앞판은 그 「뒤」를 **+4초라는 창**으로 정했다. 부재를 창으로
       *    정하면 부하가 그 창을 먹는 날 **있는 결함이 지워진다**(위양성 «초록» — 눈에 안 띄어
       *    더 오래 산다). 창이 아니라 **사건 뒤에** 묻는다.
       *
       * 🔴 그런데 「사건 뒤에」로 바꾸기만 하면 **더 나빠진다** — 대조군이 그걸 잡았다.
       *    아직 아무 표지도 안 왔으면 사슬이 «비어 있어» 즉시 끝나고, 앞판보다 **더 일찍**
       *    묻게 된다(BEFORE 빌드에서 두 행이 빨강 대신 «자극 0 = 측정 불가»로 빠졌다).
       *    ⇒ 자극을 **우연에 맡기지 않는다**: 셸 링크에 hover 해 프리페치를 «만든» 뒤,
       *      그 사슬의 응답이 전부 돌아오고 새 표지가 더 안 생길 때까지 기다린다.
       */
      for (const link of (await page.locator("a[href^='/']").all()).slice(0, 12)) {
        await link.hover({ timeout: 1000, force: true }).catch(() => undefined);
      }
      for (let round = 0; round < 5; round += 1) {
        const before = settling.length;
        await Promise.all(settling.slice());
        // 🔴 이 한 줄만은 «가라앉히기 자체»가 축의 값이다(위 주석) — 사슬이 잦아들지 않았는데
        //   break 하면 「세션이 늦게 생기는 것」을 못 본다. 그래서 지우지 않고 «상한»을 준다.
        await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
        if (settling.length === before) break; // 응답이 새 표지를 낳지 않았다 = 사슬의 끝
      }

      const cookies = (await ctx.cookies()).map((c) => c.name);
      const stimulated = prefetches.length > 0;
      await ctx.close();

      // 🔴 세션이 «생겼으면» 자극 유무와 무관하게 빨강이다 — 그때는 이미 입장한 것이다.
      //    자극 부재로 미루는 것은 «초록으로 셀 뻔한» 경우뿐이다.
      if (cookies.length === 0) {
        test.skip(
          !stimulated,
          "프리페치 표지 요청이 0건 — 자극이 없었으므로 이 초록은 처방의 것이 아니다(측정 불가)",
        );
      }
      expect(
        cookies,
        `딥링크에서 세션이 생겼다 — 「열람만」이 아니라 조용한 입장이다(원장 Q-39 · 프리페치 ${prefetches.length}건): ${cookies.join(", ")}`,
      ).toEqual([]);
    });
  }

  test("`/` 는 머무는 곳이 아니다 — 쿠키가 «있어도» /overview 로 보낸다", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/overview$/);
    await page.goto("/"); // 이제 쿠키가 있는 상태
    await expect(page).toHaveURL(/\/overview$/);
  });

  test("한 번 받은 세션은 이동해도 그대로다 (매 진입마다 새로 발급하지 않는다)", async ({ page }) => {
    await page.goto("/");
    // 🔴 «입장이 끝난 뒤에» 묻는다. 입장이 서버 홉(307)이면 goto 반환 시점에 이미 쿠키가 있지만,
    //    입장 층이 클라이언트 실행으로 내려가면(Q-39 ⓒ) 마운트→입장→303 이 goto 반환 «뒤»에 온다.
    //    그때 여기서 바로 `!` 로 단정하면 그물이 대상보다 낡아 거짓 빨강을 낸다.
    //    낡은 그물은 뒤집힌 사실로 못박는다 — 「도착했는가」를 먼저 기다리고 그 다음에 쿠키를 읽는다.
    await page.waitForURL(/\/overview$/);
    const before = (await page.context().cookies()).find((x) => x.name === "fkt_session")!.value;
    for (const r of P0_ROUTES) await page.goto(r);
    const after = (await page.context().cookies()).find((x) => x.name === "fkt_session")!.value;
    expect(after, "라우트를 옮길 때마다 세션이 갈리면 «격리»가 아니라 «망각»이다").toBe(before);
  });

  test("다른 방문자는 다른 세션을 받는다 (격리의 최소 조건)", async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    try {
      // 🔴 입장 완료를 «각 페이지에서» 기다린 뒤에 묻는다(Q-39 ⓒ — 입장이 클라이언트 실행으로
      //    내려가면 goto 반환 시점엔 아직 쿠키가 없다). 페이지 핸들을 버리지 않는 이유가 이것이다.
      const pa = await a.newPage();
      const pb = await b.newPage();
      await pa.goto("/");
      await pa.waitForURL(/\/overview$/);
      await pb.goto("/");
      await pb.waitForURL(/\/overview$/);
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
    // 🔴 입장이 끝난 뒤에 쿠키를 읽는다 — Q-39 ⓒ 로 입장 층이 클라이언트 실행이 되면
    //    goto 반환과 쿠키 발급 사이에 창이 생긴다(위 두 칸과 같은 자리).
    await page.waitForURL(/\/overview$/);
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
  // 🔴 `/evidence/x.svg` 를 표본에서 뺐다(T3-3 착지 · 11대). 그 경로는 이제 **읽기 예외**라
  //    세션 없이 열리는 것이 정본이다 — V-1 이 물었던 「.svg 로 끝나면 가드를 빠져나간다」와는
  //    다른 사건이고, 섞어 두면 이 축이 「예외가 동작한다」를 「구멍이 났다」로 읽는다.
  //    🔴 남은 두 표본으로 축은 그대로 선다(가드 대상 라우트에서 .svg id 가 가드를 지나는가).
  for (const bypass of ["/incidents/x.svg", "/work-orders/x.svg"]) {
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
