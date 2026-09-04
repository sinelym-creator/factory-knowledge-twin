# tests/api — I 통합 대장 매핑 (T7-5)

> **자**: 계획 정본 `docs/plan/test-plan-v1.md` §4(I-01~I-12) · 원장 `docs/plan/ticket-ledger.md` T7-5 행.
> **대상 sha** `718231fe53aa84f310cdc8dca006a3e77b1f588b`(`origin/develop`) · **측정 2026-09-04 21:10~21:20 (KST)** ·
> 리바이2 45대.
>
> 🔴 **이 문서가 증명하는 것은 「매핑이 옳다」가 아니라 「내가 읽은 근거가 이렇다」까지다.**
> 대조군이 없는 문서 축이라, 자기 검증은 **재계수 2회 일치**와 **근거 열 명시**로 대신했다.

---

## 0. 실측 요약 — 잰 것 / 안 잰 것

### 0.1 계수 (재계수 2회 일치)

| 축 | 값 | 근거 |
|---|---|---|
| `tests/api/*.py` | **43본** | `ls *.py` 계수 43 · `find -maxdepth 1 -name '*.py'` 계수 43 (2회 일치) |
| `tests/api/*.mjs` | 2본 | `t62_live_cache_boundary.mjs` · `t738_runcap_probe.mjs` |
| 디렉토리 전체 | 46 | py 43 + mjs 2 + `README.md` 1 |

🔴 **정정 — 원장·계획의 「44본」은 `*.py` 계수가 아니다.**
계획 §1 실측 시각(09-04 07:19) 직전 커밋 `73ee3ae` 에서 `git ls-tree` 로 역산하면
`.py` **42** · `.mjs` **1** · `README.md` **1** = **디렉토리 전체 44**.
즉 44 는 «확장자 무관 전체 파일 수»이고, 그 시점 `*.py` 는 42본이었다.
그 뒤 `.py` +1(`t741a_session_runs.py` 09-04 19:02) · `.mjs` +1(`t738_runcap_probe.mjs` 09-04 16:16) · **삭제 0**
(`git log --diff-filter=AD -- tests/api`) ⇒ 현재 `.py` **43**.
**「44본이 있다」는 문면부터 분모가 아니었다.**

### 0.2 pytest 수집 대조 (발주 요구 축)

```
$ python -m pytest tests/api -q --co
no tests collected in 0.01s      (rc = 5)
```

| 축 | 값 |
|---|---|
| pytest 수집 수 | **0** |
| 표 1 행 수 | **43** |
| 대조 | 🔴 **0 / 43 — 전건 불일치** |

**원인(추정 아님 · grep 실측)** — 이 43본은 pytest 자산이 **아니다**.

| 검사 | 결과 |
|---|---|
| `def test_` · `class Test` 를 가진 파일 | **0본** |
| `import pytest` · `from pytest` | **0본** |
| 리포의 pytest 의존 선언(`requirements.txt`·`pyproject.toml`·`pytest.ini`·`setup.cfg`) | **0건** |
| `__main__` 진입 관용구 | **39본** |

⇒ **`__main__` 독립 실행 스크립트 계열**이다(README 의 실행 예시도 `python tests/api/<name>.py` 꼴).
`__main__` 없는 4본 = `_colocation.py` · `_latch_control.py` · `_ownership.py`(공용 모듈) ·
`t62_session_cap_drill.py`(29대 «착지 전 초안» — docstring 자기 신고).

🔴 **그러므로 「수집 수 = 행 수」 대조는 이 자산에 대해 판정력이 없다.**
이 층의 실행 대장은 pytest 가 아니라 **파일별 `__main__` 호출**이며, 그것을 세는 러너는 **아직 없다**(§4 회부 ①).

---

## 1. 표 1 — 파일 → I-번호

**근거 열** = `D` docstring 머리 · `R` `tests/api/README.md` 자산표 · `G` grep 실측 · `—` 근거 없음(미분류).
**마지막 변경** = 🔴 «마지막 초록 실행 일자»가 **아니다**. 그 값의 수집원이 리포에 없어 **안 잰 것**으로 두고,
대신 `git log --name-only` 의 최종 변경일을 참고로 적는다.

| # | 파일 | I-번호 | 덮는 축 (1줄) | 근거 | 마지막 변경 |
|---|---|---|---|---|---|
| 1 | `anchor_boundary_drill.py` | I-01 | 승인된 같은 질문의 표기 변형이 같은 hits 를 내는가 | D·R | 08-31 |
| 2 | `approval_transition_drill.py` | I-01 | 승인 전이 12칸 전수가 계약 정본대로인가 | D·R | 08-31 |
| 3 | `citation_roundtrip_drill.py` | I-01·I-06 | compare 가 낸 근거를 자기가 펴는가 · 인용이 원문의 그 문장인가 | D·R | 09-01 |
| 4 | `error_shape_drill.py` | I-01·I-02 | 오류가 «언제나» 계약 형상인가(`--cut-neo4j` = 의존 단절 축) | D·R | 09-01 |
| 5 | `gs01_integration_drill.py` | I-01 | GS-01 «연쇄» — 앞 단계 산출이 다음 입력으로 실재하는가(13행 한 세션) | D·R | 08-31 |
| 6 | `r12_enforcement_drill.py` | I-01 | 안전 조치를 «서버가» 지키는가(형제 6 + 대조군 + 7번째 탐색) | D·R | 08-31 |
| 7 | `run_surface_drill.py` | I-01 | runs 표면 5 + `?byRun` 이 계약대로 서 있는가 | D·R | 08-31 |
| 8 | `scenario_allowlist_drill.py` | I-01 | `/scenarios` 와 compare 관문이 한 벌인가 · 목록 밖은 닫혔는가 | D·R | 08-31 |
| 9 | `scenario_script_drill.py` | I-01 | 대본대로 도는가 · 0건 단계 통과 금지 | D·R | 08-31 |
| 10 | `t741a_session_runs.py` | I-01·I-08 | `GET /runs?sessionId=`(계약 v0.1.16) 독립 검증 | D | 09-04 |
| 11 | `wo_shape_drill.py` | I-01 | 초안 응답이 «지금 정본»의 형상(12필드)인가 | D·R | 08-31 |
| 12 | `dependency_code_drill.py` | I-02·I-04 | 「의존이 죽었다」와 「우리 코드가 틀렸다」를 다르게 말하는가(`--cut-postgres`) | D·R | 09-01 |
| 13 | `gate5_fidelity_drill.py` | I-02 | Gate 5 «재생 충실도» 비교기 | D | 09-01 |
| 14 | `gate6_failure_drill.py` | I-02·I-11 | Gate 6 «Public Service·Failure» 로컬판(장애·부하 축) | D·G | 09-01 |
| 15 | `q27_replay_wo_drill.py` | I-02 | 재생본 초안 4경로가 «다른 사건»을 다른 말로 하는가 | D·R | 08-31 |
| 16 | `replay_fixture_drill.py` | I-02 | 재생이 «녹화본 그대로»인가 · 없는 것을 복원하지 않는가 | D·R | 09-02 |
| 17 | `t62_owner_switch_drill.py` | I-02·I-06 | 소유자 스위치 live↔replay end-to-end | D | 09-03 |
| 18 | `t42b_capacity_drill.py` | I-03·I-11 | T4-2b ①② 동시성·시간 축 | D·G | 09-01 |
| 19 | `t6_synthesis_latency_drill.py` | I-03·I-06 | 합성 «지연 × 품질» 축 | D | 09-03 |
| 20 | `freshness_badge_drill.py` | I-04 | 색인 «낡음»이 배지가 되어 표면까지 오는가(`--inject-stale`) | D·R | 09-01 |
| 21 | `d24b_wording_drill.py` | I-06 | 스트림 도중 거부의 «사유 문면»이 무엇이 되는가 | D | 09-03 |
| 22 | `session_guard_drill.py` | I-08·I-09 | 계약 v0.1.6 세션 가드 6축(미착지 시 `exit 2`) | D·R | 08-31 |
| 23 | `t42b_lifecycle_drill.py` | I-08 | T4-2b ⑤⑥ 세션 수명 · 강등 | D | 09-01 |
| 24 | `t62_session_cap_drill.py` | I-08·I-11 | T6-2 ④ 세션 run 상한 자극 (⚠ docstring 자기 신고 = «착지 전 초안») | D | 09-03 |
| 25 | `candidates_guard_drill.py` | I-10 | `runCompleted.candidates: minItems 1` 을 **무엇이** 지키는가 | D | 09-03 |
| 26 | `event_schema_drill.py` | I-10 | 이벤트가 스키마 정본 그대로인가 · `seq` 단조 · kind 어휘 | D·R | 08-31 |
| 27 | `t42b_limits_drill.py` | I-11 | T4-2b ③④ 요청 축 보호장치 | D | 09-01 |
| 28 | `t42b_xff_axes_drill.py` | I-11 | D-8/Q-61 «XFF 의 주어» 5축 | D | 09-01 |
| 29 | `_colocation.py` | — 도구 | 판정 앞의 «귀속 증명» 공용 전처리(미증명 = `exit 2`) | D·R | 09-01 |
| 30 | `_latch_control.py` | — 도구 | `_ownership` 의 «자물쇠 안 검사»가 무는지 미는 대조군 | D | 09-01 |
| 31 | `_ownership.py` | — 도구 | 남의 스택을 흔들지 않기 위한 2단 안전장치 | D | 09-01 |
| 32 | `_session.py` | — 도구 | 드릴 공용 «세션 운반» 어댑터(미착지 = 엄격 no-op) | D·R | 08-30 |
| 33 | `d24b_stub_gateway.py` | — 도구 | D-24b 자극용 NDJSON 스텁 게이트웨이 | D | 09-03 |
| 34 | `t61_gateway_stub.py` | — 도구 | T6-1 자극 — 게이트웨이 «자리»에 서는 스텁 | D | 09-02 |
| 35 | `anchor_extraction_probe.py` | — **U 층** | 앵커 «경계 불변식» 단위 시험(서버 불요 · 순수 함수) | D·R | 08-30 |
| 36 | `credential_leak_drill.py` | — 보안 | 자격 증명·내부가 응답·로그로 새지 않는가 | D·R | 09-02 |
| 37 | `cypher_surface_drill.py` | — 보안 | 사용자 문자열이 Cypher 의 «구조»가 되지 않는가 | D | 09-02 |
| 38 | `injection_surface_drill.py` | — 보안 | 사용자 문자열이 «조회 대상을 고르지» 못하는가 | D·R | 08-31 |
| 39 | `prompt_injection_authority_drill.py` | — 보안 | 문서 내부 지시문이 «권한»을 얻지 못하는가 | D | 09-02 |
| 40 | `query_surface_sql_drill.py` | — 보안 | 「질의 문자열」 표면의 SQL negative | D | 09-02 |
| 41 | `ci_hygiene_drill.py` | — 위생 | CI 공개 경계 게이트 3종 전수(첫 빨강에서 안 멈춘다) | D·R | 09-01 |
| 42 | `public_boundary_scan.py` | — 위생 | P6 «공개 경계» 최종 스캔(트리 축 + 이력 축) | D | 09-02 |
| 43 | `ssot_write_drill.py` | — J-3 | 조사 실행이 **SSOT 를 쓰지 않는가** | D·R | 08-30 |

**참고 — `.mjs` 2본**(원장 문면 `*.py` 밖이지만 같은 디렉토리에 있다)

| 파일 | I-번호 | 덮는 축 | 근거 | 마지막 변경 |
|---|---|---|---|---|
| `t62_live_cache_boundary.mjs` | I-02 | `/live/status.online` 의 «캐시 만료 경계»(전환의 순간) | D | 09-03 |
| `t738_runcap_probe.mjs` | I-08 | 세션 단위 조사 실행 상한(계약 v0.1.15) | D | 09-04 |

**검산** — I 대장에 붙은 고유 파일 **28** + 대장 밖 **15** = **43** ✅

---

## 2. 표 2 — I-01~I-12 → 덮는 파일 수

| # | 경계 · 케이스 | 본수 | 파일 | 판정 |
|---|---|---|---|---|
| I-01 | 셸→ai-api 정상 질의 · 응답 형태가 계약과 일치 | **11** | 표 1 #1~#11 | 두꺼움 |
| I-02 | 🔴 ai-api 죽음 → REPLAY 낙하 | **7**(+mjs 1) | #4 #12~#17 | 두꺼움 |
| I-03 | 🔴 응답 지연(>5s) → 타임아웃 후 대체 경로 | **2** | #18 #19 | ⚠ 얇음 |
| I-04 | indexer→PG · 시드 후 `document_chunk` 행 > 0 | **2** | #12 #20 | ⚠ 얇음 · 아래 주 |
| I-05 | projector→Neo4j · 전이 후 그래프 노드·엣지 수 일치 | 🔴 **0** | — | **빈칸** |
| I-06 | synthesis-gateway 정상 합성 · 근거 인용이 실재 문서 | **4** | #3 #17 #19 #21 | 보통 |
| I-07 | 🔴 근거 없음 → 「모른다」 · 지어내지 않는다 | 🔴 **0** | — | **빈칸** · 아래 주 |
| I-08 | 세션 관문(`/enter`) 정상 입장 · 세션 발급 | **4**(+mjs 1) | #10 #22 #23 #24 | 보통 |
| I-09 | 🔴 세션 없이 내부 경로 직접 호출 → 거절·유도 | **1** | #22 | ⚠ 얇음 |
| I-10 | 🔴 스키마 변경 시 케이스 0 속성 FAIL(hygiene strict) | **2** | #25 #26 | ⚠ 얇음 · 아래 주 |
| I-11 | 🔴 동시 요청 · bounded queue · 초과분 거절 형태 | **5** | #14 #18 #24 #27 #28 | 보통 |
| I-12 | 🔴 재부팅 후 컨테이너 자동 복귀 + 파생 색인 생존 | 🔴 **0** | — | **빈칸** |

**분모 표기(§8-1 형식)** — `I 9/12` (덮인 칸 9 · 빈칸 3). 🔴 **이 9 는 「통과 9」가 아니라 「자산이 붙은 칸 9」다.**
각 칸의 마지막 초록 여부는 이 티켓에서 **안 잰 것**(§4).

### 빈칸·얇은 칸 주 (근거는 좁힌 grep · 넓은 히트는 위양성으로 버렸다)

- **I-05 = 0본** — `MATCH (` 히트 4건은 전부 `cypher_surface_drill`·`scenario_allowlist_drill` 의
  **공격 페이로드 문자열**이지 그래프 정합 질의가 아니다. `node_count`·`edge_count` 류 **0건**.
  「Neo4j 를 친다」(키워드 히트 13본)와 「전이 후 수가 맞는지 센다」는 **다른 사실**이다.
- **I-07 = 0본** — 「지어내지 않는다」 문면 히트 중 판정기는 없다. `t61_gateway_stub.py:91` 은
  **스텁이 내보내는 응답 문면**(= 자극 도구)이고, `wo_shape_drill.py:14` 는 «내가 빨강을 지어내지 않는다»는
  **계측기 자기 규율**이다. 🔴 **대상이 근거 0건에서 무엇을 반환하는지 판정하는 자산은 없다.**
- **I-12 = 0본** — `gate6_failure_drill.py:17` 의 「정상 복귀」는 **자기 자극의 되감기(원복)**지
  컨테이너 재기동 복귀가 아니다. 재부팅 축을 자극하는 자산 **0건**.
- **I-04 주** — `document_chunk` 를 만지는 5본 중 `citation_roundtrip`(drift 주입·원복) 과
  `injection_surface`·`query_surface_sql`(공격 문자열) 은 **행 수를 세지 않는다**. 「시드 후 행 > 0」을
  **직접 세는** 자산은 0본이고, #12·#20 은 색인 «상태»를 인접하게 볼 뿐이다 ⇒ 실질 얇음.
- **I-10 주** — 여기 2본은 **이벤트 스키마 준수**를 잰다. §4 문면의 «케이스 0인 속성이 있으면 FAIL(hygiene strict)»
  = 계약 hygiene 러너는 `tests/contract/` 소관이라 이 디렉토리 대장에는 **없다**(경계 밖 — 오케 확인 요).

### 빈칸에 필요한 케이스 — **이름만**(작성은 이 티켓 밖)

| # | 이름(제안) | 한 줄 |
|---|---|---|
| I-05 | `projector_graph_parity_drill.py` | 시드→전이 후 Neo4j 노드·엣지 수를 PG 원천 계수와 대조(표본 0건이면 `exit 2`) |
| I-07 | `no_evidence_abstain_drill.py` | 근거 0건 자극에서 합성이 「모른다」를 반환하는가 · 대조군 = 근거 있는 같은 질의 |
| I-12 | `reboot_recovery_drill.py` | 컨테이너 재기동 후 health 통과 + 파생 색인(`document_chunk`·그래프) 생존 |

---

## 3. 대장 밖 15본 — «남는 것»을 버리지 않는다

| 갈래 | 본수 | 파일 |
|---|---|---|
| 공용 도구·스텁(자산 아님) | 6 | `_colocation` `_latch_control` `_ownership` `_session` `d24b_stub_gateway` `t61_gateway_stub` |
| **U 층** 자산이 여기 있음 | 1 | `anchor_extraction_probe`(서버 불요 · 순수 함수) |
| 보안 축(§32.8) | 5 | `credential_leak` `cypher_surface` `injection_surface` `prompt_injection_authority` `query_surface_sql` |
| 위생·공개 경계 | 2 | `ci_hygiene` `public_boundary_scan` |
| SSOT 불가침(J-3) | 1 | `ssot_write` |

🔴 **결론 — I-01~I-12 대장은 이 디렉토리의 자산을 다 담지 못한다.** 43본 중 **15본(35%)** 이 대장 밖이고,
그중 8본(보안 5 + 위생 2 + J-3 1)은 «도구»가 아니라 **판정 자산**이다.
**대장이 좁은 것이지 자산이 남는 것이 아니다** — 축을 늘릴지는 계획 정본 개정 사항(오케·발주자 몫).

---

## 4. 이 문서의 사정거리 — 안 잰 것을 이름으로

1. **«마지막 초록 실행 일자» = 안 잼.** 리포에 실행 결과 대장이 없어 수집원이 없다.
   표 1 의 날짜는 **파일 최종 변경일**이며 실행과 무관하다.
2. **43본 중 한 본도 이 티켓에서 «실행하지 않았다».** 매핑은 docstring·README·grep **문면 근거**다(E2).
   문면과 거동이 갈릴 수 있다 — 특히 `t62_session_cap_drill.py` 는 스스로 «착지 전 초안»이라 적고 있다.
3. **I-번호 배정은 내 판단이다.** `D`·`R` 근거가 있는 행도 «어느 칸에 넣을지»는 계획 §4 문면과 대조한
   내 독해이며, 복수 칸에 걸친 자산은 주축 + 부축으로 적었다. 이견은 계획 정본이 이긴다.
4. **회부 ① — 이 층에 러너가 없다.** pytest 수집 0 이므로 「I 층을 한 번에 돌린다」는 명령이 존재하지 않는다.
   43본을 `__main__` 으로 하나씩 부르는 목록이 필요하다(별 티켓).
5. **회부 ② — 원장·계획의 「44본」 문면 정정 필요**(§0.1). 정본 수정 권한은 오케.
