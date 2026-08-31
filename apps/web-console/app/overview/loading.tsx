/**
 * ① Factory Overview — 로딩 자리 (T4-2b Q-50 · §17.1 「첫 화면 ≤3s」).
 *
 * 🔴 **이 파일이 하는 일은 «그림»이 아니라 «경계»다.** Next 는 `loading.tsx` 가 있는 세그먼트를
 *    Suspense 로 감싸고, 그 «바깥»(루트 레이아웃 = 셸)을 먼저 흘려보낸다. 지금까지 이 화면은
 *    `page.tsx` 의 서버 조회 3라운드(plants → overview·scenarios → equipment)가 «전부 끝나야»
 *    문서가 나갔다. 그래서 ai-api 가 응답하지 않으면 상한(8s)이 지나기 전까지 방문자는
 *    **셸조차** 못 봤다 — 모드 배지도, 세션 칩도, 리셋도, 정적 재생 제안도 그 뒤에 있었다.
 *
 * 🔴 그러므로 처방은 「SSR 을 빠르게」가 아니라 **「셸이 SSR 을 기다리지 않게」**다. 조회는
 *    여전히 서버가 하고 여전히 같은 시간이 걸린다 — 달라지는 것은 그동안 사람이 무엇을
 *    보는가뿐이다. 첫 화면이 서면 배지가 「미연결」을 말하고 제안이 뜨고, 방문자는 백엔드가
 *    죽었다는 사실을 «이 문서에서» 안다(D-3 와 같은 축 · 죽은 문서를 만들지 않는다).
 *
 * 🔴 **여기서 데이터를 흉내 내지 않는다.** 가짜 수치·가짜 알람으로 채운 스켈레톤은 잠깐이라도
 *    「공장이 이렇다」고 말하는 것이고, 그것이 §0.2 가 금지하는 형태다. 자리와 「불러오는 중」
 *    이라는 사실만 그린다.
 */
export default function OverviewLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="overview-loading">
      {/* 🔴 **`role="status"` 를 쓰지 않는다** — 셸에는 이미 라이브 리전이 하나 있다
          (`fallback-banner`). 여기 하나를 더 두면 ⓐ 스크린리더가 같은 순간에 두 영역의
          갱신을 알리고 ⓑ 「그 화면의 status 는 하나」라는 기존 그물의 가정이 깨진다.
          실제로 `reset-modal` 이 그 자리에서 strict mode violation 으로 울었다 —
          그물을 고치는 대신 이 줄을 고친다(그물은 내 write scope 도 아니다).
          `aria-live="polite"` 는 같은 안내를 하되 새 role 을 만들지 않는다. */}
      <p className="text-xs text-muted" aria-live="polite">
        공장 현황을 불러오는 중입니다…
      </p>
      {/* 자리만 잡는 골격 — 값이 아니라 «레이아웃»이 여기 있다는 뜻이다 */}
      <div className="h-20 rounded border border-dashed border-edge bg-panel" aria-hidden />
      <div className="flex gap-3">
        <div className="h-40 flex-1 rounded border border-dashed border-edge bg-panel" aria-hidden />
        <div className="h-40 w-80 shrink-0 rounded border border-dashed border-edge bg-panel" aria-hidden />
      </div>
    </div>
  );
}
