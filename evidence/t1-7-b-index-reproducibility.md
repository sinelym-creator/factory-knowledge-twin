---
artifact: t1-7-b-index-reproducibility
ticket: T1-7 B단 — seed→index 재현성 · index_build 대조 · V-1 인수
owner: 검증(리바이2 4대)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-29
verification_base: develop `0be108e` (wireframes v0.4 착지분 포함) · 작업 `lane/levi2-t1-7b`
target: services/indexer/** · services/ai-api/db/migrations/003_*.sql · docs/product/wireframes.md v0.4
size_limit: 16KB
---

# T1-7 B단 — 실측과 판정

> 🔴 **남의 색인을 세지 않았다.** 존치된 `.volumes-senku2`(색인 든 채)는 열지 않았고,
> 내 격리 스택에서 **처음부터 두 번 빌드**해 그 출력만 판정에 썼다. 좌표를 옮겨 적는 것은
> 검증이 아니다 — 이 축은 특히 「구현 좌석이 낸 좌표가 맞나」를 묻는 자리라 더 그렇다.

## 0. 방법

| 항목 | 내용 |
|---|---|
| base | `0be108e` · 브랜치 `lane/levi2-t1-7b` |
| 스택 | `COMPOSE_PROJECT_NAME=fkt-levi2` · pg **5534** · `VOLUME_ROOT=./.volumes-levi2` — 타 좌석 무접촉 |
| 스키마 | `migrate.ps1` 재실행 → `003_vector_index_build.sql` 적용(`003: embedding → vector(384) 적용` · exit 0) |
| 런타임 | `services/indexer/.venv` **내가 새로 만들었다**(py3.14 · wheel 전건 · `torch 2.13.0+cpu` · `sentence-transformers 6.0.0` · `psycopg 3.3.4`) |
| 빌드 | `build_index.py --build-id levi2-run1` / `levi2-run2` · 각각 뒤에 `verify_index.py --dump` |
| 근거 등급 | 수치는 전부 **E1**(내 실행 출력). 소견은 그렇게 표기했다 |

## 1. 판정 전 게이트 — 도구 생존 확인

| 도구 | 결과 | exit |
|---|---|---:|
| `run-net-liveness.ps1` | **8/8**(L-31·L-32 신설분 포함) | 0 |
| `run-seed-integrity.ps1` | 22/22 | 0 |
| `run-probes.ps1` | 6/6 | 0 |
| `selfcheck_mutation.py` | 주입 11 · 감지 10 · 구멍 1 | 0 |
| `probe_binding_scope.py` | 20키 · 감지 2 | 0 |
| `contract run.js --strict-coverage` | 34/34 · 커버리지 37/37 | 0 |

## 2. 재현성 — 🟢 **PASS · diff 0 (바이트 동일)**

| | Target | Actual |
|---|---|---|
| 연속 2회 재생성 diff | **0** | **0 — 두 덤프가 바이트 동일** |

```
run1  chunk 59건 / revision 45건 (건너뜀 15) · 최대 468 token(예산 512) · 임베딩 입력 최대 473(상한 512)
run2  chunk 59건 / revision 45건 (건너뜀 15) · 동일
dump1.tsv 340,001 B · dump2.tsv 340,001 B
sha256 03c674202938bae4badd7aaa9e56a60305d851e7c4099d52d861edb0321c638d  ← 두 파일 «같은 값»
diff  exit 0 · 차이 0줄
```

🔴 **덤프에는 384차원 임베딩 벡터가 전열 포함된다.** 「행 수가 같다」가 아니라 **부동소수 벡터까지 동일**
하다는 뜻이다 — 재현성 주장의 강도가 여기서 갈린다. 벡터 노름은 전건 `1.000000~1.000000`(정규화 임베딩).

부수 실측: `index_build` **120행** = 2빌드 × 60 revision(성공 45 + skipped 15). 원장이 append-only로
쌓였고 두 번째 빌드가 첫 기록을 덮지 않았다 — 감사 기록으로서 성립한다.

| chunk 무결성 | 실측 |
|---|---:|
| chunk 총 / id 중복 | 59 / **0** |
| id의 `#NNN` ≠ `chunk_index` 인 행 | **0** (정오표 E-4 동치 규칙 준수) |
| revision별 `chunk_index` 0 시작 아님 / 결번 | **0 / 0** |

## 3. `index_build` ↔ spec 대조 — 🟡 **8/9 성립 · 1축 부재**

baseline §8.3 9항목을 실물 칼럼과 1:1로 맞췄다(스키마는 DB에서 직접 읽었다 — 마이그레이션 파일 복창 아님).

| §8.3 | 실물 | 판정 |
|---|---|---|
| ① source document ID와 revision | `revision_id`·`document_id`·`revision_no` | 🟢 |
| ② source SHA-256 | `source_sha256 char(64)` NOT NULL | 🟢 |
| ③ chunking policy version | `chunking_policy_version` | 🟢 |
| ④ embedding model과 dimension | `embedding_model`·`embedding_dim` | 🟢 |
| ⑤ index 생성 시각 | `built_at timestamptz` | 🟢 |
| ⑥ ontology version | `ontology_version` NOT NULL | 🟢 |
| ⑦ graph projection version | `graph_projection_version` **nullable** — T1-5 미착수라 NULL이 참 | 🟢 (근거 성문됨) |
| ⑧ build status | `status CHECK IN (success,failed,skipped)` | 🟢 |
| ⑨ drift·stale 여부 | 저장 대신 `v_index_freshness` view로 파생 | 🔴 **부분** — 아래 |

### 3.1 🔴 STALE 판정에 **ontology 축이 없다** (spec §3.3 요구 미충족 · E1)

스펙 §3.3: 「`source_sha256` ≠ 현행 approved revision의 `content_sha256` → STALE INDEX. **`ontology_version`
불일치도 동일 처리**」. 실물 view는 `source_sha256`만 비교한다. 주입해 확인했다(트랜잭션·롤백):

| 주입 | 기대 | 실측 | 판정 |
|---|---|---|---|
| sha 일치 + `ontology_version` = `0.0.1-WRONG` (현행 `0.1.0`) | STALE | **FRESH** | 🔴 **미충족** |
| 대조군: sha 불일치 · ontology 일치 | STALE | **STALE** | 🟢 view는 살아 있다 |

🔴 **대조군이 있어야 이 결론이 선다.** 「FRESH가 나왔다」만으로는 view가 죽었는지 축이 없는지 모른다 —
sha 축은 정상 동작하므로 **view는 살아 있고, ontology 축이 애초에 구현되지 않았다**.
빌드 스크립트는 `packages/ontology/ontology-version.json`에서 값을 읽어 원장에 **적기는 한다**(`0.1.0`) —
기록은 있는데 **비교하는 쪽이 없다**. ontology를 minor 올리는 순간 낡은 색인이 조용히 FRESH로 남는다.

- **회부**: 처방 위치 = `services/ai-api/db/migrations/**` = **구현 좌석 scope**. 내가 닫지 않았다.
- **대신 한 것**: `tests/data/net-liveness.sql` **L-31**(sha 축 생존) · **L-32**(ontology 축 부재를
  known gap으로 기대 고정)를 신설했다. 처방이 착지하면 L-32가 FAIL로 울린다 — 표를 갱신하라는 신호다.

### 3.2 부수 — spec §4 pgvector 열의 미착지 2건 (결함 아님 · 계수만)

spec §4는 pgvector 보유분으로 `MaintenanceRecord` 이력 `note` 임베딩과 `FailureMode` `description`
임베딩도 적었다. 실물 vector 칼럼 전수 = **`document_chunk.embedding` 1개뿐**(E1). T1-4 티켓의
「범위 밖」 절에 이 둘은 없으므로 «명시적 제외»가 아니라 **미착지**로 읽힌다 — 오케 계수 대상이다.

## 4. V-1 인수 — 🟢 **PASS (4/4 실재 · 양방향 7/7)**

판정 기준은 원장 성문분 그대로: **4좌표 실재 + 인용문 달린 좌표는 chunk 본문이 해당 인용 포함(양방향)**.
좌표는 wireframes v0.4에서 **내가 직접 뽑았고**, 대조는 **내 재빌드 색인**으로 했다.

| 화면 좌표 | 실재 | `chunk_index` | 그 revision 범위 |
|---|---|---:|---|
| `DOC-MAN-0021@r1#004` | ✅ | 4 | #000~#007 |
| `DOC-SOP-0014@r2#001` | ✅ | 1 | #000~#002 |
| `DOC-MRP-0087@r1#000` | ✅ | 0 | #000~#000 |
| `DOC-MAN-0022@r1#000` | ✅ | 0 | #000~#005 |

**양방향** — 정방향 = 「그 chunk가 인용을 담는가」 · 역방향 = 「같은 revision에서 그 인용을 담은 chunk가
**몇 개인가**」. 역방향이 2 이상이면 화면이 «여러 후보 중 하나»를 가리키는 것이라 좌표의 뜻이 흐려진다.

| 좌표 | 인용 | 정방향 | 역방향(포함 chunk 수) |
|---|---|---|---:|
| `DOC-MAN-0021@r1#004` | 「진동 RMS가」 | ✅ | **1** |
| `DOC-MAN-0021@r1#004` | 「베어링 마모는 초기에 RMS가」 | ✅ | **1** |
| `DOC-MRP-0087@r1#000` | 「베어링 교체」 | ✅ | **1** |
| `DOC-MRP-0087@r1#000` | 「2025-02-11」 | ✅ | **1** |
| `DOC-SOP-0014@r2#001` | 「### 3.2 진단 기준」 | ✅ | **1** |
| `DOC-SOP-0014@r2#001` | 「### 3.3 필요 부품」 | ✅ | **1** |
| `DOC-SOP-0014@r2#001` | 「진동 RMS가 기준치의 150%를 3일 이상 초과하면…」 | ✅ | **1** |

`DOC-MAN-0022@r1#000`은 인용문 없는 대표값이라 **실재만** 봤다(원장 기준 그대로 · 실재 범위 #000~#005 안).

**V-2**(오케 scope · 대조만): 화면 ③의 `sha256 5945…f5e8` ↔ 실물 `document_revision.content_sha256`
= `59457442ce3f642b2cf711218ee088fd604afe9ee81a5c3010ec4847ef77f5e8` — 앞 4·뒤 4 **일치**. 🟢

## 5. U-7 집행 (승인분)

`Q-SAFETY-001` 앵커 자리표시자 4종 → 실값. `DOC-SAF-xxxx`→`DOC-SAF-0029` · `DOC-SAF-yyyy`→`DOC-SAF-0030` ·
`"각 안전 문서의 current_revision"`→`DOC-SAF-0029@r3`·`DOC-SAF-0030@r3` · `SAF-PPE-nn`→`SAF-PPE-01`.
🔴 **◇ 표기는 존치했다** — ◇의 뜻은 「T0-6 미명시」(§0.5)이고 그 사실은 값이 채워져도 변하지 않는다.
값이 생겼다고 ◆로 올리면 스펙 이력이 지워진다. U-7을 가리키던 §0.4·§7 문장도 함께 닫았다.

## 6. 판정 요약

| B단 항목 | Target | Actual | 판정 |
|---|---|---|---|
| ④ seed→index 재현성 | 2회 diff 0 | **바이트 동일**(sha256 일치 · 벡터 포함) | 🟢 PASS |
| ④ chunk ID unique | 중복 0 | 59/59 · 중복 0 · 결번 0 · 0-based 전건 | 🟢 PASS |
| ⑤ `index_build` 스키마↔spec | §8.3 9항목 | **8 성립 · ⑨ 부분**(ontology 축 부재) | 🟡 **부분** |
| ⑥ V-1 인수 | 4좌표 실재 + 양방향 | 4/4 · 양방향 7/7(역방향 전건 1) | 🟢 **PASS · V-1 해소** |
| U-7 | 앵커 확정 | 4종 치환 완료 | 🟢 완료 |

## 7. 남은 것 (닫힌 것으로 계수하지 마라)

| id | 내용 | 소관 |
|---|---|---|
| **신규** | STALE 판정에 `ontology_version` 축 부재 — L-32로 고정 | **구현 좌석**(migrations) |
| **신규** | spec §4 pgvector: `MaintenanceRecord.note`·`FailureMode.description` 임베딩 미착지 | **오케 계수** |
| F-2 | 바인딩 검사 사정거리 2/20 — 처방은 `data/generators/generate.py` | 구현 대기열 Q-1 |
| U-1 | chunk 입도 evidence 재바인딩(색인이 생겼으니 이제 «가능»해졌다) | 후속 발주 |
| G-3 | `approved → draft` 전이 자체를 보는 그물 없음 | 존치 부채 |

## 8. 재현 방법

```powershell
$env:COMPOSE_PROJECT_NAME='fkt-levi2'; $env:POSTGRES_PORT='5534'
$env:NEO4J_HTTP_PORT='7574'; $env:NEO4J_BOLT_PORT='7587'; $env:VOLUME_ROOT='./.volumes-levi2'
docker compose up -d ; pwsh services/ai-api/db/migrate.ps1

$env:PYTHONUTF8='1'; $env:PGPORT='5534'
services\indexer\.venv\Scripts\python.exe services\indexer\build_index.py --build-id run1
services\indexer\.venv\Scripts\python.exe services\indexer\verify_index.py --dump > dump1.tsv
services\indexer\.venv\Scripts\python.exe services\indexer\build_index.py --build-id run2
services\indexer\.venv\Scripts\python.exe services\indexer\verify_index.py --dump > dump2.tsv
# 판정 = 두 덤프의 sha256 일치 (행 수 비교로 대신하지 마라 — 벡터가 흔들려도 행 수는 같다)

pwsh tests/data/run-net-liveness.ps1        # 8/8 · L-32가 ontology 구멍을 고정한다
```

- 🔴 `$env:PGPORT` 없이 돌리면 기본 5434(다른 좌석 스택)를 문다. 남의 DB를 빌드하지 마라.
- 🔴 `$env:PYTHONUTF8='1'` 없으면 CP949로 출력이 깨진다.
- 🔴 재현성 판정은 **덤프 해시**로 한다. `verify_index.py`의 요약 수치는 두 빌드가 달라도 같게 나온다.
