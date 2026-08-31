import { headers } from "next/headers";

import { Unavailable } from "@/components/unavailable";
import { WorkOrderScreen } from "@/components/work-order/wo-screen";
import { CONTRACT, type WorkOrderDraft, apiGetServer } from "@/lib/contract";

/**
 * ④ 작업지시서 편집·승인 — `/work-orders/[woId]` (wireframes §4 · T3-5 «최소 형상»).
 *
 * GS-01 의 끝 = 사람이 «승인»하는 장면(baseline §16.4 human-in-the-loop). ② 의 「작업지시서 초안
 * 보기」(T3-4)가 이리로 온다.
 *
 * 🔴 **세션 소유권은 서버가 «존재 은닉»으로 지킨다**(Q-25 · 계약 v0.1.6). 남의 세션 초안은
 *    401·403 이 아니라 **404** 다 — 그래서 이 화면은 「없다」와 「남의 것이다」를 구별하지 않고,
 *    구별하려 들지도 않는다. 구별하는 순간 화면이 자원의 존재를 누설한다.
 * 🔴 무쿠키 진입은 여기까지 오지 않는다 — `proxy.ts` 가드가 `/` 로 보낸다(T3-1·Q-39 축).
 */
export default async function WorkOrderPage({ params }: PageProps<"/work-orders/[woId]">) {
  const { woId } = await params;
  const cookieHeader = (await headers()).get("cookie") ?? "";

  const reply = await apiGetServer<WorkOrderDraft>(CONTRACT.workOrder(woId), cookieHeader);

  if (reply.state !== "ok") {
    const missing = reply.status === 404;
    return (
      <Unavailable
        screen={`④ 작업지시서 · ${woId}`}
        why={missing ? `그런 작업지시 초안이 없다 (${woId})` : (reply.detail?.message ?? reply.why)}
        kind={missing ? "not-found" : "unavailable"}
      />
    );
  }

  // 🔴 편집·승인은 브라우저가 «자기 쿠키로» 부른다 — 서버 액션으로 감싸면 그 동선이 브라우저
  //    세션을 통과하는지가 화면에서 안 보인다(V-1 이 그 사각에서 살아남았다 · T3-4 계보).
  return <WorkOrderScreen initial={reply.data} />;
}
