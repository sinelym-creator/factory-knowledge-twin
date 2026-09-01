/**
 * d12b_cause_redaction_probe — D-12b 사유 코드가 «호스트를 흘리는가». 검증 좌석 그물(리바이2 20대 · Q-68).
 *
 * 🔴 **이 그물은 Q-68 착지 «전»에 빨강이 정상이다.** 지금 develop 에서 6행 중 **4행(B·C·D·F)이
 *    LEAK** 이고 rc 1 이다. 그게 이 파일의 존재 이유다 — 초록이 먼저 있고 빨강이 나중인 그물이
 *    아니라, **빨강이 먼저 서고 픽스가 그것을 끄는** 순서다. Q-68 이 병합되면 A~F 가 전부 막혀
 *    rc 0 으로 뒤집혀야 하고, **그 뒤집힘까지가 Q-68 의 판정**이다.
 *
 * 🔴 **왜 필요했나 — 문을 한 쪽으로만 시험하고 있었다.**
 *    구현 드릴(`apps/web-console/scripts/retry-drill.mjs` ⑮⑯)은 「소문자 호스트가 warn 에
 *    **안 남는다**」만 준다. 막는 표본만 있는 문은 «전부 거절하는 문»과 구분되지 않고, 반대로
 *    뚫리는 자리가 있어도 초록이다. 그래서 여기서는 **반대 방향으로 민다.**
 *
 * 🔴 **실제 규칙은 「코드만 남긴다」가 아니었다.** `causeCodeOf` 는 `code`→`name`→`message` 순으로
 *    닿는 문자열에서 `/\b[A-Z][A-Z0-9_]{2,}\b/` 의 **첫 대문자 연속**을 뽑는다. undici 의 `code` 가
 *    마침 대문자 상수라 두 규칙이 같아 보였을 뿐이고, `message` 로 내려가는 순간 그 정규식은
 *    **호스트 라벨도 코드로 읽는다**. `syscall` 에는 모양 가드(`/^[a-z_]{3,20}$/` · 점이 있으면
 *    호스트)가 있는데 코드 토큰 쪽에는 대응물이 없다.
 *
 * 🔴 **도달 조건을 과장하지 않는다** — ⓐ `cause` 에 `code` 가 없고 ⓑ `message`(또는 `errors[]`
 *    안쪽 message)에 대문자를 낀 호스트가 있어야 한다. undici 는 보통 `code` 를 채우고 이 배치의
 *    Funnel 호스트는 전건 소문자다 ⇒ **지금 살아 있는 누출이 아니다.** 그러나 §15.2 는 「값이
 *    새지 않는다」를 요구하지 「지금은 안 샌다」를 요구하지 않는다. 등급 하~중 · 현 진행 비차단.
 *
 * 🔴 **빨강의 정의는 값이 아니라 «내가 심은 호스트»에서 온다.** 케이스마다 심은 호스트를 함께
 *    선언하고, warn 줄의 토큰 중 그 호스트 «안에 들어 있는» 것이 하나라도 있으면 LEAK 이다.
 *    허용 코드 목록을 내가 적으면 그 목록이 곧 판정식이 되어 본체가 바뀐 날에도 초록이 남는다.
 *
 * 🔴 **§한계 행은 «못 막는 것»을 못 막는다고 적는 자리다**(아래 I). 처방이 «형태 가드»인 이상
 *    코드처럼 생긴 호스트(`EDGE1`)는 통과한다. 값 가드(호스트명을 코드에 두는 것)는 그 자체가
 *    §15.2 위반이라 채택 대상이 아니다(오케 판정). 그래서 이 행은 **세어서 인쇄하되 rc 를 물지
 *    않는다** — 「고칠 수 있는데 안 고친 것」과 「구조상 못 막는 것」을 같은 칸에 쓰지 않는다.
 *
 * 🔴 CI 는 이 파일을 돌리지 않는다(`.github/workflows/ci.yml` 에 `tests/web/*.mjs` 실행 0건 ·
 *    실측). 빨강이 서 있어도 게이트를 막지 않는다 — 좌석이 손으로 돌리는 그물이다.
 *
 * 실행:  node --experimental-strip-types tests/web/d12b_cause_redaction_probe.mjs   (리포 루트)
 * rc:    0 = 픽스 대상 누출 0 · 1 = 1건 이상 · 2 = 자극 미실재(측정 실패)
 */

import { createSession } from "../../apps/web-console/lib/contract.ts";

const WARN_PREFIX = "[enter] createSession failed";

let warns = [];
const realWarn = console.warn;
const realFetch = globalThis.fetch;

/** `cause` 를 실은 «미도달» 예외를 던진다 — `attempt()` 의 catch 축으로 접힌다(status 없음). */
function stage(cause) {
  warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  globalThis.fetch = async () => {
    const e = new Error("fetch failed");
    e.name = "TypeError";
    e.cause = cause;
    throw e;
  };
}

/**
 * `[라벨, 심은 호스트, cause, kind]`
 *   kind "fix"   — Q-68 이 막아야 하는 행. 누출이면 rc 1.
 *   kind "limit" — 형태 가드로는 구조상 못 막는 행. 인쇄하되 rc 를 물지 않는다.
 * 🔴 A~F 는 오케·센쿠2 와 «같은 번호»다(재구성본의 정본 대조군). G~I 는 검증 좌석이 더한 행.
 */
const CASES = [
  ["A undici 정형 · code 있음 · 소문자 호스트", "harry.tail488f52.ts.net", {
    code: "ENOTFOUND", syscall: "getaddrinfo", errno: -3008,
    message: "getaddrinfo ENOTFOUND harry.tail488f52.ts.net",
  }, "fix"],
  ["B code 없음 · message 에 대문자 호스트", "HARRY.tail488f52.ts.net", {
    message: "connect failed to HARRY.tail488f52.ts.net:8443",
  }, "fix"],
  ["C code 없음 · 대문자 라벨을 낀 호스트", "FKT-INTERNAL.corp.example", {
    message: "getaddrinfo failed for FKT-INTERNAL.corp.example:8443",
  }, "fix"],
  ["D code 자리에 호스트 문자열", "SECRETHOST.ts.net", {
    code: "SECRETHOST.ts.net", message: "x",
  }, "fix"],
  ["E syscall 자리에 점 있는 호스트", "harry.tail488f52.ts.net", {
    code: "ECONNREFUSED", syscall: "harry.tail488f52.ts.net", errno: -111, message: "y",
  }, "fix"],
  ["F AggregateError · 안쪽 message 에 대문자 호스트", "HARRY.tail488f52.ts.net", {
    errors: [{ message: "connect to HARRY.tail488f52.ts.net failed" }, { code: "ETIMEDOUT" }],
  }, "fix"],
  // ── 검증 좌석 추가분 ──
  ["G name 에 대문자 호스트(code·message 없음)", "VAULT.internal.example", {
    name: "VAULT.internal.example",
  }, "fix"],
  ["H AggregateError · 안쪽 code 가 호스트", "BACKEND.ts.net", {
    errors: [{ code: "BACKEND.ts.net" }],
  }, "fix"],
  // ── 🔴 알려진 한계(형태 가드로는 못 막는다 · rc 를 물지 않는다) ──
  ["I 🔴 한계 · 코드처럼 «생긴» 호스트가 code 에", "EDGE1", {
    code: "EDGE1", syscall: "connect", errno: -111,
  }, "limit"],
];

/** warn 줄에서 «심은 호스트의 조각»을 찾는다 — 허용 목록을 내가 적지 않는 대신 이 방향으로 판정한다. */
function leakedTokens(line, host) {
  const body = line.startsWith(WARN_PREFIX) ? line.slice(WARN_PREFIX.length) : line;
  const H = host.toUpperCase();
  return [...new Set(
    body
      .split(/[\s=]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(t))
      .filter((t) => H.includes(t.toUpperCase())),
  )];
}

const lines = [];
let leaksFix = 0;
let leaksLimit = 0;
let measured = 0;

for (const [name, host, cause, kind] of CASES) {
  stage(cause);
  await createSession("");
  const line = warns[0] ?? "";
  if (line) measured += 1;
  const hit = leakedTokens(line, host);
  if (hit.length) {
    if (kind === "limit") leaksLimit += 1;
    else leaksFix += 1;
    lines.push(
      `  ${kind === "limit" ? "🔵 한계" : "🔴 LEAK"}  ${name}\n` +
        `             → ${line}\n` +
        `             샌 것: ${hit.join(", ")}   (심은 호스트: ${host})`,
    );
  } else {
    lines.push(`  ok       ${name}\n             → ${line || "(warn 0줄)"}`);
  }
}

globalThis.fetch = realFetch;
console.warn = realWarn;

console.log("d12b_cause_redaction_probe — 사유 코드가 호스트를 흘리는가 (lib/contract.ts 를 그대로 돌린다)\n");
for (const l of lines) console.log(l);

const fixable = CASES.filter(([, , , k]) => k !== "limit").length;
console.log(
  `\n  자기 검증  케이스 ${CASES.length}건(픽스 대상 ${fixable} · 한계 ${CASES.length - fixable}) · ` +
    `warn 이 «실제로 난» 회차 ${measured}건(기대 = ${CASES.length})`,
);
console.log(`\n결과: 픽스 대상 누출 ${leaksFix}/${fixable} · 알려진 한계 ${leaksLimit}`);
console.log(
  leaksFix > 0
    ? "🔴 Q-68 미착지 상태에서는 이 빨강이 «정상»이다 — 픽스가 이 행들을 끄는 것까지가 판정이다."
    : "🟢 픽스 대상 전건 막힘. 🔵 한계 행은 여전히 통과한다 — 형태 가드의 구조적 잔여다(값 가드는 §15.2 위반이라 채택 안 함).",
);

// 🔴 자극이 안 선 회차가 있으면 「막혔다」가 아니라 「못 쟀다」다.
if (measured !== CASES.length) {
  console.log("warn 이 나지 않은 회차가 있다 — 통과도 실패도 아닌 측정 실패다.");
  process.exit(2);
}
process.exit(leaksFix > 0 ? 1 : 0);
