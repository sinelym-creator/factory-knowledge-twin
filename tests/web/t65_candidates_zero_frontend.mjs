/**
 * 앞판 단위 케이스 — **계약을 어긴 이벤트가 오면 화면은 무엇을 그리는가.**
 *
 * 배경(센쿠2 회부 · 2026-09-03): 계약은 `runCompleted.candidates: minItems 1` 을 요구하지만
 * 방출 경로는 그것을 검증하지 않는다. 서버 쪽 집행자는 `synthesize_node` 의 `raise` 한 줄뿐이고,
 * 그 줄이 사라지면 **후보 0건짜리 완료 이벤트가 화면까지 갈 수 있다.** 그때 화면이 어떻게
 * 되는지는 아무도 재 본 적이 없다 — 이 드릴이 그 칸이다.
 *
 * 🔴 **서버를 바꾸지 않는다.** `page.routeWebSocket` 으로 **브라우저가 여는 WS 만** 가로채
 *    내가 프레임을 직접 넣는다. 배포도 셸 빌드도 건드리지 않으므로 자극이 «앞판에만» 실린다.
 * 🔴 **세 열을 같은 실행에 둔다** — 손잡이 하나(마지막 프레임)만 다르다:
 *      ① running   : synthesize 가 `step.started` 로 멈춘 채(완료 프레임 없음)
 *      ② zero      : `run.completed` 의 `candidates: []`  ← 계약 위반
 *      ③ one(대조군): `run.completed` 의 `candidates: [1건]` ← 계약 준수
 *    ③이 정상으로 그려져야 ②의 화면이 「계약 위반 때문」이라고 말할 수 있다.
 * 🔴 **판정이 아니라 관측이다.** 화면이 무엇을 그리든 그것이 결함이라고 먼저 부르지 않는다 —
 *    ②와 ③의 차이를 값으로 남기는 것이 이 드릴의 일이다.
 *
 * 사용: node t65_candidates_zero_frontend.mjs --base http://127.0.0.1:3107 --out <json>
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
const RUN_ID = "LEVI2-CONTRACT-PROBE";
const INCIDENT = "INC-2026-014";

const now = () => new Date().toISOString();
let seq = 0;
const ev = (type, payload) => JSON.stringify({ runId: RUN_ID, seq: seq++, ts: now(), mode: "live", type, payload });

const CANDIDATE = {
  rank: 1,
  failureModeId: "FM-BRG-WEAR",
  label: "베어링 마모",
  evidenceIds: ["MR-2025-0087"],
};

/** 마지막 프레임만 다른 세 열 — 앞의 프레임 열은 완전히 같다. */
function frames(kind) {
  seq = 0;
  const head = [
    ev("run.started", { scenarioId: "GS-01", question: "무슨 일이 났는가" }),
    ev("plan.updated", { steps: ["structured", "documents", "graph", "synthesize", "workOrder"] }),
    ev("step.started", { step: "structured" }),
    ev("step.completed", { step: "structured", elapsedMs: 120, evidenceCount: 3 }),
    ev("step.started", { step: "synthesize" }),
  ];
  if (kind === "running") return head;
  if (kind === "zero") return [...head, ev("run.completed", { candidates: [] })];
  return [...head, ev("run.completed", { candidates: [CANDIDATE] })];
}

async function column(kind) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const col = { kind, wsIntercepted: 0, framesSent: 0, consoleErrors: [] };

  page.on("console", (m) => {
    if (m.type() === "error") col.consoleErrors.push(m.text().slice(0, 160));
  });

  // 🔴 WS 를 가로채 서버로 잇지 않는다 — 이 창의 이벤트는 전부 내가 넣은 것이다.
  await page.routeWebSocket(/\/api\/ws\/runs\//, (ws) => {
    col.wsIntercepted += 1;
    for (const f of frames(kind)) {
      ws.send(f);
      col.framesSent += 1;
    }
  });

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
      .click({ timeout: 10_000 })
      .catch(() => {});
    await page.waitForURL(/\/overview/, { timeout: 45_000 }).catch(() => {});
  }

  await page.goto(`${BASE}/incidents/${INCIDENT}?run=${RUN_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  col.screen = await page.evaluate(() => {
    const txt = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160) : null;
    };
    return {
      bodyLen: (document.body.textContent ?? "").replace(/\s+/g, " ").trim().length,
      candidates: document.querySelectorAll('[data-testid="candidate"]').length,
      candidatesBlock: document.querySelectorAll('[data-testid="candidates"]').length,
      timeline: document.querySelectorAll('[data-testid="run-timeline"]').length,
      synthesisBadge: txt('[data-testid="synthesis-badge"]'),
      rejectedReason: txt('[data-testid="synthesis-rejected-reason"]'),
      // 「진행 중」 표시를 문면으로 잡는다 — 셀렉터를 미리 못 박지 않는다
      hasRunningWord: /진행|합성|종합|기다|대기/.test(document.body.textContent ?? ""),
      hasEmptyWord: /후보가 없|없습니다|비어|찾지 못/.test(document.body.textContent ?? ""),
    };
  });

  await ctx.close();
  return col;
}

const browser = await chromium.launch();
const report = { base: BASE, at: now(), runId: RUN_ID, columns: [] };
try {
  for (const kind of ["running", "zero", "one"]) report.columns.push(await column(kind));
} finally {
  await browser.close();
}

const pick = (k) => report.columns.find((c) => c.kind === k);
report.summary = {
  wsIntercepted: report.columns.map((c) => ({ kind: c.kind, ws: c.wsIntercepted, frames: c.framesSent })),
  screens: report.columns.map((c) => ({ kind: c.kind, ...c.screen })),
  consoleErrors: report.columns.map((c) => ({ kind: c.kind, n: c.consoleErrors.length, first: c.consoleErrors[0] ?? null })),
  // 대조군이 정상 후보를 그렸는가 — 이것이 서야 zero 열의 화면이 계약 위반의 결과로 읽힌다
  controlRendersCandidate: (pick("one")?.screen?.candidates ?? 0) > 0,
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

/* 🔴 자극이 안 실렸으면(가로챈 WS 0) 이 열들은 대상에 대해 아무것도 말하지 않는다. */
if (report.columns.some((c) => c.wsIntercepted === 0)) {
  console.error("STIMULUS NOT LANDED — WS 를 한 번도 가로채지 못했다");
  process.exit(2);
}
if (!report.summary.controlRendersCandidate) {
  console.error("CONTROL DID NOT RENDER — 정상 후보도 안 그려졌다(무대 미구비)");
  process.exit(2);
}
process.exit(0);
