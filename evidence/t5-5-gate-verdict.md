# T5-5 본 판정 — Gate 1~8 «축소 적용(v0.3)» · 로컬 축

> 🔴 **머리말 셋 — 이 문서를 읽는 규칙이다.**
> ① **결론 범위 = 오늘 돌린 축뿐이다.** 아래 §0.3 「오늘 실행한 것」 밖은 판정하지 않았다.
> ② **전언 ≠ 실측.** #348(`evidence/t5-5-gate-map-draft.md`)의 「상태」는 **그 판정문이 그렇게
>    적었다**는 뜻이고, 오늘 다시 초록이 났다는 뜻이 아니다. 그래서 표를 **두 열**로 갈랐다 —
>    «전언(#348)» 과 «오늘 재실행». 오늘 열이 비어 있으면 **오늘은 재지 않았다**는 뜻이다.
> ③ **못 찾음 ≠ 없음.** `미측`은 「그 축의 판정이 존재하지 않는다」가 아니라 「자산은 있는데
>    그 축을 겨눈 판정문이 없다」다. `미충족`(자산 자체가 없다)과 섞지 않는다.
>
> 🔴 **자극 범위 = 로컬뿐.** 공개 배포·외부 네트워크 자극은 **0건**이다(발주 규율 · D-14).
> Gate 6 외부 항·Q-70·Q-69 외부 축·clean env 는 **승격 뒤 2차 발주**로 넘긴다.
>
> 검증 좌석 리바이2 **25대** · 기점 `origin/develop` `db2e259` · lane `lane/levi2-t55-verdict` ·
> 발주 = 스자쿠 18대(2026-09-02 · 「T5-5 Gate 축소판 본 판정 · 로컬 축」) ·
> 축소 정의 정본 = `.workspace/drafts/baseline-v0.3-scope-cut-draft.md` **§6**(폐하 A~G 전건 승인
> 09-01 21:21) · 점검표 정본 = `docs/baseline/poc-baseline-v0.2.md` **§35.1~35.7**(:2228~2305).

---

## §0 무엇을 어떻게 쟀나

### 0.1 근거 등급

| 무엇 | 등급 | 어떻게 얻었나 |
|---|---|---|
| 오늘 그물 실행 결과(exit·행별 실측) | **E1** | 아래 §0.3 명령을 오늘 직접 실행 |
| 파일·경로의 실재 · 배포 sha ↔ develop diff | **E1** | `ls` · `git diff --stat` · `docker inspect` |
| #348 «전언» 열 | **E2** | 그 판정문의 인용 — 본 문서가 다시 재지 않은 축 |
| Gate 단위 계수·조건 사유·회부 | **E3** | 내 소견 |

### 0.2 🔴 대상 서버 — 「같은 코드인가」와 「내 트리를 읽는가」를 갈라 세웠다

| 축 | 실측 |
|---|---|
| 배포 인스턴스 | `fkt-deploy-ai-api` :8010 · `build 792470d` · 마운트 = **메인 체크아웃** `data/replay` 1곳 |
| 🔴 **코드 동일성** | `792470d` 는 `origin/develop` 의 **조상**이고 `git diff --stat 792470d origin/develop -- services/` = **변경 0**. 셸(`apps/web-console`)만 15파일 변경. ⇒ ai-api 코드는 develop 과 같다(E1) |
| 🔴 **귀속(colocation)** | 그러나 **8010 은 내 트리를 읽지 않는다** — `gs01` 첫 실행이 `exit 2`(「fixture 를 고쳤는데 재생본이 원값을 냈다」). API 드릴 24본 중 **20본이 `_colocation` 전처리를 강제**하므로 8010 으로는 Gate 4·5·7 을 잴 수 없다 |
| 판정 대상 | ⇒ 오케 판정(다)에 따라 **내 워크트리에서 `uvicorn app.main:app` :8011** 기동. 인터프리터 = 메인 체크아웃 `services/ai-api/.venv`(**읽기만** · 설치 0) · cwd·`FKT_SERVER_REPO`·`FKT_REPLAY_FIXTURE_DIR` = **내 워크트리** · DB = t15 컨테이너(호스트 포트) |
| 기동 확인 | `/api/health` = `ok` · postgres `ok` · neo4j `ok` · embedding `ready` · `build "db2e259-levi2-t55"`(🔴 자기 신고 문자열도 내 트리 것으로 바꿔 배포본과 안 섞이게 했다) |
| 귀속 증명 | 8011 에서 **전건 통과** — 「내 fixture 의 손질이 재생본에 나온다」 |
| 메인 체크아웃 | **무접촉**(자극 0) — (가) 예비안은 발동하지 않았다 |

### 0.3 오늘 실행한 것 (이것이 «오늘» 열의 경계다)

```
node tests/web/surface_scan.mjs                                  # exit 1 (§1-1 · 위양성 분류 첨부)
node tests/web/contract_surface_drill.mjs                        # exit 0
python tests/api/ssot_write_drill.py                             # exit 0 (W-01 건너뜀)
python tests/api/ssot_write_drill.py --run                       # exit 0 (W-01 실측)
python tests/api/gs01_integration_drill.py                       # exit 0 (13행)
python tests/api/gate5_fidelity_drill.py --live                  # exit 0 (G5-0·G5-1)
python tests/api/ci_hygiene_drill.py                             # exit 0 (3게이트)
python tests/api/scenario_allowlist_drill.py                     # exit 0
python tests/api/session_guard_drill.py                          # exit 0
python tests/api/injection_surface_drill.py                      # exit 0
python tests/api/error_shape_drill.py                            # exit 0
python tests/api/r12_enforcement_drill.py                        # exit 0
python tests/api/approval_transition_drill.py                    # exit 0
python tests/api/credential_leak_drill.py --log <서버 로그>       # exit 0 (§5 자수 ③ 참조)
python tests/api/t42b_limits_drill.py                            # exit 2 (대조군 서버 미지정)
python tests/api/t42b_xff_axes_drill.py                          # exit 2 (〃)
curl  POST /api/scenarios/GS-01/runs {"mode":"replay"} → GET /api/graph/paths?byRun=  # Q-43 축
```

**오늘 재지 «않은» 것** — 공개 배포·외부 네트워크 전건 · 브라우저 E2E(`tests/web/e2e/**`) ·
clean env 새 클론 · `t42b_capacity`·`t41_cors_browser`(각각 두 번째 대조군 서버가 필요) ·
Gate 3 평가셋(자산 없음) · restart recovery(T5-4 미착지).

---

## §1 Gate 1~8 — «전언(#348)» ↔ «오늘 재실행»

범례 — **PASS**: 판정 초록 · **조건부**: 초록이나 범위·미결 Q 가 붙음 · **미측**: 자산은 있으나
그 축의 판정이 없다 · **미충족**: 정본이 요구하는 자산 자체가 없다 · **로컬만**: 외부/배포 축이 비어 있다 ·
**불명**: 문서 대조로 못 가름 · **—**: 오늘 재지 않았다(빈 칸이지 초록이 아니다).

### 1-1. Gate 1 — Contract (§32.2) · 축소판 = 근거 경로 + 재확인 1축(계약 밖 0)

| # | 정본 항목 | 전언(#348) | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| 1 | OpenAPI request/response | 조건부 | **PASS(계약 밖 0)** | `contract_surface_drill` **exit 0** · 주입 17 / 갈림 4 = T2-1 기준선과 동일 · Q-33(응답 형상 전면 하네스) 미결은 그대로 |
| 2 | WebSocket event | 조건부 | — | `tests/contract/run.js` 는 오늘 발주 축 밖 |
| 3 | LangGraph state | PASS(전언) | **PASS** | `gs01` S3 = 이벤트 32 · `seq` 단조 · 근거 20 |
| 4 | Replay fixture | PASS(전언) | **PASS** | `gate5_fidelity` **G5-0 strict 자기 동일성 어긋남 0** |
| 5 | Evidence·Work Order schema | PASS(전언) | **PASS** | `gs01` S4·S8·S9(초안 발급·편집·승인 200) |
| 6 | error code·error body | 조건부 | **PASS(형상 9/9)** | `error_shape_drill` 9/9 계약 형상 · 이탈 0 · 🔴 Q-34(`/evidence` 404 이의어)·Q-24 미결 존속 |
| 7 | 〔완료기준〕 Backend schema → Frontend type 생성 | 불명 | — | 오늘도 이 축을 겨눈 판정을 만들지 않았다 — **불명 유지**(없다고 계수하지 않는다) |
| 8 | 〔완료기준〕 Live·Replay 동일 validator 통과 | 조건부 | **PASS** | `gate5_fidelity --live` G5-1 — 아래 1-5 참조 |
| 9 | 〔완료기준〕 negative(잘못된 field·enum·JSON type) 실패 | 조건부 | **PASS** | `error_shape` E-01·E-03·E-04(422) + `injection_surface` 10종 400 |
| 10 | 〔완료기준〕 Contract 변경 시 관련 test 실패 | 조건부 | — | CI 게이트 실행은 오늘 축 밖(PR 회부 시 `gh pr checks`) |

🔴 **`surface_scan.mjs` = exit 1 「계약 밖 10건」 — 전수 분류 결과 «위양성 10/10»**
(모집단이 T1-9·T2-1 당시 **22파일 → 오늘 53파일**로 자랐다. 자란 자리가 `scripts/` 3본이다.)

| 적발 | 분류 | 근거 |
|---|---|---|
| `/api/work-orders/{woId}/reject` | 위양성 — 계약 **축약 표기** | 계약 `:61` = `` POST `/work-orders/{woId}/approve` \| `/reject` `` · 파서의 alt 규칙이 두 번째를 `base + "/reject"` = `/api/reject` 로 등록해 매칭 실패 |
| `/api/documents/{docId}` | 위양성 — 계약이 **쿼리 포함 형태**로만 표에 있다 | 계약 `:47` = `` GET `/documents/{docId}?highlight={chunkId}` `` · 쿼리 없는 호출은 계약 `:112`(읽기 전용 예외 2라우트)에 성문돼 있으나 **표 행이 아니라** 파서가 못 뽑는다 |
| `/…/series?window=${window}` · `?window=${SERIES_WINDOW}` (2건) | 위양성 — 계약 표기 `?window=24h\|3w` **리터럴** | 계약 `:27` |
| `/api/ws/:path*` · `${API_BASE}/api/ws/:path*` (2건) | 위양성 — **Next rewrite 패턴** | `next.config.ts:94` · 계약 WS 는 `/ws/runs/{runId}`(`:39`) |
| `${attempt}/${attempts}` · `${done}/${state.steps.length}` · `${overview.kpi.lineActive}/${lineTotal}` · `${pass}/${total}` (4건) | 위양성 — **경로가 아니다** | 진행률 표시 문자열을 「접두 표현」으로 오분류 |

⇒ **Gate 1 「계약 밖 0」은 오늘도 참**(E1). 참이 아닌 것은 **그 사실을 그물이 증명한다**는 부분이다.
🔴 **그물 결함으로 회부**(§5-①) — 수정은 본 발주 범위 밖.

### 1-2. Gate 2 — Data·SSOT Integrity (§32.3) · 축소판 = 재확인 1축

| # | 정본 항목 | 전언(#348) | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| 1 | Asset ID unique | PASS(전언) | — | Phase 1 자산(`tests/data/seed-integrity.sql`)은 오늘 발주 축 밖 |
| 2 | relation endpoint 존재 | PASS(전언) | — | 〃 |
| 3 | Document ID·revision·hash 일치 | PASS(전언) | **PASS** | `ssot_write_drill` 「대상 동일성」 — API 와 DB 가 같은 문서를 같은 해시로 말한다(`DOC-SOP-0014@r2`) |
| 4 | pgvector metadata source 일치 | PASS(전언) | — | |
| 5 | Neo4j node·relationship source 일치 | PASS(전언) | — | |
| 6 | stale index 검출 | 조건부 | — | Q-20 미결 존속 |
| 7 | pgvector·Neo4j 삭제 후 SSOT 재생성 | PASS(전언) | — | 파괴 자극이라 오늘 축 밖 |
| 8 | 재생성 logical digest 일치 | PASS(전언) | **PASS** | 🔴 **W-01 run 전후 SSOT 무변 = 변화 0** · 지문 **29테이블 950,297행** · 비교기 자기검증 3종(무변·증가·신설) 통과 |
| 9 | 🔴 〔배포 인스턴스 축〕 | 로컬만 | **로컬만(유지)** | D-16(배포 DB `document_chunk` 0행) 계보 — 오늘 판정의 주어는 **t15 로컬 스택**이다. 배포 지문은 승격 뒤 2차 발주 |

🔴 첫 실행(`--run` 없이)은 **W-01 을 건너뛴다** — 그 초록은 Gate 2 정본 축을 재지 않은 초록이다.
`--run` 을 켜 다시 잰 값만 위 8행에 올렸다.

### 1-3. Gate 3 — Retrieval Quality (§32.4) · 🔴 축소판 = **미충족 그대로**(재지 않는다)

| # | 정본 항목 | 전언(#348) | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| 1 | Direct retrieval | 조건부 | **참고 실측** | `gs01` S11 = 같은 질문 1개에 vector 5 · hybrid 5 · graphrag 5 — 🔴 **«비교 가능»의 근거일 뿐 품질 수치가 아니다** |
| 2 | 유사 설비 disambiguation | 조건부 | — | Q-19 미결 |
| 3 | Multi-hop | 조건부 | **참고 실측** | `gs01` S7 = 이벤트의 graph-path 근거 5건이 `?byRun` 으로 전건 열린다 |
| 4 | Revision conflict | 불명 | — | 오늘도 이 축의 판정 없음 — **불명 유지** |
| 5 | Safety rule | PASS(전언) | **PASS** | `r12_enforcement` 형제 6 + 대조군 2 · `gs01` S8 |
| 6 | Unanswerable question | 불명 | **미측(확정)** | §5-② — `t2-3` 에 이 축이 없다 |
| 7 | Golden Scenario 정답 근거·안전 규정 | PASS(전언) | **PASS** | `gs01` 13행 끊긴 곳 0 |
| 8 | 🔴 전체 평가셋 = §29·§30 target | 🔴 미충족 | 🔴 **미충족(유지)** | `benchmarks/` = 초안 1본. **대체 수치를 만들지 않는다** |

### 1-4. Gate 4 — Agent Workflow (§32.5) · 축소판 = GS-01 13행 재확인 1축

| # | 정본 항목(negative) | 전언(#348) | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| 1 | 설비를 찾을 수 없음 | 불명 | **미측(확정)** | §5-② |
| 2 | 센서 데이터 부족 | 불명 | **미측(확정)** | 〃 |
| 3 | Vector 결과 없음 | 불명 | **미측(확정)** | 〃 — 다만 `gs01` S3 은 **0건 단계가 없음**을 실측(positive 축) |
| 4 | Neo4j 연결 실패 | 로컬만 | — | 의존 단절 자극은 오늘 축 밖 |
| 5 | 문서 revision conflict | 불명 | **미측(확정)** | §5-② |
| 6 | Safety rule 조회 실패 | 불명 | **미측(확정)** | 〃 |
| 7 | structured output validation 실패 | 불명 | **미측(확정)** | 〃 |
| 8 | 승인 대기 중 재접속 | 조건부 | **PASS(서버 축)** | `session_guard` 축⑦ — 쿠키 단독 200 · 본문 단독 401 · 일치 200 |
| 9 | 동일 요청 중복 | 조건부 | — | `t42b_lifecycle` 는 오늘 미실행 |
| 10 | timeout·retry | PASS(전언) | — | 〃 |
| 11 | 승인 전 Commit 시도 | PASS(전언) | **PASS** | `approval_transition` **12칸 전수** + 사유 코드 2종 분리 · `r12_enforcement` 8행 |
| 12 | 〔완료기준〕 `insufficient_evidence` | 불명 | **미측(확정)** | §5-② |
| 13 | 〔완료기준〕 Safety 실패 시 승인 차단 | PASS(전언) | **PASS** | `r12` 형제 ①~⑤ 403 · 대조군 C-1·C-2 200 |
| 14 | 〔완료기준〕 retry 가 중복 WO 를 만들지 않음 | 불명 | **미측(확정)** | 〃 |
| 15 | 〔완료기준〕 승인·반려가 audit 에 기록 | 조건부 | **PASS** | `gs01` S9 = `auditId=AUD-…` · `approvalState=approved` |

### 1-5. Gate 5 — Live·Replay Equivalence (§32.6) · 축소판 = 재확인 1축 + 🔴 Q-43 명시

| # | 정본 항목 | 전언(#348) | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| 1 | 재생 왕복 · 논리 일치 | 조건부(재실증 미측) | 🔴 **PASS — 오늘 재실증됐다** | `gate5_fidelity --live`: **live 1회 신규 녹화**(`RUN-e920fdfc260b` · 32건) ↔ fixture(`RUN-7e4cfd025422` · 32건) · **A 축 어긋남 0 · 규칙 위반 0** · seq 열 0..31 동일 · 근거 19 · 후보 2 |
| 2 | graph path 논리 일치 | 🔴 미측(Q-43) | 🔴 **비대칭 존속 — 오늘 재현**(계수 = 조건부) | replay run `RUN-9412588c0941` 에 `GET /api/graph/paths?byRun=` → **501 `replay_path_source_absent`** ↔ live 는 `gs01` S7 에서 **경로 5건 200**. ⇒ **이벤트 축은 일치하나 REST 표면 축은 갈린다**. 🔴 오늘 «실측»은 됐으나 **판정(fixture 에 path 원본 동봉 vs 「evidence 가 정본」 성문)은 여전히 미결** — 그래서 초록으로 세지 않고 조건부에 둔다 |
| 3 | 비결정 필드 제외 규칙 | PASS(전언) | **PASS** | 🔴 **제외한 칸을 센다**: `runId`·`ts` 계열 **162칸**(0이면 규칙이 죽은 것) · 정규화 대조군 통과 |
| 4 | 이벤트 밖 부산물(WO 본문 등) | 조건부 | **PASS(서버 축)** | `gs01` S10 = 재생본 초안 **501**(다른 사건으로 답한다) · Q-27 화면 축 잔여는 그대로 |

🔴 **B 열 = 이름만 갈린 `GP-` 근거 5건**(`GP-7e4cfd025422-0n` ↔ `GP-e920fdfc260b-0n`)은 **지우지 않고 따로 셌다**(J-H).
치환해 맞추면 비교기가 어긋남을 «지워» 초록을 만든다.
🔴 **판정의 주어를 갈라 둔다** — `gate5_fidelity` 의 초록은 **이벤트 스트림 축**의 것이고,
Q-43 의 501 은 **REST 표면 축**의 것이다. 두 축을 한 초록으로 합치지 않는다.

### 1-6. Gate 6 — Public Service·Failure (§32.7 8행) · 축소판 = **승계**(로컬 열을 판정으로 올리지 않는다)

> 🔴 오늘 **외부 자극 0**. 아래는 전건 승계이며, 근거 파일은 **두 본 병기**다(오케 정정 09-02 08:23):
> `t4-4-external-gate6-verification.md` = 노트북 OFF · WebSocket 중단 **2행 PASS**(§5 실측) /
> `t4-4-external-outage-verification.md` = FastAPI OFF **PASS**(§7 · 22대) + Tunnel OFF **조건부**(§8 · Q-70).

| # | §32.7 행 | 외부 축 승계 | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| 1 | 노트북 OFF | **PASS**(외부) | — | `gate6-verification` §1·§5.1 |
| 2 | FastAPI OFF | **PASS**(외부 · 조건 §7.5) | — | `outage-verification` §7.3 8행 · 502 · 0.87~2.86초 |
| 3 | PostgreSQL OFF | **로컬만** | — | 외부 *Not measured* — 로컬 열을 올리지 않는다 |
| 4 | Neo4j OFF | **로컬만** | — | 〃 |
| 5 | Tunnel OFF | **조건부**(외부) | — | Offline·빈화면 아님·복구 PASS · 🔴 `POST /enter` **20.0초** = Q-70 미결 |
| 6 | WebSocket 중단 | **PASS**(외부) | — | `gate6-verification` §5.2 · 1011 ↔ 1000 대조 |
| 7 | Model timeout | **로컬만** | — | 〃 |
| 8 | 동시 요청 초과 | **로컬만** | — | 골격이 명시적으로 *Not measured* 로 못 박음 |
| 9 | 〔T5-5 추가〕 재부팅 후 Gate 6 재확인 | 🔴 **미충족** | — | T5-4 미착지 |
| 10 | 〔T5-5 추가〕 restart recovery | 🔴 **미측** | — | T4-3 = AC ④ 「반쪽」 자기 신고 |

### 1-7. Gate 7 — Security·Abuse (§32.8 13항) · 축소판 = 재실행 8 + 신설 3 + 미충족 2

> 🔴 #348 의 「기존 판정문」은 T2-2·T3-1·T4-2b 각 축의 판정이지 Gate 7 축의 판정이 아니었다.
> **오늘 열의 초록은 「Gate 7 축으로 오늘 다시 쟀다」는 뜻**이다 — 주어가 바뀌었다.

| # | §32.8 항 | 전언(#348) | **오늘 재실행** | 사유 |
|---|---|---|---|---|
| ① | SQL injection | 부분 | **PASS(경로 파라미터 축)** | `injection_surface` HL-01~04 400 `highlight_mismatch` · 🔴 **질의 문자열(`compare q`) 표면은 여전히 그물 없음** — 부분 유지 |
| ② | Cypher injection | 🔴 미충족 | 🔴 **미충족(유지)** | 그물 자체가 없다 |
| ③ | 문서 내부 Prompt Injection | 🔴 미충족 | 🔴 **미충족(유지)** | 〃 |
| ④ | 임의 tool 호출 | 미측 | **PASS** | `scenario_allowlist` — 허용 10건 200 · 목록 밖 **6종 전건 400 `question_not_approved`**(끝 낱말 교체·접두 부분문자열·접미 추가·공백만·SQL 조각·Cypher 조각) |
| ⑤ | 관리자 endpoint 접근 | 🔴 미충족 | 🔴 **미충족(유지)** | 「문이 계약에 없다」 ≠ 「접근이 막힌다」 |
| ⑥ | 다른 session 접근 | 미측 | **PASS** | `session_guard` 6축 — 은닉 run·초안·승인·경로 404 · 쿠키↔본문 상충 422 · 남의 reset 404 · 자기 reset 200 후 소멸 404 |
| ⑦ | oversized request | 미측 | 🔴 **측정 불가** | `t42b_limits` **exit 2** — 세션 축 대조군 서버(`FKT_T42B_SESSION_BASE`) 미지정. 🔴 그물이 **기본값을 거부**한다(Q-62 계보 — 기본값이 남의 좌석을 가리키면 남의 계측기를 두드린다) |
| ⑧ | 반복 요청·rate limit | 조건부 | 🔴 **측정 불가** | `t42b_xff_axes` **exit 2**(BEFORE 서버 미지정) · `t42b_capacity` = 두 번째 서버(`FKT_T42B_TIMEOUT_BASE`) 필요 — 오늘 축 밖 |
| ⑨ | 잘못된 WebSocket message | 🔴 미충족 | 🔴 **미충족(유지)** | 그물 없음 |
| ⑩ | path traversal | 미측 | **PASS** | `injection_surface` HL-05·HL-06·HL-07 400 · 🔴 **대상 생존 확인**(DOC-SOP-0014 본문 1376자 = 던지기 전과 동일) |
| ⑪ | CORS 우회 | 미측 | — | `t41_cors_browser` = 맨 페이지 서버 2본 + allowlist 주입 서버가 필요 — 오늘 축 밖 |
| ⑫ | stack trace·secret 노출 | 조건부 | **PASS(3면)** | `error_shape` 9/9 형상 · `credential_leak` **응답 23건 0 · 이벤트 32건 0 · 로그 면 0**(§5-③) · 🔴 Q-49·Q-23 미결 존속 |
| ⑬ | 승인 우회 | 미측 | **PASS** | `r12_enforcement` 8행 + `approval_transition` 12칸 |
| 〔유지〕 | git «이력» secret scan | 조건부 | **부분** | `ci_hygiene` **exit 0** — 추적 **461파일** · G-1 크리덴셜 0 · G-2 시크릿 패턴 0 · G-3 개인 절대경로 0 · 스캐너 자기검증 5종 통과. 🔴 **그러나 이것은 «작업 트리» 축이다 — «이력» 축은 여전히 판정문 없음** |

### 1-8. Gate 8 — Portfolio Claim (§32.9 8주장) · 축소판 = 🔴 **유지**(축소하지 않는다)

> 정본이 요구하는 산출물 = **주장 ↔ Evidence 대응표**. 아래가 그 표다(오늘 작성).
> 🔴 근거가 없는 주장은 **빈 칸으로 둔다** — 축소를 이유로 채우지 않는다.

| # | 주장(§32.9) | Evidence 경로 | 오늘 상태 |
|---|---|---|---|
| 1 | GraphRAG 적용 | `gs01` S7(경로 5건 `?byRun` 전건) · `evidence/t2-1` · `evidence/t1-5` | **근거 있음**(오늘 API 축 실측) |
| 2 | SSOT 기반 | `ssot_write_drill --run`(W-01 무변 · 29테이블 950,297행) · `evidence/t1-7-b` | **근거 있음**(오늘 실측) |
| 3 | Human-in-the-loop | `gs01` S8·S9 · `approval_transition`(12칸) · `r12_enforcement` | **근거 있음**(오늘 실측) |
| 4 | 공개 접근 | `evidence/t4-4-external-outage-verification.md` · `evidence/t4-3`(자기 신고 «부분») | **조건부**(승계 · 오늘 자극 0) |
| 5 | Offline fallback | `evidence/t4-2a`(AC 전건 PASS) · `t4-4-external-gate6` §1 | **PASS(전언)** · 오늘 자극 0 |
| 6 | 정확도 향상 | 🔴 **없음** | 🔴 **미충족** — 이 주장을 README·시연에서 **하지 않는 것**이 유일한 정합 처리 |
| 7 | 안전한 Agent | `injection_surface`·`session_guard`·`scenario_allowlist`·`r12`·`approval_transition`(오늘 5본) · 🔴 미충족 4항(②③⑤⑨) | **부분** — 「안전하다」로 닫지 않는다 |
| 8 | 재현 가능 | `evidence/t1-7-b`(로컬 index 재현) · clean env 새 클론 **미실행** | **부분** |

🔴 **README 대조(E1)**: 성능 수치 `grep` = **0건**. 문면은 「측정 전 수치는 어떤 것도 성능으로
주장하지 않습니다」(`README.md:138`) — 즉 **대응표의 빈 칸이 README 의 주장과 어긋나지 않는다.**
Gate 8 이 오늘 «빈 칸»에서 «조건부»로 올라간 이유는 대응표가 생겼기 때문이지 주장이 늘어서가 아니다.

---

## §2 §35.1~35.5 Release 점검표 — 🔴 못 채운 항은 **빈 채로** 둔다(§0.2)

### 2-1. §35.1 Product (7항)

| # | 항목 | 근거 | 판정 |
|---|---|---|---|
| 1 | 공개 URL이 노트북 OFF에서도 정상 표시 | `t4-4-external-gate6` §1 | 승계(외부 · 오늘 자극 0) |
| 2 | Golden Scenario를 별도 설명 없이 실행 | `gs01` 13행(오늘 · **API 축**) · clean env 미실행 | **부분** |
| 3 | Live와 Replay status가 사실대로 표시 | `evidence/q69-shell-mode-observation.md` · Q-69 | 조건부(오늘 미측) |
| 4 | 주요 navigation·button·form이 실제 동작 | `t3-2`~`t3-5` · `tests/web/e2e/**` | 승계(오늘 셸 미기동) |
| 5 | Vector·Hybrid·GraphRAG 결과 비교 | `gs01` S11(3전략 각 5건 · 오늘) · 🔴 **수치 축 없음** | **부분 — 화면·표면만** |
| 6 | Evidence와 Graph path를 drill-down | `gs01` S5(15건 200)·S5b(GP 는 404 = 계약이 제외한 kind)·S7(경로 5) · 🔴 replay 축 501(Q-43) | **조건부** |
| 7 | Work Order 승인·반려와 audit 동작 | `gs01` S8·S9 · `approval_transition` 12칸(오늘) | **충족(로컬 축)** |

### 2-2. §35.2 KPI·Benchmark (9항) — 🔴 **전항 빈 칸**

`benchmarks/` = `datasets/eval-questions-draft.md` **1본**(E1 · 오늘 재확인).
Ground Truth 고정 · 40문×4전략 · 5회 raw · Hit@K/Recall@K/MRR/nDCG 계산기 · Target↔Actual 분리 —
**자산이 없다**(T5-1 미착지). 🔴 축소를 이유로 «잠정 목표»로 채우지 않는다.

### 2-3. §35.3 Latency·Reliability (7항)

| # | 항목 | 근거 | 판정 |
|---|---|---|---|
| 1 | Client·Network·Queue·Server·Model latency 분리 | `q45-web-timing-inventory` · `d12-enter-retry-verification` | 부분 |
| 2 | P50·P95 측정 | — | 🔴 **빈 칸** |
| 3 | Cold·Warm 공개 | Q-44 계보 | 부분 |
| 4 | concurrency 1·2·3·5 | `t42b_capacity`(오늘 **미실행** — 두 번째 서버 필요) · `t4-2b` §4 | 로컬만 |
| 5 | Admission control·Queue 동작 | `t4-2b` §4 | 로컬만 |
| 6 | 노트북·API·DB·Graph·Tunnel 장애 실제 재현 | §1-6 표 | **외부 3행 + 조건부 1 · 로컬 4** |
| 7 | Live 장애 시 Replay fallback | `t4-2a` · `t4-4-outage` §7 | 승계 |

### 2-4. §35.4 Security (7항)

| # | 항목 | 근거 | 판정 |
|---|---|---|---|
| 1 | SQL·Cypher injection negative 통과 | SQL = `injection_surface` 10종(오늘 PASS) · **Cypher = 그물 없음** | 🔴 **미충족(Cypher)** |
| 2 | 문서 Prompt Injection이 tool authority 미획득 | 그물 없음 | 🔴 **미충족** |
| 3 | 다른 session에 접근할 수 없다 | `session_guard` 6축(오늘 PASS) | **충족** |
| 4 | Public admin endpoint 차단 | 그물 없음 | 🔴 **미충족** |
| 5 | Rate limit·request size limit 동작 | `t42b_limits`·`t42b_xff` **오늘 exit 2**(대조군 서버 미지정) · Q-60 | 🔴 **측정 불가** |
| 6 | stack trace·secret·구성값 미노출 | `error_shape` 9/9 · `credential_leak` 3면 0(오늘) · Q-49·Q-23 미결 | **조건부** |
| 7 | Git history secret scan 통과 | `ci_hygiene` 3게이트 0히트(오늘 · **작업 트리 461파일**) | **부분 — «이력» 축 빈 칸** |

### 2-5. §35.5 GitHub·License (7항)

| # | 항목 | 실측(E1 · 오늘 `db2e259` 트리) | 판정 |
|---|---|---|---|
| 1 | Repository가 Public | 리포 설정 · 폐하 관문 | 본 판정 범위 밖 |
| 2 | `LICENSE`에 Apache-2.0 전문 | `LICENSE` 존재 · 머리 = `Apache License / Version 2.0, January 2004` | **충족** |
| 3 | `NOTICE` 공개 영문명·연도 확정 | 🔴 **파일 없음** | 🔴 **미충족**(원장 = P6 생성) |
| 4 | `THIRD_PARTY_NOTICES.md` | 🔴 **파일 없음** | 🔴 **미충족**(〃) |
| 5 | model weight·DB volume·credential 미포함 | `ci_hygiene` G-1·G-2·G-3 **히트 0** / 추적 461파일(오늘) | **충족(추적 파일 축)** |
| 6 | GitHub Actions required check 통과 | `.github/workflows/` = `ci.yml`·`security.yml` 2본(E1) · required 지정 = 리포 설정 | 부분 |
| 7 | README의 주장과 Evidence가 일치 | README 성능 수치 **0건**(오늘 grep) · 문면 = 「측정 전 수치는 어떤 것도 성능으로 주장하지 않습니다」 | **충족** |

### 2-6. §35.6 Portfolio (8항) — 검증 좌석 산출물 아님

영상 2종·Architecture diagram·KPI 결과표·trade-off 설명 = 폐하·오케 몫.
검증이 잴 수 있는 2항: 「외부 모바일 네트워크 확인」(승계 · 오늘 자극 0) · 「clean seed·index·run 이
README 만으로 재현」(**미실행** — 2차 발주).

---

## §3 계수 — #348 대비 델타

### 3-1. Gate 단위

| 구분 | #348 | **오늘** | 변화 |
|---|---|---|---|
| **서 있는 Gate**(전항 근거 + 조건 없음) | 0 | 🔴 **0** | 무변 |
| **조건부** | 5 (1·2·4·5·6) | **6** (1·2·4·5·6·**8**) | 🔺 Gate 8 — 대응표를 오늘 작성해 «빈 칸»에서 올라왔다 |
| **빈 칸**(미측·미충족) | 3 (3·7·8) | **2** (3·7) | 🔻 Gate 8 이 빠졌다. Gate 3·7 은 그대로 |

### 3-2. 항목 단위 — §1 **78행 전수**(#348 과 같은 모집단 · 10+9+8+15+4+10+14+8)

> 계수 규칙: **한 행에 상태 하나**. 「오늘 실측 PASS」 = 오늘 그 축을 다시 재서 초록이 난 행이며,
> 미결 Q 가 붙은 행도 여기 두고 조건을 §1 표에 병기했다(예: Gate 1 ①의 Q-33).
> Gate 3 ①③의 «참고 실측»은 품질 수치가 아니라 **조건부에 그대로 둔다**.

| 상태 | #348 | **오늘** | 무엇이 움직였나 |
|---|---|---|---|
| **오늘 실측 PASS** | — | **26** | G1 ×7 · G2 ×2 · G3 ×2 · G4 ×4 · G5 ×3 · G7 ×5 · G8 ×3 |
| PASS(전언 · 오늘 미실행) | 20 | **10** | 10건이 오늘 실측으로 승격 |
| 조건부 | 20 | **10** | 실측 승격 + 미측 확정으로 빠져나갔다 |
| 미측 | 12 | **13** | 🔺 **불명 8 → 미측 확정**(§5-②) · 🔻 Gate 7 5건이 오늘 실측으로 · 🔺 `t42b`·CORS 3건 «측정 불가» |
| 불명 | 11 | **2** | 🔻 9건 해소 — 🔴 **8건은 «미측»으로 옮긴 것이지 초록이 아니다** |
| 🔴 미충족 | 7 | **7** | 무변 — Cypher · prompt injection · admin endpoint · malformed WS · 평가셋 · 재부팅 축 · 「정확도 향상」 |
| 로컬만 | 6 | **6** | 무변(Gate 6 ×4 + Gate 2 배포 축 + Gate 4 Neo4j) |
| 부분 | 2 | **4** | 🔺 Gate 7 ① SQL·유지축(이력) · Gate 8 「안전한 Agent」·「재현 가능」 |
| **합** | 78 | **78** | 닫힌다 |

**Gate 별 소계**(오늘 · 행수 = #348 과 동일)

| Gate | 행 | 오늘PASS | PASS(전언) | 조건부 | 미측 | 불명 | 미충족 | 로컬만 | 부분 |
|---|---|---|---|---|---|---|---|---|---|
| 1 Contract | 10 | 7 | 0 | 2 | 0 | 1 | 0 | 0 | 0 |
| 2 SSOT | 9 | 2 | 5 | 1 | 0 | 0 | 0 | 1 | 0 |
| 3 Retrieval | 8 | 2 | 0 | 3 | 1 | 1 | 1 | 0 | 0 |
| 4 Agent | 15 | 4 | 1 | 1 | 8 | 0 | 0 | 1 | 0 |
| 5 Live·Replay | 4 | 3 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 6 장애 | 10 | 0 | 3 | 1 | 1 | 0 | 1 | 4 | 0 |
| 7 보안 | 14 | 5 | 0 | 0 | 3 | 0 | 4 | 0 | 2 |
| 8 Claim | 8 | 3 | 1 | 1 | 0 | 0 | 1 | 0 | 2 |
| **합** | **78** | **26** | **10** | **10** | **13** | **2** | **7** | **6** | **4** |

§1 표 **밖** 미충족 2건(§2-5): `NOTICE` · `THIRD_PARTY_NOTICES.md` — 오늘도 트리에 없다(E1).

🔴 **계수를 읽는 법**: 「오늘 실측 PASS 26」은 **Gate 가 26칸 섰다**는 뜻이지 **26칸이 처음 초록이
됐다**는 뜻이 아니다. 대부분은 전언이 있던 자리를 오늘 다시 밟은 것이다. 반대로 **미측이 12 → 19 로
늘어난 것은 나빠진 것이 아니라 «모른다»를 «모른다»로 옮겨 적은 결과**다.

---

## §4 🔴 판정 — **Release 후보 — 축소 적용(v0.3)**

**§35.7 10 조건 중 미충족·미완 항 목록**(이 목록이 남아 있는 한 「Portfolio Release」로 판정하지 않는다):

| # | §35.7 조건 | 오늘 상태 |
|---|---|---|
| 1 | P0 기능 완료 | 본 판정 범위 밖(오케·폐하) |
| 2 | Golden Scenario E2E PASS | **부분** — 로컬 API 축 13행 오늘 PASS · **브라우저 E2E·clean env 미실행** |
| 3 | Independent Verification PASS | 🔴 **미충족** — Gate 3 평가셋 없음 · Gate 7 4항 미충족 + 3항 측정 불가 |
| 4 | Security Gate PASS | 🔴 **미충족** — Cypher injection · 문서 Prompt Injection · admin endpoint · malformed WS |
| 5 | Public Offline Fallback PASS | 승계(외부 실측 존재) · 오늘 자극 0 |
| 6 | Benchmark Evidence 생성 | 🔴 **미충족**(T5-1 미착지) |
| 7 | KPI·Latency 결과 공개 | 🔴 **미충족** — §35.2 전항 · §35.3 P50·P95 빈 칸 |
| 8 | GitHub Actions PASS | **부분** — workflow 2본 실재 · required 지정은 리포 설정 |
| 9 | Apache-2.0 License Closure | 🔴 **미충족** — `NOTICE` · `THIRD_PARTY_NOTICES.md` 부재 |
| 10 | README Claim-Evidence 일치 | **충족**(오늘 실측 — 성능 수치 0건) |

🔴 **판정문에 함께 남기는 경계**
- 본 판정의 주어는 **로컬 스택**이다. 공개 배포 인스턴스의 지문(D-16 계보)·외부 네트워크 축은 **재지 않았다**.
- 「축소 적용」은 **범위를 줄인 것이지 기준을 낮춘 것이 아니다** — 줄인 자리는 위 목록에 그대로 남는다.
- §35.7 최종 판정(「Portfolio Release」 여부)은 **폐하 관문**으로 유보한다.

---

## §5 회부 · 자수

### 5-1. 회부 (오케 → 원장)

| # | 사안 | 등급 | 내용 |
|---|---|---|---|
| ① | 🔴 **`tests/web/surface_scan.mjs` 그물 결함** | E1 | exit 1 「계약 밖 10건」이 **전수 위양성**(§1-1 분류표). 원인 3종 = ⓐ 계약 축약 표기(`` `/approve` \| `/reject` ``) 미전개 ⓑ 쿼리 포함 표기와 쿼리 없는 호출의 매칭 실패 ⓒ **경로가 아닌 진행률 템플릿**(`${pass}/${total}` 류)을 「접두 표현」으로 오분류. 모집단이 22→53파일로 자라며 발현. **판정에 인용될 때마다 과대계상**이 된다 — 수정 = 별건 발주 |
| ② | 🔴 **#348 인계 「불명 11칸 → `t2-3` 대조로 해소」가 틀렸다** | E1 | `t2-3-workflow-verification.md` 는 축①~⑧ 어디에도 **Gate 4 negative 12종을 겨눈 축이 없다**. 판정 범위표가 스스로 「덮지 않는 것」을 열거한다. ⇒ 그 칸들은 해소가 아니라 **«미측» 확정**(자산은 있고 판정문이 없다). 24대(나)의 인계 오류다 |
| ③ | **Gate 7 ⑦⑧⑪ 은 오늘 «측정 불가»** | E1 | `t42b_limits`·`t42b_xff` = **대조군 서버 2본**을 요구하며 기본값을 거부(Q-62 계보). `t41_cors_browser` = 맨 페이지 서버 2본 + allowlist 주입 서버. ⇒ 재실행하려면 **발주에 대조군 서버 기동이 포함돼야** 한다 |
| ④ | **Gate 5 의 초록과 Q-43 을 합치지 말 것** | E3 | `gate5_fidelity` 는 **이벤트 스트림 축**, Q-43 은 **REST 표면 축**이다. 오늘 전자는 PASS, 후자는 501 재현. 「Gate 5 = PASS」로 한 줄로 적으면 Q-43 이 판정처를 다시 잃는다 |

### 5-2. 🔴 내 계측기 자수 (오늘 3건 — 대상 결함으로 세지 않는다)

| # | 무엇 | 진범 |
|---|---|---|
| ① | `surface_scan` 의 exit 을 **0으로 오독** | `\| tail` 뒤의 `$?` 는 `tail` 의 코드다. 파일로 저장해 재실행하니 **exit 1**. 빨강을 초록으로 볼 뻔했다 |
| ② | 첫 8011 기동이 replay 미개방(501 `replay_fixture_missing`) → `_colocation` exit 2 | **내 손** — `sed` 로 만든 설정의 백슬래시 경로가 `C:SERSSINELEPOS…` 로 뭉개졌다. 대상 결함이 아니다. 슬래시 경로로 고쳐 재기동 |
| ③ | `credential_leak` **L-02 로그 면 FAIL(절대경로)** | **내 손** — 로그 파일 1~2행이 서버 출력이 아니라 **내 런처 셸의 오류 메시지**(②의 잔여)였고 거기에 내 작업 경로가 있었다. 서버가 쓴 부분만으로 재측정 → **exit 0 · 3면 누출 0**. 🔴 이 한 건은 「그물의 빨강이 대상의 것인가」를 안 물었으면 **없는 결함을 Gate 7 ⑫에 올릴 뻔했다** |

### 5-3. 다음 조각에 남기는 것 (2차 발주 · 승격 뒤)

- **Q-70 재실측**(외부 · `t4-4-external-outage-verification.md` §8 절차 그대로 30분) · **Q-69 배지 문면**(#345)
- **clean env 1회** — 타 경로 새 클론 · README 만으로 seed→index→run→GS-01 · 막힌 자리 전건 기록
- **Gate 7 ⑦⑧⑪** — 대조군 서버 기동을 발주문에 포함해야 잴 수 있다(§5-1 ③)
- **Gate 6 로컬 4행** — 외부 칸으로 올리지 않는다. 외부 재현이 없으면 `Not measured` 로 남는다
- **§35.2 KPI 전항** · **Gate 3 평가셋** — T5-1 착지 전에는 어떤 수치도 만들지 않는다
