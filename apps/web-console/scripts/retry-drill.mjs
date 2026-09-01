/**
 * retry-drill — D-11 완화 (C) 의 재시도 규칙을 «실제 `call()` 로» 재현한다.
 *
 *   node --experimental-strip-types scripts/retry-drill.mjs
 *   (pnpm retry:drill)
 *
 * 🔴 규칙을 여기에 «옮겨 적지» 않는다 — `lib/contract.ts` 를 그대로 import 해서 돌린다.
 *    판정식을 복사하면 이 드릴은 코드가 아니라 자기 사본을 검사하게 되고, 본체가 바뀐 날에도
 *    초록이 유지된다(「옮겨 적은 표는 자동 대조하라」).
 *
 * 🔴 새 의존성 0 — Node 22 내장 타입 스트리핑 + 내장 `Response` 만 쓴다. 테스트 러너를
 *    들이는 것은 이 티켓의 범위 밖이고, 이 리포의 다른 그물(`tests/contract/run.js` ·
 *    `tests/api/ci_hygiene_drill.py`)도 의존성 없는 자체 러너다.
 *
 * 🔴 **왜 `.mts` 가 아니라 `.mjs` 인가** — Node 로 `lib/contract.ts` 를 직접 돌리려면 ESM 규칙상
 *    import 에 `.ts` 확장자를 «써야» 하는데, 이 프로젝트의 `tsconfig.json` 은 include 에
 *    `.mts` 를 넣어 타입체크 대상으로 두었고 tsc 는 그 확장자를 `TS5097` 로 거절한다(빌드 빨강).
 *    🔴 그때 tsconfig 쪽을 고치지 않았다: `allowImportingTsExtensions` 를 켜거나 include 를
 *    좁히는 것은 «검사기에 예외를 내는» 방향이고, 그 순간 규칙은 이 파일 하나가 아니라
 *    앱 코드 전체에 대해 느슨해진다. 검사기를 코드에 맞추지 말고 코드를 검사기에 맞춘다 —
 *    `.mjs` 는 tsconfig `include` 밖이라 tsc 와 다툴 일이 없고, eslint 는 그대로 이 파일을 본다
 *    (실측: 고의 오류를 심은 프로브 파일에 경고 2건이 떴다 — 계측기가 «참»에 울었다).
 *
 * 🔴 «자기 검증»을 먼저 한다: 케이스가 0건이면 FAIL 이고, 「재시도가 실제로 돈」 케이스가
 *    1건도 없어도 FAIL 이다. 재시도 규칙을 검사한다면서 자극을 한 번도 주지 않은 초록은
 *    규칙이 죽어 있어도 그대로 초록이다(「자극이 없으면 판정도 없다」).
 *
 * 🔴 이 파일은 `contract-surface.mjs` 의 사정거리 «밖»이다 — 그 검사기의 `ROOTS` 는
 *    app·components·lib·proxy.ts·next.config.ts 다. 여기 적힌 `/api/…` 문자열은 하니스의
 *    것이지 셸이 나가는 경로가 아니라 그래도 되지만, 「contract:surface PASS」를 이 파일까지
 *    검사한 것으로 읽지 마라.
 *
 * exit: 0 = 전건 통과 · 1 = 실패 1건 이상
 */

import {
  apiGetBrowser,
  apiGetServer,
  liveStatus,
  startRunBrowser,
} from "../lib/contract.ts";

/** 계측 — 모킹 fetch 가 «몇 번· 어떤 메서드로» 불렸는지. 규칙이 도는지는 이 수로만 갈린다. */
let calls = [];

function stage(...responses) {
  calls = [];
  let i = 0;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    const headers = { "content-type": "application/json", ...(r.headers ?? {}) };
    const body = r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers });
  };
}

const ok = (body) => ({ status: 200, body });
const fail = (status, headers) => ({ status, headers });

// ── 판정 ────────────────────────────────────────────────────────────────
let pass = 0;
let failed = 0;
let retriedSeen = 0;
const lines = [];

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    lines.push(`  PASS  ${name}  ${detail}`);
  } else {
    failed += 1;
    lines.push(`  FAIL  ${name}  ${detail}`);
  }
}

const retriedOf = (r) => r.retried === true;
const statusOf = (r) => (r.state === "unavailable" ? r.status : "-");

async function timed(fn) {
  const t0 = Date.now();
  const out = await fn();
  return [out, Date.now() - t0];
}

// ── ① GET 502 → 200 : 1회 재시도하고 성공한다 ─────────────────────────────
{
  stage(fail(502), ok({ online: true, checkedAt: "t" }));
  const [r, ms] = await timed(() => liveStatus());
  if (retriedOf(r)) retriedSeen += 1;
  check(
    "① GET 502→200 재시도",
    r.state === "ok" && calls.length === 2 && retriedOf(r) && ms >= 250,
    `state=${r.state} · fetch ${calls.length}회 · retried=${retriedOf(r)} · ${ms}ms(기대 ≥250)`,
  );
}

// ── ② GET 200 : 재시도하지 않는다(지연 0) ─────────────────────────────────
{
  stage(ok({ ping: 1 }));
  const [r, ms] = await timed(() => apiGetBrowser("/api/plants"));
  check(
    "② GET 200 즉시",
    r.state === "ok" && calls.length === 1 && !retriedOf(r) && ms < 250,
    `state=${r.state} · fetch ${calls.length}회 · retried=${retriedOf(r)} · ${ms}ms(기대 <250)`,
  );
}

// ── ③ POST 502 : 되묻지 않는다(멱등 아님) ────────────────────────────────
{
  stage(fail(502), ok({ runId: "r1", incidentId: "i1", mode: "live" }));
  const [r] = await timed(() => startRunBrowser("GS-01", "sid", "live"));
  check(
    "③ POST 502 무재시도",
    r.state === "unavailable" && r.status === 502 && calls.length === 1 && !retriedOf(r),
    `state=${r.state} · status=${statusOf(r)} · fetch ${calls.length}회(기대 1) · method=${calls[0]?.method}`,
  );
}

// ── ④ GET 429 : 서버가 「그만 와라」라 한 것은 되묻지 않는다 ───────────────
{
  stage(fail(429, { "retry-after": "1" }), ok({ ping: 1 }));
  const [r] = await timed(() => apiGetBrowser("/api/plants"));
  check(
    "④ GET 429 무재시도",
    r.state === "unavailable" && r.status === 429 && calls.length === 1 && !retriedOf(r),
    `state=${r.state} · status=${statusOf(r)} · fetch ${calls.length}회(기대 1)`,
  );
}

// ── ⑤ 서버 축(절대 base) 502 : 대상 밖 — 증상이 없는 층이다 ───────────────
{
  stage(fail(502), ok({ ping: 1 }));
  const [r] = await timed(() => apiGetServer("/api/plants", ""));
  check(
    "⑤ apiGetServer 502 무재시도",
    r.state === "unavailable" && calls.length === 1 && !retriedOf(r),
    `state=${r.state} · fetch ${calls.length}회(기대 1) · url=${calls[0]?.url.slice(0, 28)}…`,
  );
}

// ── ⑥ 503 + Retry-After : 서버가 «말한» 값이 300ms 를 이긴다 ──────────────
{
  stage(fail(503, { "retry-after": "1" }), ok({ ping: 1 }));
  const [r, ms] = await timed(() => apiGetBrowser("/api/plants"));
  if (retriedOf(r)) retriedSeen += 1;
  check(
    "⑥ 503 Retry-After 1s 우선",
    r.state === "ok" && calls.length === 2 && retriedOf(r) && ms >= 900,
    `fetch ${calls.length}회 · retried=${retriedOf(r)} · ${ms}ms(기대 ≥900 — 300ms 였다면 실패)`,
  );
}

// ── ⑦ Retry-After 상한 : 서버가 5초라 해도 2초에서 끊는다 ────────────────
{
  stage(fail(503, { "retry-after": "5" }), ok({ ping: 1 }));
  const [r, ms] = await timed(() => apiGetBrowser("/api/plants"));
  if (retriedOf(r)) retriedSeen += 1;
  check(
    "⑦ Retry-After 상한 2s",
    r.state === "ok" && calls.length === 2 && ms >= 1900 && ms < 3000,
    `${ms}ms(기대 1900~3000 — 상한이 없으면 ~5000)`,
  );
}

// ── ⑧ 재시도 뒤에도 502 : 문면은 기존 unavailable 그대로 ─────────────────
{
  stage(fail(502), fail(502));
  const [r] = await timed(() => apiGetBrowser("/api/plants"));
  if (retriedOf(r)) retriedSeen += 1;
  check(
    "⑧ 재시도 후에도 실패 = 기존 문면",
    r.state === "unavailable" &&
      r.status === 502 &&
      r.why === "HTTP 502" &&
      calls.length === 2 &&
      retriedOf(r),
    `why=${r.state === "unavailable" ? r.why : "-"} · fetch ${calls.length}회 · retried=${retriedOf(r)}`,
  );
}

// ── 자기 검증 ────────────────────────────────────────────────────────────
const total = pass + failed;
const selfOk = total >= 8 && retriedSeen >= 1;

console.log("retry-drill — D-11 완화 (C) · lib/contract.ts 의 call() 을 그대로 돌린다\n");
console.log(lines.join("\n"));
console.log(
  `\n  자기 검증  케이스 ${total}건(기대 ≥8) · 재시도가 «실제로 돈» 회차 ${retriedSeen}건(기대 ≥1) → ${selfOk ? "PASS" : "FAIL"}`,
);
console.log(`\n결과: ${pass}/${total} 통과 · 실패 ${failed}건`);

process.exit(failed === 0 && selfOk ? 0 : 1);
