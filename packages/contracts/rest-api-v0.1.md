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
