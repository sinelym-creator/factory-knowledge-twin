"use client";

import { useEffect, useState } from "react";

/**
 * 합성 대기 표시 — 얇은 진행 바 + shimmer 스켈레톤 (T6-2 ③ · 체감 속도 · iOS 톤).
 *
 * 🔴 **왜 별 파일인가**: `run-panels.tsx` 는 「전부 `RunState` 의 순수 함수 · 상태를 스스로 들지
 *    않는다」가 성문이다. 이 표시는 «시간»을 들어야 하므로 그 규율을 깰 수밖에 없고, 그래서
 *    깨는 부분만 여기로 격리한다 — 패널 파일은 순수한 채로 둔다.
 *
 * 🔴 **진행률은 «추정»이지 진척이 아니다.** 서버는 합성 도중 아무 말도 하지 않는다(부분 진행
 *    이벤트는 T6-3 범위다). 그래서 바는 경과/예상으로 «그려질 뿐»이고, 그 사실을 다음 세 가지로
 *    정직하게 만든다:
 *      ① **92% 에서 멈춘다** — 끝을 모르는 바를 100% 로 채우면 「끝났는데 화면이 멈췄다」로 읽힌다.
 *      ② **예상을 넘기면 바를 정지**시키고 문면을 바꾼다 — 계속 차오르면 그것은 거짓 진척이다.
 *      ③ `data-*` 에 예상·경과·기준(`since="shown"`)을 실어 계측기가 값의 성격을 알 수 있게 한다.
 *
 * 🔴 **경과의 기준은 «이 표시가 뜬 순간»이지 단계 시작 시각이 아니다.** 이벤트는 폴링으로 오므로
 *    실제 시작보다 늦게 알고, 화면을 늦게 연 방문자는 더 늦게 안다. 그래서 「약 N초」로 적고
 *    「N초 남았습니다」로 단정하지 않는다.
 *
 * 🔴 **모션 값은 토큰(`--fkt-*`)에 있다**(globals.css). `prefers-reduced-motion` 도 토큰 층에서
 *    존중하므로 이 파일에는 미디어 쿼리가 없다 — 접근성이 컴포넌트마다의 옵트인이 되지 않게.
 */

/** 🔴 하드코딩이 아니라 «선언»이다. 빌드 시점 env 로 갈아 끼운다(Next.js 클라이언트 규약). */
const EXPECTED_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_FKT_SYNTHESIS_EXPECTED_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 9_000;
})();

const TICK_MS = 250;
/** 끝을 모르는 바의 상한. 100 은 「끝났다」는 뜻이라 쓰지 않는다. */
const CAP_PERCENT = 92;

export function SynthesisPending() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - started), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const expectedSec = Math.round(EXPECTED_MS / 1000);
  const remainingSec = Math.ceil((EXPECTED_MS - elapsedMs) / 1000);
  const overdue = remainingSec <= 0;
  const percent = overdue ? CAP_PERCENT : Math.min(CAP_PERCENT, (elapsedMs / EXPECTED_MS) * CAP_PERCENT);

  return (
    <div
      className="fkt-rise mt-2"
      style={{ fontFamily: "var(--fkt-font-system)" }}
      data-testid="synthesis-pending"
      data-expected-ms={EXPECTED_MS}
      data-elapsed-ms={elapsedMs}
      data-percent={Math.round(percent)}
      data-since="shown"
      data-overdue={overdue ? "1" : "0"}
    >
      <p className="text-sm text-ink/90" role="status" aria-live="polite">
        AI 근거 작성 중{" "}
        {overdue ? (
          <span className="text-warn">— 예상({expectedSec}초)보다 오래 걸리고 있습니다</span>
        ) : (
          <span className="text-muted">· 약 {Math.max(1, remainingSec)}초</span>
        )}
      </p>

      {/* 얇은 진행 바 — 트랙은 남고 틴트만 차오른다(색 1종 · 상태색과 섞지 않는다). */}
      <div
        className="mt-2 w-full overflow-hidden"
        style={{ height: "var(--fkt-progress-height)", borderRadius: "var(--fkt-radius-pill)", background: "var(--color-edge)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={`AI 근거 작성 진행(예상 ${expectedSec}초 기준 추정)`}
        data-testid="synthesis-pending-bar"
      >
        <div
          className="h-full"
          style={{
            width: `${percent}%`,
            borderRadius: "var(--fkt-radius-pill)",
            background: overdue ? "var(--color-warn)" : "var(--color-ai)",
            // 🔴 transition 은 «틱 간격보다 조금 길게». 짧으면 계단처럼 튀고, 길면 정지했을 때도
            //    한동안 움직여서 「멈췄다」는 사실이 화면에 늦게 도착한다.
            transition: "width 0.3s var(--fkt-ease-spring), background-color 0.3s linear",
          }}
        />
      </div>

      {/* 후보 카드 «자리»를 미리 잡는다 — 결과가 도착할 때 화면이 튀지 않게. 2건은 자리표시일
          뿐 실제 후보 수가 아니라, 읽는 기술에는 숨긴다. */}
      <ul className="mt-3 space-y-3" aria-hidden>
        {[0, 1].map((i) => (
          <li
            key={i}
            className="border-t border-edge pt-2 first:border-0 first:pt-0"
            data-testid="synthesis-pending-skeleton"
          >
            <div className="fkt-shimmer h-4 w-2/3 rounded" />
            <div className="fkt-shimmer mt-2 h-3 w-full rounded" />
            <div className="fkt-shimmer mt-1 h-3 w-5/6 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
