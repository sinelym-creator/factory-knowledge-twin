/**
 * 세션 쿠키 — P0 11항 중 «세션 격리»의 클라이언트 쪽 절반.
 *
 * 값 형식 = `{origin}:{id}`.
 *
 * 🔴 origin을 함께 담는 이유(baseline §0.2 측정-주장 경계):
 *    `api`     = ai-api가 `POST /api/sessions`로 «발급»한 sessionId. 서버가 아는 세션이다.
 *    `pending` = 백엔드에 닿지 못해 브라우저 쪽에서 임시로 만든 id. 화면은 돌지만 서버는
 *                이 세션을 모른다. 둘을 같은 칩으로 보여 주면 「세션 격리가 동작한다」는
 *                거짓 인상을 준다 — 그래서 상태를 값에 실어 배너·툴팁이 사실대로 말하게 한다.
 */

export const SESSION_COOKIE = "fkt_session";

/**
 * 입장이 끝나면 가는 자리 — 🔴 **한 곳에만 적는다**(D-3).
 *
 * 두 층이 같은 목적지를 안다: 핸들러의 303 `Location`(JS 없는 방문자)과 클라이언트의
 * 항해(JS 있는 방문자). 두 곳에 문자열을 따로 적으면 목적지가 바뀌는 날 한쪽만 바뀌고,
 * 그때 갈리는 것은 «JS 가 있는 사람과 없는 사람이 서로 다른 화면에 도착한다»는 형태라
 * 아무도 즉시 알아채지 못한다.
 */
export const ENTRY_DESTINATION = "/overview";

export type SessionOrigin = "api" | "pending";
export type Session = { id: string; origin: SessionOrigin };

export function formatSession(s: Session): string {
  return `${s.origin}:${s.id}`;
}

export function parseSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const at = raw.indexOf(":");
  if (at < 1) return null;
  const origin = raw.slice(0, at);
  const id = raw.slice(at + 1);
  if (!id || (origin !== "api" && origin !== "pending")) return null;
  return { id, origin };
}

/** 세션 칩 표기 = sessionId 앞 4자(wireframes §0). */
export function chipLabel(s: Session): string {
  return s.id.slice(0, 4);
}
