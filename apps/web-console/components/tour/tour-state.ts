/**
 * 투어 상태 «규칙»만 — 저장소·주소·타이머 없이 도는 순수 함수(U-04).
 *
 * 🔴 규칙 ① 사용자가 «명시적으로 고르지 않은 것»은 영구가 아니다(Esc 는 의사 표시가 아니다).
 * 🔴 규칙 ② `dismissed` 는 단계를 기억한다 — 「이어서」는 `running`·`dismissed` 뿐이다(⑧-2 표).
 * 🔴 규칙 ③ «모르는 형태»는 고쳐 쓰지 않는다 — 처음으로 돌린다. 잘못 읽은 값으로 엉뚱한
 *    단계에서 열리는 것보다 처음부터 여는 쪽이 «덜» 틀린다.
 */
export type TourStatus = "never" | "running" | "dismissed" | "suppressed" | "completed";
export type TourState = { v: 1; status: TourStatus; step: number };

export const INITIAL_TOUR_STATE: TourState = { v: 1, status: "never", step: 0 };

/* 🔴 저장된 `skipped` 는 「잠깐 끊기」인지 「다시 보지 않기」인지 알 수 없다 — 보수적으로
   `dismissed` 다. 틀렸을 때 최악이 「초대가 한 번 더 뜸」이고 반대는 「영구히 못 봄」이라
   비대칭이다(⑧-2 이관 규칙). */
export function migrateStatus(raw: unknown): TourStatus {
  switch (raw) {
    case "never":
    case "running":
    case "dismissed":
    case "suppressed":
    case "completed":
      return raw;
    case "active":
      return "running";
    case "done":
      return "completed";
    case "skipped":
      return "dismissed";
    default:
      return "never";
  }
}

/** 재개 지점 — 이어서 갈 수 있는 것은 두 상태뿐이고 나머지는 1단계다. */
export function resumeStepOf(loaded: TourState): number {
  return loaded.status === "running" || loaded.status === "dismissed" ? loaded.step : 0;
}

/** 저장된 문자열 → 상태. 읽을 수 없거나 버전이 다르면 처음으로 돌린다. */
export function parseTourState(raw: string | null, totalSteps: number): TourState {
  if (!raw) return INITIAL_TOUR_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<TourState>;
    if (parsed.v !== 1) return INITIAL_TOUR_STATE;
    const step =
      typeof parsed.step === "number"
        ? Math.min(Math.max(parsed.step, 0), Math.max(0, totalSteps - 1))
        : 0;
    return { v: 1, status: migrateStatus(parsed.status), step };
  } catch {
    return INITIAL_TOUR_STATE;
  }
}

/** 「다시 보기」로 열 때의 상태 — 끝냈든 끊었든 열리고, 이어갈 수 있으면 이어간다. */
export function openedFrom(loaded: TourState): TourState {
  return { v: 1, status: "running", step: resumeStepOf(loaded) };
}
