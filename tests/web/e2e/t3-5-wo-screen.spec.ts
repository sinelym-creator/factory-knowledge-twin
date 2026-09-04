import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * T3-5 «최소 형상» 독립 검증 — ④ 작업지시서 편집·승인 화면.
 *
 * 🔴 이 그물의 규율 셋. 앞 대(代)들이 여기서 여러 번 속았다:
 *   ⓐ **부정 판정식은 계측기 고장을 통과시킨다.** 「그 칸이 0개다」를 세는 자리마다,
 *      같은 세는 눈으로 «있는 것»을 먼저 세어 눈이 살아 있음을 증명한다(self-check).
 *   ⓑ **자극이 실재했는가.** PATCH·POST 를 «세고», 0 이면 어느 색도 내지 않는다.
 *      「막았다」와 「애초에 안 보냈다」는 같은 초록을 낸다.
 *   ⓒ **대조군은 서버다.** 화면이 그린 값과 같은 세션이 서버에서 읽은 값을 맞댄다 —
 *      화면끼리의 일치는 일치가 아니다.
 *
 * 🔴 정본 = 티켓 `docs/plan/tickets/T3-5.md` · 계약 v0.1.4/5(12필드) · v0.1.6(소유권 404).
 */

const SCENARIO = "GS-01";

/** 계약 v0.1.4 + v0.1.5 — 12필드. 화면이 아니라 «계약»이 이 목록의 주인이다. */
const CONTRACT_FIELDS = [
  "workOrderDraftId",
  "incidentId",
  "equipmentId",
  "title",
  "failureModeId",
  "procedures",
  "safetyMeasures",
  "parts",
  "evidenceIds",
  "gaps",
  "note",
  "approvalState",
] as const;

/** wireframes §4 목업에만 있고 계약에는 «없는» 4칸. 화면에 0이어야 한다. */
const MOCKUP_ONLY = ["우선순위", "예정일", "담당", "예상 시간", "priority", "assignee", "estimated"];

type Draft = {
  workOrderDraftId: string;
  incidentId: string;
  equipmentId: string;
  title: string;
  failureModeId: string;
  procedures: { sopId: string; title: string; status: string }[];
  safetyMeasures: { safetyRuleId: string; title: string; class: string; mandatory: boolean }[];
  parts: { componentId?: string; name?: string; class?: string }[];
  evidenceIds: string[];
  gaps: string[];
  note: string;
  approvalState: string;
};

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/, { timeout: 30_000 });
}

/** 🔴 브라우저 «자신»이 부른다 — 쿠키·가드·rewrite 를 그대로 지나야 측정이 실재한다. */
async function freshDraft(page: Page): Promise<string> {
  const sid = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) throw new Error("브라우저에 fkt_sid 가 없다 — 입장이 안 끝났다(측정 불가)");
  const runId = await page.evaluate(
    async ({ scenario, sid }) => {
      const res = await fetch(`/api/scenarios/${scenario}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mode: "live" }),
      });
      if (!res.ok) throw new Error(`run 생성이 ${res.status} — 측정 불가`);
      return (await res.json()).runId as string;
    },
    { scenario: SCENARIO, sid },
  );
  return page.evaluate(async (id) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      const snap = await (await fetch(`/api/runs/${id}`)).json();
      if (snap.status !== "running") {
        if (!snap.workOrderDraftId) throw new Error("완주한 run 에 workOrderDraftId 가 없다");
        return snap.workOrderDraftId as string;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("run 이 제한 시간 안에 안 끝났다 — 측정 불가");
  }, runId);
}

/** ⓒ 대조군 — 같은 세션이 서버에서 «직접» 읽은 값. */
async function serverDraft(page: Page, woId: string): Promise<Draft> {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/work-orders/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`서버 대조군 GET 이 ${res.status}`);
    return (await res.json()) as Draft;
  }, woId);
}

async function serverCall(page: Page, path: string, init: RequestInit & { body?: string }) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, { ...init, cache: "no-store" } as RequestInit);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body } as { status: number; body: { error?: { code?: string } } | null };
    },
    { path, init },
  );
}

/** ⓑ 이 페이지가 «실제로 보낸» 쓰기 요청을 센다. 0이면 판정하지 않는다. */
function watchWrites(page: Page) {
  const seen: { method: string; url: string; post: string | null }[] = [];
  page.on("request", (r) => {
    const m = r.method();
    if (m === "PATCH" || m === "POST") seen.push({ method: m, url: r.url(), post: r.postData() });
  });
  return seen;
}

const woWrites = (seen: { method: string; url: string }[], kind: "PATCH" | "POST", suffix = "") =>
  seen.filter((r) => r.method === kind && /\/api\/work-orders\//.test(r.url) && r.url.endsWith(suffix));

test.describe("T3-5 — 작업지시서 편집·승인 «최소 형상»", () => {
  test("① 표시 — 계약 12필드 · 목업 4칸 0 · 설비 고정 · 배지 · 출처 링크 (서버 대조군)", async ({ page }) => {
    test.slow();
    await enter(page);
    const woId = await freshDraft(page);
    const server = await serverDraft(page, woId);

    // 🔴 대조군 자기 검증 — 서버 응답이 계약 12필드 그대로인가(화면을 재기 «전»에).
    expect(Object.keys(server).sort(), "서버 응답 필드가 계약 12종과 다르다").toEqual(
      [...CONTRACT_FIELDS].sort(),
    );

    await page.goto(`/work-orders/${woId}`);
    const screen = page.getByTestId("wo-screen");
    await expect(screen).toBeVisible();
    await expect(screen).toHaveAttribute("data-state", server.approvalState);

    // 1) id · 배지 · 출처 incident 링크 · 고장 모드
    await expect(page.getByTestId("wo-header")).toContainText(server.workOrderDraftId);
    await expect(page.getByTestId("wo-badge")).toHaveText(/승인 대기/);
    const incident = page.getByTestId("wo-incident-link");
    await expect(incident).toHaveText(server.incidentId);
    await expect(incident).toHaveAttribute("href", `/incidents/${server.incidentId}`);
    await expect(page.getByTestId("wo-header")).toContainText(server.failureModeId);

    // 2) title · 대상 설비 «고정»
    await expect(page.getByTestId("wo-title")).toHaveValue(server.title);
    const flat = (s: string) => s.replace(/\s+/g, " ").trim();
    const body = flat(await screen.innerText());
    expect(body, "note 가 화면에 없다").toContain(flat(server.note));
    expect(body, "대상 설비 id 가 화면에 없다").toContain(server.equipmentId);
    expect(body).toContain("고정");

    // 3) procedures · safetyMeasures · parts · evidence 를 «서버 수»와 맞댄다
    await expect(page.getByTestId("wo-procedures").locator("li")).toHaveCount(
      Math.max(server.procedures.length, 1),
    );
    await expect(page.getByTestId("wo-safety-item")).toHaveCount(server.safetyMeasures.length);
    await expect(page.getByTestId("wo-part")).toHaveCount(server.parts.length);
    await expect(page.getByTestId("wo-evidence-link")).toHaveCount(server.evidenceIds.length);
    await expect(page.getByTestId("wo-evidence")).toHaveAttribute(
      "data-count",
      String(server.evidenceIds.length),
    );
    for (const id of server.evidenceIds.slice(0, 5)) {
      await expect(page.getByRole("link", { name: id })).toHaveAttribute(
        "href",
        `/evidence/${id}`,
      );
    }

    // 4) gaps — 「없으면 안 그린다」 대조군
    if (server.gaps.length === 0) {
      await expect(page.getByTestId("wo-gaps")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("wo-gaps").locator("li")).toHaveCount(server.gaps.length);
    }

    // 5) 🔴 목업 4칸 «0» — ⓐ 세는 눈이 살아 있음을 먼저 증명한다
    const present = ["안전 조치", "필요 부품", "절차"].filter((w) => body.includes(w));
    expect(present, "세는 눈이 죽었다 — 있는 낱말조차 못 찾는다(측정 불가)").toHaveLength(3);
    const leaked = MOCKUP_ONLY.filter((w) => body.toLowerCase().includes(w.toLowerCase()));
    expect(leaked, `목업 전용 낱말이 화면에 있다: ${leaked.join(", ")}`).toHaveLength(0);

    // 6) 🔴 입력 칸 «전수 열거» — 「없는 testid 의 0」이 아니라 있는 것을 다 세어 맞댄다
    const controls = await screen
      .locator("input, textarea, select")
      .evaluateAll((els) =>
        els.map((e) => ({
          tag: e.tagName,
          testid: e.getAttribute("data-testid"),
          disabled: (e as HTMLInputElement).disabled,
        })),
      );
    const ids = controls.map((c) => c.testid ?? `(무명 ${c.tag})`).sort();
    // pending 초안의 입력 칸 = title 1 + parts n. 그 밖은 하나도 없어야 한다.
    expect(ids, `입력 칸 목록이 예상과 다르다: ${ids.join(" · ")}`).toEqual(
      ["wo-title", ...Array(server.parts.length).fill("wo-part-name")].sort(),
    );
  });

  test("② 편집 — title 디바운스 PATCH 1건 · 새로고침 일치 · parts 추가/삭제 · 신규 id 무생성", async ({
    page,
  }) => {
    test.slow();
    const writes = watchWrites(page);
    await enter(page);
    const woId = await freshDraft(page);
    const before = await serverDraft(page, woId);
    await page.goto(`/work-orders/${woId}`);
    await expect(page.getByTestId("wo-screen")).toBeVisible();

    // ── title 디바운스: 여러 글자를 «연속»으로 치고 PATCH 를 센다
    const mark = writes.length;
    const nextTitle = `${before.title} · 14대 편집`;
    await page.getByTestId("wo-title").fill("");
    await page.getByTestId("wo-title").pressSequentially(nextTitle, { delay: 40 });
    await expect(page.getByTestId("wo-save-state")).toHaveText(/자동 저장됨/, { timeout: 15_000 });

    const titlePatches = woWrites(writes.slice(mark), "PATCH");
    // ⓑ 자극 실재 — 0 이면 아래 초록은 아무것도 안 봤다는 뜻이다
    expect(titlePatches.length, "PATCH 가 0건 — 자극이 실재하지 않았다(측정 불가)").toBeGreaterThan(0);
    expect(titlePatches.length, `디바운스인데 PATCH 가 ${titlePatches.length}건 나갔다`).toBe(1);
    expect(JSON.parse(titlePatches[0].post ?? "{}")).toEqual({ title: nextTitle });
    await expect(page.getByTestId("wo-save-state")).toHaveAttribute("data-changes", "1");

    // 새로고침 일치 — 화면이 아니라 «서버»가 그 값을 갖고 있는가
    const afterTitle = await serverDraft(page, woId);
    expect(afterTitle.title).toBe(nextTitle);
    await page.reload();
    await expect(page.getByTestId("wo-title")).toHaveValue(nextTitle);

    // ── parts 추가 — 신규 항목에 id 를 «지어내지 않는다»
    const mark2 = writes.length;
    await page.getByTestId("wo-part-add").click();
    await expect(page.getByTestId("wo-part")).toHaveCount(before.parts.length + 1);
    const addPatch = woWrites(writes.slice(mark2), "PATCH")[0];
    expect(addPatch, "추가가 PATCH 를 안 냈다").toBeTruthy();
    const addedParts = JSON.parse(addPatch.post ?? "{}").parts as Record<string, unknown>[];
    expect(addedParts).toHaveLength(before.parts.length + 1);
    expect(
      Object.keys(addedParts[addedParts.length - 1]),
      "신규 부품에 componentId 를 지어 붙였다",
    ).not.toContain("componentId");
    await expect(page.getByTestId("wo-part").last()).toContainText("(신규)");

    // 이름을 넣고 blur → 저장 → 새로고침 일치
    const newRow = page.getByTestId("wo-part").last();
    await newRow.getByTestId("wo-part-name").fill("검증 14대 부품");
    await newRow.getByTestId("wo-part-name").blur();
    await expect
      .poll(async () => (await serverDraft(page, woId)).parts.at(-1)?.name, { timeout: 15_000 })
      .toBe("검증 14대 부품");
    await page.reload();
    await expect(page.getByTestId("wo-part")).toHaveCount(before.parts.length + 1);
    await expect(page.getByTestId("wo-part").last().getByTestId("wo-part-name")).toHaveValue(
      "검증 14대 부품",
    );

    // ── parts 삭제 → 서버·화면 동시 반영
    await page.getByTestId("wo-part").last().getByTestId("wo-part-delete").click();
    await expect
      .poll(async () => (await serverDraft(page, woId)).parts.length, { timeout: 15_000 })
      .toBe(before.parts.length);
    await page.reload();
    await expect(page.getByTestId("wo-part")).toHaveCount(before.parts.length);
  });

  test("②′ parts — 신규 2건 중 «앞»을 지웠을 때 화면 표시가 서버와 같은가 (표시 밀림 축)", async ({
    page,
  }) => {
    test.slow();
    await enter(page);
    const woId = await freshDraft(page);
    const before = await serverDraft(page, woId);
    await page.goto(`/work-orders/${woId}`);
    await expect(page.getByTestId("wo-screen")).toBeVisible();

    const rows = page.getByTestId("wo-part");
    await page.getByTestId("wo-part-add").click();
    await expect(rows).toHaveCount(before.parts.length + 1);
    await rows.last().getByTestId("wo-part-name").fill("첫째");
    await rows.last().getByTestId("wo-part-name").blur();
    await expect.poll(async () => (await serverDraft(page, woId)).parts.at(-1)?.name).toBe("첫째");

    await page.getByTestId("wo-part-add").click();
    await expect(rows).toHaveCount(before.parts.length + 2);
    await rows.last().getByTestId("wo-part-name").fill("둘째");
    await rows.last().getByTestId("wo-part-name").blur();
    await expect.poll(async () => (await serverDraft(page, woId)).parts.at(-1)?.name).toBe("둘째");

    // «첫째» 행(뒤에서 두 번째)을 지운다 → 서버에는 [기존…, 둘째] 가 남아야 한다
    await rows.nth(before.parts.length).getByTestId("wo-part-delete").click();
    await expect
      .poll(async () => (await serverDraft(page, woId)).parts.length, { timeout: 15_000 })
      .toBe(before.parts.length + 1);
    const after = await serverDraft(page, woId);
    expect(after.parts.at(-1)?.name, "서버가 지운 쪽을 남겼다").toBe("둘째");

    const names = async () =>
      page
        .getByTestId("wo-part")
        .locator("[data-testid=wo-part-name]")
        .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    const truth = after.parts.map((p) => p.name ?? "");

    // 🔴 새로고침 «없이» 화면이 서버와 같은 것을 그리는가 — 여기가 표시 밀림이 사는 자리다
    const live = await names();
    // 새로고침하면 회복되는가 — «표시만 밀렸다»와 «값이 죽었다»를 가르는 대조군이다
    await page.reload();
    await expect(page.getByTestId("wo-part")).toHaveCount(truth.length);
    const reloaded = await names();
    expect(reloaded, `새로고침 후에도 다르다 — 값 축 결함이다: ${JSON.stringify(reloaded)}`).toEqual(
      truth,
    );
    expect(
      live,
      `표시 밀림 — 새로고침 «전» 화면 ${JSON.stringify(live)} ↔ 서버 ${JSON.stringify(truth)} ` +
        `(새로고침 후에는 ${JSON.stringify(reloaded)} 로 회복 = 표시 축 결함)`,
    ).toEqual(truth);
  });

  test("③ 잠금 — procedures·safety 편집 칸 0 · 삭제 시도 = 문구(조건절 0) · 서버에 요청 0", async ({
    page,
  }) => {
    test.slow();
    const writes = watchWrites(page);
    await enter(page);
    const woId = await freshDraft(page);
    const server = await serverDraft(page, woId);
    await page.goto(`/work-orders/${woId}`);
    await expect(page.getByTestId("wo-screen")).toBeVisible();

    // 잠긴 두 블록 안의 입력 칸 «전수»
    for (const block of ["wo-procedures", "wo-safety"]) {
      const n = await page.getByTestId(block).locator("input, textarea, select").count();
      expect(n, `${block} 안에 편집 칸이 ${n}개 있다`).toBe(0);
    }
    // ⓐ 세는 눈 자기 검증 — 같은 눈이 «열린» 블록에서는 칸을 찾아낸다
    const openCount = await page.getByTestId("wo-parts").locator("input").count();
    expect(openCount, "세는 눈이 죽었다 — 열린 블록에서도 0을 센다").toBeGreaterThan(0);

    // 안전 조치 삭제 «시도» → 문구가 뜨고, 서버로는 아무것도 안 나간다
    const mark = writes.length;
    await page.getByTestId("wo-safety-delete").first().click();
    const note = page.getByTestId("wo-locked-note");
    await expect(note).toBeVisible();
    const noteText = await note.innerText();
    expect(noteText).toContain("안전 조치는 SOP");
    // 🔴 조건절 0 — wireframes 의 「mandatory 인 경우」가 살아남지 않았는가(Q-31)
    for (const conditional of ["mandatory", "인 경우", "필수인 경우", "일 때"]) {
      expect(noteText, `문구에 조건절이 남아 있다: ${conditional}`).not.toContain(conditional);
    }
    expect(woWrites(writes.slice(mark), "PATCH"), "삭제 시도가 서버로 나갔다").toHaveLength(0);

    // mandatory 두 값이 같은 문구로 잠기는가 — 서버가 mandatory 와 «무관»하게 잠그므로
    const flags = await page
      .getByTestId("wo-safety-item")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-mandatory")));
    expect(flags).toHaveLength(server.safetyMeasures.length);

    // 화면 문구 3종 — 서버 3코드에 대응하는가(있는 것을 «세어» 기록한다)
    const pageText = await page.locator("body").innerText();
    const phrases = {
      safety_measure_immutable: pageText.includes(
        "안전 조치는 SOP 가 요구하는 항목이라 편집·삭제할 수 없습니다",
      ),
      safety_basis_immutable: pageText.includes("절차는 안전 조치의 «근거»라 편집할 수 없습니다"),
      field_not_editable: pageText.includes("field_not_editable"),
    };
    expect(phrases.safety_measure_immutable).toBe(true);
    expect(phrases.safety_basis_immutable).toBe(true);
    // 🔴 field_not_editable 은 화면에 «도달 경로»가 있는지 자체가 판정 대상 — 여기서는 기록만 한다
    console.log(`   [기록] 화면 문구 대응: ${JSON.stringify(phrases)}`);

    // 서버 대조군 — 3코드가 실제로 갈려 오는가(같은 세션)
    const codes: Record<string, string | undefined> = {};
    for (const [field, value] of [
      ["safetyMeasures", []],
      ["procedures", []],
      ["bogusField", 1],
    ] as [string, unknown][]) {
      const r = await serverCall(page, `/api/work-orders/${woId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      expect(r.status, `${field} PATCH 가 403 이 아니다`).toBe(403);
      codes[field] = r.body?.error?.code;
    }
    expect(codes).toEqual({
      safetyMeasures: "safety_measure_immutable",
      procedures: "safety_basis_immutable",
      bogusField: "field_not_editable",
    });
  });

  test("④ 반려 — 사유 빈 = 확인 비활성(화면 규칙) · 사유 있음 → rejected + auditId · 이후 잠금", async ({
    page,
  }) => {
    test.slow();
    const writes = watchWrites(page);
    await enter(page);
    const woId = await freshDraft(page);
    await page.goto(`/work-orders/${woId}`);
    await expect(page.getByTestId("wo-screen")).toBeVisible();

    await page.getByTestId("wo-reject").click();
    const confirm = page.getByTestId("wo-confirm");
    await expect(confirm).toBeDisabled();
    // 공백만 넣어도 여전히 비활성이어야 한다(trim 규칙)
    await page.getByTestId("wo-reason").fill("   ");
    await expect(confirm).toBeDisabled();

    const mark = writes.length;
    await page.getByTestId("wo-reason").fill("안전 조치 근거가 부족하다");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId("wo-screen")).toHaveAttribute("data-state", "rejected");
    await expect(page.getByTestId("wo-badge")).toHaveText(/반려됨/);
    const rejects = woWrites(writes.slice(mark), "POST", "/reject");
    expect(rejects.length, "반려 POST 가 0건 — 자극 없음").toBe(1);
    expect(JSON.parse(rejects[0].post ?? "{}")).toEqual({ comment: "안전 조치 근거가 부족하다" });

    // 이력 = auditId + 「새로고침하면 사라집니다」 한계 문구
    const history = page.getByTestId("wo-history");
    await expect(history).toContainText(/AUD-/);
    await expect(history).toContainText("새로고침하면 사라집니다");

    // 서버 대조군 — 상태가 실제로 종단인가 · 재반려 409
    expect((await serverDraft(page, woId)).approvalState).toBe("rejected");
    const again = await serverCall(page, `/api/work-orders/${woId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "두 번째" }),
    });
    expect(again.status).toBe(409);
    expect(again.body?.error?.code).toBe("approval_state_terminal");

    // 이후 화면 잠금 + 새로고침하면 이력이 사라진다(화면이 말한 그대로인가)
    await expect(page.getByTestId("wo-title")).toBeDisabled();
    await expect(page.getByTestId("wo-approve")).toBeDisabled();
    await expect(page.getByTestId("wo-reject")).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId("wo-history")).toHaveCount(0);
    await expect(page.getByTestId("wo-save-state")).toHaveText(/종단 상태/);
  });

  test("⑤ 승인 — 모달 → approved + auditId · 이후 잠금 · 서버 409 두 종", async ({ page }) => {
    test.slow();
    const writes = watchWrites(page);
    await enter(page);
    const woId = await freshDraft(page);
    await page.goto(`/work-orders/${woId}`);
    await expect(page.getByTestId("wo-screen")).toBeVisible();

    const mark = writes.length;
    await page.getByTestId("wo-approve").click();
    await expect(page.getByRole("dialog")).toContainText("승인할까요");
    await expect(page.getByRole("dialog")).toContainText("되돌릴 수 없습니다");
    // 🔴 대조군 — 취소하면 아무 일도 안 일어난다
    await page.getByTestId("wo-cancel").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(woWrites(writes.slice(mark), "POST", "/approve"), "취소했는데 요청이 나갔다").toHaveLength(0);
    expect((await serverDraft(page, woId)).approvalState).toBe("pending");

    const mark2 = writes.length;
    await page.getByTestId("wo-approve").click();
    await page.getByTestId("wo-confirm").click();
    await expect(page.getByTestId("wo-screen")).toHaveAttribute("data-state", "approved");
    await expect(page.getByTestId("wo-badge")).toHaveText(/승인됨/);
    expect(woWrites(writes.slice(mark2), "POST", "/approve")).toHaveLength(1);
    await expect(page.getByTestId("wo-history")).toContainText(/AUD-/);

    await expect(page.getByTestId("wo-title")).toBeDisabled();
    await expect(page.getByTestId("wo-approve")).toBeDisabled();
    await expect(page.getByTestId("wo-reject")).toBeDisabled();
    /* 🔴 **계약이 바뀌었다(D-70)** — 잠긴 초안에는 편집 UI 를 «그리지 않는다».
       예전 형상은 `disabled` + `opacity-40` 이었고, 그것이 「눌러도 되는데 안 눌리는 것」처럼
       보이는 데다 좁은 폭에서 «비어 보이는 긴 카드»의 절반이었다(폐하 360 실기기 · D-70).
       그래서 `toBeDisabled()` 는 이제 **요소를 못 찾아 실패한다** — 부재로 판정선을 옮긴다.

       🔴 다만 «0건»만 세면 **화면이 통째로 비어도 초록**이다. 그래서 같은 자리에서
          ① 읽기 목록이 남아 있고 ② 잠김 사유가 문면으로 있고 ③ 🛡 안전 조치의 삭제는
          «여전히 있다»(설계 의도 · 서버가 403 으로 막는 축)까지 함께 못박는다. */
    await expect(page.getByTestId("wo-part-add")).toHaveCount(0);
    await expect(page.getByTestId("wo-part-delete")).toHaveCount(0);
    await expect(page.getByTestId("wo-part-name")).toHaveCount(0);
    expect(await page.getByTestId("wo-part").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("wo-parts-lock")).toHaveText("✅ 승인됨 · 편집 잠김");
    expect(await page.getByTestId("wo-safety-delete").count()).toBeGreaterThan(0);

    expect((await serverDraft(page, woId)).approvalState).toBe("approved");
    const patch = await serverCall(page, `/api/work-orders/${woId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "승인 후 편집" }),
    });
    expect(patch.status).toBe(409);
    expect(patch.body?.error?.code).toBe("work_order_not_editable");
    const rej = await serverCall(page, `/api/work-orders/${woId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "재반려" }),
    });
    expect(rej.status).toBe(409);
    expect(rej.body?.error?.code).toBe("approval_state_terminal");
  });

  test("⑥ 소유권·가드 — 타 세션은 «없다» · 「남의 것」 문구 0 · 무쿠키는 입장으로", async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    test.slow();
    await enter(page);
    const woId = await freshDraft(page);

    // ── 타 세션(다른 쿠키 항아리)
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await enter(otherPage); // 자기 세션을 «갖고» 온다 — 무세션과 섞지 않는다
    await otherPage.goto(`/work-orders/${woId}`);
    const box = otherPage.getByTestId("screen-unavailable");
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute("data-kind", "not-found");
    // 🔴 **셸 크롬이 아니라 «자원 화면»을 센다.** `body` 를 뜨면 앱 공용 fallback 배너의
    //    「소유자 게이트웨이 미도달」이 「소유」 누설로 계수된다(09-03 실측 · 배너 없는 열은
    //    같은 코드로 초록). 낱말 예외로 빼지 않는다 — 「이 문서의 소유자는 …」 같은 **진짜**
    //    누설까지 통과시킨다. 좁힐 것은 낱말이 아니라 보는 범위다.
    const LEAK_WORDS = ["남의", "다른 세션", "권한", "403", "소유"];
    const text = await otherPage.locator("main").innerText();
    expect(text).toContain("그런 작업지시 초안이 없다");
    for (const leak of LEAK_WORDS) {
      expect(text, `존재를 누설하는 낱말이 있다: ${leak}`).not.toContain(leak);
    }
    // 🔴 대조군 — 좁힌 눈이 아직 문다(같은 실행 · main 안에 심고 지운다)
    await otherPage.evaluate(() => {
      const el = document.createElement("p");
      el.id = "levi2-leak-control";
      el.textContent = "이 초안은 남의 세션 자원입니다.";
      document.querySelector("main")?.appendChild(el);
    });
    const planted = await otherPage.locator("main").innerText();
    expect(LEAK_WORDS.filter((w) => planted.includes(w)), "심은 누설 낱말을 못 잡는다 — 눈이 멀었다").not.toEqual([]);
    await otherPage.evaluate(() => document.getElementById("levi2-leak-control")?.remove());
    // ⓐ 세는 눈 자기 검증 — 같은 눈이 있는 낱말은 찾는다
    expect(text).toContain("없다");
    await other.close();

    // ── 무쿠키(세션 없는 항아리) → 입장 경로로 밀린다(Q-39 형상)
    const bare = await browser.newContext();
    const barePage = await bare.newPage();
    const hops: { url: string; status: number }[] = [];
    barePage.on("response", (r) => hops.push({ url: r.url(), status: r.status() }));
    await barePage.goto(`/work-orders/${woId}`);
    await barePage.waitForURL(/\/overview$/, { timeout: 30_000 });
    const wo307 = hops.find((h) => h.url.includes(`/work-orders/${woId}`));
    expect(wo307?.status, "무쿠키 진입이 307 이 아니다").toBe(307);
    await bare.close();
  });
});
