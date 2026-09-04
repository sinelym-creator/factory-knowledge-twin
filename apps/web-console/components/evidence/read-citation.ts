/**
 * 인용 좌표 → 화면에 무엇을 그릴지 (U-09 · U-10) — DOM 없이 도는 순수 규칙.
 *
 * 🔴 **깨진 인용을 조용히 넘기지 않는다.** 좌표가 본문 밖이면 «그럴듯한 값»(0 이나 전체 범위)
 *    으로 고쳐 그리지 않고 «거절»한다 — 잘못된 자리를 강조하는 것은 강조가 없는 것보다 나쁘다.
 * 🔴 **인용을 «요청하지 않은» 열람과 «요청했는데 깨진» 열람은 다른 것**이다. 둘을 한 모양으로
 *    접으면 화면이 「원래 인용이 없었다」고 거짓말한다.
 */
export type CitationSpan = { start: number; end: number } | null;

export type CitationView =
  | { kind: "none" }
  | { kind: "out-of-range"; start: number; end: number; bodyLength: number }
  | { kind: "highlight"; start: number; end: number; before: string; quoted: string; after: string };

export function readCitation(body: string, span: CitationSpan): CitationView {
  if (span === null) return { kind: "none" };
  const ok =
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.end > span.start &&
    span.end <= body.length;
  if (!ok) return { kind: "out-of-range", start: span.start, end: span.end, bodyLength: body.length };
  return {
    kind: "highlight",
    start: span.start,
    end: span.end,
    before: body.slice(0, span.start),
    quoted: body.slice(span.start, span.end),
    after: body.slice(span.end),
  };
}
