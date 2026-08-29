"use client";

import { useState } from "react";

import { resetSession } from "@/lib/contract";

/**
 * ⟲ 리셋 (wireframes §0) — 확인 모달 → `POST /api/sessions/{sid}/reset` → 초기 상태 복귀.
 *
 * 🔴 「초기화됐습니다」를 «응답을 받은 뒤에만» 말한다. 백엔드가 아직 없을 때 성공처럼 보이게
 *    하면, 화면이 하지 않은 일을 했다고 말하는 것이다(P0 11항 중 «리셋»의 참·거짓이 여기서 갈린다).
 */
export function ResetButton({ sessionId }: { sessionId: string }) {
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const reply = await resetSession(sessionId);
    setBusy(false);
    setAsking(false);
    setResult(
      reply.state === "ok"
        ? "세션을 초기 상태로 되돌렸습니다."
        : `초기화하지 못했습니다 — 백엔드 미연결(${reply.why}).`,
    );
  }

  return (
    <>
      <button
        className="rounded border border-edge px-2 py-1 text-xs text-muted hover:text-ink"
        onClick={() => {
          setResult(null);
          setAsking(true);
        }}
        title="이 세션의 상태를 처음으로 되돌립니다"
        data-testid="reset-button"
      >
        ⟲ <span className="sr-only">세션 </span>리셋
      </button>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded border border-edge bg-panel p-4" role="dialog" aria-modal>
            <p className="text-sm">이 세션을 처음 상태로 되돌릴까요?</p>
            <p className="mt-1 text-xs text-muted">
              변경한 작업지시서 초안·조사 결과가 사라집니다. 다른 방문자에게는 영향이 없습니다.
            </p>
            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button className="rounded border border-edge px-3 py-1.5 text-muted hover:text-ink"
                      onClick={() => setAsking(false)} disabled={busy}>
                취소
              </button>
              <button className="rounded border border-edge px-3 py-1.5 text-ai hover:text-ink"
                      onClick={() => void confirm()} disabled={busy}>
                {busy ? "되돌리는 중…" : "되돌리기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <span className="text-xs text-muted" role="status">
          {result}
        </span>
      )}
    </>
  );
}
