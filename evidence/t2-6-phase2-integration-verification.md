# T2-6 판정문 — Phase 2 독립 검증 (통합)

> 리바이2 10대 · 2026-08-30 · 대상 = `develop` **6acb1e6** 고정
> 근거 등급: **E1 = 이 좌석이 직접 실행해 얻은 값** · E3 = 소견.
> 🔴 **범위 한정**: 이 판정문은 「Phase 2 완료 증거 4종(baseline §21)이 한 사이클에서 함께 참인가」
> 만 말한다. 화면(Phase 3)·운영·성능 주장은 하지 않는다.

## 0. 판정

| | |
|---|---|
| **결과** | 🟢 **PASS** — 착지분 결함 **0건** |
| 통합 연쇄 | GS-01 한 세션 13행 · 🔴 **끊긴 곳 0군데** |
| 회귀 | `tests/api` 자산 **20/20** green · 계약 표면 전건 일치(계약 밖 경로 0) |
| 신규 회부 | **0건**(소견 2건은 이미 Q-33·Q-34로 등재) |
| 🔴 내 그물 결함 | **2건 자수·수정**(M-1·M-2) |

🔴 **이 초록의 주어**: 「§21 증거 4종이 한 사이클에서 함께 선다」이지 「제품이 완성됐다」가 아니다.
못 잰 열은 §5에 열거한다.

## 1. 대상 동일성과 계측 환경 (E1)

| 확인 | 실측 |
|---|---|
| 대상 | `develop` 6acb1e6 · worktree `_wt/levi2-t2-6`(메인 트리 무접촉) |
| 🔴 서버 | **재기동**. 직전 프로세스는 T2-5 worktree에서 띄운 뒤 그 worktree를 tip으로 체크아웃해 **디스크는 새 코드·프로세스는 옛 코드**였다(import 시점 고정). 그대로 재면 「무엇을 검수했는가」가 무너진다 |
| 기동 후 | `/api/health` 200 · postgres·neo4j 둘 다 `state:"ok"` |
| 스택 | postgres 5534 · neo4j 7587 — 재부팅 생존 실측(32테이블 · `work_order` 15행 · 노드 309 · 관계 448) |
| 콜드 워밍업 | 첫 run(RUN-60c7f075d4bc) 계측 제외 |

## 2. 게이트① — 정본 대조 (E1)

baseline §21 Phase 2 「완료 증거」 원문 4종(915~965행 실독)과 실측 축의 대응이다.

| §21 증거 | 실측 축 | 결과 |
|---|---|---|
| ① API contract test | 🔴 **두 축으로 분리해 계수한다**(오케 판정) — ⓐ agent-events 스키마 축 = `tests/contract/run.js` **34/34 · 커버리지 37/37 · 자기 검증 PASS**(이것«만»이 34/34의 주어다) · ⓑ REST 축 = `contract_surface` **전건 일치 · 계약 밖 경로 0** + 라우트별 형상 드릴 | PASS |
| ② Golden Scenario integration test | `gs01_integration_drill` 13행 — §3 | PASS |
| ③ Vector/Hybrid/GraphRAG 동일 질문 실행 결과 | 🔴 **독립 축으로 승격**(오케 판정) — S11 · S1의 질문 문자열 1개를 세 축에 그대로 | PASS |
| ④ evidence ID와 source 문장 일치 | S6 — `body[start:end] == evidence.text` · 불일치 **0** | PASS |

🔴 **측정-주장 경계(§0.2) — 증거①의 주장 폭.** 「contract test 34/34」는 **REST 계약 준수의 근거가
아니다.** 그 러너는 `agent-events-v0.1.schema.json` 하나만 검증한다(cases 1파일 · 실측 확인).
REST 쪽에서 **계약 문서에서 기대 형상을 «매 실행 추출»하는 자산은 `wo_shape_drill` 1종**이고,
나머지는 판정·스펙에서 뽑거나 거동을 잰다. `contract_surface`는 **경로의 존재**를 볼 뿐 응답
본문을 보지 않는다. → REST 전면 형상 하네스 부재 = **Q-33**(신규 제작은 기능 동결 방향과 충돌해
이번 범위 밖).

산출물 5종 중 `structured audit event`는 증거 4종에 대응 항이 없다 — `event_schema_drill`이
이벤트 축을 덮고, 승인 이력(`auditId`)의 **조회 표면은 계약에 없어** 표면 검증 불가(§5 못 잰 열).

## 3. 게이트② — E2E 통합 연쇄 (E1 · `gs01_integration_drill`)

🔴 **통합의 정의**: 단계별 PASS의 나열이 아니라 **앞 단계 산출이 다음 단계 입력으로 실재하는가**.
그래서 매 행이 «받은 것 → 낸 것»을 함께 찍고, 받은 값이 없으면 **그 자리에서 죽는다**
(건너뛴 초록을 만들지 않는다). 한 세션(`levi2-t26-integration`) · 대상 `RUN-14535b78e48c`.

| 행 | 받은 것 | 낸 것 | 결과 |
|---|---|---|---|
| S1 시나리오 선택 | (시작점) | `scenarioId=GS-01` · question 70자 | PASS |
| S2 조사 실행(live) | S1 scenarioId | `RUN-14535b78e48c` · completed | PASS |
| S3 이벤트 타임라인 | S2 runId | 이벤트 32 · 근거 20 · seq 단조 | PASS |
| S4 결론 스냅샷 | S2 runId | `WOD-9f1411354c87` · 후보 2 | PASS |
| S5 근거 열람 | S3 근거 15(doc-chunk·record) | 200 **15/15** · doc-chunk 5 | PASS |
| S5b 소비처 분리 | S3 GP 근거 5 | `/evidence` 전건 404 `not_found` | PASS |
| S6 evidence↔원문 | S5 doc-chunk 5 | `body[start:end]==text` 불일치 **0** | PASS |
| S7 그래프 경로(byRun) | S2 runId + S3 GP 근거 | 경로 5 · GP 근거 **전건 열림** | PASS |
| S8 초안 편집 + R12 대조군 | S4 draft | 거절 403 `safety_measure_immutable` · 안전 2건 유지 · 제목 **반영** | PASS |
| S9 승인 | S8을 거친 그 초안 | `auditId=AUD-19c24168499c` · `approved` | PASS |
| S10 replay 재생 | S1 scenarioId | 이벤트 32 · 재생본 초안 **501** `replay_draft_source_absent` | PASS |
| S11 3전략 동일 질문 | S1 question 1개 | vector 5 · hybrid 5 · graphrag 5 | PASS |
| S12 run↔compare 재현 | S3 근거 + S11 vector | 교집합 **2** — 같은 검색 경로 | PASS |

**끊긴 곳 0군데.** 🔴 S8은 대조군을 «같은 초안 안에» 둔다 — 거절과 반영을 잇달아 던지지 않으면
「R12를 지킨다」와 「편집을 막았다」가 같은 모양이다.

## 4. 게이트③ — 회귀 전수와 표면 계수 (E1)

**`tests/api` 자산 20/20 green.** 🔴 건너뛴 행은 초록으로 세지 않았고, 로그에 남아 있다 —
`replay_fixture` N-01~03(`--no-deps` 열) · `run_surface` 「못 잰 열」(합성 게이트 `online=true`) ·
`credential_leak` L-01의 미해제 skip 8건(응답이 없는 라우트).

**계약 표면 상태 계수** — 🔴 실 id로 쳤다(없는 id로 낸 404를 「해제」로 세지 않기 위해).

| 축 | 계수 |
|---|---|
| 해제 | **15** — `/scenarios` · `/scenarios/{}/runs` · `/runs/{}` · `/runs/{}/stop` · `/runs/{}/events` · `/evidence/{}` · `/graph/paths?byRun` · `/documents/{}` · `/retrieval/compare` · `/work-orders/{}`(GET·PATCH·approve·reject) · `/health` · `/live/status` |
| 미해제 | **8** — 전건 `501 not_implemented`: `/sessions`×2 · `/plants`×2 · `/equipment`×2 · `/incidents/{}` · 🔴 `/graph/paths?from&to` |
| WS | `/ws/runs/{runId}` — `WS ≡ /events` **32 ≡ 32**(replay F-07) |

🔴 `/graph/paths`의 «반쪽»은 결함이 아니다 — 원장 **Q-26** 판정(해제 단위 = 질의 형태 ·
byRun 해제 완료 계수 · from&to는 Phase 3 소비처 시점 재판정 · 사유 단 501 유지가 참).

## 5. 게이트④ — 이연분 재확인과 Phase 3 인계 (E1/E3)

이번 사이클에서 **실측으로 다시 확인한 것**만 E1을 붙인다. 나머지는 좌표만 옮긴다.

| 좌표 | 이번 재확인 | 인계 |
|---|---|---|
| **Q-16** 세션 가드 정본 긴장 | 🔴 **E1** — `sessionId` 없이 `/scenarios`·`/evidence`·`/documents` 전건 **200**. 세션 가드는 **어느 라우트에도 없다**. wireframes §6(모든 라우트 가드)은 미구현이고, §3:244(딥링크 열람 가능)는 «가드가 없어서» 우연히 참이다 | Phase 3 sessions 실체화 |
| **Q-25** 세션 축 부재(읽기→쓰기) | E1 — T2-5에서 승인이 초안 id를 아는 누구에게나 열려 있음을 실측. 이번 사이클에서 승인 경로에 세션 인자가 없음을 재확인 | 같음 |
| **Q-26** `/graph/paths` 해제 단위 | 🔴 **E1** — byRun **200**(경로 5) · from&to **501**. 판정대로 참 | Phase 3 그래프 화면 |
| **Q-27** replay 4경로 | E1 — 4경로 전건 501 `replay_draft_source_absent` · 대조군 404/200 갈림 | 종결 근거 확보 |
| **Q-29** http_400 영어 message | 🔴 **E1 · 범위가 좁혀졌다** — 트리거는 **비-UTF-8 본문 바이트 하나뿐**이다. 깨진 JSON(ASCII)·평문·빈 본문은 전부 `422 invalid_request`(계약 형상·구조화 message). 즉 «본문 디코드 실패»만 앱 검증층 앞에서 새는 자리다 | T2 후반 하드닝 |
| **Q-33** REST 전면 형상 하네스 부재 | 🔴 **E1**(§2) — 이번 게이트①이 낳은 좌표 | T2 후반/Phase 3 |
| **Q-34** `/evidence`의 graph-path 404 | 🔴 **E1** — S5b에서 전건 `404 not_found`. 「없는 근거」와 「안 다루는 kind」가 한 코드 | 계약 v0.2 |
| **Q-13** 덤프 형식 정본 없음 | 미측정(교차 검증 필요 시점 전) | 이월 |
| Q-17·Q-20·Q-22 | 이번 범위 밖(T2-1·T2-2 판정 유지) | 계약 v0.2 |
| Q-31·Q-32 | 화면 축 — 서버 실측 불가 | Phase 3 WO 화면 |
| Q-28 심사기 오탐 3건 | E1 — `replay_fixture` F-09·F-10 green · 현 영향 0 유지 | 이월 |

## 6. 못 잰 열 (🔴 초록으로 세지 않는다)

| 못 잰 것 | 왜 |
|---|---|
| 합성 게이트웨이 도달(`/live/status.online=true`)에서의 거동 | 운영자 로컬 전용이 설계의 참 — 이 스택에서 만들 수 없다(데모 리허설 결속) |
| 승인 이력의 **조회** | 계약에 그 표면이 없다. 없는 경로를 구현이 지으면 「계약 밖 경로 0」이 깨진다 |
| 이력·초안의 **내구성**(재기동 소실) | 세션 스코프의 성문된 대가(J-3 계열) |
| 미해제 8라우트의 **응답 형상** | 응답이 없다. 사유 코드(`not_implemented`)만 참으로 확인 |
| 화면·성능·다중 사용자 | Phase 3 이후 축 |
| REST 응답 형상 **전면** 대조 | Q-33 — 하네스가 없다. 라우트별 드릴이 덮는 만큼만 참 |

## 7. 🔴 내 그물 결함 2건 — 자수

1차 실행의 3 FAIL은 **전부 내 그물의 것**이었다(구현 결함 0). 그대로 올렸으면 없는 결함 셋을 만들었다.

| # | 무엇이 틀렸나 | 어떻게 드러났나 | 처방 |
|---|---|---|---|
| M-1 | 이벤트 근거 추출을 `evidenceIds` «복수형»만 훑었다 | 실물은 `step.evidence`가 **한 건씩** `payload.evidence`로 싣는다 — 근거 20건 중 3건만 잡혀 S6·S7·S12가 **내 빈 목록** 위에서 빨강을 냈다 | 이벤트 전수 덤프로 형상 확인 후 단수형 축 추가 |
| M-2 | S5를 「근거 전건 200」으로 세웠다 | 🔴 그게 **정본 위반**이다 — 계약 v0.1.1 append는 `/evidence` 형상을 doc-chunk·record «만»으로 적었고 graph-path는 범위 밖(T2-3 J-2: 「graph-path 소비처 = `?byRun`」) | 축을 S5/S5b로 갈라 kind별 소비처를 «분리 실증»으로 만듦 |

M-2는 **내 축이 정본보다 넓었던** 경우다 — 넓은 축은 엄격함이 아니라 오답이다.

## 8. 소견 (판정 아님 · E3)

- **소견①** = Q-34. `/evidence`가 자기가 다루지 않기로 «계약된» kind에 `not_found`를 준다.
  계약이 코드를 정하지 않았으므로 현행은 참이고 red가 아니다. 다만 Q-27이 막은 병과 같은 형태다.
- **소견②** Q-29의 트리거가 하나로 좁혀졌다(§5). 「알려진 이연분」을 「본문 디코드 실패 1종」으로
  다시 적을 수 있다 — 범위가 좁아지면 처방도 좁아진다.
- **소견③** S12(run↔compare 교집합 2/5)는 «같은 검색 경로»의 증거이지 «같은 결과»의 증거가 아니다.
  run은 대본이 정한 단계 상한을, compare는 전략 상한을 쓴다 — 교집합이 5/5가 아닌 것은 결함이 아니다.
