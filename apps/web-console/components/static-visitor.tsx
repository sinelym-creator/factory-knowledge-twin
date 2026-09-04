"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { isStaticRun } from "@/lib/static-replay/run-id";
import {
  loadVisitor,
  markVisited,
  parseVisitorRaw,
  resetVisitor,
  useVisitorRaw,
  visitorChipLabel,
} from "@/lib/static-replay/visitor-state";

/**
 * 정적 replay 방문자 표기 — 세션 칩·리셋의 «정적 대응» (T4-2a ⓒ · baseline §14.1).
 *
 * 🔴 **서버 세션 칩과 같은 자리에 서지만 같은 것이라 말하지 않는다.** Live 의 칩은 「서버가
 *    이 세션을 안다」는 뜻이고, 이것은 「이 브라우저가 기억한다」는 뜻이다. 둘을 구별 없이
 *    보여 주면 화면이 「세션 격리가 동작한다」는 거짓 인상을 준다(`lib/session.ts` 의 origin
 *    구분과 같은 규율 · §0.2).
 *
 * 🔴 **`static` 은 세 번째 origin 이다**(오케 승인 R-1). `pending` 을 재사용하지 않는 이유는
 *    그 문구가 「아직 백엔드에 등록되지 않았습니다」로, «곧 될 것»처럼 읽히기 때문이다 —
 *    정적 경로에는 그럴 예정이 없다. 없는 약속을 하지 않는다.
 */
export function StaticVisitorChip() {
  const [asking, setAsking] = useState(false);
  /**
   * 🔴 진입 여부·기억 둘 다 **파생이다** — effect 로 상태에 밀어 넣지 않는다.
   *    `?run=` 은 훅이 주고(레이아웃은 `searchParams` prop 을 못 받지만 이 훅은 클라이언트에서
   *    읽는다), 기억은 `useSyncExternalStore` 가 준다. 정적 화면을 떠나면 두 값이 함께 꺼진다.
   * 🔴 서버 스냅샷은 「기억 없음」이라 첫 페인트에 칩이 없다가 마운트 후 선다 — 서버에 이
   *    기억이 «실제로 없기» 때문이고, 있는 척하면 하이드레이션이 갈린다.
   */
  const active = isStaticRun(useSearchParams().get("run"));
  const raw = useVisitorRaw(active);
  const visitor = parseVisitorRaw(raw);

  /**
   * 🔴 첫 방문에는 기억이 «없다» — 여기서 만든다. setState 가 아니라 **외부 시스템에 쓰는
   *    일**이라 effect 가 제자리이고, 쓰기가 스토어에 통지하면 위 파생이 따라온다.
   *    (읽기만 하는 훅으로는 첫 방문자에게 칩이 영영 안 선다.)
   */
  useEffect(() => {
    if (active && !visitor) loadVisitor();
  }, [active, visitor]);

  if (!active || !visitor) return null;

  return (
    <span className="flex items-center gap-1.5" data-testid="static-visitor">
      <span
        className="rounded border border-ai/50 px-2 py-1 text-foot text-ai"
        title={`녹화 재생본 방문자 ${visitor.visitorId} · 서버 세션이 아니라 이 브라우저에만 남습니다.`}
        data-testid="static-visitor-chip"
        data-origin="static"
      >
        정적 · {visitorChipLabel(visitor)}
        {visitor.visited.length > 0 && (
          <span className="ml-1 text-muted" data-testid="static-visited-count">
            열람 {visitor.visited.length}
          </span>
        )}
      </span>
      {/* ⟲ 리셋의 정적 대응 — 🔴 서버에 보낼 것이 없으니 «이 브라우저의 기억»을 지운다.
          Live 의 리셋과 같은 몸짓이지만 지우는 대상이 다르므로 툴팁이 그 사실을 말한다. */}
      {asking ? (
        <span className="flex items-center gap-1 text-foot" role="group" aria-label="정적 재생본 리셋 확인">
          <span className="text-muted">기억을 지웁니까?</span>
          <button
            type="button"
            onClick={() => {
              resetVisitor();
              setAsking(false);
              // 🔴 되감기 위치도 함께 사라지므로 화면을 다시 세운다 — 지운 뒤에도 옛 커서가
              //    남아 있으면 「리셋했는데 그 자리」가 되어 리셋이 거짓이 된다.
              location.reload();
            }}
            className="rounded border border-warn/50 px-1.5 py-0.5 text-warn hover:bg-warn/10"
            data-testid="static-reset-confirm"
          >
            지운다
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="fkt-pill bg-fill text-muted hover:text-ink"
            data-testid="static-reset-cancel"
          >
            취소
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="fkt-pill bg-fill text-foot text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
          title="이 브라우저에 남은 정적 재생본 기억(되감기 위치·열람 이력)을 지웁니다"
          data-testid="static-reset"
        >
          <span aria-hidden>⟲</span>
          <span className="sr-only">정적 재생본 기억 리셋</span>
        </button>
      )}
    </span>
  );
}

/**
 * 열람 이력 기록 — 🔴 **그리는 것이 없다**(부수효과 전용).
 *
 * 근거·문서 화면은 서버 컴포넌트라 storage 에 손이 닿지 않는다. 그래서 「무엇을 열었나」는
 * 이 작은 클라이언트가 남긴다. 🔴 Live 경로에서는 아무것도 하지 않는다 — 서버가 세션을 아는
 * 자리에서 브라우저가 이력을 따로 들면 같은 사실이 두 곳에 살면서 갈린다.
 */
export function MarkVisited({ id, run }: { id: string; run?: string }) {
  useEffect(() => {
    if (!isStaticRun(run)) return;
    markVisited(id);
  }, [id, run]);
  return null;
}
