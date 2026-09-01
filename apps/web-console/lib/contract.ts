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
   * 🔴 `retried` = 아래 `call()` 이 «실제로» 1회 재시도한 회차에만 붙는다(D-11 완화 C).
   *    없으면 필드 자체가 없다 — `false` 를 지어내지 않는다(이 파일의 `detail`·`retryAfterSec` 규율과 같다).
   *    이 축이 없으면 재시도 규칙은 「넣었다」만 남고 «도는가»는 아무도 세지 못한다.
   */
  | {
      state: "unavailable";
      why: string;
      status?: number;
      detail?: ErrorDetail;
      retryAfterSec?: number;
      retried?: true;
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
): Promise<Reply<T>> {
  const first = await attempt<T>(path, init, base, timeoutMs);
  if (first.state === "ok") return first;
  if (first.status === undefined || !RETRY_STATUSES.has(first.status)) return first;
  if (!isRetryableCall(init, base)) return first;

  await sleep(retryDelayMs(first));
  const second = await attempt<T>(path, init, base, timeoutMs);
  // 🔴 재시도 «뒤에도» 실패하면 그대로 돌려준다 — 화면이 읽는 문면은 달라지지 않는다.
  if (second.state === "ok") return { ...second, retried: true };
  return { ...second, retried: true };
}

async function attempt<T>(
  path: string,
  init: RequestInit | undefined,
  base: string,
  timeoutMs: number,
): Promise<Reply<T>> {
  try {
    const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
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
    return { state: "unavailable", why: e instanceof Error ? e.name : "unknown" };
  }
}

export function createSession(base = ""): Promise<Reply<{ sessionId: string }>> {
  // 🔴 `no-store` — 세션 발급 응답은 캐시에 남을 물건이 아니다(쿠키가 실려 있다).
  return call<{ sessionId: string }>(
    CONTRACT.createSession,
    { method: "POST", cache: "no-store" },
    base,
    ENTER_TIMEOUT_MS,
  );
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

export function liveStatus(base = ""): Promise<Reply<LiveStatus>> {
  return call<LiveStatus>(CONTRACT.liveStatus, { cache: "no-store" }, base);
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
