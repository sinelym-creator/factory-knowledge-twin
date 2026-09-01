# T2-1 독립 검증 — retrieval 3전략(vector·hybrid·graphrag)

> 리바이2 7대 · 2026-08-30 · 근거 등급 **E1(실측)**
>
> **판정: PASS** — 검증 대상 = develop `9621a24`(PR#106 정정 착지분).
> 1차 검증(`4bc3290`)에서 결함 **3건**(V-1·V-2·V-3)과 파생 결함 1건(V-4)을 적발해 **불합격**을 냈고,
> 정정 착지 후 **같은 그물의 빨강이 초록으로 바뀌는 것**을 실측해 뒤집었다.

## 0. 판정 범위 — 이 PASS 가 «무엇을» 말하는가

🔴 「합격」이 자기보다 넓게 읽히지 않도록 경계를 먼저 적는다.

| 이 판정이 덮는 것 | 이 판정이 덮지 «않는» 것 |
|---|---|
| T2-1 AC 8항 + 검증 축 8종 + 15종 회귀 | `GET /evidence`·`/documents` 소비 축 — 여전히 501(T2-2) |
| 정본 10문 × 3전략 실행 실물 | 검색 «품질»(정확도·재현율) — D3 평가 티켓의 몫 |
| 표기 변형에 대한 불변성 | 목록 밖 자유 질문 — allowlist 가 400 으로 막는다(설계) |
| 런타임 의존 단절 시 계약 형상 | 부하·동시성 한계 — 측정 안 했다 |

## 1. 측정 조건

| 축 | 값 |
|---|---|
| 1차 대상 | `4bc3290`(PR#100) · 재검 대상 | `9621a24`(PR#106 · 6파일) |
| 스택 | `fkt-levi2` — pg `5534` · neo4j `7587` · 색인 `intfloat/multilingual-e5-small` / 384d / chunk **59** |
| 재빌드 | 🔴 재검 전 포트 8000 점유 **PID 실측 후 종료** 뒤 재기동. 낡은 코드 위의 초록을 만들지 않는다 |
| 질문 입력 | 🔴 **정본에서 내가 따로 뽑았다**(`benchmarks/datasets/eval-questions-draft.md` §2) — 구현의 allowlist 를 입력으로 쓰면 「같은 목록끼리 맞다」만 확인하게 된다 |
| 기준선 | `evidence/t2-baseline-prescription-free.md`(PR#101 · 처방 «전» 16축) |

## 2. 적발한 결함과 그 전환 실증

### V-1 — 한글 조사가 붙으면 앵커가 «잘린 다른 ID»로 조회된다

**기전.** `anchors._ID_RE` 의 끝 `\b` 가 한글 앞에서 성립하지 않는다(한글도 `\w`). 정규식이
역추적해 **앞부분만** 매칭한다.

| 입력 | 정정 전 | 정정 후 |
|---|---|---|
| `EQ-CNC-204의` | 🔴 `EQ-CNC` | `EQ-CNC-204` |
| `AL-20260826-0041이` | 🔴 `AL-20260826` | `AL-20260826-0041` |
| `WO-2026-0113을` | 🔴 `WO-2026` | `WO-2026-0113` |
| `SOP-BRG-INSP-014에` | 🔴 `SOP-BRG-INSP` | `SOP-BRG-INSP-014` |

**빈 결과가 아니라 «틀린 결과»다.** 존재하지 않는 ID 로 조회가 «성공»한다 — graphrag 는
`200 OK` + `hits: []`, hybrid 는 구조화 축만 조용히 사라진다. 오류 0 · 로그 0.

**계수(정정 전).** 정본 10문 중 **8문**이 갈렸다.

```
Q-SAFETY-002  정본표기 graphrag → [SOP-BRG-INSP-014, FM-BRG-WEAR, SAF-LOTO-01, CP-101-BRG-01, MR-2024-0004]
              평문표기 graphrag → []
```

🔴 **왜 「범위 밖 입력」이 아닌가.** 구현 스스로 `allowlist.normalize()` 주석에 「화면이 그것을
평문으로 보내는 것은 «다른 질문»이 아니라 «같은 질문의 다른 표기»다」라고 성문했고, 실제로 두
표기를 **같은 문항 ID 로 승인**한다. 같은 질문이라고 승인해 놓고 다른 답을 내며, 그중 하나는
**안전 규정을 통째로 잃는다** — 평가 규약이 「경로가 맞아도 즉시 FAIL」이라 못박은 그 누락이다.

### V-4 — 임베딩 입력이 «원문»이라 마크업 차이가 인용을 바꾼다 (V-1 과 겹쳐 있던 별개 원인)

정정 «전» 교차표가 원인을 둘로 갈랐다.

| 변형 | vector | hybrid | graphrag |
|---|---:|---:|---:|
| `plain`(백틱+강조 제거) | 7 | 9 | **7** |
| `nobold`(강조만 제거) | 3 | 3 | **0** |

`nobold` 는 백틱이 남아 **앵커가 온전하다** — 그래서 graphrag 는 0/10 으로 안 갈린다. 그런데
vector·hybrid 는 갈린다. 결정타는 `Q-SAFETY-001` 이다: ID 뒤가 공백이라 조사 인접이 없고 앵커도
동일한데 **vector·hybrid 만 순위가 바뀐다**.

기전: `service.compare` 가 `resolve()` 로 「같은 질문」임을 확인한 뒤, 검색에는 정규화된 문구가
아니라 `body.question` **원문**을 넘겼다 → `embed_query(원문)` 이라 백틱 하나가 벡터를 바꾼다.

🔴 이것을 «정정 전»에 갈라 두지 않았으면, V-1 처방만으로 `nobold` 열이 red 로 남았을 때
「그물이 과하다」로 흐를 자리가 생겼다.

### V-2 — 런타임 의존 단절이 계약 오류 형상을 벗어난다

계약(`packages/contracts/rest-api-v0.1.md:11`): 「전 응답 JSON · 오류 = `{error:{code,message}}`」.

| | 정정 전 | 정정 후 |
|---|---|---|
| neo4j 정지 중 `POST /retrieval/compare` | 🔴 `500` · `text/plain` · `"Internal Server Error"` | `503` · `application/json` · `{"error":{"code":"dependency_unavailable", …}}` |

원인은 `install_error_handlers` 가 `StarletteHTTPException`·`RequestValidationError` 만 덮은 것.
드라이버 예외가 핸들러 **밖**으로 나갔다.

🔴 **T2-1 이 만든 자리다.** T1-8 골격은 라우트가 즉시 501 을 던져 런타임에 외부 IO 를 만지지
않았고, 그래서 이 경로가 존재하지 않았다.

### V-3 (경미) — 낡음을 잡는 도구가 같은 병에 뚫려 있었다

`tools/verify_allowlist.py` 의 `_HEADING = ^###\s+(Q-[A-Z]+-\d+)` 에 뒤쪽 경계가 없어, 정본 제목이
`### Q-SAFETY-002x` 로 개정돼도 `Q-SAFETY-002` 로 읽혀 **낡음이 감지되지 않았다**. V-1 과 같은 부류다.

## 3. 재검 — 같은 그물의 빨강이 초록으로

🔴 **처방 후에만 초록을 보면 회귀 판정이 아니다.** 대조 기준은 정정 «전» 같은 그물의 빨강이다.

| 그물 | 정정 전 | 정정 후 |
|---|---|---|
| `tests/api/anchor_boundary_drill.py` | **exit 1** · 갈림 **29건** (`plain` 23 · `nobold` 6) | **exit 0** · 갈림 **0건** · 생존 신호 hits 145 |
| ↳ 코퍼스 축 | 조사 인접 문항 **8/8** 갈림 | **0/8** |
| ↳ `nobold` 열 (V-4 판정) | **6건** 갈림 | **0건** → 🔴 **V-4 닫힘** |
| `tests/api/anchor_extraction_probe.py` | (신설) | **16/16** · 자기 검증: 정정 전 정규식을 8건에서 잡는다 |
| `tests/api/error_shape_drill.py --cut-neo4j` | 500 `text/plain` | **8/8 계약 형상** · `E-07` 503 `dependency_unavailable` · `E-0` 되감기 PASS |
| `tools.verify_allowlist` (V-3) | 제목 개정 **미감지** | 주입 5종 전건 기대대로 — B-01 접미 부착 · B-02 숫자 연장 감지 · **B-03 제목 뒤 주석 변경은 통과**(오탐 대조군) |

정정 후 응답 원문(E1):

```
HTTP/1.1 503 Service Unavailable
content-type: application/json
{"error":{"code":"dependency_unavailable","message":"neo4j 에 연결할 수 없다 — 잠시 후 다시 시도하라"}}
```

내부 경로·traceback·드라이버 문구 **비노출** 확인(공개 경계 §34.6).

## 4. 검증 축 8종 — 각각 «대조군»과 함께

### 축⑤ 전략 독립 — 폴백 없음

의존을 끊어야만 갈린다. neo4j 를 정지시키고 잰다(볼륨 무접촉 · 원복 실측 포함).

| 검사 | 실측 | 판정 |
|---|---|---|
| D-00 기준선 | graphrag = `[CP-204-BRG-01, FM-BRG-WEAR, MR-2024-0004, SOP-BRG-INSP-014, SAF-LOTO-01]` | — |
| D-02 정지 · 3전략 요청 | 🔴 **다른 전략 결과로 채우지 않는다** | PASS |
| D-03 정지 · graphrag 단독 | 오류(정정 후 503) | PASS |
| D-04 정지 · vector+hybrid | **200** — 두 전략 독립 생존 | PASS |
| D-0 되감기 | 재기동 후 graphrag 결과가 D-00 과 **동일** | PASS |

🔴 「세 전략이 서로 다른 결과를 낸다」는 독립의 증거가 아니다. 의존을 끊었을 때 그 칸이
«비거나 오류가 되는가»만이 폴백 유무를 가른다.

### 축⑥ 사용자 입력 → SQL·Cypher 문자열 조립 0

정적 전수 + 주입 10케이스. 「없다」가 아니라 「내 패턴에 안 걸렸다」일 수 있으므로 실제로 넣어 봤다.

| 케이스 | 결과 |
|---|---|
| `sessionId` = `a' OR '1'='1` | 422 `invalid_session_id` |
| 질문 = `'; DROP TABLE document_chunk; --` | 400 `question_not_approved` |
| 질문 = `EQ-CNC-204'}) DETACH DELETE n //` | 400 `question_not_approved` |
| 승인 질문 + `UNION SELECT 1` 덧붙임 | 400 `question_not_approved` |
| 계약 밖 전략명 · 빈 목록 | 422 `invalid_request` |

조립 지점 전수 확인: `{table}`·`{child}`·`{fk}`·`{order}` 는 모두 모듈 화이트리스트 상수이고
값(`anchor`)은 `$1` 바인딩이다. Cypher 도 상수 1벌 + 파라미터.

🔴 **소견: 이 티켓에서 주입을 막는 것은 파라미터 바인딩이 아니라 «allowlist» 다.** 승인 목록
밖 질문이 전부 400 이라 페이로드가 질의에 닿을 일이 없다. 즉 **allowlist 는 보안 경계이고,
`verify_allowlist` 의 낡음 감지는 회계가 아니라 보안 통제다.** 목록이 느슨해지면 방어선이
파라미터 바인딩 한 겹만 남는다 — V-3 이 경미해 보여도 이 축에서는 가볍지 않다.

### 축⑦ blocking 0

| 부하 대상 (증가 = 유휴 기준선 대비) | p50 | p95 | 최대 |
|---|---:|---:|---:|
| compare · 3전략 (11 req/s) | **-4.82 ms** | +2.53 ms | +30.01 ms |
| compare · `graphrag` 만 · 임베딩 없음 (298 req/s) | +2.91 ms | +9.99 ms | +54.26 ms |
| 대조군 — `time.sleep(0.05)` | **+1,216.10 ms** | +1,217.93 ms | +1,217.61 ms |

동기 블로킹의 서명은 **중앙값 이동**인데 실제 경로에 없다. 꼬리(30~54 ms)는 임베딩이 **아예 없는**
축에서 더 크므로 부하 자체의 것이지 루프 점유가 아니다. 대조군이 300배로 반응하므로 이 측정은 살아 있다.

🔴 대조군 라우트 `/api/__blocking_demo` 가 «출하 표면»에 있는지 따로 확인했다 — 실행 중 서버
404 · `openapi.json` 21경로 · demo 경로 0건. 측정 도구가 자기 앱에만 붙인다(공개 경계 무접촉).

### 축⑧ Claude 호출 0 · 임베딩 «같은 공간»

- retrieval 패키지 정적 탐색: `anthropic|claude|openai|langchain|httpx|requests|urllib|aiohttp|api_key` **0건**(주석 제외).
- 동기 드라이버·`time.sleep`·`subprocess` **0건**.
- 가드 대조군: 차원 768·512·383 주입 전건 `EmbeddingMismatch` · 준비 전 `embed_query` 차단 ·
  색인 정본(`indexer/build_index.py`)과 모델 일치 + 접두 비대칭(`passage: ` vs `query: `) 확인.

### 축④ 불변식 목록이 함께 자라는가

`verify_allowlist` 감지력을 주입으로 쟀다 — 🔴 **모든 주입에 «변경 확인»을 박았다**(치환이
아무것도 안 바꾸면 던진다).

| 주입 | exit | 판정 |
|---|---:|---|
| 무변조 기준선 | 0 | PASS |
| 정본 문구 변조 | 1 | PASS |
| 문항 ID 변경 | 1 | PASS |
| 추출 0건(형식 파괴) | 1 | PASS — 「0건 통과」를 만들지 않는다 |
| 정본에 신규 문항 추가 | 1 | PASS |
| 정본 문항 1건 제거 | 1 | PASS |
| 제목 접미 부착 · 숫자 연장 (V-3 재검) | 1 | PASS |
| 제목 뒤 «주석»만 변경 | 0 | PASS — 오탐 대조군 |

`python -m tools.contract_surface` → **계약 표면 전건 일치 · 계약 밖 0**.
셸측 `surface_scan` 22파일 · 계약 밖 0, `contract_surface_drill` 주입 17 · 갈림 4 — 기준선과 동일.

### 축① 색인 신선도 — 「낡으면 우는가」

판정선은 오케 재규정분(Q-20): compare 응답의 침묵은 계약상 참이고,
**「낡음 주입 시 «어느 층도» 안 운다」가 FAIL** 이다. 검사 1건 = 트랜잭션 1개(`BEGIN…ROLLBACK`).

| 검사 | 주입 | 실측 | 판정 |
|---|---|---|---|
| F-B | — | FRESH 45 · STALE 0 · SKIPPED 15 | 기준선 |
| F-01 | 원문 `content_sha256` 변조 | STALE **1** · `stale_reason=SOURCE_SHA` | PASS |
| F-03 | `ontology_registry` 버전 어긋남 | STALE **45** · `stale_reason=ONTOLOGY_VERSION` | PASS |
| F-04 | 거울(레지스트리) 공란 | `ONTOLOGY_UNVERIFIED` **45** | PASS |
| F-0 | 되감기 | 45 / 0 / 15 · 레지스트리 1행 원복 | PASS |

🔴 F-03 은 **한 번 실패했다** — `'9.9.9+deadbeef'` 가 CHECK 제약(`^\d+\.\d+\.\d+$`)에 걸려
주입 자체가 들어가지 않았다. 「주입이 안 들어간 초록」을 PASS 로 적지 않고 형식을 고쳐 재주입했다.

**AC 소견(신선도 ↔ retrieval 결합 여부)** — F-02: 낡음을 주입한 그 revision 의 chunk **8건**이
인용 후보에 **그대로 남는다**. 검색 경로는 신선도와 **결합되어 있지 않다**. 계약이 compare 응답에
그 필드를 두지 않았으므로 침묵 자체는 계약상 참이고(F-4), 울 자리는 `v_index_freshness`(위 F-01·F-03)와
T2-2 의 배지 표면이다. **오케 판정(08-30)**: 「검색은 있는 색인을 정직하게 검색 · 낡음은 배지로 보이게」 —
AC⑦ 의 답 = **결합 없음**으로 성문.

### 축③ 501 해제 구간 정직성

- 셸의 `/compare` 는 `Placeholder` 다 — compare 백엔드에 대해 **아무 주장도 하지 않는다**.
  T2-1 이 셸의 정직성을 흔들지 않았다.
- `lib/contract.ts` 의 `call()` 은 **상태 코드**를 본다(`501 → 미구현(501)` · `!ok → HTTP {status}`),
  「값 부재」를 보지 않는다. 501→200 전환 시 미연결 표시는 자동으로 사라진다.
- `POST /sessions` 는 여전히 501 → 세션 칩 pending 이 계속 참(Q-18: Phase 3 결속).
- 🔴 **소견②**: V-2 정정이 만든 503 이 셸에서는 `unavailable`(미연결)로 접힌다 — 「연결이 안 됐다」와
  「연결됐는데 의존이 죽었다」가 화면에서 같아진다. T2-2 배지 설계에 회부(오케 예약분).

### 축② §3:244 딥링크 — 이번 Phase 에 열지 않는다

오케 판정(08-30)대로 Q-16 은 Phase 3 결속이다. 설계가 오기 «전»에 세운 그물은 내 가정을 정본으로
둔갑시킨다(6대 실증). 이번 대에 한 것은 「미구현이 정직한가」 1행뿐이다.

## 5. 15종 회귀 — 전건 green · 기준선과 전건 동일 (정정 전·후 2회)

`probes 6/6` · `seed-integrity 28/28` · `net-liveness 13/13` · `transition-net 27/27` ·
`eval-chunk 15/15` · `selfcheck 주입11/감지11` · `binding-scope 20/20` · `contract 34/34(커버리지 37/37)` ·
`graph_verify 18/18` · `R-01 지문 57E36748…(동일)` · `graph_drill 22/22` · `e2e 37 passed` ·
`surface_scan 22파일/계약 밖 0` · `contract_surface_drill 17주입/갈림4` · `token_layer_probe 4종` ·
`route_matrix 6라우트`.

🔴 neo4j 를 3회 정지·재기동한 뒤에도 재투영 덤프 지문이 기준선과 **같다**(`57E36748…`) —
드릴이 그래프에 아무것도 남기지 않았다는 실측이다.

## 6. AC 대조

| AC | 실측 | 판정 |
|---|---|---|
| ① 계약 표면 대조 green · 계약 밖 0 | `contract_surface` PASS · openapi 21경로 | 충족 |
| ② 3전략 독립 실행 · 폴백 금지 | 축⑤ 대조군 전건 | 충족 |
| ③ 동일 질문 3전략 실물 + 인용 좌표 | 아래 §7 | 충족(오케 해석 ⓑ) |
| ④ SQL·Cypher 문자열 조립 0 | 축⑥ | 충족 |
| ⑤ Claude·외부 LLM 호출 0 | 축⑧ | 충족 |
| ⑥ blocking 0 | 축⑦ | 충족 |
| ⑦ 신선도 ↔ 읽기 경로 결합 실측 소견 | 축① F-02 → «결합 없음» | 충족 |
| ⑧ Q-5 판정 입력 | 오케 08-30 조건부 종결 | 해당분 종결 |

**AC③ 해석 판정(오케 08-30)**: 「GS-01 «계열 전체»가 덮으면 충족」 — 대본이 단계별 질문 구조이고,
S7 인용(`SOP-BRG-INSP-014`)은 `Q-SAFETY-001` 에서 vector·hybrid 1~2위로 실재하며(E1),
`Q-MULTIHOP-001` 에서는 graphrag 종단으로 실재한다. `top_k=5` 설계값이 한 질문 안에서 두 축을
동시에 덮지 못하게 하는 한계는 **D3 평가 티켓에서 재론**한다.

## 7. 실행 실물 — 정본 10문 × 3전략 (정정 후 · E1)

10문 전건 `200` · vector/hybrid 각 5건. graphrag 는 9문 5건 · `Q-UNANS-002` **0건**
(`EQ-CNC-999` = 실재하지 않는 설비 — 빈 결과가 정답이며 폴백으로 채우지 않는다).

GS-01(`Q-MULTIHOP-001`) graphrag 경로 실물:

```
CP-204-BRG-01     2-hop  AL-20260826-0041 -[ON_EQUIPMENT]- EQ-CNC-204 -[HAS_COMPONENT]- CP-204-BRG-01
FM-BRG-WEAR       2-hop  AL-20260826-0041 -[TRIGGERS]- SN-204-VIB -[INDICATED_BY]- FM-BRG-WEAR
MR-2024-0004      2-hop  AL-20260826-0041 -[ON_EQUIPMENT]- EQ-CNC-204 -[ON_EQUIPMENT]- MR-2024-0004
SOP-BRG-INSP-014  3-hop  … -[ESCALATES_TO]- INC-2026-014 -[RESOLVED_BY]- WO-2026-0113 -[REFERENCES]- SOP-BRG-INSP-014
SAF-LOTO-01       4-hop  … -[REFERENCES]- SOP-BRG-INSP-014 -[REQUIRES]- SAF-LOTO-01
```

평가셋이 「누락 시 즉시 FAIL」로 지목한 `SAF-LOTO-01` 이 실재한다.

## 8. 🔴 이번 대가 스스로 물린 자리 — 그물이 초록인데 대상이 죽어 있었다

재검 도중 **전 문항 graphrag 가 0건**인 측정을 한 번 얻었다. neo4j 를 재기동한 직후, 아직 질의를
받지 못하는 창에서 잰 것이다. 그런데 `anchor_boundary_drill` 은 그때도 **초록**이었다 —
표기 변형끼리 «전부 빈 결과»로 일치했기 때문이다.

🔴 **빈 결과끼리의 일치는 일치가 아니다.** 하마터면 「정정이 graphrag 를 죽였다」는 거짓 회귀를
보고할 뻔했고(독립 재현으로 걸렀다 — 3대 계보), 반대로 그 초록을 그대로 믿었다면 **아무것도
재지 않은 초록**을 합격 근거로 올릴 뻔했다.

처방: 드릴에 **생존 신호**를 박았다 — 기준 표기의 vector hits 가 0이면 `exit 2`(측정 불가)로 죽고,
총 hits 수를 결과에 함께 출력한다. 재검 최종 측정의 생존 신호는 **145건**이다.

## 9. 신설 검증 자산 3종 (`tests/api/`)

| 자산 | 재는 것 | 자기 검증 |
|---|---|---|
| `anchor_boundary_drill.py` | 승인된 «같은 질문»의 표기 변형이 같은 hits 를 내는가 | 서로 다른 두 승인 질문이 실제로 다르게 보이는가 + 생존 신호 |
| `anchor_extraction_probe.py` | 앵커 경계 불변식(ID 뒤에 무엇이 붙어도 잘리지 않는가) | 🔴 정정 «전» 정규식을 다시 만들어 자기 표에 건다 — 옛 결함을 못 잡는 표는 약한 표다 |
| `error_shape_drill.py` | 오류가 «언제나» 계약 형상인가 (`--cut-neo4j` 로 런타임 단절 포함) | 계약 이탈 표본 3종을 실제로 걸러내는가 |

🔴 **두 앵커 자산이 따로 있는 이유**: 정정 ⓑ(`allowlist.canonical`)가 표기를 상류에서 모으므로,
HTTP 그물의 초록은 이제 「경계가 옳다」가 아니라 **「표기가 모인다」**를 뜻한다. 누군가 ⓐ(경계 정규식)를
되돌려도 그 그물은 초록으로 남는다. 그래서 ⓐ 를 직접 재는 probe 를 따로 세웠다(자세한 것은
`tests/api/README.md`).

---
**측정자**: 리바이2 7대(검증 좌석) · **write scope**: `benchmarks/`·`tests/`·`evidence/`
**미접촉**: SSOT(checkpoint·PROGRESS·INDEX·docs) · 구현 코드 · 계약 · 시스템 정책
