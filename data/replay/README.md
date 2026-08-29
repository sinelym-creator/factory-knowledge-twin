# `data/replay` — replay fixture (조사 실행 녹화본)

> T2-4 산출물. 오케 판정 J-A(08-30): 「fixture 는 앱 코드가 아니라 synthetic 데이터 자산」.

## 🔴 이것은 seed 원천이 **아니다**

| | `data/generated`·`data/documents` | **`data/replay` (여기)** |
|---|---|---|
| 무엇인가 | 공장 SSOT 로 **적재되는** synthetic 원천 | 조사 실행이 **낸** 이벤트 스트림의 녹화본 |
| 소비자 | seed 파이프라인 → Postgres·Neo4j | ai-api 의 `mode:"replay"` 재생 경로 |
| 무결성 그물 | seed 멱등·정합 검사(`tests/data/`) | 스키마·seq 단조·공개 경계 심사 |
| 바뀌면 | SSOT 내용이 바뀐다 | 재생본이 바뀐다 (**SSOT 는 그대로**) |

이 파일들은 **DB 에 적재되지 않는다**. seed 무결성 검사의 대상도 아니다 — 두 축을 섞어
읽으면 「seed 가 바뀌었다」와 「녹화본이 바뀌었다」를 구분하지 못한다.

## 무엇이 들어 있는가

- `gs-01.events.jsonl` — GS-01 live 조사 1회의 agent-events 전열. **한 줄 = 한 이벤트**,
  `seq` 0부터 파일 줄 순서와 1:1.
- 형상 정본 = `packages/contracts/agent-events-v0.1.schema.json`.

## 🔴 녹화본은 가공하지 않는다

실행이 낸 봉투 그대로다 — `ts`·`seq` 를 다시 매기지 않고, 정렬하지 않고, 손으로 고치지
않는다. 그래서 파일 안의 `mode` 는 **`"live"`** 이고 `runId` 는 **녹화 당시의 것**이다.
재생 시 그 두 필드만 규정값으로 치환된다(`mode:"replay"` · 그 재생 run 의 id).
나머지(`seq`·`ts`·`type`·`payload`)는 손대지 않는다 — `ts` 를 「지금」으로 바꾸면
재생본이 새 조사인 척하는 것이 된다.

`payload` 안의 `GP-<녹화 runId>-NN` 형태 evidenceId 도 그대로 남는다. 그것은 「그 경로
근거의 이름」이지 현재 run 의 이름이 아니다(판정 J-H).

## 다시 만들려면 / 검사하려면

```
cd services/ai-api
python -m tools.record_replay_fixture --dry-run    # 실행·심사만
python -m tools.record_replay_fixture --force      # 갈아치우기(조용한 덮어쓰기는 막혀 있다)
python -m tools.audit_replay_fixture --self-test   # 공개 경계 심사 + 대조군
```

녹화는 **실제 조사 1회를 돌린다** — Postgres·Neo4j 가 필요하다. 저장 전에 선정 규칙
(완주 · 5단계 전부 · 근거 단계별 ≥1 · 실패 0)과 공개 경계 심사를 통과해야 한다.

## 이 fixture 가 담지 **않는** 것

이벤트 스트림뿐이다. 이벤트 밖에 살던 run 부산물(`graphPaths` · 작업지시 초안 본문)은
녹화되지 않으므로 재생 run 에 없다. 그 사실을 빈 배열로 감추지 않고
`GET /graph/paths?byRun=` 이 `replay_path_source_absent` 로 막는다(판정 J-G · 원장 Q-27).
