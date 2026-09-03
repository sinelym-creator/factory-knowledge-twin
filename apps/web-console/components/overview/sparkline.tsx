"use client";

import { useEffect, useId, useState } from "react";

import { CONTRACT, type Series, apiGetBrowser } from "@/lib/contract";
import { areaPath, bucketize, smoothPath, xAt, yScale } from "@/lib/chart-path";

/**
 * 설비 카드의 24h 스파크라인 — 🔴 **브라우저가 직접 부른다.**
 *
 * V-1(세션 쿠키가 브라우저에 안 닿아 /api/* 가 전부 401)은 서버 렌더만 보면 끝까지 안 보였다.
 * 이 컴포넌트가 그 축의 상설 표본이다: 여기가 비면 브라우저 데이터 경로가 죽은 것이고,
 * 화면은 그 사실을 «비어 있음»이 아니라 «못 물어봄»으로 말한다.
 *
 * 🔴 실패를 조용히 삼키지 않는다. 실패하면 자리에 «—»와 사유 툴팁을 남긴다. 빈 칸을 두면
 *    「센서가 없다」와 「못 불렀다」가 화면에서 같은 모습이 된다.
 *
 * T6-4(폐하 14:01): 602점 꺾은선 → 48구간 평균의 부드러운 곡선 + 아래 틴트 그라디언트 +
 * 마지막 값 점 + warn 임계 점선. «줄였다»는 사실은 캡션이 계속 말한다(§0.2).
 */
const SCREEN_BUCKETS = 48;

export function Sparkline({
  equipmentId,
  sensorId,
}: {
  equipmentId: string;
  sensorId: string | null;
}) {
  const [series, setSeries] = useState<Series | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  // 🔴 그라디언트 id 는 카드마다 달라야 한다(같은 id 가 12장이면 첫 장의 것만 먹는다).
  //    useId 의 특수문자는 url(#…) 안에서 CSS 파서가 오해하므로 영숫자만 남긴다.
  const gradientId = `fkt-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
    return <p className="mt-3 h-10 text-foot text-muted">센서 없음</p>;
  }
  if (why) {
    return (
      <p className="mt-3 h-10 text-foot text-warn" title={`센서 추세를 못 불렀다: ${why}`}>
        — 추세 못 가져옴
      </p>
    );
  }
  if (!series) {
    return <div className="fkt-shimmer mt-3 h-10 w-full" aria-label="추세 불러오는 중…" />;
  }

  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = yScale(min, max, 8);
  const buckets = bucketize(values, SCREEN_BUCKETS);
  const pts = buckets.map((b, i) => ({ x: xAt(i, buckets.length), y: y(b.mean) }));
  const last = pts[pts.length - 1];
  // 🔴 기준선은 warnThreshold 다 — alarmThreshold 를 그리면 알람이 «임계 아래»에서 뜬 거짓
  //    화면이 된다(계약 v0.1.7 성문).
  const warnY =
    series.warnThreshold !== null && series.warnThreshold >= min && series.warnThreshold <= max
      ? y(series.warnThreshold)
      : null;

  return (
    <figure className="mt-3" data-testid="sparkline" data-sensor={series.sensorId}>
      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-10 w-full overflow-visible text-ai"
          role="img"
          aria-label={`${series.sensorId} 24시간 추세`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(pts, 100)} fill={`url(#${gradientId})`} />
          {warnY !== null && (
            <line
              x1="0" y1={warnY} x2="100" y2={warnY}
              stroke="currentColor" className="text-warn" strokeDasharray="3 3" strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={smoothPath(pts)}
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          />
        </svg>
        {last && (
          <span
            aria-hidden
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ai shadow-1"
            style={{ left: `${last.x}%`, top: `${last.y}%` }}
          />
        )}
      </div>
      {/* 🔴 «줄였다»는 사실을 화면도 말한다. 응답의 sampling을 숨기면 보는 사람은 모든 샘플을
          봤다고 믿는다 — 서버가 형상에 새긴 정직함을 화면에서 지우지 않는다(§0.2).
          화면에서 한 번 더 줄인 구간 수도 같은 줄에 적는다. */}
      <figcaption
        className="id mt-2 truncate text-[11px] leading-tight text-muted"
        title={`${series.unit} · 원본 ${series.sampling.sourcePoints.toLocaleString()}점 → ${series.sampling.returnedPoints}점 표시 · 화면 ${buckets.length}구간 평균`}
      >
        {series.unit} · {series.sampling.sourcePoints.toLocaleString()}→{series.sampling.returnedPoints}점 ·{" "}
        {buckets.length}구간 평균
      </figcaption>
    </figure>
  );
}
