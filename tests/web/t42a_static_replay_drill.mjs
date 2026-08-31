/**
 * T4-2a «정적 replay 경로» 독립 검증 — 조각 1 (검증 좌석 · 14대).
 *
 * 🔴 자극이 둘이고 **서로 다르다**. 섞으면 「미연결」의 주어를 잃는다:
 *      OFF   = `FKT_API_BASE` 가 **리슨 0 포트** → 연결 «거부»(즉시 실패)
 *      LIVE  = ai-api 가 살아 있고 `online:false` → 도달하지만 합성 게이트웨이 부재
 *    두 셸은 각각 그 값으로 **빌드**된 별개의 프로세스다(목적지는 빌드 값이 정본 · Q-37).
 *
 * 🔴 「제안 0」은 부정 판정식이다 — 세는 눈이 죽어도 0이 나온다. 그래서 **LIVE 에서 0을 세기
 *    전에 OFF 에서 그 눈이 제안을 실제로 찾는지**부터 증명한다(참 울림 선행).
 *
 *   FKT_WEB_OFF=http://127.0.0.1:3181 FKT_WEB_LIVE=http://127.0.0.1:3161 \
 *     node t42a_static_replay_drill.mjs
 *
 * exit: 0 = 축 전건 통과 · 1 = 어긋남 · 2 = 측정 불가(자극 부재·셸 무응답)
 */
import { chromium } from "@playwright/test";

const OFF = process.env.FKT_WEB_OFF ?? "http://127.0.0.1:3181";
const LIVE = process.env.FKT_WEB_LIVE ?? "http://127.0.0.1:3161";
const EXPECT = {
  events: 32,
  steps: 5,
  evidence: 19,
  candidates: 2,
  ttaeMs: 14513,
  incidentId: "INC-2026-014",
};

let failures = 0;
const rows = [];
const ok = (name, pass, detail) => {
  rows.push({ name, pass, detail });
  if (!pass) failures += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const badge = (page) =>
  page.evaluate(() => {
    const b = document.querySelector("[data-testid=mode-badge]");
    return {
      mode: b?.getAttribute("data-mode") ?? null,
      text: (b?.textContent ?? "").replace(/\s+/g, " ").trim(),
      offer: !!document.querySelector("[data-testid=static-replay-offer]"),
    };
  });

/** 배지·제안을 «흐름»으로 본다 — checking 중에 제안이 뜬 적이 «있는가»까지 남긴다. */
async function watchEntry(page, base, watchMs) {
  const t0 = Date.now();
  await page.goto(base + "/", { waitUntil: "commit", timeout: 60000 });
  const trail = [];
  let prev = null;
  let offerWhileChecking = 0;
  while (Date.now() - t0 < watchMs) {
    const s = await badge(page).catch(() => null);
    if (s) {
      if (s.offer && s.mode === "checking") offerWhileChecking += 1;
      const key = `${s.mode}|${s.text}|${s.offer}`;
      if (key !== prev) {
        trail.push({ ms: Date.now() - t0, ...s });
        prev = key;
      }
      if (s.offer) break;
    }
    await page.waitForTimeout(50);
  }
  return { trail, offerWhileChecking, elapsed: Date.now() - t0 };
}

const main = async () => {
  const browser = await chromium.launch();
  const vp = { viewport: { width: 1440, height: 900 } };

  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n① OFF 축 — 자극 = 리슨 0 포트 (셸 ${OFF})`);
  const offCtx = await browser.newContext(vp);
  const off = await offCtx.newPage();

  const apiCalls = [];
  off.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) apiCalls.push(`${r.method()} ${u.pathname}`);
  });

  const entry = await watchEntry(off, OFF, 45000);
  for (const t of entry.trail) {
    console.log(`     ${String(t.ms).padStart(6)} ms  mode=${String(t.mode).padEnd(11)} 제안=${t.offer ? "있음" : "없음"}  ${JSON.stringify(t.text)}`);
  }
  ok("정적 replay 제안이 «뜬다»(자극 = 연결 거부)", entry.trail.some((t) => t.offer),
     `최초 ${entry.trail.find((t) => t.offer)?.ms ?? "-"}ms`);
  if (!entry.trail.some((t) => t.offer)) {
    console.error("🔴 제안이 안 떴다 — 이 자극에서 아래 축을 잴 수 없다(측정 불가)");
    await browser.close();
    process.exit(2);
  }
  ok("🔴 `checking` 중에는 제안 0 (R-3)", entry.offerWhileChecking === 0,
     `checking 중 제안 관측 ${entry.offerWhileChecking}회`);

  // 제안 클릭 → 정적 경로 진입
  await off.getByTestId("static-replay-offer").click();
  await off.waitForURL(/\/incidents\//, { timeout: 30000 });
  const url = new URL(off.url());
  const staticRunId = url.searchParams.get("run");
  ok("앵커 incident 로 간다", decodeURIComponent(url.pathname) === `/incidents/${EXPECT.incidentId}`,
     decodeURIComponent(url.pathname));
  ok("정적 runId 가 url 에 실린다", !!staticRunId, String(staticRunId));

  const con = off.getByTestId("run-console");
  await con.waitFor({ state: "visible", timeout: 30000 });
  await off.waitForFunction(
    () => document.querySelector("[data-testid=run-console]")?.getAttribute("data-status") === "completed",
    null,
    { timeout: 60000 },
  ).catch(() => {});

  const snap = await off.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const cur = document.querySelector("[data-testid=replay-cursor]");
    const ttae = document.querySelector("[data-testid=ttae-row]");
    const mb = document.querySelector("[data-testid=run-mode-badge]");
    return {
      status: document.querySelector("[data-testid=run-console]")?.getAttribute("data-status"),
      applied: cur?.getAttribute("data-applied"),
      total: cur?.getAttribute("data-total"),
      steps: q("[data-testid=run-step]"),
      evidence: q("[data-testid=evidence-card]"),
      candidates: q("[data-testid=candidate]"),
      ttae: ttae?.getAttribute("data-elapsed-ms"),
      runMode: mb?.getAttribute("data-mode"),
      sourceStatic: !!document.querySelector("[data-testid=run-source-static]"),
      woLiveOnly: !!document.querySelector("[data-testid=work-order-draft-live-only]"),
      woLink: !!document.querySelector("[data-testid=work-order-draft]"),
      compareLiveOnly: !!document.querySelector("[data-testid=to-compare-live-only]"),
      bodyChars: (document.body.innerText || "").replace(/\s+/g, "").length,
    };
  });
  console.log(`     스냅샷 ${JSON.stringify(snap)}`);

  ok("완주(status=completed)", snap.status === "completed", String(snap.status));
  ok(`이벤트 ${EXPECT.events}건 전건 적용`, Number(snap.total) === EXPECT.events && Number(snap.applied) === EXPECT.events,
     `${snap.applied}/${snap.total}`);
  ok(`단계 ${EXPECT.steps}`, snap.steps === EXPECT.steps, String(snap.steps));
  ok(`근거 ${EXPECT.evidence}`, snap.evidence === EXPECT.evidence, String(snap.evidence));
  ok(`후보 ${EXPECT.candidates}`, snap.candidates === EXPECT.candidates, String(snap.candidates));
  ok(`TTAE ${EXPECT.ttaeMs}ms`, Number(snap.ttae) === EXPECT.ttaeMs, String(snap.ttae));
  ok("🔴 자신을 LIVE 라 말하지 않는다(run mode = replay)", snap.runMode === "replay", String(snap.runMode));
  ok("출처가 «정적»이라 말한다", snap.sourceStatic === true);
  ok("빈 화면 아님", snap.bodyChars > 200, `${snap.bodyChars}자`);
  ok("WO 링크 = Live 전용 표기(서버 501 동형) · 열리는 링크 0", snap.woLiveOnly && !snap.woLink);
  ok("전략 비교 = Live 전용 표기", snap.compareLiveOnly === true);

  // 되감기 → 새로고침 복원
  await off.getByTestId("replay-back").click();
  await off.getByTestId("replay-back").click();
  const rewound = await off.getByTestId("replay-cursor").getAttribute("data-applied");
  ok("되감기가 커서를 되돌린다", Number(rewound) < EXPECT.events, `${rewound}/${EXPECT.events}`);
  await off.reload();
  await off.getByTestId("replay-cursor").waitFor({ state: "visible", timeout: 30000 });
  const afterReload = await off.getByTestId("replay-cursor").getAttribute("data-applied");
  ok("새로고침해도 같은 브라우저는 그 자리를 기억한다", afterReload === rewound,
     `되감김 ${rewound} → 새로고침 후 ${afterReload}`);

  // 🔴 대조군 — 새 브라우저(다른 storage)는 «백지»여야 한다(격리는 브라우저다)
  const freshCtx = await browser.newContext(vp);
  const fresh = await freshCtx.newPage();
  await fresh.goto(`${OFF}/incidents/${EXPECT.incidentId}?run=${encodeURIComponent(staticRunId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await fresh.getByTestId("replay-cursor").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  const freshCursor = await fresh.getByTestId("replay-cursor").getAttribute("data-applied").catch(() => null);
  ok("🔴 새 브라우저는 남의 되감기 자리를 모른다(storage 격리)", freshCursor !== rewound,
     `이 브라우저 ${freshCursor} ≠ 앞 브라우저 ${rewound}`);
  await freshCtx.close();

  // ② 예고 — 정적 경로가 부른 /api 목록(판정은 조각 2에서)
  const uniq = [...new Set(apiCalls)];
  console.log(`     정적 경로가 부른 /api ${apiCalls.length}건 · 종류 ${uniq.length}: ${uniq.join(" · ")}`);

  await offCtx.close();

  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n④(i) LIVE 대조군 — ai-api 살아 있고 online:false (셸 ${LIVE})`);
  const liveCtx = await browser.newContext(vp);
  const live = await liveCtx.newPage();
  await live.goto(LIVE + "/", { waitUntil: "commit", timeout: 60000 });
  await live.waitForURL(/\/overview$/, { timeout: 60000 }).catch(() => {});
  // 배지가 자리 잡을 시간을 준다(제안이 «늦게» 뜨는 것과 «안» 뜨는 것을 가르기 위해 충분히 본다)
  const liveTrail = [];
  let lp = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const s = await badge(live).catch(() => null);
    if (s) {
      const key = `${s.mode}|${s.text}|${s.offer}`;
      if (key !== lp) {
        liveTrail.push({ ms: Date.now() - t0, ...s });
        lp = key;
      }
    }
    await live.waitForTimeout(100);
  }
  for (const t of liveTrail) {
    console.log(`     ${String(t.ms).padStart(6)} ms  mode=${String(t.mode).padEnd(11)} 제안=${t.offer ? "있음" : "없음"}  ${JSON.stringify(t.text)}`);
  }
  const settled = liveTrail[liveTrail.length - 1];
  ok("도달은 한다 — 배지가 REPLAY 로 선다(online:false)", settled?.mode === "replay", String(settled?.mode));
  ok("🔴 정적 제안 0 — `online:false` 는 트리거가 아니다(R-3)",
     liveTrail.every((t) => !t.offer), `20초 관측 · 제안 관측 ${liveTrail.filter((t) => t.offer).length}회`);
  await liveCtx.close();

  await browser.close();
  console.log(`\n결과: 어긋남 ${failures}건`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error("측정 사고:", e);
  process.exit(2);
});
