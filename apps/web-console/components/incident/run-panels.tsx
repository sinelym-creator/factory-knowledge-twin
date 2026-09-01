"use client";

import Link from "next/link";

import {
  type RunCandidate,
  type RunEvidence,
  type RunState,
  STEP_LABEL,
  type StepView,
} from "@/lib/run-events";

/**
 * ② 실행 축의 표시 패널 3종 (wireframes §2) — 🔴 **전부 `RunState` 의 순수 함수다.**
 *
 * 상태를 스스로 들지 않으므로 재생·되감기가 이 파일을 건드리지 않는다: 커서가 움직이면
 * 다른 `RunState` 가 들어올 뿐이다. 그리고 `mode` 를 읽지 않는다 — live·replay 무차별 렌더.
 */

function ms(v: number | undefined): string {
  return v === undefined ? "—" : `${v.toLocaleString()}ms`;
}

/** 좌 320px — Agent 타임라인 + 진행 5단계 인디케이터. */
export function RunTimeline({ state, waiting = true }: { state: RunState; waiting?: boolean }) {
  const done = state.steps.filter((s) => s.state === "done").length;
  return (
    <section
      className="w-80 shrink-0 rounded border border-edge bg-panel p-3"
      data-testid="run-timeline"
      data-steps-done={done}
      data-steps-total={state.steps.length}
    >
      <div className="flex items-baseline gap-2">
        <p className="text-xs text-muted">Agent 타임라인</p>
        {/* 진행 인디케이터 — 목업의 ●●●○○ 를 «실제 단계 수»로 그린다(수를 박지 않는다) */}
        <span className="ml-auto text-xs text-muted" data-testid="run-progress" aria-label={`${done}/${state.steps.length} 단계 완료`}>
          {state.steps.map((s) => (s.state === "done" ? "●" : s.state === "running" ? "◐" : s.state === "halted" ? "◼" : "○")).join("")}
          <span className="ml-1">
            {done}/{state.steps.length}
          </span>
        </span>
      </div>

      {/* 🔴 스트림이 «사유를 말하며» 닫혔는데 여기서 「기다리는 중」이라 쓰면 한 화면이 두 말을
           한다(위 문구는 「못 찾았다」인데 이 줄은 「올 것」이라 한다). 기다리는지 여부는 부르는
           쪽이 안다 — 실측에서 잡았다(없는 run · close 4404). */}
      {state.steps.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          {waiting
            ? "아직 계획이 오지 않았습니다 — 첫 이벤트를 기다리는 중입니다."
            : "이 조사의 단계를 받지 못했습니다 — 위의 사유를 보십시오."}
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {state.steps.map((s: StepView) => (
            <li key={s.step} data-testid="run-step" data-step={s.step} data-state={s.state}>
              <p className="text-sm">
                <span
                  className={
                    s.state === "done"
                      ? "text-ok"
                      : s.state === "running"
                        ? "text-ai"
                        : s.state === "halted"
                          ? "text-warn"
                          : "text-muted"
                  }
                >
                  {s.state === "done" ? "✓" : s.state === "running" ? "▶" : s.state === "halted" ? "◼" : "○"}
                </span>{" "}
                {STEP_LABEL[s.step] ?? s.step}
                {/* 🔴 라벨을 못 찾아도 «서버가 준 id» 를 보여 준다 — 화면이 조용히 단계를 감추지 않게. */}
                {!STEP_LABEL[s.step] && <span className="id ml-1 text-xs text-muted">{s.step}</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {s.state === "running" && "진행중…"}
                {s.state === "pending" && "대기"}
                {/* 🔴 「완료」로 접지 않는다 — 이 단계는 끝나지 않았다(D-1). */}
                {s.state === "halted" && "중단됨 — 이 단계가 도는 중에 조사가 끝났습니다"}
                {s.state === "done" && (
                  <>
                    {s.summary ?? "완료"} · <span className="id">{ms(s.elapsedMs)}</span>
                  </>
                )}
                {s.evidenceCount > 0 && <> · 근거 {s.evidenceCount}건</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 우 400px — 원인 후보. */
export function CandidateList({
  state,
  runId,
}: {
  state: RunState;
  runId: string;
}) {
  return (
    <aside className="w-100 shrink-0 rounded border border-edge bg-panel p-3" data-testid="candidates" data-count={state.candidates.length}>
      <p className="text-xs text-muted">원인 후보</p>
      {state.candidates.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {state.status === "running"
            ? "조사가 아직 후보를 내지 않았습니다 — 종합 단계에서 옵니다."
            : state.status === "failed"
              ? "조사가 중단되어 후보가 나오지 않았습니다 — 위의 사유를 보십시오."
              : "이 조사는 후보를 내지 않았습니다."}
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {state.candidates.map((c: RunCandidate, i) => (
            <li key={c.failureModeId ?? i} className="border-t border-edge pt-2 first:border-0 first:pt-0" data-testid="candidate">
              <p className="text-sm">
                <span className="text-ai">{c.rank ?? i + 1}</span>{" "}
                <span className="id text-xs">{c.failureModeId}</span>
              </p>
              <p className="text-sm">{c.label}</p>
              {c.confidenceNote && <p className="mt-0.5 text-xs text-muted">{c.confidenceNote}</p>}
              {c.evidenceIds && c.evidenceIds.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                  근거 {c.evidenceIds.length}건 ·{" "}
                  {c.evidenceIds.map((id, k) => (
                    <span key={id}>
                      {k > 0 && " · "}
                      <Link
                        href={`/evidence/${encodeURIComponent(id)}?run=${encodeURIComponent(runId)}`}
                        className="id text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
                      >
                        {id}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * 하단 Evidence 스트립 — run 이 지금까지 «수집한» 근거 전량(§2.1 도크의 절반).
 *
 * 🔴 kind 목록을 «박지 않는다». 실측 kind 는 record·doc-chunk·graph-path 셋이지만, 화면이
 *    그 셋을 상수로 들면 서버가 넷째를 보내는 날 그것만 조용히 사라진다 — 온 것을 센다.
 * 🔴 kind 마다 실리는 키가 다르다(record 엔 score 없음) — 없는 키를 「결함」으로 그리지 않고
 *    그 자리를 비운다(계약이 kind 별 형상을 그렇게 정했다).
 */
export function EvidenceStrip({
  state,
  runId,
  kind,
  onKind,
}: {
  state: RunState;
  runId: string;
  kind: string | null;
  onKind: (k: string | null) => void;
}) {
  const counts = new Map<string, number>();
  for (const e of state.evidence) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const shown = kind ? state.evidence.filter((e) => e.kind === kind) : state.evidence;

  return (
    <section className="rounded border border-edge bg-panel p-3" data-testid="evidence-strip" data-count={state.evidence.length}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted">근거 스트립</p>
        <button
          type="button"
          onClick={() => onKind(null)}
          className={`rounded border px-2 py-0.5 text-xs ${kind === null ? "border-ai text-ai" : "border-edge text-muted hover:text-ink"}`}
          data-testid="evidence-filter-all"
        >
          전체 {state.evidence.length}
        </button>
        {[...counts.entries()].map(([k, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => onKind(k)}
            className={`rounded border px-2 py-0.5 text-xs ${kind === k ? "border-ai text-ai" : "border-edge text-muted hover:text-ink"}`}
            data-testid="evidence-filter"
            data-kind={k}
          >
            {k} {n}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          {state.evidence.length === 0
            ? "아직 근거가 없습니다 — 조사가 진행되며 여기에 쌓입니다."
            : "이 kind 의 근거가 없습니다."}
        </p>
      ) : (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {shown.map((e: RunEvidence & { step: string }, i) => (
            <li
              key={`${e.evidenceId}-${i}`}
              className="w-64 shrink-0 rounded border border-edge bg-bg p-2"
              data-testid="evidence-card"
              data-kind={e.kind}
              data-step={e.step}
            >
              <p className="id truncate text-xs text-ai" title={e.evidenceId}>
                {e.evidenceId}
              </p>
              <p className="mt-1 line-clamp-3 text-xs text-muted">{e.excerpt}</p>
              <p className="mt-1 text-xs text-muted">
                {e.kind}
                {/* 🔴 score 는 kind 마다 없을 수 있다 — 없으면 그 자리를 비운다(0 으로 지어내지 않는다) */}
                {e.score !== undefined && <> · {e.score.toFixed(3)}</>}
                {e.stale === true && <span className="text-warn"> · stale</span>}
              </p>
              <p className="mt-1 text-xs">
                <Link
                  href={`/evidence/${encodeURIComponent(e.evidenceId)}?run=${encodeURIComponent(runId)}`}
                  className="text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
                >
                  근거 보기 ▸
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
