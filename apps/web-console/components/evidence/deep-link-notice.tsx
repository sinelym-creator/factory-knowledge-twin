import Link from "next/link";

/**
 * 세션 화면과 딥링크 화면의 «경계»를 화면이 스스로 말한다 (T3-3 AC ③).
 *
 * 계약 v0.1.6 은 `GET /evidence/{id}` · `GET /documents/{id}` 두 라우트만 세션 없이 열었다.
 * 그래서 딥링크로 들어온 방문자는 «근거는 보되 조사는 못 하는» 상태에 있는데, 그 사실을
 * 화면이 말하지 않으면 방문자는 자기가 무엇을 못 하는지 모른 채 빈 자리를 본다.
 *
 * 🔴 **세션 유무를 «추정»하지 않는다.** 이 배너는 서버 컴포넌트가 실제 요청 쿠키에서 읽은
 *    값을 그대로 받는다 — 「딥링크 라우트니까 무세션일 것」이라는 추론으로 그리면, 세션을
 *    가진 사람이 근거 링크를 눌렀을 때도 「세션 없음」이라 말하는 화면이 된다.
 *    실측 표의 브라우저 네트워크 축이 보는 것도 이 값이다(같은 사실을 두 번 만들지 않는다).
 */
export function DeepLinkNotice({
  hasSession,
  runId,
  incidentId,
}: {
  hasSession: boolean;
  /** `?run=` — 세션 소유 자원이라 무세션 방문자에게는 뜻이 없다(계약 v0.1.6 소유권). */
  runId?: string;
  /**
   * 그 run 이 속한 상황 — 🔴 **서버 목록(`GET /runs?sessionId=`)에서 찾은 값**이다
   * (T7-41b · 계약 v0.1.16). 화면이 `?run=` 에서 지어낸 것이 아니다.
   */
  incidentId?: string | null;
}) {
  if (hasSession) {
    return (
      <p
        className="text-foot text-muted"
        data-testid="deep-link-notice"
        data-session="present"
      >
        이 조사에서 인용한 근거입니다.
        {/* 🔴 D-63 — 첫자리는 «온 곳»이다. 폐하 실측: 여기서 Overview 로 나가면 조사가 아니라
            처음 화면(「조사하기」)이 나왔다. 앞판이 그 링크만 둔 이유는 `?run=` 이 incidentId
            를 말해 주지 않아서였는데, 이제 서버가 답한다(v0.1.16). 못 찾으면 이 링크는 서지
            않는다 — 지어낸 주소로 보내느니 없는 편이 낫다는 규율은 그대로다. */}
        {runId && incidentId && (
          <>
            {" "}
            <Link
              href={`/incidents/${encodeURIComponent(incidentId)}?run=${encodeURIComponent(runId)}`}
              className="text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
              data-testid="evidence-back-to-run"
            >
              이 조사로 돌아가기
            </Link>
            {" · "}
          </>
        )}
        {(!runId || !incidentId) && " "}
        <Link
          href="/overview"
          className="text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
        >
          ① Overview
        </Link>
        {runId && !incidentId && (
          <>
            {" · 이 근거를 인용한 조사 "}
            <span className="id">{runId}</span>
          </>
        )}
      </p>
    );
  }

  return (
    <div
      className="fkt-card p-4"
      data-testid="deep-link-notice"
      data-session="absent"
    >
      <p className="text-body-c">
        🔗 <span className="text-ai">열람 전용</span>으로 열린 화면입니다.
      </p>
      <p className="mt-1 text-foot text-muted">
        근거와 문서는 세션 없이도 보실 수 있습니다. 조사 실행·작업지시 초안·승인 이력은
        세션에 속한 자료라 이 화면에서는 열리지 않습니다.
      </p>
      {runId && (
        <p className="mt-1 text-foot text-muted">
          링크에 조사 번호가 붙어 있지만 이 화면에서는 조사 결과를 열 수 없습니다. 조사는
          시작한 세션에서만 보실 수 있습니다.
        </p>
      )}
      <p className="mt-2 text-foot">
        <Link
          href="/"
          className="fkt-hit fkt-pill bg-fill text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
        >
          세션을 만들고 조사 화면으로 →
        </Link>
      </p>
    </div>
  );
}
