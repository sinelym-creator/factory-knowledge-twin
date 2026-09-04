import { describe, expect, it } from "vitest";

import { readCitation } from "./read-citation";

const BODY = "가나다라마바사아자차";

describe("U-09 정상 인용 — 원문 위치를 복원한다", () => {
  it("먼저: 이 좌표가 «본문 안»인지 확인한다", () => {
    expect(BODY.length).toBeGreaterThan(6); // 형상이 쉬워지면 아래 판정이 의미를 잃는다
  });

  it("잘라낸 세 조각을 이으면 «원문 그대로»다", () => {
    const v = readCitation(BODY, { start: 2, end: 6 });
    expect(v.kind).toBe("highlight");
    if (v.kind !== "highlight") return;
    expect(v.quoted).toBe("다라마바");
    /* 🔴 강조는 «원문을 잘라» 만든다 — 이어 붙여 원문이 되지 않으면 화면의 강조가 거짓이다. */
    expect(v.before + v.quoted + v.after).toBe(BODY);
  });

  it("경계값 — 처음·끝·한 글자", () => {
    expect(readCitation(BODY, { start: 0, end: 1 }).kind).toBe("highlight");
    expect(readCitation(BODY, { start: BODY.length - 1, end: BODY.length }).kind).toBe("highlight");
  });
});

describe("U-10 깨진 인용 — 조용히 넘기지 않고 «거절»한다", () => {
  const broken = [
    { start: 5, end: 5 },                 // 빈 구간
    { start: 6, end: 2 },                 // 뒤집힘
    { start: -1, end: 3 },                // 음수
    { start: 2, end: BODY.length + 1 },   // 본문 밖
    { start: 1.5, end: 4 },               // 정수 아님
  ];

  it("먼저: 다섯 형태가 «정말로» 깨진 것인지 확인한다", () => {
    expect(broken).toHaveLength(5);
    expect(broken.every((s) => !(Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end > s.start && s.end <= BODY.length))).toBe(true);
  });

  it("🔴 다섯 다 out-of-range 로 거절하고, «그럴듯한 값»을 지어내지 않는다", () => {
    for (const span of broken) {
      const v = readCitation(BODY, span);
      expect(v.kind).toBe("out-of-range");
      if (v.kind !== "out-of-range") continue;
      expect(v.start).toBe(span.start); // 요청 좌표를 그대로 들고 나온다 — 고쳐 쓰지 않는다
      expect(v.bodyLength).toBe(BODY.length);
    }
  });

  it("🔴 «요청 안 함»과 «요청했는데 깨짐»은 다른 것이다", () => {
    expect(readCitation(BODY, null).kind).toBe("none");
    expect(readCitation(BODY, { start: 99, end: 100 }).kind).toBe("out-of-range");
    /* 둘을 한 모양으로 접으면 화면이 「원래 인용이 없었다」고 거짓말한다. */
  });
});
