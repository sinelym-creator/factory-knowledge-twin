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
    /**
     * 🔴 **대기열 진입·순위 변동**(계약 v0.1.9 신설 · type 8종 → 9종). 오류가 «아니다» —
     *    요청은 200 으로 답했고 곧 `run.started` 가 따른다. 이 갈래가 없으면 `reduceEvents`
     *    는 대기 중인 run 을 `pending` 인 채로 두고, 화면은 「접수됐다」와 「아직 안 보냈다」를
     *    같은 모습으로 그린다.
     * 🔴 순위가 바뀌면 «같은 type 이 다시» 온다(seq 는 그때도 증가). 그래서 소비 규칙은
     *    「마지막 run.queued 가 지금 순위」 하나뿐이다.
     * 🔴 `estimatedWaitSec` 은 근거가 없으면 `null` 이다 — 화면이 그 자리를 숫자로 채우지 않는다.
     */
    | { type: "run.queued"; payload: { position: number; estimatedWaitSec: number | null } }
    | { type: "run.started"; payload: { scenarioId?: string; question?: string } }
    | { type: "plan.updated"; payload: { steps: string[] } }
    | { type: "step.started"; payload: { step: string } }
    | { type: "step.evidence"; payload: { step: string; evidence: RunEvidence } }
    | { type: "step.completed"; payload: { step: string; elapsedMs: number; summary: string } }
    | {
        type: "run.completed";
        payload: { candidates: RunCandidate[]; totalElapsedMs?: number; workOrderDraftId?: string };
      }
    | { type: "run.stopped"; payload: { note?: string } }
    /**
     * 🔴 **종단 이벤트다**(계약 agent-events · `{ code, message, fallback? }`).
     *    앞판은 이 갈래가 없어서 `reduceEvents` 가 상태를 `running` 인 채로 두었고, 화면은
     *    «끝난 조사»를 「조사중」이라 말했다(D-1). 서버는 사유까지 말해 줬는데 화면이 그것을
     *    버린 것이라, 방문자는 영영 오지 않을 결과를 기다린다 — §0.2 의 반대 방향이다.
     */
    | { type: "run.failed"; payload: { code: string; message: string; fallback?: "replay" } }
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
  /**
   * 🔴 `halted` = 「돌고 있었는데 run 이 끝났다」. `done` 으로 접지 않는다 — 완료하지 않은
   *    단계를 완료로 그리면 화면이 서버가 하지 않은 말을 한다. 완료·실패·중단은 다른 사실이다.
   */
  state: "pending" | "running" | "done" | "halted";
  elapsedMs?: number;
  summary?: string;
  /** 이 단계가 만든 근거 수 — 스트립이 「어디서 왔는지」를 말할 수 있게. */
  evidenceCount: number;
};

export type RunFailure = { code: string; message: string; fallback?: "replay" };

export type RunQueue = { position: number; estimatedWaitSec: number | null };

export type RunState = {
  /**
   * 🔴 `queued` 를 `pending` 에 합치지 않는다. 「아직 아무 말도 못 들었다」와 「접수됐고
   *    N번째로 기다린다」는 방문자에게 다른 사실이다 — 합치면 화면은 대기 순위를 알면서도
   *    말하지 않는 상태가 되고, 그 침묵은 고장과 구별되지 않는다.
   */
  status: "pending" | "queued" | "running" | "completed" | "stopped" | "failed";
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
  /** 🔴 서버가 «말한» 실패 사유. 없으면 null — 화면이 사유를 지어내지 않는다. */
  failure: RunFailure | null;
  /** `run.stopped` 의 note(있을 때만) — 중지는 실패가 아니라 다른 사건이다. */
  stopNote: string | null;
  /** 마지막으로 반영한 seq — 「어디까지 본 상태인가」를 화면이 말할 수 있게. */
  lastSeq: number | null;
  /** 🔴 마지막 `run.queued` 의 값. 실행이 시작되면 null 로 «지운다» — 지나간 순위를 남겨 두면
   *     화면이 이미 도는 조사를 「3번째로 대기 중」이라고 말한다. */
  queue: RunQueue | null;
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
  failure: null,
  stopNote: null,
  lastSeq: null,
  queue: null,
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
      case "run.queued":
        s.status = "queued";
        s.queue = {
          position: e.payload.position,
          estimatedWaitSec: e.payload.estimatedWaitSec ?? null,
        };
        break;
      case "run.started":
        s.status = "running";
        s.queue = null;            // 🔴 시작했으면 순위는 «지나간 사실»이다
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
        s.stopNote = e.payload.note ?? null;
        halt(steps);
        break;
      case "run.failed":
        s.status = "failed";
        s.failure = e.payload;
        halt(steps);
        break;
    }
  }

  s.steps = [...steps.values()];
  return s;
}

/**
 * 돌고 있던 단계를 «중단»으로 접는다 — 종단 이벤트(`run.failed`·`run.stopped`) 뒤에 부른다.
 *
 * 🔴 이것이 없으면 타임라인이 「▶ 진행중…」을 영원히 띄운다. run 은 끝났는데 화면만 안 끝난
 *    상태이고, 그것은 「기다리면 온다」는 거짓말이다(D-1 의 절반).
 * 🔴 `done` 으로 접지 않는 이유: 그 단계는 «완료하지 않았다». 완료로 그리면 소요·요약이
 *    없는 완료 단계가 생기고, 그 빈 자리가 「측정을 못 한 것」인지 「0 이었던 것」인지 갈리지 않는다.
 */
function halt(steps: Map<string, StepView>): void {
  for (const v of steps.values()) if (v.state === "running") v.state = "halted";
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
