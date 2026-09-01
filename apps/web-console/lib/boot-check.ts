/**
 * 부팅 검사 본체 — 🔴 **Node 런타임 전용**. `instrumentation.ts` 가 «동적 import» 로만 부른다.
 *
 * 정적 import 로 두면 Next 가 이 코드를 Edge 번들에도 넣고, Edge 에는 `process.exit` 가 없어
 * 빌드가 「Ecmascript file had an error」를 낸다(실측). 런타임 분기만으로는 그 정적 분석을
 * 통과하지 못한다 — 코드가 «거기 있다»는 것 자체가 문제이므로, 모듈을 갈라 놓는다.
 *
 * 있었던 일(실측 · T4-1): `FKT_API_BASE` 가 두 층에서 각각 섰다. 빌드 8003 / start 9999 로
 * 갈라 띄웠더니 브라우저 경유 `/api/*` 는 8003 이 답하고(그 401 이 ai-api 자기 로그에 있다)
 * 서버 렌더·입장 핸들러는 9999 로 나가 미연결이 됐다. 세션은 pending 으로 떨어졌다.
 * 🔴 그런데 화면은 **「Live AI 연결이 끊겨 Replay로 전환했습니다」**라는 평상시 문구를 띄웠다 —
 *    설정 사고가 정상 상태와 «구별되지 않았다». 그것이 이 결함의 몸통이다.
 *
 * 그래서 실패를 «가장 눈에 보이는» 자리로 옮긴다: 부팅이 죽는다. 화면 배너·콘솔 경고 같은
 * 부드러운 신호는 쓰지 않는다 — 그것은 「정상처럼 보이는 자리」를 하나 더 만드는 일이고,
 * 이 결함이 정확히 그 형태였다.
 *
 * 🔴 실패 «방향»: 런타임 env 를 안 주면 통과한다(빌드 값이 정본이므로 모호함이 없다).
 *    주었는데 다를 때만 죽는다 — 「목적지를 바꾼 줄 알았는데 안 바뀐 채로 도는 것」이
 *    이 검사가 막는 유일한 사건이다.
 */
export function assertApiBaseMatchesBuild(): void {
  // 빌드 시점에 인라인된 상수(next.config.ts 의 `env`) — 이 값이 정본이다.
  const built = process.env.FKT_API_BASE_BUILD;
  // 런타임 환경변수 — 여기서는 «대조용»으로만 읽는다.
  const runtime = process.env.FKT_API_BASE;

  if (!runtime || !built || runtime === built) return;

  // 🔴 값을 그대로 찍는다. 이 둘은 «목적지 주소»이고 자격 증명이 아니다 — 가려 놓으면
  //    운영자가 무엇을 고쳐야 하는지 알 수 없다(공개 경계는 secret·경로이지 base URL 이 아니다).
  console.error(
    `[FKT] 부팅 중단 — FKT_API_BASE 가 빌드 값과 다릅니다.\n` +
      `      빌드(정본): ${built}\n` +
      `      런타임    : ${runtime}\n` +
      `      이 셸의 목적지는 «빌드 시점»에 구워집니다(rewrite 가 빌드 산출물에 있습니다).\n` +
      `      목적지를 바꾸려면 그 값으로 «재빌드»하십시오 — start 에만 주면 브라우저와 서버가\n` +
      `      서로 다른 ai-api 를 보게 되고, 그 상태는 화면에서 평상시 fallback 과 구별되지 않습니다.`,
  );
  process.exit(1);
}

/**
 * `FKT_PUBLIC_HTTPS` 대조 (D-4 · 2026-08-31) — 🔴 `FKT_API_BASE` 와 **같은 원칙·같은 자리**다.
 *
 * 이 값도 «빌드 시점»에 구워진다: `next.config.ts` 의 `headers()` 가 그것을 읽어 HSTS 를
 * 붙일지 정하고, 그 결정은 빌드 산출물에 남는다. 그래서 `start` 에만 주면 아무 일도
 * 일어나지 않는다 — HSTS 없이 공개로 나가면서 **화면에는 아무 표시가 없다**(리바이2 13대 실측).
 * 「켰다고 생각했는데 안 켜진 것」이 이 검사가 막는 유일한 사건이다.
 *
 * 🔴 값을 자격 증명처럼 가리지 않는다 — `1`/빈 값 둘 중 하나이고, 운영자가 무엇을 고쳐야
 *    하는지 알아야 한다. 🔴 실패 방향도 같다: 런타임에 «안 주면» 통과한다(빌드 값이 정본이다).
 */
export function assertPublicHttpsMatchesBuild(): void {
  const built = process.env.FKT_PUBLIC_HTTPS_BUILD;
  const runtime = process.env.FKT_PUBLIC_HTTPS;

  // 🔴 `built` 가 undefined 인 경우는 이 셸이 D-4 이전 빌드라는 뜻이다 — 그때는 대조할
  //    정본이 없으므로 통과한다(없는 기준으로 죽이지 않는다).
  if (runtime === undefined || built === undefined || runtime === built) return;

  console.error(
    `[FKT] 부팅 중단 — FKT_PUBLIC_HTTPS 가 빌드 값과 다릅니다.\n` +
      `      빌드(정본): ${built === "" ? "(없음)" : built}\n` +
      `      런타임    : ${runtime === "" ? "(없음)" : runtime}\n` +
      `      HSTS 부착은 «빌드 시점»에 결정돼 산출물에 구워집니다(next.config.ts headers).\n` +
      `      값을 바꾸려면 그 값으로 «재빌드»하십시오 — start 에만 주면 HSTS 가 붙지 않은 채\n` +
      `      돌고, 그 상태는 화면·응답 어디에도 표시되지 않습니다.`,
  );
  process.exit(1);
}
