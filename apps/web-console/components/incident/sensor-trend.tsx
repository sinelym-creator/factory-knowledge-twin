"use client";

import { useEffect, useId, useState } from "react";

import { type ActiveAlarm, CONTRACT, type Series, type SeriesWindow, apiGetBrowser } from "@/lib/contract";
import { areaPath, bandPath, bucketize, smoothPath, xAt, yScale } from "@/lib/chart-path";
import { TZ_LABEL, stamp } from "@/lib/time";

/**
 * 센서 추세 차트 (wireframes §2 · 창 전환 24h ↔ 3주).
 *
 * 🔴 **기준선을 «한 낱말»로 지정하지 않는다**(계약 v0.1.7-정정 2차 · 검증 11대 전수 실측).
 *    앞판 주석은 「기준선은 warnThreshold 다 · 활성 알람의 threshold_value 가 warn 과 같은
 *    값」이라 적었는데 그 전제가 **오기**였다: 실물 `AL-20260826-0041.threshold_value = 6.3`
 *    은 **alarmThreshold** 이고 warn 은 4.5 다. warn 을 단독 기준선으로 읽으면 24h 곡선
 *    (3.75~8.25)이 4.5 를 수차 넘는데 알람은 6.3 에서 1회뿐이라 「임계를 넘었는데 알람이
 *    침묵한다」는 거짓 서사가 된다. 두 임계선을 **모두** 그리고 라벨을 병기한다.
 *
 * 🔴 **알람 서사의 앵커는 «그 알람 행의» thresholdValue 다**(같은 정정). 센서의 임계 표가
 *    아니라 실제로 울린 행의 값이 마커가 된다 — 둘이 갈리는 날 화면이 조용히 어긋나지 않게.
 *
 * 🔴 **이 곡선이 «알람의 것»인지 화면이 말한다**(회부 R-3). 알람 행을 정본에서 찾지 못하면
 *    설비의 첫 센서로 떨어지는데, 그 사실을 말하지 않으면 무관한 추세가 근거처럼 배치된다.
 *
 * 🔴 **줄인 사실을 화면이 숨기지 않는다.** 3주 창 원본은 44,400점(2MB)이라 서버가 버킷
 *    min·max 로 줄여 보낸다. 그 사실을 캡션에 남기지 않으면 보는 사람은 전량을 봤다고 믿는다.
 *
 * T6-4(폐하 14:01 「차트가 뭉개져 보인다」): 화면 120구간으로 줄인 «평균 곡선» + 구간
 * 최소~최대 «띠» + 임계선 3종(비율 무관 1px) + 마지막 값 점. 창 전환은 세그먼트 컨트롤.
 */
const SCREEN_BUCKETS = 120;

export function SensorTrend({
  equipmentId,
  sensorId,
  unit,
  source,
  alarm,
  alarmIds,
  staticSeries,
}: {
  equipmentId: string;
  sensorId: string;
  unit: string;
  /** `alarm` = 알람 행에서 센서를 골랐다 · `fallback` = 못 골라 첫 센서로 떨어졌다. */
  source: "alarm" | "fallback";
  alarm: ActiveAlarm | null;
  /** incident 가 말하는 알람 목록 — 「왜 못 골랐는가」를 화면이 구별해 말하기 위해 받는다. */
  alarmIds: string[];
  /**
   * 정적 replay 경로에서 «미리 받은» 창별 사본 (T4-2a).
   *
   * 🔴 **이 값이 있으면 이 컴포넌트는 네트워크를 타지 않는다** — 정적 경로의 허용 호출은
   *    `/api/live/status` polling 1종뿐이다(AC ① 보정). 여기서 한 번이라도 fetch 가 나가면
   *    「노트북 OFF 에서도 돈다」는 문장이 그 자리에서 거짓이 된다.
   * 🔴 굳히지 않은 창은 «키가 없다». 빈 데이터로 채우지 않고 「Live 전용」이라 말한다 —
   *    없는 것을 그리지 않는다.
   */
  staticSeries?: Partial<Record<SeriesWindow, Series>>;
}) {
  const [window, setWindow] = useState<SeriesWindow>("24h");
  // 🔴 결과에 «어느 요청의 답인가»를 붙여 둔다. 창을 바꾸면 이전 창의 그림이 잠깐 남는데,
  //    그 순간 화면은 3주 캡션 아래 24시간 곡선을 그린다 — 눈에 안 띄고 틀린 그림이다.
  //    키가 다르면 안 보여 준다(이전 결과를 지우려고 effect 안에서 setState 하지 않는다).
  const key = `${equipmentId}|${sensorId}|${window}`;
  const [answer, setAnswer] = useState<{ key: string; series?: Series; why?: string } | null>(null);
  /**
   * 🔴 정적 경로의 답은 **파생이다** — 사본은 props 로 이미 손에 있으니 상태에 «넣을» 이유가
   *    없다. effect 로 밀어 넣으면 첫 렌더 뒤 한 번 더 렌더가 도는 계단이 생기고, 그 사이
   *    한 프레임은 「아직 답이 없다」를 그린다(있는 답을 없다고 말하는 프레임이다).
   * 🔴 굳히지 않은 창은 사유를 그대로 말한다 — 빈 데이터로 채우지 않는다.
   */
  const staticAnswer = staticSeries
    ? staticSeries[window]
      ? { key, series: staticSeries[window] }
      : { key, why: "이 창은 Live 전용입니다 — 정적 재생본은 24h 창만 담습니다" }
    : null;
  const current = staticAnswer ?? (answer?.key === key ? answer : null);
  const series = current?.series ?? null;
  const why = current?.why ?? null;

  useEffect(() => {
    // 🔴 정적 경로: «나가지 않는다». 답은 위에서 파생으로 이미 서 있다.
    if (staticSeries) return;

    let alive = true;
    apiGetBrowser<Series>(CONTRACT.sensorSeries(equipmentId, sensorId, window)).then((r) => {
      if (!alive) return;
      setAnswer(r.state === "ok" ? { key, series: r.data } : { key, why: r.why });
    });
    return () => {
      alive = false;
    };
  }, [key, equipmentId, sensorId, window, staticSeries]);

  return (
    <section
      className="fkt-card p-4"
      data-testid="sensor-trend"
      data-sensor-source={source}
      data-sensor={sensorId}
    >
      <div className="flex items-center gap-2">
        <p className="id text-foot font-semibold">{sensorId}</p>
        <p className="text-foot text-muted">{unit}</p>
        {/* 세그먼트 컨트롤(iOS) — 선택 칸이 카드처럼 «떠» 있다 · 문구·testid 불변 */}
        <div className="ml-auto flex rounded-btn bg-inset p-0.5" role="group" aria-label="추세 창">
          {(["24h", "3w"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              data-testid={`window-${w}`}
              className={`min-h-8 rounded-[10px] px-3 text-foot font-medium transition-[background-color,box-shadow,color] duration-(--fkt-dur-1) ${
                window === w ? "bg-panel text-ink shadow-1" : "text-muted hover:text-ink"
              }`}
            >
              {w === "24h" ? "24h" : "3주"}
            </button>
          ))}
        </div>
      </div>

      <SensorProvenance source={source} alarm={alarm} alarmIds={alarmIds} />

      {why && (
        <p className="mt-3 text-body-c text-warn" role="status">
          추세를 가져오지 못했다: {why}
        </p>
      )}
      {!why && !series && <div className="fkt-shimmer mt-3 h-48 w-full rounded-card" aria-label="불러오는 중…" />}
      {series && <Chart series={series} alarm={source === "alarm" ? alarm : null} />}
    </section>
  );
}

/** 이 곡선이 «어디서 온 센서»인지 — 화면이 스스로 말한다(R-3). */
function SensorProvenance({
  source,
  alarm,
  alarmIds,
}: {
  source: "alarm" | "fallback";
  alarm: ActiveAlarm | null;
  alarmIds: string[];
}) {
  if (source === "alarm" && alarm) {
    return (
      <p className="mt-1 text-foot text-muted" data-testid="sensor-provenance">
        <span className="text-ai">이 incident 를 울린 알람의 센서</span> ·{" "}
        <span className="id">{alarm.alarmId}</span> · 발생 {stamp(alarm.raisedAt) ?? alarm.raisedAt}{" "}
        {TZ_LABEL}
      </p>
    );
  }
  // 🔴 「알람 센서가 아니다」를 «말한다». 앞판은 같은 자리에 아무 말 없이 첫 센서를 그렸다.
  return (
    <p className="mt-1 text-foot text-warn" data-testid="sensor-provenance">
      ⚠ 알람 센서가 아니다 — 이 설비의 첫 센서다.{" "}
      {alarmIds.length === 0
        ? "이 incident 에 연결된 알람이 없다."
        : `연결된 알람(${alarmIds.join(", ")})이 «활성» 목록에 없어 센서를 정본에서 특정하지 못했다.`}
    </p>
  );
}

function Chart({ series, alarm }: { series: Series; alarm: ActiveAlarm | null }) {
  const gradientId = `fkt-trend-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const values = series.points.map((p) => p.value);
  // 🔴 알람 행의 임계도 «스케일에» 넣는다 — 넣지 않으면 마커가 그림 밖으로 나가 조용히
  //    사라지고, 화면은 앵커를 그렸다고 믿는다.
  const thresholds = [series.warnThreshold, series.alarmThreshold, alarm?.thresholdValue].filter(
    (v): v is number => v !== null && v !== undefined,
  );
  const min = Math.min(...values, ...thresholds);
  const max = Math.max(...values, ...thresholds);
  const y = yScale(min, max, 4);
  const buckets = bucketize(values, SCREEN_BUCKETS);
  const mean = buckets.map((b, i) => ({ x: xAt(i, buckets.length), y: y(b.mean) }));
  const hi = buckets.map((b, i) => ({ x: xAt(i, buckets.length), y: y(b.hi) }));
  const lo = buckets.map((b, i) => ({ x: xAt(i, buckets.length), y: y(b.lo) }));
  const last = mean[mean.length - 1];

  return (
    <figure className="mt-3">
      <div className="relative">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-48 w-full overflow-visible text-ai" role="img"
          aria-label={`${series.sensorId} ${series.window} 추세`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 구간 최소~최대 «띠» — 줄이면서 잃는 진폭을 여기서 보여 준다 */}
          <path d={bandPath(hi, lo)} fill="currentColor" fillOpacity="0.12" />
          <path d={areaPath(mean, 100)} fill={`url(#${gradientId})`} />
          {series.alarmThreshold !== null && (
            <line x1="0" y1={y(series.alarmThreshold)} x2="100" y2={y(series.alarmThreshold)}
              stroke="currentColor" className="text-danger/50" strokeDasharray="2 4" strokeWidth="1"
              vectorEffect="non-scaling-stroke" />
          )}
          {series.warnThreshold !== null && (
            <line x1="0" y1={y(series.warnThreshold)} x2="100" y2={y(series.warnThreshold)}
              stroke="currentColor" className="text-warn" strokeDasharray="4 4" strokeWidth="1"
              vectorEffect="non-scaling-stroke" />
          )}
          {/* 🔴 알람 «행»의 임계 = 서사의 앵커(계약 v0.1.7-정정 2차). 센서 임계표와 갈릴 수
              있으므로 별도 선으로 긋는다 — 겹치면 겹친 대로가 사실이다. */}
          {alarm?.thresholdValue !== null && alarm?.thresholdValue !== undefined && (
            <line
              x1="0" y1={y(alarm.thresholdValue)} x2="100" y2={y(alarm.thresholdValue)}
              stroke="currentColor" className="text-danger" strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path d={smoothPath(mean)} fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {last && (
          <span
            aria-hidden
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ai shadow-1"
            style={{ left: `${last.x}%`, top: `${last.y}%` }}
          />
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-foot text-muted">
        {/* 🔴 「기준선」이라는 낱말로 한쪽을 지목하지 않는다 — 두 임계는 뜻이 다른 두 선이다. */}
        <span data-testid="threshold-legend">
          임계 <span className="text-warn">warn {series.warnThreshold}</span>
          {series.alarmThreshold !== null && (
            <span className="text-danger/70"> · alarm {series.alarmThreshold}</span>
          )}
          {alarm && (
            <span className="text-danger">
              {" "}
              · 알람 <span className="id">{alarm.alarmId}</span> 임계 {alarm.thresholdValue} → 관측{" "}
              {alarm.observedValue}
            </span>
          )}
        </span>
        <span className="id">
          {series.points[0]?.ts.slice(0, 16)} ~ {series.points.at(-1)?.ts.slice(0, 16)}
        </span>
        <span>
          원본 {series.sampling.sourcePoints.toLocaleString()}점 →{" "}
          {series.sampling.returnedPoints}점 표시 ({series.sampling.method}) · 화면 {buckets.length}구간
          평균·범위
        </span>
      </figcaption>
    </figure>
  );
}
