/**
 * 계약 v0.1 표면 — 🔴 클라이언트가 부르는 «모든» 경로가 이 파일 안에 있다.
 *
 * packages/contracts/rest-api-v0.1.md (동결) 중 이 셸이 쓰는 것:
 *   POST /api/sessions              → { sessionId }        (입장 시 1회)
 *   POST /api/sessions/{sid}/reset  → { ok: true }         (리셋 버튼)
 *   GET  /api/live/status           → { online, checkedAt } (모드 배지 · 30s polling)
 *
 * 🔴 계약 밖 경로를 여기서 만들지 않는다. 새 경로가 필요해 보이면 코드가 아니라 오케에 간다
 *    — 계약은 동결이고, 화면이 필요로 한다는 이유로 표면이 늘어나면 계약이 사후 추인이 된다.
 *
 * 🔴 백엔드 미연결·501을 «오류»로 다루지 않는다. ai-api는 미구현 라우트에 501을 내도록 서 있고
 *    (T1-8), 지금 이 셸의 관심사는 「연결되었는가」이지 「구현되었는가」가 아니다. 두 경우 모두
 *    unavailable 상태로 접어 화면에 «미연결»로 표시한다 — 빨간 오류로 보이면 없는 결함을 보고하게 된다.
 */

export const CONTRACT = {
  createSession: "/api/sessions",
  resetSession: (sid: string) => `/api/sessions/${encodeURIComponent(sid)}/reset`,
  liveStatus: "/api/live/status",
} as const;

/** 계약 표면 대조용 — 이 셸이 부르는 경로 «전수»(테스트·검수가 이 목록을 계약과 맞춘다). */
export const CONTRACT_SURFACE = [
  "POST /api/sessions",
  "POST /api/sessions/{sid}/reset",
  "GET /api/live/status",
] as const;

export type LiveStatus = { online: boolean; checkedAt: string };

/**
 * 미연결(백엔드 부재·501·타임아웃)과 «응답» 을 구분해 돌려준다.
 *
 * 🔴 `setCookie`는 ai-api가 내려보낸 `Set-Cookie` 헤더 «원문»이다(T3-1). 셸이 쿠키 «이름»을
 *    자기 코드에 적지 않기 위해 헤더를 통째로 들고 다닌다 — 이름을 두 번째 자리에 적는 순간
 *    한쪽만 자라고, 그때 화면은 살아 있다고 그리는데 서버는 401을 답한다.
 * 🔴 이 값은 로그·캐시에 싣지 않는다(공개 경계 · 오케 단서 ⓐ).
 */
export type Reply<T> =
  | { state: "ok"; data: T; setCookie?: string }
  | { state: "unavailable"; why: string };

const TIMEOUT_MS = 2000;

/**
 * 브라우저는 상대 경로를 쓴다(next.config.ts의 rewrite가 ai-api로 넘긴다 — 계약 경로가
 * 화면 코드에 «그대로» 남게 하려는 것이다). 서버·미들웨어에는 상대 경로가 없으므로 base가 필요하다.
 */
export function apiBase(): string {
  return process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";
}

async function call<T>(path: string, init?: RequestInit, base = ""): Promise<Reply<T>> {
  try {
    const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 501) return { state: "unavailable", why: "미구현(501)" };
    if (!res.ok) return { state: "unavailable", why: `HTTP ${res.status}` };
    const setCookie = res.headers.get("set-cookie") ?? undefined;
    return { state: "ok", data: (await res.json()) as T, setCookie };
  } catch (e) {
    // 연결 거부·타임아웃·JSON 파손 — 전부 「지금은 못 물어본다」로 같다.
    return { state: "unavailable", why: e instanceof Error ? e.name : "unknown" };
  }
}

export function createSession(base = ""): Promise<Reply<{ sessionId: string }>> {
  // 🔴 `no-store` — 세션 발급 응답은 캐시에 남을 물건이 아니다(쿠키가 실려 있다).
  return call<{ sessionId: string }>(
    CONTRACT.createSession,
    { method: "POST", cache: "no-store" },
    base,
  );
}

export function resetSession(sid: string, base = ""): Promise<Reply<{ ok: boolean }>> {
  return call<{ ok: boolean }>(CONTRACT.resetSession(sid), { method: "POST" }, base);
}

export function liveStatus(base = ""): Promise<Reply<LiveStatus>> {
  return call<LiveStatus>(CONTRACT.liveStatus, { cache: "no-store" }, base);
}
