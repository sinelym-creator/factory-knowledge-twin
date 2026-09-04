import Link from "next/link";
import { cookies, headers } from "next/headers";

import { CitedBody } from "@/components/evidence/cited-body";
import { DeepLinkNotice } from "@/components/evidence/deep-link-notice";
import { EvidenceBreadcrumb } from "@/components/evidence/evidence-breadcrumb";
import { TrustHeader } from "@/components/evidence/trust-header";
import { MarkVisited } from "@/components/static-visitor";
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
import { fetchSessionRuns } from "@/lib/session-runs";
import { STATIC_MISS, isStaticRun, loadStaticReplay, staticLookup } from "@/lib/static-replay";

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
  /* 🔴 run→incident 는 서버 목록이 답한다(v0.1.16) — 없으면 `null` 이고 링크도 서지 않는다. */
  const runIncidentId = run
    ? ((await fetchSessionRuns()).find((r) => r.runId === run)?.incidentId ?? null)
    : null;
  const cookieHeader = (await headers()).get("cookie") ?? "";
  // 🔴 세션 유무는 «실제 쿠키»에서 읽는다 — 라우트 성질에서 추정하지 않는다.
  const hasSession = parseSession((await cookies()).get(SESSION_COOKIE)?.value) !== null;

  /**
   * 🔴 정적 replay 경로(`?run=` 이 정적 고정 id) — 굳혀 둔 사본에서 찾는다(T4-2a).
   *    Live 와 «같은 계약 경로»로 찾으므로 아래 렌더 코드는 어느 경로인지 모른 채 돈다.
   *    자산은 여기서만 싣는다(동적 import) — 딥링크로 들어온 Live 방문자는 내려받지 않는다.
   */
  const bundle = isStaticRun(run) ? await loadStaticReplay() : null;
  const reply = bundle
    ? staticLookup<Evidence>(bundle, CONTRACT.evidence(evidenceId))
    : await apiGetServer<Evidence>(CONTRACT.evidence(evidenceId), cookieHeader);

  if (reply.state !== "ok") {
    /* 🔴 정적 재생본이 그 자리를 안 담은 것도 «없는 것»이다(D-68). status 가 undefined 라
       404 검사만으로는 「묻지 못했다」쪽으로 떨어졌고, 그래서 폐하 공개면에서 GP 근거가
       「서버에 닿지 못했습니다」로 그려졌다 — 서버는 그날 멀쩡히 살아 있었다. */
    const missing = reply.status === 404 || reply.why === STATIC_MISS;
    return (
      <div className="flex max-w-3xl flex-col gap-3">
        <EvidenceBreadcrumb
          evidenceId={evidenceId}
          runId={run}
          staticIncidentId={bundle?.manifest.anchors.incidentId}
          runIncidentId={runIncidentId}
        />
        <Unavailable
          screen={`③ Evidence 뷰 · ${evidenceId}`}
          why={reply.detail?.message ?? reply.why}
          /* 🔴 서버가 사유 «코드»를 말했으면 그대로 넘긴다 — 화면이 문장으로 되짚지 않는다. */
          code={reply.detail?.code}
          kind={missing ? "not-found" : "unavailable"}
        />
        {missing && (
          // 🔴 Q-34 를 화면이 «그대로» 말한다. 서버는 「없는 근거」와 「이 라우트가 다루지
          //    않는 kind」에 같은 404 를 준다(계약 v0.1.1 이 코드를 무규정 — 현행 참 · red
          //    아님). 화면이 evidenceId 모양으로 kind 를 «추정»해 둘을 갈라 그리면, 그것은
          //    계약이 정하지 않은 것을 화면이 정한 것이다. 추정하지 않고 사실만 적는다.
          <p className="fkt-card p-5 text-foot text-muted">
            요청하신 근거를 찾을 수 없습니다. 주소가 정확한지 확인해 주시고, 조사 화면의
            근거 목록에서 다시 열어 주세요.
          </p>
        )}
        <DeepLinkNotice hasSession={hasSession} runId={run} incidentId={runIncidentId} />
      </div>
    );
  }

  const ev = reply.data;
  const docId = documentIdOf(ev.evidenceId);
  // 🔴 문서는 «doc-chunk 일 때만» 부른다. record 의 id 로 문서를 물으면 404 가 돌아오고,
  //    그 404 를 화면이 「문서를 못 가져왔다」로 그리면 정상 상태가 결함처럼 보인다.
  const doc =
    ev.kind === "doc-chunk" && docId
      ? bundle
        ? staticLookup<DocumentPreview>(bundle, CONTRACT.document(docId, ev.evidenceId))
        : await apiGetServer<DocumentPreview>(CONTRACT.document(docId, ev.evidenceId), cookieHeader)
      : null;

  const activeTab = tab === "graph" ? "graph" : "doc";

  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-3">
      <EvidenceBreadcrumb
        evidenceId={ev.evidenceId}
        runId={run}
        staticIncidentId={bundle?.manifest.anchors.incidentId}
        runIncidentId={runIncidentId}
      />
      <header className="fkt-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-body-c font-semibold">③ Evidence</h1>
          <span className="id text-body-c text-ai">{ev.evidenceId}</span>
          <span
            className="fkt-pill bg-fill text-foot text-muted"
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

      <DeepLinkNotice hasSession={hasSession} runId={run} incidentId={runIncidentId} />
      {/* 🔴 열람 이력 — 정적 경로에서만 남긴다(ⓒ). 그리는 것이 없는 부수효과 컴포넌트다. */}
      <MarkVisited id={ev.evidenceId} run={run} />

      {ev.kind === "record" ? (
        <RecordView evidence={ev} />
      ) : ev.kind === "graph-path" ? (
        /* 🔴 그래프 경로 근거에는 «문서 원문»이 없다 — 탭을 그리면 빈 탭 하나가 늘 남는다.
           경로가 곧 본문이므로 그 자리를 바로 채운다(D-68). */
        <GraphPathView evidence={ev} />
      ) : (
        <>
          {/* 탭 — 🔴 링크로 만든다. 클라이언트 JS 없이 Tab·Enter 로 오가고, 상태가 URL 에
              남아 딥링크가 탭까지 가리킨다(wireframes §6 `?tab=graph|doc`). */}
          <nav
            className="flex gap-2 text-foot"
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
        "rounded-pill px-3 py-1 transition-colors duration-(--fkt-dur-1) focus:outline-2 focus:outline-ai " +
        (active ? "bg-fill font-semibold text-ink" : "text-muted hover:bg-inset hover:text-ink")
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
      <p className="rounded border border-warn/40 bg-panel p-3 text-body-c text-warn">
        <span className="id">{evidence.evidenceId}</span> 에서 원문 문서를 찾지 못했습니다.
        근거 번호의 형식이 예상과 달라 원문을 함께 보여 드리지 못합니다.
      </p>
    );
  }

  if (!doc || doc.state !== "ok") {
    const why = doc?.detail?.message ?? doc?.why ?? "문서를 부르지 않았다";
    return (
      <div className="rounded border border-warn/40 bg-panel p-3">
        <p className="text-body-c text-warn">문서 원문을 가져오지 못했다.</p>
        <p className="id mt-1 text-foot text-muted">
          {doc?.detail?.code ? `${doc.detail.code} · ` : ""}
          {why}
        </p>
        {/* 인용 문장만이라도 남긴다 — evidence 응답의 `text` 는 이미 손에 있다. */}
        <p className="mt-2 text-foot text-muted">
          원문 대조는 못 하지만, 근거 응답이 실어 온 인용 문장은 아래와 같다.
        </p>
        <pre className="mt-2 max-h-64 overflow-auto rounded-chip bg-inset p-3 text-foot whitespace-pre-wrap">
          {evidence.text}
        </pre>
      </div>
    );
  }

  const d = doc.data;
  return (
    <section className="fkt-card p-5" data-testid="document-tab">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="id text-body-c text-ai">{d.documentId}</span>
        <span className="text-body-c">{d.title}</span>
        <Link
          href={`/documents/${encodeURIComponent(d.documentId)}?highlight=${encodeURIComponent(evidence.evidenceId)}`}
          className="ml-auto fkt-pill bg-fill text-foot text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
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
    <p className="mt-3 border-t border-edge pt-2 text-foot text-muted" data-testid="prev-revision-deferred">
      <span className="fkt-pill bg-fill text-muted/70">
        [ 이전 revision 보기 ]
      </span>{" "}
      이전 판본은 아직 제공되지 않습니다.
    </p>
  );
}

/** record kind — SSOT 레코드를 편 것(계약 v0.1.1 `record: {entityType, fields}`). */
function RecordView({ evidence }: { evidence: Evidence }) {
  const rec = evidence.record;
  if (!rec) {
    return (
      <p className="rounded border border-warn/40 bg-panel p-3 text-body-c text-warn">
        이 근거의 내용을 받지 못했습니다.
      </p>
    );
  }
  const entries = Object.entries(rec.fields);
  return (
    <section className="fkt-card p-5" data-testid="record-view">
      <p className="text-foot text-muted">
        SSOT 레코드 직독 · 테이블 <span className="id text-ink">{rec.entityType}</span> · {entries.length}필드
      </p>
      <dl className="mt-2 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-body-c">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="id text-foot text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{String(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-edge pt-2 text-foot text-muted">
        이 근거는 대장에서 바로 읽어 온 값이라 판본·색인 신선도라는 개념이 없습니다.
        그래서 신뢰 배지도 신선도를 표시하지 않습니다.
      </p>
    </section>
  );
}

/** 그래프 경로 탭 — T3-4 자리(§3 인터랙션 ①③). 여기서 «없다»고 말한다. */
/**
 * 그래프 경로 근거 본문 — 조사가 밟은 걸음 그대로(D-68 · 계약 v0.1.17).
 *
 * 🔴 **종단 노드를 링크로 만들지 않는다.** 노드 id 로 열 수 있는 화면이 지금 없어서, 링크를
 *    걸면 눌러 본 사람이 404 를 만난다 — 이 티켓이 고치는 결함과 같은 종류를 새로 만드는 셈이다.
 *
 * 🔴 걸음 문장(`excerpt`)은 서버가 지은 것을 «그대로» 쓴다. 여기서 nodes 를 다시 이어 붙이면
 *    같은 문장을 두 자리에서 짓게 되고, 한쪽만 고치는 날 이벤트 목록과 본문이 갈린다.
 */
function GraphPathView({ evidence }: { evidence: Evidence }) {
  const path = evidence.meta?.path ?? null;
  return (
    <section className="fkt-card p-6" data-testid="graph-path-body">
      <p className="fkt-section-label">그래프 경로</p>
      {evidence.excerpt && (
        <p className="mt-2 text-body-c" data-testid="graph-path-walk">
          {evidence.excerpt}
        </p>
      )}
      {path ? (
        <>
          <p className="mt-3 text-foot text-muted">
            {path.label} · {path.hops}-hop · 걸음 {path.nodes.length}개
            {typeof evidence.score === "number" && ` · score ${evidence.score.toFixed(3)}`}
          </p>
          <ol className="mt-3 space-y-2 text-foot" data-testid="graph-path-steps">
            {path.nodes.map((node, i) => {
              const edge = i > 0 ? path.edges[i - 1] : null;
              return (
                <li key={`${node}-${i}`} className="flex flex-col gap-1">
                  {edge && (
                    <span className="text-muted">↓ {edge.type}</span>
                  )}
                  {/* 🔴 노드는 «글자»다 — 열 화면이 없으므로 링크로 만들지 않는다. */}
                  <span className="id text-body-c text-ink">{node}</span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="mt-3 text-foot text-muted">
          이 근거에는 경로 상세가 담겨 있지 않습니다.
        </p>
      )}
      {evidence.sourceId && (
        <p className="mt-3 text-foot text-muted">
          종단 노드 <span className="id">{evidence.sourceId}</span>
        </p>
      )}
    </section>
  );
}

function GraphTab({ hasSession, runId }: { hasSession: boolean; runId?: string }) {
  return (
    <section
      className="fkt-card p-6"
      data-testid="graph-tab-placeholder"
    >
      <p className="fkt-section-label">그래프 경로</p>
      <p className="mt-2 text-body-c">조사가 지나간 그래프 경로를 보여 드리는 자리입니다.</p>
      <ul className="mt-2 space-y-1 text-foot text-muted">
        <li>
          ▪ 경로는 조사가 실제로 밟은 자리에서만 나옵니다. 조사 결과가 없으면 그릴 대상도
          없습니다.
        </li>
        <li>
          ▪ 조사 결과는 시작한 세션에서만 열리므로, 세션 없이 연 화면에서는 보이지 않습니다.
          {hasSession ? " 지금은 세션이 있습니다." : " 지금은 세션 없이 열린 화면입니다."}
        </li>
        <li>
          ▪ 녹화 재생본에는 경로 원본이 담겨 있지 않아 이 자리는 비어 있습니다.
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
