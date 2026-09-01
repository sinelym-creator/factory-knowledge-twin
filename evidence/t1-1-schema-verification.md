---
artifact: t1-1-schema-verification
ticket: T1-1 스키마 독립 검증
owner: 검증(리바이2)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-28
verification_base: develop `52d4455`
target: services/ai-api/db/migrations/001_core_schema.sql · services/ai-api/db/README.md
size_limit: 16KB
---

# T1-1 스키마 독립 검증 — 대조표와 DDL

> 🔴 **구현 좌석이 이미 실측한 제약 7종(ID 패턴·NOT NULL·PK 중복·FK·status CHECK·승인자 누락·sha256 형식)은 다시 돌리지 않았다.** 자기 실측의 재실행은 검증이 아니라 복창이다.
> 내가 본 축은 둘 — **① 대조표가 «빠뜨린» 것이 있는가 ② 거부돼야 하는데 «통과하는» 조합이 있는가.**

## 0. 방법

| 항목 | 내용 |
|---|---|
| base | `52d4455` |
| 실행 환경 | **격리 스택**(`COMPOSE_PROJECT_NAME=fkt-levi2` · 5534/7574/7587 · `VOLUME_ROOT=./.volumes-levi2`) — 타 좌석 스택 무접촉 |
| 스키마 적용 | `pwsh services/ai-api/db/migrate.ps1` (exit 0 · 26 테이블) |
| 표본 | `tests/schema/constraint-probes.json` (8건) + `tests/schema/run-probes.ps1` |
| 🔴 격리 | **probe 1건 = 트랜잭션 1개(BEGIN … ROLLBACK)** — 준비 행까지 되감아 **대상 DB에 아무것도 남기지 않는다.** 타 좌석 스택에서도 안전하게 돌릴 수 있는 구조로 만들었다 |

## 1. 축 ① — 대조표 주장 실증 (전건 일치)

| 대조표 주장 | 실측(live DB) | 판정 |
|---|---|---|
| A절 Entity 16종 → 테이블 16 | `information_schema` 조회 **16/16** | ✅ |
| B절 조인 테이블 9종 | **9/9** 실재 | ✅ |
| 테이블 총 26(16+9+이력 1) | **26** | ✅ |
| 임베딩 `vector(768)` | `atttypmod` = **768** | ✅ |
| 멱등(재실행) | 1차·2차 모두 **exit 0** | ✅ |

**A·B절은 과장이 없다.** 스펙 16 entity·25 relation이 DDL에 전부 착지했고, 「의도적으로 없는 것」(D절)도 이유와 함께 적혀 있다 — 검증자가 «빠진 것»과 «안 넣은 것»을 구분할 수 있게 만든 표다.

## 2. 축 ② — 🔴 거부돼야 하는데 **통과하는** 조합 7건 (전건 실행 재현)

```
결과: 1/8 기대대로 · 어긋남 7건 · 판정불가 0건
```

대조군 `P-8`(정상 revision)은 **통과**했다 — 표본이 무엇이든 막는 게 아니라 **골라서** 막는다는 증거다.

| probe | 통과하면 안 되는데 통과한 것 | 결함 분류 |
|---|---|---|
| **P-1** | `document_revision.id`가 자기 `document_id`·`revision_no`와 **다른 값**이어도 INSERT됨 | G-4a |
| **P-7** | `document_chunk.id`가 자기 `revision_id`와 **다른 revision**을 가리켜도 INSERT됨 | G-4a |
| **P-2** | `approval_state='superseded'`인데 `effective_to`가 **NULL**이어도 INSERT됨 | G-1 |
| **P-3** | 같은 문서에 유효 기간이 **겹치는 approved revision 2건**이 INSERT됨 | G-2 |
| **P-4** | `approved` → `draft` **역방향 전이** UPDATE가 통과됨 | G-3 |
| **P-5** | `component.id`의 설비 번호가 **소속 설비와 달라도** INSERT됨 | G-4b |
| **P-6** | `sensor.id`의 설비 번호가 **소속 설비와 달라도** INSERT됨 | G-4b |

### 2.1 왜 이것들이 «나중에» 아프고 지금 싼가

- **G-4a·G-4b (ID 구성요소 정합)** — 이 프로젝트는 **ID를 읽어 의미를 얻는다.** T0-6 §3.1이 ID에 소속 정보를 넣었고(`CP-{EQ_NUM}-…`), GS-01 경로·평가셋 기대 evidence·인용 추적이 전부 그 전제 위에 있다. **ID와 실제 소속이 어긋난 행이 하나라도 섞이면 그 행은 «조용히» 틀린 답을 만든다** — 예외도 오류 로그도 없다.
- **G-2 (동시 유효 revision)** — 인용 가능 = `approved` ∧ 기간 내. 겹치면 「지금 인용할 revision」이 2건이 되어 **판정 자체가 불가능**해진다. T0-8 `Q-DIRECT-003`의 «정답 1건» 전제가 여기서 무너진다.
- **G-1 (superseded 종료시각)** — 「언제까지 유효했는가」가 비면 과거 시점 인용 검증(감사·replay)이 불가능하다.
- **G-3 (전이 방향)** — 승인된 문서를 초안으로 되돌릴 수 있으면 승인 이력이 사실을 담지 못한다.

### 2.2 처방 — 「무엇을 하면 닫히는가」

| 분류 | 대상 | 처방 | 비용 |
|---|---|---|---|
| **G-4a** | `document_revision` · `document_chunk` | **같은 행 안에서 끝난다** — `CHECK (id = document_id \|\| '@r' \|\| revision_no)` · `CHECK (id = revision_id \|\| '#' \|\| lpad(chunk_index::text,3,'0'))` | **CHECK 2줄** |
| **G-1** | `document_revision` | `CHECK (approval_state <> 'superseded' OR effective_to IS NOT NULL)` | **CHECK 1줄** |
| **G-4b** | `component` · `sensor` | 🔴 **CHECK로 불가**(다른 테이블 값 참조) — 트리거 또는 **T1-2 seed 생성 시 검증** | 판단 필요 |
| **G-2** | `document_revision` | `EXCLUDE USING gist (document_id WITH =, daterange(effective_from, effective_to) WITH &&) WHERE (approval_state='approved')` — `btree_gist` 확장 필요 | 판단 필요 |
| **G-3** | `document_revision` | 트리거 또는 서비스 계층 강제 | 판단 필요 |

🔴 **G-4a·G-1 3줄은 지금 넣는 것을 권한다** — 같은 행 안에서 끝나고, 멱등 규율(`CREATE TABLE IF NOT EXISTS`)상 **신규 마이그레이션 파일**로 추가하면 된다.
🔴 **나머지 3건은 «스키마가 막을 일인가»가 먼저다.** README D절이 「스키마는 사실만 담고 판정은 질의/서비스 계층」이라는 원칙을 세웠고 오케가 승인했다. 그 원칙을 따르면 G-2·G-3은 **의도된 비강제**일 수 있다 — **다만 그렇다면 D절에 그렇게 적혀야 한다**(§3 참조).

## 3. 축 ① 보강 — 대조표 표현 정확성 2건

### 3.1 ◻ C절이 «전이 규칙»을 «값 CHECK»에 매핑했다

| README C절 | 실제 |
|---|---|
| 스펙 규칙 「상태 전이 `draft→approved→superseded→retired` (역방향 없음). 새 revision 승인 시 직전 revision은 superseded + effective_to 기입」 → DDL 「`approval_state` CHECK 4값」 | **값 CHECK는 전이도, 동반 `effective_to` 기입도 강제하지 않는다**(P-2·P-4로 실증) |

읽는 사람은 「전이 규칙이 DDL에 반영됐다」로 읽는다. **실제로 반영된 것은 «허용 값 집합»뿐이다.**
→ **고치면 PASS**: C절의 해당 행을 **「허용 값만 제한 · 전이 방향과 effective_to 동반은 미강제(질의/서비스 계층 또는 후속 제약)」**로 정정. 표현 1줄이면 된다. **비강제 자체보다 «강제된 것처럼 읽히는 표»가 더 위험하다** — 검증자가 그 줄을 믿고 넘어가기 때문이다.

### 3.2 ◻ 스펙 R15 속성명이 DDL과 다르다

| 출처 | 표기 |
|---|---|
| T0-6 §2.1 R15 (동결) | `Incident DIAGNOSED_AS FailureMode` **(속성: `confidence`·`rank`)** |
| DDL `incident_diagnosis` | `rank` · **`confidence_note` text** |
| T0-5 계약 `runCompleted.candidates[]` | **`confidenceNote`** |

DDL은 **계약과는 맞고 동결 스펙과는 다르다.** 이름만의 문제가 아니다 — `confidence`는 값(수치)을 시사하고 `confidence_note`는 문구다.
→ **고치면 PASS**: 셋 중 하나로 통일하고 **어느 쪽이 정본인지 기록**한다. 계약이 이미 `confidenceNote`이므로 **T0-6 §2.1 R15 표기를 정정하는 쪽**을 권한다(동결 문서 개정 절차 = baseline §0.3).

## 4. 판정

| 축 | 결과 |
|---|---|
| 대조표 주장(A·B·멱등·차원) | ✅ **전건 일치 · 과장 없음** |
| 거부돼야 하는데 통과 | 🔴 **7건**(4 분류) — 전건 **실행 재현** |
| 대조표 표현 정확성 | ◻ **2건**(C절 매핑 · R15 이름) |

**T1-1은 «스펙을 DDL로 옮기는 일»을 정확히 해냈다.** 16 entity·25 relation·§3.3 규칙 대부분이 착지했고, 안 넣은 것을 이유와 함께 적었다. 발견된 7건은 **옮기다 빠뜨린 것이 아니라, 스펙이 «문장»으로만 말한 정합을 DDL이 아직 «제약»으로 만들지 않은 것**이다.

🔴 **판정 보류 사유 없음 — 다만 완료 계수 전에 위 처방 중 «G-4a·G-1 3줄»만은 넣기를 권한다.** 나머지 4건(G-4b·G-2·G-3·R15)은 **설계 판단**이라 오케 결정 사항으로 올린다.

## 5. 재현 방법

```powershell
$env:COMPOSE_PROJECT_NAME='fkt-levi2'; $env:POSTGRES_PORT='5534'
$env:NEO4J_HTTP_PORT='7574'; $env:NEO4J_BOLT_PORT='7587'; $env:VOLUME_ROOT='./.volumes-levi2'
docker compose up -d
pwsh services/ai-api/db/migrate.ps1
pwsh tests/schema/run-probes.ps1
# 기대(처방 후): "결과: 8/8 기대대로" · exit 0    현재: "1/8 · 어긋남 7건" · exit 1
```

표본은 **잔여물을 남기지 않는다**(트랜잭션 롤백). 제약이 추가되면 같은 명령으로 회귀 확인이 된다.
