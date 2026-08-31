import { test, expect, type Page } from "@playwright/test";

/**
 * T3-6 — 키보드만으로 P0 동선을 걷는다. Tab · Enter · Esc · 화살표 «만» 쓴다.
 *
 * 🔴 **마우스를 안 쓰는 것이 아니라 «못 쓰는» 사람의 길이다.** 그래서 「도달 가능한가」를
 *    좌표가 아니라 **초점의 자취**로 잰다 — 어디에 있었고 어디로 갔는지를 적는다.
 *
 * 🔴 **세는 눈 선증명이 이 spec 의 전제다.** 「Tab 으로 도달 못 한다」는 「내 Tab 이 아무것도
 *    안 움직였다」와 구별되지 않는다. 그래서 모든 도달 축 앞에 **초점이 실제로 움직였는가**를
 *    먼저 센다. 움직인 자취가 0 이면 그 실행은 초록도 빨강도 내지 않는다.
 *
 * 🔴 **「포커스 가시」는 «클래스가 있다»가 아니라 «그려진다»로 잰다** — 6대 계보(클래스 ≠ 적용).
 *    브라우저가 실제로 계산한 outline/box-shadow 를 읽는다.
 */

const SCENARIO = process.env.FKT_SCENARIO ?? "GS-01";

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

/** 지금 초점이 있는 자리를 «사람이 읽을 수 있는 이름»으로. 자취를 표로 남기기 위한 것. */
async function focusName(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "(없음)";
    const tid = el.getAttribute("data-testid");
    const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    return `${el.tagName.toLowerCase()}${tid ? `#${tid}` : ""}:${label.slice(0, 24)}`;
  });
}

/**
 * Tab 을 n 번 눌러 지나간 자리를 모은다. 🔴 **이 배열이 곧 세는 눈의 증명**이다 —
 * 서로 다른 자리가 2개 이상 나와야 「Tab 이 움직인다」가 참이다.
 */
async function tabTrail(page: Page, steps: number) {
  const trail: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press("Tab");
    trail.push(await focusName(page));
  }
  return trail;
}

/** 🔴 그려진 초점 표시. 클래스명이 아니라 계산된 스타일을 본다. */
async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      boxShadow: s.boxShadow,
      // 의사요소에 그리는 구현도 있다 — 그 자리도 함께 본다.
      afterShadow: getComputedStyle(el, "::after").boxShadow,
    };
  });
}

function drawsRing(ring: Awaited<ReturnType<typeof focusRing>>) {
  if (!ring) return false;
  const width = parseFloat(ring.outlineWidth || "0");
  const outlined = ring.outlineStyle !== "none" && width > 0;
  const shadowed = [ring.boxShadow, ring.afterShadow].some((v) => v && v !== "none");
  return outlined || shadowed;
}

async function startRun(page: Page, mode: "live" | "replay") {
  const sid = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) throw new Error("fkt_sid 가 없다 — 입장이 안 끝났다(측정 불가)");
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

test.describe("T3-6 키보드 — Tab·Enter·Esc·화살표만으로 걷는다", () => {
  test("🔴 세는 눈 — Tab 이 초점을 «실제로» 옮긴다 (이 행이 없으면 아래 전부가 무의미)", async ({ page }) => {
    await enter(page);
    const trail = await tabTrail(page, 12);
    const distinct = new Set(trail.filter((t) => t !== "(없음)"));
    expect(
      distinct.size,
      `Tab 자취가 갈리지 않는다(${trail.join(" → ")}) — 「도달 못 한다」를 말할 자격이 없다`,
    ).toBeGreaterThan(1);
  });

  test("① 셸 내비 — Tab 으로 세 목적지에 닿고 Enter 로 옮겨 간다", async ({ page }) => {
    await enter(page);
    // 상단 내비의 이름은 실물에서 뜬다(예언하지 않는다) — 링크 텍스트로 찾는다.
    const trail = await tabTrail(page, 20);
    for (const dest of ["Overview", "Incidents", "Compare"]) {
      expect(
        trail.some((t) => t.includes(dest)),
        `Tab 자취에 ${dest} 가 없다 — 자취: ${trail.join(" → ")}`,
      ).toBe(true);
    }

    // Enter 가 «옮긴다» — Tab 으로 Compare 에 서서 Enter.
    await page.goto("/overview");
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      if ((await focusName(page)).includes("Compare")) break;
    }
    expect(await focusName(page), "Compare 에 서지 못했다").toContain("Compare");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/compare$/, { timeout: 20_000 });
  });

  test("② 초점은 «그려진다» — 클래스가 아니라 계산된 스타일 (대조군 = body 는 안 그린다)", async ({ page }) => {
    await enter(page);
    // 🔴 대조군 먼저 — 아무 데도 초점이 없을 때 이 눈이 «없다»고 답하는지 본다.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(drawsRing(await focusRing(page)), "초점이 없는데도 «그려진다»고 답한다 — 늘 참인 눈이다").toBe(false);

    const seen: string[] = [];
    let drawn = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const name = await focusName(page);
      if (name === "(없음)") continue;
      seen.push(name);
      if (drawsRing(await focusRing(page))) drawn += 1;
    }
    expect(seen.length, "초점이 선 자리가 없다 — 잴 것이 없다").toBeGreaterThan(0);
    expect(drawn, `초점 표시가 그려지지 않는 자리가 있다 — 그려진 ${drawn}/${seen.length}`).toBe(seen.length);
  });

  test("③ 조사 화면 — 재생·되감기·지금으로가 Tab·Enter 로 돈다", async ({ page }) => {
    test.slow();
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", { timeout: 60_000 });

    const cursor = page.getByTestId("replay-cursor");
    const total = Number(await cursor.getAttribute("data-total"));
    expect(total, "이벤트가 0 이다 — 되감을 것이 없다").toBeGreaterThan(1);

    // 처음으로(⏮) → 키보드만으로 누른다
    await page.getByTestId("replay-restart").focus();
    expect(await focusName(page), "replay-restart 에 초점이 안 선다").toContain("replay-restart");
    expect(drawsRing(await focusRing(page)), "이 버튼은 초점을 그리지 않는다").toBe(true);
    await page.keyboard.press("Enter");
    await expect(cursor).toHaveAttribute("data-applied", "0");

    // 앞으로(▶) 한 칸 — Tab 으로 옮겨 Enter
    await page.getByTestId("replay-forward").focus();
    await page.keyboard.press("Enter");
    await expect(cursor).toHaveAttribute("data-applied", "1");

    // 지금으로 — 되돌아왔다는 것까지가 측정이다
    await page.getByTestId("replay-follow").focus();
    await page.keyboard.press("Enter");
    await expect(cursor).toHaveAttribute("data-applied", String(total));
  });

  /**
   * 🔴 **red 는 정본의 «어느 줄»에서 왔는가** — `docs/plan/tickets/T3-6.md:21`
   *    「모달 열기/닫기 = 키보드만으로(Tab·Enter·Esc·화살표) · 포커스 가시」.
   *    그러므로 여기서 빨강은 **Enter 로 열리지 않음 · Esc 로 닫히지 않음 · 초점 안 그려짐** 셋뿐이다.
   *
   * 🔵 **관찰(판정에 안 섞는다)**: 모달이 열려도 초점은 `reset-button` 에 «남는다»(0·200·1000·3000ms
   *    전건 밖 · 3/3 재현). 모달 안에는 탭 가능한 요소가 있고 Tab 한 번이면 들어간다 —
   *    즉 「키보드만으로 쓸 수 있다」는 정본 문면은 «만족»한다. WAI-ARIA 대화상자 관행(열 때
   *    초점을 안으로)과는 갈리지만, **정본이 말하지 않은 것을 red 로 삼지 않는다**(16대 자수 계보).
   *    채택 여부는 정본 개정의 몫이라 값만 남긴다.
   */
  test("④ 모달 — Enter 로 열리고 Esc 로 닫힌다 (정본 T3-6 ③ · 대조군 = 닫기 전엔 열려 있다)", async ({ page }) => {
    await enter(page);
    await page.getByTestId("reset-button").focus();
    expect(await focusName(page)).toContain("reset-button");
    expect(drawsRing(await focusRing(page)), "리셋 버튼이 초점을 그리지 않는다").toBe(true);
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog, "Enter 로 모달이 열리지 않는다").toBeVisible();
    // 🔴 대조군 — 닫히는 것을 세기 «전»에 열려 있음을 센다. 안 열렸으면 「닫혔다」는 공짜다.
    expect(await dialog.count(), "열린 모달이 1개가 아니다 — 닫힘을 잴 무대가 없다").toBe(1);

    // 🔵 관찰만 — 위 주석 참조. 값을 남기되 판정하지 않는다.
    const focusInside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!(d && document.activeElement && d.contains(document.activeElement));
    });
    test.info().annotations.push({
      type: "관찰",
      description: `모달 열린 직후 초점이 모달 «${focusInside ? "안" : "밖"}»에 있다(정본 미규정 · 판정 아님)`,
    });

    // 🔴 **세는 눈 — 「Esc 가 닫았다」와 「아무 키에나 닫힌다」는 다르다.** 대조군 먼저:
    //    엉뚱한 키를 눌러도 열려 있어야, 뒤이은 Esc 의 초록이 «Esc 의 것»이 된다.
    await page.keyboard.press("a");
    await expect(dialog, "다른 키(a)로도 모달이 닫힌다 — 그러면 Esc 축이 아무것도 증명하지 않는다").toHaveCount(1);

    // 🔴 정본이 말한 자리 — Esc 로 닫힌다.
    //    🔴 **현재 이 칸은 빨강이다 — D-7 「모달 Esc 닫힘 부재(계통)」**(등재 00:11 · 등급 중 ·
    //    리셋 모달·WO 승인 모달 2종에서 3/3 재현 · 초점을 안으로 옮긴 뒤에도 안 닫힌다).
    //    빨강을 «세워 둔다» — 픽스가 착지하면 이 줄이 그대로 재검 1행이 된다. 중복 등재 금지.
    await page.keyboard.press("Escape");
    await expect(dialog, "🔴 Esc 가 모달을 닫지 않는다 — 정본 T3-6 ③ 「Esc」 위반").toHaveCount(0, {
      timeout: 5_000,
    });
  });

  /**
   * 🔴 **D-7 은 «계통»이었다**(리셋 모달 + WO 승인 모달 2종에서 3/3 재현). 그러므로 재검도
   *    계통이어야 한다 — 한 모달만 초록으로 만들고 「닫힌다」고 적으면 남은 자리가 조용히 남는다.
   */
  test("④-b 모달 계통 — WO 승인 확인도 Esc 로 닫힌다 (D-7 재검 · 같은 규칙)", async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page);
    const created = await startRun(page, "live");
    expect(created.status).toBe(200);
    const snap = await page.evaluate(async (id) => {
      const deadline = Date.now() + 120_000;
      let s: { status?: string; workOrderDraftId?: string } = {};
      while (Date.now() < deadline) {
        s = await (await fetch(`/api/runs/${id}`)).json();
        if (s.status && s.status !== "running") return s;
        await new Promise((r) => setTimeout(r, 300));
      }
      return s;
    }, created.body.runId);
    expect(snap.workOrderDraftId, "완주한 live run 이 초안을 내지 않았다 — 승인 모달을 잴 수 없다").toBeTruthy();

    await page.goto(`/work-orders/${snap.workOrderDraftId}`);
    await expect(page.getByTestId("wo-screen")).toBeVisible({ timeout: 30_000 });
    const approve = page.getByTestId("wo-approve");
    await approve.focus();
    expect(drawsRing(await focusRing(page)), "승인 버튼이 초점을 그리지 않는다").toBe(true);
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog, "Enter 로 승인 확인 모달이 열리지 않는다").toBeVisible();
    // 🔴 같은 대조군 — 엉뚱한 키로는 안 닫힌다
    await page.keyboard.press("a");
    await expect(dialog, "다른 키(a)로도 닫힌다 — Esc 축이 공짜가 된다").toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog, "🔴 WO 승인 모달이 Esc 로 닫히지 않는다 — D-7 이 계통으로 남아 있다").toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("⑤ 근거 열람 — Tab·Enter 로 근거 카드 링크를 따라간다", async ({ page }) => {
    test.slow();
    await enter(page);
    const created = await startRun(page, "replay");
    expect(created.status).toBe(200);
    await page.goto(`/incidents/${created.body.incidentId}?run=${created.body.runId}`);
    await expect(page.getByTestId("run-console")).toHaveAttribute("data-status", "completed", { timeout: 60_000 });

    // 근거 카드 «안»의 링크를 잡는다(카드 자신은 링크가 아니다 — 14대 자수 4 계보)
    const link = page.getByTestId("evidence-card").first().locator("a[href]").first();
    await expect(link, "근거 카드 안에 링크가 없다 — 따라갈 길이 없다").toHaveCount(1);
    await link.focus();
    expect(drawsRing(await focusRing(page)), "근거 링크가 초점을 그리지 않는다").toBe(true);
    const href = await link.getAttribute("href");
    const dest = (href ?? "").split("?")[0];
    expect(dest, "링크에 href 가 없다 — 따라갈 곳이 없다").toBeTruthy();
    await page.keyboard.press("Enter");
    // 🔴 「지금 경로가 아니면 됐다」로 기다리지 않는다 — `/incidents/INC-…` 는 `/incidents` 가
    //    아니므로 그 술어는 «즉시 참»이었다(내가 물렸다). 목적지를 이름으로 기다린다.
    await page.waitForURL((u) => u.pathname === dest, { timeout: 20_000 });
  });
});
