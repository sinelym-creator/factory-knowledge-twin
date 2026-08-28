# contract test harness

동결된 계약(`packages/contracts/**`)을 **케이스 데이터로 대조**하는 테스트. 외부 의존 0 — `node`만 있으면 돈다.

## 실행

```bash
node tests/contract/run.js            # cases/*.cases.json 전건
node tests/contract/run.js --quiet    # 실패·요약만 (CI용)
```

옵션: `--cases <파일|디렉터리>` · `--schema <경로>`(케이스 파일의 `schema`를 덮어씀) · `--quiet`

**exit code**: `0` 전건 통과(자기 검증 포함) · `1` 1건이라도 실패 · `2` 실행 오류(경로·JSON 파싱 등).

## 케이스 추가

`cases/<이름>.cases.json` 을 만들면 러너가 자동으로 집는다.

```json
{
  "name": "표시용 이름",
  "schema": "packages/contracts/<대상>.schema.json",
  "envelopeDefaults": { "runId": "R1", "seq": 0, "ts": "2026-08-28T06:00:00Z", "mode": "live" },
  "cases": [
    { "group": "묶음", "label": "케이스 이름", "expect": "accept|reject",
      "why": "(선택) 왜 이 판정이어야 하는지",
      "event": { "type": "...", "payload": { } } }
  ]
}
```

`event`는 `envelopeDefaults` 위에 얹힌다(같은 키는 `event`가 이긴다). REST 응답 검증도 같은 러너에 얹을 수 있다 — 스키마와 케이스 파일만 추가하면 된다.

## 판정 규칙 (3줄)

1. **accept와 reject를 짝으로 둔다.** 통과 케이스만으로는 계약이 증명되지 않는다 — 「틀린 것이 실제로 거부되는가」가 계약의 정의다.
2. **계약이 정본이고 케이스가 종속이다.** 계약과 케이스가 어긋나면 먼저 계약을 읽는다. (실제로 `elapsedMs` 필수화 때 낡은 쪽은 케이스였다.)
3. **초록을 믿지 않는다.** 러너는 매 실행마다 «결속을 제거한 스키마»로 같은 케이스를 돌려 **실패가 나오는지** 확인한다. 실패가 0이면 러너가 아무것도 검사하지 않는다는 뜻이므로 그 자체를 FAIL로 처리한다.

## 자기 검증이 막는 것

계약 테스트의 최악은 «깨졌는데 초록»이다. 이 harness는 두 겹으로 막는다.

| 겹 | 장치 | 막는 실패 |
|---|---|---|
| ① | 결속 제거 스키마 mutation | 러너가 조건부 결속을 실제로는 안 보고 있는 경우 |
| ② | 미지원 키워드 스캔 | 계약이 검증기가 모르는 키워드를 쓰기 시작해 **조용히 통과**하는 경우 |

②는 실제로 한 건을 잡았다 — 계약의 `format: "date-time"`을 검증기가 무시하고 있었다. `format`은 JSON Schema 기본 규정상 주석이지만, **계약 테스트에서는 단언으로 다룬다**(선언해 두고 아무 문자열이나 통과시키면 계약이 아니다).

## 구성

| 경로 | 역할 |
|---|---|
| `run.js` | 러너 — 인자 파싱 · 케이스 실행 · 자기 검증 · exit code |
| `validator.js` | 최소 JSON Schema 검증기(계약이 쓰는 키워드만) + 미지원 키워드 스캐너 |
| `cases/*.cases.json` | 케이스 데이터 — 하드코딩 없음 |
| `archive/` | 폐기된 검사기(이력 보존 · **회귀 판정에 쓰지 말 것**) |
