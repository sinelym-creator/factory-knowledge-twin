---
asset_class: draft
description: baseline v0.2 → v0.3 «축소 안» 개정 초안 — 잔여 4티켓(T5-2·T3-6·T5-3·T5-5)의 범위 축소 · 폐하 재가용
status: 초안(재가 대기) · 🔴 SSOT 아님 · baseline 본문 무접촉
author: 구현 좌석(센쿠2 26대) · 발주 = 팀 오케(스자쿠 17대) 09-01
base: origin/develop `d319695` · 정본 = docs/baseline/poc-baseline-v0.2.md
---

# baseline v0.3 — 축소 안 (개정 초안)

> 🔴 **이 문서는 제안이지 효력이 아니다.** baseline §0.3 「범위·완료 기준·라이선스·공개 경계가
> 변경되면 이 문서를 먼저 개정한다」에 따른 **개정 초안**이며, 폐하 재가(§8 칸) 전에는 어떤 조항도
> 발효하지 않는다. 재가 후 baseline 본문 개정은 오케 소관(본 초안 작성자의 write scope 밖).
>
> 🟢 **2026-09-02 현재 — 재가가 완료되어 baseline 본문에 반영되었다.** 폐하 재가 A~G 전건(2026-09-01 21:21) · 본문 반영 = `docs/baseline/poc-baseline-v0.2.md`(제목 `Baseline v0.2 (v0.3 축소 적용)` · 파일명은 단일 baseline 경로 보존을 위해 유지) · lane `lane/suzaku18-baseline-v03`. 위 「제안이지 효력이 아니다」 문장은 재가 «전» 상태의 기록으로 그대로 둔다.

## §0 이 초안의 근거 등급과 한계 (먼저 읽는다)

| 무엇 | 등급 | 어떻게 얻었나 |
|---|---|---|
| 자산 실재(그물 파일·workflow·evidence 파일 경로) | **E1** | `git ls-files` · `ls` · `git log --diff-filter=A` 로 `d319695` 트리에서 실측 |
| 각 축의 «판정»(PASS/FAIL·측정값) | **E2** | 기존 판정문(`evidence/*.md`) 인용 — 본 초안이 다시 재지 않았다 |
| 축소로 남는 리스크·소요 추정 | **E3** | 소견 |

🔴 **본 초안은 드릴을 재실행하지 않았다.** 아래 대응표의 「있다」는 **자산이 실재하고 판정문이
그렇게 적혀 있다**는 뜻이지, 오늘 다시 초록이 났다는 뜻이 아니다. 재실행은 축소 «후»의 실행분에
포함된다(§3~§6 각 표의 「축소 후 실행」 열).

---

## §1 개정 대상 조항 표 (원문 인용 → 개정문)

### 1-A. §0.3 문서 사용 원칙 — «축소 적용» 조항 신설

| | |
|---|---|
| **원문(§0.3)** | 「범위·완료 기준·라이선스·공개 경계가 변경되면 이 문서를 먼저 개정한다.」<br>「구현 완료와 검증 완료를 구분하며 독립 검증되지 않은 기능은 Release 범위에 포함하지 않는다.」 |
| **개정문(v0.3 신설 1줄)** | 「🔴 **기한 제약으로 축소된 검증 축은 «축소 적용(v0.3)»으로 표기하고, 줄인 항목은 «미충족»으로 남긴다 — 축소는 기준을 낮추는 것이 아니라 «측정하지 않았음»을 명시하는 것이다.** 축소 적용 항목은 §35 점검표와 Release 판정문에서 충족으로 계산하지 않는다.」 |
| 왜 | 축소가 §0.2(측정-주장 경계)를 침식하지 않게 하는 **유일한 장치**. 이 한 줄이 없으면 아래 모든 축소가 「했다」로 읽힌다. |

### 1-B. §32.1 검증 원칙 — 무변 (인용만)

> 「구현 Agent의 완료 보고는 acceptance가 아니다.」 · 「각 Gate는 command, raw result, hash 또는
> screenshot 등 재검증 가능한 evidence를 요구한다.」

**개정 없음.** 축소는 «Gate 의 항 수»를 줄이는 것이지 «남긴 항의 증거 요구»를 낮추지 않는다.
남긴 항은 종전대로 command·raw result·경로를 요구한다.

### 1-C. §32.8 Gate 7 — 13항 → «재실행 8 + 신설 3 + 미충족 2»

| | |
|---|---|
| **원문(§32.8)** | SQL injection / Cypher injection / 문서 내부 Prompt Injection / 임의 tool 호출 / 관리자 endpoint 접근 / 다른 session 접근 / oversized request / 반복 요청과 rate limit / 잘못된 WebSocket message / path traversal / CORS 우회 / stack trace·environment 노출 / 승인 우회 |
| **개정문(v0.3)** | 「Gate 7 은 **축소 적용(v0.3)**으로 판정한다 — 기존 그물이 이미 덮는 8항은 «Gate 7 축 재실행»으로, 정본이 요구하나 그물이 없는 3항(SQL 질의 표면·Cypher·문서 prompt injection)은 **최소 negative 그물 신설**로 판정하며, 나머지 2항(관리자 endpoint 접근 · 잘못된 WebSocket message)은 **미충족**으로 남긴다.」 |
| 상세 | §3 대응표 |

### 1-D. §32 Gate 1~8 «전건 정밀»(T5-5) → Gate 축소판

| | |
|---|---|
| **원문(§35.7)** | 「P0 기능 완료 + Golden Scenario E2E PASS + Independent Verification PASS + Security Gate PASS + Public Offline Fallback PASS + Benchmark Evidence 생성 + KPI·Latency 결과 공개 + GitHub Actions PASS + Apache-2.0 License Closure + README Claim-Evidence 일치」 |
| **개정문(v0.3)** | 「기한 내 판정은 **Release 후보(축소 적용)**로 한다 — Gate 1~8 은 «근거 경로 표»(각 Gate = 원 판정문 링크 + 재확인 축 1개)로 세우고, clean env 재현은 **1회**로 한다. Benchmark Evidence·KPI·Latency 결과 공개는 **미충족**으로 남기며, 이를 충족으로 대체할 어떤 수치도 게시하지 않는다.」 |
| 상세 | §6 |

### 1-E. §34.3 `security.yml` — 6항 → CodeQL(착지) + dependency audit(채택) + 4항 미충족

| | |
|---|---|
| **원문(§34.3 security.yml)** | 「Secret scanning 보완 local scan / CodeQL / dependency audit / container scan / license inventory / public endpoint policy test」 |
| **개정문(v0.3)** | 「`security.yml` 은 **CodeQL + dependency audit** 2 job 으로 한다(축소 적용). local secret scan 보완·container scan·license inventory·public endpoint policy test 와 `ci.yml` 확장·`benchmark-smoke.yml`·`release-evidence.yml`·required check 지정은 **미충족**으로 남긴다. §34.4 runner 경계(self-hosted 등록 0)는 **무변** — 축소 대상이 아니다.」 |
| 상세 | §5 |

### 1-F. §35.4 Security 점검표 — 항별 «축소 적용» 표기

| **원문(§35.4)** | **v0.3 처리** |
|---|---|
| SQL·Cypher injection negative test가 통과했다 | 신설 최소 그물로 판정(§3 ①②) |
| 문서 Prompt Injection이 tool authority를 획득하지 못한다 | 신설 최소 그물로 판정(§3 ③) |
| 다른 session에 접근할 수 없다 | 기존 그물 재실행(§3 ⑥) |
| Public admin endpoint가 차단됐다 | 🔴 **미충족**(§3 ⑤) |
| Rate limit와 request size limit가 동작한다 | 기존 그물 재실행(§3 ⑦⑧) |
| stack trace·secret·environment가 노출되지 않는다 | 기존 그물 재실행(§3 ⑫) |
| Git history secret scan이 통과했다 | **유지**(T5-2 게이트 3 — 축소하지 않는다 · 공개 리포의 비가역 축) |

### 1-G. §21 Phase 3 완료 증거 4종(T3-6) — 그물 신설 0 · 재실행 + 승계

T3-6 이 요구하는 4행은 **모두 그물이 이미 서 있다**(§4 · E1). 개정문: 「④ viewport 는
3폭(1280·1440·1920) × 5화면 그대로 1회 실행한다. ① 노트북 OFF 는 T4-4 외부 판정을 **승계**하고
T3-6 축(정적 replay 완주)에서 **1회**만 재확인한다.」

---

## §2 근거 (왜 지금 축소인가)

| # | 근거 | 등급 | 값 |
|---|---|---|---|
| ① | 기한 | **E1** | `project-plan.md §1` — 배포 «상한» 09-04(금). 오늘 09-01(화) ⇒ **D-3** |
| ② | 주간 예산 | **E2**(발주 제공) | 잔여 94% 소진 · 리셋 = **금 08:00** = 09-04 08:00 — 리셋 시점이 상한일 «아침»이므로 기한 안에 쓸 수 있는 것은 **리셋 전 잔여분뿐**이다 |
| ③ | 잔여 범위 | **E1** | T5-2(13항 negative + 이력 secret scan) · T3-6(증거 4종 + Gate smoke 1~5) · T5-3(보류 6종) · T5-5(Gate 1~8 전건 + clean env) — 정본 그대로면 4티켓 모두 «판정문 1본 + 다수 재실행» 규모 |
| ④ | 🔴 경계 | **정본** | §0.2 — 축소는 «측정하지 않은 것»을 늘리는 결정이다. **줄인 항은 미충족으로 적고, 충족으로 바꾸지 않는다.** 축소로 생긴 빈 칸을 「해당 없음」·「N/A」로 적지 않는다 — 빈 칸의 종류를 지우면 그것이 «대상의 성질»로 읽힌다 |
| ⑤ | 무엇을 지키는가 | E3 | 축소해도 **공개 표면의 비가역 축**(git 이력 secret scan · 공개 경계 scan · self-hosted runner 0)은 유지한다 — 공개 후 되돌릴 수 없는 것부터 남긴다 |

---

## §3 T5-2 — §32.8 13항 ↔ 기존 그물 대응표 (E1 자산 · E2 판정)

**기존 드릴 6종**(T5-2 티켓이 지목) = `injection_surface_drill` · `session_guard_drill` ·
`error_shape_drill` · `scenario_allowlist_drill` · `credential_leak_drill` · `ci_hygiene_drill`.
아래 표는 여기에 실측으로 확인된 재사용 자산(`r12_enforcement_drill` · `approval_transition_drill`
· `t42b_limits_drill` · `t42b_capacity_drill` · `t41_cors_browser_drill`)을 더해 13항을 채운다.

| # | §32.8 항 | 기존 그물(E1 경로) | 판정 근거(E2) | PR | v0.3 처리 |
|---|---|---|---|---|---|
| ① | SQL injection | `tests/api/injection_surface_drill.py` — 경로 파라미터 **문 3 × 적대 10종 = 30건**(`DROP TABLE` 실투척 · 마지막 행에서 코퍼스 생존 실측) | `evidence/t2-2-reading-verification.md` | **#117** | 🔶 **부분** — 덮는 곳 = «경로 파라미터». 덮지 않는 곳 = 질의 문자열 표면(compare `q`) ⇒ **신설 1**(최소 negative) |
| ② | Cypher injection | **없음** — `tests/graph/graph_drill.py` 는 그래프 «정합» 축이지 injection 축이 아니다 | — | — | 🔴 **신설 2**(최소 negative — 사용자 문자열이 Cypher «구조»가 되지 않는가) |
| ③ | 문서 내부 Prompt Injection | **없음** | — | — | 🔴 **신설 3**(fixture 문서에 지시문 심고 **tool authority 미획득** 실증 · §32.8 「검색 문서는 evidence data이며 instruction authority가 아니다」) |
| ④ | 임의 tool 호출 | `tests/api/scenario_allowlist_drill.py` — `/scenarios` 목록 «밖»이 닫혔는가 | `evidence/t2-2-reading-verification.md` | **#117** | ♻ Gate 7 축 **재실행** |
| ⑤ | 관리자 endpoint 접근 | **없음** — 계약 표면 밖 0(`tests/web/contract_surface_drill.mjs` · `surface_scan.mjs`)은 「문이 계약에 없다」의 근거이지 「접근이 차단된다」의 실측이 아니다(E3) | — | — | 🔴 **미충족**(§35.4 「Public admin endpoint가 차단됐다」 = 빈 칸) |
| ⑥ | 다른 session 접근 | `tests/api/session_guard_drill.py` + `tests/web/e2e/t3-6-isolation-walk.spec.ts` | `evidence/t3-1-session-guard-verification.md` | **#149**(그물) · **#248**(동선) | ♻ **재실행** — T3-6 ②와 **한 번**으로 합산(같은 자극을 두 번 세지 않는다) |
| ⑦ | oversized request | `tests/api/t42b_limits_drill.py`(413) | `evidence/t4-2b-live-guard-verification.md` | **#250** | ♻ **재실행** |
| ⑧ | 반복 요청·rate limit | `tests/api/t42b_limits_drill.py`(429) · `t42b_capacity_drill.py`(503·queue) | `evidence/t4-2b-live-guard-verification.md` | **#250** | ♻ **재실행** |
| ⑨ | 잘못된 WebSocket message | **없음** — `tests/web/t44_gate6_d_ws_recovery.mjs` 는 «중단·재연결» 축이지 malformed 입력 축이 아니다 | — | — | 🔴 **미충족** |
| ⑩ | path traversal | `tests/api/injection_surface_drill.py` — payload 「경로 traversal」·「인코딩 traversal」 **2종 × 문 3 = 6건** | `evidence/t2-2-reading-verification.md` | **#117** | ♻ **재실행** |
| ⑪ | CORS 우회 | `tests/web/t41_cors_browser_drill.mjs` + `_origin_page_server.mjs`(허용/비허용 origin 대조군 · CSP 와 분리해 «누가 막았는지»를 가름) | `evidence/t4-1-public-shape-verification.md` §3 **PASS** | **#218** | ♻ **재실행**(외부 축은 T4-3 승계) |
| ⑫ | stack trace·environment 노출 | `tests/api/error_shape_drill.py`(오류가 «언제나» 계약 형상) + `tests/api/credential_leak_drill.py` | `evidence/t2-1-retrieval-verification.md` · `evidence/t2-3-workflow-verification.md` | **#108** · **#117** | ♻ **재실행** |
| ⑬ | 승인 우회 | `tests/api/r12_enforcement_drill.py`(서버 강제) + `approval_transition_drill.py`(전이 12칸 전수) | `evidence/t2-5-verification.md` | **#137** | ♻ **재실행** |

**합계**: 재실행 8(④⑥⑦⑧⑩⑪⑫⑬) · 신설 3(① 질의 표면 SQL · ② Cypher · ③ prompt injection) ·
🔴 **미충족 2**(⑤ 관리자 endpoint · ⑨ malformed WS).

### 신설 3의 «최소» 정의 (E3 · 그물이 커지지 않게 미리 못 박는다)

- 각 그물 = **자극 수를 표에 적고**, **대조군(정상 입력이 통과함)을 먼저 울린 뒤**에만 판정한다.
  대조군이 죽은 채 난 초록은 판정이 아니다 — 계측기가 고장 나면 negative 판정식은 «전부 통과»로 보인다.
- ① 질의 표면 SQL: compare `q` 에 SQL 조각 5종 — 기대 = 5xx 0 · 내부 문자열(드라이버·경로·SQL 조각) 0 · 코퍼스 생존.
- ② Cypher: 그래프를 타는 입력 경로 5종 — 기대 = 사용자 문자열이 «구조»가 되지 않음(4xx 또는 무해 처리) · 드라이버 예외 문구 노출 0.
- ③ prompt injection: fixture 문서 1본에 지시문 1개 — 기대 = **tool authority 미획득**(승인 없이 상태 전이 0 · 목록 밖 시나리오 실행 0) · **원상 복구 행까지가 측정**.

### 유지(축소 대상 아님)

- **git «이력 포함» secret scan**(T5-2 게이트 3 · §35.4 마지막 항) — 공개 리포의 **비가역** 축.
- **Turnstile**(T5-2 게이트 4 · 결정 ③) — 현 갈래 «동등 보호»(T4-2b) 유지로 **보류**. 🔴 자산(Cloudflare 계정·도메인) 조건부이므로 **«미충족»이 아니라 «보류»**로 적는다 — 「안 쟀다」와 「지금은 못 잰다」를 같은 칸에 넣지 않는다.

---

## §4 T3-6 — 증거 4종 → 착지 그물 재실행 (신설 0)

🔴 **핵심 사실(E1)**: T3-6 이 요구하는 그물은 **이미 develop 에 서 있다**(PR **#248** `lane/levi2-t3-6-nets`).
따라서 T3-6 의 축소는 «그물을 만들지 않는 것»이 아니라 «이미 만든 그물을 한 번씩 돌리는 것»이다.

| # | 증거(§21) | 그물(E1 경로) | 선결 상태 | 축소 후 실행 |
|---|---|---|---|---|
| ① | 노트북 OFF GS 완주 | `tests/web/gate6_offline_probe.mjs` · `tests/web/t44_gate6_c_static_replay.mjs` · `tests/api/gate6_failure_drill.py`(PR **#254**) | 🔴 **T4-4 외부판에서 이미 PASS** — `evidence/t4-4-external-gate6-verification.md` §1 「노트북 OFF … `/api` 전건 차단에도 정적 replay 완주」(E2) | **승계 + 1회 재확인**(T3-6 축 = 셸 화면에서 근거·후보·초안 표시 · 빈 화면 0 · «미연결» 배지) |
| ② | session isolation | `tests/web/e2e/t3-6-isolation-walk.spec.ts` + `tests/api/session_guard_drill.py` | 그물 착지(#248 · #149) · `evidence/t3-1-session-guard-verification.md` | **1회 재실행** — §3 ⑥과 **합산**(중복 실행 0) |
| ③ | keyboard interaction | `tests/web/e2e/t3-6-keyboard.spec.ts` | 그물 착지(#248) · T3-4·T3-5 화면 착지 | **1회 재실행** |
| ④ | desktop viewport QA | `tests/web/e2e/t3-6-viewport.spec.ts` + 공용 검출기 `tests/web/e2e/_layout-probes.ts` | 그물 착지(#248) · 검출기는 T4-4 가 이어 씀 | **1회 재실행** — 3폭 × 5화면 그대로(폭을 줄이지 않는다: 검출기가 한 벌이라 폭 추가 비용이 거의 없다 · E3) |

### Gate smoke 1~5 축소판 (T3-6 후반 · 유지)

| Gate | 그물(E1) | 처리 |
|---|---|---|
| 1 Contract | `tests/web/contract_surface_drill.mjs` · `surface_scan.mjs` · `tests/api` 계열 | ♻ 재실행(계약 밖 0) |
| 2 SSOT | `tests/api/ssot_write_drill.py` | ♻ 재실행(지문 불변) |
| 3 Retrieval | compare 3전략 raw 1회 | ♻ 재실행 |
| 4 Agent | `tests/api/gs01_integration_drill.py`(13행 연쇄) | ♻ 재실행 |
| 5 Live·Replay | `tests/api/gate5_fidelity_drill.py`(PR **#248**) | ♻ 재실행 |

**T3-6 축소 결과**: 신설 0 · 재실행 9(증거 4 + Gate smoke 5) · 판정문 1본.
그물이 이미 있으므로 T3-6 은 **가장 싼 잔여**이며(E3), 축소 안에서도 **전부 유지**를 권고한다.

---

## §5 T5-3 — 보류 6종 → 채택 1(dependency audit)

현 상태(E1 · `d319695`): `.github/workflows/ci.yml` = 1 job `hygiene` 3 step(required files §34.2 ·
contract tests · public boundary scan §34.6) · `.github/workflows/security.yml` = 1 job `codeql`
(javascript-typescript + python · build-mode none · GitHub-hosted).

| # | 보류 항목(T5-3 status 라인 + AC) | v0.3 처리 | 왜 |
|---|---|---|---|
| ① | `ci.yml` 확장(§34.3 8항 — FE/PY lint·typecheck·test · replay fixture schema · SSOT manifest · ontology validation · Docker build · Replay E2E smoke) | 🔴 **미충족** | 8 job 신설 + 캐시 규율 = 잔여 예산 밖(E3) · 기존 hygiene 3 step 회귀 위험 |
| ② | `security.yml` 나머지 5항 — local secret scan 보완 · **dependency audit** · container scan · license inventory · public endpoint policy test | 🟢 **dependency audit 1항만 채택** · 나머지 4항 🔴 미충족 | 채택 이유: **새 의존성 0 · job 1개 · 비가역 축**(취약 의존성은 공개 후 그대로 노출된다) · 항목명은 §34.3 원문 그대로 |
| ③ | `benchmark-smoke.yml` | 🔴 **미충족** | 입력(T5-1 8~10문)이 미착지 — 없는 입력 위의 게이트는 «항상 초록»이 되어 신호가 죽는다 |
| ④ | `release-evidence.yml` | 🔴 **미충족** | 핵심 검사가 README KPI ↔ result file 일치인데 **README 에 KPI 수치가 0**(E1 `README.md:140`) ⇒ 검사 대상 부재 |
| ⑤ | required check 지정(리포 설정) | 🔴 **미충족** | 리포 설정 = 폐하 관문 · 코드 변경 아님 |
| ⑥ | §34.4 runner 경계 성문 | 🟢 **유지(축소 대상 아님)** | 이미 `security.yml` 주석에 성문(E1) · self-hosted runner 등록 0 = 비가역 안전축 |

**T5-3 축소 결과**: 신규 job **1개**(dependency audit) · 미충족 5항 명시 · runner 경계·hygiene 3 step 무변.

🔴 **CI 문면 유지**: 「CI 는 게이트지 acceptance 판정이 아니다(§32.1)」 — dependency audit 초록은
「막지 않았다」이지 「안전하다」가 아니다. 신설 job 주석에 이 문장을 그대로 둔다.

---

## §6 T5-5 — Gate 1~8 «전건 정밀» → Gate 축소판

| 축 | 정본 요구(T5-5) | v0.3 축소판 | 근거 경로(E1/E2) |
|---|---|---|---|
| Gate 1 Contract | 계약 밖 0 · tests/api 전종 | **근거 경로 인용 + 재확인 1축**(계약 밖 0) | `tests/web/contract_surface_drill.mjs` · `surface_scan.mjs` |
| Gate 2 SSOT | 지문 불변 | **재확인 1축** | `tests/api/ssot_write_drill.py` |
| Gate 3 Retrieval | 4전략 raw = T5-1 artifact 재검 | 🔴 **미충족**(T5-1 미착지 — 재검할 artifact 가 없다) | — |
| Gate 4 Agent | GS-01 13행 | **재확인 1축** | `tests/api/gs01_integration_drill.py` · `evidence/t2-6-phase2-integration-verification.md` |
| Gate 5 Live·Replay | live 신규 녹화 ↔ replay 논리 일치 «재실증» | **재확인 1축**(비결정 필드 제외) | `tests/api/gate5_fidelity_drill.py` · `evidence/t2-4-replay-verification.md` |
| Gate 6 장애 | T4-4 승계 + 재부팅 축 재확인 | **승계** · 재부팅 축 🔴 **미충족**(T5-4 미착지) | `evidence/t4-4-external-gate6-verification.md`(노트북 OFF · WebSocket 중단 **2행 PASS** · §5 실측 — 제목의 «골격»은 관측자 축 §4 에 한함) + `evidence/t4-4-external-outage-verification.md`(FastAPI OFF **PASS** §7 · Tunnel OFF **조건부 PASS** · Q-70 재실측 §8) — §32.7 8행 중 **외부 3행 PASS + 조건부 1행** · 나머지 *Not measured* ⇒ **그대로 옮긴다**(로컬 열을 판정으로 올리지 않는다) · 두 파일 병기 = 오케 결정 ① 정정(09-02 08:24 · 단일 정본 지목은 오기) |
| Gate 7 보안 | T5-2 판정 승계 | **승계**(§3 = 재실행 8 + 신설 3 + 미충족 2) | §3 |
| Gate 8 Portfolio Claim | 주장 ↔ Evidence 대응표(모든 수치에 근거 파일 경로) | **유지** — 🔴 축소하지 않는다 | README 수치가 0 이므로 현 시점 비용이 가장 작다(E3) |
| restart recovery | 재부팅 → 자동 복귀(T5-4 스크립트) | 🔴 **미충족**(T5-4 미착지) | — |
| clean env | 타 경로 새 클론 · README 만으로 seed→index→run→GS-01 완주 | **1회 유지** · 막힌 자리 전건 기록(막힌 자리 = README 결함으로 회부) | 🔴 재현 가능성은 §32.9 「재현 가능」 주장의 **유일한 근거**라 뺄 수 없다(E3) |
| §35.1~35.5 점검표 | 전항 실측 근거 경로 | **유지** · 못 채운 항 = **빈 채로**(§0.2) | §35 |

**판정 서식(개정)**: 「**Release 후보 — 축소 적용(v0.3)**」. §35.7 의 10 조건 중 미충족 항을
**목록으로 명기**하고, 미충족이 남은 상태에서 「Portfolio Release」 문구를 쓰지 않는다.

---

## §7 Release 문면 영향

| 대상 | 현 문면(E1) | v0.3 처리 |
|---|---|---|
| `README.md:140` | 「설계 단계 완료 · 구현 진행 중. 라이브 데모 링크, 측정된 성능 지표(KPI), 벤치마크 재현 방법은 배포 후 이 자리에 게시됩니다. **측정 전 수치는 어떤 것도 성능으로 주장하지 않습니다.**」 | **문면 유지** + 배포 시 1줄 추가 권고: 「검증 범위는 «축소 적용(v0.3)»이며 미충족 항목은 판정문에 목록으로 명시되어 있습니다.」 — KPI 수치는 여전히 **게시하지 않는다** |
| §35.7 최종 판정 | 10 조건 전건 | 「**Release 후보(축소 적용 v0.3)**」 + 미충족 목록 동봉. 「Portfolio Release」 판정은 **폐하 관문**으로 유보 |
| §35.2 KPI·Benchmark | 9항 | 🔴 **전항 미충족**(T5-1 미착지) — 빈 칸으로 남긴다. 축소를 이유로 KPI 표를 «잠정 목표»로 채워 넣지 않는다 |
| 공개 경계(§15.2·§16·§34.6) | synthetic only · Claude 구독 미노출 · secret/절대경로 0 · 임의 SQL·Cypher·코드 실행 경로 0 | 🟢 **무변** — 본 축소 안은 공개 경계를 **한 줄도 건드리지 않는다** |
| §34.4 runner 경계 | self-hosted 등록 0 | 🟢 **무변** |

---

## §8 폐하 재가 칸 (항목별)

> ☐ 를 ☑ 로 바꾸시거나 항목별로 «반려/수정»을 적어 주십시오. 재가된 항만 baseline v0.3 개정에 반영합니다.

| # | 재가 항목 | 효과 | 재가 |
|---|---|---|---|
| A | §0.3 «축소 적용» 조항 신설(§1-A) | 축소가 §0.2 를 침식하지 않게 하는 전제 — **A 미재가 시 B~G 전부 무효** | ☑ |
| B | Gate 7 축소(재실행 8 + 신설 3 + **미충족 2**) | §32.8 13항 → 11항 판정 · 관리자 endpoint·malformed WS 는 빈 칸 | ☑ |
| C | T5-2 유지분(git 이력 secret scan) · Turnstile «보류» 표기 | 비가역 축 보존 | ☑ |
| D | T3-6 **전부 유지**(신설 0 · 재실행 9) | 가장 싼 잔여 — 축소 이득이 거의 없다 | ☑ |
| E | T5-3 = dependency audit 1 job 채택 · 5항 미충족 | CI 확장 포기 · 취약 의존성 축만 확보 | ☑ |
| F | T5-5 Gate 축소판(근거 경로 표 + clean env 1회 + §35 점검표) | 전건 정밀 포기 · Gate 3 · Gate 6 재부팅 축 · restart recovery 미충족 | ☑ |
| G | Release 문면 = 「Release 후보(축소 적용 v0.3)」 · README KPI 게시 0 | 「Portfolio Release」 판정 유보 | ☑ |

재가 완료: A~G 전건 · 폐하 2026-09-01 21:21 · baseline 본문 반영 = lane/suzaku18-baseline-v03 (2026-09-02)

### 재가 시 실행 순서 권고 (E3)

1. **D**(T3-6 재실행 9) — 그물이 다 서 있어 가장 싸고, Phase 3 게이트를 닫는다.
2. **B/C**(Gate 7) — 신설 3만 새로 쓰고 나머지 8은 재실행.
3. **E**(dependency audit 1 job) — 단독·작고 다른 축과 충돌 없음.
4. **F**(T5-5 축소판) — 앞 셋의 판정문을 링크로 모으는 일이라 마지막.

### 🔴 축소해도 남는 리스크 (E3 · 폐하께 그대로 올린다)

- **관리자 endpoint 차단 미실측**: 「admin 문이 계약에 없다」와 「접근이 막힌다」는 다른 사실이다. 공개 후 발견되면 되돌릴 수 없다.
- **malformed WebSocket 미실측**: 공개 WS 표면에 예고되지 않은 입력이 닿는 경로가 남는다.
- **KPI·Benchmark 전항 미충족**: §32.9 의 주장 중 「정확도 향상」은 **근거 없이 남는다** — 해당 주장을 README·시연에서 **하지 않는 것**이 유일한 정합 처리다.
- **Gate 3(Retrieval 4전략) 미충족**: 「Vector·Hybrid·GraphRAG 결과를 비교할 수 있다」(§35.1)는 화면 축으로만 서고 **수치 축은 비어 있다**.
