/**
 * d12_enter_retry_budget — D-12 완화의 «시간 예산» 축. 검증 좌석 그물(리바이2 20대).
 *
 * 🔴 **왜 이 그물이 따로 있나.** 구현 좌석 드릴(`apps/web-console/scripts/retry-drill.mjs`)의
 *    D-12 케이스 ⑨⑩⑪ 은 미도달 자극을 전부 **`TypeError`(즉시 실패)** 로 준다. 실전에서
 *    관측된 뭉치도 그 모양이었다(응답 0.7~3s). 그러나 `attempt()` 의 catch 는 **모든 예외를
 *    `why = e.name` 한 칸으로 접고**(`lib/contract.ts:530`), 되묻기 판정은 `status === undefined`
 *    하나만 본다(`:653`). 즉 **타임아웃도 같은 문으로 들어온다.** 그 축은 드릴에 케이스가 없고,
 *    시간 비용이 즉시 실패와 «자릿수»가 다르다 — 그래서 여기서 «잰다».
 *
 * 🔴 **외삽하지 않는다.** 「3×8s + 1.2s = 25.2s」는 곱셈으로 적을 수 있지만, 곱셈은
 *    「매 시도가 자기 예산을 새로 받는가」를 증명하지 않는다. 예산이 «공유»면 총 8s 로 끝난다.
 *    두 세계를 가르는 것은 산수가 아니라 실측이라, 이 그물은 벽시계로 끝까지 기다린다.
 *
 * 🔴 **규칙을 옮겨 적지 않는다** — `lib/contract.ts` 의 `createSession` 을 그대로 import 한다.
 *    재시도 횟수·지연값은 이 파일 어디에도 상수로 적지 않고 **관측해서 센다**. 그래야 본체가
 *    바뀐 날 이 그물이 함께 움직인다.
 *
 * 🔴 **자극이 없으면 판정도 없다** — fetch 가 한 번도 안 불렸으면 rc 2(측정 실패)다.
 *
 * 실행:  node --experimental-strip-types tests/web/d12_enter_retry_budget.mjs
 *        (리포 루트에서 · 대상은 실코드라 서버·컨테이너 불필요)
 * 벽시계: 약 27초(타임아웃 축이 실제로 예산을 다 쓴다). 이 그물은 그 기다림이 «값»이다.
 * rc:    0 전건 통과 · 1 실패 1건 이상 · 2 자극 미실재(측정 실패)
 */

import { createSession } from "../../apps/web-console/lib/contract.ts";

// ── 하네스 ──────────────────────────────────────────────────────────────────
/** 이번 회차에 실제로 나간 fetch 들. 「몇 번 · 각각 얼마나」가 이 그물의 원자료다. */
let calls = [];
let warns = [];
const realFetch = globalThis.fetch;
const realWarn = console.warn;

/**
 * `mode`:
 *   "ok"      — 즉시 200. 계측기 생존 대조군(내가 준 응답이 실제로 대상에 닿는가).
 *   "instant" — 즉시 던진다(`TypeError`). 실전에서 관측된 뭉치의 모양.
 *   "hang"    — 🔴 **스스로 끝내지 않는다.** 호출자가 건 `AbortSignal` 이 끊을 때까지 매달려
 *               있다가, 끊기면 undici 와 같은 이름(`TimeoutError`)으로 던진다. 이 모드에서만
 *               「시도 하나의 예산」이 관측된다.
 */
function stage(mode) {
  calls = [];
  warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  globalThis.fetch = (input, init) => {
    const rec = { url: String(input), method: (init?.method ?? "GET").toUpperCase(), ms: 0 };
    const t0 = Date.now();
    calls.push(rec);
    if (mode === "ok") {
      rec.ms = 0;
      return Promise.resolve(
        new Response(JSON.stringify({ sessionId: "s1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (mode === "instant") {
      const e = new Error("fetch failed");
      e.name = "TypeError";
      rec.ms = 0;
      return Promise.reject(e);
    }
    // hang — 호출자의 signal 이 유일한 종료 조건이다.
    return new Promise((_resolve, reject) => {
      const sig = init?.signal;
      if (!sig) {
        // 🔴 signal 이 없으면 이 그물은 «영원히» 매달린다. 그것은 측정 실패이지 빨강이 아니다.
        rec.ms = Date.now() - t0;
        const e = new Error("no signal — cannot measure the per-attempt budget");
        e.name = "HarnessError";
        reject(e);
        return;
      }
      sig.addEventListener(
        "abort",
        () => {
          rec.ms = Date.now() - t0;
          const e = new Error("The operation was aborted due to timeout");
          // undici 가 AbortSignal.timeout 으로 끊길 때 쓰는 이름 그대로.
          e.name = sig.reason?.name === "TimeoutError" ? "TimeoutError" : (sig.reason?.name ?? "AbortError");
          reject(e);
        },
        { once: true },
      );
    });
  };
}

function restore() {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
}

let pass = 0;
let failed = 0;
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
function note(name, detail) {
  lines.push(`  값    ${name}  ${detail}`);
}

async function timed(fn) {
  const t0 = Date.now();
  const out = await fn();
  return [out, Date.now() - t0];
}

const round = (n) => Math.round(n);

// ── ⓐ 계측기 생존 대조군 ────────────────────────────────────────────────────
// 🔴 이 행이 없으면 아래 두 행의 「매달림」이 대상의 성질인지 내 모킹이 응답을 못 준 것인지
//    갈리지 않는다. 같은 하네스로 «성공»이 한 번은 나야 한다.
stage("ok");
const [okReply, okMs] = await timed(() => createSession(""));
check(
  "ⓐ 대조군 · 즉시 200",
  okReply.state === "ok" && calls.length === 1 && okMs < 500,
  `state=${okReply.state} · fetch ${calls.length}회 · ${okMs}ms(기대 <500) · warn ${warns.length}줄`,
);

// ── ⓑ 즉시 실패(TypeError) — 실전 뭉치의 모양 ───────────────────────────────
stage("instant");
const [instReply, instMs] = await timed(() => createSession(""));
const instAttempts = calls.length;
// 지연 총합 = 총 경과 − 시도들이 쓴 시간(즉시 실패라 ≈0)
const instSleep = instMs - calls.reduce((s, c) => s + c.ms, 0);
check(
  "ⓑ 즉시 실패 · 되묻는다",
  instReply.state === "unavailable" && instReply.status === undefined && instAttempts >= 2,
  `state=${instReply.state} · status=${String(instReply.status)} · why=${instReply.why} · 시도 ${instAttempts}회 · 총 ${instMs}ms · warn ${warns.length}줄`,
);

// ── ⓒ 타임아웃(hang) — 🔴 이 그물의 몸통 ────────────────────────────────────
// 매 시도가 «자기» AbortSignal.timeout 을 새로 받는다면 총 경과는 시도수 × 시도예산 + 지연합이다.
// 예산이 공유라면 총 경과는 시도 하나의 예산에서 끝난다. 벽시계가 그 둘을 가른다.
// 🔴 **`AbortSignal.timeout` 의 타이머는 이벤트 루프를 붙잡지 않는다**(unref). 이 그물의
//    「매달림」은 그 타이머 말고 아무것도 대기하지 않으므로, 손을 대지 않으면 Node 가
//    「unsettled top-level await」로 **1초 만에 죽는다**(실측 rc 13 · 1차 실행). 그건 대상의
//    성질이 아니라 내 하네스의 결함이라, 재는 동안만 루프를 깨워 둔다.
stage("hang");
const keepAlive = setInterval(() => {}, 500);
const [hangReply, hangMs] = await timed(() => createSession(""));
clearInterval(keepAlive);
const hangAttempts = calls.length;
const perAttempt = calls.map((c) => c.ms);
const attemptSum = perAttempt.reduce((s, m) => s + m, 0);
const hangSleep = hangMs - attemptSum;
const budget = perAttempt.length ? Math.max(...perAttempt) : 0;
restore();

if (calls.length === 0 || instAttempts === 0) {
  console.log("자극 미실재 — fetch 가 한 번도 불리지 않았다. 통과가 아니라 측정 실패다.");
  process.exit(2);
}

check(
  "ⓒ 타임아웃도 «status 없는 실패»라 되묻는다",
  hangReply.state === "unavailable" && hangReply.status === undefined && hangAttempts >= 2,
  `state=${hangReply.state} · status=${String(hangReply.status)} · why=${hangReply.why} · 시도 ${hangAttempts}회`,
);

// 🔴 red 정의의 출처 = `lib/contract.ts:511` — `attempt()` 가 호출 «마다» `AbortSignal.timeout(timeoutMs)`
//    를 새로 만든다. 그러면 2·3번째 시도의 개별 소요가 1번째와 같은 자리에 있어야 한다.
//    한 시도라도 예산의 절반 아래로 끝났다면 예산이 공유된 것이고, 그때는 아래 총합 외삽이 거짓이 된다.
const shortest = perAttempt.length ? Math.min(...perAttempt) : 0;
check(
  "ⓓ 시도마다 «자기» 예산을 새로 받는다",
  hangAttempts >= 2 && shortest >= budget * 0.5,
  `시도별 ${perAttempt.map(round).join("ms · ")}ms · 최소 ${round(shortest)}ms ≥ 예산 ${round(budget)}ms 의 절반`,
);

check(
  "ⓔ 실패 회차마다 warn 1줄(관측 축)",
  warns.length === hangAttempts,
  `warn ${warns.length}줄 = 시도 ${hangAttempts}회 · 첫 줄 「${warns[0] ?? "-"}」`,
);

// ── 값 (판정 아님 · 정본에 /enter 총 예산 상한 줄이 없다) ────────────────────
note(
  "즉시 실패 형",
  `총 ${instMs}ms = 시도 ${instAttempts}회(≈0ms) + 지연 ${round(instSleep)}ms  ← 실전 뭉치가 이 모양이었다`,
);
note(
  "타임아웃 형",
  `총 ${hangMs}ms = 시도 ${hangAttempts}회 × ≈${round(budget)}ms + 지연 ${round(hangSleep)}ms`,
);
note(
  "배수",
  `타임아웃 형이 즉시 실패 형의 ${(hangMs / Math.max(instMs, 1)).toFixed(1)}배 · 완화 «전»(시도 1회) 대비 ${(hangMs / Math.max(budget, 1)).toFixed(1)}배`,
);

console.log("d12_enter_retry_budget — createSession 의 «시간 예산» 축 (lib/contract.ts 를 그대로 돌린다)\n");
for (const l of lines) console.log(l);
console.log(
  `\n  자기 검증  판정 ${pass + failed}건(기대 ≥4) · 자극 실재 = fetch 총 ${instAttempts + hangAttempts + 1}회 · 매달린 시도 ${hangAttempts}회`,
);
console.log(`\n결과: ${pass}/${pass + failed} 통과 · 실패 ${failed}건`);

// 🔴 「안 쟀다」와 「재 봤더니 나쁘다」를 같은 코드로 내지 않는다.
if (pass + failed < 4) {
  console.log("판정 행이 4건 미만 — 측정 실패다.");
  process.exit(2);
}
process.exit(failed > 0 ? 1 : 0);
