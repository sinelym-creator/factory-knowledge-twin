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
    return <p className="mt-2 h-8 text-foot text-muted">센서 없음</p>;
  }
  if (why) {
    return (
      <p className="mt-2 h-8 text-foot text-warn" title={`센서 추세를 못 불렀다: ${why}`}>
        — 추세 못 가져옴
      </p>
    );
  }
  if (!series) {
    return <p className="mt-2 h-8 text-foot text-muted">추세 불러오는 중…</p>;
  }

  /* 🔴 **그림용으로 한 번 더 줄인다.** 602점을 32px 높이에 그리면 선이 아니라 «노이즈 덩어리»가
     된다(실측: 카드 12장이 전부 같은 얼룩으로 보였다 — 폐하 14:01 「차트 뭉개짐」과 같은 축).
     🔴 줄인 사실은 캡션이 말한다 — 서버가 이미 「원본 → 표시」를 밝혔고, 여기서 한 단 더 줄인
        것도 같은 자리에 적는다(§0.2 · 숨기지 않는다). 값을 «만들지» 않고 «고르기»만 한다(간격
        표본 · 마지막 점은 항상 포함해 최신값이 그림에서 빠지지 않게). */
  const MAX_DRAW = 96;
  const step = Math.max(1, Math.ceil(series.points.length / MAX_DRAW));
  const drawn =
    step === 1
      ? series.points
      : [...series.points.filter((_, i) => i % step === 0), series.points[series.points.length - 1]];
  const values = drawn.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = drawn
    .map((p, i) => {
      const x = (i / Math.max(drawn.length - 1, 1)) * 100;
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

  /* 🔴 면(area)은 «선 아래»를 닫아 만든다 — 마지막 점에서 바닥으로 내려 첫 점 바닥으로 돌아온다.
     그라디언트는 Stocks 톤(선색 25% → 0%)이고, 축·격자·눈금은 없다(리서치 §3 「축·격자 거의 삭제」).
     🔴 그라디언트 id 는 센서마다 다르게 둔다 — 카드 12장이 한 id 를 공유하면 첫 카드의 색이 전부에
        걸린다(SVG defs 는 문서 전역이다). */
  const gid = `spark-${series.sensorId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const area = `${path} L100,26 L0,26 Z`;

  return (
    <figure className="mt-2" data-testid="sparkline" data-sensor={series.sensorId}>
      <svg
        viewBox="0 0 100 26"
        preserveAspectRatio="none"
        className="h-8 w-full text-ai"
        role="img"
        aria-label={`${series.sensorId} 24시간 추세`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
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
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path
          d={path}
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
        className="id mt-1 truncate text-cap text-placeholder"
        title={`${series.unit} · 원본 ${series.sampling.sourcePoints.toLocaleString()}점 → ${series.sampling.returnedPoints}점 수신${drawn.length !== series.points.length ? ` → ${drawn.length}점 그림` : ""}`}
      >
        {series.unit} · {series.sampling.returnedPoints}점
        {drawn.length !== series.points.length && <> → {drawn.length}점 그림</>}
      </figcaption>
    </figure>
  );
}
