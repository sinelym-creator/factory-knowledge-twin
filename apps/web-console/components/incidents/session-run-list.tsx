import Link from "next/link";

import type { SessionRunSummary } from "@/lib/contract";

/**
 * 「이 세션의 조사」 목록 (D-61 → T7-41b · 계약 v0.1.16).
 *
 * 🔴 **더 이상 클라이언트 컴포넌트가 아니다.** 앞판은 브라우저 저장소를 마운트 뒤에 읽어야
 *    해서 첫 페인트가 비어 있었고, 저장한 기억이 서버에 아직 있는지 행마다 `GET /runs/{id}`
 *    로 되물어야 했다(기억과 실재가 갈릴 수 있었으니까). 이제 목록 자체가 서버의 답이라
 *    **갈릴 두 출처가 없다** — 실재 확인도, 「확인 중입니다」 상태도 필요가 사라졌다.
 *
 * 🔴 그래서 「서버에 없어서 뺐습니다」 문구도 없앴다. 뺄 일이 없는 것이 아니라, 서버가
 *    애초에 없는 것을 답하지 않기 때문이다 — 화면이 설명할 사건 자체가 사라졌다.
 */
export function SessionRunList({ runs }: { runs: SessionRunSummary[] }) {
  if (runs.length === 0) {
    return (
      <p className="px-5 py-4 text-foot text-muted" data-testid="session-runs-empty">
        이 세션에서 시작한 조사가 아직 없습니다. 아래 알람에서 「조사 시작」을 눌러 보세요.
      </p>
    );
  }
  return (
    <ul className="fkt-rows" data-testid="session-runs">
      {runs.map((r) => (
        <li key={r.runId} className="flex items-center gap-3 px-5 py-3.5" data-run-status={r.status}>
          <div className="min-w-0 flex-1">
            <p className="id truncate text-body-c font-semibold">{r.incidentId}</p>
            <p className="text-foot text-muted">
              시작 {new Date(r.startedAt).toLocaleString("ko-KR")}
              {/* 🔴 아직 도는 조사만 그렇게 말한다 — 끝난 것에 상태를 덧붙이면 목록이 전부
                  배지로 덮인다. 「completed」는 사람이 기대하는 기본값이다. */}
              {r.status === "running" && " · 진행 중입니다"}
            </p>
          </div>
          <Link
            href={`/incidents/${encodeURIComponent(r.incidentId)}?run=${encodeURIComponent(r.runId)}`}
            className="fkt-pill shrink-0 bg-fill text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
            data-testid="session-run-link"
            data-run={r.runId}
          >
            조사 결과 보기
          </Link>
        </li>
      ))}
    </ul>
  );
}
