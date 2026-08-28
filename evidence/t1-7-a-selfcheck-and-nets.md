---
artifact: t1-7-a-selfcheck-and-nets
ticket: T1-7 A단 — 자기 점검 그물 완결 + 비강제 축 «대신 지키는 것» 성문·실측
owner: 검증(리바이2 4대)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-29
verification_base: develop `ed60d66`
target: tests/data/** · tests/schema/constraint-probes.json · benchmarks/datasets/eval-questions-draft.md
scope_note: B단(재현성·index_build·V-1)은 착수하지 않았다 — 색인 미착지
size_limit: 16KB
---

# T1-7 A단 — 실측과 판정

> 🔴 **B단은 열지 않았다.** `document_chunk` **0행**을 직접 세고 시작했다(E1). 색인이 없는데
> 재현성·`index_build`·V-1 4좌표를 «쟀다»고 적으면 그건 측정이 아니라 서식이다.
> 티켓의 2단 분리는 그 이유로 옳다.

## 0. 방법

| 항목 | 내용 |
|---|---|
| base | `ed60d66` · 작업 브랜치 `lane/levi2-t1-7a` |
| 실행 환경 | 격리 스택 `COMPOSE_PROJECT_NAME=fkt-levi2` · pg 5534 · neo4j 7574/7587 · `VOLUME_ROOT=./.volumes-levi2` — 타 좌석 무접촉 |
| 데이터 | 전임(3대) 존치 볼륨 재사용. 적재 상태를 먼저 실측하고 시작했다 — `equipment 12 · document 45 · document_revision 60 · document_chunk 0` |
| 근거 등급 | 수치는 전부 **E1**(내가 다시 돌린 출력). 소견은 그렇게 표기했다 |
| 인계 주의점 | psql 한국어 본문은 pwsh 파이프를 태우지 않고 직행으로 받았다(3대 CP949 위양성 회귀 방지) |

## 1. 판정 전 게이트 — 도구 생존 확인 (계보 규범)

**죽은 검사기의 초록은 증거가 아니라 결함이다.** 판정에 쓸 도구를 먼저 전부 돌렸다.

| 도구 | 결과 | exit |
|---|---|---:|
| `tests/data/run-seed-integrity.ps1` | 20/20 PASS (C-21·C-22 신설 «전») | 0 |
| `tests/schema/run-probes.ps1` | 6/6 기대대로 · accept 3건(P-3·P-4·P-8) | 0 |
| `tests/data/selfcheck_mutation.py` | 주입 11 · 감지 10 · known gap 1(F-2) · 기대 불일치 0 | 0 |
| `node tests/contract/run.js --strict-coverage` | 34/34 · 자기검증 실패 15건 감지 · 커버리지 37/37 | 0 |

## 2. F-2 — 판정: **전환 불가. 사유 성문 + 구조적 넓이 실측**

### 2.1 결론

| | |
|---|---|
| Target | 주입 11 → 감지 11 (알려진 구멍 0) |
| Actual | 주입 11 → 감지 10 · **known gap 1건 유지** |
| 판정 | 🔴 **이번 대에서 전환 불가** — 처방 위치가 `data/generators/generate.py`의 `self_check`이고, `data/**`는 **구현 좌석 독점 write scope**다(주법 §3). 검증 좌석이 닫으면 lane 규율 위반이다 |

### 2.2 그러나 「1건짜리 구멍」이 아니다 — 넓이를 쟀다 (신설 `tests/data/probe_binding_scope.py`)

`self_check`의 바인딩 검사는 이렇게 생겼다:

```python
ids = {v for rows in tables.values() for r in rows for v in r.values() if isinstance(v, str)}
for key, value in GS.items():
    if value not in ids: fails.append(f"GS 바인딩 ID 누락: {key} = {value}")
```

**전 테이블의 문자열을 한 집합에 부어 «존재»만 본다.** 소유 테이블을 가리지 않는다. 그래서 GS 20키
각각에 대해 **소유 테이블의 `id`만** 바꿔 보고, 판정은 「감지했는가」가 아니라 **「바인딩 검사가
감지했는가」**(사유 대조)로 했다 — GS ID를 바꾸면 D-5·F-1이 먼저 우는 키가 있고, 그 감지를 공로로
계수하면 정작 재려던 축은 미측정으로 남는다.

```
결과: GS 20키 · 바인딩 검사 감지 2건 · 미감지 18건            (E1)
감지 = sensor_cur(그림자참조 0곳) · alarm(0곳)
미감지 18건 = 그림자참조 1~8곳 — 소유 테이블 밖이 옛 문자열을 들고 있어 집합에서 사라지지 않는다
```

🔴 **감지되는 2건은 검사가 그 키를 지켜서가 아니다.** 그 ID를 참조하는 다른 테이블이 «우연히» 0곳일
뿐이다. 다른 테이블이 그 ID를 참조하게 되는 순간 둘 다 조용히 미감지로 넘어간다. **즉 F-2는
equipment 한 건의 누락이 아니라 검사 방식에서 오는 구조적 구멍이며, 현재 사정거리는 20키 중 2키다.**

### 2.3 기존 표에 섞여 있던 착시 1건 (자진 지적)

`selfcheck_mutation.py`의 **「GS 바인딩 ID 변조(부품)」은 감지로 계수돼 있으나**, 그 주입은
`component.id`와 `component_failure_mode.component_id`를 **둘 다** 바꾼다. 문자열이 집합에서 통째로
사라지므로 잡히는 것이다. 소유 테이블의 `id`만 바꾸면 **부품도 미감지**다(§2.2 실측).
표를 고치지는 않았다 — 그 주입은 그 나름의 축(규모 유지 변조)을 재고 있고, 기대표를 손대는 것은
구멍 상태를 바꾸는 일이라 처방 착지와 함께 가야 한다. 대신 README와 본 문서에 성문했다.

### 2.4 회부 — 구현 좌석 처방 (오케 대기열용)

```
파일   data/generators/generate.py · self_check 말미 「GS-01 바인딩 ID 실재」 블록
처방   GS 키 → (소유 테이블, id 칼럼) 대응표를 두고, 그 테이블의 id 집합에서만 찾는다.
       참고 정본이 이미 있다 — tests/data/seed-integrity.sql C-1이 정확히 그 방식(테이블별 지목)이다
착지 후 ① selfcheck_mutation.py의 F-2 행 기대를 True로 ② probe_binding_scope.py의
       EXPECTED_DETECTED를 전 키 True로 — 둘 다 검증 좌석이 같은 조각에서 닫는다
검증   probe_binding_scope.py가 «20/20 감지»를 내면 닫힌 것이다. 그 전엔 아니다
```

## 3. G-4b·G-2 «비강제 의도» 검사 — 주장 vs 실물

표본의 규칙은 그 파일이 스스로 적어 두었다: **「무엇이 대신 지키는가»가 why에 적혀 있지 않은
accept는 눈감기다」**. 그래서 적혀 있는 것을 **읽지 않고 실행**했다.

### 3.1 G-4b (옛 P-5·P-6 → C-10·C-11) — 🟢 주장과 실물 일치

| | |
|---|---|
| 주장 | 「스키마 CHECK로 불가 → tests/data C-10·C-11이 데이터에서 본다」 |
| 실물 | C-10·C-11 실재 · 22/22 PASS · **생존 실측 L-10·L-11 PASS**(위반 주입 시 각 1건 적발) |
| 판정 | **PASS** — 대신 지키는 것이 있고, 살아 있다 |

### 3.2 G-2 (P-3 · expect=accept) — 🔴 **주장이 그물보다 넓었다**

| | |
|---|---|
| 주장(정정 전) | 「실제 데이터가 지키는지는 tests/data **C-4**가 본다(**45문서 전부** 인용 가능 revision 1건 실측)」 |
| 실물 | 🔴 **C-4는 `WHERE document_id='DOC-SOP-0014'` — 한 문서만 본다.** 45문서를 지키는 검사는 **없었다** |
| 사실 대조 | 45문서 전부 인용 가능 revision **1건**이라는 «사실»은 맞다(E1 · 분포 실측 `1건→45문서`) · 겹침 **0** |
| 판정 | **사실은 참 · 그물은 부재** = expectSemantics 기준 **눈감기**. 신설로 닫았다 |

🔴 **이것이 이 축을 실행해 봐야 하는 이유다.** 두 문장은 같은 초록을 낸다 — 「45문서가 지켜진다」와
「45문서를 «검사가» 지킨다」. 전자만 참인 상태에서 생성기가 바뀌면 아무도 울지 않는다.

### 3.3 신설한 그물 (tests/** = 검증 좌석 scope)

| id | 무엇을 | 기대 | 실측 |
|---|---|---:|---:|
| **C-21** | 전 문서 «지금 인용 가능 revision»이 정확히 1건이 아닌 문서 | 0 | 0 |
| **C-22** | approved revision 유효구간이 서로 겹치는 문서 | 0 | 0 |

**둘 다 필요하다 — 서로를 대신하지 못한다**(실측으로 보였다):

| liveness | 주입 | 기대 | 실측 | 판정 |
|---|---|---:|---:|---|
| L-10 | component 소속 어긋남 | 1 | 1 | PASS |
| L-11 | sensor 소속 어긋남 | 1 | 1 | PASS |
| L-21 | 인용 가능 revision 0건 문서 | 1 | 1 | PASS |
| L-22 | 유효구간 겹치는 approved 2건 | 1 | 1 | PASS |
| **L-22b** | 🔴 **같은 겹침 주입에서 C-21이 잡는 건수** | 0 | 0 | PASS(=C-22 대체 불가) |
| L-0 | 되감기 확인(주입 후 4그물 합계) | 0 | 0 | PASS |

`net-liveness.sql`은 **쓴다** — 검사 1건 = 트랜잭션 1개(`BEGIN … ROLLBACK`)이고 마지막 `L-0`가
잔여물 0을 실측한다. `seed-integrity.sql`의 읽기 전용 성질은 건드리지 않았다(러너도 분리).

### 3.4 G-3 (P-4) — 부채 존치 · why는 정확도만 올렸다

전이 자체는 스냅숏으로 볼 수 없으므로 그물이 없다는 기존 판단은 유지한다. 다만 **전이의 관측 가능한
결과**는 이제 C-21이 잡는다 — `approved → draft`로 내리면 그 문서의 인용 가능 revision이 0건이 되고
C-21이 운다(L-21이 정확히 그 주입이다). 「전이를 막는다」와 「망가진 결과를 적발한다」는 다르므로
**부채는 존치**하고, why에 그 구분만 성문했다. (참고 실측: 최신 revision이 아닌데 approved/draft인 행 = **0**)

## 4. benchmarks §7 stale 정정 — 1곳이 아니라 6곳이었다

오케 승인 범위는 「§7 소조각」이었으나, **같은 stale이 같은 파일 6곳에 있었다.** 1곳만 고치면 파일이
계속 거짓을 말한다(오케 재승인 수령 후 전량 처리 · 2026-08-29).

| # | 위치 | 무엇이 stale이었나 | 조치 |
|---|---|---|---|
| 1 | §7 자진신고 1 | 「◇ 5건이 여전히 E4」 — §5는 이미 「잔여 존치 0」 | 취소선 + 정정 성문(원문 보존 · §0.2 원칙) |
| 2 | §0.4 등급표 | 「E4 = ◇ 항목」 일괄 매핑 | 「◇ 中 **미충족분**」으로 좁힘 |
| 3 | §2 `Q-DIRECT-002` | ◇ 의존에 충족 표기 없음 | 충족(E1) + 상설 그물 C-5 병기 |
| 4 | §2 `Q-DIRECT-003` | 〃 | 충족(E1) + C-3·C-4 병기 |
| 5 | §2 `Q-MULTIHOP-003` | 〃 | 충족(E1) + C-6·C-7 병기 |
| 6 | §2 `Q-SAFETY-001` | 〃 | 충족(E1) + C-8 병기 |

> `Q-MULTIHOP-002`(D-8)는 이미 갱신돼 있었다 — 그 한 곳만 최신이었기에 나머지 4곳의 부정합이
> 오히려 눈에 띄었다.

🔴 **그러나 「0」이라고 쓰지 않았다.** 정정하며 **다른 성질의 미결 1건**을 발견해 §6 U-7로 올렸다:
`Q-SAFETY-001`의 앵커가 아직 자리표시자(`DOC-SAF-xxxx`·`DOC-SAF-yyyy`·`SAF-PPE-nn`)다.
실값은 실측했다(E1) — `SAF-LOTO-01 → DOC-SAF-0029@r3` · `SAF-PPE-01 → DOC-SAF-0030@r3`.
**치환은 문항 본문 변경이라 좌석이 임의로 하지 않는다 — 오케 판정 영역이다.**
「데이터 요구 미충족」과 「앵커 미확정」을 한 칸에 섞으면 다음 사람이 또 stale을 읽는다.

## 5. 판정 요약

| A단 항목 | Target | Actual | 판정 |
|---|---|---|---|
| ① benchmarks §7 stale 정정 | 승인분 1곳 | **6곳 전량**(오케 재승인) + 미결 1건 신규 성문 | 🟢 **완료** |
| ② F-2 해소 | 주입 11 → 감지 11 | 감지 10 유지 · **전환 불가 사유 성문 + 넓이 18/20 실측 + 처방 회부** | 🟡 **티켓 대체 분기로 완료** (해소 아님) |
| ③ G-4b·G-2 비강제 의도 검사 | 대신 지키는 것 성문·실측 | G-4b 일치(PASS) · **G-2 부재 적발 → C-21·C-22 신설 + 생존 6/6** | 🟢 **완료** |

**A단 착지 후 상시 상태**: `seed-integrity 22/22 · net-liveness 6/6 · selfcheck 11주입/10감지 ·
binding-scope 20키/감지 2 · probes 6/6 · contract 34/34` — 전건 exit 0.

## 6. 남은 것 (닫힌 것으로 계수하지 마라)

| id | 내용 | 소관 |
|---|---|---|
| F-2 | 바인딩 검사 사정거리 2/20 — 처방은 `data/generators/generate.py` | **구현 좌석**(오케 발주 대기) |
| U-7 | `Q-SAFETY-001` 앵커 자리표시자 3종 확정(실값 실측 완료) | **오케 판정** |
| G-3 | `approved → draft` **전이 자체**를 보는 그물 없음 — 서비스 계층 쓰기 경로 시점 | 존치 부채 |
| B단 | 재현성 2회 diff 0 · `index_build` 스키마↔spec 재대조 · V-1 4좌표(0-based) | **T1-4 ④ 착지 후** |

## 7. 재현 방법

```powershell
$env:COMPOSE_PROJECT_NAME='fkt-levi2'; $env:POSTGRES_PORT='5534'
$env:NEO4J_HTTP_PORT='7574'; $env:NEO4J_BOLT_PORT='7587'; $env:VOLUME_ROOT='./.volumes-levi2'
docker compose up -d

pwsh tests/data/run-seed-integrity.ps1      # 22/22 PASS · exit 0
pwsh tests/data/run-net-liveness.ps1        # 6/6 PASS  · exit 0 (주입 후 롤백)
python tests/data/selfcheck_mutation.py     # 주입 11 · 감지 10 · exit 0
python tests/data/probe_binding_scope.py    # 20키 · 감지 2 · exit 0
pwsh tests/schema/run-probes.ps1            # 6/6 · exit 0
node tests/contract/run.js --strict-coverage
```

- 🔴 `$env:PYTHONUTF8='1'` 없이 python 표본을 파이프로 받으면 CP949로 깨진다(내가 1차에 밟았다).
- 🔴 psql로 한국어 본문을 받을 때 pwsh 파이프를 태우지 않는다 — 3대의 hash 위양성 회귀 경로다.
- 🔴 `net-liveness`는 쓴다. 다른 좌석 스택에 겨누지 마라 — 롤백하더라도 그 스택에 락을 건다.
