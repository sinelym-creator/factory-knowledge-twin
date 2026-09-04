# services/projector — 그래프 파생 투영 (T1-5)

PostgreSQL(정본) → Neo4j(파생 투영). 스펙 §2.1 관계표·§4 저장 분담표가 유일 원천이고,
`manifest.py`가 그 두 표의 **코드 정본**이다.

| 파일 | 무엇 |
|---|---|
| `manifest.py` | 투영 manifest — 관계 R01~R25 전수 · 노드 14라벨 · 자기 점검 + **스펙 원문 대조** |
| `build_projection.py` | 삭제 후 재생성 빌드 |
| `verify_projection.py` | 판정(형상·P4·값 대조·S5·회귀 4관계) · `--dump` · `--break-drill` |

---

## 1. 무엇을 저장하고, 무엇을 조회 시점에 파생시키는가

이 질문이 T1-5의 1착이었다. 선례는 003 마이그레이션 주석이다 — 원장에 FK를 걸지 않은 이유,
stale을 열이 아니라 view로 둔 이유. 투영도 같은 질문을 받는다.

| | 무엇 | 왜 |
|---|---|---|
| **저장한다** | §4가 지정한 노드 속성 · §2.1이 ✅로 지정한 관계 23종 | 그래프의 값어치는 «관계»다. 관계는 저장하지 않으면 존재하지 않는다 |
| **파생시킨다** | 판정(신선도·STALE) | 저장하면 원문이 바뀌는 순간 스스로 낡는다 — 낡음을 감지하려고 둔 값이 낡는다(003 선례) |
| | 경로(4-hop) | 저장된 4개 관계에서 «질의»가 만든다. 경로를 노드로 굳히면 관계 하나가 바뀔 때 경로가 조용히 낡는다 |
| | 집계·계수 | 조회가 센다 |
| **올리지 않는다** | `SensorReading`(R05) · `DocumentChunk`(R25) | P4 — 시계열 ≈95만 row와 본문을 올리면 multi-hop이 죽는다 |
| | 본문(`document_revision.body`) | §4 「본문 없음」. 그래프는 hash·승인 상태만 갖는다 |

🔴 **지름길 관계를 만들지 않는다.** 유일한 예외는 R07(`Alarm -ON_EQUIPMENT-> Equipment`)이고,
그것은 스펙이 「역정규화(1-hop 단축용)」이라고 **명시**한 관계다. 편의를 위해 관계를 하나 더
만들면 그래프가 스펙보다 커지고, 그때부터 「무엇이 정본인가」에 답이 둘이 된다.

🔴 **NULL은 «속성 없음»으로 간다.** Neo4j는 null 속성을 저장하지 않는다 — `confidence_note`가
비면 그래프에는 그 키가 아예 없다. 값 대조(verify [4])는 이 규칙을 반영해 비교한다.

---

## 2. 실행

```powershell
# 격리 스택 (🔴 .env 파일 금지 — 인라인 env. dev-environment §4.2)
$env:COMPOSE_PROJECT_NAME='fkt-senku2-t15'; $env:POSTGRES_PORT='5536'
$env:NEO4J_HTTP_PORT='7576'; $env:NEO4J_BOLT_PORT='7589'; $env:VOLUME_ROOT='./.volumes-senku2-t15'
$env:PYTHONUTF8='1'
docker compose up -d
pwsh services/ai-api/db/migrate.ps1
pwsh data/seed.ps1

python -m venv services/projector/.venv
services\projector\.venv\Scripts\python.exe -m pip install -r services/projector/requirements.txt

services\projector\.venv\Scripts\python.exe services\projector\manifest.py --table   # 스펙 대조표
services\projector\.venv\Scripts\python.exe services\projector\build_projection.py
services\projector\.venv\Scripts\python.exe services\projector\verify_projection.py
```

멱등 대조 = 두 번 투영한 뒤 `verify_projection.py --dump` 출력을 diff. 🔴 **계수가 아니라
덤프다** — 노드·관계 수만 맞춰 보면 「수는 같은데 속성이 흔들린」 경우를 놓친다(T1-4에서
벡터 전량 덤프가 잡아낸 자리와 같은 함정).

---

## 3. 투영 버전 기록 (§8.3 ⑦) — 오케 판정 **B안 승인** · 006으로 적용됨

> 판정 2026-08-29: 「§8.3은 «열»이 아니라 «답»을 요구한 것」으로 확정. 기록값 `0.1.0+687448cb` 승인.

### 3.1 두 축을 갈랐다

| 축 | 무엇 | 어디에 |
|---|---|---|
| ① 규칙 | 「무엇을 투영하는가」 = manifest | `packages/ontology/projection-version.json` (정본) |
| ② 실행 | 「언제 무엇으로 만들었는가」 | `graph_build` 원장 (006 · append-only) |

```json
{ "projection_version": "0.1.0",
  "manifest_sha256": "687448cb00f0bc1e8087861bafc012a7dc90113560d2b49a005963b56ec6d06a" }
```

🔴 **SemVer만 두면 사람이 올리는 것을 잊는다**(규칙은 바뀌었는데 버전은 그대로). **지문만 두면**
잊을 수 없지만 사람이 무엇이 바뀌었는지 읽지 못한다. 둘을 함께 두고 `manifest.fingerprint()`와
파일의 `manifest_sha256`이 어긋나면 **빌드가 멈춘다** — 잊을 수 있는 축을 잊을 수 없는 축이
지킨다(004 ontology 거울 「어긋나면 멈춘다」와 같은 형상). 원장 기록값 = `{SemVer}+{지문 8자}`.

### 3.2 `index_build.graph_projection_version`은 **NULL로 남는다**

색인 빌드는 그래프를 **보지 않는다**. 파일에 적힌 값을 옮겨 적으면 투영이 없거나 낡았어도
원장이 「있었다」고 말한다 — 003이 자리표시자를 거부한 것과 같은 거짓이다. 006이 그 열에
COMMENT로 이유를 성문했다(「관측하지 않은 것을 적지 않는다 · 짝 판정은 view가 낸다 ·
기존 행 소급 갱신 금지」).

### 3.3 짝 판정은 조회 시점에 — `v_graph_index_pairing`

```
PAIRED · NO_PROJECTION · PROJECTION_FAILED · ONTOLOGY_MISMATCH
      · GRAPH_STALE · GRAPH_UNVERIFIED · INDEX_BUILD_INCONSISTENT      ← 낡음 2종 = 008(Q-15)
```

- 비교 대상 = **가장 최근 투영 하나**. 그래프는 통째로 재생성되는 단일 현재 상태라, 색인 행마다
  다른 투영이 짝일 수 없다.
- 🔴 **낡음(008)** — `graph_build.source_data_sha256`(빌드 당시 데이터 지문) ↔
  `graph_source_digest(source_scope)`(조회 시점 재계산). 어긋나면 `GRAPH_STALE`,
  원장에 지문이 없으면(008 이전 빌드) `GRAPH_UNVERIFIED`. 둘 다 **재투영 1회로 해소**된다.
  - 지문의 사정거리 = **투영이 읽는 열만**(`manifest.source_scope()` · 노드 속성 + 관계 질의
    select 항목). 그래프에 올리지 않는 열이 바뀐 것은 낡음이 아니다 — 재투영해도 그래프가
    달라지지 않는 변화까지 울리면 운영 중 짝 판정이 영구 적색이 되고, 그러면 아무도 안 본다.
  - `manifest_sha256`이 「**규칙**이 바뀌었는가」, `source_data_sha256`이 「**데이터**가
    바뀌었는가」다. 한 열로 합치면 「재투영하면 되는가 / 스펙을 다시 봐야 하는가」가 갈리지 않는다.
- 🔴 투영 기록이 없으면 `PAIRED`가 아니라 `NO_PROJECTION`이다. 비교 대상이 없는 것을 「맞음」으로
  답하면 설정 누락이 정상으로 둔갑한다(004 거울 공란 규율 · Q-6이 남긴 교훈).
- 🔴 한 색인 빌드 안에서 `ontology_version`이 갈리면 짝 판정보다 먼저 그 모순을 말한다
  (`INDEX_BUILD_INCONSISTENT`) — 뭉개면 어느 쪽이 참인지 모른 채 짝이 맞다고 답하게 된다.

### 3.4 원장이 «모순 행»을 막는다 (index_build 선례)

- 실패한 투영이 노드를 남겼다고 말할 수 없다 · 실패에는 사유가 있어야 한다.
- `projection_version`은 `{SemVer}+{지문 8자}` 형식만 받는다 — SemVer만 적어 넣을 수 없다.
- 🔴 노드·관계에 FK 없음: 원장은 자기가 기술하는 대상보다 오래 산다(003 선례). 대상이 다른
  저장소에 있어 FK를 걸 «수»도 없으므로, 형식(CHECK)으로 못박는다.

---

## 4. 게이트 ⑤ 회귀 최소 대상 성문 — 검증 좌석이 그물로 세울 형태

스펙 §6: **R03·R08·R11·R12가 끊기면 GS-01 S5가 실패한다.** 그물의 요건은 「경로가 산다」가
아니라 **「끊겼을 때 우는가」**다 — 그래서 검출 방식에 대조군을 내장했다.

| 검사 | 무엇 | 어디 |
|---|---|---|
| G-01 | 기대 4-hop 경로 실재 (`EQ-CNC-204 → CP-204-BRG-01 → FM-BRG-WEAR → SOP-BRG-INSP-014 → SAF-LOTO-01`) | `verify_projection.py` [5] |
| G-02~05 | R03·R08·R11·R12 각각 **GS 경로 구간** 1건 이상 — 🔴 전체 계수가 아니라 «그 구간» | [8] |
| G-06 | **끊김 감지력**: 4관계를 하나씩 트랜잭션 안에서 끊고 경로가 0이 되는지 본 뒤 롤백 | `--break-drill` |
| G-07 | P4 라벨 부재(`SensorReading`·`DocumentChunk`) · manifest 밖 라벨 0 | [2] |
| G-08 | PG ↔ 그래프 **값 전량 대조**(속성 값 포함) | [4] |
| G-09 | manifest ↔ 스펙 §2.1 원문 1:1 대조 | `manifest.py --check-spec` |

- 러너로 감쌀 지점 = 두 명령의 **exit code**(0/1): `verify_projection.py` · `--break-drill`.
  `tests/data/run-*.ps1` 선례 그대로 감싸면 그물 1종이 선다(제안 이름 `graph-path-liveness`).
- 🔴 **사유는 코드까지 나온다** — 실패 메시지가 `R11 FailureMode-[:MITIGATED_BY]->SOP`처럼
  어느 관계인지 못박는다. 공유 문구를 쓰면 한 축이 죽어도 다른 축이 잡아 초록으로 보인다.
- 🔴 전체 계수만 보는 검사는 쓰지 마라. R03이 24건이어도 «GS 경로의 그 한 건»이 빠지면
  시나리오는 죽는다. 그래서 G-02~05는 경로 구간을 센다.

---

## 5. 실측 (E1 · 2026-08-29 · 격리 스택 fkt-senku2-t15)

| 항목 | 값 |
|---|---|
| manifest | 관계 25(투영 23 · 제외 2 = R05·R25) · 노드 14라벨 · 지문 `687448cb…6d06a` |
| 투영 | 노드 309 · 관계 448 |
| 멱등 | 삭제 후 재생성 **3회 연속** 덤프 바이트 동일 — 56,310 B · sha256 `d54ca093…f17a7` · diff 0 |
| S5 ⓐ | 기대 4-hop 경로 실재(전체 경로 6건 중 1건이 기대값) |
| S5 ⓑ | `FM-BRG-WEAR -INDICATED_BY-> SN-204-VIB` · `signal_pattern` 실값 있음 |
| S5 ⓒ | 경쟁 후보 `FM-TOOL-IMB` R09 직결 실재 — 🔴 「2순위」는 그래프가 아니라 R15가 갖는 값이고, 실물 rank 2 = `FM-SPDL-OVERHEAT`다(보고 회부분) |
| P4 | 라벨 14종 전수 = manifest와 동일 · `SensorReading`·`DocumentChunk` 부재 |
| 끊김 실증 | R03·R08·R11·R12 전건 — 끊으면 경로 1 → 0, 롤백 후 복구 · 드릴 후 덤프 diff 0 |
| 원장(006) | `graph_build` 1행/실행 · `0.1.0+687448cb` · ontology 0.1.0 · 노드 309 · 관계 448 |
| 짝 판정 | 투영 «전» `NO_PROJECTION` → 투영 «후» `PAIRED`(색인 build 1건 · indexed_revisions 45) |
| 마이그레이션 | 착지 DB 재실행 = 전건 skip exit 0 · 신규 DB 001~006 순차 exit 0 · 신규 DB 재실행 exit 0 |
| 색인 실물 | chunk 59 / revision 45(skipped 15) — 짝 판정을 «실물로» 재려고 색인을 한 번 돌렸다 |

**대조군**(이 검사들이 «실패를 낼 수 있는가»):

| 무엇을 깼나 | 어떤 검사가 울었나 |
|---|---|
| `Component.name`을 `MUTANT`로 변조 | 덤프 diff 1행 · verify [4] 값 대조 FAIL |
| R11 관계 1건 삭제 | verify [1] 계수 · [4] 값 대조 · [5] 경로 · [8] 회귀 구간 — 4축 동시 FAIL |
| manifest R05 투영 플래그 반전 / R11 도착 라벨 변조 / R12 행 삭제 | `--check-spec` 3축 전건 FAIL |
| 변조 상태에서 재투영 | 덤프가 정본 sha로 복귀 — 파생물은 다시 만들면 원상 복구된다 |
| manifest를 고치고 «재투영을 잊음» | 빌드 = 지문 가드로 **정지**(exit 1) · verify [3] 속성 키 · [4] 값 · [9] 원장 지문 — 3축 FAIL |
| `graph_build`에 ontology 0.2.0 투영 주입(롤백) | view `ONTOLOGY_MISMATCH` |
| 실패한 투영 주입(롤백) | view `PROJECTION_FAILED` |
| 모순 행(실패인데 노드 5) · 버전 형식 위반(`0.1.0`) | 스키마 CHECK가 INSERT를 거부 |

🔴 드릴은 전부 **롤백**했다 — 원장에 남은 행은 실제 투영 실행분뿐이다(append-only를 드릴이 더럽히지 않는다).

## 문서 커밋 이후 바뀐 것 (2026-09-04 대조 · 이 파일의 마지막 갱신 = 2026-08-29 `217ddbc`)

| 무엇 | 실물 | 문서에 준 영향 |
|---|---|---|
| 🔴 **rc 가 «보고» 때문에 바뀌지 않는다**(D-47 · `d03b38d` 2026-09-04) | `build_projection.py`·`verify_projection.py` 가 진입에서 `sys.stdout`·`sys.stderr` 를 `utf-8`/`errors="replace"` 로 고정한다. 계기가 된 실측(09-04 09:25): 투영이 **노드 309·관계 448 을 넣은 뒤** 요약 print 에서 죽어 rc 1 로 끝났다 | §2 실행 블록의 `$env:PYTHONUTF8='1'` 은 그대로 권장이다. 다만 이제 이 두 스크립트는 요약 출력의 인코딩 오류로 rc 1 이 되지 않는다 |

§5 의 실측값은 **2026-08-29 의 기록**이다. 위 인코딩 변경은 «문면»이 아니라 «출력 스트림»만 바꿨으므로 그 값들은 그대로 유효하다.
