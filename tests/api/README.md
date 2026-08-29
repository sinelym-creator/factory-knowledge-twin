# tests/api — ai-api 표면 검증 자산 (검증 좌석)

T2-1 독립 검증에서 3종을 세웠고, **T2-2(읽기 3라우트)로 표면이 자라 8종**, T2-3 선행 설계분 3종이 더 붙어 **11종**이 됐다.
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
python tests/api/ssot_write_drill.py            # 지문만 · --run 으로 run 전후 대조
```

환경: `FKT_API_BASE`(기본 `http://127.0.0.1:8000`) · `FKT_NEO4J_CONTAINER`(기본 `fkt-levi2-neo4j-1`)
· `FKT_PG_CONTAINER`(기본 `fkt-levi2-postgres-1`).

🔴 **쓰는 자산 4종**은 전부 기본 꺼짐이고 자기 스택에만 겨눈다 —
`error_shape_drill --cut-neo4j`(컨테이너 정지·재기동) · `dependency_code_drill --cut-postgres`(같음)
· `freshness_badge_drill --inject-stale`(`index_build` 한 행의 `source_sha256` 한 칸 · 원값 복원)
· `citation_roundtrip_drill --inject-drift`(`document_chunk` 한 행의 `text` 한 칸 · 원값 복원).
셋 다 되감기 실측을 «마지막 행»으로 둔다 — 되돌아왔다는 것까지가 측정이다.
`injection_surface_drill` 은 파괴적 payload 를 «던지되» 그것이 통과하면 그게 결함이므로,
마지막 행에서 코퍼스 크기가 그대로인지를 세어 대상 생존을 실측한다.

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
