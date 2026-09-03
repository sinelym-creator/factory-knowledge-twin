"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { liveStatus } from "@/lib/contract";
import { STATIC_RUN_ID } from "@/lib/static-replay/run-id";

/**
 * 모드 배지 + fallback 배너 (wireframes §0).
 *
 * 🔴 상태가 «넷»인 이유: 계약의 `/live/status`는 `{online}` 둘 중 하나를 주지만, 그 응답을
 *    «받지 못한 경우»와 «아직 물어보지 않은 경우»가 각각 따로 있다. 못 물어본 것을 REPLAY라고
 *    적으면 화면이 모르는 것을 아는 척한다(baseline §0.2).
 *    → 확인 중 · LIVE · REPLAY · 미연결을 각각 다르게 말한다.
 *
 * 🔴 색만으로 구분하지 않는다(§10·§11.3) — 아이콘(◉ ◑ ◌) + 텍스트를 항상 함께 낸다.
 *
 * T6-4 ③ 모드 배지 행: pill 999 · 상태색 12% 배경 · 문구·아이콘 불변 · 모드가 바뀌면 pop(④-5 ·
 * `key={mode}` 재마운트) · checking/live 는 아이콘이 숨 쉰다(④-10).
 */

// 🔴 「아직 안 물어봤다」와 「물어봤는데 못 받았다」는 다른 상태다. 첫 응답 전에 «미연결»이라
//    적으면, 확인하지도 않은 것을 확인한 척하게 된다 — 004의 「거울이 비면 판정하지 않는다」와 같은 규율.
type Mode = "checking" | "live" | "replay" | "unavailable";
type State = { mode: Mode; checkedAt: string | null; why: string | null };

const LiveContext = createContext<State>({ mode: "checking", checkedAt: null, why: null });

const POLL_MS = 30_000; // §0: 30s polling

export function LiveStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ mode: "checking", checkedAt: null, why: null });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const reply = await liveStatus();
      if (!alive) return;
      setState(
        reply.state === "ok"
          ? {
              mode: reply.data.online ? "live" : "replay",
              checkedAt: reply.data.checkedAt,
              why: null,
            }
          : { mode: "unavailable", checkedAt: new Date().toISOString(), why: reply.why },
      );
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

const FACE: Record<Mode, { icon: string; text: string; cls: string; breathing: boolean }> = {
  checking: { icon: "◌", text: "확인 중", cls: "text-muted", breathing: true },
  live: { icon: "◉", text: "LIVE", cls: "text-ok", breathing: true },
  replay: { icon: "◑", text: "REPLAY", cls: "text-warn", breathing: false },
  unavailable: { icon: "◌", text: "미연결", cls: "text-muted", breathing: false },
};

/**
 * Live 상태를 «읽는» 훅 — 🔴 배지 말고 다른 자리도 이 사실을 필요로 한다(T4-2a ⓓ).
 *
 * 정적 재생 화면은 「ai-api 가 돌아왔는가」를 알아야 «Live 로 돌아가기»를 제안할 수 있다.
 * 상태를 두 번 폴링하지 않고 이 컨텍스트를 나눠 쓴다 — 같은 사실을 두 곳에서 따로 물으면
 * 두 답이 갈리는 순간이 생기고, 화면은 그 순간 서로 다른 말을 한다.
 */
export function useLiveStatus() {
  return useContext(LiveContext);
}

export function ModeBadge() {
  const { mode, checkedAt, why } = useContext(LiveContext);
  const face = FACE[mode];
  const seen = checkedAt ? new Date(checkedAt).toLocaleTimeString("ko-KR") : "확인 전";
  return (
    <span
      key={mode}
      className={`fkt-pill fkt-pop ${face.cls}`}
      title={`마지막 확인 ${seen}${why ? ` · ${why}` : ""}`}
      data-testid="mode-badge"
      data-mode={mode}
    >
      <span aria-hidden className={face.breathing ? "fkt-pulse inline-block" : "inline-block"}>
        {face.icon}
      </span>
      <span>{face.text}</span>
    </span>
  );
}

/**
 * 정적 replay 제안 (T4-2a ⓑ · §6.2 「Live 실패 시 Replay 제안」).
 *
 * 🔴 **«제안»이지 «폴백»이 아니다.** 사람이 눌러야 진입한다 — 화면이 조용히 다른 데이터를
 *    보여 주기 시작하면, 방문자는 자기가 무엇을 보고 있는지 모른 채 재생본을 실시간으로 읽는다.
 *
 * 🔴 **트리거는 「응답 실패」뿐이다**(오케 판정 R-3 · 2026-08-31). `online:false` 는 **참**이고
 *    (합성 게이트웨이만 없다 · `routers/ops.py` J-1(b)) 그때는 **서버 replay 가 정본**이라
 *    여기서 제안하면 「닿는데도 안 닿는 척」이 된다. `checking` 중에도 제안하지 않는다 —
 *    아직 물어보는 중인 것을 실패로 세면, 확인하지 않은 것을 확인한 척하는 것이다.
 *
 * 🔴 자산은 **누를 때** 싣는다(동적 import). 앵커 incidentId 도 그 자산이 들고 있으므로,
 *    이 버튼이 보이는 것만으로 111KB 가 내려오지 않는다(§17.1 · Q-50).
 */
function StaticReplayOffer() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setWhy(null);
    try {
      // 🔴 여기서 «처음» 싣는다 — 배너가 보이는 것만으로 자산이 내려오지 않게
      //    (동적 import · 오케 제약 ①). 앵커 incidentId 도 그 자산이 들고 있다.
      const { loadStaticReplay } = await import("@/lib/static-replay");
      const bundle = await loadStaticReplay();
      const { incidentId } = bundle.manifest.anchors;
      router.push(
        `/incidents/${encodeURIComponent(incidentId)}?run=${encodeURIComponent(STATIC_RUN_ID)}`,
      );
    } catch (e) {
      // 🔴 자산이 없거나 깨졌으면 «말한다». 조용히 아무 일도 안 일어나면 방문자는 버튼이
      //    고장인지 자기가 잘못 눌렀는지 알 수 없다.
      setBusy(false);
      setWhy(e instanceof Error ? e.message : "정적 재생본을 싣지 못했습니다");
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void enter()}
        disabled={busy}
        className="fkt-btn fkt-btn-primary min-h-8 px-3 text-foot md:min-h-8"
        data-testid="static-replay-offer"
      >
        {busy ? "재생본 준비 중…" : "정적 재생본으로 GS-01 보기 ▸"}
      </button>
      {why && (
        <span className="text-warn" role="status" data-testid="static-replay-offer-why">
          {why}
        </span>
      )}
    </span>
  );
}

/**
 * 예외 «이름»을 방문자의 낱말로 — D-23 의 세 번째 층(33대 브라우저 실측).
 *
 * 🔴 `why` 는 `e.name` 이다(`lib/contract.ts` 재시도 로그 주석). 그대로 괄호에 넣으면 공개
 *    화면이 `TimeoutError` 를 읽는다 — 실측(09-03 09:0x · 8787 을 blackhole 로 잡아 둔 창):
 *    배너 문면 = 「Live 상태를 확인하지 못했습니다(TimeoutError)」. ai-api·게이트웨이 두 층을
 *    고치면서 이 층을 빼먹었다: 같은 규칙(baseline §15.2)이 세 층에 걸려 있었다.
 *
 * 🔴 **원문을 버리는 것이 아니다.** 회차마다의 `console.warn("[enter] …", why, cause)` 가
 *    남는다 — 「DNS 인가 TLS 인가 타임아웃인가」를 가르는 축은 그 줄이지 이 괄호가 아니다.
 *
 * 🔴 분류는 ai-api `_refusal_wording` 과 **같은 세 종**으로 맞춘다. 층마다 다른 낱말을
 *    지어내면 같은 사건이 화면 자리마다 다른 이름을 갖는다.
 */
function visitorWhy(why: string | null | undefined): string {
  if (!why) return "미연결";
  if (why === "TimeoutError" || why === "AbortError") return "응답 시간 초과";
  if (why === "TypeError") return "미도달";
  return "미연결";
}

/** fallback 배너 슬롯 — 조건이 설 때만 자리를 차지한다(§0 「조건부」). */
export function FallbackBanner({ sessionPending }: { sessionPending: boolean }) {
  const { mode, why } = useContext(LiveContext);
  const [closed, setClosed] = useState(false);

  // 🔴 우선순위: 확인된 사실 → 확인 실패 → 서버가 모르는 세션. 확인 «전»에는 Live에 대해
  //    아무 말도 하지 않고, 서버가 아직 모르는 세션이라는 «지금 아는 사실»만 말한다.
  const notice =
    mode === "replay"
      ? // 🔴 **사유를 말하되 «원인»을 단정하지 않는다.** `online:false` 는 세 가지를 한꺼번에
        //    덮는다 — 공개 배포라 원래 없다 · 소유자가 껐다 · 켜져 있는데 못 닿는다. 화면은
        //    셋을 가를 정보를 갖고 있지 않으므로, 「소유자가 껐습니다」라고 적으면 공개
        //    Sandbox 에서 거짓이 된다(baseline §0.2 · ops.py 「false 는 결함이 아니라 참」).
        //    그래서 «지금 상태»(미도달)와 «대체 경로»(결정적 집계)만 말한다.
        "Live AI 합성이 꺼져 있습니다(소유자 게이트웨이 미도달) — 조사·근거 수집은 그대로 실행되고, 원인 후보는 결정적 집계로 종합합니다. 화면 흐름은 동일합니다."
      : mode === "unavailable"
        ? `Live 상태를 확인하지 못했습니다(${visitorWhy(why)}). 백엔드가 아직 연결되지 않았습니다 — 오류가 아닙니다.`
        : sessionPending
          ? "이 세션은 아직 백엔드에 등록되지 않았습니다(미연결). 화면 흐름은 동일합니다."
          : null;

  if (!notice || closed) return null;
  return (
    <div
      className="fkt-glass fkt-rise flex items-center gap-3 border-b border-edge px-4 py-2 text-foot text-ink"
      role="status"
      data-testid="fallback-banner"
    >
      <span aria-hidden className="text-warn">
        [ ! ]
      </span>
      <span className="flex-1">{notice}</span>
      {/* 🔴 제안은 «응답 실패»에만 붙는다 — `replay`(online:false)는 서버 replay 가 정본이고,
          `checking` 은 아직 물어보는 중이다. 셋을 한 자리에서 제안하면 살아 있는 Live 를
          정적이 가로챈다(오케 판정 R-3). */}
      {mode === "unavailable" && <StaticReplayOffer />}
      <button
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-muted transition-colors duration-(--fkt-dur-1) hover:bg-inset hover:text-ink"
        onClick={() => setClosed(true)}
        aria-label="배너 닫기"
      >
        ✕
      </button>
    </div>
  );
}
