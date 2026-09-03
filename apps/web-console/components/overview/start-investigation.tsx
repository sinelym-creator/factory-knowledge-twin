"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { startRunBrowser } from "@/lib/contract";

/**
 * 「조사 시작」 — GS-01 S1→S2 동선(wireframes §1 인터랙션 ③·⑥).
 *
 * `POST /scenarios/{id}/runs` → `/incidents/{incidentId}?run={runId}`.
 *
 * 🔴 **브라우저가 부른다.** 서버 액션으로 감싸면 이 동선이 브라우저 세션을 통과하는지가
 *    화면에서 안 보인다 — V-1 이 바로 그 사각에서 살아남았다.
 * 🔴 **pending 세션에서는 «될 리가 없다»고 먼저 말한다.** 백엔드가 모르는 임시 세션으로
 *    조사를 시작하면 401 이 돌아오는데, 그 빨강은 방문자에게 「내가 뭘 잘못했나」로 읽힌다.
 *    상태를 아는 쪽이 먼저 말하는 것이 정직하다.
 */
export function StartInvestigation({
  scenarioId,
  sessionId,
  sessionOrigin,
  testId,
}: {
  scenarioId: string;
  sessionId: string | null;
  sessionOrigin: string | null;
  testId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const usable = Boolean(sessionId) && sessionOrigin === "api";

  async function start(mode: "live" | "replay") {
    if (!sessionId) return;
    setBusy(true);
    setRefusal(null);
    // 🔴 mode 를 «여기서» 명시한다 — 이 버튼이 뜻하는 것은 「지금 조사를 돌린다」이므로
    //    live 다. 계약이 live 를 못 주면 replay 로 강등해 답하고, ② 화면의 배지가 그 강등을
    //    그대로 보여 준다(조용한 강등 0). fixture 재생은 이 버튼이 아니라 `?run=` 으로 온다.
    const r = await startRunBrowser(scenarioId, sessionId, mode);
    if (r.state === "ok") {
      router.push(`/incidents/${encodeURIComponent(r.data.incidentId)}?run=${encodeURIComponent(r.data.runId)}`);
      return;
    }
    setBusy(false);
    setRefusal(describe(r.detail?.code, r.why, r.retryAfterSec));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void start("live")}
        disabled={!usable || busy}
        data-testid={testId}
        /* 🔴 1차 액션 = 채운 pill(리서치 §7-8). 앞판은 «테두리 + 12px 글자»라 이 화면에서 가장
           중요한 동작이 가장 작아 보였다. press 는 scale(0.95) 하나뿐이다(색 반전 금지). */
        className="fkt-btn fkt-btn-primary rounded-pill px-5"
        title={usable ? undefined : "이 세션은 아직 백엔드에 등록되지 않았습니다"}
      >
        {busy ? "조사 시작 중…" : "조사 시작"}
      </button>
      {refusal && (
        <div className="mt-2 text-foot" role="status" data-testid="run-refusal" data-code={refusal.code ?? "unknown"}>
          <p className="text-warn">{refusal.text}</p>
          {/* 🔴 **제안은 «문장»이 아니라 «동작»이다**(§6.2 · 빈 화면 0). 「Replay 로 볼 수
              있습니다」라고만 적으면 방문자는 그 다음에 무엇을 눌러야 하는지 모른 채 남는다.
              같은 시나리오를 재생으로 시작해 ② 화면까지 데려간다 — 배지가 REPLAY 로 서므로
              무엇을 보고 있는지도 조용해지지 않는다. */}
          {refusal.offerReplay && (
            <button
              type="button"
              onClick={() => void start("replay")}
              disabled={busy}
              data-testid="run-replay-offer"
              className="fkt-btn fkt-btn-secondary mt-2 rounded-pill px-4"
            >
              Replay 로 보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Refusal = { code: string | null; text: string; offerReplay: boolean };

/**
 * 서버가 «사유 코드»로 나눠 답한 것을 방문자의 낱말로 (계약 v0.1.9 ⓒⓐ).
 *
 * 🔴 **분기는 `code` 로 한다 — 문구가 아니라.** 서버의 `message` 는 구현의 것이고 바뀔 수
 *    있다고 계약이 못박았다. 문구로 분기하면 서버가 한 글자 고치는 날 화면이 조용히 다른
 *    길로 간다.
 * 🔴 **대기 시간은 서버가 말한 값만 쓴다.** `Retry-After` 가 없으면 그 문장을 «빼고» 적는다 —
 *    화면이 「30초 뒤에」를 지어내면 그 숫자는 아무 근거가 없고, 방문자는 그것을 사실로 읽는다.
 */
function describe(code: string | undefined, why: string, retryAfterSec: number | undefined): Refusal {
  const after = retryAfterSec !== undefined ? ` — ${retryAfterSec}초 뒤에 다시 시도할 수 있습니다` : "";
  if (code === "live_capacity_exhausted") {
    return {
      code,
      text: `지금은 Live 조사를 시작할 자리가 없습니다${after}.`,
      offerReplay: true,
    };
  }
  if (code === "session_run_cap_exceeded") {
    // 🔴 `rate_limited` 와 «다른 문장»이다. 저쪽은 「잠시 후 다시」이고 이쪽은 「이 시간에는
    //    재생으로 계속」이다 — 한 문장으로 합치면 방문자는 60초 뒤에 다시 눌러 또 막힌다.
    //    상한의 뜻은 「지금 붐빈다」가 아니라 「이 세션의 Live 몫을 다 썼다」다.
    return {
      code,
      text: `이 세션의 Live 조사 횟수를 다 썼습니다${after}. 녹화 재생으로는 계속 볼 수 있습니다.`,
      offerReplay: true,
    };
  }
  if (code === "rate_limited") {
    return { code, text: `요청이 너무 잦습니다${after}.`, offerReplay: false };
  }
  if (code === "dependency_unavailable") {
    // 🔴 여기서 Replay 를 제안하지 «않는다». 이 코드는 「재생본조차 없다」는 뜻이라
    //    (계약 Q-48 절) 제안이 곧 두 번째 실패가 된다 — 못 하는 일을 권하지 않는다.
    return { code, text: `백엔드에 닿지 못해 조사를 시작할 수 없습니다${after}.`, offerReplay: false };
  }
  return { code: code ?? null, text: `조사를 시작하지 못했다: ${why}`, offerReplay: false };
}
