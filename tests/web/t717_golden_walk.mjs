/**
 * T7-17 축②③ — **골든 시나리오(GS-01) 완주 + 화면별 기능 훑기**.
 *
 * 🔴 이 그물은 **사람처럼 «화면에 보이는 손잡이»로만** 걷는다 — 대상 좌표·딥링크를 미리 넣고
 *    들어가지 않는다(D-37: 좌표를 넣고 들어간 초록은 화면의 초록이 아니다). 예외는 «주소로만
 *    갈 수 있는 화면»이고, 그 칸은 `via:"url"` 로 표시한다.
 *
 * 🔴 걸음마다 남기는 것 = **① 어디서 ② 무엇을 했나 ③ 무엇이 일어나야 하나 ④ 무엇이 일어났나.**
 *    ④ 가 없으면 수리 발주를 못 쓴다. 그래서 실패해도 «관측»을 반드시 채운다.
 *
 * 🔴 **못 한 걸음은 「안 잼」**으로 남긴다 — 0 이 아니다. 앞 걸음이 막히면 뒤 걸음은
 *    「실패」가 아니라 **「앞이 막혀 못 밟음」**이다(연쇄 빨강을 결함 수로 세지 않는다).
 *
 * 사용: node t717_golden_walk.mjs --base http://127.0.0.1:8799 --out ../../evidence/t717-golden-walk.json
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:8799");
const OUT = arg("out", "");
const SHOT = arg("shot", "");
/* 🔴 **대기 배수** — 기본 1 이라 기존 회차의 거동은 그대로다. 공개면처럼 «대상의 시계»가 느린
   무대에서 이 그물의 창이 대상보다 짧으면, 아직 안 그려진 화면을 「없다」로 읽는다
   (39대 실측: 공개 URL 에서 알람/설비가 4018ms 에 섰는데 1200ms 에 재서 0 으로 읽었다).
   창을 늘리는 것은 판정선을 무르게 하는 게 아니라 **자극이 끝나기를 기다리는 것**이다. */
const SETTLE = Number(arg("settle", 1));

const steps = [];
let blocked = false;

const record = async (page, o) => {
  const row = { i: steps.length + 1, ...o, at: new Date().toISOString(), url: page ? page.url() : null };
  steps.push(row);
  const mark = row.verdict === "PASS" ? "✓" : row.verdict === "FAIL" ? "✗" : "·";
  console.log(
    `${mark} ${String(row.i).padStart(2)} [${row.screen}] ${row.action}\n     기대: ${row.expected}\n     관측: ${row.observed}`,
  );
  if (SHOT && page) await page.screenshot({ path: path.join(SHOT, `gs-${String(row.i).padStart(2, "0")}.png`) }).catch(() => {});
  return row;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e.message).slice(0, 200)));

const txt = async (sel) => {
  const l = page.locator(sel).first();
  return (await l.count()) ? ((await l.textContent()) ?? "").trim().replace(/\s+/g, " ").slice(0, 120) : null;
};
const cnt = (sel) => page.locator(sel).count();

/* ── 1. 진입 ─────────────────────────────────────────────── */
await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200 * SETTLE);
const badge = await txt('[data-testid="mode-badge"]');
await record(page, {
  screen: "진입",
  action: "브라우저로 /overview 를 연다(쿠키 없음)",
  expected: "세션 가드가 세션을 만들고 개요 화면이 선다 · 모드 배지가 뜬다",
  observed: `랜딩=${page.url()} · 모드배지=${JSON.stringify(badge)}`,
  verdict: badge ? "PASS" : "FAIL",
});

/* ── 2. 개요 화면의 값 ────────────────────────────────────── */
const alarmCards = await cnt('[data-testid="alarm-card"]');
const equipCards = await cnt('[data-testid="equipment-card"]');
const spark = await cnt("svg");
await record(page, {
  screen: "개요",
  action: "알람·설비 카드와 스파크라인이 실제 값으로 서는지 센다",
  expected: "알람 카드 ≥1 · 설비 카드 ≥1 · 그래프 ≥1(빈 화면이 아니다)",
  observed: `알람=${alarmCards} · 설비=${equipCards} · svg=${spark} · 알람문면=${JSON.stringify(await txt('[data-testid="alarm-card"]'))}`,
  verdict: alarmCards >= 1 && equipCards >= 1 ? "PASS" : "FAIL",
});

/* ── 3. 조사 시작 ─────────────────────────────────────────── */
const startBtn = page.getByTestId("start-from-alarm").first();
const startVisible = (await startBtn.count()) > 0;
let clickedStart = "안 눌러 봄";
if (startVisible) {
  clickedStart = await startBtn
    .click({ timeout: 8000 * SETTLE })
    .then(() => "클릭 성공")
    .catch((e) => "클릭 실패: " + String(e.message).split("\n")[0]);
  await page.waitForTimeout(2500 * SETTLE);
}
const movedToRun = /\/incidents\//.test(page.url());
await record(page, {
  screen: "개요 → 조사",
  action: "「조사 시작」(start-from-alarm)을 누른다",
  expected: "조사 화면(/incidents/…)으로 이동한다",
  observed: `버튼 존재=${startVisible} · ${clickedStart} · 이동=${movedToRun}`,
  verdict: movedToRun ? "PASS" : "FAIL",
});
if (!movedToRun) blocked = true;

/* ── 4. 조사 실행 — 5단계 완주 ────────────────────────────── */
if (blocked) {
  await record(page, { screen: "조사", action: "5단계 완주 관측", expected: "—", observed: "앞 걸음이 막혀 못 밟음", verdict: "안 잼" });
} else {
  /* 🔴 손잡이는 «화면에서 실측한 것»만 쓴다 — 앞 회차에 내가 지어낸 이름(`run-stage`·`data-run-status`)은
     화면에 없어서 「완주 못 함」이라는 가짜 관측을 만들었다. 실측 표지: `run-status` · `run-step`(5) ·
     `data-steps-done`/`data-steps-total` · `run-progress`. */
  const readRun = () =>
    page.evaluate(() => {
      const st = document.querySelector('[data-testid="run-status"]');
      const pr = document.querySelector('[data-testid="run-progress"]');
      const steps = Array.from(document.querySelectorAll('[data-testid="run-step"]'));
      const attrs = {};
      if (pr) for (const a of pr.attributes) if (a.name.startsWith("data-")) attrs[a.name] = a.value;
      if (st) for (const a of st.attributes) if (a.name.startsWith("data-")) attrs["status:" + a.name] = a.value;
      return {
        statusText: st ? (st.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60) : null,
        attrs,
        stepCount: steps.length,
        stepStates: steps.map((e) => e.getAttribute("data-state")),
      };
    });
  const deadline = Date.now() + 90_000;
  let r = await readRun();
  let done = false;
  while (Date.now() < deadline) {
    r = await readRun();
    const doneN = Number(r.attrs["data-steps-done"] ?? -1);
    const totN = Number(r.attrs["data-steps-total"] ?? -1);
    if ((doneN >= 0 && totN > 0 && doneN >= totN) || /완료|completed/i.test(r.statusText ?? "")) {
      done = true;
      break;
    }
    await page.waitForTimeout(1200 * SETTLE);
  }
  const timeline = await cnt('[data-testid="run-timeline"]');
  await record(page, {
    screen: "조사",
    action: "조사가 스스로 도는 것을 최대 90초까지 지켜본다",
    expected: "5단계 타임라인이 서고 조사가 «완주»한다(steps-done = steps-total)",
    observed: `타임라인=${timeline} · run-step=${r.stepCount} · 단계상태=${JSON.stringify(r.stepStates)} · 상태문면=${JSON.stringify(r.statusText)} · ${JSON.stringify(r.attrs)} · 완주=${done}`,
    verdict: done ? "PASS" : timeline > 0 ? "부분" : "FAIL",
  });

  /* ── 5. 후보와 근거 ID ─────────────────────────────────── */
  const cands = await cnt('[data-testid="candidate"]');
  const evChips = await cnt('[data-testid="candidate"] a[href^="/evidence/"]');
  await record(page, {
    screen: "조사·후보",
    action: "원인 후보와 «근거 ID 칩»을 센다",
    expected: "후보 ≥1 · 후보마다 근거 링크가 붙는다",
    observed: `후보=${cands} · 근거칩=${evChips} · 첫 후보=${JSON.stringify(await txt('[data-testid="candidate"]'))}`,
    verdict: cands >= 1 && evChips >= 1 ? "PASS" : "FAIL",
  });

  /* ── 6. 근거 열람 ──────────────────────────────────────── */
  if (evChips >= 1) {
    const chip = page.locator('[data-testid="candidate"] a[href^="/evidence/"]').first();
    const href = await chip.getAttribute("href");
    const c = await chip.click({ timeout: 8000 * SETTLE }).then(() => "클릭 성공").catch((e) => "클릭 실패: " + String(e.message).split("\n")[0]);
    await page.waitForTimeout(2000 * SETTLE);
    const onEvidence = /\/evidence\//.test(page.url());
    const trust = await cnt('[data-testid="trust-header"]');
    await record(page, {
      screen: "근거",
      action: `후보의 근거 칩(${href})을 누른다`,
      expected: "근거 화면이 열리고 출처·시각·신선도(trust-header)가 선다",
      observed: `${c} · 근거화면=${onEvidence} · trust-header=${trust} · 문면=${JSON.stringify(await txt('[data-testid="trust-header"]'))}`,
      verdict: onEvidence && trust >= 1 ? "PASS" : "FAIL",
    });
  } else {
    await record(page, { screen: "근거", action: "근거 칩 클릭", expected: "—", observed: "근거 칩이 0개라 못 밟음", verdict: "안 잼" });
  }
}

/* ── 7. 작업지시서 ────────────────────────────────────────── */
await page.goBack().catch(() => {});
await page.waitForTimeout(1500 * SETTLE);
const woLink = page.locator('a[href^="/work-orders/"]').first();
const woExists = (await woLink.count()) > 0;
if (woExists) {
  const c = await woLink.click({ timeout: 8000 * SETTLE }).then(() => "클릭 성공").catch((e) => "클릭 실패: " + String(e.message).split("\n")[0]);
  await page.waitForTimeout(2500 * SETTLE);
  const onWo = /\/work-orders\//.test(page.url());
  const fields = await cnt("input, textarea");
  const approveBtn = await cnt('[data-testid="wo-approve"], button:has-text("승인")');
  await record(page, {
    screen: "작업지시서",
    action: "조사 화면에서 작업지시서 링크를 눌러 연다",
    expected: "작업지시서가 열리고 편집 칸과 승인 손잡이가 있다",
    observed: `${c} · WO화면=${onWo} · 입력칸=${fields} · 승인버튼=${approveBtn}`,
    verdict: onWo && approveBtn >= 1 ? "PASS" : onWo ? "부분" : "FAIL",
  });

  /* ── 8. 승인 ─────────────────────────────────────────── */
  if (approveBtn >= 1) {
    const ab = page.locator('[data-testid="wo-approve"], button:has-text("승인")').first();
    const c2 = await ab.click({ timeout: 8000 * SETTLE }).then(() => "클릭 성공").catch((e) => "클릭 실패: " + String(e.message).split("\n")[0]);
    await page.waitForTimeout(1200 * SETTLE);
    const dialog = await cnt('[role="dialog"]');
    let confirmed = "확인 안 누름";
    if (dialog > 0) {
      confirmed = await page
        .locator('[role="dialog"] button')
        .filter({ hasText: /승인|확인/ })
        .first()
        .click({ timeout: 6000 * SETTLE })
        .then(() => "확인 클릭 성공")
        .catch((e) => "확인 클릭 실패: " + String(e.message).split("\n")[0]);
      await page.waitForTimeout(2500 * SETTLE);
    }
    const body = (await page.locator("body").textContent()) ?? "";
    const approved = /승인됨|approved/i.test(body);
    const audit = /audit|감사/i.test(body);
    await record(page, {
      screen: "승인",
      action: "승인 버튼 → 확인 모달에서 승인한다(사람 승인 경계)",
      expected: "확인 모달이 서고, 승인하면 상태가 «승인됨»이 되며 감사 흔적이 남는다",
      observed: `${c2} · 모달=${dialog} · ${confirmed} · 승인표시=${approved} · 감사문면=${audit}`,
      verdict: dialog > 0 && approved ? "PASS" : dialog > 0 ? "부분" : "FAIL",
    });
  } else {
    await record(page, { screen: "승인", action: "승인", expected: "—", observed: "승인 손잡이가 0개라 못 밟음", verdict: "안 잼" });
  }
} else {
  await record(page, { screen: "작업지시서", action: "WO 링크 클릭", expected: "—", observed: "화면에 WO 링크가 없어 못 밟음", verdict: "안 잼" });
  await record(page, { screen: "승인", action: "승인", expected: "—", observed: "앞 걸음이 막혀 못 밟음", verdict: "안 잼" });
}

/* ── 9. 전략 비교(/compare) — 주소로만 가는 화면 ──────────── */
await page.goto(BASE + "/compare", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000 * SETTLE);
const cols = await cnt('[data-testid="compare-strategy"]');
const foot = await cnt('[data-testid="compare-footnote"]');
const q = await cnt('[data-testid="compare-question"]');
const bodyC = (await page.locator("body").textContent()) ?? "";
await record(page, {
  screen: "비교",
  via: "url",
  action: "/compare 를 연다(전략 3종 비교)",
  expected: "세 전략의 열이 서고 각주가 붙는다",
  observed: `compare-strategy=${cols} · 각주=${foot} · 질문패널=${q} · 본문길이=${bodyC.length}`,
  verdict: cols >= 3 && foot >= 1 ? "PASS" : cols > 0 ? "부분" : "FAIL",
});

/* ── 10. 런타임 오류 총계 ─────────────────────────────────── */
await record(page, {
  screen: "전체",
  action: "이 동선 동안 브라우저 콘솔 오류를 모은다",
  expected: "런타임 오류 0",
  observed: `콘솔오류=${consoleErrors.length}${consoleErrors.length ? " · 예: " + JSON.stringify(consoleErrors.slice(0, 3)) : ""}`,
  verdict: consoleErrors.length === 0 ? "PASS" : "FAIL",
});

const tally = steps.reduce((a, s) => ((a[s.verdict] = (a[s.verdict] ?? 0) + 1), a), {});
console.log("\n=== 집계 ===", JSON.stringify(tally));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), tally, steps, consoleErrors }, null, 2));
await browser.close();
