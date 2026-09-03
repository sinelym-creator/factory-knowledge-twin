/**
 * T7-20 축③ — 화면별 «주요 동작이 실제로 되는가» 훑기(`/compare` · `/documents` · `/work-orders`).
 *
 * 🔴 **누르고 나서 «무엇이 달라졌는가»를 본다.** 손잡이가 있다는 것과 눌린다는 것과 값이
 *    바뀐다는 것은 서로 다른 주장이다(렌더 확인은 셋 중 아무것도 증명하지 않는다).
 * 🔴 **클릭 직후에 읽지 않는다** — 리렌더 전 값을 대상의 답으로 적으면 「변화 없음」이 가짜로 난다.
 * 🔴 못 밟은 칸은 **「안 잼」** 으로 남긴다(0 아님).
 *
 * 사용: node t720_screen_sweep.mjs --base http://127.0.0.1:8799 --out ../../evidence/t720-screen-sweep.json
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:8799");
const OUT = arg("out", "");

const rows = [];
const put = (o) => {
  rows.push({ i: rows.length + 1, ...o });
  const mark = o.verdict === "PASS" ? "✓" : o.verdict === "FAIL" ? "✗" : "·";
  console.log(`${mark} ${String(rows.length).padStart(2)} [${o.screen}] ${o.action}\n     기대: ${o.expected}\n     관측: ${o.observed}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));

const cnt = (s) => page.locator(s).count();
const inner = async (s) => {
  const l = page.locator(s).first();
  return (await l.count()) ? ((await l.innerText()) ?? "").replace(/\s+/g, " ").trim() : null;
};

/* 세션을 만든다(사람과 같은 순서). */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

/* ══════════ /compare ══════════ */
await page.goto(BASE + "/compare", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
/* 🔴 손잡이는 실측한 것만 쓴다 — `compare-strategy` 는 «결과 열»이 아니라 **전략 선택 체크박스**이고,
   질문은 `<select data-testid="compare-question">`, 실행은 `compare-run` 버튼이다.
   앞 회차에 나는 이것을 결과 열로 읽어 「distinct 본문 1」이라는 가짜 관측을 냈다. */
const stratBoxes = await cnt('input[data-testid="compare-strategy"]');
const qSelect = await cnt('select[data-testid="compare-question"]');
const runBtn = await cnt('[data-testid="compare-run"]');
put({
  screen: "/compare",
  action: "손잡이(질문 선택 · 전략 3 · 실행)가 실제로 있는지 센다",
  expected: "질문 select 1 · 전략 체크박스 3 · 실행 버튼 1 · 각주 1",
  observed: `질문select=${qSelect} · 전략박스=${stratBoxes} · 실행=${runBtn} · 각주=${await cnt('[data-testid="compare-footnote"]')}`,
  verdict: qSelect === 1 && stratBoxes === 3 && runBtn === 1 ? "PASS" : "FAIL",
});

const beforeRun = await inner('[data-testid="compare-panel"]');
let runObs = "실행 손잡이가 없어 못 밟음";
let runVerdict = "안 잼";
if (runBtn) {
  await page.locator('[data-testid="compare-run"]').click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(6000); // 🔴 클릭 직후에 읽지 않는다
  const afterRun = await inner('[data-testid="compare-panel"]');
  const cmpRun = await cnt('[data-testid="compare-run"]');
  runObs = `본문 길이 ${beforeRun?.length ?? 0} → ${afterRun?.length ?? 0} · 바뀜=${afterRun !== beforeRun} · 실행버튼 여전=${cmpRun}`;
  runVerdict = afterRun !== beforeRun ? "PASS" : "FAIL";
}
put({
  screen: "/compare",
  action: "「실행」을 눌러 세 전략 비교가 실제로 그려지는지 본다",
  expected: "누르면 결과가 생겨 화면 본문이 달라진다",
  observed: runObs,
  verdict: runVerdict,
});

let qObs = "질문 select 가 없어 못 밟음";
let qVerdict = "안 잼";
if (qSelect) {
  const sel = page.locator('select[data-testid="compare-question"]');
  const opts = await sel.locator("option").count();
  if (opts >= 2) {
    const cur = await inner('[data-testid="compare-panel"]');
    await sel.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="compare-run"]').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const now = await inner('[data-testid="compare-panel"]');
    qObs = `선택지=${opts} · 본문 바뀜=${now !== cur}`;
    qVerdict = now !== cur ? "PASS" : "FAIL";
  } else {
    qObs = `선택지가 ${opts} 개뿐 — 바꿔 볼 것이 없다`;
  }
}
put({
  screen: "/compare",
  action: "다른 질문을 골라 다시 실행하면 결과가 바뀌는지 본다",
  expected: "고른 질문에 맞는 다른 결과가 그려진다",
  observed: qObs,
  verdict: qVerdict,
});

/* ══════════ /documents ══════════ */
/* 🔴 주소를 지어내지 않는다 — 근거 화면에서 «문서로 가는 링크»를 따라간다(사람의 길). */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
await page.getByTestId("start-from-alarm").first().click().catch(() => {});
await page.waitForTimeout(4000);
const chip = page.locator('[data-testid="candidate"] a[href^="/evidence/"]');
let docReached = false;
let docObs = "근거 칩이 없어 못 밟음";
if (await chip.count()) {
  /* 문서 인용 근거를 고른다 — `DOC-` 로 시작하는 것이 문서 축이다. */
  const hrefs = await chip.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const docHref = hrefs.find((h) => /\/evidence\/DOC-/.test(h ?? "")) ?? hrefs[0];
  await page.goto(BASE + docHref, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const toDoc = page.locator('a[href^="/documents/"]').first();
  if (await toDoc.count()) {
    await toDoc.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    docReached = /\/documents\//.test(page.url());
    const hl = await cnt("mark, [data-testid='highlight'], [data-highlight]");
    const badge = await cnt('[data-testid="index-badge"]');
    docObs = `이동=${docReached} · url=${page.url()} · 인용강조=${hl} · 색인배지=${badge}`;
  } else {
    docObs = `근거 화면(${docHref})에 문서로 가는 링크가 없다`;
  }
}
put({
  screen: "/documents",
  action: "근거 화면에서 «문서 원문»으로 따라가 인용 강조를 본다",
  expected: "문서 화면이 열리고 인용 구간이 강조된다 · 색인 배지가 선다",
  observed: docObs,
  verdict: docReached ? (/인용강조=[1-9]/.test(docObs) ? "PASS" : "부분") : "안 잼",
});

/* ══════════ /work-orders ══════════ */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
await page.getByTestId("start-from-alarm").first().click().catch(() => {});
await page.waitForTimeout(5000);
const woLink = page.locator('a[href^="/work-orders/"]').first();
if (await woLink.count()) {
  await woLink.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const onWo = /\/work-orders\//.test(page.url());
  const woUrl = page.url();

  /* ① 편집이 «남는가» — 제목을 바꾸고 새로고침해 대조한다. */
  /* 🔴 `wo-title` 은 `type` 속성이 «없다» — `input[type="text"]` 로는 안 잡힌다(앞 회차 내 오독). */
  const title = page.locator('[data-testid="wo-title"]').first();
  let editObs = "제목 입력칸이 없어 못 밟음";
  let editVerdict = "안 잼";
  if (onWo && (await title.count())) {
    const before = await title.inputValue();
    const stamp = ` ·검증${Date.now() % 10000}`;
    await title.fill(before + stamp);
    await page.waitForTimeout(2500); // 디바운스 PATCH 를 기다린다
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const after = await page.locator('[data-testid="wo-title"]').first().inputValue();
    editObs = `전=${JSON.stringify(before.slice(0, 40))} · 새로고침 뒤=${JSON.stringify(after.slice(0, 60))} · 남음=${after.includes(stamp.trim())}`;
    editVerdict = after.includes(stamp.trim()) ? "PASS" : "FAIL";
    /* 되돌린다 — 남의 자리를 흔든 채 나가지 않는다. */
    await page.locator('[data-testid="wo-title"]').first().fill(before);
    await page.waitForTimeout(2000);
  }
  put({
    screen: "/work-orders",
    action: "제목을 고치고 «새로고침 뒤에도 남는지» 본다(디바운스 저장)",
    expected: "고친 값이 서버까지 가서 새로고침 뒤에도 남는다",
    observed: editObs,
    verdict: editVerdict,
  });

  /* ② 잠긴 칸 — 절차·안전은 편집 손잡이가 «없어야» 한다. */
  const body = (await page.locator("body").innerText()) ?? "";
  const hasProc = /절차|procedure/i.test(body);
  const hasSafety = /안전|safety/i.test(body);
  const editableInProc = await page.evaluate(() => {
    const sec = Array.from(document.querySelectorAll("section, div")).find((e) =>
      /절차|안전/.test((e.querySelector("h2, h3")?.textContent ?? "")),
    );
    if (!sec) return -1;
    return sec.querySelectorAll("input, textarea, [contenteditable='true']").length;
  });
  put({
    screen: "/work-orders",
    action: "절차·안전 구역에 편집 손잡이가 있는지 센다(잠금 규율)",
    expected: "절차·안전은 편집 칸 0 — 사람이 지울 수 없다",
    observed: `절차문면=${hasProc} · 안전문면=${hasSafety} · 그 구역 편집칸=${editableInProc === -1 ? "구역 못 찾음" : editableInProc}`,
    verdict: editableInProc === 0 ? "PASS" : editableInProc === -1 ? "안 잼" : "FAIL",
  });

  /* ③ 반려 — 사유가 비면 확인이 «안 눌려야» 한다. */
  const rejectBtn = page.locator('[data-testid="wo-reject"], button:has-text("반려")').first();
  let rejObs = "반려 손잡이가 없어 못 밟음";
  let rejVerdict = "안 잼";
  if (await rejectBtn.count()) {
    await rejectBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const dlg = await cnt('[role="dialog"]');
    if (dlg) {
      const confirm = page.locator('[role="dialog"] button').filter({ hasText: /반려|확인/ }).last();
      const disabledEmpty = await confirm.isDisabled().catch(() => null);
      const ta = page.locator('[role="dialog"] textarea, [role="dialog"] input[type="text"]').first();
      let disabledFilled = null;
      if (await ta.count()) {
        await ta.fill("검증 사유(자동)");
        await page.waitForTimeout(600);
        disabledFilled = await confirm.isDisabled().catch(() => null);
      }
      rejObs = `모달=${dlg} · 사유 빈칸일 때 확인 비활성=${disabledEmpty} · 사유 넣은 뒤 비활성=${disabledFilled}`;
      rejVerdict = disabledEmpty === true && disabledFilled === false ? "PASS" : "부분";
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
    } else {
      rejObs = "반려를 눌렀는데 확인 모달이 안 섰다";
      rejVerdict = "FAIL";
    }
  }
  put({
    screen: "/work-orders",
    action: "반려 → 사유가 비면 확인이 잠기는지, 채우면 풀리는지 본다",
    expected: "빈 사유 = 확인 비활성 · 사유 있음 = 활성(화면 규칙)",
    observed: rejObs,
    verdict: rejVerdict,
  });

  put({ screen: "/work-orders", action: "화면 주소", expected: "—", observed: `WO=${woUrl}`, verdict: "참고" });
} else {
  put({ screen: "/work-orders", action: "WO 화면 열기", expected: "—", observed: "조사 화면에 WO 링크가 없어 못 밟음", verdict: "안 잼" });
}

put({
  screen: "전체",
  action: "이 훑기 동안 런타임 오류를 모은다",
  expected: "0",
  observed: `오류=${errs.length}${errs.length ? " · 예: " + JSON.stringify(errs.slice(0, 3)) : ""}`,
  verdict: errs.length === 0 ? "PASS" : "FAIL",
});

const tally = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
console.log("\n=== 집계 ===", JSON.stringify(tally));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), tally, rows, errs }, null, 2));
await browser.close();
