import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * T3-6 — 격리 «통합 동선». 두 방문자가 한 서버를 함께 쓰는 동안 서로를 못 보는가.
 *
 * 🔴 **왜 통합 동선이 따로 필요한가.** 격리의 조각들은 이미 각자 서 있다(T3-1 가드 ·
 *    T3-3 딥링크 · T3-5 소유권). 그런데 격리는 «한 화면의 성질»이 아니라 **한 사람이 걷는
 *    길 전체의 성질**이다 — 조각마다 초록이어도, 입장 → 조사 → 근거 → WO → 리셋으로 이어
 *    걸으면 그 사이 어딘가에서 남의 것이 비칠 수 있다. 그래서 «두 컨텍스트를 동시에 세워»
 *    한 동선으로 걷는다.
 *
 * 🔴 **부정 판정식 앞에 세는 눈을 증명한다.** 「안 보인다」는 「내가 못 찾았다」와 구별되지
 *    않는다. 그래서 모든 은닉 축에 **대조군 한 행**을 붙였다 — 같은 셀렉터·같은 눈이
 *    «주인 쪽에서는» 그것을 찾아낸다. 찾아내지 못하면 그 초록은 아무것도 뜻하지 않는다.
 *
 * 🔴 **은닉은 「거절」이 아니라 「없음」이다.** 403 이나 「남의 것」이라는 문구는 그 자체로
 *    존재를 누설한다(T3-5 §6 계보). 그래서 낱말까지 센다.
 *
 * 대상 스택 = `FKT_API_BASE`(기본 8061 · 씨앗 있는 유일 스택). 셸 = `FKT_WEB_BASE`.
 */

const SCENARIO = process.env.FKT_SCENARIO ?? "GS-01";

/**
 * 🔴 **red 를 둘로 가른다**(16대 자수 · 「정본보다 넓은 축」).
 *
 * 앞판은 T3-5 §6(WO 화면 판정)의 낱말 목록을 조사 화면에 그대로 옮겨 왔고, 그래서
 * 「서버가 이 조사를 찾지 못했습니다 — 다른 세션의 조사**이거나** 사라진 조사입니다」를
 * 누설로 셌다. 그 문면은 **존재를 단언하지 않는다** — 두 갈래를 나란히 주므로 방문자는
 * 어느 쪽인지 알 수 없다. 정본이 금지한 것은 「못 준다」와 「남의 것이다」라는 **단언**이지,
 * 왜 안 보이는지 설명하는 일이 아니다.
 */
/** ⓐ 거절 낱말 — 존재를 인정한 채 「못 준다」고 말하는 자리. 한 건도 허용하지 않는다. */
const REFUSAL_WORDS = ["권한", "403", "금지", "거부", "허용되지"];
/** ⓑ 소유 낱말 — «선언지 안»에서만 허용한다. 단독으로 쓰이면 존재를 단언하는 것이다. */
const OWNERSHIP_WORDS = ["남의", "다른 세션", "소유"];
/** 선언지 표지 — 이 중 하나가 같은 문장에 있어야 「단언」이 아니다. */
const DISJUNCTION = ["이거나", "거나", "또는", "혹은"];

/** 화면이 존재를 «단언»했는가. 설명은 통과시키고 단언만 잡는다. */
function assertsOwnership(text: string): string[] {
  const hits: string[] = [];
  for (const sentence of text.split(/(?<=[.。!?])\s+|·/)) {
    for (const w of OWNERSHIP_WORDS) {
      if (sentence.includes(w) && !DISJUNCTION.some((d) => sentence.includes(d))) {
        hits.push(`${w} :: ${sentence.trim().slice(0, 80)}`);
      }
    }
  }
  return hits;
}

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

async function sidOf(ctx: BrowserContext) {
  const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) throw new Error("fkt_sid 가 없다 — 입장이 안 끝났다(측정 불가)");
  return sid;
}

/** 브라우저 «자신»이 부른다 — 쿠키·가드를 그대로 지나야 측정이 실재한다(t3-4 계보). */
async function startRun(page: Page, mode: "live" | "replay") {
  const sid = await sidOf(page.context());
  return page.evaluate(
    async ({ scenario, mode, sid }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mode }),
      });
      return { status: res.status, body: (await res.json()) as Record<string, string> };
    },
    { scenario: SCENARIO, mode, sid },
  );
}

async function apiStatus(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const res = await fetch(p);
    let code: string | null = null;
    try {
      code = ((await res.json()) as { error?: { code?: string } })?.error?.code ?? null;
    } catch {
      code = null;
    }
    return { status: res.status, code };
  }, path);
}

/**
 * 🔴 run 이 «끝나기 전»에 결론을 읽지 않는다. live 는 비동기라 `POST /runs` 직후의 스냅샷에는
 *    `workOrderDraftId` 가 아직 없다 — 그걸 그대로 읽고 「초안이 없다」로 건너뛰었다(내가 물렸다).
 */
async function awaitRun(page: Page, runId: string) {
  return page.evaluate(async (id) => {
    const deadline = Date.now() + 120_000;
    let snap: { status?: string; workOrderDraftId?: string } = {};
    while (Date.now() < deadline) {
      snap = await (await fetch(`/api/runs/${id}`)).json();
      if (snap.status && snap.status !== "running") return snap;
      await new Promise((r) => setTimeout(r, 300));
    }
    return snap;
  }, runId);
}

/** 화면이 실제로 뱉은 글. 「없다」를 말하는지, 존재를 누설하는지 여기서 센다. */
async function bodyText(page: Page) {
  return ((await page.locator("body").innerText().catch(() => "")) ?? "").replace(/\s+/g, " ");
}

async function freshVisitor(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await enter(page);
  return { ctx, page };
}

test.describe("T3-6 격리 통합 동선 — 두 방문자가 한 서버를 함께 쓴다", () => {
  test("① 두 컨텍스트는 «다른 세션»이다 (대조군 = 같은 컨텍스트는 같은 세션)", async ({ browser, page }) => {
    const a = await freshVisitor(browser);
    const b = await freshVisitor(browser);
    try {
      const [sa, sb] = [await sidOf(a.ctx), await sidOf(b.ctx)];
      expect(sa, "두 컨텍스트가 같은 sid 를 쥐었다 — 격리를 잴 무대가 없다").not.toBe(sb);

      // 두 쪽 모두 «자기» 세션을 화면으로 말한다(칩이 없으면 무엇이 격리됐는지 알 수 없다)
      for (const v of [a, b]) {
        await expect(v.page.getByTestId("session-chip")).toBeVisible();
        expect(await v.page.getByTestId("session-chip").getAttribute("data-origin")).toBeTruthy();
      }

      // 🔴 대조군 — 같은 눈이 «같음»도 잰다. 늘 「다르다」고 답하는 눈이면 ①은 공짜 초록이다.
      await enter(page);
      const before = await sidOf(page.context());
      await page.reload();
      await page.waitForURL(/\/overview$/);
      expect(await sidOf(page.context()), "새로고침으로 세션이 바뀐다 — 이 눈은 «같음»을 못 본다").toBe(before);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });

  test("② 남의 run 은 «없다» — 화면·서버 양쪽 (대조군 = 주인은 본다)", async ({ browser }) => {
    test.slow();
    const a = await freshVisitor(browser);
    const b = await freshVisitor(browser);
    try {
      const created = await startRun(a.page, "replay");
      expect(created.status, "run 을 못 만들었다 — 숨길 것이 없으면 은닉을 못 잰다").toBe(200);
      const runId = created.body.runId;
      const incidentId = created.body.incidentId;

      // 🔴 대조군 먼저 — 같은 눈이 «주인 쪽에서는» 이 run 을 찾아낸다.
      await a.page.goto(`/incidents/${incidentId}?run=${runId}`);
      await expect(a.page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", {
        timeout: 60_000,
      });
      expect((await apiStatus(a.page, `/api/runs/${runId}`)).status, "주인도 못 본다 — 세는 눈이 아니다").toBe(200);

      // 대상 — 남의 눈에는 «없다»
      const foreign = await apiStatus(b.page, `/api/runs/${runId}`);
      expect(foreign.status, "남의 run 이 200 이다 — 격리가 없다").toBe(404);
      expect(foreign.code, "🔴 404 인데 사유가 not_found 가 아니다 — 존재를 코드로 누설한다").toBe("not_found");
      expect(
        (await apiStatus(b.page, `/api/runs/${runId}/events`)).status,
        "타임라인이 열린다 — 본문으로 새어 나간다",
      ).toBe(404);

      await b.page.goto(`/incidents/${incidentId}?run=${runId}`);
      // 🔴 **문면이 그려지기 «전»에 읽지 않는다.** 앞판은 goto 직후에 본문을 떠서, 사유 문장이
      //    아직 없는 화면을 「누설 낱말 0」으로 세었다 — 단언 문구를 주입한 대조군까지 초록이
      //    났다(자극은 화면에 있었는데 내 눈이 일찍 감겼다). 자취가 설 때까지 기다린 뒤 센다.
      await expect
        .poll(async () => await bodyText(b.page), { timeout: 20_000 })
        .toMatch(/없|찾지 못|찾을 수 없|unavailable/i);
      const text = await bodyText(b.page);
      expect(text.length, "빈 화면이다 — 「없다」를 말하지도 못한다").toBeGreaterThan(0);
      expect(
        REFUSAL_WORDS.filter((w) => text.includes(w)),
        "🔴 화면이 «못 준다»고 말한다 — 거절은 존재를 인정하는 것이다",
      ).toEqual([]);
      expect(
        assertsOwnership(text),
        "🔴 화면이 «남의 것이다»를 단언한다 — 설명(선언지)은 되지만 단정은 존재를 누설한다",
      ).toEqual([]);
      // 🔴 「누설 낱말 0」만으로는 부족하다 — 빈 화면도 0을 낸다. 같은 화면이 «없음»을 말해야 한다.
      expect(text, "화면이 «없다»는 사실 자체를 말하지 않는다").toMatch(/없|찾을 수 없|unavailable/i);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });

  test("③ 남의 WO 초안은 «없다» (대조군 = 주인은 편집 화면을 연다)", async ({ browser }) => {
    test.slow();
    const a = await freshVisitor(browser);
    const b = await freshVisitor(browser);
    try {
      // 🔴 WO 축은 **live** 로 잰다 — 재생본 초안은 계약상 501 `replay_draft_source_absent` 라
      //    replay 로 재면 「주인도 못 연다」가 나오고, 그 빨강은 대상의 것이 아니다(내가 한 번 물렸다).
      const created = await startRun(a.page, "live");
      expect(created.status).toBe(200);
      const snap = await awaitRun(a.page, created.body.runId);
      expect(snap.status, "live run 이 completed 로 끝나지 않았다 — 초안을 잴 수 없다").toBe("completed");
      const woId = snap.workOrderDraftId ?? null;
      expect(woId, "완주한 live run 이 초안을 내지 않았다 — 숨길 것이 없으면 은닉을 못 잰다").toBeTruthy();

      // 🔴 대조군 — 주인 쪽에서는 열린다
      await a.page.goto(`/work-orders/${woId}`);
      await expect(a.page.getByTestId("wo-screen")).toBeVisible({ timeout: 30_000 });

      // 대상 — 남의 눈에는 없다
      expect((await apiStatus(b.page, `/api/work-orders/${woId}`)).status).toBe(404);
      await b.page.goto(`/work-orders/${woId}`);
      await expect(b.page.getByTestId("screen-unavailable")).toHaveAttribute("data-kind", "not-found");
      const bText = await bodyText(b.page);
      expect(REFUSAL_WORDS.filter((w) => bText.includes(w)), "화면이 «못 준다»고 말한다").toEqual([]);
      expect(assertsOwnership(bText), "화면이 «남의 것이다»를 단언한다").toEqual([]);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });

  test("④ 리셋 «뒤»에도 격리는 선다 — 지운 세션의 것은 새 세션에도 없다", async ({ browser }) => {
    test.slow();
    const a = await freshVisitor(browser);
    try {
      const created = await startRun(a.page, "replay");
      expect(created.status).toBe(200);
      const runId = created.body.runId;
      const oldSid = await sidOf(a.ctx);

      // 🔴 대조군 — 리셋 «전»에는 자기 것을 본다. 이 행이 없으면 ④는 「원래 안 보이는 것」과 못 갈린다.
      expect((await apiStatus(a.page, `/api/runs/${runId}`)).status, "리셋 전인데도 못 본다").toBe(200);

      await a.page.goto("/overview");
      await a.page.getByTestId("reset-button").click();
      const dialog = a.page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "되돌리기" }).click();
      await expect(a.page.getByRole("status").filter({ hasText: "되돌렸습니다" })).toBeVisible({
        timeout: 30_000,
      });
      await a.page.goto("/");
      await a.page.waitForURL(/\/overview$/);

      // 🔴 «되돌리기»는 세션 교체가 아니라 **그 세션이 쌓은 것을 없애는 일**이다
      //    (정본 = `POST /api/sessions/{sid}/reset` · reset-modal.spec). 앞판 그물은 「sid 가
      //    바뀐다」고 «예언»했다가 빨강을 냈다 — 대상이 아니라 그물이 틀렸다. 재는 것은 격리다.
      expect(await sidOf(a.ctx), "sid 자체는 되돌리기의 축이 아니다(기록만)").toBeTruthy();
      expect(
        (await apiStatus(a.page, `/api/runs/${runId}`)).status,
        "🔴 되돌린 뒤에도 그 세션의 run 이 남아 있다 — 「사라집니다」가 거짓이 된다",
      ).toBe(404);
      void oldSid;
    } finally {
      await a.ctx.close();
    }
  });

  test("⑤ 딥링크는 «열람만» — 쿠키 없이 열리되 세션 화면은 여전히 닫힌다", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      // 🔴 세는 눈 선증명 — 쿠키 «없는» 항아리임을 먼저 못 박는다(있으면 ⑤ 전체가 무의미하다)
      expect((await ctx.cookies()).filter((c) => c.name === "fkt_sid"), "시작부터 세션이 있다").toEqual([]);

      for (const route of ["/evidence/EV-2025-001", "/documents/DOC-MAN-0021"]) {
        await page.goto(route);
        expect(new URL(page.url()).pathname, `${route} 가 «/» 로 튕겼다 — 읽기 예외가 죽었다`).toBe(route);
        expect((await bodyText(page)).length, `${route} 가 빈 화면이다`).toBeGreaterThan(0);
      }
      // 🔴 대조군 — 같은 항아리로 세션 화면을 밟으면 여전히 입장으로 보내진다.
      await page.goto("/overview");
      // 🔴 `/(overview)?$` 는 «/» 에도 맞는다 — 입장이 끝나기 «전»에 통과해 버렸다.
      //    경계를 흐린 정규식은 기다리지 않고 지나간다(「경계 없는 정규식」 계보).
      await page.waitForURL(/\/overview$/, { timeout: 30_000 });
      expect(
        (await ctx.cookies()).find((c) => c.name === "fkt_sid"),
        "딥링크만 열려야 하는데 열람 중에 세션이 서 버렸다(조용한 입장)",
      ).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });
});
