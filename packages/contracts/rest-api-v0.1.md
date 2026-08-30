---
asset_class: contract
description: REST API 계약 v0.1 — P0 화면 5종의 데이터 요구 커버 (T0-5)
status: draft
lifecycle: D1 동결(T0-3 wireframe 교차 후)
size_limit: 8KB
---

# REST API Contract v0.1

> base = `/api` · 전 응답 JSON · 오류 = `{ "error": { "code", "message" } }` + HTTP 4xx/5xx. 인증 없음(공개 Sandbox) — 세션 키가 격리 단위. rate limit·크기 제한은 미들웨어(계약 외 운영 §16.3).

## 세션 (격리·리셋)

| 메서드 경로 | 요청 | 응답 | 화면 |
|---|---|---|---|
| POST `/sessions` | — | `{ sessionId }` (쿠키 병행) | 입장 시 |
| POST `/sessions/{sid}/reset` | — | `{ ok: true }` — 해당 세션 상태만 초기화 | reset 버튼 |

## 공장·설비 (Overview)

| 메서드 경로 | 응답 요지 | 화면 |
|---|---|---|
| GET `/plants` | 공장 목록 `[{ plantId, name, lineCount, alarmCount }]` | Overview |
| GET `/plants/{plantId}/overview` | 라인·설비 상태 트리 + 활성 알람 `[{ equipmentId, status, activeAlarms }]` + `kpi: { lineActive, alarmCount, openIncidents, pendingWorkOrders }` (G4) | Overview |
| GET `/equipment/{equipmentId}` | 설비 상세: 속성·상태·센서 목록·최근 알람·정비 이력 요약 | Incident |
| GET `/equipment/{equipmentId}/sensors/{sensorId}/series?window=24h\|3w` | 시계열 `[{ ts, value }]` + threshold | 추세 chart |

## 시나리오·조사 실행 (Incident·Agent)

| 메서드 경로 | 요청 | 응답 요지 | 화면 |
|---|---|---|---|
| GET `/scenarios` | — | 승인된 시나리오 목록(allowlist — GS-01 등) | 시나리오 선택 |
| POST `/scenarios/{scenarioId}/runs` | `{ sessionId, mode: "live"\|"replay" }` | `{ runId, incidentId, mode }` — live 불가 시 `mode:"replay"`로 강등 응답 | 조사 시작 |
| GET `/incidents/{incidentId}` | — | incident 표제: 제목·상태·대상 설비·연결 알람·runId (G1) | Incident 라우트 |
| POST `/runs/{runId}/stop` | — | `{ status: "stopped" }` — §12.1 «실행·중지·재설정»의 중지 (G2) · 타임라인에 `run.stopped` 이벤트 발행(F-3b) | 조사 중지 |
| GET `/runs/{runId}` | — | `{ status, candidates[], workOrderDraftId? }` — 완주 후 결과 스냅샷 | Evidence |
| GET `/runs/{runId}/events` | — | 전체 이벤트 배열(agent-events 스키마 · seq 순) — replay 되감기 정본 (G3) | 되감기 |
| WS `/ws/runs/{runId}` | — | agent-events 스키마 스트림 | 진행 표시 |

## 근거·그래프 (Evidence)

| 메서드 경로 | 응답 요지 | 화면 |
|---|---|---|
| GET `/evidence/{evidenceId}` | kind별 실체: doc-chunk(원문+강조 offset + `revisionId`·`contentHash`·`stale`·`approvalState`·`effectiveFrom`/`effectiveTo` — 신뢰 배지 F-4 · 인용 유효 조건 = T0-6 §3.3)·graph-path(노드/엣지)·record·sensor-series 참조 | Evidence 뷰 |
| GET `/graph/paths?from={id}&to={id}\|byRun={runId}` | 그래프 경로(노드·엣지·라벨) — 고정 template 조회만 | graph 시각화 |
| GET `/documents/{docId}?highlight={chunkId}` | 문서 미리보기 + 인용 문장 강조 좌표 + `revisionId`·`contentHash`·`stale`·`approvalState`·`effectiveFrom`/`effectiveTo`(F-4 · T0-6 §3.3 인용 유효 조건) | 문서 preview |

## 검색 전략 비교

| 메서드 경로 | 요청 | 응답 요지 | 화면 |
|---|---|---|---|
| POST `/retrieval/compare` | `{ sessionId, question, strategies: ["vector","hybrid","graphrag"] }` — question은 «승인 시나리오 질문 목록» 내 선택(자유 입력은 길이·rate 제한 하에 허용하되 P0에선 preset 우선) | 전략별 `[{ strategy, hits: [{ evidenceId, score, excerpt }] , elapsedMs }]` | 전략비교 |

## 작업지시 (Work Order)

| 메서드 경로 | 요청 | 응답 요지 | 화면 |
|---|---|---|---|
| GET `/work-orders/{woId}` | — | 초안 전문(항목·부품·절차·안전 조치·근거 evidenceIds) | WO 화면 |
| PATCH `/work-orders/{woId}` | 편집 필드 부분 갱신 | 갱신본 | 편집 |
| POST `/work-orders/{woId}/approve` \| `/reject` | `{ comment? }` | `{ status, auditId }` — 세션 내 이력 기록 | 승인/반려 |

## 운영

| 메서드 경로 | 응답 | 용도 |
|---|---|---|
| GET `/health` | `{ ok, version }` | Vercel·모니터 |
| GET `/live/status` | `{ online: bool, checkedAt }` | Live/Replay 모드 배지·fallback |

## P0 커버리지 자기점검 (T0-3 교차 예정)

Overview·추세·시나리오 실행/중지(reset)·session 격리·event replay·graph evidence·문서 인용 강조·WO 편집/승인/반려·전략 비교·Live 감지·fallback = §12.1 공개 Sandbox 11항 전부 위 표에 매핑. wireframe(T0-3) 도착 후 화면별 데이터 요구 대조로 동결.

## v0.1.1 응답 형상 append (08-30 · 동결 본문 무수정 — 서술만 있던 3라우트 형상 확정 · 제안 = 구현 T2-2 게이트 1 · 판정·성문 = 오케)

> 갈림 시 본 절이 정본. 백틱 6필드(`revisionId`·`contentHash`·`stale`·`approvalState`·`effectiveFrom`·`effectiveTo`)는 본문 그대로.

**GET `/evidence/{evidenceId}`** → `{ evidenceId, kind: "doc-chunk"|"record", revisionId, contentHash, stale, approvalState, effectiveFrom, effectiveTo, text, highlight: {start,end}|null, record: {entityType, fields}|null }`
- revision 6필드 = doc-chunk만 실값 · record는 `null`(record엔 revision이 없다). `record` 필드 = kind=record만 — 화이트리스트 테이블→칼럼 그대로(T2-1 hybrid 방식 재사용).
- `stale`: doc-chunk = `v_index_freshness` 유래 · record = `false` 상수(SSOT 직독 — 색인 낡음 개념 부재 · 사유 코드 성문).
- kind `graph-path`·`sensor-series` = T2-2 범위 밖(T2-1이 해당 evidenceId를 만들지 않음) — `/graph/paths` 재판정(Q-18)과 함께 형상 확정.

**GET `/documents/{docId}?highlight={chunkId}`** → `{ documentId, title, revisionId, contentHash, stale, approvalState, effectiveFrom, effectiveTo, body, highlight: {chunkId,start,end}|null }`
- offset = 원문 대조 산출(`document_chunk`에 offset 열 없음 · 59/59 유일 매칭 실측 E1). 문장 강제 분할 경계 케이스 = 현 데이터 0건 — 발생 조건·«해당 chunk 구간만 강조» 동작은 구현 성문.

**GET `/scenarios`** → `[{ scenarioId, title, questions: [string] }]`
- 질문의 유일한 원천 = 구현 allowlist(T2-1) — `/scenarios`는 읽어서 낼 뿐 자기 목록을 갖지 않는다(이원화 = FAIL). `questions` 싣는다 — 화면이 compare 질문을 얻는 자리를 한 곳으로 고정. 평가 질문 10문의 GS-01 귀속 사유 병기(T0-8 계열 — GS-01 무대의 평가셋).

## v0.1.2 append (08-30 · T2-3 게이트 1 — 의미 확정 1건)

- **GET `/live/status` `online` 의미 확정** = «로컬 Claude synthesize 게이트웨이 도달 가능 여부»(T2-3 J-1 (b) 채택). 공개 Sandbox에는 게이트 env가 없으므로 `online:false`가 **참**이며 결함이 아니다 — Live/Replay 배지가 §15.2(구독 비노출) 경계와 같은 축을 가리킨다. `true` 전환은 운영자 로컬 실행 환경에서만 성립.

## v0.1.5 append (08-30 · T2-5 구현 대조 — v0.1.4 형상 정정 3필드)

- **v0.1.4 형상에 3필드 추가**: `incidentId` · `equipmentId` · `failureModeId` — v0.1.4가 「T2-3 초안 산출 형상 그대로」라 적고 실물 12필드 중 3필드를 빠뜨렸다(성문 시 실물 자동 대조 미실시 — 오케 귀속 · 「옮겨 적은 표는 자동 대조하라」 계보). 채택 근거 = WO 화면이 「어느 incident·어느 설비·어느 고장의 작업지시인가」를 말해야 한다(화면 ④ 맥락 — 별도 조회 강제는 계약이 화면을 배신하는 형태). `state`→`approvalState`는 v0.1.4의 의도된 낱말 정렬 그대로.

## v0.1.4 append (08-30 · T2-5 게이트 1 — work-orders 응답 형상 · 저장 축 해석 확정)

- **`GET /work-orders/{woId}`** → T2-3 초안 산출 형상을 정본화: `{ workOrderDraftId, title, procedures, safetyMeasures, parts, evidenceIds, gaps, note, approvalState }` — 본문 서술(「항목·부품·절차·안전 조치·근거 evidenceIds」)의 필드명 확정(두 곳에 적으면 갈린다 — T2-2 /evidence 선례).
- 🔴 **저장 축 해석 확정**: 스펙 §4 「전체 행 + 승인 이력」은 **«공장 WO»(work_order 테이블 · seed 15행 · SSOT 읽기 전용)의 저장 규격**이다 — 조사 산출 초안(WOD-)의 것이 아니다. 근거 = id CHECK 배타(`WO-…` vs `WOD-…`) · enum 낱말 어긋남 · seed 멱등 보존(T1-2 계보). 초안 CRUD·승인·이력 = 세션 스코프(J-3 계열 · SSOT 쓰기 0) · 이력은 초안보다 오래 산다(비 FK).
- **`approval_state` 전이 규칙 확정(Q-11)**: `pending → approved | rejected` 인접 전진 2쌍만 · approved/rejected = 종단(재승인·번복 없음) · **PATCH는 pending에서만**(종단 상태 편집 = 승인의 뜻 소멸). 위반 = 명시 오류(사유 코드 분리). 해석 규율 = E-7 선례(「스펙이 침묵한 건너뜀도 위반」). 초안 축 낱말 = 테이블 enum에 정렬(pending — draft 이의어 회피).

## v0.1.3 append (08-30 · T2-3 구현 회부 — `mode` 낱말 확정 · 두 축 분리)

- **run/envelope `mode` = «이벤트 출처» 축**: `"live"` = 이번 실행이 실제로 수행됨(단계들이 지금 돌았다) · `"replay"` = 커밋된 fixture 재생(T2-4 축). fixture가 없는 동안 `mode:"replay"` 요청 = **501이 참**(없는 것을 있다고 답하지 않는다).
- 🔴 **본문 「live 불가 시 replay 강등」의 «live 불가» = «실행 자체가 불가»로 한정** — 합성 게이트웨이 부재는 실행 불가가 아니다(synthesize가 공개 경로의 replay 구현으로 돈다 · J-5). 게이트 부재를 강등 트리거로 읽으면 실행된 run의 이벤트가 replay로 나가 되감기 판정이 오염된다 — 그 독법을 금지한다.
- **합성 게이트웨이 축은 별도 낱말** = `/live/status.online`(v0.1.2)이 말한다 — 화면의 Live 배지는 두 축의 조합으로 읽는다. run 응답·이벤트에 synthesize 구현 표시를 실을지는 T2-4/데모 리허설 시점 재론(필요 시 회부).

## v0.1.6 append (08-30 · T3-1 게이트 — 세션 가드 규칙 확정 · Q-16 설계 집행 · 오케 성문)

- 🔴 **세션 가드 전면(wireframes §6 집행)**: `POST /sessions` · `GET /api/health` · `GET /live/status` **제외** 전 라우트 = 유효 세션 필수. 무세션·만료 = **`401 session_required`**(코드 신설 · 오류 형상은 기존 계약 그대로). 전달 = HttpOnly 쿠키 병행 + 본문 `sessionId`(동결 본문 표기 유지) — 🔴 두 값이 «둘 다 있고 다르면» `422 invalid_request`(조용한 우선순위 금지).
- 🔴 **읽기 전용 예외 2라우트(§3:244 집행 — Q-16 긴장 해소)**: `GET /evidence/{id}` · `GET /documents/{id}` = 세션 없이 «열람만» 허용(딥링크 축 · 200 그대로). 세션 스코프 자원(run·WO 초안·승인 이력)은 이 예외에 **없다**.
- 🔴 **세션 소유권(Q-25 폐쇄 축)**: run · WO 초안 · 승인 이력 = 발급 세션 «소유». 타 세션 자원 = **`404 not_found`**(존재 은닉 — 401/403으로 자원 존재를 누설하는 형태 금지). 「id를 아는 누구나」 축이 이로써 닫힌다.
- **reset 의미**: `POST /sessions/{sid}/reset` = 자기 세션만(타 세션 = 404) · 초기화 범위 = 그 세션의 run·초안·이력 «만»(SSOT 무접촉 불변).
