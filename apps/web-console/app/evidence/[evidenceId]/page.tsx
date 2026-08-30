import Link from "next/link";
import { cookies, headers } from "next/headers";

import { CitedBody } from "@/components/evidence/cited-body";
import { DeepLinkNotice } from "@/components/evidence/deep-link-notice";
import { TrustHeader } from "@/components/evidence/trust-header";
import { Unavailable } from "@/components/unavailable";
import {
  CONTRACT,
  type DocumentPreview,
  type Evidence,
  type Reply,
  apiGetServer,
  decodeRouteParam,
  documentIdOf,
} from "@/lib/contract";
import { SESSION_COOKIE, parseSession } from "@/lib/session";

/**
 * ③ Evidence 뷰 (wireframes §3) — 근거를 원문·좌표·신뢰 배지로 되돌린다 (T3-3).
 *
 * 🔴 **딥링크 축이 이 화면의 절반이다**(계약 v0.1.6 읽기 예외 · Q-16 해소). 세션 없이 들어와도
 *    열려야 하고, 그때 «무엇이 안 열리는지»를 화면이 말해야 한다 — `proxy.ts` 의
 *    `READ_ONLY_DEEP_LINK` 가 그 앞문이고 여기가 그 방이다.
 *
 * 🔴 **이 티켓이 채우는 것은 문서 축까지다.** §3 의 그래프 경로 탭은 `?run=` + 세션 + 비재생
 *    run 이 있어야 서고(`GET /graph/paths?byRun=` 은 소유권 검사가 붙는다 · replay run 은
 *    501), 그 run 을 만드는 이벤트 축이 T3-4 다. 지금 그리면 「있는데 안 도는 것」이 되고
 *    무세션 딥링크에서는 아예 설 수 없다 — 자리로 «없다»고 말한다.
 */
export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ evidenceId: string }>;
  searchParams: Promise<{ run?: string; tab?: string }>;
}) {
  // 🔴 인코딩된 채로 오는 세그먼트를 «값»으로 되돌린다(실측 근거는 decodeRouteParam 성문).
  const evidenceId = decodeRouteParam((await params).evidenceId);
  const { run, tab } = await searchParams;
  const cookieHeader = (await headers()).get("cookie") ?? "";
  // 🔴 세션 유무는 «실제 쿠키»에서 읽는다 — 라우트 성질에서 추정하지 않는다.
  const hasSession = parseSession((await cookies()).get(SESSION_COOKIE)?.value) !== null;

  const reply = await apiGetServer<Evidence>(CONTRACT.evidence(evidenceId), cookieHeader);

  if (reply.state !== "ok") {
    const missing = reply.status === 404;
    return (
      <div className="flex max-w-3xl flex-col gap-3">
        <Unavailable
          screen={`③ Evidence 뷰 · ${evidenceId}`}
          why={reply.detail?.message ?? reply.why}
          kind={missing ? "not-found" : "unavailable"}
        />
        {missing && (
          // 🔴 Q-34 를 화면이 «그대로» 말한다. 서버는 「없는 근거」와 「이 라우트가 다루지
          //    않는 kind」에 같은 404 를 준다(계약 v0.1.1 이 코드를 무규정 — 현행 참 · red
          //    아님). 화면이 evidenceId 모양으로 kind 를 «추정»해 둘을 갈라 그리면, 그것은
          //    계약이 정하지 않은 것을 화면이 정한 것이다. 추정하지 않고 사실만 적는다.
          <p className="rounded border border-edge bg-panel p-3 text-xs text-muted">
            이 404 는 두 가지를 함께 뜻한다 — 「그런 근거가 없다」 또는 「이 라우트가 다루지 않는
            kind 다」. 계약 v0.1.1 이 정한 kind 는 <span className="id">doc-chunk</span> ·{" "}
            <span className="id">record</span> 뿐이라,{" "}
            <span className="id">graph-path</span> · <span className="id">sensor-series</span> 의
            id 도 같은 코드로 답한다. 코드 분리는 계약 개정 사안이다(원장 Q-34).
          </p>
        )}
        <DeepLinkNotice hasSession={hasSession} runId={run} />
      </div>
    );
  }

  const ev = reply.data;
  const docId = documentIdOf(ev.evidenceId);
  // 🔴 문서는 «doc-chunk 일 때만» 부른다. record 의 id 로 문서를 물으면 404 가 돌아오고,
  //    그 404 를 화면이 「문서를 못 가져왔다」로 그리면 정상 상태가 결함처럼 보인다.
  const doc =
    ev.kind === "doc-chunk" && docId
      ? await apiGetServer<DocumentPreview>(
          CONTRACT.document(docId, ev.evidenceId),
          cookieHeader,
        )
      : null;

  const activeTab = tab === "graph" ? "graph" : "doc";

  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-3">
      <header className="rounded border border-edge bg-panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold">③ Evidence</h1>
          <span className="id text-sm text-ai">{ev.evidenceId}</span>
          <span
            className="rounded border border-edge px-2 py-0.5 text-xs text-muted"
            data-testid="evidence-kind"
          >
            kind {ev.kind}
          </span>
        </div>
        <div className="mt-2">
          <TrustHeader
            revisionId={ev.revisionId}
            contentHash={ev.contentHash}
            approvalState={ev.approvalState}
            effectiveFrom={ev.effectiveFrom}
            effectiveTo={ev.effectiveTo}
            stale={ev.stale}
            indexed={ev.kind === "doc-chunk"}
          />
        </div>
      </header>

      <DeepLinkNotice hasSession={hasSession} runId={run} />

      {ev.kind === "record" ? (
        <RecordView evidence={ev} />
      ) : (
        <>
          {/* 탭 — 🔴 링크로 만든다. 클라이언트 JS 없이 Tab·Enter 로 오가고, 상태가 URL 에
              남아 딥링크가 탭까지 가리킨다(wireframes §6 `?tab=graph|doc`). */}
          <nav
            className="flex gap-2 text-xs"
            aria-label="Evidence 탭"
            data-testid="evidence-tabs"
          >
            <TabLink
              href={tabHref(ev.evidenceId, run, "doc")}
              active={activeTab === "doc"}
              label="📄 문서 원문"
            />
            <TabLink
              href={tabHref(ev.evidenceId, run, "graph")}
              active={activeTab === "graph"}
              label="🕸 그래프 경로"
            />
          </nav>

          {activeTab === "doc" ? (
            <DocumentTab evidence={ev} docId={docId} doc={doc} />
          ) : (
            <GraphTab hasSession={hasSession} runId={run} />
          )}
        </>
      )}
    </div>
  );
}

function tabHref(evidenceId: string, run: string | undefined, tab: "doc" | "graph"): string {
  const q = new URLSearchParams();
  if (run) q.set("run", run);
  q.set("tab", tab);
  return `/evidence/${encodeURIComponent(evidenceId)}?${q.toString()}`;
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "rounded border px-3 py-1 focus:outline-2 focus:outline-ai " +
        (active ? "border-ai/60 bg-bg text-ai" : "border-edge text-muted hover:text-ink")
      }
    >
      {label}
    </Link>
  );
}

/** 문서 원문 탭 — 원문 + 인용 강조(계약 v0.1.1 `body` + `highlight`). */
function DocumentTab({
  evidence,
  docId,
  doc,
}: {
  evidence: Evidence;
  docId: string | null;
  doc: Reply<DocumentPreview> | null;
}) {
  if (!docId) {
    // chunk id 조성(T0-6 §3.1)에 맞지 않는 doc-chunk — 서버·화면의 조성 인식이 갈렸다는 뜻이다.
    return (
      <p className="rounded border border-warn/40 bg-panel p-3 text-sm text-warn">
        🔴 <span className="id">{evidence.evidenceId}</span> 에서 documentId 를 갈라내지 못했다 —
        chunk id 조성(<span className="id">{"{documentId}@r{N}#{NNN}"}</span>)과 어긋난다. 문서를
        추측해서 부르지 않는다.
      </p>
    );
  }

  if (!doc || doc.state !== "ok") {
    const why = doc?.detail?.message ?? doc?.why ?? "문서를 부르지 않았다";
    return (
      <div className="rounded border border-warn/40 bg-panel p-3">
        <p className="text-sm text-warn">문서 원문을 가져오지 못했다.</p>
        <p className="id mt-1 text-xs text-muted">
          {doc?.detail?.code ? `${doc.detail.code} · ` : ""}
          {why}
        </p>
        {/* 인용 문장만이라도 남긴다 — evidence 응답의 `text` 는 이미 손에 있다. */}
        <p className="mt-2 text-xs text-muted">
          원문 대조는 못 하지만, 근거 응답이 실어 온 인용 문장은 아래와 같다.
        </p>
        <pre className="mt-2 max-h-64 overflow-auto rounded border border-edge bg-bg p-3 text-xs whitespace-pre-wrap">
          {evidence.text}
        </pre>
      </div>
    );
  }

  const d = doc.data;
  return (
    <section className="rounded border border-edge bg-panel p-3" data-testid="document-tab">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="id text-sm text-ai">{d.documentId}</span>
        <span className="text-sm">{d.title}</span>
        <Link
          href={`/documents/${encodeURIComponent(d.documentId)}?highlight=${encodeURIComponent(evidence.evidenceId)}`}
          className="ml-auto rounded border border-edge px-2 py-0.5 text-xs text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
        >
          이 문서 전체 열기 →
        </Link>
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
      <PreviousRevisionDeferred />
    </section>
  );
}

/**
 * 🔴 wireframes §3 인터랙션 ⑤ 「이전 revision 보기」(W4 = P0 나란히 열기)는 **지금 성립하지
 *    않는다** — 오케 판정 J-2 ⓑ(08-30 · 이연 · 원장 Q-36).
 *
 * 계약의 `/documents/{docId}` 에는 revision 선택 축이 없다. revision 은 `highlight={chunkId}`
 * 로만 정해지는데 옛 revision 은 색인 chunk 가 0건이라, r1 chunk 를 물으면 실측
 * `400 highlight_not_found(revision_not_indexed)` 다. 계약에 `?revision=` 을 더해도 그
 * 화면은 서지 않는다 — 근본 원인이 계약이 아니라 색인 정책 축이기 때문이다.
 *
 * 🔴 그래서 버튼을 «흉내»로 두지 않는다. 눌리지 않는 버튼과 사유를 함께 둔다 — 다음 좌석이
 *    「누락인가 이연인가」를 화면에서 바로 읽게.
 */
function PreviousRevisionDeferred() {
  return (
    <p className="mt-3 border-t border-edge pt-2 text-xs text-muted" data-testid="prev-revision-deferred">
      <span className="rounded border border-edge px-2 py-0.5 text-muted/70">
        [ 이전 revision 보기 ]
      </span>{" "}
      — 이연(원장 Q-36). 계약에 revision 선택 축이 없고, 옛 revision 은 색인 chunk 가 0건이라
      좌표로도 열리지 않는다(실측 <span className="id">400 highlight_not_found</span>). 계약
      v0.2 + 색인 정책 재론에 결속.
    </p>
  );
}

/** record kind — SSOT 레코드를 편 것(계약 v0.1.1 `record: {entityType, fields}`). */
function RecordView({ evidence }: { evidence: Evidence }) {
  const rec = evidence.record;
  if (!rec) {
    return (
      <p className="rounded border border-warn/40 bg-panel p-3 text-sm text-warn">
        🔴 kind=record 인데 <span className="id">record</span> 가 비어 있다 — 계약 v0.1.1 형상과
        어긋난다.
      </p>
    );
  }
  const entries = Object.entries(rec.fields);
  return (
    <section className="rounded border border-edge bg-panel p-3" data-testid="record-view">
      <p className="text-xs text-muted">
        SSOT 레코드 직독 · 테이블 <span className="id text-ink">{rec.entityType}</span> · {entries.length}필드
      </p>
      <dl className="mt-2 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="id text-xs text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{String(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-edge pt-2 text-xs text-muted">
        🔴 이 근거에는 revision·색인 축이 «없다» — 화이트리스트 테이블을 직독하므로 「색인이
        낡았다」는 개념이 성립하지 않는다(계약 v0.1.1). 그래서 신뢰 배지도 신선도를 주장하지
        않는다. 인용 가능 여부는 <span className="id">approvalState</span>·유효기간이 아니라 이
        레코드 자체가 SSOT 라는 사실이 답한다.
      </p>
    </section>
  );
}

/** 그래프 경로 탭 — T3-4 자리(§3 인터랙션 ①③). 여기서 «없다»고 말한다. */
function GraphTab({ hasSession, runId }: { hasSession: boolean; runId?: string }) {
  return (
    <section
      className="rounded border border-dashed border-edge bg-panel p-4"
      data-testid="graph-tab-placeholder"
    >
      <p className="text-xs text-muted">🕸 그래프 경로</p>
      <p className="mt-2 text-sm">이 자리는 T3-4다 — 조사가 실제로 지나간 경로 위에 선다.</p>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        <li>
          ▪ 출처는 <span className="id">GET /graph/paths?byRun={"{runId}"}</span> 하나뿐이다.
          그 응답은 «조사가 밟은» 경로라, run 이 없으면 그릴 대상 자체가 없다.
        </li>
        <li>
          ▪ 이 라우트는 읽기 예외 2라우트에 <span className="text-ink">들지 않는다</span> — run
          은 세션 소유 자원이라 딥링크(무세션)에서는 열리지 않는다(계약 v0.1.6).
          {hasSession ? " 지금 세션은 있다." : " 지금 이 화면은 무세션이다."}
        </li>
        <li>
          ▪ 재생(replay) run 은 경로 «원본»이 없어 <span className="id">501</span> 이다 —
          fixture 는 이벤트만 담는다(T2-4 판정 J-G).
        </li>
        {runId && (
          <li>
            ▪ 링크의 run = <span className="id">{runId}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
