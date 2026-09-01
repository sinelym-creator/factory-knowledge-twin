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
 * ── 24대 갱신(2026-09-01 · Q-70 처방 PR#349 `70b5a4b` 착지 뒤) ──────────────────
 * 🔴 **ⓒⓓⓔ 는 «낡은 기대값»이었다 — 검출력을 낮춘 것이 아니라 세계가 바뀐 것이다.**
 *    20대가 이 그물을 세울 때 본체는 시도마다 `ENTER_TIMEOUT_MS`(8s)를 새로 받았고,
 *    그래서 ⓒ 는 「타임아웃도 되묻는다(시도 ≥2)」·ⓓ 는 「시도마다 자기 예산」을 red 정의로
 *    삼았다. Q-70 처방이 예산의 주어를 «시도»에서 «호출 전체»(`ENTER_TOTAL_BUDGET_MS`)로
 *    옮겼으므로 그 두 행은 **설계상 빨강**이 된다. 기대값을 새 설계로 옮긴다.
 *
 * 🔴 **그러나 갱신은 «지우기»가 아니다.** 낡은 기대값을 지우면서 검출력을 함께 지우면
 *    아무도 모른다 — 그래서 이 갱신은 행을 **5 → 7 로 늘린다**:
 *      · ⓑ = **대조군 열** — 즉시 실패형의 재시도는 **살아 있어야** 한다(D-12 가 산 축).
 *              「예산을 씌웠더니 재시도가 통째로 죽었다」면 여기서 빨강이 난다.
 *      · ⓕ = **다회 시도에서** 예산이 자르는가(타임아웃형은 시도가 1회뿐이라 «총 예산»과
 *              «시도 예산»을 못 가른다 — 느린 실패형에서만 두 세계가 갈린다).
 *      · ⓖ = Q-70 판정선(총 ≤8s)을 **명시적 red 정의**로.
 *
 * 🔴 **red 정의의 출처**(어느 줄에서 왔는지 적는다):
 *      · ⓒⓓⓕ = `apps/web-console/lib/contract.ts` `createSession` — 예산의 기점이
 *        「이 함수 진입」이고 상한이 「시도 하나가 아니라 합」이라는 본체 주석(`:927`).
 *      · ⓖ 8,000ms = 원장 `docs/plan/ticket-ledger.md` Q-70 처방 「네트워크 층 실패 즉시
 *        반환 + **총 상한 ≤8s**」 + 오케 발주 판정선(2026-09-01). 🔴 이 숫자만이 이 파일에
 *        적힌 유일한 «값»이다 — 나머지 판정식은 본체에서 관측해 유도한다.
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

// ── 판정선과 자극 크기 ──────────────────────────────────────────────────────
/**
 * 🔴 **이 파일에 적힌 유일한 «값»**(ⓖ) — 출처 = 원장 Q-70 처방 「총 상한 ≤8s」 + 오케 발주.
 *    본체 상수(`ENTER_TOTAL_BUDGET_MS`)를 import 하지 «않는다»: 본체에서 가져오면 본체가
 *    30s 로 늘어난 날에도 그물이 초록을 낸다 — 그때 이 그물은 「지키는 쪽」이 아니라
 *    「따라가는 쪽」이 된다. 판정선은 정본에서 오고, 본체는 그 선을 만족하는지 «잰다».
 */
const BUDGET_MS = 8000;
/** 벽시계·이벤트 루프 오차 여유. 판정선이 아니라 계측 여유다 — 넉넉히 두되 자릿수는 안 넘긴다. */
const SLACK_MS = 700;
/**
 * 느린 실패 한 시도의 비용(ⓕ). 🔴 두 세계가 «갈리도록» 고른 값이다:
 *   · 총 예산 세계 — 시도 2회에서 남은 예산이 최소 시도분에 못 미쳐 잘린다(합 < 8s).
 *   · 시도별 예산 세계 — 3회 다 돌아 3·3000 + 지연 1,200 = 10.2s 로 **상한을 넘는다**.
 * 값을 반으로 줄이면 두 세계가 같은 초록을 내므로, 이 그물은 아무것도 가르지 못한다.
 */
const SLOW_FAIL_MS = 3000;

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
 *   "slow"    — 🔴 **시도가 «끝나되 느리다»**(`SLOW_FAIL_MS` 뒤 `TypeError`). 이 모드가
 *               필요한 이유: hang 은 첫 시도가 예산을 통째로 먹어 시도가 **1회뿐**이라
 *               「총 예산」과 「시도 예산」이 같은 값으로 보인다 — 두 세계가 안 갈린다.
 *               시도가 여러 번 도는데도 합이 상한에서 잘리는 것을 보려면 이 모드라야 한다.
 *               (시도별 예산 세계라면 3회 = 3·SLOW + 지연 1.2s 로 상한을 넘긴다.)
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
    if (mode === "slow") {
      // 🔴 호출자의 타임아웃보다 «먼저» 스스로 끝난다 — 이 시도의 비용은 SLOW_FAIL_MS 다.
      return new Promise((_resolve, reject) => {
        setTimeout(() => {
          rec.ms = Date.now() - t0;
          const e = new Error("fetch failed");
          e.name = "TypeError";
          reject(e);
        }, SLOW_FAIL_MS);
      });
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
// 🔴 **이 행이 갱신의 대조군이다.** Q-70 처방은 예산을 씌우는 처방이라, 「씌웠더니 재시도가
//    통째로 죽었다」가 가장 그럴듯한 부작용이다. D-12 가 산 축(즉시 실패형은 되묻는다)이
//    살아 있음을 여기서 «먼저» 보이지 않으면, 아래 ⓒ 의 「1회」는 개선인지 퇴행인지 못 가른다.
const instWarns = warns.length;
const instBudgetCut = warns.filter((w) => /budget/i.test(w)).length;
check(
  "ⓑ 대조군 · 즉시 실패는 여전히 되묻는다(예산이 재시도를 죽이지 않았다)",
  instReply.state === "unavailable" &&
    instReply.status === undefined &&
    instAttempts >= 2 &&
    instBudgetCut === 0,
  `state=${instReply.state} · status=${String(instReply.status)} · why=${instReply.why} · 시도 ${instAttempts}회 · 총 ${instMs}ms · warn ${instWarns}줄 · 예산컷 ${instBudgetCut}줄(기대 0 = 회차 소진으로 끝남)`,
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
const hangWarns = warns.length;
const hangBudgetCut = warns.filter((w) => /budget/i.test(w)).length;
const hangFirstWarn = warns[0] ?? "-";

// ── ⓕ 느린 실패(slow) — 🔴 «다회 시도»에서 예산이 자르는가 ──────────────────
// 타임아웃형은 첫 시도가 상한을 통째로 먹어 시도가 1회뿐이다. 그 표본만으로는
// 「총 예산이 걸렸다」와 「시도 예산이 걸렸다」가 **같은 숫자**를 낸다 — 아무것도 안 갈린다.
// 시도가 여러 번 돌면서도 합이 잘리는 것을 봐야 새 설계가 실재한다고 말할 수 있다.
stage("slow");
const [slowReply, slowMs] = await timed(() => createSession(""));
const slowAttempts = calls.length;
const slowPer = calls.map((c) => c.ms);
const slowWarns = warns.length;
const slowBudgetCut = warns.filter((w) => /budget/i.test(w)).length;
restore();

if (calls.length === 0 || instAttempts === 0 || hangAttempts === 0) {
  console.log("자극 미실재 — fetch 가 한 번도 불리지 않았다. 통과가 아니라 측정 실패다.");
  process.exit(2);
}

check(
  "ⓒ 타임아웃은 «status 없는 실패»로 접히되 시도 1회에서 끝난다",
  hangReply.state === "unavailable" && hangReply.status === undefined && hangAttempts === 1,
  `state=${hangReply.state} · status=${String(hangReply.status)} · why=${hangReply.why} · 시도 ${hangAttempts}회(기대 1) · 총 ${hangMs}ms`,
);

// 🔴 red 정의의 출처 = `lib/contract.ts` `createSession` — 「예산의 기점은 이 함수 진입이고
//    상한이 걸리는 것은 시도 하나가 아니라 합」. 그러면 타임아웃형의 총 경과는 **시도 하나의
//    예산에서 끝나야** 한다(지연도 없다 — 두 번째 시도가 아예 시작되지 않으므로).
//    🔴 이 행은 상수를 쓰지 않는다: 예산값이 얼마든 「총 ≈ 시도 하나」라는 «형태»를 잰다.
check(
  "ⓓ 예산은 시도가 아니라 호출 전체에 걸린다(총 ≈ 시도 하나)",
  hangMs <= budget + SLACK_MS && attemptSum === budget,
  `총 ${hangMs}ms ≤ 시도 하나 ${round(budget)}ms + 여유 ${SLACK_MS}ms · 시도합 ${round(attemptSum)}ms · 지연 ${round(hangSleep)}ms`,
);

// 🔴 문면 결합은 낱말 하나(`budget`)까지만 — 본체가 이 낱말을 지우면 이 행이 빨강이 된다.
//    그건 오탐이 아니라 「두 종결 사유를 가르던 관측 축이 사라졌다」는 신호다.
check(
  "ⓔ warn = 실패 회차 수 + 예산이 잘랐을 때만 1줄(두 종결 사유가 갈린다)",
  hangWarns === hangAttempts + 1 &&
    hangBudgetCut === 1 &&
    instWarns === instAttempts &&
    instBudgetCut === 0,
  `타임아웃형 warn ${hangWarns}줄 = 시도 ${hangAttempts} + 예산컷 ${hangBudgetCut} · 즉시형 warn ${instWarns}줄 = 시도 ${instAttempts} + 예산컷 ${instBudgetCut} · 첫 줄 「${hangFirstWarn}」`,
);

check(
  "ⓕ 다회 시도에서도 예산이 회차보다 먼저 자른다(느린 실패형)",
  slowAttempts >= 2 && slowAttempts < instAttempts && slowBudgetCut === 1 && slowMs <= BUDGET_MS + SLACK_MS,
  `시도 ${slowAttempts}회(즉시형 ${instAttempts}회보다 적다) · 시도별 ${slowPer.map(round).join("ms · ")}ms · 총 ${slowMs}ms · 예산컷 ${slowBudgetCut}줄 · warn ${slowWarns}줄`,
);

// 🔴 ⓖ 만이 숫자를 판정선으로 쓴다 — 출처 = 원장 Q-70 처방 「총 상한 ≤8s」.
check(
  `ⓖ Q-70 판정선 — 미도달 실패는 총 ${BUDGET_MS}ms 안에 반환된다`,
  hangMs <= BUDGET_MS + SLACK_MS && slowMs <= BUDGET_MS + SLACK_MS && instMs <= BUDGET_MS + SLACK_MS,
  `타임아웃형 ${hangMs}ms · 느린 실패형 ${slowMs}ms · 즉시 실패형 ${instMs}ms · 모두 ≤ ${BUDGET_MS}+${SLACK_MS}ms`,
);

// ── 값 (판정 아님) ───────────────────────────────────────────────────────────
note(
  "즉시 실패 형",
  `총 ${instMs}ms = 시도 ${instAttempts}회(≈0ms) + 지연 ${round(instSleep)}ms  ← 실전 뭉치가 이 모양이었다(D-12)`,
);
note(
  "타임아웃 형",
  `총 ${hangMs}ms = 시도 ${hangAttempts}회 × ≈${round(budget)}ms + 지연 ${round(hangSleep)}ms  ← 20대 실측(처방 전) 25,230ms / 3회`,
);
note(
  "느린 실패 형",
  `총 ${slowMs}ms = 시도 ${slowAttempts}회 × ≈${SLOW_FAIL_MS}ms + 지연 ${round(slowMs - slowPer.reduce((s, m) => s + m, 0))}ms  ← 시도별 예산 세계였다면 3회 = ${3 * SLOW_FAIL_MS + 1200}ms`,
);
note(
  "배수",
  `타임아웃 형이 즉시 실패 형의 ${(hangMs / Math.max(instMs, 1)).toFixed(1)}배 · 처방 전 25,230ms 대비 ${(25230 / Math.max(hangMs, 1)).toFixed(1)}배 단축(전언 — 20대 값)`,
);

console.log("d12_enter_retry_budget — createSession 의 «시간 예산» 축 (lib/contract.ts 를 그대로 돌린다)\n");
for (const l of lines) console.log(l);
console.log(
  `\n  자기 검증  판정 ${pass + failed}건(기대 ≥7) · 자극 실재 = fetch 총 ${instAttempts + hangAttempts + slowAttempts + 1}회 · 매달린 시도 ${hangAttempts}회 · 느린 시도 ${slowAttempts}회`,
);
console.log(`\n결과: ${pass}/${pass + failed} 통과 · 실패 ${failed}건`);

// 🔴 「안 쟀다」와 「재 봤더니 나쁘다」를 같은 코드로 내지 않는다.
if (pass + failed < 7) {
  console.log("판정 행이 4건 미만 — 측정 실패다.");
  process.exit(2);
}
process.exit(failed > 0 ? 1 : 0);
