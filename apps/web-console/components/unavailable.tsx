/**
 * 데이터에 닿지 못한 화면 — 🔴 «빈 화면»과 «못 물어봤다»를 가른다.
 *
 * 빈 자리를 그냥 두면 방문자도 다음 좌석도 「데이터가 0건인가, 서버에 못 닿았나」를 구분하지
 * 못한다. 이 리포의 같은 규율이 서버 쪽에도 있다: 없는 것은 없다고 말한다(errors.py 머리말).
 */

/**
 * 🔴 **T7-34(D-51) — 사유를 «사람 말»로 옮긴다. 값은 그대로 둔다.**
 *
 * 결함(리바이2 X-25 · E1): 폴백의 폴백 상태에서 이 화면이 방문자에게 **「사유: TypeError」**를
 * 그대로 찍었다. `why` 는 `lib/contract.ts` 가 만든 «기계의 낱말»(`e.name` · `HTTP nnn` ·
 * `미구현(501)`)이고, 그 값 자체는 **바꾸지 않는다** — 드릴·관측 축이 그 문자열을 세기 때문이다
 * (`contract.ts:341·757` 성문). 그래서 바뀌는 것은 **표시**뿐이고, 원문은 같은 `<p>` 의
 * `data-why` 로 남는다(사람에게는 문장을, 계측기에는 값을).
 *
 * 🔴 「그 외」를 「서버에 닿지 못했다」로 두는 이유: 모르는 코드가 왔을 때 원인을 **단정하지
 *    않는다**. 값은 `data-why` 에 그대로 있으니 사실이 사라지지도 않는다.
 */
function describeWhy(why: string): string {
  if (why === "TypeError") return "서버와 연결이 끊겼습니다. 마지막으로 받은 상태를 보여 드리고 있습니다.";
  if (why === "TimeoutError" || why === "AbortError") return "서버 응답이 없습니다.";
  if (why === "미구현(501)") return "아직 제공되지 않는 기능입니다(501).";
  /* `HTTP nnn` — 숫자는 서버가 «말한» 값이라 그대로 옮긴다(우리가 짓지 않는다). */
  const http = /^HTTP (\d{3})$/.exec(why);
  if (http) return `서버 응답 오류(${http[1]})`;
  return "서버에 닿지 못했습니다.";
}
export function Unavailable({
  screen,
  why,
  kind = "unavailable",
  heading = true,
}: {
  screen: string;
  why: string;
  /** `not-found` = 서버가 「그런 것 없다」고 답했다 · `unavailable` = 묻지 못했다. */
  kind?: "not-found" | "unavailable";
  /**
   * 🔴 `false` = 「이 화면의 제목은 «이미 밖에» 있다」(T4-2b Q-50 · overview 세그먼트).
   *
   *    기본값은 `true` 로 둔다 — 이 컴포넌트를 이미 쓰고 있는 화면들은 제목을 여기서만
   *    얻으므로, 기본을 바꾸면 그 화면들의 제목이 «요청 밖»에서 조용히 사라진다.
   *    끄는 쪽은 제목을 자기 레이아웃에 둔 화면뿐이고, 그때도 문장은 남는다(h1 → p).
   */
  heading?: boolean;
}) {
  return (
    <section className="max-w-2xl" data-testid="screen-unavailable" data-kind={kind}>
      {heading ? (
        <h1 className="text-lg font-semibold">{screen}</h1>
      ) : (
        <p className="text-lg font-semibold">{screen}</p>
      )}
      <div className="mt-4 rounded border border-warn/40 bg-panel p-4">
        <p className="text-body-c text-warn">
          {kind === "not-found"
            ? "서버가 «그런 자원이 없다»고 답했다."
            : "이 화면의 데이터를 지금 가져오지 못했다."}
        </p>
        {/* 🔴 표시는 사람 말로, 원문은 `data-why` 로 — 두 독자(방문자·계측기)가 다른 것을 읽는다. */}
        <p className="id mt-2 text-foot text-muted" data-why={why}>
          사유: {describeWhy(why)}
        </p>
        <p className="mt-3 text-foot text-muted">
          {kind === "not-found"
            ? "«없다»와 «못 물어봤다»는 다른 사건이라 다른 문장으로 답한다 — 이 자리는 전자다."
            : "화면이 «비어 있는 것»이 아니라 «묻지 못한 것»이다 — 두 상태를 같은 모습으로 그리지 않으려고 이 자리를 둔다."}
        </p>
      </div>
    </section>
  );
}
