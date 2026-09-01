---
artifact: t1-7-q-verify
ticket: T1-7 후속 — Q묶음(Q-1·Q-2·Q-4) 독립 검증 + U-1 chunk 입도 evidence
owner: 검증(리바이2 4대)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-29
verification_base: develop `7ca0aed` (PR #66 착지분) · 작업 `lane/levi2-q-verify` · worktree `_wt/levi2-qverify`
target: data/generators/** · services/ai-api/db/migrations/004·005 · services/indexer/** (읽고 판정만)
size_limit: 16KB
---

# Q묶음 독립 검증 + U-1 — 실측과 판정

> 🔴 **「구현 좌석이 닫았다」를 근거로 쓰지 않았다.** 네 축 전부 내 스택에서 다시 깨서 확인했고,
> `ssot_manifest_hash`는 구현 좌석의 파이썬·SQL을 **부르지 않고** 스펙 정의문만 읽어 다른 도구로 따로 냈다.

## 0. 방법

| 항목 | 내용 |
|---|---|
| base | `7ca0aed` · worktree **`../_wt/levi2-qverify`** · 브랜치 `lane/levi2-q-verify` — 🔴 주 체크아웃 무접촉(plan §5 새 규율 첫 적용) |
| 스택 | `fkt-levi2` · pg 5534 · 내 재빌드 색인 실물(chunk 59 / approved revision 45) |
| 스키마 | `migrate.ps1`로 004·005를 **내 손으로** 올린 뒤 측정 |
| 근거 등급 | 수치는 전부 **E1**. 소견은 그렇게 표기했다 |

## 1. Q-1 — F-2 🟢 **종결**

### 1.1 전환 «전» 상태부터 쟀다

기대표를 손대기 전에 먼저 돌렸다. 두 도구가 **스스로 「구멍이 메워졌으니 표를 갱신하라」**를 찍었다:

| 도구 | 전환 전 | exit |
|---|---|---:|
| `probe_binding_scope.py` | 감지 **20** / 미감지 **0** · 기대 불일치 **18** | 1 |
| `selfcheck_mutation.py` | 주입 11 · 감지 **11** · 기대 불일치 1 | 1 |

🔴 **이 순서가 중요하다.** 표를 먼저 뒤집고 초록을 봤다면, 그 초록은 「구멍이 메워졌다」가 아니라
「표가 낡았다」와 구분되지 않는다. 도구가 red로 알려 준 것을 확인한 뒤에 표를 옮겼다.

### 1.2 기대표 전환 (tests/** = 검증 좌석 scope · A단 §2.4 성문 절차 그대로)

- `probe_binding_scope.py` → `EXPECTED_DETECTED = {k: True for k in GS}` (옛 값 = `sensor_cur`·`alarm` 2건만 True)
- `selfcheck_mutation.py` → F-2 행 `False, None` → `True, "GS 바인딩 ID 누락: equipment"`
  🔴 사유를 **키까지** 못박았다. 부품 행과 같은 「GS 바인딩 ID 누락」만 보면 어느 키가 잡혔는지
  구분되지 않아, 설비 축이 죽어도 초록으로 보인다.

| 전환 후 | 결과 | exit |
|---|---|---:|
| `probe_binding_scope.py` | GS 20키 · **감지 20 / 미감지 0** · 기대 불일치 0 | **0** |
| `selfcheck_mutation.py` | 주입 11 · **감지 11** · 알려진 구멍 **0** · 기대 불일치 0 | **0** |

감지 사유 실측: `GS 바인딩 ID 누락: equipment = EQ-CNC-204 (equipment.id에 없다)` — 소유 테이블까지 찍는다.

### 1.3 🔴 처방의 «가드»가 장식인지도 확인했다

새 코드는 `GS`에 있고 `GS_OWNER`에 없는 키를 **건너뛰지 않고 FAIL로 센다**. 그 가드가 실제로 우는지
일회 측정으로 확인했다(모듈 상수를 복제·복원 · 파일 무수정):

```
대조군(무주입)                 fails 없음
GS_OWNER에서 equipment 제거    ["GS 소유 테이블 미정의: ['equipment'] — config.GS_OWNER에 추가하라"]
복원 후                        fails 없음
```

가드가 없으면 「다음에 GS 키를 추가하는 사람」이 같은 구멍을 다시 연다. **살아 있다.**

**판정: F-2 종결.** 20키 전건 감지 + 사유 정확 + 재발 가드 생존.

## 2. Q-4 — ontology STALE 축 🟢 **PASS** · 🟡 잔여 1건

주입은 **거울을 올리는** 방향으로 했다(온톨로지가 올라갔는데 색인은 그대로 — 현실의 그 순서).

| # | 주입 | freshness / stale_reason | 판정 |
|---|---|---|---|
| 1 | 거울 `0.1.0 → 0.2.0` | **STALE / ONTOLOGY_VERSION 45** · SKIPPED 15 | 🟢 |
| 2 | revision 1건 `content_sha256` 변조 | **STALE / SOURCE_SHA 1** · FRESH 44 | 🟢 |
| 3 | 두 축 동시 | **SOURCE_SHA 1 + ONTOLOGY_VERSION 44** | 🟢 사유가 섞이지 않는다 |

「판정은 하나(STALE), 사유는 둘」이 §3.3 「동일 처리」와 정합하고, **고칠 곳이 다른 두 원인이
열로 갈린다.** 그물로 고정했다 — `net-liveness.sql` **L-32**(known gap → 정상 전환)·**L-33**(사유 분리).

### 2.1 🟡 거울 공란 축 — «판정 안 함»이 화면에는 **FRESH**로 나온다

004의 의도(「비교 대상이 없으면 ontology 축을 판정하지 않는다」)는 옳다. 문제는 `freshness` 열에
**«판정 안 함» 상태가 없다**는 것이다. 대조쌍으로 실측했다:

| 상태 | 원장 ontology | 거울 | freshness |
|---|---|---|---|
| ⑤ | `0.0.9` (낡음) | **비었음** | 🔴 **FRESH 45** |
| ⑥ | `0.0.9` (낡음) | `0.1.0` | 🟢 STALE 45 |

**같은 낡음이 거울 유무로 STALE ↔ FRESH로 갈린다.** 「모른다」를 「신선하다」로 답하는 자리다.

- **완화책은 실재한다**(내가 코드에서 확인): `build_index.py`의 `check_ontology_registry()`가
  「`ontology_registry` 0행」에서 **멈춘다**. 즉 정상 빌드 경로로는 이 상태가 만들어지지 않는다.
- **막히지 않는 것은 읽기 경로다.** 거울이 지워진 DB를 그냥 조회하면 FRESH가 나오고,
  `verify_index.py`는 거울 값을 **찍기만 하고 FAIL로 세지 않는다**(실측 · 라인 96~101).
- **처방 후보**(구현 좌석 scope라 내가 닫지 않았다): `freshness`에 `ONTOLOGY_UNVERIFIED` 상태를 더하거나,
  `verify_index.py`가 거울 NULL을 FAIL로 센다. 심각도 **낮음**(E3 소견) — 빌드 가드가 있고,
  거울은 마이그레이션이 넣는 행이라 정상 운용에서 비지 않는다.
- **그물**: `net-liveness.sql` **L-34**에 현재 동작을 known gap으로 고정했다. `UNKNOWN` 상태가 생기면
  거기서 FAIL로 울린다.

## 3. 재검수 3건

### 3.1 migrate 「재실행 안전」 재검수 — 🟢 PASS (신의미 기준)

오케 확정 신의미 = **러너 재실행 안전(적용분 skip · exit 0)**. 두 축 다 내 손으로 냈다.

| 축 | 실측 | exit |
|---|---|---:|
| 기존 DB(003까지 적용됨) | 1차 = 004·005 apply · 2차·3차 = **전건 skip** | 0 / 0 / 0 |
| **신규 빈 DB**(`fkt_probe` 생성 후 · 측정 뒤 삭제) | 1차 = **5개 전건 apply** · 2차 = **전건 skip** | 0 / 0 |
| 신규 DB 결과 | 테이블 30 · view 2 · `embedding` **vector(384)** · `ontology_registry` `0.1.0` | — |

🔴 **부수 관찰 1건(소견)**: 러너 헤더가 `embedding_dim=768`을 찍는다. 003이 384로 고정한 뒤에도
파라미터 기본값이 그대로 표시되는 것이라 **결과는 384가 맞다**(위 실측). 값이 아니라 «표시»가
어긋난 자리다 — 재현자가 768을 실값으로 읽을 여지가 있다. 구현 좌석 scope라 고치지 않았다.

### 3.2 `ssot_manifest_hash` — 🟢 **독립 재도출 일치**

🔴 **구현 좌석의 SQL·파이썬을 부르지 않았다.** 스펙 §3.3 정의문(「`{document_id}@r{n}:{content_sha256}`
행을 문서 ID 오름차순 정렬·개행 결합한 텍스트의 SHA-256」)만 읽고, psql로 **정렬 없이** 원자료만 받아
`sort`·`awk`·`sha256sum`으로 따로 조립했다.

| | 값 |
|---|---|
| view `v_ssot_manifest` | 45 · `0b2145bf8bb65b245f2c58165a557a9f5e510eb05b6d913701ae65187335361a` |
| **내 독립 재도출** | 45 · `0b2145bf8bb65b245f2c58165a557a9f5e510eb05b6d913701ae65187335361a` |
| manifest 텍스트 길이 | view 3,644 B = 내 조립 3,644 B |
| 대조군 ①(문서 1건 sha 변조) | `fe358ea9…` 로 이동 · 롤백 후 원값 회귀 |
| 대조군 ②(approved 1건 → draft) | 44행 · `489e02f5…` — 집합이 바뀌면 지문도 바뀐다 |

🔴 **정렬 축을 따로 봤다(구현 좌석 검사에 없던 것)**: SQL은 `ORDER BY document_id`로 **DB collation**에
의존한다. 내 `LC_ALL=C` 바이트 정렬과 순서가 **동일함을 실측**했다 — 지금은 안전하다.
다만 이는 문서 ID가 전부 `DOC-AAA-NNNN` 한 모양이라 성립하는 것이다(**E3 소견**): ID 체계가
섞이거나 DB locale이 달라지면 지문이 «DB 설정에 따라» 달라질 수 있다. 회부한다.

### 3.3 005 정의문 ↔ 스펙 §3.3 원문 — 🟢 정합

- 스펙 원문의 4요소(행 서식 · 문서 ID 오름차순 · 개행 «결합» · SHA-256)를 전부 만족한다.
  행 끝 개행을 붙이지 않는 처리(`string_agg(line, E'\n')`)도 「결합」과 일치한다.
- 스펙이 말하지 않은 **판단 지점 1개**(어떤 revision 1행인가)를 `approved` 한정으로 정하고 그 근거를
  파일에 적어 두었다 — §3.3 자신이 인용 가능 조건을 approved로 한정하므로 **정합**이다.
- 정렬에 `revision_no`를 덧붙인 것은 스펙 초과이지만 **결과를 바꾸지 않고 결정성만 올린다**(문서당
  approved 1건 = C-21로 상시 확인). 초과이되 무해하다.

## 4. U-1 — chunk 입도 evidence 🟢 **닫음** · 🔴 결론은 「입도를 내려도 얻는 게 없다」

### 4.1 바인딩 — 14좌표 전건 성립

문항 앵커를 내 색인 실물에서 세 겹(**존재·정방향·역방향**)으로 확인했다. 역방향 = 「같은 revision에서
그 문구를 담은 chunk가 정확히 1개인가」 — 2 이상이면 좌표가 판정 기준이 아니라 취향이 된다.

**신설 그물** `tests/data/eval-chunk-binding.sql` + 러너 — **15/15 PASS · exit 0**
(앵커 12 + 부정형 2 + U-1 전제 1). 상세 표는 `benchmarks/datasets/eval-questions-draft.md` **§8**.

### 4.2 🔴 그런데 chunk 입도 지표는 이 코퍼스에서 **변별하지 못한다**

| 실측 | 값 |
|---|---:|
| approved revision | 45 |
| **chunk가 1개뿐인 revision** | **42** |
| 2개 이상 | 3 (`DOC-SOP-0014@r2` 3 · `DOC-MAN-0022@r1` 6 · `DOC-MAN-0021@r1` 8) |
| 문항별 `\|relevant\|` | 1 ~ 3 |

42/45에서 **chunk = 문서**다. 따라서 Recall@K는 K와 무관하게 포화하고, nDCG는 `|relevant|=1`에서
사실상 역순위로 퇴화한다. **「chunk 입도로 계산할 수 있다」와 「chunk 입도가 문서 입도보다 더
말해준다」는 다르다** — 전자는 참이 됐고 후자는 거짓으로 실측됐다.

**권고(E3)**: 정본 입도는 문서·revision 유지 · chunk 좌표는 **인용 추적** 용도. 🔴 지표를 살리려고
동결 정책을 건드리지 않는다(V-1 앵커가 그 위에 결속돼 있고, 그건 인계 ⑴이 금지한 역산이다).
코퍼스가 커지면 축은 저절로 되살아나고, 그 시점은 **B-99**(chunk 1개뿐인 revision 수)가 FAIL로 알린다.

## 5. 판정 요약

| 조각 | Target | Actual | 판정 |
|---|---|---|---|
| ⓐ Q-1 | 20/20 재현 + 기대표 전환 + 전건 exit 0 | 20/20 · 11/11 · 사유 키 일치 · 가드 생존 | 🟢 **F-2 종결** |
| ⓑ Q-4 | ontology 축 STALE + 사유 분리 | 3축 전건 재현 · L-32/L-33 전환 | 🟢 **PASS** (잔여 §2.1) |
| ⓒ 재검수 | 재실행 안전 · manifest 독립 · 005↔spec | 신규/기존 DB exit 0 · 지문 일치 · 정합 | 🟢 **PASS** |
| ⓓ U-1 | chunk 입도 evidence | 14좌표 바인딩 + 그물 15/15 + **포화 판정** | 🟢 **닫음** |

**상시 상태(전건 exit 0)**: `seed-integrity 22/22 · net-liveness 10/10 · eval-chunk-binding 15/15 ·
selfcheck 11/11 · binding-scope 20/20 · probes 6/6 · contract 34/34`

## 6. 남은 것 (닫힌 것으로 계수하지 마라)

| id | 내용 | 소관 |
|---|---|---|
| 신규 | 거울 공란 시 freshness가 FRESH로 «단정» — `ONTOLOGY_UNVERIFIED` 부재(L-34로 고정) | 구현 좌석 |
| 신규 | `ssot_manifest_hash` 정렬이 DB collation 의존 — 지금은 바이트 순서와 동일 실측 | 오케 계수 |
| 신규(경) | `migrate.ps1` 헤더가 `embedding_dim=768` 표시 — 실제 결과는 384 | 구현 좌석 |
| 기존 | spec §4 pgvector 2건 미착지(Q-5 이연) · G-3 전이 그물(이번 폭 밖) | 오케 |

## 7. 재현 방법

```powershell
git worktree add ../_wt/levi2-qverify -b lane/levi2-q-verify develop   # 🔴 주 체크아웃 무접촉
$env:COMPOSE_PROJECT_NAME='fkt-levi2'; $env:POSTGRES_PORT='5534'; $env:PYTHONUTF8='1'
docker compose up -d ; pwsh services/ai-api/db/migrate.ps1

python tests/data/probe_binding_scope.py     # 20/20 · exit 0
python tests/data/selfcheck_mutation.py      # 11/11 · 구멍 0 · exit 0
pwsh tests/data/run-net-liveness.ps1         # 10/10 (L-32 전환 · L-33 사유분리 · L-34 known gap)
pwsh tests/data/run-eval-chunk-binding.ps1   # 15/15 (색인 필요)
```

- 🔴 `ssot_manifest_hash`를 재검할 땐 **구현 좌석 코드를 부르지 마라.** psql로 원자료만 받아
  `LC_ALL=C sort` → 조립 → `sha256sum`으로 따로 내야 「구현이 정의와 어긋나도 두 번 똑같이 어긋나는」
  함정을 피한다.
- 🔴 `-DbName fkt_probe`로 신규 DB 축을 잴 땐 측정 후 반드시 `DROP DATABASE` 한다(내 실행분 정리 완료).
