# T7-44 검증 — run 문서 검색 hybrid 반영 (독립 검증 · 리바이2 53대)

- 무대 = **develop `:8020`**(컨테이너 `fkt-dev-ai-api` · 이미지 `fkt-ai-api:dev-492e0c4`) · 게이트웨이 `:8797`
- production(`:8010`·`:8787`·공개 도메인) **무접촉** · 구독 소비 **정확히 3발**(승인분 전량)
- 근거 등급 **E1** = 내 손 실측 · **E2** = 대상이 남긴 기록 · **E3** = 소견

## 0. 판정

| 판정선 | 내용 | 결과 |
|---|---|---|
| ① | `step.completed(vector).payload.strategy` 실물 | **PASS** (3/3 `hybrid`) |
| ② | 어휘 다리로만 잡힌 doc-chunk ≥1 인 run 존재 | 🔴 **FAIL** (차집합 **0** · 오히려 **−1**) |
| ③ | 지표 1·5·6·7 v0.4 대비 하락 0 | **헤드라인 PASS** · 하위 축 1건 하락 = 회부 |
| ④ | dup 0 · 게이트 16/16 · 걸러진 record 건수 대조 | **PASS** |

**종합 = 조건부.** ② 가 서지 않았다. 처방은 «실려서 돌고 있고»(①) «망가뜨리지 않았지만»(③④),
**이 티켓이 사려던 것(어휘 다리가 새 근거를 집는다)은 이 질문·이 n 에서 관측되지 않았다.**

## 1. 무대 — 처방이 실렸는가를 먼저 물었다

자극 전에 무대가 처방을 싣고 있는지부터 확인했다(전제가 죽은 창은 구독 3발을 통째로 버린다).

| 축 | 값 | 출처 |
|---|---|---|
| `/api/health.build` | **`492e0c4`** | 내 curl(E1) — 스크립트 자기 신고가 아니다 |
| `0a15522` 포함 여부 | `merge-base --is-ancestor` → **YES** | E1 |
| 러닝 컨테이너의 처방 | `workflow.py:148 strategy = get_settings().run_retrieval_strategy` · `_step(ctx,"vector",extra={"strategy": strategy})` · `hybrid_search` import | `docker exec` grep(E1) |
| 기본값 | `settings.py:125 run_retrieval_strategy: Literal["vector","hybrid"] = "hybrid"` | E1 |
| 임베딩 준비 | `models.embedding` `loading` → **`ready`**(`00:59:58`) 확인 뒤 발사 | E1 |

- `Literal["vector","hybrid"]` 이므로 **그 밖의 값 = 기동 거부**(계약 개정 ①)가 타입으로 강제된다.
- 🔴 `grep FKT_RUN_RETRIEVAL_STRATEGY /srv/app` 은 **0건**이다. 이것을 「미구현」으로 읽으면 틀린다 —
  설정 접두사 규약(`FKT_` + 필드명)이라 env 이름 문자열이 코드에 없을 뿐이다. **부재를 결함으로 옮기지 않았다.**

## 2. 순서 — 되돌릴 수 없는 자원을 쓰는 규율

1. **스키마 창 먼저**(PR ① `#806` 병합 `492e0c4`) — 이벤트가 스키마에 걸린 빨강을 「구현 결함」으로 오독하지 않기 위해.
2. **교정 게이트 16/16**(`--gate-only` · 구독 **0**) — `[gate] all 16 cells stand - scorer has detection power`.
   못 쓰는 채점기로 쏜 run 은 되돌릴 수 없다. 게이트가 서야만 발사한다.
3. **1발** → 판정선 ① 실물 확인 → **나머지 2발**. 채점은 발사와 분리(`--score-raw` · 발사 0).

## 3. 판정선 ① — strategy 실물 (E1)

| run | vector `step.completed`.strategy | `step.started` | 비-vector 단계의 strategy |
|---|---|---|---|
| RUN-d04619f3ce6b | **hybrid** | 키 없음(계약대로 무변) | 0건 |
| RUN-9a10a19e6d82 | **hybrid** | 키 없음 | 0건 |
| RUN-1244154d1c9e | **hybrid** | 키 없음 | 0건 |

계약 v0.2.0 개정 ③(선택 · vector 단계 전용 · `step.started` 무변)이 **실물에서 그대로 지켜진다**.

## 4. 판정선 ② — 🔴 FAIL

vector 단계가 낸 근거(`step.evidence` 중 `payload.step == "vector"`)의 **합집합**을 열로 세웠다.

| 열 | 측정 시각 | vector 단계 doc-chunk | 합집합 |
|---|---|---|---|
| **v0.4**(vector 기준선) | 2026-09-05T11:04Z | 5 · 5 · 5 | `DOC-MAN-0021@r1#001` `#005` `#006` · `DOC-MAN-0022@r1#003` · `DOC-MAN-0028@r1#000` |
| **v0.5-d85**(직전 pre-hybrid) | 2026-09-05T13:03Z | 5 · 5 · 5 | v0.4 와 **동일** |
| **v0.5**(hybrid · 이번) | 2026-09-05T16:0xZ | **4 · 4 · 4** | 위에서 `DOC-MAN-0021@r1#001` **빠짐** |

```
v0.5 − v0.4 = []            <- 판정선 ② 가 요구한 «새 청크» 0건
v0.4 − v0.5 = ['DOC-MAN-0021@r1#001']   <- 오히려 1건 잃었다
```

### 기전 — 대상이 자기 입으로 말한다

vector 단계 `summary` 문면(E2):

| 열 | summary |
|---|---|
| v0.4 · v0.5-d85 | `인용 후보 5건` |
| **v0.5** | **`인용 후보 4건(구조화 축 record 1건 제외)`** |

`hybrid.search` 는 **구조화(record) · 어휘 mention · 벡터** 세 랭킹을 RRF 로 합쳐 **`_fuse(rankings, top_k)`**,
즉 **TOP_K=5 를 세 축이 나눠 쓴다**(`retrieval/vector.py:18 TOP_K = 5`). 그중 1건이 `kind=record` 라
vector 단계의 근거집합(doc-chunk)에서 제외되고, **인용 가능한 청크가 5 → 4 로 준다**.
🔴 **어휘 축이 없는 게 아니라(`_MENTION_SQL` 은 있다), 그 축의 히트가 벡터 히트와 겹쳐
상위 5 안에 «새» 청크를 하나도 못 올린 것**이다 — 그러면서 슬롯 1칸은 record 가 가져갔다.

- 내 독립 계수(5 − 4 = 1)와 대상의 자기 신고(`record 1건 제외`)가 **일치**한다 → 판정선 ④ 의 대조 항목도 여기서 선다.

## 5. 판정선 ③ — 지표 대비 · 🔴 v0.4 만 보면 hybrid 를 과대평가한다

| 지표 | v0.4 | v0.5-d85 | v0.5(hybrid) | 읽기 |
|---|---|---|---|---|
| 1 `m1.narrowAllHit/wideAllHit` | false | false | false | 하락 0 |
| 1 `m1.perId['SOP-BRG-INSP-014']` | T·T·T | T·T·T | **F**·T·T | 🔴 1 run 하락 |
| 5 `m5_unsupported` | 0·0·0 | 0·0·0 | 0·0·0 | 하락 0 |
| 6 `m6.byId / byAlias` | 0/0 | 0/0 | 0/0(`idHit`·`aliasHit` 참) | 하락 0 |
| 7 `m7.requiredHit` | **0·0·0** | 2·2·1 | 2·1·1 | v0.4 대비 상승 |
| 근거 수 `runEvidenceCount` | 19 | 23 | 22 | — |
| dup `runEvidenceDuplicates` | (필드 없음) | 0·0·0 | **0·0·0** | 판정선 ④ |

🔴 **지표 7 의 「상승」을 hybrid 의 공으로 적으면 거짓이다.** `requiredHit` 는 **v0.5-d85(hybrid «이전»)에서 이미
2·2·1** 이다 — 그 이득은 D-85 가 만든 것이고, hybrid 는 거기서 **2·2·1 → 2·1·1** 로 오히려 한 칸 내려왔다.
발주의 대조군은 v0.4 하나였지만, **v0.4 는 D-85 «이전»의 시대**라 hybrid 단독 효과를 못 가른다.
그래서 열을 **셋**으로 세웠다. 「하락 0」은 v0.4 기준에서 참이고, **직전 상태(d85) 기준에서는 지표 7 과
근거 수(23→22)가 각각 한 칸씩 내려간다.**

- `m1.perId` 1 run 하락과 `m7` 한 칸 하락은 **n=3 흔들림과 구분되지 않는다**(§7 못 잰 것).

## 6. 판정선 ④ — PASS

- `runEvidenceDuplicates` = **0·0·0**(E1).
- 교정 게이트 **16/16**(발사 전 · 채점 시 각각 재실행 · 모두 통과).
- 걸러진 record 건수: 대상 신고 **1건** == 내 독립 계수 **1건**(5−4) · 3 run 전부 일치.
- 근거 개수 실물 = **22**(v0.4 19 · d85 23).
- `runsUsable` 3/3 · `excluded` 0 · 채점기 교정 대조 `baselineStable=true`(21 축) — **v0.4·d85 두 기준선 «양쪽»에서**.

## 7. 못 잰 것 (값이 아니라 이름으로)

1. **검색 품질 향상량** — 주장하지 않는다. n=3 · 질문 1건(`Q-MULTIHOP-001`)이다.
2. **`vector` 설정 live 대조군** — 구독 밖(총 4발). 대신 v0.4·d85 두 raw 로 대체했고,
   그래서 「같은 무대·같은 시각의 vector 열」은 **없다**. 위 차집합은 «다른 시각의 vector 열»과의 비교다.
3. **하락 후보의 성격** — `m1.perId` 1건·`m7` 1칸이 **처방 탓인지 n=3 흔들림인지 가르지 못했다.**
   가르려면 같은 무대에서 `FKT_RUN_RETRIEVAL_STRATEGY=vector` 로 n=3 을 더 쏴야 하고 그것은 승인 밖이다.
4. **폴백/오설정 갈래** — `Literal` 타입이 기동 거부를 강제하는 것은 **코드로 확인**했을 뿐,
   잘못된 값으로 실제 기동을 시도해 보지는 않았다(무대를 죽이는 자극이라 승인 밖).

## 8. 자수 (내 계측기)

1. 🔴 vector 단계 근거를 처음 셀 때 `payload.evidence` 를 **리스트로 가정**해 파싱했고, 세 열이 모두
   `doc-chunk 0건` 으로 나왔다. 실제 형상은 **단일 객체**다. 「0 끼리의 일치」를 판정으로 옮겼다면
   **차집합 0 이라는 결론은 같지만 그 근거가 통째로 거짓**이었다 — 빈 결과끼리의 일치는 일치가 아니다.
   형상을 실물 1건으로 확인한 뒤 다시 셌고, 그 값이 위 표다.
2. 이벤트를 「step.started(vector)~step.completed(vector) 창」으로 잡았는데, `step.evidence` 는
   **payload 에 자기 `step` 을 들고 있다**. 창 대신 그 필드로 거르는 것이 옳다(다시 짤 때 고쳤다).
3. 콘솔 출력이 cp949 를 못 넘어 한 번 죽었다(`UnicodeEncodeError`) — 대상과 무관한 내 손 실패.
   이후 측정은 파일로 떨어뜨려 읽었다.
