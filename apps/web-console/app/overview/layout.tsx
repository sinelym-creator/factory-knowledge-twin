/**
 * ① Factory Overview — 세그먼트 레이아웃 (T4-2b Q-50).
 *
 * 🔴 **여기 있는 것은 «화면 제목» 하나뿐이고, 그것이 이 파일의 전부다.** 같은 세그먼트의
 *    `loading.tsx` 가 Suspense 경계를 만드는데, 경계 «안»에 있는 것은 스트리밍이 자리를
 *    바꾸는 동안 잠깐 두 벌이 된다 — 실측: 문서 교체 직후 `h1` 이 0·60·150ms 에 **2개**,
 *    400ms 에 1개(대조군 = 이 경계가 없을 때는 전 구간 1개).
 *
 *    그 창은 눈에 보이지 않지만 「이 화면의 h1 은 하나」를 전제한 그물이 그 자리에서 운다.
 *    제목을 경계 밖으로 올리면 교체 대상에서 빠져 창 자체가 사라지고, 덤으로 **제목이 첫
 *    페인트에 즉시 선다** — 스크린리더가 「여기가 어디인지」를 데이터보다 먼저 읽는다.
 *
 * 🔴 제목을 «두 곳»에 두지 않는다. 본문(`overview-body`)과 장애 화면(`Unavailable`)에서는
 *    각각 h1 을 내려놓았다 — 두 곳이 같은 제목을 그리면 이 파일이 고친 것이 도로 생긴다.
 */
export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">① Factory Overview</h1>
      {children}
    </>
  );
}
