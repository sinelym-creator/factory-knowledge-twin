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
    <div className="flex min-w-0 flex-col gap-8" data-testid="overview-loading">
      {/* 🔴 **`role="status"` 를 쓰지 않는다** — 셸에는 이미 라이브 리전이 하나 있다
          (`fallback-banner`). 여기 하나를 더 두면 ⓐ 스크린리더가 같은 순간에 두 영역의
          갱신을 알리고 ⓑ 「그 화면의 status 는 하나」라는 기존 그물의 가정이 깨진다.
          실제로 `reset-modal` 이 그 자리에서 strict mode violation 으로 울었다 —
          그물을 고치는 대신 이 줄을 고친다(그물은 내 write scope 도 아니다).
          `aria-live="polite"` 는 같은 안내를 하되 새 role 을 만들지 않는다. */}
      <p className="text-foot text-muted" aria-live="polite">
        공장 현황을 불러오는 중입니다…
      </p>
      {/* 자리만 잡는 골격 — 값이 아니라 «레이아웃»이 여기 있다는 뜻이다.
          🔴 점선 박스에서 shimmer 표면으로 바꿨다(T6-4 재수립): 점선은 「테두리로 나누지
             않는다」는 이 판의 규칙과 어긋나고, 무엇보다 «곧 채워질 자리»로 읽히지 않았다.
          🔴 형태는 실제 레이아웃과 «같은 자리»여야 한다 — 히어로 → KPI 4 → 그리드+도크.
             다른 골격을 그리면 채워질 때 화면이 한 번 튄다. */}
      <div className="fkt-shimmer h-16 max-w-[600px] rounded-card" aria-hidden />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="fkt-shimmer h-[86px] rounded-card" />
        ))}
      </div>
      <div className="flex flex-col gap-6 xl:flex-row" aria-hidden>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="fkt-shimmer h-[148px] rounded-card" />
          ))}
        </div>
        <div className="fkt-shimmer h-64 w-full shrink-0 rounded-card xl:w-(--spacing-dock)" />
      </div>
    </div>
  );
}
