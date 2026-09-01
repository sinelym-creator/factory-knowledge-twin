/**
 * 시각 표기 — 🔴 **서버와 브라우저가 «같은 글자»를 내야 한다** (D-2 픽스).
 *
 * `/overview` 가 React #418(hydration text mismatch)을 확률적으로 냈다(검증 실측 2/12 ·
 * 대조군 `/compare` 0/6). 원인은 두 겹이었다:
 *   ① **값이 달랐다** — `new Date()` 를 렌더 안에서 불러, 서버가 그린 초와 브라우저가
 *      하이드레이트한 초가 다르면 글자가 갈렸다(같은 초면 우연히 통과 — 그래서 확률적).
 *   ② **형식이 다를 수 있다** — `toLocaleTimeString("ko-KR")` 은 Node 와 브라우저의 ICU·
 *      기본 시간대에 기댄다. ①을 고쳐 값을 고정해도 이 축이 남으면 같은 병이 다시 난다.
 *
 * 그래서 값은 «서버가 정한 한 순간»을 prop 으로 내려받고, 형식은 여기서 **ICU 없이 손으로**
 * 만든다. `Intl` 을 쓰지 않는 이유가 그것이다 — 런타임 두 곳이 같은 표를 갖고 있다는 보장이
 * 없는데, 그 보장을 전제하면 이 버그의 ②를 「아마 괜찮다」로 남기는 것이 된다.
 *
 * 🔴 **시간대를 «숨기지» 않는다.** 리포의 모든 응답 시각은 ISO `Z` 다(검증 실측 1,211건 전부).
 *    그것을 현지 시각처럼 보이게 바꿔 놓고 꼬리표를 안 달면, 보는 사람은 자기 시간대라고
 *    읽는다. 고정 오프셋으로 옮기고 `KST` 를 함께 적는다.
 */

/** 표시 시간대 — 고정 오프셋 하나. 한국은 DST 가 없어 오프셋이 상수다. */
const KST_OFFSET_MIN = 9 * 60;
export const TZ_LABEL = "KST";

function shifted(iso: string): Date | null {
  const ms = Date.parse(iso);
  // 🔴 못 읽은 시각을 «지금»이나 0으로 메우지 않는다 — 지어낸 시각은 틀려도 그럴듯하다.
  if (Number.isNaN(ms)) return null;
  return new Date(ms + KST_OFFSET_MIN * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `HH:MM:SS` — 알람 발생 시각·갱신 시각처럼 «오늘 안»을 읽는 자리. */
export function clock(iso: string): string | null {
  const d = shifted(iso);
  if (d === null) return null;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** `YYYY-MM-DD HH:MM` — 날짜가 오늘이 아닐 수 있는 자리(seed 알람은 며칠 전이다). */
export function stamp(iso: string): string | null {
  const d = shifted(iso);
  if (d === null) return null;
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}
