/**
 * 정적 replay 진입 표지 — 🔴 **자산과 «같은 파일에 두지 않는다**(T4-2a).
 *
 * `proxy.ts`(미들웨어)와 앱바가 이 값을 읽는다. `lib/static-replay/index.ts` 에 함께 두면
 * 그 모듈을 import 하는 순간 자산 모듈(111KB 조회 사본 · 14KB 이벤트)이 같은 그래프에
 * 들어오고, 첫 화면·미들웨어 번들에 쓰지도 않을 것이 실린다(§17.1 · Q-50 · 오케 제약 ①).
 * 상수와 판정만 여기 두면 그 그래프가 자산에 닿지 않는다.
 */

/**
 * 정적 재생의 runId. 🔴 서버 id 형식(`RUN-<hex>`)을 **흉내내지 않는다** — 형식이 같으면
 * 로그·화면에서 서버 run 과 구별되지 않고, 누군가 이 id 로 서버에 물어보게 된다.
 */
export const STATIC_RUN_ID = "STATIC-GS-01";

/**
 * 이 값이 `?run=` 으로 오면 정적 경로다.
 *
 * 🔴 **상수 일치로 본다** — 형식(정규식)으로 열면 그 형식에 맞는 임의 값이 다 들어오는데,
 *    여는 것은 이 하나뿐이어야 한다. 🔴 셸 내부 규약이며 계약 표면이 아니다.
 */
export const isStaticRun = (run: string | undefined | null): boolean => run === STATIC_RUN_ID;
