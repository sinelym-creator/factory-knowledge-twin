import { cookies, headers } from "next/headers";

import { CitedBody } from "@/components/evidence/cited-body";
import { DeepLinkNotice } from "@/components/evidence/deep-link-notice";
import { TrustHeader } from "@/components/evidence/trust-header";
import { Unavailable } from "@/components/unavailable";
import {
  CONTRACT,
  type DocumentPreview,
  apiGetServer,
  decodeRouteParam,
} from "@/lib/contract";
import { SESSION_COOKIE, parseSession } from "@/lib/session";

/**
 * 문서 단건 열람 — 계약 v0.1.6 읽기 예외 2라우트 중 `GET /documents/{docId}` 의 «화면 실체»
 * (T3-3 · 오케 판정 J-1 ⓐ 08-30).
 *
 * 🔴 **wireframes §6 의 P1 `/documents`(SSOT Registry — revision·hash·drift «목록»)와 다른
 *    것이다.** 이름이 겹쳐서 회부했고, 판정은 「P0 단건 열람 전용으로 신설하되 화면이 스스로
 *    구별을 말하게 하라」였다. 그래서 아래 머리줄 한 개가 «장식이 아니라 판정의 집행»이다 —
 *    지우면 다음 좌석이 이 화면을 P1 Registry 의 착수분으로 읽는다.
 *
 * 🔴 근거 하나짜리 화면이 아니라 «문서» 화면이다: `?highlight=` 가 있으면 그 chunk 의
 *    revision 을 펴고 인용을 강조하고, 없으면 현행 revision 전문을 편다. 두 경우가 서로 다른
 *    revision 을 낼 수 있다는 것이 계약의 성질이라, 헤더가 어느 revision 인지 늘 말한다.
 */
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ highlight?: string; run?: string }>;
}) {
  const docId = decodeRouteParam((await params).docId);
  const { highlight, run } = await searchParams;
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const hasSession = parseSession((await cookies()).get(SESSION_COOKIE)?.value) !== null;

  const reply = await apiGetServer<DocumentPreview>(
    CONTRACT.document(docId, highlight),
    cookieHeader,
  );

  const heading = (
    <header className="rounded border border-edge bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">문서 열람</h1>
        <span className="id text-sm text-ai">{docId}</span>
      </div>
      <p className="mt-1 text-xs text-muted" data-testid="registry-disambiguation">
        🔴 P1 <span className="id">/documents</span> SSOT Registry(revision·hash·drift 목록)와
        별개 — <span className="text-ink">단건 열람 전용</span> 화면이다.
      </p>
    </header>
  );

  if (reply.state !== "ok") {
    const missing = reply.status === 404;
    // 🔴 400 = 「강조 요청이 틀렸다」이지 「문서가 없다」가 아니다. 서버가 사유 코드를
    //    `highlight_mismatch`(이 문서의 것이 아니다)와 `highlight_not_found`(이 문서의
    //    것이지만 좌표가 실재하지 않는다)로 갈라 답하므로, 화면도 갈라서 보여 준다 —
    //    합치면 서버가 나눈 이유가 화면에서 사라진다(reading/documents.py 머리말의 짝).
    const badHighlight = reply.status === 400;
    return (
      <div className="flex max-w-4xl flex-col gap-3">
        {heading}
        {badHighlight ? (
          <section
            className="rounded border border-warn/40 bg-panel p-4"
            data-testid="highlight-rejected"
            data-code={reply.detail?.code}
          >
            <p className="text-sm text-warn">인용 강조 요청이 거절됐다 — 문서가 없는 것은 아니다.</p>
            <p className="id mt-2 text-xs">
              {reply.detail?.code ?? "400"} · {reply.detail?.message ?? reply.why}
            </p>
            <p className="mt-2 text-xs text-muted">
              {reply.detail?.code === "highlight_mismatch"
                ? "요청한 chunk 가 이 문서의 것이 아니다(형식 위반이거나 다른 문서)."
                : "이 문서의 chunk id 형식이지만 그 좌표가 실재하지 않는다 — 색인되지 않은 revision 이거나 범위 밖 index 다."}{" "}
              강조를 조용히 버리고 문서만 보여 주면, 강조를 요청한 쪽은 왜 없는지 알 수 없다.
            </p>
            <p className="mt-3 text-xs">
              <a
                href={`/documents/${encodeURIComponent(docId)}`}
                className="rounded border border-edge px-2 py-1 text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
              >
                강조 없이 현행 revision 열기 →
              </a>
            </p>
          </section>
        ) : (
          <Unavailable
            screen={`문서 · ${docId}`}
            why={reply.detail?.message ?? reply.why}
            kind={missing ? "not-found" : "unavailable"}
          />
        )}
        <DeepLinkNotice hasSession={hasSession} runId={run} />
      </div>
    );
  }

  const d = reply.data;
  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-3">
      {heading}
      <DeepLinkNotice hasSession={hasSession} runId={run} />

      <section className="rounded border border-edge bg-panel p-3" data-testid="document-view">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm">{d.title}</span>
          <span className="text-xs text-muted">
            {d.highlight ? "인용 구간이 지정된 revision" : "현행 revision"}
          </span>
        </div>
        <div className="mt-2">
          <TrustHeader
            revisionId={d.revisionId}
            contentHash={d.contentHash}
            approvalState={d.approvalState}
            effectiveFrom={d.effectiveFrom}
            effectiveTo={d.effectiveTo}
            stale={d.stale}
          />
        </div>
        <div className="mt-3">
          <CitedBody body={d.body} span={d.highlight} chunkId={d.highlight?.chunkId} />
        </div>
      </section>
    </div>
  );
}
