# T5-5 — Gate 1~8 «근거 경로 표» 초안 (문서 대조 · 판정 아님)

> 🔴 **이 문서는 재검증이 아니다.** 아무 자극도 주지 않았고, 아무 그물도 돌리지 않았다.
> 리포 트리(`origin/develop` `cd8dcfa`)의 **파일을 읽어** baseline §32 의 각 정본 항목이
> 「어느 판정문에 어떻게 적혀 있는가」를 **옮겨 적은 지도**다.
>
> - **「상태」 열 = 전언이다.** 그 판정문이 그렇게 적었다는 뜻이지, 오늘 다시 초록이 났다는 뜻이 아니다.
>   재실행 가능한 축은 T5-5 본 판정에서 **다시 돌려야** Actual 이 된다.
> - **결론 범위 = 아래 §0.2 에 나열한 «읽은 파일» 뿐이다.** 그 밖은 보지 않았다.
> - 🔴 **「못 찾음 ≠ 없음」** — 표의 `불명` 은 「그 축의 판정이 존재하지 않는다」가 아니라
>   「내가 읽은 파일들에서 그 항을 겨눈 문장을 찾지 못했다」는 뜻이다. 없다고 계수하지 않는다.
> - 🔴 **빈 칸의 종류를 섞지 않는다** — `미충족`(정본이 요구하나 자산이 없다) · `미측`(자산은 있으나
>   그 축의 판정문이 없다) · `로컬만`(외부/배포 축이 비어 있다) · `불명`(문서 대조로 못 가름)은 서로 다른 말이다.
>
> 검증 좌석 리바이2 **24대** · 기점 `origin/develop` `cd8dcfa` · lane `lane/levi2-t55-gate-map` ·
> 발주 = 스자쿠 17대(2026-09-01 · 「T5-5 Gate 근거 표 초안」) ·
> 정본 = `docs/baseline/poc-baseline-v0.2.md` **§32.1~32.11**(:1757~1890) · **§35.1~35.7**(:2228~2305) ·
> 티켓 `docs/plan/tickets/T5-5.md`.

---

## §0 방법과 근거 등급

### 0.1 등급

| 무엇 | 등급 | 어떻게 얻었나 |
|---|---|---|
| 파일·경로의 실재(그물·판정문·workflow·LICENSE 계열) | **E1** | `git ls-files` · `ls` 로 `cd8dcfa` 트리에서 실측 |
| 각 항의 «판정»(PASS/FAIL·측정값·조건) | **E2** | 해당 판정문 인용 — 본 문서가 다시 재지 않았다 |
| Gate 단위 계수·조건부 사유 | **E3** | 내 소견(§3) |

### 0.2 읽은 파일 (이것이 결론의 경계다)

- `docs/baseline/poc-baseline-v0.2.md` §32.1~32.11 · §35.1~35.7
- `docs/plan/tickets/T5-5.md`
- `docs/plan/ticket-ledger.md` — 🔴 **grep 만**(Q/D 상태 열·Phase 4·5 티켓 상태 열). 전문 미독.
- `.workspace/drafts/baseline-v0.3-scope-cut-draft.md`(축소 안 초안 · §6 = T5-5 축소판 정의)
- `evidence/` 전 42본의 **제목행** + 다음 6본의 판정 표: `t4-4-external-gate6-verification.md` ·
  `t4-4-external-outage-verification.md` · `t4-3-public-rc-verification.md` ·
  `t2-4-replay-verification.md` · `t2-6-phase2-integration-verification.md` ·
  `t4-2a-static-replay-verification.md` · `t4-2b-live-guard-verification.md` · `t2-3-workflow-verification.md`(grep)
- 트리 목록: `tests/**`(E1 · 그물 실재) · `benchmarks/**` · `.github/workflows/**` · 루트 LICENSE 계열 · `README.md:130~144`

### 0.3 읽지 «않은» 것 (그래서 표에 `불명` 이 남는다)

- `evidence/` 42본 중 위 8본 밖의 **본문**(제목행만 읽었다) — 특히 T1 계열·T3 계열의 항목별 판정 문장.
- `packages/contracts/**` 계약 정본 본문 · `apps/**`·`services/**` 구현 코드.
- 원장 전문 · 각 티켓 파일(T5-5 제외).

---

## §1 Gate 1~8 근거 경로 표

범례 — **PASS**: 그 판정문이 PASS 라 적었다(전언) · **조건부**: PASS 이나 판정 범위·조건·미결 Q 가 붙어 있다 ·
**미측**: 자산은 있으나 그 축을 겨눈 판정문이 없다 · **미충족**: 정본이 요구하는 자산 자체가 없다 ·
**로컬만**: 로컬 축만 서 있고 외부/배포 축이 비어 있다 · **불명**: §0.3 때문에 문서 대조로 못 가름.

### 1-1. Gate 1 — Contract (§32.2)

| 정본 항목 | 판정문·그물 경로 | 상태 | 사유 1줄 |
|---|---|---|---|
| OpenAPI request/response | `evidence/t1-8-api-skeleton-verification.md` · `evidence/t2-1·t2-2·t2-3` · `tests/web/contract_surface_drill.mjs` · `tests/web/surface_scan.mjs` | **조건부** | 계약 정본 확정은 Q-47 ✅ 종결(§13.1 머리 = `packages/contracts` 정본), 그러나 **Q-33 미결** — REST 응답 «형상 전면» 하네스 부재 |
| WebSocket event | `tests/contract/run.js` · `tests/contract/validator.js` · `tests/contract/cases/agent-events.cases.json` | **조건부** | t2-6 = 34/34 (E2) · **Q-65 ✅ 종결**(PR#285) 이나 그 사유가 「validator 가 `type` 배열을 검사하지 않았다」 — 그물이 계약보다 낡았던 전례 |
| LangGraph state | `evidence/t2-3-workflow-verification.md` | **PASS**(전언) | S-01 이벤트 32건 전건 스키마 준수 · 스키마 밖 필드 0 |
| Replay fixture | `evidence/t2-4-replay-verification.md` · `tests/api/replay_fixture_drill.py` | **PASS**(전언) | 판정 = PASS(`2a29a47`) · Q-40 ✅ 종결(F-11 원인 = 귀속) |
| Evidence·Work Order schema | `evidence/t2-5-verification.md` · `tests/api/wo_shape_drill.py` | **PASS**(전언) | WO 초안 CRUD·승인·R12 축 |
| error code·error body | `tests/api/error_shape_drill.py` · `evidence/t2-1`·`t2-3` | **조건부** | 형상 축 PASS(전언) · **Q-34 미결**(`/evidence` 가 「없는 근거」와 「안 다루는 kind」에 같은 404) · Q-24 미결(`DEPENDENCY_ERRORS` 광포착) |
| 〔완료기준〕 Backend schema → Frontend type 생성 | — | 🔴 **불명** | 읽은 파일에서 이 축을 겨눈 판정 문장을 찾지 못함(§0.3) — 없다고 계수하지 않는다 |
| 〔완료기준〕 Live·Replay 동일 validator 통과 | `tests/api/gate5_fidelity_drill.py`(#248) · `evidence/t2-4` | **조건부** | 그물 실재(E1) · Gate 5 재실증 자체가 미측(1-5) |
| 〔완료기준〕 잘못된 field·enum·JSON type negative 실패 | `tests/api/event_schema_drill.py` · `error_shape_drill.py` · `injection_surface_drill.py` | **조건부** | 그물 실재(E1) · Gate 1 축 판정문으로 한 자리에 모인 적 없음 |
| 〔완료기준〕 Contract 변경 시 관련 test 실패 | `.github/workflows/ci.yml`(hygiene 3 step 중 contract tests) | **조건부** | 게이트 실재(E1) · Q-65 계보 = 「계약은 옳았고 지키는 쪽이 없었다」 — 검사기 커버리지가 축 자체 |

### 1-2. Gate 2 — Data·SSOT Integrity (§32.3)

| 정본 항목 | 판정문·그물 경로 | 상태 | 사유 1줄 |
|---|---|---|---|
| Asset ID unique | `evidence/t1-1-schema-verification.md` · `evidence/t1-2-seed-verification.md` · `tests/data/seed-integrity.sql` | **PASS**(전언·항목별 문장 미대조) | Phase 1 완결분(원장 ✅) · 항목 단위 인용은 §0.3 밖 |
| relation endpoint 존재 | `evidence/t1-2` · `evidence/t1-5-graph-projection-verification.md` | **PASS**(전언) | 〃 |
| Document ID·revision·hash 일치 | `evidence/t1-3-document-verification.md` | **PASS**(전언) | 〃 |
| pgvector metadata source 일치 | `evidence/t1-3` · `evidence/t1-7-b-index-reproducibility.md` | **PASS**(전언) | 〃 |
| Neo4j node·relationship source 일치 | `evidence/t1-5` · `tests/data/neo4j-dump-compare.mjs` | **PASS**(전언) | 〃 |
| stale index 검출 | `evidence/t1-7-a-selfcheck-and-nets.md` · `tests/api/freshness_badge_drill.py` | **조건부** | **Q-20 미결**(«STALE 인데 검색됨» 노출 경로 — 배지 표면은 `/evidence`·`/documents` 로 한정) |
| pgvector·Neo4j 삭제 후 SSOT 재생성 | `evidence/t1-7-b-index-reproducibility.md` | **PASS**(전언) | 〃 |
| 재생성 logical digest 일치 | `evidence/t1-7-b` · `tests/api/ssot_write_drill.py` | **PASS**(전언) | 〃 |
| 🔴 〔배포 인스턴스 축〕 | `docs/plan/ticket-ledger.md` **D-16**(✅ 종결 19:21 · PR#343) | **로컬만** | D-16 = 배포 DB `document_chunk` **0행** → 공개 Live `step_failed:vector`(≈2h45m). 위 8항의 주어는 **로컬 SSOT** 이고 배포 인스턴스는 다른 주어다 — T5-5 본 판정은 **배포 쪽 지문을 따로** 찍어야 한다 |

### 1-3. Gate 3 — Retrieval Quality (§32.4)

| 정본 항목 | 판정문·그물 경로 | 상태 | 사유 1줄 |
|---|---|---|---|
| Direct retrieval | `evidence/t2-1-retrieval-verification.md` | **조건부** | 3전략 축 판정(전언) · 평가셋 없이 «질문 단위» 축 |
| 유사 설비 disambiguation | `evidence/t2-1` | **조건부** | **Q-19 미결**(hybrid 이웃 정렬 사전순 한계 — 낱말 사전 부재) |
| Multi-hop | `evidence/t2-1` · `evidence/t1-5` | **조건부** | graph 경로 축은 서 있음(전언) |
| Revision conflict | `evidence/t2-2-reading-verification.md` · `evidence/t1-3` | **불명** | 이 항을 겨눈 문장을 읽은 범위에서 확인 못함 |
| Safety rule | `evidence/t2-5-verification.md`(R12 서버측 강제) · `tests/api/r12_enforcement_drill.py` | **PASS**(전언) | 승인 차단 축은 Gate 4 와 공유 |
| Unanswerable question | `evidence/t2-3-workflow-verification.md`(`insufficient_evidence`) | **불명** | 코드 존재는 §32.5 완료기준에 있으나 Gate 3 축 판정 문장 미확인 |
| Golden Scenario = 모든 정답 근거·안전 규정 | `evidence/t2-6-phase2-integration-verification.md` · `tests/api/gs01_integration_drill.py` | **PASS**(전언) | GS-01 13행 PASS · 검색 3단계 근거 0건 단계 없음(structured 9·vector 5·graph 5) |
| 🔴 전체 평가셋 = §29·§30 target 충족 | `benchmarks/` = **`datasets/eval-questions-draft.md` 1본뿐**(E1) | 🔴 **미충족** | 40문·4전략·5회 반복 raw·자동 계산기 **자산 자체가 없다**(T5-1 미착지) — 대체 수치를 만들지 않는다 |

### 1-4. Gate 4 — Agent Workflow (§32.5)

| 정본 항목(negative case) | 판정문·그물 경로 | 상태 | 사유 1줄 |
|---|---|---|---|
| 설비를 찾을 수 없음 | `evidence/t2-3-workflow-verification.md` | **불명** | 판정문 본문 미독(§0.3) — 항목별 대조는 T5-5 본 판정 몫 |
| 센서 데이터 부족 | `evidence/t2-3` | **불명** | 〃 |
| Vector 결과 없음 | `evidence/t2-3` | **불명** | 〃 |
| Neo4j 연결 실패 | `evidence/t2-3` · `tests/api/gate6_failure_drill.py` | **로컬만** | Gate 6 로컬 열에 「200 `mode=replay` · 강등 통과」(전언) · Agent 축 판정 문장 미확인 |
| 문서 revision conflict | `evidence/t2-3` | **불명** | 〃 |
| Safety rule 조회 실패 | `evidence/t2-3` · `tests/api/r12_enforcement_drill.py` | **불명** | 〃 |
| structured output validation 실패 | `evidence/t2-3` · `tests/api/event_schema_drill.py` | **불명** | 〃 |
| 승인 대기 중 재접속 | `evidence/t2-5` · `evidence/t3-5-wo-screen-verification.md` | **조건부** | 화면 축 착지(전언) · Agent negative 축으로 계수된 적 확인 못함 |
| 동일 요청 중복 | `tests/api/t42b_lifecycle_drill.py` · `evidence/t4-2b-live-guard-verification.md` | **조건부** | 서버 축 PASS(전언) · 「동일 `run_id` 중복 처리 방지」 문장 대조 미완 |
| timeout·retry | `evidence/t4-2b` §5(② timeout·자리 반환 **PASS**) | **PASS**(전언) | 계약 `:150` 축 |
| 승인 전 Commit 시도 | `tests/api/r12_enforcement_drill.py` · `approval_transition_drill.py` · `evidence/t2-5` | **PASS**(전언) | 전이 12칸 전수 + 서버 강제 |
| 〔완료기준〕 근거 부족 시 `insufficient_evidence` | `evidence/t2-3` | **불명** | 〃 |
| 〔완료기준〕 Safety 실패 시 승인 차단 | `evidence/t2-5` | **PASS**(전언) | R12 서버측 강제 |
| 〔완료기준〕 retry 가 중복 WO 를 만들지 않음 | `evidence/t4-2b` · `tests/api/t42b_lifecycle_drill.py` | **불명** | 자리 반환은 PASS(전언) · WO 중복 축 문장 미확인 |
| 〔완료기준〕 승인·반려가 audit 에 기록 | `evidence/t2-5` · `evidence/t3-5` | **조건부** | 화면·서버 축 착지(전언) · 🔴 T5-5 정본이 요구하는 **audit summary 동반 Gate 5 재실증**은 미측(1-5) |

### 1-5. Gate 5 — Live·Replay Equivalence (§32.6)

| 정본 항목 | 판정문·그물 경로 | 상태 | 사유 1줄 |
|---|---|---|---|
| 재생 왕복 · 논리 일치(node 순서·evidence ID·diagnosis·WO·approval·audit) | `evidence/t2-4-replay-verification.md`(**PASS** · `2a29a47`) · `tests/api/gate5_fidelity_drill.py`(#248) | **조건부** | 판정 PASS 는 **T2-4 축**(재생 왕복 판정식 J-C)이다 — T5-5 정본이 요구하는 「**live 1회 신규 녹화 ↔ replay**」 재실증은 **미측** |
| graph path 논리 일치 | `docs/plan/ticket-ledger.md` **Q-43**(미결 · 상태 = 「T5-5 Gate 5 재실증 시 판정」) | 🔴 **미측** | replay 모드 `GET /graph/paths/{runId}` = **501 `replay_path_source_absent`** ↔ live 200·5건 — **원장이 이 판정을 T5-5 로 미뤄 놓았다** |
| 비결정 필드 제외 규칙 | `evidence/t2-4` · `evidence/q40-replay-fixture-attribution.md` | **PASS**(전언) | `ts` 무손질 · WS≡REST |
| 이벤트 밖 부산물(WO 본문 등) | **Q-27** — 서버 축 ✅ 종결 · 잔여 = 「Phase 3 replay 화면 판정만」 | **조건부** | 4경로 501 단일 코드 + T2-6 404/200 대조(전언) · 화면 축 잔여 |

### 1-6. Gate 6 — Public Service·Failure (§32.7 8행)

🔴 **두 판정문이 있고 이름이 헷갈린다** — `t4-4-external-gate6-verification.md` 는 제목행 스스로
「**골격(판정 아님)**」이라 적혀 있고(외부 열 일부만 채워짐), T4-4 의 **정본**은
`t4-4-external-outage-verification.md`(원장 T4-4 상태 열이 그렇게 지목)다. 아래는 두 파일을 합쳐 옮긴 것이다.

| §32.7 행 | 기대(정본) | 외부 축 판정문 | 상태 | 사유 1줄 |
|---|---|---|---|---|
| 노트북 OFF | Public UX·Replay 정상 | `t4-4-external-gate6-verification.md` §1 | **PASS**(외부·전언) | `/api` 전건 차단에도 정적 replay 완주(§5.1) |
| FastAPI OFF | Offline 표시·Replay 전환 | `t4-4-external-outage-verification.md` **§7**(22대 · 09-01 18:40~18:45) | **PASS**(외부·전언 · 조건 §7.5) | 8행 전건 PASS · 502 · 0.87~2.86초 · 본문 1120→193자(83%↓)는 조건 §7.5① |
| PostgreSQL OFF | Live 원인 표시·Public UX 유지 | 외부 = *Not measured* · 로컬 열만(gate6 골격 §1) | **로컬만** | 로컬 「live→200 `mode=replay` · 셸 200」을 외부 칸으로 옮기지 않는다 |
| Neo4j OFF | Graph 제한 또는 명확한 실패 | 외부 = *Not measured* · 로컬 열만 | **로컬만** | 로컬은 «강등» 쪽 통과(전언) |
| Tunnel OFF | bounded timeout 후 Offline 판정 | `t4-4-external-outage-verification.md` §1(21대) | **조건부**(외부) | Offline·빈화면 아님·health/live 500·복구 = PASS · 🔴 `POST /enter` **20.0초** = **Q-70 회부**(미결) · 「Replay 전환」 행은 **기준선에서 이미 참 = 판정력 없음** |
| WebSocket 중단 | 재연결 또는 상태 재조회 | `t4-4-external-gate6-verification.md` §5.2 | **PASS**(외부·전언) | 1011 events 1 ↔ 1000 events 0 · 재연결 1회 관측 |
| Model timeout | 안전 종료·Replay 안내 | 외부 = *Not measured* · 로컬 = `evidence/t4-2b` §5 | **로컬만** | 서버 축 PASS(전언)를 외부 칸에 올리지 않는다 |
| 동시 요청 초과 | queue 또는 Replay 안내 | 외부 = *Not measured*(골격 §4.3 = 「18대 보고 있으나 근거 미확인」) · 로컬 = `evidence/t4-2b` §4 | **로컬만** | 골격이 명시적으로 「`Not measured` 로 둔다」고 못 박음 |
| 〔T5-5 추가 축〕 재부팅 후 Gate 6 재확인 | — | 🔴 **미충족** | T5-4(운영 runbook·자동 시작) **미착지** — 원장 상태 = 「티켓 선작성」 |
| 〔T5-5 추가 축〕 restart recovery | `evidence/t4-3-public-rc-verification.md`(제목행 = 🔴 **부분**) | 🔴 **미측** | T4-3 은 「AC ④ 재부팅 1회 실측 **반쪽**」만 섰다고 스스로 적음 · 나머지 AC 4행 = Not measured |

### 1-7. Gate 7 — Security·Abuse (§32.8 13항)

🔴 **Gate 7 을 겨눈 판정문은 0본이다.** T5-2 미착지(원장 상태 = 「티켓 선작성」). 아래 「기존 판정문」은
**T2-2·T3-1·T4-2b·T4-1·T2-5 각 축의 판정**이지 Gate 7 축의 판정이 아니다 — 같은 그물이라도 **판정의 주어가 다르다**.

| # | §32.8 항 | 그물(E1 · 트리 실재 확인) | 인용 가능한 판정문 | 상태 |
|---|---|---|---|---|
| ① | SQL injection | `tests/api/injection_surface_drill.py` ✔ | `evidence/t2-2-reading-verification.md`(#117) | **부분** — 경로 파라미터 30건 축 · 질의 문자열(`compare q`) 표면은 그물 없음(축소 안 §3 ①) |
| ② | Cypher injection | **없음**(`tests/graph/graph_drill.py` 는 정합 축) | — | 🔴 **미충족** |
| ③ | 문서 내부 Prompt Injection | **없음** | — | 🔴 **미충족** |
| ④ | 임의 tool 호출 | `tests/api/scenario_allowlist_drill.py` ✔ | `evidence/t2-2`(#117) | **미측**(Gate 7 축 재실행 필요) |
| ⑤ | 관리자 endpoint 접근 | **없음**(계약 밖 0 = 「문이 계약에 없다」이지 「접근이 막힌다」가 아니다) | — | 🔴 **미충족** |
| ⑥ | 다른 session 접근 | `tests/api/session_guard_drill.py` ✔ · `tests/web/e2e/t3-6-isolation-walk.spec.ts` ✔ | `evidence/t3-1-session-guard-verification.md`(#149·#248) | **미측**(재실행) |
| ⑦ | oversized request | `tests/api/t42b_limits_drill.py` ✔ | `evidence/t4-2b`(#250) | **미측**(재실행) |
| ⑧ | 반복 요청·rate limit | `t42b_limits_drill.py` ✔ · `t42b_capacity_drill.py` ✔ · `t42b_xff_axes_drill.py` ✔ | `evidence/t4-2b`(#250) · Q-61 ✅(PR#257) · Q-60 | **조건부** — 로컬 프록시 형상에서 IP 축이 «전역 상한»으로 발현(Q-60) |
| ⑨ | 잘못된 WebSocket message | **없음**(`t44_gate6_d_ws_recovery.mjs` 는 중단·재연결 축) | — | 🔴 **미충족** |
| ⑩ | path traversal | `tests/api/injection_surface_drill.py` ✔ | `evidence/t2-2`(#117) | **미측**(재실행) |
| ⑪ | CORS 우회 | `tests/web/t41_cors_browser_drill.mjs` ✔ · `_origin_page_server.mjs` ✔ | `evidence/t4-1-public-shape-verification.md` §3 | **미측**(재실행 · 외부 축은 T4-3 승계) |
| ⑫ | stack trace·environment 노출 | `tests/api/error_shape_drill.py` ✔ · `credential_leak_drill.py` ✔ | `evidence/t2-1`·`t2-3`(#108·#117) | **조건부** — Q-49(서버 로그 traceback·절대경로) 미결 · Q-23(오류 message 반사) 미결 |
| ⑬ | 승인 우회 | `tests/api/r12_enforcement_drill.py` ✔ · `approval_transition_drill.py` ✔ | `evidence/t2-5`(#137) | **미측**(재실행) |
| 〔유지〕 | git «이력» secret scan | `tests/api/ci_hygiene_drill.py` ✔ · `.github/workflows/ci.yml` | Q-30 ✅ · D-15 ✅(PR#332) | **조건부** — 이력 포함 scan 판정문 없음 |

### 1-8. Gate 8 — Portfolio Claim (§32.9 8주장)

🔴 **정본이 요구하는 산출물(주장 ↔ Evidence 대응표) 자체가 아직 리포에 없다.** 아래는 그 표의 «후보 근거»다.

| 주장 | 필요한 Evidence(정본) | 후보 근거 경로 | 상태 |
|---|---|---|---|
| GraphRAG 적용 | 실제 Neo4j query·사용 graph path | `evidence/t2-1` · `evidence/t1-5` · `tests/graph/graph_verify.py` | **미측**(근거 있음 · 대응표 미작성) |
| SSOT 기반 | revision·hash·derived index 상태 | `evidence/t1-7-b` · `tests/api/ssot_write_drill.py` | **미측**(〃) |
| Human-in-the-loop | 승인 전후 state·audit | `evidence/t2-5` · `evidence/t3-5` | **미측**(〃) |
| 공개 접근 | 외부 네트워크 접속 결과 | `evidence/t4-4-external-outage-verification.md` · `evidence/t4-3`(부분) | **조건부** — 외부 실측은 있으나 T4-3 판정 자체가 «부분» |
| Offline fallback | 노트북 OFF 상태 replay | `evidence/t4-2a-static-replay-verification.md`(AC 전건 PASS) · `t4-4-external-gate6` §1 | **PASS**(전언) |
| 정확도 향상 | 동일 dataset 전략별 결과 | **없음**(benchmarks 미착지) | 🔴 **미충족** — 이 주장은 **하지 않는 것**이 유일한 정합 처리 |
| 안전한 Agent | security·workflow negative result | Gate 7 판정문 **0본** | 🔴 **미측** |
| 재현 가능 | clean seed·index·run command | `evidence/t1-7-b`(로컬 index 재현) · clean env 타 경로 재현 **미실행** | **부분** |

---

## §2 §35.1~35.6 점검표 골격 (근거 경로 후보 · 채움은 본 판정 몫)

> 🔴 각 `[ ]` 는 **비어 있다**. 아래 「후보 근거」는 「이 항을 어디서 재게 될 것인가」의 좌표이지
> 충족 표시가 아니다. §0.2(측정-주장 경계) — **못 채운 항은 빈 채로 둔다.**
>
> 어휘(§1 과 다르다 — 여기는 «점검표를 채울 재료가 있는가»를 적는다): **근거 있음** = 그 항을 겨눈
> 판정문·그물이 있다(채우려면 재실행) · **부분** = 축의 일부만 · **로컬만** = 외부/배포 축 없음 ·
> **조건부** = 미결 Q 가 붙음 · **미측/미충족** = §1 과 같은 뜻 · **🔴 빈 칸** = 재료 자체가 없다.

### 2-1. §35.1 Product (7항)

| # | 항목 | 후보 근거 | 현 상태(전언) |
|---|---|---|---|
| 1 | 공개 URL 이 노트북 OFF 에서도 정상 표시 | `t4-4-external-gate6` §1 · `t4-2a` | 근거 있음 |
| 2 | Golden Scenario 를 설명 없이 실행 | `t2-6` · clean env 축 | 부분(로컬) |
| 3 | Live·Replay status 가 사실대로 표시 | `evidence/q69-shell-mode-observation.md` · Q-69 ✅(문면 PR#345) | 조건부 |
| 4 | 주요 navigation·button·form 동작 | `t3-2`·`t3-3`·`t3-4`·`t3-5` · `tests/web/e2e/**` | 근거 있음 |
| 5 | Vector·Hybrid·GraphRAG 결과 비교 | `t3-4`(화면 축) · 수치 축 = **없음** | 🔴 화면만 |
| 6 | Evidence·Graph path drill-down | `t3-3` · Q-43 미결 | 조건부 |
| 7 | WO 승인·반려·audit 동작 | `t3-5` · `t2-5` | 근거 있음 |

### 2-2. §35.2 KPI·Benchmark (9항) — 🔴 **전항 빈 칸**

`benchmarks/` = `datasets/eval-questions-draft.md` **1본**(E1). Ground Truth 고정·40문×4전략·5회 raw·
Hit@K/Recall@K/MRR/nDCG 계산기·Target↔Actual 분리 표 — **자산이 없다.** T5-1 미착지.
🔴 축소를 이유로 이 표를 «잠정 목표»로 채우지 않는다.

### 2-3. §35.3 Latency·Reliability (7항)

| # | 항목 | 후보 근거 | 현 상태 |
|---|---|---|---|
| 1 | Client·Network·Queue·Server·Model latency 분리 | `evidence/q45-web-timing-inventory.md` · `evidence/d12-enter-retry-verification.md` | 부분 |
| 2 | P50·P95 측정 | — | 🔴 빈 칸 |
| 3 | Cold·Warm 공개 | Q-44(콜드스타트 30s · ✅ 종결 계보) | 부분 |
| 4 | concurrency 1·2·3·5 | `tests/api/t42b_capacity_drill.py` · `t4-2b` §4 | 로컬만 |
| 5 | Admission control·Queue 동작 | `t4-2b` §4 | 로컬만 |
| 6 | 노트북·API·DB·Graph·Tunnel 장애 실제 재현 | Gate 6 표(1-6) | 외부 3행 · 로컬 4행 |
| 7 | Live 장애 시 Replay fallback | `t4-2a` · `t4-4-outage` §7 | 근거 있음 |

### 2-4. §35.4 Security (7항)

| # | 항목 | 후보 근거 | 현 상태 |
|---|---|---|---|
| 1 | SQL·Cypher injection negative 통과 | ① 부분(`injection_surface_drill`) · ② **그물 없음** | 🔴 미충족(Cypher) |
| 2 | 문서 Prompt Injection 이 tool authority 미획득 | **그물 없음** | 🔴 미충족 |
| 3 | 다른 session 접근 불가 | `session_guard_drill.py` · `t3-1` | 미측(재실행) |
| 4 | Public admin endpoint 차단 | **그물 없음** | 🔴 미충족 |
| 5 | Rate limit·request size limit | `t42b_limits_drill.py` · Q-60 | 조건부 |
| 6 | stack trace·secret·environment 미노출 | `error_shape_drill.py`·`credential_leak_drill.py` · Q-49 미결 | 조건부 |
| 7 | Git history secret scan 통과 | `ci_hygiene_drill.py` · D-15 ✅ | 🔴 판정문 없음 — **비가역 축이라 뺄 수 없다** |

### 2-5. §35.5 GitHub·License (7항)

| # | 항목 | 실측(E1 · `cd8dcfa` 트리) | 현 상태 |
|---|---|---|---|
| 1 | Repository Public | 트리 밖(리포 설정 · 폐하 관문) | 불명(본 문서 범위 밖) |
| 2 | `LICENSE` 에 Apache-2.0 전문 | `LICENSE` **존재** | 근거 있음(전문 대조 미실시) |
| 3 | `NOTICE` 공개 영문명·연도 확정 | 🔴 **파일 없음** | 🔴 **미충족** |
| 4 | `THIRD_PARTY_NOTICES.md` | 🔴 **파일 없음** | 🔴 **미충족** |
| 5 | model weight·DB volume·credential 미포함 | `ci.yml` public boundary scan · `credential_leak_drill.py` | 조건부 |
| 6 | GitHub Actions required check 통과 | `.github/workflows/` = `ci.yml`·`security.yml` **2본**(E1) · required 지정 = 리포 설정 | 부분 |
| 7 | README 주장 ↔ Evidence 일치 | `README.md:138` = 「설계 단계 완료 · 구현 진행 중 … 측정 전 수치는 어떤 것도 성능으로 주장하지 않습니다」 · **KPI 수치 0**(E1) | 조건부 — 🔴 **문면이 배포 상태보다 낡았다**(공개 셸은 이미 서 있다) |

### 2-6. §35.6 Portfolio (8항) — 🔴 폐하·오케 몫으로 분리

영상 2종·Architecture diagram·KPI 결과표·trade-off 설명 = **검증 좌석 산출물이 아니다.**
검증이 잴 수 있는 것은 2항뿐: 「외부 모바일 네트워크에서 공개 URL 확인」(`tests/web/e2e/t4-4-viewport-mobile.spec.ts` ·
`t4-4-external-outage`) · 「clean seed·index·run 이 README 만으로 재현」(**미실행**).

---

## §3 계수 (E3)

### 3-1. Gate 단위

| 구분 | 수 | 어느 Gate |
|---|---|---|
| **서 있는 Gate**(전항 근거 + PASS 전언 + 조건 없음) | 🔴 **0** | — |
| **조건부**(PASS 전언이 있으나 범위·미결 Q·주어 불일치가 붙음) | **5** | Gate 1 · Gate 2 · Gate 4 · Gate 5 · Gate 6 |
| **빈 칸**(미측·미충족) | **3** | Gate 3(평가셋 미충족) · Gate 7(판정문 0본) · Gate 8(대응표 미작성) |

### 3-2. 항목 단위 — §1 표 **78행 전수** 계수

> 계수 방법: §1 의 8개 표 전 행에서 「상태」 값을 세었다(78행 = 10+9+8+15+4+10+14+8). 합이 78 로 닫힌다.

| 상태 | 수 | 비고 |
|---|---|---|
| PASS(전언) | **20** | 🔴 재실행 없이 Actual 로 올리지 않는다 |
| 조건부 | **20** | 조건·미결 Q 를 판정문에 **함께** 옮겨야 한다 |
| 미측(자산 있음·판정 없음) | **12** | Gate 7 대부분 + Gate 8 |
| 불명(내 읽기 범위 밖) | **11** | 대부분 Gate 4 negative — T5-5 본 판정에서 `t2-3` 본문 대조로 해소 |
| 🔴 미충족(자산 없음) | **7** | Cypher · prompt injection · admin endpoint · malformed WS · 평가셋 · 재부팅 축 · Gate 8 「정확도 향상」 |
| 로컬만 | **6** | Gate 6 4행 + Gate 2 배포 축 + Gate 4 Neo4j 행 |
| 부분 | **2** | Gate 7 ① SQL(경로 파라미터만) · Gate 8 「재현 가능」 |

§1 표 **밖**의 미충족 2건(§2-5): `NOTICE` · `THIRD_PARTY_NOTICES.md` — 트리에 파일 없음(E1).

---

## §4 이 대조에서 나온 어긋남 3건 (회부 아님 · 오케 확인 요청)

1. 🔴 **축소 안 §6 의 Gate 6 근거 파일 지목이 갈린다.** 초안은 근거를
   `evidence/t4-4-external-gate6-verification.md` — 「§32.7 8행 중 외부 실측 PASS **2행**」으로 적었으나,
   그 파일은 제목행 스스로 「**골격(판정 아님)**」이고, T4-4 **정본**은 원장이 지목한
   `evidence/t4-4-external-outage-verification.md` 다. 정본까지 합치면 외부 PASS 는
   **노트북 OFF · WebSocket 중단 · FastAPI OFF(§7 · 22대) 3행 + Tunnel OFF 조건부 1행**이다.
   ⇒ 축소 안 §6 의 「2행」은 **FastAPI OFF 실측(09-01 18:40~18:45) 전에 쓰인 값**으로 보인다. 갱신 요청.
2. 🔴 **§35.5 두 항이 자산 부재로 미충족**(`NOTICE` · `THIRD_PARTY_NOTICES.md` 둘 다 트리에 없음 · E1).
   축소 안에 이 두 항의 처리가 없다 — 공개 리포의 라이선스 축이라 **판정 전에 결정이 필요**하다.
3. 🔶 **Q-43 이 「T5-5 Gate 5 재실증 시 판정」으로 원장에 예약돼 있다.** 축소 안 §6 은 Gate 5 를
   「재확인 1축」으로 줄였는데, 그 1축이 Q-43(graph path 501)을 포함하는지 **명시가 없다**.
   포함하지 않으면 Q-43 은 판정처를 잃는다.

---

## §5 다음 조각에 남기는 것

- 본 표의 `불명` 9칸 → `evidence/t2-3-workflow-verification.md` 본문 대조로 해소(읽기만 · 자극 0).
- `PASS(전언)` 20칸 중 **재실행 가능한 축**은 T5-5 본 판정에서 다시 돌린다 — 전대의 값은 전언이다.
- Gate 6 「로컬만」 4행: 외부 칸으로 옮기지 않는다. 외부 재현이 없으면 `Not measured` 로 남는다.
- §2 점검표의 `[ ]` 는 **본 판정에서만** 채운다. 이 초안은 한 칸도 체크하지 않았다.
