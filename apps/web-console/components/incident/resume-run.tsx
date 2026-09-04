"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CONTRACT, type RunSnapshot, apiGetBrowser } from "@/lib/contract";
import { forgetRun, recallRun } from "@/lib/session-runs";

/**
 * D-60 — `?run=` 없이 들어온 incident 화면에서 **이 세션의 조사를 되찾는다.**
 *
 * 🔴 **새 화면도 새 조회 경로도 만들지 않는다.** 주소에 `?run=` 을 얹으면 기존 페이지가 이미
 *    스냅샷을 받아 콘솔을 그린다(`app/incidents/[incidentId]/page.tsx:106·229`) — 되찾기는
 *    「주소를 원래 형태로 되돌리는 일」이지 새로 그리는 일이 아니다.
 * 🔴 **`replace` 다**(`push` 가 아니다). push 면 뒤로가기가 방금 지나온 「run 없는 주소」로
 *    돌아오고, 그 자리에서 이 컴포넌트가 다시 run 을 얹어 **뒤로가기가 먹지 않는 화면**이 된다.
 * 🔴 **`?run=` 이 «없을 때만» 선다** — 부르는 쪽이 그 조건에서만 그리므로 얹은 뒤에는 이
 *    컴포넌트 자체가 사라진다. 루프가 구조적으로 못 생긴다.
 * 🔴 기억이 없으면 **아무 일도 하지 않는다** — 앞판 화면(「아직 조사를 시작하지 않았습니다」)
 *    그대로다. 없는 조사를 지어내지 않는다.
 * 🔴 **기억을 그대로 믿지 않는다**(D-61 판정선 ⓐ와 같은 규율). 서버가 재기동하면 기억만 남고
 *    조사는 없다 — 그 주소로 데려가면 사람은 자기가 뭘 잘못 눌렀다고 읽는다. 그래서 옮기기
 *    «전»에 `GET /runs/{id}` 로 실재를 확인하고, 「없다」(404)면 기억을 지우고 가만히 있는다.
 *    404 «만» 지운다 — 못 물어본 회차에 지우면 잠깐의 장애가 사람의 조사를 영영 지운다.
 */
export function ResumeRun({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  useEffect(() => {
    const runId = recallRun(incidentId);
    if (!runId) return;
    let alive = true;
    void (async () => {
      const reply = await apiGetBrowser<RunSnapshot>(CONTRACT.run(runId));
      if (!alive) return;
      if (reply.state === "unavailable" && reply.status === 404) {
        forgetRun(runId);
        return;
      }
      if (reply.state !== "ok") return;
      router.replace(`/incidents/${encodeURIComponent(incidentId)}?run=${encodeURIComponent(runId)}`);
    })();
    return () => {
      alive = false;
    };
  }, [incidentId, router]);
  return null;
}
