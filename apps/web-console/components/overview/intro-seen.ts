/** 안내 카드 «세션 상태» 기록 자리 — wireframes §0.1 ①.
 *
 * 🔴 `localStorage` 가 아니다(정본 명문). 브라우저 수명 내내 남는 저장소에 적으면 「세션의
 *    첫 진입」이 「이 브라우저의 첫 진입」이 되어 세션 격리와 어긋난다. `sessionStorage` 는
 *    탭 수명이고, 키에 sessionId 를 넣어 «다른 세션이면 다시 본다»를 만든다.
 * 🔴 저장소 접근은 전부 try/catch 다 — 사생활 모드·차단 설정에서 던지는데, 안내 카드 하나
 *    때문에 화면 전체가 죽는 것은 실패 방향이 틀렸다.
 *
 * 🔴 **이 파일이 따로 선 이유(E-1)**: 리셋 버튼(앱바 · 모든 화면)이 「안내 봤음」을 지워야
 *    하는데, 그 함수를 `overview-body.tsx` 에서 가져오면 개요 화면 전체가 앱바 번들로 딸려
 *    들어온다. 지우는 쪽과 적는 쪽이 **같은 모듈 인스턴스**를 봐야 구독 통지도 성립하므로,
 *    저장소 원시함수만 여기로 내리고 양쪽이 이것을 가져간다. 새 저장소 키는 0 이다.
 */
const INTRO_KEY = (sessionId: string | null) => `fkt.intro.seen:${sessionId ?? "anon"}`;

/** `useSyncExternalStore` 구독자 — 저장소에 적은 사실을 화면이 «즉시» 알게 한다. */
const introListeners = new Set<() => void>();

function notify(): void {
  for (const l of introListeners) l();
}

export function introSeen(sessionId: string | null): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_KEY(sessionId)) === "1";
  } catch {
    // 읽지 못하면 «안 봤다»로 친다 — 처음 온 사람에게 안내가 안 뜨는 쪽보다 낫다.
    return false;
  }
}

export function markIntroSeen(sessionId: string | null): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY(sessionId), "1");
  } catch {
    // 못 적으면 다음 진입에 다시 뜬다 — 조용히 실패하되 화면은 살아 있다.
  }
  notify();
}

/** 🔴 리셋(서버 성공 뒤)에서만 부른다 — 「처음 상태로 되돌렸다」가 참이 되려면 안내도 처음이어야
 *    한다. 서버가 실패한 회차에는 부르지 않는다: 화면만 처음으로 돌아가면 서버와 갈린다. */
export function clearIntroSeen(sessionId: string | null): void {
  try {
    window.sessionStorage.removeItem(INTRO_KEY(sessionId));
  } catch {
    // 못 지우면 이 탭에서는 안내가 다시 안 뜬다 — 조용히 실패하되 화면은 살아 있다.
  }
  notify();
}

export function subscribeIntro(onChange: () => void): () => void {
  introListeners.add(onChange);
  return () => introListeners.delete(onChange);
}
