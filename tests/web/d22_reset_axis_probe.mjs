/**
 * D-22 ② — 빨강의 «주어»를 대상 거동으로 확인하고, 고쳐 쓸 그물의 검출력까지 같이 잰다.
 *
 * 열 ⓒ(online:true)의 빨강은 `expect(getByRole("status")).not.toContainText(...)` 가
 * **element(s) not found** 로 죽은 것이다. 그 빨강이 말한 것은 「화면이 되돌렸다고 말했다」가
 * 아니라 「내가 전제한 라이브 리전이 이 조건에서는 없다」다 — 두 문장은 다른 사실이다.
 *
 * 그래서 두 가지를 잰다.
 *   ① 취소 뒤 «대상 거동» — `role=status` 개수, «되돌렸습니다» 문자열 개수, 나간 /reset 요청 수.
 *   ② 🔴 **고쳐 쓸 단언의 검출력** — 같은 항아리에서 성공 응답을 모킹해 되돌리기를 «실제로»
 *      수행하면 그 단언이 **1을 세는가**. 0만 세는 그물은 무엇도 못 가른다(계보: 대조군 없는
 *      초록은 아무것도 가르지 못한다).
 */
import { chromium } from "@playwright/test";

const BASES = process.argv.slice(2);
if (!BASES.length) {
  console.error("usage: node d22_reset_axis_probe.mjs <base> [base...]");
  process.exit(2);
}

const REVERTED = "되돌렸습니다";

async function column(base) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const resetCalls = [];
  page.on("request", (r) => {
    if (r.url().includes("/reset")) resetCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  try {
    await page.goto(`${base}/`);
    await page.waitForURL(/\/overview$/, { timeout: 30_000 });

    // 🔴 자극이 실재했는지 먼저 — 배지가 `checking` 을 벗어나야 이 열이 «online 을 받은 열»이다.
    const badge = page.getByTestId("mode-badge");
    await badge.waitFor({ state: "visible", timeout: 15_000 });
    let mode = "checking";
    for (let i = 0; i < 60 && mode === "checking"; i++) {
      mode = (await badge.getAttribute("data-mode")) ?? "checking";
      if (mode === "checking") await page.waitForTimeout(250);
    }

    // ① 취소 경로 — 대상이 실제로 무엇을 했나
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "취소" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
    const afterCancel = {
      dialogs: await page.getByRole("dialog").count(),
      roleStatusCount: await page.getByRole("status").count(),
      revertedTextCount: await page.getByText(REVERTED).count(),
      bodyHasReverted: (await page.locator("body").innerText()).includes(REVERTED),
      resetRequests: [...resetCalls],
    };

    // ② 고쳐 쓸 단언의 검출력 — 같은 화면에서 «진짜로» 되돌리면 1을 세는가(대조군)
    await page.route("**/api/sessions/*/reset", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );
    await page.getByTestId("reset-button").click();
    await page.getByRole("button", { name: "되돌리기" }).click();
    await page.getByText(REVERTED).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const afterConfirm = {
      roleStatusCount: await page.getByRole("status").count(),
      revertedTextCount: await page.getByText(REVERTED).count(),
      resetRequests: [...resetCalls],
    };

    return { base, mode, afterCancel, afterConfirm };
  } finally {
    await ctx.close();
    await browser.close();
  }
}

const out = [];
for (const b of BASES) out.push(await column(b));
console.log(JSON.stringify(out, null, 2));
