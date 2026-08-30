"use client";

import { useEffect, useState } from "react";

import { CONTRACT, type Series, type SeriesWindow, apiGetBrowser } from "@/lib/contract";

/**
 * 센서 추세 차트 (wireframes §2 · 창 전환 24h ↔ 3주).
 *
 * 🔴 **기준선은 warnThreshold 다.** alarmThreshold(더 높은 값)를 그리면 「알람이 임계 아래에서
 *    떴다」는 거짓 화면이 된다 — 활성 알람의 threshold_value 가 warn 과 같은 값이라 그렇다
 *    (계약 v0.1.7 성문). 두 임계를 다 그리되 «기준»이라고 부르는 것은 warn 뿐이다.
 *
 * 🔴 **줄인 사실을 화면이 숨기지 않는다.** 3주 창 원본은 44,400점(2MB)이라 서버가 버킷
 *    min·max 로 줄여 보낸다. 그 사실을 캡션에 남기지 않으면 보는 사람은 전량을 봤다고 믿는다.
 */
export function SensorTrend({
  equipmentId,
  sensorId,
  unit,
}: {
  equipmentId: string;
  sensorId: string;
  unit: string;
}) {
  const [window, setWindow] = useState<SeriesWindow>("24h");
  // 🔴 결과에 «어느 요청의 답인가»를 붙여 둔다. 창을 바꾸면 이전 창의 그림이 잠깐 남는데,
  //    그 순간 화면은 3주 캡션 아래 24시간 곡선을 그린다 — 눈에 안 띄고 틀린 그림이다.
  //    키가 다르면 안 보여 준다(이전 결과를 지우려고 effect 안에서 setState 하지 않는다).
  const key = `${equipmentId}|${sensorId}|${window}`;
  const [answer, setAnswer] = useState<{ key: string; series?: Series; why?: string } | null>(null);
  const current = answer?.key === key ? answer : null;
  const series = current?.series ?? null;
  const why = current?.why ?? null;

  useEffect(() => {
    let alive = true;
    apiGetBrowser<Series>(CONTRACT.sensorSeries(equipmentId, sensorId, window)).then((r) => {
      if (!alive) return;
      setAnswer(r.state === "ok" ? { key, series: r.data } : { key, why: r.why });
    });
    return () => {
      alive = false;
    };
  }, [key, equipmentId, sensorId, window]);

  return (
    <section className="rounded border border-edge bg-panel p-3" data-testid="sensor-trend">
      <div className="flex items-center gap-2">
        <p className="id text-xs">{sensorId}</p>
        <p className="text-xs text-muted">{unit}</p>
        <div className="ml-auto flex gap-1" role="group" aria-label="추세 창">
          {(["24h", "3w"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              data-testid={`window-${w}`}
              className={`rounded border px-2 py-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai ${
                window === w ? "border-ai text-ai" : "border-edge text-muted hover:text-ink"
              }`}
            >
              {w === "24h" ? "24h" : "3주"}
            </button>
          ))}
        </div>
      </div>

      {why && (
        <p className="mt-3 text-sm text-warn" role="status">
          추세를 가져오지 못했다: {why}
        </p>
      )}
      {!why && !series && <p className="mt-3 text-sm text-muted">불러오는 중…</p>}
      {series && <Chart series={series} />}
    </section>
  );
}

function Chart({ series }: { series: Series }) {
  const values = series.points.map((p) => p.value);
  const thresholds = [series.warnThreshold, series.alarmThreshold].filter(
    (v): v is number => v !== null,
  );
  const min = Math.min(...values, ...thresholds);
  const max = Math.max(...values, ...thresholds);
  const span = max - min || 1;
  const y = (v: number) => 100 - ((v - min) / span) * 96 - 2;
  const path = series.points
    .map((p, i) => {
      const x = (i / Math.max(series.points.length - 1, 1)) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y(p.value).toFixed(2)}`;
    })
    .join(" ");

  return (
    <figure className="mt-3">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-48 w-full" role="img"
        aria-label={`${series.sensorId} ${series.window} 추세`}>
        {series.alarmThreshold !== null && (
          <line x1="0" y1={y(series.alarmThreshold)} x2="100" y2={y(series.alarmThreshold)}
            stroke="currentColor" className="text-danger/50" strokeDasharray="1 2" strokeWidth="0.4" />
        )}
        {series.warnThreshold !== null && (
          <line x1="0" y1={y(series.warnThreshold)} x2="100" y2={y(series.warnThreshold)}
            stroke="currentColor" className="text-warn" strokeDasharray="2 2" strokeWidth="0.5" />
        )}
        <path d={path} fill="none" stroke="currentColor" className="text-ai" strokeWidth="0.6" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>
          기준선 <span className="text-warn">warn {series.warnThreshold}</span>
          {series.alarmThreshold !== null && (
            <span className="text-danger/70"> · alarm {series.alarmThreshold}</span>
          )}
        </span>
        <span className="id">
          {series.points[0]?.ts.slice(0, 16)} ~ {series.points.at(-1)?.ts.slice(0, 16)}
        </span>
        <span>
          원본 {series.sampling.sourcePoints.toLocaleString()}점 →{" "}
          {series.sampling.returnedPoints}점 표시 ({series.sampling.method})
        </span>
      </figcaption>
    </figure>
  );
}
