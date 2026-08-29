# T2-2 독립 검증 — 읽기 3라우트(`/evidence`·`/documents`·`/scenarios`)

> 리바이2 8대 · 2026-08-30 · 근거 등급 **E1(실측)**
>
> **1차 판정: 불합격** — 검증 대상 = develop `9e5b324`(T2-2 구현 = PR#107 착지분).
> 왕복 본체·시나리오 관문·신뢰 배지는 초록이나, **대조군에서 결함 2건**(V-6 · V-7)이 나왔다.
> 둘 다 「없는 것을 없다고 말하지 않는」 같은 계열이며, 둘 다 **구현 자신의 성문과 어긋난다**.

## 0. 판정 범위 — 이 판정이 «무엇을» 말하는가

🔴 판정이 자기보다 넓게 읽히지 않도록 경계를 먼저 적는다.

| 이 판정이 덮는 것 | 이 판정이 덮지 «않는» 것 |
|---|---|
| 계약 v0.1.1 append 3라우트의 응답 형상·왕복 정합 | 검색 «품질»(정확도·재현율) — D3 평가 티켓의 몫 |
| compare 실물 evidenceId 38건의 왕복 전수 | kind `graph-path`·`sensor-series` — T2-2 범위 밖(계약 v0.1.1) |
| 색인 낡음의 배지 전이(주입 전후 2점) | 화면(web-console) 렌더링 — `stale` 소비 코드가 아직 없다 |
| 런타임 의존 단절 시의 오류 «코드» | 부하·동시성 한계 — 측정 안 했다 |
| allowlist 관문의 보안 통제 성립 | 세션 격리 — T2-1이 「주장하지 않는다」고 성문했고 여기서도 안 잰다 |

## 1. 측정 조건

| 축 | 값 |
|---|---|
| 대상 | develop `9e5b324` · uvicorn 이 **소스를 직접 load** 하는 구성(빌드 산출물 없음) |
| 스택 | `fkt-levi2` — pg `5534` · neo4j `7574/7587` · 색인 `intfloat/multilingual-e5-small` / 384d |
| 재기동 | 🔴 교대로 내려가 있던 8000 을 **재기동한 뒤** 측정했다. 낡은 코드 위의 초록을 만들지 않는다 |
| 질문 입력 | 🔴 **정본에서 내가 따로 뽑았다**(`benchmarks/datasets/eval-questions-draft.md` §2 · 매 실행 재추출) |
| 상태 목록 | 🔴 배지 상태표의 정본은 **뷰**(`db/migrations/007_…sql`)다 — 구현 상수를 베끼지 않는다 |
| 회귀 기준선 | T2-1 자산 3종(`evidence/t2-1-retrieval-verification.md`) |

## 2. 적발한 결함

### V-6 — 실재하지 않는 chunk 좌표를 «조용한 200» 으로 삼킨다

**무엇이 어긋났나.** 구현이 스스로 적은 문장이 판정 근거다
(`app/reading/documents.py` 머리말):

> 🔴 `highlight` 의 chunk 가 이 문서의 것이 아니면 강조를 «조용히 버리지» 않는다 — 400 으로
> 거절한다. 버리면 화면은 강조를 요청했는데 강조 없는 문서를 받고, 왜 없는지 알 수 없다.

가드는 chunk ID 의 **문자열 접두(docId)만** 본다. 그 chunk 가 «있는지»는 보지 않는다.

| 요청 | 응답 | 무엇이 조용한가 |
|---|---|---|
| `/documents/DOC-SOP-0014?highlight=DOC-SOP-0014@r1#001` | `200` · `revisionId=…@r1` · `highlight:null` · `stale:true` | r1 은 chunk **0건**(superseded·skipped)인데, 보여 주는 revision 을 **말없이 r1 로 갈아끼고** 강조는 사라진다 |
| `/documents/DOC-SOP-0014?highlight=DOC-SOP-0014@r2#999` | `200` · 현행 r2 본문 · `highlight:null` | 존재하지 않는 index 인데 사유 없이 강조만 사라진다 |

**기전.** `fetch()` 는 `CHUNK_ID_RE` 매칭과 `match.group("document") == document_id` 만 확인하고
`revision_no` 를 뽑아 그 revision 을 편다. chunk 조회는 그 revision 의 것을 다 가져오지만,
`locate()` 가 대상 index 를 못 찾으면 `None` 을 돌려주고 — 호출부는 그 `None` 을
「강조 없음」과 구분하지 않는다. `locate()` 자신은 **옳게** 동작한다(그럴듯한 좌표를 지어내지
않는다). 잃는 자리는 그 다음 칸, 「못 찾았다」를 응답으로 옮기지 않는 곳이다.

**왜 «범위 밖 입력»이 아닌가.** 이 좌표는 사람이 지어내는 것이 아니라 **화면이 받은 것**이다.
`/evidence` 가 낸 evidenceId 를 그대로 `highlight` 로 넘기는 것이 이 라우트의 사용법이고
(계약 v0.1.1 · `?highlight={chunkId}`), 재색인으로 chunk 경계가 바뀌거나 revision 이 승격되면
어제의 인용 좌표가 오늘 없는 좌표가 된다. 그때 화면은 **강조 없는 다른 revision 본문**을 받고
오류도 사유도 없이 「인용을 찾을 수 없다」를 알 방법이 없다.

**대조군이 갈랐다.** 같은 라우트가 `highlight=garbage`(형식 위반)와 타 문서 chunk 는
`400 highlight_mismatch` 로 **옳게** 거절한다. 거절 경로가 살아 있는데 이 두 입력만 통과한다 —
「거절을 안 만들었다」가 아니라 「조건이 실재를 안 본다」는 뜻이다.

### V-7 — 같은 사건(의존 단절)을 라우트마다 «다른 코드»로 말한다

**실측.** postgres 컨테이너 정지 중, 같은 프로세스의 세 라우트:

| 라우트 | 단절 중 응답 | |
|---|---|---|
| `POST /retrieval/compare` | `503 dependency_unavailable` | ✅ V-2 정정이 지킨다 |
| `GET /evidence/{id}` | `500 internal_error` | 🔴 |
| `GET /documents/{id}` | `500 internal_error` | 🔴 |

**기전.** `routers/knowledge.py:_pool()` 은 `pg_pool is None` 일 때만 `DependencyUnavailable` 을
던진다 — 그것은 **기동 시점에 풀을 못 만든** 경우다. 기동 «후» 의존이 죽으면 풀 객체는 그대로
남고 `pool.acquire()` 가 예외를 던지는데, 읽기 경로에는 그것을 잡는 자리가 없다 →
`errors._unhandled` 의 전역 500(`internal_error`)이 된다.
`retrieval/service.py` 는 같은 예외군(`_DEPENDENCY_ERRORS`)을 잡아 503 으로 바꾼다 — V-2 처방이
그 자리에만 들어갔고, T2-2 의 새 라우트에는 오지 않았다.

**왜 결함인가.** 계약은 오류 «형상»만 정하므로 형상 검사(`error_shape_drill`)는 이것을 초록으로
넘긴다. 그러나 코드는 구현 자신이 뜻을 부여한 값이다(`app/errors.py`):

> `DependencyUnavailable` — 의존(PostgreSQL·Neo4j)에 닿지 못했다 — «서비스 결함»과 **구분되는
> 사건**이다.

그리고 화면(`apps/web-console/lib/contract.ts`)은 그 구분 위에 서 있다 — 백엔드 부재·501·
타임아웃을 `unavailable` 로 접어 **«미연결»로 표시하고 오류로 붉히지 않는다**. 한 사건에
`503`(잠시 후 다시)과 `500`(서비스 결함) 두 판정이 나오면 **하나는 반드시 거짓**이고,
Evidence 뷰만 없는 장애를 보고하게 된다.

**오케 소견② 에 대한 답.** 「503 이 화면에서 「미연결」로 접히는 문제 — 배지 데이터가 구분을
실을 수 있는가」 → **실을 수 있다.** 단절 중 `/health` 는 `status=degraded` ·
`postgres=unavailable` 로 옳게 말했고, `/scenarios` 는 DB 를 지나지 않아 `200` 을 유지한다 —
「미연결이 전역이 아니다」까지 화면이 알 수 있다. 부족한 것은 데이터가 아니라 **읽기 2라우트가
내는 코드**다. 처방은 compare 의 의존예외 변환을 reading 경로에 **1곳으로 수렴**시키는 것이다.

## 3. 축별 결과

### 축① 왕복 본체 — **PASS**(본체) / **FAIL**(대조군 · V-6)

| 축 | 결과 |
|---|---|
| 정본 10문 × 3전략 → 고유 evidenceId | **38건**(chunk 형상 23 · record 형상 15) |
| record prefix 분포 | `AL·CP·EQ·FM·MR·SAF·SN·SOP·WO` — T2-2가 넓힌 `CP` 포함 |
| `/evidence` 전건 열림 | **38/38** · 404 0건 |
| `excerpt` ↔ `/evidence.text` 앞머리 일치 | 어긋남 **0건** |
| `/documents.body[start:end]` == chunk 원문 | 어긋남 **0건** · 강조 `chunkId` 일치 |
| record 자기정합(`record.fields.id == evidenceId` · `stale=false` 상수) | 어긋남 **0건** |
| 대조군 9종 | **7 PASS · 2 FAIL**(V-6) |

🔴 **자기 검증**을 본 시험 앞에 뒀다 — 한 chunk 의 앞머리를 다른 chunk 본문에 걸어 비교기가
어긋남을 «실제로 잡는지» 먼저 본다. 통과만 하는 비교기는 아무것도 보증하지 않는다.

### 축② `/scenarios` ↔ allowlist 이원화 — **PASS**

| 축 | 결과 |
|---|---|
| 정본 10문(내 파서 재추출) ≡ `/scenarios` questions | **집합 일치** · 차집합 0/0 |
| `/scenarios` 문자열 **그대로** compare 에 | **10/10 `200`** · 생존 신호 hits **50건** |
| 교차 대조군(거부돼야 하는 것) | **6/6 `400 question_not_approved`** |

교차 대조군 = 끝 낱말 교체 · 접두 부분문자열 · 접미 추가 · 공백만 · SQL 조각 · Cypher 조각.
🔴 ①만 재면 「목록을 통째로 열어 두어도 초록」이다. allowlist 는 보안 통제(계약 §16.2 임의
질의 금지)이므로 **밖이 닫혀 있는 것까지** 봐야 안쪽 일치가 뜻을 갖는다.

### 축③ STALE 배지 (Q-20) — **PASS**

**상태표**(쓰기 없음 · 정본 = 뷰): 6상태 + 값 없음 = **7/7 기대대로**.
자기 검증으로 **정정 «전» 매핑(「`STALE` 만 true」)을 4건에서 잡는다** — 옛 결함을 못 잡는 표는
약한 표다.

**실주입 왕복**(오케 승인분 · `index_build[DOC-SOP-0014@r2 · levi2-run2].source_sha256` 한 칸):

| 시점 | `v_index_freshness` | `/evidence.stale` | `/documents.stale` | 무접촉 대조군 |
|---|---|---|---|---|
| 주입 전 | `FRESH` | `false` | `false` | `false` |
| 주입 후 | `STALE` | **`true`** | **`true`** | `false`(머문다) |
| 되감기 | `FRESH` | `false` | — | — |

🔴 **대조군을 「전후 같음」으로 재지 않았다** — 둘 다 true 여도 «같다». `false` 로 머무는 것까지
본다. 주입이 그 한 행에만 들었다는 것이 그렇게 갈린다.

### 축④ 의존 단절의 코드 구분 — **FAIL**(V-7)

§2 V-7. 되감기(재기동 → 4라우트 200)까지 실측했다.

### 축⑤ tests/api 모집단 — **3종 → 6종** (표면이 자란 만큼 표도 자랐다)

| 자산 | 신설/증설 | 이번 결과 |
|---|---|---|
| `citation_roundtrip_drill.py` | 신설 | 왕복 38 green · 대조군 **2 red**(V-6) |
| `scenario_allowlist_drill.py` | 신설 | **전건 green**(집합 1 + 관문 10 + 대조군 6) |
| `freshness_badge_drill.py` | 신설 | **전건 green**(상태표 7 + 주입 왕복 6) |
| `dependency_code_drill.py` | 신설 | 기준선 4 green · 단절 **3 red**(V-7) |
| `error_shape_drill.py` | 증설 E-07·E-08·E-09 | **11/11 green** |
| `anchor_boundary_drill.py` · `anchor_extraction_probe.py` | 회귀 | 10/10 · 16/16 green |

🔴 red 5행은 **일부러 남긴다**. 정정이 그 빨강을 초록으로 바꾸는 것이 재검의 판정 근거다 —
T2-1 에서 V-1~V-4 가 그렇게 뒤집혔다.

## 4. 소견 (E3 — 결함으로 계수하지 않는다)

**소견① — `/evidence.highlight` 의 좌표 참조계가 응답 안에 없다.** 좌표는 «원문»(revision body)
기준인데(`schemas.Highlight` 성문), `/evidence` 응답에는 `body` 가 없고 `text`(chunk) 만 있다.
소비자가 `text.slice(start,end)` 로 읽으면 조용히 빗나간다. 성문은 돼 있으므로 결함으로 세지
않되, 화면 구현 시점에 계약 각주로 못박거나 필드명을 갈라 두는 편이 안전하다.

**소견② — `stale` boolean 은 «왜» 를 말하지 못한다.** 구현이 이미 한계를 성문했고 6상태 노출은
Q-22 로 등재돼 있다. 이번 측정이 더한 사실 하나: `NOT_INDEXED`(색인 기록 없음)와
`STALE`(색인이 낡음)이 화면에서 **같은 배지**가 된다 — 전자는 「아직 안 만들었다」, 후자는
「만들었는데 뒤처졌다」로 운영 대응이 다르다.

**소견③ — `record` 의 `stale=false` 상수는 «다른 주장»이다.** doc-chunk 의 `false` 는 「색인
신선이 실증됐다」이고 record 의 `false` 는 「그 개념이 없다」다. `kind` 가 응답에 있으므로 화면이
갈라 그릴 수 있으나, 갈라 그리지 않으면 SSOT 직독 근거에 색인 배지를 붙이게 된다.

## 5. 재현 명령

```powershell
# 스택(자기 것) — pg 5534 · neo4j 7574/7587
docker ps --filter name=fkt-levi2

# 서버 (services/ai-api 에서 · 의존은 환경변수로만)
$env:FKT_POSTGRES_DSN='postgresql://fkt:***@127.0.0.1:5534/fkt'
$env:FKT_NEO4J_URI='bolt://127.0.0.1:7587'; $env:FKT_NEO4J_USER='neo4j'; $env:FKT_NEO4J_PASSWORD='***'
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --host 127.0.0.1

# 자산 7회 (리포 루트에서 · exit 0 = 기대대로 · 1 = 어긋남 · 2 = 측정 불가)
python tests/api/anchor_extraction_probe.py
python tests/api/anchor_boundary_drill.py
python tests/api/error_shape_drill.py --cut-neo4j
python tests/api/citation_roundtrip_drill.py
python tests/api/scenario_allowlist_drill.py
python tests/api/freshness_badge_drill.py --inject-stale
python tests/api/dependency_code_drill.py --cut-postgres
```

## 6. 재검 — 정정 착지 후 (예정)

정정 PR(`lane/senku2-t2-2-fix` · V-6 ⓐ + V-7 ⓑ) 착지 후 **같은 그물을 1회** 돌려
red 5행이 green 으로 바뀌는 것을 실측하고 판정을 확정한다.
🔴 최종 판정 환경 = **venv 설치(langgraph · websockets 17→16) + 정정 착지본**이다 —
설치 전 환경의 초록은 없어진 환경의 초록이라 판정 근거로 쓰지 않는다.
