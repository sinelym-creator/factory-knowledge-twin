"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CandidateList, EvidenceStrip, RunTimeline } from "@/components/incident/run-panels";
import { CONTRACT, type RunSnapshot, apiGetBrowser, stopRunBrowser } from "@/lib/contract";
import {
  type RunEvent,
  type RunState,
  closeMessage,
  formatElapsed,
  reduceEvents,
} from "@/lib/run-events";

/**
 * ② 실행 축 (wireframes §2 · T3-4) — WS 이벤트를 화면 상태로.
 *
 * 🔴 **재생·되감기는 「상태를 되돌리는 일」이 아니라 「덜 읽고 다시 만드는 일」이다.**
 *    받은 이벤트를 그대로 쌓아 두고, 커서가 가리키는 만큼만 `reduceEvents` 로 접는다.
 *    되감기에 undo 를 짜면 이벤트가 한 종 늘 때마다 undo 가 뒤처지는데, 이 형태에는
 *    되돌릴 것이 없다 — 따라가야 할 상태를 파생으로 바꿨다.
 *
 * 🔴 **mode 로 렌더를 가르지 않는다.** live·replay 는 같은 스키마를 쓰고(실측: 이벤트 32건·
 *    6종·evidence 19건 동일), 그래서 재생 컨트롤도 두 모드에 «똑같이» 있다 — 끝난 live 조사도
 *    되감을 수 있다. mode 는 배지 문구에만 쓴다.
 *
 * 🔴 **빈 화면 0.** WS 가 못 붙거나 끊기면 `GET /runs/{runId}` 스냅샷으로 후보라도 세운다.
 *    재연결 기전은 이 티켓이 아니다(T4-2) — 여기서는 「끊겼다」를 말하고 마지막 사실을 남긴다.
 */
export function RunConsole({
  runId,
  initialSnapshot,
  children,
}: {
  runId: string;
  /** 서버 컴포넌트가 이미 받아 둔 스냅샷 — 첫 페인트가 비지 않게 한다. */
  initialSnapshot: RunSnapshot | null;
  /** 중앙 열 — 센서 추세·설비 컨텍스트(T3-2 착지분)를 그대로 받는다(§11.2 배치 유지). */
  children?: React.ReactNode;
}) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const seen = useRef<Set<number>>(new Set());
  /** null = 「지금을 따라간다」 · 숫자 = 그 개수만큼만 접어 본다(되감기). */
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [fallback, setFallback] = useState<RunSnapshot | null>(initialSnapshot);
  const [stopping, setStopping] = useState(false);
  const [kind, setKind] = useState<string | null>(null);

  // ── WS 구독 ────────────────────────────────────────────────────────────────
  // 🔴 runId 가 바뀔 때의 «초기화»는 이 effect 가 하지 않는다 — 부르는 쪽이 `key={run}` 으로
  //    다시 마운트한다. effect 안에서 상태를 되돌리면 초기화가 한 박자 늦게 적용돼, 새 조사를
  //    여는 순간 앞 조사의 이벤트가 잠깐 보인다(그리고 그 한 프레임은 실측에 안 잡힌다).
  useEffect(() => {
    const url = location.origin.replace(/^http/, "ws") + CONTRACT.runStream(runId);
    const ws = new WebSocket(url);
    let closedByUs = false;

    ws.onmessage = (m) => {
      let e: RunEvent;
      try {
        e = JSON.parse(String(m.data)) as RunEvent;
      } catch {
        return; // 🔴 못 읽은 프레임을 «빈 이벤트»로 만들지 않는다 — 없던 사실이 된다
      }
      // 🔴 **중복 처리 0.** 백로그(seq 0부터)와 실시간이 겹칠 수 있다. 서버도 겹침을 거르지만,
      //    거르는 쪽이 하나뿐이면 그쪽이 바뀌는 날 화면에서 같은 단계가 두 번 선다.
      if (seen.current.has(e.seq)) return;
      seen.current.add(e.seq);
      setEvents((prev) => [...prev, e].sort((a, b) => a.seq - b.seq));
    };

    ws.onclose = (ev) => {
      if (closedByUs) return;
      // 🔴 정상 종료(1000)는 «사건»이 아니다 — 조사가 끝나면 서버가 닫는다. 문구를 띄우면
      //    완주한 화면이 매번 경고를 달게 된다.
      if (ev.code !== 1000) setNote(closeMessage(ev.code, ev.reason));
      // 끊겼으면 마지막 사실이라도 남긴다(재연결은 T4-2).
      void apiGetBrowser<RunSnapshot>(CONTRACT.run(runId)).then((r) => {
        if (r.state === "ok") setFallback(r.data);
      });
    };

    return () => {
      closedByUs = true;
      ws.close();
    };
  }, [runId]);

  // ── 재생 ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        const at = c ?? events.length;
        if (at >= events.length) {
          setPlaying(false);
          return c;
        }
        return at + 1;
      });
    }, 220); // 배속 다단은 이연(1x 고정) — 폴리시 패스 트랙
    return () => clearInterval(id);
  }, [playing, events.length]);

  const applied = cursor === null ? events : events.slice(0, cursor);
  const live = useMemo(() => reduceEvents(applied), [applied]);

  /**
   * 🔴 스냅샷은 «채우는» 것이지 «덮는» 것이 아니다. 이벤트가 후보를 냈으면 그것이 정본이고,
   *    없을 때만 스냅샷이 자리를 지킨다 — 되감아서 후보 이전으로 간 상태를 스냅샷이 도로
   *    채우면, 화면이 「그 시점에 이미 답이 있었다」고 거짓말한다.
   */
  const showingPast = cursor !== null && cursor < events.length;
  const state: RunState =
    live.candidates.length === 0 && fallback && !showingPast
      ? { ...live, candidates: fallback.candidates, workOrderDraftId: fallback.workOrderDraftId ?? live.workOrderDraftId }
      : live;

  const total = state.totalElapsedMs ?? state.elapsedMs;
  const confirmed = state.totalElapsedMs !== null;

  const stop = useCallback(async () => {
    setStopping(true);
    const r = await stopRunBrowser(runId);
    setStopping(false);
    if (r.state !== "ok") setNote(`중지하지 못했습니다 — ${r.why}`);
  }, [runId]);

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="run-console" data-status={state.status}>
      {/* ── 컨트롤 + TTAE 행 ───────────────────────────────────────────────── */}
      <section className="rounded border border-edge bg-panel px-4 py-3" data-testid="run-controls">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="id">{runId}</span>
          {state.mode && (
            <span className="rounded border border-edge px-2 py-0.5 text-muted" data-testid="run-mode-badge" data-mode={state.mode}>
              {state.mode.toUpperCase()}
            </span>
          )}
          <span className="text-muted" data-testid="run-status">
            {state.status === "running" ? "조사중" : state.status === "completed" ? "완료" : state.status === "stopped" ? "중지됨" : "대기"}
          </span>

          <button
            type="button"
            onClick={() => void stop()}
            disabled={state.status !== "running" || stopping}
            className="rounded border border-edge px-2 py-1 text-muted hover:text-ink disabled:opacity-40"
            data-testid="run-stop"
          >
            {stopping ? "중지하는 중…" : "⏸ 중지"}
          </button>

          {/* 🔴 재생 컨트롤은 «두 모드 모두»에 있다 — 끝난 조사를 되감는 일에 mode 는 상관없다 */}
          <span className="ml-2 flex items-center gap-1" data-testid="replay-controls">
            <button type="button" onClick={() => { setPlaying(false); setCursor(0); }}
                    className="rounded border border-edge px-2 py-1 text-muted hover:text-ink" data-testid="replay-restart" title="처음으로">⏮</button>
            <button type="button" onClick={() => { setPlaying(false); setCursor((c) => Math.max(0, (c ?? events.length) - 1)); }}
                    className="rounded border border-edge px-2 py-1 text-muted hover:text-ink" data-testid="replay-back" title="한 이벤트 뒤로">◀</button>
            <button type="button" onClick={() => setPlaying((p) => !p)} disabled={events.length === 0}
                    className="rounded border border-edge px-2 py-1 text-ai hover:bg-ai/10 disabled:opacity-40" data-testid="replay-play">
              {playing ? "⏸ 일시정지" : "▶ 재생"}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setCursor((c) => Math.min(events.length, (c ?? events.length) + 1)); }}
                    className="rounded border border-edge px-2 py-1 text-muted hover:text-ink" data-testid="replay-forward" title="한 이벤트 앞으로">▶</button>
            <button type="button" onClick={() => { setPlaying(false); setCursor(null); }} disabled={cursor === null}
                    className="rounded border border-edge px-2 py-1 text-muted hover:text-ink disabled:opacity-40" data-testid="replay-follow">지금으로</button>
            <span className="text-muted" data-testid="replay-cursor" data-applied={applied.length} data-total={events.length}>
              {applied.length}/{events.length} 이벤트
              {state.lastSeq !== null && <> · seq {state.lastSeq}</>}
            </span>
          </span>
        </div>

        {/* ⏱ TTAE 표시행 — 🔴 §2.2 측정-주장 경계 */}
        <p className="mt-2 text-xs text-muted" data-testid="ttae-row" data-elapsed-ms={total} data-confirmed={confirmed}>
          ⏱ 조사 경과 <span className="text-ink">{formatElapsed(total)}</span>{" "}
          <span className="id">({total.toLocaleString()}ms · {confirmed ? "totalElapsedMs 확정" : "elapsedMs 누적"})</span>
          {/* 🔴 replay 의 값은 «재생 시간»이 아니라 재생본이 담은 «원 실행의 관측치»다.
              값은 그대로 쓰되(실측이다) 그 성격을 배지 문구로 밝힌다 — 렌더 분기가 아니다. */}
          {state.mode === "replay" && (
            <span className="ml-1 rounded border border-edge px-1.5 py-0.5" data-testid="ttae-replay-note">
              재생본 · 원 실행 관측치
            </span>
          )}
          <span className="ml-2">
            │ 같은 조사를 사람이 수작업으로: 45분{" "}
            <span className="rounded border border-warn/40 px-1.5 py-0.5 text-warn">잠정 목표 · 미실측</span>
          </span>
          {/* 🔴 단축률(%)은 실측 전에 쓰지 않는다(§2.2). 이 자리에 계산식을 넣지 마라. */}
        </p>

        {note && (
          <p className="mt-2 text-xs text-warn" role="status" data-testid="run-note">
            {note}
          </p>
        )}
      </section>

      {/* ── 3열 ────────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 gap-3">
        <RunTimeline state={state} waiting={note === null} />
        <section className="min-w-0 flex-1 space-y-3">
          <div className="rounded border border-edge bg-panel p-3" data-testid="run-question">
            <p className="text-xs text-muted">조사 질문{state.scenarioId && <> · <span className="id">{state.scenarioId}</span></>}</p>
            <p className="mt-1 text-sm">{state.question ?? "질문이 아직 오지 않았습니다."}</p>
          </div>
          {children}
        </section>
        <CandidateList state={state} runId={runId} />
      </div>

      {/* 하단 가로 스트립 — §11.2 배치 그대로(좌 timeline · 중앙 센서 · 우 후보 · 하단 evidence) */}
      <EvidenceStrip state={state} runId={runId} kind={kind} onKind={setKind} />

      <div className="flex items-center justify-end gap-2">
        {/* 「전략 비교」 → ⑤ (wireframes §2 인터랙션 ⑥ · 현 질문 이월).
            🔴 이월하는 질문은 «서버가 준 run 의 질문»이라 승인 목록 안이다 — 화면이 지어낸
               문자열이 아니다. 받는 쪽도 목록에 있을 때만 쓴다(§16.2 이중 잠금). */}
        <Link
          href={`/compare?run=${encodeURIComponent(runId)}${state.question ? `&q=${encodeURIComponent(state.question)}` : ""}`}
          className="rounded border border-edge px-3 py-1 text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
          data-testid="to-compare"
        >
          전략 비교 ▸
        </Link>
        {/* 「작업지시서 초안 보기」 — run 완료 시 활성(wireframes §2) */}
        {state.workOrderDraftId ? (
          <Link
            href={`/work-orders/${encodeURIComponent(state.workOrderDraftId)}`}
            className="rounded border border-ai/60 px-3 py-1 text-xs text-ai hover:bg-ai/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
            data-testid="work-order-draft"
          >
            작업지시서 초안 보기 ▸
          </Link>
        ) : (
          <span className="rounded border border-edge px-3 py-1 text-xs text-muted opacity-50" data-testid="work-order-draft-pending">
            작업지시서 초안 보기 ▸ (조사 완료 후)
          </span>
        )}
      </div>
    </div>
  );
}
