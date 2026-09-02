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
- 🔴 **「전달」 독법 판정(08-30 17:02 오케 — T3-1 구현 회부)**: 인증 «운반» = **쿠키 단독**이다. 본문 `sessionId`는 동결 v0.1 형상이라 «남은» 표기 — 있으면 쿠키와 일치 의무(불일치 = 422), **본문 단독 = 무세션(401)**. 기각 독법 ⓐ(본문만으로 인증)의 기각 사유 = id를 아는 것만으로 남의 세션을 «쓰게» 되어 HttpOnly·소유권 은닉 축이 같이 무너진다 — 조용한 구멍과 시끄러운 불편 중 시끄러운 쪽이 참(구현·검증 양 좌석의 독법 일치 확인).

## v0.1.7 append (08-30 · T3-2 게이트 1 — 조회 계층 형상 확정 · 구현 실물 열 대조 제안 채택 · 오케 성문)

- 🔴 **`openIncidents` 낱말 판정**: incident.status enum 실물 = `{investigating, closed}` — `open`이라는 상태값은 없다. **`openIncidents` = `status <> 'closed'` 계수**로 확정(「진행 중」의 뜻 · 실측 2와 목업 「진행 2」 정합). enum이 늘 때 이 결정의 좌표가 여기다 — 코드 주석이 아니라 계약이 말한다.
- **`GET /incidents/{incidentId}`** → `{ incidentId, title, status, severity, openedAt, closedAt(null 가능), equipmentId, alarmIds[], runId?(연결 run 있을 때만) }`.
- **`GET /equipment/{equipmentId}`** → `{ equipmentId, name, equipmentClass, model, installedOn, status, criticality, lineId, sensors[{sensorId, measurementType, unit, warnThreshold, alarmThreshold}], recentAlarms[{alarmId, severity, status, openedAt}], maintenanceSummary[{workOrderId, type, completedOn, summary}] }`.
- **`GET /plants/{plantId}/overview`** → kpi 4필드(동결 본문 유지 · openIncidents = 위 판정) + `lines[{lineId, name, lineNo, status, equipment[{equipmentId, name, status, criticality, sensorIds[]}]}]` — 설비 카드 스파크라인은 본 응답에 싣지 않고 ④ series를 카드가 따로 먹는다(집계 응답 비대 방지).
- **`GET /equipment/{equipmentId}/sensors/{sensorId}/series`** → `{ sensorId, unit, window("24h"|"3w"만 — 화면 소비 형태 한정), warnThreshold, alarmThreshold, points[{ts, value}] }`. 🔴 **차트 기준선 = `warnThreshold`**(실물: 활성 알람 threshold_value 4.5 = warn — 경보 서사와 차트 선이 같은 값을 가리킨다). alarmThreshold(6.3)를 기준선으로 그리면 「알람이 임계 아래에서 떴다」는 거짓 화면이 된다 — 두 값 모두 내보내되 기준선 낱말은 warn이다.
- 🔴 **원소 형상 정정 단서**: recentAlarms·maintenanceSummary·lines[].equipment[] 원소 필드는 실물 열 대조 제안의 채택이다 — 구현 게이트에서 화면 요구·실물과 갈리면 **정정 append 1회 회부 허용**(v0.1.5 선례 — 조용한 코드측 확장 금지, 갈림은 여기로 돌아온다).

## v0.1.7-정정 append (08-30 · 단서 «발동» — 구현 실물 대조 회부 2건 · 오케 판정)

- 🔴 **maintenanceSummary 원소 정정** = `{ maintenanceRecordId(필수), workOrderId(nullable), type, completedOn, summary }`. 사유: 실물 4행 중 3행이 work_order_id NULL — 원 형상이면 식별자가 통째로 비고, 화면(§2)이 실제로 그리는 「MR-…」은 **근거 id 체계의 일부**(온톨로지 MR→maintenance_record · `/evidence` kind=record로 열린다)인데 원 형상은 「눌러도 안 열리는 id」(WO-)를 그렸다.
- 🔴 **series에 `sampling` 객체 추가**(필수) = `{ method: "bucket-minmax", bucketMs, sourcePoints, returnedPoints }`. 사유: 실측 3w = 44,400포인트 ≈2.07MB — 다운샘플링이 불가피한데 원 형상에는 «가공했다»는 자리가 없어 보는 쪽이 전량을 봤다고 믿는다(§0.2 측정-주장 경계). bucket-minmax(버킷당 min·max 보존)로 임계 교차·알람 마커 무은폐 — **값은 줄이되 줄였다는 사실은 응답이 스스로 말한다**.
- 🔴 **기준선 낱말 «정정 2차»(08-30 19:50 — 검증 11대 E1 전수 실측 회부)**: 위 series 항의 「실물: 활성 알람 threshold_value 4.5 = warn」은 **오기다** — alarm 25행 전수(두 스택 동일): `AL-20260826-0041.threshold_value = 6.3 = alarmThreshold`(warn = 4.5). 귀속 = 구현 13대 회부의 실물 주장을 오케가 «검산 없이» 성문 — 「성문 시 실물 자동 대조」 계보의 같은 날 두 번째 발현. 판정 정정: **차트 기준선을 한 낱말로 지정하지 않는다** — 두 임계선(warn 주의 · alarm 경보) 모두 그리고 라벨 병기 · 🔴 알람 마커·서사의 앵커 = «그 알람 행의 thresholdValue»(`activeAlarms[].thresholdValue` — 실물 6.3). warn 단독 기준선 독법 금지 — 24h 곡선(3.75~8.25)이 4.5를 수차 넘는데 알람은 6.3에서 1회라 「임계 초과인데 알람 침묵」 거짓 서사가 된다.
- 🔴 **overview에 `activeAlarms` 최상위 평면 배열 «복원»** = `activeAlarms[{ alarmId, severity, status, raisedAt, thresholdValue, observedValue, equipmentId, sensorId }]`(severity·raisedAt 정렬). 🔴 귀속 = **오케 성문 실수** — v0.1.7이 동결 본문의 트리를 lines[]로 재구성하며 원소의 activeAlarms를 떨어뜨렸다(동결 본문 자동 대조 미실시 — v0.1.5와 같은 계보의 «세 번째» 발현). 평면 채택 사유(구현 제안 그대로): 알람 도크 = severity 순 «평면 목록»이고 헤드라인 = 「정렬된 목록의 첫 줄」 — 원소 형태면 최댓값 계산 규칙이 계약 밖에 살아 화면마다 갈린다. lines[].equipment[]는 v0.1.7 그대로(알람은 평면 축이 정본).

## v0.1.8 append (08-31 · T4-1 게이트 — `/health` 확장 2필드 · 구현 실물 대조 · 오케 재계산 성문)

- 🔴 **`GET /health` 응답 = 동결 `{ ok, version }` + T1-8 확장 `{ status: "ok"|"degraded", dependencies: { [name]: DependencyProbe } }`(기성문 선례 — 필드 유지·추가) + v0.1.8 확장 2필드**: `build: string`(짧은 git sha · 빌드 인자 `FKT_BUILD_SHA` · 없으면 `"unknown"` — 지어내지 않는다 · 🔴 경로·호스트명·절대경로 0 · 원장 Q-46 「어느 빌드가 답했나」) · `models: { embedding: "cold"|"loading"|"ready"|"failed"|"disabled", detail: string }`(원장 Q-44 준비 축 — `cold` 아직 안 올림 · `loading` · `ready` · `failed` 올리다 실패 · `disabled` = `FKT_WARMUP_EMBEDDING=0` 이라 첫 검색 때 올림 · 🔵 각주(08-31 14:30 · Q-53 · 리바이2 13대 T4-1 AC⑥ 실측): `cold` 는 내부 초기 상태이며 `/health` 표면에서는 관측되지 않는다 — warmup=1이면 기동 즉시 `loading`, warmup=0이면 라우터가 `disabled`로 덮는다(`routers/ops.py`) · 소비자는 표면 4상태(`loading`·`ready`·`failed`·`disabled`)만 만나며 `cold` 처리는 방어 코드로 남긴다 · 열거 자체는 실물 enum 그대로 = 변경 없음). 🔴 `ok` 는 «프로세스 응답 가능»만 · `status` 는 «의존 프로브»만 반영 — 모델 준비 상태는 `status` 를 degraded 로 만들지 않는다(두 사실 분리 · 콜드스타트 ≠ 고장 · 재시작 루프 방지).
- 호환: 기존 필드 무변경 · 추가만. 소비자 = 셸 모드 배지(준비 중 안내 · 빈 화면 0) · tests/api 귀속 단 `_colocation`(Q-42 · sha 축 «선택» 대조) · 드릴 「어느 빌드가 답했나」 선행 검사.
- 실물 대조(E1 · 08-31 12:17 · develop `57d58ed`): `schemas.HealthResponse`·`ModelReadiness` · `routers/ops.health` · `retrieval/embedding.readiness()` · `settings.build_sha` — 구현 자기 실측 원문(`build:"aba3515"` · `models.embedding:"ready"` · `detail:"intfloat/multilingual-e5-small · warm-up 120.8s"`) 일치. 🔴 재계산에서 갈린 것 1: 구현 보고는 준비 상태 3종(cold→loading→ready)이었으나 실물은 **5종**(`failed`·`disabled` 포함) — 성문은 실물을 따른다(오케 검산 규율).

## v0.1.9 append (08-31 · T4-2b 게이트 ① — 보호장치 오류 형상 · 구현 회부 R-A~R-G(센쿠2 17대) · 오케 재계산 성문)

> 동결 본문 11행 「rate limit·크기 제한은 미들웨어(계약 외 운영)」의 «운영 값»은 여전히 env 다 — 여기서 성문하는 것은 **형상**(HTTP · `error.code` · 헤더 · 이벤트)뿐. 오류 형상은 기존 `{ "error": { "code", "message" } }` 그대로 · 기존 필드 무변경 · 추가만.

- 🔴 **429 `rate_limited`** — 축 2개 «각각»(클라이언트 IP · 익명 세션 쿠키 · 무쿠키 요청 = IP 축만) · 초과 = 즉시 429(서버 대기 0) · 헤더 `Retry-After: <정수 초>` 필수. **제외** = `GET /api/health` · `GET /api/live/status` · `OPTIONS`(preflight) · WS 핸드셰이크 `/ws/runs/{runId}`(run 생성이 이미 제한되므로 재연결(§ⓕ)을 429 로 끊지 않는다). 「정적 제외」 문구는 두지 않는다(ai-api 는 정적 서빙 0 · 정적은 셸 축). 운영 값 = env(구현 명명 · 성문은 형상만). 🔴 Funnel/프록시 뒤의 «IP» = `X-Forwarded-For` 첫 값 — 신뢰는 env 로 켤 때만(기본 = 소켓 주소) · 안 켜면 방문자 전원이 한 IP 로 뭉친다는 사실을 runbook(T5-4)에 성문.
- 🔴 **413 `payload_too_large`** — 요청 본문 바이트 상한(env `FKT_MAX_BODY_BYTES` · 기본 65536) · `Content-Length` 선검사 + 스트림 실측 둘 다 · 전 라우트.
- 🔴 **422 `question_too_long`** — 자연어 질문 문자 상한(env `FKT_MAX_QUESTION_CHARS` · 기본 500) · v0.1.6 `422 invalid_request` 와 같은 «형식 위반» 층(코드만 구체화) · 검사 위치 = allowlist 대조 **앞** · 413 은 바이트 축 전용(두 축 겹치면 413 이 먼저).
- 🔴 **503 `live_capacity_exhausted`** — 동시 Live 상한(env `FKT_LIVE_CONCURRENCY` · 기본 1) + bounded queue 상한(env `FKT_LIVE_QUEUE_MAX` · 기본 2)이 «둘 다» 찼을 때 `POST /scenarios/{id}/runs` mode=live 즉시 거절 · 헤더 `Retry-After` · `message` 에 Replay 안내(문구 = 구현 · 셸은 `code` 로 분기).
- 🔴 **큐 «진입» = 오류 아님** — `200 { runId, incidentId, mode:"live" }` 그대로 + 이벤트 신설 **`run.queued`**(agent-events v0.1 type enum **8→9** · payload `{ position: int ≥1, estimatedWaitSec: int|null }` · 순위가 바뀌면 같은 type 재발행 가능(seq 증가) · 슬롯이 나면 `run.started`) · replay 에 큐 없음(fixture 32건 무영향). 큐 대기 상한 = 구현 선택 · 넘기면 `run.failed` + `payload.fallback:"replay"`.
- 🔴 **Q-48 «시작 전 판정» = 200 `mode:"replay"` 강등**(동결 본문 34행 그대로 · 신설 0) — 판정 근거 = `/health` 의존 프로브 결과(`postgres`·`neo4j` 중 하나라도 `unavailable` → live 불가 = v0.1.3 106행 «실행 자체 불가» 독법 안 · 합성 게이트웨이 부재는 여전히 아님) · 프로브 최소 간격 5s(PR#222)라 ≤5s stale 허용 — 그 틈에 시작된 run 은 `run.failed` + `payload.fallback:"replay"`(스키마 151행 · 기존 신호)로 받는다. 강등 조건 = 해당 시나리오 fixture 존재(`investigation/replay.py` = pool·conn·driver 참조 0 → 의존 정지 중에도 서버 replay 성립 · E1) · fixture 없으면 **503 `dependency_unavailable`**(`errors.py:66` 기존 코드 재사용 · 501 은 「구현 없음」이라 live 요청에 쓰지 않는다). 🔴 `resources.pg_pool is None`(`investigations.py:130`)은 «핸들 유무»라 판정 근거로 쓰지 않는다(pg 가 죽어도 객체는 산다).
- **두 축 분리(R-G · T4-2a R-3 와 겹침 0)** — 축 1 「ai-api 미도달」(`liveStatus()` 응답 실패) → 셸 정적 replay(T4-2a) · 축 2 「ai-api 도달 + 의존 정지」 → 위 강등/503(«응답»이므로 R-3 를 켜지 않는다 · 설계대로). 축 2 에서 뒤이은 `/evidence`·`/documents` 는 pg 를 타므로 503 잔존 = «부분 초록» → 원장 Q-56(한계 성문 · T4-4 Gate 6 pg OFF 행이 잰다 · 이 티켓에서 R-3 트리거를 넓히지 않는다).
- 실물 대조(E1 · 08-31 · develop `4596407`): agent-events type enum = **8종**(run.started · plan.updated · step.started · step.evidence · step.completed · run.completed · run.stopped · run.failed — 회부문 「7종」은 오기 · 성문은 실물) · `runFailed.payload.fallback` enum ["replay"](151행) · `runStopped.reason` enum user|timeout|reset(139행 · timeout 호출자 0 = §ⓑ 가 채움) · `session_store.py:35` TTL 8h + lazy `_sweep()`(78·135행 접촉 시만 · 주기 태스크 0 → §ⓔ = 주기 정리 + 주기 env 추가) · 429 · 413 · 503 queue · `Retry-After` = 계약·코드 0건.

## v0.1.10 append (09-02 · D-21 ⓒ — 공개 셸 WS 미개통 시 «주기 조회» 대체 · 폐하 결정 2 ⓐ 18:13 · 오케 성문)

> 동결 본문 WS 행(`WS /ws/runs/{runId}` = agent-events 스키마 스트림 · 진행 표시)은 그대로다. 여기서 성문하는 것은 **클라이언트가 그 스트림을 못 열 때의 대체 경로**뿐 — 서버 형상 변경 0 · 신설 라우트 0 · 이벤트 enum 변경 0.

- 🔴 **대체 조건** — WS 핸드셰이크가 서지 않을 때(101 전 close · 브라우저 close code 1006 · D-21 = Vercel 경로 실측 `evidence/d21-ws-layer-split.md` #388)에 한한다. 101 이 서면 폴링 0(로컬·직결 경로 무변).
- 🔴 **대체 경로** — `GET /runs/{runId}/events`(동결 본문 G3 · 같은 envelope · seq 순)를 주기 조회한다. 간격 = 클라이언트 명명 상수 1곳(초기값 2s · 성문은 «형상»만 · 박은 값 0) · 중복 제거 = `seq`(클라이언트 병합 자리 1곳 · ⓕ 재연결 백로그와 같은 규칙 · 새 필터 금지).
- 🔴 **종료** — terminal 이벤트(`run.completed` · `run.stopped` · `run.failed`) 수신 시 폴링 중단. `run.queued`(v0.1.9)는 terminal 아님 — 큐 대기 중에도 조회는 계속된다.
- 🔴 **화면 의미** — 이 경로의 「진행 표시」는 실시간 스트림이 아니라 «간격 이내 지연 조회»다. 화면은 이를 숨기지 않는다(문면 = 「실시간 스트림 대신 주기 조회로 진행 중」 · 1006 문면 대체). 「실시간」 주장 문면(README · baseline §21)은 「직결 경로 실시간(WS) · 공개 셸 주기 조회」로 정렬한다 — D-21 은 «명기»에서 «대체 착지»로 옮겨지되 **WS 미개통 자체는 남는다**(결함 해소 아님).
- 429 제외 목록(v0.1.9)에 `GET /runs/{runId}/events` 는 **없다** — 폴링 간격이 rate limit 운영값(env)과 충돌하면 화면에 429 로 드러난다(숨기지 않음) · 운영값 조정은 runbook(T5-4) 축 · 계약은 형상만.
- 잰 것/안 잰 것 — 이 조항은 설계 성문(E3). 실측은 구현 PR(센쿠2 · `run-console.tsx` 1파일)과 main 승격 뒤 리바이2 외부 검증에서 붙는다 · 그물(`tests/web/e2e/t3-4-run-screen.spec.ts` 등 WS 101/1006 을 기다리던 자리)은 검증 좌석이 함께 개정한다.
- (정정 09-02 18:34 · #397 판정 · 오케 성문) 429 수신 시 클라이언트는 **조회를 멈추고 사유를 드러낸다**(자동 재개 0 · `retryAfterSec` 은 서버가 준 때만 표기 · 재개 = 사람의 재입장/새로고침) — 위 「드러난다」의 구체 형상 · 셸 429 정책(`lib/contract.ts` 「429 는 되묻지 않는다」)과 일치 · 멈춘 뒤엔 「주기 조회로 진행 중」 배너를 내린다(멈춘 화면이 진행 중이라 말하지 않는다).

## v0.1.11 append (09-02 · T6-1 Live 진단 synthesis — Claude Code CLI(구독) 경유 로컬 게이트웨이 · 폐하 결정 3 19:14~19:17 · 오케 성문)

> 동결 본문 「합성 게이트웨이 축」(v0.1.3 · `/live/status.online`)의 «구현 형상»을 성문한다. 공개 API 표면 변경 0 · 신설 라우트 0 — 게이트웨이는 ai-api «뒤»의 호스트 프로세스이고 공개 경로에 없다.

- 🔴 **게이트웨이** — 운영자 PC 호스트 프로세스 `services/synthesis-gateway/`(`127.0.0.1:<port>` · compose 무등재 · 도달 = env `FKT_LOCAL_SYNTHESIS_GATEWAY` 1개 · 컨테이너는 자격 증명 0) · `POST /synthesize` 입력 = {anchor, candidates[](failureModeId·label·pattern·evidenceIds·history·citations·graphHops·sopIds), evidenceText{id→발췌}} · 출력 = {ranking[], rationale{failureModeId→{sentences[], citedEvidenceIds[]}}, insufficient:bool} · 실행 = Claude Code CLI(`claude -p --output-format json` · 구독 · API 키 0) · 타임아웃 10s(잠정 목표) · 동시 1 · 사용 범위 = baseline §15.2 「소유자 통제 시연 + fixture 녹화」 — 공개 방문자는 기록본 replay.
- 🔴 **근거 결속** — 응답의 `citedEvidenceIds` 가 run 근거집합 밖 id 를 하나라도 담으면 **전량 거부**(부분 채택 0) · 거부/타임아웃/미도달 = 조용한 폴백 0 → `axis="live-rejected"` 로 드러내고 결정적 순위 유지 · LLM 재정렬 허용하되 support 0 후보의 1순위 승격은 거부 · 프롬프트 = 「주어진 evidenceId 만 인용 · 근거 부족 = insufficient=true("근거 없음") · SQL/Cypher/도구 실행 0 · JSON 만」.
- 🔴 **이벤트 형상(agent-events v0.1 스키마 additive — 🔴 스키마 JSON 은 `tests/contract` 커버리지 케이스와 «같은 PR» 로 착지(hygiene strict coverage · 리바이2) · 형상 정본 = 이 절 + 인계 패치 `_handoff/suzaku-t6-1-schema/`)** — `step.completed(synthesize).payload.synthesis{axis: live|deterministic|live-rejected, model?, rejectedReason?}`(선택 · 결정적 경로도 `axis=deterministic` 으로 쓰기를 권장) · `run.completed.candidates[].rationale{sentences[≥1], citedEvidenceIds[≥1]}`(선택 · live 채택 시에만) · 기존 필수 필드·type enum 변경 0 · replay 기록본은 이 형상으로 재녹화(`record_replay_fixture --force` · 심사 PASS).
- 화면 — 후보 카드 = rationale 문장 + 합성 축 배지(live / 결정적 / live-거부 · 숨기지 않음) · `/live/status.online` 의 뜻은 v0.1.3 그대로(게이트웨이 도달 가능).
- 잰 것/안 잰 것 — 설계 성문(E3). 실측 = 구현 PR(센쿠2 31대) + 리바이2 독립 검증(근거 결속 0위반 · off/on+CLI 부재 갈림 · 컨테이너 env·egress 0 · fixture 심사 · GS-01 회귀 · 지연).

## v0.1.12 append (09-03 · T6-2 소유자 스위치 live 합성 — 배포 스택 ↔ 소유자 PC 게이트웨이 · 방문자 상한 · 폐하 결정 4 09-02 22:12~22:27 · 오케 성문)

> 결정 원문 요지: 「실제 LLM 이 붙어 동작 · 외부 사용자 무분별 사용 방지로 옵션화 · 내가 ON 한 경우만 LLM · 아니면 녹화 재생」. 공개 API 표면 변경 = **오류 code 1개 추가**(형상 불변) · 신설 라우트 0. 운영 값(env 이름·기본값)은 11행 규약대로 계약 외 — 여기서는 **형상**만 성문한다.

- 🔴 **소유자 스위치** — 게이트웨이(v0.1.11)는 소유자 PC 호스트 프로세스 그대로이되, 배포 스택이 도달할 수 있게 **bind 주소 + 공유 토큰** 형상을 갖는다: 요청 헤더 `X-FKT-Gateway-Token` · 토큰 설정 상태에서 불일치/부재 = **401** · 비루프백 bind 인데 토큰 미설정 = **기동 거부(소리 내어)** · ai-api 는 합성 요청과 `/health` 프로브 양쪽에 같은 헤더를 동봉한다. ON/OFF = 게이트웨이 프로세스 기동/종료(운영 절차 = runbook · `switch.ps1 on|off|status`) · 컨테이너 재기동 0.
- 🔴 **`/live/status.online` 의 뜻을 «실도달»로 조인다**(v0.1.3 문면 「게이트웨이 도달 가능」 그대로 · 구현 형상만 성문): 값 = 게이트웨이 `GET /health` **실제 프로브 결과**(짧은 타임아웃 · 수 초 캐시 · 합성 소모 0) · 도달 env 부재 시 프로브를 타지 않고 `false`(공개 Sandbox 의 false 는 참 · 기존 성문 무변) · 게이트웨이 OFF → 캐시 만료 뒤 `false` → 화면 = replay 축 + OFF 사유 문면(「소유자 게이트웨이 OFF · 녹화 재생」). 🔴 이전 구현(env 문자열 존재 여부)은 이 절로 폐기 — T6-1 검증 축 ②「off → deterministic」은 그대로 참이다.
- 🔴 **429 `session_run_cap_exceeded`** — 세션(익명 세션 쿠키) 단위 **조사 실행 상한**(기본 3/시간 · 운영 값 env) · 143행 `rate_limited`(분당 · IP·세션 축) 와 **별개 계수 · 별개 code** · 헤더 `Retry-After: <정수 초 · 창 잔여>` 필수 · message = 「세션 조사 상한(N/시간) · 녹화 재생으로 계속」 · 오류 형상 = 11행 `{error:{code,message}}` **불변**(🔴 본문에 `fallback` 등 추가 필드 0 — 09-03 07:17 센쿠2 선발견 · 오케 발주 문면 오기 정정) · 셸 = `code` 로 분기 → 배너 + replay 축 강등(화면 축 · 조용한 폴백 0) · 무쿠키 요청은 세션 축이 없으므로 이 상한의 대상이 아니다(`rate_limited` IP 축이 막는다).
- **모델·effort 형상** — 게이트웨이는 모델 별칭과 effort 단계를 CLI 인자로 넘긴다(기본 = sonnet / medium · 폐하 결정 09-02 22:43 · 빈 문자열 = CLI 기본) · `synthesis.model` 은 v0.1.11 그대로 **실제 응답 model id**(설정값 아님) · effort 반영 여부는 CLI 봉투에 필드가 없어 «인자 전달까지만» 실측 가능(판정문에 「미확인」 표기 허용).
- **타임아웃 불변식** — 클라이언트(ai-api) 예산과 게이트웨이 상한은 **서로 다른 이름의 운영 값**이어야 하고 항상 «게이트웨이 상한 < 클라이언트 예산»(클라이언트 예산 = 게이트웨이 상한 + margin · 게이트웨이가 먼저 504 로 «사유»를 내고 클라이언트는 그 답을 받을 만큼만 더 기다린다 — 같은 이름을 두 층이 읽으면 이 순서가 무너져 어느 쪽이 끊었는지 사후에 못 가른다 · 09-02 드릴 무효 진범 후보 ⓐ · 🔴 09-03 07:31 센쿠2 선발견 = 초판 부등호 오기 정정) · 녹화기는 timeout 시 사유를 버리지 않고 기록한다.
- 잰 것/안 잰 것 — 설계 성문(E3). 실측 = T6-2 구현 PR(센쿠2 32대) + 리바이2 독립 검증(ON/OFF · 401 · 429 4회째 · sonnet/medium 지연 n≥3 · 경계 · 외부 vantage).
