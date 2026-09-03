# T6-3 C — 계약 v0.1.13 `step.progress` 스키마 + 케이스 · E1

정본 = `packages/contracts/rest-api-v0.1.md` v0.1.13 append(§189). 판정선은 **그 줄에서** 뽑았다
(발주 요약이 아니라 원문 — 계보 「발주문도 전언이다」):
`payload{step:"synthesize", kind:"preliminary"|"sentence", seq:int(0부터·단조),
preliminary?{ranking:[failureModeId…], axis:"deterministic"}, sentence?{failureModeId, text,
citedEvidenceIds:[≥1]}}`.

🔴 **스키마 JSON write = 오케 위임(14:18)** — 정본 자신도 「스키마 JSON 은 `tests/contract`
커버리지 케이스와 «같은 PR»(리바이2)」로 못박고 있다(§189). `rest-api-v0.1.md` 는 무접촉.

## 무엇을 넣었나

- `type` enum **10번째** = `step.progress` · `allOf` 에 type↔payload 결속 1행 추가
- `$defs.stepProgress` — `step`(const synthesize) · `kind`(enum 2종) · `seq`(integer ≥0) ·
  `preliminary{ranking(minItems 1), axis(const deterministic)}` ·
  `sentence{failureModeId, text, citedEvidenceIds(minItems 1)}` ·
  `kind` 별 **필수 동반 객체** 결속(if/then 2행) · `additionalProperties:false`
- 케이스 **13건**(정상 2 · 위반 11) — `tests/contract/cases/agent-events.cases.json` 그룹 ⑨

## 수치 (`node tests/contract/run.js --quiet --strict-coverage`)

| | 전(`d012036`) | 후 |
|---|---|---|
| 케이스 | **59/59 통과** | **72/72 통과** |
| 커버리지 | 46/46 | **56/56** |
| 자기 검증 | PASS | **PASS** |
| exit code | 0 | **0** |

## 🔴 대조군 — 이 케이스들이 «봉투»가 아니라 «결속»을 재고 있는가

배선 순서 사고로 **결속 1행이 빠진 상태**에서 먼저 돌았다. 그때 같은 케이스 중 **10건이 전부
`accept`**(= 빨강)였고, 결속 1행을 넣자 **전건 `reject`** 로 뒤집혔다. 즉 이 그룹의 초록은
「스키마가 payload 를 실제로 내려다본다」에서 온 것이지 봉투 검사에서 온 것이 아니다.
커버리지도 같은 방향으로 말한다: 배선 전 `stepProgress.*` **10속성 미실행** → 배선 후 0.
(원장 기록용 · 이 열은 의도해서 만든 것이 아니라 내 배선 실수로 «먼저 죽어» 얻은 것이다 —
그래도 실측이라 그대로 남긴다.)

## #443(센쿠2 실물) 정합 — 1줄

`events.py:133 step_progress()` 가 내는 payload = `{step, kind, seq, preliminary?, sentence?}` ·
`workflow.py:216` 선표시 = `preliminary{ranking, axis:"deterministic"}` ·
문장은 `gateway.py:169` 가 NDJSON `{fm,s,ids}` 를 **`{failureModeId, text, citedEvidenceIds}` 로
바꿔서** 올린다 → **이 스키마와 일치**(E2 · 코드 대조. 실물 이벤트를 이 스키마로 통과시킨 것은
아니다 — 그건 #443 병합 뒤 런타임 축).

## 잰 것 · 안 잰 것

- **잰 것**(E1): 위 수치 · 대조군 · 커버리지 56/56.
- **안 잰 것**:
  - 🔴 **`seq` 의 단조성** — 봉투 **1건** 스키마로는 못 잰다(이벤트 «열»의 성질). 스키마가
    세우는 것은 「0 이상의 정수」까지다. 단조는 T6-3 런타임 검증 축으로 넘긴다.
  - **실물 이벤트 검증** — 위 정합은 코드 대조(E2)다.
  - **폴링 경로에서의 순서 보존** · **첫 `sentence` 도착 시각** — 정본이 리바이2 검증 항목으로
    적어 둔 축들이고, 이번 PR 범위 밖이다.

## 🔴 회부 (오케 → 원장)

| # | 사안 | 등급 | 내용 |
|---|---|---|---|
| 1 | **`preliminary`/`sentence` 배타 여부가 정본에 없다** | E3 · 판정 청구 | 지금 스키마는 `kind` 에 맞는 객체를 **요구**하지만 반대쪽 객체가 함께 실려도 통과한다(`kind=preliminary` + `sentence` 동봉 = **accept** — 검증기 직접 호출로 실측 E1: 오류 0건 · 같은 호출로 정상 preliminary 도 0건이라 호출 자체는 살아 있다). 배타로 좁히는 것이 옳아 보이나 정본이 말하지 않은 축이라 **내가 판정선을 넓히거나 좁히지 않았다**. 좁히라 하면 if/then 2행으로 닫는다. |
| 2 | `seq` 단조 = 런타임 축 | E2 | 위 「안 잰 것」. 스키마 초록을 「순서가 보장된다」로 읽으면 안 된다. |
