/**
 * t34_run_failure_drill — 조사가 «실패»했을 때 화면이 그렇게 말하는가 (검증 좌석 · T3-4).
 *
 *   cd tests/web && node t34_run_failure_drill.mjs
 *
 * 🔴 **왜 따로 서 있나.** 이 축은 의존을 실제로 끊어야 재현된다(쓴다 · 되돌린다). spec 안에
 *    두면 전체 실행이 남의 축까지 흔든다. `tests/api` 의 「쓰는 자산 4종」과 같은 자리 —
 *    기본 꺼짐이 아니라 «단독 실행»이고, 자기 스택(FKT_NEO4J_CONTAINER)만 겨눈다.
 *
 * 🔴 **무엇을 가르나.** 서버 `run.failed` 는 계약 스키마 정본의 종단 이벤트다
 *    (`agent-events-v0.1.schema.json` · 사유까지 담아 나간다). 화면이 그 이벤트를 모르면
 *    조사가 끝났는데도 「조사중」으로 남는다 — 화면이 «모르는 것을 아는 척»하는 것의 반대편,
 *    «끝난 것을 안 끝났다»고 말하는 자리다(baseline §0.2 는 두 방향 다 금한다).
 *
 * exit: 0 = 화면이 실패를 말한다 · 1 = 어긋남 · 2 = 측정 불가(실패를 못 만들었다)
 */
import { execFileSync } from "node:child_process";

import { chromium } from "@playwright/test";

const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101";
const CONTAINER = process.env.FKT_NEO4J_CONTAINER ?? "fkt-levi2-neo4j-1";
const docker = (...args) => {
  try {
    execFileSync("docker", args, { stdio: "ignore" });
  } catch {
    /* 되돌리기는 실패해도 계속 알린다 — 아래 finally 가 상태를 찍는다 */
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const row = (id, what, ok, note) => rows.push([id, what, ok, note]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: WEB });
const page = await ctx.newPage();
let unmeasurable = null;

await page.goto("/");
await page.waitForURL(/\/overview$/);
const sid = (await ctx.cookies()).find((c) => c.name === "fkt_sid")?.value;
if (!sid) {
  console.error("측정 불가 — 입장이 끝나지 않았다(fkt_sid 없음)");
  await browser.close();
  process.exit(2);
}

const health = () => page.evaluate(async () => (await (await fetch("/api/health")).json()));

docker("stop", CONTAINER);
try {
  for (let i = 0; i < 30; i += 1) {
    await sleep(1000);
    if ((await health()).dependencies?.neo4j?.state !== "ok") break;
  }
  const made = await page.evaluate(async (s) => {
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s, mode: "live" }),
    });
    return { status: r.status, body: await r.json() };
  }, sid);

  let snap = null;
  if (made.status === 200) {
    for (let i = 0; i < 120; i += 1) {
      await sleep(1000);
      snap = await page.evaluate(async (id) => (await (await fetch(`/api/runs/${id}`)).json()), made.body.runId);
      if (snap.status !== "running") break;
    }
  }
  if (snap?.status !== "failed") {
    unmeasurable = `실패한 조사를 만들지 못했다(생성 ${made.status} · 결말 ${snap?.status}) — 이 축은 못 쟀다`;
  } else {
    await page.goto(`/incidents/${made.body.incidentId}?run=${made.body.runId}`);
    await page.waitForTimeout(6000);
    const status = await page.getByTestId("run-console").getAttribute("data-status");
    const label = ((await page.getByTestId("run-status").textContent()) ?? "").trim();
    const spinning = await page.locator('[data-testid="run-step"][data-state="running"]').count();
    row("X-1", "🔴 서버가 failed 인 조사를 화면도 «끝난 것»으로 말한다", status !== "running", `화면 ${status}`);
    row("X-2", "🔴 상태 낱말이 «조사중»이 아니다", label !== "조사중", `«${label}»`);
    row("X-3", "끝난 조사에 «도는 단계»가 남아 있지 않다", spinning === 0, `${spinning}개`);

    // 🔴 «끝났다»만으로는 반쪽이다 — 서버는 «왜»까지 보냈다. 그 사유가 화면에 없으면
    //    운영자는 「멈췄다」는 것만 알고 무엇이 멈췄는지는 다시 서버에 물어야 한다.
    const notice = page.getByTestId("run-failed");
    const shown = (await notice.count()) > 0;
    const text = shown ? ((await notice.textContent()) ?? "").trim() : "";
    const code = shown ? await notice.getAttribute("data-code") : null;
    row("X-4", "🔴 서버가 «말한» 실패 사유가 화면에 있다", shown && Boolean(code), `code=${code} · «${text.slice(0, 60)}»`);
    // 🔴 대조군 — 중단된 조사의 경과값이 «완주 값»처럼 읽히지 않는다(라벨이 성격을 밝힌다).
    const ttae = ((await page.getByTestId("ttae-row").textContent()) ?? "").trim();
    row("X-5", "대조군 — 경과값에 «중단 시점» 라벨이 붙는다", /중단 시점/.test(ttae), `«${ttae.slice(0, 70)}»`);

    row("X-0", "대조군 — 그래도 화면은 서 있다(빈 화면 0)", await page.getByTestId("run-console").isVisible(), "console 보임");
  }
} finally {
  docker("start", CONTAINER);
  let back = "unknown";
  for (let i = 0; i < 60; i += 1) {
    await sleep(2000);
    back = (await health().catch(() => ({}))).dependencies?.neo4j?.state ?? "unknown";
    if (back === "ok") break;
  }
  console.log(`되감기    : ${CONTAINER} 재기동 · neo4j = ${back}\n`);
  await browser.close();
}

let bad = 0;
for (const [id, what, ok, note] of rows) {
  bad += ok ? 0 : 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id} ${what.padEnd(52)} ${note}`);
}
if (unmeasurable) {
  console.error(`\n측정 불가 — ${unmeasurable}`);
  process.exit(2);
}
console.log(`\n결과: 어긋남 ${bad}건`);
process.exit(bad ? 1 : 0);
