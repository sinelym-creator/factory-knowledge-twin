"use client";

import { useEffect, useState } from "react";

import { bandPaths, measurementLabel } from "@/lib/chart-band";
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
    return <p className="mt-2 h-8 text-foot text-muted">센서 없음</p>;
  }
  if (why) {
    return (
      <p className="mt-2 h-8 text-foot text-warn" title={`센서 추세를 못 불렀다: ${why}`}>
        추세를 가져오지 못했습니다
      </p>
    );
  }
  if (!series) {
    return <p className="mt-2 h-8 text-foot text-muted">추세 불러오는 중…</p>;
  }

  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  /* 🔴 카드 스파크라인도 «구간 최소~최대 밴드 + 중앙선»이다 — 큰 차트와 같은 손(lib/chart-band).
     602점을 32px 에 선 하나로 그리면 카드 12장이 전부 같은 얼룩으로 보였다(운영자 15:25
     「지저분해 보인다」). 폭이 좁으니 구간은 36개면 족하다. */
  const yOf = (v: number) => 24 - ((v - min) / span) * 22;
  const { band, center, windows, fold } = bandPaths(series.points, yOf, 36);
  // 🔴 기준선은 warnThreshold 다 — alarmThreshold 를 그리면 알람이 «임계 아래»에서 뜬 거짓
  //    화면이 된다(계약 v0.1.7 성문).
  const warnY =
    series.warnThreshold !== null && series.warnThreshold >= min && series.warnThreshold <= max
      ? 24 - ((series.warnThreshold - min) / span) * 22
      : null;

  /* 🔴 면(area)은 «선 아래»를 닫아 만든다 — 마지막 점에서 바닥으로 내려 첫 점 바닥으로 돌아온다.
     그라디언트는 Stocks 톤(선색 25% → 0%)이고, 축·격자·눈금은 없다(리서치 §3 「축·격자 거의 삭제」).
     🔴 그라디언트 id 는 센서마다 다르게 둔다 — 카드 12장이 한 id 를 공유하면 첫 카드의 색이 전부에
        걸린다(SVG defs 는 문서 전역이다). */
  const gid = `spark-${series.sensorId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const kind = measurementLabel(series.sensorId);

  return (
    <figure className="mt-2" data-testid="sparkline" data-sensor={series.sensorId}>
      <svg
        viewBox="0 0 100 26"
        preserveAspectRatio="none"
        className="h-8 w-full text-ai"
        role="img"
        aria-label={`${kind ?? "센서"} 추세 · ${series.sensorId} · 최근 24시간 · 구간 최소~최대 범위와 평균`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        {warnY !== null && (
          <line
            x1="0"
            y1={warnY}
            x2="100"
            y2={warnY}
            stroke="currentColor"
            className="text-warn"
            strokeDasharray="3 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={band} fill={`url(#${gid})`} stroke="none" />
        <path
          d={center}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* 🔴 «줄였다»는 사실을 화면도 말한다. 응답의 sampling을 숨기면 보는 사람은 모든 샘플을
          봤다고 믿는다 — 서버가 형상에 새긴 정직함을 화면에서 지우지 않는다(§0.2). */}
      {/* 🔴 한 줄로 «잠근다» — 세 단계(원본→수신→그림)를 풀어 쓰면 카드 안에서 두 줄로 넘쳐
          설비명·상태를 밀어냈다(실측). 사실은 하나도 빼지 않고 전체 문장을 title 에 둔다. */}
      <figcaption
        className="mt-1 truncate text-cap text-placeholder"
        title={`${kind ? `${kind} · ` : ""}${series.sensorId} · ${series.unit} · 최근 24시간 · 원본 ${series.sampling.sourcePoints.toLocaleString()}점 → ${series.sampling.returnedPoints}점 수신${fold > 1 ? ` → ${windows}구간(면 = 최소~최대 · 선 = 평균)` : ""}`}
      >
        {kind ?? "추세"} <span className="id">{series.unit}</span> · 24시간
      </figcaption>
    </figure>
  );
}
