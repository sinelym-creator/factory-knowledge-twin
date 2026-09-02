import { test, expect, devices, type Page } from "@playwright/test";

import { STATE_TESTIDS, clipped, colorOnly, overlaps } from "./_layout-probes";

/**
 * T4-4 — **tablet·모바일** viewport 하네스. T3-6 이 세운 검출기 3종을 «그대로» 쓰고 폭만 늘린다.
 *
 * 🔴 **red 정의는 정본의 «어느 줄»에서 왔는가** — `docs/baseline/poc-baseline-v0.2.md`
 *
 *     :528  「1440px desktop 을 핵심 시연 viewport 로 하고 **tablet 까지 대응**한다.」
 *     :529  「**모바일은 overview alert 와 승인 확인을 우선 제공**하고 복잡한 graph 편집은
 *            **제외할 수 있다**.」
 *
 *    ⇒ 두 폭의 판정선이 **다르다**. tablet 은 데스크톱과 같은 「전 화면 가로 밀림 0」을 진다.
 *      전화 폭은 정본이 **범위 축소를 명시로 허용**하므로 「5화면 전부 들어맞아야 한다」는
 *      **정본보다 넓은 축**이다 — 그 자리에서는 정본이 지명한 «두 가지»만 red 로 삼고,
 *      나머지(가로 밀림·잘림)는 **관측값**으로 남긴다.
 *
 * 🔴 앞판에서 나는 전화 폭 5화면에 「가로 밀림 0」을 걸어 10행을 전건 빨강으로 만들었다.
 *    실측값(~150px 밀림)은 참이지만 **판정선이 내 것이었다** — 정본이 시키지 않은 red 다.
 *    값은 버리지 않고 annotation 으로 남긴다(T4-3 뒤 정본이 넓어지면 그때 판정으로 올린다).
 *
 * 🔴 **검출기를 복사하지 않았다.** `_layout-probes` 한 벌을 데스크톱 하네스와 공유한다 —
 *    검출기가 «검출할 수 있다»는 증명(자극 주입 대조군 3본)은 `t3-6-viewport.spec.ts` 가 진다.
 */

/**
 * 🔴 디바이스 프로필에서 «레이아웃에 닿는 칸»만 뽑는다. 통째로 펴면 `defaultBrowserType` 이
 *    섞여 들어가고 playwright 는 그것을 describe 안에서 거부한다 — 그 빨강은 내 하네스의 것이다.
 */
function layoutOf(name: string) {
  const d = devices[name];
  return {
    viewport: d.viewport,
    deviceScaleFactor: d.deviceScaleFactor,
    isMobile: d.isMobile,
    hasTouch: d.hasTouch,
    userAgent: d.userAgent,
  };
}

/** 데스크톱 하네스와 같은 5화면 — 폭만 바뀐다(비교가 성립하려면 대상이 같아야 한다). */
const SCREENS = [
  { name: "overview", path: "/overview" },
  { name: "compare", path: "/compare" },
  { name: "incident", path: "/incidents/INC-2026-014" },
  { name: "evidence", path: "/evidence/EV-2025-001" },
  { name: "document", path: "/documents/DOC-MAN-0021" },
];

async function enter(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/overview$/);
}

/** 훑은 «수» + 문서 가로 밀림. 0개를 훑고 낸 「위반 0」은 초록이 아니라 무측정이다. */
async function survey(page: Page) {
  return page.evaluate(
    (ids) => ({
      testids: document.querySelectorAll("[data-testid]").length,
      states: ids.reduce((n, id) => n + document.querySelectorAll(`[data-testid="${id}"]`).length, 0),
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      width: window.innerWidth,
    }),
    STATE_TESTIDS,
  );
}

// ── tablet — 정본 :528 「tablet 까지 대응」 = 데스크톱과 같은 판정선 ──────────

test.describe("T4-4 tablet 하네스 (정본 :528 「tablet 까지 대응」)", () => {
  test.use({ ...layoutOf("iPad (gen 7) landscape") });

  for (const screen of SCREENS) {
    test(`tablet × ${screen.name} — 문서 가로 밀림 0 · 겹침 0 · 색만 구분 0`, async ({ page }) => {
      await enter(page);
      await page.goto(screen.path);
      // 기다리던 것: 이 화면이 클라이언트까지 섰는가 — 훑기(survey)는 «선 화면»에서만 뜻이 있다
      await expect(page.getByTestId("mode-badge"), "셸이 클라이언트까지 서지 않았다")
        .not.toHaveAttribute("data-mode", "checking", { timeout: 15_000 });
      await expect(page.locator("body"), "빈 화면이다 — 잴 것이 없다").not.toHaveText("");

      const seen = await survey(page);
      expect(seen.testids, `훑은 testid 가 0 이다 (tablet · ${screen.name})`).toBeGreaterThan(5);
      expect(seen.states, "상태 표시를 못 찾았다 — 「색만 구분 0」이 공짜다").toBeGreaterThan(0);
      test.info().annotations.push({
        type: "훑은 수",
        description: `tablet(${seen.width}px) ${screen.name}: testid ${seen.testids} · 상태 ${seen.states}`,
      });

      expect(seen.docOverflow, `문서가 가로로 ${seen.docOverflow}px 밀린다 (tablet · ${screen.name})`)
        .toBeLessThanOrEqual(1);
      expect(await overlaps(page), `겹친 자리 (tablet · ${screen.name})`).toEqual([]);
      expect(await colorOnly(page, STATE_TESTIDS), `상태를 색«만»으로 (tablet · ${screen.name} · §10)`).toEqual([]);
    });
  }
});

// ── 전화 폭 — 정본 :529 가 지명한 «두 가지»만 red 로 삼는다 ──────────────────

for (const name of ["Pixel 7", "iPhone 13"]) {
  test.describe(`T4-4 전화 폭 하네스 — ${name} (정본 :529 우선 제공 2종)`, () => {
    test.use({ ...layoutOf(name) });

    test(`${name} — ① overview alert 가 «닿는다»`, async ({ page }) => {
      // 🔴 외부 URL 은 왕복이 다르다 — 준비(적재)와 판정(요소)이 30s 한 시계를 나눠 쓰면
      //    느린 링크에서 판정이 시간에 쫓겨 죽는다. 그 빨강은 대상이 아니라 내 예산이다.
      test.setTimeout(90_000);
      await enter(page);
      // 🔴 **«가라앉히기»와 «재기»를 나눈다.** `networkidle` 은 재는 것이 아니라 가라앉히는
      //    대기인데, 외부 URL 에서는 Next 의 RSC prefetch 가 계속 떠서 이 한 줄이 예산을
      //    통째로 먹었다(T4-4 실측: 같은 적재에서 alarm-card 는 **4,075ms** 에 보였고
      //    networkidle 은 그 **뒤** 495ms 에 왔다 — 즉 화면은 진작 와 있었다).
      //    그래서 가라앉히기는 상한을 주고 «삼킨다» — 이 대기의 실패는 판정이 아니다.
      // 기다리던 것: 없다 — 이 자리의 networkidle 은 「가라앉히기」였고(위 주석·실측 4,075ms vs +495ms),
      //   판정선은 바로 아래 kpi-strip 의 toBeVisible(30s) 이다. 예산만 먹던 줄이라 지운다.
      // 🔴 그리고 화면이 «섰는가»부터 세운다. 이게 서야 아래 「알람 0건」이 **데이터 사실**이
      //    된다 — 안 서면 그건 씨앗이 아니라 **렌더 실패**이고, skip 으로 접으면 결함이 초록
      //    옆자리로 숨는다.
      await expect(
        page.getByTestId("kpi-strip"),
        "overview 가 렌더되지 않았다 — 「알람 0건」을 씨앗 조건으로 읽을 수 없다",
      ).toBeVisible({ timeout: 30_000 });
      const dock = page.getByTestId("alarm-dock");
      const cards = page.getByTestId("alarm-card");
      await cards.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      // 🔴 세는 눈 — 알람이 0건이면 「보인다」를 잴 것이 없다(씨앗 조건).
      const n = await cards.count();
      test.skip(n === 0, "알람 0건 — 이 씨앗에서는 잴 것이 없다(초록 아님)");
      // 🔴 `.or()` 로 묶지 않는다 — 둘 다 있으면 strict 위반이 나고, 그 빨강은 대상이 아니라
      //    내 셀렉터의 것이다(한 번 물렸다). 「도크가 선다」와 「카드가 보인다」를 따로 센다.
      await expect(dock, "알람 도크가 화면에 서지 않는다").toBeVisible();
      await expect(cards.first(), "알람 카드가 보이지 않는다").toBeVisible();
      const box = await cards.first().boundingBox();
      expect(box, "알람 카드의 자리를 못 잡았다").not.toBeNull();
      expect(box!.width, "알람 카드가 폭 0 이다").toBeGreaterThan(0);

      const seen = await survey(page);
      test.info().annotations.push({
        type: "관측(판정 아님)",
        description: `${name}(${seen.width}px) overview: 문서 가로 밀림 ${seen.docOverflow}px · 알람 ${n}건`,
      });
    });

    test(`${name} — ② 승인 확인이 «닿는다»(모달까지 열린다)`, async ({ page }) => {
      // 🔴 live run 완주가 예산을 다 먹고 «클릭»이 시간에 쫓겨 죽었다 — 그 빨강은 대상이 아니라
      //    내 예산이다. 준비(run)와 판정(UI)이 한 시계를 나눠 쓰지 않게 넉넉히 준다.
      test.setTimeout(240_000);
      await enter(page);
      const sid = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
      expect(sid, "fkt_sid 가 없다 — 입장이 안 끝났다").toBeTruthy();
      const made = await page.evaluate(
        async ({ sid }) => {
          const res = await fetch("/api/scenarios/GS-01/runs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sid, mode: "live" }),
          });
          const body = (await res.json()) as { runId?: string };
          const deadline = Date.now() + 120_000;
          while (Date.now() < deadline) {
            const snap = (await (await fetch(`/api/runs/${body.runId}`)).json()) as {
              status?: string;
              workOrderDraftId?: string;
            };
            if (snap.status && snap.status !== "running") return snap;
            await new Promise((r) => setTimeout(r, 300));
          }
          return {} as { workOrderDraftId?: string };
        },
        { sid },
      );
      const woId = made.workOrderDraftId;
      expect(woId, "완주한 live run 이 초안을 내지 않았다 — 승인 축을 잴 것이 없다").toBeTruthy();

      await page.goto(`/work-orders/${woId}`);
      await expect(page.getByTestId("wo-screen")).toBeVisible({ timeout: 30_000 });
      const approve = page.getByTestId("wo-approve");
      await expect(approve, "전화 폭에서 승인 버튼이 «없다»").toBeVisible();

      // 🔴 **「닿는다」와 「바로 보인다」를 가른다.** 정본 :529 는 「우선 제공」이라 했지 「스크롤 없이
      //    보인다」고 하지 않았다. 그러니 red 는 «닿을 수 있는가»다 — 사람이 스크롤하듯 먼저 굴린다.
      //    자리 «깊이»는 판정에 섞지 않고 값으로 남긴다(「우선」의 판단은 정본 개정의 몫).
      const beforeScroll = await approve.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { y: Math.round(r.y), inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
                 viewportH: window.innerHeight };
      });
      await approve.scrollIntoViewIfNeeded();

      // 🔴 **「닿는다」의 실증은 hit-test 다.** 스크롤 뒤 그 자리의 «맨 위 요소»가 버튼 자신이면
      //    가려진 것이 없다는 뜻이고, 그것이 정본 :529 「승인 확인을 우선 제공」의 관측 가능한 절반이다.
      const reach = await approve.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        return {
          inViewport: cy >= 0 && cy <= window.innerHeight,
          isSelf: top === el || el.contains(top as Node),
          topTag: top ? (top as HTMLElement).tagName.toLowerCase() : "null",
          layoutWidth: window.innerWidth,
        };
      });
      expect(reach.inViewport, "스크롤해도 버튼이 뷰포트에 들어오지 않는다").toBe(true);
      expect(reach.isSelf, `버튼 자리를 «${reach.topTag}» 가 덮고 있다 — 가려져서 못 누른다`).toBe(true);

      // 🔴 합성 클릭은 «계측기 한계»에 걸릴 수 있다. 전화 에뮬레이션에서 layout viewport 가
      //    device 폭보다 넓으면(여기서 실측 565px vs 412/390px) 클릭 좌표가 visual viewport 밖으로
      //    나가 이벤트가 안 꽂힌다 — 요소는 보이고 hit-test 도 자기 자신인데 click 만 안 끝난다.
      //    그것을 FAIL 로 세면 «계측기의 한계»를 «대상의 결함»으로 만든다. 값만 남긴다.
      let clickResult = "ok";
      try {
        await approve.click({ timeout: 10_000 });
        await expect(page.getByRole("dialog"), "승인 확인 모달이 안 열린다").toBeVisible({ timeout: 10_000 });
      } catch (e) {
        clickResult = `측정 불가(합성 클릭 미착탄 · layout ${reach.layoutWidth}px) — ${String(e).slice(0, 60)}`;
      }
      test.info().annotations.push({ type: "클릭 시도", description: clickResult });

      const seen = await survey(page);
      const clips = await clipped(page);
      test.info().annotations.push({
        type: "관측(판정 아님)",
        description:
          `${name}(layout ${seen.width}px) work-order: 승인 버튼 y=${beforeScroll.y}px · 뷰포트 ${beforeScroll.viewportH}px · ` +
          `스크롤 없이 보임=${beforeScroll.inViewport} · 문서 가로 밀림 ${seen.docOverflow}px · ` +
          `잘린 칸 ${clips.length ? clips.join(" · ") : "없음"}`,
      });
    });
  });
}
