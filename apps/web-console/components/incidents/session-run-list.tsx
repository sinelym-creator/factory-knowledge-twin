"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CONTRACT, type RunSnapshot, apiGetBrowser } from "@/lib/contract";
import { forgetRun, listRuns, type SessionRun } from "@/lib/session-runs";

/**
 * D-61 — 「이 세션의 조사」 목록.
 *
 * 🔴 **서버가 모르는 사실이라 브라우저가 그린다.** 계약에 run 목록 조회가 없다
 *    (`lib/session-runs.ts` 머리말) — 그래서 이 목록은 «이 탭이 기억하는 것»이고, 서버 렌더에는
 *    없다. 첫 페인트에서 비어 있다가 채워지는 것이 정상이다.
 * 🔴 **기억을 그대로 믿지 않는다**(오케 판정선 ⓐ · 17:28). 기억은 브라우저의 것이고 조사는
 *    서버의 것이라, 서버가 재기동하면 기억만 남는다. 그래서 행마다 `GET /runs/{id}` 로 실재를
 *    확인하고, 서버가 「없다」(404)고 답한 것은 **행을 지우고 기억도 지운다**.
 * 🔴 **「없다」와 «못 물어봤다»를 가른다.** 404 만 지운다 — 401·503·연결 실패는 「모르는」
 *    상태라, 그 회차에 지우면 서버가 잠깐 흔들린 사이 사람이 자기 조사를 잃는다. 그때는 행을
 *    남기되 링크 대신 「확인하지 못했습니다」로 적는다(있다고도 없다고도 말하지 않는다).
 */
type Row = SessionRun & { state: "checking" | "alive" | "unknown" };

export function SessionRunList() {
  /* 서버 렌더와 첫 클라이언트 렌더는 같아야 한다 — 저장소는 마운트 뒤에 읽는다. */
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    const remembered = listRuns();
    setRows(remembered.map((r) => ({ ...r, state: "checking" })));
    let alive = true;
    void (async () => {
      for (const r of remembered) {
        const reply = await apiGetBrowser<RunSnapshot>(CONTRACT.run(r.runId));
        if (!alive) return;
        if (reply.state === "unavailable" && reply.status === 404) {
          forgetRun(r.runId);
          setRows((prev) => (prev ?? []).filter((x) => x.runId !== r.runId));
          setDropped((n) => n + 1);
          continue;
        }
        const state: Row["state"] = reply.state === "ok" ? "alive" : "unknown";
        setRows((prev) => (prev ?? []).map((x) => (x.runId === r.runId ? { ...x, state } : x)));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (rows === null) {
    return (
      <p className="px-5 py-4 text-foot text-muted" data-testid="session-runs-loading">
        이 브라우저에 남아 있는 조사를 확인하는 중입니다.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="px-5 py-4 text-foot text-muted" data-testid="session-runs-empty">
        {dropped > 0
          ? "이 세션에서 시작한 조사가 서버에 더 이상 남아 있지 않습니다. 아래 알람에서 다시 시작하실 수 있습니다."
          : "이 세션에서 시작한 조사가 아직 없습니다. 아래 알람에서 「조사 시작」을 눌러 보세요."}
      </p>
    );
  }
  return (
    <>
      <ul className="fkt-rows" data-testid="session-runs">
        {rows.map((r) => (
          <li key={r.runId} className="flex items-center gap-3 px-5 py-3.5" data-run-state={r.state}>
            <div className="min-w-0 flex-1">
              <p className="id truncate text-body-c font-semibold">{r.incidentId}</p>
              <p className="text-foot text-muted">시작 {new Date(r.at).toLocaleString("ko-KR")}</p>
            </div>
            {r.state === "alive" ? (
              <Link
                href={`/incidents/${encodeURIComponent(r.incidentId)}?run=${encodeURIComponent(r.runId)}`}
                className="fkt-pill shrink-0 bg-fill text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
                data-testid="session-run-link"
                data-run={r.runId}
              >
                조사 결과 보기
              </Link>
            ) : (
              <span className="fkt-pill shrink-0 bg-fill text-muted" data-testid="session-run-unverified">
                {r.state === "checking" ? "확인 중입니다" : "확인하지 못했습니다"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {dropped > 0 && (
        <p className="px-5 pb-4 text-foot text-muted" data-testid="session-runs-dropped">
          서버에 남아 있지 않은 조사 {dropped}건은 목록에서 뺐습니다.
        </p>
      )}
    </>
  );
}
