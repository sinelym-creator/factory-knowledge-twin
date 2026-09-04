"use client";

import Link from "next/link";

import { SynthesisPending } from "./synthesis-pending";
import {
  type RunCandidate,
  type RunProgress,
  type RunEvidence,
  type RunState,
  type RunSynthesis,
  STEP_LABEL,
  type StepView,
} from "@/lib/run-events";

/**
 * ② 실행 축의 표시 패널 3종 (wireframes §2) — 🔴 **전부 `RunState` 의 순수 함수다.**
 *
 * 상태를 스스로 들지 않으므로 재생·되감기가 이 파일을 건드리지 않는다: 커서가 움직이면
 * 다른 `RunState` 가 들어올 뿐이다. 그리고 `mode` 를 읽지 않는다 — live·replay 무차별 렌더.
 *
 * 🔴 **예외 한 자리 = 합성 대기 표시**(T6-2 ③). 「지금 AI 가 돌고 있고 보통 몇 초 걸린다」는
 *    이벤트 «렌더»가 아니라 지금 무엇이 일어나는지에 대한 «주장»이고, 그 주장은 «지금을 보고
 *    있지 않을 때» 거짓이다. 그래서 이 한 곳만 `mode` 와 `showingPast` 를 읽는다. 시간을 드는
 *    부분은 `SynthesisPending` 안에 격리했으므로 이 파일은 여전히 순수 함수다.
 */

/**
 * 「지금 합성이 돌고 있는가」 — 대기 표시의 유일한 조건.
 *
 * 🔴 **되감기(`showingPast`)를 먼저 제외한다.** live run 이라도 커서를 synthesize 중간에 두면
 *    상태는 `running` 이지만 실제로 도는 것은 없다 — 실측(33대 브라우저 축): 끝난 live run 을
 *    28번째 이벤트로 되감자 대기 표시가 **1개 섰다**. `mode` 만으로 막던 앞판은 이 자리를
 *    비워 둔 것이었다. 같은 파일이 스냅샷 폴백에 이미 쓰는 이름을 그대로 빌린다.
 *
 * 🔴 `mode === "replay"` 도 제외한다. 녹화 재생은 즉시 끝나고, 그 동안 「AI 합성 중」이라고
 *    적으면 화면이 사실이 아닌 말을 한다(조용한 강등의 «반대 방향» 거짓말 — 안 도는 것을
 *    돈다고 하는 것). 두 조건은 한 형태의 거짓말이지만 서로를 덮지 못한다: replay 도 꼬리에
 *    서면 `showingPast` 가 false 이고, live 되감기는 `mode` 가 replay 가 아니다.
 */
function synthesizing(state: RunState, showingPast: boolean): boolean {
  if (showingPast) return false;
  if (state.mode === "replay") return false;
  return state.steps.some((s) => s.step === "synthesize" && s.state === "running");
}

function ms(v: number | undefined): string {
  return v === undefined ? "—" : `${v.toLocaleString()}ms`;
}

/**
 * 좌 320px — Agent 타임라인. 🔴 **이 화면의 주인공**이다(T6-4 재수립 · 폐하 09-03 14:24).
 *
 * 형태 = 세로 레일 2px + 단계마다 20px 노드 + 인셋 카드. 앞판은 글머리 문자(✓▶○)를 붙인
 * 목록이라 「다섯 단계를 거쳐 간다」는 사실이 형태로 보이지 않았다 — 진행은 «선»으로 보여야
 * 읽힌다. 노드 색·도형·글자는 그대로 셋 다 쓴다(§11.3 색각 규율).
 */
export function RunTimeline({ state, waiting = true }: { state: RunState; waiting?: boolean }) {
  const done = state.steps.filter((s) => s.state === "done").length;
  return (
    <section
      className="fkt-card w-full shrink-0 p-5 xl:w-80"
      data-testid="run-timeline"
      data-steps-done={done}
      data-steps-total={state.steps.length}
    >
      <div className="flex items-baseline gap-2">
        <p className="fkt-section-label">Agent 타임라인</p>
        {/* 진행 인디케이터 — 목업의 ●●●○○ 를 «실제 단계 수»로 그린다(수를 박지 않는다) */}
        <span
          className="ml-auto text-cap text-placeholder"
          data-testid="run-progress"
          aria-label={`${done}/${state.steps.length} 단계 완료`}
        >
          {state.steps.map((s) => (s.state === "done" ? "●" : s.state === "running" ? "◐" : s.state === "halted" ? "◼" : "○")).join("")}
          <span className="ml-1 font-semibold text-muted">
            {done}/{state.steps.length}
          </span>
        </span>
      </div>

      {/* 🔴 스트림이 «사유를 말하며» 닫혔는데 여기서 「기다리는 중」이라 쓰면 한 화면이 두 말을
           한다(위 문구는 「못 찾았다」인데 이 줄은 「올 것」이라 한다). 기다리는지 여부는 부르는
           쪽이 안다 — 실측에서 잡았다(없는 run · close 4404). */}
      {state.steps.length === 0 ? (
        <p className="mt-4 text-body-c text-muted">
          {waiting
            ? "아직 계획이 오지 않았습니다. 첫 소식을 기다리는 중입니다."
            : "이 조사의 단계를 받지 못했습니다. 위의 안내를 확인해 주세요."}
        </p>
      ) : (
        <ol className="relative mt-4 space-y-2 pl-8">
          {/* 세로 레일 — 첫 노드 중심에서 마지막 노드 중심까지만(끝이 허공에 뜨지 않게) */}
          <span
            className="absolute left-[9px] top-2.5 bottom-2.5 w-0.5 rounded-pill bg-edge"
            aria-hidden
          />
          {state.steps.map((s: StepView) => {
            const tone =
              s.state === "done"
                ? "text-ok"
                : s.state === "running"
                  ? "text-ai"
                  : s.state === "halted"
                    ? "text-warn"
                    : "text-placeholder";
            const glyph =
              s.state === "done" ? "✓" : s.state === "running" ? "▶" : s.state === "halted" ? "◼" : "○";
            return (
              <li key={s.step} className="relative" data-testid="run-step" data-step={s.step} data-state={s.state}>
                {/* 노드 20px — 진행 중은 맥동(그림자·리프트 없음) */}
                <span
                  className={`absolute -left-8 top-1.5 flex h-5 w-5 items-center justify-center rounded-pill bg-bg text-[0.6875rem] ${tone} ${
                    s.state === "running" ? "fkt-pulse" : ""
                  }`}
                  style={{ boxShadow: "inset 0 0 0 2px currentColor" }}
                  aria-hidden
                >
                  {glyph}
                </span>
                <div className="rounded-chip bg-inset px-3.5 py-2.5">
                  <p className="text-body-c font-semibold">
                    {STEP_LABEL[s.step] ?? s.step}
                    {/* 🔴 라벨을 못 찾아도 «서버가 준 id» 를 보여 준다 — 화면이 조용히 단계를 감추지 않게. */}
                    {!STEP_LABEL[s.step] && <span className="id ml-1 text-foot text-muted">{s.step}</span>}
                  </p>
                  <p className={`mt-0.5 text-foot ${s.state === "halted" ? "text-warn" : "text-muted"}`}>
                    {s.state === "running" && "진행중…"}
                    {s.state === "pending" && "대기"}
                    {/* 🔴 「완료」로 접지 않는다 — 이 단계는 끝나지 않았다(D-1). */}
                    {s.state === "halted" && "중단됨 · 이 단계가 진행되는 중에 조사가 끝났습니다"}
                    {s.state === "done" && (
                      <>
                        {s.summary ?? "완료"} · <span className="id">{ms(s.elapsedMs)}</span>
                      </>
                    )}
                    {s.evidenceCount > 0 && <> · 근거 {s.evidenceCount}건</>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** 우 400px — 원인 후보. */
/**
 * 🔴 합성 축 배지 — 색만으로 구분하지 않는다(아이콘 + 낱말 병기, `live-status.tsx` 규약).
 *    `live-rejected` 는 사유까지 화면에 적는다. 사유를 툴팁에만 넣으면 터치 기기에서는
 *    「거부됐다」만 보이고 「왜」가 사라진다 — 그건 숨긴 것과 같다.
 */
function SynthesisBadge({ synthesis }: { synthesis?: RunSynthesis }) {
  if (!synthesis) return null;
  const face =
    synthesis.axis === "live"
      ? { icon: "◉", text: "live 합성", cls: "text-ok" }
      : synthesis.axis === "live-rejected"
        ? { icon: "◌", text: "live 거부", cls: "text-warn" }
        : { icon: "◐", text: "결정적", cls: "text-muted" };
  return (
    <span
      className={`fkt-pill ${face.cls}`}
      data-testid="synthesis-badge"
      data-axis={synthesis.axis}
    >
      <span aria-hidden>{face.icon}</span>
      {face.text}
      {synthesis.model && <span className="id text-muted">{synthesis.model}</span>}
    </span>
  );
}

/**
 * 합성 «잠정» 카드 — 결정적 순위 선표시 + 도착한 문장 (T6-3 ① ② · 계약 v0.1.13).
 *
 * 🔴 **여기 있는 것은 전부 걷힐 수 있다.** 판정은 `step.completed(synthesize).synthesis` 하나이고,
 *    거부되면 이 블록은 통째로 사라진다(부분 채택 0 · v0.1.11). 그래서 배지가 「순위 계산됨 ·
 *    AI 근거 작성 중」이라고 «지금 상태»를 말한다 — 「이것이 답이다」라고 말하지 않는다.
 *
 * 🔴 **라벨이 없다.** 선표시가 싣는 것은 `failureModeId` 뿐이고(계약 형상), 라벨은 최종 후보에
 *    실려 온다. 없는 이름을 지어내는 대신 id 를 그대로 보인다 — 곧 라벨로 «바뀌는» 것이 아니라
 *    같은 카드가 이름을 얻는 것이고, 그때 순위도 최종본으로 확정된다.
 */
function ProvisionalCandidates({ progress }: { progress: RunProgress }) {
  return (
    <div className="mt-2" data-testid="synthesis-provisional" data-count={progress.ranking.length}>
      <p className="text-xs text-ai" data-testid="synthesis-provisional-badge">
        순위 계산됨 · AI 근거 작성 중
      </p>
      <ul className="mt-2 space-y-3">
        {progress.ranking.map((fmId, i) => {
          const said = progress.sentences.filter((s) => s.failureModeId === fmId);
          return (
            <li
              key={fmId}
              className="rounded-chip bg-inset p-3"
              data-testid="provisional-candidate"
              data-failure-mode={fmId}
              data-sentences={said.length}
            >
              <p className="text-sm text-ink">
                <span className="text-muted">{i + 1}.</span> <span className="id">{fmId}</span>
              </p>
              {said.length === 0 ? (
                // 🔴 «빈 자리»를 남긴다. 문장이 아직 없다는 사실이 화면에 보여야, 나중에 채워질
                //    자리인지 원래 없는 것인지를 방문자가 가른다(§6.2 빈 화면 0).
                <p className="mt-1 text-xs text-muted">근거 문장 대기 중…</p>
              ) : (
                said.map((s, j) => (
                  <p key={j} className="fkt-rise mt-1 text-xs text-ink/90">
                    {s.text}
                    <span className="id ml-1 text-muted">{s.citedEvidenceIds.join(" · ")}</span>
                  </p>
                ))
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CandidateList({
  state,
  runId,
  showingPast = false,
}: {
  state: RunState;
  runId: string;
  /** 되감기로 «과거»를 보고 있는가 — 대기 표시(지금에 대한 주장)의 게이트. */
  showingPast?: boolean;
}) {
  return (
    <aside
      className="fkt-card w-full shrink-0 p-5 xl:w-[380px]"
      data-testid="candidates"
      data-count={state.candidates.length}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="fkt-section-label">원인 후보</p>
        <SynthesisBadge synthesis={state.steps.find((s) => s.step === "synthesize")?.synthesis} />
      </div>
      {(() => {
        const synthesis = state.steps.find((s) => s.step === "synthesize")?.synthesis;
        return synthesis?.axis === "live-rejected" && synthesis.rejectedReason ? (
          <p className="mt-1 text-xs text-warn" data-testid="synthesis-rejected-reason">
            AI 가 쓴 종합 문장이 근거를 인용하지 못해 전량 거부되었습니다.
            ({synthesis.rejectedReason}) 아래 순위는 집계로 낸 결과입니다.
          </p>
        ) : null;
      })()}
      {state.candidates.length === 0 && synthesizing(state, showingPast) ? (
        <>
          {/* 🔴 선표시와 대기 표시는 «공존»한다(계약 v0.1.13 화면). 순위는 이미 아는 사실이고,
              대기 표시는 아직 모르는 것(문장)에 대한 말이다 — 하나가 다른 하나를 대신하지 않는다. */}
          {state.progress && state.progress.ranking.length > 0 ? (
            <ProvisionalCandidates progress={state.progress} />
          ) : null}
          <SynthesisPending skeleton={!state.progress || state.progress.ranking.length === 0} />
        </>
      ) : state.candidates.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {state.status === "running"
            ? "조사가 아직 후보를 내지 않았습니다. 종합 단계에서 나옵니다."
            : state.status === "failed"
              ? "조사가 중단되어 후보가 나오지 않았습니다. 위의 안내를 확인해 주세요."
              : "이 조사는 후보를 내지 않았습니다."}
        </p>
      ) : (
        /* 🔴 후보는 «카드»다 — 순위가 큰 숫자로 서고, 근거 id 는 칩으로 잡힌다. 앞판은 행 사이
           선으로만 나뉜 목록이라 1위와 3위가 같은 무게로 보였다(리서치 §7-9 후보 카드). */
        <ul className="mt-3 space-y-2.5">
          {state.candidates.map((c: RunCandidate, i) => (
            <li
              key={c.failureModeId ?? i}
              className="rounded-chip bg-inset p-3.5"
              data-testid="candidate"
            >
              <div className="flex items-baseline gap-2.5">
                <span className="fkt-num text-metric leading-none text-ai">{c.rank ?? i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-c font-semibold">{c.label}</p>
                  <p className="id text-cap text-placeholder">{c.failureModeId}</p>
                </div>
              </div>
              {c.confidenceNote && <p className="mt-2 text-foot text-muted">{c.confidenceNote}</p>}
              {c.rationale && (
                <div className="mt-2" data-testid="candidate-rationale">
                  {c.rationale.sentences.map((sentence, k) => (
                    <p key={k} className="text-foot leading-relaxed">
                      {sentence}
                    </p>
                  ))}
                  <p className="mt-1 text-cap text-placeholder">
                    인용 {c.rationale.citedEvidenceIds.length}건 ·{" "}
                    <span className="id">{c.rationale.citedEvidenceIds.join(" · ")}</span>
                  </p>
                </div>
              )}
              {c.evidenceIds && c.evidenceIds.length > 0 && (
                <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-cap text-muted">
                  근거 {c.evidenceIds.length}건
                  {c.evidenceIds.map((id) => (
                    <Link
                      key={id}
                      href={`/evidence/${encodeURIComponent(id)}?run=${encodeURIComponent(runId)}`}
                      className="fkt-pill id text-ai focus:outline-2 focus:outline-ai"
                    >
                      {id}
                    </Link>
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
    <section className="fkt-card p-5" data-testid="evidence-strip" data-count={state.evidence.length}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="fkt-section-label mr-1">근거 스트립</p>
        {/* 필터 = 세그먼트 pill(테두리 0 · 선택은 채움) */}
        <button
          type="button"
          onClick={() => onKind(null)}
          className={`rounded-pill px-3 py-1 text-foot transition-colors duration-(--fkt-dur-1) ${
            kind === null ? "bg-fill font-semibold text-ink" : "text-muted hover:bg-inset hover:text-ink"
          }`}
          data-testid="evidence-filter-all"
        >
          전체 {state.evidence.length}
        </button>
        {[...counts.entries()].map(([k, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => onKind(k)}
            className={`rounded-pill px-3 py-1 text-foot transition-colors duration-(--fkt-dur-1) ${
              kind === k ? "bg-fill font-semibold text-ink" : "text-muted hover:bg-inset hover:text-ink"
            }`}
            data-testid="evidence-filter"
            data-kind={k}
          >
            {k} {n}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-body-c text-muted">
          {state.evidence.length === 0
            ? "아직 근거가 없습니다. 조사가 진행되면 여기에 쌓입니다."
            : "이 kind 의 근거가 없습니다."}
        </p>
      ) : (
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {shown.map((e: RunEvidence & { step: string }, i) => (
            <li
              key={`${e.evidenceId}-${i}`}
              className="fkt-hoverable w-64 shrink-0 rounded-chip bg-inset p-3.5"
              data-testid="evidence-card"
              data-kind={e.kind}
              data-step={e.step}
            >
              <p className="id truncate text-foot font-semibold text-ai" title={e.evidenceId}>
                {e.evidenceId}
              </p>
              <p className="mt-1.5 line-clamp-3 text-foot leading-relaxed text-muted">{e.excerpt}</p>
              <p className="mt-2 text-cap text-placeholder">
                {e.kind}
                {/* 🔴 score 는 kind 마다 없을 수 있다 — 없으면 그 자리를 비운다(0 으로 지어내지 않는다) */}
                {e.score !== undefined && <> · {e.score.toFixed(3)}</>}
                {e.stale === true && <span className="text-warn"> · stale</span>}
              </p>
              <p className="mt-2 text-foot">
                <Link
                  href={`/evidence/${encodeURIComponent(e.evidenceId)}?run=${encodeURIComponent(runId)}`}
                  className="font-semibold text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
                >
                  근거 보기
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
