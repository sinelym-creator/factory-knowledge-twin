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
}: {
  hasSession: boolean;
  /** `?run=` — 세션 소유 자원이라 무세션 방문자에게는 뜻이 없다(계약 v0.1.6 소유권). */
  runId?: string;
}) {
  if (hasSession) {
    return (
      <p
        className="text-xs text-muted"
        data-testid="deep-link-notice"
        data-session="present"
      >
        세션 안에서 열렸다 — 조사 화면으로 오갈 수 있다.
        {/* 🔴 「② 조사 화면으로」 링크를 만들지 않는다 — `?run=` 은 incidentId 를 말해 주지
            않고, 계약에도 run→incident 를 되짚는 조회가 없다. 그럴듯한 incidentId 를
            지어 넣으면 눌렀을 때 남의 화면이나 404 로 간다. 아는 자리로만 보낸다. */}
        {" · "}
        <Link
          href="/overview"
          className="text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
        >
          ① Overview
        </Link>
        {runId && (
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
      className="rounded border border-edge bg-panel px-3 py-2"
      data-testid="deep-link-notice"
      data-session="absent"
    >
      <p className="text-sm">
        🔗 <span className="text-ai">세션 없이 «열람만»</span> 열린 화면이다.
      </p>
      <p className="mt-1 text-xs text-muted">
        계약 v0.1.6 의 읽기 전용 예외 2라우트(<span className="id">GET /evidence/{"{id}"}</span> ·{" "}
        <span className="id">GET /documents/{"{docId}"}</span>)만 세션 없이 답한다. 조사 실행·작업지시
        초안·승인 이력은 세션 «소유» 자원이라 이 화면에서는 열리지 않는다 — 비어 있는 것이
        아니라 이 경로에 없는 것이다.
      </p>
      {runId && (
        <p className="mt-1 text-xs text-muted">
          링크에 <span className="id">?run={runId}</span> 이 붙어 있지만 무세션에서는 뜻이 없다 —
          run 은 발급 세션의 것이고, 남의 세션 자원은 존재조차 숨긴다(404).
        </p>
      )}
      <p className="mt-2 text-xs">
        <Link
          href="/"
          className="rounded border border-edge px-2 py-1 text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
        >
          세션을 만들고 조사 화면으로 →
        </Link>
      </p>
    </div>
  );
}
