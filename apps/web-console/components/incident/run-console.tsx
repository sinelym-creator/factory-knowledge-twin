"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CandidateList, EvidenceStrip, RunTimeline } from "@/components/incident/run-panels";
import { useLiveStatus } from "@/components/live-status";
import { CONTRACT, type RunSnapshot, apiGetBrowser, stopRunBrowser } from "@/lib/contract";
import { saveCursor, useStoredCursor } from "@/lib/static-replay/visitor-state";
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
  staticEvents,
  children,
}: {
  runId: string;
  /** 서버 컴포넌트가 이미 받아 둔 스냅샷 — 첫 페인트가 비지 않게 한다. */
  initialSnapshot: RunSnapshot | null;
  /**
   * 정적 replay 이벤트 전열 (T4-2a ⓑ) — 있으면 **WS 를 열지 않고 스냅샷도 묻지 않는다**.
   *
   * 🔴 이것이 이 티켓의 몸통이다: 「출처」만 갈아 끼우고 «그 아래는 한 줄도 바꾸지 않는다».
   *    `reduceEvents`·타임라인·근거·후보·되감기가 전부 그대로 돈다(AC ⑤ 렌더 분기 0).
   * 🔴 정적 runId 는 서버로 나가지 않는다(오케 가드레일 ①) — 서버에 없는 id 이고, 물어보면
   *    그 404 가 「정적 경로가 고장」으로 읽힌다.
   */
  staticEvents?: RunEvent[];
  /** 중앙 열 — 센서 추세·설비 컨텍스트(T3-2 착지분)를 그대로 받는다(§11.2 배치 유지). */
  children?: React.ReactNode;
}) {
  const isStatic = staticEvents !== undefined;
  const [events, setEvents] = useState<RunEvent[]>(staticEvents ?? []);
  /**
   * ⓓ Live 복귀 — 🔴 **제안이지 이동이 아니다**(오케 판정 R-3 단서). ai-api 가 돌아왔다고
   *    화면이 스스로 Live 로 넘어가면 방문자가 되감아 보던 자리가 사라진다. 배지는 살아났음을
   *    말하고, 옮길지는 사람이 정한다 — 되감기 상태는 그대로 남는다.
   */
  const liveStatus = useLiveStatus();
  const seen = useRef<Set<number>>(new Set());

  /**
   * 되감기 커서. null = 「지금을 따라간다」 · 숫자 = 그 개수만큼만 접어 본다.
   *
   * 🔴 정적 경로에서는 **브라우저의 기억이 초기값을 준다**(ⓒ). 그 기억을 effect 로 상태에
   *    밀어 넣지 않고 «파생»으로 합치는 이유: effect + setState 는 첫 렌더 뒤에 렌더를 한 번
   *    더 돌리고, 그 사이 한 프레임은 「끝까지 본 상태」를 그린다 — 되감아 두고 새로 연
   *    방문자에게 자기가 안 본 결과가 잠깐 보인다.
   * 🔴 `undefined` = 「이 회차에 아직 손대지 않았다」 = 기억이 답한다. 사람이 컨트롤을 한 번
   *    만지면 그 뒤부터는 이 회차의 값이 정본이다(기억이 조작을 되감지 않게).
   */
  const restoredCursor = useStoredCursor(isStatic);
  const [ownCursor, setOwnCursor] = useState<number | null | undefined>(undefined);
  const cursor = ownCursor === undefined ? restoredCursor : ownCursor;
  const setCursor = useCallback(
    (next: number | null | ((c: number | null) => number | null)) => {
      setOwnCursor((prev) => {
        const base = prev === undefined ? restoredCursor : prev;
        return typeof next === "function" ? next(base) : next;
      });
    },
    [restoredCursor],
  );
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
    // 🔴 정적 경로는 이미 전열을 쥐고 있다 — 열 스트림도, 물을 스냅샷도 없다.
    //    여기서 나가면 AC 「화면 데이터 /api 호출 0」이 이 한 줄에서 깨진다.
    if (isStatic) return;

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
  }, [runId, isStatic]);

  // ── 방문자 상태(정적 경로) — 되감기 위치를 브라우저에 남긴다 (T4-2a ⓒ) ────────────
  //
  // 🔴 이쪽은 «외부 시스템에 지금 상태를 반영하는» 일이라 effect 가 제자리다(읽기는 위에서
  //    `useSyncExternalStore` 가 한다). Live 경로에서는 아무것도 하지 않는다 — 서버가 세션을
  //    아는 자리에서 브라우저가 상태를 따로 들면 같은 사실이 두 곳에 살면서 갈린다.
  useEffect(() => {
    if (!isStatic || ownCursor === undefined) return;
    saveCursor(cursor);
  }, [isStatic, ownCursor, cursor]);

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
    // 🔴 `setCursor` 는 이제 커스텀 setter 다(기억 복원값과 이 회차 값을 합친다) — 상태
    //    setter 처럼 «항상 같다»고 가정할 수 없으므로 의존에 적는다.
  }, [playing, events.length, setCursor]);

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
              {/* 🔴 **출처를 배지 «안»에 적는다**(T4-2a). `REPLAY` 만으로는 서버가 재생한 것과
                  셸이 자기 자산으로 재생한 것이 구별되지 않는데, 둘은 다른 사실이다 —
                  하나는 서버가 살아 있었다는 뜻이고 하나는 아니다. 렌더 분기가 아니라 문구다. */}
              {isStatic && (
                <span className="ml-1 text-ai" data-testid="run-source-static">
                  · 정적
                </span>
              )}
            </span>
          )}
          <span className="text-muted" data-testid="run-status">
            {state.status === "running"
              ? "조사중"
              : state.status === "completed"
                ? "완료"
                : state.status === "stopped"
                  ? "중지됨"
                  : state.status === "failed"
                    ? "중단됨"
                    : "대기"}
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
          {/* 🔴 값의 «성격»을 함께 적는다: 확정(totalElapsedMs) · 진행 중 누적 · 중단 시점까지의 누적.
              셋은 다른 사실이고, 라벨이 없으면 중단된 조사의 값이 완주 값처럼 읽힌다(D-1). */}
          <span className="id">
            ({total.toLocaleString()}ms ·{" "}
            {confirmed
              ? "totalElapsedMs 확정"
              : state.status === "failed" || state.status === "stopped"
                ? "중단 시점까지 elapsedMs 누적"
                : "elapsedMs 누적"}
            )
          </span>
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

        {/* 🔴 **서버가 «말한» 실패 사유를 그대로 옮긴다**(D-1). 앞판은 이 갈래가 없어 화면이
            끝난 조사를 「조사중」으로 그렸고, 방문자는 오지 않을 결과를 기다렸다.
            사유를 요약·번역하지 않는다 — code 는 운영이 검색할 문자열이고, message 는
            서버가 사람에게 하는 말이다. 둘 다 그대로 둔다. */}
        {state.failure && (
          <p className="mt-2 rounded border border-warn/40 px-2 py-1.5 text-xs text-warn" role="status" data-testid="run-failed" data-code={state.failure.code}>
            🔴 조사가 중단됐습니다 — {state.failure.message} (<span className="id">{state.failure.code}</span>)
            {state.failure.fallback === "replay" && " · 서버가 replay 로의 전환을 제안했습니다."}
          </p>
        )}
        {state.stopNote && (
          <p className="mt-2 text-xs text-muted" role="status" data-testid="run-stopped-note">
            중지됨 — {state.stopNote}
          </p>
        )}

        {/* ⓓ Live 복귀 제안 (T4-2a) — 🔴 **데려가지 않고 «말한다»**.
            ai-api 가 돌아온 순간 화면이 스스로 Live 로 넘어가면, 되감아 보던 자리와 그때까지
            읽은 근거가 한 프레임에 사라진다. 살아났다는 사실은 알리고, 옮길지는 사람이 정한다.
            🔴 조건은 「서버가 답했다」다(`live`·`replay` 둘 다) — `online:false` 여도 서버
            replay 는 돌므로 Live 축은 돌아온 것이다. `checking`·`unavailable` 에는 안 뜬다. */}
        {isStatic && (liveStatus.mode === "live" || liveStatus.mode === "replay") && (
          <p className="mt-2 flex items-center gap-2 text-xs" role="status" data-testid="live-return-offer">
            <span className="text-ok" aria-hidden>
              ◉
            </span>
            <span className="text-muted">
              서버가 다시 응답합니다 — 이 화면은 정적 재생본이고, 되감은 자리는 그대로 남습니다.
            </span>
            <Link
              href="/"
              className="rounded border border-ok/50 px-2 py-0.5 text-ok hover:bg-ok/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
              data-testid="live-return-link"
            >
              Live 로 돌아가기 ▸
            </Link>
          </p>
        )}

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
        {/* 🔴 **정적 경로에서는 «Live 전용»이라 말하고 데려가지 않는다**(T4-2a ⓔ).
            전략 비교는 임베딩 실행이 필요해 재생본에 담을 수 없다. 링크를 그대로 두면
            방문자는 빈 화면이나 미연결 오류를 만나는데, 그건 조용한 실패다.
            🔴 여기서 정적이 Live 보다 «엄격»한 것은 허용된다 — 느슨한 쪽이 금지다. */}
        {isStatic ? (
          <span
            className="rounded border border-edge px-3 py-1 text-xs text-muted opacity-60"
            title="정적 재생본은 검색 전략 비교를 담지 않습니다 — 서버 계산이 필요합니다"
            data-testid="to-compare-live-only"
          >
            전략 비교 ▸ (Live 전용)
          </span>
        ) : (
          <Link
            href={`/compare?run=${encodeURIComponent(runId)}${state.question ? `&q=${encodeURIComponent(state.question)}` : ""}`}
            className="rounded border border-edge px-3 py-1 text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
            data-testid="to-compare"
          >
            전략 비교 ▸
          </Link>
        )}
        {/* 「작업지시서 초안 보기」 — run 완료 시 활성(wireframes §2) */}
        {isStatic && state.workOrderDraftId ? (
          /* 🔴 실측(T4-2a · ai-api 47133a0): 서버 replay 도 이 초안을 **501
             `replay_draft_source_absent`** 로 막는다 — fixture 는 이벤트만 담고 초안 «본문»은
             녹화되지 않았다. 그래서 정적도 열지 않고, 서버가 한 말을 그대로 옮긴다.
             id 는 «보여 준다»: 이벤트가 실제로 낸 값이고, 감추면 화면이 아는 것을 숨기는 것이다. */
          <span
            className="rounded border border-edge px-3 py-1 text-xs text-muted opacity-60"
            title="replay fixture 는 이벤트만 담으므로 초안 본문 원본이 없습니다 (서버도 501로 막습니다)"
            data-testid="work-order-draft-live-only"
            data-wod={state.workOrderDraftId}
          >
            작업지시서 초안 ▸ 재생본에는 본문이 없습니다 (Live 전용)
          </span>
        ) : state.workOrderDraftId ? (
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
