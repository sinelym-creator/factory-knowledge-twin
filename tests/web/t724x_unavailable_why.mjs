/**
 * T7-24 2차 · **X-25** — 「데이터에 못 닿은 화면이 방문자에게 **사람 말**로 사유를 말하는가」.
 * 정본 `docs/plan/test-plan-v1.md` X-25. 리바이2 42대(#588 `describeWhy` · D-51 수리 독립 검증).
 *
 * 🔴 **두 독자를 따로 센다.** 방문자는 «문장»을, 계측기는 «원문»(`data-why`)을 읽는다.
 *    그래서 판정선은 둘 다다 — 문장이 사람 말로 바뀌었고, **원문 값은 한 글자도 안 바뀌었다**.
 *    (`unavailable.tsx` 머리말: 드릴·관측 축이 그 문자열을 센다.)
 *
 * 🔴 **안내 화면은 서버 컴포넌트가 그린다** — 브라우저 `route.abort()` 로는 못 만든다.
 *    자극은 **셸의 상류**에 넣는다(`_x25_upstream_stage.mjs`). 자극이 첫 검사 층에서 죽지 않게.
 *
 * 🔴 **사유마다 경로가 다르다**(`lib/contract.ts:799·803·817`) — 소켓 끊김 → `TypeError`,
 *    상태 코드 → `HTTP nnn`. 하나의 자극으로 여러 사유를 만들 수 없으므로 모드를 갈아 끼운다.
 *
 * 🔴 **자극 증인은 무대의 «수»다.** 열마다 무대 계수 델타를 먼저 찍고, 0 이면 그 열은
 *    빨강도 초록도 아닌 `안 잼` 이다 — 안내 화면이 안 뜬 이유가 「대상이 잘 버텨서」인지
 *    「내가 자극을 안 준 것」인지 화면만 봐서는 못 가른다.
 *
 * 🔴 **정상 열이 대조군이다.** 정상에서 안내 화면이 «안» 떠야 이 그물이 무엇을 가르는지 성립한다.
 *    (정상에서도 뜬다면 내가 재는 것은 사유가 아니라 「이 셸은 늘 못 닿는다」다.)
 *
 *   node t724x_unavailable_why.mjs --shell=http://127.0.0.1:8106 --stage=http://127.0.0.1:8812
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8106");
const STAGE = arg("stage", "http://127.0.0.1:8812");
const PATHS = arg("paths", "/overview").split(",");
/* 🔴 **반쪽 스텁** — 자극은 «판정하려는 그 호출»에만 넣는다. 상류를 통째로 끊으면 관문
   (`/api/sessions`)까지 죽어 셸이 화면을 그리기 전에 `/` 로 되돌린다(42대 실측: 307).
   그러면 재는 것이 안내 화면이 아니라 관문이 된다 — 자극이 첫 검사 층에서 죽는 자리다.
   기본값은 overview 의 데이터 호출(`/api/plants…`)이고, 관문·나머지는 그대로 흐른다. */
const ONLY = arg("only", "^/api/plants");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stageStats = () => fetch(STAGE + "/__stage/stats").then((r) => r.json()).catch((e) => ({ err: String(e.message).slice(0, 60) }));
const setMode = (q) => fetch(STAGE + "/__stage/" + q + (q === "normal" ? "" : (q.includes("?") ? "&" : "?") + "only=" + encodeURIComponent(ONLY))).then((r) => r.json()).catch((e) => ({ err: String(e.message).slice(0, 60) }));

/* 화면에서 «두 독자»를 함께 읽는다. 손잡이는 `data-testid` — 문면 리터럴을 셀렉터로 쓰지 않는다.
   🔴 `data-kind` 와 testid 는 **불변이어야 하는 축**이다: 수리가 표시만 바꿨다는 증거라서
      판정값 옆에 함께 찍는다(안 변해야 하는 것이 감시자다). */
const READ = () => {
  const box = document.querySelector('[data-testid="screen-unavailable"]');
  if (!box) {
    const main = document.querySelector("main");
    return {
      unavailable: false,
      mainTextLen: main ? (main.textContent ?? "").replace(/\s+/g, " ").trim().length : 0,
      h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
    };
  }
  const whyEl = box.querySelector("[data-why]");
  const reasonLine = Array.from(box.querySelectorAll("p"))
    .map((p) => (p.textContent ?? "").replace(/\s+/g, " ").trim())
    .find((t) => t.startsWith("사유:"));
  return {
    unavailable: true,
    kind: box.getAttribute("data-kind"),
    /** 🔴 계측기가 읽는 원문. `null` = 이 빌드에 `data-why` 자체가 없다(수리 전). */
    dataWhy: whyEl ? whyEl.getAttribute("data-why") : null,
    /** 🔴 방문자가 읽는 문장. 「사유: 」 뒤만 떼어 낸다. */
    reasonText: reasonLine ? reasonLine.replace(/^사유:\s*/, "") : null,
    heading: box.querySelector("h1,p")?.textContent?.trim().slice(0, 40) ?? null,
  };
};

/** 기계 낱말인가 — 사람 말이 아니라 `e.name`·`HTTP nnn` 이 그대로 노출된 형태. */
const isMachineWord = (t) => t !== null && /^([A-Za-z]+Error|unknown|HTTP \d{3}|미구현\(501\))$/.test(t);

async function column({ label, mode, path: p }) {
  await setMode(mode);
  const before = await stageStats();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  /* 🔴 캐시를 우회한다 — 같은 URL 을 다시 부르면 앞 열의 답이 이 열의 «관측»이 된다. */
  const url = SHELL + p + "?x25=" + Date.now();
  let navErr = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  } catch (e) {
    navErr = String(e.message).split("\n")[0].slice(0, 80);
  }
  await sleep(1500);
  const seen = await page.evaluate(READ).catch((e) => ({ evalErr: String(e.message).slice(0, 60) }));
  const after = await stageStats();
  await browser.close();
  const delta = {
    passed: (after.passed ?? 0) - (before.passed ?? 0),
    refused: (after.refused ?? 0) - (before.refused ?? 0),
    statused: (after.statused ?? 0) - (before.statused ?? 0),
    upstreamErr: (after.upstreamErr ?? 0) - (before.upstreamErr ?? 0),
  };
  return { label, mode, path: p, navErr, seen, delta };
}

const rows = [];
for (const p of PATHS) {
  rows.push(await column({ label: "정상(대조군)", mode: "normal", path: p }));
  rows.push(await column({ label: "소켓 끊김", mode: "refuse", path: p }));
  rows.push(await column({ label: "HTTP 503", mode: "status?code=503", path: p }));
  rows.push(await column({ label: "HTTP 501", mode: "status?code=501", path: p }));
}
await setMode("normal"); // 무대를 되돌린다 — 되감기는 전수다.

console.log(`\n=============== X-25 · 못 닿은 화면이 사유를 사람 말로 하는가 · shell=${SHELL} ===============\n`);
for (const r of rows) {
  const s = r.seen ?? {};
  console.log(`--- ${r.label} (${r.path}) ---`);
  console.log(
    `🔴 무대 증인 델타: 통과 ${r.delta.passed} · 끊음 ${r.delta.refused} · 상태부여 ${r.delta.statused} · 상류오류 ${r.delta.upstreamErr}`,
  );
  if (r.navErr) console.log(`탐색 오류: ${r.navErr}`);
  if (!s.unavailable) {
    console.log(`안내 화면 = **안 뜸** · 본문 글자수 ${s.mainTextLen ?? "?"} · h1 ${s.h1 ?? "(없음)"}`);
  } else {
    console.log(`안내 화면 = **뜸** · data-kind=${s.kind} · 제목 ${s.heading}`);
    console.log(`  · 방문자가 읽는 문장 = 「${s.reasonText}」`);
    console.log(`  · 계측기가 읽는 원문 data-why = ${s.dataWhy === null ? "**없음(수리 전 빌드)**" : `「${s.dataWhy}」`}`);
    console.log(`  · 문장이 기계 낱말인가 = ${isMachineWord(s.reasonText) ? "🔴 예" : "아니오"}`);
  }
  console.log("");
}

/* ── 판정 ─────────────────────────────────────────────────────────────────── */
const ctrl = rows.find((r) => r.mode === "normal");
const refused = rows.find((r) => r.mode === "refuse");
const s503 = rows.find((r) => r.mode === "status?code=503");
const s501 = rows.find((r) => r.mode === "status?code=501");

console.log("=============== 판정 ===============");
const notes = [];
let stageOk = true;
if ((refused?.delta.refused ?? 0) <= 0) {
  console.log("🔴 무대 미가동 — 「소켓 끊김」 열에서 끊은 수가 0. 자극을 안 준 것이다(exit 2).");
  stageOk = false;
}
if ((s503?.delta.statused ?? 0) <= 0) {
  console.log("🔴 무대 미가동 — 「HTTP 503」 열에서 상태 부여 수가 0(exit 2).");
  stageOk = false;
}
if (!stageOk) process.exit(2);

const ctrlClean = ctrl && !ctrl.seen.unavailable;
console.log(`대조군 — 정상 열에서 안내 화면 «안» 뜸 = ${ctrlClean ? "✓" : "🔴 아니오(이 그물은 사유를 가르지 못한다)"}`);
if (!ctrlClean) process.exit(2);

const checks = [];
const chk = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${name} = ${ok ? "✓" : "🔴 FAIL"}${detail ? " · " + detail : ""}`);
};

chk("소켓 끊김 — 안내 화면이 떴나", !!refused.seen.unavailable);
chk(
  "소켓 끊김 — 원문 값이 보존됐나(data-why=TypeError)",
  refused.seen.dataWhy === "TypeError",
  `실측 ${refused.seen.dataWhy}`,
);
chk(
  "소켓 끊김 — 문장이 사람 말인가(기계 낱말 아님)",
  refused.seen.unavailable && !isMachineWord(refused.seen.reasonText),
  `실측 「${refused.seen.reasonText}」`,
);
chk("HTTP 503 — 안내 화면이 떴나", !!s503.seen.unavailable);
chk("HTTP 503 — 원문 값 보존(data-why=HTTP 503)", s503.seen.dataWhy === "HTTP 503", `실측 ${s503.seen.dataWhy}`);
chk(
  "HTTP 503 — 문장이 숫자를 옮겼나",
  s503.seen.unavailable && !isMachineWord(s503.seen.reasonText) && /503/.test(s503.seen.reasonText ?? ""),
  `실측 「${s503.seen.reasonText}」`,
);
chk(
  "불변 축 — testid·data-kind 가 그대로인가",
  [refused, s503].every((r) => r.seen.unavailable && r.seen.kind === "unavailable"),
  `kind ${refused.seen.kind} · ${s503.seen.kind}`,
);
if (s501?.seen.unavailable) {
  chk(
    "HTTP 501 — 501 은 «미구현» 문장으로 갈리나",
    s501.seen.dataWhy === "미구현(501)" && !isMachineWord(s501.seen.reasonText),
    `data-why ${s501.seen.dataWhy} · 「${s501.seen.reasonText}」`,
  );
} else {
  notes.push("501 열 = 안내 화면이 안 떠 판정 못 함(안 잼)");
}

const failed = checks.filter((c) => !c.ok);
console.log(
  failed.length === 0
    ? "\n[X-25] PASS — 사유가 사람 말로 바뀌었고 원문 값은 보존됐다."
    : `\n[X-25] 🔴 **FAIL** — ${failed.map((c) => c.name).join(" · ")}`,
);
console.log(`\n🔴 안 잼: ${["TimeoutError·AbortError 열(상류를 «느리게» 만드는 무대가 따로 필요)", "그 외(모르는 코드) 열", ...notes].join(" · ")}`);
process.exit(failed.length === 0 ? 0 : 1);
