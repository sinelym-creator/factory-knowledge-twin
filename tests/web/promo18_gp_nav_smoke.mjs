/**
 * 승격 18 ③ — 골든 «경로» 스모크: 입장 → 사고 → 근거. **조사를 시작하지 않는다(cap 0).**
 *
 * 🔴 기존 `d75_public_gp_probe.mjs` 는 시작 버튼을 눌러 **live 조사를 태운다** — cap 0 발주에서는 쓰면 안 된다.
 *    이 그물은 «읽기 경로»만 밟는다: 링크를 따라가고, 화면이 그려졌는지와 콘솔 실오류만 센다.
 * 🔴 사고·근거 id 를 지어내지 않는다 — 화면이 준 링크를 따라간다.
 * 🔴 콘솔 문면은 ASCII.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const ENGINE = args.get("engine") ?? "chromium";
/* 🔴 근거는 «run 안»에 산다 — cap 0 이라 live 를 못 태우므로 정적 재생 run 을 인자로 받는다.
   이 값을 파일에 박지 않는다(무대가 늙는다). 없으면 근거 축은 «못 잼»으로 남는다. */
const RUN = args.get("run") ?? null;
const INCIDENT = args.get("incident") ?? null;
if (!BASE) {
  console.error("usage: node promo18_gp_nav_smoke.mjs --base https://... [--engine chromium]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const pw = createRequire(path.join(here, "/"))("playwright");

const out = { base: BASE, engine: ENGINE, steps: [], consoleErrors: [], pageErrors: [], startClicked: false };
const browser = await pw[ENGINE].launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") out.consoleErrors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => out.pageErrors.push(String(e).slice(0, 160)));
/* 🔴 조사 시작 요청이 나가면 «즉시 실패»로 남긴다 — cap 0 을 그물이 스스로 지킨다. */
page.on("request", (r) => {
  if (r.method() === "POST" && /\/api\/(scenarios\/[^/]+\/runs|runs)$/.test(new URL(r.url()).pathname)) {
    out.startClicked = true;
  }
});

try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="enter-button"]', { timeout: 30000 });
  try {
    await page.locator('[data-testid="enter-button"]').click({ timeout: 8000, force: true });
  } catch {
    await page.evaluate(() => document.querySelector('[data-testid="entry-form"]')?.requestSubmit());
  }
  await page.waitForURL("**/overview", { timeout: 60000 });
  out.steps.push({ step: "enter", url: page.url().replace(BASE, ""), ok: true });

  await page.goto(`${BASE}/incidents`, { waitUntil: "domcontentloaded" });
  const incLink = INCIDENT
    ? page.locator(`a[href^="/incidents/${INCIDENT}"]`).first()
    : page.locator('a[href^="/incidents/"]').first();
  let incCount = await incLink.count();
  out.steps.push({ step: "incidents-list", links: incCount, incidentArg: INCIDENT, ok: incCount > 0 });
  if (incCount === 0 && !INCIDENT) throw new Error("no incident links offered by the screen");
  const incHref = incCount > 0 ? await incLink.getAttribute("href") : `/incidents/${INCIDENT}`;
  if (incCount > 0) await incLink.click({ force: true });
  else await page.goto(`${BASE}${incHref}${RUN ? `?run=${encodeURIComponent(RUN)}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/incidents/**", { timeout: 30000 });
  if (RUN && !page.url().includes("run=")) {
    await page.goto(`${page.url().split("?")[0]}?run=${encodeURIComponent(RUN)}`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  out.steps.push({ step: "incident", href: incHref, url: page.url().replace(BASE, ""), ok: true });

  const evLink = page.locator('a[href^="/evidence/"]').first();
  const evCount = await evLink.count();
  out.steps.push({ step: "evidence-link", links: evCount, ok: evCount > 0 });
  if (evCount > 0) {
    const evHref = await evLink.getAttribute("href");
    await evLink.click({ force: true });
    await page.waitForURL("**/evidence/**", { timeout: 30000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    out.steps.push({
      step: "evidence",
      href: evHref,
      url: page.url().replace(BASE, ""),
      trustHeader: (await page.locator('[data-testid="trust-header"]').count()) > 0,
      ok: true,
    });
  }
  out.verdict = {
    allSteps: out.steps.every((s) => s.ok),
    consoleErrors: out.consoleErrors.length,
    pageErrors: out.pageErrors.length,
    noInvestigationStarted: out.startClicked === false,
  };
} catch (e) {
  out.error = String(e).slice(0, 300);
} finally {
  await browser.close();
}

process.stdout.write(JSON.stringify(out, null, 1) + String.fromCharCode(10));
process.exit(out.error ? 1 : 0);
