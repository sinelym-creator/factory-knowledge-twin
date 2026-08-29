"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { liveStatus } from "@/lib/contract";

/**
 * 모드 배지 + fallback 배너 (wireframes §0).
 *
 * 🔴 상태가 «넷»인 이유: 계약의 `/live/status`는 `{online}` 둘 중 하나를 주지만, 그 응답을
 *    «받지 못한 경우»와 «아직 물어보지 않은 경우»가 각각 따로 있다. 못 물어본 것을 REPLAY라고
 *    적으면 화면이 모르는 것을 아는 척한다(baseline §0.2).
 *    → 확인 중 · LIVE · REPLAY · 미연결을 각각 다르게 말한다.
 *
 * 🔴 색만으로 구분하지 않는다(§10·§11.3) — 아이콘(◉ ◑ ◌) + 텍스트를 항상 함께 낸다.
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

const FACE: Record<Mode, { icon: string; text: string; cls: string }> = {
  checking: { icon: "◌", text: "확인 중", cls: "text-muted" },
  live: { icon: "◉", text: "LIVE", cls: "text-ok" },
  replay: { icon: "◑", text: "REPLAY", cls: "text-warn" },
  unavailable: { icon: "◌", text: "미연결", cls: "text-muted" },
};

export function ModeBadge() {
  const { mode, checkedAt, why } = useContext(LiveContext);
  const face = FACE[mode];
  const seen = checkedAt ? new Date(checkedAt).toLocaleTimeString("ko-KR") : "확인 전";
  return (
    <span
      className={`flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-xs ${face.cls}`}
      title={`마지막 확인 ${seen}${why ? ` · ${why}` : ""}`}
      data-testid="mode-badge"
      data-mode={mode}
    >
      <span aria-hidden>{face.icon}</span>
      <span>{face.text}</span>
    </span>
  );
}

/** fallback 배너 슬롯 — 조건이 설 때만 자리를 차지한다(§0 「조건부」). */
export function FallbackBanner({ sessionPending }: { sessionPending: boolean }) {
  const { mode, why } = useContext(LiveContext);
  const [closed, setClosed] = useState(false);

  // 🔴 우선순위: 확인된 사실 → 확인 실패 → 서버가 모르는 세션. 확인 «전»에는 Live에 대해
  //    아무 말도 하지 않고, 서버가 아직 모르는 세션이라는 «지금 아는 사실»만 말한다.
  const notice =
    mode === "replay"
      ? "Live AI 연결이 끊겨 Replay로 전환했습니다. 화면 흐름은 동일합니다."
      : mode === "unavailable"
        ? `Live 상태를 확인하지 못했습니다(${why ?? "미연결"}). 백엔드가 아직 연결되지 않았습니다 — 오류가 아닙니다.`
        : sessionPending
          ? "이 세션은 아직 백엔드에 등록되지 않았습니다(미연결). 화면 흐름은 동일합니다."
          : null;

  if (!notice || closed) return null;
  return (
    <div
      className="flex items-center gap-3 border-b border-edge bg-panel px-4 py-2 text-xs text-ink"
      role="status"
      data-testid="fallback-banner"
    >
      <span aria-hidden className="text-warn">
        [ ! ]
      </span>
      <span className="flex-1">{notice}</span>
      <button className="text-muted hover:text-ink" onClick={() => setClosed(true)} aria-label="배너 닫기">
        ✕
      </button>
    </div>
  );
}
