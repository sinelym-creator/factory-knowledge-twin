"use client";

import { useSyncExternalStore } from "react";

/**
 * 정적 replay 방문자 상태 — browser storage (T4-2a ⓒ · baseline §14.1).
 *
 * 🔴 **서버 세션이 없다.** 정적 경로에는 상태를 맡길 서버가 없으니 격리 단위는 «브라우저»다
 *    (§14.1 「방문자 상태 = Browser storage」). 새 브라우저는 백지에서 시작하고, 같은
 *    브라우저는 되감기 위치와 열람 이력을 되찾는다.
 *
 * 🔴 **서버 세션 이름을 쓰지 않는다**(오케 가드레일 ②). `fkt_session`·`fkt_sid` 는 서버가
 *    발급하고 서버가 읽는 이름이다. 정적 방문자가 그 이름을 쓰면 서버 눈에 «있는 세션»인
 *    척하게 되고, 그것은 위조다. 그래서 별 이름·별 저장소(localStorage)에 담는다.
 *
 * 🔴 **읽기·쓰기 전부 try/catch.** 프라이빗 창·사이트 데이터 차단·용량 초과에서 접근 자체가
 *    던진다. 상태를 못 읽는 것은 「화면이 고장」이 아니라 「기억이 없다」이므로, 백지로
 *    돌려주고 화면은 그대로 선다.
 */

const KEY = "fkt.static-replay.visitor";

export type VisitorState = {
  /** 방문자 id — 🔴 서버가 발급한 sessionId 가 «아니다». 칩이 그 사실을 말한다. */
  visitorId: string;
  /** 되감기 위치. `null` = 「끝까지 본다」(Live 의 「지금을 따라간다」와 같은 자리). */
  cursor: number | null;
  /** 열람 이력 — 어떤 근거·문서를 열었는가(가장 최근이 앞). */
  visited: string[];
};

const EMPTY: VisitorState = { visitorId: "", cursor: null, visited: [] };

/** 🔴 `crypto.randomUUID` 가 없는 환경도 있다(구형·비보안 컨텍스트) — 없으면 못 만든 게
 *     아니라 다른 방법으로 만든다. 여기서 던지면 화면 전체가 안 선다. */
function newVisitorId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    }
  } catch {
    // 아래로 떨어진다
  }
  return `v${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function read(): VisitorState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VisitorState>;
    // 🔴 형상을 확인한다 — 남이 쓴 값·옛 형식이 들어 있을 수 있고, 그것을 그대로 믿으면
    //    화면이 엉뚱한 자리에서 터진다. 이상하면 «없는 것»으로 취급한다(백지 = 안전한 실패).
    if (typeof parsed.visitorId !== "string" || !parsed.visitorId) return null;
    const cursor =
      parsed.cursor === null || (typeof parsed.cursor === "number" && Number.isInteger(parsed.cursor) && parsed.cursor >= 0)
        ? (parsed.cursor ?? null)
        : null;
    const visited = Array.isArray(parsed.visited) ? parsed.visited.filter((v) => typeof v === "string") : [];
    return { visitorId: parsed.visitorId, cursor, visited };
  } catch {
    return null;
  }
}

/**
 * 이 탭의 구독자들. 🔴 **`storage` 이벤트는 «다른 탭»의 변경만 알린다** — 같은 탭에서
 *    localStorage 를 바꿔도 자기 창에는 이벤트가 오지 않는다. 그래서 자체 통지가 없으면
 *    「내가 방금 적은 것」을 내 화면이 못 본다(그리고 그 침묵은 「기억이 없다」로 보인다).
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function write(state: VisitorState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 🔴 못 적었다고 화면을 세우지 않는다 — 이 회차에 기억을 못 남기는 것뿐이다.
  }
  // 🔴 쓰기에 실패해도 통지한다 — 구독자는 «지금 실제로 읽히는 값»을 다시 읽어야 한다.
  emit();
}

/** 이 브라우저의 방문자 상태를 «있으면 그대로, 없으면 새로» 돌려준다. */
export function loadVisitor(): VisitorState {
  const found = read();
  if (found) return found;
  const fresh: VisitorState = { ...EMPTY, visitorId: newVisitorId() };
  write(fresh);
  return fresh;
}

/** 되감기 위치를 남긴다. 🔴 `null` 도 «값»이다(끝까지 본다) — 지우는 것과 다르다. */
export function saveCursor(cursor: number | null): void {
  const cur = read();
  if (!cur) return;
  write({ ...cur, cursor });
}

/** 열람 이력에 하나 더. 같은 것을 두 번 열면 «앞으로» 옮긴다(횟수를 세지는 않는다). */
export function markVisited(id: string, limit = 50): void {
  const cur = read();
  if (!cur) return;
  const visited = [id, ...cur.visited.filter((v) => v !== id)].slice(0, limit);
  write({ ...cur, visited });
}

/**
 * ⟲ 리셋의 정적 대응 — 🔴 서버에 보낼 것이 없으니 «이 브라우저의 기억»을 지운다.
 *    지운 뒤 새 방문자 id 를 만든다: 리셋은 「없던 일로 한다」이지 「기억을 잠근다」가 아니다.
 */
export function resetVisitor(): VisitorState {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 못 지웠으면 아래에서 덮어쓴다
  }
  const fresh: VisitorState = { ...EMPTY, visitorId: newVisitorId() };
  write(fresh);
  return fresh;
}

/** 칩 표기 = 방문자 id 앞 4자(Live 의 세션 칩과 같은 규칙 · `lib/session.ts:chipLabel`). */
export const visitorChipLabel = (s: VisitorState): string => s.visitorId.slice(0, 4);


// ── React 로 읽는 자리 ─────────────────────────────────────────────────────────
//
// 🔴 **effect 안에서 setState 로 밀어 넣지 않는다.** localStorage 는 React 밖의 «외부
//    시스템»이고, 외부 시스템을 읽는 정본 수단은 `useSyncExternalStore` 다. effect 로 읽어
//    상태에 넣으면 첫 렌더 뒤에 한 번 더 렌더가 도는 계단이 생기고(cascading render),
//    그 계단은 값이 늘어날 때마다 하나씩 늘어난다.
// 🔴 서버 스냅샷은 «없음»이다 — 서버에는 이 기억이 존재하지 않는다. 있는 척하면 서버와
//    브라우저가 다른 화면을 그려 하이드레이션이 갈린다.

/**
 * 두 방향을 함께 듣는다 — 이 탭의 쓰기(자체 통지)와 다른 탭의 쓰기(`storage` 이벤트).
 * 🔴 둘 중 하나만 듣던 판이 실제 결함이었다: `storage` 만 들으면 자기 탭의 변경을 못 본다.
 */
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const handler = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", handler);
  };
}

/**
 * 저장된 원문 → 상태. 🔴 `useVisitorRaw` 가 준 문자열을 부르는 쪽에서 편다 — 스냅샷을
 * 문자열로 둔 이유가 「같은 내용이면 같은 값」이라서다(객체면 매 렌더 새 참조가 된다).
 */
export function parseVisitorRaw(raw: string | null): VisitorState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VisitorState>;
    if (typeof parsed.visitorId !== "string" || !parsed.visitorId) return null;
    const cursor =
      parsed.cursor === null ||
      (typeof parsed.cursor === "number" && Number.isInteger(parsed.cursor) && parsed.cursor >= 0)
        ? (parsed.cursor ?? null)
        : null;
    const visited = Array.isArray(parsed.visited) ? parsed.visited.filter((v) => typeof v === "string") : [];
    return { visitorId: parsed.visitorId, cursor, visited };
  } catch {
    return null;
  }
}

/**
 * 저장된 되감기 위치. 🔴 **원시값을 돌려준다** — `getSnapshot` 이 매번 새 객체를 만들면
 * React 가 「바뀌었다」로 읽어 무한히 다시 렌더한다.
 */
export function useStoredCursor(active: boolean): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (active ? (read()?.cursor ?? null) : null),
    () => null,
  );
}

/**
 * 방문자 상태 전체(칩·이력용). 🔴 객체이므로 «문자열 한 겹»을 스냅샷으로 쓰고 파싱은
 * 부르는 쪽에서 한다 — 같은 내용이면 같은 문자열이라 React 가 다시 렌더하지 않는다.
 */
export function useVisitorRaw(active: boolean): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!active) return null;
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
}
