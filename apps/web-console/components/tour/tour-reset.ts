/**
 * 투어 진행 «지우기» — 리셋(⟲)이 부른다(E-3).
 *
 * 🔴 **왜 `tour-provider` 가 아니라 이 파일인가**: 리셋 버튼은 앱바에 있어 모든 화면에 산다.
 *    provider 에서 가져오면 오버레이·스텝 정본까지 앱바 번들로 딸려 온다. 키와 이벤트 이름만
 *    여기 두고 provider 가 이것을 가져간다 — 키는 여전히 한 곳에만 적힌다.
 *
 * 🔴 **저장소를 지우는 것만으로는 화면이 안 바뀐다.** provider 는 저장소를 마운트 «뒤» 한 번
 *    읽고 그 뒤로는 React 상태로 산다(하이드레이션 때문에 그렇게 설계돼 있다). 그래서 지운
 *    사실을 이벤트로 알린다 — 안 그러면 리셋한 그 화면에서는 다음 새로고침까지 옛 상태가
 *    남는다(「대기 중인 항해가 문서를 죽인다」와 같은 층의 문제: 저장은 됐는데 표시가 안 산다).
 */
export const TOUR_KEY = "fkt.tour.v1";
export const TOUR_RESET_EVENT = "fkt:tour-reset";

export function clearTour(): void {
  try {
    window.localStorage.removeItem(TOUR_KEY);
  } catch {
    // 못 지우면 이 탭에서는 옛 진행이 남는다 — 조용히 실패하되 화면은 살아 있다.
  }
  try {
    window.dispatchEvent(new Event(TOUR_RESET_EVENT));
  } catch {
    // 이벤트를 못 쏘면 다음 마운트에서 반영된다.
  }
}
