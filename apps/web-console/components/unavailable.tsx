/**
 * 데이터에 닿지 못한 화면 — 🔴 «빈 화면»과 «못 물어봤다»를 가른다.
 *
 * 빈 자리를 그냥 두면 방문자도 다음 좌석도 「데이터가 0건인가, 서버에 못 닿았나」를 구분하지
 * 못한다. 이 리포의 같은 규율이 서버 쪽에도 있다: 없는 것은 없다고 말한다(errors.py 머리말).
 */
export function Unavailable({
  screen,
  why,
  kind = "unavailable",
}: {
  screen: string;
  why: string;
  /** `not-found` = 서버가 「그런 것 없다」고 답했다 · `unavailable` = 묻지 못했다. */
  kind?: "not-found" | "unavailable";
}) {
  return (
    <section className="max-w-2xl" data-testid="screen-unavailable" data-kind={kind}>
      <h1 className="text-lg font-semibold">{screen}</h1>
      <div className="mt-4 rounded border border-warn/40 bg-panel p-4">
        <p className="text-sm text-warn">
          {kind === "not-found"
            ? "서버가 «그런 자원이 없다»고 답했다."
            : "이 화면의 데이터를 지금 가져오지 못했다."}
        </p>
        <p className="id mt-2 text-xs text-muted">사유: {why}</p>
        <p className="mt-3 text-xs text-muted">
          {kind === "not-found"
            ? "«없다»와 «못 물어봤다»는 다른 사건이라 다른 문장으로 답한다 — 이 자리는 전자다."
            : "화면이 «비어 있는 것»이 아니라 «묻지 못한 것»이다 — 두 상태를 같은 모습으로 그리지 않으려고 이 자리를 둔다."}
        </p>
      </div>
    </section>
  );
}
