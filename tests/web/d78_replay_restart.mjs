/**
 * D-78 검증 — 완주 run 에서 `replay-play` 를 누르면 되감고 재생하는가.
 *
 * 🔴 **두 열을 같은 실행에서** 돈다: 대상(처방 착지) · 대조군(처방 «전»).
 * 🔴 **클릭 셀렉터에 `data-at-end` 를 넣지 않는다** — 그 속성은 처방이 «만든» 것이라,
 *    셀렉터에 넣으면 대조군에서 요소를 못 찾고 그건 「결함 재현」이 아니라 «자극 미투입»이다.
 *    속성은 **읽기만** 한다.
 * 🔴 **완주 재도달 창 = total × 주기**(착지본 `run-console.tsx:342` = 220ms 실독). 곱셈은 창을
 *    잡는 데만 쓰고 Actual 은 실측값을 적는다.
 *
 * usage: node d78_replay_restart.mjs --target http://127.0.0.1:8365 --control http://127.0.0.1:8366 --out o.json
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("out");
const PERIOD = Number(arg("period", "220"));
const STATIC = "/incidents/INC-2026-014?run=STATIC-GS-01";
if (!OUT) { console.error("--out 은 필수다"); process.exit(9); }

const dismiss = async (p) => {
  for (const s of ['[data-testid="tour-skip"]', '[data-testid="tour-later"]', '[aria-label="안내 닫기"]']) {
    const l = p.locator(s);
    if (await l.count()) { await l.first().click().catch(() => {}); await p.waitForTimeout(300); }
  }
};
const readCur = async (p) => {
  const c = p.locator('[data-testid="replay-cursor"]');
  if (!(await c.count())) return { applied: null, total: null };
  return {
    applied: Number(await c.first().getAttribute("data-applied")),
    total: Number(await c.first().getAttribute("data-total")),
  };
};
const readPlay = async (p) => {
  const b = p.locator('[data-testid="replay-play"]');
  if (!(await b.count())) return { present: false, atEnd: null, label: null };
  return {
    present: true,
    atEnd: await b.first().getAttribute("data-at-end"),
    label: (await b.first().innerText()).replace(/\s+/g, " ").trim(),
  };
};
/** applied 가 want 에 닿을 때까지 - 폴링 간격은 주기보다 촘촘히(전이를 한 점으로 놓치지 않는다) */
const waitApplied = async (p, pred, budgetMs) => {
  const t0 = Date.now();
  const trail = [];
  while (Date.now() - t0 < budgetMs) {
    const c = await readCur(p);
    trail.push({ ms: Date.now() - t0, applied: c.applied });
    if (pred(c.applied)) return { hit: true, ms: Date.now() - t0, applied: c.applied, trail };
    await p.waitForTimeout(40);
  }
  const c = await readCur(p);
  return { hit: false, ms: Date.now() - t0, applied: c.applied, trail };
};

const column = async (browser, base, name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const col = { base, name };
  await p.goto(base + STATIC, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  await dismiss(p);

  col.stage = { ...(await readCur(p)), ...(await readPlay(p)),
                staticSrc: await p.locator('[data-testid="run-source-static"]').count(),
                mode: (await p.locator('[data-testid="run-mode-badge"]').count())
                  ? await p.locator('[data-testid="run-mode-badge"]').first().getAttribute("data-mode") : null };
  // 🔴 무대가 «완주» 가 아니면 이 회차는 판정이 아니라 exit 2 다.
  if (!(col.stage.total > 0 && col.stage.applied === col.stage.total)) {
    col.stageRang = false;
    await ctx.close();
    return col;
  }
  col.stageRang = true;
  const total = col.stage.total;
  const budgetToOne = 5000;
  const budgetToEnd = total * PERIOD + 6000;   // 창 = total x 주기 + 여유
  col.window = { period: PERIOD, total, budgetToOne, budgetToEnd };

  // ── 축 ① 자극: 끝 상태에서 실클릭 (셀렉터는 testid 만) ──────────────────
  const t0 = Date.now();
  await p.locator('[data-testid="replay-play"]').first().click();
  col.axis1 = {};
  col.axis1.toOne = await waitApplied(p, (a) => a !== null && a >= 1 && a < total, budgetToOne);
  col.axis1.clickToFirstMs = col.axis1.toOne.ms;
  // 되감김 자체(=끝에서 내려왔는가)를 따로 적는다 — 「1 이 되었다」와 다르다
  col.axis1.rewound = col.axis1.toOne.trail.some((x) => x.applied !== null && x.applied < total);
  // ── 축 ② 중간 상태의 라벨/속성 ─────────────────────────────────────────
  col.axis2 = { mid: await readPlay(p) };
  // ── 축 ④ running 중 클릭 = 일시정지 ────────────────────────────────────
  const beforePause = (await readCur(p)).applied;
  await p.locator('[data-testid="replay-play"]').first().click();
  await p.waitForTimeout(PERIOD * 3);
  const afterPause = (await readCur(p)).applied;
  col.axis4 = { beforePause, afterPause, frozen: beforePause === afterPause,
                labelWhenPaused: (await readPlay(p)).label };
  // 재개
  await p.locator('[data-testid="replay-play"]').first().click();
  // ── 축 ① 완주 재도달 ───────────────────────────────────────────────────
  col.axis1.toEnd = await waitApplied(p, (a) => a === total, budgetToEnd);
  col.axis1.endLabel = await readPlay(p);
  col.axis1.totalElapsedMs = Date.now() - t0;
  await ctx.close();
  return col;
};

const browser = await chromium.launch();
const out = { wall: new Date().toISOString(), period: PERIOD, columns: {} };
// 🔴 자극 열을 먼저 — 대조군을 먼저 돌리면 공유 자원을 쥐어 초록을 만들 수 있다.
out.columns.target = await column(browser, arg("target"), "target(fix landed)");
out.columns.control = await column(browser, arg("control"), "control(pre-fix)");
await browser.close();

const T = out.columns.target, C = out.columns.control;
out.verdict = {
  bothStagesRang: T.stageRang && C.stageRang,
  target_rewound: T.stageRang ? T.axis1.rewound : null,
  target_reachedOne: T.stageRang ? T.axis1.toOne.hit : null,
  target_clickToFirstMs: T.stageRang ? T.axis1.clickToFirstMs : null,
  target_reachedEnd: T.stageRang ? T.axis1.toEnd.hit : null,
  target_endMs: T.stageRang ? T.axis1.toEnd.ms : null,
  control_rewound: C.stageRang ? C.axis1.rewound : null,
  control_appliedUnchanged: C.stageRang ? C.axis1.toOne.applied === C.stage.total : null,
  atEnd_target: T.stageRang ? T.stage.atEnd : null,
  atEnd_control: C.stageRang ? C.stage.atEnd : null,
  label_end_target: T.stageRang ? T.stage.label : null,
  label_end_control: C.stageRang ? C.stage.label : null,
  label_mid_target: T.stageRang ? T.axis2.mid.label : null,
  pauseFroze_target: T.stageRang ? T.axis4.frozen : null,
  pauseFroze_control: C.stageRang ? C.axis4.frozen : null,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.verdict, null, 1));
process.exit(out.verdict.bothStagesRang ? 0 : 2);
