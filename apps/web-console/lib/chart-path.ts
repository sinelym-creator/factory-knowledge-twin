/**
 * 차트 기하 — 스파크라인·센서 추세가 «같은 손»으로 그린다(T6-4 · 폐하 14:01 「차트가 뭉개져 보인다」).
 *
 * 🔴 뭉개짐의 원인은 데이터가 아니라 «그리는 법»이었다: 602점을 1px 꺾은선으로 그대로 이으면
 *    노이즈가 띠로 보인다. 처방 = ① 화면 구간으로 줄여(평균) ② 부드러운 곡선으로 잇고
 *    ③ 최소~최대 범위는 «띠»로 따로 보여 준다 — 줄이되 숨기지 않는다(§0.2 · 캡션이 구간 수를 말한다).
 * 🔴 여기엔 값의 «뜻»이 없다(임계·단위·알람은 호출부). 좌표만 다룬다.
 */
export type Pt = { x: number; y: number };

export type Bucket = { mean: number; lo: number; hi: number };

/** 값 배열을 `buckets` 구간으로 줄인다 — 구간 평균 + 구간 최소/최대. 순서 보존 · 빈 입력 = []. */
export function bucketize(values: number[], buckets: number): Bucket[] {
  const n = values.length;
  if (n === 0) return [];
  const b = Math.max(1, Math.min(Math.floor(buckets), n));
  const out: Bucket[] = [];
  for (let i = 0; i < b; i++) {
    const start = Math.floor((i * n) / b);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / b));
    let sum = 0;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let k = start; k < end; k++) {
      const v = values[k];
      sum += v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out.push({ mean: sum / (end - start), lo, hi });
  }
  return out;
}

const fmt = (v: number) => v.toFixed(2);

/**
 * Catmull-Rom → 3차 베지어. 점을 «지나가는» 곡선이라 값 자리를 속이지 않는다(스플라인이
 * 점 사이를 부풀리는 폭은 1/6 계수로 작게 둔다). 점 1개 = M 하나 · 0개 = "".
 */
export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return d;
}

/** 곡선 아래를 `baseY` 까지 닫은 영역(그라디언트 채움용). */
export function areaPath(pts: Pt[], baseY: number): string {
  if (pts.length === 0) return "";
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${smoothPath(pts)} L${fmt(last.x)},${fmt(baseY)} L${fmt(first.x)},${fmt(baseY)} Z`;
}

/** 위 곡선(정방향) + 아래 곡선(역방향)을 닫은 «띠» — 구간 최소~최대 범위. */
export function bandPath(top: Pt[], bottom: Pt[]): string {
  if (top.length === 0 || bottom.length === 0) return "";
  const back = [...bottom].reverse();
  const upper = smoothPath(top);
  const lower = smoothPath(back).replace(/^M/, "L");
  return `${upper} ${lower} Z`;
}

/** 값 → y(0~100 · 위가 0) 사상. 여백 `pad` 만큼 위아래를 비운다. */
export function yScale(min: number, max: number, pad = 4): (v: number) => number {
  const span = max - min || 1;
  return (v) => 100 - pad - ((v - min) / span) * (100 - pad * 2);
}

/** i번째 구간의 x(0~100). 구간이 하나면 100 에 둔다(«마지막 값» 자리). */
export function xAt(i: number, count: number): number {
  return count <= 1 ? 100 : (i / (count - 1)) * 100;
}
