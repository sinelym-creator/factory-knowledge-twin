/**
 * 계약 v0.1 표면 — 🔴 클라이언트가 부르는 «모든» 경로가 이 파일 안에 있다.
 *
 * packages/contracts/rest-api-v0.1.md (동결 + append 전건) 중 이 셸이 쓰는 것:
 *   POST /api/sessions              → { sessionId }        (입장 시 1회)
 *   POST /api/sessions/{sid}/reset  → { ok: true }         (리셋 버튼)
 *   GET  /api/live/status           → { online, checkedAt } (모드 배지 · 30s polling)
 *   GET  /api/plants                → 공장 목록            (T3-2)
 *   GET  /api/plants/{id}/overview  → kpi·lines·activeAlarms (T3-2 · 화면 ①)
 *   GET  /api/equipment/{id}        → 설비 상세            (T3-2 · 카드 팝오버 · 화면 ②)
 *   GET  /api/equipment/{id}/sensors/{sid}/series?window= → 시계열 (T3-2 · 스파크라인·차트)
 *   GET  /api/incidents/{id}        → incident 표제        (T3-2 · 화면 ② 헤더)
 *   GET  /api/scenarios             → 승인 시나리오        (T3-2 · 도크)
 *   POST /api/scenarios/{id}/runs   → { runId, incidentId } (T3-2 · 「조사 시작」)
 *   GET  /api/runs/{id}             → 스냅샷              (T3-2 · 원인 후보)
 *
 * 🔴 계약 밖 경로를 여기서 만들지 않는다. 새 경로가 필요해 보이면 코드가 아니라 오케에 간다
 *    — 계약은 동결이고, 화면이 필요로 한다는 이유로 표면이 늘어나면 계약이 사후 추인이 된다.
 *
 * 🔴 백엔드 미연결·501을 «오류»로 다루지 않는다. ai-api는 미구현 라우트에 501을 내도록 서 있고,
 *    지금 이 셸의 관심사는 「연결되었는가」이지 「구현되었는가」가 아니다. 두 경우 모두
 *    unavailable 상태로 접어 화면에 «미연결»로 표시한다 — 빨간 오류로 보이면 없는 결함을 보고하게 된다.
 */

export const CONTRACT = {
  createSession: "/api/sessions",
  resetSession: (sid: string) => `/api/sessions/${encodeURIComponent(sid)}/reset`,
  liveStatus: "/api/live/status",
  plants: "/api/plants",
  plantOverview: (plantId: string) => `/api/plants/${encodeURIComponent(plantId)}/overview`,
  equipment: (equipmentId: string) => `/api/equipment/${encodeURIComponent(equipmentId)}`,
  sensorSeries: (equipmentId: string, sensorId: string, window: SeriesWindow) =>
    `/api/equipment/${encodeURIComponent(equipmentId)}/sensors/${encodeURIComponent(sensorId)}/series?window=${window}`,
  incident: (incidentId: string) => `/api/incidents/${encodeURIComponent(incidentId)}`,
  scenarios: "/api/scenarios",
  startRun: (scenarioId: string) => `/api/scenarios/${encodeURIComponent(scenarioId)}/runs`,
  run: (runId: string) => `/api/runs/${encodeURIComponent(runId)}`,
  // --- T3-3 근거 열람(계약 §근거·그래프 · v0.1.1 형상 · v0.1.6 읽기 예외 2라우트) ------
  evidence: (evidenceId: string) => `/api/evidence/${encodeURIComponent(evidenceId)}`,
  /**
   * 🔴 `highlight` 는 «어느 revision 을 펴는가»까지 정한다(ai-api reading/documents.py).
   *    주면 그 chunk 의 revision, 안 주면 현행 revision — 두 호출은 다른 문서를 낼 수 있다.
   */
  document: (docId: string, chunkId?: string) =>
    chunkId
      ? `/api/documents/${encodeURIComponent(docId)}?highlight=${encodeURIComponent(chunkId)}`
      : `/api/documents/${encodeURIComponent(docId)}`,
  // --- T3-4 실행·재생·전략 비교(계약 §시나리오·조사 실행 · §검색) --------------------
  stopRun: (runId: string) => `/api/runs/${encodeURIComponent(runId)}/stop`,
  /** 되감기 정본 — 전체 이벤트를 seq 순으로 준다(실측 32건 · seq 0~31). */
  runEvents: (runId: string) => `/api/runs/${encodeURIComponent(runId)}/events`,
  compare: "/api/retrieval/compare",
  /**
   * 🔴 **WS 경로에 `/api` 가 붙는다.** 계약 표기는 `WS /ws/runs/{runId}` 이고 그 표의 base 가
   *    `/api` 다 — 실측(ai-api :8003)에서 `/ws/runs/{id}` 는 **403**, `/api/ws/runs/{id}` 는 **101**.
   *    🔴 그 403 은 「세션이 없다」가 아니라 **Starlette 이 «매칭 안 된» WS 경로에 주는 답**이었다.
   *       FKT 코드가 0 인 맨 WS 앱을 같은 스택으로 띄운 대조군이 갈랐다(존재 경로 101 · 없는 경로 403).
   *       403 을 서버의 사실로 받았으면 없는 결함을 보고했을 자리다.
   * 🔴 브라우저는 «셸 origin» 으로 붙는다 — Next 의 rewrite 가 WS 업그레이드를 그대로 프록시한다
   *    (실측: 셸 :3130 경유 101 · ai-api 직결 101). 그래서 API base 를 브라우저에 노출하지 않고,
   *    세션 쿠키도 same-origin 으로 자동으로 실린다.
   */
  runStream: (runId: string) => `/api/ws/runs/${encodeURIComponent(runId)}`,
  // --- T3-5 작업지시서 초안(계약 §work-orders · v0.1.4~5 형상) ------------------------
  workOrder: (woId: string) => `/api/work-orders/${encodeURIComponent(woId)}`,
  approveWorkOrder: (woId: string) => `/api/work-orders/${encodeURIComponent(woId)}/approve`,
  rejectWorkOrder: (woId: string) => `/api/work-orders/${encodeURIComponent(woId)}/reject`,
} as const;

/** 계약 표면 대조용 — 이 셸이 부르는 경로 «전수»(테스트·검수가 이 목록을 계약과 맞춘다). */
export const CONTRACT_SURFACE = [
  "POST /api/sessions",
  "POST /api/sessions/{sid}/reset",
  "GET /api/live/status",
  "GET /api/plants",
  "GET /api/plants/{plantId}/overview",
  "GET /api/equipment/{equipmentId}",
  "GET /api/equipment/{equipmentId}/sensors/{sensorId}/series",
  "GET /api/incidents/{incidentId}",
  "GET /api/scenarios",
  "POST /api/scenarios/{scenarioId}/runs",
  "GET /api/runs/{runId}",
  "GET /api/evidence/{evidenceId}",
  "GET /api/documents/{docId}",
  "POST /api/runs/{runId}/stop",
  "GET /api/runs/{runId}/events",
  "POST /api/retrieval/compare",
  "WS /api/ws/runs/{runId}",
  "GET /api/work-orders/{woId}",
  "PATCH /api/work-orders/{woId}",
  "POST /api/work-orders/{woId}/approve",
  "POST /api/work-orders/{woId}/reject",
] as const;

// --- 계약 v0.1.7(+정정) 응답 형상 ------------------------------------------------
// 🔴 이 타입들은 계약의 «사본»이다. 갈리면 계약이 이긴다 — 여기서 필드를 늘리지 않는다.

export type SeriesWindow = "24h" | "3w";
export type LiveStatus = { online: boolean; checkedAt: string };

export type Kpi = {
  lineActive: number;
  alarmCount: number;
  openIncidents: number;
  pendingWorkOrders: number;
};

export type OverviewEquipment = {
  equipmentId: string;
  name: string;
  status: string;
  criticality: string;
  sensorIds: string[];
};

export type OverviewLine = {
  lineId: string;
  name: string;
  lineNo: number;
  status: string;
  equipment: OverviewEquipment[];
};

export type ActiveAlarm = {
  alarmId: string;
  severity: string;
  status: string;
  raisedAt: string;
  thresholdValue: number | null;
  observedValue: number | null;
  equipmentId: string;
  sensorId: string;
};

export type Overview = { kpi: Kpi; lines: OverviewLine[]; activeAlarms: ActiveAlarm[] };

export type EquipmentSensor = {
  sensorId: string;
  measurementType: string;
  unit: string;
  warnThreshold: number | null;
  alarmThreshold: number | null;
};

export type EquipmentDetail = {
  equipmentId: string;
  name: string;
  equipmentClass: string;
  model: string;
  installedOn: string | null;
  status: string;
  criticality: string;
  lineId: string;
  sensors: EquipmentSensor[];
  recentAlarms: { alarmId: string; severity: string; status: string; openedAt: string | null }[];
  maintenanceSummary: {
    maintenanceRecordId: string;
    workOrderId: string | null;
    type: string;
    completedOn: string | null;
    summary: string | null;
  }[];
};

export type Series = {
  sensorId: string;
  unit: string;
  window: SeriesWindow;
  warnThreshold: number | null;
  alarmThreshold: number | null;
  /** 🔴 응답이 «줄였다»고 스스로 말하는 자리 — 이것 없이 points만 보면 전량으로 오독한다. */
  sampling: {
    method: string;
    bucketMs: number;
    sourcePoints: number;
    returnedPoints: number;
  };
  points: { ts: string; value: number }[];
};

export type Incident = {
  incidentId: string;
  title: string;
  status: string;
  severity: string;
  openedAt: string | null;
  closedAt: string | null;
  equipmentId: string;
  alarmIds: string[];
  /** 이 «세션»의 run 만 붙는다(계약 v0.1.6 소유권) — 없으면 아직 조사를 안 돌렸다는 뜻. */
  runId?: string;
};

export type Scenario = { scenarioId: string; title: string; questions: string[] };

/**
 * 작업지시서 초안 — 🔴 계약 v0.1.4 + v0.1.5 «12필드». 실측(E1)과 정확히 일치한다.
 *
 * 🔴 wireframes §4 목업의 `priority`·`planned_at`·`assignee_role`·`estimated_minutes` 는
 *    **서버에 없다**(실측 전수). 화면에 그 칸을 만들면 계약 밖 표면이 화면에서 태어난다 —
 *    목업은 초안 표기이고 계약이 정본이다(오케 판정 08-31).
 * 🔴 낱말도 서버 것을 쓴다: 목업의 `checklist[]`→`procedures` · `safety[]`→`safetyMeasures` ·
 *    `approval_state`→`approvalState`. 같은 것을 두 낱말로 부르면 갈린다.
 */
export type WoProcedure = { sopId: string; title: string; status: string };
export type WoSafetyMeasure = { safetyRuleId: string; title: string; class: string; mandatory: boolean };
/** 🔴 원소 필드는 전부 선택이다(실측: `{name}` 만으로도 200). 사람이 더한 부품에는 componentId 가
 *  없다 — 온톨로지 id 를 화면이 «지어내지» 않기 위해서다. 비객체 배열은 422 invalid_field_type. */
export type WoPart = { componentId?: string; name?: string; class?: string };

export type WorkOrderDraft = {
  workOrderDraftId: string;
  incidentId: string;
  equipmentId: string;
  title: string;
  failureModeId: string;
  procedures: WoProcedure[];
  safetyMeasures: WoSafetyMeasure[];
  parts: WoPart[];
  evidenceIds: string[];
  gaps: string[];
  note: string;
  approvalState: "pending" | "approved" | "rejected";
};

export type ApprovalResult = { status: string; auditId: string };

/** `POST /retrieval/compare` — 실측: 전략별 hits 5건 · hit 키 = evidenceId/score/excerpt. */
export type CompareHit = { evidenceId: string; score: number; excerpt: string };
export type CompareResult = { strategy: string; hits: CompareHit[]; elapsedMs: number };

export type RunSnapshot = {
  status: string;
  candidates: {
    rank?: number;
    failureModeId?: string;
    label?: string;
    confidenceNote?: string;
    evidenceIds?: string[];
  }[];
  workOrderDraftId?: string;
};

// --- T3-3 근거 열람 형상(계약 v0.1.1 append) ------------------------------------

/** 🔴 계약 v0.1.1: kind 는 이 둘 «뿐»이다. `graph-path`·`sensor-series` evidenceId 는 이
 *  라우트가 다루지 않아 404 로 답한다(Q-34 성문 — 「없는 근거」와 같은 코드인 것이 현행 참). */
export type EvidenceKind = "doc-chunk" | "record";

/**
 * GET /evidence/{evidenceId}
 *
 * 🔴 `highlight` 는 **문서 body 좌표**다 — 이 응답의 `text`(=chunk 본문) 좌표가 아니다.
 *    실측(T3-3 E1 · DOC-SOP-0014@r2#001): text 892자 · highlight{171,1063} span 892자 ·
 *    body 1376자 · `body.slice(171,1063) === text` 참. 그래서 「인용 강조」를 그리려면
 *    이 응답만으로는 부족하고 `/documents` 를 겹쳐야 한다.
 * 🔴 revision 6필드는 `doc-chunk` 만 실값이다. `record` 는 전부 null 이고 `stale` 은
 *    **false 상수**다 — 「신선이 실증됐다」가 아니라 「색인이라는 개념이 없다」는 뜻이다.
 */
export type Evidence = {
  evidenceId: string;
  kind: EvidenceKind;
  revisionId: string | null;
  contentHash: string | null;
  stale: boolean;
  approvalState: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  text: string;
  highlight: { start: number; end: number } | null;
  record: { entityType: string; fields: Record<string, string | number | boolean> } | null;
};

/** GET /documents/{docId}?highlight={chunkId} */
export type DocumentPreview = {
  documentId: string;
  title: string;
  revisionId: string;
  contentHash: string;
  stale: boolean;
  approvalState: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  body: string;
  highlight: { chunkId: string; start: number; end: number } | null;
};

/**
 * chunk ID 조성 — T0-6 §3.1 · DB 제약 `ck_chunk_id_composition` 이 강제한다.
 * `{document_id}@r{N}#{NNN}`. 🔴 ID 자체가 좌표라, 이것을 갈라야 evidence 에서 문서로 간다.
 *    ai-api `reading/evidence.py` 의 `CHUNK_ID_RE` 와 «같은 조성»이다 — 갈리면 화면이
 *    문서를 못 찾는다. 🔴 `\b` 를 쓰지 않고 문자집합·앵커로 잠근다(경계 문자가 달라지면
 *    `\b` 는 조용히 다른 곳에서 끊긴다).
 */
const CHUNK_ID = /^(DOC-[A-Z]{3,4}-\d{4})@r\d+#\d{3}$/;

/** doc-chunk evidenceId → documentId. chunk id 가 아니면 null(추측하지 않는다). */
export function documentIdOf(evidenceId: string): string | null {
  return CHUNK_ID.exec(evidenceId)?.[1] ?? null;
}

/**
 * 동적 라우트 세그먼트를 «값»으로 되돌린다.
 *
 * 🔴 **실측(T3-3 E1 · Next 16.3.3 `next start`)**: params 는 퍼센트 인코딩된 «그대로» 온다.
 *    `/evidence/DOC-SOP-0014%40r2%23001` 로 들어오면 `params.evidenceId` 는
 *    `DOC-SOP-0014%40r2%23001` 이고, 이것을 다시 `encodeURIComponent` 하면 `%2540`·`%2523`
 *    이 되어 ai-api 는 「그런 근거가 없다」(404)고 답한다. 🔴 그 404 는 **자원의 사실이 아니라
 *    내 인코딩의 사실**이었다 — 화면은 「없는 근거」라고 정확한 문장으로 거짓을 말했다.
 *    chunk id 는 `@`·`#` 을 품는 유일한 id 라, 이 축은 여기서만 드러난다(다른 화면의 id 는
 *    영숫자·하이픈뿐이라 인코딩 전후가 같아 조용히 지나간다).
 *
 * 🔴 두 번 디코딩하지 않는다. 이미 디코딩된 값에는 `%` 가 없어 한 번의 `decodeURIComponent`
 *    가 항등이고, 깨진 시퀀스는 던지므로 원본을 그대로 돌려준다 — 추측으로 값을 바꾸지 않는다.
 */
export function decodeRouteParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 미연결(백엔드 부재·501·타임아웃)과 «응답» 을 구분해 돌려준다.
 *
 * 🔴 `setCookie`는 ai-api가 내려보낸 `Set-Cookie` 헤더 «원문»이다(T3-1). 셸이 쿠키 «이름»을
 *    자기 코드에 적지 않기 위해 헤더를 통째로 들고 다닌다 — 이름을 두 번째 자리에 적는 순간
 *    한쪽만 자라고, 그때 화면은 살아 있다고 그리는데 서버는 401을 답한다.
 * 🔴 이 값은 로그·캐시에 싣지 않는다(공개 경계).
 */
/** 서버가 「왜 거절했는가」를 실은 본문 — `{ error: { code, message } }` (계약 §머리말). */
export type ErrorDetail = { code: string; message: string };

export type Reply<T> =
  | { state: "ok"; data: T; setCookie?: string; retried?: true }
  /**
   * 🔴 `detail` = 서버가 «사유 코드»로 나눠 답한 것을 화면까지 옮기는 자리(T3-3).
   *    ai-api 는 같은 400 을 `highlight_mismatch`(이 문서의 것이 아니다)와
   *    `highlight_not_found`(이 문서의 것이지만 그 좌표가 없다)로 «갈라» 답한다 —
   *    화면이 `HTTP 400` 하나로만 그리면 서버가 가른 두 사건이 화면에서 도로 합쳐진다.
   *    🔴 `why` 는 건드리지 않는다: 기존 화면들이 그 문장을 이미 쓰고 있어, 여기서 값을
   *       바꾸면 이 티켓과 무관한 화면의 문구가 조용히 달라진다(요청 밖 변경).
   */
  /**
   * 🔴 `retryAfterSec` = 서버가 「언제 다시 오라」고 «말한» 값(계약 v0.1.9 · 429·503 필수 헤더).
   *    화면이 자기 상수로 「잠시 후」를 그리면 그 숫자는 서버가 하지 않은 말이 되고, 상한이
   *    바뀌는 날에도 화면만 옛 숫자를 계속 말한다. 없으면 `undefined` — 지어내지 않는다.
   */
  /**
   * 🔴 `retried` = 재시도가 «실제로» 돈 회차에만 붙는다 — 아래 `call()` 의 1회(D-11 완화 C) ·
   *    `createSession()` 의 미도달 재시도(D-12 완화). 두 축 다 「돌았다」만 말하고 횟수는 말하지
   *    않는다(횟수를 세는 자리는 D-12 의 `console.warn` 이다 — 회차마다 한 줄).
   *    없으면 필드 자체가 없다 — `false` 를 지어내지 않는다(이 파일의 `detail`·`retryAfterSec` 규율과 같다).
   *    이 축이 없으면 재시도 규칙은 「넣었다」만 남고 «도는가»는 아무도 세지 못한다.
   */
  /**
   * 🔴 `cause` = «미도달» 회차에서 undici 예외의 속을 벗겨 낸 **코드**(D-12b · 로그 전용).
   *
   *    왜 `detail` 에 싣지 않았나 — `detail` 은 「**서버가** 사유 코드로 갈라 답한 것」을
   *    화면까지 옮기는 자리다(위 T3-3 주석). 그 칸에 네트워크 사유를 실으면 화면은
   *    「서버가 사유를 말했다」로 그린다. 실측(이 lane · grep 원문 PR 첨부): `detail` 은
   *    `app/documents/[docId]/page.tsx:79`(`{reply.detail?.code ?? "400"} · …`) ·
   *    `app/evidence/[evidenceId]/page.tsx:210` · `components/work-order/wo-screen.tsx:86,109` ·
   *    `components/overview/start-investigation.tsx:49` 에서 **사람이 읽는 문구**로 쓰인다.
   *    catch 축은 «모든» 호출이 공유하므로, 거기서 `detail` 을 채우면 이 티켓과 무관한
   *    화면들이 `ENOTFOUND · getaddrinfo …` 를 사용자에게 보여주게 된다.
   *
   * 🔴 **화면은 이 필드를 읽지 않는다.** 이것은 서버 로그로만 나가는 축이다.
   * 🔴 **호스트명·쿠키·세션 id 는 절대 담기지 않는다**(공개 경계 §15.2) — 아래
   *    `causeCode()` 가 «대문자 코드 토큰»만 뽑고 자유 문장은 버린다. 없으면 필드도 없다.
   */
  | {
      state: "unavailable";
      why: string;
      status?: number;
      detail?: ErrorDetail;
      retryAfterSec?: number;
      retried?: true;
      cause?: string;
    };

const TIMEOUT_MS = 2000;
/**
 * 전략 비교 상한 — 🔴 «콜드스타트를 결함으로 만들지 않는다».
 *
 * 실측(ai-api :8003): 첫 호출 30초+ (임베딩 모델을 그때 적재한다 · 서버 로그에 HF 적재가 남는다) ·
 * warm 이후 왕복 100ms. 상한을 8초로 두면 첫 방문자에게만 «서버 고장»이 보이고, 그 빨강은
 * 「검색이 죽었다」로 보고된다. 그래서 상한을 콜드스타트보다 길게 두고, 화면은 그동안
 * 「준비 중」이라고 말한다(빈 화면 0). 준비 축 자체는 Q-44(T4-1 warm-up)로 회부돼 있다.
 */
const COMPARE_TIMEOUT_MS = 120000;
/** 조회 계층은 SSOT를 훑는다(스파크라인 12장이 붙는 화면). */
const READ_TIMEOUT_MS = 8000;
/**
 * 입장(세션 발급) 상한 — 🔴 **`TIMEOUT_MS`(2s)를 쓰지 않는다.**
 *
 * 앞판은 이 호출에 기본 상한 2초를 줬고, 그 근거는 「발급은 조회보다 가볍다」였다.
 * 그 전제는 «로컬 형상»의 것이었다. 공개 배포에서 이 호출은 셸 서버(Vercel `iad1`)에서
 * 출발해 Funnel(ts.net)을 지나 한국 노트북까지 갔다 온다 — 콜드 회차가 2초를 넘긴다.
 *
 * 실측(2026-09-01 · 공개 URL · curl 6회): 첫(콜드) `POST /enter` **3.06s** → 발급 실패 →
 * `pending` 세션. 이어진 5회는 2.16 / 0.86 / 1.01 / 0.82 / 0.65s 로 전건 성공(`api`).
 * 즉 «느린 회차만» 죽었고, 죽은 회차의 방문자는 아래 `route.ts` 의 고착까지 함께 맞았다.
 *
 * 🔴 상한을 늘리는 것이 「느려도 참는다」가 아니다 — 2초는 **이 배치에서 정상 왕복도 자르는**
 *    값이었다. 조회와 같은 8초로 맞춘다(발급이 조회보다 무겁다는 뜻이 아니라, 두 축이 같은
 *    사슬을 지나므로 같은 예산을 받아야 한다는 뜻이다).
 */
const ENTER_TIMEOUT_MS = 8000;

/**
 * 브라우저는 상대 경로를 쓴다(next.config.ts의 rewrite가 ai-api로 넘긴다 — 계약 경로가
 * 화면 코드에 «그대로» 남게 하려는 것이다). 서버·미들웨어에는 상대 경로가 없으므로 base가 필요하다.
 */
export function apiBase(): string {
  /**
   * 🔴 **정본은 «빌드 시점» 값이다**(Q-37 종결 · T4-1 ⓑ).
   *
   * 앞판은 `process.env.FKT_API_BASE` 를 «런타임»에 읽었다. 그런데 브라우저가 타는
   * `next.config.ts` 의 rewrite 는 «빌드»에 구워진다 — 같은 화면이 두 개의 ai-api 를 볼 수
   * 있었고, 실측에서 실제로 그렇게 됐다(빌드 8003 / start 9999 → 브라우저 경유는 8003 이
   * 답하고 서버 렌더는 9999 로 나가 미연결 · 세션은 pending).
   * 🔴 그 상태가 화면에서 «정상처럼» 보였다는 것이 결함의 몸통이다(평상시 Replay fallback 문구).
   *
   * 그래서 이 함수는 빌드 상수만 읽는다. 런타임 env 가 달라지면 `instrumentation.ts` 가
   * 부팅을 죽인다 — 두 층이 갈릴 자리 자체를 없앴다.
   */
  return process.env.FKT_API_BASE_BUILD ?? "http://127.0.0.1:8000";
}

/**
 * 오류 본문에서 `{ code, message }` 를 꺼낸다 — 🔴 «못 꺼냈다»를 지어내지 않는다.
 *
 * 본문이 없거나 형식이 다르면 `undefined` 다. 여기서 `{code:"unknown"}` 같은 그럴듯한 값을
 * 만들면 화면은 「서버가 사유를 말했다」고 그리는데 실제로는 아무 말도 없었던 것이 된다.
 */
/**
 * `Retry-After` 헤더 → 초. 🔴 «정수 초» 형식만 읽는다(계약이 그렇게 성문했다).
 *
 * HTTP 표준은 날짜 형식도 허용하지만, 여기서 그것까지 해석하면 화면이 계약에 없는 형식을
 * 받아들이게 되고 — 서버가 그 형식을 내기 시작해도 아무도 모른다. 못 읽으면 `undefined` 다.
 */
function retryAfter(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

async function errorDetail(res: Response): Promise<ErrorDetail | undefined> {
  try {
    const body: unknown = await res.json();
    const err = (body as { error?: unknown })?.error;
    if (err && typeof err === "object") {
      const { code, message } = err as { code?: unknown; message?: unknown };
      if (typeof code === "string" && typeof message === "string") return { code, message };
    }
  } catch {
    // 본문 없음·JSON 아님 — 사유를 «말하지 않은» 것이지 오류가 아니다.
  }
  return undefined;
}

/**
 * 🔴 **D-11 완화 (C) — 「간헐 502/503」을 «멱등 축에서만» 1회 되묻는다.**
 *
 * 증상(E1 · 2026-09-01 12:19~): Production 의 `/api/*` 가 Vercel **엣지 rewrite** 층에서
 * 간헐적으로 502 `DNS_HOSTNAME_EMPTY` 를 낸다(7회 중 4회). 같은 시각 «함수» 경로
 * (`POST /enter`)는 5/5 정상이었다 — 즉 이것은 **우리 층의 결함이 아니고**, 이 상수들이
 * 고치는 것도 아니다. 근본(엣지를 지나지 않게 하는 것)은 별 티켓 (B) 다.
 *
 * 🔴 그래서 이 규칙의 «사정거리»를 좁게 못 박는다:
 *   ① **GET 만.** POST/PATCH 를 되물으면 서버가 «이미 받은» 요청이 두 번 실행될 수 있다
 *      (조사 시작이 두 run, 승인이 두 감사 기록). 502 는 「서버가 못 받았다」의 증거가
 *      아니다 — 프록시가 답을 못 가져왔을 뿐, 원본은 처리했을 수 있다.
 *   ② **상대 경로(`base === ""`) 만.** 절대 URL 축(`apiGetServer`)은 함수에서 나가는
 *      길이라 이 증상이 없다(5/5). 증상이 없는 곳에 재시도를 넣으면 «진짜» 장애 때
 *      지연만 두 배가 된다 — 경보의 사정거리는 처방의 사정거리와 같아야 한다.
 *   ③ **502·503 만.** 429 는 서버가 「그만 와라」라고 «말한» 것이라 되묻는 것이 틀린
 *      대응이고, 4xx·501 은 다시 물어도 같은 답이다. 타임아웃·연결 거부(catch 축)도
 *      제외한다 — 상한을 바꾸지 않기로 한 티켓에서 체감 상한만 두 배가 된다.
 *
 * 🔴 각 시도의 `timeoutMs` 는 **바꾸지 않았다**. 다만 재시도가 도는 회차의 «총» 체감은
 *    최대 `2×timeoutMs + 지연` 이 된다 — 값이 아니라 횟수가 1 늘어난 결과다.
 */
const RETRY_STATUSES = new Set([502, 503]);
const RETRY_DELAY_MS = 300;
/** 🔴 서버가 `Retry-After` 로 「언제 오라」고 말했으면 그 값이 우선한다 — 단 이 상한까지만. */
const RETRY_DELAY_MAX_MS = 2000;

/** 되물어도 «같은 요청»이 되는 축인가 — GET + 상대 경로(브라우저 축). */
function isRetryableCall(init: RequestInit | undefined, base: string): boolean {
  if (base !== "") return false;
  return (init?.method ?? "GET").toUpperCase() === "GET";
}

function retryDelayMs(reply: Reply<unknown>): number {
  if (reply.state === "ok") return RETRY_DELAY_MS;
  const said = reply.retryAfterSec;
  if (said === undefined) return RETRY_DELAY_MS;
  return Math.min(said * 1000, RETRY_DELAY_MAX_MS);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function call<T>(
  path: string,
  init?: RequestInit,
  base = "",
  timeoutMs = TIMEOUT_MS,
  /* 🔴 **재시도 상한을 첫 시도와 «따로» 받는다.** 하나로 묶어 두면 첫 시도 상한을
     올리는 순간 최악 체감이 `2 x 상한 + 지연` 으로 같이 부푼다 — 콜드 한 번을 살리려고
     모든 실패 경로를 두 배로 기다리게 만드는 거래다. 기본값은 첫 시도와 같으므로 이
     매개변수를 안 주는 호출부의 동작은 한 자리도 바뀌지 않는다. */
  retryTimeoutMs = timeoutMs,
): Promise<Reply<T>> {
  const first = await attempt<T>(path, init, base, timeoutMs);
  if (first.state === "ok") return first;
  if (first.status === undefined || !RETRY_STATUSES.has(first.status)) return first;
  if (!isRetryableCall(init, base)) return first;

  await sleep(retryDelayMs(first));
  const second = await attempt<T>(path, init, base, retryTimeoutMs);
  // 🔴 재시도 «뒤에도» 실패하면 그대로 돌려준다 — 화면이 읽는 문면은 달라지지 않는다.
  if (second.state === "ok") return { ...second, retried: true };
  return { ...second, retried: true };
}

/**
 * 🔴 **D-12b — undici 예외의 «속»에서 코드만 벗겨 낸다(로그 전용).**
 *
 * 왜(E1 · Production 런타임 로그 · 2026-09-01 14:30:52~14:31:09): 승격 뒤 첫 뭉치에서
 * `POST /enter` 9건이 `[enter] createSession failed TypeError attempt=1/3·2/3·3/3` 로 전건
 * 3회 다 실패했다 — 즉 D-12 완화가 «구한» 요청은 0/9 다(같은 창의 다른 요청은 성공 ·
 * ai-api 도달 27건). `TypeError` 는 undici 「fetch failed」의 겉껍질이라 DNS(ENOTFOUND ·
 * EAI_AGAIN) · 연결거부(ECONNREFUSED) · 리셋(ECONNRESET) · 연결 타임아웃
 * (UND_ERR_CONNECT_TIMEOUT) · 인증서(CERT_*) 를 **가르지 못한다**. 재시도 횟수·간격을 바꿀
 * 근거도 이 코드가 나와야 생긴다 — 그래서 이 티켓은 값을 건드리지 않고 «무엇이라 우는지»만 연다.
 *
 * 🔴 **자유 문장은 보지 않는다 — 호스트명이 거기 있다**(공개 경계 §15.2 · D-12c/Q-68).
 *
 *    앞판은 `code`·`name`·`message` 를 차례로 훑어 «대문자 토큰»을 **substring 으로** 집었다.
 *    그 형태는 「이 배치의 호스트가 소문자다」에 기대고 있었고, 그것은 코드의 성질이 아니라
 *    **지금 환경의 우연**이다. 리바이2 반대 표본 6행 중 4행이 실제로 조각을 남겼다(E1 회부):
 *      · `message` 에 대문자 호스트(`… ENOTFOUND HARRY.tail…`) → `HARRY` 가 남는다
 *      · 대문자 라벨(`FKT-…`)의 앞 조각이 남는다
 *      · `code` 자체가 호스트 문자열인 표본
 *      · `AggregateError` **안쪽** `message` 로 같은 일이 반복된다
 *    🔴 §15.2 는 「지금은 안 샌다」가 아니라 **「안 샌다」**를 요구한다. 그래서 세 겹으로 좁힌다:
 *      ① **출처는 `code` 필드만** — 바깥 `cause.code` 와 `cause.errors[].code`. `name`·
 *         `message`·문자열 cause 는 «읽지 않는다»(뽑을 자리 자체를 없앤다).
 *      ② **전체 일치**(`^…$`) — substring 탐색을 하지 않는다. 문장 안에서 조각을 집는 일이
 *         구조적으로 불가능해진다.
 *      ③ **접두 허용목록 밖은 값 대신 `OTHER`** — 「무엇인지 모르는 코드가 왔다」는 사실은
 *         남기고 그 «값»은 남기지 않는다. 계수는 살고 내용은 죽는다.
 *    🔴 **알려진 한계**: ③ 은 형태로 막는 규칙이라 `E…`·`ERR_…` 로 시작하는 «대문자 호스트»
 *       (예: `EDGE1`)가 `code` 자리에 오면 통과한다. 값을 아는 방법이 없는 층에서 형태로
 *       거르는 이상 남는 잔여이고, 그것을 안다고 적어 둔다(모르는 척하지 않는다).
 * 🔴 **없으면 만들지 않는다** — 코드가 안 나오면 `undefined` 이고 필드 자체가 없다.
 *    `"unknown"` 같은 값을 지어내면 로그 계수가 「가르지 못했다」와 「가를 게 없었다」를
 *    도로 합친다(이 파일의 `detail`·`retryAfterSec` 규율과 같다).
 * 🔴 **`cause.errors[]` 까지 한 겹 더 본다.** undici 의 happy-eyeballs 실패는 코드를
 *    `AggregateError` 의 `errors` 안에 넣고 바깥 `code` 를 비워 온다. 한 겹만 더 들어가고
 *    그 이상은 따라가지 않는다 — 남의 객체를 끝까지 훑는 것은 로그가 아니라 사고다.
 *
 * 🔴 `/g` 를 붙이지 않는다(`scripts/contract-surface.mjs` D-13 규칙 · lastIndex 가 남아 샌다).
 */
/** 🔴 **전체 일치**다 — 문장 안에서 조각을 집지 않는다(Q-68 ②). */
const CAUSE_CODE = /^[A-Z][A-Z0-9_]{2,40}$/;
/**
 * 🔴 **형태 허용목록**(Q-68 ③) — 근거는 Node `errno` 코드(`E…`) · undici(`UND_ERR_…`) ·
 *    Node 공통(`ERR_…`) · OpenSSL/TLS 검증 코드(`CERT_…`·`…_CERT…`·`DEPTH_ZERO_…`·
 *    `SELF_SIGNED_…`·`UNABLE_TO_…`·`HOSTNAME_MISMATCH`) 의 «형태»다.
 *    여기 없는 값은 버리지 않고 `OTHER` 로 접는다 — 「모르는 코드가 왔다」는 계수는 살리고
 *    그 «값»만 죽인다. 값을 그대로 남기면 `code` 자리에 호스트가 오는 표본에서 그것이 샌다.
 */
const CAUSE_ALLOW: readonly RegExp[] = [
  /^E[A-Z0-9_]+$/,
  /^UND_ERR_[A-Z0-9_]+$/,
  /^ERR_[A-Z0-9_]+$/,
  /^CERT_[A-Z0-9_]+$/,
  /^[A-Z0-9_]*_CERT[A-Z0-9_]*$/,
  /^DEPTH_ZERO_[A-Z0-9_]+$/,
  /^SELF_SIGNED_[A-Z0-9_]+$/,
  /^UNABLE_TO_[A-Z0-9_]+$/,
  /^HOSTNAME_MISMATCH$/,
];
/** 허용목록 밖 코드가 접히는 자리 — 값이 아니라 «있었다»만 남는다. */
export const CAUSE_OTHER = "OTHER";
/** `syscall` 은 `getaddrinfo`·`connect` 같은 소문자 낱말만 허용한다 — 점이 있는 것은 호스트다. */
const CAUSE_SYSCALL = /^[a-z_]{3,20}$/;

/**
 * 🔴 **읽는 자리는 `code` «필드» 하나뿐이다**(Q-68 ①). `name`·`message` 는 보지 않는다 —
 *    호스트는 언제나 그 두 곳으로 들어왔다. 안 읽는 것이 「거르는 것」보다 강하다.
 */
function allowedCodeOf(x: unknown): string | undefined {
  if (x === null || typeof x !== "object") return undefined;
  const raw = (x as { code?: unknown }).code;
  if (typeof raw !== "string" || !CAUSE_CODE.test(raw)) return undefined;
  return CAUSE_ALLOW.some((re) => re.test(raw)) ? raw : CAUSE_OTHER;
}

function causeCodeOf(x: unknown, depth = 0): string | undefined {
  if (x === null || typeof x !== "object") return undefined;
  const o = x as {
    syscall?: unknown;
    errno?: unknown;
    errors?: unknown;
  };
  const head = allowedCodeOf(x);

  /**
   * 🔴 **`errors[]` 는 «전건» 병기한다 — 첫 원소만 보면 주소마다 다른 사유가 사라진다.**
   *    공개 DNS 실측(오케 · 14:40 DoH): 이 배치의 Funnel 호스트는 **A 2개 + AAAA 2개** 다.
   *    Node 20+ 의 happy-eyeballs 가 전부 실패하면 undici 는 `AggregateError`(바깥 `code`
   *    없음)를 내고 주소별 사유를 `errors[]` 에 담는다 — 한 주소는 ECONNREFUSED, 다른
   *    주소는 ETIMEDOUT·ENETUNREACH 일 수 있다. 첫 것만 남기면 「IPv4 는 거부, IPv6 는
   *    닿지도 않음」 같은 갈림이 로그에서 사라진다.
   * 🔴 **안쪽에서도 읽는 것은 `code` 필드뿐이다**(Q-68 ①) — 각 원소의 주소·포트는
   *    `message` 안에 있고(`connect ECONNREFUSED 100.x.x.x:8443`) 그 자리를 아예 보지
   *    않는다. 안쪽 `code` 가 없으면 그 원소는 «아무것도 남기지 않는다». 중복은 접는다.
   */
  const nested =
    depth === 0 && Array.isArray(o.errors)
      ? [...new Set(o.errors.map((inner) => causeCodeOf(inner, depth + 1)).filter(Boolean))]
      : [];

  const codes = [head, ...nested].filter(Boolean) as string[];
  if (codes.length === 0) return undefined;

  // 🔴 `syscall`·`errno` 는 «이 객체»의 것이라 한 겹 안쪽에서는 붙이지 않는다(코드만).
  const tail =
    depth === 0
      ? [
          typeof o.syscall === "string" && CAUSE_SYSCALL.test(o.syscall)
            ? `syscall=${o.syscall}`
            : "",
          typeof o.errno === "number" ? `errno=${o.errno}` : "",
        ].filter(Boolean)
      : [];

  return [...codes, ...tail].join(" ");
}

/** `fetch` 가 던진 것의 `cause` 만 본다 — 겉껍질(`e.name`)은 이미 `why` 가 들고 있다. */
function causeCode(e: unknown): string | undefined {
  if (!(e instanceof Error)) return undefined;
  return causeCodeOf((e as { cause?: unknown }).cause);
}

/**
 * 🔴 **D-12d — ai-api 로 «나가는» 요청만 우리 리졸버를 태운다(우회 · 뿌리 해결 아님).**
 *
 * 왜(E1 · 2026-09-01 15:13~): Production 함수 3종이 전건 `getaddrinfo ENOTFOUND
 * harry.tail488f52.ts.net` 인데 같은 분 공개 DoH 는 A 2건 정상이고 인그레스 IP 직결은 200
 * 이었다. 고장은 «함수 인스턴스의 이름 해석»이고(15:19:17 에는 프록시만 살아나고 `/enter`
 * 는 3/3 실패 — 인스턴스마다 갈렸다), 재시도로는 못 건넌다. 자세한 기전과 단계는
 * `lib/server-dns.ts` 머리말에 있다.
 *
 * 🔴 **사정거리 = 절대 base 회차뿐.** `base === ""` 는 브라우저·same-origin 축이고 그 축은
 *    브라우저가 해석한다 — 그쪽에 dispatcher 를 얹으면 이 티켓과 무관한 경로가 함께 바뀐다.
 * 🔴 **전역 `fetch` 에 undici Agent 를 얹지 않는다.** 전역 fetch 는 Node «내부» undici 이고
 *    우리가 만든 Agent 는 패키지 undici 다 — 다른 복사본끼리는 dispatcher 가 조용히 무시될
 *    수 있다. 그래서 서버 축은 **같은 패키지의 `fetch` + `Agent`** 한 벌로 간다(오케 조건 ②).
 * 🔴 **이 파일은 `server-dns.ts` 를 «import 하지 않는다».**
 *    처음에는 분기 안에서 `await import("./server-dns")` 로 지연 로드했는데, **Turbopack 이
 *    그 동적 import 를 브라우저 그래프까지 따라와** 빌드가 죽었다(실측 원문:
 *    `the chunking context (unknown) does not support external modules (request: node:dns)`
 *    · `Failed to write app endpoint /page`). 이 파일은 클라이언트 컴포넌트가 부르므로
 *    «참조가 있다»는 사실만으로 `node:dns` 가 브라우저 청크에 끌려온다.
 *    그래서 방향을 뒤집었다: **서버 부팅 훅이 «넣어 준다»**(`instrumentation.ts` — 그 파일은
 *    이미 같은 이유로 Node 전용 실체를 동적 import 하는 자리다). 여기에는 «받는 구멍»만 있다.
 * 🔴 **등록 전이면 전역 `fetch` 그대로** — 이 우회가 없던 날과 «같은» 동작이다. 새 실패를
 *    만들지 않는다(등록이 안 됐다는 사실은 부팅 로그 한 줄로 남는다).
 */
type ServerFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * 🔴 **슬롯은 «모듈 변수»가 아니라 `globalThis` 다**(D-12e · 승격 실측이 가른 자리).
 *
 *    D-12d 는 이 자리를 모듈 변수(`let serverFetch`)로 뒀고, 그것이 프로덕션에서 **안 물렸다**.
 *    실측(E1 · main `5515af9` 승격 후 15:50:37~51:24): 같은 요청 로그에
 *    `[dns] dispatcher installed` 는 찍히는데 실패는 그대로 `TypeError ENOTFOUND
 *    syscall=getaddrinfo` 였고 `[dns] system=… fallback=…` 줄은 **0** 이었다 —
 *    즉 «깔렸지만 안 불렸다».
 *
 * 🔴 이유: Next/Turbopack 은 **라우트마다 서버 번들을 따로** 만들고, 이 파일은 그 번들마다
 *    «복사본»으로 들어간다. `instrumentation.ts` 가 등록한 것은 **부팅 번들의 복사본**이 든
 *    모듈 변수이고, `/enter` 라우트 번들의 복사본은 그 값을 영원히 못 본다.
 *    `globalThis` 는 복사본이 몇 벌이든 «하나»라, 쓰는 쪽과 읽는 쪽이 반드시 만난다.
 * 🔴 **읽기는 «호출 시점»에 한다** — 모듈 로드 시점에 한 번 읽어 캐시하면 부팅 순서에 따라
 *    또 `undefined` 를 붙잡고 살게 된다(같은 병의 다른 얼굴).
 * 🔴 내 로컬 드릴 ㉑ 은 이 축을 **볼 수 없었다**: 단일 프로세스에 번들도 없어 복사본이 한 벌뿐이다.
 *    그래서 아래 ㉓ 은 «복사본 2벌»을 일부러 만든다(그것이 이 결함의 모양이다).
 */
const SERVER_FETCH_SLOT = Symbol.for("fkt.serverFetch");

/**
 * 🔴 **이 모듈 «사본»의 지문**(자비스 제안 · D-12e). 로그 두 줄이 같은 사본을 말하는지 보려는 것이다:
 *    `[dns] dispatcher installed mod=A` 인데 `[enter] createSession failed … mod=B` 면 **사본이 갈렸다**(D-12d 의 병).
 *    두 줄의 mod 가 «같은데도» `[dns] system=… fallback=…` 이 안 보이면 그것은 사본 문제가 아니라
 *    «층» 문제다(우회가 안 타는 다른 이유). 지문이 없으면 그 둘이 한 칸에서 뭉친다.
 * 🔴 값은 무작위 «≤8자»다 — `Math.random().toString(16).slice(2, 10)` 은 보통 8자를 주지만,
 *    난수의 16진 표기가 짧게 끝나면 그보다 짧다. 길이로 사본을 세지 마라 — 자릿수가 같다고
 *    같은 사본이 아니고, 짧게 나왔다고 잘린 로그가 아니다. 호스트·세션과 무관하고
 *    프로세스 밖으로 나가지 않는다(§15.2 무관).
 */
export const MODULE_ID = Math.random().toString(16).slice(2, 10);

type GlobalSlot = { [SERVER_FETCH_SLOT]?: ServerFetch };

/** 🔴 서버 프로세스에서만 불린다(`instrumentation.ts`). 브라우저에서는 영원히 미등록이다. */
export function registerServerFetch(impl: ServerFetch): void {
  (globalThis as GlobalSlot)[SERVER_FETCH_SLOT] = impl;
}

/** 드릴이 「물렸는가」를 셀 수 있는 자리 — 등록 여부는 값이 아니라 «사실»이라 세야 한다. */
export function hasServerFetch(): boolean {
  return typeof (globalThis as GlobalSlot)[SERVER_FETCH_SLOT] === "function";
}

async function outboundFetch(base: string, url: string, init: RequestInit): Promise<Response> {
  const impl = (globalThis as GlobalSlot)[SERVER_FETCH_SLOT];
  if (!base || !impl) return fetch(url, init);
  return impl(url, init);
}

async function attempt<T>(
  path: string,
  init: RequestInit | undefined,
  base: string,
  timeoutMs: number,
): Promise<Reply<T>> {
  try {
    const res = await outboundFetch(base, base + path, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 🔴 상태코드를 함께 돌려준다. 화면이 「그런 자원이 없다(404)」와 「지금 못 물어봤다」를
    //    가르지 못하면 두 상태가 같은 모습으로 그려진다 — 서버가 사유 코드를 나눈 이유가
    //    화면에서 사라진다.
    if (res.status === 501) return { state: "unavailable", why: "미구현(501)", status: 501 };
    if (!res.ok) {
      return {
        state: "unavailable",
        why: `HTTP ${res.status}`,
        status: res.status,
        detail: await errorDetail(res),
        retryAfterSec: retryAfter(res),
      };
    }
    const setCookie = res.headers.get("set-cookie") ?? undefined;
    return { state: "ok", data: (await res.json()) as T, setCookie };
  } catch (e) {
    // 연결 거부·타임아웃·JSON 파손 — 전부 「지금은 못 물어본다」로 같다.
    // 🔴 `why`(= `e.name`)는 **한 글자도 바꾸지 않는다** — 화면 문구와 드릴이 이미 쓰고 있다.
    //    가른 사유는 `cause` 라는 «다른 칸»에 따로 담는다(D-12b).
    const cause = causeCode(e);
    return cause
      ? { state: "unavailable", why: e instanceof Error ? e.name : "unknown", cause }
      : { state: "unavailable", why: e instanceof Error ? e.name : "unknown" };
  }
}

/**
 * 🔴 **D-11 (B) — 브라우저의 `/api/*` 를 «엣지 rewrite» 대신 «Vercel 함수»가 받아 넘긴다.**
 *
 * 왜: Production 의 엣지 rewrite 가 간헐적으로 502 `DNS_HOSTNAME_EMPTY` 를 냈다(12:19~ ·
 * 7회 중 4회). 같은 시각 «함수» 경로(`POST /enter` → 이 파일의 `createSession`)는 5/5
 * 정상이었다 — 두 길의 차이는 우리 코드가 아니라 «어느 층이 목적지를 해석하는가» 다.
 * 그래서 조회도 함수가 받는 길로 옮긴다. (C) 의 재시도는 깜빡임을 덮는 완화였고, 이것이
 * 그 깜빡임이 나는 층을 지나지 않게 하는 쪽이다.
 *
 * 🔴 **이 함수가 `lib/contract.ts` 에 있는 이유** — 「셸에서 나가는 fetch 는 한 파일에 모인다」는
 *    불변식(`scripts/contract-surface.mjs`)이다. 라우트 핸들러 안에 fetch 를 두면 그 규칙이
 *    이 한 파일만큼 약해지고, 검사기는 그만큼 조용해진다.
 * 🔴 **표면은 넓어지지 않는다** — 이 프록시가 넘기는 것은 rewrite 가 넘기던 것과 «같은»
 *    `/api/*` 전량이다. 계약 밖 경로가 새로 열리는 것이 아니라, 같은 문이 다른 층으로 옮겨진다.
 * 🔴 **경로는 `pathname` 을 그대로 쓴다.** catch-all 세그먼트를 다시 조립하면 Next 가 디코드해
 *    준 값을 내가 다시 인코딩하게 되고, `%2F` 같은 값이 왕복에서 달라진다 — 내 인코딩이
 *    상대의 404 가 되는 자리다. 들어온 경로를 그대로 옮기면 그 자리가 없다.
 * 🔴 **자체 상한을 두지 않는다.** 여기서 `AbortSignal.timeout` 을 걸면 `compare`(120s 예산)를
 *    이 층이 조용히 자른다. 상한은 호출자(`call()`)와 함수의 `maxDuration` 이 이미 갖고 있다.
 */
export async function proxyApiRequest(req: Request, opts: { https: boolean }): Promise<Response> {
  const url = new URL(req.url);
  const target = apiBase() + url.pathname + url.search;

  // 🔴 통과시킬 요청 헤더를 «목록으로» 정한다 — 통째로 넘기면 host·x-forwarded-* 까지 실려
  //    상대가 우리 호스트를 자기 것으로 읽는다. 필요한 것만 옮긴다.
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "accept"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await outboundFetch(apiBase(), target, {
    method: req.method,
    headers,
    // 🔴 본문은 «스트림 그대로» 넘긴다(버퍼로 읽으면 큰 compare 본문을 이 층이 통째로 안는다).
    //    Node fetch 는 스트림 본문에 `duplex: "half"` 를 요구한다.
    body: hasBody ? req.body : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
    redirect: "manual",
    cache: "no-store",
  } as RequestInit);

  const out = new Headers();
  for (const name of ["content-type", "retry-after", "cache-control"]) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }

  // 🔴 `Set-Cookie` 는 «원문 그대로» 옮긴다 — 쿠키 정체성의 정본은 API 한 곳에 남는다.
  //    🔴 `Secure` 만 셸 쪽 조건으로 덧붙인다: API 는 자기 요청 스킴(서버간 http)을 보고
  //       정하므로 Secure 가 빠지는데, 브라우저 쪽 조건은 브라우저 쪽에서 안다.
  //       이 판정은 `app/enter/route.ts` 의 규율을 «한 글자도 바꾸지 않고» 그대로 쓴다.
  for (const raw of upstream.headers.getSetCookie()) {
    out.append("set-cookie", opts.https && !/;\s*secure/i.test(raw) ? `${raw}; Secure` : raw);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/**
 * 🔴 **D-12 완화 — 「미도달」 회차에 한해 세션 발급을 되묻는다. 뿌리 해결이 아니다.**
 *
 * 증상(E1 · 14대 실측 · Production): `POST /enter` 가 «뭉쳐서» 실패했다 — 13:26~13:35 의
 * 35/35 가 `fkt_session=pending`(fkt_sid 없음)이었고 13:42 이후로는 30/30 · 5/5 전건 성공.
 * 같은 창의 ai-api 로그에 그 35건의 `createSession` 도달은 **0** 이다(같은 창 프록시 경유
 * `POST /api/sessions` 는 3/3 200). 반환은 0.7~3s 라 `ENTER_TIMEOUT_MS`(8s) 타임아웃도
 * 아니었다 — fetch 가 «새 연결»에서 즉시 실패했고, 그 사유는 아래 `attempt()` 의 catch 축
 * (`{state:"unavailable", why:e.name}` · status 없음)으로 접혀 어디에도 남지 않았다.
 *
 * 🔴 **뿌리는 우리 층이 아니다**(E3): Vercel 함수 → ts.net 새 연결이 간헐적으로 서지 않는
 *    자리다(D-11 과 한 뿌리로 보이나 이 코드가 확인하지 못한다). 프록시 람다는 keep-alive
 *    재사용이라 같은 창에도 건강해 보였다. 그래서 이것은 «완화 + 관측»이다 — 이 상수들이
 *    실패를 없애지 않는다. 없애는 것처럼 적으면 다음 사람이 진짜 뿌리를 찾지 않는다.
 *
 * 사정거리를 좁게 못 박는다:
 *   ① **미도달 축만**(`state==="unavailable" && status===undefined`). 서버가 «답한»
 *      4xx/5xx 는 되묻지 않는다 — 다시 물어도 같은 답이고, 그 요청은 서버가 이미 받았다.
 *   ② **중복 발급 부작용 0 의 근거가 ①에 걸려 있다.** POST 재시도가 위험한 이유는 「서버가
 *      이미 받았을 수 있다」인데, 이 축은 요청이 서버에 닿지 않은 것이 관측된 자리다
 *      (도달 0). `status` 가 하나라도 있으면 그 전제가 깨지므로 그 자리에서 반환한다.
 *   ③ **`ENTER_TIMEOUT_MS` 는 그대로다.** 값이 아니라 횟수만 는다 — 다만 그 «횟수»가
 *      타임아웃 형에서는 상한을 세 번 쌓았다. 이 줄이 「상한에 닿기 전(0.7~3s)에 실패해 온
 *      축」이라 적은 것은 «관측된 뭉치»의 성질이지 이 코드가 보장한 값이 아니었다 —
 *      그 자리는 아래 Q-70 의 «총 예산»이 닫는다.
 *   ④ **재시도는 `call()` 이 아니라 여기서 돈다.** `call()` 의 규칙(D-11 C)은 GET · 상대
 *      경로 · 502/503 이고, 그 사정거리를 넓히면 이 티켓과 무관한 POST 축들이 함께 되묻게
 *      된다(조사 시작이 두 run, 승인이 두 감사 기록). 처방은 증상이 난 한 호출에만 준다.
 */
const ENTER_RETRY_DELAYS_MS = [400, 800];

/**
 * 🔴 **Q-70 — 체감을 정하는 것은 재시도 «횟수»가 아니라 «총 예산»이다.**
 *
 * 증상(E1 · 리바이2 #333): Tunnel OFF — 연결은 서는데 답이 오지 않는 «블랙홀» — 에서
 * `POST /enter` 가 **20초+** 걸렸다. 같은 실패라도 FastAPI OFF(연결 «거부»)는 2.86s 였다
 * (#342). 갈린 것은 실패의 «종류»인데, 앞판의 되묻기 규칙은 그 종류를 구분하지 않았다:
 * 미도달(`status===undefined`) 한 칸으로 접히면 타임아웃도 즉시 실패와 같은 문으로 들어와
 * **시도마다 `ENTER_TIMEOUT_MS`(8s) 를 온전히 새로 받는다.**
 *
 * 🔴 실측(BEFORE · 기점 `cd8dcfa` · `tests/web/d12_enter_retry_budget.mjs` · 이 노트북):
 *      타임아웃 형  총 **25,230ms** = 시도 3회 × ≈8,004ms + 지연 1,220ms
 *      즉시 실패 형 총 **1,217ms**  = 시도 3회(≈0ms)      + 지연 1,217ms
 *    두 줄의 차이가 이 티켓이다. 외삽이 아니라 벽시계로 갈린 값이다.
 *
 * 🔴 **처방은 시도별 상한이 아니라 총 상한이다.** 시도별 8s 를 줄이면 정상 발급이 죽는다 —
 *    공개 배포의 콜드 왕복이 3.06s 였다(위 `ENTER_TIMEOUT_MS` 실측). 그 값을 자르는 순간
 *    이 티켓은 「빨리 실패한다」가 아니라 「멀쩡한 발급을 실패로 만든다」가 된다.
 *    그래서 시도별 상한은 **그대로 두고**, 시도들의 «합»에 상한을 씌운다.
 *
 * 🔴 **그 결과 타임아웃 형은 재시도를 잃는다 — 부작용이 아니라 처방의 «내용»이다.**
 *    한 시도가 예산 전량을 쓰기 때문이다. D-12 가 되물어 «구하려던» 축은 0.7~3s 에 즉시
 *    실패해 온 미도달 축이고(위 머리말 · ai-api 도달 0), 그 축은 이 예산 안에서 지금도
 *    2~3회 다 돈다(위 실측 1,217ms). 블랙홀을 되묻는 것은 같은 8s 를 다시 태우는 일이라
 *    구해 낼 요청이 «구조상» 없다 — 없앤 것은 재시도가 아니라 «헛기다림»이다.
 *
 * 🔴 **`maxDuration`(60 · `app/enter/route.ts`)과 정합.** 그 값은 「플랫폼이 우리보다 먼저
 *    자르지 못하게」 두는 천장이고, 기다림을 정하는 것은 여기 이 예산이다. 8s ≪ 60s 라 두
 *    값은 충돌하지 않는다. 예산이 좁아졌다고 천장을 함께 내리지는 않았다 — 천장은 Q-67 이
 *    정한 다른 축이고, 내리면 D-12b 의 «마지막 회차» 로그가 잘릴 자리만 새로 생긴다.
 */
const ENTER_TOTAL_BUDGET_MS = 8000;
/**
 * 🔴 남은 예산이 이보다 짧으면 새 시도를 **시작하지 않는다.**
 *    정상 왕복은 0.65~3.06s 다(위 실측). 남은 800ms 로 시도를 여는 것은 재시도가 아니라
 *    «TimeoutError 를 지어내는 일»이고, 그러면 관측 축(`why`)에 원래 없던 사유가 섞인다.
 */
const ENTER_MIN_ATTEMPT_MS = 1000;

/** 다음 시도를 «열 수 있는가» — 열 수 있으면 그 시도가 쓸 지연·상한까지 함께 답한다. */
export type EnterRetryBudget =
  | { go: false; reason: "attempts" | "budget" }
  | { go: true; delayMs: number; timeoutMs: number };

/**
 * 🔴 **예산 산술을 순수 함수로 떼어 둔다** — 벽시계 없이도 판정할 수 있어야 한다.
 *    드릴이 이 함수를 직접 부르면 「8초 기다려 봤더니 그렇더라」가 아니라 「이 입력에는
 *    이렇게 답한다」를 **즉시** 세운다. 그때의 초록은 시계가 아니라 규칙이 낸 것이다.
 *    벽시계 축은 그것대로 따로 남긴다 — 둘 중 하나만으로는 이 처방이 증명되지 않는다.
 *
 * @param attempt 방금 «실패한» 회차(1-base)
 * @param spentMs `createSession()` 진입부터 지금까지의 벽시계
 */
export function enterRetryBudget(attempt: number, spentMs: number): EnterRetryBudget {
  // 회차 소진 — 지연표의 길이가 곧 되묻는 횟수다(값을 여기에 다시 적지 않는다).
  if (attempt < 1 || attempt > ENTER_RETRY_DELAYS_MS.length) {
    return { go: false, reason: "attempts" };
  }
  const delayMs = ENTER_RETRY_DELAYS_MS[attempt - 1];
  const left = ENTER_TOTAL_BUDGET_MS - spentMs - delayMs;
  if (left < ENTER_MIN_ATTEMPT_MS) return { go: false, reason: "budget" };
  // 🔴 남은 예산이 시도별 상한보다 짧으면 «남은 만큼»으로 연다 — 한 시도도 예산을 넘지 못한다.
  return { go: true, delayMs, timeoutMs: Math.min(ENTER_TIMEOUT_MS, left) };
}

export async function createSession(base = ""): Promise<Reply<{ sessionId: string }>> {
  // 🔴 `no-store` — 세션 발급 응답은 캐시에 남을 물건이 아니다(쿠키가 실려 있다).
  const once = (timeoutMs: number) =>
    call<{ sessionId: string }>(
      CONTRACT.createSession,
      { method: "POST", cache: "no-store" },
      base,
      timeoutMs,
    );

  // 🔴 예산의 기점은 «이 함수 진입»이다(Q-70). 상한이 걸리는 것은 시도 하나가 아니라 합이다.
  const startedAt = Date.now();
  const spentMs = () => Date.now() - startedAt;

  let reply = await once(Math.min(ENTER_TIMEOUT_MS, ENTER_TOTAL_BUDGET_MS));
  let attempt = 1;
  let retried = false;
  const attempts = ENTER_RETRY_DELAYS_MS.length + 1;

  for (;;) {
    if (reply.state === "ok") return retried ? { ...reply, retried: true } : reply;

    /**
     * 🔴 **실패 «회차마다» 한 줄** — 최종 실패 회차도 남긴다.
     *    `why`(= `e.name`: `TypeError`·`TimeoutError`…)는 이 줄이 없으면 어디에도 남지
     *    않는다. 반환값의 `why` 는 화면 문구로만 쓰이고 서버 로그에는 안 실린다 — 즉
     *    Vercel 런타임 로그에서 「DNS 인가 TLS 인가 타임아웃인가」를 가르는 유일한 E1 축이
     *    이 한 줄이다. 세션 id·쿠키는 찍지 않는다(공개 경계 §15.2).
     *
     * 🔴 **D-12b — `why` 뒤에 `cause` 코드를 붙인다.** 첫 뭉치 실측에서 이 줄은 9건 전건
     *    `TypeError` 만 말했고, 그 이름으로는 DNS·연결거부·리셋·인증서가 한 칸에 뭉친다.
     *    `cause` 는 «코드 토큰»만 담긴 값이라 호스트명이 섞이지 않는다(`causeCodeOf`).
     *    없으면 붙이지 않는다 — 자리를 채우려고 지어내지 않는다.
     */
    const said = reply.cause ? `${reply.why} ${reply.cause}` : reply.why;
    console.warn(
      "[enter] createSession failed",
      said,
      `attempt=${attempt}/${attempts}`,
      // 🔴 Q-70 — «얼마를 쓰고» 실패했는지를 같은 줄에 싣는다. 이 값이 없으면 로그에서
      //    즉시 실패(≈0ms)와 블랙홀(8,004ms)이 같은 문장으로 보인다.
      `spent=${spentMs()}ms`,
      `mod=${MODULE_ID}`,
    );

    // 서버가 «답한» 실패 — 되묻지 않는다(①).
    if (reply.status !== undefined) return retried ? { ...reply, retried: true } : reply;

    // 🔴 남은 «총» 예산이 다음 시도를 감당하는가(Q-70).
    const next = enterRetryBudget(attempt, spentMs());
    if (!next.go) {
      // 🔴 「회차를 다 썼다」와 「예산이 잘랐다」를 로그에서 가른다 — 한 코드가 두 사유를
      //    덮으면 다음 사람이 재시도 «횟수»를 헛짚는다. 예산이 자른 회차만 한 줄 더 남긴다.
      if (next.reason === "budget") {
        console.warn(
          "[enter] createSession retry budget spent",
          `attempt=${attempt}/${attempts}`,
          `spent=${spentMs()}ms`,
          `mod=${MODULE_ID}`,
        );
      }
      return retried ? { ...reply, retried: true } : reply;
    }

    await sleep(next.delayMs);
    attempt += 1;
    retried = true;
    reply = await once(next.timeoutMs);
  }
}

/**
 * 入장 «실행» — 셀 자신의 라우트 `POST /enter` 를 부른다 (Q-39 ⓒ · D-3).
 *
 * 🔴 **이것은 계약 v0.1 표면이 아니다.** ai-api 로 나가는 요청이 아니라 이 셀의
 *    라우트 핸들러를 부르는 same-origin 요청이고, 계약(`POST /api/sessions`)은 그 핸들러
 *    «안»에서 쓰인다. 그럼에도 이 함수가 여기 있는 이유는 «셀에서 나가는 fetch 는 한
 *    파일에 모인다»는 불변식(scripts/contract-surface.mjs) 때문이다 — 그 규칙의 값은
 *    「계약 밖 경로가 어느 컴포넌트에서 조용히 새지 않는다」에 있고, 예외를 컴포넌트
 *    쪽에 두면 규칙이 그만큼 약해진다(예외를 허용하는 순간 검사기는 「내가 쓴 것 전부
 *    허용」이 된다).
 *
 * 🔴 `call()` 을 쓰지 않는다: 이 응답은 JSON 이 아니라 303 이고, 필요한 것도 본문이
 *    아니라 «쿠키»다. call() 에 태우면 303 이 `!res.ok` 에 걸려 unavailable 로 접힌다.
 * 🔴 `redirect:"manual"` 이유: 그냥 두면 fetch 가 303 을 따라가 `/overview` 문서를
 *    통째로 받아 버리고(그 SSR 이 API 를 기다리는 동안 사람은 아무것도 못 본다) 그 응답을
 *    버린다. 쿠키는 항해가 아니라 응답의 일이라, 따라가지 않아도 브라우저가 심는다(same-origin).
 */
export async function enterSession(): Promise<void> {
  await fetch("/enter", { method: "POST", redirect: "manual", cache: "no-store" });
}

export function resetSession(sid: string, base = ""): Promise<Reply<{ ok: boolean }>> {
  return call<{ ok: boolean }>(CONTRACT.resetSession(sid), { method: "POST" }, base);
}

/**
 * 🔴 **콜드 왕복은 서버가 느린 것이 아니다** — 스자쿠 30대 실측(공개면 API):
 * 첫 호출 **1.83s** · 2~5회 **0.46~0.47s** · 본문은 5회 동일. 즉 느린 것은 첫 연결이고,
 * 그 1.83s 는 `TIMEOUT_MS`(2s) 를 거의 채운다 — 조금만 느려도 첫 화면이 「끊겼다」고 말한다.
 *
 * 그래서 **첫 «시도»에만** 5s 를 준다. 바꾸지 «않는» 것을 먼저 적어 둔다:
 *   ① 이후 폴링(30s 주기)은 `TIMEOUT_MS`(2s) 그대로 — 매 주기 5초씩 매달리지 않는다.
 *   ② 같은 호출 안의 **재시도도 2s** — 올리면 최악이 `2 x 5000 + 지연` 이 된다.
 *   ③ `READ_TIMEOUT_MS`·`ENTER_TIMEOUT_MS`·`COMPARE_TIMEOUT_MS` 는 무접촉.
 * 최악 체감 = 5000(첫 시도) + 지연 + 2000(재시도) 이고, 그것도 **번들당 첫 1회에만** 든다.
 *
 * 이 플래그는 번들마다 따로 산다(서버·브라우저 각 1회) — 그게 맞다 · 콜드는 그 둘이 따로 겪는다.
 */
const LIVE_FIRST_TIMEOUT_MS = 5000;
let liveStatusWarmed = false;

export function liveStatus(base = ""): Promise<Reply<LiveStatus>> {
  const cold = !liveStatusWarmed;
  liveStatusWarmed = true;
  return call<LiveStatus>(
    CONTRACT.liveStatus,
    { cache: "no-store" },
    base,
    cold ? LIVE_FIRST_TIMEOUT_MS : TIMEOUT_MS,
    TIMEOUT_MS,
  );
}

/**
 * 🔴 **서버 컴포넌트에서 부를 때는 브라우저의 쿠키를 «손으로» 실어야 한다.**
 * 서버끼리의 fetch에는 방문자의 쿠키가 자동으로 붙지 않는다 — 안 실으면 세션 가드가 401을
 * 내고, 화면은 「데이터가 없다」로 그린다. V-1이 정확히 이 층의 반대 방향 사고였다:
 * 서버가 받은 쿠키를 브라우저에 못 넘겨서 브라우저가 401이었고, 서버 렌더는 멀쩡해 보였다.
 * 두 방향 다 «쿠키가 경계를 넘는가»의 문제라, 넘기는 자리를 이 한 함수로 모은다.
 */
export function apiGetServer<T>(path: string, cookieHeader: string): Promise<Reply<T>> {
  return call<T>(
    path,
    { headers: cookieHeader ? { cookie: cookieHeader } : {}, cache: "no-store" },
    apiBase(),
    READ_TIMEOUT_MS,
  );
}

/** 브라우저에서 부른다 — 상대 경로 + 브라우저가 자기 쿠키를 자동으로 싣는다. */
export function apiGetBrowser<T>(path: string): Promise<Reply<T>> {
  return call<T>(path, { cache: "no-store" }, "", READ_TIMEOUT_MS);
}

export function startRunBrowser(
  scenarioId: string,
  sessionId: string,
  /**
   * 🔴 **기본값을 두지 않는다 — 호출처가 «명시»한다**(T3-4 · 오케 승인 조건 08-31).
   *
   * 앞판은 `"replay"` 상수였다. 그때는 화면이 이벤트를 소비하지 않아 어느 모드든 결과가
   * 같았지만, 이제 ② 가 실행 축을 그리므로 모드는 «화면이 무엇을 보여 주는가»를 정한다.
   * 그런 값에 기본값을 두면 호출처는 자기가 무엇을 요청했는지 모른 채 부르게 되고, 기본값을
   * 바꾸는 날 «부르는 코드는 그대로인데» 화면이 달라진다. 그래서 필수 인자로 둔다 —
   * 「조사 시작」 버튼 = `"live"`, fixture 재생 경로가 생기면 그 자리에서 `"replay"`.
   *
   * 🔴 요청이지 «단정»이 아니다. 계약은 「live 불가 시 `mode:"replay"` 로 강등 응답」을
   *    정해 두었고(§시나리오·조사 실행), 화면은 **서버가 답한 mode 를 배지로 그대로 보여
   *    준다** — 강등이 조용히 일어나지 않는다. 실측: live 요청 → live 응답(강등 없음) ·
   *    live 완주 0.3초 · replay 완주 즉시.
   */
  mode: "live" | "replay",
): Promise<Reply<{ runId: string; incidentId: string; mode: string }>> {
  return call<{ runId: string; incidentId: string; mode: string }>(
    CONTRACT.startRun(scenarioId),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 🔴 본문 `sessionId`는 «동결 계약의 잔존 표기»다. 인증 운반은 쿠키다(v0.1.6 판정
      //    append) — 그래서 이 값은 쿠키와 «같아야» 하고, 다르면 서버가 422로 거절한다.
      body: JSON.stringify({ sessionId, mode }),
      cache: "no-store",
    },
    "",
    READ_TIMEOUT_MS,
  );
}

/** 조사 중지 — 🔴 브라우저가 부른다(세션이 이 동선을 통과하는지 화면에서 보이게). */
export function stopRunBrowser(runId: string): Promise<Reply<{ status: string }>> {
  return call<{ status: string }>(CONTRACT.stopRun(runId), { method: "POST", cache: "no-store" });
}

/** 되감기 정본 — WS 가 끊겼을 때도 이 축으로 «빈 화면 0» 을 만든다. */
export function runEventsBrowser<T>(runId: string): Promise<Reply<T[]>> {
  return call<T[]>(CONTRACT.runEvents(runId), { cache: "no-store" }, "", READ_TIMEOUT_MS);
}

/**
 * 전략 비교 — 🔴 본문 `sessionId` 는 «쿠키와 같아야» 한다.
 *
 * 실측: 다르면 422(`invalid_request` 「어느 쪽을 뜻하는지 서버가 고르지 않는다」) · 본문 단독은 401.
 * 운반은 쿠키이고 본문 표기는 동결 잔존이다(계약 v0.1.6 판정 append) — startRunBrowser 와 같은 규율.
 */
export function compareBrowser(
  sessionId: string,
  question: string,
  strategies: string[],
): Promise<Reply<CompareResult[]>> {
  return call<CompareResult[]>(
    CONTRACT.compare,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, question, strategies }),
      cache: "no-store",
    },
    "",
    COMPARE_TIMEOUT_MS,
  );
}

/**
 * 초안 부분 갱신 — 🔴 **서버가 여는 것은 `title` 과 `parts` «뿐»이다**(실측).
 *
 * `procedures` 는 `403 safety_basis_immutable`, `safetyMeasures` 는 `403 safety_measure_immutable`,
 * 모르는 필드는 `403 field_not_editable` 로 갈려 온다 — 화면은 그 셋을 «다른 문구»로 그린다.
 * 종단 상태(approved·rejected)에서는 `409 work_order_not_editable`.
 *
 * 🔴 타입으로도 좁힌다: 여기서 다른 필드를 보낼 수 있게 열어 두면 언젠가 누가 보내고,
 *    그때 서버의 403 이 «화면의 버그»로 보고된다.
 */
export function patchWorkOrderBrowser(
  woId: string,
  patch: { title?: string; parts?: WoPart[] },
): Promise<Reply<WorkOrderDraft>> {
  return call<WorkOrderDraft>(
    CONTRACT.workOrder(woId),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
      cache: "no-store",
    },
    "",
    READ_TIMEOUT_MS,
  );
}

/**
 * 승인·반려 — `{ status, auditId }`.
 *
 * 🔴 `comment` 는 계약상 «선택»이고 서버는 사유 없이도 200 을 준다(실측). 「반려 사유 필수」는
 *    **화면 규칙**이다 — 화면이 서버보다 «엄격»한 것은 허용되고, «느슨»한 것만 금지다
 *    (오케 판정 08-31). 그 소재를 여기 적어 두어, 나중에 「서버가 강제한다」로 오독되지 않게 한다.
 */
export function decideWorkOrderBrowser(
  woId: string,
  decision: "approve" | "reject",
  comment?: string,
): Promise<Reply<ApprovalResult>> {
  return call<ApprovalResult>(
    decision === "approve" ? CONTRACT.approveWorkOrder(woId) : CONTRACT.rejectWorkOrder(woId),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(comment ? { comment } : {}),
      cache: "no-store",
    },
    "",
    READ_TIMEOUT_MS,
  );
}
