/**
 * 라우트 자리표시자 — 🔴 «자리»이지 화면이 아니다.
 *
 * 화면 5종의 실제 내용(카드 그리드·타임라인·차트·evidence 뷰·WO 편집)은 Phase 3 티켓이다.
 * 그래서 여기서는 「이 경로에 무엇이 올 것인가」만 적는다 — 빈 페이지를 두면 다음 좌석이
 * 「누락인가 미착수인가」를 구분하지 못한다.
 */
export function Placeholder({
  screen,
  route,
  planned,
  ids,
}: {
  screen: string;
  route: string;
  planned: string[];
  ids?: string[];
}) {
  return (
    <section className="max-w-3xl">
      <h1 className="text-lg font-semibold">{screen}</h1>
      <p className="id mt-1 text-foot text-muted">{route}</p>

      {ids && ids.length > 0 && (
        <p className="id mt-3 text-foot text-ai">{ids.join(" · ")}</p>
      )}

      <div className="mt-4 fkt-card p-6">
        <p className="text-foot text-muted">이 자리에 올 것 (Phase 3 · wireframes 기준)</p>
        <ul className="mt-2 space-y-1 text-body-c">
          {planned.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden className="text-muted">
                ▪
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-foot text-muted">
        지금 준비된 것은 화면 뼈대입니다. 세션 분리·초기화·실시간 감지·재생 전환이 함께 서 있습니다.
      </p>
    </section>
  );
}
