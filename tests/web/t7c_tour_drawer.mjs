/**
 * ⓒ 투어 «중» 드로어 — 390 에서 튜토리얼 진행 중 ☰ 를 열면 무엇이 일어나는가.
 *
 * 🔴 판정선은 하나뿐이다: **「겹쳐서 조작 불가」(말풍선 버튼도 드로어 링크도 «둘 다» 못 누름) = 결함.**
 *    그 외(열리지 않음 · 한쪽만 눌림)는 **관측**이고, 어느 쪽이 설계인지는 코드 실물로 병기한다.
 * 🔴 «닿는다 ≠ 눌린다» — `elementFromPoint` 는 덮개 유무까지만 말한다. **실제로 눌러** 반응을 잰다.
 *    두 축을 따로 찍고, 어긋나면 그 어긋남 자체가 값이다.
 * 🔴 걸음 표는 정본(`tour-steps.ts`)에서 읽는다 — 「1·5·6」도 인자로 받는다(그물에 안 박는다).
 * 🔴 콘솔 문면은 ASCII.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const BASE = args.get("base");
const CANON = args.get("canon");
const OUT = args.get("out");
const STEPS_AT = (args.get("steps") ?? "1,5,6").split(",").map(Number);
const ENGINES = (args.get("engines") ?? "chromium,firefox,webkit").split(",");
const SETTLE = Number(args.get("settle") ?? 1200);
const W = Number(args.get("w") ?? 390);
const H = Number(args.get("h") ?? 844);
if (!BASE || !CANON || !OUT) {
  console.error("usage: node t7c_tour_drawer.mjs --base URL --canon PATH --out o.json [--steps 1,5,6] [--engines a,b]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const pw = createRequire(path.join(here, "/"))("playwright");

function readCanon(file) {
  const src = fs.readFileSync(file, "utf8");
  const body = src.slice(src.indexOf("[", src.indexOf("TOUR_STEPS")));
  return body
    .split(/\n  \{/)
    .slice(1)
    .map((c) => {
      const id = /\n?\s*id:\s*"([^"]+)"/.exec(c);
      if (!id) return null;
      const adv = /\n\s*advance:\s*("next"|\{[^}]*\})/.exec(c);
      const a = adv ? adv[1] : "";
      return {
        id: id[1],
        kind: a === '"next"' ? "next" : /\bto:/.test(a) ? "link" : /\bon:/.test(a) ? "await" : null,
        of: /of:\s*"([^"]*)"/.exec(a)?.[1] ?? null,
      };
    })
    .filter(Boolean);
}
const CANON_STEPS = readCanon(CANON);

const TOGGLE = '[data-testid="nav-menu-toggle"]';
const DRAWER = '[data-testid="nav-drawer"]';
const CALLOUT = '[data-testid="tour-callout"]';
const NEXT = '[data-testid="tour-next"]';

async function enter(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="enter-button"]', { timeout: 30000 });
  try {
    await page.locator('[data-testid="enter-button"]').click({ timeout: 8000, force: true });
  } catch {
    await page.evaluate(() => document.querySelector('[data-testid="entry-form"]')?.requestSubmit());
  }
  await page.waitForURL("**/overview", { timeout: 60000 });
}

/** 화면의 수단만 써서 n 번째 걸음까지 간다(상태 주입 금지). */
async function advanceTo(page, n) {
  await page.waitForSelector('[data-testid="tour-invite"]', { timeout: 30000 });
  await page.locator('[data-testid="tour-start"]').click({ timeout: 15000, force: true });
  for (let i = 0; i < n - 1; i += 1) {
    const s = CANON_STEPS[i];
    await page.waitForSelector(CALLOUT, { timeout: 30000 });
    await page.waitForTimeout(SETTLE);
    if (s.kind === "next") await page.locator(NEXT).click({ timeout: 15000, force: true });
    else if (s.kind === "link") {
      const u = page.url();
      await page.locator('[data-testid="tour-goto"]').click({ timeout: 15000, force: true });
      await page.waitForFunction((x) => location.href !== x, u, { timeout: 30000 });
    } else if (s.kind === "await") {
      const inner = page.locator(`[data-testid="${s.of}"] a`).first();
      const useInner = (await inner.count()) > 0;
      const u = page.url();
      await (useInner ? inner : page.locator(`[data-testid="${s.of}"]`).first()).click({ timeout: 15000, force: true });
      if (useInner) await page.waitForFunction((x) => location.href !== x, u, { timeout: 30000 }).catch(() => {});
    }
  }
  await page.waitForSelector(CALLOUT, { timeout: 30000 });
  await page.waitForTimeout(SETTLE);
}

/** 좌표 주인 + 실제 클릭 반응을 «따로» 잰다. */
async function probe(page, sel) {
  const loc = page.locator(sel).first();
  if ((await loc.count()) === 0) return { present: false };
  const owner = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { zeroBox: true };
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      zeroBox: false,
      ownsPoint: !!top && (top === el || el.contains(top)),
      topTestid: top ? top.getAttribute("data-testid") : null,
      topTag: top ? top.tagName : null,
      inInert: !!el.closest("[inert]"),
    };
  }, sel);
  return { present: true, ...owner };
}

const out = { base: BASE, w: W, h: H, settleMs: SETTLE, canonSteps: CANON_STEPS.map((s) => s.id), cells: [] };

for (const eng of ENGINES) {
  for (const n of STEPS_AT) {
    const cell = { engine: eng, stepNo: n, stepId: CANON_STEPS[n - 1]?.id ?? null, consoleErrors: [], pageErrors: [] };
    const browser = await pw[eng].launch();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on("console", (m) => {
      if (m.type() === "error") cell.consoleErrors.push(m.text().slice(0, 140));
    });
    page.on("pageerror", (e) => cell.pageErrors.push(String(e).slice(0, 140)));
    try {
      await enter(page);
      await advanceTo(page, n);
      cell.titleBefore = (await page.locator('[data-testid="tour-title"]').innerText().catch(() => "")).trim();
      cell.urlBefore = page.url().replace(BASE, "");

      // ⓐ ☰ 이 있는가 · 투어의 inert 배경 «안»인가 · 눌러서 열리는가
      cell.toggle = await probe(page, TOGGLE);
      await page.locator(TOGGLE).click({ timeout: 8000, force: true }).catch((e) => {
        cell.toggleClickError = String(e).slice(0, 80);
      });
      await page.waitForTimeout(600);
      cell.drawerOpened = (await page.locator(DRAWER).count()) > 0;

      if (cell.drawerOpened) {
        // ⓑ z 순서 — 좌표 주인 + «실제로 눌리는가» 를 따로
        cell.zOrder = await page.evaluate(() => {
          const z = (s) => {
            const el = document.querySelector(s);
            if (!el) return null;
            const layer = el.closest('[data-testid="nav-drawer-layer"]') ?? el;
            return { zIndex: getComputedStyle(layer).zIndex, tag: el.tagName };
          };
          return { callout: z('[data-testid="tour-callout"]'), drawer: z('[data-testid="nav-drawer"]'), scrim: z('[data-testid="nav-drawer-scrim"]') };
        });
        cell.calloutNext = await probe(page, NEXT);
        cell.drawerLink = await probe(page, `${DRAWER} a`);

        // 🔴 실제 클릭 — 좌표 주인과 «따로» 잰다. 반응 = 제목 바뀜 또는 URL 이동.
        const t0 = cell.titleBefore;
        const u0 = page.url();
        cell.nextClick = { tried: false };
        if (cell.calloutNext.present) {
          cell.nextClick.tried = true;
          const err = await page
            .locator(NEXT)
            .click({ timeout: 4000 })
            .then(() => null)
            .catch((e) => String(e).slice(0, 60));
          await page.waitForTimeout(500);
          const t1 = (await page.locator('[data-testid="tour-title"]').innerText().catch(() => "")).trim();
          cell.nextClick.blocked = err !== null;
          cell.nextClick.err = err;
          cell.nextClick.advanced = t1 !== t0;
        }
        // 드로어 링크는 «누르면 이동»이므로 마지막에 ⓓ 로 쓴다.
        cell.linkClick = { tried: false };
        if (cell.drawerLink.present) {
          cell.linkClick.tried = true;
          const href = await page.locator(`${DRAWER} a`).first().getAttribute("href");
          cell.linkClick.href = href;
          const err = await page
            .locator(`${DRAWER} a`)
            .first()
            .click({ timeout: 4000 })
            .then(() => null)
            .catch((e) => String(e).slice(0, 60));
          cell.linkClick.blocked = err !== null;
          await page.waitForTimeout(900);
          cell.linkClick.navigated = page.url() !== u0;
          cell.linkClick.urlAfter = page.url().replace(BASE, "");
          // ⓓ 이동 뒤 투어는 어떻게 되나
          cell.afterNav = {
            calloutPresent: (await page.locator(CALLOUT).count()) > 0,
            title: (await page.locator('[data-testid="tour-title"]').innerText().catch(() => "")).trim(),
            reopenBadge: await page.locator('[data-testid="intro-reopen"]').first().isVisible().catch(() => false),
            inertResidue: await page.evaluate(() => document.querySelectorAll("[inert]").length),
          };
        }
      } else {
        // ⓒ 안 열렸으면 투어가 그대로인지 · inert 잔여는 몇인지
        cell.afterBlocked = {
          calloutPresent: (await page.locator(CALLOUT).count()) > 0,
          title: (await page.locator('[data-testid="tour-title"]').innerText().catch(() => "")).trim(),
          sameStep: (await page.locator('[data-testid="tour-title"]').innerText().catch(() => "")).trim() === cell.titleBefore,
          inertCount: await page.evaluate(() => document.querySelectorAll("[inert]").length),
          focusTestid: await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null),
        };
      }

      // 🔴 판정: «둘 다 못 누름» 만 결함
      const nextOperable = cell.nextClick ? cell.nextClick.blocked === false && cell.nextClick.advanced === true : null;
      const linkOperable = cell.linkClick ? cell.linkClick.blocked === false && cell.linkClick.navigated === true : null;
      cell.verdict = {
        drawerOpened: cell.drawerOpened,
        nextOperable,
        linkOperable,
        bothStuck: cell.drawerOpened === true && nextOperable === false && linkOperable === false,
      };
    } catch (e) {
      cell.error = String(e).slice(0, 250);
    }
    await browser.close();
    out.cells.push(cell);
  }
}

out.summary = out.cells.map((c) => ({
  engine: c.engine,
  step: `${c.stepNo}:${c.stepId}`,
  toggleInInert: c.toggle?.inInert ?? null,
  drawerOpened: c.drawerOpened ?? null,
  nextOperable: c.verdict?.nextOperable ?? null,
  linkOperable: c.verdict?.linkOperable ?? null,
  BOTH_STUCK: c.verdict?.bothStuck ?? null,
  consoleErrors: c.consoleErrors.length,
  error: c.error ?? null,
}));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
process.stdout.write(JSON.stringify(out.summary, null, 1) + String.fromCharCode(10));
process.exit(out.cells.some((c) => c.verdict?.bothStuck) ? 1 : 0);
