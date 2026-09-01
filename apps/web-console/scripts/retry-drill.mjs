/**
 * retry-drill — 재시도 규칙 두 축을 «본체 코드 그대로» 재현한다.
 *   ① D-11 완화 (C) · `call()`         : GET · 상대 경로 · 502/503 만 1회 되묻는다 (①~⑧)
 *   ② D-12 완화   · `createSession()`  : «미도달»(status 없음) 만 400·800ms 로 2회 되묻고,
 *                                        실패 회차마다 `console.warn` 한 줄을 남긴다 (⑨~⑪)
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
  createSession,
  liveStatus,
  startRunBrowser,
} from "../lib/contract.ts";

/** 계측 — 모킹 fetch 가 «몇 번· 어떤 메서드로» 불렸는지. 규칙이 도는지는 이 수로만 갈린다. */
let calls = [];
/**
 * 계측 — `console.warn` 원문(D-12 관측 축). 🔴 «회차마다 한 줄»이 규칙이므로 이 배열의
 * 길이가 곧 판정값이다. 원문을 담는 이유: 「울었다」가 아니라 「무엇이라 울었나」(`why`)를
 * 봐야 이 로그가 DNS/TLS 를 가르는 축으로 쓸 수 있는지 확인된다.
 */
let warns = [];
const realWarn = console.warn;

function stage(...responses) {
  calls = [];
  warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  let i = 0;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    /**
     * 🔴 «미도달» 재현 — 응답을 만들지 않고 **던진다**. 여기서 502 같은 상태코드를 쓰면
     *    그것은 「서버가 답했다」이고, D-12 가 처방을 준 축(`status===undefined`)이 아니다.
     *    실측된 증상은 «fetch 가 새 연결에서 즉시 실패»였다 — undici 는 그때 던진다.
     */
    if (r.throws) {
      const e = new Error("fetch failed");
      e.name = r.throws;
      throw e;
    }
    const headers = { "content-type": "application/json", ...(r.headers ?? {}) };
    const body = r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers });
  };
}

const ok = (body) => ({ status: 200, body });
const fail = (status, headers) => ({ status, headers });
/** 미도달(연결 실패) — `attempt()` 의 catch 축으로 접힌다: `why = e.name` · status 없음. */
const unreachable = (name = "TypeError") => ({ throws: name });

// ── 판정 ────────────────────────────────────────────────────────────────
let pass = 0;
let failed = 0;
let retriedSeen = 0;
/** D-12 축 계수 — `call()` 의 재시도(위)와 «따로» 센다. 한쪽이 다른 쪽을 증명하지 않는다. */
let enterRetriedSeen = 0;
let warnLinesSeen = 0;
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

// ── ⑨ 미도달 → 재시도 → 성공 : D-12 처방이 실제로 돈다 ────────────────────
{
  stage(unreachable(), ok({ sessionId: "s-1" }));
  const [r, ms] = await timed(() => createSession("http://api.test"));
  if (retriedOf(r)) enterRetriedSeen += 1;
  warnLinesSeen += warns.length;
  check(
    "⑨ 미도달→재시도→성공",
    r.state === "ok" &&
      calls.length === 2 &&
      calls[0].method === "POST" &&
      retriedOf(r) &&
      ms >= 380 &&
      warns.length === 1 &&
      /TypeError/.test(warns[0]) &&
      /attempt=1\/3/.test(warns[0]),
    `state=${r.state} · fetch ${calls.length}회 · retried=${retriedOf(r)} · ${ms}ms(기대 ≥380) · warn ${warns.length}줄 「${warns[0] ?? "-"}」`,
  );
}

// ── ⑩ HTTP 500 : 서버가 «답한» 실패는 되묻지 않는다(중복 발급 위험) ────────
{
  stage(fail(500), ok({ sessionId: "s-2" }));
  const [r] = await timed(() => createSession("http://api.test"));
  warnLinesSeen += warns.length;
  check(
    "⑩ HTTP 500 무재시도",
    r.state === "unavailable" &&
      r.status === 500 &&
      r.why === "HTTP 500" &&
      calls.length === 1 &&
      !retriedOf(r) &&
      warns.length === 1,
    `state=${r.state} · status=${statusOf(r)} · fetch ${calls.length}회(기대 1) · retried=${retriedOf(r)} · warn ${warns.length}줄(기대 1)`,
  );
}

// ── ⑪ 3회 전건 미도달 : 기존 문면 그대로 + warn 계수가 회차와 일치 ────────
{
  stage(unreachable(), unreachable(), unreachable());
  const [r, ms] = await timed(() => createSession("http://api.test"));
  if (retriedOf(r)) enterRetriedSeen += 1;
  warnLinesSeen += warns.length;
  check(
    "⑪ 미도달 3회 = unavailable + warn 3줄",
    r.state === "unavailable" &&
      r.status === undefined &&
      r.why === "TypeError" &&
      calls.length === 3 &&
      retriedOf(r) &&
      warns.length === 3 &&
      /attempt=3\/3/.test(warns[2]) &&
      ms >= 1150,
    `why=${r.state === "unavailable" ? r.why : "-"} · status=${statusOf(r)} · fetch ${calls.length}회(기대 3) · warn ${warns.length}줄(기대 3) · ${ms}ms(기대 ≥1150 = 400+800)`,
  );
}

// 🔴 계측기 원복 — 아래 결과 출력은 «가로채지 않은» console 로 나가야 한다.
console.warn = realWarn;

// ── 자기 검증 ────────────────────────────────────────────────────────────
const total = pass + failed;
/**
 * 🔴 새 규칙(D-12)도 «발동을 센다» — 케이스 수만 늘고 처방이 죽어 있으면 그 초록은 거짓이다.
 *    두 축을 따로 세는 이유: `call()` 의 재시도(D-11 C)와 `createSession()` 의 재시도(D-12)는
 *    서로를 대신 증명하지 못한다. warn 줄 수도 함께 센다 — 관측 축이 0줄이면 이 티켓의
 *    처방 절반(관측)이 없는 것이다.
 */
const selfOk = total >= 11 && retriedSeen >= 1 && enterRetriedSeen >= 1 && warnLinesSeen >= 5;

console.log(
  "retry-drill — D-11 완화 (C) `call()` + D-12 완화 `createSession()` · lib/contract.ts 를 그대로 돌린다\n",
);
console.log(lines.join("\n"));
console.log(
  `\n  자기 검증  케이스 ${total}건(기대 ≥11) · call() 재시도가 «실제로 돈» 회차 ${retriedSeen}건(기대 ≥1) · ` +
    `createSession 재시도가 «실제로 돈» 회차 ${enterRetriedSeen}건(기대 ≥1) · warn ${warnLinesSeen}줄(기대 ≥5) → ${selfOk ? "PASS" : "FAIL"}`,
);
console.log(`\n결과: ${pass}/${total} 통과 · 실패 ${failed}건`);

process.exit(failed === 0 && selfOk ? 0 : 1);
