/**
 * CAP3-2 — 합성 축 «표시 규칙» (계약 v0.2.4 «화면 문면 개정»).
 *
 * 🔴 무엇을 무는가: ⓐ 배지 낱말이 우리 층의 사건 이름(「거부」)을 쓰지 않는가 ⓑ **사유가 비어
 *    오는 회차에도** 안내 문장이 서는가 ⓒ 원문이 있으면 «접혀서» 남는가 ⓓ 거부가 아닌 회차에는
 *    그 문단이 아예 없는가.
 *    🔴 ⓑ 가 이 파일의 판정선이다 — 앞판 조건(`axis && rejectedReason`)은 CLI 오류·타임아웃처럼
 *       사유 문자열이 비는 회차에 안내를 **통째로 지웠다**. 「문장이 보인다」만 재면 그 구멍이
 *       그대로 통과한다.
 * 🔴 못 세우는 것: 색·대비·`<details>` 가 터치에서 열리는가는 여기서 안 보인다
 *    (`renderToStaticMarkup` 은 CSS·상호작용을 모른다) — 브라우저 층 몫이다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateList } from "./run-panels";
import type { RunState } from "@/lib/run-events";

function stateWith(axis: string, rejectedReason?: string): RunState {
  return {
    runId: "RUN-test",
    status: "completed",
    candidates: [],
    evidence: [],
    steps: [{ step: "synthesize", status: "completed", synthesis: { axis, rejectedReason } }],
  } as unknown as RunState;
}

const markup = (axis: string, reason?: string) =>
  renderToStaticMarkup(<CandidateList state={stateWith(axis, reason)} runId="RUN-test" showingPast />);

describe("합성 축 표시 규칙 (v0.2.4)", () => {
  it("배지는 「기록 기반 집계」라고 말한다 — 「거부」는 우리 층의 낱말이다", () => {
    const html = markup("live-rejected");
    expect(html).toContain("기록 기반 집계");
    expect(html).not.toContain("live 거부");
    // 🔴 계측 그물이 읽는 축은 그대로다 — 낱말만 바뀌었다.
    expect(html).toContain('data-axis="live-rejected"');
  });

  it("🔴 사유가 «없어도» 안내 문장이 선다(앞판이 지우던 자리)", () => {
    const html = markup("live-rejected");
    expect(html).toContain("실시간 분석 대신 기록 기반 집계로 이어서 보여드립니다");
    // 원문이 없으면 「자세히」도 없다 — 눌러서 빈 것을 만나게 두지 않는다.
    expect(html).not.toContain("자세히");
  });

  it("사유가 있으면 원문은 접혀서 남는다(숨김이 아니다)", () => {
    const html = markup("live-rejected", "CLI 타임아웃(60000ms)");
    expect(html).toContain("자세히");
    expect(html).toContain("CLI 타임아웃(60000ms)");
  });

  it("거부가 아닌 회차에는 그 문단이 아예 없다", () => {
    expect(markup("live")).not.toContain("synthesis-rejected-reason");
  });
});
