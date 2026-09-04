/**
 * D-60 — **이 브라우저 세션이 시작한 조사를 기억한다.**
 *
 * 왜(E1 · 구조 실측 2026-09-04): 조사 결과의 정본 주소는 이미 `?run=` 이고
 * (`app/incidents/[incidentId]/page.tsx:69·106·229`), 조사 시작도 그 주소로 보낸다
 * (`components/overview/start-investigation.tsx:50`). 잃는 자리는 **Overview 로 돌아온 뒤**다 —
 * Overview 에는 「이 세션이 어떤 조사를 돌렸는가」를 아는 자리가 없어서, 다시 들어갈 때
 * `?run=` 없이 들어가고 화면은 「아직 조사를 시작하지 않았습니다」로 돌아간다.
 *
 * 🔴 **서버에 물을 수 없다.** 계약 표면 전수(`lib/contract.ts` `CONTRACT`)에 run «목록» 조회가
 *    없다 — 단건 `GET /runs/{id}` 뿐이다. 「새 API 0」 제약에서 이 사실을 아는 층은 브라우저뿐이라,
 *    브라우저가 기억한다. 서버가 모르는 것을 화면이 지어내지는 않는다(없으면 아무 말도 안 한다).
 * 🔴 **`sessionStorage` 다.** 수명이 세션 쿠키와 같은 결이고(탭을 닫으면 사라진다), 같은 기기의
 *    다른 탭·다른 방문자와 섞이지 않는다. 이 값은 서버로 나가지 않는다.
 * 🔴 **읽기·쓰기 전부 try/catch.** 사생활 보호 모드·저장소 차단 브라우저에서 접근 자체가 던진다 —
 *    그때는 「기억 못 한다」로 조용히 물러난다(화면은 기억이 없던 앞판 그대로 동작한다).
 * 🔴 **알려진 한계**: 다른 탭·다른 기기에서는 안 보인다. 그 축까지 세우려면 계약에 run 목록이
 *    필요하고, 그것은 이 좌석의 scope 가 아니다(오케 회부).
 */

const KEY = "fkt.session-runs.v1";

export type SessionRun = {
  incidentId: string;
  runId: string;
  /** 기억한 시각(ISO) — 목록을 최신순으로 세우는 축이다. */
  at: string;
};

function read(): SessionRun[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* 저장소는 사람이 손댈 수 있는 자리다 — 형태가 다르면 «없는 것»으로 친다. */
    return parsed.filter(
      (x): x is SessionRun =>
        !!x &&
        typeof (x as SessionRun).incidentId === "string" &&
        typeof (x as SessionRun).runId === "string" &&
        typeof (x as SessionRun).at === "string",
    );
  } catch {
    return [];
  }
}

/** 조사 하나를 기억한다 — 같은 incident 의 앞 기록은 «최근 것»으로 갈린다. */
export function rememberRun(incidentId: string, runId: string): void {
  try {
    const next = [
      { incidentId, runId, at: new Date().toISOString() },
      ...read().filter((r) => r.incidentId !== incidentId),
    ].slice(0, 20);
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 못 해도 화면은 그대로 돈다 — 기억이 없던 앞판과 같은 상태다. */
  }
}

/** 그 incident 에서 이 세션이 마지막으로 돌린 조사. 없으면 `null` 이다. */
export function recallRun(incidentId: string): string | null {
  return read().find((r) => r.incidentId === incidentId)?.runId ?? null;
}

/**
 * 서버가 「그런 조사 없다」고 답한 기록을 지운다(D-61 판정선 ⓐ).
 *
 * 🔴 «없어졌다»가 확인된 회차에만 부른다 — 못 물어본 회차(401·503·네트워크)에 지우면,
 *    잠깐 서버가 흔들린 사이에 사람이 자기 조사를 영영 잃는다.
 */
export function forgetRun(runId: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(read().filter((r) => r.runId !== runId)));
  } catch {
    /* 못 지워도 목록은 그 회차부터 그 행을 안 그린다 — 화면이 앞선다. */
  }
}

/** 이 세션이 돌린 조사 전부(최근 것부터). */
export function listRuns(): SessionRun[] {
  return read();
}
