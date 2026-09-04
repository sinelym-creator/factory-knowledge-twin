import { cookies, headers } from "next/headers";

import { CONTRACT, type SessionRunSummary, apiGetServer } from "@/lib/contract";
import { SESSION_COOKIE, parseSession } from "@/lib/session";

/**
 * 「이 세션의 조사」 — **서버에게 묻는다** (T7-41b · 계약 v0.1.16).
 *
 * 🔴 앞판(D-60/D-61)은 `sessionStorage` 에 기억했다. 계약에 run 목록 조회가 없어서 그 사실을
 *    아는 층이 브라우저뿐이었기 때문이다. 그 대가가 폐하 실측으로 드러났다 — 다른 탭·다른
 *    기기에서는 자기 조사가 «없는 것»이 되고, Overview 로 돌아오면 처음 화면이 된다.
 *
 * 🔴 이제 출처는 **하나**다. `GET /runs?sessionId=` 가 답하고 브라우저는 아무것도 적지 않는다 —
 *    폴백으로도 남기지 않는다. 두 출처를 두면 갈리는 날 화면이 어느 쪽으로든 거짓말하고,
 *    그때 「어느 쪽이 참인가」를 화면 코드가 정하게 된다(그것은 화면의 권한이 아니다).
 *
 * 🔴 **서버 컴포넌트 전용이다.** 브라우저는 세션 쿠키를 읽을 수 없고(HttpOnly), 읽을 수
 *    있더라도 sessionId 를 쿼리로 실어 보내는 일은 서버가 이미 쿠키로 아는 것을 한 번 더
 *    말하는 것이다. 화면은 서버가 실어 준 값을 그린다.
 */
export async function fetchSessionRuns(): Promise<SessionRunSummary[]> {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return [];
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const reply = await apiGetServer<SessionRunSummary[]>(
    CONTRACT.sessionRuns(session.id),
    cookieHeader,
  );
  // 🔴 못 물어본 회차(401·503·연결 실패)와 「0건」을 화면에서 가르지 않는다 — 둘 다 「보여 줄
  //    조사가 없다」이고, 없는 조사를 지어내지 않는 쪽이 맞다. 있다고 말했다가 없는 것보다
  //    낫다(앞판의 「기억만 남은 조사」가 정확히 그 실패였다).
  return reply.state === "ok" && Array.isArray(reply.data) ? reply.data : [];
}

/** 그 상황(incident)의 가장 최근 조사 — 없으면 `null`. 목록은 이미 최신순이다. */
export function latestRunFor(runs: SessionRunSummary[], incidentId: string): string | null {
  return runs.find((r) => r.incidentId === incidentId)?.runId ?? null;
}
