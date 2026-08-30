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

/** 미연결(백엔드 부재·501·타임아웃)과 «응답» 을 구분해 돌려준다.
 *
 * 🔴 `setCookie`는 ai-api가 내려보낸 `Set-Cookie` 헤더 «원문»이다(T3-1). 셸이 쿠키 «이름»을
 *    자기 코드에 적지 않기 위해 헤더를 통째로 들고 다닌다 — 이름을 두 번째 자리에 적는 순간
 *    한쪽만 자라고, 그때 화면은 살아 있다고 그리는데 서버는 401을 답한다.
 * 🔴 이 값은 로그·캐시에 싣지 않는다(공개 경계).
 */
export type Reply<T> =
  | { state: "ok"; data: T; setCookie?: string }
  | { state: "unavailable"; why: string; status?: number };

const TIMEOUT_MS = 2000;
/** 조회 계층은 SSOT를 훑는다 — 세션 발급보다 여유를 준다(스파크라인 12장이 붙는 화면). */
const READ_TIMEOUT_MS = 8000;

/**
 * 브라우저는 상대 경로를 쓴다(next.config.ts의 rewrite가 ai-api로 넘긴다 — 계약 경로가
 * 화면 코드에 «그대로» 남게 하려는 것이다). 서버·미들웨어에는 상대 경로가 없으므로 base가 필요하다.
 */
export function apiBase(): string {
  return process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";
}

async function call<T>(
  path: string,
  init?: RequestInit,
  base = "",
  timeoutMs = TIMEOUT_MS,
): Promise<Reply<T>> {
  try {
    const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    // 🔴 상태코드를 함께 돌려준다. 화면이 「그런 자원이 없다(404)」와 「지금 못 물어봤다」를
    //    가르지 못하면 두 상태가 같은 모습으로 그려진다 — 서버가 사유 코드를 나눈 이유가
    //    화면에서 사라진다.
    if (res.status === 501) return { state: "unavailable", why: "미구현(501)", status: 501 };
    if (!res.ok) return { state: "unavailable", why: `HTTP ${res.status}`, status: res.status };
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
  );
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
): Promise<Reply<{ runId: string; incidentId: string; mode: string }>> {
  return call<{ runId: string; incidentId: string; mode: string }>(
    CONTRACT.startRun(scenarioId),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 🔴 본문 `sessionId`는 «동결 계약의 잔존 표기»다. 인증 운반은 쿠키다(v0.1.6 판정
      //    append) — 그래서 이 값은 쿠키와 «같아야» 하고, 다르면 서버가 422로 거절한다.
      body: JSON.stringify({ sessionId, mode: "replay" }),
      cache: "no-store",
    },
    "",
    READ_TIMEOUT_MS,
  );
}
