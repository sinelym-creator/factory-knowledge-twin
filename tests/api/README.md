# tests/api — ai-api 표면 검증 자산 (검증 좌석)

T2-1 독립 검증에서 3종을 세웠고, **T2-2(읽기 3라우트)로 표면이 자라 8종**, T2-3·T2-4·T2-5 로 다시 자라 **21종**이 됐다(Q-30 = CI 게이트 축 · T2-6 = «연쇄» 축 · T3-6 선행 = 세션 가드 축).
🔴 표면이 자랐는데 표가 안 자라면 그것은 「내가 안 본다」는 뜻이다. 판정 근거는
`evidence/t2-1-retrieval-verification.md`(T2-1) · `evidence/t2-2-reading-verification.md`(T2-2).

| 자산 | 무엇을 재는가 | 대상 | 서버 | 티켓 |
|---|---|---|---|---|
| `anchor_boundary_drill.py` | 승인된 «같은 질문»의 표기 변형이 **같은 hits** 를 내는가 | HTTP 표면 | 필요 | T2-1 |
| `anchor_extraction_probe.py` | 앵커 **경계 불변식** — ID 뒤에 무엇이 붙어도 잘리지 않는가 | `app.retrieval.anchors` | 불요 | T2-1 |
| `error_shape_drill.py` | 오류가 **언제나** 계약 «형상»(`{error:{code,message}}` JSON)인가 | HTTP 표면 | 필요 | T2-1·T2-2 |
| `citation_roundtrip_drill.py` | compare 가 낸 근거를 **자기가 펴는가** · 인용이 **원문의 그 문장**인가 | HTTP 표면 | 필요 | T2-2 |
| `scenario_allowlist_drill.py` | `/scenarios` 와 compare 관문이 **한 벌**인가 · 목록 «밖»은 닫혀 있는가 | HTTP 표면 | 필요 | T2-2 |
| `freshness_badge_drill.py` | 색인 «낡음»이 **배지가 되어 표면까지** 오는가 | 뷰 정본 + HTTP | 필요 | T2-2 |
| `dependency_code_drill.py` | 의존 단절을 «서비스 결함»과 **다른 코드**로 말하는가 | HTTP 표면 | 필요 | T2-2 |
| `injection_surface_drill.py` | 사용자 문자열이 **조회 대상을 고르지** 못하는가(보안) | HTTP 표면 | 필요 | T2-2 |
| `event_schema_drill.py` | 이벤트가 **스키마 정본** 그대로인가 · `seq` 단조 · kind 어휘 | 스키마 정본 + HTTP | 일부 | T2-3 |
| `credential_leak_drill.py` | 자격 증명·내부가 **응답·로그로 새지** 않는가 | 계약 정본 + HTTP | 필요 | T2-3 |
| `ssot_write_drill.py` | 조사 실행이 **SSOT 를 쓰지 않는가**(J-3) | psql 지문 | 일부 | T2-3 |
| `run_surface_drill.py` | runs 표면 5 + `?byRun` 이 계약대로 서 있는가 · 중지가 **타임라인도 닫는가** | HTTP 표면 | 필요 | T2-3 |
| `scenario_script_drill.py` | 대본대로 도는가 · **0건 단계 통과 금지** · 낸 근거를 kind 별 소비처로 펴는가 | 스키마·대본 정본 + HTTP | 필요 | T2-3 |
| `replay_fixture_drill.py` | 재생이 **녹화본 그대로**인가 · 없는 것을 복원하지 않는가 · **심사기가 우는가** | fixture 정본 + HTTP | 필요 | T2-4 |
| `approval_transition_drill.py` | 승인 전이 **12칸 전수** · 위반의 사유가 갈리는가 · **침묵 금지** | 계약 정본 + HTTP | 필요 | T2-5 |
| `r12_enforcement_drill.py` | 안전 조치를 **서버가** 지키는가 · 형제 6 + 대조군 + **7번째 탐색** | 스펙·판정 + HTTP | 필요 | T2-5 |
| `wo_shape_drill.py` | 초안 응답이 **지금 정본**의 12필드인가(v0.1.4 9 + v0.1.5 3 · 매 실행 추출) | 계약 정본 + HTTP | 필요 | T2-5 |
| `q27_replay_wo_drill.py` | 재생본 초안 **4경로**가 한 코드로 «다른 사건»을 말하는가 + 대조군 2 | 판정 정본 + HTTP | 필요 | T2-5 |
| `ci_hygiene_drill.py` | CI 공개 경계 게이트 **3종 전수** — 🔴 첫 빨강에서 멈추지 않는다 | `ci.yml` 정본 + 추적 파일 | 불요 | Q-30 |
| `gs01_integration_drill.py` | 🔴 **연쇄** — 앞 단계 산출이 다음 단계 «입력으로 실재»하는가(13행 한 세션) | baseline §21 + HTTP | 필요 | T2-6 |
| `session_guard_drill.py` | 계약 v0.1.6 가드 6축 — 🔴 **가드 미착지면 초록도 빨강도 안 낸다**(exit 2) | 계약 정본 + HTTP | 필요 | T3-6 |
| `_session.py`(자산 아님 · 공용) | 드릴 «세션 운반» 어댑터 — 미착지 = 엄격 no-op · 착지 후 자동 활성 | — | 선택 | T3-6 |
| `_colocation.py`(자산 아님 · 공용) | 🔴 **판정 앞의 귀속 증명** — 저 서버가 «이 트리»를 읽는가(미증명 = exit 2) | fixture 자극 + HTTP | 필요 | Q-42 |

```
python tests/api/anchor_boundary_drill.py       # 리포 루트에서
python tests/api/anchor_extraction_probe.py
python tests/api/error_shape_drill.py           # 도달 가능한 오류 경로만
python tests/api/error_shape_drill.py --cut-neo4j   # + 런타임 의존 단절(자기 스택 한정)
python tests/api/citation_roundtrip_drill.py
python tests/api/citation_roundtrip_drill.py --inject-drift   # + 정합 파열 주입(쓴다 · 원복 포함)
python tests/api/scenario_allowlist_drill.py
python tests/api/freshness_badge_drill.py       # 배지 매핑 상태표만(쓰기 없음)
python tests/api/freshness_badge_drill.py --inject-stale   # + 실주입 왕복(쓴다 · 원복 포함)
python tests/api/dependency_code_drill.py       # 기준선만
python tests/api/dependency_code_drill.py --cut-postgres   # + 의존 단절(자기 스택 한정)
python tests/api/injection_surface_drill.py     # 적대 입력 10종 × 문 3
python tests/api/event_schema_drill.py --samples-only   # 서버 없이 검증기 자기 검증만
python tests/api/credential_leak_drill.py --log <서버 로그>
python tests/api/ssot_write_drill.py            # 지문만 · --run 으로 run 전후 대조 · --wo 로 초안 편집·승인 전후 + 공장 WO 조준
python tests/api/run_surface_drill.py
python tests/api/scenario_script_drill.py
python tests/api/replay_fixture_drill.py --no-deps   # + 의존 없이 띄운 앱 열(쓴다: fixture 를 잠시 치웠다 되돌린다)
python tests/api/approval_transition_drill.py
python tests/api/r12_enforcement_drill.py
python tests/api/wo_shape_drill.py
python tests/api/q27_replay_wo_drill.py
python tests/api/ci_hygiene_drill.py       # 서버 불요 · 세 게이트 전부 보고
python tests/api/gs01_integration_drill.py  # GS-01 한 세션 완주 · 끊기면 그 자리에서 죽는다
python tests/api/session_guard_drill.py     # 🔴 T3-1 가드 착지 «후»에만 판정(그 전엔 exit 2)
python tests/api/_session.py                # 어댑터 자기 검증(no-op 갈래 + 활성 모의 대조군)
```

환경: `FKT_API_BASE`(기본 `http://127.0.0.1:8000`) · `FKT_PYTHON`(기본 = 대상 리포의 `.venv` — 🔴 worktree 에서 검수할 때 반드시 준다. 없으면 드릴이 없는 venv 를 찾다 WinError 2 로 죽고, 그 빨강은 «대상»의 것이 아니다) · `FKT_NEO4J_CONTAINER`(기본 `fkt-levi2-neo4j-1`)
· `FKT_PG_CONTAINER`(기본 `fkt-levi2-postgres-1`).

🔴 **쓰는 자산 4종**은 전부 기본 꺼짐이고 자기 스택에만 겨눈다 —
`error_shape_drill --cut-neo4j`(컨테이너 정지·재기동) · `dependency_code_drill --cut-postgres`(같음)
· `freshness_badge_drill --inject-stale`(`index_build` 한 행의 `source_sha256` 한 칸 · 원값 복원)
· `citation_roundtrip_drill --inject-drift`(`document_chunk` 한 행의 `text` 한 칸 · 원값 복원)
· `replay_fixture_drill`(fixture 를 «치웠다 되돌린다» — 부재 상태를 실제로 만들기 위함 · 되감기에서 sha 동일 확인).
셋 다 되감기 실측을 «마지막 행»으로 둔다 — 되돌아왔다는 것까지가 측정이다.
`injection_surface_drill` 은 파괴적 payload 를 «던지되» 그것이 통과하면 그게 결함이므로,
마지막 행에서 코퍼스 크기가 그대로인지를 세어 대상 생존을 실측한다.

## 🔴 그물이 «남의 스택»을 물지 않게

`ssot_write_drill` 은 한때 컨테이너를 **이름 기본값**으로 골랐다. 다른 좌석이 자기 스택에서
돌렸을 때 조용히 이 좌석의 DB 를 물었고 — 오류도 경고도 없었다. env 필수화로 끝내지 않고
**「같은 것을 보고 있다」의 증명**으로 바꿨다: API 가 말하는 문서 해시와 지문 뜰 DB 의 해시를
대조해 어긋나면 `exit 2`. 대상을 이름으로 «믿지» 않고 실측으로 «확인»한다.

### Q-40 — 같은 함정이 fixture 에서 한 번 더 물었다

`replay_fixture_drill` F-11 이 「fixture 를 치웠는데 200」을 냈고, 그것이 「서버가 없는 것을
있다고 말한다」로 읽혔다. 실측해 보니 **서버가 읽는 fixture 는 내가 치운 파일이 아니었다** —
다른 트리의 것이었다. 대상은 멀쩡했다(판정 `evidence/q40-replay-fixture-attribution.md`).

`FKT_SERVER_REPO` 는 그 답을 «주장»할 뿐이라 값이 틀려도 아무 말이 없었고, **내용 대조로는
갈리지 않는다** — 트리마다 같은 커밋의 같은 fixture 라 바이트가 같아서 남의 트리를 읽어도
F-02~F-05 가 전부 초록이다. 빈 결과끼리의 일치가 일치가 아니듯, **같은 파일끼리의 일치도
귀속을 증명하지 않는다.**

그래서 본 시험 앞에 «자극»으로 묻는 단을 세웠다: 내 fixture 를 한 칸 고쳐 그 값이 재생본에
나오는가. 안 나오면 **`exit 2`(측정 불가)** — F-11 의 빨강도 초록도 대상의 것이 아니기 때문이다.

### Q-42 — 그 단을 «전부»에 세웠다 (`_colocation.py`)

같은 함정은 이 드릴 하나의 것이 아니었다. 서버를 만나는 드릴은 전부 `FKT_API_BASE` 가 가리키는
서버를 **누구 것인지 묻지 않고** 재고 있었다. 그래서 Q-40 의 단을 공용 전처리로 옮기고,
서버를 만나는 **모든** 드릴이 첫 줄로 부른다(`ssot_write_drill` 은 제외 — 문서 해시 대조로
이미 「같은 것을 보고 있다」를 증명한다).

```python
import _colocation
_colocation.require()      # 서버를 만나기 «전» 한 줄 · 미증명이면 그 자리에서 exit 2
```

- **자극은 replay fixture 다.** 그 파일은 서버가 리포에서 **직접 읽는 유일한 자산**이라,
  드릴이 무엇을 재든 「저 서버가 이 트리를 읽는가」를 한 문장으로 답한다. 한 칸을 고쳐 그 값이
  재생본에 나오는지 보고, 원 바이트를 되돌린 뒤 **sha 를 다시 확인**한다(되감기는 `finally`
  라 `KeyboardInterrupt` 로 죽어도 돈다).
- 🔴 **미증명 = `exit 2`(측정 불가)이지 FAIL 이 아니다.** 「아직 안 만들었다」를 결함으로 세지
  않는 것과 같은 규율이다.
- 🔴 **부작용: replay run 이 1건 는다**(세션 sandbox 데이터 · SSOT 아님). run 을 «세는» 축이
  있는 드릴은 이 **+1** 을 기준선에 넣어야 한다 — 부재를 세는 축이 오독하지 않게.
- 🔴 **드릴은 직렬로 돌린다.** 전처리가 fixture 를 잠시 흔들기 때문에 **프로세스 간 잠금**
  (임시 폴더의 `fkt-colocation-*.lock` · `O_EXCL`)을 쥐고 돈다. 잠금을 못 얻으면 무한 대기
  하지 않고 90초 뒤 **`exit 2`** 로 나간다(죽은 실행이 남긴 잠금이면 그 파일을 지운다).
- `_colocation.py` 를 **단독 실행**하면 그 자체가 자기 검증이다 — 맞춘 트리 `exit 0` ·
  어긋난 트리 `exit 2`.

## 🔴 미해제(501)는 red 가 아니다

T2-3 자산 3종은 계약에 있으나 아직 안 열린 라우트를 만나면 **skip 하거나 `exit 2`(측정 불가)**
로 죽는다. 「아직 안 만들었다」를 결함으로 세면 그 표는 착지 전까지 계속 빨갛고, 그 빨강 속에서
**진짜 빨강이 묻힌다**. 판정 규칙표의 exit 2 가 그 자리다.

## 🔴 그물이 자기 그림자를 물지 않게

`injection_surface_drill` 은 첫 실행에서 red 3행을 냈다 — 오류 message 가 되비친 **내
payload**(`… UNION SELECT * FROM document_revision …`)가 내 누출 표지에 걸린 것이다.
대상이 흘린 것이 아니라 내가 던진 것이었다. 판정 전에 내 입력을 지우고(`residue()`),
자기 검증에 「반사된 payload 는 누출이 아니다」 행을 세워 그 착각을 표에 못박았다.
**빨강도 그 주어를 물어야 한다.**

## 세 가지 규율

**① 정본에서 다시 뽑는다.** 질문은 구현의 `allowlist.py` 가 아니라
`benchmarks/datasets/eval-questions-draft.md` 에서 매 실행 **내 파서로** 뽑는다. 구현의 목록을
입력으로 쓰면 「같은 목록끼리 맞다」만 확인하게 된다.

**② 그물이 «빨강을 낼 수 있는지» 먼저 증명한다.** 세 자산 모두 본 시험 앞에 자기 검증을 둔다 —
`anchor_boundary_drill` 은 서로 다른 두 승인 질문이 실제로 다르게 보이는지, `error_shape_drill` 은
계약 이탈 표본 3종을 실제로 걸러내는지, `anchor_extraction_probe` 는 **정정 전 정규식을 다시 만들어
자기 표에 걸어** 본다(옛 결함을 못 잡는 표는 약한 표다). 자기 검증이 실패하면 exit **2** —
결과가 아니라 «측정 불가»다.

**③ 빈 결과를 초록으로 읽지 않는다.** 🔴 실제로 한 번 물렸다: neo4j 재기동 직후 아직 질의를 받지
못하는 창에서 전 문항 graphrag 가 0건이었고, 변형끼리는 «전부 일치»라 그물이 초록이었다.
`anchor_boundary_drill` 은 이제 기준 표기의 vector hits 가 0이면 exit 2 로 죽고, 총 hits 를
«생존 신호»로 출력한다. **빈 결과끼리의 일치는 일치가 아니다.**

## 🔴 두 앵커 자산이 «따로» 있는 이유

V-1 정정은 두 겹이다 — ⓐ `anchors._ID_RE` 의 경계를 문자집합으로 잠갔고, ⓑ `service.compare` 가
승인 즉시 `allowlist.canonical(qid)` 로 표준 표기 하나로 모은다.

ⓑ 가 있는 한 HTTP 로는 어떤 표기를 보내도 하류가 같은 문자열을 본다. 그래서
**`anchor_boundary_drill` 의 초록은 이제 「경계가 옳다」가 아니라 「표기가 모인다」를 뜻한다** —
누군가 ⓐ 를 되돌려도 그 그물은 초록으로 남는다. 초록이 «무엇의» 초록인지 갈리는 자리라서,
ⓐ 를 직접 재는 `anchor_extraction_probe` 를 따로 세웠다.

그 대가로 probe 는 대상 모듈을 import 한다(도구가 대상에 결합하면 대상이 바뀔 때 함께 죽는다).
경계 불변식이 그 함수 안에만 살아 있어 밖에서 관측할 표면이 없기 때문이며, 결합 범위를 순수 함수
하나로 좁히고 임포트가 깨지면 그 자체를 실행 오류로 죽인다.

## 판정 규칙

| exit | 뜻 |
|---:|---|
| 0 | 전건 기대대로 |
| 1 | 어긋남 1건 이상 — 대상의 결함이다 |
| 2 | **실행 오류** — 그물이 죽었거나 대상이 서 있지 않다. 「초록도 빨강도 아니다」 |

`error_shape_drill --cut-neo4j` 는 **쓴다** — 컨테이너를 정지했다 되돌리고, 마지막 `E-0` 가
되감기(health `healthy` + compare 200)를 실측한다. 기본은 꺼져 있고, 타 좌석 스택에 겨누지 않는다.


## 세션 운반 어댑터 (T3-6 선행 · 계약 v0.1.6)

가드가 착지하면 세션을 안 든 드릴은 **한꺼번에 401** 로 죽는다. 그 빨강은 대상의 것이 아니므로,
착지 «전»에 운반 경로를 깔아 뒀다 — 18종이 `_session.prepare(body, path)` 를 지난다.

- **미착지 = 엄격 no-op.** `POST /sessions` 가 501 이면 어댑터는 받은 객체를 **그대로** 돌려준다
  (사본조차 만들지 않는다). 오늘의 초록이 흔들리지 않는다는 뜻이고, 자기 검증이 그 «객체 동일성»을 잰다.
- **착지 후 = 자동 활성.** 드릴을 다시 고치지 않는다. 바뀌는 것은 둘뿐 — 쿠키 헤더 부착 ·
  본문 `sessionId` «값» 치환. 경로·메서드·그 밖의 키는 손대지 않는다.
- 🔴 **활성 갈래도 대조군이 있다.** 서버로는 아직 못 재므로 상태를 «모의»해 코드 경로로 잰다
  (쿠키 부착 · sessionId 값만 치환 · 타 키 무변 · 제외 라우트 맨몸 · 호출자 dict 무오염).
  서버가 그 쿠키를 실제로 받아들이는가는 **착지 후 `session_guard_drill` 의 몫**이다.
