import Link from "next/link";
import { cookies, headers } from "next/headers";

import { SessionRunList } from "@/components/incidents/session-run-list";
import { StartInvestigation } from "@/components/overview/start-investigation";
import { Unavailable } from "@/components/unavailable";
import {
  CONTRACT,
  type Overview,
  type Scenario,
  apiGetServer,
} from "@/lib/contract";
import { SESSION_COOKIE, parseSession } from "@/lib/session";
import { fetchSessionRuns } from "@/lib/session-runs";

/**
 * D-61 — `/incidents` 목록.
 *
 * 왜(E1 · 오케 curl 2026-09-04 17:09): 좌측 메뉴의 「Incidents」가 **404** 였다. 이 자리에는
 * `[incidentId]` 상세만 있었고 목록 화면 자체가 없었다 — 메뉴가 가리키는 곳이 비어 있었다.
 *
 * 🔴 **「이 세션의 조사」는 이제 서버가 답한다**(T7-41b · 계약 v0.1.16 `GET /runs?sessionId=`).
 *    앞판은 브라우저 저장소였고, 그래서 다른 탭에서는 자기 조사가 «없는 것»이 됐다.
 * 🔴 **알람 행 링크는 «서버가 아는 연결»이 있을 때만 선다**(v0.1.16 `activeAlarms[].incidentId`).
 *    없으면 앞판 그대로 「조사 시작」만 준다 — 알람 id 로 상황 주소를 지어내면 404 로 데려간다.
 */
export default async function IncidentsPage() {
  const jar = await cookies();
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const session = parseSession(jar.get(SESSION_COOKIE)?.value);

  const plants = await apiGetServer<{ plantId: string; name: string }[]>(
    CONTRACT.plants,
    cookieHeader,
  );
  if (plants.state !== "ok" || plants.data.length === 0) {
    return (
      <Unavailable
        screen="Incidents"
        why={plants.state !== "ok" ? plants.why : "공장 목록이 비어 있습니다"}
      />
    );
  }
  const plant = plants.data[0];
  const [overview, scenarios] = await Promise.all([
    apiGetServer<Overview>(CONTRACT.plantOverview(plant.plantId), cookieHeader),
    apiGetServer<Scenario[]>(CONTRACT.scenarios, cookieHeader),
  ]);
  if (overview.state !== "ok") {
    return <Unavailable screen="Incidents" why={overview.why} />;
  }
  const alarms = overview.data.activeAlarms;
  const runs = await fetchSessionRuns();
  const scenarioId =
    (scenarios.state === "ok" ? scenarios.data[0]?.scenarioId : undefined) ?? "GS-01";

  return (
    <section className="space-y-6" data-testid="incidents-screen">
      <div>
        <h1 className="text-lg font-semibold">Incidents</h1>
        <p className="mt-1 text-foot text-muted">
          이 세션에서 시작한 조사와 지금 울리고 있는 알람을 함께 보여 드립니다.
        </p>
      </div>

      <section className="fkt-card overflow-hidden">
        <p className="fkt-section-label px-5 pt-4">이 세션의 조사</p>
        <SessionRunList runs={runs} />
      </section>

      <section className="fkt-card overflow-hidden" data-testid="incidents-alarms">
        <p className="fkt-section-label px-5 pt-4">지금 울리는 알람</p>
        {alarms.length === 0 ? (
          <p className="px-5 py-4 text-foot text-muted" data-testid="incidents-alarms-empty">
            지금 울리고 있는 알람이 없습니다.
          </p>
        ) : (
          <ul className="fkt-rows">
            {alarms.map((a) => (
              <li key={a.alarmId} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="id truncate text-body-c font-semibold" title={a.alarmId}>
                    {a.alarmId}
                  </p>
                  <p className="text-foot text-muted">
                    <span className="id">{a.equipmentId}</span> · <span className="id">{a.sensorId}</span> ·{" "}
                    {a.severity} · 기준 {a.thresholdValue} → 관측 {a.observedValue}
                  </p>
                </div>
                {a.incidentId ? (
                  <Link
                    href={`/incidents/${encodeURIComponent(a.incidentId)}`}
                    className="fkt-pill shrink-0 bg-fill text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
                    data-testid="alarm-incident-link"
                    data-incident={a.incidentId}
                  >
                    상황 보기
                  </Link>
                ) : (
                  <StartInvestigation
                    scenarioId={scenarioId}
                    sessionId={session?.id ?? null}
                    sessionOrigin={session?.origin ?? null}
                    testId="start-from-incidents"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
