/**
 * E-13 — `/documents/[docId]` 화면.
 *
 * 🔴 문서 id 를 **지어내지 않는다** — 인자로 받는다(부르는 쪽이 DB 에서 뽑는다).
 *    없는 id 도 인자로 받되, 「없는 것이 확실한」 모양이어야 한다(호출자 책임 · 값으로 남긴다).
 * 🔴 두 열을 같은 실행에서: **있는 id → 본문이 그려진다** / **없는 id → 「없다」고 말하고 본문 0**.
 *    후자의 «본문 0» 이 판정선이다 — 「404 를 냈다」가 아니라 **지어낸 본문이 0** 인가.
 * 🔴 콘솔 문면은 ASCII.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const REAL = args.get("real"); // DB 에서 뽑은 실재 문서 id
const FAKE = args.get("fake") ?? "DOC-NO-SUCH-000000";
const ENGINE = args.get("engine") ?? "chromium";
if (!BASE || !REAL) {
  console.error("usage: node t76_e13_document.mjs --base URL --real DOC-ID [--fake ID] [--engine chromium]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const pw = createRequire(path.join(here, "/"))("playwright");

const out = { base: BASE, engine: ENGINE, realId: REAL, fakeId: FAKE, columns: {}, consoleErrors: [], pageErrors: [] };
const browser = await pw[ENGINE].launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") out.consoleErrors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => out.pageErrors.push(String(e).slice(0, 160)));

async function openDoc(id) {
  const url = `${BASE}/documents/${encodeURIComponent(id)}`;
  const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const view = page.locator('[data-testid="document-view"]');
  const shown = (await view.count()) > 0;
  const unavailable = page.locator('[data-testid="screen-unavailable"]');
  const unavailableShown = (await unavailable.count()) > 0;
  const bodyText = (await page.locator("main, body").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  return {
    httpStatus: resp ? resp.status() : null,
    documentViewShown: shown,
    /* 「본문」 = 문서 카드 안의 글자 수. 없는 문서에서 이 값이 0 이 아니면 화면이 무언가를 지어낸 것이다. */
    documentViewTextLen: shown ? (await view.innerText()).replace(/\s+/g, " ").trim().length : 0,
    unavailableShown,
    unavailableKind: unavailableShown ? await unavailable.getAttribute("data-kind") : null,
    pageTextLen: bodyText.length,
    mentionsId: bodyText.includes(id),
  };
}

try {
  out.columns.real = await openDoc(REAL);
  out.columns.fake = await openDoc(FAKE);

  /* 근거 화면 → 문서 링크 → 착지(E-05 연결). 근거 id 는 문서 화면이 아니라 «근거 화면»이 준다. */
  const evUrl = args.get("evidence");
  if (evUrl) {
    await page.goto(`${BASE}${evUrl}`, { waitUntil: "domcontentloaded" });
    const link = page.locator('a[href^="/documents/"]').first();
    const has = (await link.count()) > 0;
    out.evidenceLink = { screen: evUrl, linkFound: has };
    if (has) {
      const href = await link.getAttribute("href");
      await link.click({ force: true });
      await page.waitForURL("**/documents/**", { timeout: 30000 });
      out.evidenceLink.href = href;
      out.evidenceLink.landedUrl = page.url().replace(BASE, "");
      out.evidenceLink.documentViewShown = (await page.locator('[data-testid="document-view"]').count()) > 0;
    }
  }

  out.verdict = {
    realRenders: out.columns.real.documentViewShown && out.columns.real.documentViewTextLen > 0,
    fakeSaysMissing: out.columns.fake.unavailableShown && out.columns.fake.unavailableKind === "not-found",
    fakeInventsNothing: out.columns.fake.documentViewShown === false && out.columns.fake.documentViewTextLen === 0,
    linkLands: out.evidenceLink ? out.evidenceLink.documentViewShown === true : null,
  };
} catch (e) {
  out.error = String(e).slice(0, 300);
} finally {
  await browser.close();
}

process.stdout.write(JSON.stringify(out, null, 1) + String.fromCharCode(10));
process.exit(out.error ? 1 : 0);
