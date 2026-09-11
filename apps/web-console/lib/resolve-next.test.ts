/**
 * D-96b — `resolveNext` 허용 목록 (설계 `docs/design/d96-entry-bounce-next.md` §3·§4 ③).
 *
 * 🔴 **거절 케이스를 먼저 세운다.** 「목적지를 살린다」는 기능은 잘못 만들면 그대로 열린
 *    리다이렉트다 — 통과 케이스만 재면 그 구멍이 초록 밑에 그대로 남는다. 통과 케이스는
 *    맨 아래 둘뿐이고, 그 둘도 **출력 문자열**까지 본다(재조립이 도는가).
 */
import { describe, expect, it } from "vitest";

import { resolveNext } from "./session";

describe("resolveNext — 거절", () => {
  const refused: Array<[string, string]> = [
    ["절대 URL", "https://evil.example/overview"],
    ["프로토콜 상대", "//evil.example/overview"],
    ["스킴만", "javascript:alert(1)"],
    ["역슬래시", "/\evil.example"],
    ["허용 밖 경로", "/incidents/INC-2026-014"],
    ["대문자 경로", "/OVERVIEW"],
    ["상대 경로", "overview"],
    ["빈 문자열", ""],
    ["인코딩 탈출", "/overview/%2e%2e/%2e%2e/etc"],
    ["개행 주입", "/overview\nLocation: https://evil.example"],
  ];
  for (const [name, raw] of refused) {
    it(`${name} → null`, () => expect(resolveNext(raw)).toBeNull());
  }

  it("512 자를 넘으면 null", () => {
    expect(resolveNext(`/overview?intro=1&pad=${"a".repeat(600)}`)).toBeNull();
  });

  it("null·undefined 도 조용히 null", () => {
    expect(resolveNext(null)).toBeNull();
    expect(resolveNext(undefined)).toBeNull();
  });
});

describe("resolveNext — 통과(재조립까지)", () => {
  it("허용 키 둘은 정해진 순서로 다시 쓰인다", () => {
    expect(resolveNext("/overview?tour=1&intro=1")).toBe("/overview?intro=1&tour=1");
  });

  it("허용 밖 키는 «버린다»(거부가 아니라 제거)", () => {
    expect(resolveNext("/overview?run=STATIC-GS-01&intro=1")).toBe("/overview?intro=1");
    expect(resolveNext("/overview?run=STATIC-GS-01")).toBe("/overview");
  });

  it("값이 다르면 그 키만 빠진다", () => {
    expect(resolveNext("/overview?intro=2&tour=1")).toBe("/overview?tour=1");
  });

  it("🔴 중복 키는 첫 값으로 판정한다 — 뒤에 붙인 값이 이기지 않는다", () => {
    expect(resolveNext("/overview?intro=2&intro=1")).toBe("/overview");
  });

  it("쿼리 없는 허용 경로는 그대로", () => {
    expect(resolveNext("/overview")).toBe("/overview");
  });
});
