/**
 * 시계열 «범위 밴드 + 중앙선» — 스파크라인과 센서 추세가 **같은 손**으로 그린다.
 *
 * 🔴 **왜 선 하나로 안 그리는가**(운영자 09-03 14:01·15:25 「차트 라인 뭉개짐 · 지저분하다」):
 *    서버가 15,600점을 602점으로 줄일 때 쓰는 방식이 `bucket-minmax` — 구간마다 **최소와
 *    최대를 «둘 다»** 싣는다. 그 배열을 선 하나로 이으면 값이 min→max→min 으로 튀며
 *    **톱니**가 되고, 화면에서는 «털»처럼 두꺼운 띠로 보인다. 선을 얇게 해도 톱니는 남고,
 *    점을 줄이면 이번엔 극값(알람이 울린 그 관측치)이 그림에서 사라진다.
 *
 * 🔴 **처방 = 톱니를 «면»으로 읽는다.** 구간마다 최소~최대를 옅은 면으로 깔고 그 위에
 *    중앙선 하나를 긋는다. 극값은 면의 경계로 그대로 남으므로 **정보 손실 0**이고, 눈에는
 *    곡선 하나 + 변동 폭으로 읽힌다. 변동이 큰 구간은 면이 두껍고 추세가 뚜렷한 구간은
 *    얇아져서, 「진동이 커지다 튀었다」가 오히려 더 잘 보인다.
 *
 * 🔴 **값을 만들지 않는다.** 밴드 경계는 실측 최소·최대 그대로이고, 중앙선만 구간 평균이다.
 *    그 사실은 화면 캡션이 말한다(무엇을 그린 그림인지 숨기지 않는다 · baseline §0.2).
 */

export type BandPoint = { value: number };

export type BandPaths = {
  /** 닫힌 면(위 경계 → 아래 경계 역순) — fill 로만 쓴다. */
  band: string;
  /** 구간 평균 폴리라인 — stroke 로만 쓴다. */
  center: string;
  /** 실제로 그린 구간 수 — 캡션이 이 값을 말한다. */
  windows: number;
  /** 한 구간에 접힌 원 표본 수(1 이면 접지 않았다). */
  fold: number;
};

/**
 * @param points 서버가 준 점 열(이미 한 번 줄여진 것일 수 있다)
 * @param y      값 → SVG y 좌표 변환(호출부의 스케일을 그대로 쓴다)
 * @param target 목표 구간 수 — 그림 폭에 맞춰 호출부가 정한다(스파크라인은 작게)
 */
export function bandPaths(
  points: readonly BandPoint[],
  y: (v: number) => number,
  target: number,
): BandPaths {
  const n = points.length;
  if (n === 0) return { band: "", center: "", windows: 0, fold: 0 };

  const fold = Math.max(1, Math.ceil(n / Math.max(1, target)));
  const lo: number[] = [];
  const hi: number[] = [];
  const mid: number[] = [];
  for (let i = 0; i < n; i += fold) {
    let a = Infinity;
    let b = -Infinity;
    let sum = 0;
    let cnt = 0;
    for (let j = i; j < Math.min(i + fold, n); j++) {
      const v = points[j].value;
      if (v < a) a = v;
      if (v > b) b = v;
      sum += v;
      cnt++;
    }
    lo.push(a);
    hi.push(b);
    mid.push(sum / cnt);
  }

  const w = mid.length;
  const x = (i: number) => (i / Math.max(w - 1, 1)) * 100;
  const top = hi.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const bottom = lo
    .map((v, i) => `L${x(w - 1 - i).toFixed(2)},${y(lo[w - 1 - i]).toFixed(2)}`)
    .join(" ");
  const center = mid
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");

  return { band: `${top} ${bottom} Z`, center, windows: w, fold };
}

/**
 * 센서 종류를 «사람 말»로 — 운영자 09-03 15:25 「무슨 데이터인지 표기하고」.
 *
 * 🔴 **모르면 지어내지 않는다.** `null` 을 돌려주고 화면은 센서 ID 만 보인다 — 표에 없는
 *    측정 종류를 그럴듯한 이름으로 채우면, 화면이 서버가 하지 않은 말을 한다.
 * 🔴 판정은 **ID 의 마지막 조각**으로 한다(`SN-204-VIB` → `VIB`). 계약이 측정 종류를 별
 *    필드로 싣기 시작하면 그 값을 쓰도록 이 함수만 갈아탄다(호출부는 그대로).
 */
const MEASUREMENT_LABEL: Record<string, string> = {
  VIB: "진동",
  TEMP: "온도",
  CUR: "전류",
  PRES: "압력",
  PRESS: "압력",
  RPM: "회전수",
  FLOW: "유량",
  LOAD: "부하",
  TORQ: "토크",
};

export function measurementLabel(sensorId: string): string | null {
  const tail = sensorId.split("-").pop()?.toUpperCase() ?? "";
  return MEASUREMENT_LABEL[tail] ?? null;
}
