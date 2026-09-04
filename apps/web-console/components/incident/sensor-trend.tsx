"use client";

import { useEffect, useState } from "react";

import { bandPaths, measurementLabel } from "@/lib/chart-band";
import { type ActiveAlarm, CONTRACT, type Series, type SeriesWindow, apiGetBrowser } from "@/lib/contract";
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
 */
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
      : { key, why: "이 구간은 실시간 조사에서만 볼 수 있습니다. 녹화 재생본은 24시간 구간만 담고 있습니다" }
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
      className="fkt-card p-5"
      data-testid="sensor-trend"
      data-sensor-source={source}
      data-sensor={sensorId}
    >
      <div className="flex items-center gap-2">
        {/* 🔴 «무슨 데이터인가»를 먼저 말한다(운영자 09-03 15:25). 앞판은 센서 ID 만 있어
            그것이 진동인지 온도인지 화면이 말하지 않았다. 종류를 모르면 ID 만 남는다. */}
        <p className="text-body-c font-semibold">
          {measurementLabel(sensorId) ?? "센서 추세"}
          <span className="id ml-2 text-foot font-normal text-muted">{sensorId}</span>
          <span className="ml-1.5 text-foot font-normal text-muted">{unit}</span>
        </p>
        <div className="ml-auto flex gap-0.5 rounded-pill bg-fill/50 p-1" role="group" aria-label="추세 창">
          {(["24h", "3w"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              data-testid={`window-${w}`}
              className={`fkt-hit rounded-pill px-3 py-1 text-foot transition-colors duration-(--fkt-dur-1) ${
                window === w ? "bg-fill font-semibold text-ink" : "text-muted hover:bg-inset hover:text-ink"
              }`}
            >
              {w === "24h" ? "최근 24시간" : "최근 3주"}
            </button>
          ))}
        </div>
      </div>

      <SensorProvenance source={source} alarm={alarm} alarmIds={alarmIds} />

      {why && (
        <p className="mt-4 text-body-c text-warn" role="status">
          추세를 가져오지 못했다: {why}
        </p>
      )}
      {!why && !series && <p className="mt-4 text-body-c text-muted">불러오는 중…</p>}
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
      <p className="mt-2 text-foot text-muted" data-testid="sensor-provenance">
        <span className="text-ai">이 incident 를 울린 알람의 센서</span> ·{" "}
        <span className="id">{alarm.alarmId}</span> · 발생 {stamp(alarm.raisedAt) ?? alarm.raisedAt}{" "}
        {TZ_LABEL}
      </p>
    );
  }
  // 🔴 「알람 센서가 아니다」를 «말한다». 앞판은 같은 자리에 아무 말 없이 첫 센서를 그렸다.
  return (
    <p className="mt-2 text-foot text-warn" data-testid="sensor-provenance">
      ⚠ 알람이 울린 센서가 아니라 이 설비의 첫 센서입니다.{" "}
      {alarmIds.length === 0
        ? "이 상황에 연결된 알람이 없습니다."
        : `연결된 알람(${alarmIds.join(", ")})이 활성 목록에 없어 어느 센서인지 특정하지 못했습니다.`}
    </p>
  );
}

function Chart({ series, alarm }: { series: Series; alarm: ActiveAlarm | null }) {
  const values = series.points.map((p) => p.value);
  // 🔴 알람 행의 임계도 «스케일에» 넣는다 — 넣지 않으면 마커가 그림 밖으로 나가 조용히
  //    사라지고, 화면은 앵커를 그렸다고 믿는다.
  const thresholds = [series.warnThreshold, series.alarmThreshold, alarm?.thresholdValue].filter(
    (v): v is number => v !== null && v !== undefined,
  );
  const min = Math.min(...values, ...thresholds);
  const max = Math.max(...values, ...thresholds);
  const span = max - min || 1;
  const y = (v: number) => 100 - ((v - min) / span) * 96 - 2;
  /* 🔴 선 하나가 아니라 «구간 최소~최대 밴드 + 중앙선»으로 그린다 — 근거는 lib/chart-band.ts
     머리말(bucket-minmax 의 min/max 톱니가 「털」처럼 보이던 자리 · 운영자 15:25). 220px 폭에
     90 구간이면 한 구간이 화면 3~4px 이라 톱니가 면으로 접히고 극값은 경계로 남는다. */
  const { band, center, windows, fold } = bandPaths(series.points, y, 90);

  /* 🔴 **「차트가 뭉개진다」의 근인**(폐하 09-03 14:01)은 색이 아니라 «스케일»이었다:
     `viewBox 100×100` + `preserveAspectRatio="none"` 로 x 를 10배 이상 늘리면 stroke 도 같이
     늘어나 선이 방향마다 다른 굵기로 찌그러진다(대각선은 뭉개지고 수직선은 굵어진다).
     → `vectorEffect="non-scaling-stroke"` 로 선 굵기를 화면 픽셀에 고정하고, 굵기를 2px
     round-cap 으로 올린다. 축·격자는 지우고 눈금 3개만 «SVG 밖»에 둔다(안에 두면 글자도 늘어난다). */
  const ticks = [max, min + span / 2, min];

  return (
    <figure className="mt-4">
      <div className="relative">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[220px] w-full text-ai" role="img"
          aria-label={`${series.sensorId} ${series.window} 추세`}>
          <defs>
            {/* 🔴 면은 위아래 «양쪽»이 실측 경계다 — 아래로 사라지는 그라디언트를 쓰면 최소값
                경계가 안 보여 「범위」라는 뜻이 깨진다. 균일한 옅은 채움을 쓴다. */}
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.14" />
            </linearGradient>
          </defs>
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
          {/* 변동 폭 = 면(실측 최소~최대 그대로) */}
          <path d={band} fill="url(#trend-fill)" stroke="none" />
          {/* 추세 = 중앙선 하나 */}
          <path d={center} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* y 눈금 3개 — 격자선 없이 값만(리서치 §3 「y 눈금 2~3개」) */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-0.5 text-cap text-placeholder" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i} className="id bg-panel/80 px-1">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>
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
          {series.sampling.returnedPoints}점 수신 ({series.sampling.method})
          {fold > 1 && <> → {windows}구간</>}
        </span>
        {/* 🔴 그림의 «문법»을 화면이 말한다 — 면이 무엇이고 선이 무엇인지 모르면 같은 그림이
            다르게 읽힌다(면을 오차로, 선을 실측으로 착각한다). */}
        <span>
          면 = 구간 최소~최대(실측) · 선 = 구간 평균
        </span>
      </figcaption>
    </figure>
  );
}
