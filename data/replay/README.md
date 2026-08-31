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

이벤트 스트림뿐이다. 이벤트 밖에 살던 run 부산물(`graphPaths` · 작업지시 초안 본문)은 녹화되지
않으므로 재생 run 에 없다. 그 사실을 빈 배열로 감추지 않고 서버가 **사유 코드로** 막는다 —
실측(T4-2a · ai-api build `47133a0` · 2026-08-31):

| 경로 | 서버 응답 | 사유 코드 |
|---|---|---|
| `GET /graph/paths?byRun=` | 501 | `replay_path_source_absent` (판정 J-G · 원장 Q-27) |
| `GET /work-orders/{woId}` (이벤트가 낸 `workOrderDraftId`) | **501** | **`replay_draft_source_absent`** |
| `GET /evidence/{evidenceId}` — `kind=graph-path` 5건 | **404** | `not_found` (계약 v0.1.1 이 여는 kind = `doc-chunk`·`record` 뿐 · 원장 Q-34) |

🔴 **정적 replay 경로도 이 세 자리를 «열지 않는다»**(T4-2a). 서버가 막은 것을 정적이 200 으로
열면 그것은 「엄격」이 아니라 「느슨」이고, 두 경로가 다른 화면을 그리는 순간 재생본은
「같은 흐름」이라는 약속을 잃는다.

---

## `static/` — 정적 replay 조회 사본 (T4-2a)

`gs-01.events.jsonl` 은 **실행 축**(타임라인·근거·후보·경과)을 전부 세우지만, 화면이 그 옆에서
먹는 **조회 축**(incident 표제·설비·센서 추세·근거 상세·문서 본문)은 담지 않는다. 노트북(ai-api)
OFF 에서도 GS-01 을 완주하려면 그 조회 응답들도 자산으로 있어야 한다 — 그것이 `static/` 이다.

### 🔴 2단 구조 — 왜 나누는가

AC 두 줄이 동시에 서야 한다: 「빌드 시 ai-api **무접촉**」과 「**손 복제 0**」. 한 단으로 합치면
둘 중 하나가 반드시 깨진다(빌드가 ai-api 를 부르거나, 사람이 응답을 손으로 옮기거나).

| 단 | 도구 | 언제 | ai-api |
|---|---|---|---|
| ① 굳히기 | `apps/web-console/scripts/harvest-static-replay.mjs` | 사람이 **1회** 실행 → 산출물 커밋 | **읽는다**(살아 있어야 함) |
| ② 빌드 복사 | `apps/web-console/scripts/copy-static-replay.mjs` (`prebuild`·`predev`) | 빌드마다 자동 | **무접촉** |

```
node scripts/harvest-static-replay.mjs --base http://127.0.0.1:8004 --dry-run   # 계획만
node scripts/harvest-static-replay.mjs --base http://127.0.0.1:8004             # 굳히기
```

### 무엇이 들어 있는가

- 조회 응답 **28건** — 계약 경로별 1파일. **응답 원문 그대로**(키 재정렬·필드 추림 0).
- `manifest.json` — ②의 **정본**: 굳힌 시각 · ai-api `build` sha · 앵커(incident·equipment·plant·sensor
  + `sensorSource`) · fixture sha256·건수 · 파일별 route/path/status/bytes/sha256 · **서버가 막은
  자리 6건**(위 표의 사유 그대로).

### 🔴 규율

- **원문 무가공** — 굳히기는 받은 본문을 그대로 적는다. 가공하면 그것은 「서버가 답한 것」이
  아니라 「도구가 만든 것」이고, 정적 화면이 Live 와 달라져도 대조로 잡히지 않는다.
- **재실행 diff 0** — 같은 스택에 두 번 돌리면 28건 sha256 이 전부 같다(실측). 휘발 필드는
  `manifest.harvestedAt` **하나뿐**이다.
  - 🔴 그러려고 **세션을 둘로 갈랐다**: `GET /incidents/{id}` 는 「그 세션이 돌린 run 의 id」를
    함께 주므로(계약 v0.1.6 소유권), 앵커를 묻는 세션과 조회하는 세션이 같으면 사본에 매번
    다른 `runId` 가 박힌다. 값을 지워서 맞추면 원문 가공이 되니, **묻는 조건**을 정적 방문자의
    실제 조건(서버 run 을 가진 적 없는 세션)으로 바꿨다.
- **sha 로 잠근다** — ②는 매니페스트와 원본이 갈리면 **빌드를 멈춘다**(exit 1 · 실측). 매니페스트에
  **없는** 파일이 폴더에 있어도 멈춘다(아무도 만든 적 없는 자산이 실려 가지 않게).
- **원본은 여기 하나** — ②의 산출물(`apps/web-console/lib/static-replay/generated/`)은 **커밋하지
  않는다**(gitignore). 두 벌이 되면 어느 쪽이 정본인지 갈린다.
- **공개 경계** — synthetic 데이터만 · 절대경로·secret 0(§16·§34.6). 굳히기는 응답 본문만 싣고
  요청 헤더·쿠키는 싣지 않는다.

### 어느 스택에서 굳히나

**현 트리 코드로 뜬 ai-api + seed 된 DB.** 옛 빌드나 빈 DB 에서 뽑으면 사본이 화면과 갈린다 —
굳히기는 `plants` 가 비면 「seed 된 DB 가 아니다」로 **멈춘다**(빈 결과는 통과가 아니다).
`manifest.apiBuildSha` 가 「어느 커밋이 답했나」를 들고 있으니, 그 값이 지금 트리와 갈리면
다시 굳혀야 한다는 뜻이다.
