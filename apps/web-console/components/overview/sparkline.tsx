"use client";

import { useEffect, useState } from "react";

import { CONTRACT, type Series, apiGetBrowser } from "@/lib/contract";

/**
 * 설비 카드의 24h 스파크라인 — 🔴 **브라우저가 직접 부른다.**
 *
 * V-1(세션 쿠키가 브라우저에 안 닿아 /api/* 가 전부 401)은 서버 렌더만 보면 끝까지 안 보였다.
 * 이 컴포넌트가 그 축의 상설 표본이다: 여기가 비면 브라우저 데이터 경로가 죽은 것이고,
 * 화면은 그 사실을 «비어 있음»이 아니라 «못 물어봄»으로 말한다.
 *
 * 🔴 실패를 조용히 삼키지 않는다. 실패하면 자리에 «—»와 사유 툴팁을 남긴다. 빈 칸을 두면
 *    「센서가 없다」와 「못 불렀다」가 화면에서 같은 모습이 된다.
 */
export function Sparkline({
  equipmentId,
  sensorId,
}: {
  equipmentId: string;
  sensorId: string | null;
}) {
  const [series, setSeries] = useState<Series | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    if (!sensorId) return;
    let alive = true;
    apiGetBrowser<Series>(CONTRACT.sensorSeries(equipmentId, sensorId, "24h")).then((r) => {
      if (!alive) return;
      if (r.state === "ok") setSeries(r.data);
      else setWhy(r.why);
    });
    return () => {
      alive = false;
    };
  }, [equipmentId, sensorId]);

  if (!sensorId) {
    return <p className="mt-2 h-8 text-xs text-muted">센서 없음</p>;
  }
  if (why) {
    return (
      <p className="mt-2 h-8 text-xs text-warn" title={`센서 추세를 못 불렀다: ${why}`}>
        — 추세 못 가져옴
      </p>
    );
  }
  if (!series) {
    return <p className="mt-2 h-8 text-xs text-muted">추세 불러오는 중…</p>;
  }

  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = series.points
    .map((p, i) => {
      const x = (i / Math.max(series.points.length - 1, 1)) * 100;
      const y = 24 - ((p.value - min) / span) * 22;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  // 🔴 기준선은 warnThreshold 다 — alarmThreshold 를 그리면 알람이 «임계 아래»에서 뜬 거짓
  //    화면이 된다(계약 v0.1.7 성문).
  const warnY =
    series.warnThreshold !== null && series.warnThreshold >= min && series.warnThreshold <= max
      ? 24 - ((series.warnThreshold - min) / span) * 22
      : null;

  return (
    <figure className="mt-2" data-testid="sparkline" data-sensor={series.sensorId}>
      <svg viewBox="0 0 100 26" className="h-8 w-full" role="img" aria-label={`${series.sensorId} 24시간 추세`}>
        {warnY !== null && (
          <line x1="0" y1={warnY} x2="100" y2={warnY} stroke="currentColor" className="text-warn" strokeDasharray="2 2" strokeWidth="0.5" />
        )}
        <path d={path} fill="none" stroke="currentColor" className="text-ai" strokeWidth="0.8" />
      </svg>
      {/* 🔴 «줄였다»는 사실을 화면도 말한다. 응답의 sampling을 숨기면 보는 사람은 모든 샘플을
          봤다고 믿는다 — 서버가 형상에 새긴 정직함을 화면에서 지우지 않는다(§0.2). */}
      <figcaption className="id mt-1 text-[10px] text-muted">
        {series.unit} · {series.sampling.sourcePoints.toLocaleString()}점 →{" "}
        {series.sampling.returnedPoints}점 표시
      </figcaption>
    </figure>
  );
}
