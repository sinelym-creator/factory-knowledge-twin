"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CandidateList, EvidenceStrip, RunTimeline } from "@/components/incident/run-panels";
import { useLiveStatus } from "@/components/live-status";
import { CONTRACT, type RunSnapshot, apiGetBrowser, runEventsBrowser, stopRunBrowser } from "@/lib/contract";
import { STATIC_RUN_ID } from "@/lib/static-replay/run-id";
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
 *
 * 🔴 **끊김에서 «돌아온다»**(T4-2b ⓕ · §17.2). 절단이면 ⓐ 이벤트 열을 `GET /runs/{id}/events`
 *    로 메우고 ⓑ 스트림을 다시 연다. 두 갈래가 겹쳐도 화면은 한 번만 움직인다 — 병합이
 *    `seq` 를 보고 이미 본 것을 버리기 때문이다(중복 처리 0 · 아래 `merge`).
 *
 * 🔴 **정상 종료는 복구 대상이 아니다.** 조사가 끝나면 서버가 닫는다(1000). 그것을 절단으로
 *    읽고 다시 열면 끝난 조사마다 재연결이 돌고, 화면은 조용한 무한 재시도를 갖게 된다 —
 *    「끝났다」와 「끊겼다」를 가르는 것이 이 절의 전부다.
 *
 * 🔴 **스트림이 «열리지도 못하는» 경로가 있다**(D-21 ⓒ · 계약 v0.1.10). 공개 셸을 경유하면
 *    핸드셰이크(101)가 서지 못하고 1006 으로 닫힌다 — 이건 절단이 아니라 미개통이고, 재연결로
 *    낫지 않는다(같은 구간이 다음 회차도 똑같이 막는다). 그 «한 갈래»에서만 `GET /runs/{id}/events`
 *    를 주기 조회해 같은 화면을 만든다. 스트림이 서면 이 경로는 한 번도 돌지 않는다 —
 *    로컬·직결은 무변이다.
 * 🔴 **주기 조회는 새 배관이 아니다.** 출처가 하나 더 늘 뿐이고, 거르는 자리는 여전히 `merge`
 *    하나다(seq). 필터를 여기서 또 만들면 중복 제거가 두 곳에 살면서 언젠가 갈린다.
 */
/**
 * 재연결 간격(ms) — 🔴 **횟수가 유한하다.** 무한 재시도는 서버가 죽어 있을 때 화면이 그
 * 사실을 말하지 못하게 만든다: 영원히 「곧 돌아옵니다」이고, 방문자는 기다리면 온다고 믿는다.
 * 다 쓰고도 안 붙으면 마지막 `closeMessage` 문구가 그대로 남아 「끊겼다」를 말한다.
 *
 * 🔴 **미개통(1006) 갈래는 예외다**(D-21 ⓒ) — 그쪽은 회차를 다 써도 「끊겼다」가 아니라
 *    「주기 조회로 진행 중」이 남는다. 열린 적이 없는 스트림에 「끊겼다」를 쓰면, 화면이
 *    있지도 않았던 연결을 있었다고 말하게 된다.
 */
const RECONNECT_BACKOFF_MS = [500, 1_000, 2_000, 4_000] as const;
const MAX_RECONNECT = RECONNECT_BACKOFF_MS.length;

/**
 * 종단 이벤트 — 이 중 하나가 도착했으면 그 run 은 «끝난» 것이고, 끊김은 복구 대상이 아니다.
 *
 * 🔴 `run.queued` 는 여기 «없다»(계약 v0.1.10 ①). 큐 대기는 진행 중이지 끝이 아니라서,
 *    그것을 종단으로 읽으면 줄 서 있는 조사에서 주기 조회가 멈추고 화면이 대기열에 얼어붙는다.
 */
const TERMINAL_TYPES = new Set(["run.completed", "run.stopped", "run.failed"]);

/**
 * 주기 조회 간격(ms) — 🔴 **미개통일 때만 도는 값이다**(D-21 ⓒ). 값이 한 곳에만 있어야
 * 「2초마다 묻는다」고 화면이 말하는 것과 실제로 묻는 주기가 갈리지 않는다.
 */
const POLL_INTERVAL_MS = 2_000;

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
  /** 재연결 회차 — 값이 바뀌면 아래 WS effect 가 다시 돈다(스트림을 새로 연다). */
  const [attempt, setAttempt] = useState(0);
  /**
   * 🔴 **「열리지도 못했다」**(101 전 1006) — 절단(`attempt`)과 다른 사실이라 축을 따로 든다.
   *    절단은 재연결이 답이고, 미개통은 재연결해도 같은 구간이 또 막는다 — 답이 주기 조회다.
   */
  const [streamUnavailable, setStreamUnavailable] = useState(false);
  /**
   * 주기 조회가 «서버에게 거절당한» 사유 — 🔴 숨기지 않는다(계약 v0.1.10 ②).
   * `GET /runs/{id}/events` 는 429 제외 목록에 없어서, 화면이 이 값을 삼키면 방문자는
   * 멈춘 화면을 「아직 진행 중」으로 읽는다.
   */
  const [pollNote, setPollNote] = useState<string | null>(null);
  /**
   * 🔴 「이 run 은 이미 끝났는가」를 **ref 로** 든다. `onclose` 는 effect 가 만들어질 때의
   *    상태를 닫아 두므로(closure), state 를 읽으면 «그 순간의 옛 값»으로 판정하게 된다 —
   *    끝난 조사를 끊긴 것으로 읽고 재연결을 거는 자리가 바로 거기다.
   */
  const settled = useRef(false);

  /**
   * 이벤트 병합 — 🔴 **중복 처리 0 의 유일한 자리**(ⓕ).
   *
   * 세 갈래가 같은 이벤트를 준다: WS 실시간 · 재연결 시 서버가 다시 보내는 백로그(seq 0부터) ·
   * 끊김 뒤 `GET /runs/{id}/events`. 거르는 곳이 여럿이면 그중 하나가 바뀌는 날 화면에서
   * 같은 단계가 두 번 서고, 그 화면은 서버가 하지 않은 말을 한다.
   */
  const merge = useCallback((incoming: readonly RunEvent[]) => {
    const fresh = incoming.filter((e) => !seen.current.has(e.seq));
    if (fresh.length === 0) return;
    for (const e of fresh) seen.current.add(e.seq);
    setEvents((prev) => [...prev, ...fresh].sort((a, b) => a.seq - b.seq));
  }, []);

  /**
   * 🔴 파생으로 «먼저» 세우고 ref 로 옮긴다(D-21 ⓒ). ref 만 두면 주기 조회 effect 가 종단
   *    도착을 보지 못해 — ref 변화는 렌더를 부르지 않는다 — 끝난 조사를 계속 두드린다.
   */
  const settledNow = useMemo(() => events.some((e) => TERMINAL_TYPES.has(e.type)), [events]);

  // ── WS 구독 ────────────────────────────────────────────────────────────────
  // 🔴 runId 가 바뀔 때의 «초기화»는 이 effect 가 하지 않는다 — 부르는 쪽이 `key={run}` 으로
  //    다시 마운트한다. effect 안에서 상태를 되돌리면 초기화가 한 박자 늦게 적용돼, 새 조사를
  //    여는 순간 앞 조사의 이벤트가 잠깐 보인다(그리고 그 한 프레임은 실측에 안 잡힌다).
  useEffect(() => {
    // 🔴 정적 경로는 이미 전열을 쥐고 있다 — 열 스트림도, 물을 스냅샷도 없다.
    //    여기서 나가면 AC 「화면 데이터 /api 호출 0」이 이 한 줄에서 깨진다.
    if (isStatic) return;
    // 🔴 이미 끝난 조사에는 스트림을 열지 않는다. 재연결 회차에서 이 줄이 없으면, 마지막
    //    재시도가 «끝난 run» 을 다시 열었다가 서버가 곧바로 닫아 또 한 번 재시도를 부른다.
    if (settled.current) return;

    const url = location.origin.replace(/^http/, "ws") + CONTRACT.runStream(runId);
    const ws = new WebSocket(url);
    let closedByUs = false;
    /**
     * 🔴 핸드셰이크가 «섰는가». state 로 들면 `onclose` 가 옛 값을 읽는다(closure) — 미개통
     *    판정이 회차를 건너뛰어 어긋난다. 이 회차의 사실은 이 회차의 지역 변수가 든다.
     */
    let opened = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    ws.onopen = () => {
      opened = true;
      // 🔴 스트림이 섰으면 주기 조회는 그 자리에서 멈춘다 — 두 출처가 같이 돌 이유가 없다.
      setStreamUnavailable(false);
      setPollNote(null);
    };

    ws.onmessage = (m) => {
      let e: RunEvent;
      try {
        e = JSON.parse(String(m.data)) as RunEvent;
      } catch {
        return; // 🔴 못 읽은 프레임을 «빈 이벤트»로 만들지 않는다 — 없던 사실이 된다
      }
      merge([e]);
    };

    ws.onclose = (ev) => {
      if (closedByUs) return;
      /**
       * 🔴 **미개통과 절단을 가른다**(D-21 ⓒ). 「한 번도 안 열렸고(101 전) 사유도 없다(1006)」
       *    는 경유 구간이 막는 형태다 — 그 경우에만 주기 조회로 같은 화면을 만들고, 1006 의
       *    「연결되어 있지 않습니다」 문면을 «지금 무엇을 하고 있는지»로 대체한다(아래 렌더).
       * 🔴 서버가 사유를 «말한» 종료(4000~4999)와 개통 뒤 절단은 이 갈래가 아니다 — 그쪽
       *    문면을 주기 조회로 덮으면 서버가 한 말이 화면에서 사라진다.
       */
      const neverOpened = !opened && ev.code === 1006;
      if (neverOpened) setStreamUnavailable(true);
      // 🔴 정상 종료(1000)는 «사건»이 아니다 — 조사가 끝나면 서버가 닫는다. 문구를 띄우면
      //    완주한 화면이 매번 경고를 달게 된다.
      if (ev.code !== 1000 && !neverOpened) setNote(closeMessage(ev.code, ev.reason));
      // 끊겼으면 마지막 사실이라도 남긴다.
      void apiGetBrowser<RunSnapshot>(CONTRACT.run(runId)).then((r) => {
        if (r.state === "ok") setFallback(r.data);
      });

      // 🔴 **여기서 「끝났다」와 「끊겼다」를 가른다**(ⓕ). 정상 종료이거나 이미 종단
      //    이벤트를 받은 run 은 복구 대상이 아니다 — 그 자리에서 재시도를 걸면 완주한
      //    조사마다 조용한 무한 루프가 돈다.
      if (ev.code === 1000 || settled.current) return;

      // ⓐ 끊긴 동안 서버가 낸 이벤트를 «되감기 정본»으로 메운다. 재연결이 늦어도 화면은
      //    이 한 번으로 지금 사실까지 온다(그리고 재연결 백로그와 겹쳐도 merge 가 거른다).
      void runEventsBrowser<RunEvent>(runId).then((r) => {
        if (r.state === "ok") merge(r.data);
      });

      // ⓑ 스트림을 다시 연다 — 간격을 늘려 가며 정해진 횟수만. 무한 재시도는 서버가 죽어
      //    있을 때 화면이 그 사실을 말하지 못하게 만든다(계속 「곧 돌아옵니다」가 된다).
      if (attempt < MAX_RECONNECT) {
        retryTimer = setTimeout(() => setAttempt((a) => a + 1), RECONNECT_BACKOFF_MS[attempt]);
      }
    };

    return () => {
      closedByUs = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      ws.close();
    };
  }, [runId, isStatic, attempt, merge]);

  // ── 주기 조회 대체 경로 (D-21 ⓒ · 계약 v0.1.10) ─────────────────────────────
  //
  // 🔴 **여기서 «새 엔드포인트»를 만들지 않는다.** 끊김 복구(ⓕ)가 이미 쓰는 그 조회를 그대로
  //    반복할 뿐이고, 중복은 `merge` 의 seq 가 거른다 — 필터는 이 파일에 하나뿐이다.
  // 🔴 **첫 회를 즉시 부르지 않는다.** 미개통 판정이 서는 자리(`onclose`)가 ⓐ 로 이미 한 번
  //    메운다 — 여기서 또 부르면 같은 순간에 같은 요청이 둘 나간다.
  useEffect(() => {
    if (isStatic) return;
    // 🔴 스트림이 서는 경로(로컬·직결)에서는 이 effect 가 «한 줄도» 돌지 않는다.
    if (!streamUnavailable) return;
    // 🔴 끝난 조사는 두드리지 않는다 — 종단 이벤트가 이 경로의 종료 조건이다.
    if (settledNow) return;

    let stopped = false;
    const id = setInterval(() => {
      void runEventsBrowser<RunEvent>(runId).then((r) => {
        if (stopped) return;
        if (r.state === "ok") {
          merge(r.data);
          setPollNote(null);
          return;
        }
        /**
         * 🔴 **거절을 삼키지 않는다**(계약 v0.1.10 ②). 특히 429 는 서버가 「그만 와라」라고
         *    «말한» 것이라, 그 말을 듣고도 2초마다 계속 두드리는 것은 되묻는 것과 같다 —
         *    조회를 멈추고 그 사실을 화면에 남긴다. 다시 여는 것은 사람이 정한다.
         * 🔴 `retryAfterSec` 은 «서버가 준 경우에만» 적는다 — 화면이 「잠시 후」를 지어내면
         *    그 숫자는 서버가 하지 않은 말이 된다.
         */
        setPollNote(
          r.status === 429
            ? `서버가 조회 빈도를 제한했습니다 — 주기 조회를 멈춥니다${r.retryAfterSec !== undefined ? ` (${r.retryAfterSec}초 뒤 다시 열어 보세요)` : ""}.`
            : `주기 조회가 실패했습니다 — ${r.why}`,
        );
        if (r.status === 429) {
          stopped = true;
          clearInterval(id);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [runId, isStatic, streamUnavailable, settledNow, merge]);

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
   * 🔴 종결 판정은 «커서와 무관하게» 받은 이벤트 전부로 한다. `live` 는 되감기가 적용된
   *    상태라, 방문자가 앞으로 되감아 둔 동안 이 값을 쓰면 «끝난 조사»가 진행 중으로 보이고
   *    재연결이 다시 돈다 — 화면 조작이 네트워크 동작을 바꾸는 자리가 된다.
   */
  useEffect(() => {
    settled.current = settledNow;
  }, [settledNow]);

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
              : state.status === "queued"
                ? "대기열"
                : state.status === "completed"
                  ? "완료"
                  : state.status === "stopped"
                    ? "중지됨"
                    : state.status === "failed"
                      ? "중단됨"
                      : "대기"}
          </span>

          {/* 🔴 **순위를 «말한다»**(계약 v0.1.9 run.queued). 접수된 조사를 「대기」로만 그리면
              방문자는 자기가 줄에 서 있다는 것도, 몇 번째인지도 모른 채 도는 원을 본다.
              🔴 예상 시간은 서버가 «준 경우에만» 적는다 — null 이면 그 문장을 통째로 뺀다.
                 화면이 「곧」이나 「약 30초」를 지어내면 그 숫자는 아무 근거가 없다. */}
          {state.queue && (
            <span
              className="rounded border border-edge px-2 py-0.5 text-muted"
              data-testid="run-queue"
              data-position={state.queue.position}
              data-estimated={state.queue.estimatedWaitSec ?? ""}
            >
              대기 {state.queue.position}번째
              {state.queue.estimatedWaitSec !== null && <> · 예상 {state.queue.estimatedWaitSec}초</>}
            </span>
          )}

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
            {/* 🔴 **제안은 «동작»이어야 한다**(T4-2b ⓖ · §6.2 빈 화면 0). 앞판은 「서버가
                replay 로의 전환을 제안했습니다」라는 «문장»이었다 — 방문자는 그 말을 읽고도
                무엇을 눌러야 할지 모른 채 중단된 화면에 남는다. 정적 재생본은 셸 자산이라
                (T4-2a) ai-api 가 죽어 있어도 이 링크는 선다: 그것이 이 자리에 쓸 수 있는
                유일한 «확실히 되는» 다음 수다.
                🔴 한계를 성문한다 — 정적 자산은 GS-01 한 벌이다. 시나리오가 늘면 이 링크는
                   그 incident 의 재생본을 가리키도록 «자산 축»과 함께 자라야 한다. */}
            {state.failure.fallback === "replay" && !isStatic && (
              <>
                {" · "}
                <Link
                  href={`?run=${encodeURIComponent(STATIC_RUN_ID)}`}
                  className="underline underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
                  data-testid="run-fallback-offer"
                >
                  정적 재생본으로 같은 조사 보기 ▸
                </Link>
              </>
            )}
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

        {/* 🔴 **숨기지 않는다**(D-21 ⓒ). 「연결 안 됨」만 띄우고 뒤에서 조용히 메우면 화면이
            자기가 하는 일을 말하지 않는 것이 된다 — 무엇으로 대신하고 있는지까지 적는다.
            🔴 종단에 닿으면 이 줄은 사라진다 — 끝난 조사에 「진행 중」이 남으면 거짓이다. */}
        {streamUnavailable && !settledNow && (
          <p className="mt-2 text-xs text-muted" role="status" data-testid="run-polling" data-interval-ms={POLL_INTERVAL_MS}>
            실시간 스트림 대신 주기 조회로 진행 중입니다 — {POLL_INTERVAL_MS / 1000}초마다 서버에
            다시 묻습니다. 순번이 붙어 오므로 중복되거나 빠지지 않습니다.
          </p>
        )}
        {pollNote && (
          <p className="mt-2 text-xs text-warn" role="status" data-testid="run-poll-note">
            {pollNote}
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
