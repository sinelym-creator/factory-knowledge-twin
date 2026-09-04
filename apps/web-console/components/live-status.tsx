"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { type RunCap, liveStatus, subscribeCongestion, subscribeRunCap } from "@/lib/contract";
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
 */

// 🔴 「아직 안 물어봤다」와 「물어봤는데 못 받았다」는 다른 상태다. 첫 응답 전에 «미연결»이라
//    적으면, 확인하지도 않은 것을 확인한 척하게 된다 — 004의 「거울이 비면 판정하지 않는다」와 같은 규율.
type Mode = "checking" | "live" | "replay" | "unavailable";
/**
 * 🔴 **T7-31 — 혼잡은 «모드»가 아니라 그 «위에» 얹히는 사실이다**(D-49 · X-11).
 *
 * 서버가 503 으로 거절한 것은 「Live 인가 Replay 인가」와 다른 축이다. `Mode` 에 값을 하나 더
 * 넣으면 거절이 뜬 동안 화면이 「지금 Live 인가」를 **말할 수 없게** 된다 — 그래서 모드는 그대로
 * 두고 별도 축으로 든다(배지의 `data-mode` 계약도 그대로 산다).
 */
type Congestion = { since: number; retryAfterSec?: number };
type State = {
  mode: Mode;
  checkedAt: string | null;
  why: string | null;
  /** 최근 창 안에 «최종» 503 을 받은 축들 — 키는 경로다(축마다 따로 걷힌다). */
  congested: Record<string, Congestion>;
  /**
   * 🔴 **T7-38 — 세션 조사 상한(계약 v0.1.15)**. `null` 은 「아직 모른다」다 — 세션이 없거나
   *    (입장 전·pending) 서버가 아직 답하지 않은 회차. 「0회 남았다」와 섞지 않는다.
   */
  runCap: RunCap | null;
};

const LiveContext = createContext<State>({
  mode: "checking",
  checkedAt: null,
  why: null,
  congested: {},
  runCap: null,
});

const POLL_MS = 30_000; // §0: 30s polling
/**
 * 🔴 거절이 화면에 남는 창. 30초가 지나도록 같은 축이 200 을 못 받으면 그 거절은 «지금»의
 *    사실이 아니라 지난 일이다 — 영구 적색은 안 보는 신호가 된다.
 * 🔴 창이 지났는지는 «시각»으로 판단하되, 화면이 스스로 걷히려면 다시 그려야 한다. 그래서
 *    청소를 주기로 돌린다(간격 ≪ 창이라 걷히는 순간이 최대 1초만 늦는다).
 */
const CONGESTION_WINDOW_MS = 30_000;
const CONGESTION_SWEEP_MS = 1_000;

export function LiveStatusProvider({
  children,
  /**
   * 🔴 **서버가 아는 세션 id**(`api` 출신만). 상태 폴링에 실어 보내면 서버가 그 세션의
   *    조사 상한을 함께 답한다(계약 v0.1.15 · 선택 쿼리). 없으면 안 싣는다 — 그 회차의
   *    응답은 v0.1.2 형상 그대로이고, 화면은 상한에 대해 아무 말도 하지 않는다.
   */
  sessionId = null,
}: {
  children: React.ReactNode;
  sessionId?: string | null;
}) {
  const [state, setState] = useState<State>({
    mode: "checking",
    checkedAt: null,
    why: null,
    congested: {},
    runCap: null,
  });

  /**
   * 🔴 **거절을 조용히 삼키지 않는다**(D-49 판정선). `contract.ts` 의 되묻기 경로가 «최종»
   *    결과만 신호하므로, 여기 쌓이는 것은 「1회 되묻고도 503 이었다」뿐이다.
   */
  useEffect(() => {
    const stop = subscribeCongestion((signal) => {
      setState((prev) => {
        if (signal.kind === "cleared") {
          if (!(signal.path in prev.congested)) return prev; // 🔴 바뀐 게 없으면 다시 그리지 않는다
          const next = { ...prev.congested };
          delete next[signal.path];
          return { ...prev, congested: next };
        }
        return {
          ...prev,
          congested: {
            ...prev.congested,
            [signal.path]:
              signal.retryAfterSec === undefined
                ? { since: signal.at }
                : { since: signal.at, retryAfterSec: signal.retryAfterSec },
          },
        };
      });
    });
    const sweep = setInterval(() => {
      setState((prev) => {
        const cutoff = Date.now() - CONGESTION_WINDOW_MS;
        const live = Object.entries(prev.congested).filter(([, c]) => c.since > cutoff);
        if (live.length === Object.keys(prev.congested).length) return prev;
        return { ...prev, congested: Object.fromEntries(live) };
      });
    }, CONGESTION_SWEEP_MS);
    return () => {
      stop();
      clearInterval(sweep);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const reply = await liveStatus("", sessionId);
      if (!alive) return;
      /* 🔴 혼잡 축은 이 폴링이 «건드리지 않는다» — 다른 사실이고, 걷히는 조건도 다르다. */
      setState((prev) =>
        reply.state === "ok"
          ? {
              ...prev,
              mode: reply.data.online ? "live" : "replay",
              checkedAt: reply.data.checkedAt,
              why: null,
              /* 🔴 서버가 방금 답한 것이 정본이다 — 조사 시작 헤더로 앞질러 갱신한 값도
                 여기서 덮인다(창 만료로 «줄어드는» 축은 폴링만 볼 수 있다). 쿼리를 안 실은
                 회차는 `runCap` 이 없고, 그때는 `null` = 「모른다」로 돌아간다. */
              runCap: reply.data.runCap ?? null,
            }
          : { ...prev, mode: "unavailable", checkedAt: new Date().toISOString(), why: reply.why },
      );
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sessionId]);

  /**
   * 🔴 **조사 시작 응답이 «즉시» 카운터를 움직인다**(계약 v0.1.15 「갱신 = 폴링 + 응답 헤더」).
   *    폴링만이면 방금 쓴 1회가 최대 30초 뒤에 보인다 — 그 창의 방문자는 자기 클릭이 먹지
   *    않았다고 읽는다.
   */
  useEffect(
    () =>
      subscribeRunCap((s) =>
        setState((prev) => ({
          ...prev,
          runCap: {
            limit: s.limit,
            used: s.used,
            remaining: s.remaining,
            /* 🔴 헤더에 없는 두 칸은 «지어내지 않는다». `windowSec` 은 상수라 앞 값을 잇고,
               `nextFreeInSec` 은 시각에 따라 변하는 값이라 **버린다** — 옛 값을 그대로 두면
               화면이 「N분 뒤 회복」을 지난 숫자로 계속 말한다. 다음 폴링이 채운다. */
            windowSec: prev.runCap?.windowSec ?? 0,
            nextFreeInSec: null,
          },
        })),
      ),
    [],
  );

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

const FACE: Record<Mode, { icon: string; text: string; cls: string }> = {
  checking: { icon: "◌", text: "확인 중", cls: "text-muted" },
  live: { icon: "◉", text: "LIVE", cls: "text-ok" },
  replay: { icon: "◑", text: "REPLAY", cls: "text-warn" },
  unavailable: { icon: "◌", text: "미연결", cls: "text-muted" },
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

/**
 * 🔴 **T7-31 — 「거절당했다」를 배지가 «말한다»**(D-49 · X-11 판정선 = 조용한 폴백 금지).
 *
 * 아이콘·색·배치는 신규 0 — `◌`(미연결과 같은 글리프)와 기존 `text-warn` 토큰을 그대로 쓴다.
 * 🔴 `N` 은 **서버가 `Retry-After` 로 말한 값**일 때만 적는다. 없으면 문장에서 뺀다 — 화면이
 *    「잠시 후」를 지어내면 그 숫자는 서버가 하지 않은 말이 된다(`retryAfterSec` 규율과 같다).
 */
const CONGESTED_FACE = { icon: "◌", cls: "text-warn" };

/** 여러 축이 동시에 거절당하면 **가장 최근** 것을 말한다 — 창이 지나면 스스로 빠진다. */
function latestCongestion(congested: Record<string, Congestion>): Congestion | null {
  let latest: Congestion | null = null;
  for (const c of Object.values(congested)) if (!latest || c.since > latest.since) latest = c;
  return latest;
}

export function ModeBadge() {
  const { mode, checkedAt, why, congested } = useContext(LiveContext);
  const congestion = latestCongestion(congested);
  const face = congestion ? CONGESTED_FACE : FACE[mode];
  const text = congestion
    ? `혼잡${congestion.retryAfterSec !== undefined ? ` · ${congestion.retryAfterSec}초 뒤 재시도` : ""}`
    : FACE[mode].text;
  const seen = checkedAt ? new Date(checkedAt).toLocaleTimeString("ko-KR") : "확인 전";
  return (
    <span
      className={`flex items-center gap-1.5 fkt-pill bg-fill text-foot ${face.cls}`}
      title={`마지막 확인 ${seen}${why ? ` · ${why}` : ""}${congestion ? " · 서버가 요청을 거절했습니다(503)" : ""}`}
      data-testid="mode-badge"
      /* 🔴 `data-mode` 는 «Live 축»의 값 그대로 둔다 — 혼잡은 다른 축이고, 이 속성을 읽는
         기존 스펙이 혼잡 때문에 다른 답을 받으면 안 된다. 혼잡은 자기 속성으로 말한다. */
      data-mode={mode}
      data-congested={congestion ? "true" : undefined}
      data-retry-after-sec={congestion?.retryAfterSec}
    >
      <span aria-hidden>{face.icon}</span>
      <span>{text}</span>
    </span>
  );
}

/**
 * 🔴 **T7-38 — 「얼마나 썼고 몇 회 더 되는가」**(계약 v0.1.15 · 폐하 하명 09-04 14:14).
 *
 * 🔴 **LIVE 일 때만 선다.** REPLAY(`online:false`)·미연결·확인 중에는 표시하지 않는다 —
 *    재생은 이 상한을 «쓰지 않으므로»(`session_cap.py` 머리말), 그 축에 상한을 말하면 화면이
 *    「재생도 소모된다」는 없는 사실을 암시한다. 혼잡(503)은 다른 축이라 카운터를 끄지 않는다.
 * 🔴 **상한 없음(`limit: 0` · `remaining: null`)이면 말하지 않는다.** 「무제한」이라고 적는
 *    것은 운영자가 상한을 끈 형상을 방문자에게 보증하는 일이 되고, 다시 켜는 날 그 문구만
 *    남는다. 할 말이 없으면 자리를 차지하지 않는다(§0 「조건부」).
 * 🔴 **화면 신규 요소는 이것 하나다.** 배지의 `data-mode` 계약은 한 글자도 건드리지 않는다.
 */
export function RunCapCounter() {
  const { mode, runCap } = useContext(LiveContext);
  if (mode !== "live" || !runCap || runCap.remaining === null) return null;

  const exhausted = runCap.remaining === 0;
  /* 🔴 「N분 뒤」는 서버가 `nextFreeInSec` 으로 «말한» 회차에만 적는다 — 없으면 그 절을 뺀다
     (`retryAfterSec` 규율과 같다: 화면이 시간을 지어내면 그 숫자는 서버가 하지 않은 말이다). */
  const minutes =
    runCap.nextFreeInSec === null ? null : Math.max(1, Math.ceil(runCap.nextFreeInSec / 60));
  const text = exhausted
    ? `상한 도달${minutes === null ? "" : ` · ${minutes}분 뒤 1회 회복`} · 재생은 계속`
    : `조사 ${runCap.used}/${runCap.limit} · 남은 ${runCap.remaining}회`;

  return (
    <span
      className={`fkt-pill bg-fill text-foot ${exhausted ? "text-warn" : "text-muted"}`}
      title={`이 세션이 최근 ${Math.round(runCap.windowSec / 60)}분 동안 시작한 Live 조사 ${runCap.used}회 · 상한 ${runCap.limit}회`}
      data-testid="run-cap-counter"
      data-runcap-limit={runCap.limit}
      data-runcap-used={runCap.used}
      data-runcap-remaining={runCap.remaining}
    >
      {text}
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
        className="rounded border border-ai/60 px-2 py-0.5 text-foot text-ai hover:bg-ai/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
        data-testid="static-replay-offer"
      >
        {busy ? "재생본 준비 중…" : "정적 재생본으로 GS-01 보기"}
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
        "실시간 AI 종합이 꺼져 있습니다. 조사와 근거 수집은 그대로 실행되고, 원인 후보는 집계로 종합합니다. 화면 흐름은 같습니다."
      : mode === "unavailable"
        ? `실시간 상태를 확인하지 못했습니다(${visitorWhy(why)}). 서버가 아직 연결되지 않았을 뿐 오류는 아닙니다.`
        : sessionPending
          ? "이 세션은 아직 백엔드에 등록되지 않았습니다(미연결). 화면 흐름은 동일합니다."
          : null;

  if (!notice || closed) return null;
  return (
    <div
      /* 🔴 **T7-29 — 띠를 36.5 로 되돌린다**(폐하 재가 09-04 ⓒ · D-26 수리분 역방향).
         D-26 은 ✕ 의 히트를 44 로 세우려고 «줄 자체»를 36.5 → 44 로 키웠다. 그건 보이는
         것을 바꾼 처방이라, 공개 주소의 모습과 어긋났다. 이번 원칙은 그 반대다 —
         **보이는 상자·간격·배치는 1px 도 안 움직이고, 누르는 상자만 44 로 편다.**
         ✕ 쪽에서 «아래로만» 넓히므로 이 줄은 원래 높이로 돌아간다.
         🔴 `py-2` 로 되돌리지 «않는다» — 실측(390): 그러면 띠가 79 → 95 로 «커진다».
            D-26 이 뺀 `py-2` 는 한 줄로 서는 1440 에서만 구속력이 있었고, 글이 두 줄로
            감기는 390 에서는 내용 높이가 이미 더 컸다. 되돌릴 축은 «최소 높이»뿐이다:
            1440 은 44 → 36.5 로 돌아가고, 390 은 79 그대로다. */
      className="flex min-h-[36.5px] items-center gap-3 border-b border-edge bg-panel px-4 text-foot text-ink"
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
        /* ✕ 글리프는 가로 10.6px 뿐이라 2.5.8 의 24 미만 — 간격 예외에 기대는 자리였다.
           «실제 박스»를 44 로 편다(글리프 크기 불변).
           🔴 **T7-29 — 위로는 넓히지 않는다.** 위에는 sticky 앱바가 있고, 그건 «나중에
           그려지는» 이웃이라 위로 뻗은 부분은 덮여서 안 눌린다(D-26 이 줄 자체를 키운 이유).
           그래서 **아래로만** 늘리고(`pb`) 같은 값의 음수 `mb` 로 자리를 되돌린다 —
           띠 높이·본문 위치는 그대로이고 누르는 상자만 아래로 자란다.
           🔴 `relative z-10` 이 그 아랫부분을 본문 «위»에 둔다. 이게 없으면 넓힌 만큼이
           본문에 덮여, CSS 로는 44 인데 화면에서는 안 눌리는 앞판의 형태로 돌아간다.
           🔴 **T7-29b — 44 를 보장하는 것은 `min-h-11` 이지 `pb` 값이 아니다.**
           앞 처방은 «내용 20.5 + pb 23.5 = 44» 를 전제했는데 실측 내용은 **19.5** 였다 →
           두 폭 모두 **43**(1px 미달 · 리바이2 #570 · 내 무대에서도 43/43 재현).
           그래서 계산값을 코드에 두지 않고 최소 높이를 직접 세운다 — 내용이 몇이든 CSS 가
           스스로 44 이상을 보장한다.
           `pb`/`-mb` 쌍은 이제 «44 를 만드는 값» 이 아니라 **글리프를 줄 가운데에 붙잡는 장치**다:
           두 값이 같으면 margin box 와 content box 가 같은 중심을 가져, 상자가 44 로 커져도
           ✕ 는 제자리에 선다(실측: 글리프 중심 y 1440 69.5 · 390 122.3 — 전/후 동일).
           🔴 `self-stretch` 는 쓰지 않는다 — 실측(T7-29b A안 `min-h-11 self-stretch -mb-11`):
           stretch 가 cross size 에서 음수 margin 을 **빼서** 상자가 1440 에서 79.5 로 부풀고,
           상자가 줄 «상단»에 붙어 ✕ 글리프가 **22px 아래로 이동**했다(두 폭 모두). */
        className="relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center pb-[23.5px] -mb-[23.5px] text-muted hover:text-ink"
        onClick={() => setClosed(true)}
        aria-label="배너 닫기"
      >
        ✕
      </button>
    </div>
  );
}
