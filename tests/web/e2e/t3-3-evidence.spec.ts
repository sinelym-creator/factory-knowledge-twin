import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

/**
 * T3-3 화면 ③ Evidence·Documents — 근거 열람 · STALE 배지 · 딥링크 (검증 좌석 · 11대).
 *
 * red 는 전부 정본의 «어느 줄»에서 왔는지 적을 수 있다:
 *   ① `docs/plan/tickets/T3-3.md` AC — kind 2종 렌더 · 인용 강조 = `body[start:end]` 실값 ·
 *      revision/hash/approvalState/effective + STALE 배지 · 🔴 딥링크 무세션 열람 ·
 *      브라우저 네트워크 축(세션 화면 vs 딥링크) · graph-path 404 = Q-34 성문 그대로(red 아님)
 *   ② `docs/product/wireframes.md` §3 문서 헤더·본문 항목 · 인터랙션 ④ STALE INDEX 배지
 *   ③ 계약 v0.1.1(형상) · v0.1.6(읽기 예외 2라우트) · Q-20(울음 판정선) · Q-22(보수 매핑)
 *
 * 🔴 **딥링크 축은 «쿠키 없는 브라우저»로만 참이 된다.** 세션이 있는 컨텍스트에서 열어 놓고
 *    「열린다」고 말하면 그 초록의 주어가 딥링크가 아니다 — 매번 새 컨텍스트를 판다.
 */

const DOC_CHUNK = "DOC-MAN-0021@r1#000";
const DOC_ID = "DOC-MAN-0021";
const RECORD = "MR-2024-0001";
/** 계약 v0.1.1 이 다루지 않는 kind — 서버는 404 로 답한다(Q-34 · 현행 참). */
const OUT_OF_KIND = "GP-not-a-doc-chunk";

const enc = encodeURIComponent;

/** 🔴 쿠키가 없는 «새» 브라우저 — 딥링크의 주어를 매번 새로 세운다. */
async function anonymous(browser: Parameters<typeof test>[1] extends never ? never : any) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

test.describe("T3-3 딥링크 — 계약 v0.1.6 읽기 예외의 «화면» 절반", () => {
  test("무세션 브라우저가 evidence 딥링크를 «열고 데이터까지» 본다", async ({ browser }) => {
    const { ctx, page } = await anonymous(browser);
    await page.goto(`/evidence/${enc(DOC_CHUNK)}`, { waitUntil: "networkidle" });

    // 🔴 도착지가 딥링크여야 한다. 세션 화면으로 튕겼는데 「열렸다」고 세지 않는다.
    expect(new URL(page.url()).pathname, "딥링크가 세션 화면으로 튕겼다").toContain("/evidence/");
    // 🔴 «열람만»의 실증은 **기다린 뒤에** 묻는다 — 세션은 늦게 생긴다(Q-39 · 아래 축이 전담).
    //    여기서는 「도착 직후에 조용히 입장시키지 않는가」만 본다.
    expect(
      (await ctx.cookies()).map((c) => c.name),
      "딥링크 도착 즉시 세션이 생겼다 — 「열람만」이 아니다",
    ).toEqual([]);

    // 열린 것만으로는 부족하다 — 데이터가 실제로 그려져야 예외가 «동작»한 것이다.
    await expect(page.getByTestId("evidence-kind")).toContainText("doc-chunk");
    await expect(page.getByTestId("trust-header").first()).toBeVisible();
    await expect(page.getByTestId("cited-span")).toBeVisible();
    await ctx.close();
  });

  test("🔴 대조군 — 세션 화면과 «세그먼트 2» 는 무세션에서 닫힌다", async ({ browser }) => {
    // 대조군이 없으면 위 초록의 주어가 「딥링크 예외」인지 「가드가 통째로 죽었는지」 모른다.
    // 🔴 `/overview` 를 대조군에서 뺐다(11대 자수). 그 화면은 무세션이면 **세션을 만들어 주는**
    //    자리라 경로가 그대로인 것이 정상이다 — 「튕기는가」로 물으면 정상을 결함으로 읽는다.
    //    대조군은 «목적지를 잃는» 화면이어야 한다.
    for (const [path, why] of [
      ["/work-orders/WOD-x", "세션 자원 화면이 무세션에서 열린다 — 예외가 넓다"],
      [`/evidence/${enc(DOC_CHUNK)}/extra`, "예외가 세그먼트 2 까지 문다 — 계약이 연 것은 단건 열람이다"],
      ["/compare", "세션 화면이 무세션에서 그대로 선다"],
    ] as const) {
      const { ctx, page } = await anonymous(browser);
      await page.goto(path, { waitUntil: "networkidle" });
      expect(new URL(page.url()).pathname, why).not.toBe(path);
      await ctx.close();
    }
  });

  test("딥링크 화면이 «무엇이 안 열리는지»를 말하고 세션 화면으로 가는 길을 준다", async ({ browser }) => {
    const { ctx, page } = await anonymous(browser);
    await page.goto(`/evidence/${enc(RECORD)}`, { waitUntil: "networkidle" });
    const notice = page.getByTestId("deep-link-notice");
    await expect(notice, "무세션 딥링크인데 안내가 없다").toBeVisible();
    // AC 「세션 화면으로의 전환 동선」 — 막다른 길로 두지 않는다.
    expect(
      await notice.locator("a, button").count(),
      "딥링크에서 세션 화면으로 가는 동선이 없다",
    ).toBeGreaterThan(0);
    await ctx.close();
  });
});

test.describe("T3-3 근거 열람 — kind 2종·인용 강조", () => {
  test("kind=doc-chunk 는 문서 탭과 인용 강조를, kind=record 는 «색인 축 없음»을 그린다", async ({
    page,
  }) => {
    await page.goto(`/evidence/${enc(DOC_CHUNK)}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("evidence-kind")).toContainText("doc-chunk");
    await expect(page.getByTestId("document-tab")).toBeVisible();
    await expect(page.getByTestId("cited-body")).toHaveAttribute("data-highlight", "ok");

    await page.goto(`/evidence/${enc(RECORD)}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("evidence-kind")).toContainText("record");
    // 🔴 계약 v0.1.1: record 의 stale=false 는 «색인 축이 없다»는 뜻이지 신선 실증이 아니다.
    //    두 false 를 같은 초록으로 그리면 재지 않은 것을 잰 것처럼 말하게 된다(§0.2).
    await expect(page.getByTestId("index-badge").first()).toHaveAttribute(
      "data-state",
      "not-indexed",
    );
  });

  test("🔴 인용 강조가 «원문에서 잘라 낸 그 구간»이다 (E-4 축 · AC)", async ({ page }) => {
    await page.goto(`/evidence/${enc(DOC_CHUNK)}`, { waitUntil: "networkidle" });

    // 출처를 화면이 아니라 두 라우트에서 가져온다 — 화면에서 읽은 것을 화면으로 검산하지 않는다.
    const ev = await (await page.request.get(`/api/evidence/${enc(DOC_CHUNK)}`)).json();
    const doc = await (
      await page.request.get(`/api/documents/${enc(DOC_ID)}?highlight=${enc(DOC_CHUNK)}`)
    ).json();
    const slice = doc.body.slice(doc.highlight.start, doc.highlight.end);

    // ① 두 라우트의 좌표가 서로를 가리킨다(T2-2 계보 — 인용이 «그 문장»인가).
    expect(slice, "/documents 의 좌표가 /evidence 가 낸 인용문과 다르다").toBe(ev.text);
    // ② 화면이 그린 강조가 그 슬라이스«다» — 인용문을 따로 그리면 좌표가 틀려도 멀쩡해 보인다.
    expect(
      await page.getByTestId("cited-span").textContent(),
      "화면 강조가 원문 슬라이스와 다르다 — 강조가 «그 문장» 위에 없다",
    ).toBe(slice);
    // ③ 좌표를 화면이 스스로 밝힌다(그럴듯한 위치를 지어내지 않았음을 읽을 수 있게).
    await expect(page.getByTestId("cited-body")).toContainText(
      `offset [${doc.highlight.start}, ${doc.highlight.end})`,
    );
  });

  test("계약 밖 kind 는 404 이고, 화면은 «추정 없이» 그 사실만 적는다 (Q-34 · red 아님)", async ({
    page,
  }) => {
    await page.goto(`/evidence/${enc(OUT_OF_KIND)}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("screen-unavailable")).toHaveAttribute("data-kind", "not-found");
    // 🔴 화면이 id 모양으로 kind 를 갈라 그리면 계약이 정하지 않은 것을 화면이 정한 것이다.
    await expect(page.getByTestId("screen-unavailable").locator("..")).toContainText("Q-34");
  });

  test("문서 화면이 신뢰 6필드를 «전부» 그린다 (wireframes §3 문서 헤더 · F-4)", async ({ page }) => {
    await page.goto(`/documents/${enc(DOC_ID)}?highlight=${enc(DOC_CHUNK)}`, {
      waitUntil: "networkidle",
    });
    const doc = await (
      await page.request.get(`/api/documents/${enc(DOC_ID)}?highlight=${enc(DOC_CHUNK)}`)
    ).json();
    const header = page.getByTestId("trust-header").first();
    await expect(header).toContainText(doc.revisionId);
    await expect(header).toContainText(doc.approvalState);
    await expect(header, "유효 기간이 없다").toContainText(doc.effectiveFrom.slice(0, 10));
    // sha256 은 §3 표기가 앞뒤 4자다 — 전체는 title 로 남는다.
    await expect(header).toContainText(doc.contentHash.slice(0, 4));
    await expect(page.getByTestId("index-badge").first()).toBeVisible();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 🔴 STALE 주입 — Q-20 울음 판정선(「낡음 주입 시 어느 층도 안 운다 = FAIL」).
 *
 * seed 의 freshness 는 FRESH·SKIPPED 뿐이라 amber 는 «한 번도» 켜지지 않는다. 켜지지 않는
 * 배지를 보고 「배지가 있다」고 세면, 그 초록은 배지가 아니라 «데이터가 없다»의 초록이다.
 * 그래서 낡음을 만들어 넣고, 화면이 우는지 본다 — 그리고 반드시 되돌린다.
 *
 * 🔴 쓰기 규율: 자기 스택(`FKT_PG_CONTAINER`)의 `index_build` **한 칸**만 바꾼다. SSOT 원본
 *    (문서 본문·revision·chunk)은 건드리지 않는다. 원값은 먼저 읽어 두고, 실패해도
 *    `finally` 에서 되돌린 뒤 되감기까지 확인한다(T2-2 `--inject-drift` 선례).
 * 🔴 대조군: 주입하지 않은 다른 문서의 배지가 **fresh 로 머무는지**까지 본다 — 둘 다 켜지면
 *    「주입이 먹었다」가 아니라 「배지가 늘 켜진다」일 수 있다.
 * ──────────────────────────────────────────────────────────────────────────── */

const PG_CONTAINER = process.env.FKT_PG_CONTAINER ?? "fkt-levi2-postgres-1";
const TARGET_REV = "DOC-SOP-0014@r2";
const TARGET_CHUNK = "DOC-SOP-0014@r2#001";
const TARGET_DOC = "DOC-SOP-0014";
const CONTROL_CHUNK = "DOC-MAN-0021@r1#001";
const DUMMY_SHA = "0".repeat(63) + "1";

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", PG_CONTAINER, "psql", "-U", "fkt", "-d", "fkt", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

async function badgeState(page: Page, path: string): Promise<string | null> {
  await page.goto(path, { waitUntil: "networkidle" });
  return page.getByTestId("index-badge").first().getAttribute("data-state");
}

test("🔴 STALE 주입 — 낡음이 «화면 배지»까지 온다 (Q-20 울음 판정선)", async ({ page }) => {
  test.slow();
  const build = psql(
    `SELECT build_id FROM index_build WHERE revision_id='${TARGET_REV}' ORDER BY built_at DESC LIMIT 1`,
  );
  test.skip(!build, `${TARGET_REV} 의 빌드 기록이 없다 — 주입 대상이 없으면 못 잰다`);
  const original = psql(
    `SELECT source_sha256 FROM index_build WHERE revision_id='${TARGET_REV}' AND build_id='${build}'`,
  );
  expect(original, "원값이 sha256 형식이 아니다 — 되돌릴 값을 확신할 수 없으면 쓰지 않는다").toMatch(
    /^[0-9a-f]{64}$/,
  );

  const EV = `/evidence/${enc(TARGET_CHUNK)}`;
  const DV = `/documents/${enc(TARGET_DOC)}?highlight=${enc(TARGET_CHUNK)}`;
  const CTL = `/evidence/${enc(CONTROL_CHUNK)}`;

  const freshness = () =>
    psql(`SELECT freshness FROM v_index_freshness WHERE revision_id='${TARGET_REV}'`);
  expect(freshness(), "주입 «전»이 이미 FRESH 가 아니다 — 전이를 잴 수 없다").toBe("FRESH");

  const pre = { ev: await badgeState(page, EV), doc: await badgeState(page, DV), ctl: await badgeState(page, CTL) };
  expect(pre, "주입 전 배지가 전부 fresh 가 아니다").toEqual({ ev: "fresh", doc: "fresh", ctl: "fresh" });

  let during: string | null = null;
  let post: Record<string, string | null> = {};
  try {
    psql(
      `UPDATE index_build SET source_sha256='${DUMMY_SHA}' WHERE revision_id='${TARGET_REV}' AND build_id='${build}'`,
    );
    during = freshness();
    post = { ev: await badgeState(page, EV), doc: await badgeState(page, DV), ctl: await badgeState(page, CTL) };
  } finally {
    psql(
      `UPDATE index_build SET source_sha256='${original}' WHERE revision_id='${TARGET_REV}' AND build_id='${build}'`,
    );
  }

  expect(during, "뷰가 STALE 로 전이하지 않았다 — 주입이 먹지 않았다(계측기 실패)").toBe("STALE");
  expect(post.ev, "🔴 evidence 화면이 낡음에 침묵한다 — Q-20 울음 판정선 FAIL").toBe("stale");
  expect(post.doc, "🔴 documents 화면이 낡음에 침묵한다 — Q-20 울음 판정선 FAIL").toBe("stale");
  expect(post.ctl, "대조군까지 stale 이 됐다 — 배지가 늘 켜지는 것일 수 있다").toBe("fresh");

  // 🔴 되감기까지가 이 행의 일부다. 원복이 안 되면 다음 실행의 «주입 전»이 거짓이 된다.
  expect(freshness(), "원복 후에도 STALE 이다 — 스택을 낡은 채로 두고 나갔다").toBe("FRESH");
  expect(await badgeState(page, EV), "원복 후 화면 배지가 fresh 로 돌아오지 않는다").toBe("fresh");
});
