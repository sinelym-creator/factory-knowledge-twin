/**
 * agent-events 스키마 → «화면 상태» (T3-4).
 *
 * 정본 = `packages/contracts/agent-events-v0.1.schema.json` · 실측(E1 · ai-api :8003 · GS-01):
 *   봉투 `{ runId, seq, ts, mode, type, payload }` · 6종
 *   run.started{scenarioId,question} · plan.updated{steps[5]} · step.started{step} ·
 *   step.evidence{step,evidence} · step.completed{step,elapsedMs,summary} ·
 *   run.completed{candidates[],totalElapsedMs,workOrderDraftId}
 *
 * 🔴 **상태를 «누적»으로 들지 않고 «이벤트 배열의 함수»로 만든다.** 재생·되감기가 이 한 줄에
 *    달려 있다: 되감기는 상태를 «되돌리는» 일이 아니라 `reduceEvents(events.slice(0, n))` 로
 *    다시 «만드는» 일이다. 누적 상태에 undo 를 붙이면 되돌릴 것을 하나씩 기억해야 하고,
 *    이벤트가 한 종 늘 때마다 그 기억이 뒤처진다(따라갈 상태를 파생으로 바꾼다 · 14대 계보).
 *
 * 🔴 **mode 로 분기하지 않는다.** live·replay 가 같은 스키마를 쓴다는 것이 계약의 약속이고,
 *    실측도 그렇다(두 모드 이벤트 32건·6종·evidence 19건 동일). mode 는 «배지 문구»에만 쓴다.
 */

export type RunEvidence = {
  evidenceId: string;
  kind: string;
  sourceId: string;
  excerpt: string;
  /** 🔴 kind 마다 실리는 키가 다르다(실측): record 엔 score 가 없고, doc-chunk 엔 아래 3필드가 더 온다.
   *     없는 키를 «결함»으로 세지 않는다 — 계약이 kind 별 형상을 그렇게 정했다(오케 판정 08-31). */
  score?: number;
  revisionId?: string | null;
  contentHash?: string | null;
  stale?: boolean;
};

export type RunCandidate = {
  rank?: number;
  failureModeId?: string;
  label?: string;
  confidenceNote?: string;
  evidenceIds?: string[];
};

type Envelope = { runId: string; seq: number; ts: string; mode: string };

export type RunEvent = Envelope &
  (
    | { type: "run.started"; payload: { scenarioId?: string; question?: string } }
    | { type: "plan.updated"; payload: { steps: string[] } }
    | { type: "step.started"; payload: { step: string } }
    | { type: "step.evidence"; payload: { step: string; evidence: RunEvidence } }
    | { type: "step.completed"; payload: { step: string; elapsedMs: number; summary: string } }
    | {
        type: "run.completed";
        payload: { candidates: RunCandidate[]; totalElapsedMs?: number; workOrderDraftId?: string };
      }
    | { type: "run.stopped"; payload: Record<string, never> }
  );

/** 「지금 무슨 일이 있었나」를 화면 낱말로. 🔴 서버가 준 stepId 를 «번역»하지 않는다 — 라벨만 붙인다. */
export const STEP_LABEL: Record<string, string> = {
  structured: "구조화 조회",
  vector: "문서 검색",
  graph: "그래프 추적",
  synthesize: "종합",
  draft_work_order: "작업지시 초안",
};

export type StepView = {
  step: string;
  state: "pending" | "running" | "done";
  elapsedMs?: number;
  summary?: string;
  /** 이 단계가 만든 근거 수 — 스트립이 「어디서 왔는지」를 말할 수 있게. */
  evidenceCount: number;
};

export type RunState = {
  status: "pending" | "running" | "completed" | "stopped";
  mode: string | null;
  scenarioId: string | null;
  question: string | null;
  steps: StepView[];
  evidence: (RunEvidence & { step: string })[];
  candidates: RunCandidate[];
  /** 🔴 진행 중 = 수신한 `step.completed.elapsedMs` 의 «누적 합»(§2.2 ⓐ). */
  elapsedMs: number;
  /** 완료 시 서버가 확정한 값. 없으면 null — 여기에 누적 합을 대신 넣지 않는다(다른 사실이다). */
  totalElapsedMs: number | null;
  workOrderDraftId: string | null;
  /** 마지막으로 반영한 seq — 「어디까지 본 상태인가」를 화면이 말할 수 있게. */
  lastSeq: number | null;
};

const EMPTY: RunState = {
  status: "pending",
  mode: null,
  scenarioId: null,
  question: null,
  steps: [],
  evidence: [],
  candidates: [],
  elapsedMs: 0,
  totalElapsedMs: null,
  workOrderDraftId: null,
  lastSeq: null,
};

/**
 * 이벤트 배열 → 상태. 🔴 순수 함수다(같은 입력 = 같은 화면).
 *
 * 🔴 `plan.updated` 가 오기 «전»에 `step.started` 가 올 수 있다고 가정하고 짠다 — 계약이
 *    순서를 보장한다고 적어 두지 않았고, 재연결 시 백로그가 어디서부터 오는지는 서버가 정한다.
 *    모르는 step 은 목록 끝에 붙인다: 빠뜨리는 것보다 늦게 나타나는 편이 눈에 보인다.
 */
export function reduceEvents(events: readonly RunEvent[]): RunState {
  const steps = new Map<string, StepView>();
  const ensure = (step: string): StepView => {
    let v = steps.get(step);
    if (!v) {
      v = { step, state: "pending", evidenceCount: 0 };
      steps.set(step, v);
    }
    return v;
  };

  const s: RunState = { ...EMPTY, steps: [], evidence: [], candidates: [] };

  for (const e of events) {
    s.mode = e.mode ?? s.mode;
    s.lastSeq = e.seq;
    switch (e.type) {
      case "run.started":
        s.status = "running";
        s.scenarioId = e.payload.scenarioId ?? null;
        s.question = e.payload.question ?? null;
        break;
      case "plan.updated":
        for (const step of e.payload.steps) ensure(step);
        break;
      case "step.started":
        ensure(e.payload.step).state = "running";
        break;
      case "step.evidence": {
        const v = ensure(e.payload.step);
        v.evidenceCount += 1;
        s.evidence.push({ ...e.payload.evidence, step: e.payload.step });
        break;
      }
      case "step.completed": {
        const v = ensure(e.payload.step);
        v.state = "done";
        v.elapsedMs = e.payload.elapsedMs;
        v.summary = e.payload.summary;
        s.elapsedMs += e.payload.elapsedMs ?? 0;
        break;
      }
      case "run.completed":
        s.status = "completed";
        s.candidates = e.payload.candidates ?? [];
        s.totalElapsedMs = e.payload.totalElapsedMs ?? null;
        s.workOrderDraftId = e.payload.workOrderDraftId ?? null;
        break;
      case "run.stopped":
        s.status = "stopped";
        break;
    }
  }

  s.steps = [...steps.values()];
  return s;
}

/**
 * WS 종료 코드 → 화면 문구 (계약 §WS · 실측 4404).
 *
 * 🔴 **애플리케이션 코드(4000~4999)와 전송 계층 코드를 가른다.** 1006 은 「서버가 사유를
 *    말한 것」이 아니라 「말할 기회 없이 끊겼다」는 뜻이라, 같은 문장으로 그리면 화면이
 *    서버가 하지 않은 말을 대신 지어내는 것이 된다.
 * 🔴 무쿠키·깨진 세션은 여기 오지 «못한다» — 실측상 핸드셰이크가 403 으로 거부되어 close
 *    이벤트의 code 는 1006 이다. 그래서 1006 문구가 「세션이 끊겼을 수도」를 함께 말한다.
 */
export function closeMessage(code: number, reason: string): string {
  if (code === 1000) return "이벤트 스트림이 정상 종료됐습니다.";
  if (code === 4404) return "서버가 이 조사를 찾지 못했습니다 — 다른 세션의 조사이거나 사라진 조사입니다.";
  if (code >= 4000 && code <= 4999) {
    return `서버가 스트림을 닫았습니다 (코드 ${code}${reason ? ` · ${reason}` : ""}).`;
  }
  return `이벤트 스트림이 끊겼습니다 (코드 ${code}) — 세션이 만료됐거나 서버에 닿지 못했습니다. 아래는 마지막으로 조회한 결과입니다.`;
}

/**
 * `1분 12초` — wireframes §2 표기. 🔴 반올림하지 않고 «내림»한다(없던 시간을 더하지 않는다).
 *
 * 🔴 **1분 미만은 소수 한 자리로 쓴다.** 초 단위로만 자르면 526ms 인 live 조사가 「조사 경과
 *    0초」로 보인다 — 거짓은 아니지만, 목적 1(다운타임 단축)을 «눈앞에서 보여주는» 유일한
 *    줄이 0 을 말하면 그 줄이 하는 일이 사라진다. 실측에서 잡아 고쳤다(live 526ms).
 */
export function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${(Math.floor(ms / 100) / 10).toFixed(1)}초`;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}분 ${total % 60}초`;
}
