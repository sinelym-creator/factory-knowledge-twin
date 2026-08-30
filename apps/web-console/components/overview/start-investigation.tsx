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
  const [why, setWhy] = useState<string | null>(null);

  const usable = Boolean(sessionId) && sessionOrigin === "api";

  async function start() {
    if (!sessionId) return;
    setBusy(true);
    setWhy(null);
    const r = await startRunBrowser(scenarioId, sessionId);
    if (r.state === "ok") {
      router.push(`/incidents/${encodeURIComponent(r.data.incidentId)}?run=${encodeURIComponent(r.data.runId)}`);
      return;
    }
    setBusy(false);
    setWhy(r.why);
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={!usable || busy}
        data-testid={testId}
        className="rounded border border-ai/60 px-3 py-1 text-xs text-ai hover:bg-ai/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
        title={usable ? undefined : "이 세션은 아직 백엔드에 등록되지 않았습니다"}
      >
        {busy ? "조사 시작 중…" : "조사 시작 ▸"}
      </button>
      {why && (
        <p className="mt-1 text-xs text-warn" role="status">
          조사를 시작하지 못했다: {why}
        </p>
      )}
    </div>
  );
}
