import { cookies, headers } from "next/headers";

import { ComparePanel } from "@/components/compare/compare-panel";
import { CONTRACT, type Scenario, apiGetServer } from "@/lib/contract";
import { SESSION_COOKIE, parseSession } from "@/lib/session";

/**
 * ⑤ 검색 전략 비교 — `/compare?run={runId}&q={questionId}` (wireframes §5 · T3-4).
 *
 * 🔴 승인 질문 목록은 «서버가» 가져온다(`GET /scenarios`) — 화면이 질문을 지어내지 않는다.
 *    못 가져오면 목록이 비고, 그때 화면은 「임의 질문을 만들지 않는다」고 말한다(§16.2).
 * 🔴 세션은 실제 쿠키에서 읽는다 — 라우트 성질에서 추정하지 않는다(T3-3 계보). 본문
 *    `sessionId` 는 쿠키와 «같아야» 하므로(계약 v0.1.6 판정 append) 그 id 를 그대로 넘긴다.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; q?: string }>;
}) {
  const { run, q } = await searchParams;
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);

  const scenarios = await apiGetServer<Scenario[]>(CONTRACT.scenarios, cookieHeader);
  const scenario = scenarios.state === "ok" ? (scenarios.data[0] ?? null) : null;

  /**
   * 🔴 `?q=` 는 «질문 문자열»이 아니라 목록의 항목이어야 한다. 쿼리로 온 값을 그대로 실어
   *    보내면 이 화면이 자유 입력창이 되는 것과 같다(§16.2) — 목록에 있을 때만 쓴다.
   */
  const initialQuestion = q && scenario?.questions.includes(q) ? q : null;

  return (
    <ComparePanel
      scenario={scenario}
      sessionId={session?.id ?? null}
      sessionOrigin={session?.origin ?? null}
      initialQuestion={initialQuestion}
      runId={run ?? null}
    />
  );
}
