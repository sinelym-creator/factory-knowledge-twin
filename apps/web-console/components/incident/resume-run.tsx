"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * D-60 → T7-41b — `?run=` 없이 들어온 incident 화면에서 **이 세션의 조사를 되찾는다.**
 *
 * 🔴 **찾는 일은 서버가 이미 했다.** 앞판은 브라우저 기억을 읽고, 그 기억이 아직 참인지
 *    `GET /runs/{id}` 로 되물었다(기억과 실재가 갈릴 수 있었으니까). 이제 부르는 쪽이
 *    `GET /runs?sessionId=` 의 답에서 골라 `runId` 를 실어 준다 — 여기 남은 일은 **주소를
 *    원래 형태로 되돌리는 것 하나**다. 없으면 이 컴포넌트는 아예 그려지지 않는다.
 *
 * 🔴 **`replace` 다**(`push` 가 아니다). push 면 뒤로가기가 방금 지나온 「run 없는 주소」로
 *    돌아오고, 그 자리에서 이 컴포넌트가 다시 run 을 얹어 **뒤로가기가 먹지 않는 화면**이 된다.
 * 🔴 **`?run=` 이 «없을 때만» 선다** — 부르는 쪽이 그 조건에서만 그리므로 얹은 뒤에는 이
 *    컴포넌트 자체가 사라진다. 루프가 구조적으로 못 생긴다.
 */
export function ResumeRun({ incidentId, runId }: { incidentId: string; runId: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/incidents/${encodeURIComponent(incidentId)}?run=${encodeURIComponent(runId)}`);
  }, [router, incidentId, runId]);
  return null;
}
