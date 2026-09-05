/**
 * U-06·U-07 — 계약 검증기(`tests/contract/validator.js`) 단위 층.
 *
 * 🔴 무엇을 세우는가: 정본 스키마(`packages/contracts/agent-events-v0.1.schema.json`)를 그대로 물려
 *    ⓐ 실물 정상 케이스가 «오류 0» 으로 통과하고(U-06) ⓑ 결함 한 건을 심으면 «그 한 건만» 잡히며,
 *    필수 누락·타입 불일치·여분 키 셋이 서로 «구별되는» 문면으로 나온다(U-07).
 * 🔴 무엇을 못 세우는가: 이 파일은 검증기의 답을 재는 것이지 계약 자체의 옳음을 재지 않는다.
 *    스키마가 틀렸는데 검증기가 그대로 답하면 여기서는 초록이다(그 축은 contract harness 몫).
 * 🔴 기대 «문면»을 통째로 박지 않는다 — 문면이 바뀌면 계약 테스트가 아니라 오타 검사기가 된다.
 *    판정선은 ① 오류 «건수» ② 오류가 가리키는 «경로» ③ 셋이 서로 다른가, 이 셋뿐이다.
 * 🔴 케이스는 지어내지 않고 harness 케이스집에서 «인용»한다 — 인용이 실패하면(라벨이 사라지면)
 *    그 자리에서 죽는다. 없는 케이스를 조용히 건너뛰면 0건 실행이 초록으로 보인다.
 */
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);

type ValidateFn = (schema: unknown, root: unknown, value: unknown, path?: string) => string[];
const { validate } = require_("../../../tests/contract/validator.js") as { validate: ValidateFn };

type Envelope = Record<string, unknown>;
type Case = { group: string; label: string; expect: string; event: Envelope };
type CaseFile = { envelopeDefaults: Envelope; cases: Case[] };

const schema = require_("../../../packages/contracts/agent-events-v0.1.schema.json") as Record<string, unknown>;
const caseFile = require_("../../../tests/contract/cases/agent-events.cases.json") as CaseFile;

/** 케이스집에서 «통과로 선언된» 한 건을 라벨로 집어 온다 — 못 찾으면 던진다(조용한 0건 방지). */
function accepted(label: string): Envelope {
  const hit = caseFile.cases.find((c) => c.label === label && c.expect === "accept");
  if (!hit) throw new Error(`케이스집에 «${label}»(accept)가 없다 — 인용이 끊겼다`);
  return { ...caseFile.envelopeDefaults, ...hit.event };
}

const check = (value: unknown) => validate(schema, schema, value, "");

/** 이 파일이 «인용»하는 케이스 라벨 전부 — 하나라도 사라지면 첫 테스트가 죽는다. */
const QUOTED = [
  "step.evidence",
  "최소형(position만)",
  "run.completed",
  "비 doc-chunk는 면제(alarm)",
];

/** 한 필드를 뺀 사본 — 원본을 건드리지 않는다. */
function without(obj: Envelope, key: string): Envelope {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe("U-06 정상 이벤트는 오류 0 으로 통과한다", () => {
  it("인용한 라벨이 케이스집에 실재한다(자극 도달 계수)", () => {
    // 🔴 이 한 줄이 아래 전부의 «전제»다 — 케이스가 사라지면 통과가 아니라 실패로 끝나야 한다.
    const found = QUOTED.filter((l) => caseFile.cases.some((c) => c.label === l && c.expect === "accept"));
    expect(found).toEqual(QUOTED);
  });

  it("step.evidence(doc-chunk · 신뢰 필드 포함) 실물 케이스", () => {
    expect(check(accepted("step.evidence"))).toEqual([]);
  });

  it("run.queued 최소형(position 만) 실물 케이스", () => {
    expect(check(accepted("최소형(position만)"))).toEqual([]);
  });
});

describe("U-07 결함 한 건은 오류 한 건으로, 셋은 서로 구별되게 잡힌다", () => {
  const base = accepted("step.evidence");

  /* 세 갈래를 «같은 정상 봉투»에서 한 축씩만 어긋내 만든다 — 손잡이가 하나여야 셋의 차이가
     결함의 차이지 케이스의 차이가 아니다. */
  const missing = without(base, "ts"); // ⓐ 필수 누락
  const wrongType = { ...base, seq: "1" }; // ⓑ 타입 불일치(integer 자리에 string)
  const extra = { ...base, 미허용: 1 }; // ⓒ 여분 키(additionalProperties: false)

  it("ⓐ 필수 누락 — 오류 1건이고 빠진 키 이름을 말한다", () => {
    const errors = check(missing);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ts");
  });

  it("ⓑ 타입 불일치 — 오류 1건이고 그 필드 경로를 가리킨다", () => {
    const errors = check(wrongType);
    expect(errors).toHaveLength(1);
    expect(errors[0].startsWith(".seq:")).toBe(true);
  });

  it("ⓒ 여분 키 — 오류 1건이고 그 키 이름을 말한다", () => {
    const errors = check(extra);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("미허용");
  });

  it("셋의 문면이 서로 다르다(같으면 세 결함을 가를 수 없다)", () => {
    const said = [check(missing)[0], check(wrongType)[0], check(extra)[0]];
    expect(new Set(said).size).toBe(3);
  });

  it("정상 봉투 자신은 오류 0 이다(대조군 — 셋의 빨강이 봉투 탓이 아님을 가른다)", () => {
    expect(check(base)).toEqual([]);
  });
});

describe("U-07 중첩 — 오류는 «어디서» 났는지까지 말한다", () => {
  /** `payload.evidence` 를 한 필드 뺀 사본으로 갈아 끼운 봉투. */
  function brokenEvidence(label: string, drop: string): Envelope {
    const base = accepted(label);
    const payload = base.payload as { step: string; evidence: Record<string, unknown> };
    return { ...base, payload: { ...payload, evidence: without(payload.evidence, drop) } };
  }

  it("payload.evidence 안의 필수 누락은 중첩 경로로 나온다", () => {
    // alarm 케이스로 잰다 — doc-chunk 는 조건 분기가 하나 더 붙어 «건수»가 1이 아니다(아래 건).
    const errors = check(brokenEvidence("비 doc-chunk는 면제(alarm)", "sourceId"));
    expect(errors).toHaveLength(1);
    expect(errors[0].startsWith(".payload.evidence:")).toBe(true);
  });

  it("doc-chunk 갈래도 한 문면·한 경로로 말한다(규칙이 몇 번 걸리든)", () => {
    /* 🔴 여기서 «건수»를 박지 않는다. 한 결함이 몇 개의 규칙에 걸리는지는 계약의 형상이
       정하고, 그 형상은 움직인다 — 실제로 `evidenceRef.required` 와
       `allOf.if(kind=doc-chunk).then.required` 가 `sourceId` 를 둘 다 적던 동안에는 2건이었고,
       계약이 그 중복을 걷어낸 뒤(#733) 1건이 됐다. 어느 쪽이든 **호출자가 읽는 사실**은
       같아야 한다: 말은 한 가지고, 전부 그 중첩 자리를 가리킨다. 그 둘만 건다.
       🔴 「0건이 아니다」를 먼저 건다 — 빈 결과가 통과로 보이면 이 그물은 죽은 것이다. */
    const errors = check(brokenEvidence("step.evidence", "sourceId"));
    expect(errors.length).toBeGreaterThan(0);
    expect(new Set(errors).size).toBe(1);
    expect(errors.every((e) => e.startsWith(".payload.evidence:"))).toBe(true);
  });

  it("배열 원소 안의 필수 누락은 첨자까지 붙은 경로로 나온다", () => {
    /* 🔴 발주 문면의 `payload.evidence[0]` 는 정본에 없다 — `stepEvidence.evidence` 는 «객체» 하나다.
       첨자가 붙는 자리는 `runCompleted.candidates[]` 이므로 그 실물 케이스로 옮겨 잰다. */
    const base = accepted("run.completed");
    const payload = base.payload as { candidates: Record<string, unknown>[] };
    const broken = {
      ...base,
      payload: { ...payload, candidates: [without(payload.candidates[0], "rank")] },
    };
    const errors = check(broken);
    expect(errors).toHaveLength(1);
    expect(errors[0].startsWith(".payload.candidates[0]:")).toBe(true);
  });
});
