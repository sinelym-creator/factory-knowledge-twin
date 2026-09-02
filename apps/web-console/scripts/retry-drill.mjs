/**
 * retry-drill — 재시도 규칙 두 축을 «본체 코드 그대로» 재현한다.
 *   ① D-11 완화 (C) · `call()`         : GET · 상대 경로 · 502/503 만 1회 되묻는다 (①~⑧)
 *   ② D-12 완화   · `createSession()`  : «미도달»(status 없음) 만 400·800ms 로 2회 되묻고,
 *                                        실패 회차마다 `console.warn` 한 줄을 남긴다 (⑨~⑪)
 *   ③ D-12b       · `causeCodeOf()`    : undici 예외의 «속»에서 코드 토큰만 꺼내 warn 에 싣고,
 *                                        호스트명·주소는 싣지 않는다 · errors[] 는 전건 병기 (⑫~⑯)
 *   ④ D-12c/Q-68  · `allowedCodeOf()`  : 출처를 `code` 필드로 좁히고 전체 일치 + 형태 허용목록,
 *                                        밖은 `OTHER` 로 접는다 (⑮ · ⑰)
 *   ⑤ D-12d       · `createFallbackLookup()` : 시스템 해석 실패를 DoH·캐시로 우회하고,
 *                                        dispatcher 가 «실제 소켓»에서 도는지까지 본다 (⑱~㉑)
 *   ⑥ Q-70        · `createSession()` 총 예산 : 시도들의 «합»이 8s 를 넘지 못한다 —
 *                                        타임아웃 자극을 실제로 매달아 벽시계로 재고(㉔~㉖),
 *                                        예산 산술은 순수 함수로 즉시 판정한다(㉗)
 *
 * 🔴 **㉔~㉖ 은 «기다림»이 값이다.** 세 케이스가 벽시계로 약 20초를 쓴다. 자극을 짧게 흉내
 *    내면(예: 상한을 인자로 주입) 그 초록은 코드가 아니라 하니스가 낸 것이 되고, 정작
 *    「시도들의 합에 상한이 걸렸는가」는 재지 않은 채 남는다. 산술만 빠르게 세는 축은 ㉗ 이
 *    따로 든다 — 둘 중 하나만으로는 이 처방이 증명되지 않는다.
 *
 * 🔴 Q-68 의 «반대 방향»(뚫리는 표본)은 이 파일이 아니라 검증 좌석 그물이 든다 —
 *    `tests/web/d12b_cause_redaction_probe.mjs`(리바이2 · A~I 9행 · 심은 호스트로 판정).
 *    여기에 같은 표본을 재구성해 두면 정본이 둘이 되고, 둘이 갈리는 날 어느 쪽이 참인지
 *    아무도 모른다. 이 파일은 「막는 쪽」만 든다.
 *
 *   node --experimental-strip-types scripts/retry-drill.mjs
 *   (pnpm retry:drill)
 *
 * 🔴 규칙을 여기에 «옮겨 적지» 않는다 — `lib/contract.ts` 를 그대로 import 해서 돌린다.
 *    판정식을 복사하면 이 드릴은 코드가 아니라 자기 사본을 검사하게 되고, 본체가 바뀐 날에도
 *    초록이 유지된다(「옮겨 적은 표는 자동 대조하라」).
 *
 * 🔴 **돌리기 전에 `undici` 가 설치돼 있어야 한다** — 「새 의존성 0」은 더 이상 참이 아니다.
 *    다만 이 드릴이 들인 것이 아니라 **본체가 들인 것**이다: `lib/server-dns.ts` 가 D-12d
 *    (`95cdef1`)에서 `await import("undici")` 로 «앱이 나가는 한 벌»을 잡았고, ⑱~㉑ 은 그
 *    같은 패키지를 통과해야만 「dispatcher 가 실제 소켓에서 도는가」를 잰다.
 *    `undici@8.10.1` 은 `package.json` dependencies 에 «선언»돼 있다 — 그러나 선언은 설치가
 *    아니다. 그 커밋보다 오래된 `node_modules` 나 새 워크트리에는 없고, 그때 이 드릴은
 *    케이스를 한 건도 찍지 못한 채 `ERR_MODULE_NOT_FOUND` 로 죽는다(실측 rc=1).
 *    프로세스가 첫 케이스 «위»에서 죽은 것이므로 그것은 0/24 가 아니라 «측정 없음»이다.
 *      npm install --no-save --no-package-lock undici@8.10.1
 *    (실측: 빈 `node_modules` 에서 이 한 줄은 undici 만 가져오지 않는다 — 트리 전체
 *     365 패키지를 깐다. 명령 이름이 사정거리를 말해 주지 않는다.)
 *    테스트 «러너»를 들이는 것은 여전히 이 티켓의 범위 밖이고, 이 리포의 다른 그물
 *    (`tests/contract/run.js` · `tests/api/ci_hygiene_drill.py`)도 의존성 없는 자체 러너다.
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

import http from "node:http";

import {
  apiGetBrowser,
  apiGetServer,
  CAUSE_OTHER,
  createSession,
  enterRetryBudget,
  hasServerFetch,
  liveStatus,
  proxyApiRequest,
  registerServerFetch,
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
/** 🔴 ㉑ 은 «진짜 소켓»을 타야 한다 — 모킹 fetch 가 살아 있으면 그것이 대신 답해 버린다. */
const realFetch = globalThis.fetch;

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
      // 🔴 undici 는 «속»에 사유를 넣어 던진다 — 겉껍질은 언제나 `TypeError` 다(D-12b).
      if (r.cause !== undefined) e.cause = r.cause;
      throw e;
    }
    /**
     * 🔴 **타임아웃 형 자극(Q-70)** — 스스로 끝내지 않는다. «연결은 서는데 답이 안 오는»
     *    블랙홀(Tunnel OFF)이 이 모양이고, 끝내는 조건은 **호출자가 건 signal 하나**다.
     *    여기에 숫자를 적으면 그 숫자가 정본이 되어, 본체가 예산을 바꾼 날에도 드릴은
     *    옛 값으로 초록을 낸다. 상한은 «재는 쪽»이 아니라 «재이는 쪽»이 갖는다.
     */
    if (r.hangs) {
      return await new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (!sig) {
          // signal 이 없으면 영원히 매달린다 — 그것은 빨강이 아니라 «측정 실패»다.
          const e = new Error("no signal — cannot measure the budget");
          e.name = "HarnessError";
          reject(e);
          return;
        }
        sig.addEventListener("abort", () => reject(sig.reason), { once: true });
      });
    }
    // 느린 «성공» — 정상 발급이 예산 안에서 살아남는가(무회귀 축).
    if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
    const headers = { "content-type": "application/json", ...(r.headers ?? {}) };
    const body = r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers });
  };
}

const ok = (body) => ({ status: 200, body });
const fail = (status, headers) => ({ status, headers });
/**
 * 미도달(연결 실패) — `attempt()` 의 catch 축으로 접힌다: `why = e.name` · status 없음.
 * `cause` 를 주면 undici 가 «속»에 사유를 넣어 던지는 형태를 재현한다(D-12b).
 */
const unreachable = (name = "TypeError", cause) => ({ throws: name, cause });
/** 타임아웃 형 — 연결은 서는데 답이 오지 않는다(Tunnel OFF 블랙홀 · Q-70). */
const blackhole = () => ({ hangs: true });
/** 느린 성공 — 공개 콜드 왕복(3.06s 실측) 급이 예산 안에서 살아남는지 본다. */
const slowOk = (delayMs, body) => ({ delayMs, status: 200, body });

/**
 * 🔴 **`AbortSignal.timeout` 의 타이머는 이벤트 루프를 붙잡지 않는다(unref).** 매달린
 *    자극을 기다리는 동안 다른 ref 타이머가 없으면 Node 가 「할 일 없음」으로 **먼저 죽는다**
 *    (리바이2 20대 실측 rc 13). 그건 대상의 성질이 아니라 하니스의 결함이라, 재는 동안만
 *    루프를 깨워 둔다.
 */
async function awake(fn) {
  const keep = setInterval(() => {}, 500);
  try {
    return await fn();
  } finally {
    clearInterval(keep);
  }
}

// ── 판정 ────────────────────────────────────────────────────────────────
let pass = 0;
let failed = 0;
let retriedSeen = 0;
/** D-12 축 계수 — `call()` 의 재시도(위)와 «따로» 센다. 한쪽이 다른 쪽을 증명하지 않는다. */
let enterRetriedSeen = 0;
let warnLinesSeen = 0;
/** D-12b 축 계수 — cause 코드가 «실제로 뽑힌» 회차 · 호스트 누출을 «실제로 본» 회차. */
let causeSeen = 0;
let hostLeakChecked = 0;
/** Q-68 축 계수 — 허용목록 «밖» 코드가 `OTHER` 로 접힌 회차. 0건이면 그 분기는 죽은 채 초록이다. */
let otherFoldSeen = 0;
/**
 * Q-70 축 계수 — ① 타임아웃 자극이 «실제로» 걸린 회차(`why==="TimeoutError"`) ·
 * ② 총 예산이 «실제로» 재시도를 끊은 회차(예산 소진 warn). 새 분기는 발동을 세지 않으면
 * 죽은 채로 초록이 된다 — 특히 ②는 이 티켓이 새로 만든 유일한 분기다.
 */
let timeoutStimulusSeen = 0;
let budgetStopSeen = 0;
/** D-12d 축 계수 — 우리 lookup 이 «실제로» 불린 회차 · 그중 family 4 로 물은 회차. */
let lookupCalled = 0;
let lookupFamily4 = 0;
let undiciAskedFamily;
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

// ── ⑫ cause 가 코드를 들고 온다 : warn 이 «무엇이라» 우는지 말한다 ────────
{
  stage(
    unreachable("TypeError", { code: "ENOTFOUND", syscall: "getaddrinfo", errno: -3008 }),
    ok({ sessionId: "s-3" }),
  );
  const [r] = await timed(() => createSession("http://api.test"));
  if (/ENOTFOUND/.test(warns[0] ?? "")) causeSeen += 1;
  check(
    "⑫ cause 코드가 warn 에 실린다",
    r.state === "ok" &&
      warns.length === 1 &&
      /TypeError ENOTFOUND/.test(warns[0]) &&
      /syscall=getaddrinfo/.test(warns[0]) &&
      /errno=-3008/.test(warns[0]) &&
      /attempt=1\/3/.test(warns[0]),
    `warn 「${warns[0] ?? "-"}」`,
  );
}

// ── ⑬ cause 가 없으면 «지어내지 않는다» : 문면이 D-12 그대로다 ────────────
{
  stage(unreachable("TypeError"), ok({ sessionId: "s-4" }));
  const [r] = await timed(() => createSession("http://api.test"));
  check(
    "⑬ cause 없음 = 붙이지 않는다",
    r.state === "ok" &&
      warns.length === 1 &&
      // 🔴 `mod=` 지문이 붙으므로 «정확 일치»가 아니라 「코드 토큰이 없다」로 본다(D-12e).
      /^\[enter\] createSession failed TypeError attempt=1\/3 spent=[0-9]+ms mod=[0-9a-f]+$/.test(warns[0]),
    `warn 「${warns[0] ?? "-"}」(코드 토큰이 없어야 한다)`,
  );
}

// ── ⑭ AggregateError : 코드가 `errors[]` 안에 있어도 꺼낸다 ───────────────
{
  stage(
    unreachable("TypeError", {
      name: "AggregateError",
      errors: [{ code: "ECONNREFUSED", syscall: "connect", errno: -111 }],
    }),
    ok({ sessionId: "s-5" }),
  );
  const [r] = await timed(() => createSession("http://api.test"));
  if (/ECONNREFUSED/.test(warns[0] ?? "")) causeSeen += 1;
  check(
    "⑭ AggregateError 속 코드",
    r.state === "ok" && warns.length === 1 && /ECONNREFUSED/.test(warns[0]),
    `warn 「${warns[0] ?? "-"}」(바깥 code 는 비어 있고 errors[0] 에만 있다)`,
  );
}

// ── ⑮ 🔴 message 는 «읽지 않는다» — 코드도 호스트도 거기서 나오지 않는다 (Q-68 ①)
//    앞판(D-12b)은 이 표본에서 `ENOTFOUND` 를 집어냈다. 그 방식은 호스트가 소문자라는
//    «환경의 우연»에 기대고 있었다 — 대문자 호스트면 조각이 함께 남는다(⑰ B·C).
//    그래서 message 를 아예 안 본다: 이 표본은 이제 «코드 없음»이 정답이다.
{
  const host = "fkt-secret-host.ts.net";
  stage(
    unreachable("TypeError", { message: `getaddrinfo ENOTFOUND ${host}` }),
    ok({ sessionId: "s-6" }),
  );
  const [r] = await timed(() => createSession("http://api.test"));
  const line = warns[0] ?? "";
  hostLeakChecked += 1;
  check(
    "⑮ message 는 읽지 않는다(코드도 호스트도 안 남는다)",
    r.state === "ok" &&
      warns.length === 1 &&
      /^\[enter\] createSession failed TypeError attempt=1\/3 spent=[0-9]+ms mod=[0-9a-f]+$/.test(line) &&
      !line.includes(host) &&
      !line.includes("ts.net"),
    `warn 「${line}」(D-12b 에서는 여기서 ENOTFOUND 를 집었다 — 지금은 코드 자체가 없어야 한다)`,
  );
}

// ── ⑯ happy-eyeballs 전멸 : 주소마다 다른 사유를 «둘 다» 남긴다 ───────────
//    이 배치의 Funnel 호스트는 A 2 + AAAA 2 다(오케 DoH 실측) — 첫 원소만 남기면
//    「IPv4 는 거부, IPv6 는 시간 초과」 같은 갈림이 로그에서 사라진다. 주소는 안 남는다.
{
  // 🔴 주소는 «문서용 대역»에서 고른다(D-20). 앞판의 값은 손으로 지은 합성 표본인데도
  //    하필 CGNAT 100.64/10 «안»이라, 공개 경계 스캔이 실 tunnel 주소와 구분하지 못했다.
  //    이 파일의 다른 표본(203.0.113.7·198.51.100.9·2001:db8::1)과 같은 관용으로 옮긴다 —
  //    주소 «모양»은 그대로라 「주소가 로그에 안 남는가」라는 자극은 유지된다.
  const v4 = "203.0.113.103:8443";
  stage(
    unreachable("TypeError", {
      name: "AggregateError",
      errors: [
        { code: "ECONNREFUSED", message: `connect ECONNREFUSED ${v4}` },
        { code: "ETIMEDOUT", message: "connect ETIMEDOUT 2001:db8::1:8443" },
      ],
    }),
    ok({ sessionId: "s-7" }),
  );
  const [r] = await timed(() => createSession("http://api.test"));
  const line = warns[0] ?? "";
  if (/ECONNREFUSED/.test(line)) causeSeen += 1;
  hostLeakChecked += 1;
  check(
    "⑯ errors[] 전건 병기 · 주소 미노출",
    r.state === "ok" &&
      warns.length === 1 &&
      /ECONNREFUSED/.test(line) &&
      /ETIMEDOUT/.test(line) &&
      !line.includes(v4) &&
      !line.includes("203.0.113.103") &&
      !line.includes("2001:db8"),
    `warn 「${line}」(두 코드 다 보이고 주소는 없어야 한다)`,
  );
}

// ── ⑰ 허용목록 «밖» 코드 : 값 대신 OTHER 로 접힌다 (Q-68 ③) ──────────────
//
// 🔴 이 한 건은 «반대 표본»이 아니라 **발동 계수**다. 뚫리는 표본의 정본은 검증 좌석 그물
//    (`tests/web/d12b_cause_redaction_probe.mjs`)이고, 거기서는 D·H 가 전체 일치(②)에서
//    이미 걸려 ③ 이 도는 회차가 «0» 이다. 그러면 허용목록 분기는 죽어 있어도 두 그물 다
//    초록이다 — 새 규칙은 자기 발동을 세야 한다.
{
  stage(unreachable("TypeError", { code: "HARRY" }), ok({ sessionId: "s-8" }));
  const [r] = await timed(() => createSession("http://api.test"));
  const line = warns[0] ?? "";
  if (line.includes(CAUSE_OTHER)) otherFoldSeen += 1;
  check(
    "⑰ 허용목록 밖 코드 = OTHER 접힘",
    r.state === "ok" &&
      warns.length === 1 &&
      line.includes(CAUSE_OTHER) &&
      !line.includes("HARRY"),
    `warn 「${line}」(값은 안 남고 「모르는 코드가 왔다」만 남아야 한다)`,
  );
}

// ══ D-12d — 이름 해석 우회 (⑱~㉑) ═══════════════════════════════════════
//
// 🔴 여기서부터는 `stage()` 의 모킹 fetch 를 «쓰지 않는다». ⑱~⑳ 은 `createFallbackLookup()`
//    을 직접 돌리는 단위 검사이고, ㉑ 은 **진짜 소켓**을 열어 「dispatcher 가 물렸는가」를 본다.
//    모킹 fetch 위에서는 dispatcher 가 도는지 «절대» 알 수 없다 — 그 층을 지나가지 않으니까.

const { createFallbackLookup, systemLookupV4, __resetDnsCacheForDrill } =
  await import("../lib/server-dns.ts");

const ENOTFOUND = () => Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });

/** 단계 관측을 배열로 받는다 — 프로덕션은 같은 자리에서 `console.warn` 한 줄을 낸다. */
function runLookup(deps, options = { all: true, family: 4 }) {
  const seen = [];
  const lookup = createFallbackLookup({ ...deps, observe: (o) => seen.push(o) });
  return new Promise((resolve) => {
    lookup("api.test", options, (err, address) => resolve({ err, address, seen }));
  });
}

// ── ㉔ 🔴 타임아웃 형 1회 = 총 예산이 재시도를 끊는다 (Q-70 · 이 티켓의 몸통) ─────
//
//    BEFORE(기점 `cd8dcfa` · 이 케이스를 그대로 돌리면): 시도 **3회** · 총 **≈25,200ms**.
//    시도마다 `ENTER_TIMEOUT_MS`(8s)를 새로 받았기 때문이다(리바이2 #302 25,238ms ·
//    이 lane 재실측 25,230ms). AFTER 는 예산이 합에 걸려 한 시도에서 끝난다.
{
  stage(blackhole(), ok({ sessionId: "s-t1" }));
  const [r, ms] = await timed(() => awake(() => createSession("http://api.test")));
  if (r.state === "unavailable" && r.why === "TimeoutError") timeoutStimulusSeen += 1;
  if (warns.some((w) => /retry budget spent/.test(w))) budgetStopSeen += 1;
  warnLinesSeen += warns.length;
  check(
    "㉔ 타임아웃 1회 = 시도 1회 · 총 ≤8s",
    r.state === "unavailable" &&
      r.status === undefined &&
      r.why === "TimeoutError" &&
      calls.length === 1 &&
      !retriedOf(r) &&
      ms >= 7500 &&
      ms <= 9500 &&
      warns.length === 2 &&
      /attempt=1\/3/.test(warns[0]) &&
      /spent=\d+ms/.test(warns[0]) &&
      /retry budget spent/.test(warns[1]),
    `why=${r.state === "unavailable" ? r.why : "-"} · fetch ${calls.length}회(기대 1 — 앞판은 3) · ${ms}ms(기대 7500~9500 — 앞판은 ≈25,200) · warn ${warns.length}줄 「${warns[1] ?? "-"}」`,
  );
}

// ── ㉕ 즉시 실패 → 재시도 → 타임아웃 : 되묻기는 살아 있고, 예산이 그 뒤를 끊는다 ──
//
//    🔴 이 케이스가 없으면 ㉔ 의 초록은 「타임아웃을 안 되묻는다」와 「아무것도 안 되묻는다」를
//       가르지 못한다. D-12 가 구하려던 축(즉시 실패)은 여기서 실제로 한 번 더 돈다.
{
  stage(unreachable("TypeError", { code: "ECONNREFUSED" }), blackhole());
  const [r, ms] = await timed(() => awake(() => createSession("http://api.test")));
  if (r.state === "unavailable" && r.why === "TimeoutError") timeoutStimulusSeen += 1;
  if (warns.some((w) => /retry budget spent/.test(w))) budgetStopSeen += 1;
  if (retriedOf(r)) enterRetriedSeen += 1;
  warnLinesSeen += warns.length;
  check(
    "㉕ 즉시 실패 → 재시도 → 타임아웃 = 시도 2회 · 총 ≤8s",
    r.state === "unavailable" &&
      r.why === "TimeoutError" &&
      calls.length === 2 &&
      retriedOf(r) &&
      ms >= 7500 &&
      ms <= 9500 &&
      warns.length === 3 &&
      /TypeError ECONNREFUSED/.test(warns[0]) &&
      /retry budget spent/.test(warns[2]),
    `why=${r.state === "unavailable" ? r.why : "-"} · fetch ${calls.length}회(기대 2 — 앞판은 3) · ${ms}ms(기대 7500~9500 — 앞판은 ≈17,200) · warn ${warns.length}줄`,
  );
}

// ── ㉖ 느린 «성공» 무회귀 : 정상 발급은 예산 안에서 그대로 산다 ────────────
//
//    🔴 이 티켓의 반대 방향이다. 예산을 좁히는 처방은 「빨리 실패한다」가 목적이지
//       「멀쩡한 발급을 자른다」가 목적이 아니다. 공개 배포의 콜드 왕복 실측이 3.06s 였으므로
//       그보다 «더 느린» 3.8s 를 준다 — 여기서 초록이어야 시도별 상한이 안 깎였다는 뜻이다.
{
  stage(slowOk(3800, { sessionId: "s-slow" }));
  const [r, ms] = await timed(() => awake(() => createSession("http://api.test")));
  warnLinesSeen += warns.length;
  check(
    "㉖ 느린 성공(3.8s) 무회귀",
    r.state === "ok" &&
      r.data.sessionId === "s-slow" &&
      calls.length === 1 &&
      !retriedOf(r) &&
      ms >= 3700 &&
      ms <= 5500 &&
      warns.length === 0,
    `state=${r.state} · fetch ${calls.length}회 · ${ms}ms(기대 3700~5500) · warn ${warns.length}줄(기대 0)`,
  );
}

// ── ㉗ 예산 산술 = 순수 함수 단위 판정 (벽시계 0) ──────────────────────────
//
//    🔴 위 셋은 «기다려 봤더니 그렇더라»를 말한다. 여기는 「이 입력에는 이렇게 답한다」를
//       말한다. 벽시계가 흔들려도 이 여섯 줄은 흔들리지 않는다 — 규칙이 낸 초록이다.
{
  const cases = [
    ["㉗-a 시도1 · 0ms 소모 = 연다(400ms 뒤 · 남은 7,600ms)", enterRetryBudget(1, 0), { go: true, delayMs: 400, timeoutMs: 7600 }],
    ["㉗-b 시도1 · 2,000ms 소모 = «남은 만큼»으로 연다", enterRetryBudget(1, 2000), { go: true, delayMs: 400, timeoutMs: 5600 }],
    ["㉗-c 시도1 · 8,000ms 소모(타임아웃 전량) = 예산 소진", enterRetryBudget(1, 8000), { go: false, reason: "budget" }],
    ["㉗-d 시도2 · 3,000ms 소모 = 연다", enterRetryBudget(2, 3000), { go: true, delayMs: 800, timeoutMs: 4200 }],
    ["㉗-e 시도2 · 6,400ms 소모 = 남은 800ms 로는 «열지 않는다»", enterRetryBudget(2, 6400), { go: false, reason: "budget" }],
    ["㉗-f 시도3 = 회차 소진(예산과 다른 사유)", enterRetryBudget(3, 0), { go: false, reason: "attempts" }],
  ];
  for (const [name, got, want] of cases) {
    check(
      name,
      JSON.stringify(got) === JSON.stringify(want),
      `${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`,
    );
  }
}

// ── ⑱ 시스템 ENOTFOUND → DoH 가 답한다 ───────────────────────────────────
{
  __resetDnsCacheForDrill();
  let askedFamily;
  const { err, address, seen } = await runLookup({
    system: (host, cb) => {
      askedFamily = 4; // defaultSystem 을 대신하므로, family 축은 ㉑ 에서 실코드로 잰다
      cb(ENOTFOUND(), []);
    },
    doh: async (endpoint) => (endpoint.stage === "doh-cf" ? ["203.0.113.7"] : []),
  });
  check(
    "⑱ system ENOTFOUND → DoH 성공",
    !err &&
      Array.isArray(address) &&
      address[0]?.address === "203.0.113.7" &&
      address[0]?.family === 4 &&
      seen.at(-1)?.stage === "doh-cf" &&
      seen.at(-1)?.systemCode === "ENOTFOUND",
    `stage=${seen.at(-1)?.stage} · system=${seen.at(-1)?.systemCode} · addr=${JSON.stringify(address)} · asked=${askedFamily}`,
  );
}

// ── ⑱-b 한 제공자가 빈 답(NXDOMAIN) · 다른 쪽이 A → 성공 (보강 2) ────────
//    한 곳의 NXDOMAIN 을 «최종»으로 읽으면 그 노드의 병이 우리 결론이 된다. 40회 실측에서
//    CF 18/40 · Google 0/40 이었고 «같은 회차에 둘 다 실패한 적은 0» 이었다.
{
  __resetDnsCacheForDrill();
  const { err, address, seen } = await runLookup({
    system: (host, cb) => cb(ENOTFOUND(), []),
    doh: async (endpoint) => (endpoint.stage === "doh-google" ? ["203.0.113.9"] : []),
  });
  check(
    "⑱-b DoH 한쪽 빈 답 → 다른 쪽 A 채택",
    !err && address[0]?.address === "203.0.113.9" && seen.at(-1)?.stage === "doh-google",
    `stage=${seen.at(-1)?.stage} · addr=${JSON.stringify(address)} (cf 는 빈 답)`,
  );
}

// ── ⑲ 시스템·DoH 둘 다 실패 → «마지막 성공» 캐시가 답한다 ─────────────────
{
  __resetDnsCacheForDrill();
  // 먼저 한 번 성공시켜 캐시를 만든다(캐시는 «성공한 적이 있어야» 존재한다).
  await runLookup({ system: (host, cb) => cb(null, ["198.51.100.9"]) });
  const { err, address, seen } = await runLookup({
    system: (host, cb) => cb(ENOTFOUND(), []),
    doh: async () => [],
  });
  check(
    "⑲ system·DoH 실패 → 캐시",
    !err && address[0]?.address === "198.51.100.9" && seen.at(-1)?.stage === "cache",
    `stage=${seen.at(-1)?.stage} · addr=${JSON.stringify(address)}`,
  );
}

// ── ⑳ 전부 실패 → «원래 오류» 그대로(새 실패를 만들지 않는다) ─────────────
{
  __resetDnsCacheForDrill();
  const original = ENOTFOUND();
  const { err, seen } = await runLookup({
    system: (host, cb) => cb(original, []),
    doh: async () => [],
  });
  check(
    "⑳ 전부 실패 = 원래 오류 문면 불변",
    err === original && err.code === "ENOTFOUND" && seen.at(-1)?.stage === "none",
    `err.code=${err?.code} · 같은 객체=${err === original} · stage=${seen.at(-1)?.stage}`,
  );
}

// ── ㉑ 🔴 «물렸는가» — 진짜 소켓으로 확인한다 (스트림·set-cookie 포함) ────
//
//    dispatcher 가 안 물려도 위 ⑱~⑳ 은 초록이다(그 코드는 lookup 함수만 본다). 그래서 여기서
//    실제 요청을 보내고 **우리 lookup 이 불렸는지**를 센다 — 0이면 우회는 죽은 채 초록이다.
{
  // 🔴 계측기를 측정에서 뺀다 — 여기서부터는 모킹 fetch 를 치운다.
  globalThis.fetch = realFetch;
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": "fkt_sid=probe; Path=/; HttpOnly",
    });
    // 🔴 두 청크로 나눠 보낸다 — 「스트림이 통째로 전달되는가」를 한 청크로는 못 본다.
    res.write('{"ok":');
    setTimeout(() => res.end("true}"), 20);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  process.env.FKT_API_BASE_BUILD = `http://api.test:${port}`;

  const undici = await import("undici");
  const lookup = (host, options, cb) => {
    lookupCalled += 1;
    undiciAskedFamily = options?.family;
    // 🔴 이름은 풀리지 않는 이름(`api.test`)이고, 우리가 주소를 «만들어» 준다 —
    //    시스템 해석기를 지나지 않고도 연결이 서면 그것이 곧 「물렸다」의 증거다.
    if (options?.all) return cb(null, [{ address: "127.0.0.1", family: 4 }]);
    cb(null, "127.0.0.1", 4);
  };
  const agent = new undici.Agent({ connect: { lookup } });
  registerServerFetch((url, init) =>
    undici.fetch(url, { ...init, dispatcher: agent }),
  );

  const upstream = await proxyApiRequest(
    new Request(`http://shell.local/api/plants`, { method: "GET", headers: { cookie: "a=b" } }),
    { https: false },
  );
  const body = await upstream.text();
  const cookies = upstream.headers.getSetCookie();
  server.close();

  check(
    "㉑ dispatcher 물림 · 스트림 · set-cookie",
    hasServerFetch() &&
      lookupCalled >= 1 &&
      upstream.status === 200 &&
      body === '{"ok":true}' &&
      cookies.some((c) => c.startsWith("fkt_sid=probe")),
    `등록=${hasServerFetch()} · lookup ${lookupCalled}회(undici 가 준 family=${String(undiciAskedFamily)}) · status=${upstream.status} · body=${body} · set-cookie ${cookies.length}건`,
  );
}

// ── ㉒ 🔴 «AAAA 를 우리가 안 묻는다» — 결과에 v6 가 없어야 한다 (보강 1) ──
//
//    undici 가 우리 lookup 에 주는 `family` 는 undici 가 정한다(실측: 위 ㉑ 에서 0). 우리가
//    통제하는 자리는 «시스템 해석기를 부를 때»이고, 보강 1 이 요구한 것도 그 자리다.
//    관측 가능한 증거는 「돌아온 주소에 IPv6 가 하나도 없다」이다.
{
  const addrs = await new Promise((resolve) => {
    systemLookupV4("localhost", (err, list) => resolve(err ? [] : list));
  });
  const v6 = addrs.filter((a) => a.includes(":"));
  if (addrs.length > 0 && v6.length === 0) lookupFamily4 += 1;
  check(
    "㉒ 시스템 질의는 v4 만 (AAAA 미질의)",
    addrs.length > 0 && v6.length === 0,
    `localhost → [${addrs.join(", ")}] · v6 ${v6.length}건(기대 0) · 0건이면 「막았다」가 아니라 「못 쟀다」다`,
  );
}

// ── ㉓ 🔴 «모듈 복사본이 둘이어도 슬롯은 하나다» (D-12e) ──────────────────
//
//    D-12d 가 프로덕션에서 안 물린 이유가 이 축이다: Next 는 라우트마다 서버 번들을 따로
//    만들고 `lib/contract` 는 번들마다 «복사본»으로 들어간다. 부팅 훅이 등록한 모듈 변수를
//    다른 복사본은 영원히 못 본다(로그: `installed` 는 찍히고 `fallback=` 은 0줄).
//    🔴 위 ㉑ 은 이 축을 못 본다 — 단일 프로세스·비번들이라 복사본이 한 벌뿐이다.
//    그래서 여기서 «두 벌»을 일부러 만든다: 쿼리를 붙이면 ESM 로더가 별 인스턴스로 연다.
{
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ sessionId: "from-copy" }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const copy = await import("../lib/contract.ts?d12e-copy=2");
  const distinct = copy.createSession !== createSession; // 진짜 «다른» 인스턴스인가
  const before = lookupCalled;
  const seenByCopy = copy.hasServerFetch();
  const r = await copy.createSession(`http://api.test:${port}`);
  const calledFromCopy = lookupCalled - before;
  server.close();

  check(
    "㉓ 모듈 복사본이 봐도 등록이 보인다",
    distinct &&
      seenByCopy &&
      r.state === "ok" &&
      r.data.sessionId === "from-copy" &&
      calledFromCopy >= 1,
    `별 인스턴스=${distinct} · 복사본이 본 등록=${seenByCopy} · state=${r.state} · 복사본에서 우회 lookup ${calledFromCopy}회(기대 ≥1)`,
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
const selfOk =
  total >= 33 &&
  retriedSeen >= 1 &&
  enterRetriedSeen >= 1 &&
  warnLinesSeen >= 5 &&
  causeSeen >= 3 &&
  hostLeakChecked >= 2 &&
  otherFoldSeen >= 1 &&
  lookupCalled >= 1 &&
  lookupFamily4 >= 1 &&
  // Q-70 — 자극이 실제로 걸렸는가 · 새 분기가 실제로 돌았는가.
  timeoutStimulusSeen >= 2 &&
  budgetStopSeen >= 2;

console.log(
  "retry-drill — D-11 (C) `call()` + D-12 `createSession()` + D-12b cause + Q-70 총 예산 · lib/contract.ts 를 그대로 돌린다\n",
);
console.log(lines.join("\n"));
console.log(
  `\n  자기 검증  케이스 ${total}건(기대 ≥33) · call() 재시도가 «실제로 돈» 회차 ${retriedSeen}건(기대 ≥1) · ` +
    `createSession 재시도가 «실제로 돈» 회차 ${enterRetriedSeen}건(기대 ≥1) · warn ${warnLinesSeen}줄(기대 ≥5) · ` +
    `cause 코드가 «실제로 뽑힌» 회차 ${causeSeen}건(기대 ≥3) · 호스트 누출을 «실제로 본» 회차 ${hostLeakChecked}건(기대 ≥2) · ` +
    `OTHER 접힘이 «실제로 돈» 회차 ${otherFoldSeen}건(기대 ≥1) · ` +
    `우리 lookup 이 «실제 소켓에서» 불린 회차 ${lookupCalled}건(기대 ≥1) · v4 전용 질의 확인 ${lookupFamily4}건(기대 ≥1) · ` +
    `타임아웃 자극이 «실제로 걸린» 회차 ${timeoutStimulusSeen}건(기대 ≥2) · 총 예산이 «실제로 끊은» 회차 ${budgetStopSeen}건(기대 ≥2) → ${selfOk ? "PASS" : "FAIL"}`,
);
console.log(`\n결과: ${pass}/${total} 통과 · 실패 ${failed}건`);

process.exit(failed === 0 && selfOk ? 0 : 1);
