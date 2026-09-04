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

/**
 * D-61 — `/incidents` 목록.
 *
 * 왜(E1 · 오케 curl 2026-09-04 17:09): 좌측 메뉴의 「Incidents」가 **404** 였다. 이 자리에는
 * `[incidentId]` 상세만 있었고 목록 화면 자체가 없었다 — 메뉴가 가리키는 곳이 비어 있었다.
 *
 * 🔴 **새 API 를 만들지 않는다.** 「지금 울리는 알람」은 Overview 가 이미 받는 것과 «같은»
 *    응답(`GET /plants/{id}/overview` 의 `activeAlarms`)이고, 「이 세션의 조사」는 서버가 모르는
 *    사실이라 브라우저가 기억한 것을 그린다(`lib/session-runs.ts`).
 * 🔴 **알람 행에서 상세로 «링크하지 않는다».** 계약의 `ActiveAlarm` 에는 incidentId 가 없다
 *    (`lib/contract.ts:139~148` 전수) — 알람과 상황을 잇는 값은 조사를 시작해야 나온다
 *    (`POST /scenarios/{id}/runs` 응답). 그럴듯한 주소를 지어 넣으면 404 로 데려간다.
 *    그래서 알람 행이 주는 것은 Overview 와 «같은» 「조사 시작」이고, 시작하면 그 조사가
 *    위쪽 목록에 남는다.
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
        <SessionRunList />
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
                <StartInvestigation
                  scenarioId={scenarioId}
                  sessionId={session?.id ?? null}
                  sessionOrigin={session?.origin ?? null}
                  testId="start-from-incidents"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
