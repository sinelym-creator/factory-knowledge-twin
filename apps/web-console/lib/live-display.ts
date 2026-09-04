/**
 * Live 배지의 «보이는 값» 규칙 — D-53 처방 2.
 *
 * 🔴 **화면 없이 잴 수 있어야 해서 여기 있다.** 이 규칙은 창(45초)이 지나야만 값을 내는데,
 *    폴링이 도는 동안에는 성공이든 실패든 상태가 «갱신»되어 낡을 틈이 없다 — 즉 브라우저
 *    축으로는 자극을 만들기 어렵고, 그대로 두면 「한 번도 발동하지 않은 초록」이 남는다.
 *    규칙을 순수 함수로 떼어 두면 그 발동을 «세면서» 잴 수 있다.
 * 🔴 컴포넌트 파일에 두지 않는 이유는 하나 더 있다: 그 파일은 `@/` 별칭으로 여러 모듈을
 *    끌어오는데, 이 리포의 vitest 는 그 별칭을 풀지 못한다(실측). 규칙만 여기 두면 테스트가
 *    상대 경로로 그 규칙에 닿는다.
 */

/** 🔴 값 집합은 계약이다 — 늘리지 않는다(`data-mode` 를 읽는 그물이 이 넷을 센다). */
export type LiveMode = "checking" | "live" | "replay" | "unavailable";

/**
 * 🔴 **우선순위: 세션 만료가 이긴다**(오케 판정선). 세션이 없다는 것은 «확인된» 사실이고
 *    신선도는 「모른다」이므로, 아는 것을 모르는 것으로 덮지 않는다.
 * 🔴 **낡음을 씌우는 대상은 `live`·`replay` 뿐이다.** 그 둘만이 「지금 이렇다」고 주장한다 —
 *    `unavailable` 은 이미 「못 물어봤다」이고, 그것을 「확인 중」으로 내리면 아는 실패가
 *    모르는 상태로 후퇴한다.
 * 🔴 **원값은 안 건드린다** — 바뀌는 것은 «보이는» 사본뿐이고, 폴링이 답한 값은 그대로 산다.
 */
export function displayState<T extends { mode: LiveMode; why: string | null; sessionExpired: boolean }>(
  state: T,
  stale: boolean,
): T {
  if (state.sessionExpired) return { ...state, mode: "unavailable", why: "재입장 필요" };
  if (stale && (state.mode === "live" || state.mode === "replay")) {
    return { ...state, mode: "checking" };
  }
  return state;
}
