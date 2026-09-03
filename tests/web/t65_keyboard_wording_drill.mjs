/**
 * T6-5 축 ② **키보드 완주** · 축 ③ **투어 문면 경계** — 한 실행 두 축(무대가 같다).
 *
 * 정본
 *  - ② `docs/design/t6-5-guided-tour-spec.md` ⑤ 「Tab 순회 · Enter = 다음 · Esc = 종료(포커스 =
 *    `?` 링크로 복귀) · 스텝 열릴 때 포커스 = 콜아웃 제목」 + ⑥ 키보드 행 「Tab/Enter/Esc 만으로
 *    완주 · 포커스 복귀」.
 *  - ③ 같은 문서 ⑤ 「공개 경계(§15.2): 문구에 내부 예외명·헤더명·경로 0 · synthetic 명시」.
 *
 * 🔴 **② 는 마우스를 한 번도 쓰지 않는다.** 「키보드로도 된다」를 재려면 다른 손을 묶어야 한다 —
 *    투어를 여는 것부터 완주까지 `keyboard.press` 만 쓴다(무대 입장은 투어 밖이라 예외로 기록).
 * 🔴 **③ 은 코드가 아니라 «렌더된 문면»에서 센다**(발주 지시). 그리고 같은 실행 안에서 그 문면에
 *    위반 문자열을 **실제로 심어** 같은 수집 경로로 다시 긁는다 — 스캐너가 그 자리에서 빨강을
 *    못 내면 이 축의 초록은 「0 건」이 아니라 「안 봤다」다.
 * 🔴 무대가 안 서면 빨강이 아니라 exit 2.
 *
 * 사용: node t65_keyboard_wording_drill.mjs --base http://127.0.0.1:3107 --out <json>
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3107");
const OUT = arg("out", "");

/* ── 축 ③ 판정선 ─────────────────────────────────────────────────────────────
   정본이 말한 3 범주만 본다. 넓은 축은 엄격함이 아니라 오답이다 — 규격에 없는 낱말까지
   빨강으로 만들면 그 빨강은 정본의 어느 줄에서도 나오지 않는다. */
const BANNED = [
  { kind: "exception", re: /\b[A-Za-z_]*(?:Error|Exception|Traceback|Rejected|Timeout)[A-Za-z_]*\b/g },
  { kind: "header", re: /\b(?:X-[A-Za-z-]+|Authorization|Bearer|Set-Cookie|Cookie|User-Agent|Content-Type)\b/g },
  { kind: "path", re: /(?:https?:\/\/\S+|127\.0\.0\.1|localhost|[A-Za-z]:\\|\/[a-z0-9_-]+\/[a-z0-9_-]+|\b[\w-]+\.(?:py|tsx?|jsx?|json|mjs)\b)/g },
];
const scan = (text) =>
  BANNED.flatMap(({ kind, re }) => [...text.matchAll(re)].map((m) => ({ kind, hit: m[0] })));

const report = { base: BASE, at: new Date().toISOString(), axis2: null, axis3: null };
const stage = { entered: false, invite: false };

const browser = await chromium.launch();

async function enter(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const auto = await page
    .waitForURL(/\/overview/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!auto) {
    await page
      .getByRole("link", { name: /입장하기/ })
      .or(page.getByRole("button", { name: /입장하기/ }))
      .first()
      .click({ timeout: 10_000 });
    await page.waitForURL(/\/overview/, { timeout: 45_000 });
  }
  stage.entered = true;
}

const activeInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      testid: el.getAttribute?.("data-testid") ?? null,
      tag: el.tagName?.toLowerCase() ?? null,
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
    };
  });

/** Tab 만으로 목표 testid 에 포커스를 옮긴다. 못 닿으면 «닿지 못했다»를 그대로 남긴다. */
async function tabTo(page, testid, max = 80) {
  for (let n = 0; n < max; n += 1) {
    const cur = await activeInfo(page);
    if (cur?.testid === testid) return { reached: true, presses: n };
    await page.keyboard.press("Tab");
  }
  const cur = await activeInfo(page);
  return { reached: cur?.testid === testid, presses: max };
}

/** 대상 요소 «안»의 포커스 가능한 자리로 Tab 만으로 들어간다(클릭 스텝용). */
async function tabInto(page, containerTestid, max = 120) {
  for (let n = 0; n < max; n += 1) {
    const inside = await page.evaluate((tid) => {
      const el = document.activeElement;
      return !!el?.closest?.(`[data-testid="${tid}"]`);
    }, containerTestid);
    if (inside) return { reached: true, presses: n };
    await page.keyboard.press("Tab");
  }
  return { reached: false, presses: max };
}

/* ── 축 ② ────────────────────────────────────────────────────────────────── */
async function axis2Keyboard() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const out = { mouseClicks: 0, steps: [], completed: false, finalStored: null, focusReturn: null };

  await enter(page);
  await page.locator('[data-testid="tour-start"]').waitFor({ state: "visible", timeout: 20_000 });
  stage.invite = true;

  // 투어 열기 — 키보드만
  await page.locator("body").press("Tab"); // 문서에 포커스를 들여놓는다(클릭 아님)
  const toStart = await tabTo(page, "tour-start");
  out.openedByKeyboard = toStart;
  if (!toStart.reached) {
    out.blockedAt = "invite";
    await ctx.close();
    return out;
  }
  await page.keyboard.press("Enter");

  for (let i = 0; i < 9; i += 1) {
    const callout = page.locator(`[data-testid="tour-callout"][data-index="${i}"]`);
    const shown = await callout
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const rec = { index: i, shown, url: page.url() };
    if (!shown) {
      rec.blocked = true;
      out.steps.push(rec);
      out.blockedAt = i;
      break;
    }
    rec.stepId = await callout.getAttribute("data-step");
    // 규격 ⑤ — 스텝이 열리면 포커스는 콜아웃 제목
    rec.focusOnOpen = await activeInfo(page);
    rec.focusIsTitle = rec.focusOnOpen?.testid === "tour-title";

    const hasNext = await page.locator('[data-testid="tour-next"]').count();
    const hasGoto = await page.locator('[data-testid="tour-goto"]').count();
    const awaitClick = await page.locator('[data-testid="tour-await-click"]').count();
    rec.control = hasGoto ? "goto" : hasNext ? "next" : awaitClick ? "await-click" : "none";

    if (rec.control === "next") {
      await page.keyboard.press("Enter"); // 규격 ⑤ 「Enter = 다음」
      rec.action = "Enter";
    } else if (rec.control === "goto") {
      const t = await tabTo(page, "tour-goto");
      rec.tab = t;
      if (!t.reached) {
        rec.blocked = true;
        out.steps.push(rec);
        out.blockedAt = i;
        break;
      }
      const urlBefore = page.url();
      await page.keyboard.press("Enter");
      /* 🔴 링크 스텝은 «스텝이 늘었는가»가 아니라 «화면이 갔는가»가 판정이다 — 상태만 늘고
         이동이 안 되면 뒤 스텝은 남의 화면에서 대상을 찾다가 죽는다(그 빨강은 여기서 났다). */
      rec.navigated = await page
        .waitForURL((u) => u.href !== urlBefore, { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      rec.urlAfter = page.url();
      rec.action = `Tab×${t.presses}+Enter`;
    } else if (rec.control === "await-click") {
      // 「직접 클릭」 스텝 — 키보드 사용자는 대상 «안»의 포커스 가능한 자리에서 Enter 를 친다.
      const t = await tabInto(page, "candidate");
      rec.tabInto = t;
      if (!t.reached) {
        rec.blocked = true;
        rec.blockedReason = "대상 안에 포커스 가능한 자리에 닿지 못했다";
        out.steps.push(rec);
        out.blockedAt = i;
        break;
      }
      rec.focusBeforeEnter = await activeInfo(page);
      const urlBefore2 = page.url();
      await page.keyboard.press("Enter");
      /* 🔴 클릭 스텝의 근거 칩은 «누르면 그 근거 화면이 열린다»고 문면이 약속한다 — 키보드로
         누른 Enter 가 그 약속까지 지키는지 같은 자리에서 잰다(마우스 열이 대조군이다). */
      rec.navigated = await page
        .waitForURL((u) => u.href !== urlBefore2, { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      rec.urlAfter = page.url();
      rec.action = `TabInto×${t.presses}+Enter`;
    } else {
      rec.blocked = true;
      rec.blockedReason = "진행 수단이 화면에 없다";
      out.steps.push(rec);
      out.blockedAt = i;
      break;
    }

    // 다음 스텝이 뜨거나(진행) 투어가 닫히거나(완주) 둘 중 하나여야 한다
    const advanced = await page
      .locator(`[data-testid="tour-callout"][data-index="${i + 1}"]`)
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    rec.advanced = advanced;
    out.steps.push(rec);
    if (!advanced && i < 8) {
      out.blockedAt = i;
      break;
    }
  }

  out.finalStored = await page.evaluate(() => window.localStorage.getItem("fkt.tour.v1"));
  out.completed = /"status":"done"/.test(out.finalStored ?? "");
  await ctx.close();
  return out;
}

/* 포커스 복귀 — 규격 ⑤ 「Esc = 종료(포커스 = `?` 링크로 복귀)」 */
async function axis2FocusReturn() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await enter(page);
  await page.locator('[data-testid="tour-start"]').click({ timeout: 20_000 });
  await page.locator('[data-testid="tour-callout"][data-index="0"]').waitFor({ timeout: 15_000 });
  const before = await activeInfo(page);
  await page.keyboard.press("Escape");
  await page
    .locator('[data-testid="tour-callout"]')
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  const after = await activeInfo(page);
  await ctx.close();
  return { focusBeforeEsc: before, focusAfterEsc: after, returnedToHelp: after?.testid === "intro-reopen" };
}

/* ── 축 ③ ────────────────────────────────────────────────────────────────── */
async function axis3Wording() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const out = { surfaces: [], hits: [], control: null };

  await enter(page);
  const invite = page.locator('[data-testid="tour-invite"]');
  await invite.waitFor({ state: "visible", timeout: 20_000 });
  out.surfaces.push({ id: "invite", text: (await invite.innerText()).replace(/\s+/g, " ").trim() });
  await page.locator('[data-testid="tour-start"]').click();

  for (let i = 0; i < 9; i += 1) {
    const callout = page.locator(`[data-testid="tour-callout"][data-index="${i}"]`);
    const shown = await callout
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      out.stoppedAt = i;
      break;
    }
    out.surfaces.push({
      id: `step-${i}`,
      stepId: await callout.getAttribute("data-step"),
      // 🔴 마우스 열의 URL 도 함께 남긴다 — 키보드 열의 「이동 안 됨」이 입력 방식 때문인지
      //    가르는 대조군이 이 한 칸이다(손잡이 하나만 다른 열).
      url: page.url(),
      text: (await callout.innerText()).replace(/\s+/g, " ").trim(),
    });
    const goto = page.locator('[data-testid="tour-goto"]');
    const next = page.locator('[data-testid="tour-next"]');
    if (await goto.count()) await goto.first().click();
    else if (await next.count()) await next.first().click();
    else {
      // 클릭 스텝 — 문면 수집이 목적이므로 대상을 직접 눌러 넘어간다
      const target = page.locator('[data-testid="candidate"]').first();
      const evidenceChip = target.locator("a, button").first();
      if (await evidenceChip.count()) await evidenceChip.click();
      else await target.click();
    }
  }

  for (const s of out.surfaces) {
    for (const h of scan(s.text)) out.hits.push({ surface: s.id, ...h });
  }
  out.syntheticDeclared = out.surfaces.some((s) => /synthetic/i.test(s.text));

  await ctx.close();
  return out;
}

/* 🔴 대조군 — «살아 있는» 투어 콜아웃에 위반 문면을 실제로 심고 같은 수집 경로로 다시 긁는다.
   완주한 화면에는 콜아웃이 없다(그래서 첫 회차에 내 그물이 거기서 죽었다) — 스텝 0 에서 심는다.
   여기서 빨강이 안 나면 위의 「0 건」은 깨끗함이 아니라 안 본 것이다. */
async function axis3Control() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await enter(page);
  await page.locator('[data-testid="tour-start"]').click({ timeout: 20_000 });
  const callout = page.locator('[data-testid="tour-callout"][data-index="0"]');
  await callout.waitFor({ state: "visible", timeout: 15_000 });
  await callout.evaluate((el) => {
    const p = document.createElement("p");
    p.setAttribute("data-testid", "levi2-control-needle");
    p.textContent = "HTTPError · X-FKT-Trace · /api/sessions · services/ai-api/main.py";
    el.appendChild(p);
  });
  const text = (await callout.innerText()).replace(/\s+/g, " ").trim();
  const hits = scan(text);
  await ctx.close();
  return { text: text.slice(-200), hits, discriminates: hits.length > 0 };
}

/* 🔴 한 축이 죽어도 나머지 축의 실측은 남긴다 — 내 그물의 사고로 대상의 값이 함께 사라지면
   그 왕복은 통째로 버린 것이 된다. */
const guarded = async (name, fn) => {
  try {
    return await fn();
  } catch (e) {
    report.errors = report.errors ?? [];
    report.errors.push({ where: name, message: String(e?.message ?? e).slice(0, 300) });
    return null;
  }
};

try {
  const kb = await guarded("axis2", axis2Keyboard);
  if (kb) kb.focusReturn = await guarded("axis2-focus-return", axis2FocusReturn);
  report.axis2 = kb;
  const wording = await guarded("axis3", axis3Wording);
  if (wording) wording.control = await guarded("axis3-control", axis3Control);
  report.axis3 = wording;
} finally {
  await browser.close();
}

report.stage = stage;
report.summary = {
  axis2: {
    completed: report.axis2?.completed,
    blockedAt: report.axis2?.blockedAt ?? null,
    focusIsTitleAll: (report.axis2?.steps ?? []).every((s) => s.focusIsTitle !== false),
    focusReturnedToHelp: report.axis2?.focusReturn?.returnedToHelp,
    focusAfterEsc: report.axis2?.focusReturn?.focusAfterEsc,
  },
  axis3: {
    surfaces: report.axis3?.surfaces?.length ?? 0,
    violations: report.axis3?.hits ?? [],
    syntheticDeclared: report.axis3?.syntheticDeclared,
    controlDiscriminates: report.axis3?.control?.discriminates,
    controlHits: report.axis3?.control?.hits?.map((h) => h.hit) ?? [],
  },
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

if (!stage.entered || !stage.invite) {
  console.error("STAGE MISSING", JSON.stringify(stage));
  process.exit(2);
}
if (!report.axis3?.control?.discriminates) {
  console.error("WORDING SCANNER DID NOT DISCRIMINATE — 판정력 없음");
  process.exit(2);
}
const ok =
  report.summary.axis2.completed &&
  report.summary.axis2.focusReturnedToHelp &&
  report.summary.axis3.violations.length === 0 &&
  report.summary.axis3.syntheticDeclared;
process.exit(ok ? 0 : 1);
