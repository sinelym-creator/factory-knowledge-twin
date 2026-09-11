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

/**
 * 🔴 **입장 바운스가 목적지를 살리는 자리 — 규칙은 여기 하나다**(설계 `docs/design/d96-entry-bounce-next.md` §3).
 *
 * 세션 없는 방문자가 `/overview?intro=1&tour=1` 로 오면 지금까지는 307 이 쿼리를 떼고 303 이
 * 고정 목적지로 보내, 「무엇을 하러 왔는가」가 사슬 중간에서 사라졌다(#955·#959 실측).
 * 그 신호를 되살리는 일은 **그대로 열린 리다이렉트가 될 수 있다** — 그래서 규칙을 부정형
 * (「나쁜 것을 막는다」)이 아니라 **긍정형 허용 목록**으로 쓴다: 목록에 없는 것은 전부 `null`.
 *
 * 🔴 **통과한 입력을 그대로 내보내지 않고 «재조립»한다.** 검사한 문자열과 출력한 문자열이
 *    같으면 둘 사이에 남는 해석 차(인코딩·중복 키·대소문자)가 곧 구멍이 된다. 여기서는 파싱해서
 *    허용된 조각만 다시 쓴다 — 이 함수가 낼 수 있는 문자열의 집합이 **유한**해진다.
 * 🔴 실패는 조용하다(`null`). 방문자에게 「그 주소는 안 됩니다」라고 말할 이유가 없고,
 *    로그로 남길 이유도 없다 — 기본 목적지로 가면 화면은 그대로 성립한다.
 */
const NEXT_MAX_LEN = 512;
/** 🔴 경로 허용 목록 = 지금 결함이 난 자리 하나. 늘릴 이유가 생기면 그때 한 줄 더한다. */
const NEXT_ALLOWED_PATHS = new Set(["/overview"]);
/** 🔴 키 허용 목록. 값도 고정 — `intro=2` 같은 것을 통과시키면 그 뜻을 우리가 모른다. */
const NEXT_ALLOWED_QUERY: ReadonlyArray<readonly [string, string]> = [
  ["intro", "1"],
  ["tour", "1"],
];

export function resolveNext(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > NEXT_MAX_LEN) return null;
  // 🔴 스킴·프로토콜 상대·역슬래시는 «경로가 아니다». `\` 를 따로 보는 이유: 일부 파서가
  //    그것을 `/` 로 읽어 `/\evil.com` 이 `//evil.com` 이 된다.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes(":")) {
    return null;
  }
  // 🔴 제어문자·공백이 섞인 값은 버린다 — 헤더에 실리는 문자열이라 줄바꿈 하나가 응답을 쪼갠다.
  if (/[\u0000-\u0020]/.test(raw)) return null;

  let url: URL;
  try {
    // 기준 오리진은 «버려진다» — 우리는 pathname·searchParams 만 읽는다.
    url = new URL(raw, "http://localhost");
  } catch {
    return null;
  }
  // 🔴 `%2e%2e` 같은 인코딩은 여기서 이미 풀려 있다 — 그래서 **디코드된 pathname** 으로
  //    목록을 본다. 대소문자도 그대로 본다: `/OVERVIEW` 는 목록에 없으므로 거절이다(라우팅이
  //    대소문자를 구분하므로 「같은 화면」으로 쳐 주면 우리가 모르는 자리로 보내게 된다).
  if (!NEXT_ALLOWED_PATHS.has(url.pathname)) return null;

  // 🔴 재조립 — 허용된 키가 «있을 때만» 그 순서로 다시 쓴다. 중복 키(`?intro=1&intro=2`)는
  //    `get` 이 첫 값만 보므로 값 검사에서 갈린다.
  const kept = NEXT_ALLOWED_QUERY.filter(([key, value]) => url.searchParams.get(key) === value);
  const query = kept.map(([key, value]) => `${key}=${value}`).join("&");
  return query ? `${url.pathname}?${query}` : url.pathname;
}

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
